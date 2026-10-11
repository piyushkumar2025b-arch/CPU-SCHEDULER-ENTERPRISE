import { ProcessInput } from '../types';

export interface ProcessStarvationRisk {
  pid: number;
  sjfRisk: 'none' | 'low' | 'medium' | 'high';
  priorityRisk: 'none' | 'low' | 'medium' | 'high';
  starvationThresholdTime: number;  // estimated time after which process will have waited > 2x its burst time
  suggestedAgingRate: number;       // priority bonus per 5 time units to prevent starvation, or 0 if no risk
  explanation: string;              // one sentence
}

/**
 * Analyzes workload for potential starvation vulnerabilities (CPU-020).
 * Accurately incorporates arrival times so future arrivals don't falsely trigger delay estimates.
 */
export function analyzeStarvationRisks(processes: ProcessInput[]): ProcessStarvationRisk[] {
  const n = processes.length;
  if (n === 0) return [];

  const bursts = processes.map((p) => p.burst);
  const burstMean = bursts.reduce((a, b) => a + b, 0) / n;
  const variance = bursts.reduce((acc, b) => acc + Math.pow(b - burstMean, 2), 0) / n;
  const stddev = Math.sqrt(variance);

  const priorities = processes.map((p) => p.priority);
  const minPriority = Math.min(...priorities);
  const maxPriority = Math.max(...priorities);
  const prioritySpread = Math.max(1, maxPriority - minPriority);

  return processes.map((proc, idx) => {
    // 1. SJF / SRTF Risk Evaluation with arrival constraints (CPU-020):
    // Only contender processes that arrive before proc or within its realistic arrival horizon
    const contenderShortProcesses = processes.filter((other, oIdx) => {
      if (oIdx === idx) return false;
      if (other.burst >= proc.burst) return false;
      // Other task must arrive before this process or close enough to preempt it
      return other.arrival <= proc.arrival + 10;
    });

    const precedingBurstsSJF = contenderShortProcesses.reduce((sum, p) => sum + p.burst, 0);

    let sjfRisk: 'none' | 'low' | 'medium' | 'high' = 'none';
    if (proc.burst > burstMean + stddev && contenderShortProcesses.length > 2) {
      if (precedingBurstsSJF > 3 * proc.burst) {
        sjfRisk = 'high';
      } else if (precedingBurstsSJF > 2 * proc.burst) {
        sjfRisk = 'medium';
      } else {
        sjfRisk = 'low';
      }
    } else if (proc.burst > burstMean && contenderShortProcesses.length > 2) {
      sjfRisk = 'low';
    }

    // 2. Priority Risk Evaluation with arrival constraints:
    // Only processes with higher urgency (lower numeric value) that arrive in competition
    const contenderHigherUrgency = processes.filter((other, oIdx) => {
      if (oIdx === idx) return false;
      if (other.priority >= proc.priority) return false;
      return other.arrival <= proc.arrival + 15;
    });
    const higherCount = contenderHigherUrgency.length;

    let priorityRisk: 'none' | 'low' | 'medium' | 'high' = 'none';
    if (proc.priority >= 4 && higherCount > 2) {
      if (higherCount >= 4) {
        priorityRisk = 'high';
      } else {
        priorityRisk = 'medium';
      }
    } else if (higherCount > 2) {
      priorityRisk = 'low';
    }

    // 3. starvationThresholdTime (arrival time + estimated delay)
    const precedingBurstsPriority = contenderHigherUrgency.reduce((sum, p) => sum + p.burst, 0);
    const estimatedDelay = Math.max(precedingBurstsSJF, precedingBurstsPriority, 1);
    const starvationThresholdTime = proc.arrival + estimatedDelay;

    // 4. suggestedAgingRate
    const hasMediumOrHighRisk =
      sjfRisk === 'high' || sjfRisk === 'medium' || priorityRisk === 'high' || priorityRisk === 'medium';
    const suggestedAgingRate = hasMediumOrHighRisk
      ? Math.max(1, Math.ceil((prioritySpread / estimatedDelay) * 10))
      : 0;

    // 5. Explanation with accurate terminology
    let explanation = `Process P${idx} operates with balanced scheduling parameters.`;
    if (priorityRisk === 'high') {
      explanation = `Process P${idx} (Priority ${proc.priority}) is queued behind ${higherCount} higher-urgency processes totaling ${precedingBurstsPriority}ms execution time.`;
    } else if (sjfRisk === 'high') {
      explanation = `Process P${idx} has long burst (${proc.burst}ms) and faces significant dispatch delays behind ${contenderShortProcesses.length} shorter jobs under SJF/SRTF.`;
    } else if (priorityRisk === 'medium') {
      explanation = `Process P${idx} has lower priority tier (${proc.priority}) with ${higherCount} higher priority contenders; dynamic aging recommended.`;
    } else if (sjfRisk === 'medium') {
      explanation = `Process P${idx} burst (${proc.burst}ms) exceeds workload average (${burstMean.toFixed(1)}ms), facing moderate queue delay under SJF.`;
    } else if (priorityRisk === 'low' || sjfRisk === 'low') {
      explanation = `Process P${idx} exhibits slight scheduling latency under strict shortest-job or priority ordering.`;
    }

    return {
      pid: idx,
      sjfRisk,
      priorityRisk,
      starvationThresholdTime,
      suggestedAgingRate,
      explanation,
    };
  });
}
