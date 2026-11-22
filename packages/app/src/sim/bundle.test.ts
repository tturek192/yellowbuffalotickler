import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runScenario } from '@wwi/engine';
import { loadScenario, loadTables } from '@wwi/scenario/node';
import { describe, expect, it } from 'vitest';
import { parseBundle } from './bundle';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const out = join(mkdtempSync(join(tmpdir(), 'app-bundle-')), 'vimy.json');
const r = spawnSync('npx', ['tsx', 'packages/cli/src/main.ts', 'bundle', 'scenarios/vimy-1917/scenario.yaml', '--out', out], { cwd: repoRoot, encoding: 'utf8' });
const raw = (): any => JSON.parse(readFileSync(out, 'utf8'));

describe('parseBundle', () => {
  it('a bundle round-trips: parseBundle(sim bundle output) runs to the same record as the CLI', () => {
    expect(r.status).toBe(0);
    const b = parseBundle(raw());
    const { sources: _s, ...tables } = loadTables(join(repoRoot, 'tables'));
    const { scenario, doctrines } = loadScenario(join(repoRoot, 'scenarios/vimy-1917/scenario.yaml'), join(repoRoot, 'doctrine'), tables);
    expect(JSON.stringify(b.scenario)).toBe(JSON.stringify(scenario));
    const viaBundle = JSON.stringify(runScenario(b.scenario, b.models, { seed: 1 }));
    expect(viaBundle).toBe(JSON.stringify(runScenario(scenario, { doctrines, tables }, { seed: 1 })));
  }, 60_000);

  it('rejects a bundle of another version with a clear message', () => {
    expect(() => parseBundle({ bundleVersion: 99 })).toThrow(/bundleVersion 99/);
    expect(() => parseBundle(null)).toThrow(/JSON object/);
  });

  const bad = (edit: (b: any) => void): string => {
    const b = raw();
    edit(b);
    try {
      parseBundle(b);
    } catch (e) {
      return (e as Error).message;
    }
    throw new Error('parseBundle accepted a bad bundle');
  };

  it('names the part that is wrong', () => {
    expect(bad((b) => (b.models.tables.extra = 1))).toMatch(/models\.tables/);
    expect(bad((b) => delete b.library)).toMatch(/library/);
  });

  it('checks a weapon id against the bundle tables', () => {
    const w = bad((b) => {
      const find = (o: any): any => (o && typeof o === 'object' ? (typeof o.weapon === 'string' ? o : Object.values(o).map(find).find(Boolean)) : undefined);
      find(b.scenario).weapon = 'no-such-gun';
    });
    expect(w).toMatch(/no-such-gun/);
  });

  it('checks a unit reference against the bundle doctrines', () => {
    expect(bad((b) => (b.scenario.forces[0].doctrine = 'no-such-doctrine'))).toMatch(/no-such-doctrine/);
  });

  it('validates each doctrine with DoctrineSchema, naming it', () => {
    const m = bad((b) => (b.models.doctrines['bef-1917'] = { nonsense: 1 }));
    expect(m).toMatch(/models\.doctrines\.bef-1917/);
  });

  it('validates tableSources, notes, createdFrom and the scenario', () => {
    expect(bad((b) => (b.tableSources = { x: 1 }))).toMatch(/tableSources/);
    expect(bad((b) => (b.notes = 5))).toMatch(/notes: expected a string/);
    expect(bad((b) => (b.createdFrom = null))).toMatch(/createdFrom: expected a string/);
    expect(bad((b) => (b.scenario.zeroHour = 'not a time'))).toMatch(/zeroHour/);
  });
});
