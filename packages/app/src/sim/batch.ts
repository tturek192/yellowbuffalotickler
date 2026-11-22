import type { Models, RunExtract, RunRecord, WhatIf } from '@wwi/engine';
import { applyOverlay, ScenarioError } from '@wwi/scenario';
import type { Overlay, Scenario } from '@wwi/scenario';
import type { Bundle } from './bundle';

/*
 * A browser batch (Plan 4 Task 5): what the app's Web Workers are asked to do and what they send back. A worker runs
 * the engine on a bundle (sim/bundle.ts), with or without a what-if overlay, and returns either one run reduced to its
 * extract and hash (a batch) or one record in full (playback, and the setup map's minute-0 record). The aggregation is
 * the engine's own (`extractRun`, `summarizeBatch`), as the CLI's workers use it.
 */

/** One run of a batch: the engine's extract (what `summarizeBatch` needs) and the hash of its record. No snapshots. */
export type RunSummary = RunExtract & { hash: string };

/** A job for a worker: the bundle, an overlay or none, and the seed; `extract` gives a RunSummary, `record` the RunRecord. */
export type Job = {
  kind: 'extract' | 'record';
  bundle: Bundle;
  overlay: Overlay | null;
  /** Run without the overlay's ops that no longer resolve (otherwise they stop the job, as the CLI's exit 2). */
  dropUnresolved?: boolean;
  seed: number;
  endMinute?: number;
};

/** A batch stopped by its `cancel()`: its promise rejects with this. */
export class BatchCancelled extends Error {
  constructor() {
    super('the batch was cancelled');
    this.name = 'BatchCancelled';
  }
}

/** What a worker is sent: the bundle and overlay it runs on (once, until they change), then one job at a time. */
export type ToWorker =
  | { type: 'load'; bundle: Bundle; overlay: Overlay | null; dropUnresolved: boolean }
  | { type: 'job'; id: number; kind: Job['kind']; seed: number; endMinute?: number };

/** A worker's reply to a job: its result, or the error (a ScenarioError's problems kept, so the page can list them). */
export type FromWorker = { id: number; ok: true; result: RunSummary | RunRecord } | { id: number; ok: false; error: string; problems?: string[] };

/**
 * The scenario a job runs: the bundle's, with the overlay applied as the CLI applies it (cli workers.ts `loadFiles`):
 * every doctrine and the library from the bundle, and the ops that no longer resolve stopping it (ScenarioError, each
 * listed) unless `dropUnresolved`. `whatIf` is for `runScenario`'s options, so the record lists the changes.
 */
export function prepare(bundle: Bundle, overlay: Overlay | null, dropUnresolved = false): { scenario: Scenario; models: Models; whatIf?: WhatIf } {
  if (overlay === null) return { scenario: bundle.scenario, models: bundle.models };
  const r = applyOverlay(bundle.scenario, overlay, bundle.library, Object.keys(bundle.models.doctrines));
  if (r.unresolved.length && !dropUnresolved) {
    throw new ScenarioError([
      `overlay "${overlay.id}": ${r.unresolved.length} op(s) no longer resolve against ${bundle.scenario.id} (drop them to run without):`,
      ...r.unresolved.map((u) => `ops[${u.index}] (${u.op.op}): ${u.reason}`),
    ]);
  }
  return { scenario: r.scenario, models: bundle.models, whatIf: { overlayId: overlay.id, title: overlay.title, changes: r.changes } };
}
