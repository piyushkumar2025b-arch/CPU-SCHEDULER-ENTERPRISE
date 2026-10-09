import React, { useState } from 'react';
import { AllResults, ProcessInput } from '../types';
import { DetectedAnomaly, detectAnomalies } from '../utils/anomalyDetector';
import { AlertCircle, AlertTriangle, Info, CheckCircle2, ShieldCheck, Wrench, Layers, Sparkles } from 'lucide-react';

interface AnomalyDashboardProps {
  processes: ProcessInput[];
  results: AllResults;
  quantum: number;
  processNames?: string[];
  onOpenRAG?: (question: string) => void;
}

export const AnomalyDashboard: React.FC<AnomalyDashboardProps> = ({
  processes,
  results,
  quantum,
  processNames,
  onOpenRAG,
}) => {
  const [filterSeverity, setFilterSeverity] = useState<'all' | 'critical' | 'warning' | 'info'>('all');

  const anomalies = detectAnomalies(processes, results, quantum, processNames);

  const filtered = anomalies.filter((a) => {
    if (filterSeverity === 'all') return true;
    return a.severity === filterSeverity;
  });

  const criticalCount = anomalies.filter((a) => a.severity === 'critical').length;
  const warningCount = anomalies.filter((a) => a.severity === 'warning').length;
  const infoCount = anomalies.filter((a) => a.severity === 'info').length;

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '1.25rem',
        marginBottom: '1.5rem',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.75rem',
          marginBottom: '1rem',
          paddingBottom: '0.75rem',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              background: 'rgba(235, 59, 90, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--red)',
            }}
          >
            <AlertTriangle size={18} />
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--text)' }}>
              Execution Anomaly &amp; Inefficiency Auditor
            </h3>
            <span style={{ fontSize: '0.74rem', color: 'var(--dim)' }}>
              Automated detection of Convoy effects, thrashing, priority lockout, and quantum degradation
            </span>
          </div>
        </div>

        {/* Filter buttons */}
        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => setFilterSeverity('all')}
            style={{
              background: filterSeverity === 'all' ? 'var(--accent)' : 'var(--surface-secondary)',
              color: filterSeverity === 'all' ? '#ffffff' : 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '0.25rem 0.6rem',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            All ({anomalies.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterSeverity('critical')}
            style={{
              background: filterSeverity === 'critical' ? 'var(--red)' : 'var(--surface-secondary)',
              color: filterSeverity === 'critical' ? '#ffffff' : 'var(--red)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '0.25rem 0.6rem',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Critical ({criticalCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterSeverity('warning')}
            style={{
              background: filterSeverity === 'warning' ? 'var(--yellow)' : 'var(--surface-secondary)',
              color: filterSeverity === 'warning' ? '#000000' : 'var(--yellow)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '0.25rem 0.6rem',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Warnings ({warningCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterSeverity('info')}
            style={{
              background: filterSeverity === 'info' ? 'var(--accent)' : 'var(--surface-secondary)',
              color: filterSeverity === 'info' ? '#ffffff' : 'var(--accent)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '0.25rem 0.6rem',
              fontSize: '0.72rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Info ({infoCount})
          </button>
        </div>
      </div>

      {/* Anomaly list */}
      {filtered.length === 0 ? (
        <div
          key="empty-state"
          style={{
            background: 'rgba(62, 207, 142, 0.1)',
            borderTop: '1px solid var(--green)',
            borderRight: '1px solid var(--green)',
            borderBottom: '1px solid var(--green)',
            borderLeft: '1px solid var(--green)',
            borderRadius: '6px',
            padding: '1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.65rem',
            color: 'var(--green)',
            fontSize: '0.82rem',
          }}
        >
          <ShieldCheck size={18} />
          <span>
            {anomalies.length === 0
              ? 'No severe algorithmic bottlenecks detected for this workload. Queue distributions operate within nominal parameters.'
              : 'No anomalies match the selected severity filter.'}
          </span>
        </div>
      ) : (
        <div key="anomaly-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filtered.map((anomaly) => {
            const isCrit = anomaly.severity === 'critical';
            const isWarn = anomaly.severity === 'warning';
            const color = isCrit ? 'var(--red)' : isWarn ? 'var(--yellow)' : 'var(--accent)';
            const bg = isCrit
              ? 'rgba(235, 59, 90, 0.08)'
              : isWarn
              ? 'rgba(245, 200, 66, 0.08)'
              : 'rgba(79, 142, 247, 0.08)';

            return (
              <div
                key={anomaly.id}
                style={{
                  background: bg,
                  borderTop: `1px solid ${color}44`,
                  borderRight: `1px solid ${color}44`,
                  borderBottom: `1px solid ${color}44`,
                  borderLeft: `4px solid ${color}`,
                  borderRadius: '6px',
                  padding: '0.85rem 1rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem', flexWrap: 'wrap', gap: '0.4rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {isCrit ? (
                      <AlertCircle size={16} style={{ color }} />
                    ) : isWarn ? (
                      <AlertTriangle size={16} style={{ color }} />
                    ) : (
                      <Info size={16} style={{ color }} />
                    )}
                    <strong style={{ fontSize: '0.84rem', color: 'var(--text)' }}>
                      {anomaly.title}
                    </strong>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontFamily: 'IBM Plex Mono, monospace',
                        padding: '1px 6px',
                        borderRadius: '3px',
                        background: 'var(--surface-secondary)',
                        color: 'var(--text)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      {anomaly.algorithm.toUpperCase()}
                    </span>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '1px 6px',
                        borderRadius: '3px',
                        background: color,
                        color: isWarn ? '#000000' : '#ffffff',
                      }}
                    >
                      {anomaly.severity}
                    </span>
                  </div>
                </div>

                <div style={{ fontSize: '0.74rem', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--dim)', marginBottom: '0.4rem' }}>
                  Metric Evidence: {anomaly.metric}
                </div>

                <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.78rem', color: 'var(--text)', lineHeight: '1.4' }}>
                  {anomaly.description}
                </p>

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '0.45rem',
                    fontSize: '0.75rem',
                    color: 'var(--text)',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    borderRadius: '4px',
                    padding: '0.45rem 0.65rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.45rem', flex: 1, minWidth: '220px' }}>
                    <Wrench size={13} style={{ color: 'var(--green)', flexShrink: 0, marginTop: '2px' }} />
                    <div>
                      <strong style={{ color: 'var(--green)' }}>Recommended Mitigation: </strong>
                      <span>{anomaly.mitigation}</span>
                    </div>
                  </div>

                  {onOpenRAG && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenRAG(
                          `How do we eliminate the ${anomaly.title} anomaly detected on ${anomaly.algorithm.toUpperCase()} (Metric: ${anomaly.metric}) in this workload, and how does the kernel scheduling policy address it?`
                        )
                      }
                      style={{
                        background: 'rgba(59, 130, 246, 0.1)',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: '4px',
                        padding: '0.25rem 0.55rem',
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        color: 'var(--accent)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.3rem',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <Sparkles size={11} />
                      <span>Ask RAG Solution</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
