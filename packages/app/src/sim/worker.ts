import { extractRun, hashRecord, runScenario } from '@wwi/engine';
import type { RunRecord } from '@wwi/engine';
import { ScenarioError } from '@wwi/scenario';
import type { Overlay } from '@wwi/scenario';
import { prepare } from './batch';
import type { FromWorker, Job, RunSummary, ToWorker } from './batch';
import type { Bundle } from './bundle';

/*
 * The engine in a Web Worker (Plan 4 Task 5, base design §2). `handle` is pure (tested in Node); the message handler
 * below keeps the bundle and overlay it was last sent and runs one job at a time on them. Full records cross back only
 * for a `record` job (the pool's `runOne`); a batch's runs come back as extracts with their hash.
 */

let last: { bundle: Bundle; overlay: Overlay | null; dropUnresolved: boolean; prepared: ReturnType<typeof prepare> } | null = null;

/** The overlaid scenario for this bundle and overlay, applied once for as long as they are the same objects. */
function prepared(job: Job): ReturnType<typeof prepare> {
  const drop = job.dropUnresolved ?? false;
  if (last && last.bundle === job.bundle && last.overlay === job.overlay && last.dropUnresolved === drop) return last.prepared;
  last = { bundle: job.bundle, overlay: job.overlay, dropUnresolved: drop, prepared: prepare(job.bundle, job.overlay, drop) };
  return last.prepared;
}

/** Run one job: the overlay applied, `whatIf` passed through, and the record or its extract with the record's hash. */
export function handle(job: Job): RunSummary | RunRecord {
  const { scenario, models, whatIf } = prepared(job);
  const r = runScenario(scenario, models, { seed: job.seed, ...(job.endMinute !== undefined ? { endMinute: job.endMinute } : {}), ...(whatIf ? { whatIf } : {}) });
  return job.kind === 'record' ? r : { ...extractRun(scenario, r), hash: hashRecord(JSON.stringify(r)) };
}

type Scope = { onmessage: ((e: MessageEvent<ToWorker>) => void) | null; postMessage(m: FromWorker): void };
declare const WorkerGlobalScope: unknown;

// In a worker (not in Node's tests, nor if the page imports this module): take the bundle, then the jobs.
if (typeof WorkerGlobalScope !== 'undefined') {
  const scope = self as unknown as Scope;
  let loaded: Extract<ToWorker, { type: 'load' }> | null = null;
  scope.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'load') {
      loaded = m;
      return;
    }
    try {
      if (!loaded) throw new Error('a job came before its bundle');
      const job: Job = { kind: m.kind, bundle: loaded.bundle, overlay: loaded.overlay, dropUnresolved: loaded.dropUnresolved, seed: m.seed, ...(m.endMinute !== undefined ? { endMinute: m.endMinute } : {}) };
      scope.postMessage({ id: m.id, ok: true, result: handle(job) });
    } catch (err) {
      scope.postMessage({ id: m.id, ok: false, error: err instanceof Error ? err.message : String(err), ...(err instanceof ScenarioError ? { problems: err.problems } : {}) });
    }
  };
}
