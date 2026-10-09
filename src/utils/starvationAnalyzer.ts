import { ProcessInput } from '../types';

export interface ProcessStarvationRisk {
  pid: number;
  sjfRisk: 'none' | 'low' | 'medium' | 'high';
  priorityRisk: 'none' | 'low' | 'medium' | 'high';
  starvationThresholdTime: number;  // estimated time after which process will have waited > 2x its burst time
  suggestedAgingRate: number;       // priority bonus per 5 time units to prevent starvation, or 0 if no risk
  explanation: string;              // one sentence
}

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
    // 1. SJF Risk Evaluation:
    // If a process's burst is > burstMean + stddev, and there are more than 2 shorter processes that arrive before it:
    // -> risk is "high" if it could wait > 3x its burst, "medium" if > 2x, else "low"
    let sjfRisk: 'none' | 'low' | 'medium' | 'high' = 'none';
    const shorterProcesses = processes.filter(
      (other, oIdx) => oIdx !== idx && other.burst < proc.burst
    );
    const precedingBurstsSJF = shorterProcesses.reduce((sum, p) => sum + p.burst, 0);

    if (proc.burst > burstMean + stddev && shorterProcesses.length > 2) {
      if (precedingBurstsSJF > 3 * proc.burst) {
        sjfRisk = 'high';
      } else if (precedingBurstsSJF > 2 * proc.burst) {
        sjfRisk = 'medium';
      } else {
        sjfRisk = 'low';
      }
    } else if (proc.burst > burstMean && shorterProcesses.length > 2) {
      sjfRisk = 'low';
    }

    // 2. Priority Risk Evaluation:
    // If priority >= 4 (low priority) and more than 2 processes with lower priority number (higher urgency):
    // -> proportional to count of processes that will always preempt it
    let priorityRisk: 'none' | 'low' | 'medium' | 'high' = 'none';
    const higherUrgencyProcesses = processes.filter(
      (other, oIdx) => oIdx !== idx && other.priority < proc.priority
    );
    const higherCount = higherUrgencyProcesses.length;

    if (proc.priority >= 4 && higherCount > 2) {
      if (higherCount >= 4) {
        priorityRisk = 'high';
      } else {
        priorityRisk = 'medium';
      }
    } else if (higherCount > 2) {
      priorityRisk = 'low';
    }

    // 3. starvationThresholdTime: sum of burst times of all processes that will run before this one under worst-case scheduling
    const precedingBurstsPriority = higherUrgencyProcesses.reduce((sum, p) => sum + p.burst, 0);
    const starvationThresholdTime = Math.max(precedingBurstsSJF, precedingBurstsPriority, 1);

    // 4. suggestedAgingRate: ceil(prioritySpread / starvationThresholdTime * 10) only if risk is medium or high, else 0
    const hasMediumOrHighRisk =
      sjfRisk === 'high' || sjfRisk === 'medium' || priorityRisk === 'high' || priorityRisk === 'medium';
    const suggestedAgingRate = hasMediumOrHighRisk
      ? Math.max(1, Math.ceil((prioritySpread / starvationThresholdTime) * 10))
      : 0;

    // 5. Explanation
    let explanation = `Process P${idx} operates with balanced scheduling parameters.`;
    if (priorityRisk === 'high') {
      explanation = `Process P${idx} (Priority ${proc.priority}) is queued behind ${higherCount} higher-urgency processes totaling ${precedingBurstsPriority}ms execution time.`;
    } else if (sjfRisk === 'high') {
      explanation = `Process P${idx} has long burst (${proc.burst}ms) and will be repeatedly preempted by ${shorterProcesses.length} shorter jobs under SJF/SRTF.`;
    } else if (priorityRisk === 'medium') {
      explanation = `Process P${idx} has low priority tier (${proc.priority}) with ${higherCount} higher priority contenders; dynamic aging recommended.`;
    } else if (sjfRisk === 'medium') {
      explanation = `Process P${idx} burst (${proc.burst}ms) exceeds workload average (${burstMean.toFixed(1)}ms), facing moderate queue latency under SJF.`;
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
