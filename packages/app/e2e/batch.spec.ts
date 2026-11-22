import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseOverlay } from '../../scenario/src/overlay';

/*
 * The engine in the browser's Web Workers (Plan 4 Task 5): the same bundle, overlay and seed give the CLI's record
 * byte for byte (Review Focus 3); a batch reports progress per run, cancels within a second and leaves the page
 * responsive; a batch's replies are extracts with a hash, never records (Review Focus 4). The pool is loaded into the
 * page from the dev server's modules (no screen starts a batch yet: the setup and compare screens come later).
 */

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

type Sim = {
  createPool(n?: number): any;
  hashRecord(text: string): string;
  bundle(name: string): Promise<unknown>;
};
type Watch = { created: number; terminated: number; replies: string[][] };
declare global {
  interface Window {
    __sim: Sim;
    __watch: Watch;
    __progress: Array<[done: number, of: number]>;
    __settled: { kind: string; at: number } | null;
    __job: { cancel(): void; promise: Promise<any> };
  }
}

/** Open the app, count the workers made and stopped and the keys of each reply they send, and load the pool's modules. */
async function openSim(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const watch: Watch = { created: 0, terminated: 0, replies: [] };
    window.__watch = watch;
    const Real = window.Worker;
    window.Worker = class extends Real {
      constructor(url: string | URL, opts?: WorkerOptions) {
        super(url, opts);
        watch.created++;
        this.addEventListener('message', (e: MessageEvent) => {
          const r = (e.data as { result?: object }).result;
          if (r) watch.replies.push(Object.keys(r).sort());
        });
      }
      terminate(): void {
        watch.terminated++;
        super.terminate();
      }
    };
  });
  await page.goto('/');
  await page.addScriptTag({
    type: 'module',
    content: `
      import { createPool } from '/src/sim/pool.ts';
      import { parseBundle } from '/src/sim/bundle.ts';
      import { hashRecord } from '/@fs${repoRoot}packages/engine/src/hash.ts';
      window.__sim = { createPool, hashRecord, bundle: async (name) => parseBundle(await (await fetch('/scenarios/' + name + '.json')).json()) };
    `,
  });
  await page.waitForFunction(() => window.__sim !== undefined);
}

// FIXME (Task 5, parked by the owner): fails today, CLI d77120cb against browser 2d7db293. Node 22 (V8 12.4) and
// Chromium (V8 15.3) differ in the last bits of Math.exp, sin, cos, log and fractional pow, and the run diverges at
// minute 688. The parked remedy: an engine-owned fmath built only from + - * / and sqrt, at ENGINE_VERSION 0.5.5.
// Until then, worker.test.ts proves in Node that handle() gives the CLI's record.
test.fixme('a browser run is byte-identical to the CLI run: Vimy seed 1 with Germans ×2, by hash', async ({ page }) => {
  test.setTimeout(180_000);
  const { cliHash } = JSON.parse(readFileSync(fileURLToPath(new URL('./out/cli-hash.json', import.meta.url)), 'utf8')) as { cliHash: string };
  const overlay = parseOverlay(readFileSync(`${repoRoot}overlays/vimy-germans-x2.yaml`, 'utf8'));
  await openSim(page);
  const got = await page.evaluate(async (o) => {
    const pool = window.__sim.createPool(1);
    const record = await pool.runOne(await window.__sim.bundle('vimy-1917'), o, 1);
    pool.terminate();
    return { hash: window.__sim.hashRecord(JSON.stringify(record)), overlayId: record.whatIf?.overlayId, seed: record.seed };
  }, overlay);
  expect(got).toEqual({ hash: cliHash, overlayId: 'vimy-germans-x2', seed: 1 });
});

test('a 20-run Vimy batch shows progress, and Cancel stops it within 1 s with the page still responding', async ({ page }) => {
  test.setTimeout(180_000);
  await openSim(page);
  await page.evaluate(async () => {
    window.__progress = [];
    window.__settled = null;
    const bundle = await window.__sim.bundle('vimy-1917');
    const seeds = Array.from({ length: 20 }, (_, i) => i + 1);
    window.__job = window.__sim.createPool().runBatch(bundle, null, seeds, (done: number, of: number) => window.__progress.push([done, of]));
    window.__job.promise.then(
      () => (window.__settled = { kind: 'finished', at: performance.now() }),
      (e: Error) => (window.__settled = { kind: e.name, at: performance.now() }),
    );
  });
  // Progress advances, run by run.
  await page.waitForFunction(() => window.__progress.some(([done]) => done >= 1), undefined, { timeout: 120_000 });
  const cancelledAt = await page.evaluate(() => {
    const at = performance.now();
    window.__job.cancel();
    return at;
  });
  await page.waitForFunction(() => window.__settled !== null, undefined, { timeout: 1000 });
  const settled = await page.evaluate(() => window.__settled!);
  expect(settled.kind).toBe('BatchCancelled');
  expect(settled.at - cancelledAt).toBeLessThan(1000);
  // Every worker was stopped, and no more progress comes.
  const watch = await page.evaluate(() => window.__watch);
  expect(watch.created).toBeGreaterThan(0);
  expect(watch.terminated).toBe(watch.created);
  const progress = await page.evaluate(() => window.__progress.length);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => window.__progress.length)).toBe(progress);
  const last = await page.evaluate(() => window.__progress.at(-1)!);
  expect(last[0]).toBeLessThan(20);
  expect(last[1]).toBe(20);
  // The page still answers a click.
  const style = page.getByRole('checkbox', { name: 'Period style' });
  const before = await style.isChecked();
  await page.getByText('Period style').click();
  await expect(style).toBeChecked({ checked: !before, timeout: 1000 });
});

test('the replies of a short batch are extracts with a hash, and no snapshots', async ({ page }) => {
  test.setTimeout(120_000);
  await openSim(page);
  const got = await page.evaluate(async () => {
    const progress: Array<[number, number]> = [];
    const pool = window.__sim.createPool(2);
    const { summary, runs } = await pool.runBatch(await window.__sim.bundle('draft'), null, [2, 1], (d: number, of: number) => progress.push([d, of])).promise;
    pool.terminate();
    return { runs: summary.runs, seeds: runs.map((r: { seed: number }) => r.seed), hashes: runs.map((r: { hash: string }) => r.hash), snapshots: runs.some((r: object) => 'snapshots' in r), progress };
  });
  expect(got.runs).toBe(2);
  expect(got.seeds).toEqual([1, 2]);
  for (const h of got.hashes) expect(h).toMatch(/^[0-9a-f]{8}$/);
  expect(got.snapshots).toBe(false);
  expect(got.progress).toEqual([
    [0, 2],
    [1, 2],
    [2, 2],
  ]);
  // What crossed from the workers: each reply an extract and its hash, never a record.
  const replies = await page.evaluate(() => window.__watch.replies);
  expect(replies).toEqual([0, 1].map(() => ['casualties', 'deadlock', 'endedAt', 'gunsCaptured', 'hash', 'keyGround', 'lineTaken', 'prisoners', 'seed', 'winner']));
});
