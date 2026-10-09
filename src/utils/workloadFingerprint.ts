import { ProcessInput } from '../types';

export interface WorkloadFingerprint {
  n: number;                    // process count
  burstMean: number;            // average burst
  burstCV: number;              // coefficient of variation = stddev/mean
  burstSkewness: number;        // Fisher skewness of burst distribution
  arrivalSpread: number;        // max_arrival - min_arrival
  arrivalDensity: number;       // n / (arrivalSpread + 1)
  priorityEntropy: number;      // Shannon entropy of priority distribution
  prioritySpread: number;       // max_priority - min_priority  
  interactiveRatio: number;     // fraction of processes typed "interactive" or "realtime"
  batchRatio: number;           // fraction typed "batch" or "io-bound"
  heavyTailScore: number;       // fraction of processes with burst > 2 * burstMean
  starvationRiskScore: number;  // computed as: sum of (burst[i] * priority[i]) normalized 0–1 across all processes
}

export function computeWorkloadFingerprint(
  processes: ProcessInput[],
  processTypes?: string[]
): WorkloadFingerprint {
  const n = processes.length;
  if (n === 0) {
    return {
      n: 0,
      burstMean: 0,
      burstCV: 0,
      burstSkewness: 0,
      arrivalSpread: 0,
      arrivalDensity: 0,
      priorityEntropy: 0,
      prioritySpread: 0,
      interactiveRatio: 0,
      batchRatio: 0,
      heavyTailScore: 0,
      starvationRiskScore: 0,
    };
  }

  // Bursts
  const bursts = processes.map((p) => p.burst);
  const burstSum = bursts.reduce((acc, b) => acc + b, 0);
  const burstMean = burstSum / n;

  // Stddev & Skewness
  const variance = bursts.reduce((acc, b) => acc + Math.pow(b - burstMean, 2), 0) / n;
  const stddev = Math.sqrt(variance);
  const burstCV = burstMean > 0 ? stddev / burstMean : 0;

  let burstSkewness = 0;
  if (stddev > 0.001) {
    const m3 = bursts.reduce((acc, b) => acc + Math.pow(b - burstMean, 3), 0) / n;
    burstSkewness = m3 / Math.pow(stddev, 3);
  }

  // Arrivals
  const arrivals = processes.map((p) => p.arrival);
  const minArrival = Math.min(...arrivals);
  const maxArrival = Math.max(...arrivals);
  const arrivalSpread = Math.max(0, maxArrival - minArrival);
  const arrivalDensity = n / (arrivalSpread + 1);

  // Priorities
  const priorities = processes.map((p) => p.priority);
  const minPriority = Math.min(...priorities);
  const maxPriority = Math.max(...priorities);
  const prioritySpread = Math.max(0, maxPriority - minPriority);

  // Shannon entropy of priority distribution
  const prioCounts = new Map<number, number>();
  priorities.forEach((p) => prioCounts.set(p, (prioCounts.get(p) || 0) + 1));
  let priorityEntropy = 0;
  prioCounts.forEach((count) => {
    const prob = count / n;
    if (prob > 0) {
      priorityEntropy -= prob * Math.log2(prob);
    }
  });

  // Process Types
  let interactiveCount = 0;
  let batchCount = 0;
  if (processTypes && processTypes.length === n) {
    processTypes.forEach((t) => {
      const lower = (t || '').toLowerCase();
      if (lower === 'interactive' || lower === 'realtime') {
        interactiveCount++;
      } else if (lower === 'batch' || lower === 'io-bound') {
        batchCount++;
      }
    });
  }
  const interactiveRatio = interactiveCount / n;
  const batchRatio = batchCount / n;

  // Heavy Tail Score: fraction with burst > 2 * burstMean
  const heavyCount = bursts.filter((b) => b > 2 * burstMean).length;
  const heavyTailScore = heavyCount / n;

  // Starvation Risk Score: computed as sum of (burst[i] * priority[i]) normalized 0–1 across all processes;
  // Higher priority number (e.g. 5) = lower urgency, so long tasks with low urgency risk high starvation under priority
  const totalBurst = bursts.reduce((acc, b) => acc + b, 0);
  let weightedSum = 0;
  for (let i = 0; i < n; i++) {
    weightedSum += processes[i].burst * processes[i].priority;
  }
  const minPossible = totalBurst * 1; // if all priority 1
  const maxPossible = totalBurst * 5; // if all priority 5
  const starvationRiskScore = maxPossible > minPossible
    ? Math.min(1, Math.max(0, (weightedSum - minPossible) / (maxPossible - minPossible)))
    : 0;

  return {
    n,
    burstMean: Math.round(burstMean * 100) / 100,
    burstCV: Math.round(burstCV * 100) / 100,
    burstSkewness: Math.round(burstSkewness * 100) / 100,
    arrivalSpread,
    arrivalDensity: Math.round(arrivalDensity * 100) / 100,
    priorityEntropy: Math.round(priorityEntropy * 100) / 100,
    prioritySpread,
    interactiveRatio: Math.round(interactiveRatio * 100) / 100,
    batchRatio: Math.round(batchRatio * 100) / 100,
    heavyTailScore: Math.round(heavyTailScore * 100) / 100,
    starvationRiskScore: Math.round(starvationRiskScore * 100) / 100,
  };
}
