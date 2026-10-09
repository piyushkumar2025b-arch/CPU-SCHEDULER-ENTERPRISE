import React, { useEffect, useRef } from 'react';
import { AllResults, AlgorithmKey, ProcessInput } from '../types';
import { ALGO_COLORS, ALGO_NAMES } from './GanttChart';
import { useTheme } from '../context/ThemeContext';

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  if (w < 0 || h < 0) return;
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  if (h <= 0) return;
  r = Math.min(r, h / 2, w / 2);
  roundRectPath(ctx, x, y, w, h, r);
}

interface SingleBarChartProps {
  title: string;
  values: number[];
  labels: string[];
  colors: string[];
  bestKey: AlgorithmKey;
  algoKeys: AlgorithmKey[];
  unit: string;
  maxOverride?: number;
  height?: number;
}

const SingleBarChart: React.FC<SingleBarChartProps> = ({
  title,
  values,
  labels,
  colors,
  bestKey,
  algoKeys,
  unit,
  maxOverride,
  height = 180,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  const isLight = theme === 'light';

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const w = Math.max(rect.width, 240);
      const h = height;

      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);

      const pad = { top: 20, right: 10, bottom: 48, left: 44 };
      const chartW = w - pad.left - pad.right;
      const chartH = h - pad.top - pad.bottom;

      const maxVal = maxOverride || (Math.max(...values, 0) * 1.2) || 1;
      const n = values.length;
      const barW = (chartW / n) * 0.55;
      const gap = (chartW / n) * 0.45;

      const gridColor = isLight ? '#e2e8f0' : '#252a35';
      const dimColor = isLight ? '#475569' : '#7a8099';
      const labelColor = isLight ? '#334155' : '#7a8099';
      const winnerValColor = isLight ? '#0f172a' : '#ffffff';

      // grid lines
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      const ticks = 4;
      for (let i = 0; i <= ticks; i++) {
        const y = pad.top + chartH - (i / ticks) * chartH;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + chartW, y);
        ctx.stroke();

        const val = ((i / ticks) * maxVal).toFixed(i === 0 ? 0 : 1);
        ctx.fillStyle = dimColor;
        ctx.font = '10px IBM Plex Mono, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(val, pad.left - 5, y + 3.5);
      }

      // bars
      values.forEach((v, i) => {
        const barH = (v / maxVal) * chartH;
        const x = pad.left + i * (chartW / n) + gap / 2;
        const y = pad.top + chartH - barH;

        const isWinner = algoKeys[i] === bestKey;
        if (isWinner) {
          ctx.shadowColor = colors[i];
          ctx.shadowBlur = 12;
        }

        ctx.fillStyle = colors[i];
        ctx.globalAlpha = isWinner ? 1 : 0.65;
        roundRect(ctx, x, y, barW, barH, 3);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;

        ctx.fillStyle = isWinner ? winnerValColor : dimColor;
        ctx.font = `${isWinner ? '600' : '400'} 10px IBM Plex Mono, monospace`;
        ctx.textAlign = 'center';
        ctx.fillText(`${v}${unit === '%' ? '%' : ''}`, x + barW / 2, y - 5);

        ctx.fillStyle = labelColor;
        ctx.font = '9px IBM Plex Mono, monospace';
        ctx.textAlign = 'center';

        const words = labels[i].split(' ');
        const line1 = words.slice(0, Math.ceil(words.length / 2)).join(' ');
        const line2 = words.slice(Math.ceil(words.length / 2)).join(' ');
        ctx.fillText(line1, x + barW / 2, pad.top + chartH + 14);
        if (line2) {
          ctx.fillText(line2, x + barW / 2, pad.top + chartH + 25);
        }
      });
    };

    render();

    const resizeObserver = new ResizeObserver(() => {
      render();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [values, labels, colors, bestKey, algoKeys, unit, maxOverride, height, isLight]);

  return (
    <div className="chart-card">
      <h4>{title}</h4>
      <div ref={containerRef}>
        <canvas ref={canvasRef} />
      </div>
      <div className="chart-legend">
        {algoKeys.map((k, i) => (
          <div key={k} className="legend-item">
            <div className="legend-dot" style={{ background: colors[i] }} />
            {labels[i]}
          </div>
        ))}
      </div>
    </div>
  );
};

