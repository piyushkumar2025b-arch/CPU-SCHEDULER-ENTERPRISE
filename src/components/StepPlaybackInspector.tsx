import React, { useState, useEffect, useRef, useMemo } from 'react';
import { ProcessInput, AlgorithmKey, AllResults } from '../types';
import { ALGO_COLORS, ALGO_NAMES, P_COLORS } from './GanttChart';
import { generateStepTrace, StepSnapshot } from '../utils/stepSimulator';

interface StepPlaybackInspectorProps {
  processes: ProcessInput[];
  results: AllResults;
  quantum: number;
  externalAlgo?: AlgorithmKey;
  onAlgoChange?: (algo: AlgorithmKey) => void;
}

export const StepPlaybackInspector: React.FC<StepPlaybackInspectorProps> = ({
  processes,
  results,
  quantum,
  externalAlgo,
  onAlgoChange,
}) => {
  const [internalAlgo, setInternalAlgo] = useState<AlgorithmKey>('rr');
  const selectedAlgo = externalAlgo !== undefined ? externalAlgo : internalAlgo;

  const handleSelectAlgo = (k: AlgorithmKey) => {
    setInternalAlgo(k);
    if (onAlgoChange) onAlgoChange(k);
  };
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1); // 0.5x, 1x, 2x, 4x

  const algoKeys: AlgorithmKey[] = ['fcfs', 'sjf', 'srtf', 'rr', 'priority', 'pprior'];

  // Generate step traces
  const snapshots: StepSnapshot[] = useMemo(() => {
    return generateStepTrace(processes, selectedAlgo, quantum);
  }, [processes, selectedAlgo, quantum]);

  const maxStep = Math.max(0, snapshots.length - 1);
  const currentSnapshot: StepSnapshot = snapshots[Math.min(currentStepIndex, maxStep)] || {
    time: 0,
    running: null,
    readyQueue: [],
    completed: [],
    future: [],
    event: 'Ready to start.',
  };

  // Reset or adjust index when algo or processes change
  useEffect(() => {
    setCurrentStepIndex(0);
    setIsPlaying(false);
  }, [selectedAlgo, processes, quantum]);

  // Autoplay loop timer
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const intervalMs = Math.round(800 / speedMultiplier);
    timerRef.current = window.setInterval(() => {
      setCurrentStepIndex((prev) => {
        if (prev >= maxStep) {
          setIsPlaying(false);
          return maxStep;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, maxStep, speedMultiplier]);

  const togglePlay = () => {
    if (currentStepIndex >= maxStep) {
      setCurrentStepIndex(0);
    }
    setIsPlaying(!isPlaying);
  };

  const stepForward = () => {
    setIsPlaying(false);
    setCurrentStepIndex((prev) => Math.min(maxStep, prev + 1));
  };

  const stepBackward = () => {
    setIsPlaying(false);
    setCurrentStepIndex((prev) => Math.max(0, prev - 1));
  };

  const resetSimulation = () => {
    setIsPlaying(false);
    setCurrentStepIndex(0);
  };

  const jumpToEnd = () => {
    setIsPlaying(false);
    setCurrentStepIndex(maxStep);
  };

  // Gantt segment mapping for active algorithm
  const currentResult = results[selectedAlgo];
  const totalTime = currentResult.totalTime || 1;
  const progressPercent = Math.min(100, Math.round((currentSnapshot.time / totalTime) * 100));

  // Color generator for processes
  const getProcessColor = (pid: number) => {
    return P_COLORS[pid % P_COLORS.length];
  };

  return (
    <div
      id="step-playback-inspector"
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '8px',
        padding: '1.25rem 1.4rem',
        marginTop: '2rem',
        marginBottom: '2rem',
        boxShadow: '0 4px 18px rgba(0, 0, 0, 0.25)',
      }}
    >
      {/* Section Header */}
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
          <span style={{ fontSize: '1.3rem' }}>⏱</span>
          <div>
            <div className="section-title" style={{ margin: 0, fontSize: '0.95rem' }}>
              Interactive Step-by-Step Playback &amp; Ready Queue Inspector
            </div>
            <span
              style={{
                fontSize: '0.75rem',
                color: 'var(--dim)',
                fontFamily: 'IBM Plex Sans, sans-serif',
              }}
            >
              Step through each second (t = 0, 1, 2...) to see which task is active on the CPU and which tasks are waiting in line.
            </span>
          </div>
        </div>

        {/* Algorithm Picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label
            htmlFor="playback-algo-select"
            style={{
              fontSize: '0.72rem',
              fontFamily: 'IBM Plex Mono, monospace',
              color: 'var(--dim)',
              textTransform: 'uppercase',
            }}
          >
            Algorithm:
          </label>
          <select
            id="playback-algo-select"
            value={selectedAlgo}
            onChange={(e) => handleSelectAlgo(e.target.value as AlgorithmKey)}
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              color: ALGO_COLORS[selectedAlgo],
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '0.82rem',
              padding: '0.35rem 0.6rem',
              borderRadius: '4px',
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            {algoKeys.map((k) => (
              <option key={k} value={k}>
                {ALGO_NAMES[k]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Control Console */}
      <div
        style={{
          background: 'var(--surface-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          padding: '0.9rem 1.1rem',
          marginBottom: '1.2rem',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
        }}
      >
        {/* Playback Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
          <button
            type="button"
            onClick={resetSimulation}
            title="Reset to start (t=0)"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--dim)',
              padding: '0.4rem 0.75rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '0.8rem',
              fontWeight: 600,
              transition: 'all 0.15s',
            }}
          >
            Reset
          </button>

          <button
            type="button"
            onClick={stepBackward}
            disabled={currentStepIndex <= 0}
            title="Step backward (t-1)"
            style={{
              background: currentStepIndex <= 0 ? 'var(--surface-secondary)' : 'var(--surface)',
              border: '1px solid var(--border)',
              color: currentStepIndex <= 0 ? 'var(--dim)' : 'var(--text)',
              padding: '0.4rem 0.75rem',
              borderRadius: '6px',
              cursor: currentStepIndex <= 0 ? 'not-allowed' : 'pointer',
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '0.8rem',
              fontWeight: 600,
              opacity: currentStepIndex <= 0 ? 0.5 : 1,
            }}
          >
            Step -1
          </button>

          <button
            type="button"
            onClick={togglePlay}
            title={isPlaying ? 'Pause' : 'Play'}
            style={{
              background: isPlaying ? 'var(--yellow)' : 'var(--accent)',
              border: 'none',
              color: isPlaying ? '#000' : '#fff',
              padding: '0.4rem 1.1rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '0.8rem',
              fontWeight: 700,
              minWidth: '85px',
              transition: 'all 0.15s',
            }}
          >
            {isPlaying ? 'Pause' : 'Play'}
          </button>

          <button
            type="button"
            onClick={stepForward}
            disabled={currentStepIndex >= maxStep}
            title="Step forward (t+1)"
            style={{
              background: currentStepIndex >= maxStep ? 'var(--surface-secondary)' : 'var(--surface)',
              border: '1px solid var(--border)',
              color: currentStepIndex >= maxStep ? 'var(--dim)' : 'var(--text)',
              padding: '0.4rem 0.75rem',
              borderRadius: '6px',
              cursor: currentStepIndex >= maxStep ? 'not-allowed' : 'pointer',
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '0.8rem',
              fontWeight: 600,
              opacity: currentStepIndex >= maxStep ? 0.5 : 1,
            }}
          >
            Step +1
          </button>

          <button
            type="button"
            onClick={jumpToEnd}
            title="Jump to completion"
            style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              color: 'var(--dim)',
              padding: '0.4rem 0.75rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '0.8rem',
              fontWeight: 600,
            }}
          >
            End
          </button>
        </div>

        {/* Speed Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ fontSize: '0.72rem', color: 'var(--dim)', fontFamily: 'IBM Plex Mono, monospace' }}>
            Speed:
          </span>
          {[0.5, 1, 2, 4].map((spd) => (
            <button
              key={spd}
              type="button"
              onClick={() => setSpeedMultiplier(spd)}
              style={{
                background: speedMultiplier === spd ? 'var(--accent)' : 'var(--surface)',
                border: speedMultiplier === spd ? '1px solid var(--accent)' : '1px solid var(--border)',
                color: speedMultiplier === spd ? '#fff' : 'var(--dim)',
                padding: '0.25rem 0.5rem',
                borderRadius: '4px',
                cursor: 'pointer',
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: '0.7rem',
                fontWeight: 600,
              }}
            >
              {spd}x
            </button>
          ))}
        </div>

        {/* Current Time Clock Display */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: '0.4rem',
            background: 'var(--surface)',
            padding: '0.35rem 0.8rem',
            borderRadius: '6px',
            border: '1px solid var(--border)',
          }}
        >
          <span style={{ color: 'var(--dim)', fontSize: '0.72rem', fontFamily: 'IBM Plex Mono, monospace' }}>
            CLOCK
          </span>
          <span
            style={{
              color: 'var(--green)',
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '1.25rem',
              fontWeight: 700,
            }}
          >
            t = {currentSnapshot.time}
          </span>
          <span style={{ color: 'var(--dim)', fontSize: '0.72rem', fontFamily: 'IBM Plex Mono, monospace' }}>
            / {totalTime}
          </span>
        </div>
      </div>

      {/* Scrubber Range Slider & Mini Gantt */}
      <div style={{ marginBottom: '1.2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.3rem' }}>
          <span style={{ fontSize: '0.7rem', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--dim)' }}>
            Timeline Playhead Scrubber ({progressPercent}% Complete)
          </span>
          <span style={{ fontSize: '0.7rem', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--accent)' }}>
            Step {currentStepIndex + 1} of {snapshots.length}
          </span>
        </div>

        <input
          type="range"
          min={0}
          max={maxStep}
          value={currentStepIndex}
          onChange={(e) => {
            setIsPlaying(false);
            setCurrentStepIndex(+e.target.value);
          }}
          style={{
            width: '100%',
            cursor: 'pointer',
            accentColor: 'var(--accent)',
            marginBottom: '0.6rem',
          }}
        />

        {/* Synchronized Mini Gantt Track with Playhead Needle */}
        <div
          style={{
            position: 'relative',
            height: '28px',
            background: 'var(--surface-secondary)',
            borderRadius: '6px',
            overflow: 'hidden',
            border: '1px solid var(--border)',
            display: 'flex',
          }}
        >
          {currentResult.gantt.map((seg, sidx) => {
            const segDuration = seg.end - seg.start;
            const segWidthPct = (segDuration / totalTime) * 100;
            const isIdle = seg.pid === 'idle';
            return (
              <div
                key={sidx}
                style={{
                  width: `${segWidthPct}%`,
                  height: '100%',
                  background: isIdle ? 'var(--surface-tertiary)' : getProcessColor(seg.pid as number),
                  opacity: isIdle ? 0.6 : 0.85,
                  borderRight: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: isIdle ? 'var(--dim)' : '#fff',
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '0.65rem',
                  fontWeight: 600,
                  userSelect: 'none',
                }}
                title={isIdle ? `Idle (${seg.start}–${seg.end})` : `P${seg.pid} (${seg.start}–${seg.end})`}
              >
                {segWidthPct > 5 ? (isIdle ? 'idle' : `P${seg.pid}`) : ''}
              </div>
            );
          })}

          {/* Dynamic Red Playhead Needle */}
          <div
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              left: `${(currentSnapshot.time / totalTime) * 100}%`,
              width: '2.5px',
              background: 'var(--red)',
              boxShadow: '0 0 6px rgba(239, 68, 68, 0.6)',
              zIndex: 10,
              transition: 'left 0.1s ease',
              pointerEvents: 'none',
            }}
          />
        </div>
      </div>

      {/* Visual Execution State: CPU Core & Ready Queue */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(240px, 320px) 1fr',
          gap: '1.2rem',
          marginBottom: '1.2rem',
        }}
      >
        {/* ── ACTIVE CPU CORE ── */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '1rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.8rem',
              borderBottom: '1px solid var(--border-subtle)',
              paddingBottom: '0.4rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: currentSnapshot.running ? 'var(--green)' : 'var(--yellow)',
                }}
              />
              <span
                style={{
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: 'var(--text)',
                  textTransform: 'uppercase',
                }}
              >
                Active CPU Core
              </span>
            </div>
            <span
              style={{
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: '0.68rem',
                fontWeight: 600,
                color: currentSnapshot.running ? 'var(--green)' : 'var(--dim)',
              }}
            >
              {currentSnapshot.running ? 'EXECUTING' : 'IDLE'}
            </span>
          </div>

          {currentSnapshot.running ? (
            <div
              style={{
                background: 'var(--surface-secondary)',
                border: `1.5px solid ${getProcessColor(currentSnapshot.running.pid)}`,
                borderRadius: '6px',
                padding: '0.85rem',
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
                    fontSize: '1.15rem',
                    fontWeight: 700,
                    color: getProcessColor(currentSnapshot.running.pid),
                  }}
                >
                  Process P{currentSnapshot.running.pid}
                </span>
                <span
                  style={{
                    fontSize: '0.68rem',
                    background: 'var(--surface)',
                    border: '1px solid var(--border)',
                    color: 'var(--accent)',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '4px',
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontWeight: 600,
                  }}
                >
                  Priority: {currentSnapshot.running.priority}
                </span>
              </div>

              {/* Progress Bar of Remaining Burst */}
              <div style={{ marginBottom: '0.6rem' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.7rem',
                    fontFamily: 'IBM Plex Mono, monospace',
                    color: 'var(--dim)',
                    marginBottom: '0.25rem',
                  }}
                >
                  <span>Remaining Burst:</span>
                  <strong style={{ color: 'var(--text)' }}>
                    {currentSnapshot.running.remainingBT} / {currentSnapshot.running.totalBT} units
                  </strong>
                </div>
                <div
                  style={{
                    width: '100%',
                    height: '6px',
                    background: 'var(--surface)',
                    borderRadius: '3px',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${
                        ((currentSnapshot.running.totalBT - currentSnapshot.running.remainingBT) /
                          currentSnapshot.running.totalBT) *
                        100
                      }%`,
                      height: '100%',
                      background: getProcessColor(currentSnapshot.running.pid),
                      transition: 'width 0.2s',
                    }}
                  />
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '0.4rem',
                  fontSize: '0.72rem',
                  fontFamily: 'IBM Plex Mono, monospace',
                }}
              >
                <div>
                  <span style={{ color: 'var(--dim)', display: 'block', fontSize: '0.65rem' }}>
                    ARRIVAL:
                  </span>
                  <span style={{ color: 'var(--text)', fontWeight: 600 }}>t = {currentSnapshot.running.arrival}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--dim)', display: 'block', fontSize: '0.65rem' }}>
                    WAIT SO FAR:
                  </span>
                  <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>
                    {currentSnapshot.running.waitSoFar} units
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                textAlign: 'center',
                padding: '2rem 1rem',
                color: 'var(--dim)',
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: '0.8rem',
                border: '1px dashed var(--border)',
                borderRadius: '6px',
              }}
            >
              CPU is IDLE
              <div style={{ fontSize: '0.68rem', marginTop: '0.3rem', color: 'var(--dim)' }}>
                No ready processes available to dispatch
              </div>
            </div>
          )}
        </div>

        {/* ── LIVE READY QUEUE ── */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '0.8rem',
              borderBottom: '1px solid var(--border-subtle)',
              paddingBottom: '0.4rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span
                style={{
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  color: 'var(--text)',
                  textTransform: 'uppercase',
                }}
              >
                Ready Queue ({currentSnapshot.readyQueue.length} Processes Waiting)
              </span>
            </div>
            <span
              style={{
                fontSize: '0.68rem',
                fontFamily: 'IBM Plex Mono, monospace',
                color: 'var(--dim)',
              }}
            >
              Dispatch Order: Head ➔ Tail
            </span>
          </div>

          {currentSnapshot.readyQueue.length === 0 ? (
            <div
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--dim)',
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: '0.8rem',
                border: '1px dashed var(--border)',
                borderRadius: '6px',
                padding: '1.5rem',
              }}
            >
              Ready Queue is currently empty.
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                gap: '0.75rem',
                overflowX: 'auto',
                paddingBottom: '0.5rem',
              }}
            >
              {currentSnapshot.readyQueue.map((qp, qidx) => (
                <div
                  key={qp.pid}
                  style={{
                    minWidth: '150px',
                    background: 'var(--surface-secondary)',
                    border: `1px solid ${
                      qidx === 0 ? 'var(--accent)' : 'var(--border)'
                    }`,
                    borderRadius: '6px',
                    padding: '0.65rem 0.8rem',
                    position: 'relative',
                  }}
                >
                  {qidx === 0 && (
                    <span
                      style={{
                        position: 'absolute',
                        top: '-7px',
                        right: '8px',
                        background: 'var(--accent)',
                        color: '#fff',
                        fontSize: '0.58rem',
                        fontWeight: 700,
                        padding: '0.05rem 0.35rem',
                        borderRadius: '2px',
                        fontFamily: 'IBM Plex Mono, monospace',
                      }}
                    >
                      HEAD
                    </span>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '0.4rem',
                    }}
                  >
                    <span
                      style={{
                        fontFamily: 'IBM Plex Mono, monospace',
                        fontWeight: 600,
                        color: getProcessColor(qp.pid),
                        fontSize: '0.92rem',
                      }}
                    >
                      P{qp.pid}
                    </span>
                    <span
                      style={{
                        fontSize: '0.65rem',
                        color: 'var(--dim)',
                        fontFamily: 'IBM Plex Mono, monospace',
                      }}
                    >
                      Pri: {qp.priority}
                    </span>
                  </div>

                  <div
                    style={{
                      fontSize: '0.7rem',
                      fontFamily: 'IBM Plex Mono, monospace',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.2rem',
                    }}
                  >
                    <div>
                      <span style={{ color: 'var(--dim)' }}>Remaining BT: </span>
                      <strong style={{ color: 'var(--text)' }}>{qp.remainingBT}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--dim)' }}>Wait so far: </span>
                      <span style={{ color: 'var(--yellow)', fontWeight: 600 }}>{qp.waitSoFar}</span>
                    </div>
                    <div>
                      <span style={{ color: 'var(--dim)' }}>Arrival: </span>
                      <span style={{ color: 'var(--text)' }}>t={qp.arrival}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Completed Jobs & Pending Arrivals Status */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1rem',
          marginBottom: '1rem',
        }}
      >
        {/* Completed list */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '0.75rem 0.9rem',
          }}
        >
          <span
            style={{
              fontSize: '0.7rem',
              color: 'var(--dim)',
              fontFamily: 'IBM Plex Mono, monospace',
              display: 'block',
              marginBottom: '0.4rem',
              textTransform: 'uppercase',
            }}
          >
            Terminated Jobs ({currentSnapshot.completed.length}/{processes.length}):
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {currentSnapshot.completed.length === 0 ? (
              <span style={{ fontSize: '0.72rem', color: 'var(--dim)', fontStyle: 'italic' }}>
                None completed yet
              </span>
            ) : (
              currentSnapshot.completed.map((cp) => (
                <span
                  key={cp.pid}
                  style={{
                    background: 'var(--green-light)',
                    border: '1px solid var(--green)',
                    color: 'var(--green)',
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: '0.7rem',
                    fontWeight: 600,
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                  }}
                  title={`P${cp.pid}: CT=${cp.completionTime}, TAT=${cp.tat}, WT=${cp.wt}`}
                >
                  P{cp.pid} (CT={cp.completionTime})
                </span>
              ))
            )}
          </div>
        </div>

        {/* Future Arrivals list */}
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            padding: '0.75rem 0.9rem',
          }}
        >
          <span
            style={{
              fontSize: '0.7rem',
              color: 'var(--dim)',
              fontFamily: 'IBM Plex Mono, monospace',
              display: 'block',
              marginBottom: '0.4rem',
              textTransform: 'uppercase',
            }}
          >
            Pending Arrivals ({currentSnapshot.future.length}):
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {currentSnapshot.future.length === 0 ? (
              <span style={{ fontSize: '0.72rem', color: 'var(--dim)', fontStyle: 'italic' }}>
                All processes admitted
              </span>
            ) : (
              currentSnapshot.future.map((fp) => (
                <span
                  key={fp.pid}
                  style={{
                    background: 'var(--surface-secondary)',
                    border: '1px solid var(--border)',
                    color: 'var(--dim)',
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: '0.7rem',
                    padding: '0.2rem 0.5rem',
                    borderRadius: '4px',
                  }}
                >
                  P{fp.pid} (arrives t={fp.arrival})
                </span>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Scheduler Decision & Event Log */}
      <div
        style={{
          background: 'var(--surface-secondary)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
          padding: '0.65rem 0.9rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.6rem',
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: '0.75rem',
        }}
      >
        <span style={{ color: 'var(--accent)', fontWeight: 700 }}>EVENT LOG:</span>
        <span style={{ color: 'var(--text)' }}>{currentSnapshot.event || 'Steady-state CPU execution.'}</span>
      </div>
    </div>
  );
};
