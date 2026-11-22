import { Worker } from 'node:worker_threads';
import { describe, expect, it } from 'vitest';
import { repoRoot } from './test-helpers';

/**
 * Vimy seed 1, timed inside a worker thread that loads the engine as plain modules (tsx), the way `sim run` and
 * `sim batch --workers` run it: the test runner's own module transform (every cross-module call through a live-binding
 * getter) would otherwise be timed along with the engine. The first run is the thread's first, so compiling the engine
 * counts (cold); the same thread then runs it three times more (warm). Each run's time is its CPU time on the thread,
 * writing its record as JSON included (`sim run` pays it too), so that other test files running beside it do not count;
 * the wall time is printed too.
 */
type Timed = { ms: number; cpuMs: number; bytes: number; endedAt: number; endReason: string };
function timedRuns(n: number): Promise<{ cold: Timed; warm: Timed[] }> {
  const script = `
    const { workerData, parentPort } = await import('node:worker_threads');
    const { loadScenario, loadTables } = await import('file://' + workerData.root + '/packages/scenario/src/load-node.ts');
    const { runScenario } = await import('file://' + workerData.root + '/packages/engine/src/run.ts');
    const { scenario, doctrines } = loadScenario(workerData.root + '/scenarios/vimy-1917/scenario.yaml', workerData.root + '/doctrine');
    const models = { doctrines, tables: loadTables(workerData.root + '/tables') };
    const runs = [];
    for (let i = 0; i < workerData.n; i++) {
      const t0 = performance.now();
      const c0 = process.threadCpuUsage();
      const r = runScenario(scenario, models, { seed: 1 });
      const json = JSON.stringify(r);
      const c1 = process.threadCpuUsage(c0);
      const ms = performance.now() - t0;
      runs.push({ ms, cpuMs: (c1.user + c1.system) / 1000, bytes: Buffer.byteLength(json), endedAt: r.summary.endedAt, endReason: r.summary.endReason });
    }
    parentPort.postMessage({ cold: runs[0], warm: runs.slice(1) });
  `;
  return new Promise((done, fail) => {
    const w = new Worker(new URL(`data:text/javascript,${encodeURIComponent(script)}`), { workerData: { root: repoRoot, n }, execArgv: ['--import', 'tsx'] });
    w.once('message', done);
    w.once('error', fail);
  });
}

/**
 * The Global Constraints' budget is 3000 ms for a run (and 5 min for 200 runs on 4 workers, cli workers.test.ts). The
 * 3000 ms target of Plan 3 is UNMET: after Task 21 (hot phases rewritten, records byte-identical) Vimy seed 1 takes about
 * 3.7–4.0 s of CPU cold here (it was about 4.6 s), and about 3.1–3.2 s warm at best (2.9–3.0 s bundled; tsx adds 0.1–0.2 s).
 * The batch budget is met. Whether to re-baseline the run budget or trim the model is the owner's choice, still pending.
 * Until then this test is a regression guard with margin over those measurements: cold ≤ 4500 ms, the best of three warm
 * runs ≤ 3500 ms, and the record (met and kept) ≤ 8 MB.
 * Plan 4 Task 0 (engine 0.4.9, provisional ruling, for the owner to see): companies report enemy lines only when they
 * see them, a correctness fix that makes the simulated battle do more work (Vimy seed 1: 687 → 1029 busy steps, most of
 * them the corps committing reserves to the stalled 4th Division Red Line on 10–11 April), not a slower step. It then
 * measured about 4.7–4.9 s cold and 4.0–4.2 s warm best, and a first re-baseline (5300 / 4400 ms) failed about one run
 * in six on noise alone, and always beside the rest of the suite (cold 5429 ms there). So the guard is made stable (Task
 * 0 follow-up ruling): it runs in its own vitest project (`engine-budget`, vitest.config.ts), whose group runs after
 * every other project has finished, so nothing runs beside it; the cold figure is the best of two fresh worker threads
 * (one noisy first run no longer fails it), the warm one the best of three runs in the first thread; and the limits are
 * cold ≤ 5600 ms, warm ≤ 4700 ms, the record still ≤ 8 MB. The 3 s target is still unmet, pending the owner's decision.
 */
const COLD_CPU_MS = 5600;
const WARM_CPU_MS = 4700;

describe('performance budget (Global Constraints; Review Focus 4)', () => {
  it('a full Vimy run stays within 5600 ms of CPU cold (best of 2 fresh threads) and 4700 ms warm (best of 3) (target 3000 ms unmet, owner to decide), its record within 8 MB', async () => {
    // One after the other, never side by side: a cold run and three warm ones in one thread, then a second cold thread.
    const first = await timedRuns(4);
    const second = await timedRuns(1);
    const warm = first.warm;
    const cold = first.cold.cpuMs <= second.cold.cpuMs ? first.cold : second.cold;
    const best = Math.min(...warm.map((r) => r.cpuMs));
    console.log(
      `Vimy seed 1: cold ${first.cold.cpuMs.toFixed(0)} / ${second.cold.cpuMs.toFixed(0)} ms (best ${cold.cpuMs.toFixed(0)}) of CPU (${cold.ms.toFixed(0)} ms wall); warm ${warm.map((r) => r.cpuMs.toFixed(0)).join(' / ')} ms (best ${best.toFixed(0)}); ${(cold.bytes / 1e6).toFixed(2)} MB, ended at ${cold.endedAt} (${cold.endReason})`,
    );
    expect(cold.cpuMs).toBeLessThanOrEqual(COLD_CPU_MS);
    expect(best).toBeLessThanOrEqual(WARM_CPU_MS);
    expect(cold.bytes).toBeLessThanOrEqual(8e6);
    // The warm runs are the same run.
    for (const r of [...warm, first.cold, second.cold]) expect([r.bytes, r.endedAt, r.endReason]).toEqual([cold.bytes, cold.endedAt, cold.endReason]);
  }, 180000);
});
