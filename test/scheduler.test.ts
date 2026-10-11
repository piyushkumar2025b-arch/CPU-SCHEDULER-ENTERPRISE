import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateWorkload,
  runFCFS,
  runSJF,
  runSRTF,
  runRoundRobin,
  runPriority,
  runPreemptivePriority,
  simulateAll,
} from '../src/scheduler.js';
import { detectAnomalies, ANOMALY_THRESHOLDS } from '../src/utils/anomalyDetector.js';
import { analyzeStarvationRisks } from '../src/utils/starvationAnalyzer.js';
import { generateStepTrace } from '../src/utils/stepSimulator.js';

test('CPU-001: Round Robin validates non-positive or invalid quantum', () => {
  const procs = [{ id: 0, arrival: 0, burst: 5, priority: 1 }];

  // Throws on zero quantum
  assert.throws(() => runRoundRobin(procs, 0), /Round Robin quantum must be a positive integer/);

  // Throws on negative quantum
  assert.throws(() => runRoundRobin(procs, -2), /Round Robin quantum must be a positive integer/);

  // Throws on NaN quantum
  assert.throws(() => runRoundRobin(procs, NaN), /Round Robin quantum must be a positive integer/);

  // Valid quantum succeeds
  const res = runRoundRobin(procs, 2);
  assert.equal(res.stats[0].CT, 5);
  assert.equal(res.stats[0].TAT, 5);
});

test('CPU-002: Workload validation rejects invalid processes', () => {
  // Empty workload
  const emptyRes = validateWorkload([]);
  assert.equal(emptyRes.ok, false);

  // Negative arrival
  const negArrRes = validateWorkload([{ id: 0, arrival: -1, burst: 4, priority: 1 }]);
  assert.equal(negArrRes.ok, false);

  // Zero burst
  const zeroBurstRes = validateWorkload([{ id: 0, arrival: 0, burst: 0, priority: 1 }]);
  assert.equal(zeroBurstRes.ok, false);

  // Negative burst
  const negBurstRes = validateWorkload([{ id: 0, arrival: 0, burst: -3, priority: 1 }]);
  assert.equal(negBurstRes.ok, false);

  // NaN burst
  const nanBurstRes = validateWorkload([{ id: 0, arrival: 0, burst: NaN, priority: 1 }]);
  assert.equal(nanBurstRes.ok, false);

  // Duplicate IDs
  const dupIdRes = validateWorkload([
    { id: 1, arrival: 0, burst: 4, priority: 1 },
    { id: 1, arrival: 2, burst: 2, priority: 2 },
  ]);
  assert.equal(dupIdRes.ok, false);

  // More than 32 processes
  const hugeList = Array.from({ length: 35 }, (_, i) => ({ id: i, arrival: i, burst: 2, priority: 1 }));
  const hugeRes = validateWorkload(hugeList);
  assert.equal(hugeRes.ok, false);
});

test('CPU-003: Preemptive schedulers (SRTF & Preemptive Priority) terminate without cutoffs', () => {
  const procs = [
    { id: 0, arrival: 0, burst: 8, priority: 3 },
    { id: 1, arrival: 1, burst: 4, priority: 1 },
    { id: 2, arrival: 2, burst: 9, priority: 4 },
    { id: 3, arrival: 3, burst: 5, priority: 2 },
  ];

  const srtfRes = runSRTF(procs);
  assert.equal(srtfRes.stats.length, 4);
  srtfRes.stats.forEach((s) => {
    assert.ok(s.CT > 0);
    assert.equal(s.TAT, s.CT - s.AT);
    assert.equal(s.WT, s.TAT - s.BT);
  });

  const ppriorRes = runPreemptivePriority(procs);
  assert.equal(ppriorRes.stats.length, 4);
  ppriorRes.stats.forEach((s) => {
    assert.ok(s.CT > 0);
    assert.equal(s.TAT, s.CT - s.AT);
    assert.equal(s.WT, s.TAT - s.BT);
  });
});

