import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runBatch, runScenario } from '@wwi/engine';
import { loadScenario, loadTables } from '@wwi/scenario/node';
import { batchInWorkers, loadFiles, runInWorker } from './workers';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const files = (scenario: string) => ({ scenarioFile: resolve(repoRoot, scenario), doctrineDir: resolve(repoRoot, 'doctrine'), tablesDir: resolve(repoRoot, 'tables') });
const DRAFT = 'scenarios/vimy-1917/1cdn-3bde-draft.yaml';
const VIMY = 'scenarios/vimy-1917/scenario.yaml';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const models = (scenario: string) => {
  const { scenario: s, doctrines } = loadScenario(resolve(repoRoot, scenario), resolve(repoRoot, 'doctrine'));
  return { s, m: { doctrines, tables: loadTables(resolve(repoRoot, 'tables')) } };
};
const seeds = [1, 2, 3, 4, 5, 6, 7];
const batchWith = (workers: number) => batchInWorkers({ ...files(DRAFT), seeds, workers });

describe('batches on worker threads (Task 15)', () => {
  it('a batch gives the same summary with 1 worker and with 4, and the same as in this process', async () => {
    const one = await batchWith(1);
    expect(one).toEqual(await batchWith(4));
    const { s, m } = models(DRAFT);
    expect(one).toEqual(runBatch(s, m, seeds));
  }, 120000);

  // The batch budget (Global Constraints: 200 runs on 4 workers in 5 min; restored by Plan 3 Task 21), projected from 20 runs
  // (wall time × 10). About 30 s, so only with BUDGET_BATCH=1.
  it.runIf(process.env.BUDGET_BATCH === '1')('20 Vimy runs on 4 workers project to 200 within 5 minutes', async () => {
    const t0 = performance.now();
    const b = await batchInWorkers({ ...files(VIMY), seeds: Array.from({ length: 20 }, (_, i) => i + 1), workers: 4 });
    const projectedS = ((performance.now() - t0) / 1000) * 10;
    console.log(`20 runs × 4 workers: projected ${projectedS.toFixed(0)} s for 200`);
    expect(b.runs).toBe(20);
    expect(projectedS).toBeLessThanOrEqual(5 * 60);
  }, 300000);

  it('a run inside a worker is byte-identical to the same seed run in-process', async () => {
    const { s, m } = models(VIMY);
    expect(hash(await runInWorker({ ...files(VIMY), seed: 7 }))).toBe(hash(JSON.stringify(runScenario(s, m, { seed: 7 }))));
  }, 120000);

  it('a batch with an overlay on 2 workers gives the same summary as in-process, and a worker run carries the what-if (Plan 4 Task 1)', async () => {
    // The draft has no enemy: the overlay halves its attackers.
    const overlayFile = join(mkdtempSync(join(tmpdir(), 'sim-ov-')), 'half.yaml');
    writeFileSync(overlayFile, 'id: half\ntitle: Half the attackers\nscenarioId: vimy-1917-1cdn-3bde\nops:\n  - op: scale-men\n    side: allied\n    factor: 0.5\n');
    const f = { ...files(DRAFT), overlayFile };
    const { scenario, models: m, whatIf } = loadFiles(f);
    const s3 = [1, 2, 3];
    const inProcess = runBatch(scenario, m, s3);
    expect(await batchInWorkers({ ...f, seeds: s3, workers: 2 })).toEqual(inProcess);
    const record = await runInWorker({ ...f, seed: 2 });
    // The worker applied it: the run is not the scenario's own.
    const { s, m: m0 } = models(DRAFT);
    const { whatIf: _w, ...run } = JSON.parse(record);
    expect(run).not.toEqual(JSON.parse(JSON.stringify(runScenario(s, m0, { seed: 2 }))));
    expect(hash(record)).toBe(hash(JSON.stringify(runScenario(scenario, m, { seed: 2, whatIf: whatIf! }))));
    expect(JSON.parse(record).whatIf.overlayId).toBe('half');
  }, 120000);
});
