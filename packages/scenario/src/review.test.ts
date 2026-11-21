import { describe, expect, it } from 'vitest';
import { buildReview } from './review';
import { ATTACK_KEYS, COMMON_KEYS, COMPANY_DEFAULT_KEYS, DEFENCE_KEYS } from './doctrine';
import { CHANNEL_KINDS, EFFECT_KEYS, GROUNDS, POSTURES } from './tables';
import { fixtureWithLeaders, fixtureWithMixedValues, minimalDoctrineV2, minimalTables } from './test-fixtures';

describe('buildReview', () => {
  it('counts value kinds and tiers, and lists estimates first in each section', () => {
    const r = buildReview(fixtureWithMixedValues());
    expect(r.counts).toMatchObject({ sourced: 3, estimates: 2, disputed: 1, values: 6 });
    expect(r.counts.byTier).toMatchObject({ official: 4, tertiary: 0 });
    expect(r.sections[0]!.rows.map((x) => x.kind)).toEqual(['estimate', 'sourced', 'disputed']);
  });

  it('has the eleven sections in order, the model tables last', () => {
    expect(buildReview(fixtureWithMixedValues()).sections.map((s) => s.title)).toEqual([
      'Historical targets',
      'Leaders and ratings',
      'Canadian order of battle',
      'German order of battle and garrisons',
      'Reserves',
      'Fire plan and artillery',
      'Command, flanks and end conditions',
      'Weather',
      'Geometry',
      'Doctrine parameters',
      'Model tables',
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

  it('shows the whole window of casualty, prisoner and gun targets, so same-start rows differ', () => {
    const s = fixtureWithMixedValues();
    const w = (to: string) => ({ from: '1916-07-01T07:30', to });
    s.historical.casualties = [
      { side: 'allied', window: w('1916-07-02T23:59'), total: { value: 100, source: 'test-src' } },
      { side: 'allied', window: w('1916-07-06T23:59'), total: { value: 200, source: 'test-src' } },
    ];
    s.historical.prisonersTaken = [{ bySide: 'allied', window: w('1916-07-02T23:59'), count: { value: 50, source: 'test-src' } }];
    s.historical.gunsCaptured = { window: w('1916-07-03T23:59'), field: { value: 5, source: 'test-src' } };
    const labels = buildReview(s).sections[0]!.rows.map((r) => r.label);
    expect(labels).toContain('casualties / allied 1916-07-01T07:30–1916-07-02T23:59 / total');
    expect(labels).toContain('casualties / allied 1916-07-01T07:30–1916-07-06T23:59 / total');
    expect(labels).toContain('prisonersTaken / allied 1916-07-01T07:30–1916-07-02T23:59 / count');
    expect(labels).toContain('gunsCaptured 1916-07-01T07:30–1916-07-03T23:59 / field');
  });

  it('lists every doctrine v2 parameter with its kind, cite and description, marking calibrated ones', () => {
    const d = minimalDoctrineV2();
    d.sources = { 'ss143-1917': { title: 'SS 143', tier: 'primary' } };
    d.common.baseMorale = { value: 0.8, estimate: 'why', description: 'Starting morale.', calibrated: true };
    d.companyDefaults.lewisGuns = { value: 4, source: 'ss143-1917', page: '9', description: 'Lewis guns a company.' };
    const rows = buildReview(fixtureWithMixedValues(), { 'bef-1917': d }).sections.find((s) => s.title === 'Doctrine parameters')!.rows;
    const n = COMMON_KEYS.length + 2 + COMPANY_DEFAULT_KEYS.length + ATTACK_KEYS.length + DEFENCE_KEYS.length;
    expect(rows).toHaveLength(n);
    const morale = rows.find((r) => r.path === 'doctrine.bef-1917.common.baseMorale')!;
    expect(morale).toMatchObject({ kind: 'estimate', label: 'bef-1917 / common / baseMorale', description: 'Starting morale.' });
    expect(morale.note).toMatch(/^calibrated \(Plan 4\)\. why$/);
    const lewis = rows.find((r) => r.path === 'doctrine.bef-1917.companyDefaults.lewisGuns')!;
    expect(lewis).toMatchObject({ kind: 'sourced', cite: 'ss143-1917, 9 (primary)', description: 'Lewis guns a company.' });
    expect(lewis.note ?? '').not.toMatch(/calibrated/);
  });

  it('lists every table entry in a Model tables section, with tiers from the tables registry', () => {
    const t = { ...minimalTables(), sources: { 'wiki-x': { title: 'X', tier: 'tertiary' as const } } };
    t.weapons['18pdr']!.rpm = { value: 2, source: 'wiki-x', description: 'Rounds a minute.' };
    t.effects.killedFrac = { value: 0.25, estimate: 'why', description: 'Killed share.', calibrated: true };
    const r = buildReview(fixtureWithMixedValues(), {}, t);
    const rows = r.sections.find((s) => s.title === 'Model tables')!.rows;
    const n = 5 + POSTURES.length * GROUNDS.length + CHANNEL_KINDS.length * 2 + EFFECT_KEYS.length;
    expect(rows).toHaveLength(n);
    expect(rows.find((x) => x.path === 'tables.weapons.18pdr.rpm')).toMatchObject({ kind: 'sourced', cite: 'wiki-x (tertiary)', label: 'weapons / 18pdr / rpm', description: 'Rounds a minute.' });
    expect(rows.find((x) => x.path === 'tables.effects.killedFrac')!.note).toBe('calibrated (Plan 4). why');
    expect(rows.find((x) => x.path === 'tables.cover.moving.open')!.label).toBe('cover / moving / open');
    expect(r.counts.byTier.tertiary).toBeGreaterThanOrEqual(1);
  });

  it('has an empty Model tables section when no tables are given', () => {
    expect(buildReview(fixtureWithMixedValues()).sections.find((s) => s.title === 'Model tables')!.rows).toEqual([]);
  });
});

