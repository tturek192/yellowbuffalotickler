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

  it('names the part that is wrong', () => {
    const bad = raw();
    bad.models.tables.extra = 1;
    expect(() => parseBundle(bad)).toThrow(/models\.tables/);
    const noLib = raw();
    delete noLib.library;
    expect(() => parseBundle(noLib)).toThrow(/library/);
    const badRef = raw();
    badRef.models.doctrines = {};
    expect(() => parseBundle(badRef)).toThrow(/doctrine/i);
  });
});