test('CPU-011: Context switch counter tracks transitions and resets on idle', () => {
  // Two adjacent processes without idle gap => exactly 1 switch
  const procsAdjacent = [
    { id: 0, arrival: 0, burst: 2, priority: 1 },
    { id: 1, arrival: 0, burst: 2, priority: 1 },
  ];
  const fcfsAdjacent = runFCFS(procsAdjacent);
  assert.equal(fcfsAdjacent.ctxSwitches, 1);

  // Two processes separated by an idle gap => 0 adjacent process-to-process switches
  const procsWithIdle = [
    { id: 0, arrival: 0, burst: 2, priority: 1 },
    { id: 1, arrival: 10, burst: 2, priority: 1 },
  ];
  const fcfsWithIdle = runFCFS(procsWithIdle);
  assert.equal(fcfsWithIdle.ctxSwitches, 0);
});

test('CPU-012: Invariant enforcement guarantees all processes reach completion', () => {
  const procs = [
    { id: 0, arrival: 0, burst: 3, priority: 2 },
    { id: 1, arrival: 5, burst: 3, priority: 1 },
  ];
  const res = simulateAll(procs, 2);
  assert.ok(res.fcfs.stats.every((s) => s.CT > 0));
  assert.ok(res.sjf.stats.every((s) => s.CT > 0));
  assert.ok(res.srtf.stats.every((s) => s.CT > 0));
  assert.ok(res.rr.stats.every((s) => s.CT > 0));
  assert.ok(res.priority.stats.every((s) => s.CT > 0));
  assert.ok(res.pprior.stats.every((s) => s.CT > 0));

  // Work conservation check: busy CPU time equals sum of burst times (3 + 3 = 6)
  const totalBursts = procs.reduce((acc, p) => acc + p.burst, 0);
  Object.values(res).forEach((algoRes) => {
    const busyTime = algoRes.gantt
      .filter((g) => g.pid !== 'idle')
      .reduce((sum, g) => sum + (g.end - g.start), 0);
    assert.equal(busyTime, totalBursts);
  });
});

test('CPU-105 / CPU-018: Stable process IDs supported across nonsequential and reordered IDs', () => {
  const nonseqProcs = [
    { id: 101, arrival: 0, burst: 6, priority: 3 },
    { id: 202, arrival: 1, burst: 3, priority: 1 },
    { id: 303, arrival: 2, burst: 4, priority: 2 },
  ];
  const res = simulateAll(nonseqProcs, 2);
  // Each stat should preserve stable id
  assert.equal(res.fcfs.stats[0].id, 101);
  assert.equal(res.fcfs.stats[1].id, 202);
  assert.equal(res.fcfs.stats[2].id, 303);

  // Anomaly detector matches with stable id
  const anomalies = detectAnomalies(nonseqProcs, res, 2, ['Alpha', 'Beta', 'Gamma']);
  assert.ok(Array.isArray(anomalies));
});

test('CPU-019: Standardized anomaly thresholds in anomaly detector', () => {
  const procs = [
    { id: 0, arrival: 0, burst: 20, priority: 5 },
    { id: 1, arrival: 1, burst: 2, priority: 1 },
    { id: 2, arrival: 2, burst: 2, priority: 1 },
    { id: 3, arrival: 3, burst: 2, priority: 1 },
  ];
  const allResults = simulateAll(procs, 2);
  const anomalies = detectAnomalies(procs, allResults, 2, ['Heavy Batch', 'Task 1', 'Task 2', 'Task 3']);

  const convoy = anomalies.find((a) => a.id === 'convoy-effect');
  assert.ok(convoy, 'Convoy effect should be detected');
  assert.equal(convoy?.severity, 'critical');
});

test('CPU-020: Starvation analyzer accounts for arrival constraints', () => {
  const procs = [
    { id: 0, arrival: 0, burst: 3, priority: 1 },
    { id: 1, arrival: 100, burst: 1, priority: 1 },
  ];
  const risks = analyzeStarvationRisks(procs);
  assert.equal(risks[0].sjfRisk, 'none');
  assert.equal(risks[0].priorityRisk, 'none');
});

test('Step trace simulator handles valid execution without infinite loops', () => {
  const procs = [
    { id: 0, arrival: 0, burst: 4, priority: 2 },
    { id: 1, arrival: 1, burst: 2, priority: 1 },
  ];
  const trace = generateStepTrace(procs, 'rr', 2);
  assert.ok(trace.length > 0);
  const last = trace[trace.length - 1];
  assert.equal(last.completed.length, 2);
});
