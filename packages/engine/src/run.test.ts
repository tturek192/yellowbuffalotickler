import { describe, expect, it } from 'vitest';
import { fixtureWithDoctrine, withManyCompanies } from '@wwi/scenario/test-fixtures';
import { lineXAt } from './geometry';
import { runScenario } from './run';

const { scenario: s, doctrines: d } = fixtureWithDoctrine();

describe('runScenario', () => {
  it('is deterministic: same seed gives an identical record', () => {
    expect(JSON.stringify(runScenario(s, d, { seed: 7 }))).toBe(JSON.stringify(runScenario(s, d, { seed: 7 })));
  });
  it('different seeds differ in company timing', () => {
    expect(JSON.stringify(runScenario(s, d, { seed: 7 }).snapshots)).not.toBe(
      JSON.stringify(runScenario(s, d, { seed: 8 }).snapshots),
    );
  });
  it('companies never get closer to the barrage than followDistanceM before it pauses', () => {
    const r = runScenario(s, d, { seed: 1, snapshotEvery: 1 });
    for (const snap of r.snapshots)
      for (const c of snap.companies) {
        const b = snap.barrages[0]!.points;
        expect(c.x).toBeLessThanOrEqual(lineXAt(b, c.y) - 70 + 0.1);
      }
  });
  it('takes the black line once, after the barrage pauses, and records it in the summary', () => {
    const r = runScenario(s, d, { seed: 1 });
    const taken = r.events.filter((e) => e.kind === 'line-taken');
    expect(taken).toHaveLength(1);
    expect(taken[0]!.minute).toBeGreaterThanOrEqual(33);
    expect(taken[0]!.text).toBe('Black Line taken');
    expect(r.summary.lineTaken).toEqual([{ lineId: 'black', sectorId: 's1', minute: taken[0]!.minute }]);
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
    const sm = r.snapshots.map((x) => x.minute);
    expect(new Set(sm).size).toBe(sm.length);
    expect(sm[0]).toBe(0);
    expect(sm[sm.length - 1]).toBe(r.endMinute);
  });
  it('a 4-day run stays under 20 MB (Review Focus 3)', () => {
    const r = runScenario(withManyCompanies(s, 150), d, { seed: 1, endMinute: 5760, stopEarly: false });
    expect(r.snapshots.length).toBe(5760 / (2 * 5) + 1);
    expect(JSON.stringify(r).length).toBeLessThan(20_000_000);
  });
});
