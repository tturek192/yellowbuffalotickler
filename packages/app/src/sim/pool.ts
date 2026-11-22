import { summarizeBatch } from '@wwi/engine';
import type { BatchSummary, RunRecord } from '@wwi/engine';
import type { Overlay } from '@wwi/scenario';
import { ScenarioError } from '@wwi/scenario';
import { BatchCancelled, prepare } from './batch';
import type { FromWorker, Job, RunSummary, ToWorker } from './batch';
import type { Bundle } from './bundle';

/*
 * A pool of Web Workers running the engine (Plan 4 Task 5). A batch shares its seeds out among the workers one run at a
 * time, reports progress per run, and summarises the runs with the engine's `summarizeBatch` on the overlaid scenario,
 * in seed order, so the summary is the CLI's for the same seeds. Only `runOne` brings a full record back.
 */

export type BatchRun = { promise: Promise<{ summary: BatchSummary; runs: RunSummary[] }>; cancel(): void };

export interface Pool {
  /** Run these seeds; `onProgress(done, of)` after each run. `cancel()` stops the workers and rejects with BatchCancelled. */
  runBatch(bundle: Bundle, overlay: Overlay | null, seeds: number[], onProgress: (done: number, of: number) => void, opts?: { dropUnresolved?: boolean }): BatchRun;
  /** Re-run one seed in full (playback; `endMinute: 0` for the setup map's minute-0 record). */
  runOne(bundle: Bundle, overlay: Overlay | null, seed: number, opts?: { endMinute?: number; dropUnresolved?: boolean }): Promise<RunRecord>;
  /** Stop every worker; anything still running or queued rejects with BatchCancelled. */
  terminate(): void;
}

/** What a worker runs on: the bundle and overlay, sent once to each worker that runs a job of theirs. */
type Context = { bundle: Bundle; overlay: Overlay | null; dropUnresolved: boolean };
type Task = { ctx: Context; kind: Job['kind']; seed: number; endMinute?: number; owner: object; done(r: RunSummary | RunRecord): void; fail(e: Error): void };
/** A worker, the context it was last sent, and the job it is running (with its id, so a reply is matched to it). */
type Slot = { worker: Worker | null; loaded: Context | null; task: Task | null; jobId: number };

/** The default size: one worker per core but one, at most 4 (and at least 1). */
export const defaultWorkers = (): number => Math.max(1, Math.min(4, (globalThis.navigator?.hardwareConcurrency ?? 2) - 1));

export function createPool(n: number = defaultWorkers()): Pool {
  const slots: Slot[] = Array.from({ length: Math.max(1, Math.floor(n)) }, () => ({ worker: null, loaded: null, task: null, jobId: 0 }));
  const queue: Task[] = [];
  const contexts: Context[] = [];
  let nextId = 1;

  /** The same context object for the same bundle and overlay, so a worker is sent them once. */
  const contextOf = (bundle: Bundle, overlay: Overlay | null, dropUnresolved: boolean): Context => {
    let c = contexts.find((x) => x.bundle === bundle && x.overlay === overlay && x.dropUnresolved === dropUnresolved);
    if (!c) {
      c = { bundle, overlay, dropUnresolved };
      contexts.push(c);
      if (contexts.length > 4) contexts.shift();
    }
    return c;
  };

  const stop = (slot: Slot): void => {
    slot.worker?.terminate();
    slot.worker = null;
    slot.loaded = null;
    slot.task = null;
  };

  const spawn = (slot: Slot): Worker => {
    const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      const t = slot.task;
      if (!t || m.id !== slot.jobId) return;
      slot.task = null;
      if (m.ok) t.done(m.result);
      else t.fail(m.problems ? new ScenarioError(m.problems) : new Error(m.error));
      pump();
    };
    w.onerror = (e: ErrorEvent) => {
      e.preventDefault();
      const t = slot.task;
      stop(slot);
      if (t) t.fail(new Error(`a batch worker failed: ${e.message || 'unknown error'}`));
      pump();
    };
    return w;
  };

  const pump = (): void => {
    for (const slot of slots) {
      if (slot.task || queue.length === 0) continue;
      const t = queue.shift()!;
      const w = slot.worker ?? (slot.worker = spawn(slot));
      if (slot.loaded !== t.ctx) {
        w.postMessage({ type: 'load', bundle: t.ctx.bundle, overlay: t.ctx.overlay, dropUnresolved: t.ctx.dropUnresolved } satisfies ToWorker);
        slot.loaded = t.ctx;
      }
      slot.jobId = nextId++;
      slot.task = t;
      w.postMessage({ type: 'job', id: slot.jobId, kind: t.kind, seed: t.seed, ...(t.endMinute !== undefined ? { endMinute: t.endMinute } : {}) } satisfies ToWorker);
    }
  };

  /** Drop the owner's queued tasks and stop the workers running its others (they are started afresh when next needed). */
  const cancelOwner = (owner: object): void => {
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i]!.owner === owner) queue.splice(i, 1);
    for (const slot of slots) if (slot.task?.owner === owner) stop(slot);
    pump();
  };

  const submit = (t: Omit<Task, 'done' | 'fail'>): Promise<RunSummary | RunRecord> =>
    new Promise((done, fail) => {
      queue.push({ ...t, done, fail });
      pump();
    });

  return {
    runBatch(bundle, overlay, seeds, onProgress, opts = {}) {
      const owner = {};
      let cancelled = false;
      let reject: (e: Error) => void = () => {};
      const promise = new Promise<{ summary: BatchSummary; runs: RunSummary[] }>((resolve, rej) => {
        reject = rej;
        // The overlay is applied here first, so a bad one fails before any run starts.
        const { scenario } = prepare(bundle, overlay, opts.dropUnresolved ?? false);
        const ctx = contextOf(bundle, overlay, opts.dropUnresolved ?? false);
        const runs: RunSummary[] = [];
        onProgress(0, seeds.length);
        if (seeds.length === 0) {
          resolve({ summary: summarizeBatch(scenario, []), runs });
          return;
        }
        for (const seed of seeds) {
          submit({ ctx, kind: 'extract', seed, owner }).then(
            (r) => {
              if (cancelled) return;
              runs.push(r as RunSummary);
              onProgress(runs.length, seeds.length);
              if (runs.length === seeds.length) {
                runs.sort((a, b) => a.seed - b.seed);
                resolve({ summary: summarizeBatch(scenario, runs), runs });
              }
            },
            (e: Error) => {
              if (cancelled) return;
              cancelled = true;
              cancelOwner(owner);
              rej(e);
            },
          );
        }
      });
      return {
        promise,
        cancel() {
          if (cancelled) return;
          cancelled = true;
          cancelOwner(owner);
          reject(new BatchCancelled());
        },
      };
    },

    runOne(bundle, overlay, seed, opts = {}) {
      const drop = opts.dropUnresolved ?? false;
      return new Promise<RunRecord>((resolve, reject) => {
        prepare(bundle, overlay, drop);
        submit({ ctx: contextOf(bundle, overlay, drop), kind: 'record', seed, owner: {}, ...(opts.endMinute !== undefined ? { endMinute: opts.endMinute } : {}) }).then((r) => resolve(r as RunRecord), reject);
      });
    },

    terminate() {
      const pending = [...queue, ...slots.flatMap((s) => (s.task ? [s.task] : []))];
      queue.length = 0;
      for (const slot of slots) stop(slot);
      for (const t of pending) t.fail(new BatchCancelled());
    },
  };
}
