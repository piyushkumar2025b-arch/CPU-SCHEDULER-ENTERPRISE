import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const rawPort = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const PORT = Number.isInteger(rawPort) && rawPort > 0 && rawPort <= 65535 ? rawPort : 3000;

app.use(express.json({ limit: '1mb' }));

// Security headers (CPU-025)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Request ID tracking (CPU-006, CPU-009)
let reqIdCounter = 0;
app.use((req, res, next) => {
  const reqId = `req-${Date.now().toString(36)}-${(++reqIdCounter).toString(36)}`;
  res.setHeader('X-Request-Id', reqId);
  (req as any).id = reqId;
  next();
});

// In-Memory Sliding Window Rate Limiter (CPU-006, CPU-111)
interface RateLimitBucket {
  count: number;
  resetAt: number;
}
const rateLimitStore = new Map<string, RateLimitBucket>();

function createRateLimiter(maxRequests: number, windowMs: number, scope: string) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${scope}::${ip}`;
    const now = Date.now();
    const bucket = rateLimitStore.get(key);

    if (!bucket || now > bucket.resetAt) {
      rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (bucket.count >= maxRequests) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Too many requests for ${scope}. Please retry in ${retryAfter} seconds.`,
          requestId: (req as any).id,
          retryAfter,
        },
      });
    }

    bucket.count++;
    next();
  };
}

// Global API rate limiter (120 req/min)
app.use('/api', createRateLimiter(120, 60000, 'api-global'));

// Periodic cleanup of stale rate-limit buckets
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimitStore.entries()) {
    if (now > v.resetAt) rateLimitStore.delete(k);
  }
}, 60000).unref();

// AI Concurrency Limiter (CPU-006)
let activeAIRequests = 0;
const MAX_CONCURRENT_AI_REQUESTS = 6;
function aiConcurrencyLimiter(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (activeAIRequests >= MAX_CONCURRENT_AI_REQUESTS) {
    return res.status(429).json({
      error: {
        code: 'CONCURRENCY_LIMIT_EXCEEDED',
        message: 'AI synthesizer is currently at peak capacity. Please retry in a few seconds.',
        requestId: (req as any).id,
        retryAfter: 3,
      },
    });
  }
  activeAIRequests++;
  let finished = false;
  const finish = () => {
    if (!finished) {
      finished = true;
      activeAIRequests = Math.max(0, activeAIRequests - 1);
    }
  };
  res.on('finish', finish);
  res.on('close', finish);
  next();
}

const rawApiKey = (process.env.GEMINI_API_KEY || '').trim();
const apiKey = rawApiKey && !rawApiKey.startsWith('MY_') && rawApiKey !== 'your-gemini-api-key' ? rawApiKey : '';
const rawOpenRouterKey = (process.env.OPENROUTER_API_KEY || '').trim();
const openRouterKeyEnv = rawOpenRouterKey && !rawOpenRouterKey.startsWith('MY_') && rawOpenRouterKey !== 'your-openrouter-key' ? rawOpenRouterKey : '';
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

// ==========================================
// AI PROVIDERS CONFIGURATION & STATUS (CPU-004)
// ==========================================
app.get('/api/ai-providers', (_req, res) => {
  res.json({
    gemini: {
      configured: Boolean(apiKey),
      available: Boolean(apiKey),
      defaultModel: 'gemini-3.8-flash',
      models: ['gemini-3.8-flash', 'gemini-flash-latest', 'gemini-3.1-flash-lite'],
    },
    openrouter: {
      configured: Boolean(openRouterKeyEnv),
      available: Boolean(openRouterKeyEnv),
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
      configured: true,
      available: true,
      name: 'Deterministic Heuristic Synthesizer (Offline/Zero-Latency)',
    },
  });
});

// Helper for parsing and validating JSON process array from LLM responses (CPU-007)
function parseAndValidateProcesses(rawText: string): Array<{ name: string; burst: number; priority: number; arrival: number; type: string }> {
  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  let rawList: any[] = [];
  try {
    const direct = JSON.parse(cleaned);
    if (Array.isArray(direct)) rawList = direct;
    else if (direct && Array.isArray(direct.processes)) rawList = direct.processes;
    else if (direct && Array.isArray(direct.tasks)) rawList = direct.tasks;
  } catch {
    const startIdx = cleaned.indexOf('[');
    const endIdx = cleaned.lastIndexOf(']');
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      try {
        const slice = cleaned.substring(startIdx, endIdx + 1);
        const extracted = JSON.parse(slice);
        if (Array.isArray(extracted)) rawList = extracted;
      } catch {
        // Fallthrough
      }
    }
  }

  if (!Array.isArray(rawList) || rawList.length === 0) {
    throw new Error('Could not parse valid JSON process array from model output');
  }

  const VALID_TYPES = ['interactive', 'cpu-bound', 'io-bound', 'batch', 'realtime'] as const;

  return rawList.slice(0, 16).map((item, idx) => {
    if (!item || typeof item !== 'object') {
      return {
        name: `Task ${idx + 1}`,
        burst: 4,
        priority: 3,
        arrival: idx * 2,
        type: 'cpu-bound',
      };
    }

    const nameRaw = typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 40) : `Task ${idx + 1}`;
    const burstNum = Math.max(1, Math.min(20, Math.round(Number(item.burst) || 4)));
    const arrivalNum = Math.max(0, Math.min(100, Math.round(Number(item.arrival) || 0)));
    const priorityNum = Math.max(1, Math.min(5, Math.round(Number(item.priority) || 3)));
    const typeStr = VALID_TYPES.includes(item.type) ? item.type : 'cpu-bound';

    return {
      name: nameRaw,
      burst: burstNum,
      priority: priorityNum,
      arrival: arrivalNum,
      type: typeStr,
    };
  });
}

function parseJsonArrayFromText(rawText: string): any[] {
  return parseAndValidateProcesses(rawText);
}

