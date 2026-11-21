import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
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

  it('run reads the model tables from --tables-dir and records the defaults it used', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'sim-')), 'run.json');
    expect(runCli(['run', draft, '--seed', '1', '--out', out, '--tables-dir', 'tables']).code).toBe(0);
    const rec = JSON.parse(readFileSync(out, 'utf8'));
    expect(rec.engineVersion).toBe('0.3.8');
    expect(rec.defaultsUsed).toContain('companies[14bn-a].officers ← bef-1917.companyDefaults.officers');
    const bad = runCli(['run', draft, '--seed', '1', '--out', out, '--tables-dir', 'no-such-dir']);
    expect(bad.code).toBe(2);
    expect(bad.stderr).toMatch(/cannot read tables directory no-such-dir/);
  });

  it('run exits 2 naming the doctrine when its company weapons are not in the tables', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sim-'));
    const text = readFileSync(join(repoRoot, 'doctrine/bef-1917.yaml'), 'utf8').replace(/^  lightMg: lewis$/m, '  lightMg: lewis-mk9');
    writeFileSync(join(dir, 'bef-1917.yaml'), text);
    const r = runCli(['run', draft, '--seed', '1', '--out', join(dir, 'run.json'), '--doctrine-dir', dir]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/doctrine bef-1917: companyWeapons\.lightMg names weapon "lewis-mk9"/);
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
    expect(md).toMatch(/\[vimy\/leaders\.md\]/);
    expect(md).toMatch(/change `status: draft` to `status: reviewed`/);
  });

  it('review ignores a generated review in the notes directory, whatever --out is', () => {
    const count = (md: string) => (md.match(/^\d+\. \[/gm) ?? []).length;
    const dir = mkdtempSync(join(tmpdir(), 'sim-'));
    const a = join(dir, 'a.md');
    const b = join(dir, 'b.md');
    const notes = ['review', 'scenarios/vimy-1917/scenario.yaml', '--notes', 'docs/research/vimy', '--notes', 'docs/research/model'];
    expect(runCli([...notes, '--out', a]).code).toBe(0);
    expect(runCli([...notes, '--out', b]).code).toBe(0);
    expect(count(readFileSync(a, 'utf8'))).toBe(count(readFileSync(b, 'utf8')));
    expect(readFileSync(a, 'utf8')).not.toMatch(/review\.md\]/);
    expect(readFileSync(a, 'utf8')).toBe(readFileSync(join(repoRoot, 'docs/research/vimy/review.md'), 'utf8'));
  });

  it('review reads the open questions of every --notes directory, labelled with the directory and file', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'sim-')), 'review.md');
    const r = runCli(['review', 'scenarios/vimy-1917/scenario.yaml', '--notes', 'docs/research/vimy', '--notes', 'docs/research/model', '--out', out]);
    expect(r.code).toBe(0);
    const md = readFileSync(out, 'utf8').split('## Open questions for the historian')[1]!;
    expect(md).toMatch(/\[vimy\/fireplan\.md\]/);
    expect(md).toMatch(/\[model\/tables\.md\] Hogg and Thurston/);
    expect(md).toMatch(/\[model\/doctrine\.md\] SS 135\./);
  });

  it('review lists every doctrine parameter and the model tables, read from --tables-dir', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'sim-')), 'review.md');
    const r = runCli(['review', 'scenarios/vimy-1917/scenario.yaml', '--out', out]);
    expect(r.code).toBe(0);
    const md = readFileSync(out, 'utf8');
    expect(md.indexOf('## Model tables')).toBeGreaterThan(md.indexOf('## Doctrine parameters'));
    expect(md).toMatch(/\*\*de-1917 \/ defence \/ emergeMin\*\*/);
    expect(md).toMatch(/\*\*weapons \/ 18pdr \/ rpm\*\*: 2 — .* \| sourced \| nicholson-1962, 253 \(official\)/);
    expect(md).toMatch(/calibrated \(Plan 4\)/);
    const bad = runCli(['review', 'scenarios/vimy-1917/scenario.yaml', '--out', out, '--tables-dir', 'no-such-dir']);
    expect(bad.code).toBe(2);
    expect(bad.stderr).toMatch(/cannot read tables directory no-such-dir/);
  });

  it('review exits 1 without --out', () => {
    expect(runCli(['review', draft]).code).toBe(1);
  });
});