const GroupedBarChart: React.FC<{
  results: AllResults;
  algoKeys: AlgorithmKey[];
  processes: ProcessInput[];
}> = ({ results, algoKeys, processes }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = container.getBoundingClientRect();
      const w = Math.max(rect.width, 280);
      const h = 200;

      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);

      const n = processes.length;
      const algos = algoKeys;
      const na = algos.length;

      const pad = { top: 20, right: 10, bottom: 48, left: 44 };
      const chartW = w - pad.left - pad.right;
      const chartH = h - pad.top - pad.bottom;

      const allWT = algos.flatMap((k) => results[k].stats.map((s) => s.WT));
      const maxVal = (Math.max(...allWT, 0) * 1.2) || 1;

      const groupW = chartW / n;
      const barW = (groupW * 0.8) / na;

      ctx.strokeStyle = '#252a35';
      ctx.lineWidth = 1;
      const ticks = 4;
      for (let i = 0; i <= ticks; i++) {
        const y = pad.top + chartH - (i / ticks) * chartH;
        ctx.beginPath();
        ctx.moveTo(pad.left, y);
        ctx.lineTo(pad.left + chartW, y);
        ctx.stroke();

        ctx.fillStyle = '#7a8099';
        ctx.font = '10px IBM Plex Mono, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(((i / ticks) * maxVal).toFixed(1), pad.left - 5, y + 3.5);
      }

      for (let pi = 0; pi < n; pi++) {
        const gx = pad.left + pi * groupW + groupW * 0.1;
        algos.forEach((k, ai) => {
          const s = results[k].stats.find((item) => item.idx === pi);
          if (!s) return;
          const bh = Math.max(0, (s.WT / maxVal) * chartH);
          const x = gx + ai * barW;
          const y = pad.top + chartH - bh;

          ctx.fillStyle = ALGO_COLORS[k];
          ctx.globalAlpha = 0.8;
          roundRect(ctx, x, y, Math.max(barW - 1, 1), bh, 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        });

        ctx.fillStyle = '#7a8099';
        ctx.font = '10px IBM Plex Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`P${pi}`, pad.left + pi * groupW + groupW / 2, pad.top + chartH + 14);
      }
    };

    render();

    const resizeObserver = new ResizeObserver(() => {
      render();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [results, algoKeys, processes]);

  return (
    <div className="chart-card" style={{ gridColumn: '1 / -1' }}>
      <h4>Per-Process Waiting Time — All Algorithms</h4>
      <div ref={containerRef}>
        <canvas ref={canvasRef} />
      </div>
      <div className="chart-legend">
        {algoKeys.map((k) => (
          <div key={k} className="legend-item">
            <div className="legend-dot" style={{ background: ALGO_COLORS[k] }} />
            {ALGO_NAMES[k].replace(' (Non-Preemptive)', '').replace(' (Preemptive SJF)', '')}
          </div>
        ))}
      </div>
    </div>
  );
};

export const ComparisonPlots: React.FC<{
  results: AllResults;
  bestKey: AlgorithmKey;
  processes: ProcessInput[];
}> = ({ results, bestKey, processes }) => {
  const algoKeys: AlgorithmKey[] = ['fcfs', 'sjf', 'srtf', 'rr', 'priority', 'pprior'];
  const labels = algoKeys.map((k) =>
    ALGO_NAMES[k].replace(' (Non-Preemptive)', '').replace(' (Preemptive SJF)', '')
  );
  const colors = algoKeys.map((k) => ALGO_COLORS[k]);

  const wtValues = algoKeys.map((k) => +results[k].avgWT.toFixed(2));
  const tatValues = algoKeys.map((k) => +results[k].avgTAT.toFixed(2));
  const utilValues = algoKeys.map((k) => +results[k].cpuUtil);
  const stepValues = algoKeys.map((k) => results[k].steps);
  const rtValues = algoKeys.map((k) => +results[k].avgRT.toFixed(2));
  const tpValues = algoKeys.map((k) => +results[k].throughput);

  return (
    <>
      <div className="section-title">Comparison Plots</div>
      <div className="charts-grid">
        <SingleBarChart
          title="Avg Waiting Time"
          values={wtValues}
          labels={labels}
          colors={colors}
          bestKey={bestKey}
          algoKeys={algoKeys}
          unit="units"
        />
        <SingleBarChart
          title="Avg Turnaround Time"
          values={tatValues}
          labels={labels}
          colors={colors}
          bestKey={bestKey}
          algoKeys={algoKeys}
          unit="units"
        />
        <SingleBarChart
          title="CPU Utilization (%)"
          values={utilValues}
          labels={labels}
          colors={colors}
          bestKey={bestKey}
          algoKeys={algoKeys}
          unit="%"
          maxOverride={100}
        />
        <SingleBarChart
          title="Context Switches / Steps"
          values={stepValues}
          labels={labels}
          colors={colors}
          bestKey={bestKey}
          algoKeys={algoKeys}
          unit="steps"
        />
        <SingleBarChart
          title="Avg Response Time"
          values={rtValues}
          labels={labels}
          colors={colors}
          bestKey={bestKey}
          algoKeys={algoKeys}
          unit="units"
        />
        <SingleBarChart
          title="Throughput (processes / unit time)"
          values={tpValues}
          labels={labels}
          colors={colors}
          bestKey={bestKey}
          algoKeys={algoKeys}
          unit="p/t"
        />
        <GroupedBarChart
          results={results}
          algoKeys={algoKeys}
          processes={processes}
        />
      </div>
    </>
  );
};
