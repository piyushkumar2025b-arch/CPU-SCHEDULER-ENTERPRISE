import React, { useState, useMemo } from 'react';
import { AllResults, AlgorithmKey, ProcessInput } from '../types';
import { ALGO_NAMES, ALGO_COLORS } from './GanttChart';
import { WorkloadFingerprint } from '../utils/workloadFingerprint';
import { ProcessStarvationRisk } from '../utils/starvationAnalyzer';
import { Sparkles, Loader2, ChevronDown, ChevronUp, Bot, FileText, CheckCircle2, RotateCcw } from 'lucide-react';

interface AIInsightPanelProps {
  results: AllResults;
  fingerprint: WorkloadFingerprint;
  processes: ProcessInput[];
  processNames?: string[];
  processTypes?: string[];
  starvationRisks: ProcessStarvationRisk[];
  recommendedWinner: AlgorithmKey;
  recommendationConfidence: number;
  onOpenRAG?: (question?: string) => void;
}

export const AIInsightPanel: React.FC<AIInsightPanelProps> = ({
  results,
  fingerprint,
  processes,
  processNames,
  processTypes,
  starvationRisks,
  recommendedWinner,
  recommendationConfidence,
  onOpenRAG,
}) => {
  const [analysisText, setAnalysisText] = useState<string | null>(null);
  const [analysisSource, setAnalysisSource] = useState<string | null>(null);
  const [isAssembling, setIsAssembling] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showRawContext, setShowRawContext] = useState<boolean>(false);

  const algoKeys: AlgorithmKey[] = ['fcfs', 'sjf', 'srtf', 'rr', 'priority', 'pprior'];

  // Determine actual best algorithm by lowest avgWT
  const actualBest = useMemo<AlgorithmKey>(() => {
    let best = algoKeys[0];
    let minWT = Infinity;
    algoKeys.forEach((k) => {
      if (results[k].avgWT < minWT) {
        minWT = results[k].avgWT;
        best = k;
      }
    });
    return best;
  }, [results]);

  // Construct the rich structured context document (the RAG "retrieval" step)
  const contextDocument = useMemo(() => {
    const {
      n,
      burstCV,
      arrivalDensity,
      priorityEntropy,
      starvationRiskScore,
      heavyTailScore,
    } = fingerprint;

    const burstVarianceLabel =
      burstCV < 0.3 ? 'uniform' : burstCV > 1.2 ? 'highly variable' : 'moderate';

    // Workload class
    let workloadClass = 'Mixed';
    if (fingerprint.interactiveRatio > 0.5) workloadClass = 'Interactive';
    else if (fingerprint.batchRatio > 0.5) workloadClass = 'Batch';
    else if (fingerprint.burstCV > 1.2) workloadClass = 'CPU-Burst Heavy';
    else if (fingerprint.burstCV < 0.3) workloadClass = 'Uniform';
    else if (fingerprint.prioritySpread > 2 && fingerprint.starvationRiskScore > 0.5) workloadClass = 'Realtime';

    // Algorithms summary
    const algoSummary = algoKeys
      .map(
        (k) =>
          `- ${ALGO_NAMES[k]}: avgWT=${results[k].avgWT.toFixed(2)}, avgTAT=${results[k].avgTAT.toFixed(
            2
          )}, avgRT=${results[k].avgRT.toFixed(2)}, cpuUtil=${results[k].cpuUtil}%, ctxSwitches=${
            results[k].ctxSwitches
          }, throughput=${results[k].throughput}`
      )
      .join('\n');

    // Ranked list by avgWT
    const rankedAlgos = [...algoKeys].sort((a, b) => results[a].avgWT - results[b].avgWT);
    const bestWT = results[rankedAlgos[0]].avgWT;
    const rankedPerformance = rankedAlgos
      .map((k, idx) => {
        const diff = bestWT > 0 ? (((results[k].avgWT - bestWT) / bestWT) * 100).toFixed(1) : '0';
        return `${idx + 1}. ${ALGO_NAMES[k]}: avgWT=${results[k].avgWT.toFixed(2)} (${
          idx === 0 ? 'BEST' : `+${diff}% vs best`
        })`;
      })
      .join('\n');

    // Process level details for actual best algorithm
    const bestStats = results[actualBest].stats;
    const processDetails = bestStats
      .map((s) => {
        const name = processNames?.[s.idx] || `Task ${s.idx}`;
        const pType = processTypes?.[s.idx] || 'cpu-bound';
        const penalty = +(s.TAT / (s.BT || 1)).toFixed(2);
        return `- ${name} (P${s.idx}): WT=${s.WT}, TAT=${s.TAT}, RT=${s.RT}, penalty=${penalty}x, type=${pType}`;
      })
      .join('\n');

    // Starvation risks
    const atRisk = starvationRisks.filter(
      (r) => r.sjfRisk === 'high' || r.priorityRisk === 'high' || r.sjfRisk === 'medium' || r.priorityRisk === 'medium'
    );
    const starvationText =
      atRisk.length > 0
        ? atRisk
            .map(
              (r) =>
                `- P${r.pid} (${processNames?.[r.pid] || `Task ${r.pid}`}): SJF=${r.sjfRisk}, Priority=${
                  r.priorityRisk
                }, Starves after t=${r.starvationThresholdTime}`
            )
            .join('\n')
        : 'None detected';

    const accuracyText =
      recommendedWinner === actualBest
        ? 'CORRECT'
        : 'INCORRECT — explain why actual scheduling diverged from heuristic prediction';

    return `WORKLOAD FINGERPRINT:
- Process count: ${n}
- Burst CV: ${burstCV} (${burstVarianceLabel})
- Arrival density: ${arrivalDensity}
- Priority entropy: ${priorityEntropy}
- Starvation risk score: ${starvationRiskScore}
- Heavy tail score: ${heavyTailScore}
- Workload class: ${workloadClass}

ALGORITHM RESULTS SUMMARY:
${algoSummary}

RANKED PERFORMANCE (by avgWT):
${rankedPerformance}

PROCESS-LEVEL DETAILS (best algorithm only):
${processDetails}

STARVATION RISKS DETECTED:
${starvationText}

PRE-SIMULATION RECOMMENDED ALGORITHM: ${ALGO_NAMES[recommendedWinner]} (confidence: ${Math.round(
      recommendationConfidence * 100
    )}%)
ACTUAL BEST ALGORITHM (by avgWT): ${ALGO_NAMES[actualBest]}
RECOMMENDATION ACCURACY: ${accuracyText}`;
  }, [
    fingerprint,
    results,
    actualBest,
    processNames,
    processTypes,
    starvationRisks,
    recommendedWinner,
    recommendationConfidence,
  ]);

  const handleGenerateAnalysis = async () => {
    setErrorMsg(null);
    setIsAssembling(true);

    // UX feature: Show RAG assembly animation for 1.5s
    setTimeout(async () => {
      setIsAssembling(false);
      setIsLoading(true);

      try {
        const savedProvider = localStorage.getItem('remix_selected_ai_provider') || 'gemini';
        const savedModel = localStorage.getItem('remix_selected_ai_model');
        const savedKey = localStorage.getItem('remix_openrouter_api_key');

        const response = await fetch('/api/generate-insights', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            context: contextDocument,
            provider: savedProvider,
            model: savedModel || undefined,
            openRouterApiKey: savedKey || undefined,
          }),
        });

        if (!response.ok) {
          throw new Error(`Server returned HTTP ${response.status}`);
        }

        const data = await response.json();
        if (data.text) {
          setAnalysisText(data.text);
          setAnalysisSource(data.source || (data.note ? 'fallback' : 'gemini'));
        } else {
          throw new Error('AI returned an empty response.');
        }
      } catch (err: any) {
        console.warn('AI Insights notice:', err?.message || err);
        setErrorMsg(err?.message || 'Failed to retrieve AI analysis.');
      } finally {
        setIsLoading(false);
      }
    }, 1500);
  };

  // Split response into distinct paragraphs
  const parsedParagraphs = useMemo(() => {
    if (!analysisText) return [];
    // Split by two newlines or by numbered bullet headings
    const rawBlocks = analysisText
      .split(/\n\s*\n/)
      .map((b) => b.trim())
      .filter((b) => b.length > 0);

    return rawBlocks;
  }, [analysisText]);

  const sectionStyles = [
    { title: 'Executive Workload Summary', color: 'var(--accent)', bg: 'rgba(59, 130, 246, 0.06)', border: 'rgba(59, 130, 246, 0.3)' },
    { title: 'Winning Algorithm Justification', color: 'var(--green)', bg: 'rgba(16, 185, 129, 0.06)', border: 'rgba(16, 185, 129, 0.3)' },
    { title: 'Second-Best Advantage Scenario', color: 'var(--yellow)', bg: 'rgba(245, 158, 11, 0.06)', border: 'rgba(245, 158, 11, 0.3)' },
    { title: 'Actionable Kernel Optimization', color: 'var(--purple)', bg: 'rgba(139, 92, 246, 0.06)', border: 'rgba(139, 92, 246, 0.3)' },
  ];

  return (
    <div
      id="ai-insights-panel"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '1.3rem 1.5rem',
        marginBottom: '1.5rem',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          marginBottom: '1rem',
          paddingBottom: '0.85rem',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              background: 'rgba(59, 130, 246, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--accent)',
            }}
          >
            <Bot size={18} />
          </div>
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '1rem',
                fontWeight: 700,
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span>🤖 AI Insights</span>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: '10px',
                  background:
                    analysisSource === 'openrouter'
                      ? 'rgba(155, 114, 247, 0.15)'
                      : analysisSource === 'fallback' || analysisSource === 'deterministic'
                      ? 'rgba(16, 185, 129, 0.15)'
                      : 'var(--accent-light)',
                  color:
                    analysisSource === 'openrouter'
                      ? '#9b72f7'
                      : analysisSource === 'fallback' || analysisSource === 'deterministic'
                      ? 'var(--green)'
                      : 'var(--accent)',
                  border: `1px solid ${
                    analysisSource === 'openrouter'
                      ? '#9b72f7'
                      : analysisSource === 'fallback' || analysisSource === 'deterministic'
                      ? 'var(--green)'
                      : 'var(--accent)'
                  }`,
                }}
              >
                {analysisSource === 'openrouter'
                  ? 'OpenRouter Analysis'
                  : analysisSource === 'fallback' || analysisSource === 'deterministic'
                  ? 'Kernel Telemetry Engine'
                  : 'Gemini 3.8 Intelligence'}
              </span>
            </h3>
            <span style={{ fontSize: '0.74rem', color: 'var(--dim)' }}>
              In-context RAG post-simulation telemetry synthesis &amp; kernel trade-off analysis
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {onOpenRAG && (
            <button
              type="button"
              onClick={() =>
                onOpenRAG(
                  'Why did the winning algorithm perform best on this workload, and what are the specific scheduling trade-offs?'
                )
              }
              style={{
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.35)',
                color: 'var(--accent)',
                borderRadius: '6px',
                fontSize: '0.8rem',
                fontWeight: 600,
                padding: '0.42rem 0.9rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
                cursor: 'pointer',
              }}
            >
              <Bot size={15} />
              <span>Ask RAG Copilot</span>
            </button>
          )}

          {analysisText ? (
            <button
              type="button"
              onClick={handleGenerateAnalysis}
              disabled={isAssembling || isLoading}
              className="add-btn"
              style={{
                fontSize: '0.78rem',
                padding: '0.4rem 0.9rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.4rem',
              }}
            >
              <RotateCcw size={13} />
              <span>Regenerate</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleGenerateAnalysis}
              disabled={isAssembling || isLoading}
              className="run-btn"
              style={{
                fontSize: '0.82rem',
                padding: '0.45rem 1.1rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <Sparkles size={14} />
              <span>Generate Analysis</span>
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div
          style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid var(--red)',
            borderRadius: '6px',
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            color: 'var(--red)',
            fontSize: '0.8rem',
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Assembly animation (UX Feature) */}
      {isAssembling && (
        <div
          style={{
            background: 'var(--surface-secondary)',
            border: '1px dashed var(--accent)',
            borderRadius: '8px',
            padding: '1.25rem',
            marginBottom: '1rem',
            textAlign: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
            <FileText size={18} style={{ color: 'var(--accent)' }} className="animate-pulse" />
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.84rem', fontWeight: 600, color: 'var(--accent)' }}>
              Retrieving &amp; Assembling RAG Telemetry Context...
            </span>
          </div>
          <span style={{ fontSize: '0.74rem', color: 'var(--dim)' }}>
            Bundling {processes.length} tasks, queue metrics, starvation audit &amp; ranked benchmarks into structured document
          </span>
        </div>
      )}

      {/* Loading state */}
      {isLoading && !isAssembling && (
        <div
          style={{
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '1.5rem',
            marginBottom: '1rem',
            textAlign: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
            <Loader2 size={20} className="animate-spin" style={{ color: 'var(--accent)' }} />
            <span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '0.84rem', fontWeight: 600, color: 'var(--text)' }}>
              Synthesizing Executive OS Performance Evaluation with Gemini...
            </span>
          </div>
          <span style={{ fontSize: '0.74rem', color: 'var(--dim)' }}>
            Comparing {ALGO_NAMES[actualBest]} metrics against runner-up algorithms
          </span>
        </div>
      )}

      {/* Analysis Response */}
      {analysisText && !isAssembling && !isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', marginBottom: '1rem' }}>
          {parsedParagraphs.map((para, idx) => {
            const style = sectionStyles[idx % sectionStyles.length];
            return (
              <div
                key={idx}
                style={{
                  background: style.bg,
                  border: `1px solid ${style.border}`,
                  borderRadius: '7px',
                  padding: '1rem 1.15rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    marginBottom: '0.45rem',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      color: style.color,
                      letterSpacing: '0.04em',
                    }}
                  >
                    §{idx + 1} • {style.title}
                  </span>
                </div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.85rem',
                    lineHeight: '1.55',
                    color: 'var(--text)',
                  }}
                >
                  {para}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {!analysisText && !isAssembling && !isLoading && (
        <div
          style={{
            background: 'var(--surface-secondary)',
            border: '1px dashed var(--border)',
            borderRadius: '6px',
            padding: '1.25rem',
            textAlign: 'center',
            color: 'var(--dim)',
            fontSize: '0.8rem',
            marginBottom: '1rem',
          }}
        >
          Click <strong style={{ color: 'var(--text)' }}>Generate Analysis</strong> above to assemble the RAG telemetry context and generate a 4-paragraph performance review.
        </div>
      )}

      {/* Quick Interactive RAG Inquiry Bar */}
      {onOpenRAG && (
        <div
          style={{
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '0.65rem 0.85rem',
            marginBottom: '0.9rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.74rem', color: 'var(--text)' }}>
            <Sparkles size={13} style={{ color: 'var(--accent)' }} />
            <span style={{ fontWeight: 600 }}>Deep RAG Queries:</span>
          </div>

          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {[
              { label: '🏆 Why Winner Won', q: 'Why did the winning algorithm perform best on this workload?' },
              { label: '⏱️ Optimal Quantum', q: 'What is the optimal Round Robin quantum for this workload, and what are the trade-offs?' },
              { label: '🛡️ Fix Starvation', q: 'How do we eliminate starvation risks for longer tasks in this workload?' },
              { label: '🐧 Linux CFS Comparison', q: 'How would the Linux Completely Fair Scheduler (CFS) handle this task queue?' },
            ].map((chip, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => onOpenRAG(chip.q)}
                style={{
                  background: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: '12px',
                  padding: '2px 8px',
                  fontSize: '0.68rem',
                  color: 'var(--text)',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                {chip.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Small Expandable: "View context sent to AI" */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.65rem' }}>
        <button
          type="button"
          onClick={() => setShowRawContext((prev) => !prev)}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--dim)',
            cursor: 'pointer',
            padding: '0.2rem 0',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontSize: '0.74rem',
            fontFamily: 'IBM Plex Mono, monospace',
          }}
        >
          <FileText size={13} />
          <span>{showRawContext ? 'Hide context sent to AI' : 'View context sent to AI (RAG Transparency)'}</span>
          {showRawContext ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>

        {showRawContext && (
          <div style={{ marginTop: '0.65rem' }}>
            <pre
              style={{
                background: 'var(--surface-secondary)',
                border: '1px solid var(--border)',
                borderRadius: '6px',
                padding: '0.85rem 1rem',
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: '0.72rem',
                color: 'var(--text)',
                lineHeight: '1.45',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                margin: 0,
                maxHeight: '300px',
                overflowY: 'auto',
              }}
            >
              {contextDocument}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};
