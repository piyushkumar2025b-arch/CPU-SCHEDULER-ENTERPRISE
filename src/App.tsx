/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ProcessInput, AlgorithmKey, AllResults } from './types';
import { simulateAll, validateWorkload } from './scheduler';
import { ALGO_COLORS, ALGO_NAMES, P_COLORS, GanttSection } from './components/GanttChart';
import { BreakdownTable } from './components/BreakdownTable';
import { PlotlyComparisons } from './components/PlotlyComparisons';
import {
  FormDataViewer,
  WORKLOAD_PRESETS,
  PresetWorkload,
  DEFAULT_PROCESSES,
  DEFAULT_QUANTUM,
  generateRandomMultiProcessWorkload,
} from './components/FormDataViewer';
import { PerformanceSummaryCard } from './components/PerformanceSummaryCard';
import { StepPlaybackInspector } from './components/StepPlaybackInspector';
import { QuantumSensitivityAnalyzer } from './components/QuantumSensitivityAnalyzer';
import { ThemeToggle } from './components/ThemeToggle';
import { NLPProcessInput, PROCESS_TYPE_COLORS } from './components/NLPProcessInput';
import { AIRecommendationPanel } from './components/AIRecommendationPanel';
import { StarvationRiskReport } from './components/StarvationRiskReport';
import { AIInsightPanel } from './components/AIInsightPanel';
import { AnomalyDashboard } from './components/AnomalyDashboard';
import { computeWorkloadFingerprint } from './utils/workloadFingerprint';
import { recommendAlgorithm } from './utils/algoRecommender';
import { analyzeStarvationRisks } from './utils/starvationAnalyzer';
import { detectAnomalies } from './utils/anomalyDetector';
import { RAGCopilotDrawer } from './components/RAGCopilotDrawer';
import { HelpCircle, CheckCircle2, RotateCcw, Shuffle, Plus, Play, ArrowRight, LayoutGrid, Table as TableIcon, Sparkles } from 'lucide-react';

