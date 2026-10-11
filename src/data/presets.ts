import { ProcessInput } from '../types';

export interface PresetWorkload {
  id: string;
  name: string;
  category: 'many' | 'classic' | 'stress';
  desc: string;
  quantum: number;
  processes: ProcessInput[];
}

// 8-Task Everyday Multitasking Benchmark: Ready to run out-of-the-box for comprehensive testing
export const DEFAULT_PROCESSES: ProcessInput[] = [
  { id: 0, arrival: 0, burst: 7, priority: 3 }, // Web browser loading tabs
  { id: 1, arrival: 1, burst: 4, priority: 1 }, // Mouse & keyboard input handler
  { id: 2, arrival: 2, burst: 9, priority: 4 }, // Video streaming buffer
  { id: 3, arrival: 3, burst: 3, priority: 2 }, // Music player playback
  { id: 4, arrival: 5, burst: 6, priority: 1 }, // Code editor syntax check
  { id: 5, arrival: 6, burst: 2, priority: 5 }, // Background cloud drive sync
  { id: 6, arrival: 8, burst: 8, priority: 3 }, // Photo rendering preview
  { id: 7, arrival: 10, burst: 5, priority: 2 }, // Messaging notification
];

export const DEFAULT_QUANTUM = 3;

export const WORKLOAD_PRESETS: PresetWorkload[] = [
  {
    id: 'default-8',
    name: 'Everyday Multitasking (8 Tasks)',
    category: 'many',
    desc: 'A realistic everyday desktop mix: web browsing, music streaming, typing in docs, and background sync. Great for seeing how algorithms handle normal daily computer use.',
    quantum: 3,
    processes: [
      { id: 0, arrival: 0, burst: 7, priority: 3 },
      { id: 1, arrival: 1, burst: 4, priority: 1 },
      { id: 2, arrival: 2, burst: 9, priority: 4 },
      { id: 3, arrival: 3, burst: 3, priority: 2 },
      { id: 4, arrival: 5, burst: 6, priority: 1 },
      { id: 5, arrival: 6, burst: 2, priority: 5 },
      { id: 6, arrival: 8, burst: 8, priority: 3 },
      { id: 7, arrival: 10, burst: 5, priority: 2 },
    ],
  },
  {
    id: 'enterprise-10',
    name: 'Web Server Traffic (10 Tasks)',
    category: 'many',
    desc: 'Simulates a busy web server handling simultaneous customer visits: quick API responses, database queries, photo uploads, and session checks.',
    quantum: 3,
    processes: [
      { id: 0, arrival: 0, burst: 6, priority: 2 },
      { id: 1, arrival: 1, burst: 12, priority: 4 },
      { id: 2, arrival: 2, burst: 3, priority: 1 },
      { id: 3, arrival: 3, burst: 7, priority: 3 },
      { id: 4, arrival: 4, burst: 2, priority: 1 },
      { id: 5, arrival: 6, burst: 14, priority: 5 },
      { id: 6, arrival: 7, burst: 4, priority: 2 },
      { id: 7, arrival: 9, burst: 5, priority: 3 },
      { id: 8, arrival: 11, burst: 2, priority: 1 },
      { id: 9, arrival: 13, burst: 8, priority: 2 },
    ],
  },
  {
    id: 'convoy-8',
    name: 'Heavy Export vs. Quick Clicks (Convoy)',
    category: 'stress',
    desc: 'Two massive video exports arrive first, forcing fast, lightweight mouse clicks and chat notifications to wait in line. Highlights the famous "convoy effect" in FCFS.',
    quantum: 4,
    processes: [
      { id: 0, arrival: 0, burst: 22, priority: 3 },
      { id: 1, arrival: 1, burst: 16, priority: 3 },
      { id: 2, arrival: 2, burst: 3, priority: 1 },
      { id: 3, arrival: 3, burst: 2, priority: 1 },
      { id: 4, arrival: 4, burst: 4, priority: 2 },
      { id: 5, arrival: 5, burst: 2, priority: 1 },
      { id: 6, arrival: 6, burst: 3, priority: 2 },
      { id: 7, arrival: 7, burst: 2, priority: 1 },
    ],
  },
  {
    id: 'preemption-wave-8',
    name: 'Urgent Alerts & Interrupts (Preemption)',
    category: 'stress',
    desc: 'A stream of urgent, high-priority notifications repeatedly interrupt long-running background tasks. Shows the power of preemptive algorithms (SRTF & Preemptive Priority).',
    quantum: 2,
    processes: [
      { id: 0, arrival: 0, burst: 14, priority: 5 },
      { id: 1, arrival: 2, burst: 3, priority: 2 },
      { id: 2, arrival: 4, burst: 2, priority: 1 },
      { id: 3, arrival: 6, burst: 4, priority: 2 },
      { id: 4, arrival: 8, burst: 1, priority: 1 },
      { id: 5, arrival: 10, burst: 5, priority: 3 },
      { id: 6, arrival: 12, burst: 2, priority: 1 },
      { id: 7, arrival: 14, burst: 6, priority: 2 },
    ],
  },
  {
    id: 'rr-multitask-8',
    name: 'Fair Turn-Taking (Round Robin)',
    category: 'many',
    desc: 'Eight equal-weight applications opened at the same time. Demonstrates how Round Robin slices time to give every program immediate feedback without freezing.',
    quantum: 3,
    processes: [
      { id: 0, arrival: 0, burst: 8, priority: 2 },
      { id: 1, arrival: 0, burst: 6, priority: 2 },
      { id: 2, arrival: 1, burst: 7, priority: 2 },
      { id: 3, arrival: 1, burst: 5, priority: 2 },
      { id: 4, arrival: 2, burst: 9, priority: 2 },
      { id: 5, arrival: 2, burst: 4, priority: 2 },
      { id: 6, arrival: 3, burst: 6, priority: 2 },
      { id: 7, arrival: 3, burst: 5, priority: 2 },
    ],
  },
  {
    id: 'priority-starve-8',
    name: 'VIP Priority Queue (Starvation Demo)',
    category: 'stress',
    desc: 'Emergency VIP tasks arrive continuously, keeping the CPU occupied while ordinary background housekeeping tasks wait endlessly (starvation).',
    quantum: 3,
    processes: [
      { id: 0, arrival: 0, burst: 5, priority: 1 },
      { id: 1, arrival: 2, burst: 4, priority: 1 },
      { id: 2, arrival: 4, burst: 6, priority: 2 },
      { id: 3, arrival: 6, burst: 3, priority: 1 },
      { id: 4, arrival: 0, burst: 12, priority: 5 },
      { id: 5, arrival: 1, burst: 10, priority: 5 },
      { id: 6, arrival: 8, burst: 4, priority: 2 },
      { id: 7, arrival: 10, burst: 3, priority: 1 },
    ],
  },
  {
    id: 'burst-sorting-9',
    name: 'Arrival Rush: Short vs. Long Tasks (9 Tasks)',
    category: 'many',
    desc: 'Nine tasks arrive almost simultaneously with widely different durations (from 1 to 14 units). Compares how Shortest Job First optimizes the queue versus standard FIFO order.',
    quantum: 4,
    processes: [
      { id: 0, arrival: 0, burst: 12, priority: 3 },
      { id: 1, arrival: 0, burst: 2, priority: 1 },
      { id: 2, arrival: 1, burst: 7, priority: 2 },
      { id: 3, arrival: 1, burst: 1, priority: 1 },
      { id: 4, arrival: 2, burst: 14, priority: 4 },
      { id: 5, arrival: 2, burst: 3, priority: 2 },
      { id: 6, arrival: 3, burst: 5, priority: 3 },
      { id: 7, arrival: 3, burst: 2, priority: 1 },
      { id: 8, arrival: 4, burst: 8, priority: 2 },
    ],
  },
  {
    id: 'classic-galvin-5',
    name: 'Classroom Textbook Problem (5 Tasks)',
    category: 'classic',
    desc: 'The classic 5-process benchmark from standard operating systems textbooks. Great for comparing manual calculations with software results.',
    quantum: 2,
    processes: [
      { id: 0, arrival: 0, burst: 10, priority: 3 },
      { id: 1, arrival: 1, burst: 1, priority: 1 },
      { id: 2, arrival: 2, burst: 2, priority: 3 },
      { id: 3, arrival: 3, burst: 1, priority: 4 },
      { id: 4, arrival: 4, burst: 5, priority: 2 },
    ],
  },
  {
    id: 'simple-4',
    name: 'Beginner Starter (4 Tasks)',
    category: 'classic',
    desc: 'A simple, clean 4-process workload ideal for beginners learning the core differences between scheduling algorithms.',
    quantum: 2,
    processes: [
      { id: 0, arrival: 0, burst: 8, priority: 3 },
      { id: 1, arrival: 1, burst: 4, priority: 1 },
      { id: 2, arrival: 2, burst: 9, priority: 4 },
      { id: 3, arrival: 3, burst: 5, priority: 2 },
    ],
  },
  {
    id: 'identical-arrivals-5',
    name: 'Simultaneous Start (5 Tasks at t=0)',
    category: 'classic',
    desc: 'All 5 tasks arrive at exactly the same time (t=0). Demonstrates pure Shortest Job First scheduling and why it produces minimal average wait time.',
    quantum: 2,
    processes: [
      { id: 0, arrival: 0, burst: 8, priority: 3 },
      { id: 1, arrival: 0, burst: 4, priority: 1 },
      { id: 2, arrival: 0, burst: 9, priority: 4 },
      { id: 3, arrival: 0, burst: 5, priority: 2 },
      { id: 4, arrival: 0, burst: 2, priority: 1 },
    ],
  },
];

