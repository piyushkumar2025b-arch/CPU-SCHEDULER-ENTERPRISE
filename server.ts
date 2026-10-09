import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json());

const apiKey = process.env.GEMINI_API_KEY || '';
const openRouterKeyEnv = process.env.OPENROUTER_API_KEY || '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// ==========================================
// AI PROVIDERS CONFIGURATION & STATUS
// ==========================================
app.get('/api/ai-providers', (_req, res) => {
  res.json({
    gemini: {
      available: Boolean(apiKey),
      defaultModel: 'gemini-3.8-flash',
      models: ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'],
    },
    openrouter: {
      available: true,
      hasEnvKey: Boolean(openRouterKeyEnv),
      defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',
      suggestedModels: [
        { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (Free)', provider: 'Meta' },
        { id: 'mistralai/mistral-small-24b-instruct-2501:free', name: 'Mistral Small 24B (Free)', provider: 'Mistral' },
        { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash (OpenRouter)', provider: 'Google' },
        { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', provider: 'DeepSeek' },
        { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI' },
        { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku', provider: 'Anthropic' },
      ],
    },
    heuristic: {
      available: true,
      name: 'Deterministic Heuristic Synthesizer (Offline/Zero-Latency)',
    },
  });
});

// Helper for parsing JSON array from LLM text responses
function parseJsonArrayFromText(rawText: string): any[] {
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  try {
    const direct = JSON.parse(cleaned);
    if (Array.isArray(direct)) return direct;
    if (direct && Array.isArray(direct.processes)) return direct.processes;
    if (direct && Array.isArray(direct.tasks)) return direct.tasks;
  } catch {
    // Look for outermost JSON array bracket
    const startIdx = cleaned.indexOf('[');
    const endIdx = cleaned.lastIndexOf(']');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const slice = cleaned.substring(startIdx, endIdx + 1);
      try {
        const extracted = JSON.parse(slice);
        if (Array.isArray(extracted)) return extracted;
      } catch {
        // Fallthrough
      }
    }
  }
  throw new Error('Could not parse valid JSON process array from model output');
}

// Helper to invoke OpenRouter API
async function callOpenRouterCompletion({
  systemInstruction,
  prompt,
  model = 'meta-llama/llama-3.3-70b-instruct:free',
  customKey,
}: {
  systemInstruction: string;
  prompt: string;
  model?: string;
  customKey?: string;
}): Promise<{ text: string; modelUsed: string }> {
  const activeKey = (customKey || openRouterKeyEnv || '').trim();
  if (!activeKey) {
    throw new Error(
      'OpenRouter API key is required. Please set OPENROUTER_API_KEY in the environment or provide it in provider settings.'
    );
  }

  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${activeKey}`,
      'HTTP-Referer': appUrl,
      'X-Title': 'Remix CPU Scheduler Comparator',
    },
    body: JSON.stringify({
      model: model || 'meta-llama/llama-3.3-70b-instruct:free',
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt },
      ],
      temperature: 0.2,
      max_tokens: 1500,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => '');
    let detail = errorBody;
    try {
      const parsed = JSON.parse(errorBody);
      detail = parsed?.error?.message || errorBody;
    } catch {
      // Keep detail as string
    }
    throw new Error(`OpenRouter Error (${response.status}): ${detail}`);
  }

  const data = await response.json();
  const choice = data.choices?.[0]?.message?.content;
  if (!choice) {
    throw new Error('OpenRouter returned an empty output response.');
  }

  return { text: choice, modelUsed: data.model || model };
}

// Quick Test Endpoint to test provider connectivity
app.post('/api/test-provider', async (req, res) => {
  const { provider = 'gemini', model, openRouterApiKey } = req.body;
  const testPrompt = 'A fast mouse click handler taking 2ms, and 1 background data sync taking 8ms.';
  const systemInstruction = 'Return ONLY a JSON array with name, burst, priority, arrival, type for the processes described.';

  const startTime = Date.now();
  try {
    if (provider === 'openrouter') {
      const { text, modelUsed } = await callOpenRouterCompletion({
        systemInstruction,
        prompt: testPrompt,
        model: model || 'meta-llama/llama-3.3-70b-instruct:free',
        customKey: openRouterApiKey,
      });
      const parsed = parseJsonArrayFromText(text);
      return res.json({
        success: true,
        provider: 'openrouter',
        model: modelUsed,
        latencyMs: Date.now() - startTime,
        parsedCount: parsed.length,
        sampleOutput: parsed,
      });
    }

    if (provider === 'gemini') {
      if (!ai) {
        return res.json({
          success: false,
          provider: 'gemini',
          error: 'GEMINI_API_KEY is not configured on the server. Falling back to heuristic synthesizer.',
          fallbackWorking: true,
        });
      }
      let response;
      const targetModel = model && model !== 'gemini-2.0-flash' ? model : 'gemini-3.8-flash';
      try {
        response = await ai.models.generateContent({
          model: targetModel,
          contents: testPrompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
          },
        });
      } catch (firstErr: any) {
        response = await ai.models.generateContent({
          model: 'gemini-flash-latest',
          contents: testPrompt,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
          },
        });
      }
      const parsed = parseJsonArrayFromText(response.text || '[]');
      return res.json({
        success: true,
        provider: 'gemini',
        model: targetModel,
        latencyMs: Date.now() - startTime,
        parsedCount: parsed.length,
        sampleOutput: parsed,
      });
    }

    // Heuristic test
    const parsed = generateHeuristicNLPProcesses(testPrompt, []);
    return res.json({
      success: true,
      provider: 'heuristic',
      model: 'deterministic-regex-classifier',
      latencyMs: Date.now() - startTime,
      parsedCount: parsed.length,
      sampleOutput: parsed,
    });
  } catch (err: any) {
    return res.status(400).json({
      success: false,
      provider,
      error: err?.message || 'Provider diagnostic test failed',
      latencyMs: Date.now() - startTime,
    });
  }
});

// ==========================================
// SYSTEM 1: NLP Process Workload Parser
// ==========================================
app.post('/api/parse-workload', async (req, res) => {
  const {
    prompt,
    existingProcesses,
    provider = 'gemini',
    model,
    openRouterApiKey,
  } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  const existingList: Array<{ name: string; burst: number; priority: number; arrival: number; type: string }> =
    Array.isArray(existingProcesses) ? existingProcesses : [];

  const isContinuation = existingList.length > 0;

  const systemInstruction = `You are an expert Operating Systems Kernel Architect and CPU Workload Synthesizer.
Given a natural language description of tasks/processes, analyze and translate them into a concrete CPU scheduling workload benchmark.
Extract:
- Number of processes (between 2 and 12)
- For each process:
  - "name": Short, descriptive process name (e.g. "Video Encoder", "Mouse Handler", "Database Sync", "Audio Pipeline")
  - "burst": Estimated CPU burst time as an integer between 1 and 20. Short/interactive tasks should be 1-4, medium 5-9, heavy CPU batch 10-20.
  - "priority": Integer priority where 1 = highest urgency, 5 = lowest background urgency.
  - "arrival": Arrival time offset integer (0, 1, 2, ...).
  - "type": EXACTLY one of: "interactive", "cpu-bound", "io-bound", "batch", "realtime".

You must return ONLY a valid JSON array matching this format, with no markdown code fences, no commentary:
[
  { "name": "Video Encoder", "burst": 12, "priority": 4, "arrival": 0, "type": "cpu-bound" },
  { "name": "Mouse Handler", "burst": 2, "priority": 1, "arrival": 1, "type": "interactive" }
]`;

  const contents = isContinuation
    ? `Full workload description: "${prompt}"\n\nALREADY EXTRACTED PROCESSES (${existingList.length}):\n${JSON.stringify(
        existingList,
        null,
        2
      )}\n\nIMPORTANT: The previous extraction was partial or interrupted. Resume from where you left off. Extract ONLY the REMAINING processes from the workload description that are NOT yet in the list above. Do NOT duplicate existing tasks. Return the JSON array of remaining processes.`
    : `Description: "${prompt}"\n\nGenerate the JSON array of processes now.`;

  // 1) OpenRouter Provider
  if (provider === 'openrouter') {
    try {
      const { text, modelUsed } = await callOpenRouterCompletion({
        systemInstruction,
        prompt: contents,
        model: model || 'meta-llama/llama-3.3-70b-instruct:free',
        customKey: openRouterApiKey,
      });

      const parsed = parseJsonArrayFromText(text);
      if (!Array.isArray(parsed)) {
        throw new Error('OpenRouter did not return a valid process array');
      }

      const sanitized = parsed.map((p, idx) => ({
        name: String(p.name || `Task ${existingList.length + idx + 1}`),
        burst: Math.max(1, Math.min(20, Math.round(Number(p.burst) || 4))),
        priority: Math.max(1, Math.min(5, Math.round(Number(p.priority) || 3))),
        arrival: Math.max(0, Math.round(Number(p.arrival) || 0)),
        type: ['interactive', 'cpu-bound', 'io-bound', 'batch', 'realtime'].includes(p.type)
          ? p.type
          : 'cpu-bound',
      }));

      const existingNames = new Set(existingList.map((p) => p.name.toLowerCase()));
      const newFiltered = sanitized.filter((p) => !existingNames.has(p.name.toLowerCase()));
      const combined = [...existingList, ...newFiltered];

      return res.json({
        processes: combined.length > 0 ? combined : sanitized,
        newAddedCount: newFiltered.length,
        source: 'openrouter',
        model: modelUsed,
        continued: isContinuation,
      });
    } catch (err: any) {
      console.error('OpenRouter parse error:', err);
      // Fallback gracefully so user experience is not blocked
      const fallback = generateHeuristicNLPProcesses(prompt, existingList);
      const combined = [...existingList, ...fallback];
      return res.json({
        processes: combined.length > 0 ? combined : fallback,
        source: 'fallback',
        error: `OpenRouter error: ${err?.message}. Switched to fallback synthesizer.`,
        continued: isContinuation,
      });
    }
  }

  // 2) Deterministic Heuristic Provider
  if (provider === 'heuristic') {
    const parsedFallback = generateHeuristicNLPProcesses(prompt, existingList);
    const combined = [...existingList, ...parsedFallback];
    return res.json({
      processes: combined,
      source: 'heuristic',
      continued: isContinuation,
      newAddedCount: parsedFallback.length,
    });
  }

  // 3) Built-in Gemini Provider
  try {
    if (!ai) {
      // Deterministic NLP fallback when no API key is provided
      const parsedFallback = generateHeuristicNLPProcesses(prompt, existingList);
      const combined = [...existingList, ...parsedFallback];
      return res.json({ processes: combined, source: 'heuristic', continued: isContinuation });
    }

    let response;
    const targetModel = model && model !== 'gemini-2.0-flash' ? model : 'gemini-3.8-flash';
    try {
      response = await ai.models.generateContent({
        model: targetModel,
        contents,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
        },
      });
    } catch (firstErr: any) {
      try {
        response = await ai.models.generateContent({
          model: 'gemini-flash-latest',
          contents,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
          },
        });
      } catch (secondErr: any) {
        response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
          },
        });
      }
    }

    const text = response.text || '';
    const parsed = parseJsonArrayFromText(text);

    if (!Array.isArray(parsed)) {
      throw new Error('AI did not return a valid process array');
    }

    const sanitized = parsed.map((p, idx) => ({
      name: String(p.name || `Task ${existingList.length + idx + 1}`),
      burst: Math.max(1, Math.min(20, Math.round(Number(p.burst) || 4))),
      priority: Math.max(1, Math.min(5, Math.round(Number(p.priority) || 3))),
      arrival: Math.max(0, Math.round(Number(p.arrival) || 0)),
      type: ['interactive', 'cpu-bound', 'io-bound', 'batch', 'realtime'].includes(p.type)
        ? p.type
        : 'cpu-bound',
    }));

    // Merge without duplicates by name
    const existingNames = new Set(existingList.map((p) => p.name.toLowerCase()));
    const newFiltered = sanitized.filter((p) => !existingNames.has(p.name.toLowerCase()));
    const combined = [...existingList, ...newFiltered];

    return res.json({
      processes: combined.length > 0 ? combined : sanitized,
      newAddedCount: newFiltered.length,
      source: 'gemini',
      continued: isContinuation,
    });
  } catch (err: any) {
    console.warn('Gemini NLP parsing notice (activating fallback):', err?.message || err);
    // Provide intelligent deterministic fallback if API limits/fails
    const fallback = generateHeuristicNLPProcesses(prompt, existingList);
    const combined = [...existingList, ...fallback];
    return res.json({ processes: combined.length > 0 ? combined : fallback, source: 'fallback', note: err?.message, continued: isContinuation });
  }
});

// Heuristic fallback parser
function generateHeuristicNLPProcesses(
  text: string,
  existingList: Array<{ name: string; burst: number; priority: number; arrival: number; type: string }> = []
) {
  const lower = text.toLowerCase();
  const procs: Array<{ name: string; burst: number; priority: number; arrival: number; type: string }> = [];
  const addedCategories = new Set<string>();

  existingList.forEach((p) => {
    if (p.type === 'cpu-bound') addedCategories.add('cpu');
    if (p.type === 'interactive') addedCategories.add('ui');
    if (p.type === 'realtime') addedCategories.add('rt');
    if (p.type === 'io-bound') addedCategories.add('io');
    if (p.type === 'batch') addedCategories.add('batch');
  });

  // Check for multi-task counts, e.g. "3 background sync tasks"
  const multiMatch = lower.match(/(\d+)\s+(?:background|sync|batch|worker)/);
  const requestedMulti = multiMatch ? Math.min(5, Math.max(2, parseInt(multiMatch[1], 10))) : 0;

  if (
    (lower.includes('video') || lower.includes('render') || lower.includes('encoder') || lower.includes('heavy') || lower.includes('compute')) &&
    !addedCategories.has('cpu')
  ) {
    addedCategories.add('cpu');
    procs.push({ name: 'Video Encoder', burst: 12, priority: 4, arrival: 0, type: 'cpu-bound' });
  }

  if (
    (lower.includes('mouse') || lower.includes('click') || lower.includes('ui') || lower.includes('input') || lower.includes('instant') || lower.includes('interactive')) &&
    !addedCategories.has('ui')
  ) {
    addedCategories.add('ui');
    procs.push({ name: 'Mouse Handler', burst: 2, priority: 1, arrival: 1, type: 'interactive' });
  }

  if (
    (lower.includes('audio') || lower.includes('realtime') || lower.includes('sensor') || lower.includes('stream')) &&
    !addedCategories.has('rt')
  ) {
    addedCategories.add('rt');
    procs.push({ name: 'Audio Pipeline', burst: 3, priority: 1, arrival: 0, type: 'realtime' });
  }

  if (
    (lower.includes('db') || lower.includes('database') || lower.includes('disk') || lower.includes('file') || lower.includes('io')) &&
    !addedCategories.has('io')
  ) {
    addedCategories.add('io');
    procs.push({ name: 'Database Sync', burst: 6, priority: 3, arrival: 2, type: 'io-bound' });
  }

  if (
    (lower.includes('sync') || lower.includes('backup') || lower.includes('background') || lower.includes('batch')) &&
    !addedCategories.has('batch')
  ) {
    addedCategories.add('batch');
    if (requestedMulti > 1) {
      for (let k = 1; k <= requestedMulti; k++) {
        procs.push({ name: `Background Sync #${k}`, burst: 6 + k * 2, priority: 5, arrival: 2 + k, type: 'batch' });
      }
    } else {
      procs.push({ name: 'Background Sync', burst: 8, priority: 5, arrival: 3, type: 'batch' });
    }
  }

  if (procs.length === 0) {
    procs.push(
      { name: 'User Interaction', burst: 2, priority: 1, arrival: 0, type: 'interactive' },
      { name: 'Core Compute Worker', burst: 12, priority: 3, arrival: 1, type: 'cpu-bound' },
      { name: 'Database Indexer', burst: 5, priority: 2, arrival: 2, type: 'io-bound' },
      { name: 'Batch Journal Archiver', burst: 9, priority: 5, arrival: 3, type: 'batch' }
    );
  }

  return procs;
}

// ==========================================
// RAG KNOWLEDGE BASE: Operating Systems & Scheduling Dynamics
// ==========================================
interface RAGKnowledgeChunk {
  id: string;
  title: string;
  domain: 'scheduling' | 'starvation' | 'quantum' | 'anomaly' | 'kernel';
  tags: string[];
  principle: string;
  formula?: string;
  kernelImplementation: string;
  remediation: string;
}

const OS_RAG_KNOWLEDGE_BASE: RAGKnowledgeChunk[] = [
  {
    id: 'kleinrock_conservation',
    title: "Kleinrock's Conservation Law & Queue Invariants",
    domain: 'scheduling',
    tags: ['kleinrock', 'conservation law', 'waiting time', 'tradeoff', 'variance', 'optimality'],
    principle:
      'For any work-conserving single-core CPU scheduler under non-preemptive or preemption-independent conditions, the sum of weighted waiting times is invariant: sum(rho_i * W_i) = C. Lowering the average wait time for short tasks (as in SJF/SRTF) mathematically increases the variance of waiting times and prolongs queue latency for long tasks.',
    formula: 'sum_{i=1}^n rho_i * W_i = (lambda * E[S^2]) / (2 * (1 - rho)) = Constant',
    kernelImplementation:
      'Modern general-purpose kernels recognize that absolute minimum average wait time produces unacceptable tail latencies for batch jobs; Linux CFS balances this by assigning target minimum latency rather than pure burst-duration priority.',
    remediation:
      'To prevent long jobs from suffering unbounded wait time variance, implement aging bonuses (+1 priority or reduced vruntime credit) proportional to ready-queue waiting duration.',
  },
  {
    id: 'convoy_effect',
    title: 'Convoy Effect in First-Come, First-Served (FCFS)',
    domain: 'anomaly',
    tags: ['convoy', 'fcfs', 'io-bound', 'cpu-bound', 'blocking', 'head-of-line', 'bottleneck'],
    principle:
      'When a long CPU-burst process monopolizes the processor, subsequent short interactive or I/O-bound tasks pile up behind it in the ready queue. While the long task executes, I/O devices sit idle. Once the long task completes and moves to I/O, all short tasks execute rapidly and queue for I/O simultaneously, leaving the CPU idle. This results in poor resource utilization and massive wait-time spikes.',
    formula: 'Penalty_ratio = W_i / Burst_i; Convoy detected when max(Burst) >= 2.5 * min(Burst) and AT_long <= AT_short',
    kernelImplementation:
      'Operating systems eliminate convoy blocking via preemptive scheduling (e.g. Round Robin time slicing or SRTF preemption) that forcibly interrupts compute hogs to allow interactive threads to rapidly cycle through.',
    remediation:
      'Switch from non-preemptive FCFS to SRTF or Round Robin with quantum tuned to 80% of short-burst durations, preventing head-of-line blocking.',
  },
  {
    id: 'srtf_optimality',
    title: 'Shortest Remaining Time First (SRTF) Provable Optimality',
    domain: 'scheduling',
    tags: ['srtf', 'sjf', 'optimal', 'waiting time', 'turnaround', 'preemption', 'context switch'],
    principle:
      'By Smith (1956) and Schrage (1968), Shortest Remaining Time First (SRTF) is provably optimal for minimizing average waiting time and average turnaround time among all work-conserving preemptive single-processor schedulers. Whenever a new task arrives whose remaining burst is strictly less than the currently running task, preemption immediately minimizes ready-queue backlog.',
    formula: 'Min sum_{i=1}^n W_i <=> Schedule task j with argmin(RemainingBurst_j) at every decision boundary',
    kernelImplementation:
      'Pure SRTF requires exact advance knowledge of future CPU bursts (often approximated via exponential smoothing: tau_{n+1} = alpha * t_n + (1 - alpha) * tau_n). Real-time OS and databases use SRTF heuristics for transaction processing.',
    remediation:
      'Account for context switch overhead: if preemption penalty C_switch >= (Remaining_current - Remaining_new), suppress preemption to avoid cache thrashing.',
  },
  {
    id: 'rr_quantum_tuning',
    title: 'Round Robin Quantum Selection & Context Switch Thrashing',
    domain: 'quantum',
    tags: ['round robin', 'quantum', 'time slice', 'thrashing', 'sweet spot', 'context switch', 'overhead'],
    principle:
      'The choice of Round Robin time quantum q defines the balance between interactive responsiveness and context switch overhead. As q -> 0, RR approaches theoretical Processor Sharing (PS) with extreme context switch thrashing and cache invalidation. As q -> infinity, RR degrades into FCFS with convoy vulnerability. Standard textbook guideline (Silberschatz/Tanenbaum): 80% of CPU bursts should be shorter than the time quantum q.',
    formula: 'Optimal q approx Percentile_80(Burst_times); Harmonic_score = 0.6 * norm(WT) + 0.4 * norm(CtxSwitches)',
    kernelImplementation:
      'Linux CFS dynamically computes per-task time slices: time_slice = sched_latency * (weight_i / sum_weights), with minimum slice sysctl_sched_min_granularity (typically 0.75ms - 3ms) to bound context-switch costs.',
    remediation:
      'Set quantum to the 80th percentile of task bursts (typically 3-6ms) or the harmonic inflection point where wait-time curve levels off before context switches escalate.',
  },
  {
    id: 'starvation_and_aging',
    title: 'Priority Starvation & Dynamic Aging Mitigation',
    domain: 'starvation',
    tags: ['starvation', 'priority', 'aging', 'lockout', 'fairness', 'mlfq', 'indefinite postponement'],
    principle:
      'Strict priority scheduling and SJF/SRTF inherently suffer from starvation (indefinite postponement): low-priority or long-burst processes remain suspended in the ready queue indefinitely if higher-priority or shorter tasks continue arriving. Aging is the universal mitigation: the dispatcher progressively increments a waiting process’s priority as time passes in the ready queue.',
    formula: 'Effective_Priority(t) = Base_Priority + alpha * (Current_Time - Arrival_Time - CPU_Executed_Time)',
    kernelImplementation:
      'Windows Kernel dynamically boosts thread priority for GUI foreground focus and I/O completion, then decays it after one quantum. Solaris and FreeBSD implement Multi-Level Feedback Queues (MLFQ) that demote CPU hogs and promote waiting interactive threads.',
    remediation:
      'Implement dynamic aging with +1 priority advancement every 4 to 8 time units spent waiting in ready queue, guaranteeing an upper bound on latency.',
  },
  {
    id: 'priority_inversion',
    title: 'Priority Inversion & Priority Inheritance Protocols',
    domain: 'starvation',
    tags: ['priority inversion', 'mutex', 'lock', 'mars pathfinder', 'priority inheritance', 'ceiling'],
    principle:
      'Priority inversion occurs when a low-priority process holds a mutual-exclusion resource required by a high-priority process, while an intermediate-priority process prevents the low-priority process from executing and releasing the lock. High-priority thread is indirectly starved by medium-priority thread (famous Mars Pathfinder 1997 anomaly).',
    formula: 'T_wait(High) = T_exec(Low) + sum(T_exec(Medium_intervening)) >> expected T_wait',
    kernelImplementation:
      'POSIX mutexes implement PTHREAD_PRIO_INHERIT (Priority Inheritance Protocol), temporarily boosting the lock-holding low-priority thread to the priority of the highest blocked thread until lock release.',
    remediation:
      'Employ Priority Inheritance or Priority Ceiling protocols whenever preemption interacts with shared locks or multi-process dependencies.',
  },
  {
    id: 'linux_cfs',
    title: 'Linux Completely Fair Scheduler (CFS) Mechanics',
    domain: 'kernel',
    tags: ['linux', 'cfs', 'vruntime', 'red-black tree', 'nice', 'fairness', 'completely fair'],
    principle:
      'Linux CFS replaces discrete runqueues and priority ticks with an ideal multi-tasking CPU model. Each runnable process tracks virtual runtime (vruntime), representing CPU execution normalized by task nice level (nice -20 to +19, weights 1.25^nice). CFS always dispatches the task with the smallest vruntime, indexed via a self-balancing Red-Black Tree (O(1) pick-next, O(log N) insert).',
    formula: 'vruntime += delta_exec * (NICE_0_LOAD / task_weight); Delta_vruntime_interactive < Delta_vruntime_batch',
    kernelImplementation:
      'Tasks that sleep on I/O or wait in the ready queue fall behind in vruntime, so upon waking they naturally execute ahead of compute-bound tasks without requiring ad-hoc heuristic priority boosts.',
    remediation:
      'Model workloads under CFS by assigning nice -5 to interactive/IO threads and nice +10 to batch workers, guaranteeing proportional CPU bandwidth without convoy locks.',
  },
  {
    id: 'realtime_posix',
    title: 'Real-Time Dispatching (SCHED_FIFO vs SCHED_RR vs EDF)',
    domain: 'kernel',
    tags: ['realtime', 'sched_fifo', 'sched_rr', 'deadline', 'edf', 'hard realtime', 'freertos'],
    principle:
      'Real-time operating systems require deterministic response guarantees over throughput. Under POSIX SCHED_FIFO, the highest-priority runnable thread runs until it yields or blocks; under SCHED_RR, equal-priority threads share CPU via a round-robin time slice. Earliest Deadline First (EDF) dynamically dispatches the task closest to its deadline and is provably optimal up to 100% CPU utilization.',
    formula: 'Liu & Layland Bound for Rate Monotonic: sum(Burst_i / Period_i) <= n * (2^(1/n) - 1) approx 69.3%',
    kernelImplementation:
      'Linux implements SCHED_DEADLINE using EDF and Constant Bandwidth Server (CBS), preventing real-time tasks from monopolizing the core.',
    remediation:
      'Isolate realtime tasks with strict arrival periods; bound burst times and ensure total CPU utilization <= 0.69 to prevent deadline misses.',
  },
];

function retrieveRAGKnowledge(query: string, domain?: string, limit = 3): RAGKnowledgeChunk[] {
  const normalizedQuery = (query || '').toLowerCase();
  const queryTokens = normalizedQuery
    .split(/[\s,._\-:?!/]+/)
    .filter((t) => t.length > 2);

  const scored = OS_RAG_KNOWLEDGE_BASE.map((chunk) => {
    let score = 0;
    if (domain && chunk.domain === domain) score += 15;

    // Check tags
    chunk.tags.forEach((tag) => {
      if (normalizedQuery.includes(tag.toLowerCase())) score += 8;
      queryTokens.forEach((tok) => {
        if (tag.toLowerCase().includes(tok)) score += 4;
      });
    });

    // Check title
    queryTokens.forEach((tok) => {
      if (chunk.title.toLowerCase().includes(tok)) score += 6;
      if (chunk.principle.toLowerCase().includes(tok)) score += 2;
    });

    // Semantic keywords
    if (normalizedQuery.includes('convoy') && chunk.id === 'convoy_effect') score += 20;
    if ((normalizedQuery.includes('quantum') || normalizedQuery.includes('slice')) && chunk.id === 'rr_quantum_tuning') score += 20;
    if (normalizedQuery.includes('starv') && chunk.id === 'starvation_and_aging') score += 20;
    if ((normalizedQuery.includes('srtf') || normalizedQuery.includes('sjf')) && chunk.id === 'srtf_optimality') score += 15;
    if ((normalizedQuery.includes('cfs') || normalizedQuery.includes('linux')) && chunk.id === 'linux_cfs') score += 20;
    if (normalizedQuery.includes('priority inversion') && chunk.id === 'priority_inversion') score += 20;
    if ((normalizedQuery.includes('tradeoff') || normalizedQuery.includes('law')) && chunk.id === 'kleinrock_conservation') score += 15;

    return { chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);
  const selected = scored.slice(0, limit).map((s) => s.chunk);

  // If score is zero across all, return primary default chunks
  if (selected.length === 0 || scored[0].score === 0) {
    return [OS_RAG_KNOWLEDGE_BASE[2], OS_RAG_KNOWLEDGE_BASE[3], OS_RAG_KNOWLEDGE_BASE[4]];
  }

  return selected;
}

// ==========================================
// RAG ENDPOINT 1: Authoritative Knowledge Topics Directory
// ==========================================
app.get('/api/rag/knowledge-topics', (_req, res) => {
  res.json({
    topics: OS_RAG_KNOWLEDGE_BASE.map((k) => ({
      id: k.id,
      title: k.title,
      domain: k.domain,
      tags: k.tags,
      summary: k.principle.substring(0, 120) + '...',
      formula: k.formula,
    })),
  });
});

// ==========================================
// RAG ENDPOINT 2: Comprehensive Multi-Source RAG Query Engine
// ==========================================
app.post('/api/rag/query', async (req, res) => {
  const {
    question = 'Why did the winning algorithm perform best on this workload?',
    domain,
    processes = [],
    results = null,
    quantum = 2,
    fingerprint = null,
    anomalies = [],
    provider = 'gemini',
    model,
    openRouterApiKey,
  } = req.body;

  // Retrieve relevant OS domain knowledge chunks
  const retrievedChunks = retrieveRAGKnowledge(question, domain, 3);
  const citationList = retrievedChunks.map((c) => ({
    id: c.id,
    title: c.title,
    snippet: c.principle,
    formula: c.formula,
    kernelImplementation: c.kernelImplementation,
    remediation: c.remediation,
  }));

  // Determine top winning algorithm from live telemetry
  let winner = 'srtf';
  let bestWT = 0;
  let runnerUp = 'sjf';
  let runnerUpWT = 0;

  if (results && typeof results === 'object') {
    const keys = Object.keys(results).filter((k) => results[k]?.avgWT !== undefined);
    if (keys.length > 0) {
      keys.sort((a, b) => results[a].avgWT - results[b].avgWT);
      winner = keys[0];
      bestWT = results[winner].avgWT;
      if (keys.length > 1) {
        runnerUp = keys[1];
        runnerUpWT = results[runnerUp].avgWT;
      }
    }
  }

  const telemetryHighlights = {
    winner: winner.toUpperCase(),
    bestWT: +bestWT.toFixed(2),
    runnerUp: runnerUp.toUpperCase(),
    runnerUpWT: +runnerUpWT.toFixed(2),
    quantum,
    taskCount: Array.isArray(processes) ? processes.length : 0,
  };

  // Build the complete RAG augmented prompt
  const ragContext = `
==============================================
RETRIEVED OPERATING SYSTEMS KNOWLEDGE BASE:
==============================================
${retrievedChunks
  .map(
    (c, i) => `[Source ${i + 1}: ${c.title}]
Principle: ${c.principle}
${c.formula ? `Theoretical Formula: ${c.formula}` : ''}
Kernel Implementation: ${c.kernelImplementation}
Standard Remediation: ${c.remediation}`
  )
  .join('\n\n')}

==============================================
LIVE SIMULATION TELEMETRY & WORKLOAD METRICS:
==============================================
- Process Task Count: ${processes.length} tasks
- Round Robin Quantum: ${quantum} units
- Workload Specification: ${JSON.stringify(processes)}
${
  results
    ? `- Simulation Algorithms:
  * FCFS: avgWT=${results.fcfs?.avgWT}ms, avgTAT=${results.fcfs?.avgTAT}ms, switches=${results.fcfs?.ctxSwitches}, cpuUtil=${results.fcfs?.cpuUtil}
  * SJF: avgWT=${results.sjf?.avgWT}ms, avgTAT=${results.sjf?.avgTAT}ms, switches=${results.sjf?.ctxSwitches}, cpuUtil=${results.sjf?.cpuUtil}
  * SRTF: avgWT=${results.srtf?.avgWT}ms, avgTAT=${results.srtf?.avgTAT}ms, switches=${results.srtf?.ctxSwitches}, cpuUtil=${results.srtf?.cpuUtil}
  * Round Robin: avgWT=${results.rr?.avgWT}ms, avgTAT=${results.rr?.avgTAT}ms, switches=${results.rr?.ctxSwitches}, cpuUtil=${results.rr?.cpuUtil}
  * Priority (NP): avgWT=${results.priority?.avgWT}ms, avgTAT=${results.priority?.avgTAT}ms, switches=${results.priority?.ctxSwitches}, cpuUtil=${results.priority?.cpuUtil}
  * Preemptive Priority: avgWT=${results.pprior?.avgWT}ms, avgTAT=${results.pprior?.avgTAT}ms, switches=${results.pprior?.ctxSwitches}, cpuUtil=${results.pprior?.cpuUtil}
- Best Algorithm by avgWT: ${winner.toUpperCase()} (${bestWT.toFixed(2)}ms)
- Runner-up: ${runnerUp.toUpperCase()} (${runnerUpWT.toFixed(2)}ms)`
    : '- (No prior simulation results provided)'
}
${fingerprint ? `- Workload Fingerprint: Burst CV=${fingerprint.burstCV}, Arrival Density=${fingerprint.arrivalDensity}, Starvation Risk Score=${fingerprint.starvationRiskScore}` : ''}
${anomalies && anomalies.length > 0 ? `- Detected Execution Anomalies: ${anomalies.map((a: any) => `${a.type} (${a.severity})`).join(', ')}` : '- Detected Execution Anomalies: None'}

==============================================
USER / INSPECTOR QUESTION:
==============================================
"${question}"
`;

  const systemInstruction = `You are a Principal Operating Systems Research Architect and CPU Scheduling Guru.
Answer the user's question with technical precision, directly grounding your answer in the RETRIEVED OS KNOWLEDGE BASE and citing the actual numbers from the LIVE SIMULATION TELEMETRY.
Structure your answer into 3 crisp sections:
1. Direct Technical Answer: Clearly answer the question with numbers and algorithm comparisons.
2. Kernel Principle & Grounding: Explain the underlying OS mechanism (e.g. convoy effect, Kleinrock trade-off, CFS vruntime, preemption boundary). Explicitly cite the retrieved principle.
3. Actionable Recommendation: What specific kernel configuration (e.g. quantum adjustment, dynamic aging, MLFQ) resolves this issue.
Keep the total answer between 120 and 220 words. No boilerplate pleasantries.`;

  // 1. Try OpenRouter if selected
  if (provider === 'openrouter') {
    try {
      const { text } = await callOpenRouterCompletion({
        systemInstruction,
        prompt: ragContext,
        model: model || 'meta-llama/llama-3.3-70b-instruct:free',
        customKey: openRouterApiKey,
      });
      return res.json({
        answer: text,
        citations: citationList,
        telemetryHighlights,
        source: 'openrouter',
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      console.warn('OpenRouter RAG query warning, invoking deterministic RAG fallback:', err?.message);
    }
  }

  // 2. Try Gemini if available
  if (provider === 'gemini' && ai) {
    const targetModel = model && model !== 'gemini-2.0-flash' ? model : 'gemini-3.8-flash';
    try {
      let response;
      try {
        response = await ai.models.generateContent({
          model: targetModel,
          contents: ragContext,
          config: { systemInstruction },
        });
      } catch (firstErr: any) {
        try {
          response = await ai.models.generateContent({
            model: 'gemini-flash-latest',
            contents: ragContext,
            config: { systemInstruction },
          });
        } catch (secondErr: any) {
          response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite',
            contents: ragContext,
            config: { systemInstruction },
          });
        }
      }

      const text = response.text || '';
      if (text.trim()) {
        return res.json({
          answer: text,
          citations: citationList,
          telemetryHighlights,
          source: 'gemini',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (err: any) {
      console.warn('Gemini RAG query notice, activating deterministic RAG engine:', err?.message || err);
    }
  }

  // 3. High-Fidelity Deterministic OS RAG Synthesizer
  const synthesizedAnswer = generateDeterministicRAGAnswer(
    question,
    retrievedChunks,
    processes,
    results,
    quantum,
    winner,
    bestWT,
    runnerUp,
    runnerUpWT
  );

  return res.json({
    answer: synthesizedAnswer,
    citations: citationList,
    telemetryHighlights,
    source: 'rag-deterministic',
    timestamp: new Date().toISOString(),
  });
});

function generateDeterministicRAGAnswer(
  question: string,
  chunks: RAGKnowledgeChunk[],
  processes: any[],
  results: any,
  quantum: number,
  winner: string,
  bestWT: number,
  runnerUp: string,
  runnerUpWT: number
): string {
  const qLower = question.toLowerCase();
  const topChunk = chunks[0] || OS_RAG_KNOWLEDGE_BASE[0];
  const n = processes?.length || 8;

  if (qLower.includes('quantum') || qLower.includes('round robin') || qLower.includes('slice')) {
    const p80 = Math.max(
      2,
      processes?.length
        ? [...processes.map((p: any) => p.burst)].sort((a, b) => a - b)[
            Math.min(processes.length - 1, Math.floor(processes.length * 0.8))
          ]
        : 4
    );
    return `1. Direct Technical Answer:
Under current workload (n=${n} tasks, q=${quantum}), Round Robin achieves an average waiting time of ${
      results?.rr?.avgWT !== undefined ? results.rr.avgWT.toFixed(2) : 'N/A'
    }ms with ${results?.rr?.ctxSwitches || 0} context switches. The textbook sweet spot for this workload is q=${p80}ms, where 80% of CPU bursts finish without preemption.

2. Kernel Principle & Grounding:
Per [${topChunk.title}], setting quantum too low triggers context switch thrashing and cache invalidation. Setting quantum too high degenerates Round Robin into FCFS, exposing interactive tasks to convoy delays behind long compute bursts.

3. Actionable Recommendation:
Align the dispatcher quantum to ${p80}ms. In Linux CFS, this is governed by sysctl_sched_min_granularity, guaranteeing that interactive threads cycle smoothly without degrading into unconstrained context switching.`;
  }

  if (qLower.includes('starv') || qLower.includes('aging') || qLower.includes('lockout')) {
    return `1. Direct Technical Answer:
In this ${n}-task workload, algorithms that prioritize short bursts or high numerical priorities (SRTF and Priority) defer long batch tasks, causing elevated wait times for tasks with higher burst requirements.

2. Kernel Principle & Grounding:
According to [${topChunk.title}], work-conserving schedulers that strictly favor short jobs violate fair queue distribution. Long jobs suffer from unbounded tail latencies and potential starvation when shorter tasks continue to arrive in the ready queue.

3. Actionable Recommendation:
Deploy dynamic aging: grant waiting processes a priority bonus (e.g., +1 priority level per 4ms of ready-queue wait time). In production kernels like BSD and Windows, this Multi-Level Feedback Queue (MLFQ) behavior elevates aging jobs to prevent indefinite postponement.`;
  }

  if (qLower.includes('convoy') || qLower.includes('fcfs')) {
    const fcfsWT = results?.fcfs?.avgWT !== undefined ? results.fcfs.avgWT.toFixed(2) : 'high';
    return `1. Direct Technical Answer:
FCFS produced an average waiting time of ${fcfsWT}ms, compared to ${bestWT.toFixed(
      2
    )}ms achieved by ${winner.toUpperCase()}. This represents a ${
      bestWT > 0 ? (((Number(fcfsWT) - bestWT) / bestWT) * 100).toFixed(0) : 'substantial'
    }% queue latency penalty attributable to head-of-line convoy blocking.

2. Kernel Principle & Grounding:
As detailed in [${topChunk.title}], when a compute-bound task holds the CPU without preemption, arriving short interactive tasks are forced to idle in the ready queue. System throughput degrades while I/O and ready threads starve.

3. Actionable Recommendation:
Enforce preemptive scheduling via ${winner.toUpperCase()} or Round Robin with an optimal quantum. This breaks long execution blocks into time slices, allowing shorter tasks to flush through the ready queue immediately.`;
  }

  // Default: Why winner won / General evaluation
  return `1. Direct Technical Answer:
${winner.toUpperCase()} is the optimal policy for this ${n}-task profile, delivering the lowest average waiting time of ${bestWT.toFixed(
    2
  )}ms and outperforming ${runnerUp.toUpperCase()} (${runnerUpWT.toFixed(2)}ms) by ${(
    ((runnerUpWT - bestWT) / (bestWT || 1)) *
    100
  ).toFixed(1)}%.

2. Kernel Principle & Grounding:
Per [${topChunk.title}], dynamic remaining-time ordering continuously clears short-burst tasks from the ready queue at the earliest feasible scheduling boundary, minimizing cumulative queue residency across all tasks.

3. Actionable Recommendation:
For general multitasking kernels, replicate this operational profile by tuning Linux CFS nice levels: assign interactive workloads lower nice values (higher priority) while allowing batch jobs to absorb CPU idle capacity with dynamic aging.`;
}

// ==========================================
// SYSTEM 4: Post-Simulation AI Explainer
// ==========================================
app.post('/api/generate-insights', async (req, res) => {
  const { context, provider = 'gemini', model, openRouterApiKey } = req.body;
  if (!context || typeof context !== 'string') {
    return res.status(400).json({ error: 'Context document string is required' });
  }

  // RAG enhancement: Retrieve key OS principles to ground the insights
  const relevantKnowledge = retrieveRAGKnowledge('best algorithm wait time tradeoff convoy starvation', 'scheduling', 2);
  const ragGrounding = `
AUTHORITATIVE KNOWLEDGE GROUNDING:
${relevantKnowledge.map((k) => `* ${k.title}: ${k.principle}`).join('\n')}
`;

  const systemInstruction = `You are an operating systems performance expert. Given the workload analysis data below and the authoritative knowledge grounding, provide: (1) a 2-sentence executive summary of this workload's behavior, (2) why the winning algorithm performed best for this specific workload — cite actual numbers, (3) one concrete scenario where the second-best algorithm would actually win instead, (4) the single most important optimization a developer could make to reduce average wait time further. Be concise — max 200 words total. Format as 4 clearly labeled paragraphs.`;

  const augmentedPrompt = `${ragGrounding}\n\nSIMULATION TELEMETRY CONTEXT:\n${context}`;

  if (provider === 'openrouter') {
    try {
      const { text } = await callOpenRouterCompletion({
        systemInstruction,
        prompt: augmentedPrompt,
        model: model || 'meta-llama/llama-3.3-70b-instruct:free',
        customKey: openRouterApiKey,
      });
      return res.json({ text, source: 'openrouter' });
    } catch (err: any) {
      console.warn('OpenRouter insights fallback:', err?.message);
      return res.json({ text: generateDeterministicRAGInsights(context), note: err?.message, source: 'fallback' });
    }
  }

  try {
    if (!ai) {
      return res.json({ text: generateDeterministicRAGInsights(context), source: 'deterministic' });
    }

    let response;
    const targetModel = model && model !== 'gemini-2.0-flash' ? model : 'gemini-3.8-flash';
    try {
      response = await ai.models.generateContent({
        model: targetModel,
        contents: augmentedPrompt,
        config: { systemInstruction },
      });
    } catch (firstErr) {
      try {
        response = await ai.models.generateContent({
          model: 'gemini-flash-latest',
          contents: augmentedPrompt,
          config: { systemInstruction },
        });
      } catch (secondErr) {
        response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: augmentedPrompt,
          config: { systemInstruction },
        });
      }
    }

    const text = response.text || '';
    if (!text.trim()) {
      return res.json({ text: generateDeterministicRAGInsights(context), source: 'deterministic' });
    }

    return res.json({ text, source: 'gemini' });
  } catch (err: any) {
    console.warn('Gemini Insights notice (activating resilient fallback):', err?.message || err);
    return res.json({ text: generateDeterministicRAGInsights(context), note: err?.message, source: 'fallback' });
  }
});

function generateDeterministicRAGInsights(context: string): string {
  const nMatch = context.match(/Process count:\s*(\d+)/i);
  const n = nMatch ? nMatch[1] : '8';

  const cvMatch = context.match(/Burst CV:\s*([\d.]+)/i);
  const burstCV = cvMatch ? cvMatch[1] : '0.85';

  const classMatch = context.match(/Workload class:\s*([^\n\r]+)/i);
  const workloadClass = classMatch ? classMatch[1].trim() : 'Mixed';

  const actualBestMatch = context.match(/ACTUAL BEST ALGORITHM \(by avgWT\):\s*([^\n\r]+)/i);
  const actualBest = actualBestMatch ? actualBestMatch[1].trim() : 'SRTF';

  const rankedLines = context.match(/\d+\.\s+([A-Za-z0-9\s()_-]+):\s+avgWT=([\d.]+)/g) || [];
  let bestName = actualBest;
  let bestWT = '3.50';
  let runnerUpName = 'SJF';
  let runnerUpWT = '4.20';

  if (rankedLines.length > 0) {
    const first = rankedLines[0].match(/\d+\.\s+([A-Za-z0-9\s()_-]+):\s+avgWT=([\d.]+)/);
    if (first) {
      bestName = first[1].trim();
      bestWT = first[2].trim();
    }
  }
  if (rankedLines.length > 1) {
    const second = rankedLines[1].match(/\d+\.\s+([A-Za-z0-9\s()_-]+):\s+avgWT=([\d.]+)/);
    if (second) {
      runnerUpName = second[1].trim();
      runnerUpWT = second[2].trim();
    }
  }

  return `1. Executive Summary:
This ${workloadClass} workload comprises ${n} tasks with a burst coefficient of variation of ${burstCV}. Execution analysis demonstrates clear queue latency bifurcation, where ready-queue residency is minimized under shortest-remaining policies while static first-come ordering incurs noticeable convoy penalties.

2. Winning Algorithm Justification:
${bestName} demonstrated the lowest queue delay with an average waiting time of ${bestWT}ms across all ${n} tasks. By dynamically prioritizing shorter burst execution windows, it mitigated convoy blocking and maintained superior ready-queue throughput compared to ${runnerUpName} (${runnerUpWT}ms).

3. Second-Best Advantage Scenario:
The runner-up algorithm, ${runnerUpName} (${runnerUpWT}ms avg wait), would surpass ${bestName} if process arrival times become synchronous at t=0 or if burst variance contracts toward uniform durations, which would completely eliminate preemption context-switch penalties.

4. Actionable Kernel Optimization:
To reduce average wait time below ${bestWT}ms, kernel dispatchers should implement adaptive multi-level feedback queueing (MLFQ) with dynamic aging (e.g., +1 priority bonus per 5 time units), preventing high-burst jobs from starvation while guaranteeing sub-millisecond response for interactive threads.`;
}

app.post('/api/explain-workload', async (req, res) => {
  const { processes, results, quantum, question, provider = 'gemini', model, openRouterApiKey } = req.body;

  if (!results) {
    return res.status(400).json({ error: 'Simulation results are required' });
  }

  // Retrieve relevant RAG principles
  const relevantRAG = retrieveRAGKnowledge(question || 'workload evaluation algorithm comparison', undefined, 2);

  const promptContext = `
RAG RETRIEVED OS KNOWLEDGE:
${relevantRAG.map((r) => `- ${r.title}: ${r.principle}`).join('\n')}

WORKLOAD SPECIFICATION:
${JSON.stringify(processes, null, 2)}

ROUND ROBIN QUANTUM: ${quantum}

SIMULATION RESULTS:
- FCFS: AvgWT: ${results.fcfs?.avgWT}ms, AvgTAT: ${results.fcfs?.avgTAT}ms, Context Switches: ${results.fcfs?.ctxSwitches}, CPU Util: ${results.fcfs?.cpuUtil}
- SJF: AvgWT: ${results.sjf?.avgWT}ms, AvgTAT: ${results.sjf?.avgTAT}ms, Context Switches: ${results.sjf?.ctxSwitches}, CPU Util: ${results.sjf?.cpuUtil}
- SRTF: AvgWT: ${results.srtf?.avgWT}ms, AvgTAT: ${results.srtf?.avgTAT}ms, Context Switches: ${results.srtf?.ctxSwitches}, CPU Util: ${results.srtf?.cpuUtil}
- Round Robin: AvgWT: ${results.rr?.avgWT}ms, AvgTAT: ${results.rr?.avgTAT}ms, Context Switches: ${results.rr?.ctxSwitches}, CPU Util: ${results.rr?.cpuUtil}
- Priority (Non-preemptive): AvgWT: ${results.priority?.avgWT}ms, AvgTAT: ${results.priority?.avgTAT}ms, Context Switches: ${results.priority?.ctxSwitches}, CPU Util: ${results.priority?.cpuUtil}
- Preemptive Priority: AvgWT: ${results.pprior?.avgWT}ms, AvgTAT: ${results.pprior?.avgTAT}ms, Context Switches: ${results.pprior?.ctxSwitches}, CPU Util: ${results.pprior?.cpuUtil}

${question ? `USER QUESTION: "${question}"` : 'TASK: Provide an executive engineering evaluation explaining why the top algorithm won, the quantitative trade-offs observed, and how modern OS kernels (e.g. Linux CFS, macOS Mach, FreeRTOS) would optimize this workload.'}
`;

  const systemInstruction = `You are a Principal Operating Systems Research Architect specializing in process dispatching, queueing theory, and CPU scheduling.
Analyze the provided deterministic simulation results with deep technical rigor, citing the retrieved OS knowledge.
Structure your response as a valid JSON object with the following fields:
{
  "executiveVerdict": "2-3 concise sentences stating the winning algorithm, its quantitative margin, and primary operational factor.",
  "keyDrivers": [
    "Key engineering factor 1 with numbers",
    "Key engineering factor 2 with numbers",
    "Key engineering factor 3 with numbers"
  ],
  "tradeoffAnalysis": "Concise paragraph explaining trade-offs like context switch overhead vs queue latency, starvation vulnerabilities, and quantum effects.",
  "kernelRecommendation": "Actionable advice on what real-world scheduling policy (Linux CFS / SCHED_FIFO / Windows dynamic boost) matches this profile."
}`;

  if (provider === 'openrouter') {
    try {
      const { text } = await callOpenRouterCompletion({
        systemInstruction,
        prompt: promptContext,
        model: model || 'meta-llama/llama-3.3-70b-instruct:free',
        customKey: openRouterApiKey,
      });
      let parsed;
      try {
        const cleaned = text.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
        parsed = JSON.parse(cleaned);
      } catch {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1 && end > start) {
          parsed = JSON.parse(text.substring(start, end + 1));
        } else {
          throw new Error('Unable to parse JSON object from OpenRouter');
        }
      }
      return res.json(parsed);
    } catch (err: any) {
      console.warn('OpenRouter explainer error, falling back:', err?.message);
    }
  }

  try {
    if (!ai) {
      const winner = Object.keys(results).reduce((best, curr) =>
        (results[curr]?.avgWT < results[best]?.avgWT ? curr : best)
      );
      return res.json({
        executiveVerdict: `${winner.toUpperCase()} demonstrated the lowest average waiting time (${results[winner]?.avgWT}ms) on this workload, outperforming alternatives by minimizing ready queue latency.`,
        keyDrivers: [
          `Optimal queueing order maintained average turnaround time at ${results[winner]?.avgTAT}ms.`,
          `Context switch overhead remained controlled at ${results[winner]?.ctxSwitches} kernel switches.`,
          `CPU utilization achieved ${results[winner]?.cpuUtil} across execution span.`,
        ],
        tradeoffAnalysis: `While preemption reduces latency for arriving short bursts, it incurs state-saving overhead. For this workload, ${winner.toUpperCase()} balanced scheduling fairness and switch frequency.`,
        kernelRecommendation: `For general desktop workloads, Linux Completely Fair Scheduler (CFS) with targeted nice levels replicates these results. For hard real-time requirements, SCHED_RR with a tuned time slice is advised.`,
      });
    }

    let response;
    const targetModel = model && model !== 'gemini-2.0-flash' ? model : 'gemini-3.8-flash';
    try {
      response = await ai.models.generateContent({
        model: targetModel,
        contents: promptContext,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
        },
      });
    } catch (firstErr: any) {
      try {
        response = await ai.models.generateContent({
          model: 'gemini-flash-latest',
          contents: promptContext,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
          },
        });
      } catch (secondErr: any) {
        response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: promptContext,
          config: {
            systemInstruction,
            responseMimeType: 'application/json',
          },
        });
      }
    }

    const text = response.text || '';
    const cleaned = text.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
    const parsed = JSON.parse(cleaned);

    return res.json(parsed);
  } catch (err: any) {
    console.warn('Gemini Explainer notice (activating resilient fallback):', err?.message || err);
    const winner = Object.keys(results).reduce((best, curr) =>
      (results[curr]?.avgWT < results[best]?.avgWT ? curr : best)
    );
    return res.json({
      executiveVerdict: `${winner.toUpperCase()} demonstrated the lowest average waiting time (${results[winner]?.avgWT}ms) on this workload, outperforming alternatives by minimizing ready queue latency.`,
      keyDrivers: [
        `Optimal queueing order maintained average turnaround time at ${results[winner]?.avgTAT}ms.`,
        `Context switch overhead remained controlled at ${results[winner]?.ctxSwitches} kernel switches.`,
        `CPU utilization achieved ${results[winner]?.cpuUtil} across execution span.`,
      ],
      tradeoffAnalysis: `While preemption reduces latency for arriving short bursts, it incurs state-saving overhead. For this workload, ${winner.toUpperCase()} balanced scheduling fairness and switch frequency.`,
      kernelRecommendation: `For general desktop workloads, Linux Completely Fair Scheduler (CFS) with targeted nice levels replicates these results. For hard real-time requirements, SCHED_RR with a tuned time slice is advised.`,
    });
  }
});

// ==========================================
// Full-Stack Dev / Production Serving
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CPU Scheduling Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
