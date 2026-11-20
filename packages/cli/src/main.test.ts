import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function runCli(args: string[]) {
  const r = spawnSync('npx', ['tsx', 'packages/cli/src/main.ts', ...args], { cwd: repoRoot, encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const draft = 'scenarios/vimy-1917/1cdn-3bde-draft.yaml';

describe('cli', () => {
  it('exits 2 and lists problems for a broken scenario', () => {
    const r = runCli(['run', 'packages/cli/test/broken.yaml', '--seed', '1', '--out', '/tmp/x.json']);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/unknown line/);
  });

  it('exits 1 with usage on bad arguments', () => {
    const r = runCli(['run', draft]);
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/usage/i);
  });

  it('run writes a run record, creating parent dirs', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'sim-')), 'a/b/run.json');
    const r = runCli(['run', draft, '--seed', '1', '--out', out]);
    expect(r.code).toBe(0);
    expect(existsSync(out)).toBe(true);
    expect(JSON.parse(readFileSync(out, 'utf8')).summary.lineTaken).toHaveLength(4);
  });

  it('batch prints a table with clock times', () => {
    const r = runCli(['batch', draft, '--runs', '3']);
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/3\/3/);
    expect(r.stdout).toMatch(/\d\d:\d\d–\d\d:\d\d/);
  });
});
