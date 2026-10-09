import React, { useState } from 'react';
import { ProcessStarvationRisk } from '../utils/starvationAnalyzer';
import { ShieldAlert, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, Sparkles } from 'lucide-react';

interface StarvationRiskReportProps {
  starvationRisks: ProcessStarvationRisk[];
  processNames?: string[];
  onOpenRAG?: (question: string) => void;
}

export const StarvationRiskReport: React.FC<StarvationRiskReportProps> = ({
  starvationRisks,
  processNames,
  onOpenRAG,
}) => {
  const [isOpen, setIsOpen] = useState(true);

  // Filter processes that have low, medium, or high risk, with emphasis on medium & high
  const atRiskProcesses = starvationRisks.filter(
    (r) => r.sjfRisk !== 'none' || r.priorityRisk !== 'none'
  );

  const severeRiskCount = starvationRisks.filter(
    (r) => r.sjfRisk === 'high' || r.priorityRisk === 'high' || r.sjfRisk === 'medium' || r.priorityRisk === 'medium'
  ).length;

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '1.1rem 1.3rem',
        marginBottom: '1.25rem',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text)',
          cursor: 'pointer',
          padding: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: severeRiskCount > 0 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: severeRiskCount > 0 ? 'var(--yellow)' : 'var(--green)',
            }}
          >
            <ShieldAlert size={16} />
          </div>
          <div style={{ textAlign: 'left' }}>
            <h3
              style={{
                margin: 0,
                fontSize: '0.95rem',
                fontWeight: 700,
                color: 'var(--text)',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span>Starvation Risk Report</span>
              {severeRiskCount > 0 ? (
                <span
                  style={{
                    background: 'rgba(239, 68, 68, 0.15)',
                    color: 'var(--red)',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: '10px',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    fontFamily: 'IBM Plex Mono, monospace',
                  }}
                >
                  {severeRiskCount} At Risk
                </span>
              ) : (
                <span
                  style={{
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: 'var(--green)',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: '10px',
                    border: '1px solid rgba(16, 185, 129, 0.3)',
                    fontFamily: 'IBM Plex Mono, monospace',
                  }}
                >
                  All Clean
                </span>
              )}
            </h3>
            <span style={{ fontSize: '0.72rem', color: 'var(--dim)' }}>
              Pre-simulation static vulnerability audit for unfair starvation under SJF and Priority dispatch
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--dim)', fontSize: '0.75rem' }}>
          <span>{isOpen ? 'Collapse' : 'Expand'}</span>
          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {isOpen && (
        <div style={{ marginTop: '1rem', borderTop: '1px solid var(--border)', paddingTop: '0.85rem' }}>
          {atRiskProcesses.length === 0 ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6rem',
                padding: '0.85rem',
                background: 'rgba(16, 185, 129, 0.08)',
                borderRadius: '6px',
                border: '1px solid rgba(16, 185, 129, 0.25)',
                color: 'var(--green)',
                fontSize: '0.8rem',
              }}
            >
              <CheckCircle2 size={16} style={{ flexShrink: 0 }} />
              <span>No starvation risks detected. Process bursts and priorities are uniformly balanced across the workload.</span>
            </div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                <thead>
                  <tr
                    style={{
                      background: 'var(--surface-secondary)',
                      borderBottom: '1px solid var(--border)',
                      textAlign: 'left',
                    }}
                  >
                    <th style={{ padding: '7px 10px', fontFamily: 'IBM Plex Mono, monospace', width: '55px' }}>
                      PID
                    </th>
                    <th style={{ padding: '7px 10px' }}>Process Name</th>
                    <th style={{ padding: '7px 10px', width: '100px' }}>SJF Risk</th>
                    <th style={{ padding: '7px 10px', width: '110px' }}>Priority Risk</th>
                    <th style={{ padding: '7px 10px', fontFamily: 'IBM Plex Mono, monospace', width: '140px' }}>
                      Starves After (t=?)
                    </th>
                    <th style={{ padding: '7px 10px', fontFamily: 'IBM Plex Mono, monospace', width: '150px' }}>
                      Suggested Aging Rate
                    </th>
                    <th style={{ padding: '7px 10px' }}>Audit Diagnostics</th>
                  </tr>
                </thead>
                <tbody>
                  {atRiskProcesses.map((risk) => {
                    const pName = processNames?.[risk.pid] || `Task ${risk.pid}`;
                    const isHighRisk = risk.sjfRisk === 'high' || risk.priorityRisk === 'high';
                    const isMedRisk = risk.sjfRisk === 'medium' || risk.priorityRisk === 'medium';

                    return (
                      <tr
                        key={risk.pid}
                        style={{
                          borderBottom: '1px solid var(--border)',
                          background: isHighRisk
                            ? 'rgba(239, 68, 68, 0.06)'
                            : isMedRisk
                            ? 'rgba(245, 158, 11, 0.04)'
                            : 'transparent',
                        }}
                      >
                        <td
                          style={{
                            padding: '7px 10px',
                            fontFamily: 'IBM Plex Mono, monospace',
                            fontWeight: 700,
                            color: 'var(--text)',
                          }}
                        >
                          P{risk.pid}
                        </td>
                        <td style={{ padding: '7px 10px', fontWeight: 600, color: 'var(--text)' }}>
                          {pName}
                        </td>
                        <td style={{ padding: '7px 10px' }}>
                          <span
                            style={{
                              padding: '2px 7px',
                              borderRadius: '4px',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              fontFamily: 'IBM Plex Mono, monospace',
                              background:
                                risk.sjfRisk === 'high'
                                  ? 'rgba(239, 68, 68, 0.15)'
                                  : risk.sjfRisk === 'medium'
                                  ? 'rgba(245, 158, 11, 0.15)'
                                  : 'var(--surface-secondary)',
                              color:
                                risk.sjfRisk === 'high'
                                  ? 'var(--red)'
                                  : risk.sjfRisk === 'medium'
                                  ? 'var(--yellow)'
                                  : 'var(--dim)',
                              border:
                                risk.sjfRisk === 'high'
                                  ? '1px solid rgba(239, 68, 68, 0.3)'
                                  : risk.sjfRisk === 'medium'
                                  ? '1px solid rgba(245, 158, 11, 0.3)'
                                  : '1px solid var(--border)',
                            }}
                          >
                            {risk.sjfRisk}
                          </span>
                        </td>
                        <td style={{ padding: '7px 10px' }}>
                          <span
                            style={{
                              padding: '2px 7px',
                              borderRadius: '4px',
                              fontSize: '0.68rem',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              fontFamily: 'IBM Plex Mono, monospace',
                              background:
                                risk.priorityRisk === 'high'
                                  ? 'rgba(239, 68, 68, 0.15)'
                                  : risk.priorityRisk === 'medium'
                                  ? 'rgba(245, 158, 11, 0.15)'
                                  : 'var(--surface-secondary)',
                              color:
                                risk.priorityRisk === 'high'
                                  ? 'var(--red)'
                                  : risk.priorityRisk === 'medium'
                                  ? 'var(--yellow)'
                                  : 'var(--dim)',
                              border:
                                risk.priorityRisk === 'high'
                                  ? '1px solid rgba(239, 68, 68, 0.3)'
                                  : risk.priorityRisk === 'medium'
                                  ? '1px solid rgba(245, 158, 11, 0.3)'
                                  : '1px solid var(--border)',
                            }}
                          >
                            {risk.priorityRisk}
                          </span>
                        </td>
                        <td
                          style={{
                            padding: '7px 10px',
                            fontFamily: 'IBM Plex Mono, monospace',
                            fontWeight: 600,
                            color: 'var(--text)',
                          }}
                        >
                          t ≥ {risk.starvationThresholdTime}
                        </td>
                        <td
                          style={{
                            padding: '7px 10px',
                            fontFamily: 'IBM Plex Mono, monospace',
                          }}
                        >
                          {risk.suggestedAgingRate > 0 ? (
                            <span
                              style={{
                                color: 'var(--accent)',
                                fontWeight: 700,
                                background: 'var(--accent-light)',
                                padding: '2px 6px',
                                borderRadius: '4px',
                              }}
                            >
                              +{risk.suggestedAgingRate} / 5 units
                            </span>
                          ) : (
                            <span style={{ color: 'var(--dim)' }}>0 (Nominal)</span>
                          )}
                        </td>
                        <td style={{ padding: '7px 10px', color: 'var(--dim)', fontSize: '0.74rem' }}>
                          {risk.explanation}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {onOpenRAG && atRiskProcesses.length > 0 && (
              <div style={{ marginTop: '0.75rem', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() =>
                    onOpenRAG(
                      `How should dynamic priority aging or Multi-Level Feedback Queues (MLFQ) be calibrated to eliminate starvation for tasks (${atRiskProcesses
                        .map((r) => `P${r.pid}`)
                        .join(', ')}) in this workload without degrading overall system throughput?`
                    )
                  }
                  style={{
                    background: 'rgba(245, 158, 11, 0.1)',
                    border: '1px solid rgba(245, 158, 11, 0.35)',
                    borderRadius: '4px',
                    padding: '0.35rem 0.75rem',
                    fontSize: '0.74rem',
                    fontWeight: 600,
                    color: 'var(--yellow)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Sparkles size={12} />
                  <span>Ask RAG Aging Strategy &amp; MLFQ Tuning</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    )}
  </div>
);
};