export default function App() {
  // Initialize with 8-process default benchmark ready for extensive multi-process testing
  const [processes, setProcesses] = useState<ProcessInput[]>(DEFAULT_PROCESSES);
  const [processNames, setProcessNames] = useState<string[]>(
    DEFAULT_PROCESSES.map((_, i) => `Task ${i}`)
  );
  const [processTypes, setProcessTypes] = useState<string[]>(
    DEFAULT_PROCESSES.map((_, i) =>
      i % 5 === 0 ? 'interactive' : i % 5 === 1 ? 'cpu-bound' : i % 5 === 2 ? 'io-bound' : i % 5 === 3 ? 'batch' : 'realtime'
    )
  );
  const [processViewMode, setProcessViewMode] = useState<'cards' | 'table'>('cards');
  const [nextId, setNextId] = useState<number>(DEFAULT_PROCESSES.length);
  const [quantum, setQuantum] = useState<number>(DEFAULT_QUANTUM);
  const [activePresetId, setActivePresetId] = useState<string | null>('default-8');
  const [filterCategory, setFilterCategory] = useState<'all' | 'many' | 'stress' | 'classic'>('all');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [results, setResults] = useState<AllResults | null>(null);
  const [bestKey, setBestKey] = useState<AlgorithmKey>('fcfs');
  const [selectedInspectorAlgo, setSelectedInspectorAlgo] = useState<AlgorithmKey>('fcfs');
  const [showGuide, setShowGuide] = useState<boolean>(false);
  const [isRAGOpen, setIsRAGOpen] = useState<boolean>(false);
  const [ragInitialQuestion, setRagInitialQuestion] = useState<string | undefined>(undefined);
  const resultsRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Synchronized snapshot of the workload that produced current simulation results (CSC-005)
  const [simulatedSnapshot, setSimulatedSnapshot] = useState<{
    processes: ProcessInput[];
    quantum: number;
    processNames: string[];
    processTypes: string[];
  }>({
    processes: DEFAULT_PROCESSES,
    quantum: DEFAULT_QUANTUM,
    processNames: DEFAULT_PROCESSES.map((_, i) => `Task ${i}`),
    processTypes: DEFAULT_PROCESSES.map((_, i) =>
      i % 5 === 0 ? 'interactive' : i % 5 === 1 ? 'cpu-bound' : i % 5 === 2 ? 'io-bound' : i % 5 === 3 ? 'batch' : 'realtime'
    ),
  });

  const handleOpenRAG = (question?: string) => {
    setRagInitialQuestion(question);
    setIsRAGOpen(true);
  };

  // Deterministic statistical fingerprint & algorithm recommendation (Systems 2 & 3)
  const fingerprint = useMemo(() => {
    return computeWorkloadFingerprint(processes, processTypes);
  }, [processes, processTypes]);

  const recommendation = useMemo(() => {
    return recommendAlgorithm(fingerprint);
  }, [fingerprint]);

  const starvationRisks = useMemo(() => {
    return analyzeStarvationRisks(processes);
  }, [processes]);

  const starvationMap = useMemo(() => {
    return new Map(starvationRisks.map((r, i) => [i, r]));
  }, [starvationRisks]);

  // Compute initial simulation on mount
  useEffect(() => {
    executeSimulation(false);
    return () => {
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, []);

  const addProcess = () => {
    if (processes.length >= 16) return;
    setActivePresetId(null);
    setProcesses((prev) => [
      ...prev,
      { id: nextId, arrival: Math.max(0, ...prev.map((p) => p.arrival)), burst: 4, priority: 2 },
    ]);
    setProcessNames((prev) => [...prev, `Task ${nextId}`]);
    setProcessTypes((prev) => [...prev, 'cpu-bound']);
    setNextId((prev) => prev + 1);
  };

  const removeProcess = (id: number) => {
    if (processes.length <= 1) return;
    setActivePresetId(null);
    const idx = processes.findIndex((p) => p.id === id);
    setProcesses((prev) => prev.filter((p) => p.id !== id));
    if (idx !== -1) {
      setProcessNames((prev) => prev.filter((_, i) => i !== idx));
      setProcessTypes((prev) => prev.filter((_, i) => i !== idx));
    }
  };

  const updateProcess = (
    index: number,
    field: 'arrival' | 'burst' | 'priority',
    val: number
  ) => {
    setActivePresetId(null);
    setProcesses((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: val };
      return copy;
    });
  };

  const updateProcessType = (index: number, newType: string) => {
    setActivePresetId(null);
    setProcessTypes((prev) => {
      const copy = [...prev];
      copy[index] = newType;
      return copy;
    });
  };

  const updateProcessName = (index: number, newName: string) => {
    setActivePresetId(null);
    setProcessNames((prev) => {
      const copy = [...prev];
      copy[index] = newName;
      return copy;
    });
  };

  const loadPreset = (preset: PresetWorkload) => {
    setProcesses(preset.processes);
    setProcessNames(preset.processes.map((_, i) => `Task ${i}`));
    setProcessTypes(
      preset.processes.map((_, i) =>
        i % 5 === 0 ? 'interactive' : i % 5 === 1 ? 'cpu-bound' : i % 5 === 2 ? 'io-bound' : i % 5 === 3 ? 'batch' : 'realtime'
      )
    );
    setQuantum(preset.quantum);
    setNextId(preset.processes.length);
    setActivePresetId(preset.id);
    setErrorMsg(null);

    const allRes = simulateAll(preset.processes, preset.quantum);
    let winner: AlgorithmKey = 'fcfs';
    let lowestWT = Infinity;
    (Object.keys(allRes) as AlgorithmKey[]).forEach((key) => {
      if (allRes[key].avgWT < lowestWT) {
        lowestWT = allRes[key].avgWT;
        winner = key;
      }
    });

    setResults(allRes);
    setBestKey(winner);
    setSelectedInspectorAlgo(winner);
    setSimulatedSnapshot({
      processes: preset.processes,
      quantum: preset.quantum,
      processNames: preset.processes.map((_, i) => `Task ${i}`),
      processTypes: preset.processes.map((_, i) =>
        i % 5 === 0 ? 'interactive' : i % 5 === 1 ? 'cpu-bound' : i % 5 === 2 ? 'io-bound' : i % 5 === 3 ? 'batch' : 'realtime'
      ),
    });
  };

  const handleGenerateRandom = (count: number) => {
    const generated = generateRandomMultiProcessWorkload(count);
    const newNames = generated.processes.map((_, i) => `Task ${i}`);
    const newTypes = generated.processes.map((_, i) =>
      i % 4 === 0 ? 'interactive' : i % 4 === 1 ? 'cpu-bound' : i % 4 === 2 ? 'batch' : 'io-bound'
    );
    setProcesses(generated.processes);
    setProcessNames(newNames);
    setProcessTypes(newTypes);
    setQuantum(generated.quantum);
    setNextId(generated.processes.length);
    setActivePresetId(null);
    setErrorMsg(null);

    const allRes = simulateAll(generated.processes, generated.quantum);
    let winner: AlgorithmKey = 'fcfs';
    let lowestWT = Infinity;
    (Object.keys(allRes) as AlgorithmKey[]).forEach((key) => {
      if (allRes[key].avgWT < lowestWT) {
        lowestWT = allRes[key].avgWT;
        winner = key;
      }
    });

    setResults(allRes);
    setBestKey(winner);
    setSelectedInspectorAlgo(winner);
    setSimulatedSnapshot({
      processes: generated.processes,
      quantum: generated.quantum,
      processNames: newNames,
      processTypes: newTypes,
    });
  };

  const handleNLPWorkloadParsed = (
    newProcs: ProcessInput[],
    newNames: string[],
    newTypes: string[]
  ) => {
    setProcesses(newProcs);
    setProcessNames(newNames);
    setProcessTypes(newTypes);
    setNextId(newProcs.length);
    setActivePresetId(null);
    setErrorMsg(null);

    const allRes = simulateAll(newProcs, quantum);
    let winner: AlgorithmKey = 'fcfs';
    let lowestWT = Infinity;
    (Object.keys(allRes) as AlgorithmKey[]).forEach((key) => {
      if (allRes[key].avgWT < lowestWT) {
        lowestWT = allRes[key].avgWT;
        winner = key;
      }
    });

    setResults(allRes);
    setBestKey(winner);
    setSelectedInspectorAlgo(winner);
    setSimulatedSnapshot({
      processes: newProcs,
      quantum,
      processNames: newNames,
      processTypes: newTypes,
    });
  };

  const handleRandomizeBursts = () => {
    setActivePresetId(null);
    const updated = processes.map((p, idx) => ({
      ...p,
      burst: ((p.id * 7 + idx * 3 + Date.now()) % 10) + 2,
    }));
    setProcesses(updated);
    const allRes = simulateAll(updated, quantum);
    let winner: AlgorithmKey = 'fcfs';
    let lowestWT = Infinity;
    (Object.keys(allRes) as AlgorithmKey[]).forEach((key) => {
      if (allRes[key].avgWT < lowestWT) {
        lowestWT = allRes[key].avgWT;
        winner = key;
      }
    });
    setResults(allRes);
    setBestKey(winner);
    setSimulatedSnapshot({
      processes: updated,
      quantum,
      processNames: [...processNames],
      processTypes: [...processTypes],
    });
  };

  const handleResetDefault = () => {
    const defaultPreset = WORKLOAD_PRESETS.find((p) => p.id === 'default-8') || WORKLOAD_PRESETS[0];
    loadPreset(defaultPreset);
  };

  const executeSimulation = (shouldScroll = true) => {
    setErrorMsg(null);

    const validation = validateWorkload(processes, quantum);
    if (!validation.ok) {
      setErrorMsg(validation.error || 'Workload validation failed');
      return;
    }

    try {
      const allRes = simulateAll(validation.validatedProcesses, validation.validatedQuantum);

      // Determine winner (lowest avg wait time)
      let winner: AlgorithmKey = 'fcfs';
      let lowestWT = Infinity;
      (Object.keys(allRes) as AlgorithmKey[]).forEach((key) => {
        if (allRes[key].avgWT < lowestWT) {
          lowestWT = allRes[key].avgWT;
          winner = key;
        }
      });

      setResults(allRes);
      setBestKey(winner);
      setSimulatedSnapshot({
        processes: validation.validatedProcesses,
        quantum: validation.validatedQuantum,
        processNames: [...processNames],
        processTypes: [...processTypes],
      });

      if (shouldScroll) {
        if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
        scrollTimerRef.current = setTimeout(() => {
          resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 50);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Simulation execution encountered an error');
    }
  };

  const handleApplyQuantum = (newQuantum: number) => {
    const q = Math.max(1, Math.floor(newQuantum || 1));
    setQuantum(q);
    const validation = validateWorkload(processes, q);
    if (!validation.ok) {
      setErrorMsg(validation.error || 'Workload validation failed');
      return;
    }

    try {
      const allRes = simulateAll(validation.validatedProcesses, q);
      let winner: AlgorithmKey = 'fcfs';
      let lowestWT = Infinity;
      (Object.keys(allRes) as AlgorithmKey[]).forEach((key) => {
        if (allRes[key].avgWT < lowestWT) {
          lowestWT = allRes[key].avgWT;
          winner = key;
        }
      });
      setResults(allRes);
      setBestKey(winner);
      setSimulatedSnapshot({
        processes: validation.validatedProcesses,
        quantum: q,
        processNames: [...processNames],
        processTypes: [...processTypes],
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'Quantum sensitivity simulation encountered an error');
    }
  };

  const isWorkloadStale = useMemo(() => {
    if (quantum !== simulatedSnapshot.quantum) return true;
    if (processes.length !== simulatedSnapshot.processes.length) return true;
    return processes.some((p, i) => {
      const sp = simulatedSnapshot.processes[i];
      return !sp || p.id !== sp.id || p.arrival !== sp.arrival || p.burst !== sp.burst || p.priority !== sp.priority;
    });
  }, [processes, quantum, simulatedSnapshot]);

  const algoKeys: AlgorithmKey[] = ['fcfs', 'sjf', 'srtf', 'rr', 'priority', 'pprior'];

  const visiblePresets = useMemo(() => {
    if (filterCategory === 'all') return WORKLOAD_PRESETS;
    return WORKLOAD_PRESETS.filter((p) => p.category === filterCategory);
  }, [filterCategory]);

  const totalBurst = processes.reduce((sum, p) => sum + (p.burst || 0), 0);
  const avgBurst = processes.length ? (totalBurst / processes.length).toFixed(1) : '0';

  // Compute sorted ranks for algorithms based on avgWT
  const algoRanks = useMemo(() => {
    if (!results) return {};
    const sorted = [...algoKeys].sort((a, b) => results[a].avgWT - results[b].avgWT);
    const ranks: Record<AlgorithmKey, number> = {} as any;
    sorted.forEach((k, idx) => {
      ranks[k] = idx + 1;
    });
    return ranks;
  }, [results]);

  return (
    <>
      <header className="app-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1>
              <span>CPU Scheduling Laboratory</span>
              <span className="logo-badge">ENGINEERING BENCHMARK</span>
            </h1>
            <p>
              Deterministic simulation and comparative analysis of core OS scheduling algorithms (FCFS, SJF, SRTF, Round Robin, Priority).
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => handleOpenRAG()}
              style={{
                background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.18), rgba(124, 58, 237, 0.18))',
                border: '1px solid rgba(124, 58, 237, 0.45)',
                color: 'var(--text)',
                borderRadius: '6px',
                padding: '0.4rem 0.85rem',
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                transition: 'all 0.15s ease',
              }}
            >
              <Sparkles size={14} style={{ color: '#8b5cf6' }} />
              <span>Ask RAG OS Copilot</span>
            </button>

            <button
              type="button"
              onClick={() => setShowGuide((prev) => !prev)}
              style={{
                background: showGuide ? 'var(--accent)' : 'var(--surface-secondary)',
                color: showGuide ? '#ffffff' : 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '0.4rem 0.85rem',
                fontSize: '0.78rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                transition: 'all 0.15s ease',
              }}
            >
              <HelpCircle size={14} />
              <span>{showGuide ? 'Hide Concepts Guide' : 'Scheduling Concepts'}</span>
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* IN-PAGE NAVIGATION BAR */}
      <nav className="quick-nav-bar" aria-label="Quick Section Navigation">
        <a href="#workload-presets-bar">Scenarios</a>
        <a href="#nlp-descriptor">NLP Input</a>
        <a href="#tasks-queue">Workload</a>
        <a href="#ai-recommendation">AI Recommender</a>
        <a href="#starvation-report">Starvation Audit</a>
        <a href="#gantt-timelines">Gantt Timelines</a>
        <a href="#results">Fairness &amp; Metrics</a>
        <a href="#ai-insights">AI Insights</a>
        <button
          type="button"
          onClick={() => handleOpenRAG()}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent)',
            fontWeight: 700,
            cursor: 'pointer',
            padding: '0.35rem 0.6rem',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.3rem',
            fontSize: '0.75rem',
          }}
        >
          <Sparkles size={12} />
          <span>RAG Copilot</span>
        </button>
        <a href="#step-playback">Execution Trace</a>
        <a href="#analytics-plots">Analytics</a>
        <a href="#quantum-optimizer">Quantum Sensitivity</a>
        <a href="#breakdown-table">Breakdown Table</a>
      </nav>

      <div className="container">
        {errorMsg && <div className="error-msg">Notice: {errorMsg}</div>}

        {/* Plain-English Beginner's Guide */}
        {showGuide && (
          <div
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: '8px',
              padding: '1.25rem 1.5rem',
              marginBottom: '1.5rem',
              boxShadow: 'var(--card-shadow)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.9rem' }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <HelpCircle size={16} style={{ color: 'var(--accent)' }} />
                <span>Reference Guide: Operating System Process Scheduling Metrics</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--dim)',
                  cursor: 'pointer',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                }}
              >
                ✕ Close
              </button>
            </div>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                gap: '0.85rem',
                fontSize: '0.8rem',
                lineHeight: '1.5',
              }}
            >
              <div style={{ background: 'var(--surface-secondary)', padding: '0.85rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <strong style={{ color: 'var(--accent)', display: 'block', marginBottom: '0.25rem', fontFamily: 'IBM Plex Mono, monospace' }}>Arrival Time (AT)</strong>
                Timestamp at which the process arrives in the system ready queue and becomes eligible for CPU dispatch.
              </div>
              <div style={{ background: 'var(--surface-secondary)', padding: '0.85rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <strong style={{ color: 'var(--green)', display: 'block', marginBottom: '0.25rem', fontFamily: 'IBM Plex Mono, monospace' }}>Burst Time (BT)</strong>
                Total duration of active CPU execution required by the process to complete computation.
              </div>
              <div style={{ background: 'var(--surface-secondary)', padding: '0.85rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <strong style={{ color: 'var(--purple)', display: 'block', marginBottom: '0.25rem', fontFamily: 'IBM Plex Mono, monospace' }}>Priority Class</strong>
                Urgency ranking for static and dynamic dispatching (lower integer values represent higher priority classes).
              </div>
              <div style={{ background: 'var(--surface-secondary)', padding: '0.85rem', borderRadius: '6px', border: '1px solid var(--border)' }}>
                <strong style={{ color: 'var(--orange)', display: 'block', marginBottom: '0.25rem', fontFamily: 'IBM Plex Mono, monospace' }}>Time Slice (Quantum)</strong>
                Maximum continuous time allocation permitted per dispatch in Round Robin scheduling before preemption.
              </div>
            </div>
          </div>
        )}

        {/* WORKLOAD PRESETS FORM BAR */}
        <div
          id="workload-presets-bar"
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '1.1rem 1.4rem',
            marginBottom: '1.5rem',
            boxShadow: 'var(--card-shadow)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.8rem',
              marginBottom: '0.85rem',
              borderBottom: '1px solid var(--border-subtle)',
              paddingBottom: '0.75rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontFamily: 'Plus Jakarta Sans',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: 'var(--text)',
                  letterSpacing: '0.02em',
                  marginRight: '0.2rem',
                }}
              >
                Benchmark Scenarios ({WORKLOAD_PRESETS.length})
              </span>

              {/* Category Filter Tabs */}
              <div style={{ display: 'inline-flex', background: 'var(--surface-secondary)', padding: '3px', borderRadius: '6px', border: '1px solid var(--border)' }}>
                {(
                  [
                    { id: 'all', label: 'All Scenarios' },
                    { id: 'many', label: 'High Concurrency (8–10)' },
                    { id: 'stress', label: 'Heavy Delay & Skew' },
                    { id: 'classic', label: 'Standard Benchmarks' },
                  ] as const
                ).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setFilterCategory(cat.id)}
                    style={{
                      background: filterCategory === cat.id ? 'var(--accent)' : 'transparent',
                      color: filterCategory === cat.id ? '#ffffff' : 'var(--dim)',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '0.25rem 0.65rem',
                      fontFamily: 'Plus Jakarta Sans',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Quick Generator & Default Reset Buttons */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleResetDefault}
                title="Reset to default 8-process benchmark"
                style={{
                  background: 'var(--surface-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  borderRadius: '6px',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  transition: 'all 0.15s',
                }}
              >
                <RotateCcw size={12} />
                <span>Reset Benchmark</span>
              </button>

              <button
                type="button"
                onClick={() => handleGenerateRandom(8)}
                title="Generate 8 randomized processes"
                style={{
                  background: 'var(--surface-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--green)',
                  borderRadius: '6px',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  transition: 'all 0.15s',
                }}
              >
                <Shuffle size={12} />
                <span>Random 8</span>
              </button>

              <button
                type="button"
                onClick={() => handleGenerateRandom(10)}
                title="Generate 10 randomized processes"
                style={{
                  background: 'var(--surface-secondary)',
                  border: '1px solid var(--border)',
                  color: 'var(--purple)',
                  borderRadius: '6px',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  transition: 'all 0.15s',
                }}
              >
                <Shuffle size={12} />
                <span>Random 10</span>
              </button>
            </div>
          </div>

          {/* Preset Buttons Grid */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '0.5rem',
            }}
          >
            {visiblePresets.map((preset) => {
              const isActive = activePresetId === preset.id;
              const procCount = preset.processes.length;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => loadPreset(preset)}
                  style={{
                    background: isActive ? 'var(--accent-light)' : 'var(--surface-secondary)',
                    border: isActive ? '1px solid var(--accent)' : '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '0.4rem 0.8rem',
                    fontFamily: 'Plus Jakarta Sans',
                    fontSize: '0.78rem',
                    color: isActive ? 'var(--accent)' : 'var(--text)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontWeight: isActive ? 700 : 500,
                  }}
                  title={`${preset.name}: ${preset.desc} (Quantum: ${preset.quantum})`}
                >
                  <span
                    style={{
                      background: procCount >= 8 ? 'var(--green-light)' : 'rgba(247, 148, 79, 0.2)',
                      color: procCount >= 8 ? 'var(--green)' : 'var(--orange)',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                    }}
                  >
                    {procCount}P
                  </span>
                  <span>{preset.name}</span>
                  <span
                    style={{
                      color: 'var(--dim)',
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: '0.68rem',
                    }}
                  >
                    q={preset.quantum}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* TASK QUEUE PANEL */}
        <div id="tasks-queue" className="input-panel">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.75rem',
              marginBottom: '1rem',
            }}
          >
            <div>
              <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>Process Workload Specification</span>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    fontFamily: 'IBM Plex Mono, monospace',
                    background: 'var(--accent-light)',
                    color: 'var(--accent)',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    border: '1px solid var(--accent)',
                  }}
                >
                  {processes.length} Processes (Max 16)
                </span>
              </h2>
              <span style={{ fontSize: '0.78rem', color: 'var(--dim)', fontFamily: 'Plus Jakarta Sans', marginTop: '2px', display: 'block' }}>
                Total Workload: {totalBurst} ms • Mean Burst: {avgBurst} ms • Arrival Span: 0 to {Math.max(0, ...processes.map(p => p.arrival))} ms
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              {/* View Switcher: Cards vs Table */}
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
                  onClick={() => setProcessViewMode('cards')}
                  title="Card Grid View with large clear inputs"
                  style={{
                    background: processViewMode === 'cards' ? 'var(--accent)' : 'transparent',
                    color: processViewMode === 'cards' ? '#fff' : 'var(--dim)',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '0.3rem 0.65rem',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <LayoutGrid size={13} />
                  <span>Cards</span>
                </button>
                <button
                  type="button"
                  onClick={() => setProcessViewMode('table')}
                  title="Spreadsheet Table View"
                  style={{
                    background: processViewMode === 'table' ? 'var(--accent)' : 'transparent',
                    color: processViewMode === 'table' ? '#fff' : 'var(--dim)',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '0.3rem 0.65rem',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <TableIcon size={13} />
                  <span>Table</span>
                </button>
              </div>

              <button
                type="button"
                onClick={handleRandomizeBursts}
                title="Randomize burst duration values across active processes"
                style={{
                  background: 'var(--surface-secondary)',
                  borderTop: '1px solid var(--border)',
                  borderRight: '1px solid var(--border)',
                  borderBottom: '1px solid var(--border)',
                  borderLeft: '1px solid var(--border)',
                  color: 'var(--text)',
                  borderRadius: '6px',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  transition: 'all 0.15s',
                }}
              >
                <Shuffle size={12} />
                <span>Randomize Bursts</span>
              </button>
              <button
                type="button"
                onClick={handleResetDefault}
                title="Reset to 8 default standard processes"
                style={{
                  background: 'var(--surface-secondary)',
                  borderTop: '1px solid var(--border)',
                  borderRight: '1px solid var(--border)',
                  borderBottom: '1px solid var(--border)',
                  borderLeft: '1px solid var(--border)',
                  color: 'var(--text)',
                  borderRadius: '6px',
                  padding: '0.35rem 0.75rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.35rem',
                  transition: 'all 0.15s',
                }}
              >
                <RotateCcw size={12} />
                <span>Reset Defaults</span>
              </button>
            </div>
          </div>

          {/* SYSTEM 1: NLP Plain-English Workload Descriptor */}
          <div id="nlp-descriptor">
            <NLPProcessInput onWorkloadParsed={handleNLPWorkloadParsed} />
          </div>

          {/* Process Editor: Cards View or Table View */}
          {processViewMode === 'cards' ? (
            <div className="process-grid">
              {processes.map((p, idx) => {
                const pType = processTypes[idx] || 'cpu-bound';
                const pTypeStyle = PROCESS_TYPE_COLORS[pType] || PROCESS_TYPE_COLORS['cpu-bound'];
                const riskInfo = starvationMap.get(idx) || starvationRisks[idx];
                const pName = processNames[idx];

                return (
                  <div
                    key={p.id}
                    className="process-card"
                    style={{
                      borderTop: '1px solid var(--border)',
                      borderRight: '1px solid var(--border)',
                      borderBottom: '1px solid var(--border)',
                      borderLeft: `4px solid ${P_COLORS[idx % P_COLORS.length]}`,
                    }}
                  >
                    {/* Card Header: PID, Name, Workload Type Pill, Starvation Alert & Delete */}
                    <div className="process-card-header">
                      <div className="process-card-title">
                        <span
                          style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: P_COLORS[idx % P_COLORS.length],
                            display: 'inline-block',
                            flexShrink: 0,
                          }}
                        />
                        <strong style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.95rem' }}>
                          P{idx}
                        </strong>

                        {/* Editable Process Name */}
                        <input
                          type="text"
                          value={pName || `Task ${idx + 1}`}
                          onChange={(e) => updateProcessName(idx, e.target.value)}
                          placeholder={`Task ${idx + 1}`}
                          title="Click to rename task"
                          style={{
                            background: 'var(--surface)',
                            borderTop: '1px solid var(--border)',
                            borderRight: '1px solid var(--border)',
                            borderBottom: '1px solid var(--border)',
                            borderLeft: '1px solid var(--border)',
                            borderRadius: '4px',
                            color: 'var(--text)',
                            fontFamily: 'Plus Jakarta Sans, sans-serif',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            padding: '3px 7px',
                            width: '115px',
                            outline: 'none',
                          }}
                        />

                        {/* Process Type Badge & Interactive Selector */}
                        <select
                          value={pType}
                          onChange={(e) => updateProcessType(idx, e.target.value)}
                          title={`Change workload behavior class (currently: ${pType})`}
                          aria-label={`Process P${idx} workload type`}
                          style={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '12px',
                            background: pTypeStyle.bg,
                            color: pTypeStyle.text,
                            borderTop: `1px solid ${pTypeStyle.border}`,
                            borderRight: `1px solid ${pTypeStyle.border}`,
                            borderBottom: `1px solid ${pTypeStyle.border}`,
                            borderLeft: `1px solid ${pTypeStyle.border}`,
                            textTransform: 'uppercase',
                            fontFamily: 'IBM Plex Mono, monospace',
                            cursor: 'pointer',
                            outline: 'none',
                          }}
                        >
                          <option value="interactive" style={{ background: 'var(--surface)', color: 'var(--text)' }}>interactive</option>
                          <option value="cpu-bound" style={{ background: 'var(--surface)', color: 'var(--text)' }}>cpu-bound</option>
                          <option value="io-bound" style={{ background: 'var(--surface)', color: 'var(--text)' }}>io-bound</option>
                          <option value="batch" style={{ background: 'var(--surface)', color: 'var(--text)' }}>batch</option>
                          <option value="realtime" style={{ background: 'var(--surface)', color: 'var(--text)' }}>realtime</option>
                        </select>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                        {/* Starvation Warning Badges */}
                        {riskInfo && (riskInfo.sjfRisk === 'high' || riskInfo.sjfRisk === 'medium') && (
                          <span
                            title={`SJF Starvation Risk (${riskInfo.sjfRisk}): ${riskInfo.explanation}`}
                            style={{
                              fontSize: '0.66rem',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '10px',
                              background: 'rgba(245, 200, 66, 0.15)',
                              color: 'var(--yellow)',
                              borderTop: '1px solid var(--yellow)',
                              borderRight: '1px solid var(--yellow)',
                              borderBottom: '1px solid var(--yellow)',
                              borderLeft: '1px solid var(--yellow)',
                              cursor: 'help',
                            }}
                          >
                            ⚠ SJF Risk
                          </span>
                        )}
                        {riskInfo && (riskInfo.priorityRisk === 'high' || riskInfo.priorityRisk === 'medium') && (
                          <span
                            title={`Priority Starvation Risk (${riskInfo.priorityRisk}): ${riskInfo.explanation}`}
                            style={{
                              fontSize: '0.66rem',
                              fontWeight: 700,
                              padding: '2px 6px',
                              borderRadius: '10px',
                              background: 'rgba(235, 59, 90, 0.15)',
                              color: 'var(--red)',
                              borderTop: '1px solid var(--red)',
                              borderRight: '1px solid var(--red)',
                              borderBottom: '1px solid var(--red)',
                              borderLeft: '1px solid var(--red)',
                              cursor: 'help',
                            }}
                          >
                            🔴 Priority Risk
                          </span>
                        )}

                        <button
                          type="button"
                          className="remove-btn"
                          onClick={() => removeProcess(p.id)}
                          title={`Remove Process P${idx}`}
                        >
                          ✕
                        </button>
                      </div>
                    </div>

                    {/* Inputs 3-Column Grid: Large, Clear, Readable */}
                    <div className="process-inputs-grid">
                      <div className="process-field">
                        <label htmlFor={`arr-input-${p.id}`} title="Timestamp when process arrives in ready queue">
                          Arrival (AT)
                        </label>
                        <input
                          id={`arr-input-${p.id}`}
                          type="number"
                          step="1"
                          min="0"
                          value={p.arrival}
                          placeholder="0"
                          title="Arrival time offset in ms"
                          onChange={(e) => updateProcess(idx, 'arrival', Math.max(0, Math.floor(+e.target.value || 0)))}
                        />
                      </div>

                      <div className="process-field">
                        <label htmlFor={`burst-input-${p.id}`} title="CPU execution units required to terminate">
                          Burst (BT)
                        </label>
                        <input
                          id={`burst-input-${p.id}`}
                          type="number"
                          step="1"
                          min="1"
                          value={p.burst}
                          placeholder="4"
                          title="CPU burst execution time in ms"
                          onChange={(e) => updateProcess(idx, 'burst', Math.max(1, Math.floor(+e.target.value || 1)))}
                        />
                      </div>

                      <div className="process-field">
                        <label htmlFor={`prio-input-${p.id}`} title="Scheduling urgency class (1 = Highest priority, 5 = Lowest background)">
                          Priority (1–5)
                        </label>
                        <input
                          id={`prio-input-${p.id}`}
                          type="number"
                          step="1"
                          min="1"
                          max="5"
                          value={p.priority}
                          placeholder="1"
                          title="Urgency level (1 = Highest, 5 = Lowest)"
                          onChange={(e) => updateProcess(idx, 'priority', Math.max(1, Math.min(5, Math.floor(+e.target.value || 1))))}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="process-table-container">
              <table className="process-table">
                <thead>
                  <tr>
                    <th style={{ width: '70px' }}>PID</th>
                    <th>Task Name</th>
                    <th style={{ width: '130px' }}>Type</th>
                    <th style={{ width: '115px' }}>Arrival (AT)</th>
                    <th style={{ width: '115px' }}>Burst (BT)</th>
                    <th style={{ width: '115px' }}>Priority (1–5)</th>
                    <th>Starvation Risk</th>
                    <th style={{ width: '60px', textAlign: 'center' }}>Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {processes.map((p, idx) => {
                    const pType = processTypes[idx] || 'cpu-bound';
                    const pTypeStyle = PROCESS_TYPE_COLORS[pType] || PROCESS_TYPE_COLORS['cpu-bound'];
                    const riskInfo = starvationMap.get(idx) || starvationRisks[idx];
                    const pName = processNames[idx];

                    return (
                      <tr key={p.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span
                              style={{
                                width: '9px',
                                height: '9px',
                                borderRadius: '50%',
                                background: P_COLORS[idx % P_COLORS.length],
                                display: 'inline-block',
                              }}
                            />
                            <strong style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.9rem' }}>
                              P{idx}
                            </strong>
                          </div>
                        </td>
                        <td>
                          <input
                            type="text"
                            value={pName || `Task ${idx + 1}`}
                            onChange={(e) => updateProcessName(idx, e.target.value)}
                            placeholder={`Task ${idx + 1}`}
                            title="Task name"
                          />
                        </td>
                        <td>
                          <select
                            value={pType}
                            onChange={(e) => updateProcessType(idx, e.target.value)}
                            style={{
                              fontSize: '0.74rem',
                              fontWeight: 700,
                              padding: '3px 8px',
                              borderRadius: '6px',
                              background: pTypeStyle.bg,
                              color: pTypeStyle.text,
                              borderTop: `1px solid ${pTypeStyle.border}`,
                              borderRight: `1px solid ${pTypeStyle.border}`,
                              borderBottom: `1px solid ${pTypeStyle.border}`,
                              borderLeft: `1px solid ${pTypeStyle.border}`,
                              textTransform: 'uppercase',
                              fontFamily: 'IBM Plex Mono, monospace',
                              cursor: 'pointer',
                              outline: 'none',
                            }}
                          >
                            <option value="interactive">interactive</option>
                            <option value="cpu-bound">cpu-bound</option>
                            <option value="io-bound">io-bound</option>
                            <option value="batch">batch</option>
                            <option value="realtime">realtime</option>
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            step="1"
                            min="0"
                            value={p.arrival}
                            title="Arrival time in ms"
                            onChange={(e) => updateProcess(idx, 'arrival', Math.max(0, Math.floor(+e.target.value || 0)))}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="1"
                            min="1"
                            value={p.burst}
                            title="Burst time in ms"
                            onChange={(e) => updateProcess(idx, 'burst', Math.max(1, Math.floor(+e.target.value || 1)))}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step="1"
                            min="1"
                            max="5"
                            value={p.priority}
                            title="Priority (1 = Highest, 5 = Lowest)"
                            onChange={(e) => updateProcess(idx, 'priority', Math.max(1, Math.min(5, Math.floor(+e.target.value || 1))))}
                          />
                        </td>
                        <td>
                          {riskInfo && (riskInfo.sjfRisk === 'high' || riskInfo.sjfRisk === 'medium') && (
                            <span
                              title={riskInfo.explanation}
                              style={{
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: 'rgba(245, 200, 66, 0.15)',
                                color: 'var(--yellow)',
                                marginRight: '4px',
                                borderTop: '1px solid var(--yellow)',
                                borderRight: '1px solid var(--yellow)',
                                borderBottom: '1px solid var(--yellow)',
                                borderLeft: '1px solid var(--yellow)',
                              }}
                            >
                              ⚠ SJF Risk
                            </span>
                          )}
                          {riskInfo && (riskInfo.priorityRisk === 'high' || riskInfo.priorityRisk === 'medium') && (
                            <span
                              title={riskInfo.explanation}
                              style={{
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: 'rgba(235, 59, 90, 0.15)',
                                color: 'var(--red)',
                                borderTop: '1px solid var(--red)',
                                borderRight: '1px solid var(--red)',
                                borderBottom: '1px solid var(--red)',
                                borderLeft: '1px solid var(--red)',
                              }}
                            >
                              🔴 Priority Risk
                            </span>
                          )}
                          {(!riskInfo || (riskInfo.sjfRisk === 'none' && riskInfo.priorityRisk === 'none')) && (
                            <span style={{ fontSize: '0.72rem', color: 'var(--dim)' }}>Normal</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="remove-btn"
                            onClick={() => removeProcess(p.id)}
                            title={`Remove Process P${idx}`}
                            style={{ margin: '0 auto' }}
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* 5. Simulation Execution Controls (directly under processes specification) */}
          <div className="btn-row">
            <button
              type="button"
              className="add-btn"
              onClick={addProcess}
              disabled={processes.length >= 16}
              title={processes.length >= 16 ? 'Maximum 16 processes reached' : 'Add process to workload'}
            >
              <Plus size={14} />
              <span>Add Process ({processes.length}/16)</span>
            </button>
            <div className="quantum-wrap" title="Time quantum slice for Round Robin policy">
              <label htmlFor="quantum-input">Round Robin Quantum (q)</label>
              <input
                id="quantum-input"
                type="number"
                step="1"
                value={quantum}
                min="1"
                max="20"
                onChange={(e) => setQuantum(Math.max(1, Math.min(20, Math.floor(+e.target.value || 1))))}
              />
            </div>
            <button
              type="button"
              className="run-btn"
              onClick={() => executeSimulation(true)}
            >
              <Play size={14} fill="currentColor" />
              <span>Simulate &amp; Benchmark All Algorithms</span>
            </button>
          </div>
        </div>

        {/* WORKLOAD INTELLIGENCE & STARVATION AUDIT */}
        <div style={{ marginBottom: '1.5rem' }}>
          {/* SYSTEM 2: AI Recommendation Panel (fingerprint + ranked scores) */}
          <div id="ai-recommendation">
            <AIRecommendationPanel
              fingerprint={fingerprint}
              recommendation={recommendation}
            />
          </div>

          {/* SYSTEM 3: Starvation Risk Report (collapsible) */}
          <div id="starvation-report" style={{ marginTop: '1rem' }}>
            <StarvationRiskReport
              starvationRisks={starvationRisks}
              processNames={processNames}
              onOpenRAG={handleOpenRAG}
            />
          </div>
        </div>

        {results && (
          <div id="results" ref={resultsRef}>
            {isWorkloadStale && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  background: 'rgba(234, 179, 8, 0.1)',
                  border: '1px solid rgba(234, 179, 8, 0.35)',
                  borderRadius: '8px',
                  padding: '0.75rem 1rem',
                  marginBottom: '1rem',
                  color: '#eab308',
                  fontSize: '0.85rem',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <span>
                  Notice: Workload parameters were edited after the last benchmark. Results below correspond to the previously computed benchmark.
                </span>
                <button
                  type="button"
                  className="run-btn"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.78rem' }}
                  onClick={() => executeSimulation(false)}
                >
                  <Play size={12} fill="currentColor" />
                  <span>Update Benchmark</span>
                </button>
              </div>
            )}

            {/* 6. Gantt Chart (updated with process names) */}
            <div id="gantt-timelines">
              <GanttSection
                results={results}
                processes={simulatedSnapshot.processes}
                processNames={simulatedSnapshot.processNames}
              />
            </div>

            {/* 7. PerformanceSummaryCard (extended with 4 new metrics: JFI, Speedup, Starvation, Avg RR) */}
            <PerformanceSummaryCard results={results} />

            <div className="winner-banner">
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '8px',
                  background: 'var(--green-light)',
                  border: '1px solid var(--green)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <CheckCircle2 size={24} style={{ color: 'var(--green)' }} />
              </div>
              <div>
                <div className="winner-label">
                  Optimal Policy Assessment
                </div>
                <div className="winner-name">
                  {ALGO_NAMES[bestKey]}
                </div>
                <div style={{ fontSize: '0.82rem', opacity: 0.9, marginTop: '3px' }}>
                  Produced lowest mean waiting time across all {processes.length} simulated processes under current workload constraints.
                </div>
              </div>
              <div className="winner-stat">
                <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Mean Wait: {results[bestKey].avgWT.toFixed(2)} ms</div>
                <div style={{ opacity: 0.85, fontSize: '0.8rem', marginTop: '2px' }}>Mean Turnaround: {results[bestKey].avgTAT.toFixed(2)} ms</div>
              </div>
            </div>

            <div className="algo-cards">
              {algoKeys.map((key) => {
                const res = results[key];
                const isWinner = key === bestKey;
                const rank = algoRanks[key] || 1;
                return (
                  <div
                    key={key}
                    className={`algo-card${isWinner ? ' best' : ''}`}
                  >
                    <div className="algo-card-header">
                      <div
                        className="dot"
                        style={{ background: ALGO_COLORS[key] }}
                      />
                      <h3>{ALGO_NAMES[key]}</h3>
                      {isWinner ? (
                        <span className="badge">#1 OPTIMAL</span>
                      ) : (
                        <span
                          style={{
                            marginLeft: 'auto',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            fontFamily: 'IBM Plex Mono, monospace',
                            color: 'var(--dim)',
                          }}
                        >
                          #{rank}
                        </span>
                      )}
                    </div>
                    <div className="algo-metrics">
                      <div className="metric" title="Average waiting time spent in ready queue">
                        <span className="val">{res.avgWT.toFixed(2)}</span>
                        <span className="lbl">Mean Waiting Time</span>
                      </div>
                      <div className="metric" title="Average total turnaround time from arrival to termination">
                        <span className="val">{res.avgTAT.toFixed(2)}</span>
                        <span className="lbl">Mean Turnaround</span>
                      </div>
                      <div className="metric" title="Average initial response latency">
                        <span className="val">{res.avgRT.toFixed(2)}</span>
                        <span className="lbl">Mean Response</span>
                      </div>
                      <div className="metric" title="Percentage of active non-idle CPU execution">
                        <span className="val">{res.cpuUtil}%</span>
                        <span className="lbl">CPU Utilization</span>
                      </div>
                      <div className="metric" title="Processes completed per unit time">
                        <span className="val">{res.throughput}</span>
                        <span className="lbl">Throughput</span>
                      </div>
                      <div className="metric" title="Total elapsed time until all processes terminate">
                        <span className="val">{res.totalTime}</span>
                        <span className="lbl">Total Makespan</span>
                      </div>
                      <div className="metric" title="Total preemptions and dispatches incurred">
                        <span className="val">{res.ctxSwitches}</span>
                        <span className="lbl">Context Switches</span>
                      </div>
                      <div className="metric" title="Total CPU scheduling execution units">
                        <span className="val">{res.steps}</span>
                        <span className="lbl">Execution Slots</span>
                      </div>
                    </div>

                    <div style={{ marginTop: '0.85rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedInspectorAlgo(key);
                          const el = document.getElementById('step-playback');
                          if (el) el.scrollIntoView({ behavior: 'smooth' });
                        }}
                        style={{
                          background: selectedInspectorAlgo === key ? 'var(--surface-tertiary)' : 'transparent',
                          border: `1px solid ${ALGO_COLORS[key]}40`,
                          color: ALGO_COLORS[key],
                          padding: '0.3rem 0.65rem',
                          borderRadius: '4px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <span>Trace Execution</span>
                        <ArrowRight size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 8. AIInsightPanel (post-simulation RAG explainer) */}
            <div id="ai-insights">
              <AIInsightPanel
                results={results}
                fingerprint={fingerprint}
                processes={simulatedSnapshot.processes}
                processNames={simulatedSnapshot.processNames}
                processTypes={simulatedSnapshot.processTypes}
                starvationRisks={starvationRisks}
                recommendedWinner={recommendation.winner}
                recommendationConfidence={recommendation.confidence}
                onOpenRAG={handleOpenRAG}
              />
            </div>

            {/* Anomaly & Inefficiency Auditor */}
            <div id="anomaly-audit">
              <AnomalyDashboard
                processes={simulatedSnapshot.processes}
                results={results}
                quantum={simulatedSnapshot.quantum}
                processNames={simulatedSnapshot.processNames}
                onOpenRAG={handleOpenRAG}
              />
            </div>

            {/* 9. StepPlaybackInspector */}
            <div id="step-playback">
              <StepPlaybackInspector
                processes={simulatedSnapshot.processes}
                results={results}
                quantum={simulatedSnapshot.quantum}
                externalAlgo={selectedInspectorAlgo}
                onAlgoChange={setSelectedInspectorAlgo}
              />
            </div>

            {/* 10. ComparisonCharts / PlotlyComparisons */}
            <div id="analytics-plots">
              <PlotlyComparisons
                results={results}
                processes={simulatedSnapshot.processes}
                bestKey={bestKey}
              />
            </div>

            {/* 11. QuantumSensitivityAnalyzer */}
            <div id="quantum-optimizer">
              <QuantumSensitivityAnalyzer
                processes={simulatedSnapshot.processes}
                currentQuantum={simulatedSnapshot.quantum}
                onApplyQuantum={handleApplyQuantum}
                onOpenRAG={handleOpenRAG}
              />
            </div>

            {/* 12. FormDataViewer (with 4th Metrics Comparison Tab) */}
            <FormDataViewer
              results={results}
              processes={simulatedSnapshot.processes}
              selectedAlgo={selectedInspectorAlgo}
              onSelectAlgo={setSelectedInspectorAlgo}
              processNames={simulatedSnapshot.processNames}
            />

            {/* 13. BreakdownTable */}
            <div id="breakdown-table">
              <BreakdownTable results={results} processes={simulatedSnapshot.processes} />
            </div>
          </div>
        )}
      </div>

      {/* Global Interactive RAG OS Copilot Drawer */}
      <RAGCopilotDrawer
        isOpen={isRAGOpen}
        onClose={() => setIsRAGOpen(false)}
        processes={simulatedSnapshot.processes}
        results={results}
        quantum={simulatedSnapshot.quantum}
        fingerprint={fingerprint}
        anomalies={results ? detectAnomalies(simulatedSnapshot.processes, results, simulatedSnapshot.quantum, simulatedSnapshot.processNames) : []}
        initialQuestion={ragInitialQuestion}
      />
    </>
  );
}
