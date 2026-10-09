import { AlgorithmKey } from '../types';
import { WorkloadFingerprint } from './workloadFingerprint';

export interface AlgoRecommendation {
  ranked: AlgorithmKey[];       // all 6 algos ranked best to worst for this workload
  winner: AlgorithmKey;         // top pick
  confidence: number;           // 0.0–1.0
  scores: Record<AlgorithmKey, number>; // calculated scores 0-100
  reasons: Record<AlgorithmKey, string>;  // one-line explanation per algo
  warnings: string[];           // e.g. "High starvation risk under PRIORITY"
  workloadClass: string;        // "Interactive", "Batch", "Mixed", "CPU-Burst Heavy", "Uniform", "Realtime"
}

export function recommendAlgorithm(fp: WorkloadFingerprint): AlgoRecommendation {
  const {
    n,
    burstMean,
    burstCV,
    arrivalDensity,
    prioritySpread,
    interactiveRatio,
    batchRatio,
    heavyTailScore,
    starvationRiskScore,
  } = fp;

  // 1. Scoring formula exactly per specification
  const rawScores: Record<AlgorithmKey, number> = {
    fcfs: 100 - (burstCV * 30) - (arrivalDensity > 2 ? 20 : 0) - (heavyTailScore * 25),
    sjf: 60 + (burstCV * 20) - (interactiveRatio * 15) - (heavyTailScore * 10) + (n < 6 ? 10 : 0),
    srtf: 55 + (burstCV * 25) + (interactiveRatio * 10) - (n > 8 ? 10 : 0) - (burstMean > 10 ? 8 : 0),
    rr: 50 + (interactiveRatio * 30) + (arrivalDensity > 1.5 ? 15 : 0) - (batchRatio * 20) + (n > 5 ? 10 : 0),
    priority: 45 + (prioritySpread > 2 ? 20 : 0) + (batchRatio * 15) - (starvationRiskScore * 25) + (n < 8 ? 5 : 0),
    pprior: 40 + (prioritySpread > 2 ? 25 : 0) + (interactiveRatio * 20) - (starvationRiskScore * 20) - (n > 10 ? 10 : 0),
  };

  // Clamp scores to [0, 100]
  const scores: Record<AlgorithmKey, number> = {} as any;
  (Object.keys(rawScores) as AlgorithmKey[]).forEach((key) => {
    scores[key] = Math.round(Math.min(100, Math.max(0, rawScores[key])) * 10) / 10;
  });

  // Rank by descending score
  const allKeys: AlgorithmKey[] = ['fcfs', 'sjf', 'srtf', 'rr', 'priority', 'pprior'];
  const ranked = [...allKeys].sort((a, b) => scores[b] - scores[a]);
  const winner = ranked[0];

  // 3. Confidence: (score[0] - score[1]) / 50 clamped to [0.1, 0.95]
  const topDiff = scores[ranked[0]] - (ranked.length > 1 ? scores[ranked[1]] : 0);
  const rawConf = topDiff / 50;
  const confidence = Math.round(Math.min(0.95, Math.max(0.1, rawConf)) * 100) / 100;

  // 4. Workload Class derivation
  let workloadClass = 'Mixed';
  if (interactiveRatio > 0.5) {
    workloadClass = 'Interactive';
  } else if (batchRatio > 0.5) {
    workloadClass = 'Batch';
  } else if (burstCV > 1.2) {
    workloadClass = 'CPU-Burst Heavy';
  } else if (burstCV < 0.3) {
    workloadClass = 'Uniform';
  } else if (prioritySpread > 2 && starvationRiskScore > 0.5) {
    workloadClass = 'Realtime';
  } else {
    workloadClass = 'Mixed';
  }

  // Explanations for each algorithm
  const reasons: Record<AlgorithmKey, string> = {
    fcfs: burstCV < 0.4
      ? 'Uniform bursts minimize convoy effects, providing low dispatch overhead.'
      : 'High burst variance risks convoy penalty where short tasks queue behind long bursts.',
    sjf: heavyTailScore > 0.2
      ? 'Long tasks are deferred, maintaining near-optimal average turnaround.'
      : 'Minimizes theoretical wait times for small-to-moderate burst counts.',
    srtf: burstCV > 0.8
      ? 'Preemption enables immediate dispatch of arriving short bursts with minimal latency.'
      : 'Yields minimal average wait time, but higher context-switch overhead.',
    rr: interactiveRatio > 0.3
      ? 'Fair time-slicing ensures bounded responsiveness for concurrent interactive tasks.'
      : 'Guarantees starvation freedom and bounded response latencies across all threads.',
    priority: prioritySpread > 2
      ? 'Enforces strict privilege classes for critical tasks without preemption overhead.'
      : 'Priority separation allows urgency ordering, though low-tier tasks may suffer delay.',
    pprior: interactiveRatio > 0.3 || prioritySpread > 2
      ? 'Instant preemption guarantees immediate CPU acquisition for top-priority interrupts.'
      : 'Strict preemption guarantees top QoS for critical tasks with moderate context switching.',
  };

  // Warnings
  const warnings: string[] = [];
  if (starvationRiskScore > 0.6) {
    warnings.push('High starvation risk under Priority scheduling: lower-priority tasks may wait indefinitely.');
  }
  if (burstCV > 1.2 && heavyTailScore > 0.3) {
    warnings.push('High convoy effect probability under FCFS due to severe burst time skewness.');
  }
  if (n > 8 && (winner === 'srtf' || winner === 'pprior')) {
    warnings.push('High preemption frequency may inflate kernel context-switch latency.');
  }
  if (arrivalDensity > 2.5) {
    warnings.push('High arrival density: ready queue contention is severe at initial tick offsets.');
  }

  return {
    ranked,
    winner,
    confidence,
    scores,
    reasons,
    warnings,
    workloadClass,
  };
}
