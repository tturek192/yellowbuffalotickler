import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BatchSummary, RunRecord, SimEvent } from '@wwi/engine';
import { describe, expect, it } from 'vitest';
import {
  causeCounts,
  calibratedParams,
  COMMENTARY_END,
  COMMENTARY_START,
  consequentialEvents,
  extractCommentary,
  firstStalledCompany,
  groupDefaults,
  linesOutsideWindow,
  menLost,
  reportToMarkdown,
} from './report-md';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const ev = (id: number, kind: SimEvent['kind'], extra: Partial<SimEvent> = {}): SimEvent => ({ id, minute: id, kind, text: `${kind} ${id}`, causes: [], refs: [], ...extra });

/** Events: fire (#1) leads to a pinned company (#2) and a segment lost (#3) that leads to a line taken (#4). */
function fakeEvents(): SimEvent[] {
  return [
    ev(0, 'zero-hour'),
    ev(1, 'direct-fire', { unitId: 'ger-1', causes: ['mg-fire'], losses: { allied: { killed: 3, wounded: 7 } } }),
    ev(2, 'company-pinned', { unitId: 'cdn-a', causes: ['mg-fire', 'suppressed'], refs: [1] }),
    ev(3, 'segment-lost', { unitId: 'cdn-b', segmentId: 'seg:001', causes: ['wire-cut', 'defenders-trapped'], refs: [1] }),
    ev(4, 'line-taken', { lineId: 'black', sectorId: 's1', causes: ['followed-barrage'], refs: [3] }),
    ev(5, 'shelled', { causes: ['artillery-fire'], losses: { allied: { killed: 40, wounded: 80 } } }),
    ev(6, 'company-pinned', { unitId: 'ger-1', causes: ['artillery-fire'], refs: [5] }),
    ev(7, 'company-surrendered', { unitId: 'ger-2', causes: ['morale-broke'], factors: { men: 57 } }),
  ];
}

function fakeRun(): RunRecord {
  return {
    engineVersion: '0.0.0',
    scenarioId: 'fake',
    scenarioTitle: 'Fake battle',
    scenarioStatus: 'draft',
    seed: 1,
    zeroHour: '1917-04-09T05:30',
    stepMin: 2,
    endMinute: 600,
    geometry: {
      lines: [
        { id: 'black', name: 'Black Line', kind: 'objective', points: [] },
        { id: 'red', name: 'Red Line', kind: 'objective', points: [] },
        { id: 'blue', name: 'Blue Line', kind: 'objective', points: [] },
      ],
      sectors: [],
      features: [],
      segments: [],
    },
    units: [
      { id: 'cdn-a', battalionId: 'cdn', name: 'Cdn A', side: 'allied' },
      { id: 'cdn-b', battalionId: 'cdn', name: 'Cdn B', side: 'allied' },
      { id: 'ger-1', battalionId: 'ger', name: 'Ger 1', side: 'central' },
      { id: 'ger-2', battalionId: 'ger', name: 'Ger 2', side: 'central' },
    ],
    snapshots: [],
    events: fakeEvents(),
    summary: {
      // black in its window (06:05–06:15 → minutes 35–45); red taken late; blue never taken.
      lineTaken: [
        { lineId: 'black', sectorId: 's1', minute: 40 },
        { lineId: 'red', sectorId: 's1', minute: 300 },
      ],
      casualties: {} as RunRecord['summary']['casualties'],
      prisoners: { allied: 57, central: 0 },
      gunsCaptured: 3,
      endedAt: 600,
      endReason: 'lull',
      winner: 'central',
      keyGround: [{ id: 'crest', name: 'The crest', holder: 'central' }],
      deadlock: null,
    },
    defaultsUsed: [
      'companies[cdn-a].officers ← bef-1917.companyDefaults.officers',
      'companies[cdn-b].officers ← bef-1917.companyDefaults.officers',
      'end.lullMin ← 360 (not given)',
    ],
  };
}

