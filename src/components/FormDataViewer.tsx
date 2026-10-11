import React, { useState, useMemo } from 'react';
import { AllResults, AlgorithmKey, ProcessInput } from '../types';
import { ALGO_COLORS, ALGO_NAMES } from './GanttChart';

interface FormDataViewerProps {
  results: AllResults;
  processes: ProcessInput[];
  selectedAlgo: AlgorithmKey;
  onSelectAlgo: (algo: AlgorithmKey) => void;
  onLoadPreset?: (procs: ProcessInput[], quantum?: number) => void;
  processNames?: string[];
}

export type { PresetWorkload } from '../data/presets';
export { WORKLOAD_PRESETS, DEFAULT_PROCESSES, DEFAULT_QUANTUM, generateRandomMultiProcessWorkload } from '../data/presets';

export const FormDataViewer: React.FC<FormDataViewerProps> = ({
  results,
  processes,
  selectedAlgo,
  onSelectAlgo,
  onLoadPreset,
  processNames,
}) => {
  const [formTab, setFormTab] = useState<'inspector' | 'headtohead' | 'export' | 'metrics'>('inspector');
  const [algoCompareA, setAlgoCompareA] = useState<AlgorithmKey>('fcfs');
  const [algoCompareB, setAlgoCompareB] = useState<AlgorithmKey>('rr');
  const [sortBy, setSortBy] = useState<'idx' | 'WT' | 'TAT' | 'RT' | 'BT'>('idx');
  const [metricsSortKey, setMetricsSortKey] = useState<string>('avgWT');
  const [metricsSortAsc, setMetricsSortAsc] = useState<boolean>(true);
  const [filterQuery, setFilterQuery] = useState('');
  const [onlyHighWait, setOnlyHighWait] = useState(false);
  const [copiedStatus, setCopiedStatus] = useState<string | null>(null);

  const algoKeys: AlgorithmKey[] = ['fcfs', 'sjf', 'srtf', 'rr', 'priority', 'pprior'];

  // SYSTEM 5: Metrics Comparison Dataset across all algorithms (9 columns total)
  const metricsComparisonData = useMemo(() => {
    const avgBT =
      processes.length > 0
        ? processes.reduce((acc, p) => acc + p.burst, 0) / processes.length
        : 1;
    const fcfsWT = results.fcfs.avgWT;

    const list = algoKeys.map((key) => {
      const res = results[key];
      const stats = res.stats;
      let sumX = 0;
      let sumX2 = 0;
      let starvationCount = 0;
      let totalRR = 0;

      stats.forEach((s) => {
        const xi = 1 / (s.WT + 1);
        sumX += xi;
        sumX2 += xi * xi;

        if (avgBT > 0 && s.WT > 3 * avgBT) {
          starvationCount++;
        }
        const bt = s.BT || 1;
        totalRR += (s.WT + s.BT) / bt;
      });

      const jfiRaw = stats.length > 0 && sumX2 > 0 ? (sumX * sumX) / (stats.length * sumX2) : 1;
      const jfi = Math.min(1, Math.max(0, Math.round(jfiRaw * 100) / 100));

      let speedupVal = 1.0;
      let speedupStr = '1.0x';
      if (key === 'fcfs') {
        speedupVal = 1.0;
        speedupStr = '1.0x';
      } else if (res.avgWT === 0) {
        speedupVal = fcfsWT === 0 ? 1.0 : 99.9;
        speedupStr = fcfsWT === 0 ? '1.0x' : '∞';
      } else {
        speedupVal = +(fcfsWT / res.avgWT).toFixed(2);
        speedupStr = `${speedupVal}x`;
      }

      const avgRR = stats.length > 0 ? +(totalRR / stats.length).toFixed(2) : 1;

      return {
        key,
        name: ALGO_NAMES[key],
        color: ALGO_COLORS[key],
        avgWT: +res.avgWT.toFixed(2),
        avgTAT: +res.avgTAT.toFixed(2),
        avgRT: +res.avgRT.toFixed(2),
        cpuUtil: parseFloat(res.cpuUtil) || 0,
        ctxSwitches: res.ctxSwitches,
        jfi,
        speedupVal,
        speedupStr,
        starvationCount,
        avgRR,
      };
    });

    list.sort((a: any, b: any) => {
      const valA = a[metricsSortKey];
      const valB = b[metricsSortKey];
      if (valA < valB) return metricsSortAsc ? -1 : 1;
      if (valA > valB) return metricsSortAsc ? 1 : -1;
      return 0;
    });

    return list;
  }, [results, processes, metricsSortKey, metricsSortAsc]);

  const currentResult = results[selectedAlgo];

  // Process rows with metrics
  const processedRows = useMemo(() => {
    const stats = currentResult.stats;
    const avgWT = currentResult.avgWT;

    let list = stats.map((s) => {
      const p = processes[s.idx] || { arrival: s.AT, burst: s.BT, priority: 1 };
      const penalty = +(s.TAT / (s.BT || 1)).toFixed(2);
      const startTime = s.RT + s.AT;
      const name = processNames?.[s.idx] || `Task ${s.idx}`;
      return {
        ...s,
        priority: p.priority,
        name,
        startTime,
        penalty,
      };
    });

    if (filterQuery.trim()) {
      const q = filterQuery.toLowerCase();
      list = list.filter(
        (r) =>
          `p${r.idx}`.includes(q) ||
          r.AT.toString().includes(q) ||
          r.BT.toString().includes(q)
      );
    }

    if (onlyHighWait) {
      list = list.filter((r) => r.WT >= avgWT);
    }

    list.sort((a, b) => {
      if (sortBy === 'idx') return a.idx - b.idx;
      if (sortBy === 'WT') return b.WT - a.WT;
      if (sortBy === 'TAT') return b.TAT - a.TAT;
      if (sortBy === 'RT') return b.RT - a.RT;
      if (sortBy === 'BT') return b.BT - a.BT;
      return 0;
    });

    return list;
  }, [currentResult, processes, filterQuery, onlyHighWait, sortBy, processNames]);

  // Head to Head calculation
  const resA = results[algoCompareA];
  const resB = results[algoCompareB];

  const diffWT = +(resB.avgWT - resA.avgWT).toFixed(2);
  const diffTAT = +(resB.avgTAT - resA.avgTAT).toFixed(2);
  const diffRT = +(resB.avgRT - resA.avgRT).toFixed(2);
  const diffSwitches = resB.ctxSwitches - resA.ctxSwitches;
  const diffUtil = +(parseFloat(resB.cpuUtil) - parseFloat(resA.cpuUtil)).toFixed(1);

  const handleCopyData = (format: 'csv' | 'json') => {
    let text = '';
    if (format === 'json') {
      const exportObj = {
        algorithm: selectedAlgo,
        name: ALGO_NAMES[selectedAlgo],
        summary: {
          avgWT: currentResult.avgWT,
          avgTAT: currentResult.avgTAT,
          avgRT: currentResult.avgRT,
          cpuUtil: currentResult.cpuUtil,
          throughput: currentResult.throughput,
          makespan: currentResult.totalTime,
          contextSwitches: currentResult.ctxSwitches,
        },
        processes: currentResult.stats.map((s) => ({
          id: s.id ?? s.idx,
          label: `P${s.id ?? s.idx}`,
          name: processNames?.[s.idx] || `Task ${s.id ?? s.idx}`,
          arrival: s.AT,
          burst: s.BT,
          completion: s.CT,
          turnaround: s.TAT,
          waiting: s.WT,
          response: s.RT,
          penaltyRatio: +(s.TAT / (s.BT || 1)).toFixed(2),
        })),
      };
      text = JSON.stringify(exportObj, null, 2);
    } else {
      const headers = ['ID', 'Label', 'Arrival', 'Burst', 'Priority', 'Start', 'Completion', 'TAT', 'WT', 'RT', 'TAT/BT'];
      const rows = processedRows.map((r) => [
        r.id ?? r.idx,
        `P${r.id ?? r.idx}`,
        r.AT,
        r.BT,
        r.priority,
        r.startTime,
        r.CT,
        r.TAT,
        r.WT,
        r.RT,
        r.penalty,
      ]);
      text = [headers.join(','), ...rows.map((row) => row.join(','))].join('\n');
    }

    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => {
          setCopiedStatus(format.toUpperCase());
          setTimeout(() => setCopiedStatus(null), 2000);
        })
        .catch(() => {
          setCopiedStatus('ERROR');
          setTimeout(() => setCopiedStatus(null), 2500);
        });
    } else {
      setCopiedStatus('UNSUPPORTED');
      setTimeout(() => setCopiedStatus(null), 2500);
    }
  };

  return (
    <div className="form-data-viewer" style={{ marginTop: '2rem', marginBottom: '2rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '0.8rem',
          marginBottom: '1rem',
        }}
      >
        <div className="section-title" style={{ margin: 0 }}>
          Data Viewing & Inspection Forms
        </div>

        {/* Tab Buttons */}
        <div
          style={{
            display: 'flex',
            gap: '0.3rem',
            background: 'var(--surface)',
            padding: '0.25rem',
            borderRadius: '5px',
            border: '1px solid var(--border)',
          }}
        >
          <button
            type="button"
            onClick={() => setFormTab('inspector')}
            style={{
              background: formTab === 'inspector' ? 'var(--accent)' : 'transparent',
              color: formTab === 'inspector' ? '#fff' : 'var(--dim)',
              border: 'none',
              borderRadius: '4px',
              padding: '0.3rem 0.65rem',
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '0.72rem',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            📋 Process Form Inspector
          </button>
          <button
            type="button"
            onClick={() => setFormTab('headtohead')}
            style={{
              background: formTab === 'headtohead' ? 'var(--accent)' : 'transparent',
              color: formTab === 'headtohead' ? '#fff' : 'var(--dim)',
              border: 'none',
              borderRadius: '4px',
              padding: '0.3rem 0.65rem',
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '0.72rem',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            ⚖ Head-to-Head Comparison
          </button>
          <button
            type="button"
            onClick={() => setFormTab('export')}
            style={{
              background: formTab === 'export' ? 'var(--accent)' : 'transparent',
              color: formTab === 'export' ? '#fff' : 'var(--dim)',
              border: 'none',
              borderRadius: '4px',
              padding: '0.3rem 0.65rem',
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '0.72rem',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            📥 Export Form Data
          </button>
          <button
            type="button"
            onClick={() => setFormTab('metrics')}
            style={{
              background: formTab === 'metrics' ? 'var(--accent)' : 'transparent',
              color: formTab === 'metrics' ? '#fff' : 'var(--dim)',
              border: 'none',
              borderRadius: '4px',
              padding: '0.3rem 0.65rem',
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '0.72rem',
              cursor: 'pointer',
              transition: 'all 0.15s',
            }}
          >
            📊 Metrics Comparison
          </button>
        </div>
      </div>

      {/* ── TAB 1: PROCESS FORM INSPECTOR ── */}
      {formTab === 'inspector' && (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '1.2rem',
          }}
        >
          {/* Algorithm Selector & Filter Controls Form */}
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1rem',
              alignItems: 'center',
              paddingBottom: '1rem',
              borderBottom: '1px solid var(--border)',
              marginBottom: '1.2rem',
            }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.68rem',
                  fontFamily: 'IBM Plex Mono, monospace',
                  color: 'var(--dim)',
                  textTransform: 'uppercase',
                  marginBottom: '0.3rem',
                }}
              >
                Inspect Algorithm:
              </label>
              <select
                value={selectedAlgo}
                onChange={(e) => onSelectAlgo(e.target.value as AlgorithmKey)}
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

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.68rem',
                  fontFamily: 'IBM Plex Mono, monospace',
                  color: 'var(--dim)',
                  textTransform: 'uppercase',
                  marginBottom: '0.3rem',
                }}
              >
                Sort By:
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '0.82rem',
                  padding: '0.35rem 0.6rem',
                  borderRadius: '4px',
                  outline: 'none',
                  cursor: 'pointer',
                }}
              >
                <option value="idx">Process Order (PID)</option>
                <option value="WT">Waiting Time (Highest)</option>
                <option value="TAT">Turnaround Time (Highest)</option>
                <option value="RT">Response Time (Highest)</option>
                <option value="BT">Burst Time (Highest)</option>
              </select>
            </div>

            <div style={{ flex: '1 1 180px' }}>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.68rem',
                  fontFamily: 'IBM Plex Mono, monospace',
                  color: 'var(--dim)',
                  textTransform: 'uppercase',
                  marginBottom: '0.3rem',
                }}
              >
                Filter / Search PID:
              </label>
              <input
                type="text"
                placeholder="Search PID (e.g. 0, 1)..."
                value={filterQuery}
                onChange={(e) => setFilterQuery(e.target.value)}
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '0.82rem',
                  padding: '0.35rem 0.6rem',
                  borderRadius: '4px',
                  width: '100%',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', marginTop: '1.2rem' }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.4rem',
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '0.75rem',
                  color: onlyHighWait ? 'var(--yellow)' : 'var(--dim)',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={onlyHighWait}
                  onChange={(e) => setOnlyHighWait(e.target.checked)}
                />
                Above-Avg WT (≥ {currentResult.avgWT.toFixed(1)})
              </label>
            </div>
          </div>

          {/* Form Cards Grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '0.9rem',
            }}
          >
            {processedRows.map((row) => (
              <div
                key={row.idx}
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  borderRadius: '5px',
                  padding: '0.85rem 1rem',
                  position: 'relative',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: '0.6rem',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                    paddingBottom: '0.4rem',
                  }}
                >
                  <span
                    style={{
                      fontFamily: 'IBM Plex Mono, monospace',
                      fontWeight: 600,
                      color: 'var(--accent)',
                      fontSize: '0.95rem',
                    }}
                  >
                    Process P{row.idx}{row.name && row.name !== `Task ${row.idx}` ? ` — ${row.name}` : ''}
                  </span>
                  <span
                    style={{
                      fontSize: '0.7rem',
                      fontFamily: 'IBM Plex Mono, monospace',
                      background: 'var(--surface-tertiary)',
                      color: 'var(--accent)',
                      border: '1px solid var(--border)',
                      padding: '0.1rem 0.45rem',
                      borderRadius: '3px',
                    }}
                  >
                    Priority: {row.priority}
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '0.5rem 0.8rem',
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: '0.78rem',
                  }}
                >
                  <div>
                    <span style={{ color: 'var(--dim)', fontSize: '0.68rem', display: 'block' }}>
                      ARRIVAL TIME (AT)
                    </span>
                    <span style={{ color: 'var(--text)', fontWeight: 600 }}>{row.AT}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--dim)', fontSize: '0.68rem', display: 'block' }}>
                      BURST TIME (BT)
                    </span>
                    <span style={{ color: 'var(--text)', fontWeight: 600 }}>{row.BT}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--dim)', fontSize: '0.68rem', display: 'block' }}>
                      START TIME (ST)
                    </span>
                    <span style={{ color: '#72c4f7' }}>{row.startTime}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--dim)', fontSize: '0.68rem', display: 'block' }}>
                      COMPLETION (CT)
                    </span>
                    <span style={{ color: 'var(--text)' }}>{row.CT}</span>
                  </div>
                  <div
                    style={{
                      background: 'rgba(79, 142, 247, 0.05)',
                      padding: '0.3rem 0.4rem',
                      borderRadius: '3px',
                    }}
                  >
                    <span style={{ color: 'var(--dim)', fontSize: '0.68rem', display: 'block' }}>
                      TURNAROUND (TAT)
                    </span>
                    <span style={{ color: '#4f8ef7', fontWeight: 600 }}>{row.TAT}</span>
                  </div>
                  <div
                    style={{
                      background:
                        row.WT > currentResult.avgWT
                          ? 'rgba(247, 96, 96, 0.08)'
                          : 'rgba(62, 207, 142, 0.08)',
                      padding: '0.3rem 0.4rem',
                      borderRadius: '3px',
                    }}
                  >
                    <span style={{ color: 'var(--dim)', fontSize: '0.68rem', display: 'block' }}>
                      WAITING TIME (WT)
                    </span>
                    <span
                      style={{
                        color:
                          row.WT > currentResult.avgWT ? 'var(--red)' : 'var(--green)',
                        fontWeight: 600,
                      }}
                    >
                      {row.WT}
                    </span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--dim)', fontSize: '0.68rem', display: 'block' }}>
                      RESPONSE TIME (RT)
                    </span>
                    <span style={{ color: '#9b72f7' }}>{row.RT}</span>
                  </div>
                  <div>
                    <span style={{ color: 'var(--dim)', fontSize: '0.68rem', display: 'block' }}>
                      PENALTY (TAT/BT)
                    </span>
                    <span style={{ color: '#f5c842' }}>{row.penalty}x</span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {processedRows.length === 0 && (
            <div
              style={{
                textAlign: 'center',
                padding: '2rem',
                color: 'var(--dim)',
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: '0.85rem',
              }}
            >
              No processes match current filter criteria.
            </div>
          )}
        </div>
      )}

      {/* ── TAB 2: HEAD-TO-HEAD SPEC SHEET COMPARISON ── */}
      {formTab === 'headtohead' && (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '1.2rem',
          }}
        >
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr',
              gap: '1rem',
              alignItems: 'center',
              marginBottom: '1.5rem',
            }}
          >
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.7rem',
                  fontFamily: 'IBM Plex Mono, monospace',
                  color: ALGO_COLORS[algoCompareA],
                  fontWeight: 600,
                  marginBottom: '0.3rem',
                }}
              >
                Algorithm A
              </label>
              <select
                value={algoCompareA}
                onChange={(e) => setAlgoCompareA(e.target.value as AlgorithmKey)}
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: ALGO_COLORS[algoCompareA],
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '0.85rem',
                  padding: '0.4rem 0.6rem',
                  borderRadius: '4px',
                  width: '100%',
                  outline: 'none',
                }}
              >
                {algoKeys.map((k) => (
                  <option key={k} value={k}>
                    {ALGO_NAMES[k]}
                  </option>
                ))}
              </select>
            </div>

            <div
              style={{
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: '1rem',
                color: 'var(--dim)',
                paddingTop: '1.2rem',
              }}
            >
              VS
            </div>

            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: '0.7rem',
                  fontFamily: 'IBM Plex Mono, monospace',
                  color: ALGO_COLORS[algoCompareB],
                  fontWeight: 600,
                  marginBottom: '0.3rem',
                }}
              >
                Algorithm B
              </label>
              <select
                value={algoCompareB}
                onChange={(e) => setAlgoCompareB(e.target.value as AlgorithmKey)}
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: ALGO_COLORS[algoCompareB],
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '0.85rem',
                  padding: '0.4rem 0.6rem',
                  borderRadius: '4px',
                  width: '100%',
                  outline: 'none',
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

          {/* Direct Comparative Spec Table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '1rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                <th style={{ textAlign: 'left', padding: '0.6rem 0.8rem', color: 'var(--dim)' }}>
                  Performance Metric
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    padding: '0.6rem 0.8rem',
                    color: ALGO_COLORS[algoCompareA],
                  }}
                >
                  {ALGO_NAMES[algoCompareA]}
                </th>
                <th
                  style={{
                    textAlign: 'right',
                    padding: '0.6rem 0.8rem',
                    color: ALGO_COLORS[algoCompareB],
                  }}
                >
                  {ALGO_NAMES[algoCompareB]}
                </th>
                <th style={{ textAlign: 'right', padding: '0.6rem 0.8rem', color: 'var(--dim)' }}>
                  Delta (B − A)
                </th>
                <th style={{ textAlign: 'center', padding: '0.6rem 0.8rem', color: 'var(--dim)' }}>
                  Advantage
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Avg Waiting Time</td>
                <td style={{ textAlign: 'right' }}>{resA.avgWT.toFixed(2)} units</td>
                <td style={{ textAlign: 'right' }}>{resB.avgWT.toFixed(2)} units</td>
                <td
                  style={{
                    textAlign: 'right',
                    color: diffWT < 0 ? 'var(--green)' : diffWT > 0 ? 'var(--red)' : 'var(--dim)',
                  }}
                >
                  {diffWT > 0 ? `+${diffWT}` : diffWT}
                </td>
                <td
                  style={{
                    textAlign: 'center',
                    fontWeight: 600,
                    color: resA.avgWT < resB.avgWT ? ALGO_COLORS[algoCompareA] : ALGO_COLORS[algoCompareB],
                  }}
                >
                  {resA.avgWT === resB.avgWT
                    ? 'Tie'
                    : resA.avgWT < resB.avgWT
                    ? 'Algo A'
                    : 'Algo B'}
                </td>
              </tr>
              <tr>
                <td>Avg Turnaround Time</td>
                <td style={{ textAlign: 'right' }}>{resA.avgTAT.toFixed(2)} units</td>
                <td style={{ textAlign: 'right' }}>{resB.avgTAT.toFixed(2)} units</td>
                <td
                  style={{
                    textAlign: 'right',
                    color: diffTAT < 0 ? 'var(--green)' : diffTAT > 0 ? 'var(--red)' : 'var(--dim)',
                  }}
                >
                  {diffTAT > 0 ? `+${diffTAT}` : diffTAT}
                </td>
                <td
                  style={{
                    textAlign: 'center',
                    fontWeight: 600,
                    color: resA.avgTAT < resB.avgTAT ? ALGO_COLORS[algoCompareA] : ALGO_COLORS[algoCompareB],
                  }}
                >
                  {resA.avgTAT === resB.avgTAT
                    ? 'Tie'
                    : resA.avgTAT < resB.avgTAT
                    ? 'Algo A'
                    : 'Algo B'}
                </td>
              </tr>
              <tr>
                <td>Avg Response Time</td>
                <td style={{ textAlign: 'right' }}>{resA.avgRT.toFixed(2)} units</td>
                <td style={{ textAlign: 'right' }}>{resB.avgRT.toFixed(2)} units</td>
                <td
                  style={{
                    textAlign: 'right',
                    color: diffRT < 0 ? 'var(--green)' : diffRT > 0 ? 'var(--red)' : 'var(--dim)',
                  }}
                >
                  {diffRT > 0 ? `+${diffRT}` : diffRT}
                </td>
                <td
                  style={{
                    textAlign: 'center',
                    fontWeight: 600,
                    color: resA.avgRT < resB.avgRT ? ALGO_COLORS[algoCompareA] : ALGO_COLORS[algoCompareB],
                  }}
                >
                  {resA.avgRT === resB.avgRT
                    ? 'Tie'
                    : resA.avgRT < resB.avgRT
                    ? 'Algo A'
                    : 'Algo B'}
                </td>
              </tr>
              <tr>
                <td>CPU Utilization</td>
                <td style={{ textAlign: 'right' }}>{resA.cpuUtil}%</td>
                <td style={{ textAlign: 'right' }}>{resB.cpuUtil}%</td>
                <td
                  style={{
                    textAlign: 'right',
                    color: diffUtil > 0 ? 'var(--green)' : diffUtil < 0 ? 'var(--red)' : 'var(--dim)',
                  }}
                >
                  {diffUtil > 0 ? `+${diffUtil}%` : `${diffUtil}%`}
                </td>
                <td
                  style={{
                    textAlign: 'center',
                    fontWeight: 600,
                    color:
                      parseFloat(resA.cpuUtil) > parseFloat(resB.cpuUtil)
                        ? ALGO_COLORS[algoCompareA]
                        : ALGO_COLORS[algoCompareB],
                  }}
                >
                  {resA.cpuUtil === resB.cpuUtil
                    ? 'Tie'
                    : parseFloat(resA.cpuUtil) > parseFloat(resB.cpuUtil)
                    ? 'Algo A'
                    : 'Algo B'}
                </td>
              </tr>
              <tr>
                <td>Context Switches (Preemptions)</td>
                <td style={{ textAlign: 'right' }}>{resA.ctxSwitches}</td>
                <td style={{ textAlign: 'right' }}>{resB.ctxSwitches}</td>
                <td
                  style={{
                    textAlign: 'right',
                    color:
                      diffSwitches < 0 ? 'var(--green)' : diffSwitches > 0 ? 'var(--red)' : 'var(--dim)',
                  }}
                >
                  {diffSwitches > 0 ? `+${diffSwitches}` : diffSwitches}
                </td>
                <td
                  style={{
                    textAlign: 'center',
                    fontWeight: 600,
                    color:
                      resA.ctxSwitches < resB.ctxSwitches
                        ? ALGO_COLORS[algoCompareA]
                        : ALGO_COLORS[algoCompareB],
                  }}
                >
                  {resA.ctxSwitches === resB.ctxSwitches
                    ? 'Tie'
                    : resA.ctxSwitches < resB.ctxSwitches
                    ? 'Algo A (Less Overhead)'
                    : 'Algo B (Less Overhead)'}
                </td>
              </tr>
              <tr>
                <td>Total Execution Makespan</td>
                <td style={{ textAlign: 'right' }}>{resA.totalTime} units</td>
                <td style={{ textAlign: 'right' }}>{resB.totalTime} units</td>
                <td style={{ textAlign: 'right' }}>
                  {resB.totalTime - resA.totalTime > 0
                    ? `+${resB.totalTime - resA.totalTime}`
                    : resB.totalTime - resA.totalTime}
                </td>
                <td
                  style={{
                    textAlign: 'center',
                    fontWeight: 600,
                    color:
                      resA.totalTime <= resB.totalTime
                        ? ALGO_COLORS[algoCompareA]
                        : ALGO_COLORS[algoCompareB],
                  }}
                >
                  {resA.totalTime === resB.totalTime
                    ? 'Equal Makespan'
                    : resA.totalTime < resB.totalTime
                    ? 'Algo A'
                    : 'Algo B'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* ── TAB 3: EXPORT FORM DATA ── */}
      {formTab === 'export' && (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '1.2rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.6rem',
              marginBottom: '1rem',
            }}
          >
            <div>
              <h4
                style={{
                  margin: 0,
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '0.9rem',
                  color: 'var(--text)',
                }}
              >
                Export Simulation Dataset ({ALGO_NAMES[selectedAlgo]})
              </h4>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.75rem', color: 'var(--dim)' }}>
                Export structured tabular records for coursework, analysis, or offline spreadsheet plotting.
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => handleCopyData('csv')}
                className="add-btn"
                style={{
                  padding: '0.35rem 0.8rem',
                  color: copiedStatus === 'CSV' ? 'var(--green)' : 'var(--accent)',
                  borderColor: copiedStatus === 'CSV' ? 'var(--green)' : 'var(--accent)',
                }}
              >
                {copiedStatus === 'CSV' ? '✓ Copied CSV!' : 'Copy CSV'}
              </button>
              <button
                type="button"
                onClick={() => handleCopyData('json')}
                className="add-btn"
                style={{
                  padding: '0.35rem 0.8rem',
                  color: copiedStatus === 'JSON' ? 'var(--green)' : 'var(--accent)',
                  borderColor: copiedStatus === 'JSON' ? 'var(--green)' : 'var(--accent)',
                }}
              >
                {copiedStatus === 'JSON' ? '✓ Copied JSON!' : 'Copy JSON'}
              </button>
            </div>
          </div>

          <textarea
            readOnly
            value={[
              'PID,Arrival,Burst,Priority,Start,Completion,TAT,WT,RT,PenaltyRatio',
              ...processedRows.map(
                (r) =>
                  `P${r.idx},${r.AT},${r.BT},${r.priority},${r.startTime},${r.CT},${r.TAT},${r.WT},${r.RT},${r.penalty}`
              ),
            ].join('\n')}
            rows={7}
            style={{
              width: '100%',
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: '4px',
              padding: '0.8rem',
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '0.75rem',
              color: 'var(--text)',
              outline: 'none',
              resize: 'vertical',
            }}
          />
        </div>
      )}

      {/* ── TAB 4: METRICS COMPARISON (9 COLUMNS TOTAL) ── */}
      {formTab === 'metrics' && (
        <div
          style={{
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '1.2rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '0.6rem',
              marginBottom: '1rem',
            }}
          >
            <div>
              <h4
                style={{
                  margin: 0,
                  fontFamily: 'IBM Plex Mono, monospace',
                  fontSize: '0.9rem',
                  color: 'var(--text)',
                }}
              >
                Comprehensive Cross-Algorithm Metrics Matrix (9 Key Metrics)
              </h4>
              <p style={{ margin: '0.2rem 0 0 0', fontSize: '0.75rem', color: 'var(--dim)' }}>
                Compare all 6 algorithms side by side. Click any table header to sort.
              </p>
            </div>

            <div
              style={{
                fontSize: '0.72rem',
                fontFamily: 'IBM Plex Mono, monospace',
                color: 'var(--dim)',
              }}
            >
              Sorted by: <strong style={{ color: 'var(--accent)' }}>{metricsSortKey}</strong> ({metricsSortAsc ? 'Ascending' : 'Descending'})
            </div>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
              <thead>
                <tr style={{ background: 'var(--surface-secondary)', borderBottom: '1px solid var(--border)' }}>
                  <th
                    style={{
                      textAlign: 'left',
                      padding: '8px 10px',
                      color: 'var(--text)',
                      fontFamily: 'IBM Plex Mono, monospace',
                    }}
                  >
                    Algorithm
                  </th>
                  {[
                    { key: 'avgWT', label: 'Avg WT' },
                    { key: 'avgTAT', label: 'Avg TAT' },
                    { key: 'avgRT', label: 'Avg RT' },
                    { key: 'cpuUtil', label: 'CPU Util' },
                    { key: 'ctxSwitches', label: 'Ctx Switch' },
                    { key: 'jfi', label: "Jain's JFI" },
                    { key: 'speedupVal', label: 'Speedup vs FCFS' },
                    { key: 'starvationCount', label: 'Starvation (WT>3xBT)' },
                    { key: 'avgRR', label: 'Avg RR' },
                  ].map((col) => (
                    <th
                      key={col.key}
                      onClick={() => {
                        if (metricsSortKey === col.key) {
                          setMetricsSortAsc(!metricsSortAsc);
                        } else {
                          setMetricsSortKey(col.key);
                          setMetricsSortAsc(true);
                        }
                      }}
                      style={{
                        textAlign: 'right',
                        padding: '8px 10px',
                        fontFamily: 'IBM Plex Mono, monospace',
                        cursor: 'pointer',
                        userSelect: 'none',
                        color: metricsSortKey === col.key ? 'var(--accent)' : 'var(--dim)',
                      }}
                      title={`Sort by ${col.label}`}
                    >
                      {col.label} {metricsSortKey === col.key ? (metricsSortAsc ? '▲' : '▼') : '↕'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {metricsComparisonData.map((row) => {
                  const isSelected = row.key === selectedAlgo;
                  return (
                    <tr
                      key={row.key}
                      onClick={() => onSelectAlgo(row.key)}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: isSelected ? 'var(--surface-secondary)' : 'transparent',
                        cursor: 'pointer',
                        transition: 'background 0.15s ease',
                      }}
                    >
                      <td style={{ padding: '8px 10px', fontWeight: 700 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span
                            style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              backgroundColor: row.color,
                              display: 'inline-block',
                            }}
                          />
                          <span style={{ color: row.color }}>{row.name}</span>
                        </div>
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 10px', fontFamily: 'IBM Plex Mono, monospace', fontWeight: 600 }}>
                        {row.avgWT.toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 10px', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {row.avgTAT.toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 10px', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {row.avgRT.toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 10px', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {row.cpuUtil}%
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 10px', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {row.ctxSwitches}
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 10px', fontFamily: 'IBM Plex Mono, monospace', fontWeight: 600, color: row.jfi >= 0.8 ? 'var(--green)' : row.jfi >= 0.6 ? 'var(--yellow)' : 'var(--red)' }}>
                        {row.jfi.toFixed(2)}
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 10px', fontFamily: 'IBM Plex Mono, monospace', color: row.speedupVal > 1 ? 'var(--green)' : 'var(--text)' }}>
                        {row.speedupStr}
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 10px', fontFamily: 'IBM Plex Mono, monospace', color: row.starvationCount > 0 ? 'var(--red)' : 'var(--green)' }}>
                        {row.starvationCount}
                      </td>
                      <td style={{ textAlign: 'right', padding: '8px 10px', fontFamily: 'IBM Plex Mono, monospace' }}>
                        {row.avgRR.toFixed(2)}x
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