// Deterministic 32-bit PRNG (Mulberry32) for reproducible workload benchmarking (CPU-023)
function createSeededPRNG(seed: number) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateRandomMultiProcessWorkload(count: number = 8, seed?: number): {
  processes: ProcessInput[];
  quantum: number;
  seed: number;
} {
  const safeCount = Math.max(4, Math.min(count, 14));
  const activeSeed = seed !== undefined ? Math.floor(seed) : Math.floor(Date.now() % 1000000) + 1;
  const rng = createSeededPRNG(activeSeed);
  const processes: ProcessInput[] = [];
  let currentArrival = 0;

  for (let i = 0; i < safeCount; i++) {
    // Stagger arrival times between 0 and 15
    if (i > 0) {
      currentArrival += Math.floor(rng() * 3); // +0, 1, or 2
    }
    const burst = Math.floor(rng() * 9) + 2; // 2 to 10
    const priority = Math.floor(rng() * 5) + 1; // 1 to 5

    processes.push({
      id: i,
      arrival: currentArrival,
      burst,
      priority,
    });
  }

  const avgBurst = Math.round(processes.reduce((acc, p) => acc + p.burst, 0) / processes.length);
  const quantum = Math.max(2, Math.min(Math.round(avgBurst * 0.5), 5));

  return { processes, quantum, seed: activeSeed };
}
