export interface ProcessInput {
  id: number;
  arrival: number;
  burst: number;
  priority: number;
}

export interface GanttSegment {
  pid: number | 'idle';
  start: number;
  end: number;
}

export interface ProcessStat {
  idx: number;
  AT: number;
  BT: number;
  CT: number;
  TAT: number;
  WT: number;
  RT: number;
}

export interface SimulationResult {
  gantt: GanttSegment[];
  stats: ProcessStat[];
  steps: number;
  avgTAT: number;
  avgWT: number;
  avgRT: number;
  totalTime: number;
  cpuUtil: string;
  throughput: string;
  ctxSwitches: number;
}

export type AlgorithmKey = 'fcfs' | 'sjf' | 'srtf' | 'rr' | 'priority' | 'pprior';

export type AllResults = Record<AlgorithmKey, SimulationResult>;
