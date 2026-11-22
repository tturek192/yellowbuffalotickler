import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION } from '@wwi/engine';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

function runCli(args: string[]) {
  const r = spawnSync('npx', ['tsx', 'packages/cli/src/main.ts', ...args], { cwd: repoRoot, encoding: 'utf8' });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

const draft = 'scenarios/vimy-1917/1cdn-3bde-draft.yaml';

/** A copy of the Vimy scenario directory, with `edit(dir)` applied; its scenario.yaml path. */
function vimyCopy(edit: (dir: string) => void): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'sim-vimy-')), 'vimy-1917');
  cpSync(join(repoRoot, 'scenarios/vimy-1917'), dir, { recursive: true });
  edit(dir);
  return join(dir, 'scenario.yaml');
}
const replaceIn = (file: string, from: string, to: string): void => {
  const text = readFileSync(file, 'utf8');
  if (!text.includes(from)) throw new Error(`${from} not in ${file}`);
  writeFileSync(file, text.replace(from, to));
};

describe('cli', () => {
  it('exits 2 and lists problems for a broken scenario', () => {
    const r = runCli(['run', 'packages/cli/test/broken.yaml', '--seed', '1', '--out', '/tmp/x.json']);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/unknown line/);
  });

  it('a weapon the tables lack is rejected up front by run, review and batch: exit 2, naming the file and the weapon', () => {
    // A defensive battery with no bombardment allocation: before, only its first shot found the weapon missing (exit 3).
    const scenario = vimyCopy((d) => replaceIn(join(d, 'fireplan.yaml'), 'weapon: 77mm-fk\n    role: defensive\n    count: { value: 108', 'weapon: 77mm-fkx\n    role: defensive\n    count: { value: 108'));
    const dir = mkdtempSync(join(tmpdir(), 'sim-'));
    for (const args of [
      ['run', scenario, '--seed', '1', '--out', join(dir, 'run.json')],
      ['review', scenario, '--out', join(dir, 'review.md')],
      ['batch', scenario, '--runs', '2'],
      ['batch', scenario, '--runs', '2', '--workers', '2'],
    ]) {
      const r = runCli(args);
      expect(r.code, args.join(' ')).toBe(2);
      expect(r.stderr).toMatch(/fireplan\.yaml.*artillery\[\d+\]\.weapon: unknown weapon "77mm-fkx"/);
    }
    expect(existsSync(join(dir, 'run.json'))).toBe(false);
  });

  it('a misspelt scenario section fails validation, naming its file, instead of silently dropping the section', () => {
    const scenario = vimyCopy((d) => replaceIn(join(d, 'command.yaml'), '\ntanks:', '\ntank:'));
    const r = runCli(['run', scenario, '--seed', '1', '--out', join(mkdtempSync(join(tmpdir(), 'sim-')), 'run.json')]);
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/command\.yaml.*unknown section "tank"/);
  });

  it('a problem found when the run starts gives the same exit code and every problem on worker threads as in this process: batch --workers and report (final review fix)', () => {
    // A doctrine whose company weapons are not in the tables: found by runScenario's setup, not by the loader.
    const docs = mkdtempSync(join(tmpdir(), 'sim-doctrine-'));
    cpSync(join(repoRoot, 'doctrine'), docs, { recursive: true });
    replaceIn(join(docs, 'bef-1917.yaml'), '  rifle: rifle\n  lightMg: lewis', '  rifle: smle-x\n  lightMg: lewis-mk9');
    const out = join(mkdtempSync(join(tmpdir(), 'sim-')), 'report.md');
    const runs = [
      runCli(['batch', draft, '--runs', '2', '--doctrine-dir', docs]),
      runCli(['batch', draft, '--runs', '2', '--workers', '2', '--doctrine-dir', docs]),
      runCli(['report', draft, '--runs', '2', '--out', out, '--doctrine-dir', docs]),
    ];
    for (const r of runs) {
      expect(r.code).toBe(2);
      expect(r.stderr).toMatch(/smle-x/);
      expect(r.stderr).toMatch(/lewis-mk9/);
    }
    expect(runs[1]!.stderr).toBe(runs[0]!.stderr);
    expect(existsSync(out)).toBe(false);
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
    expect(rec.engineVersion).toBe(ENGINE_VERSION);
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

  it('batch --workers N gives the same table as in one process, and --json writes the summary as JSON (Task 15)', () => {
    const one = runCli(['batch', draft, '--runs', '3']);
    const four = runCli(['batch', draft, '--runs', '3', '--workers', '4']);
    expect(four.code).toBe(0);
    expect(four.stdout).toBe(one.stdout);
    expect(one.stdout).toMatch(/winner/i);
    const json = runCli(['batch', draft, '--runs', '3', '--workers', '2', '--json']);
    expect(json.code).toBe(0);
    const b = JSON.parse(json.stdout);
    expect(b.runs).toBe(3);
    expect(Object.keys(b)).toEqual(['runs', 'lines', 'casualties', 'prisoners', 'gunsCaptured', 'duration', 'winner', 'keyGround']);
    expect(runCli(['batch', draft, '--runs', '3', '--workers', '0']).code).toBe(1);
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

  describe('what-if overlays (Plan 4 Task 1)', () => {
    /** An overlay file in a fresh directory: a scale-men op, then a swap-leader on a formation the scenario lacks. */
    const staleOverlay = (): string => {
      const file = join(mkdtempSync(join(tmpdir(), 'sim-ov-')), 'stale.yaml');
      writeFileSync(
        file,
        'id: stale\ntitle: Stale\nscenarioId: vimy-1917-1cdn-3bde\nops:\n  - op: scale-men\n    side: allied\n    factor: 0.5\n  - op: swap-leader\n    formationId: gone\n    leaderId: currie\n',
      );
      return file;
    };

    it('run --overlay writes the what-if into the record', () => {
      const out = join(mkdtempSync(join(tmpdir(), 'sim-')), 'x2.json');
      const r = runCli(['run', 'scenarios/vimy-1917/scenario.yaml', '--seed', '1', '--out', out, '--overlay', 'overlays/vimy-germans-x2.yaml']);
      expect(r.code, r.stderr).toBe(0);
      const record = JSON.parse(readFileSync(out, 'utf8'));
      expect(record.whatIf).toMatchObject({ overlayId: 'vimy-germans-x2', title: 'Germans ×2' });
      expect(record.whatIf.changes.length).toBeGreaterThan(0);
    }, 120000);

    it('an overlay naming a missing formation exits 2 listing it; with --drop-unresolved it runs without that op', () => {
      const overlay = staleOverlay();
      const out = join(mkdtempSync(join(tmpdir(), 'sim-')), 'stale.json');
      const stopped = runCli(['run', draft, '--seed', '1', '--out', out, '--overlay', overlay]);
      expect(stopped.code).toBe(2);
      expect(stopped.stderr).toMatch(/ops\[1\] \(swap-leader\): unknown formation "gone"/);
      expect(existsSync(out)).toBe(false);
      const dropped = runCli(['run', draft, '--seed', '1', '--out', out, '--overlay', overlay, '--drop-unresolved']);
      expect(dropped.code, dropped.stderr).toBe(0);
      expect(dropped.stderr).toMatch(/dropped ops\[1\] \(swap-leader\)/);
      const record = JSON.parse(readFileSync(out, 'utf8'));
      expect(record.whatIf.changes.length).toBeGreaterThan(0);
      expect(record.whatIf.changes.some((c: { index: number }) => c.index === 1)).toBe(false);
      // batch on worker threads stops the same way, before any run.
      const batch = runCli(['batch', draft, '--runs', '2', '--workers', '2', '--overlay', overlay]);
      expect(batch.code).toBe(2);
      expect(batch.stderr).toMatch(/unknown formation "gone"/);
    }, 120000);

    it('an overlay written for another scenario exits 2 naming both ids, before any run', () => {
      const out = join(mkdtempSync(join(tmpdir(), 'sim-')), 'wrong.json');
      const r = runCli(['run', draft, '--seed', '1', '--out', out, '--overlay', 'overlays/vimy-germans-x2.yaml']);
      expect(r.code).toBe(2);
      expect(r.stderr).toMatch(/overlay "vimy-germans-x2" is for scenario "vimy-1917", not "vimy-1917-1cdn-3bde"/);
      expect(existsSync(out)).toBe(false);
    });

    it('a broken overlay exits 2 naming the op and its field; --drop-unresolved without --overlay is a usage error', () => {
      const file = join(mkdtempSync(join(tmpdir(), 'sim-ov-')), 'bad.yaml');
      writeFileSync(file, 'id: bad\ntitle: Bad\nscenarioId: vimy-1917\nops:\n  - op: scale-men\n    factor: 0\n');
      const r = runCli(['batch', draft, '--runs', '1', '--overlay', file]);
      expect(r.code).toBe(2);
      expect(r.stderr).toMatch(/ops\[0\]\.factor/);
      expect(runCli(['batch', draft, '--runs', '1', '--drop-unresolved']).code).toBe(1);
    });

    it('an overlay draws on the library (library/, or --library-dir): a library division and leader come into the record (Plan 4 Task 2)', () => {
      const file = join(mkdtempSync(join(tmpdir(), 'sim-ov-')), 'lib.yaml');
      writeFileSync(
        file,
        'id: lib\ntitle: Library\nscenarioId: vimy-1917-1cdn-3bde\nops:\n' +
          '  - { op: add-formation, from: { libraryId: bef-9div }, side: allied, underFormationId: 1cdn-div, entryPoint: [-3000, 0], distanceKm: 8 }\n' +
          '  - { op: swap-leader, formationId: 1cdn-div, leaderId: lukin }\n',
      );
      const out = join(mkdtempSync(join(tmpdir(), 'sim-')), 'lib.json');
      const r = runCli(['run', draft, '--seed', '1', '--out', out, '--overlay', file]);
      expect(r.code, r.stderr).toBe(0);
      const paths = JSON.parse(readFileSync(out, 'utf8')).whatIf.changes.map((c: { path: string }) => c.path);
      expect(paths).toEqual(expect.arrayContaining(['leader[lukin]', 'formation[bef-9div]', 'reserve[bef-9div]', 'formation[1cdn-div].leaderId']));
      // Another library directory: here an empty one, so both ops no longer resolve.
      const empty = runCli(['run', draft, '--seed', '1', '--out', out, '--overlay', file, '--library-dir', mkdtempSync(join(tmpdir(), 'sim-lib-'))]);
      expect(empty.code).toBe(2);
      expect(empty.stderr).toMatch(/ops\[0\] \(add-formation\): unknown library formation "bef-9div"/);
      expect(runCli(['run', draft, '--seed', '1', '--out', out, '--library-dir', 'library']).code).toBe(1);
    }, 120000);
  });
});
