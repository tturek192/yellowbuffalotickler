import { describe, expect, it } from 'vitest';
import { runScenario } from './run';
import { applyVariant, conservationHolds, VARIANTS, vimy, vimyDoctrines } from './test-helpers';

// Review Focus 1: lopsided what-ifs on the real scenario reach an end, with men conserved and no NaN or negative numbers.
describe('what-ifs on Vimy (Task 15)', () => {
  it.each(VARIANTS)('%s on Vimy ends, conserves men and has no NaN', (variant) => {
    const r = runScenario(applyVariant(vimy(), variant), vimyDoctrines(), { seed: 1 });
    expect(['objectives-held', 'lull', 'time-cap']).toContain(r.summary.endReason);
    expect(r.summary.endedAt).toBeLessThanOrEqual(vimy().timeLimitMinutes);
    expect(JSON.stringify(r)).not.toMatch(/NaN|null,"men"/);
    expect(conservationHolds(r)).toBe(true);
  }, 180000);

  it('a variant changes only what it names', () => {
    const s = vimy();
    const v = applyVariant(s, 'no-artillery');
    expect(v.artillery).toEqual([]);
    expect(v.bombardment).toBeUndefined();
    expect(s.artillery.length).toBeGreaterThan(0);
    expect(v.forces).toEqual(s.forces);
    const d = applyVariant(s, 'defenders-x2');
    const first = (x: typeof s) => x.forces.find((f) => f.side === 'central')!.formations[0]!;
    expect(JSON.stringify(first(d))).not.toBe(JSON.stringify(first(s)));
    expect(applyVariant(s, 'reserves-at-0km').reserves.every((r) => r.distanceKm.value === 0)).toBe(true);
  });
});
