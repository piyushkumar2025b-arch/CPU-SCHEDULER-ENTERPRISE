import { ProcessInput, SimulationResult, AllResults, GanttSegment, WorkloadValidationResult } from './types';

interface InternalProcess extends ProcessInput {
  idx: number;
  remaining: number;
  ct?: number;
}

/**
 * Centrally validates workload inputs against runtime corruption, invalid types,
 * negative arrivals, non-positive bursts, and non-positive quantum slices.
 * (CPU-001, CPU-002)
 */
export function validateWorkload(processes: ProcessInput[], quantum?: number): WorkloadValidationResult {
  if (!Array.isArray(processes) || processes.length === 0) {
    return {
      ok: false,
      error: 'Workload must contain at least one valid process.',
      validatedProcesses: [],
      validatedQuantum: 1,
    };
  }

  if (processes.length > 32) {
    return {
      ok: false,
      error: 'Workload exceeds maximum capacity of 32 processes.',
      validatedProcesses: [],
      validatedQuantum: 1,
    };
  }

  const validatedProcesses: ProcessInput[] = [];
  const seenIds = new Set<number>();

  for (let i = 0; i < processes.length; i++) {
    const p = processes[i];
    if (!p || typeof p !== 'object') {
      return {
        ok: false,
        error: `Process at index ${i} is not a valid object.`,
        validatedProcesses: [],
        validatedQuantum: 1,
      };
    }

    const id = Number(p.id);
    if (!Number.isInteger(id) || id < 0) {
      return {
        ok: false,
        error: `Process at index ${i}: ID must be a non-negative integer (received ${p.id}).`,
        validatedProcesses: [],
        validatedQuantum: 1,
      };
    }
    if (seenIds.has(id)) {
      return {
        ok: false,
        error: `Duplicate process ID ${id} detected at index ${i}. Process IDs must be unique integers.`,
        validatedProcesses: [],
        validatedQuantum: 1,
      };
    }
    seenIds.add(id);

    const arrival = Number(p.arrival);
    if (!Number.isInteger(arrival) || arrival < 0) {
      return {
        ok: false,
        error: `Process P${id}: arrival time must be a non-negative integer >= 0 (received ${p.arrival}).`,
        validatedProcesses: [],
        validatedQuantum: 1,
      };
    }

    const burst = Number(p.burst);
    if (!Number.isInteger(burst) || burst <= 0) {
      return {
        ok: false,
        error: `Process P${id}: burst time must be a positive integer >= 1 (received ${p.burst}).`,
        validatedProcesses: [],
        validatedQuantum: 1,
      };
    }

    const priority = Number(p.priority);
    if (!Number.isInteger(priority) || priority < 1 || priority > 5) {
      return {
        ok: false,
        error: `Process P${id}: priority must be an integer between 1 and 5 (received ${p.priority}).`,
        validatedProcesses: [],
        validatedQuantum: 1,
      };
    }

    validatedProcesses.push({
      id,
      arrival,
      burst,
      priority,
    });
  }

  const validQuantum =
    quantum !== undefined
      ? Number.isInteger(quantum) && quantum > 0
        ? quantum
        : -1
      : 3;

  if (quantum !== undefined && validQuantum <= 0) {
    return {
      ok: false,
      error: `Round Robin quantum must be a positive integer >= 1 (received ${quantum}).`,
      validatedProcesses,
      validatedQuantum: 1,
    };
  }

  return {
    ok: true,
    validatedProcesses,
    validatedQuantum: validQuantum > 0 ? validQuantum : 3,
  };
}

function cloneProcs(processes: ProcessInput[]): InternalProcess[] {
  return processes.map((p, i) => ({
    ...p,
    idx: i,
    remaining: p.burst,
    arrival: p.arrival,
    burst: p.burst,
    priority: p.priority,
  }));
}

/**
 * Builds simulation metrics from Gantt segments and verified process termination states.
 * Throws if any process did not finish (CPU-012: no silent CT=0 default).
 */
