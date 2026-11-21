import { describe, expect, it } from 'vitest';
import { runScenario } from './run';
import { expandSnapshots, KEYFRAME_EVERY } from './snapshots';
import { doctrines, draft, fixtureReserves, fixtureWithDoctrineV3, rowsOf } from './test-helpers';

describe('snapshots: keyframes and deltas (Task 15)', () => {
  const run = (keyframeEvery?: number) => runScenario(...fixtureReserves(), { seed: 1, ...(keyframeEvery ? { keyframeEvery } : {}) });

  it('expanded, the snapshots are the same as a run whose every snapshot is in full', () => {
    const r = run();
    const full = run(1);
    expect(full.snapshots.every((s) => s.delta === undefined)).toBe(true);
    expect(r.snapshots.some((s) => s.delta)).toBe(true);
    expect(expandSnapshots(r)).toEqual(full.snapshots);
    expect(JSON.stringify(r).length).toBeLessThan(JSON.stringify(full).length);
  });

  it('a keyframe every KEYFRAME_EVERY snapshots, the first among them; a delta holds only the rows that changed', () => {
    const r = runScenario(draft(), doctrines(), { seed: 1 });
    expect(r.snapshots.length).toBeGreaterThan(KEYFRAME_EVERY);
    r.snapshots.forEach((s, i) => expect(s.delta === undefined).toBe(i % KEYFRAME_EVERY === 0));
    const full = expandSnapshots(r);
    for (let i = 1; i < r.snapshots.length; i++) {
      const d = r.snapshots[i]!;
      if (!d.delta) continue;
      const before = new Map(full[i - 1]!.companies.rows.map((row) => [row[0], JSON.stringify(row)]));
      const now = full[i]!.companies.rows.filter((row) => before.get(row[0]) !== JSON.stringify(row)).map((row) => row[0]);
      expect(d.companies.rows.map((row) => row[0])).toEqual(now);
    }
  });

  it('a record with every snapshot in full (before engine 0.3.13) reads as it is', () => {
    const r = runScenario(...fixtureWithDoctrineV3(), { seed: 2, keyframeEvery: 1 });
    expect(expandSnapshots(r)).toBe(r.snapshots);
    expect(rowsOf(r, 'c1').length).toBe(r.snapshots.length);
  });
});
