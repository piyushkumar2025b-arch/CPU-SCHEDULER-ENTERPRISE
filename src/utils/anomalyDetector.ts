import { AllResults, AlgorithmKey, ProcessInput } from '../types';

export interface DetectedAnomaly {
  id: string;
  title: string;
  severity: 'critical' | 'warning' | 'info';
  algorithm: AlgorithmKey | 'all';
  metric: string;
  description: string;
  mitigation: string;
}

/**
 * Standardized heuristic thresholds for CPU scheduling anomaly detection (CPU-019).
 */
export const ANOMALY_THRESHOLDS = {
  CONVOY_BURST_MULTIPLIER: 1.8,
  CONVOY_MIN_SHORT_TASKS: 2,
  SRTF_SWITCHES_PER_TASK: 2.5,
  RR_SWITCHES_PER_TASK: 3.0,
  STARVATION_WAIT_MULTIPLIER: 3.5,
  STARVATION_MIN_WAIT: 15,
  JITTER_THRESHOLD_MS: 25,
} as const;

export function detectAnomalies(
  processes: ProcessInput[],
  results: AllResults,
  quantum: number,
  processNames?: string[]
): DetectedAnomaly[] {
  const anomalies: DetectedAnomaly[] = [];
  const n = processes.length;
  if (n === 0) return anomalies;

  const bursts = processes.map((p) => p.burst);
  const avgBurst = bursts.reduce((a, b) => a + b, 0) / n;
  const maxBurst = Math.max(...bursts);

  // 1. Convoy Effect in FCFS
  const sortedByArrival = [...processes].sort((a, b) => a.arrival - b.arrival || a.id - b.id);
  const firstP = sortedByArrival[0];
  const firstPCompletion = firstP ? firstP.arrival + firstP.burst : 0;
  const convoyContenders = sortedByArrival.slice(1).filter(
    (p) => p.burst < firstP.burst / 2 && p.arrival < firstPCompletion
  );
  const laterShorterCount = convoyContenders.length;
  if (firstP && firstP.burst > avgBurst * ANOMALY_THRESHOLDS.CONVOY_BURST_MULTIPLIER && laterShorterCount >= ANOMALY_THRESHOLDS.CONVOY_MIN_SHORT_TASKS) {
    const firstPIndex = processes.findIndex((p) => p.id === firstP.id);
    const pName = processNames?.[firstPIndex] || `Task ${firstP.id}`;
    anomalies.push({
      id: 'convoy-effect',
      title: 'Convoy Effect Detected in FCFS',
      severity: 'critical',
      algorithm: 'fcfs',
      metric: `P${firstP.id} burst (${firstP.burst}ms) vs mean (${avgBurst.toFixed(1)}ms)`,
      description: `Process P${firstP.id} (${pName}) arrives earliest and monopolizes the CPU, causing ${laterShorterCount} short interactive tasks to experience extreme queue latency.`,
      mitigation: 'Switch to Preemptive SRTF or Round Robin to interleave short tasks and eliminate head-of-line blocking.',
    });
  }

  // 2. Extreme Context Switching Overhead (SRTF / RR)
  if (results.srtf && results.srtf.ctxSwitches > n * ANOMALY_THRESHOLDS.SRTF_SWITCHES_PER_TASK) {
    anomalies.push({
      id: 'srtf-thrashing',
      title: 'High Preemption Overhead in SRTF',
      severity: 'warning',
      algorithm: 'srtf',
      metric: `${results.srtf.ctxSwitches} context switches (${(results.srtf.ctxSwitches / n).toFixed(1)}x / process)`,
      description: 'Frequent remaining-time preemptions incur significant kernel state save/restore overhead.',
      mitigation: 'Consider applying a minimum execution slice threshold or using Round Robin with tuned quantum.',
    });
  }

  if (results.rr && results.rr.ctxSwitches > n * ANOMALY_THRESHOLDS.RR_SWITCHES_PER_TASK) {
    anomalies.push({
      id: 'rr-quantum-churn',
      title: 'Round Robin Quantum Churn',
      severity: 'warning',
      algorithm: 'rr',
      metric: `${results.rr.ctxSwitches} context switches (q=${quantum})`,
      description: `Time slice quantum (q=${quantum}) is small relative to average workload burst (${avgBurst.toFixed(1)}ms), resulting in excessive scheduling overhead.`,
      mitigation: `Increase quantum to approximately 75-80% of mean burst (~${Math.max(2, Math.round(avgBurst * 0.8))}) to amortize context switch cost.`,
    });
  }

  // 3. Round Robin Quantum Degradation to FCFS
  if (quantum >= maxBurst) {
    anomalies.push({
      id: 'rr-degraded-fcfs',
      title: 'Round Robin Degraded to FCFS',
      severity: 'info',
      algorithm: 'rr',
      metric: `q=${quantum} ≥ max burst (${maxBurst}ms)`,
      description: 'The configured quantum equals or exceeds the maximum process burst. No process requires multiple slices; RR executes identically to FCFS under this arrival order.',
      mitigation: `Reduce quantum below ${maxBurst} (recommended: ${Math.max(2, Math.round(avgBurst * 0.6))}) to enable responsive concurrency.`,
    });
  }

  // 4. Starvation in Priority / Preemptive Priority (CPU-018: robust identity lookup)
  (['priority', 'pprior'] as AlgorithmKey[]).forEach((algoKey) => {
    const res = results[algoKey];
    if (!res) return;
    res.stats.forEach((st) => {
      // Find matching process by stable ID first, then array index
      const p = processes.find((proc) => proc.id === (st.id ?? st.idx)) ?? processes[st.idx];
      const pIdx = st.idx;
      const pId = st.id ?? p?.id ?? pIdx;
      if (p && st.WT > p.burst * ANOMALY_THRESHOLDS.STARVATION_WAIT_MULTIPLIER && st.WT > ANOMALY_THRESHOLDS.STARVATION_MIN_WAIT) {
        const pName = processNames?.[pIdx] || `Task ${pId}`;
        anomalies.push({
          id: `starvation-${algoKey}-p${pId}`,
          title: `Severe Starvation for P${pId} under ${algoKey.toUpperCase()}`,
          severity: 'critical',
          algorithm: algoKey,
          metric: `Wait Time: ${st.WT}ms (${(st.WT / p.burst).toFixed(1)}x burst)`,
          description: `Process P${pId} (${pName}) suffered prolonged starvation due to higher-urgency processes preempting the core.`,
          mitigation: 'Implement dynamic aging (increasing priority by 1 every 5-10 time units) or multi-level feedback queuing (MLFQ).',
        });
      }
    });
  });

  // 5. Inverted Response Latency (High Jitter)
  (['fcfs', 'sjf', 'priority'] as AlgorithmKey[]).forEach((algoKey) => {
    const res = results[algoKey];
    if (!res) return;
    const responseTimes = res.stats.map((s) => s.RT);
    const maxRT = Math.max(...responseTimes);
    const minRT = Math.min(...responseTimes);
    if (maxRT - minRT > ANOMALY_THRESHOLDS.JITTER_THRESHOLD_MS && n >= 4) {
      anomalies.push({
        id: `jitter-${algoKey}`,
        title: `High Response Jitter in ${algoKey.toUpperCase()}`,
        severity: 'info',
        algorithm: algoKey,
        metric: `Response Range: ${minRT}ms – ${maxRT}ms (Δ ${maxRT - minRT}ms)`,
        description: `Substantial variance in initial dispatch response times creates unpredictable user latency for interactive workloads.`,
        mitigation: 'Use Round Robin or SRTF for tighter bounded response latency guarantees.',
      });
    }
  });

  // Deduplicate anomalies by ID
  const seen = new Set<string>();
  return anomalies.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}
