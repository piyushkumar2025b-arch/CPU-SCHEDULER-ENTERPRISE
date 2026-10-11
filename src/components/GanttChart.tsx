import React, { useEffect, useRef, useState } from 'react';
import { AllResults, AlgorithmKey, ProcessInput } from '../types';
import { useTheme } from '../context/ThemeContext';

export const ALGO_COLORS: Record<AlgorithmKey, string> = {
  fcfs: '#4f8ef7',
  sjf: '#3ecf8e',
  srtf: '#9b72f7',
  rr: '#f7944f',
  priority: '#f5c842',
  pprior: '#f76060',
};

export const ALGO_NAMES: Record<AlgorithmKey, string> = {
  fcfs: 'FCFS',
  sjf: 'SJF (Non-Preemptive)',
  srtf: 'SRTF (Preemptive SJF)',
  rr: 'Round Robin',
  priority: 'Priority (Non-Preemptive)',
  pprior: 'Priority (Preemptive)',
};

export const P_COLORS = [
  '#4f8ef7', // 0: Blue
  '#3ecf8e', // 1: Emerald Green
  '#f7944f', // 2: Coral Orange
  '#9b72f7', // 3: Purple
  '#f5c842', // 4: Amber Gold
  '#f76060', // 5: Rose Red
  '#00c9b7', // 6: Cyan Teal
  '#e056fd', // 7: Fuchsia Pink
  '#f0932b', // 8: Tangerine
  '#20bf6b', // 9: Jade Green
  '#eb3b5a', // 10: Crimson
  '#3867d6', // 11: Royal Cobalt
  '#8854d0', // 12: Deep Violet
  '#2bcbba', // 13: Bright Turquoise
  '#fa8231', // 14: Sunset Orange
  '#4b6584', // 15: Steel Slate
];

function chooseTick(maxT: number): number {
  if (maxT <= 10) return 1;
  if (maxT <= 20) return 2;
  if (maxT <= 50) return 5;
  if (maxT <= 100) return 10;
  return Math.ceil(maxT / 10);
}