function buildResult(procs: InternalProcess[], gantt: GanttSegment[], steps: number): SimulationResult {
  const firstRun: Record<number, number> = {};
  gantt.forEach((g) => {
    if (g.pid !== 'idle' && !(g.pid in firstRun)) {
      firstRun[g.pid] = g.start;
    }
  });

  // Always keep stats ordered by original process index (idx 0, 1, 2...) across all algorithms
  const sortedProcs = [...procs].sort((a, b) => a.idx - b.idx);
  const stats = sortedProcs.map((p) => {
    if (p.ct === undefined) {
      throw new Error(`Simulation invariant violation: Process P${p.idx} (id: ${p.id}) never reached completion.`);
    }
    const ct = p.ct;
    const tat = ct - p.arrival;
    const wt = tat - p.burst;
    const rt = (p.idx in firstRun) ? firstRun[p.idx] - p.arrival : 0;
    return {
      idx: p.idx,
      id: p.id,
      AT: p.arrival,
      BT: p.burst,
      CT: ct,
      TAT: Math.max(0, tat),
      WT: Math.max(0, wt),
      RT: Math.max(0, rt),
    };
  });

  const n = stats.length || 1;
  const avgTAT = stats.reduce((s, p) => s + p.TAT, 0) / n;
  const avgWT = stats.reduce((s, p) => s + p.WT, 0) / n;
  const avgRT = stats.reduce((s, p) => s + p.RT, 0) / n;
  const totalTime = gantt.length ? gantt[gantt.length - 1].end : 0;
  const cpu = gantt.filter((g) => g.pid !== 'idle').reduce((s, g) => s + (g.end - g.start), 0);
  const util = totalTime ? (cpu / totalTime * 100).toFixed(1) : '0.0';
  const throughput = totalTime ? (procs.length / totalTime).toFixed(3) : '0';

  // Accurate context switch count (CPU-011):
  // Transitions from one non-idle process to a different non-idle process.
  // When CPU enters idle, prevPid is reset so an idle gap is not counted as an adjacent switch.
  let ctxSwitches = 0;
  let prevPid: number | 'idle' = 'idle';
  for (const g of gantt) {
    if (g.pid !== 'idle') {
      if (prevPid !== 'idle' && prevPid !== g.pid) {
        ctxSwitches++;
      }
      prevPid = g.pid;
    } else {
      prevPid = 'idle';
    }
  }

  return {
    gantt,
    stats,
    steps,
    avgTAT,
    avgWT,
    avgRT,
    totalTime,
    cpuUtil: util,
    throughput,
    ctxSwitches: Math.max(0, ctxSwitches),
  };
}

export function runFCFS(processes: ProcessInput[]): SimulationResult {
  const validation = validateWorkload(processes);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const procs = cloneProcs(validation.validatedProcesses).sort((a, b) => a.arrival - b.arrival || a.idx - b.idx);
  let time = 0;
  const gantt: GanttSegment[] = [];
  let steps = 0;

  procs.forEach((p) => {
    if (time < p.arrival) {
      gantt.push({ pid: 'idle', start: time, end: p.arrival });
      time = p.arrival;
    }
    gantt.push({ pid: p.idx, start: time, end: time + p.burst });
    p.ct = time + p.burst;
    time += p.burst;
    steps++;
  });

  return buildResult(procs, gantt, steps);
}

export function runSJF(processes: ProcessInput[]): SimulationResult {
  const validation = validateWorkload(processes);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const procs = cloneProcs(validation.validatedProcesses);
  let time = 0;
  let done = 0;
  const n = procs.length;
  const gantt: GanttSegment[] = [];
  let steps = 0;
  const completed = new Set<number>();

  while (done < n) {
    const avail = procs.filter((p) => p.arrival <= time && !completed.has(p.idx));
    if (!avail.length) {
      const next = procs.filter((p) => !completed.has(p.idx)).sort((a, b) => a.arrival - b.arrival)[0];
      if (!next) break;
      gantt.push({ pid: 'idle', start: time, end: next.arrival });
      time = next.arrival;
      continue;
    }
    avail.sort((a, b) => a.burst - b.burst || a.arrival - b.arrival || a.idx - b.idx);
    const p = avail[0];
    gantt.push({ pid: p.idx, start: time, end: time + p.burst });
    p.ct = time + p.burst;
    time += p.burst;
    completed.add(p.idx);
    done++;
    steps++;
  }

  return buildResult(procs, gantt, steps);
}

