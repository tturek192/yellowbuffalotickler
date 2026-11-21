import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { extractRun, runScenario, summarizeBatch } from '@wwi/engine';
import type { BatchSummary, RunExtract } from '@wwi/engine';
import { loadScenario, loadTables } from '@wwi/scenario/node';

/*
 * Batches on worker threads (Task 15): the seeds are shared out among N workers, each loading the scenario itself and
 * running `runScenario` for its seeds; each run comes back reduced to its extract (engine batch.ts `extractRun`), and the
 * extracts are summarised in seed order, so the summary is the same for any N. A run is the same in a worker as in
 * this process: the engine reads nothing but its scenario, doctrines, tables and seed.
 */

export type Files = { scenarioFile: string; doctrineDir: string; tablesDir: string };

type Job = Files & ({ kind: 'extracts'; seeds: number[] } | { kind: 'record'; seed: number });
type Reply = { ok: true; extracts?: RunExtract[]; record?: string } | { ok: false; error: string };

function load(f: Files) {
  const { scenario, doctrines } = loadScenario(f.scenarioFile, f.doctrineDir);
  return { scenario, models: { doctrines, tables: loadTables(f.tablesDir) } };
}

/** Run one job on a new worker thread (this same module, under the TypeScript loader the tests and the CLI use). */
function onWorker(job: Job): Promise<Reply & { ok: true }> {
  return new Promise((done, fail) => {
    const w = new Worker(new URL(import.meta.url), { workerData: job, execArgv: ['--import', 'tsx'] });
    w.once('message', (r: Reply) => (r.ok ? done(r) : fail(new Error(r.error))));
    w.once('error', fail);
    w.once('exit', (code) => {
      if (code !== 0) fail(new Error(`a batch worker stopped with exit code ${code}`));
    });
  });
}

/** The seeds shared out among `n` workers in turn (seed i to worker i mod n). */
export const shareOut = (seeds: readonly number[], n: number): number[][] =>
  Array.from({ length: Math.max(1, Math.min(n, seeds.length)) }, (_, k) => seeds.filter((_, i) => i % Math.max(1, Math.min(n, seeds.length)) === k));

/** A batch of these seeds on `workers` worker threads, summarised in seed order. */
export async function batchInWorkers(o: Files & { seeds: number[]; workers: number }): Promise<BatchSummary> {
  const { scenarioFile, doctrineDir, tablesDir } = o;
  const parts = await Promise.all(shareOut(o.seeds, o.workers).map((seeds) => onWorker({ kind: 'extracts', scenarioFile, doctrineDir, tablesDir, seeds })));
  return summarizeBatch(load(o).scenario, parts.flatMap((p) => p.extracts ?? []));
}

/** One run on a worker thread: its record as JSON, exactly as `sim run` writes it. */
export async function runInWorker(o: Files & { seed: number }): Promise<string> {
  const r = await onWorker({ kind: 'record', scenarioFile: o.scenarioFile, doctrineDir: o.doctrineDir, tablesDir: o.tablesDir, seed: o.seed });
  return r.record!;
}

// On a worker thread: do the job and send back what it asks for.
if (!isMainThread && parentPort && (workerData as Job | undefined)?.kind) {
  const job = workerData as Job;
  try {
    const { scenario, models } = load(job);
    const reply: Reply =
      job.kind === 'record'
        ? { ok: true, record: JSON.stringify(runScenario(scenario, models, { seed: job.seed })) }
        : { ok: true, extracts: job.seeds.map((seed) => extractRun(scenario, runScenario(scenario, models, { seed }))) };
    parentPort.postMessage(reply);
  } catch (e) {
    parentPort.postMessage({ ok: false, error: e instanceof Error ? e.message : String(e) } satisfies Reply);
  }
}
