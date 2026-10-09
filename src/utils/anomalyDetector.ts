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
  const minBurst = Math.min(...bursts);

  // 1. Convoy Effect in FCFS
  const sortedByArrival = [...processes].sort((a, b) => a.arrival - b.arrival || a.id - b.id);
  const firstP = sortedByArrival[0];
  const laterShorterCount = sortedByArrival.slice(1).filter((p) => p.burst < firstP.burst / 2).length;
  if (firstP && firstP.burst > avgBurst * 1.8 && laterShorterCount >= 2) {
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
  if (results.srtf && results.srtf.ctxSwitches > n * 2.5) {
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

  if (results.rr && results.rr.ctxSwitches > n * 3) {
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
      description: 'The configured quantum equals or exceeds the maximum process burst. No preemption occurs; RR behaves identically to FCFS.',
      mitigation: `Reduce quantum below ${maxBurst} (recommended: ${Math.max(2, Math.round(avgBurst * 0.6))}) to enable responsive concurrency.`,
    });
  }

  // 4. Starvation in Priority / Preemptive Priority
  (['priority', 'pprior'] as AlgorithmKey[]).forEach((algoKey) => {
    const res = results[algoKey];
    if (!res) return;
    res.stats.forEach((st) => {
      const p = processes.find((proc) => proc.id === st.idx) ?? processes[st.idx];
      const pIdx = st.idx;
      if (p && st.WT > p.burst * 3.5 && st.WT > 15) {
        anomalies.push({
          id: `starvation-${algoKey}-p${pIdx}`,
          title: `Severe Starvation for P${pIdx} under ${algoKey.toUpperCase()}`,
          severity: 'critical',
          algorithm: algoKey,
          metric: `Wait Time: ${st.WT}ms (${(st.WT / p.burst).toFixed(1)}x burst)`,
          description: `Process P${pIdx} (${processNames?.[pIdx] || `Task ${pIdx}`}) suffered prolonged starvation due to higher-urgency processes preempting the core.`,
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
    if (maxRT - minRT > 25 && n >= 4) {
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

  // Deduplicate anomalies by title
  const seen = new Set<string>();
  return anomalies.filter((a) => {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
    return true;
  });
}
