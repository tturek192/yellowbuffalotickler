import { describe, expect, it } from 'vitest';
import { runScenario } from './run';
import { companyIds, fixtureWithDoctrineV3, rowsOf, totalsOverTime } from './test-helpers';

describe('conservation', () => {
  it('men + killed + wounded + captured is constant for every company in every snapshot', () => {
    const r = runScenario(...fixtureWithDoctrineV3(), { seed: 5 });
    for (const id of companyIds(r)) expect(new Set(totalsOverTime(r, id))).toHaveLength(1);
  });
  it('every company is in every snapshot, with no negative or non-finite numbers', () => {
    const r = runScenario(...fixtureWithDoctrineV3(), { seed: 5 });
    for (const id of companyIds(r)) {
      const rows = rowsOf(r, id);
      expect(rows).toHaveLength(r.snapshots.length);
      for (const row of rows) for (const v of Object.values(row)) if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true);
      // x may be negative (behind the start line); counts and fractions may not.
      for (const row of rows) for (const k of ['men', 'killed', 'wounded', 'captured', 'morale', 'suppression'] as const) expect(row[k]).toBeGreaterThanOrEqual(0);
    }
  });
});
