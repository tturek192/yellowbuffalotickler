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

  it('exits 3 with a one-line message, not a stack trace, on an unexpected error', () => {
    // The output's parent "directory" is an existing file, so creating it fails inside node:fs.
    const r = runCli(['run', draft, '--seed', '1', '--out', 'packages/cli/test/broken.yaml/run.json']);
    expect(r.code).toBe(3);
    expect(r.stderr.trim().split('\n')).toHaveLength(1);
    expect(r.stderr).toMatch(/^error: .*broken\.yaml/);
    expect(r.stderr).not.toMatch(/\n\s+at /);
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

  it('review writes a Markdown review with the open questions from the notes', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'sim-')), 'review.md');
    const r = runCli(['review', 'scenarios/vimy-1917/scenario.yaml', '--notes', 'docs/research/vimy', '--out', out]);
    expect(r.code).toBe(0);
    const md = readFileSync(out, 'utf8');
    expect(md).toMatch(/## Historical targets/);
    expect(md).toMatch(/\[leaders\.md\]/);
    expect(md).toMatch(/change `status: draft` to `status: reviewed`/);
  });

  it('review ignores a generated review in the notes directory, whatever --out is', () => {
    const count = (md: string) => (md.match(/^\d+\. \[/gm) ?? []).length;
    const dir = mkdtempSync(join(tmpdir(), 'sim-'));
    const a = join(dir, 'a.md');
    const b = join(dir, 'b.md');
    const notes = ['review', 'scenarios/vimy-1917/scenario.yaml', '--notes', 'docs/research/vimy'];
    expect(runCli([...notes, '--out', a]).code).toBe(0);
    expect(runCli([...notes, '--out', b]).code).toBe(0);
    expect(count(readFileSync(a, 'utf8'))).toBe(count(readFileSync(b, 'utf8')));
    expect(readFileSync(a, 'utf8')).not.toMatch(/\[review\.md\]/);
    expect(readFileSync(a, 'utf8')).toBe(readFileSync(join(repoRoot, 'docs/research/vimy/review.md'), 'utf8'));
  });

  it('review exits 1 without --out', () => {
    expect(runCli(['review', draft]).code).toBe(1);
  });
});
