import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hashRecord, runBatch, runScenario, summarizeBatch } from '@wwi/engine';
import type { Models, WhatIf } from '@wwi/engine';
import { applyOverlay } from '@wwi/scenario';
import type { Doctrine, Overlay, Scenario } from '@wwi/scenario';
import { loadDoctrine, loadLibrary, loadOverlay, loadScenario, loadTables } from '@wwi/scenario/node';
import { describe, expect, it } from 'vitest';
import type { RunSummary } from './batch';
import { parseBundle } from './bundle';
import { handle } from './worker';

/*
 * The worker's job handler, in Node (Vitest has no Web Worker here): the same bundle, overlay and seed give the record
 * the engine gives for the scenario loaded from its files, and its extracts summarise to the CLI's batch.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const at = (p: string): string => join(repoRoot, p);
const bundleFile = join(mkdtempSync(join(tmpdir(), 'app-worker-')), 'vimy.json');
const built = spawnSync('npx', ['tsx', 'packages/cli/src/main.ts', 'bundle', 'scenarios/vimy-1917/scenario.yaml', '--out', bundleFile], { cwd: repoRoot, encoding: 'utf8' });

const vimyBundle = () => parseBundle(JSON.parse(readFileSync(bundleFile, 'utf8')));
const tables = () => {
  const { sources: _s, ...t } = loadTables(at('tables'));
  return t;
};
const loaded = () => loadScenario(at('scenarios/vimy-1917/scenario.yaml'), at('doctrine'), tables());
const vimy = (): Scenario => loaded().scenario;
const vimyDoctrines = (): Models => ({ doctrines: loaded().doctrines, tables: tables() });
const germansX2 = (): Overlay => loadOverlay(at('overlays/vimy-germans-x2.yaml'));
/** Every doctrine in the repository, as the CLI loads them for an overlay (cli workers.ts `loadFiles`). */
const allDoctrines = (): Record<string, Doctrine> =>
  Object.fromEntries(readdirSync(at('doctrine')).filter((f) => f.endsWith('.yaml')).sort().map((f) => [basename(f, '.yaml'), loadDoctrine(at(`doctrine/${f}`))]));
const applied = (s: Scenario, o: Overlay) => applyOverlay(s, o, loadLibrary(at('library')), Object.keys(allDoctrines()));
const overlaid = (s: Scenario, o: Overlay): Scenario => applied(s, o).scenario;
const whatIfOf = (o: Overlay): WhatIf => ({ overlayId: o.id, title: o.title, changes: applied(vimy(), o).changes });

describe('the worker job handler', () => {
  it('the CLI wrote the bundle', () => {
    expect(built.status, built.stderr).toBe(0);
  });

  it('handle gives the same hash as runScenario for the same bundle, overlay and seed', () => {
    const r = handle({ kind: 'extract', bundle: vimyBundle(), overlay: germansX2(), seed: 1 }) as RunSummary;
    const models: Models = { doctrines: allDoctrines(), tables: tables() };
    expect(r.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(r.hash).toBe(hashRecord(JSON.stringify(runScenario(overlaid(vimy(), germansX2()), models, { seed: 1, whatIf: whatIfOf(germansX2()) }))));
  }, 120_000);

  it('a record job gives the record itself, with the overlay written into it', () => {
    const r = handle({ kind: 'record', bundle: vimyBundle(), overlay: germansX2(), seed: 1, endMinute: 0 });
    expect('snapshots' in r).toBe(true);
    expect((r as { whatIf?: WhatIf }).whatIf).toMatchObject({ overlayId: 'vimy-germans-x2', title: 'Germans ×2' });
  }, 60_000);

  it('summaries from handle aggregate to the same BatchSummary as runBatch', () => {
    const b = vimyBundle();
    const runs = [1, 2, 3].map((seed) => handle({ kind: 'extract', bundle: b, overlay: null, seed }) as RunSummary);
    expect(summarizeBatch(vimy(), runs)).toEqual(runBatch(vimy(), vimyDoctrines(), [1, 2, 3]));
  }, 180_000);

  it('an extract carries no snapshots key, and a hash', () => {
    const r = handle({ kind: 'extract', bundle: vimyBundle(), overlay: null, seed: 2, endMinute: 60 });
    expect(Object.keys(r).sort()).toEqual(['casualties', 'deadlock', 'endedAt', 'gunsCaptured', 'hash', 'keyGround', 'lineTaken', 'prisoners', 'seed', 'winner']);
    expect('snapshots' in r).toBe(false);
  }, 60_000);

  it('an op that no longer resolves stops the job, unless it is dropped', () => {
    const stale: Overlay = { ...germansX2(), ops: [...germansX2().ops, { op: 'remove-formation', formationId: 'no-such-formation' }] };
    expect(() => handle({ kind: 'record', bundle: vimyBundle(), overlay: stale, seed: 1, endMinute: 0 })).toThrow(/ops\[1\].*no longer resolve|no-such-formation/s);
    const r = handle({ kind: 'record', bundle: vimyBundle(), overlay: stale, seed: 1, endMinute: 0, dropUnresolved: true });
    expect((r as { whatIf?: WhatIf }).whatIf?.overlayId).toBe('vimy-germans-x2');
  }, 60_000);
});
