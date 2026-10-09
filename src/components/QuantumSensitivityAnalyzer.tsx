import React, { useState, useMemo } from 'react';
import { ProcessInput, SimulationResult } from '../types';
import { runRoundRobin } from '../scheduler';
import { PlotlyChart } from './PlotlyChart';
import Plotly from 'plotly.js-dist-min';
import { useTheme } from '../context/ThemeContext';
import { Sparkles } from 'lucide-react';

interface QuantumSensitivityAnalyzerProps {
  processes: ProcessInput[];
  currentQuantum: number;
  onApplyQuantum: (newQuantum: number) => void;
  onOpenRAG?: (question: string) => void;
}

export interface QuantumPoint {
  quantum: number;
  avgWT: number;
  avgTAT: number;
  avgRT: number;
  ctxSwitches: number;
  totalTime: number;
  score: number; // Harmonic tradeoff score
}

export const QuantumSensitivityAnalyzer: React.FC<QuantumSensitivityAnalyzerProps> = ({
  processes,
  currentQuantum,
  onApplyQuantum,
  onOpenRAG,
}) => {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const textColor = isLight ? '#0f172a' : '#d4daf0';
  const dimColor = isLight ? '#64748b' : '#7a8099';
  const gridColor = isLight ? '#e2e8f0' : '#252a35';
  const cardBg = isLight ? '#ffffff' : '#151820';

  const maxBurst = Math.max(...processes.map((p) => p.burst), 1);
  const defaultMaxRange = Math.max(12, maxBurst + 2);
  const [sweepMax, setSweepMax] = useState<number>(defaultMaxRange);

  // Compute 80th percentile of burst times (standard OS textbook guideline)
  const p80Quantum = useMemo(() => {
    if (!processes.length) return 2;
    const sortedBursts = [...processes.map((p) => p.burst)].sort((a, b) => a - b);
    const index = Math.min(sortedBursts.length - 1, Math.floor(sortedBursts.length * 0.8));
    return Math.max(1, sortedBursts[index]);
  }, [processes]);

  // Sweep calculations from q = 1 to sweepMax
  const sweepData: QuantumPoint[] = useMemo(() => {
    if (!processes.length) return [];
    const points: QuantumPoint[] = [];

    for (let q = 1; q <= sweepMax; q++) {
      const res: SimulationResult = runRoundRobin(processes, q);
      // Normalized harmonic tradeoff: lower WT is good, lower context switches is good
      // Score calculation for finding sweet spot
      points.push({
        quantum: q,
        avgWT: +res.avgWT.toFixed(2),
        avgTAT: +res.avgTAT.toFixed(2),
        avgRT: +res.avgRT.toFixed(2),
        ctxSwitches: res.ctxSwitches,
        totalTime: res.totalTime,
        score: 0,
      });
    }

    // Normalize and compute sweet spot
    const minWT = Math.min(...points.map((p) => p.avgWT));
    const maxWT = Math.max(...points.map((p) => p.avgWT)) || 1;
    const minSwitches = Math.min(...points.map((p) => p.ctxSwitches));
    const maxSwitches = Math.max(...points.map((p) => p.ctxSwitches)) || 1;

    points.forEach((p) => {
      // Weight 60% on wait time, 40% on avoiding context switch overhead
      const normWT = (p.avgWT - minWT) / (maxWT - minWT || 1);
      const normSwitches = (p.ctxSwitches - minSwitches) / (maxSwitches - minSwitches || 1);
      p.score = +(0.6 * normWT + 0.4 * normSwitches).toFixed(3);
    });

    return points;
  }, [processes, sweepMax]);

  // Detect optimal sweet spot quantum:
  // Finds the point that minimizes the composite penalty score
  const sweetSpot = useMemo(() => {
    if (!sweepData.length) return { quantum: 2, avgWT: 0, ctxSwitches: 0 };
    let best = sweepData[0];
    sweepData.forEach((p) => {
      if (p.score < best.score) {
        best = p;
      }
    });
    return best;
  }, [sweepData]);

  // Absolute lowest WT quantum
  const lowestWTPoint = useMemo(() => {
    if (!sweepData.length) return null;
    return sweepData.reduce((prev, curr) => (curr.avgWT < prev.avgWT ? curr : prev), sweepData[0]);
  }, [sweepData]);

  // Plotly Dual-Axis Line Configuration
  const quantums = sweepData.map((d) => d.quantum);
  const wtValues = sweepData.map((d) => d.avgWT);
  const tatValues = sweepData.map((d) => d.avgTAT);
  const switches = sweepData.map((d) => d.ctxSwitches);

  const plotData: Plotly.Data[] = [
    {
      x: quantums,
      y: wtValues,
      name: 'Avg Waiting Time',
      type: 'scatter',
      mode: 'lines+markers',
      line: { color: '#3ecf8e', width: 2.5 },
      marker: { size: 6, color: '#3ecf8e' },
      yaxis: 'y1',
      hovertemplate: 'Quantum: %{x}<br>Avg WT: %{y:.2f} units<extra></extra>',
    },
    {
      x: quantums,
      y: tatValues,
      name: 'Avg Turnaround Time',
      type: 'scatter',
      mode: 'lines+markers',
      line: { color: '#4f8ef7', width: 2, dash: 'dot' },
      marker: { size: 5, color: '#4f8ef7' },
      yaxis: 'y1',
      hovertemplate: 'Quantum: %{x}<br>Avg TAT: %{y:.2f} units<extra></extra>',
    },
    {
      x: quantums,
      y: switches,
      name: 'Context Switches',
      type: 'scatter',
      mode: 'lines+markers',
      line: { color: '#f7944f', width: 2 },
      marker: { size: 6, color: '#f7944f', symbol: 'square' },
      yaxis: 'y2',
      hovertemplate: 'Quantum: %{x}<br>Context Switches: %{y}<extra></extra>',
    },
  ];

  const plotLayout: Partial<Plotly.Layout> = {
    title: {
      text: 'Round Robin Quantum Sensitivity Curve (Wait Time vs. Context Switches)',
      font: { size: 13, color: textColor, family: 'IBM Plex Mono, monospace' },
      x: 0.05,
    },
    xaxis: {
      title: { text: 'Time Quantum Size (q)', font: { color: dimColor, size: 11 } },
      dtick: 1,
      gridcolor: gridColor,
      zerolinecolor: gridColor,
      tickfont: { color: textColor, size: 10 },
    },
    yaxis: {
      title: { text: 'Time (units)', font: { color: '#10b981', size: 11 } },
      gridcolor: gridColor,
      zerolinecolor: gridColor,
      tickfont: { color: '#10b981', size: 10 },
    },
    yaxis2: {
      title: { text: 'Context Switches', font: { color: '#f97316', size: 11 } },
      overlaying: 'y',
      side: 'right',
      gridcolor: 'transparent',
      zerolinecolor: gridColor,
      tickfont: { color: '#f97316', size: 10 },
    },
    margin: { t: 50, r: 50, b: 45, l: 50 },
    height: 380,
    shapes: [
      // Sweet Spot vertical reference line
      {
        type: 'line',
        x0: sweetSpot.quantum,
        x1: sweetSpot.quantum,
        y0: 0,
        y1: 1,
        yref: 'paper',
        line: { color: '#d97706', width: 2, dash: 'dash' },
      },
      // Current Quantum vertical reference line
      {
        type: 'line',
        x0: currentQuantum,
        x1: currentQuantum,
        y0: 0,
        y1: 1,
        yref: 'paper',
        line: { color: isLight ? 'rgba(0, 0, 0, 0.4)' : 'rgba(255, 255, 255, 0.4)', width: 1.5, dash: 'dot' },
      },
    ],
    annotations: [
      {
        x: sweetSpot.quantum,
        y: 1,
        yref: 'paper',
        text: `Optimal (q=${sweetSpot.quantum})`,
        showarrow: false,
        font: { color: '#d97706', size: 10, family: 'IBM Plex Mono, monospace' },
        bgcolor: cardBg,
        bordercolor: '#d97706',
        borderwidth: 1,
        borderpad: 3,
      },
    ],
  };

  return (
    <div
      id="quantum-sensitivity-analyzer"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '1.25rem 1.4rem',
        marginTop: '2rem',
        marginBottom: '2rem',
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
          gap: '0.8rem',
          paddingBottom: '0.85rem',
          borderBottom: '1px solid var(--border)',
          marginBottom: '1.2rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div>
            <div className="section-title" style={{ margin: 0, fontSize: '0.95rem' }}>
              Round Robin Time-Slice (Quantum) Sensitivity Analyzer
            </div>
            <span
              style={{
                fontSize: '0.75rem',
                color: 'var(--dim)',
                fontFamily: 'Plus Jakarta Sans, sans-serif',
              }}
            >
              Systematic parameter sweep: analyze the tradeoff between task responsiveness and context switching overhead.
            </span>
          </div>
        </div>

        {/* Sweep Range Controller & RAG Trigger */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {onOpenRAG && (
            <button
              type="button"
              onClick={() =>
                onOpenRAG(
                  `What is the optimal Round Robin quantum for this workload (n=${processes.length} tasks, currently q=${currentQuantum}, calculated sweet spot q=${sweetSpot.quantum}, P80 rule q=${p80Quantum}), and what are the specific context-switch thrashing trade-offs?`
                )
              }
              style={{
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.35)',
                color: 'var(--accent)',
                borderRadius: '4px',
                padding: '0.3rem 0.65rem',
                fontSize: '0.74rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                transition: 'all 0.15s ease',
              }}
            >
              <Sparkles size={12} />
              <span>Ask RAG Quantum Analysis</span>
            </button>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.72rem', color: 'var(--dim)', fontFamily: 'IBM Plex Mono, monospace' }}>
              Sweep: 1 to
            </span>
            <select
              value={sweepMax}
              onChange={(e) => setSweepMax(+e.target.value)}
              style={{
                background: 'var(--surface-secondary)',
                border: '1px solid var(--border)',
                color: 'var(--text)',
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: '0.8rem',
                padding: '0.3rem 0.6rem',
                borderRadius: '4px',
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              {[10, 15, 20, 25, 30].map((val) => (
                <option key={val} value={val}>
                  {val} units
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Highlights & Sweet Spot Summary Banner */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '0.9rem',
          marginBottom: '1.2rem',
        }}
      >
        {/* Recommended Sweet Spot */}
        <div
          style={{
            background: 'var(--surface-secondary)',
            borderTop: '1px solid var(--border)',
            borderRight: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
            borderLeft: '4px solid #f59e0b',
            borderRadius: '6px',
            padding: '0.85rem 1rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                color: 'var(--yellow)',
                fontFamily: 'IBM Plex Mono, monospace',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
              }}
            >
              Calculated Sweet Spot
            </span>
            <span style={{ fontSize: '0.65rem', color: 'var(--dim)' }}>Harmonic Balance</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
            <span
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--yellow)',
                fontFamily: 'IBM Plex Mono, monospace',
              }}
            >
              q = {sweetSpot.quantum}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--dim)', fontFamily: 'IBM Plex Mono, monospace' }}>
              WT: {sweetSpot.avgWT} | Switches: {sweetSpot.ctxSwitches}
            </span>
          </div>

          {currentQuantum !== sweetSpot.quantum && (
            <button
              type="button"
              onClick={() => onApplyQuantum(sweetSpot.quantum)}
              style={{
                marginTop: '0.6rem',
                width: '100%',
                background: 'var(--yellow)',
                color: '#000',
                border: 'none',
                borderRadius: '4px',
                padding: '0.35rem 0.6rem',
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: '0.72rem',
                fontWeight: 700,
                cursor: 'pointer',
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.85')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              Apply Quantum (q = {sweetSpot.quantum})
            </button>
          )}
        </div>

        {/* Current Active Quantum */}
        <div
          style={{
            background: 'var(--surface-secondary)',
            borderTop: '1px solid var(--border)',
            borderRight: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
            borderLeft: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '0.85rem 1rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 600,
                color: 'var(--accent)',
                fontFamily: 'IBM Plex Mono, monospace',
                textTransform: 'uppercase',
              }}
            >
              Currently Configured
            </span>
            <span style={{ fontSize: '0.65rem', color: 'var(--dim)' }}>Active Setting</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
            <span
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--text)',
                fontFamily: 'IBM Plex Mono, monospace',
              }}
            >
              q = {currentQuantum}
            </span>
            {sweepData.find((p) => p.quantum === currentQuantum) && (
              <span style={{ fontSize: '0.75rem', color: 'var(--dim)', fontFamily: 'IBM Plex Mono, monospace' }}>
                WT: {sweepData.find((p) => p.quantum === currentQuantum)!.avgWT} | Switches:{' '}
                {sweepData.find((p) => p.quantum === currentQuantum)!.ctxSwitches}
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--dim)', marginTop: '0.4rem' }}>
            {currentQuantum === sweetSpot.quantum
              ? 'Matches optimal sweet spot'
              : currentQuantum < sweetSpot.quantum
              ? 'Frequent context switching overhead'
              : 'Approaching FCFS behavior'}
          </div>
        </div>

        {/* 80% Rule of Thumb */}
        <div
          style={{
            background: 'var(--surface-secondary)',
            borderTop: '1px solid var(--border)',
            borderRight: '1px solid var(--border)',
            borderBottom: '1px solid var(--border)',
            borderLeft: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '0.85rem 1rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 600,
                color: 'var(--green)',
                fontFamily: 'IBM Plex Mono, monospace',
                textTransform: 'uppercase',
              }}
            >
              80% Burst Rule (P₈₀)
            </span>
            <span style={{ fontSize: '0.65rem', color: 'var(--dim)' }}>Textbook Metric</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
            <span
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--green)',
                fontFamily: 'IBM Plex Mono, monospace',
              }}
            >
              q = {p80Quantum}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--dim)', fontFamily: 'IBM Plex Mono, monospace' }}>
              80% bursts finish in 1 slice
            </span>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--dim)', marginTop: '0.4rem' }}>
            Prevents unnecessary second-round dispatch for most jobs
          </div>
        </div>

        {/* Minimum WT Quantum */}
        <div
          style={{
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '0.85rem 1rem',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.3rem' }}>
            <span
              style={{
                fontSize: '0.68rem',
                fontWeight: 600,
                color: 'var(--accent)',
                fontFamily: 'IBM Plex Mono, monospace',
                textTransform: 'uppercase',
              }}
            >
              Minimum Avg WT
            </span>
            <span style={{ fontSize: '0.65rem', color: 'var(--dim)' }}>Pure Latency</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
            <span
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                color: 'var(--accent)',
                fontFamily: 'IBM Plex Mono, monospace',
              }}
            >
              q = {lowestWTPoint?.quantum ?? 1}
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--dim)', fontFamily: 'IBM Plex Mono, monospace' }}>
              Lowest WT: {lowestWTPoint?.avgWT} units
            </span>
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--dim)', marginTop: '0.4rem' }}>
            Context switches: {lowestWTPoint?.ctxSwitches}
          </div>
        </div>
      </div>

      {/* Plotly Sensitivity Chart */}
      <div
        style={{
          background: 'var(--surface-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '0.8rem',
          marginBottom: '1.2rem',
        }}
      >
        <PlotlyChart data={plotData} layout={plotLayout} />
      </div>

      {/* Interactive Quantum Data Table with One-Click Selection */}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ textAlign: 'center', padding: '0.5rem 0.6rem', color: 'var(--dim)' }}>Quantum (q)</th>
              <th style={{ textAlign: 'right', padding: '0.5rem 0.6rem', color: 'var(--green)' }}>Avg Wait Time</th>
              <th style={{ textAlign: 'right', padding: '0.5rem 0.6rem', color: 'var(--accent)' }}>Avg Turnaround</th>
              <th style={{ textAlign: 'right', padding: '0.5rem 0.6rem', color: 'var(--purple)' }}>Avg Response</th>
              <th style={{ textAlign: 'right', padding: '0.5rem 0.6rem', color: 'var(--orange)' }}>Context Switches</th>
              <th style={{ textAlign: 'right', padding: '0.5rem 0.6rem', color: 'var(--dim)' }}>Total Makespan</th>
              <th style={{ textAlign: 'center', padding: '0.5rem 0.6rem', color: 'var(--dim)' }}>Action</th>
            </tr>
          </thead>
          <tbody>
            {sweepData.map((row) => {
              const isCurrent = row.quantum === currentQuantum;
              const isSweet = row.quantum === sweetSpot.quantum;
              return (
                <tr
                  key={row.quantum}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    background: isSweet
                      ? 'rgba(245, 158, 11, 0.08)'
                      : isCurrent
                      ? 'var(--accent-light)'
                      : 'transparent',
                  }}
                >
                  <td style={{ textAlign: 'center', fontWeight: 600, fontFamily: 'IBM Plex Mono, monospace' }}>
                    q = {row.quantum}
                    {isSweet && (
                      <span
                        style={{
                          marginLeft: '0.4rem',
                          background: 'var(--yellow)',
                          color: '#000',
                          fontSize: '0.62rem',
                          fontWeight: 700,
                          padding: '0.05rem 0.35rem',
                          borderRadius: '2px',
                        }}
                      >
                        SWEET SPOT
                      </span>
                    )}
                    {isCurrent && (
                      <span
                        style={{
                          marginLeft: '0.4rem',
                          background: 'var(--accent)',
                          color: '#fff',
                          fontSize: '0.62rem',
                          fontWeight: 700,
                          padding: '0.05rem 0.35rem',
                          borderRadius: '2px',
                        }}
                      >
                        ACTIVE
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--green)', fontWeight: 600 }}>
                    {row.avgWT.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--accent)' }}>
                    {row.avgTAT.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--purple)' }}>
                    {row.avgRT.toFixed(2)}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--orange)' }}>
                    {row.ctxSwitches}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text)' }}>
                    {row.totalTime} units
                  </td>
                  <td style={{ textAlign: 'center' }}>
                    {isCurrent ? (
                      <span style={{ color: 'var(--dim)', fontSize: '0.7rem' }}>Active</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onApplyQuantum(row.quantum)}
                        style={{
                          background: 'var(--surface-secondary)',
                          color: 'var(--accent)',
                          border: '1px solid var(--border)',
                          borderRadius: '4px',
                          padding: '0.2rem 0.55rem',
                          cursor: 'pointer',
                          fontFamily: 'IBM Plex Mono, monospace',
                          fontSize: '0.7rem',
                          fontWeight: 600,
                        }}
                      >
                        Apply q={row.quantum}
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Theoretical Principle Explanation */}
      <div
        style={{
          marginTop: '1.2rem',
          background: 'rgba(30, 42, 60, 0.45)',
          border: '1px solid #233247',
          borderRadius: '5px',
          padding: '0.65rem 0.9rem',
          fontSize: '0.74rem',
          color: '#bac7db',
          fontFamily: 'IBM Plex Sans, sans-serif',
          lineHeight: '1.45',
        }}
      >
        <strong style={{ color: '#fff', fontFamily: 'IBM Plex Mono, monospace' }}>
          💡 Operating Systems Quantum Rule of Thumb:
        </strong>{' '}
        As quantum $q \to 1$, Round Robin mimics ideal processor sharing with fast response times but incurs heavy
        context-switching overhead. As $q \to \infty$, Round Robin degenerates into FCFS, risking the convoy effect.
        The recommended sweet spot ($q^* = {sweetSpot.quantum}$) strikes the ideal balance between minimal waiting time
        and lowest context-switch penalties.
      </div>
    </div>
  );
};
