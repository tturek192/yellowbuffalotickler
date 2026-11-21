import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import { repoRoot } from './test-helpers';

/**
 * One full Vimy run, seed 1, timed inside a worker thread that loads the engine as plain modules (tsx), the way `sim run`
 * and `sim batch --workers` run it: the test runner's own module transform (every cross-module call through a live-binding
 * getter) would otherwise be timed along with the engine. The run is the thread's first, so compiling the engine counts.
 * The budget is the run's CPU time on its thread, so that other test files running beside it do not count; the wall time
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
    const c1 = process.threadCpuUsage(c0);
    const ms = performance.now() - t0;
    parentPort.postMessage({ ms, cpuMs: (c1.user + c1.system) / 1000, bytes: JSON.stringify(r).length, endedAt: r.summary.endedAt, endReason: r.summary.endReason });
  `;
  return new Promise((done, fail) => {
    const w = new Worker(new URL(`data:text/javascript,${encodeURIComponent(script)}`), { workerData: { root: repoRoot }, execArgv: ['--import', 'tsx'] });
    w.once('message', done);
    w.once('error', fail);
  });
}

describe('performance budget (Global Constraints; Review Focus 4)', () => {
  it('a full Vimy run takes ≤ 3 s and its record is ≤ 8 MB', async () => {
    const r = await timedRun();
    console.log(`Vimy seed 1: ${r.cpuMs.toFixed(0)} ms of CPU (${r.ms.toFixed(0)} ms wall), ${(r.bytes / 1e6).toFixed(2)} MB, ended at ${r.endedAt} (${r.endReason})`);
    expect(r.cpuMs).toBeLessThanOrEqual(3000);
    expect(r.bytes).toBeLessThanOrEqual(8e6);
  }, 120000);
});