// Helper to invoke OpenRouter API with abort timeout (CPU-006, CPU-013)
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
      'OpenRouter API key is required. Please set OPENROUTER_API_KEY in the environment or provider settings.'
    );
  }

  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
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

    const data: any = await response.json();
    const choice = data.choices?.[0]?.message?.content;
    if (typeof choice !== 'string' || !choice.trim()) {
      throw new Error('OpenRouter returned an empty or invalid output response.');
    }

    return { text: choice, modelUsed: data.model || model };
  } finally {
    clearTimeout(timeoutId);
  }
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
      const parsed = parseAndValidateProcesses(text);
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
      let actualModelUsed = targetModel;
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
        actualModelUsed = 'gemini-flash-latest';
      }
      const parsed = parseAndValidateProcesses(response.text || '[]');
      return res.json({
        success: true,
        provider: 'gemini',
        model: actualModelUsed,
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
app.post('/api/parse-workload', createRateLimiter(30, 60000, 'ai-parse'), aiConcurrencyLimiter, async (req, res) => {
  const {
    prompt,
    existingProcesses,
    provider = 'gemini',
    model,
    openRouterApiKey,
  } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: { code: 'INVALID_PROMPT', message: 'Prompt string is required.' } });
  }

  if (prompt.length > 4000) {
    return res.status(413).json({
      error: {
        code: 'PROMPT_TOO_LARGE',
        message: 'Prompt length exceeds maximum allowed limit of 4000 characters.',
        requestId: (req as any).id,
      },
    });
  }

  if (Array.isArray(existingProcesses) && existingProcesses.length > 32) {
    return res.status(422).json({
      error: {
        code: 'TOO_MANY_PROCESSES',
        message: 'Existing processes count exceeds maximum capacity of 32 processes.',
        requestId: (req as any).id,
      },
    });
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
  benchmarkMetrics?: string;
}

const OS_RAG_KNOWLEDGE_BASE: RAGKnowledgeChunk[] = [
  {
    id: 'kleinrock_conservation',
    title: "Kleinrock's Conservation Law & Queue Invariants",
    domain: 'scheduling',
    tags: ['kleinrock', 'conservation law', 'waiting time', 'tradeoff', 'variance', 'optimality', 'invariant'],
    principle:
      'For any work-conserving single-core CPU scheduler under non-preemptive or preemption-independent conditions, the sum of weighted waiting times is invariant: sum(rho_i * W_i) = C. Lowering the average wait time for short tasks (as in SJF/SRTF) mathematically increases the variance of waiting times and prolongs queue latency for long tasks.',
    formula: 'sum_{i=1}^n rho_i * W_i = (lambda * E[S^2]) / (2 * (1 - rho)) = Constant',
    kernelImplementation:
      'Modern general-purpose kernels recognize that absolute minimum average wait time produces unacceptable tail latencies for batch jobs; Linux CFS balances this by assigning target minimum latency rather than pure burst-duration priority.',
    remediation:
      'To prevent long jobs from suffering unbounded wait time variance, implement aging bonuses (+1 priority or reduced vruntime credit) proportional to ready-queue waiting duration.',
    benchmarkMetrics: 'Invariant constant C across all non-preemptive work-conserving queue configurations.',
  },
  {
    id: 'convoy_effect',
    title: 'Convoy Effect in First-Come, First-Served (FCFS)',
    domain: 'anomaly',
    tags: ['convoy', 'fcfs', 'io-bound', 'cpu-bound', 'blocking', 'head-of-line', 'bottleneck', 'fifo'],
    principle:
      'When a long CPU-burst process monopolizes the processor, subsequent short interactive or I/O-bound tasks pile up behind it in the ready queue. While the long task executes, I/O devices sit idle. Once the long task completes and moves to I/O, all short tasks execute rapidly and queue for I/O simultaneously, leaving the CPU idle. This results in poor resource utilization and massive wait-time spikes.',
    formula: 'Penalty_ratio = W_i / Burst_i; Convoy detected when max(Burst) >= 2.5 * min(Burst) and AT_long <= AT_short',
    kernelImplementation:
      'Operating systems eliminate convoy blocking via preemptive scheduling (e.g. Round Robin time slicing or SRTF preemption) that forcibly interrupts compute hogs to allow interactive threads to rapidly cycle through.',
    remediation:
      'Switch from non-preemptive FCFS to SRTF or Round Robin with quantum tuned to 80% of short-burst durations, preventing head-of-line blocking.',
    benchmarkMetrics: 'Queue penalty ratio W_i / Burst_i exceeding 3.0x on interactive tasks behind batch compute.',
  },
  {
    id: 'srtf_optimality',
    title: 'Shortest Remaining Time First (SRTF) Provable Optimality',
    domain: 'scheduling',
    tags: ['srtf', 'sjf', 'optimal', 'waiting time', 'turnaround', 'preemption', 'context switch', 'greedy'],
    principle:
      'By Smith (1956) and Schrage (1968), Shortest Remaining Time First (SRTF) is provably optimal for minimizing average waiting time and average turnaround time among all work-conserving preemptive single-processor schedulers. Whenever a new task arrives whose remaining burst is strictly less than the currently running task, preemption immediately minimizes ready-queue backlog.',
    formula: 'Min sum_{i=1}^n W_i <=> Schedule task j with argmin(RemainingBurst_j) at every decision boundary',
    kernelImplementation:
      'Pure SRTF requires exact advance knowledge of future CPU bursts (often approximated via exponential smoothing: tau_{n+1} = alpha * t_n + (1 - alpha) * tau_n). Real-time OS and databases use SRTF heuristics for transaction processing.',
    remediation:
      'Account for context switch overhead: if preemption penalty C_switch >= (Remaining_current - Remaining_new), suppress preemption to avoid cache thrashing.',
    benchmarkMetrics: 'Minimal average waiting time across all single-core preemptive schedules.',
  },
  {
    id: 'rr_quantum_tuning',
    title: 'Round Robin Quantum Selection & Context Switch Thrashing',
    domain: 'quantum',
    tags: ['round robin', 'quantum', 'time slice', 'thrashing', 'sweet spot', 'context switch', 'overhead', 'timeslice'],
    principle:
      'The choice of Round Robin time quantum q defines the balance between interactive responsiveness and context switch overhead. As q -> 0, RR approaches theoretical Processor Sharing (PS) with extreme context switch thrashing and cache invalidation. As q -> infinity, RR degrades into FCFS with convoy vulnerability. Standard textbook guideline (Silberschatz/Tanenbaum): 80% of CPU bursts should be shorter than the time quantum q.',
    formula: 'Optimal q approx Percentile_80(Burst_times); Harmonic_score = 0.6 * norm(WT) + 0.4 * norm(CtxSwitches)',
    kernelImplementation:
      'Linux CFS dynamically computes per-task time slices: time_slice = sched_latency * (weight_i / sum_weights), with minimum slice sysctl_sched_min_granularity (typically 0.75ms - 3ms) to bound context-switch costs.',
    remediation:
      'Set quantum to the 80th percentile of task bursts (typically 3-6ms) or the harmonic inflection point where wait-time curve levels off before context switches escalate.',
    benchmarkMetrics: '80% percentile of burst distribution balances interactive latency and state overhead.',
  },
  {
    id: 'starvation_and_aging',
    title: 'Priority Starvation & Dynamic Aging Mitigation',
    domain: 'starvation',
    tags: ['starvation', 'priority', 'aging', 'lockout', 'fairness', 'mlfq', 'indefinite postponement', 'starv'],
    principle:
      'Strict priority scheduling and SJF/SRTF inherently suffer from starvation (indefinite postponement): low-priority or long-burst processes remain suspended in the ready queue indefinitely if higher-priority or shorter tasks continue arriving. Aging is the universal mitigation: the dispatcher progressively increments a waiting process’s priority as time passes in the ready queue.',
    formula: 'Effective_Priority(t) = Base_Priority + alpha * (Current_Time - Arrival_Time - CPU_Executed_Time)',
    kernelImplementation:
      'Windows Kernel dynamically boosts thread priority for GUI foreground focus and I/O completion, then decays it after one quantum. Solaris and FreeBSD implement Multi-Level Feedback Queues (MLFQ) that demote CPU hogs and promote waiting interactive threads.',
    remediation:
      'Implement dynamic aging with +1 priority advancement every 4 to 8 time units spent waiting in ready queue, guaranteeing an upper bound on latency.',
    benchmarkMetrics: 'Upper bounded waiting time W_max < infinity under continuous high-priority task arrival.',
  },
  {
    id: 'priority_inversion',
    title: 'Priority Inversion & Priority Inheritance Protocols',
    domain: 'starvation',
    tags: ['priority inversion', 'mutex', 'lock', 'mars pathfinder', 'priority inheritance', 'ceiling', 'synchronization'],
    principle:
      'Priority inversion occurs when a low-priority process holds a mutual-exclusion resource required by a high-priority process, while an intermediate-priority process prevents the low-priority process from executing and releasing the lock. High-priority thread is indirectly starved by medium-priority thread (famous Mars Pathfinder 1997 anomaly).',
    formula: 'T_wait(High) = T_exec(Low) + sum(T_exec(Medium_intervening)) >> expected T_wait',
    kernelImplementation:
      'POSIX mutexes implement PTHREAD_PRIO_INHERIT (Priority Inheritance Protocol), temporarily boosting the lock-holding low-priority thread to the priority of the highest blocked thread until lock release.',
    remediation:
      'Employ Priority Inheritance or Priority Ceiling protocols whenever preemption interacts with shared locks or multi-process dependencies.',
    benchmarkMetrics: 'Bounded priority inversion duration <= max critical section execution time.',
  },
  {
    id: 'linux_cfs',
    title: 'Linux Completely Fair Scheduler (CFS) Mechanics',
    domain: 'kernel',
    tags: ['linux', 'cfs', 'vruntime', 'red-black tree', 'nice', 'fairness', 'completely fair', 'rbtree'],
    principle:
      'Linux CFS replaces discrete runqueues and priority ticks with an ideal multi-tasking CPU model. Each runnable process tracks virtual runtime (vruntime), representing CPU execution normalized by task nice level (nice -20 to +19, weights 1.25^nice). CFS always dispatches the task with the smallest vruntime, indexed via a self-balancing Red-Black Tree (O(1) pick-next, O(log N) insert).',
    formula: 'vruntime += delta_exec * (NICE_0_LOAD / task_weight); Delta_vruntime_interactive < Delta_vruntime_batch',
    kernelImplementation:
      'Tasks that sleep on I/O or wait in the ready queue fall behind in vruntime, so upon waking they naturally execute ahead of compute-bound tasks without requiring ad-hoc heuristic priority boosts.',
    remediation:
      'Model workloads under CFS by assigning nice -5 to interactive/IO threads and nice +10 to batch workers, guaranteeing proportional CPU bandwidth without convoy locks.',
    benchmarkMetrics: 'O(1) pick-next latency via cached rb_leftmost pointer.',
  },
  {
    id: 'realtime_posix',
    title: 'Real-Time Dispatching (SCHED_FIFO vs SCHED_RR vs EDF)',
    domain: 'kernel',
    tags: ['realtime', 'sched_fifo', 'sched_rr', 'deadline', 'edf', 'hard realtime', 'freertos', 'sched_deadline'],
    principle:
      'Real-time operating systems require deterministic response guarantees over throughput. Under POSIX SCHED_FIFO, the highest-priority runnable thread runs until it yields or blocks; under SCHED_RR, equal-priority threads share CPU via a round-robin time slice. Earliest Deadline First (EDF) dynamically dispatches the task closest to its deadline and is provably optimal up to 100% CPU utilization.',
    formula: 'Liu & Layland Bound for Rate Monotonic: sum(Burst_i / Period_i) <= n * (2^(1/n) - 1) approx 69.3%',
    kernelImplementation:
      'Linux implements SCHED_DEADLINE using EDF and Constant Bandwidth Server (CBS), preventing real-time tasks from monopolizing the core.',
    remediation:
      'Isolate realtime tasks with strict arrival periods; bound burst times and ensure total CPU utilization <= 0.69 to prevent deadline misses.',
    benchmarkMetrics: 'Guaranteed deadline satisfaction up to theoretical utilization bounds.',
  },
  {
    id: 'multilevel_feedback_queue',
    title: 'Multi-Level Feedback Queue (MLFQ) Rules & Anti-Gaming',
    domain: 'scheduling',
    tags: ['mlfq', 'feedback', 'queue', 'anti-gaming', 'demotion', 'time allotment', 'quantum decay'],
    principle:
      'First introduced by Fernando Corbato (CTSS 1962), Multi-Level Feedback Queue (MLFQ) dynamically learns process behaviors without advance knowledge of burst times. Rule 1: Priority(A) > Priority(B) executes A. Rule 2: Priority(A) == Priority(B) runs in RR. Rule 3: When a job enters the system, it is placed at highest priority. Rule 4: Once a job uses its time allotment at a given priority, it is demoted. Rule 5: Periodic priority boost moves all jobs to top queue to prevent starvation.',
    formula: 'Quantum_tier(k) = Quantum_base * 2^k; Allotment_decay = sum(Exec_slice) >= Tier_Allotment',
    kernelImplementation:
      'BSD Unix scheduler and Windows NT kernel maintain dynamic multi-tier priority arrays. By tracking cumulative execution slice rather than single-quantum behavior, MLFQ prevents malicious processes from gaming the scheduler with tiny I/O yields.',
    remediation:
      'Configure time allotments that double at each priority drop (e.g. Q0=2ms, Q1=4ms, Q2=8ms) with a periodic 1-second system-wide priority reset.',
    benchmarkMetrics: 'Sub-millisecond interactive response while achieving high throughput for batch jobs.',
  },
  {
    id: 'cpu_cache_affinity',
    title: 'CPU Cache Affinity, NUMA Locality & Migration Penalties',
    domain: 'kernel',
    tags: ['cache', 'affinity', 'numa', 'locality', 'l1', 'l2', 'l3', 'migration', 'thrashing', 'core pinning'],
    principle:
      'Migrating a process across CPU cores invalidates warm L1/L2 cache lines and degrades performance due to inter-core bus snooping and NUMA remote memory latency. Schedulers maintain soft or hard affinity: a process prefers to execute on the core where its cache footprint remains valid, balancing queue length equalization against cache re-population penalties.',
    formula: 'Migration_Penalty = T_cache_refill + T_inter_interconnect; Migrate only if (Wait_remote - Wait_local) > Migration_Penalty',
    kernelImplementation:
      'Linux scheduler constructs hierarchical sched_domains (SMT -> MC -> LLC -> NUMA). Load balancing only migrates tasks across LLC boundaries when core imbalance exceeds sched_migration_cost (default ~500 microseconds).',
    remediation:
      'Pin latency-sensitive threads with sched_setaffinity() and avoid aggressive work-stealing across NUMA nodes when memory footprint is high.',
    benchmarkMetrics: 'L1/L2 cache hit rate reduction from 95% to 60% upon arbitrary inter-socket migration.',
  },
  {
    id: 'work_stealing_schedulers',
    title: 'Work-Stealing Scheduling & Decentralized Runqueues',
    domain: 'scheduling',
    tags: ['work stealing', 'deque', 'goroutine', 'cilk', 'decentralized', 'lock contention', 'scalability'],
    principle:
      'Centralized ready queues create severe mutex contention on high-core-count architectures. Work-stealing schedulers (Blumofe & Leiserson 1999) allocate a private double-ended queue (deque) per core. A worker core pushes and pops tasks from the bottom of its own deque (LIFO, maximizing cache locality); when idle, it steals tasks from the top of another random core’s deque (FIFO).',
    formula: 'T_parallel <= (Work / P) + O(Span); Number of steals <= O(P * Span)',
    kernelImplementation:
      'Go runtime scheduler (M:N goroutines), Rust Tokio thread pool, and Intel TBB employ lock-free work-stealing deques (Chase-Lev deque) to achieve near-linear multi-core scalability.',
    remediation:
      'Partition process queues per virtual core; use LIFO local dispatch for cache warmth and steal from saturated cores only when local deque is starved.',
    benchmarkMetrics: 'Zero centralized lock bottleneck, scaling smoothly to 128+ physical cores.',
  },
  {
    id: 'burst_prediction_heuristics',
    title: 'Exponential Smoothing for CPU Burst Estimation',
    domain: 'scheduling',
    tags: ['prediction', 'burst estimation', 'exponential smoothing', 'history', 'sjf heuristic', 'tau'],
    principle:
      'Since true future CPU burst lengths cannot be known in advance for arbitrary programs (halting problem equivalent), schedulers approximate upcoming bursts using exponential smoothing of past burst history: tau_{n+1} = alpha * t_n + (1 - alpha) * tau_n, where alpha (typically 0.5) controls the weight of recent history versus historical baseline.',
    formula: 'tau_{n+1} = alpha * t_n + (1 - alpha) * tau_n = alpha * sum_{i=0}^n (1 - alpha)^i * t_{n-i}',
    kernelImplementation:
      'Database query engines and interactive OS shells categorize threads into burst history buckets to route short queries to interactive queues and long queries to batch pipelines.',
    remediation:
      'Set alpha = 0.5 to balance stability against rapid adaptation, or use EWMA filters with variance tracking to anticipate burst spikes.',
    benchmarkMetrics: 'Prediction mean absolute percentage error (MAPE) typically within 15-25% on real workloads.',
  },
  {
    id: 'bvt_borrowed_virtual_time',
    title: 'Borrowed Virtual Time (BVT) & Low-Latency Dispatching',
    domain: 'kernel',
    tags: ['bvt', 'borrowed virtual time', 'warp', 'interactive latency', 'virtual time', 'multimedia'],
    principle:
      'Borrowed Virtual Time (Duda & Cheriton 1999) extends fair-share scheduling to support ultra-low-latency interactive and multimedia threads without breaking long-term throughput fairness. A thread may borrow virtual time from its own future allocation (via a negative warp value) to immediately preempt the CPU upon waking.',
    formula: 'Effective_Virtual_Time = Actual_Virtual_Time - Warp_Credit; Warp bounded by Warp_Limit to prevent abuse',
    kernelImplementation:
      'Used in hypervisors (Xen credit scheduler) and soft real-time kernels to allow audio/video buffers to flush instantaneously without requiring hard RT real-time privileges.',
    remediation:
      'Configure warp credit equal to two audio frame buffer periods (e.g. 10ms), guaranteeing jitter-free processing without monopolizing compute cores.',
    benchmarkMetrics: 'Reduces dispatch jitter by 80% for soft real-time streams.',
  },
  {
    id: 'sched_ext_bpf',
    title: 'Linux eBPF Extensible Schedulers (sched_ext)',
    domain: 'kernel',
    tags: ['sched_ext', 'ebpf', 'bpf', 'linux 6.12', 'custom scheduler', 'extensibility', 'meta sched'],
    principle:
      'Introduced in Linux 6.12, sched_ext allows userspace and kernel engineers to implement production CPU schedulers dynamically in eBPF without recompiling the Linux kernel. Schedulers implement core hooks (select_cpu, enqueue, dispatch, tick) with kernel-verified memory safety, enabling application-specific dispatching for gaming, cloud microservices, and databases.',
    formula: 'Dispatch_latency = T_ebpf_hook + T_core_switch; Zero kernel crash risk via BPF verifier guarantees',
    kernelImplementation:
      'Meta and Google deploy custom BPF schedulers (e.g. scx_rusty, scx_lavd) yielding 5-15% throughput gains over standard CFS for specific warehouse cloud workloads.',
    remediation:
      'Develop workload-tailored scheduling policies in Rust or C compiled to BPF bytecode to benchmark custom dispatch heuristics directly on production hardware.',
    benchmarkMetrics: 'Dynamic live-reloading of kernel scheduling policies with zero server reboot.',
  },
  {
    id: 'littles_law_metrics',
    title: "Little's Law & CPU Scheduling Performance Invariants",
    domain: 'scheduling',
    tags: ['littles law', 'metrics', 'turnaround', 'waiting time', 'throughput', 'queue length', 'response time'],
    principle:
      "By Little's Law (1961), the average number of tasks in a stationary queueing system L equals the arrival rate lambda multiplied by the average time spent in the system W: L = lambda * W. Key OS metrics are mathematically locked: Turnaround Time TAT = Completion - Arrival = Burst + Waiting Time; Response Time RT = FirstExecution - Arrival; Throughput = N / TotalSpan.",
    formula: 'L = lambda * W; TAT_i = W_i + Burst_i; CPU_Util = (Total_Busy_Time) / (Total_Wallclock_Time)',
    kernelImplementation:
      'Operating systems kernel accounting (Linux /proc/schedstat, macOS sysctl) monitors task arrival rates and residency to evaluate scheduler health and trigger dynamic thermal or load throttling.',
    remediation:
      'When queue length spikes, lower arrival rate via backpressure or throttle batch work to prevent Little’s Law waiting time explosion.',
    benchmarkMetrics: 'Mathematical consistency check: avgTAT must exactly equal avgWT + avgBurst.',
  },
  {
    id: 'gang_scheduling',
    title: 'Gang Scheduling & Co-Scheduling for Parallel Threads',
    domain: 'kernel',
    tags: ['gang scheduling', 'co-scheduling', 'parallel', 'barrier', 'synchronization', 'affinity', 'mpi'],
    principle:
      'In multi-threaded parallel workloads that synchronize frequently via barriers or lock spin-waiting, scheduling threads independently leads to severe priority inversion and CPU waste (threads spinning on locks held by descheduled peers). Gang scheduling co-schedules all related threads simultaneously on distinct CPU cores.',
    formula: 'Spin_Waste = sum(T_spin_waiting) -> 0 when All_Threads_Run_Simultaneously',
    kernelImplementation:
      'HPC clusters, supercomputers (Slurm, PBS), and game engines use gang scheduling matrices to guarantee that compute threads advance in synchronized lockstep.',
    remediation:
      'When tasks share tight inter-thread lock synchronization, group them into a single scheduling gang with synchronized time quantum boundaries.',
    benchmarkMetrics: 'Eliminates up to 90% of spin-lock cycle dissipation in parallel matrix computation.',
  },
];

// ==========================================
// ADVANCED BM25 + TF-IDF RAG SEARCH INDEX
// ==========================================
class RAGVectorSearchEngine {
  private chunks: RAGKnowledgeChunk[];
  private docTokens: Map<string, string[]>;
  private termFrequencies: Map<string, Map<string, number>>;
  private docFrequencies: Map<string, number>;
  private docLengths: Map<string, number>;
  private avgDocLength: number;
  private synonymMap: Map<string, string[]>;

  constructor(chunks: RAGKnowledgeChunk[]) {
    this.chunks = chunks;
    this.docTokens = new Map();
    this.termFrequencies = new Map();
    this.docFrequencies = new Map();
    this.docLengths = new Map();
    this.synonymMap = new Map();
    this.avgDocLength = 0;
    this.initSynonyms();
    this.buildIndex();
  }

  private initSynonyms() {
    const syns: Record<string, string[]> = {
      preempt: ['preemptive', 'srtf', 'interruption', 'timeslice', 'switching', 'boundary'],
      preemption: ['preempt', 'srtf', 'interruption', 'switch', 'context'],
      starv: ['starvation', 'aging', 'indefinite', 'postponement', 'mlfq', 'lockout', 'fairness'],
      starvation: ['starv', 'aging', 'indefinite', 'postponement', 'mlfq', 'priority'],
      convoy: ['head-of-line', 'fcfs', 'fifo', 'compute-bound', 'blocking', 'bottleneck'],
      quantum: ['timeslice', 'granularity', 'round robin', 'thrashing', 'overhead', 'slice'],
      slice: ['quantum', 'timeslice', 'round robin'],
      cache: ['affinity', 'numa', 'locality', 'migration', 'l1', 'l2', 'l3', 'invalidation'],
      steal: ['work-stealing', 'deque', 'goroutine', 'decentralized', 'cilk'],
      cfs: ['vruntime', 'fairness', 'red-black', 'nice', 'linux', 'completely fair'],
      priority: ['inversion', 'inheritance', 'ceiling', 'aging', 'mlfq', 'starvation'],
      realtime: ['deadline', 'edf', 'fifo', 'sched_deadline', 'sched_fifo', 'sched_rr', 'freertos'],
      prediction: ['smoothing', 'heuristic', 'exponential', 'history', 'estimation'],
      turnaround: ['waiting', 'response', 'tat', 'latency', 'littles law', 'metric'],
      wait: ['waiting', 'latency', 'delay', 'queue', 'turnaround'],
      overhead: ['context switch', 'thrashing', 'migration', 'cache refill'],
    };
    Object.entries(syns).forEach(([k, vals]) => {
      this.synonymMap.set(k.toLowerCase(), vals.map((v) => v.toLowerCase()));
    });
  }

  private tokenize(text: string): string[] {
    return (text || '')
      .toLowerCase()
      .replace(/[^a-z0-9_\-\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 2);
  }

  private buildIndex() {
    let totalLength = 0;
    const allDocTokens: Array<{ id: string; tokens: string[] }> = [];

    this.chunks.forEach((chunk) => {
      const fullDocText = `${chunk.title} ${chunk.domain} ${chunk.tags.join(' ')} ${chunk.principle} ${chunk.kernelImplementation} ${chunk.remediation} ${chunk.formula || ''}`;
      const tokens = this.tokenize(fullDocText);
      this.docTokens.set(chunk.id, tokens);
      this.docLengths.set(chunk.id, tokens.length);
      totalLength += tokens.length;

      const tf = new Map<string, number>();
      tokens.forEach((tok) => {
        tf.set(tok, (tf.get(tok) || 0) + 1);
      });
      this.termFrequencies.set(chunk.id, tf);
      allDocTokens.push({ id: chunk.id, tokens: Array.from(new Set(tokens)) });
    });

    this.avgDocLength = totalLength / (this.chunks.length || 1);

    allDocTokens.forEach(({ tokens }) => {
      tokens.forEach((tok) => {
        this.docFrequencies.set(tok, (this.docFrequencies.get(tok) || 0) + 1);
      });
    });
  }

  public search(
    query: string,
    domain?: string,
    limit = 3,
    telemetryPrior?: {
      winner?: string;
      hasConvoy?: boolean;
      hasStarvation?: boolean;
      highQuantumSwitches?: boolean;
      burstCV?: number;
    }
  ): { chunk: RAGKnowledgeChunk; score: number }[] {
    const rawQuery = (query || '').toLowerCase();
    const queryTokens = this.tokenize(rawQuery);

    // Query expansion with synonyms
    const expandedTokens = new Set<string>(queryTokens);
    queryTokens.forEach((tok) => {
      this.synonymMap.forEach((syns, key) => {
        if (tok.includes(key) || key.includes(tok)) {
          syns.forEach((s) => expandedTokens.add(s));
        }
      });
    });

    const N = this.chunks.length;
    const k1 = 1.4;
    const b = 0.75;

    const scored = this.chunks.map((chunk) => {
      let bm25Score = 0;
      const tfMap = this.termFrequencies.get(chunk.id) || new Map();
      const docLen = this.docLengths.get(chunk.id) || this.avgDocLength;

      expandedTokens.forEach((term) => {
        const tf = tfMap.get(term) || 0;
        if (tf > 0) {
          const df = this.docFrequencies.get(term) || 1;
          const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
          const num = tf * (k1 + 1);
          const den = tf + k1 * (1 - b + b * (docLen / this.avgDocLength));
          bm25Score += idf * (num / den);
        }
      });

      // Domain match bonus
      if (domain && chunk.domain === domain) {
        bm25Score += 8;
      }

      // Title exact word boost
      queryTokens.forEach((qTok) => {
        if (chunk.title.toLowerCase().includes(qTok)) {
          bm25Score += 4;
        }
        if (chunk.tags.some((t) => t.toLowerCase().includes(qTok))) {
          bm25Score += 3;
        }
      });

      // Phrasal matching bonuses
      if (rawQuery.includes('convoy') && chunk.id === 'convoy_effect') bm25Score += 25;
      if ((rawQuery.includes('quantum') || rawQuery.includes('time slice')) && chunk.id === 'rr_quantum_tuning') bm25Score += 25;
      if ((rawQuery.includes('starv') || rawQuery.includes('aging')) && (chunk.id === 'starvation_and_aging' || chunk.id === 'multilevel_feedback_queue')) bm25Score += 22;
      if ((rawQuery.includes('srtf') || rawQuery.includes('sjf') || rawQuery.includes('optimal')) && chunk.id === 'srtf_optimality') bm25Score += 20;
      if ((rawQuery.includes('cfs') || rawQuery.includes('linux') || rawQuery.includes('vruntime')) && chunk.id === 'linux_cfs') bm25Score += 20;
      if ((rawQuery.includes('cache') || rawQuery.includes('affinity') || rawQuery.includes('numa')) && chunk.id === 'cpu_cache_affinity') bm25Score += 22;
      if ((rawQuery.includes('steal') || rawQuery.includes('goroutine') || rawQuery.includes('deque')) && chunk.id === 'work_stealing_schedulers') bm25Score += 22;
      if ((rawQuery.includes('predict') || rawQuery.includes('smoothing') || rawQuery.includes('burst estimation')) && chunk.id === 'burst_prediction_heuristics') bm25Score += 22;
      if ((rawQuery.includes('priority inversion') || rawQuery.includes('pathfinder') || rawQuery.includes('mutex')) && chunk.id === 'priority_inversion') bm25Score += 25;
      if ((rawQuery.includes('realtime') || rawQuery.includes('deadline') || rawQuery.includes('edf')) && chunk.id === 'realtime_posix') bm25Score += 22;
      if ((rawQuery.includes('tradeoff') || rawQuery.includes('kleinrock') || rawQuery.includes('conservation')) && chunk.id === 'kleinrock_conservation') bm25Score += 22;
      if ((rawQuery.includes('little') || rawQuery.includes('metric') || rawQuery.includes('turnaround')) && chunk.id === 'littles_law_metrics') bm25Score += 20;

      // Telemetry Priors
      if (telemetryPrior) {
        if (telemetryPrior.hasConvoy && chunk.id === 'convoy_effect') bm25Score += 12;
        if (telemetryPrior.hasStarvation && (chunk.id === 'starvation_and_aging' || chunk.id === 'multilevel_feedback_queue')) bm25Score += 12;
        if (telemetryPrior.highQuantumSwitches && chunk.id === 'rr_quantum_tuning') bm25Score += 12;
        if (telemetryPrior.burstCV && telemetryPrior.burstCV > 1.2 && (chunk.id === 'srtf_optimality' || chunk.id === 'convoy_effect')) bm25Score += 8;
        if (telemetryPrior.winner === 'srtf' && chunk.id === 'srtf_optimality') bm25Score += 6;
      }

      return { chunk, score: bm25Score };
    });

    scored.sort((a, b) => b.score - a.score);

    // Diversify with MMR (Maximal Marginal Relevance) to avoid 3 chunks on the same subdomain
    const selected: { chunk: RAGKnowledgeChunk; score: number }[] = [];
    const usedDomains = new Map<string, number>();

    for (const item of scored) {
      if (selected.length >= limit) break;
      const count = usedDomains.get(item.chunk.domain) || 0;
      // Allow up to 2 chunks from same domain, otherwise prioritize other domains if they have decent score
      if (count < 2 || item.score > 25 || selected.length === 0) {
        selected.push(item);
        usedDomains.set(item.chunk.domain, count + 1);
      }
    }

    if (selected.length === 0 || selected[0].score <= 0) {
      return [
        { chunk: this.chunks[2], score: 10 },
        { chunk: this.chunks[3], score: 9 },
        { chunk: this.chunks[4], score: 8 },
      ].slice(0, limit);
    }

    return selected.slice(0, limit);
  }
}

// Global pre-indexed RAG vector search instance
const ragSearchEngine = new RAGVectorSearchEngine(OS_RAG_KNOWLEDGE_BASE);

// Bounded In-Memory Query Response Cache (200 items, 60s TTL, LRU eviction) (CPU-008, CPU-017)
interface CachedRAGEntry {
  answer: string;
  citations: any[];
  telemetryHighlights: any;
  source: string;
  timestamp: string;
  expiresAt: number;
}
const MAX_RAG_CACHE_SIZE = 200;
const RAG_QUERY_CACHE = new Map<string, CachedRAGEntry>();

function getCachedRAGQuery(key: string): CachedRAGEntry | null {
  const entry = RAG_QUERY_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    RAG_QUERY_CACHE.delete(key);
    return null;
  }
  return entry;
}

function setCachedRAGQuery(key: string, data: Omit<CachedRAGEntry, 'expiresAt'>) {
  if (RAG_QUERY_CACHE.size >= MAX_RAG_CACHE_SIZE) {
    const now = Date.now();
    for (const [k, v] of RAG_QUERY_CACHE.entries()) {
      if (now > v.expiresAt) {
        RAG_QUERY_CACHE.delete(k);
      }
    }
    if (RAG_QUERY_CACHE.size >= MAX_RAG_CACHE_SIZE) {
      const firstKey = RAG_QUERY_CACHE.keys().next().value;
      if (firstKey) RAG_QUERY_CACHE.delete(firstKey);
    }
  }
  RAG_QUERY_CACHE.set(key, { ...data, expiresAt: Date.now() + 60000 });
}

function retrieveRAGKnowledge(query: string, domain?: string, limit = 3, telemetryPrior?: any): RAGKnowledgeChunk[] {
  const results = ragSearchEngine.search(query, domain, limit, telemetryPrior);
  return results.map((r) => r.chunk);
}

// ==========================================
// RAG ENDPOINT 1: Authoritative Knowledge Topics Directory
// ==========================================
app.get('/api/rag/knowledge-topics', (_req, res) => {
  res.json({
    total: OS_RAG_KNOWLEDGE_BASE.length,
    topics: OS_RAG_KNOWLEDGE_BASE.map((k) => ({
      id: k.id,
      title: k.title,
      domain: k.domain,
      tags: k.tags,
      summary: k.principle.length > 140 ? k.principle.substring(0, 140) + '...' : k.principle,
      formula: k.formula,
      kernelImplementation: k.kernelImplementation,
      remediation: k.remediation,
    })),
  });
});

// ==========================================
// RAG ENDPOINT 2: Comprehensive Multi-Source RAG Query Engine
// ==========================================
app.post('/api/rag/query', createRateLimiter(60, 60000, 'rag-query'), async (req, res) => {
  const queryStartTime = Date.now();
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

  // Determine top winning algorithm and metrics from live telemetry
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

  // Calculate 80th percentile burst for quantum advice
  const taskBursts = Array.isArray(processes) ? processes.map((p: any) => Number(p.burst) || 1).sort((a, b) => a - b) : [];
  const p80Quantum = taskBursts.length > 0 ? taskBursts[Math.min(taskBursts.length - 1, Math.floor(taskBursts.length * 0.8))] : 4;

  const telemetryHighlights = {
    winner: winner.toUpperCase(),
    bestWT: +bestWT.toFixed(2),
    runnerUp: runnerUp.toUpperCase(),
    runnerUpWT: +runnerUpWT.toFixed(2),
    quantum,
    suggestedQuantumP80: p80Quantum,
    taskCount: Array.isArray(processes) ? processes.length : 0,
  };

  // Telemetry prior for intelligent RAG chunk boosting
  const hasConvoy = Array.isArray(anomalies) && anomalies.some((a: any) => a.type?.toLowerCase().includes('convoy'));
  const hasStarvation = Array.isArray(anomalies) && anomalies.some((a: any) => a.type?.toLowerCase().includes('starv'));
  const highQuantumSwitches = results?.rr?.ctxSwitches && results.rr.ctxSwitches > 12;

  // Build canonical fingerprint of entire workload and provider configuration (CPU-008)
  const procFingerprint = Array.isArray(processes)
    ? processes.map((p: any) => `${p.id ?? p.idx}:${p.arrival}:${p.burst}:${p.priority}`).join(';')
    : '';
  const activeProvider = provider || 'gemini';
  const activeModel = model || (activeProvider === 'gemini' ? 'gemini-3.8-flash' : 'default');
  const cacheKey = `rag-v2.6::${question.trim().toLowerCase()}::${domain || 'all'}::${activeProvider}::${activeModel}::${procFingerprint}::q${quantum}`;
  const cached = getCachedRAGQuery(cacheKey);
  if (cached) {
    res.setHeader('X-RAG-Cache', 'HIT');
    res.setHeader('X-RAG-Latency-Ms', String(Date.now() - queryStartTime));
    return res.json(cached);
  }

  // Retrieve relevant OS domain knowledge chunks with BM25 + Telemetry priors
  const searchResults = ragSearchEngine.search(question, domain, 3, {
    winner,
    hasConvoy,
    hasStarvation,
    highQuantumSwitches,
    burstCV: fingerprint?.burstCV,
  });

  const retrievedChunks = searchResults.map((r) => r.chunk);
  const citationList = searchResults.map((r) => ({
    id: r.chunk.id,
    title: r.chunk.title,
    snippet: r.chunk.principle,
    formula: r.chunk.formula,
    kernelImplementation: r.chunk.kernelImplementation,
    remediation: r.chunk.remediation,
    relevanceScore: +(r.score).toFixed(2),
  }));

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
- Round Robin Quantum: ${quantum} units (80th percentile sweet spot: ${p80Quantum} units)
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
      const responsePayload = {
        answer: text,
        citations: citationList,
        telemetryHighlights,
        source: 'openrouter' as const,
        timestamp: new Date().toISOString(),
      };
      setCachedRAGQuery(cacheKey, responsePayload);
      res.setHeader('X-RAG-Source', 'openrouter');
      res.setHeader('X-RAG-Latency-Ms', String(Date.now() - queryStartTime));
      return res.json(responsePayload);
    } catch (err: any) {
      console.warn('OpenRouter RAG query warning, cascading to resilient fallback:', err?.message);
    }
  }

  // 2. Try Gemini with multi-tier model fallback
  if ((provider === 'gemini' || !provider) && ai) {
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
        const responsePayload = {
          answer: text,
          citations: citationList,
          telemetryHighlights,
          source: 'gemini' as const,
          timestamp: new Date().toISOString(),
        };
        setCachedRAGQuery(cacheKey, responsePayload);
        res.setHeader('X-RAG-Source', 'gemini');
        res.setHeader('X-RAG-Latency-Ms', String(Date.now() - queryStartTime));
        return res.json(responsePayload);
      }
    } catch (err: any) {
      console.warn('Gemini RAG notice (activating high-fidelity deterministic engine):', err?.message || err);
    }
  }

  // 3. High-Fidelity Deterministic OS RAG Synthesizer
  const synthesizedAnswer = generateDeterministicRAGAnswer(
    question,
    retrievedChunks,
    processes,
    results,
    quantum,
    p80Quantum,
    winner,
    bestWT,
    runnerUp,
    runnerUpWT
  );

  const fallbackPayload = {
    answer: synthesizedAnswer,
    citations: citationList,
    telemetryHighlights,
    source: 'rag-deterministic' as const,
    timestamp: new Date().toISOString(),
  };
  setCachedRAGQuery(cacheKey, fallbackPayload);
  res.setHeader('X-RAG-Source', 'rag-deterministic');
  res.setHeader('X-RAG-Latency-Ms', String(Date.now() - queryStartTime));
  return res.json(fallbackPayload);
});

