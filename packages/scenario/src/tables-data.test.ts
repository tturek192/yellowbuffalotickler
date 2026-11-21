import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { describe, expect, it } from 'vitest';
import { loadDoctrine as loadDoctrineAt, loadScenario, loadTables as loadTablesAt } from './load-node';
import type { Param, Tables } from './tables';
import { minimalTables } from './test-fixtures';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
/** The brief's calls name repo-relative paths; resolve them so the tests run from any directory. */
const loadTables = (dir: string) => loadTablesAt(resolve(repoRoot, dir));
const loadDoctrine = (file: string) => loadDoctrineAt(resolve(repoRoot, file));
const vimy = () => loadScenario(resolve(repoRoot, 'scenarios/vimy-1917/scenario.yaml'), resolve(repoRoot, 'doctrine')).scenario;

/** Every Param in the tables (not the sources registry). */
function allParams(t: Tables): Param[] {
  const isParam = (x: unknown): x is Param => !!x && typeof x === 'object' && 'value' in x && 'description' in x;
  const out: Param[] = [];
  const walk = (node: unknown) => {
    if (isParam(node)) out.push(node);
    else if (node && typeof node === 'object') for (const v of Object.values(node)) walk(v);
  };
  walk([t.weapons, t.cover, t.channels, t.effects]);
  return out;
}

/** The weapon ids the plan's later tasks and the Vimy artillery reference. */
const PLAN_WEAPONS = [
  'rifle', 'lewis', 'vickers', 'mg08', '18pdr', '4.5in-how', '60pdr', '6in-how', '8in-how', '9.2in-how', 'stokes-3in',
  '2in-mortar', '9.45in-mortar', '77mm-fk', '105mm-lfh', '150mm-sfh', '210mm-mrs', 'minenwerfer-light', 'minenwerfer-medium',
];

describe('researched tables and doctrine (Plan 3 Task 2)', () => {
  it('every weapon the Vimy artillery names is in the tables', () => {
    const t = loadTables('tables');
    for (const a of vimy().artillery) expect(Object.keys(t.weapons)).toContain(a.weapon);
  });
  it('no placeholder remains in tables or doctrine', () => {
    expect(JSON.stringify([loadTables('tables'), loadDoctrine('doctrine/bef-1917.yaml'), loadDoctrine('doctrine/de-1917.yaml')])).not.toMatch(/placeholder until Task 2/);
  });
  it('every calibrated parameter is an estimate and every fact is sourced (no calibrated sourced values)', () => {
    for (const p of allParams(loadTables('tables'))) if (p.calibrated) expect('estimate' in p).toBe(true);
  });

  // Guards beside the brief's three tests.
  it('has every weapon id the plan names', () => {
    expect(Object.keys(loadTables('tables').weapons)).toEqual(expect.arrayContaining(PLAN_WEAPONS));
  });
  it('no weapon fact (rate of fire, range, shell weight) is marked calibrated', () => {
    for (const [id, w] of Object.entries(loadTables('tables').weapons)) {
      for (const k of ['rpm', 'maxRangeM', 'shellKg'] as const) expect(w[k]?.calibrated, `${id}.${k}`).toBeUndefined();
    }
  });
  it('every weapon coefficient (lethality, rangeScaleM, suppressPerRound) is a calibrated estimate', () => {
    for (const [id, w] of Object.entries(loadTables('tables').weapons)) {
      for (const k of ['lethality', 'rangeScaleM', 'suppressPerRound'] as const) expect(w[k].calibrated, `${id}.${k}`).toBe(true);
    }
  });
  it('the Vimy draft, the Plan 1 draft and both doctrines still load against the new values', () => {
    expect(vimy().artillery.length).toBeGreaterThan(0);
    expect(() => loadScenario(resolve(repoRoot, 'scenarios/vimy-1917/1cdn-3bde-draft.yaml'), resolve(repoRoot, 'doctrine'))).not.toThrow();
  });
});

describe('loadTables returns the sources registry', () => {
  it('returns every registered source with its tier', () => {
    const t = loadTables('tables');
    expect(t.sources['nicholson-1962']?.tier).toBe('official');
    for (const id of Object.keys(t.sources)) expect(t.sources[id]!.title.length).toBeGreaterThan(0);
  });
  it('does not count an inherited property name such as "constructor" as a registered source', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tables-proto-'));
    const t = structuredClone(minimalTables()) as Record<string, any>;
    t.weapons['18pdr'].rpm = { value: 2, source: 'constructor', description: 'd' };
    writeFileSync(join(dir, 'a.yaml'), stringify({ ...t, sources: {} }));
    expect(() => loadTablesAt(dir)).toThrow(/unknown source "constructor"/);
  });
});
