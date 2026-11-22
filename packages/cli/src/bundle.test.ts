import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const tmp = mkdtempSync(join(tmpdir(), 'sim-bundle-'));

function runCli(args: string[]) {
  const r = spawnSync('npx', ['tsx', 'packages/cli/src/main.ts', ...args], { cwd: repoRoot, encoding: 'utf8' });
  return { code: r.status, stderr: r.stderr };
}
const bundleOf = (scenario: string, name: string, extra: string[] = []): Record<string, any> => {
  const out = join(tmp, `${name}.json`);
  const r = runCli(['bundle', scenario, '--out', out, ...extra]);
  expect(r.stderr).toBe('');
  expect(r.code).toBe(0);
  return JSON.parse(readFileSync(out, 'utf8'));
};

describe('sim bundle', () => {
  const vimy = bundleOf('scenarios/vimy-1917/scenario.yaml', 'vimy');

  it('models.tables has no sources key, and tableSources holds them', () => {
    expect(vimy.models.tables).not.toHaveProperty('sources');
    expect(Object.keys(vimy.models.tables).sort()).toEqual(['channels', 'cover', 'effects', 'weapons']);
    expect(Object.keys(vimy.tableSources).length).toBeGreaterThan(0);
  });

  it('holds every doctrine in doctrine/, the library, and no invented notes', () => {
    const ids = readdirSync(join(repoRoot, 'doctrine')).filter((f) => f.endsWith('.yaml')).map((f) => f.replace(/\.yaml$/, '')).sort();
    expect(Object.keys(vimy.models.doctrines).sort()).toEqual(ids);
    expect(Object.keys(vimy.library).sort()).toEqual(['formations', 'leaders', 'sources', 'weatherPresets']);
    expect(vimy.bundleVersion).toBe(1);
    expect(vimy.notes).toBe('');
    expect(vimy.createdFrom).toBe('scenarios/vimy-1917/scenario.yaml');
    expect(vimy.scenario.terrain).toBeDefined();
  });

  it("carries the scenario folder's notes.md when there is one", () => {
    const dir = join(mkdtempSync(join(tmpdir(), 'sim-notes-')), 'vimy-1917');
    cpSync(join(repoRoot, 'scenarios/vimy-1917'), dir, { recursive: true });
    writeFileSync(join(dir, 'notes.md'), 'Historical note.\n');
    expect(bundleOf(join(dir, 'scenario.yaml'), 'noted').notes).toBe('Historical note.\n');
  });

  it('needs --out and rejects overlay options', () => {
    expect(runCli(['bundle', 'scenarios/vimy-1917/scenario.yaml']).code).toBe(1);
    mkdirSync(tmp, { recursive: true });
    expect(runCli(['bundle', 'scenarios/vimy-1917/scenario.yaml', '--out', join(tmp, 'x.json'), '--overlay', 'overlays/vimy-half-guns.yaml']).code).toBe(1);
  });
});
