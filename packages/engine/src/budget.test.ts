import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import { repoRoot } from './test-helpers';

/**
 * One full Vimy run, seed 1, timed inside a worker thread that loads the engine as plain modules (tsx), the way `sim run`
 * and `sim batch --workers` run it: the test runner's own module transform (every cross-module call through a live-binding
 * getter) would otherwise be timed along with the engine. The run is the thread's first, so compiling the engine counts.
 * The budget is the run's CPU time on its thread, writing its record as JSON included (`sim run` pays it too), so that other test files running beside it do not count; the wall time
 * is printed too (on an idle machine the two agree to within the garbage collector's helper threads).
 */
function timedRun(): Promise<{ ms: number; cpuMs: number; bytes: number; endedAt: number; endReason: string }> {
  const script = `
    const { workerData, parentPort } = await import('node:worker_threads');
    const { loadScenario, loadTables } = await import('file://' + workerData.root + '/packages/scenario/src/load-node.ts');
    const { runScenario } = await import('file://' + workerData.root + '/packages/engine/src/run.ts');
    const { scenario, doctrines } = loadScenario(workerData.root + '/scenarios/vimy-1917/scenario.yaml', workerData.root + '/doctrine');
    const models = { doctrines, tables: loadTables(workerData.root + '/tables') };
    const t0 = performance.now();
    const c0 = process.threadCpuUsage();
    const r = runScenario(scenario, models, { seed: 1 });
    const json = JSON.stringify(r);
    const c1 = process.threadCpuUsage(c0);
    const ms = performance.now() - t0;
    parentPort.postMessage({ ms, cpuMs: (c1.user + c1.system) / 1000, bytes: Buffer.byteLength(json), endedAt: r.summary.endedAt, endReason: r.summary.endReason });
  `;
  return new Promise((done, fail) => {
    const w = new Worker(new URL(`data:text/javascript,${encodeURIComponent(script)}`), { workerData: { root: repoRoot }, execArgv: ['--import', 'tsx'] });
    w.once('message', done);
    w.once('error', fail);
  });
}

/**
 * The Global Constraints' budget is 3000 ms for a run (and 5 min for 200 runs on 4 workers). Reaching it is Plan 3 Task 21
 * (data-oriented hot phases, records byte-identical); until then this test guards against regression at the interim
 * ceiling the controller set in Task 15 fix round 3: 6000 ms of CPU, the record's JSON included. The record budget, 8 MB,
 * is met and kept.
 */
const INTERIM_CPU_MS = 6000;

describe('performance budget (Global Constraints; Review Focus 4)', () => {
  it('a full Vimy run stays within the interim 6000 ms of CPU (target 3000 ms, Plan 3 Task 21) and its record within 8 MB', async () => {
    const r = await timedRun();
    console.log(`Vimy seed 1: ${r.cpuMs.toFixed(0)} ms of CPU (${r.ms.toFixed(0)} ms wall), ${(r.bytes / 1e6).toFixed(2)} MB, ended at ${r.endedAt} (${r.endReason})`);
    expect(r.cpuMs).toBeLessThanOrEqual(INTERIM_CPU_MS);
    expect(r.bytes).toBeLessThanOrEqual(8e6);
  }, 120000);
});