/**
 * Preemptive Shortest Remaining Time First (SRTF).
 * Terminates via progress invariant done < n (CPU-003: no arbitrary maxTime + 10 cutoff).
 */
export function runSRTF(processes: ProcessInput[]): SimulationResult {
  const validation = validateWorkload(processes);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const procs = cloneProcs(validation.validatedProcesses);
  let time = 0;
  let done = 0;
  const n = procs.length;
  const gantt: GanttSegment[] = [];
  let steps = 0;
  const totalBurst = procs.reduce((s, p) => s + p.burst, 0);
  const maxArrival = Math.max(...procs.map((p) => p.arrival), 0);
  const safetyLimit = maxArrival + totalBurst * 10 + 10000;
  let lastPid: number | 'idle' = -1;

  while (done < n) {
    if (time > safetyLimit) {
      throw new Error(`Simulation safety limit exceeded in SRTF at time ${time}.`);
    }

    const avail = procs.filter((p) => p.arrival <= time && p.remaining > 0);
    if (!avail.length) {
      // Find the next arriving process to jump idle in O(1) instead of 1-tick iteration
      const nextProc = procs.filter((p) => p.remaining > 0 && p.arrival > time).sort((a, b) => a.arrival - b.arrival)[0];
      if (!nextProc) break;

      const jumpTime = nextProc.arrival;
      if (lastPid === 'idle' && gantt.length) {
        gantt[gantt.length - 1].end = jumpTime;
      } else {
        gantt.push({ pid: 'idle', start: time, end: jumpTime });
      }
      lastPid = 'idle';
      time = jumpTime;
      continue;
    }

    avail.sort((a, b) => {
      if (a.remaining !== b.remaining) return a.remaining - b.remaining;
      if (a.idx === lastPid) return -1;
      if (b.idx === lastPid) return 1;
      return a.arrival - b.arrival || a.idx - b.idx;
    });

    const p = avail[0];
    if (p.idx !== lastPid) {
      gantt.push({ pid: p.idx, start: time, end: time + 1 });
      steps++;
    } else {
      gantt[gantt.length - 1].end++;
    }

    p.remaining--;
    lastPid = p.idx;
    time++;

    if (p.remaining === 0) {
      p.ct = time;
      done++;
    }
  }

  return buildResult(procs, gantt, steps);
}

/**
 * Round Robin Scheduler.
 * Strictly validates finite quantum >= 1 (CPU-001: prevents infinite loops on quantum <= 0).
 */
export function runRoundRobin(processes: ProcessInput[], quantum: number): SimulationResult {
  const validation = validateWorkload(processes, quantum);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const safeQuantum = validation.validatedQuantum;
  const procs = cloneProcs(validation.validatedProcesses);
  const queue: InternalProcess[] = [];
  let time = 0;
  const gantt: GanttSegment[] = [];
  let steps = 0;
  const n = procs.length;
  const sorted = [...procs].sort((a, b) => a.arrival - b.arrival || a.idx - b.idx);
  let arrived = 0;

  while (arrived < n && sorted[arrived].arrival <= time) {
    queue.push(sorted[arrived++]);
  }

  const totalBurst = procs.reduce((s, p) => s + p.burst, 0);
  const maxArrival = Math.max(...procs.map((p) => p.arrival), 0);
  const safetyLimit = maxArrival + totalBurst * 10 + 10000;

  while (queue.length || arrived < n) {
    if (time > safetyLimit) {
      throw new Error(`Simulation safety limit exceeded in Round Robin at time ${time}.`);
    }

    if (!queue.length) {
      if (time < sorted[arrived].arrival) {
        gantt.push({ pid: 'idle', start: time, end: sorted[arrived].arrival });
        time = sorted[arrived].arrival;
      }
      while (arrived < n && sorted[arrived].arrival <= time) {
        queue.push(sorted[arrived++]);
      }
    }

    const p = queue.shift();
    if (!p) break;

    const exec = Math.min(safeQuantum, p.remaining);
    gantt.push({ pid: p.idx, start: time, end: time + exec });
    p.remaining -= exec;
    time += exec;
    steps++;

    while (arrived < n && sorted[arrived].arrival <= time) {
      queue.push(sorted[arrived++]);
    }

    if (p.remaining > 0) {
      queue.push(p);
    } else {
      p.ct = time;
    }
  }

  return buildResult(procs, gantt, steps);
}

