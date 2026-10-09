import React from 'react';
import { AlgorithmKey } from '../types';
import { ALGO_COLORS, ALGO_NAMES } from './GanttChart';
import { WorkloadFingerprint } from '../utils/workloadFingerprint';
import { AlgoRecommendation } from '../utils/algoRecommender';
import { AlertTriangle } from 'lucide-react';

interface AIRecommendationPanelProps {
  fingerprint: WorkloadFingerprint;
  recommendation: AlgoRecommendation;
}

export const AIRecommendationPanel: React.FC<AIRecommendationPanelProps> = ({
  fingerprint,
  recommendation,
}) => {
  const {
    winner,
    confidence,
    ranked,
    scores,
    reasons,
    warnings,
    workloadClass,
  } = recommendation;

  const winnerColor = ALGO_COLORS[winner] || 'var(--accent)';
  const winnerName = ALGO_NAMES[winner] || winner.toUpperCase();
  const confidencePercent = Math.round(confidence * 100);

  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '1.25rem 1.4rem',
        marginBottom: '1.25rem',
        boxShadow: 'var(--card-shadow)',
      }}
    >
      {/* Header with badge showing workloadClass */}
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
          <h2
            style={{
              margin: 0,
              fontSize: '1.05rem',
              fontWeight: 700,
              color: 'var(--text)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <span>🧠 AI Workload Analysis</span>
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span
            style={{
              fontSize: '0.74rem',
              fontWeight: 700,
              padding: '3px 10px',
              borderRadius: '20px',
              background: 'var(--accent-light)',
              border: '1px solid var(--accent)',
              color: 'var(--accent)',
              fontFamily: 'IBM Plex Mono, monospace',
            }}
          >
            Class: {workloadClass}
          </span>
        </div>
      </div>

      {/* Main Top Grid: Winner & Confidence on Left, Ranked List on Right */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.25rem',
          marginBottom: '1.25rem',
        }}
      >
        {/* Left Card: Large recommended algorithm & Confidence bar */}
        <div
          style={{
            background: 'var(--surface-secondary)',
            border: `1px solid ${winnerColor}50`,
            borderRadius: '8px',
            padding: '1.2rem',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--dim)',
                display: 'block',
                marginBottom: '0.35rem',
                fontFamily: 'IBM Plex Mono, monospace',
              }}
            >
              Top Recommended Algorithm
            </span>

            <div
              style={{
                fontSize: '1.5rem',
                fontWeight: 800,
                color: winnerColor,
                fontFamily: 'Plus Jakarta Sans',
                marginBottom: '0.4rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <span>{winnerName}</span>
            </div>

            <p
              style={{
                margin: 0,
                fontSize: '0.82rem',
                color: 'var(--text)',
                lineHeight: '1.45',
                marginBottom: '1rem',
              }}
            >
              {reasons[winner]}
            </p>
          </div>

          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.74rem',
                marginBottom: '0.35rem',
              }}
            >
              <span style={{ color: 'var(--dim)', fontWeight: 600 }}>Suitability Confidence</span>
              <span
                style={{
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontWeight: 700,
                  color: 'var(--text)',
                }}
              >
                {confidencePercent}%
              </span>
            </div>
            {/* Confidence bar */}
            <div
              style={{
                width: '100%',
                height: '8px',
                background: 'var(--border)',
                borderRadius: '4px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: `${confidencePercent}%`,
                  height: '100%',
                  background: winnerColor,
                  borderRadius: '4px',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        </div>

        {/* Right Card: Ranked list of all 6 algorithms with mini horizontal bars & scores */}
        <div
          style={{
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '1.2rem',
          }}
        >
          <span
            style={{
              fontSize: '0.68rem',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--dim)',
              display: 'block',
              marginBottom: '0.75rem',
              fontFamily: 'IBM Plex Mono, monospace',
            }}
          >
            Algorithm Suitability Ranking (0–100)
          </span>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
            {ranked.map((key, idx) => {
              const sc = scores[key] || 0;
              const clr = ALGO_COLORS[key];
              const isWin = key === winner;

              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span
                    style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      width: '18px',
                      color: isWin ? 'var(--text)' : 'var(--dim)',
                    }}
                  >
                    #{idx + 1}
                  </span>

                  <span
                    style={{
                      fontSize: '0.76rem',
                      fontWeight: isWin ? 700 : 600,
                      width: '78px',
                      color: isWin ? clr : 'var(--text)',
                      fontFamily: 'IBM Plex Mono, monospace',
                    }}
                  >
                    {key.toUpperCase()}
                  </span>

                  {/* Mini horizontal bar */}
                  <div
                    style={{
                      flex: 1,
                      height: '7px',
                      background: 'var(--border)',
                      borderRadius: '4px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.max(2, sc)}%`,
                        height: '100%',
                        background: clr,
                        borderRadius: '4px',
                        transition: 'width 0.25s ease',
                      }}
                    />
                  </div>

                  <span
                    style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      color: isWin ? clr : 'var(--dim)',
                      width: '38px',
                      textAlign: 'right',
                    }}
                  >
                    {sc}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Reasons per algorithm */}
      <div
        style={{
          background: 'var(--surface-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '0.9rem 1.1rem',
          marginBottom: '1rem',
        }}
      >
        <span
          style={{
            fontSize: '0.68rem',
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--dim)',
            display: 'block',
            marginBottom: '0.6rem',
            fontFamily: 'IBM Plex Mono, monospace',
          }}
        >
          Algorithmic Rationale &amp; Dispatch Drivers
        </span>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '0.5rem 1rem',
          }}
        >
          {ranked.map((key) => (
            <div key={key} style={{ fontSize: '0.76rem', lineHeight: '1.4' }}>
              <strong style={{ color: ALGO_COLORS[key], fontFamily: 'IBM Plex Mono, monospace' }}>
                {ALGO_NAMES[key]}:
              </strong>{' '}
              <span style={{ color: 'var(--text)' }}>{reasons[key]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Warnings in a yellow warning box */}
      {warnings.length > 0 && (
        <div
          style={{
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid var(--yellow)',
            borderRadius: '6px',
            padding: '0.75rem 1rem',
            marginBottom: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.35rem',
          }}
        >
          {warnings.map((w, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '0.5rem',
                fontSize: '0.78rem',
                color: 'var(--text)',
              }}
            >
              <AlertTriangle
                size={15}
                style={{ color: 'var(--yellow)', flexShrink: 0, marginTop: '2px' }}
              />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Fingerprint data row showing: burstCV, arrivalDensity, priorityEntropy, starvationRiskScore, heavyTailScore as small labeled stat chips */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
          gap: '0.6rem',
        }}
      >
        <div
          style={{
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '0.5rem 0.75rem',
          }}
        >
          <span style={{ fontSize: '0.68rem', color: 'var(--dim)', display: 'block' }}>
            burstCV (σ/μ)
          </span>
          <span
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '0.92rem',
              fontWeight: 700,
              color: 'var(--text)',
            }}
          >
            {fingerprint.burstCV.toFixed(2)}
          </span>
        </div>

        <div
          style={{
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '0.5rem 0.75rem',
          }}
        >
          <span style={{ fontSize: '0.68rem', color: 'var(--dim)', display: 'block' }}>
            arrivalDensity
          </span>
          <span
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '0.92rem',
              fontWeight: 700,
              color: 'var(--text)',
            }}
          >
            {fingerprint.arrivalDensity.toFixed(2)}
          </span>
        </div>

        <div
          style={{
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '0.5rem 0.75rem',
          }}
        >
          <span style={{ fontSize: '0.68rem', color: 'var(--dim)', display: 'block' }}>
            priorityEntropy
          </span>
          <span
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '0.92rem',
              fontWeight: 700,
              color: 'var(--text)',
            }}
          >
            {fingerprint.priorityEntropy.toFixed(2)}
          </span>
        </div>

        <div
          style={{
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '0.5rem 0.75rem',
          }}
        >
          <span style={{ fontSize: '0.68rem', color: 'var(--dim)', display: 'block' }}>
            starvationRiskScore
          </span>
          <span
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '0.92rem',
              fontWeight: 700,
              color: fingerprint.starvationRiskScore > 0.5 ? 'var(--red)' : 'var(--text)',
            }}
          >
            {fingerprint.starvationRiskScore.toFixed(2)}
          </span>
        </div>

        <div
          style={{
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '0.5rem 0.75rem',
          }}
        >
          <span style={{ fontSize: '0.68rem', color: 'var(--dim)', display: 'block' }}>
            heavyTailScore
          </span>
          <span
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '0.92rem',
              fontWeight: 700,
              color: 'var(--text)',
            }}
          >
            {fingerprint.heavyTailScore.toFixed(2)}
          </span>
        </div>
      </div>
    </div>
  );
};
