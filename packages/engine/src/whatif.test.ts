import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyOverlay, emptyLibrary } from '@wwi/scenario';
import type { Scenario } from '@wwi/scenario';
import { loadOverlay } from '@wwi/scenario/node';
import { resolveDefaults } from './defaults';
import { buildWorld, wetness } from './ground';
import type { RunRecord } from './record';
import { runScenario } from './run';
import { applyVariant, conservationHolds, repoRoot, VARIANTS, vimy, vimyDoctrines } from './test-helpers';

const DOCS = ['bef-1917', 'de-1917'];

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

describe('what-if overlays in the engine (Plan 4 Task 1)', () => {
  const base = (): RunRecord => runScenario(vimy(), vimyDoctrines(), { seed: 1, endMinute: 0 });
  const withOverlay = (file: string): RunRecord => {
    const o = loadOverlay(resolve(repoRoot, file));
    const r = applyOverlay(vimy(), o, emptyLibrary(), DOCS);
    return runScenario(r.scenario, vimyDoctrines(), { seed: 1, endMinute: 0, whatIf: { overlayId: o.id, title: o.title, changes: r.changes } });
  };
  /**
   * The central men the record starts with: every central company's row in the minute-0 snapshot (off-map reserves and
   * the companies the engine made up for them included), its men plus its killed, wounded and captured (the bombardment
   * before Zero has already taken its losses by minute 0, and those depend on the men there are).
   */
  const centralMenAtZero = (r: RunRecord): number => {
    const central = new Set(r.units.filter((u) => u.side === 'central').map((u) => u.id));
    const cols = r.snapshots[0]!.companies.columns;
    const at = (k: string) => cols.indexOf(k as (typeof cols)[number]);
    return r.snapshots[0]!.companies.rows
      .filter((row) => central.has(row[at('id')] as string))
      .reduce((n, row) => n + (row[at('men')] as number) + (row[at('killed')] as number) + (row[at('wounded')] as number) + (row[at('captured')] as number), 0);
  };

  it('Germans ×2 doubles the central men in the record at minute 0, made-up reserve companies included', () => {
    const b = base();
    const x2 = withOverlay('overlays/vimy-germans-x2.yaml');
    expect(centralMenAtZero(x2)).toBe(2 * centralMenAtZero(b));
    // The made-up companies are there and doubled: a reserve battalion's company 1 has twice the men it had.
    const madeUp = b.units.find((u) => u.side === 'central' && /-g1$/.test(u.id) && /\(made up\)/.test(u.name))!;
    expect(madeUp).toBeDefined();
    const men = (r: RunRecord) => {
      const cols = r.snapshots[0]!.companies.columns;
      const row = r.snapshots[0]!.companies.rows.find((x) => x[0] === madeUp.id)!;
      return (row[cols.indexOf('men')] as number) + (row[cols.indexOf('killed')] as number) + (row[cols.indexOf('wounded')] as number) + (row[cols.indexOf('captured')] as number);
    };
    expect(men(x2)).toBe(2 * men(b));
    expect(x2.defaultsUsed.some((d) => /strengthFactor 2/.test(d))).toBe(true);
  }, 120000);

  it('a reserve strengthFactor small enough to round to no one leaves every made-up company one man', () => {
    const { scenario } = applyOverlay(vimy(), { id: 't', title: 't', scenarioId: 'vimy-1917', ops: [{ op: 'scale-men', side: 'central', factor: 0.001 }] }, emptyLibrary(), DOCS);
    const m = vimyDoctrines();
    const made = (s: Scenario) => {
      const out: number[] = [];
      const walk = (f: Scenario['forces'][number]['formations'][number]): void => {
        for (const c of f.companies ?? []) if (/\(made up\)/.test(c.name)) out.push(c.strength.value);
        (f.children ?? []).forEach(walk);
      };
      s.forces.forEach((force) => force.formations.forEach(walk));
      return out;
    };
    const strengths = made(resolveDefaults(scenario, m.doctrines, m.tables).scenario);
    expect(strengths.length).toBeGreaterThan(0);
    expect(strengths.every((n) => n === 1)).toBe(true);
  });

  it('runScenario writes RunOptions.whatIf into the record, and a run without it has no whatIf key', () => {
    const x2 = withOverlay('overlays/vimy-germans-x2.yaml');
    expect(x2.whatIf).toMatchObject({ overlayId: 'vimy-germans-x2', title: 'Germans ×2' });
    expect(x2.whatIf!.changes.length).toBeGreaterThan(0);
    expect(x2.whatIf!.changes.every((c) => c.index === 0)).toBe(true);
    expect(Object.hasOwn(base(), 'whatIf')).toBe(false);
  }, 120000);

  it('the ground preset quagmire makes wetness() at least as high as normal, clamped to 1', () => {
    const { tables } = vimyDoctrines();
    const withGround = (preset: 'dry' | 'normal' | 'wet' | 'quagmire'): Scenario =>
      applyOverlay(vimy(), { id: 'g', title: 'ground', scenarioId: 'vimy-1917', ops: [{ op: 'ground', preset }] }, emptyLibrary(), DOCS).scenario;
    const normal = buildWorld(vimy(), tables);
    const quagmire = buildWorld(withGround('quagmire'), tables);
    const dry = buildWorld(withGround('dry'), tables);
    const minutes = Array.from({ length: 60 }, (_, i) => i * 60);
    expect(minutes.some((m) => wetness(normal, m) > 0 && wetness(normal, m) < 1)).toBe(true);
    for (const m of minutes) {
      const n = wetness(normal, m);
      expect(wetness(quagmire, m)).toBeGreaterThanOrEqual(n);
      expect(wetness(quagmire, m)).toBeLessThanOrEqual(1);
      expect(wetness(quagmire, m)).toBeCloseTo(Math.min(1, n * tables.effects.groundQuagmire.value), 9);
      expect(wetness(dry, m)).toBeLessThanOrEqual(n);
    }
    expect(minutes.some((m) => wetness(quagmire, m) === 1)).toBe(true);
    // An explicit normal ground is the scenario's own.
    const explicit = buildWorld(withGround('normal'), tables);
    for (const m of minutes) expect(wetness(explicit, m)).toBe(wetness(normal, m));
  });
});
