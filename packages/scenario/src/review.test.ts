import { describe, expect, it } from 'vitest';
import { buildReview } from './review';
import { fixtureWithLeaders, fixtureWithMixedValues } from './test-fixtures';

describe('buildReview', () => {
  it('counts value kinds and tiers, and lists estimates first in each section', () => {
    const r = buildReview(fixtureWithMixedValues());
    expect(r.counts).toMatchObject({ sourced: 3, estimates: 2, disputed: 1, values: 6 });
    expect(r.counts.byTier).toMatchObject({ official: 4, tertiary: 0 });
    expect(r.sections[0]!.rows.map((x) => x.kind)).toEqual(['estimate', 'sourced', 'disputed']);
  });

  it('has the nine sections in order', () => {
    expect(buildReview(fixtureWithMixedValues()).sections.map((s) => s.title)).toEqual([
      'Historical targets',
      'Leaders and ratings',
      'Canadian order of battle',
      'German order of battle and garrisons',
      'Reserves',
      'Fire plan and artillery',
      'Weather',
      'Geometry',
      'Doctrine parameters',
    ]);
  });

  it('marks leader ratings as owner-owned', () => {
    const rows = buildReview(fixtureWithLeaders()).sections.find((s) => s.title === 'Leaders and ratings')!.rows;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => /owner to confirm/.test(r.note ?? ''))).toBe(true);
  });

  it('shows disputed ranges and every citation', () => {
    const row = buildReview(fixtureWithMixedValues()).sections[0]!.rows.find((r) => r.kind === 'disputed')!;
    expect(row.value).toMatch(/18:00.*22:00/);
    expect(row.cite).toMatch(/test-src.*gossip/);
  });
});