export function runPriority(processes: ProcessInput[]): SimulationResult {
  const validation = validateWorkload(processes);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const procs = cloneProcs(validation.validatedProcesses);
  let time = 0;
  let done = 0;
  const n = procs.length;
  const gantt: GanttSegment[] = [];
  let steps = 0;
  const completed = new Set<number>();

  while (done < n) {
    const avail = procs.filter((p) => p.arrival <= time && !completed.has(p.idx));
    if (!avail.length) {
      const next = procs.filter((p) => !completed.has(p.idx)).sort((a, b) => a.arrival - b.arrival)[0];
      if (!next) break;
      gantt.push({ pid: 'idle', start: time, end: next.arrival });
      time = next.arrival;
      continue;
    }
    avail.sort((a, b) => a.priority - b.priority || a.arrival - b.arrival || a.idx - b.idx);
    const p = avail[0];
    gantt.push({ pid: p.idx, start: time, end: time + p.burst });
    p.ct = time + p.burst;
    time += p.burst;
    completed.add(p.idx);
    done++;
    steps++;
  }

  return buildResult(procs, gantt, steps);
}

/**
 * Preemptive Priority Scheduler.
 * Terminates via progress invariant done < n (CPU-003: no arbitrary maxTime + 10 cutoff).
 */
export function runPreemptivePriority(processes: ProcessInput[]): SimulationResult {
  const validation = validateWorkload(processes);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const procs = cloneProcs(validation.validatedProcesses);
  let time = 0;
  let done = 0;
  const n = procs.length;
  const gantt: GanttSegment[] = [];
  let steps = 0;
  const totalBurst = procs.reduce((s, p) => s + p.burst, 0);
  const maxArrival = Math.max(...procs.map((p) => p.arrival), 0);
  const safetyLimit = maxArrival + totalBurst * 10 + 10000;
  let lastPid: number | 'idle' = -1;

  while (done < n) {
    if (time > safetyLimit) {
      throw new Error(`Simulation safety limit exceeded in Preemptive Priority at time ${time}.`);
    }

    const avail = procs.filter((p) => p.arrival <= time && p.remaining > 0);
    if (!avail.length) {
      const nextProc = procs.filter((p) => p.remaining > 0 && p.arrival > time).sort((a, b) => a.arrival - b.arrival)[0];
      if (!nextProc) break;

      const jumpTime = nextProc.arrival;
      if (lastPid === 'idle' && gantt.length) {
        gantt[gantt.length - 1].end = jumpTime;
      } else {
        gantt.push({ pid: 'idle', start: time, end: jumpTime });
      }
      lastPid = 'idle';
      time = jumpTime;
      continue;
    }

    avail.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      if (a.idx === lastPid) return -1;
      if (b.idx === lastPid) return 1;
      return a.arrival - b.arrival || a.idx - b.idx;
    });

    const p = avail[0];
    if (p.idx !== lastPid) {
      gantt.push({ pid: p.idx, start: time, end: time + 1 });
      steps++;
    } else {
      gantt[gantt.length - 1].end++;
    }

    p.remaining--;
    lastPid = p.idx;
    time++;

    if (p.remaining === 0) {
      p.ct = time;
      done++;
    }
  }

  return buildResult(procs, gantt, steps);
}

export function simulateAll(processes: ProcessInput[], quantum: number): AllResults {
  const validation = validateWorkload(processes, quantum);
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const validProcs = validation.validatedProcesses;
  const validQ = validation.validatedQuantum;

  return {
    fcfs: runFCFS(validProcs),
    sjf: runSJF(validProcs),
    srtf: runSRTF(validProcs),
    rr: runRoundRobin(validProcs, validQ),
    priority: runPriority(validProcs),
    pprior: runPreemptivePriority(validProcs),
  };
}
