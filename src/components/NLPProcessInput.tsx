import React, { useState, useEffect } from 'react';
import { ProcessInput } from '../types';
import {
  Sparkles,
  Loader2,
  AlertCircle,
  RotateCcw,
  ArrowRight,
  CheckCircle2,
  History,
  Settings,
  Key,
  Wifi,
  Plus,
  Trash2,
  Cpu,
  Globe,
  Sliders,
  Eye,
  EyeOff,
} from 'lucide-react';

export const PROCESS_TYPE_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  interactive: { bg: 'rgba(0, 212, 255, 0.15)', text: '#00d4ff', border: 'rgba(0, 212, 255, 0.4)' },
  'cpu-bound': { bg: 'rgba(255, 140, 66, 0.15)', text: '#ff8c42', border: 'rgba(255, 140, 66, 0.4)' },
  'io-bound': { bg: 'rgba(155, 114, 247, 0.15)', text: '#9b72f7', border: 'rgba(155, 114, 247, 0.4)' },
  batch: { bg: 'rgba(122, 128, 153, 0.15)', text: '#7a8099', border: 'rgba(122, 128, 153, 0.4)' },
  realtime: { bg: 'rgba(255, 77, 109, 0.15)', text: '#ff4d6d', border: 'rgba(255, 77, 109, 0.4)' },
};

export interface ExtractedTask {
  name: string;
  burst: number;
  priority: number;
  arrival: number;
  type: string;
}

interface NLPProcessInputProps {
  onWorkloadParsed: (
    processes: ProcessInput[],
    names: string[],
    types: string[]
  ) => void;
}

const DRAFT_PROMPT_KEY = 'remix_nlp_prompt_draft_v3';
const DRAFT_TASKS_KEY = 'remix_nlp_extracted_tasks_v3';
const OPENROUTER_KEY_STORAGE = 'remix_openrouter_api_key';
const SELECTED_PROVIDER_STORAGE = 'remix_selected_ai_provider';
const SELECTED_MODEL_STORAGE = 'remix_selected_ai_model';

const OPENROUTER_MODELS = [
  { id: 'meta-llama/llama-3.3-70b-instruct:free', name: 'Llama 3.3 70B (Free)', provider: 'Meta', badge: 'Free / Fast' },
  { id: 'mistralai/mistral-small-24b-instruct-2501:free', name: 'Mistral Small 24B (Free)', provider: 'Mistral', badge: 'Free / Efficient' },
  { id: 'google/gemini-2.0-flash-001', name: 'Gemini 2.0 Flash (OpenRouter)', provider: 'Google', badge: 'Ultra-Fast' },
  { id: 'deepseek/deepseek-chat', name: 'DeepSeek V3', provider: 'DeepSeek', badge: 'Advanced Reasoning' },
  { id: 'openai/gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', badge: 'Fast / Accurate' },
  { id: 'anthropic/claude-3.5-haiku', name: 'Claude 3.5 Haiku', provider: 'Anthropic', badge: 'High Quality' },
  { id: 'custom', name: 'Custom Model...', provider: 'OpenRouter', badge: 'Configurable' },
];

