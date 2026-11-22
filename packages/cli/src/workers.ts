import { isMainThread, parentPort, Worker, workerData } from 'node:worker_threads';
import { readdirSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { extractRun, runScenario, summarizeBatch } from '@wwi/engine';
import type { BatchSummary, Models, RunExtract, WhatIf } from '@wwi/engine';
import { applyOverlay, emptyLibrary, ScenarioError } from '@wwi/scenario';
import type { Doctrine, Scenario, Unresolved } from '@wwi/scenario';
import { loadDoctrine, loadLibrary, loadOverlay, loadScenario, loadTables } from '@wwi/scenario/node';

/*
 * Batches on worker threads (Task 15): the seeds are shared out among N workers, each loading the scenario itself and
 * running `runScenario` for its seeds; each run comes back reduced to its extract (engine batch.ts `extractRun`), and the
 * extracts are summarised in seed order, so the summary is the same for any N. A run is the same in a worker as in
 * this process: the engine reads nothing but its scenario, doctrines, tables and seed.
 */

/**
 * `overlayFile`: a what-if overlay applied as the scenario loads; `dropUnresolved`: run without its ops that no longer
 * resolve; `libraryDir`: the leader, formation and weather-preset library the overlay may draw on (absent: an empty one).
 */
export type Files = { scenarioFile: string; doctrineDir: string; tablesDir: string; overlayFile?: string; dropUnresolved?: boolean; libraryDir?: string };

type Job = Files & ({ kind: 'extracts'; seeds: number[] } | { kind: 'record'; seed: number });
/** A failure carries a ScenarioError's problems, so the parent throws the same error (exit 2, every problem listed). */
type Reply = { ok: true; extracts?: RunExtract[]; record?: string } | { ok: false; error: string; problems?: string[] };

/**
 * Load the tables, the scenario and its doctrines; with an overlay, every doctrine in the doctrine directory too (a
 * `doctrine` op may name any of them), and the overlay applied (scenario overlay.ts `applyOverlay`, with the library
 * read from `libraryDir`, or an empty one). Ops that no longer resolve stop the run (ScenarioError, listing each)
 * unless `dropUnresolved`; then they are left out and returned as `dropped`. `whatIf` is for `runScenario`'s options.
 */
export function loadFiles(f: Files): { scenario: Scenario; models: Models; whatIf?: WhatIf; dropped: Unresolved[] } {
  const tables = loadTables(f.tablesDir);
  const { scenario, doctrines } = loadScenario(f.scenarioFile, f.doctrineDir, tables);
  if (f.overlayFile === undefined) return { scenario, models: { doctrines, tables }, dropped: [] };
  const overlay = loadOverlay(f.overlayFile);
  const all: Record<string, Doctrine> = {};
  for (const file of readdirSync(f.doctrineDir).filter((x) => x.endsWith('.yaml')).sort()) all[basename(file, '.yaml')] = loadDoctrine(join(f.doctrineDir, file));
  const library = f.libraryDir === undefined ? emptyLibrary() : loadLibrary(f.libraryDir);
  const r = applyOverlay(scenario, overlay, library, Object.keys(all));
  if (r.unresolved.length && !f.dropUnresolved) {
    throw new ScenarioError([
      `${f.overlayFile}: ${r.unresolved.length} op(s) no longer resolve against ${scenario.id} (run with --drop-unresolved to leave them out):`,
      ...r.unresolved.map((u) => `ops[${u.index}] (${u.op.op}): ${u.reason}`),
    ]);
  }
  return {
    scenario: r.scenario,
    models: { doctrines: { ...all, ...doctrines }, tables },
    whatIf: { overlayId: overlay.id, title: overlay.title, changes: r.changes },
    dropped: r.unresolved,
  };
}

/** Run one job on a new worker thread (this same module, under the TypeScript loader the tests and the CLI use). */
function onWorker(job: Job): Promise<Reply & { ok: true }> {
  return new Promise((done, fail) => {
    const w = new Worker(new URL(import.meta.url), { workerData: job, execArgv: ['--import', 'tsx'] });
    w.once('message', (r: Reply) => (r.ok ? done(r) : fail(r.problems ? new ScenarioError(r.problems) : new Error(r.error))));
    w.once('error', fail);
    w.once('exit', (code) => {
      if (code !== 0) fail(new Error(`a batch worker stopped with exit code ${code}`));
    });
  });
}

/** The seeds shared out among `n` workers in turn (seed i to worker i mod n). */
export const shareOut = (seeds: readonly number[], n: number): number[][] =>
  Array.from({ length: Math.max(1, Math.min(n, seeds.length)) }, (_, k) => seeds.filter((_, i) => i % Math.max(1, Math.min(n, seeds.length)) === k));

/** The files a job carries, as absolute paths: the scenario's, and the overlay's and the library's when there is one (each worker applies it as it loads). */
const filesOf = (o: Files): Files => ({
  scenarioFile: resolve(o.scenarioFile),
  doctrineDir: resolve(o.doctrineDir),
  tablesDir: resolve(o.tablesDir),
  ...(o.overlayFile !== undefined ? { overlayFile: resolve(o.overlayFile) } : {}),
  ...(o.dropUnresolved ? { dropUnresolved: true } : {}),
  ...(o.libraryDir !== undefined ? { libraryDir: resolve(o.libraryDir) } : {}),
});

/** A batch of these seeds on `workers` worker threads, summarised in seed order. */
export async function batchInWorkers(o: Files & { seeds: number[]; workers: number }): Promise<BatchSummary> {
  const parts = await Promise.all(shareOut(o.seeds, o.workers).map((seeds) => onWorker({ kind: 'extracts', ...filesOf(o), seeds })));
  return summarizeBatch(loadFiles(o).scenario, parts.flatMap((p) => p.extracts ?? []));
}

/** One run on a worker thread: its record as JSON, exactly as `sim run` writes it. */
export async function runInWorker(o: Files & { seed: number }): Promise<string> {
  const r = await onWorker({ kind: 'record', ...filesOf(o), seed: o.seed });
  return r.record!;
}

// On a worker thread: do the job and send back what it asks for.
if (!isMainThread && parentPort && (workerData as Job | undefined)?.kind) {
  const job = workerData as Job;
  try {
    const { scenario, models, whatIf } = loadFiles(job);
    const reply: Reply =
      job.kind === 'record'
        ? { ok: true, record: JSON.stringify(runScenario(scenario, models, { seed: job.seed, ...(whatIf ? { whatIf } : {}) })) }
        : { ok: true, extracts: job.seeds.map((seed) => extractRun(scenario, runScenario(scenario, models, { seed }))) };
    parentPort.postMessage(reply);
  } catch (e) {
    parentPort.postMessage({ ok: false, error: e instanceof Error ? e.message : String(e), ...(e instanceof ScenarioError ? { problems: e.problems } : {}) } satisfies Reply);
  }
}
