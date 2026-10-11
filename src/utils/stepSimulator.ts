import { ProcessInput, AlgorithmKey } from '../types';
import { validateWorkload } from '../scheduler';

export interface QueuedProcess {
  pid: number;
  id?: number;
  remainingBT: number;
  totalBT: number;
  arrival: number;
  priority: number;
  waitSoFar: number;
}

export interface CompletedProcess {
  pid: number;
  id?: number;
  completionTime: number;
  tat: number;
  wt: number;
}

export interface StepSnapshot {
  time: number;
  running: QueuedProcess | null; // null if idle
  readyQueue: QueuedProcess[];
  completed: CompletedProcess[];
  future: { pid: number; id?: number; arrival: number; burst: number; priority: number }[];
  event: string;
}

/**
 * Generates an array of StepSnapshot (at each integer clock tick t from 0 to makespan)
 * for a given algorithm, tracking CPU occupation and exact ready queue order.
 */
export function generateStepTrace(
  processes: ProcessInput[],
  algo: AlgorithmKey,
  quantum: number
): StepSnapshot[] {
  if (!processes.length) return [];

  const validation = validateWorkload(processes, algo === 'rr' ? quantum : undefined);
  if (!validation.ok) {
    throw new Error(validation.error || 'Invalid workload provided to step simulator.');
  }

  const validProcs = validation.validatedProcesses;
  const safeQuantum = validation.validatedQuantum;

  interface PState {
    pid: number;
    id: number;
    arrival: number;
    burst: number;
    priority: number;
    remaining: number;
    firstRun: number | null;
    finishTime: number | null;
  }

  const procs: PState[] = validProcs.map((p, i) => ({
    pid: i,
    id: p.id,
    arrival: p.arrival,
    burst: p.burst,
    priority: p.priority,
    remaining: p.burst,
    firstRun: null,
    finishTime: null,
  }));

  const safeQuantum = Math.max(1, Math.floor(Number(quantum) || 1));
  const totalBurst = procs.reduce((acc, p) => acc + p.burst, 0);
  const maxArrival = Math.max(...procs.map((p) => p.arrival), 0);
  const maxSimTime = maxArrival + totalBurst * 10 + 1000;

  const snapshots: StepSnapshot[] = [];

  let time = 0;
  let doneCount = 0;
  const n = procs.length;

  // Algorithm specific state
  let currentRunning: PState | null = null;
  let currentQuantumLeft = safeQuantum;
  const readyQueue: PState[] = [];
  const completed: CompletedProcess[] = [];

  // For Round Robin arrival tracking
  const arrivedSet = new Set<number>();

  const getSnapshot = (eventText: string): StepSnapshot => {
    return {
      time,
      running: currentRunning
        ? {
            pid: currentRunning.pid,
            id: currentRunning.id,
            remainingBT: currentRunning.remaining,
            totalBT: currentRunning.burst,
            arrival: currentRunning.arrival,
            priority: currentRunning.priority,
            waitSoFar: time - currentRunning.arrival - (currentRunning.burst - currentRunning.remaining),
          }
        : null,
      readyQueue: readyQueue.map((p) => ({
        pid: p.pid,
        id: p.id,
        remainingBT: p.remaining,
        totalBT: p.burst,
        arrival: p.arrival,
        priority: p.priority,
        waitSoFar: time - p.arrival - (p.burst - p.remaining),
      })),
      completed: [...completed],
      future: procs
        .filter((p) => p.arrival > time)
        .sort((a, b) => a.arrival - b.arrival)
        .map((p) => ({
          pid: p.pid,
          id: p.id,
          arrival: p.arrival,
          burst: p.burst,
          priority: p.priority,
        })),
      event: eventText,
    };
  };

  while (doneCount < n && time <= maxSimTime) {
    let eventLog = '';

    // 1. Process new arrivals at current time
    const newlyArrived = procs.filter((p) => p.arrival === time && !arrivedSet.has(p.pid));
    newlyArrived.forEach((p) => {
      arrivedSet.add(p.pid);
      if (algo === 'rr' || algo === 'fcfs') {
        readyQueue.push(p);
      } else if (algo === 'sjf') {
        readyQueue.push(p);
      } else if (algo === 'srtf') {
        readyQueue.push(p);
      } else if (algo === 'priority' || algo === 'pprior') {
        readyQueue.push(p);
      }
    });

    if (newlyArrived.length > 0) {
      eventLog += `P${newlyArrived.map((p) => p.pid).join(', P')} arrived at t=${time}. `;
    }

    // Sort ready queue based on algorithm policy if needed
    if (algo === 'sjf') {
      readyQueue.sort((a, b) => a.burst - b.burst || a.arrival - b.arrival || a.pid - b.pid);
    } else if (algo === 'srtf') {
      readyQueue.sort((a, b) => a.remaining - b.remaining || a.arrival - b.arrival || a.pid - b.pid);
    } else if (algo === 'priority') {
      readyQueue.sort((a, b) => a.priority - b.priority || a.arrival - b.arrival || a.pid - b.pid);
    } else if (algo === 'pprior') {
      readyQueue.sort((a, b) => a.priority - b.priority || a.arrival - b.arrival || a.pid - b.pid);
    }

    // 2. Preemption checks for preemptive algorithms
    if (currentRunning) {
      if (algo === 'srtf' && readyQueue.length > 0) {
        if (readyQueue[0].remaining < currentRunning.remaining) {
          eventLog += `Preemption: P${readyQueue[0].pid} (rem: ${readyQueue[0].remaining}) preempts P${currentRunning.pid} (rem: ${currentRunning.remaining}). `;
          readyQueue.push(currentRunning);
          readyQueue.sort((a, b) => a.remaining - b.remaining || a.arrival - b.arrival || a.pid - b.pid);
          currentRunning = null;
        }
      } else if (algo === 'pprior' && readyQueue.length > 0) {
        if (readyQueue[0].priority < currentRunning.priority) {
          eventLog += `Preemption: Higher-priority P${readyQueue[0].pid} (pri: ${readyQueue[0].priority}) preempts P${currentRunning.pid} (pri: ${currentRunning.priority}). `;
          readyQueue.push(currentRunning);
          readyQueue.sort((a, b) => a.priority - b.priority || a.arrival - b.arrival || a.pid - b.pid);
          currentRunning = null;
        }
      } else if (algo === 'rr') {
        if (currentQuantumLeft <= 0) {
          eventLog += `Quantum (${safeQuantum}) expired for P${currentRunning.pid}. `;
          readyQueue.push(currentRunning);
          currentRunning = null;
        }
      }
    }

    // 3. Dispatch if CPU is idle
    if (!currentRunning) {
      if (readyQueue.length > 0) {
        currentRunning = readyQueue.shift()!;
        currentQuantumLeft = safeQuantum;
        if (currentRunning.firstRun === null) {
          currentRunning.firstRun = time;
        }
        eventLog += `CPU dispatched to P${currentRunning.pid}. `;
      } else {
        if (!eventLog) eventLog = 'CPU is IDLE (ready queue empty).';
      }
    }

    // Record snapshot at start of tick `time`
    snapshots.push(getSnapshot(eventLog.trim()));

    // 4. Advance 1 time unit
    if (currentRunning) {
      currentRunning.remaining--;
      currentQuantumLeft--;
      time++;

      // Check if finished
      if (currentRunning.remaining === 0) {
        currentRunning.finishTime = time;
        doneCount++;
        const tat = time - currentRunning.arrival;
        const wt = tat - currentRunning.burst;
        completed.push({
          pid: currentRunning.pid,
          id: currentRunning.id,
          completionTime: time,
          tat,
          wt,
        });
        currentRunning = null;
      }
    } else {
      time++;
    }
  }

  // Final snapshot with invariant verification
  if (doneCount === n) {
    snapshots.push(getSnapshot(`Simulation concluded at t=${time}. All processes finished.`));
  } else {
    snapshots.push(getSnapshot(`Simulation halted at safety limit t=${time} before all processes completed (${doneCount}/${n} finished).`));
  }

  return snapshots;
}