function fakeBatch(): BatchSummary {
  const line = (lineId: string, takenIn: number, med: number | null, e: number, l: number) => ({
    lineId, sectorId: 's1', takenIn, p10: med, median: med, p90: med, historicalEarliest: e, historicalLatest: l,
  });
  return {
    runs: 10,
    lines: [line('black', 10, 40, 35, 45), line('red', 10, 300, 95, 150), line('blue', 0, null, 320, 345)],
    casualties: [
      { side: 'allied', from: 0, to: 2669, target: 7707, p10: 9000, median: 10000, p90: 11000, pass: false },
      { side: 'allied', formationId: '1bde', from: 0, to: 1109, target: 465, p10: 400, median: 470, p90: 520, pass: true },
    ],
    prisoners: [{ bySide: 'allied', from: 0, to: 2669, target: 3404, range: [3404, 4000], p10: 100, median: 200, p90: 300, pass: null }],
    gunsCaptured: { from: 0, to: 2669, target: 54, range: [54, 63], p10: 150, median: 197, p90: 200, pass: null },
    duration: { target: 4290, range: [4290, 4440], p10: 4000, median: 5070, p90: 6000, pass: true },
    winner: { allied: 0.1, central: 0.9, none: 0, historical: 'allied', pass: false },
    keyGround: [{ id: 'crest', name: 'The crest', allied: 0.25, central: 0.7, none: 0.05 }],
    deadlock: {
      brokenShare: 0.6,
      byShare: { breakthrough: 0.1, surrender: 0, collapse: 0.5, stronghold: 0 },
      minute: { p10: 60, median: 90, p90: 400 },
      margins: {
        breakthroughBeyondM: { p10: -900, median: -400, p90: 120 },
        capturedFrac: { p10: 0.2, median: 0.35, p90: 0.45 },
        minFitFrac: { p10: 0, median: 0.05, p90: 0.3 },
        strongholdsHeld: { p10: 0, median: 1, p90: 1 },
        strongholdsOf: 1,
      },
    },
  };
}

function minimalTables() {
  return {
    tables: {
      effects: {
        captureRatio: { value: 3, estimate: 'why', description: 'Attackers to defenders needed to capture a segment.', calibrated: true as const },
        lullMin: { value: 360, source: 'x', description: 'A sourced number, not calibrated.' },
      },
      weapons: { maxim: { rpm: { value: 450, estimate: 'w', description: 'Rounds a minute.', calibrated: true as const } } },
    },
    doctrines: { 'bef-1917': { common: { baseMorale: { value: 0.8, estimate: 'm', description: 'Starting morale.', calibrated: true as const } } } },
  };
}

