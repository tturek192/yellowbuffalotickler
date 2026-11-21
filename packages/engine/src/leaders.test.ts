import { describe, expect, it } from 'vitest';
import { est, minimalScenarioV2 } from '@wwi/scenario/test-fixtures';
import type { Scenario } from '@wwi/scenario';
import { adaptFactor, companyLeaderOf, delayFactor, leaderOf, MIDPOINT, riskRatio, timetableJitter } from './leaders';
import type { Ratings } from './leaders';

const r = (o: Partial<Ratings>): Ratings => ({ ...MIDPOINT, ...o });

/** The minimal scenario: bn1 led by Currie, here with ratings (planning 5, orderSpeed 4, the rest 3). */
function rated(): Scenario {
  const s = minimalScenarioV2();
  s.leaders[0]!.ratings = { planning: est(5), orderSpeed: est(4), adaptiveness: est(3), riskTolerance: est(3), moraleEffect: est(3) };
  return s;
}

describe('leaders', () => {
  it('leaderOf gives the formation leader\'s ratings', () => {
    expect(leaderOf(rated(), 'bn1')).toEqual({ planning: 5, orderSpeed: 4, adaptiveness: 3, riskTolerance: 3, moraleEffect: 3 });
  });

  it('a formation with no leader, or a leader without ratings, counts as 3 everywhere, and the default is listed', () => {
    const used = new Set<string>();
    expect(leaderOf(minimalScenarioV2(), 'bn1', used)).toEqual(MIDPOINT);
    expect(leaderOf(minimalScenarioV2(), 'no-such-formation', used)).toEqual(MIDPOINT);
    expect([...used].sort()).toEqual(['formations[no-such-formation] leader ← none (ratings 3)', 'leaders[currie].ratings ← 3 (no ratings given)']);
  });

  it('a company is led by the nearest leader up its formation path', () => {
    expect(companyLeaderOf(rated(), ['bn1']).planning).toBe(5);
    expect(companyLeaderOf(rated(), ['coy-formation', 'bn1']).planning).toBe(5);
    expect(companyLeaderOf(rated(), ['other'])).toEqual(MIDPOINT);
  });

  it('delayFactor = (6 − orderSpeed) / 3: a faster leader takes less of every delay', () => {
    expect(delayFactor(r({ orderSpeed: 3 }))).toBe(1);
    expect(delayFactor(r({ orderSpeed: 5 }))).toBeCloseTo(1 / 3, 12);
    expect(delayFactor(r({ orderSpeed: 1 }))).toBeCloseTo(5 / 3, 12);
  });

  it('adaptFactor = (6 − adaptiveness) / 3 scales the stall tolerance', () => {
    expect(adaptFactor(r({ adaptiveness: 3 }))).toBe(1);
    expect(30 * adaptFactor(r({ adaptiveness: 5 }))).toBeCloseTo(10, 12);
    expect(30 * adaptFactor(r({ adaptiveness: 1 }))).toBeCloseTo(50, 12);
  });

  it('riskRatio = minAttackRatio · (6 − riskTolerance) / 3: a bold leader accepts worse odds', () => {
    expect(riskRatio(1.5, r({ riskTolerance: 3 }))).toBe(1.5);
    expect(riskRatio(1.5, r({ riskTolerance: 5 }))).toBeCloseTo(0.5, 12);
    expect(riskRatio(1.5, r({ riskTolerance: 1 }))).toBeCloseTo(2.5, 12);
  });

  it('timetableJitter = startJitterMin · (6 − planning) / 3: a better planner keeps his units to the timetable', () => {
    expect(timetableJitter(6, r({ planning: 3 }))).toBe(6);
    expect(timetableJitter(6, r({ planning: 5 }))).toBeCloseTo(2, 12);
    expect(timetableJitter(6, r({ planning: 1 }))).toBeCloseTo(10, 12);
  });
});