function lighten(hex: string, amt: number): string {
  const c = parseInt(hex.slice(1), 16);
  const r = Math.min(255, ((c >> 16) & 0xff) + Math.round(amt * 255));
  const g = Math.min(255, ((c >> 8) & 0xff) + Math.round(amt * 255));
  const b = Math.min(255, (c & 0xff) + Math.round(amt * 255));
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

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

export interface GanttTooltipInfo {
  isIdle: boolean;
  pid?: number;
  taskTitle?: string;
  start: number;
  end: number;
  duration: number;
  color?: string;
}

interface SingleGanttProps {
  algoKey: AlgorithmKey;
  result: AllResults[AlgorithmKey];
  processes: ProcessInput[];
  processNames?: string[];
  highlightedPid: number | null;
  onHoverPid: (pid: number | null) => void;
  onTooltip: (content: GanttTooltipInfo | null, x: number, y: number) => void;
  timeScale: number;
}

const SingleGanttCanvas: React.FC<SingleGanttProps> = ({
  algoKey,
  result,
  processes,
  processNames,
  highlightedPid,
  onHoverPid,
  onTooltip,
  timeScale,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();
  const isLight = theme === 'light';

  const n = processes.length;
  const ROW_H = 32;
  const LABEL_W = 42;
  const TICK_H = 24;
  const PAD_TOP = 8;
  const PAD_RIGHT = 14;
  const INNER_H = n * ROW_H;
  const canvasH = PAD_TOP + INNER_H + TICK_H;

  const maxT = result.gantt.length ? result.gantt[result.gantt.length - 1].end : 1;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const baseW = container.getBoundingClientRect().width || 800;
      const totalW = Math.max(baseW, (baseW * timeScale));
      canvas.width = totalW * dpr;
      canvas.height = canvasH * dpr;
      canvas.style.width = `${totalW}px`;
      canvas.style.height = `${canvasH}px`;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(dpr, dpr);

      const chartW = totalW - LABEL_W - PAD_RIGHT;

      // Draw grid rows
      for (let i = 0; i < n; i++) {
        const y = PAD_TOP + i * ROW_H;
        const isTargetPid = highlightedPid === i;
        ctx.fillStyle = isTargetPid
          ? (isLight ? 'rgba(59, 130, 246, 0.12)' : 'rgba(59, 130, 246, 0.18)')
          : i % 2 === 0
          ? (isLight ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.02)')
          : 'transparent';
        ctx.fillRect(LABEL_W, y, chartW, ROW_H);

        // Row label P0, P1...
        ctx.fillStyle = isTargetPid
          ? (isLight ? '#2563eb' : '#60a5fa')
          : (isLight ? '#334155' : '#94a3b8');
        ctx.font = isTargetPid ? '700 11px IBM Plex Mono, monospace' : '600 11px IBM Plex Mono, monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`P${i}`, LABEL_W - 8, y + ROW_H / 2);
      }

      // Horizontal dividers
      ctx.strokeStyle = isLight ? '#e2e8f0' : '#1e2330';
      ctx.lineWidth = 1;
      for (let i = 0; i <= n; i++) {
        const y = PAD_TOP + i * ROW_H;
        ctx.beginPath();
        ctx.moveTo(LABEL_W, y);
        ctx.lineTo(LABEL_W + chartW, y);
        ctx.stroke();
      }

      // Vertical time grid lines
      const tickStep = chooseTick(maxT);
      ctx.strokeStyle = isLight ? '#cbd5e1' : '#252a35';
      ctx.lineWidth = 1;
      for (let t = 0; t <= maxT; t += tickStep) {
        const x = LABEL_W + (t / maxT) * chartW;
        ctx.beginPath();
        ctx.moveTo(x, PAD_TOP);
        ctx.lineTo(x, PAD_TOP + INNER_H);
        ctx.stroke();
      }

      // Merge intervals per pid for clean bar drawing
      const pidIntervals: Record<number | string, { start: number; end: number }[]> = {};
      result.gantt.forEach((seg) => {
        const pid = seg.pid;
        if (!pidIntervals[pid]) pidIntervals[pid] = [];
        const arr = pidIntervals[pid];
        if (arr.length && arr[arr.length - 1].end === seg.start) {
          arr[arr.length - 1].end = seg.end;
        } else {
          arr.push({ start: seg.start, end: seg.end });
        }
      });

      for (let i = 0; i < n; i++) {
        const y = PAD_TOP + i * ROW_H;
        const rowPad = 4;
        const bh = ROW_H - rowPad * 2;
        const procSegs = pidIntervals[i] || [];
        const isDimmed = highlightedPid !== null && highlightedPid !== i;

        procSegs.forEach(({ start, end }) => {
          const x1 = LABEL_W + (start / maxT) * chartW;
          const x2 = LABEL_W + (end / maxT) * chartW;
          const bw = x2 - x1;
          const color = P_COLORS[i % P_COLORS.length];

          ctx.save();
          if (isDimmed) {
            ctx.globalAlpha = 0.28;
          }

          const grad = ctx.createLinearGradient(x1, y + rowPad, x1, y + rowPad + bh);
          grad.addColorStop(0, lighten(color, 0.18));
          grad.addColorStop(1, color);

          ctx.fillStyle = grad;
          ctx.beginPath();
          roundRectPath(ctx, x1 + 0.5, y + rowPad, bw - 1, bh, 4);
          ctx.fill();

          ctx.fillStyle = lighten(color, 0.45);
          ctx.fillRect(x1 + 0.5, y + rowPad, 2.5, bh);

          if (bw > 18) {
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.font = '600 10px IBM Plex Mono, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const pName = processNames?.[i];
            let label = `P${i}`;
            if (pName) {
              if (bw > 70) {
                label = pName;
              } else if (bw > 34) {
                label = pName.length > 7 ? pName.slice(0, 6) + '…' : pName;
              } else {
                label = `P${i}`;
              }
            }
            ctx.fillText(label, x1 + bw / 2, y + ROW_H / 2);
          }
          ctx.restore();
        });
      }

      // Time axis
      const axisY = PAD_TOP + INNER_H;
      ctx.strokeStyle = isLight ? '#94a3b8' : '#3a404f';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(LABEL_W, axisY);
      ctx.lineTo(LABEL_W + chartW, axisY);
      ctx.stroke();

      ctx.fillStyle = isLight ? '#475569' : '#7a8099';
      ctx.font = '10px IBM Plex Mono, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';

      for (let t = 0; t <= maxT; t += tickStep) {
        const x = LABEL_W + (t / maxT) * chartW;
        ctx.strokeStyle = isLight ? '#94a3b8' : '#3a404f';
        ctx.beginPath();
        ctx.moveTo(x, axisY);
        ctx.lineTo(x, axisY + 5);
        ctx.stroke();
        ctx.fillStyle = isLight ? '#475569' : '#7a8099';
        ctx.fillText(`${t}`, x, axisY + 7);
      }

      // Always label the end
      const endX = LABEL_W + chartW;
      ctx.strokeStyle = isLight ? '#94a3b8' : '#3a404f';
      ctx.beginPath();
      ctx.moveTo(endX, axisY);
      ctx.lineTo(endX, axisY + 5);
      ctx.stroke();
      ctx.fillStyle = isLight ? '#475569' : '#7a8099';
      ctx.textAlign = 'center';
      ctx.fillText(`${maxT}`, endX, axisY + 7);

      // Draw subtle vertical boundary lines
      const boundaries = new Set<number>();
      result.gantt.forEach((g) => {
        boundaries.add(g.start);
        boundaries.add(g.end);
      });
      boundaries.forEach((t) => {
        const x = LABEL_W + (t / maxT) * chartW;
        ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x, PAD_TOP);
        ctx.lineTo(x, axisY);
        ctx.stroke();
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
  }, [result, n, maxT, isLight, highlightedPid, timeScale]);

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const chartW = rect.width - LABEL_W - PAD_RIGHT;

    const row = Math.floor((my - PAD_TOP) / ROW_H);
    if (row < 0 || row >= n) {
      onTooltip(null, 0, 0);
      onHoverPid(null);
      return;
    }

    const t = ((mx - LABEL_W) / chartW) * maxT;
    if (t < 0 || t > maxT) {
      onTooltip(null, 0, 0);
      onHoverPid(null);
      return;
    }

    const hit = result.gantt.find((s) => s.pid === row && t >= s.start && t < s.end);
    if (hit) {
      onHoverPid(row);
      const dur = hit.end - hit.start;
      const color = P_COLORS[row % P_COLORS.length];
      const pName = processNames?.[row];
      onTooltip({
        isIdle: false,
        pid: row,
        taskTitle: pName ? `Task P${row} — ${pName}` : `Task P${row}`,
        start: hit.start,
        end: hit.end,
        duration: dur,
        color,
      }, e.clientX + 14, e.clientY - 10);
      return;
    }

    const idleHit = result.gantt.find((s) => s.pid === 'idle' && t >= s.start && t < s.end);
    if (idleHit) {
      onHoverPid(null);
      onTooltip({
        isIdle: true,
        start: idleHit.start,
        end: idleHit.end,
        duration: idleHit.end - idleHit.start,
      }, e.clientX + 14, e.clientY - 10);
      return;
    }

    onTooltip(null, 0, 0);
  };

  const handleMouseLeave = () => {
    onTooltip(null, 0, 0);
    onHoverPid(null);
  };

  const pidSet = new Set<number>();
  result.gantt.forEach((g) => {
    if (typeof g.pid === 'number') {
      pidSet.add(g.pid);
    }
  });
  const seenPids: number[] = Array.from(pidSet).sort((a: number, b: number) => a - b);
  const hasIdle = result.gantt.some((g) => g.pid === 'idle');

  return (
    <div className="gantt-algo-block">
      <div className="gantt-algo-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              backgroundColor: ALGO_COLORS[algoKey],
              display: 'inline-block',
            }}
          />
          <span style={{ color: ALGO_COLORS[algoKey], fontWeight: 700, fontSize: '0.9rem' }}>
            {ALGO_NAMES[algoKey]}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.78rem' }}>
          <span style={{ color: 'var(--dim)' }}>
            Makespan: <strong style={{ color: 'var(--text)' }}>{maxT} units</strong>
          </span>
          <span style={{ color: 'var(--border)' }}>•</span>
          <span style={{ color: 'var(--dim)' }}>
            Switches: <strong style={{ color: 'var(--text)' }}>{result.ctxSwitches}</strong>
          </span>
        </div>
      </div>
      <div
        className="gantt-canvas-wrap"
        ref={containerRef}
        style={{ overflowX: timeScale > 1 ? 'auto' : 'hidden' }}
      >
        <canvas
          ref={canvasRef}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
      </div>
      <div className="gantt-legend">
        <span style={{ fontSize: '0.72rem', color: 'var(--dim)', marginRight: '0.2rem' }}>
          Filter task:
        </span>
        {seenPids.map((pid) => {
          const isSelected = highlightedPid === pid;
          const pName = processNames?.[pid];
          return (
            <button
              key={pid}
              type="button"
              onClick={() => onHoverPid(isSelected ? null : pid)}
              className="gantt-legend-item"
              style={{
                cursor: 'pointer',
                background: isSelected ? 'var(--surface-tertiary)' : 'transparent',
                borderColor: isSelected ? 'var(--accent)' : 'transparent',
                padding: '2px 8px',
                borderRadius: '4px',
                borderWidth: '1px',
                borderStyle: 'solid',
                transition: 'all 0.15s ease',
              }}
            >
              <div
                className="gantt-legend-dot"
                style={{ background: P_COLORS[pid % P_COLORS.length] }}
              />
              P{pid}{pName ? `: ${pName}` : ''}
            </button>
          );
        })}
        {hasIdle && (
          <div className="gantt-legend-item">
            <div className="gantt-legend-dot" style={{ background: 'var(--dim)' }} />
            Idle
          </div>
        )}
      </div>
    </div>
  );
};