describe('the model report', () => {
  it('the report lists every historical target with a pass/fail cell and names the calibrated parameters', () => {
    const md = reportToMarkdown(fakeBatch(), fakeRun(), minimalTables());
    expect(md).toMatch(/\| Target \|.*\| Pass \|/);
    expect(md).toMatch(/## Calibrated parameters/);
  });

  it('gives each target its own row with a pass, fail or "no criterion" cell', () => {
    const md = reportToMarkdown(fakeBatch(), fakeRun(), minimalTables());
    const rows = md.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Target') && !l.startsWith('| ---'));
    const row = (re: RegExp) => rows.find((l) => re.test(l));
    expect(row(/Black Line.*s1/)).toMatch(/\| pass \|$/);
    expect(row(/Red Line.*s1/)).toMatch(/\| fail \|$/);
    expect(row(/Blue Line.*s1/)).toMatch(/0\/10.*\| fail \|$/);
    expect(row(/allied casualties, all formations/)).toMatch(/7707.*\| fail \|$/);
    expect(row(/allied casualties, 1bde/)).toMatch(/465.*\| pass \|$/);
    // Prisoners and guns: batch v2 gives no criterion; the report applies spec 7's count rule (median inside a disputed range).
    expect(row(/prisoners taken by allied/)).toMatch(/3404–4000.*\| fail \|$/);
    expect(row(/field guns captured/)).toMatch(/54–63.*\| fail \|$/);
    expect(row(/battle ends/)).toMatch(/\| pass \|$/);
    expect(row(/winner/)).toMatch(/allied.*\| fail \|$/);
  });

  it('counts passes and fails in a summary', () => {
    const md = reportToMarkdown(fakeBatch(), fakeRun(), minimalTables());
    expect(md).toMatch(/3 of 9 targets pass, 6 fail/);
  });

  it('lists only calibrated parameters, with their path, starting value and description', () => {
    const ps = calibratedParams(minimalTables());
    expect(ps.map((p) => p.path)).toEqual(['doctrine.bef-1917.common.baseMorale', 'tables.effects.captureRatio', 'tables.weapons.maxim.rpm']);
    const md = reportToMarkdown(fakeBatch(), fakeRun(), minimalTables());
    expect(md).toMatch(/\| `tables.effects.captureRatio` \| 3 \| Attackers to defenders needed to capture a segment. \|/);
    expect(md).not.toMatch(/tables.effects.lullMin/);
  });

  it('groups the defaults used by pattern, with a count and an example', () => {
    expect(groupDefaults(fakeRun().defaultsUsed)).toEqual([
      { pattern: 'companies[*].officers ← bef-1917.companyDefaults.officers', count: 2, example: 'companies[cdn-a].officers ← bef-1917.companyDefaults.officers' },
      { pattern: 'end.lullMin ← 360 (not given)', count: 1, example: 'end.lullMin ← 360 (not given)' },
    ]);
  });

  it('counts the men an event cost: fire and mine losses on both sides, men captured by surrender or trapping', () => {
    const es = fakeEvents();
    expect(menLost(es[1]!)).toBe(10);
    expect(menLost(es[7]!)).toBe(57);
    expect(menLost(ev(9, 'defenders-trapped', { factors: { captured: 66 } }))).toBe(66);
    expect(menLost(ev(9, 'mine-fired', { factors: { menLost: 39 } }))).toBe(39);
    expect(menLost(es[2]!)).toBe(0);
  });

  it('ranks events by men lost plus 100 per segment or line change that cites them within 6 refs', () => {
    const top = consequentialEvents(fakeEvents(), 50);
    const score = Object.fromEntries(top.map((t) => [t.event.id, t.score]));
    // #1: 10 men, and both changes (#3, #4) lead back to it.
    expect(score[1]).toBe(210);
    expect(score[3]).toBe(200); // itself and the line it led to
    expect(score[4]).toBe(100);
    expect(score[5]).toBe(120);
    expect(top.map((t) => t.event.id).slice(0, 3)).toEqual([1, 3, 5]);
    expect(top.some((t) => t.event.id === 0)).toBe(false); // nothing lost, nothing changed: not consequential
    expect(consequentialEvents(fakeEvents(), 2)).toHaveLength(2);
  });

  it('counts causes over the why chains of the given events (once per chain, and every occurrence)', () => {
    const counts = causeCounts(fakeEvents(), [4, 2]);
    const mg = counts.find((c) => c.cause === 'mg-fire')!;
    expect(mg).toEqual({ cause: 'mg-fire', chains: 2, occurrences: 3 });
    expect(counts[0]!.cause).toBe('mg-fire');
  });

  it('finds the attacker\'s first pinned company and the lines taken outside their window (never taken counts)', () => {
    expect(firstStalledCompany(fakeRun())?.id).toBe(2);
    expect(linesOutsideWindow(fakeBatch(), fakeRun()).map((l) => [l.lineId, l.takenMin])).toEqual([
      ['red', 300],
      ['blue', null],
    ]);
  });

  it('explains seed 1: the first stalled company and each line outside its window, by why chain', () => {
    const md = reportToMarkdown(fakeBatch(), fakeRun(), minimalTables());
    const explainPart = md.slice(md.indexOf('## Explain one run'));
    expect(explainPart).toMatch(/#2 .* company-pinned/);
    expect(explainPart).toMatch(/Red Line.*taken 10:30/);
    expect(explainPart).toMatch(/Blue Line.*never taken/);
    expect(explainPart).not.toMatch(/### Black Line/);
  });

  it('shows who held each piece of key ground at the end, as shares of the batch', () => {
    const md = reportToMarkdown(fakeBatch(), fakeRun(), minimalTables());
    expect(md).toMatch(/### Key ground at the end/);
    expect(md).toMatch(/\| The crest \(crest\) \| 25% \| 70% \| 5% \|/);
  });

  it('shows the deadlock: the share broken, by which condition, when, and the margins (Plan 4 Task 3)', () => {
    const md = reportToMarkdown(fakeBatch(), fakeRun(), minimalTables());
    expect(md).toMatch(/### Deadlock\n\nBroken in 60% of the 10 runs, at /);
    expect(md).toMatch(/\| collapse \| 50% \| lowest share of the defenders' whole force still fit: 0% \/ 5% \/ 30% \|/);
    expect(md).toMatch(/\| breakthrough \| 10% \| furthest beyond the gun line \(m\): -900 \/ -400 \/ 120 \|/);
    expect(md).toMatch(/\| stronghold \| 0% \| strongholds held at once, of 1: 0 \/ 1 \/ 1 \|/);
    // Not scored: no section.
    expect(reportToMarkdown({ ...fakeBatch(), deadlock: null }, fakeRun(), minimalTables())).not.toMatch(/### Deadlock/);
  });

  it('warns above the ranking that it credits ground changes to ancestors but men lost only to the event, and that fire has no firer refs', () => {
    const md = reportToMarkdown(fakeBatch(), fakeRun(), minimalTables());
    const part = md.slice(md.indexOf('## Most consequential events'), md.indexOf('### The 10 most frequent causes'));
    expect(part).toMatch(/\*\*Caveat\.\*\*/);
    expect(part).toMatch(/men lost count only on the event itself/);
    expect(part).toMatch(/direct-fire events carry no refs to their firers/);
    expect(part).toMatch(/under-ranked/);
  });

  it('for a line never taken, explains the last order that names it (a stalled line), else the last event that names it', () => {
    const run = fakeRun();
    run.events.push(
      ev(8, 'order-issued', { lineId: 'blue', sectorId: 's1', text: 'Brigade commits a battalion to the stalled Blue Line', causes: ['timetable'] }),
      ev(9, 'company-reached', { lineId: 'blue', sectorId: 's1', unitId: 'cdn-a' }),
    );
    const md = reportToMarkdown(fakeBatch(), run, minimalTables());
    const blue = md.slice(md.indexOf('### Blue Line'));
    expect(blue).toMatch(/#8 .*order-issued/);
    expect(blue).not.toMatch(/#9 /);
  });

  it('writes a marked placeholder for the commentary, or keeps the hand-written one it is given', () => {
    const md = reportToMarkdown(fakeBatch(), fakeRun(), minimalTables());
    expect(md).toContain('## Reading this report');
    expect(md).toContain(COMMENTARY_START);
    expect(md).toMatch(/not written yet/);
    const kept = reportToMarkdown(fakeBatch(), fakeRun(), minimalTables(), { commentary: '\nMy notes.\n' });
    expect(extractCommentary(kept)).toBe('\nMy notes.\n');
    expect(kept).not.toMatch(/not written yet/);
  });

  it('reads the commentary back, and refuses a file whose markers are broken', () => {
    expect(extractCommentary('no markers')).toBeNull();
    expect(extractCommentary(`a\n${COMMENTARY_START}x${COMMENTARY_END}\nb`)).toBe('x');
    expect(() => extractCommentary(`a\n${COMMENTARY_START}\nx`)).toThrow(/commentary/);
    expect(() => extractCommentary(`a\n${COMMENTARY_END}\nx`)).toThrow(/commentary/);
  });

  it('records the wall time against the 5-minute target and the interim 7-minute ceiling', () => {
    const md = reportToMarkdown(fakeBatch(), fakeRun(), minimalTables(), { wallMs: 6 * 60_000 + 30_000, workers: 4 });
    expect(md).toMatch(/6 min 30 s/);
    expect(md).toMatch(/over the 5-minute target/);
    expect(md).toMatch(/within the interim 7-minute ceiling/);
  });
});

describe('sim report', () => {
  const draft = 'scenarios/vimy-1917/1cdn-3bde-draft.yaml';
  const run = (args: string[]) => spawnSync('npx', ['tsx', 'packages/cli/src/main.ts', ...args], { cwd: repoRoot, encoding: 'utf8' });

  it('writes the report, and keeps the hand-written commentary when it writes it again', () => {
    const out = join(mkdtempSync(join(tmpdir(), 'sim-report-')), 'r/report.md');
    const first = run(['report', draft, '--runs', '2', '--workers', '2', '--out', out]);
    expect(first.stderr).toBe('');
    expect(first.status).toBe(0);
    const md = readFileSync(out, 'utf8');
    expect(md).toMatch(/\| Target \|.*\| Pass \|/);
    expect(md).toMatch(/## Explain one run \(seed 1\)/);
    writeFileSync(out, md.replace(/(<!-- builder-commentary:start[^>]*-->)[\s\S]*?(<!-- builder-commentary:end -->)/, '$1\nHand-written.\n$2'));
    expect(run(['report', draft, '--runs', '2', '--workers', '2', '--out', out]).status).toBe(0);
    expect(extractCommentary(readFileSync(out, 'utf8'))).toBe('\nHand-written.\n');
  }, 120_000);

  it('refuses, with nothing run or changed, a report whose commentary markers are broken or gone', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sim-report-'));
    for (const [name, text] of [
      ['broken.md', `# r\n${COMMENTARY_START}\nmine\n`],
      ['bare.md', '# r\n\n## Reading this report\n\nmine\n'],
    ] as const) {
      const out = join(dir, name);
      writeFileSync(out, text);
      const r = run(['report', draft, '--runs', '2', '--out', out]);
      expect(r.status).toBe(3);
      expect(r.stderr.trim().split('\n')).toHaveLength(1);
      expect(r.stderr).toMatch(/commentary/);
      expect(readFileSync(out, 'utf8')).toBe(text);
    }
  });

  it('exits 1 with usage without --runs or --out', () => {
    expect(run(['report', draft, '--runs', '2']).status).toBe(1);
    expect(run(['report', draft, '--out', '/tmp/x.md']).status).toBe(1);
  });
});