const GEMINI_MODELS = [
  { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash (Recommended)', badge: 'Default' },
  { id: 'gemini-flash-latest', name: 'Gemini Flash Latest', badge: 'Fast' },
  { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite', badge: 'Lightweight' },
];

const EXAMPLE_WORKLOADS = [
  {
    label: 'Media & Sync Workload',
    text: 'I have a video encoder that takes 12 seconds, a mouse click handler that needs instant response, and 3 background sync tasks that do not matter much.',
  },
  {
    label: 'Web API & Database',
    text: 'A fast HTTP gateway taking 2ms, a database indexer taking 14ms, an in-memory cache update taking 4ms, and 2 background telemetry loggers.',
  },
  {
    label: 'Realtime Autonomous System',
    text: 'A flight telemetry sensor needing 1ms real-time priority, a camera LiDAR mapper taking 8ms, an actuator servo taking 2ms, and an offline black-box recorder.',
  },
  {
    label: 'Convoy Effect Stress Test',
    text: 'A mammoth monolithic database backup taking 20ms arriving at t=0, followed immediately by 5 microservice requests each taking 2ms.',
  },
];

export const NLPProcessInput: React.FC<NLPProcessInputProps> = ({ onWorkloadParsed }) => {
  const [promptText, setPromptText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [extractedTasks, setExtractedTasks] = useState<ExtractedTask[]>([]);
  const [unfinishedDraftFound, setUnfinishedDraftFound] = useState(false);
  const [newlyAddedIndices, setNewlyAddedIndices] = useState<Set<number>>(new Set());

  // Provider configuration state
  const [provider, setProvider] = useState<'gemini' | 'openrouter' | 'heuristic'>('gemini');
  const [selectedModel, setSelectedModel] = useState<string>('gemini-3.8-flash');
  const [customModelInput, setCustomModelInput] = useState<string>('');
  const [openRouterApiKey, setOpenRouterApiKey] = useState<string>('');
  const [showApiKeyInput, setShowApiKeyInput] = useState(false);
  const [showSettingsDrawer, setShowSettingsDrawer] = useState(false);
  const [serverProvidersInfo, setServerProvidersInfo] = useState<{
    gemini?: { available: boolean };
    openrouter?: { available: boolean; hasEnvKey: boolean };
  } | null>(null);

  // Diagnostic Test state
  const [isTestingProvider, setIsTestingProvider] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    provider: string;
    model?: string;
    latencyMs?: number;
    error?: string;
  } | null>(null);

  // Restore saved state & provider settings on mount
  useEffect(() => {
    try {
      const savedPrompt = localStorage.getItem(DRAFT_PROMPT_KEY);
      const savedTasksJson = localStorage.getItem(DRAFT_TASKS_KEY);
      const savedProvider = localStorage.getItem(SELECTED_PROVIDER_STORAGE) as 'gemini' | 'openrouter' | 'heuristic' | null;
      const savedModel = localStorage.getItem(SELECTED_MODEL_STORAGE);
      try {
        localStorage.removeItem(OPENROUTER_KEY_STORAGE);
      } catch {
        // Ignore
      }

      if (savedPrompt) setPromptText(savedPrompt);
      if (savedTasksJson) {
        const parsed = JSON.parse(savedTasksJson);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setExtractedTasks(parsed);
          setUnfinishedDraftFound(true);
        }
      }
      if (savedProvider && ['gemini', 'openrouter', 'heuristic'].includes(savedProvider)) {
        setProvider(savedProvider);
      }
      if (savedModel) setSelectedModel(savedModel);
      // Note: OpenRouter API key is kept ephemeral in session memory only (CPU-005)
    } catch {
      // Ignore
    }

    // Fetch server provider capabilities
    fetch('/api/ai-providers')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) setServerProvidersInfo(data);
      })
      .catch(() => {
        // Ignore network errors on init
      });
  }, []);

  const handleProviderChange = (newProvider: 'gemini' | 'openrouter' | 'heuristic') => {
    setProvider(newProvider);
    setTestResult(null);
    try {
      localStorage.setItem(SELECTED_PROVIDER_STORAGE, newProvider);
    } catch {
      // Ignore
    }

    // Set appropriate default model
    if (newProvider === 'gemini') {
      setSelectedModel('gemini-3.8-flash');
      try {
        localStorage.setItem(SELECTED_MODEL_STORAGE, 'gemini-3.8-flash');
      } catch {
        // Ignore
      }
    } else if (newProvider === 'openrouter') {
      const defaultOR = 'meta-llama/llama-3.3-70b-instruct:free';
      setSelectedModel(defaultOR);
      try {
        localStorage.setItem(SELECTED_MODEL_STORAGE, defaultOR);
      } catch {
        // Ignore
      }
    }
  };

  const handleModelChange = (modelId: string) => {
    setSelectedModel(modelId);
    setTestResult(null);
    try {
      localStorage.setItem(SELECTED_MODEL_STORAGE, modelId);
    } catch {
      // Ignore
    }
  };

  const handleApiKeyChange = (key: string) => {
    setOpenRouterApiKey(key);
    // Ephemeral in-memory only (CPU-005): Never store API key in browser localStorage
  };

  const handleTextChange = (text: string) => {
    setPromptText(text);
    try {
      localStorage.setItem(DRAFT_PROMPT_KEY, text);
    } catch {
      // Ignore
    }
  };

  // Run real-time connection diagnostic test
  const handleTestProviderConnection = async () => {
    setIsTestingProvider(true);
    setTestResult(null);

    const activeModel =
      provider === 'openrouter' && selectedModel === 'custom'
        ? customModelInput.trim() || 'meta-llama/llama-3.3-70b-instruct:free'
        : selectedModel;

    try {
      const res = await fetch('/api/test-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          model: activeModel,
          openRouterApiKey: openRouterApiKey.trim() || undefined,
        }),
      });

      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({
        success: false,
        provider,
        error: err?.message || 'Network error communicating with test endpoint',
      });
    } finally {
      setIsTestingProvider(false);
    }
  };

  // Main synthesis function with Continuation / Resume
  const handleParse = async (overrideText?: string, continueFromExisting = false) => {
    const textToSubmit = (overrideText !== undefined ? overrideText : promptText).trim();
    if (!textToSubmit) {
      setErrorMsg('Please enter a plain-English workload description first.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    const activeModel =
      provider === 'openrouter' && selectedModel === 'custom'
        ? customModelInput.trim() || 'meta-llama/llama-3.3-70b-instruct:free'
        : selectedModel;

    const providerLabel =
      provider === 'openrouter'
        ? `OpenRouter (${activeModel})`
        : provider === 'gemini'
        ? `Gemini (${activeModel})`
        : 'Deterministic Synthesizer';

    setStatusMsg(
      continueFromExisting
        ? `Resuming parsing from ${extractedTasks.length} existing tasks using ${providerLabel}...`
        : `Parsing workload description with ${providerLabel}...`
    );

    try {
      const payload: {
        prompt: string;
        existingProcesses?: ExtractedTask[];
        provider: string;
        model?: string;
        openRouterApiKey?: string;
      } = {
        prompt: textToSubmit,
        provider,
        model: activeModel,
      };

      if (openRouterApiKey.trim()) {
        payload.openRouterApiKey = openRouterApiKey.trim();
      }

      const priorCount = continueFromExisting ? extractedTasks.length : 0;
      if (continueFromExisting && extractedTasks.length > 0) {
        payload.existingProcesses = extractedTasks;
      }

      const response = await fetch('/api/parse-workload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data = await response.json();
      if (!data.processes || !Array.isArray(data.processes) || data.processes.length === 0) {
        throw new Error('Model did not return a valid process workload structure.');
      }

      const rawList = data.processes as ExtractedTask[];

      // Track newly added indices for continuation visual indicator
      if (continueFromExisting) {
        const newlyAdded = new Set<number>();
        for (let i = priorCount; i < rawList.length; i++) {
          newlyAdded.add(i);
        }
        setNewlyAddedIndices(newlyAdded);
      } else {
        setNewlyAddedIndices(new Set());
      }

      // Update state and persistent draft
      setExtractedTasks(rawList);
      setUnfinishedDraftFound(false);
      try {
        localStorage.setItem(DRAFT_TASKS_KEY, JSON.stringify(rawList));
      } catch {
        // Ignore
      }

      // Convert to app process format & apply
      applyTasksToSimulation(rawList);

      const addedMsg =
        continueFromExisting && data.newAddedCount !== undefined
          ? `Resumed successfully! Added ${data.newAddedCount} remaining processes (Total: ${rawList.length}).`
          : `Synthesized ${rawList.length} processes from workload description via ${data.source || provider}.`;

      setStatusMsg(addedMsg);
    } catch (err: any) {
      console.error('Workload parser error:', err);
      setErrorMsg(
        err?.message ||
          'Parsing was interrupted. You can resume and continue from where it left off.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const applyTasksToSimulation = (tasks: ExtractedTask[]) => {
    const newProcesses: ProcessInput[] = tasks.map((p, idx) => ({
      id: idx,
      arrival: Math.max(0, Number(p.arrival) || 0),
      burst: Math.max(1, Math.min(20, Number(p.burst) || 4)),
      priority: Math.max(1, Math.min(5, Number(p.priority) || 3)),
    }));

    const newNames = tasks.map((p, idx) => p.name || `Task ${idx + 1}`);
    const newTypes = tasks.map((p) => p.type || 'cpu-bound');

    onWorkloadParsed(newProcesses, newNames, newTypes);
  };

  const handleClearDraft = () => {
    setExtractedTasks([]);
    setUnfinishedDraftFound(false);
    setStatusMsg(null);
    setErrorMsg(null);
    setNewlyAddedIndices(new Set());
    try {
      localStorage.removeItem(DRAFT_TASKS_KEY);
    } catch {
      // Ignore
    }
  };

  const handleUpdateTask = (index: number, field: keyof ExtractedTask, value: any) => {
    const updated = [...extractedTasks];
    updated[index] = { ...updated[index], [field]: value };
    setExtractedTasks(updated);
    try {
      localStorage.setItem(DRAFT_TASKS_KEY, JSON.stringify(updated));
    } catch {
      // Ignore
    }
    applyTasksToSimulation(updated);
  };

  const handleRemoveTask = (index: number) => {
    const filtered = extractedTasks.filter((_, i) => i !== index);
    setExtractedTasks(filtered);
    try {
      localStorage.setItem(DRAFT_TASKS_KEY, JSON.stringify(filtered));
    } catch {
      // Ignore
    }
    applyTasksToSimulation(filtered);
  };

  const handleAddManualTask = () => {
    const newTask: ExtractedTask = {
      name: `New Task ${extractedTasks.length + 1}`,
      burst: 4,
      priority: 3,
      arrival: extractedTasks.length > 0 ? extractedTasks[extractedTasks.length - 1].arrival + 1 : 0,
      type: 'interactive',
    };
    const updated = [...extractedTasks, newTask];
    setExtractedTasks(updated);
    try {
      localStorage.setItem(DRAFT_TASKS_KEY, JSON.stringify(updated));
    } catch {
      // Ignore
    }
    applyTasksToSimulation(updated);
  };

  // Quick prompt append helpers
  const handleAppendPrompt = (phrase: string) => {
    const newPrompt = promptText.trim() ? `${promptText.trim()}, and ${phrase}` : phrase;
    setPromptText(newPrompt);
    handleTextChange(newPrompt);
  };

  // Calculate live summary stats for characterization badge
  const totalBurst = extractedTasks.reduce((acc, t) => acc + t.burst, 0);
  const avgBurst = extractedTasks.length > 0 ? (totalBurst / extractedTasks.length).toFixed(1) : '0';
  const dominantType =
    extractedTasks.length > 0
      ? (Object.entries(
          extractedTasks.reduce((acc, t) => {
            acc[t.type] = (acc[t.type] || 0) + 1;
            return acc;
          }, {} as Record<string, number>)
        ) as [string, number][]).sort((a, b) => b[1] - a[1])[0]?.[0] || 'mixed'
      : 'mixed';

  return (
    <div
      style={{
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        borderRight: '1px solid var(--border)',
        borderBottom: '1px solid var(--border)',
        borderLeft: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '1.2rem',
        marginBottom: '1.25rem',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      {/* Top Header & Provider Controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '0.85rem',
          flexWrap: 'wrap',
          gap: '0.6rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div
            style={{
              width: '30px',
              height: '30px',
              borderRadius: '6px',
              background: 'var(--accent-light)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)',
            }}
          >
            <Sparkles size={17} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: 'var(--text)' }}>
                NLP Workload Synthesizer
              </h3>
              <span
                style={{
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  padding: '1px 6px',
                  borderRadius: '10px',
                  background: 'var(--accent-light)',
                  color: 'var(--accent)',
                }}
              >
                v2.4 Multi-Provider
              </span>
            </div>
            <span style={{ fontSize: '0.74rem', color: 'var(--dim)' }}>
              Convert natural language workload descriptions into rigorous CPU benchmarks with seamless resumption
            </span>
          </div>
        </div>

        {/* Provider Switcher Pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'inline-flex',
              background: 'var(--surface-secondary)',
              padding: '2px',
              borderRadius: '6px',
              borderTop: '1px solid var(--border)',
              borderRight: '1px solid var(--border)',
              borderBottom: '1px solid var(--border)',
              borderLeft: '1px solid var(--border)',
            }}
          >
            <button
              type="button"
              onClick={() => handleProviderChange('gemini')}
              style={{
                background: provider === 'gemini' ? 'var(--accent)' : 'transparent',
                color: provider === 'gemini' ? '#fff' : 'var(--text)',
                border: 'none',
                borderRadius: '4px',
                padding: '0.25rem 0.65rem',
                fontSize: '0.74rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                transition: 'all 0.15s ease',
              }}
            >
              <Cpu size={12} />
              <span>Gemini</span>
            </button>

            <button
              type="button"
              onClick={() => handleProviderChange('openrouter')}
              style={{
                background: provider === 'openrouter' ? 'var(--accent)' : 'transparent',
                color: provider === 'openrouter' ? '#fff' : 'var(--text)',
                border: 'none',
                borderRadius: '4px',
                padding: '0.25rem 0.65rem',
                fontSize: '0.74rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                transition: 'all 0.15s ease',
              }}
            >
              <Globe size={12} />
              <span>OpenRouter</span>
            </button>

            <button
              type="button"
              onClick={() => handleProviderChange('heuristic')}
              style={{
                background: provider === 'heuristic' ? 'var(--accent)' : 'transparent',
                color: provider === 'heuristic' ? '#fff' : 'var(--text)',
                border: 'none',
                borderRadius: '4px',
                padding: '0.25rem 0.65rem',
                fontSize: '0.74rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.3rem',
                transition: 'all 0.15s ease',
              }}
              title="Fast offline regex classifier without API dependencies"
            >
              <span>Offline Heuristic</span>
            </button>
          </div>

          {/* Provider Settings Toggle */}
          <button
            type="button"
            onClick={() => setShowSettingsDrawer(!showSettingsDrawer)}
            title="Configure AI Provider & Model Options"
            style={{
              background: showSettingsDrawer ? 'var(--accent-light)' : 'var(--surface-secondary)',
              color: showSettingsDrawer ? 'var(--accent)' : 'var(--text)',
              borderTop: '1px solid var(--border)',
              borderRight: '1px solid var(--border)',
              borderBottom: '1px solid var(--border)',
              borderLeft: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '0.35rem 0.55rem',
              fontSize: '0.74rem',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.3rem',
            }}
          >
            <Sliders size={13} />
            <span>Options</span>
          </button>
        </div>
      </div>

      {/* Expanded Provider & Model Drawer */}
      {showSettingsDrawer && (
        <div
          style={{
            background: 'var(--surface-secondary)',
            borderTop: '1px solid var(--border)',
            borderRight: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
            borderLeft: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '0.85rem',
            marginBottom: '0.85rem',
            fontSize: '0.78rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.65rem',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <Settings size={14} style={{ color: 'var(--accent)' }} />
              <strong>
                {provider === 'openrouter'
                  ? 'OpenRouter Provider Settings'
                  : provider === 'gemini'
                  ? 'Google Gemini Provider Settings'
                  : 'Deterministic Heuristic Mode'}
              </strong>
            </div>

            {/* Diagnostics Quick Test */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <button
                type="button"
                onClick={handleTestProviderConnection}
                disabled={isTestingProvider}
                style={{
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  borderTop: '1px solid var(--border)',
                  borderRight: '1px solid var(--border)',
                  borderBottom: '1px solid var(--border)',
                  borderLeft: '1px solid var(--border)',
                  borderRadius: '4px',
                  padding: '0.25rem 0.6rem',
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  cursor: isTestingProvider ? 'not-allowed' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                {isTestingProvider ? (
                  <Loader2 size={12} className="animate-spin" />
                ) : (
                  <Wifi size={12} style={{ color: 'var(--accent)' }} />
                )}
                <span>Test Connection</span>
              </button>
            </div>
          </div>

          {/* Model Selection Row */}
          {provider === 'openrouter' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', marginBottom: '0.65rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                <label style={{ fontWeight: 600, minWidth: '90px' }}>OpenRouter Model:</label>
                <select
                  value={selectedModel}
                  onChange={(e) => handleModelChange(e.target.value)}
                  style={{
                    background: 'var(--surface)',
                    color: 'var(--text)',
                    borderTop: '1px solid var(--border)',
                    borderRight: '1px solid var(--border)',
                    borderBottom: '1px solid var(--border)',
                    borderLeft: '1px solid var(--border)',
                    borderRadius: '4px',
                    padding: '0.35rem 0.6rem',
                    fontSize: '0.76rem',
                    fontFamily: 'IBM Plex Mono, monospace',
                    outline: 'none',
                    minWidth: '240px',
                  }}
                >
                  {OPENROUTER_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} [{m.badge}]
                    </option>
                  ))}
                </select>

                {serverProvidersInfo?.openrouter?.hasEnvKey && (
                  <span
                    style={{
                      fontSize: '0.68rem',
                      color: 'var(--green)',
                      background: 'rgba(62, 207, 142, 0.1)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      border: '1px solid rgba(62, 207, 142, 0.3)',
                    }}
                  >
                    ✓ OPENROUTER_API_KEY detected in env
                  </span>
                )}
              </div>

              {selectedModel === 'custom' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label style={{ fontWeight: 600, minWidth: '90px' }}>Custom ID:</label>
                  <input
                    type="text"
                    value={customModelInput}
                    onChange={(e) => setCustomModelInput(e.target.value)}
                    placeholder="e.g. qwen/qwen-2.5-72b-instruct or nousresearch/hermes-3-llama-3.1-405b"
                    style={{
                      flex: 1,
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      borderTop: '1px solid var(--border)',
                      borderRight: '1px solid var(--border)',
                      borderBottom: '1px solid var(--border)',
                      borderLeft: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '0.35rem 0.6rem',
                      fontSize: '0.76rem',
                      fontFamily: 'IBM Plex Mono, monospace',
                      outline: 'none',
                    }}
                  />
                </div>
              )}

              {/* Optional Custom OpenRouter Key Override */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
                <label style={{ fontWeight: 600, minWidth: '90px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Key size={11} />
                  <span>API Key:</span>
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flex: 1, maxWidth: '420px' }}>
                  <input
                    type={showApiKeyInput ? 'text' : 'password'}
                    value={openRouterApiKey}
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    placeholder={
                      serverProvidersInfo?.openrouter?.hasEnvKey
                        ? 'Using OPENROUTER_API_KEY from environment (or paste custom override)'
                        : 'Optional custom OpenRouter API Key (sk-or-v1-...)'
                    }
                    style={{
                      flex: 1,
                      background: 'var(--surface)',
                      color: 'var(--text)',
                      borderTop: '1px solid var(--border)',
                      borderRight: '1px solid var(--border)',
                      borderBottom: '1px solid var(--border)',
                      borderLeft: '1px solid var(--border)',
                      borderRadius: '4px',
                      padding: '0.3rem 0.55rem',
                      fontSize: '0.74rem',
                      fontFamily: 'IBM Plex Mono, monospace',
                      outline: 'none',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKeyInput(!showApiKeyInput)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: 'var(--dim)',
                      cursor: 'pointer',
                      padding: '4px',
                    }}
                    title={showApiKeyInput ? 'Hide Key' : 'Show Key'}
                  >
                    {showApiKeyInput ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <span style={{ fontSize: '0.68rem', color: 'var(--dim)' }}>
                  Ephemeral in-memory session only; never stored in browser storage
                </span>
              </div>
            </div>
          )}

          {provider === 'gemini' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
              <label style={{ fontWeight: 600, minWidth: '90px' }}>Gemini Model:</label>
              <select
                value={selectedModel}
                onChange={(e) => handleModelChange(e.target.value)}
                style={{
                  background: 'var(--surface)',
                  color: 'var(--text)',
                  borderTop: '1px solid var(--border)',
                  borderRight: '1px solid var(--border)',
                  borderBottom: '1px solid var(--border)',
                  borderLeft: '1px solid var(--border)',
                  borderRadius: '4px',
                  padding: '0.35rem 0.6rem',
                  fontSize: '0.76rem',
                  fontFamily: 'IBM Plex Mono, monospace',
                  outline: 'none',
                  minWidth: '240px',
                }}
              >
                {GEMINI_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} [{m.badge}]
                  </option>
                ))}
              </select>
              <span style={{ fontSize: '0.7rem', color: 'var(--dim)' }}>
                Server-side managed with automatic fallback to flash-latest
              </span>
            </div>
          )}

          {provider === 'heuristic' && (
            <p style={{ margin: 0, fontSize: '0.74rem', color: 'var(--dim)' }}>
              Offline Heuristic Synthesizer operates without network API keys. It extracts processes via deterministic kernel grammar rules and regex classifiers with 0ms latency.
            </p>
          )}

          {/* Test Diagnostic Result Banner */}
          {testResult && (
            <div
              style={{
                marginTop: '0.65rem',
                padding: '0.5rem 0.75rem',
                borderRadius: '4px',
                fontSize: '0.74rem',
                background: testResult.success ? 'rgba(62, 207, 142, 0.12)' : 'rgba(235, 59, 90, 0.12)',
                borderTop: `1px solid ${testResult.success ? 'var(--green)' : 'var(--red)'}`,
                borderRight: `1px solid ${testResult.success ? 'var(--green)' : 'var(--red)'}`,
                borderBottom: `1px solid ${testResult.success ? 'var(--green)' : 'var(--red)'}`,
                borderLeft: `4px solid ${testResult.success ? 'var(--green)' : 'var(--red)'}`,
                color: testResult.success ? 'var(--green)' : 'var(--red)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.4rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                {testResult.success ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                <span>
                  <strong>{testResult.provider.toUpperCase()} Diagnostic:</strong>{' '}
                  {testResult.success
                    ? `Connected successfully! Model '${testResult.model}' responded in ${testResult.latencyMs}ms.`
                    : `Test failed: ${testResult.error}`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setTestResult(null)}
                style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.7rem' }}
              >
                ✕ Close
              </button>
            </div>
          )}
        </div>
      )}

      {/* Unfinished or Saved Draft Notice with Continue / Resume */}
      {unfinishedDraftFound && extractedTasks.length > 0 && !isLoading && (
        <div
          style={{
            background: 'rgba(79, 142, 247, 0.1)',
            borderTop: '1px solid rgba(79, 142, 247, 0.3)',
            borderRight: '1px solid rgba(79, 142, 247, 0.3)',
            borderBottom: '1px solid rgba(79, 142, 247, 0.3)',
            borderLeft: '4px solid var(--accent)',
            borderRadius: '6px',
            padding: '0.65rem 0.85rem',
            marginBottom: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.6rem',
            fontSize: '0.78rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text)' }}>
            <History size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
            <span>
              <strong>Unfinished Synthesis Session:</strong> {extractedTasks.length} processes previously extracted and saved. You can continue extracting remaining tasks from where it left off.
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <button
              type="button"
              onClick={() => handleParse(undefined, true)}
              style={{
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                padding: '0.3rem 0.65rem',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <ArrowRight size={13} />
              <span>Continue from Task {extractedTasks.length}</span>
            </button>
            <button
              type="button"
              onClick={handleClearDraft}
              style={{
                background: 'transparent',
                color: 'var(--dim)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: '0.3rem 0.55rem',
                fontSize: '0.72rem',
                cursor: 'pointer',
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Input Text Area */}
      <div style={{ position: 'relative', marginBottom: '0.75rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
          <label
            htmlFor="nlp-workload-description"
            style={{
              fontSize: '0.8rem',
              fontWeight: 700,
              color: 'var(--text)',
            }}
          >
            Workload Specification (Plain English)
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span
              style={{
                fontSize: '0.68rem',
                fontFamily: 'IBM Plex Mono, monospace',
                color: 'var(--dim)',
              }}
            >
              Active Provider: {provider === 'openrouter' ? `OpenRouter (${selectedModel})` : provider === 'gemini' ? `Gemini (${selectedModel})` : 'Offline Heuristic'}
            </span>
          </div>
        </div>

        <textarea
          id="nlp-workload-description"
          rows={3}
          value={promptText}
          onChange={(e) => handleTextChange(e.target.value)}
          placeholder='e.g. "I have a video encoder that takes 12 seconds, a mouse click handler that needs instant response, and 3 background sync tasks that do not matter much"'
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: 'var(--surface-secondary)',
            borderTop: '1px solid var(--border)',
            borderRight: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
            borderLeft: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '0.75rem',
            fontSize: '0.85rem',
            color: 'var(--text)',
            fontFamily: 'inherit',
            resize: 'vertical',
            outline: 'none',
            lineHeight: '1.5',
          }}
          disabled={isLoading}
        />
      </div>

      {/* Prompt Refinement & Append Chips */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          flexWrap: 'wrap',
          marginBottom: '0.75rem',
          fontSize: '0.72rem',
        }}
      >
        <span style={{ color: 'var(--dim)', fontWeight: 600 }}>Quick Append:</span>
        <button
          type="button"
          onClick={() => handleAppendPrompt('2 background sync tasks taking 8ms each')}
          style={{
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '2px 8px',
            fontSize: '0.7rem',
            color: 'var(--text)',
            cursor: 'pointer',
          }}
        >
          + 2 Background Sync Tasks
        </button>
        <button
          type="button"
          onClick={() => handleAppendPrompt('an instant mouse UI click handler with burst 1ms')}
          style={{
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '2px 8px',
            fontSize: '0.7rem',
            color: 'var(--text)',
            cursor: 'pointer',
          }}
        >
          + Instant Mouse Handler
        </button>
        <button
          type="button"
          onClick={() => handleAppendPrompt('a real-time audio pipeline needing 2ms priority 1')}
          style={{
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '2px 8px',
            fontSize: '0.7rem',
            color: 'var(--text)',
            cursor: 'pointer',
          }}
        >
          + Real-time Audio Stream
        </button>
        <button
          type="button"
          onClick={() => handleAppendPrompt('a heavy 16ms scientific simulation job')}
          style={{
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '2px 8px',
            fontSize: '0.7rem',
            color: 'var(--text)',
            cursor: 'pointer',
          }}
        >
          + Heavy 16ms Simulation
        </button>
      </div>

      {/* Error Banner with Continue / Retry Option */}
      {errorMsg && (
        <div
          style={{
            background: 'rgba(235, 59, 90, 0.12)',
            borderTop: '1px solid var(--red)',
            borderRight: '1px solid var(--red)',
            borderBottom: '1px solid var(--red)',
            borderLeft: '4px solid var(--red)',
            borderRadius: '6px',
            padding: '0.65rem 0.85rem',
            marginBottom: '0.75rem',
            fontSize: '0.78rem',
            color: 'var(--red)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{errorMsg}</span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            {extractedTasks.length > 0 && (
              <button
                type="button"
                onClick={() => handleParse(undefined, true)}
                disabled={isLoading}
                style={{
                  background: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '0.3rem 0.65rem',
                  fontSize: '0.72rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
              >
                <ArrowRight size={13} />
                <span>Retry &amp; Continue from Task {extractedTasks.length}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => handleParse(undefined, false)}
              disabled={isLoading}
              style={{
                background: 'transparent',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '4px',
                padding: '0.3rem 0.65rem',
                fontSize: '0.72rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
              }}
            >
              <RotateCcw size={12} />
              <span>Retry from start</span>
            </button>
          </div>
        </div>
      )}

      {/* Status banner */}
      {statusMsg && !errorMsg && (
        <div
          style={{
            background: 'rgba(62, 207, 142, 0.1)',
            borderTop: '1px solid rgba(62, 207, 142, 0.3)',
            borderRight: '1px solid rgba(62, 207, 142, 0.3)',
            borderBottom: '1px solid rgba(62, 207, 142, 0.3)',
            borderLeft: '4px solid var(--green)',
            borderRadius: '6px',
            padding: '0.55rem 0.85rem',
            marginBottom: '0.75rem',
            fontSize: '0.76rem',
            color: 'var(--green)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <CheckCircle2 size={15} style={{ flexShrink: 0 }} />
          <span>{statusMsg}</span>
        </div>
      )}

      {/* Action Footer: Quick Examples & Synthesis Actions */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.75rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--dim)', fontWeight: 600 }}>Workload Presets:</span>
          {EXAMPLE_WORKLOADS.map((eg, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setPromptText(eg.text);
                handleTextChange(eg.text);
                handleParse(eg.text, false);
              }}
              disabled={isLoading}
              style={{
                background: 'var(--surface-secondary)',
                borderTop: '1px solid var(--border)',
                borderRight: '1px solid var(--border)',
                borderBottom: '1px solid var(--border)',
                borderLeft: '1px solid var(--border)',
                borderRadius: '4px',
                padding: '0.25rem 0.55rem',
                fontSize: '0.72rem',
                color: 'var(--text)',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              title={eg.text}
            >
              {eg.label}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          {extractedTasks.length > 0 && (
            <button
              type="button"
              onClick={() => handleParse(undefined, true)}
              disabled={isLoading}
              title="Resume parsing and extract remaining processes without starting over"
              style={{
                background: 'var(--surface-secondary)',
                color: 'var(--accent)',
                borderTop: '1px solid var(--accent)',
                borderRight: '1px solid var(--accent)',
                borderBottom: '1px solid var(--accent)',
                borderLeft: '1px solid var(--accent)',
                borderRadius: '6px',
                padding: '0.5rem 0.95rem',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: isLoading ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                opacity: isLoading ? 0.6 : 1,
              }}
            >
              {isLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ArrowRight size={14} />
              )}
              <span>Continue from Task {extractedTasks.length}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => handleParse(undefined, false)}
            disabled={isLoading}
            style={{
              background: 'var(--accent)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              padding: '0.5rem 1.15rem',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: isLoading ? 'not-allowed' : 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'opacity 0.15s ease',
              opacity: isLoading ? 0.7 : 1,
            }}
          >
            {isLoading ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                <span>Synthesizing workload...</span>
              </>
            ) : (
              <>
                <Sparkles size={15} />
                <span>
                  Synthesize with {provider === 'openrouter' ? 'OpenRouter' : provider === 'gemini' ? 'Gemini' : 'Heuristic'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
