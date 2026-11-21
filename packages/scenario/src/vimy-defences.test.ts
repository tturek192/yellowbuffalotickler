import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScenario } from './load-node';
import { companiesOf } from './queries';
import { buildReview } from './review';
import type { Scenario } from './schema';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

let cached: Scenario | undefined;
function vimy(): Scenario {
  cached ??= loadScenario(resolve(repoRoot, 'scenarios/vimy-1917/scenario.yaml'), resolve(repoRoot, 'doctrine')).scenario;
  return cached;
}
function feature(s: Scenario, id: string) {
  const f = s.features.find(x => x.id === id);
  if (!f) throw new Error(`no feature ${id}`);
  return f;
}

describe('Vimy defences and the bombardment (Plan 3 Task 3)', () => {
  it('the bombardment allocates rounds that exist in the artillery park, and every wire belt and spared stretch lies on a German trench', () => {
    const s = vimy();
    for (const a of s.bombardment!.allocations) expect(s.artillery.map(x => x.id)).toContain(a.artilleryId);
    for (const w of [...s.bombardment!.wire, ...s.bombardment!.spared]) expect(feature(s, w.featureId).side).toBe('central');
  });
  it("records the 87th Battalion's front as spared, with its reason sourced", () => {
    expect(vimy().bombardment!.spared.some(x => 'source' in x.reason)).toBe(true);
  });
  it('every German garrison has machine guns and dugout depth (sourced, estimated or disputed)', () => {
    for (const c of companiesOf(vimy(), 'central').filter(c => c.role === 'garrison')) {
      expect(c.machineGuns).toBeDefined(); expect(c.dugoutDepthM).toBeDefined();
    }
  });
  // Guards beside the brief's three tests.
  it('has allocations, wire and a spared stretch, so the tests above are not vacuous', () => {
    const b = vimy().bombardment!;
    expect(b.allocations.length).toBeGreaterThan(0); expect(b.wire.length).toBeGreaterThan(0); expect(b.spared.length).toBeGreaterThan(0);
  });
  it('every wire belt and spared stretch is a non-empty y band inside its feature', () => {
    const s = vimy();
    for (const w of [...s.bombardment!.wire, ...s.bombardment!.spared]) {
      const g = feature(s, w.featureId).geometry;
      const ys = g.type === 'Point' ? [g.coordinates[1]] : g.coordinates.map(p => p[1]);
      expect(w.yMin, w.featureId).toBeLessThan(w.yMax);
      expect(w.yMin, w.featureId).toBeGreaterThanOrEqual(Math.min(...ys) - 1);
      expect(w.yMax, w.featureId).toBeLessThanOrEqual(Math.max(...ys) + 1);
    }
  });
  it("lists the bombardment's values in the owner's review, under the fire plan", () => {
    const rows = buildReview(vimy()).sections.find(x => x.title === 'Fire plan and artillery')!.rows;
    expect(rows.filter(r => r.path.startsWith('bombardment.')).length).toBe(1 + vimy().bombardment!.allocations.length + 4 + 1);
  });
  it('every Canadian company has officers, Lewis guns and its training', () => {
    const cdn = vimy().forces.find(f => f.side === 'allied')!.formations.find(f => f.id === 'cdn-corps')!;
    const british = /^(1rwk|2kosb|1[456]rwarwick|1norfolk|1bedford|1cheshire|1devon|1esurrey|1dcli|12glosters)-/;
    const companies = companiesOf(vimy(), 'allied').filter(c => !british.test(c.id));
    expect(cdn).toBeDefined(); expect(companies.length).toBeGreaterThan(150);
    for (const c of companies) {
      expect(c.officers, c.id).toBeDefined(); expect(c.lewisGuns, c.id).toBeDefined(); expect(c.training, c.id).toBe('rehearsed');
    }
  });
});
