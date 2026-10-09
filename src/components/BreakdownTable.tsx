import React from 'react';
import { AllResults, AlgorithmKey, ProcessInput } from '../types';
import { ALGO_COLORS, ALGO_NAMES } from './GanttChart';

interface BreakdownTableProps {
  results: AllResults;
  processes: ProcessInput[];
}

export const BreakdownTable: React.FC<BreakdownTableProps> = ({ results, processes }) => {
  const algos: AlgorithmKey[] = ['fcfs', 'sjf', 'srtf', 'rr', 'priority', 'pprior'];
  const n = processes.length;

  const minAvgWT = Math.min(...algos.map((k) => results[k].avgWT));
  const minAvgRT = Math.min(...algos.map((k) => results[k].avgRT));

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.6rem' }}>
        <div className="section-title" style={{ margin: 0 }}>Detailed Per-Task Breakdown Table</div>
        <span style={{ fontSize: '0.78rem', color: 'var(--dim)' }}>
          CT = Completion Time • TAT = Turnaround Time • WT = Waiting Time • RT = Response Time
        </span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Task</th>
              <th title="Arrival time">Arrival (s)</th>
              <th title="Required execution duration">Duration (s)</th>
              {algos.map((k) => (
                <th
                  key={k}
                  colSpan={4}
                  className="table-algo-divider"
                  style={{
                    color: ALGO_COLORS[k],
                  }}
                >
                  {ALGO_NAMES[k]}
                </th>
              ))}
            </tr>
            <tr>
              <th />
              <th />
              <th />
              {algos.map((k) => (
                <React.Fragment key={k}>
                  <th className="table-algo-divider" title="Completion Time (when the task finished)">CT</th>
                  <th title="Turnaround Time (Total time from arrival to completion)">TAT</th>
                  <th title="Waiting Time (Total time spent idle in queue)">WT</th>
                  <th title="Response Time (Time until first CPU execution)">RT</th>
                </React.Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {processes.map((proc, i) => {
              const minWT = Math.min(
                ...algos.map((k) => results[k].stats.find((s) => s.idx === i)?.WT ?? Infinity)
              );
              const minRT = Math.min(
                ...algos.map((k) => results[k].stats.find((s) => s.idx === i)?.RT ?? Infinity)
              );

              return (
                <tr key={proc.id}>
                  <td className="pid-cell">P{i}</td>
                  <td>{proc.arrival}</td>
                  <td>{proc.burst}</td>
                  {algos.map((k, ki) => {
                    const s = results[k].stats.find((item) => item.idx === i);
                    const isBestWT = s !== undefined && s.WT === minWT;
                    const isBestRT = s !== undefined && s.RT === minRT;

                    return (
                      <React.Fragment key={k}>
                        <td className={ki === 0 ? 'table-algo-divider' : undefined}>
                          {s?.CT ?? '-'}
                        </td>
                        <td>{s?.TAT ?? '-'}</td>
                        <td className={isBestWT ? 'best-cell' : ''}>{s?.WT ?? '-'}</td>
                        <td className={isBestRT ? 'best-cell' : ''}>{s?.RT ?? '-'}</td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              );
            })}
            <tr style={{ borderTop: '2px solid var(--border)' }}>
              <td colSpan={3} style={{ color: 'var(--dim)' }}>
                Average
              </td>
              {algos.map((k, ki) => {
                const r = results[k];
                const isBestAvgWT = Math.abs(r.avgWT - minAvgWT) < 0.001;
                const isBestAvgRT = Math.abs(r.avgRT - minAvgRT) < 0.001;
                const avgCT = (r.stats.reduce((sum, p) => sum + p.CT, 0) / (n || 1)).toFixed(2);

                return (
                  <React.Fragment key={k}>
                    <td className={ki === 0 ? 'table-algo-divider' : undefined}>
                      {avgCT}
                    </td>
                    <td>{r.avgTAT.toFixed(2)}</td>
                    <td className={isBestAvgWT ? 'best-cell' : ''}>{r.avgWT.toFixed(2)}</td>
                    <td className={isBestAvgRT ? 'best-cell' : ''}>{r.avgRT.toFixed(2)}</td>
                  </React.Fragment>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
};