export const GanttSection: React.FC<{
  results: AllResults;
  processes: ProcessInput[];
  processNames?: string[];
}> = ({ results, processes, processNames }) => {
  const [tooltip, setTooltip] = useState<{
    info: GanttTooltipInfo | null;
    x: number;
    y: number;
  }>({ info: null, x: 0, y: 0 });

  const [highlightedPid, setHighlightedPid] = useState<number | null>(null);
  const [selectedAlgoFilter, setSelectedAlgoFilter] = useState<AlgorithmKey | 'all'>('all');
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const handleTooltip = (info: GanttTooltipInfo | null, x: number, y: number) => {
    setTooltip({ info, x, y });
  };

  const allKeys: AlgorithmKey[] = ['fcfs', 'sjf', 'srtf', 'rr', 'priority', 'pprior'];
  const visibleKeys = selectedAlgoFilter === 'all'
    ? allKeys
    : allKeys.filter((k) => k === selectedAlgoFilter);

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '0.8rem',
          marginBottom: '0.85rem',
        }}
      >
        <div>
          <div className="section-title" style={{ margin: 0 }}>
            Visual Execution Timelines (Gantt Charts)
          </div>
          <span style={{ fontSize: '0.78rem', color: 'var(--dim)' }}>
            Compare CPU timeline bars side-by-side or isolate a specific algorithm.
          </span>
        </div>

        {/* View Controls: Filter algorithm & Zoom */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              background: 'var(--surface-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '2px 4px',
            }}
          >
            <span style={{ fontSize: '0.72rem', color: 'var(--dim)', paddingLeft: '4px' }}>
              View:
            </span>
            <button
              type="button"
              onClick={() => setSelectedAlgoFilter('all')}
              style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                padding: '3px 8px',
                borderRadius: '4px',
                border: 'none',
                background: selectedAlgoFilter === 'all' ? 'var(--accent)' : 'transparent',
                color: selectedAlgoFilter === 'all' ? '#ffffff' : 'var(--dim)',
                cursor: 'pointer',
              }}
            >
              All 6
            </button>
            {allKeys.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setSelectedAlgoFilter(k)}
                style={{
                  fontSize: '0.72rem',
                  fontWeight: 600,
                  padding: '3px 7px',
                  borderRadius: '4px',
                  border: 'none',
                  background: selectedAlgoFilter === k ? ALGO_COLORS[k] : 'transparent',
                  color: selectedAlgoFilter === k ? '#ffffff' : 'var(--dim)',
                  cursor: 'pointer',
                }}
              >
                {ALGO_NAMES[k].split(' ')[0]}
              </button>
            ))}
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.2rem',
              background: 'var(--surface-secondary)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '2px 4px',
            }}
          >
            <button
              type="button"
              title="Reset Zoom"
              onClick={() => setZoomLevel(1)}
              style={{
                fontSize: '0.72rem',
                padding: '3px 8px',
                borderRadius: '4px',
                border: 'none',
                background: zoomLevel === 1 ? 'var(--surface-tertiary)' : 'transparent',
                color: 'var(--dim)',
                cursor: 'pointer',
              }}
            >
              Fit
            </button>
            <button
              type="button"
              title="Zoom In"
              onClick={() => setZoomLevel((z) => Math.min(2.5, +(z + 0.3).toFixed(1)))}
              style={{
                fontSize: '0.72rem',
                padding: '3px 8px',
                borderRadius: '4px',
                border: 'none',
                background: 'transparent',
                color: 'var(--text)',
                cursor: 'pointer',
              }}
            >
              Zoom +
            </button>
          </div>
        </div>
      </div>

      {highlightedPid !== null && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.4rem 0.8rem',
            background: 'var(--surface-secondary)',
            border: '1px solid var(--accent)',
            borderRadius: '6px',
            marginBottom: '0.75rem',
            fontSize: '0.78rem',
          }}
        >
          <span>
            Highlighting Task{' '}
            <strong style={{ color: P_COLORS[highlightedPid % P_COLORS.length] }}>
              P{highlightedPid}
            </strong>{' '}
            across all algorithms
          </span>
          <button
            type="button"
            onClick={() => setHighlightedPid(null)}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--dim)',
              cursor: 'pointer',
              textDecoration: 'underline',
              fontSize: '0.75rem',
            }}
          >
            Clear Highlight
          </button>
        </div>
      )}

      {tooltip.info && (
        <div
          className="gantt-tooltip"
          style={{
            display: 'block',
            left: `${tooltip.x}px`,
            top: `${tooltip.y}px`,
          }}
        >
          {tooltip.info.isIdle ? (
            <span style={{ color: '#94a3b8' }}>
              CPU Idle [t={tooltip.info.start} → t={tooltip.info.end}]
            </span>
          ) : (
            <>
              <b style={{ color: tooltip.info.color }}>
                {tooltip.info.taskTitle}
              </b>
              {' '}&nbsp; [t={tooltip.info.start} → t={tooltip.info.end}] &nbsp;{' '}
              <span style={{ color: '#94a3b8' }}>
                {tooltip.info.duration} unit{tooltip.info.duration !== 1 ? 's' : ''} on CPU
              </span>
            </>
          )}
        </div>
      )}
      <div className="gantt-wrap" id="ganttWrap">
        {visibleKeys.map((key) => (
          <SingleGanttCanvas
            key={key}
            algoKey={key}
            result={results[key]}
            processes={processes}
            processNames={processNames}
            highlightedPid={highlightedPid}
            onHoverPid={setHighlightedPid}
            onTooltip={handleTooltip}
            timeScale={zoomLevel}
          />
        ))}
      </div>
    </>
  );
};
