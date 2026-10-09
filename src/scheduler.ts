import { ProcessInput, SimulationResult, AllResults, GanttSegment } from './types';

interface InternalProcess extends ProcessInput {
  idx: number;
  remaining: number;
  ct?: number;
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
    const ct = p.ct ?? 0;
    const tat = ct - p.arrival;
    const wt = tat - p.burst;
    const rt = (p.idx in firstRun) ? firstRun[p.idx] - p.arrival : 0;
    return {
      idx: p.idx,
      AT: p.arrival,
      BT: p.burst,
      CT: ct,
      TAT: tat,
      WT: wt,
      RT: rt,
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

  // Accurate context switch count: transitions from one non-idle process to a different non-idle process
  let ctxSwitches = 0;
  let prevPid: number | 'idle' = 'idle';
  for (const g of gantt) {
    if (g.pid !== 'idle') {
      if (prevPid !== 'idle' && prevPid !== g.pid) {
        ctxSwitches++;
      }
      prevPid = g.pid;
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
  const procs = cloneProcs(processes).sort((a, b) => a.arrival - b.arrival || a.idx - b.idx);
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
  const procs = cloneProcs(processes);
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

export function runSRTF(processes: ProcessInput[]): SimulationResult {
  const procs = cloneProcs(processes);
  let time = 0;
  let done = 0;
  const n = procs.length;
  const gantt: GanttSegment[] = [];
  let steps = 0;
  const maxTime = procs.reduce((s, p) => s + p.burst, 0) + Math.max(...procs.map((p) => p.arrival), 0);
  let lastPid: number | 'idle' = -1;

  while (done < n && time <= maxTime + 10) {
    const avail = procs.filter((p) => p.arrival <= time && p.remaining > 0);
    if (!avail.length) {
      if (lastPid === 'idle' && gantt.length) {
        gantt[gantt.length - 1].end++;
      } else {
        gantt.push({ pid: 'idle', start: time, end: time + 1 });
      }
      lastPid = 'idle';
      time++;
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

export function runRoundRobin(processes: ProcessInput[], quantum: number): SimulationResult {
  const procs = cloneProcs(processes);
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

  while (queue.length || arrived < n) {
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
    const exec = Math.min(quantum, p.remaining);
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
  const procs = cloneProcs(processes);
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

export function runPreemptivePriority(processes: ProcessInput[]): SimulationResult {
  const procs = cloneProcs(processes);
  let time = 0;
  let done = 0;
  const n = procs.length;
  const gantt: GanttSegment[] = [];
  let steps = 0;
  const maxTime = procs.reduce((s, p) => s + p.burst, 0) + Math.max(...procs.map((p) => p.arrival), 0);
  let lastPid: number | 'idle' = -1;

  while (done < n && time <= maxTime + 10) {
    const avail = procs.filter((p) => p.arrival <= time && p.remaining > 0);
    if (!avail.length) {
      if (lastPid === 'idle' && gantt.length) {
        gantt[gantt.length - 1].end++;
      } else {
        gantt.push({ pid: 'idle', start: time, end: time + 1 });
      }
      lastPid = 'idle';
      time++;
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
  return {
    fcfs: runFCFS(processes),
    sjf: runSJF(processes),
    srtf: runSRTF(processes),
    rr: runRoundRobin(processes, quantum),
    priority: runPriority(processes),
    pprior: runPreemptivePriority(processes),
  };
}