// ==========================================
// RAG ENDPOINT 3: Health & Diagnostics
// ==========================================
app.get('/api/rag/health', (_req, res) => {
  const benchStart = performance.now();
  const testResults = ragSearchEngine.search('convoy effect in round robin quantum', undefined, 3);
  const searchLatencyMs = +(performance.now() - benchStart).toFixed(3);

  res.json({
    status: 'healthy',
    version: '2.5.0-vector-bm25',
    knowledgeBaseCount: OS_RAG_KNOWLEDGE_BASE.length,
    searchLatencyBenchmarkMs: searchLatencyMs,
    cacheEntriesCount: RAG_QUERY_CACHE.size,
    providersStatus: {
      geminiAvailable: Boolean(apiKey),
      openRouterAvailable: Boolean(openRouterKeyEnv),
      openRouterHasEnvKey: Boolean(openRouterKeyEnv),
      openRouterConfigured: Boolean(openRouterKeyEnv),
      deterministicRAGEngineAvailable: true,
    },
    sampleIndexChunk: testResults[0]?.chunk?.title,
  });
});

function generateDeterministicRAGAnswer(
  question: string,
  chunks: RAGKnowledgeChunk[],
  processes: any[],
  results: any,
  quantum: number,
  p80Quantum: number,
  winner: string,
  bestWT: number,
  runnerUp: string,
  runnerUpWT: number
): string {
  const qLower = (question || '').toLowerCase();
  const topChunk = chunks[0] || OS_RAG_KNOWLEDGE_BASE[0];
  const secondChunk = chunks[1] || OS_RAG_KNOWLEDGE_BASE[1];
  const n = processes?.length || 8;

  // Category 1: Quantum Tuning / Round Robin / Context Switching
  if (qLower.includes('quantum') || qLower.includes('round robin') || qLower.includes('slice') || qLower.includes('thrash')) {
    const rrWT = results?.rr?.avgWT !== undefined ? results.rr.avgWT.toFixed(2) : 'N/A';
    const rrSwitches = results?.rr?.ctxSwitches || 0;
    return `1. Direct Technical Answer:
Under this ${n}-task workload at q=${quantum}, Round Robin records an average waiting time of ${rrWT}ms with ${rrSwitches} context switches. The mathematically derived sweet spot for this burst distribution is q=${p80Quantum}ms, where approximately 80% of tasks complete within their first quantum allocation without incurring preemptive re-queueing.

2. Kernel Principle & Grounding:
Per [${topChunk.title}], setting the quantum too low pushes the system toward Processor Sharing, inducing excessive cache line invalidation and dispatch overhead. Conversely, setting quantum excessively high degenerates Round Robin into FCFS, exposing interactive tasks to convoy delays.

3. Actionable Recommendation:
Tune the time slice to ${p80Quantum}ms. In Linux CFS, configure sysctl_sched_min_granularity between 1ms and ${p80Quantum}ms to guarantee that interactive threads complete promptly without provoking context switch thrashing.`;
  }

  // Category 2: Starvation / Priority Lockout / Dynamic Aging / MLFQ
  if (qLower.includes('starv') || qLower.includes('aging') || qLower.includes('lockout') || qLower.includes('mlfq')) {
    const prioWT = results?.priority?.avgWT !== undefined ? results.priority.avgWT.toFixed(2) : 'N/A';
    const ppriorWT = results?.pprior?.avgWT !== undefined ? results.pprior.avgWT.toFixed(2) : 'N/A';
    return `1. Direct Technical Answer:
Priority-driven policies (Non-preemptive Priority avgWT=${prioWT}ms, Preemptive Priority avgWT=${ppriorWT}ms) systematically defer lower-priority tasks. When high-priority or short tasks continually enter the ready queue, background tasks experience indefinite postponement with waiting times scaling unbounded.

2. Kernel Principle & Grounding:
According to [${topChunk.title}], strict priority ordering violates queue fairness invariants. Without intervention, low-priority tasks suffer elevated tail latencies, directly causing priority lockout and potential deadlocks under resource contention.

3. Actionable Recommendation:
Implement dynamic aging: increment a waiting process's effective priority (+1 priority credit per 4ms of ready-queue latency). In FreeBSD and Windows NT, Multi-Level Feedback Queue (MLFQ) priority boosting elevates aging tasks to top-priority queues periodically, enforcing a strict upper bound on queue latency.`;
  }

  // Category 3: Convoy Effect / Head of Line Blocking / FCFS
  if (qLower.includes('convoy') || qLower.includes('fcfs') || qLower.includes('head-of-line') || qLower.includes('fifo')) {
    const fcfsWT = results?.fcfs?.avgWT !== undefined ? results.fcfs.avgWT.toFixed(2) : 'high';
    const penaltyMargin = bestWT > 0 ? (((Number(fcfsWT) - bestWT) / bestWT) * 100).toFixed(0) : 'substantial';
    return `1. Direct Technical Answer:
FCFS incurs an average waiting time of ${fcfsWT}ms, representing a ${penaltyMargin}% queue delay penalty relative to ${winner.toUpperCase()} (${bestWT.toFixed(2)}ms). This latency inflation is driven by head-of-line convoy blocking behind high-burst tasks.

2. Kernel Principle & Grounding:
As detailed in [${topChunk.title}], when a long CPU-bound process monopolizes the single core non-preemptively, shorter interactive and I/O tasks are stalled in the ready queue. System throughput plummets while peripherals remain idle, and ready-queue residency spikes dramatically.

3. Actionable Recommendation:
Deploy preemptive time-slicing via ${winner.toUpperCase()} or Round Robin with quantum tuned to ${p80Quantum}ms. This slices lengthy compute blocks into manageable intervals, allowing short interactive tasks to bypass compute hogs and flush the ready queue rapidly.`;
  }

  // Category 4: Cache Affinity / NUMA Locality / Inter-Core Migration
  if (qLower.includes('cache') || qLower.includes('affinity') || qLower.includes('numa') || qLower.includes('migration')) {
    return `1. Direct Technical Answer:
Inter-core task migration introduces a memory bus reload penalty (typically 300 to 800 microseconds) as L1/L2 data cache lines and TLB entries are invalidated. For compute-intensive tasks, preserving CPU affinity yields a 15-30% improvement in instruction-per-cycle (IPC) efficiency.

2. Kernel Principle & Grounding:
Per [${topChunk.title}], work-conserving schedulers that aggressively steal tasks across CPU sockets trigger cache line bouncing and NUMA bus contention. Schedulers must evaluate whether ready-queue imbalance exceeds the cache refill cost before migrating a thread.

3. Actionable Recommendation:
Enforce soft CPU affinity using Linux sched_setaffinity(). In multi-core schedulers, restrict task migration to within the same Last-Level Cache (LLC) domain (MC domain) and raise the migration threshold for threads with large resident memory footprints.`;
  }

  // Category 5: Work Stealing / Decentralized Runqueues / Deques
  if (qLower.includes('steal') || qLower.includes('deque') || qLower.includes('goroutine') || qLower.includes('cilk')) {
    return `1. Direct Technical Answer:
A single centralized ready queue suffers from severe lock contention beyond 4 CPU cores. Work-stealing schedulers eliminate this bottleneck by assigning a private double-ended queue (deque) to each core, allowing local LIFO execution while idle cores steal tasks from saturated peers via FIFO.

2. Kernel Principle & Grounding:
As formalized in [${topChunk.title}], work-stealing achieves near-linear theoretical speedup: parallel execution time T_p <= (Work / P) + O(Span). Local LIFO execution preserves warm CPU cache state, while remote FIFO stealing minimizes queue synchronization overhead.

3. Actionable Recommendation:
Adopt a decentralized deque topology: push and pop locally without locks (e.g. Chase-Lev deque), and initiate randomized peer steals only when the local ready queue is completely exhausted.`;
  }

  // Category 6: Linux Completely Fair Scheduler (CFS) / vruntime
  if (qLower.includes('cfs') || qLower.includes('vruntime') || qLower.includes('completely fair') || qLower.includes('nice')) {
    return `1. Direct Technical Answer:
Linux CFS models an ideal multi-tasking processor by tracking virtual runtime (vruntime) for each task. The process with the minimum vruntime is always selected next for execution via a self-balancing Red-Black Tree in O(1) time.

2. Kernel Principle & Grounding:
According to [${topChunk.title}], vruntime advances inversely proportional to task weight: vruntime += delta_exec * (1024 / task_weight). Interactive tasks that frequently block on I/O accumulate less vruntime, naturally acquiring priority when they re-enter the ready queue without heuristic priority tweaking.

3. Actionable Recommendation:
Map workload priorities to Linux nice levels: assign interactive threads nice -5 (weight 3121) and compute batch tasks nice +5 (weight 335), guaranteeing fair CPU bandwidth sharing while insulating user interactions from latency degradation.`;
  }

  // Category 7: Real-Time Dispatching / Deadlines / EDF / POSIX
  if (qLower.includes('realtime') || qLower.includes('deadline') || qLower.includes('edf') || qLower.includes('sched_fifo') || qLower.includes('freertos')) {
    return `1. Direct Technical Answer:
For hard real-time requirements, throughput is secondary to deterministic deadline guarantees. Earliest Deadline First (EDF) dynamically prioritizes tasks closest to their absolute deadline, provably scheduling task sets up to 100% CPU utilization without missed deadlines.

2. Kernel Principle & Grounding:
Per [${topChunk.title}], static priority schemes (Rate Monotonic) are bounded by Liu & Layland's bound (approx 69.3% utilization for large n), whereas dynamic deadline schedulers (EDF / Linux SCHED_DEADLINE) maintain schedulability under higher utilization by re-evaluating urgency at every boundary.

3. Actionable Recommendation:
Isolate real-time threads using POSIX SCHED_DEADLINE with strict runtime and deadline reservations, or apply SCHED_FIFO with bounded burst times to prevent real-time threads from starving essential kernel maintenance tasks.`;
  }

  // Category 8: Burst Prediction / Exponential Smoothing
  if (qLower.includes('predict') || qLower.includes('smoothing') || qLower.includes('burst estimation') || qLower.includes('tau')) {
    return `1. Direct Technical Answer:
Because exact CPU burst durations cannot be known in advance for non-trivial programs, schedulers employ exponential smoothing: tau_{n+1} = alpha * t_n + (1 - alpha) * tau_n. Setting alpha=0.5 strikes the optimal balance between historical stability and rapid adaptation to phase transitions.

2. Kernel Principle & Grounding:
According to [${topChunk.title}], approximating burst length enables Shortest Job First (SJF) and SRTF heuristics in practical runtime engines, delivering close to theoretical optimal waiting times without requiring compiler-inserted burst annotations.

3. Actionable Recommendation:
Implement an exponential moving average (EWMA) tracking past CPU burst durations for each thread. Direct threads with small predicted bursts (tau < 4ms) to high-priority interactive queues and route long bursts to batch workers.`;
  }

  // Category 9: Priority Inversion / Mutex Locks / Mars Pathfinder
  if (qLower.includes('inversion') || qLower.includes('inheritance') || qLower.includes('pathfinder') || qLower.includes('mutex')) {
    return `1. Direct Technical Answer:
Priority inversion occurs when a low-priority thread holding a shared lock blocks a high-priority thread, while an intermediate-priority thread preempts the low-priority lock holder. The high-priority thread is indirectly starved by the medium thread, defying priority scheduling guarantees.

2. Kernel Principle & Grounding:
Per [${topChunk.title}], unmitigated priority inversion caused the famous 1997 Mars Pathfinder system resets. Standard fix is the Priority Inheritance Protocol: the lock-holding task temporarily inherits the priority of the highest-priority blocked waiting task until releasing the mutex.

3. Actionable Recommendation:
Ensure all shared mutual-exclusion locks are initialized with PTHREAD_PRIO_INHERIT in POSIX environments. This caps the inversion duration to strictly the execution time of the low-priority critical section.`;
  }

  // Category 10: Kleinrock Conservation Law / Queue Trade-offs
  if (qLower.includes('tradeoff') || qLower.includes('kleinrock') || qLower.includes('conservation') || qLower.includes('variance')) {
    return `1. Direct Technical Answer:
Under Kleinrock's Conservation Law, any work-conserving single-core scheduler satisfies sum(rho_i * W_i) = Constant. While SRTF and SJF lower the average waiting time by prioritizing short tasks, they mathematically increase the variance of wait times and inflate latency for large jobs.

2. Kernel Principle & Grounding:
As established in [${topChunk.title}], no algorithm can simultaneously achieve minimum average waiting time, zero variance, and strict fairness on a single CPU. Optimizing for interactive responsiveness inevitably trades off batch task completion consistency.

3. Actionable Recommendation:
Balance interactive responsiveness against batch throughput by deploying Multi-Level Feedback Queues or CFS target latency policies, bounding tail latency without sacrificing short-task responsiveness.`;
  }

  // Category 11: Little's Law & Metrics (TAT vs WT vs RT)
  if (qLower.includes('little') || qLower.includes('tat') || qLower.includes('metric') || qLower.includes('turnaround') || qLower.includes('formula')) {
    return `1. Direct Technical Answer:
By Little's Law (L = lambda * W), queue backlog is directly proportional to arrival rate and waiting time. Operating system metrics are strictly linked: Turnaround Time (TAT) = Waiting Time (WT) + Burst Time, while Response Time measures the elapsed interval from arrival to first dispatch.

2. Kernel Principle & Grounding:
According to [${topChunk.title}], minimizing average turnaround time is mathematically equivalent to minimizing average waiting time. Work-conserving dispatchers guarantee that CPU utilization remains 100% whenever ready tasks exist.

3. Actionable Recommendation:
Audit scheduler telemetry to verify that avgTAT exactly equals avgWT + avgBurst. If ready-queue depth spikes, implement admission backpressure to prevent waiting time explosion under Little’s Law.`;
  }

  // Category 12: General / Why Winning Algorithm Won
  const marginPercent = bestWT > 0 ? (((runnerUpWT - bestWT) / bestWT) * 100).toFixed(1) : '15.0';
  return `1. Direct Technical Answer:
${winner.toUpperCase()} proved optimal for this ${n}-task workload, achieving an average waiting time of ${bestWT.toFixed(2)}ms and outperforming ${runnerUp.toUpperCase()} (${runnerUpWT.toFixed(2)}ms) by ${marginPercent}%.

2. Kernel Principle & Grounding:
Per [${topChunk.title}] and [${secondChunk.title}], shortest-remaining dynamic dispatching minimizes cumulative queue residency by clearing tasks with small remaining execution times at each arrival boundary, avoiding convoy delays while keeping CPU utilization high.

3. Actionable Recommendation:
To emulate this behavior in production general-purpose kernels, adjust Linux CFS task nice levels to favor interactive threads while setting sysctl_sched_min_granularity near ${p80Quantum}ms to protect batch compute jobs with dynamic priority aging.`;
}

// ==========================================
// SYSTEM 4: Post-Simulation AI Explainer
// ==========================================
app.post('/api/generate-insights', createRateLimiter(30, 60000, 'ai-insights'), aiConcurrencyLimiter, async (req, res) => {
  const { context, provider = 'gemini', model, openRouterApiKey } = req.body;
  if (!context || typeof context !== 'string') {
    return res.status(400).json({ error: 'Context document string is required' });
  }

  // RAG enhancement: Retrieve key OS principles using BM25 engine
  const relevantKnowledge = retrieveRAGKnowledge('best algorithm wait time tradeoff convoy starvation cfs', 'scheduling', 3);
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

app.post('/api/explain-workload', createRateLimiter(30, 60000, 'ai-explain'), aiConcurrencyLimiter, async (req, res) => {
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

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`CPU Scheduling Server running at http://0.0.0.0:${PORT}`);
  });

  const shutdown = (signal: string) => {
    console.log(`Received ${signal}. Shutting down HTTP server cleanly...`);
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer();
