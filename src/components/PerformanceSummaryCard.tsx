import React from 'react';
import { AllResults, AlgorithmKey } from '../types';
import { ALGO_COLORS, ALGO_NAMES } from './GanttChart';
import { useTheme } from '../context/ThemeContext';
import { Activity, Info } from 'lucide-react';

interface PerformanceSummaryCardProps {
  results: AllResults;
}

export const PerformanceSummaryCard: React.FC<PerformanceSummaryCardProps> = ({ results }) => {
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const algoKeys: AlgorithmKey[] = ['fcfs', 'sjf', 'srtf', 'rr', 'priority', 'pprior'];

  // Calculate Best and Worst for Waiting Time
  let minWT = Infinity;
  let maxWT = -Infinity;
  algoKeys.forEach((k) => {
    if (results[k].avgWT < minWT) minWT = results[k].avgWT;
    if (results[k].avgWT > maxWT) maxWT = results[k].avgWT;
  });
  const bestWTAlgos = algoKeys.filter((k) => Math.abs(results[k].avgWT - minWT) < 0.001);
  const worstWTAlgos = algoKeys.filter((k) => Math.abs(results[k].avgWT - maxWT) < 0.001);

  // Calculate Best and Worst for Turnaround Time
  let minTAT = Infinity;
  let maxTAT = -Infinity;
  algoKeys.forEach((k) => {
    if (results[k].avgTAT < minTAT) minTAT = results[k].avgTAT;
    if (results[k].avgTAT > maxTAT) maxTAT = results[k].avgTAT;
  });
  const bestTATAlgos = algoKeys.filter((k) => Math.abs(results[k].avgTAT - minTAT) < 0.001);
  const worstTATAlgos = algoKeys.filter((k) => Math.abs(results[k].avgTAT - maxTAT) < 0.001);

  // Spread and ratios
  const wtSpread = +(maxWT - minWT).toFixed(2);
  const wtRatio = minWT > 0 ? (maxWT / minWT).toFixed(1) : '∞';

  const tatSpread = +(maxTAT - minTAT).toFixed(2);
  const tatRatio = minTAT > 0 ? (maxTAT / minTAT).toFixed(1) : '1.0';

  // Average burst time invariant
  const anyStats = results[algoKeys[0]].stats;
  const avgBT = anyStats.length > 0
    ? +(anyStats.reduce((acc, s) => acc + s.BT, 0) / anyStats.length).toFixed(2)
    : 0;

  // SYSTEM 5: Extended Fairness + Advanced Metrics for all 6 algorithms
  const fcfsAvgWT = results.fcfs.avgWT;
  const extendedMetrics: Record<
    AlgorithmKey,
    {
      jfi: number;
      speedupVsFcfs: string;
      speedupVal: number;
      starvationCount: number;
      avgRR: number;
    }
  > = {} as any;

  algoKeys.forEach((key) => {
    const res = results[key];
    const stats = res.stats;
    let sumX = 0;
    let sumX2 = 0;
    let starvationCount = 0;
    let totalRR = 0;

    stats.forEach((s) => {
      // 1. Jain's Fairness Index: x_i = 1 / (WT_i + 1)
      const xi = 1 / (s.WT + 1);
      sumX += xi;
      sumX2 += xi * xi;

      // 3. Starvation Count: WT > 3 * avgBurstTime
      if (avgBT > 0 && s.WT > 3 * avgBT) {
        starvationCount++;
      }

      // 4. Response Ratio: (WT_i + BT_i) / BT_i
      const bt = s.BT || 1;
      totalRR += (s.WT + s.BT) / bt;
    });

    const jfiRaw =
      stats.length > 0 && sumX2 > 0
        ? (sumX * sumX) / (stats.length * sumX2)
        : 1;
    const jfi = Math.min(1, Math.max(0, Math.round(jfiRaw * 100) / 100));

    // 2. Normalized Speedup vs FCFS: FCFS_avgWT / algo_avgWT
    let speedupStr = '1.0x';
    let speedupVal = 1.0;
    if (key === 'fcfs') {
      speedupStr = '1.0x (Baseline)';
      speedupVal = 1.0;
    } else if (res.avgWT === 0) {
      speedupStr = fcfsAvgWT === 0 ? '1.0x' : '∞';
      speedupVal = fcfsAvgWT === 0 ? 1.0 : 99.9;
    } else {
      speedupVal = +(fcfsAvgWT / res.avgWT).toFixed(2);
      speedupStr = `${speedupVal}x`;
    }

    const avgRR = stats.length > 0 ? +(totalRR / stats.length).toFixed(2) : 1;

    extendedMetrics[key] = {
      jfi,
      speedupVsFcfs: speedupStr,
      speedupVal,
      starvationCount,
      avgRR,
    };
  });

  return (
    <div
      id="performance-summary-card"
      style={{
        background: isLight
          ? 'linear-gradient(145deg, #ffffff 0%, #f8fafc 100%)'
          : 'linear-gradient(145deg, #131722 0%, #161a26 100%)',
        border: isLight ? '1px solid #cbd5e1' : '1px solid #2d3446',
        borderRadius: '8px',
        padding: '1.25rem 1.4rem',
        marginBottom: '1.5rem',
        boxShadow: isLight
          ? '0 4px 16px rgba(0, 0, 0, 0.05)'
          : '0 4px 20px rgba(0, 0, 0, 0.35)',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.6rem',
          paddingBottom: '0.85rem',
          borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid #232938',
          marginBottom: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <Activity size={18} style={{ color: 'var(--accent)' }} />
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '0.95rem',
                fontWeight: 600,
                color: isLight ? '#0f172a' : '#fff',
                fontFamily: 'IBM Plex Mono, monospace',
                letterSpacing: '0.02em',
              }}
            >
              Performance Highlights: Fastest vs. Slowest
            </h3>
            <span
              style={{
                fontSize: '0.75rem',
                color: 'var(--dim)',
                fontFamily: 'IBM Plex Sans, sans-serif',
              }}
            >
              How each algorithm handled delays (Wait Time) and completion speed (Turnaround Time)
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            background: isLight ? '#f1f5f9' : '#1a202c',
            border: isLight ? '1px solid #cbd5e1' : '1px solid #2d3748',
            borderRadius: '4px',
            padding: '0.2rem 0.6rem',
            fontSize: '0.68rem',
            fontFamily: 'IBM Plex Mono, monospace',
            color: isLight ? '#475569' : '#a0aec0',
          }}
        >
          <span>Workload Scope:</span>
          <strong style={{ color: isLight ? '#0f172a' : '#fff' }}>{anyStats.length} Processes</strong>
          <span style={{ color: isLight ? '#cbd5e1' : '#4a5568' }}>|</span>
          <span>Avg Burst:</span>
          <strong style={{ color: 'var(--accent)' }}>{avgBT} units</strong>
        </div>
      </div>

      {/* Grid for WT and TAT Comparison */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.2rem',
          marginBottom: '1rem',
        }}
      >
        {/* ── 1. WAITING TIME (WT) CARD ── */}
        <div
          id="summary-wait-time-card"
          style={{
            background: isLight ? '#ffffff' : '#0e1118',
            border: isLight ? '1px solid #cbd5e1' : '1px solid #232938',
            borderRadius: '6px',
            padding: '1rem',
            boxShadow: isLight ? '0 1px 3px rgba(0,0,0,0.03)' : 'none',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.85rem',
              borderBottom: isLight ? '1px solid #f1f5f9' : '1px solid #1a1f2c',
              paddingBottom: '0.5rem',
            }}
          >
            <span
              style={{
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: isLight ? '#0f172a' : '#d4daf0',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Waiting Time (WT)
            </span>
            <span
              style={{
                fontSize: '0.68rem',
                fontFamily: 'IBM Plex Mono, monospace',
                color: 'var(--dim)',
              }}
            >
              Lower is Better
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Absolute Best WT */}
            <div
              style={{
                background: isLight ? '#ecfdf5' : 'rgba(62, 207, 142, 0.08)',
                border: isLight ? '1px solid #86efac' : '1px solid rgba(62, 207, 142, 0.3)',
                borderRadius: '5px',
                padding: '0.65rem 0.85rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.6rem',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                  <span
                    style={{
                      background: 'var(--green)',
                      color: '#ffffff',
                      fontSize: '0.62rem',
                      fontWeight: 700,
                      fontFamily: 'IBM Plex Mono, monospace',
                      padding: '0.1rem 0.4rem',
                      borderRadius: '3px',
                      letterSpacing: '0.04em',
                    }}
                  >
                    BEST
                  </span>
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: isLight ? '#064e3b' : '#fff',
                      fontFamily: 'IBM Plex Mono, monospace',
                    }}
                  >
                    {bestWTAlgos.map((k) => ALGO_NAMES[k]).join(', ')}
                  </span>
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--dim)' }}>
                  Minimum process queue latency
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: '1.15rem',
                    fontWeight: 700,
                    color: 'var(--green)',
                  }}
                >
                  {minWT.toFixed(2)}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--dim)', fontFamily: 'IBM Plex Mono, monospace' }}>
                  units avg
                </div>
              </div>
            </div>

            {/* Absolute Worst WT */}
            <div
              style={{
                background: isLight ? '#fef2f2' : 'rgba(247, 96, 96, 0.08)',
                border: isLight ? '1px solid #fca5a5' : '1px solid rgba(247, 96, 96, 0.3)',
                borderRadius: '5px',
                padding: '0.65rem 0.85rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.6rem',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                  <span
                    style={{
                      background: 'var(--red)',
                      color: '#fff',
                      fontSize: '0.62rem',
                      fontWeight: 700,
                      fontFamily: 'IBM Plex Mono, monospace',
                      padding: '0.1rem 0.4rem',
                      borderRadius: '3px',
                      letterSpacing: '0.04em',
                    }}
                  >
                    WORST
                  </span>
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: isLight ? '#7f1d1d' : '#fff',
                      fontFamily: 'IBM Plex Mono, monospace',
                    }}
                  >
                    {worstWTAlgos.map((k) => ALGO_NAMES[k]).join(', ')}
                  </span>
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--dim)' }}>
                  Highest delay in ready queue
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: '1.15rem',
                    fontWeight: 700,
                    color: 'var(--red)',
                  }}
                >
                  {maxWT.toFixed(2)}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--dim)', fontFamily: 'IBM Plex Mono, monospace' }}>
                  units avg
                </div>
              </div>
            </div>

            {/* WT Performance Delta */}
            <div
              style={{
                background: isLight ? '#f8fafc' : '#131720',
                borderRadius: '4px',
                padding: '0.45rem 0.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: '0.72rem',
                border: isLight ? '1px solid #e2e8f0' : '1px solid #1c2230',
              }}
            >
              <span style={{ color: 'var(--dim)' }}>Performance Delta (Spread):</span>
              <span style={{ color: wtSpread === 0 ? 'var(--dim)' : (isLight ? '#b45309' : 'var(--yellow)'), fontWeight: 600 }}>
                +{wtSpread} units {wtRatio !== '1.0' && wtRatio !== '∞' ? `(${wtRatio}× spread)` : ''}
              </span>
            </div>
          </div>
        </div>

        {/* ── 2. TURNAROUND TIME (TAT) CARD ── */}
        <div
          id="summary-turnaround-time-card"
          style={{
            background: isLight ? '#ffffff' : '#0e1118',
            border: isLight ? '1px solid #cbd5e1' : '1px solid #232938',
            borderRadius: '6px',
            padding: '1rem',
            boxShadow: isLight ? '0 1px 3px rgba(0,0,0,0.03)' : 'none',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.85rem',
              borderBottom: isLight ? '1px solid #f1f5f9' : '1px solid #1a1f2c',
              paddingBottom: '0.5rem',
            }}
          >
            <span
              style={{
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: '0.82rem',
                fontWeight: 600,
                color: isLight ? '#0f172a' : '#d4daf0',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Turnaround Time (TAT)
            </span>
            <span
              style={{
                fontSize: '0.68rem',
                fontFamily: 'IBM Plex Mono, monospace',
                color: 'var(--dim)',
              }}
            >
              Lower is Better
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {/* Absolute Best TAT */}
            <div
              style={{
                background: isLight ? '#eff6ff' : 'rgba(79, 142, 247, 0.08)',
                border: isLight ? '1px solid #93c5fd' : '1px solid rgba(79, 142, 247, 0.3)',
                borderRadius: '5px',
                padding: '0.65rem 0.85rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.6rem',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                  <span
                    style={{
                      background: 'var(--accent)',
                      color: '#fff',
                      fontSize: '0.62rem',
                      fontWeight: 700,
                      fontFamily: 'IBM Plex Mono, monospace',
                      padding: '0.1rem 0.4rem',
                      borderRadius: '3px',
                      letterSpacing: '0.04em',
                    }}
                  >
                    BEST
                  </span>
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: isLight ? '#1e3a8a' : '#fff',
                      fontFamily: 'IBM Plex Mono, monospace',
                    }}
                  >
                    {bestTATAlgos.map((k) => ALGO_NAMES[k]).join(', ')}
                  </span>
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--dim)' }}>
                  Fastest total time from arrival to completion
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: '1.15rem',
                    fontWeight: 700,
                    color: 'var(--accent)',
                  }}
                >
                  {minTAT.toFixed(2)}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--dim)', fontFamily: 'IBM Plex Mono, monospace' }}>
                  units avg
                </div>
              </div>
            </div>

            {/* Absolute Worst TAT */}
            <div
              style={{
                background: isLight ? '#fef2f2' : 'rgba(247, 96, 96, 0.08)',
                border: isLight ? '1px solid #fca5a5' : '1px solid rgba(247, 96, 96, 0.3)',
                borderRadius: '5px',
                padding: '0.65rem 0.85rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.6rem',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                  <span
                    style={{
                      background: 'var(--red)',
                      color: '#fff',
                      fontSize: '0.62rem',
                      fontWeight: 700,
                      fontFamily: 'IBM Plex Mono, monospace',
                      padding: '0.1rem 0.4rem',
                      borderRadius: '3px',
                      letterSpacing: '0.04em',
                    }}
                  >
                    WORST
                  </span>
                  <span
                    style={{
                      fontSize: '0.78rem',
                      fontWeight: 600,
                      color: isLight ? '#7f1d1d' : '#fff',
                      fontFamily: 'IBM Plex Mono, monospace',
                    }}
                  >
                    {worstTATAlgos.map((k) => ALGO_NAMES[k]).join(', ')}
                  </span>
                </div>
                <div style={{ fontSize: '0.68rem', color: 'var(--dim)' }}>
                  Longest duration processes linger in system
                </div>
              </div>

              <div style={{ textAlign: 'right' }}>
                <div
                  style={{
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: '1.15rem',
                    fontWeight: 700,
                    color: 'var(--red)',
                  }}
                >
                  {maxTAT.toFixed(2)}
                </div>
                <div style={{ fontSize: '0.65rem', color: 'var(--dim)', fontFamily: 'IBM Plex Mono, monospace' }}>
                  units avg
                </div>
              </div>
            </div>

            {/* TAT Performance Delta */}
            <div
              style={{
                background: isLight ? '#f8fafc' : '#131720',
                borderRadius: '4px',
                padding: '0.45rem 0.75rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: '0.72rem',
                border: isLight ? '1px solid #e2e8f0' : '1px solid #1c2230',
              }}
            >
              <span style={{ color: 'var(--dim)' }}>Performance Delta (Spread):</span>
              <span style={{ color: tatSpread === 0 ? 'var(--dim)' : (isLight ? '#b45309' : 'var(--yellow)'), fontWeight: 600 }}>
                +{tatSpread} units {tatRatio !== '1.0' ? `(${tatRatio}× spread)` : ''}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── SYSTEM 5: EXTENDED FAIRNESS & ADVANCED METRICS (ALL 6 ALGOS) ── */}
      <div
        style={{
          background: isLight ? '#ffffff' : '#0e1118',
          border: isLight ? '1px solid #cbd5e1' : '1px solid #232938',
          borderRadius: '6px',
          padding: '1rem',
          marginBottom: '1rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '0.85rem',
            borderBottom: isLight ? '1px solid #f1f5f9' : '1px solid #1a1f2c',
            paddingBottom: '0.5rem',
            flexWrap: 'wrap',
            gap: '0.5rem',
          }}
        >
          <span
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '0.82rem',
              fontWeight: 600,
              color: isLight ? '#0f172a' : '#d4daf0',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            Fairness &amp; Advanced Metrics (All 6 Algorithms)
          </span>
          <span
            style={{
              fontSize: '0.68rem',
              fontFamily: 'IBM Plex Mono, monospace',
              color: 'var(--dim)',
            }}
          >
            Jain's Index • Speedup vs FCFS • Starvation (WT &gt; 3×BT) • Avg Response Ratio
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: '0.85rem',
          }}
        >
          {algoKeys.map((key) => {
            const m = extendedMetrics[key];
            const algoClr = ALGO_COLORS[key];
            // Colored bar color for Jain's Fairness Index
            const jfiBarColor =
              m.jfi >= 0.8 ? 'var(--green)' : m.jfi >= 0.6 ? 'var(--yellow)' : 'var(--red)';

            return (
              <div
                key={key}
                style={{
                  background: isLight ? '#f8fafc' : '#131720',
                  borderTop: isLight ? '1px solid #e2e8f0' : '1px solid #1c2230',
                  borderRight: isLight ? '1px solid #e2e8f0' : '1px solid #1c2230',
                  borderBottom: isLight ? '1px solid #e2e8f0' : '1px solid #1c2230',
                  borderLeft: `3px solid ${algoClr}`,
                  borderRadius: '6px',
                  padding: '0.75rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '0.6rem',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      color: algoClr,
                    }}
                  >
                    {ALGO_NAMES[key]}
                  </span>
                  <span
                    style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      color: key === 'fcfs' ? 'var(--dim)' : 'var(--accent)',
                    }}
                  >
                    {m.speedupVsFcfs}
                  </span>
                </div>

                {/* 1. Jain's Fairness Index with colored bar */}
                <div style={{ marginBottom: '0.6rem' }}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.7rem',
                      fontFamily: 'IBM Plex Mono, monospace',
                      marginBottom: '0.2rem',
                    }}
                  >
                    <span style={{ color: 'var(--dim)' }}>Jain's Fairness Index:</span>
                    <span style={{ fontWeight: 700, color: jfiBarColor }}>{m.jfi.toFixed(2)}</span>
                  </div>
                  <div
                    style={{
                      width: '100%',
                      height: '6px',
                      background: isLight ? '#e2e8f0' : '#232a3a',
                      borderRadius: '3px',
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.round(m.jfi * 100)}%`,
                        height: '100%',
                        background: jfiBarColor,
                        borderRadius: '3px',
                        transition: 'width 0.3s ease',
                      }}
                    />
                  </div>
                </div>

                {/* Metrics mini row: Speedup, Starvation Count, Avg Response Ratio */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.4rem',
                    fontSize: '0.72rem',
                    fontFamily: 'IBM Plex Mono, monospace',
                  }}
                >
                  <div
                    style={{
                      background: isLight ? '#ffffff' : '#0c0f17',
                      padding: '0.35rem 0.5rem',
                      borderRadius: '4px',
                      border: isLight ? '1px solid #e2e8f0' : '1px solid #1a202c',
                    }}
                  >
                    <span style={{ fontSize: '0.62rem', color: 'var(--dim)', display: 'block' }}>
                      STARVATION COUNT
                    </span>
                    <span
                      style={{
                        fontWeight: 700,
                        color: m.starvationCount > 0 ? 'var(--red)' : 'var(--green)',
                      }}
                    >
                      {m.starvationCount} task{m.starvationCount !== 1 ? 's' : ''}
                    </span>
                  </div>

                  <div
                    style={{
                      background: isLight ? '#ffffff' : '#0c0f17',
                      padding: '0.35rem 0.5rem',
                      borderRadius: '4px',
                      border: isLight ? '1px solid #e2e8f0' : '1px solid #1a202c',
                    }}
                  >
                    <span style={{ fontSize: '0.62rem', color: 'var(--dim)', display: 'block' }}>
                      AVG RESPONSE RATIO
                    </span>
                    <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                      {m.avgRR.toFixed(2)}x
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* JFI Footnote */}
        <div style={{ fontSize: '0.68rem', color: 'var(--dim)', fontStyle: 'italic', marginTop: '0.5rem', textAlign: 'right' }}>
          * JFI approaches 1.0 when all wait times are near-zero (trivially fair workload).
        </div>
      </div>

      {/* OS Analytical Insight Footer */}
      <div
        style={{
          background: isLight ? '#f8fafc' : 'rgba(30, 42, 60, 0.45)',
          border: isLight ? '1px solid #cbd5e1' : '1px solid #233247',
          borderRadius: '5px',
          padding: '0.6rem 0.9rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          fontSize: '0.74rem',
          color: isLight ? '#334155' : '#bac7db',
          fontFamily: 'IBM Plex Sans, sans-serif',
          lineHeight: '1.45',
        }}
      >
        <Info size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
        <div>
          <strong style={{ color: isLight ? '#0f172a' : '#fff', fontFamily: 'IBM Plex Mono, monospace' }}>
            Key Takeaway:
          </strong>{' '}
          Actual task workload is fixed ({avgBT} units average), so speed differences come entirely from queue delays.
          The top performer (
          <span style={{ color: 'var(--green)', fontWeight: 600 }}>
            {bestWTAlgos.map((k) => ALGO_NAMES[k]).join(', ')}
          </span>
          ) cut out an average of{' '}
          <strong style={{ color: isLight ? '#b45309' : 'var(--yellow)' }}>
            {wtSpread} units
          </strong>{' '}
          of idle waiting time per task compared to{' '}
          <span style={{ color: 'var(--red)', fontWeight: 600 }}>
            {worstWTAlgos.map((k) => ALGO_NAMES[k]).join(', ')}
          </span>
          !
        </div>
      </div>
    </div>
  );
};
