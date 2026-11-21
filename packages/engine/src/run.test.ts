import { describe, expect, it } from 'vitest';
import { fixtureWithDoctrine, withManyCompanies } from '@wwi/scenario/test-fixtures';
import { encodeTerrain } from '@wwi/scenario';
import { lineXAt } from './geometry';
import { runScenario } from './run';
import { models, rowsOf, snapshotsOf } from './test-helpers';

const { scenario: s, doctrines } = fixtureWithDoctrine();
const d = models(doctrines);
/** Each snapshot's companies as objects keyed by column. */
const companiesOf = (r: ReturnType<typeof runScenario>, i: number) =>
  snapshotsOf(r)[i]!.companies.rows.map((row) => Object.fromEntries(snapshotsOf(r)[i]!.companies.columns.map((c, k) => [c, row[k]!])) as Record<string, any>);

describe('runScenario', () => {
  it('copies the terrain grid into the record, and leaves the key out when there is none', () => {
    const terrainGrid = { source: { source: 'test-src' }, method: 'test', ...encodeTerrain({ cellM: 25, originX: 0, originY: 0, cols: 2, rows: 1, elevM: [60, 145] }) };
    expect(runScenario({ ...s, terrainGrid }, d, { seed: 1 }).geometry.terrain).toEqual(terrainGrid);
    expect('terrain' in runScenario(s, d, { seed: 1 }).geometry).toBe(false);
  });
  it('does not crash on a garrison company without objective or sector, and leaves it in place', () => {
    const g = structuredClone(s);
    g.forces[0]!.formations[0]!.companies!.push({
      id: 'gar', name: 'Garrison', role: 'garrison', strength: { value: 100, estimate: 't' }, start: [400, 100],
    });
    const r = runScenario(g, d, { seed: 1, snapshotEveryStep: true });
    const last = rowsOf(r, 'gar').at(-1)!;
    expect([last.x, last.y]).toEqual([400, 100]);
  });
  it('is deterministic: same seed gives an identical record', () => {
    expect(JSON.stringify(runScenario(s, d, { seed: 7 }))).toBe(JSON.stringify(runScenario(s, d, { seed: 7 })));
  });
  it('different seeds differ in company timing', () => {
    expect(JSON.stringify(snapshotsOf(runScenario(s, d, { seed: 7 })))).not.toBe(
      JSON.stringify(snapshotsOf(runScenario(s, d, { seed: 8 }))),
    );
  });
  it('companies never get closer to the barrage than followDistanceM before it pauses', () => {
    const r = runScenario(s, d, { seed: 1, snapshotEveryStep: true });
    snapshotsOf(r).forEach((snap, i) => {
      for (const c of companiesOf(r, i)) {
        const b = snap.barrages[0]!.points;
        // Company positions are rounded to 1 m and barrage points to 0.1 m.
        expect(c.x).toBeLessThanOrEqual(lineXAt(b, c.y) - 70 + 0.55);
      }
    });
  });
  it('takes the black line once, by minute 73, with the barrage at least the follow distance beyond it, and records it in the summary', () => {
    const r = runScenario(s, d, { seed: 1, snapshotEveryStep: true });
    const taken = r.events.filter((e) => e.kind === 'line-taken');
    expect(taken).toHaveLength(1);
    expect(taken[0]!.minute).toBeLessThanOrEqual(73);
    const at = snapshotsOf(r).findIndex((x) => x.minute === taken[0]!.minute);
    const snap = snapshotsOf(r)[at]!;
    const black = r.geometry.lines.find((l) => l.id === 'black')!.points;
    for (const c of companiesOf(r, at))
      expect(lineXAt(snap.barrages[0]!.points, c.y)).toBeGreaterThanOrEqual(lineXAt(black, c.y) + 70 - 0.1);
    expect(taken[0]!.text).toBe('Black Line taken');
    expect(r.summary.lineTaken).toEqual([{ lineId: 'black', sectorId: 's1', minute: taken[0]!.minute }]);
  });
  it('snapshots mark each barrage done from the minute it ends', () => {
    const r = runScenario(s, d, { seed: 1, snapshotEveryStep: true, stopEarly: false, endMinute: 90 });
    const end = r.events.find((e) => e.kind === 'barrage-done')!.minute;
    for (const snap of snapshotsOf(r)) expect(snap.barrages[0]!.done).toBe(snap.minute >= end);
    expect(snapshotsOf(r).some((x) => x.barrages[0]!.done)).toBe(true);
  });
  it('the record carries the geometry and starts with zero-hour', () => {
    const r = runScenario(s, d, { seed: 1 });
    expect(r.geometry.lines.map((l) => l.id)).toEqual(['gfront', 'black']);
    expect(r.events[0]!.kind).toBe('zero-hour');
  });
  it('has chronological events and unique snapshot minutes', () => {
    const r = runScenario(s, d, { seed: 3 });
    const mins = r.events.map((e) => e.minute);
    expect(mins).toEqual([...mins].sort((a, b) => a - b));
    const sm = snapshotsOf(r).map((x) => x.minute);
    expect(new Set(sm).size).toBe(sm.length);
    expect(sm[0]).toBe(0);
    expect(sm[sm.length - 1]).toBe(r.endMinute);
  });
  it('a 4-day run stays under 20 MB, snapshotting hourly once the battle is quiet (Review Focus 3)', () => {
    const r = runScenario(withManyCompanies(s, 150), d, { seed: 1, endMinute: 5760, stopEarly: false });
    const quiet = snapshotsOf(r).filter((x) => x.minute > 120);
    for (let i = 1; i < quiet.length; i++) expect(quiet[i]!.minute - quiet[i - 1]!.minute).toBeLessThanOrEqual(60);
    expect(quiet.length).toBeLessThanOrEqual(5760 / 60);
    expect(snapshotsOf(r).at(-1)!.minute).toBe(5760);
    expect(JSON.stringify(r).length).toBeLessThan(20_000_000);
  });

  it('steps by stepMin while the barrage lifts and by quietStepMin once nothing happens, never past a scheduled change', () => {
    const q = structuredClone(doctrines);
    q['bef-1917']!.common.quietStepMin = { ...q['bef-1917']!.common.quietStepMin, value: 10 };
    const r = runScenario(s, models(q), { seed: 1, snapshotEveryStep: true, stopEarly: false, endMinute: 200 });
    const mins = snapshotsOf(r).map((x) => x.minute);
    const steps = mins.slice(1).map((m, i) => m - mins[i]!);
    const done = r.events.find((e) => e.kind === 'barrage-done')!.minute;
    // Lifting (to minute 33): every step is 2 minutes.
    expect(steps.slice(0, 16).every((x) => x === 2)).toBe(true);
    // The barrage's end (minute 73) is not stepped over by a quiet step: the first step past it ends within stepMin of it.
    expect(mins.find((m) => m >= done)! - done).toBeLessThan(2);
    // Quiet after it: 10-minute steps, the last cut short at endMinute.
    const quiet = steps.filter((_, i) => mins[i]! >= done);
    expect(quiet.slice(0, -1)).toEqual(Array(quiet.length - 1).fill(10));
    expect(mins.at(-1)).toBe(200);
  });

  it('the record is columnar, rounded, and names each company\'s battalion', () => {
    const r = runScenario(s, d, { seed: 1 });
    // Engine 0.4.0: each company's formations, battalion up.
    expect(r.units[0]!.formationPath![0]).toBe('bn1');
    expect(r.units).toEqual([
      { id: 'c1', battalionId: 'bn1', name: 'A Company', side: 'allied', formationPath: r.units[0]!.formationPath },
      { id: 'c2', battalionId: 'bn1', name: 'B Company', side: 'allied', formationPath: r.units[1]!.formationPath },
    ]);
    const snap = snapshotsOf(r)[1]!.companies;
    expect(snap.columns).toEqual(['id', 'x', 'y', 'men', 'status', 'morale', 'suppression', 'posture', 'killed', 'wounded', 'captured', 'gapM']);
    for (const row of snap.rows) {
      expect(Number.isInteger(row[1]) && Number.isInteger(row[2])).toBe(true);
      expect(row[5] * 100).toBeCloseTo(Math.round(row[5] * 100), 9);
    }
    expect(r.summary.casualties.battle.allied).toEqual({ killed: 0, wounded: 0, captured: 0, total: 0, formations: { bn1: { killed: 0, wounded: 0, captured: 0, total: 0 } } });
    expect(r.summary).toMatchObject({ prisoners: { allied: 0, central: 0 }, gunsCaptured: 0, endedAt: r.endMinute, endReason: 'objectives-held', winner: null, keyGround: [] });
  });

  it('records every default the run applied', () => {
    expect(runScenario(s, d, { seed: 1 }).defaultsUsed).toContain('companies[c1].officers ← bef-1917.companyDefaults.officers');
  });
});
