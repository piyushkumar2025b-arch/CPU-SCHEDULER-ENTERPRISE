import React, { useState } from 'react';
import { AllResults, AlgorithmKey, ProcessInput } from '../types';
import { ALGO_COLORS, ALGO_NAMES } from './GanttChart';
import { PlotlyChart } from './PlotlyChart';
import Plotly from 'plotly.js-dist-min';
import { useTheme } from '../context/ThemeContext';

interface PlotlyComparisonsProps {
  results: AllResults;
  processes: ProcessInput[];
  bestKey: AlgorithmKey;
}

type PlotlyViewTab = 'radar' | 'boxplot' | 'completion' | 'heatmap' | 'scatter';

export const PlotlyComparisons: React.FC<PlotlyComparisonsProps> = ({
  results,
  processes,
  bestKey,
}) => {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const textColor = isLight ? '#0f172a' : '#d4daf0';
  const dimColor = isLight ? '#64748b' : '#7a8099';
  const gridColor = isLight ? '#e2e8f0' : '#252a35';
  const polarBg = isLight ? '#f8fafc' : '#151820';

  const [activeTab, setActiveTab] = useState<PlotlyViewTab>('radar');
  const [metricChoice, setMetricChoice] = useState<'WT' | 'TAT' | 'RT' | 'penalty'>('WT');

  const algoKeys: AlgorithmKey[] = ['fcfs', 'sjf', 'srtf', 'rr', 'priority', 'pprior'];
  const algoShortNames = algoKeys.map((k) =>
    ALGO_NAMES[k].replace(' (Non-Preemptive)', '').replace(' (Preemptive SJF)', '')
  );

  // ── 1. RADAR / SPIDER TRADEOFF CHART ──
  const minWT = Math.min(...algoKeys.map((k) => results[k].avgWT));
  const maxWT = Math.max(...algoKeys.map((k) => results[k].avgWT)) || 1;
  const minTAT = Math.min(...algoKeys.map((k) => results[k].avgTAT));
  const maxTAT = Math.max(...algoKeys.map((k) => results[k].avgTAT)) || 1;
  const minRT = Math.min(...algoKeys.map((k) => results[k].avgRT));
  const maxRT = Math.max(...algoKeys.map((k) => results[k].avgRT)) || 1;
  const minSwitches = Math.min(...algoKeys.map((k) => results[k].ctxSwitches));
  const maxSwitches = Math.max(...algoKeys.map((k) => results[k].ctxSwitches)) || 1;

  const radarCategories = [
    'Wait Efficiency',
    'Turnaround Speed',
    'Responsiveness',
    'CPU Utilization',
    'Throughput',
    'Switch Simplicity',
  ];

  const radarData: Plotly.Data[] = algoKeys.map((k) => {
    const res = results[k];
    // Score calculations from 10 to 100 (higher is better)
    const wtScore =
      maxWT === minWT
        ? 100
        : Math.round(100 - ((res.avgWT - minWT) / (maxWT - minWT)) * 80);
    const tatScore =
      maxTAT === minTAT
        ? 100
        : Math.round(100 - ((res.avgTAT - minTAT) / (maxTAT - minTAT)) * 80);
    const rtScore =
      maxRT === minRT
        ? 100
        : Math.round(100 - ((res.avgRT - minRT) / (maxRT - minRT)) * 80);
    const utilScore = Math.round(parseFloat(res.cpuUtil) || 0);
    const tpScore = Math.min(100, Math.round(parseFloat(res.throughput) * 100));
    const switchScore =
      maxSwitches === minSwitches
        ? 100
        : Math.round(
            100 - ((res.ctxSwitches - minSwitches) / (maxSwitches - minSwitches)) * 80
          );

    return {
      type: 'scatterpolar' as const,
      r: [wtScore, tatScore, rtScore, utilScore, tpScore, switchScore, wtScore],
      theta: [...radarCategories, radarCategories[0]],
      fill: 'toself' as const,
      fillcolor: `${ALGO_COLORS[k]}22`,
      name: algoShortNames[algoKeys.indexOf(k)],
      line: {
        color: ALGO_COLORS[k],
        width: k === bestKey ? 3 : 1.8,
      },
      hoverinfo: 'all' as const,
    };
  });

  const radarLayout: Partial<Plotly.Layout> = {
    polar: {
      radialaxis: {
        visible: true,
        range: [0, 100],
        tickfont: { size: 9, color: dimColor },
        linecolor: gridColor,
        gridcolor: gridColor,
      },
      angularaxis: {
        tickfont: { size: 10, color: textColor },
        linecolor: gridColor,
        gridcolor: gridColor,
      },
      bgcolor: polarBg,
    },
    title: {
      text: 'Multi-Criteria Performance Radar (0–100 Normalized Score, Higher is Better)',
      font: { size: 13, color: textColor, family: 'IBM Plex Mono, monospace' },
      x: 0.05,
    },
    margin: { t: 50, r: 40, b: 40, l: 40 },
    height: 380,
  };

  // ── 2. BOX PLOT DISTRIBUTION ──
  const boxData: Plotly.Data[] = algoKeys.map((k) => {
    const yValues = results[k].stats.map((s) => {
      if (metricChoice === 'TAT') return s.TAT;
      if (metricChoice === 'RT') return s.RT;
      if (metricChoice === 'penalty') return +(s.TAT / (s.BT || 1)).toFixed(2);
      return s.WT;
    });

    return {
      type: 'box' as const,
      y: yValues,
      name: algoShortNames[algoKeys.indexOf(k)],
      marker: {
        color: ALGO_COLORS[k],
      },
      boxpoints: 'all',
      jitter: 0.3,
      pointpos: -1.8,
      fillcolor: `${ALGO_COLORS[k]}33`,
      line: {
        color: ALGO_COLORS[k],
        width: 1.5,
      },
    };
  });

  const metricLabel =
    metricChoice === 'TAT'
      ? 'Turnaround Time (TAT)'
      : metricChoice === 'RT'
      ? 'Response Time (RT)'
      : metricChoice === 'penalty'
      ? 'Penalty Ratio (TAT / BT)'
      : 'Waiting Time (WT)';

  const boxLayout: Partial<Plotly.Layout> = {
    title: {
      text: `Process Spread & Fairness Distribution: ${metricLabel}`,
      font: { size: 13, color: textColor, family: 'IBM Plex Mono, monospace' },
      x: 0.05,
    },
    yaxis: {
      title: { text: metricLabel, font: { color: dimColor, size: 11 } },
      gridcolor: gridColor,
      zerolinecolor: gridColor,
      tickfont: { color: textColor, size: 10 },
    },
    xaxis: {
      tickfont: { color: textColor, size: 10 },
      gridcolor: gridColor,
    },
    margin: { t: 50, r: 20, b: 40, l: 50 },
    height: 360,
  };

  // ── 3. PROCESS COMPLETION TIMELINE (CUMULATIVE THROUGHPUT) ──
  const completionData: Plotly.Data[] = algoKeys.map((k) => {
    const completionTimes = results[k].stats
      .map((s) => s.CT)
      .sort((a, b) => a - b);
    
    // Add point (0, 0)
    const xPoints = [0];
    const yPoints = [0];

    completionTimes.forEach((ct, idx) => {
      xPoints.push(ct);
      yPoints.push(idx + 1);
    });

    return {
      type: 'scatter' as const,
      mode: 'lines+markers' as const,
      x: xPoints,
      y: yPoints,
      name: algoShortNames[algoKeys.indexOf(k)],
      line: {
        color: ALGO_COLORS[k],
        width: k === bestKey ? 3 : 2,
        shape: 'hv' as const, // Step line
      },
      marker: {
        size: 6,
        color: ALGO_COLORS[k],
      },
    };
  });

  const completionLayout: Partial<Plotly.Layout> = {
    title: {
      text: 'Cumulative Completed Processes vs. Time (Throughput Progress Curve)',
      font: { size: 13, color: textColor, family: 'IBM Plex Mono, monospace' },
      x: 0.05,
    },
    xaxis: {
      title: { text: 'Simulation Time (units)', font: { color: dimColor, size: 11 } },
      gridcolor: gridColor,
      zerolinecolor: gridColor,
      tickfont: { color: textColor, size: 10 },
    },
    yaxis: {
      title: { text: 'Processes Completed', font: { color: dimColor, size: 11 } },
      gridcolor: gridColor,
      zerolinecolor: gridColor,
      tickfont: { color: textColor, size: 10 },
      dtick: 1,
      range: [0, processes.length + 0.5],
    },
    margin: { t: 50, r: 20, b: 45, l: 50 },
    height: 360,
  };

  // ── 4. HEATMAP (PROCESS VS ALGORITHM) ──
  const heatmapZ = processes.map((proc, pidx) =>
    algoKeys.map((k) => {
      const s = results[k].stats.find((item) => item.idx === pidx);
      if (!s) return 0;
      if (metricChoice === 'TAT') return s.TAT;
      if (metricChoice === 'RT') return s.RT;
      if (metricChoice === 'penalty') return +(s.TAT / (s.BT || 1)).toFixed(2);
      return s.WT;
    })
  );

  const heatmapData: Plotly.Data[] = [
    {
      type: 'heatmap' as const,
      z: heatmapZ,
      x: algoShortNames,
      y: processes.map((_, i) => `P${i}`),
      colorscale: isLight
        ? [
            [0, '#e0f2fe'],
            [0.2, '#93c5fd'],
            [0.5, '#3b82f6'],
            [0.8, '#f97316'],
            [1, '#dc2626'],
          ]
        : [
            [0, '#0d1a25'],
            [0.2, '#1e3a5f'],
            [0.5, '#4f8ef7'],
            [0.8, '#f7944f'],
            [1, '#f76060'],
          ],
      colorbar: {
        title: { text: metricChoice, font: { color: textColor, size: 10 } },
        tickfont: { color: dimColor, size: 10 },
      },
      hoverongaps: false,
    },
  ];

  const heatmapLayout: Partial<Plotly.Layout> = {
    title: {
      text: `Per-Process ${metricLabel} Intensity Matrix`,
      font: { size: 13, color: textColor, family: 'IBM Plex Mono, monospace' },
      x: 0.05,
    },
    xaxis: {
      tickfont: { color: textColor, size: 10 },
      gridcolor: gridColor,
    },
    yaxis: {
      title: { text: 'Process', font: { color: dimColor, size: 11 } },
      tickfont: { color: 'var(--accent)', size: 10 },
      autorange: 'reversed' as const,
    },
    margin: { t: 50, r: 40, b: 40, l: 60 },
    height: 360,
  };

  // ── 5. SCATTER BUBBLE (WAITING TIME VS CONTEXT SWITCHES) ──
  const scatterData: Plotly.Data[] = algoKeys.map((k) => {
    const res = results[k];
    const isWinner = k === bestKey;
    return {
      type: 'scatter' as const,
      mode: 'text+markers' as const,
      x: [res.avgWT],
      y: [res.ctxSwitches],
      text: [algoShortNames[algoKeys.indexOf(k)]],
      textposition: 'top center' as const,
      textfont: {
        family: 'IBM Plex Mono, monospace',
        size: 11,
        color: isWinner ? (isLight ? '#059669' : '#3ecf8e') : textColor,
      },
      name: algoShortNames[algoKeys.indexOf(k)],
      marker: {
        size: Math.max(16, Math.min(36, parseFloat(res.cpuUtil) / 3)),
        color: ALGO_COLORS[k],
        opacity: isWinner ? 1 : 0.85,
        line: {
          color: isWinner ? (isLight ? '#059669' : '#3ecf8e') : (isLight ? '#334155' : '#fff'),
          width: isWinner ? 2.5 : 1,
        },
      },
      hovertemplate: `<b>%{text}</b><br>Avg WT: %{x:.2f}<br>Context Switches: %{y}<br>CPU Util: ${res.cpuUtil}%<br>Makespan: ${res.totalTime} units<extra></extra>`,
    };
  });

  const scatterLayout: Partial<Plotly.Layout> = {
    title: {
      text: 'Efficiency vs. Scheduling Overhead (Avg WT vs Context Switches)',
      font: { size: 13, color: textColor, family: 'IBM Plex Mono, monospace' },
      x: 0.05,
    },
    xaxis: {
      title: { text: 'Average Waiting Time (lower is better)', font: { color: dimColor, size: 11 } },
      gridcolor: gridColor,
      zerolinecolor: gridColor,
      tickfont: { color: textColor, size: 10 },
    },
    yaxis: {
      title: { text: 'Context Switches (lower is less overhead)', font: { color: dimColor, size: 11 } },
      gridcolor: gridColor,
      zerolinecolor: gridColor,
      tickfont: { color: textColor, size: 10 },
    },
    margin: { t: 50, r: 30, b: 45, l: 50 },
    height: 360,
  };

  return (
    <div className="plotly-section" style={{ marginTop: '2.5rem', marginBottom: '2.5rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          flexWrap: 'wrap',
          gap: '1rem',
          marginBottom: '1rem',
        }}
      >
        <div>
          <div className="section-title" style={{ margin: 0 }}>
            Interactive Comparative Analytics
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--dim)', display: 'block', marginTop: '2px' }}>
            Multi-angle performance diagnostics: Radar tradeoffs, fairness dispersion, throughput progression, and overhead.
          </span>
        </div>

        {/* View Selection Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '0.35rem',
            background: 'var(--surface-secondary)',
            padding: '0.3rem',
            borderRadius: '8px',
            border: '1px solid var(--border)',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={() => setActiveTab('radar')}
            style={{
              background: activeTab === 'radar' ? 'var(--accent)' : 'transparent',
              color: activeTab === 'radar' ? '#fff' : 'var(--dim)',
              border: 'none',
              borderRadius: '6px',
              padding: '0.35rem 0.75rem',
              fontWeight: 600,
              fontSize: '0.75rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Tradeoff Radar
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('boxplot')}
            style={{
              background: activeTab === 'boxplot' ? 'var(--accent)' : 'transparent',
              color: activeTab === 'boxplot' ? '#fff' : 'var(--dim)',
              border: 'none',
              borderRadius: '6px',
              padding: '0.35rem 0.75rem',
              fontWeight: 600,
              fontSize: '0.75rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Fairness Dispersion
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('completion')}
            style={{
              background: activeTab === 'completion' ? 'var(--accent)' : 'transparent',
              color: activeTab === 'completion' ? '#fff' : 'var(--dim)',
              border: 'none',
              borderRadius: '6px',
              padding: '0.35rem 0.75rem',
              fontWeight: 600,
              fontSize: '0.75rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Throughput Timeline
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('heatmap')}
            style={{
              background: activeTab === 'heatmap' ? 'var(--accent)' : 'transparent',
              color: activeTab === 'heatmap' ? '#fff' : 'var(--dim)',
              border: 'none',
              borderRadius: '6px',
              padding: '0.35rem 0.75rem',
              fontWeight: 600,
              fontSize: '0.75rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Intensity Matrix
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('scatter')}
            style={{
              background: activeTab === 'scatter' ? 'var(--accent)' : 'transparent',
              color: activeTab === 'scatter' ? '#fff' : 'var(--dim)',
              border: 'none',
              borderRadius: '6px',
              padding: '0.35rem 0.75rem',
              fontWeight: 600,
              fontSize: '0.75rem',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            Latency vs Switches
          </button>
        </div>
      </div>

      {/* Metric Selector for Boxplot & Heatmap */}
      {(activeTab === 'boxplot' || activeTab === 'heatmap') && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            marginBottom: '0.8rem',
            background: 'var(--surface-secondary)',
            border: '1px solid var(--border)',
            padding: '0.45rem 0.85rem',
            borderRadius: '6px',
            fontSize: '0.75rem',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ color: 'var(--dim)', fontWeight: 600 }}>Active Diagnostic Metric:</span>
          {(
            [
              { key: 'WT', label: 'Waiting Time (WT)' },
              { key: 'TAT', label: 'Turnaround Time (TAT)' },
              { key: 'RT', label: 'Response Time (RT)' },
              { key: 'penalty', label: 'Normalized Penalty (TAT/BT)' },
            ] as const
          ).map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMetricChoice(m.key)}
              style={{
                background: metricChoice === m.key ? 'var(--surface-tertiary)' : 'transparent',
                color: metricChoice === m.key ? 'var(--accent)' : 'var(--dim)',
                border: metricChoice === m.key ? '1px solid var(--accent)' : '1px solid transparent',
                borderRadius: '4px',
                padding: '0.25rem 0.6rem',
                cursor: 'pointer',
                fontWeight: metricChoice === m.key ? 700 : 500,
                fontSize: '0.72rem',
                transition: 'all 0.15s ease',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      {/* Plotly Card Container */}
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '1.25rem',
          boxShadow: 'var(--shadow-sm)',
          overflow: 'hidden',
        }}
      >
        {activeTab === 'radar' && (
          <PlotlyChart data={radarData} layout={radarLayout} />
        )}
        {activeTab === 'boxplot' && (
          <PlotlyChart data={boxData} layout={boxLayout} />
        )}
        {activeTab === 'completion' && (
          <PlotlyChart data={completionData} layout={completionLayout} />
        )}
        {activeTab === 'heatmap' && (
          <PlotlyChart data={heatmapData} layout={heatmapLayout} />
        )}
        {activeTab === 'scatter' && (
          <PlotlyChart data={scatterData} layout={scatterLayout} />
        )}
      </div>
    </div>
  );
};
