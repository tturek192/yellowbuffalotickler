import { describe, expect, it } from 'vitest';
import { est, germanForce, minimalScenario } from '@wwi/scenario/test-fixtures';
import type { Feature, Scenario } from '@wwi/scenario';
import { deriveSegments } from './segments';

const cite = { value: 'schematic', estimate: 'test fixture' };
const trench = (id: string, coordinates: Array<[number, number]>): Feature => ({ id, kind: 'trench', side: 'central', geometry: { type: 'LineString', coordinates }, cite });
const garrison = (id: string, y: number, featureId: string, x = 100) => ({
  id, name: id, role: 'garrison' as const, strength: est(120), start: [x, y] as [number, number], trenchFeatureId: featureId, dugoutDepthM: est(6),
});

/** A German trench from y −500 to 500 with garrisons at y −300, 0 and 300 (given out of order). */
function threeGarrisonsOnOneTrench(): Scenario {
  const s = minimalScenario();
  s.features = [trench('t', [[100, -500], [100, 500]])];
  s.forces.push(germanForce([garrison('g3', 300, 't'), garrison('g1', -300, 't'), garrison('g2', 0, 't')]));
  return s;
}

function scenarioWith(features: Feature[], companies: ReturnType<typeof garrison>[]): Scenario {
  const s = minimalScenario();
  s.features = features;
  s.forces.push(germanForce(companies));
  return s;
}

describe('deriveSegments', () => {
  it('segments tile each German trench feature without gaps or overlaps between its garrisons', () => {
    const segs = deriveSegments(threeGarrisonsOnOneTrench());
    expect(segs.map(x => [x.yMin, x.yMax])).toEqual([[-500, -150], [-150, 150], [150, 500]]);
  });

  it('gives each segment its garrison, feature, length and a fresh state, south to north', () => {
    const segs = deriveSegments(threeGarrisonsOnOneTrench());
    expect(segs.map((x) => x.garrisonIds)).toEqual([['g1'], ['g2'], ['g3']]);
    expect(segs.map((x) => x.lengthM)).toEqual([350, 300, 350]);
    expect(segs.map((x) => x.id)).toEqual([...segs.map((x) => x.id)].sort());
    expect(new Set(segs.map((x) => x.id)).size).toBe(3);
    expect(segs[0]).toMatchObject({
      featureId: 't', holder: 'central', wireCut: 0, wireBeltDepthM: 0, trenchDamage: 0, dugoutDamage: 0, dugoutDepthM: 6,
      spared: false, barrageLastOverMin: null, emerged: false, dugoutPoints: [],
    });
  });

  it('measures a segment along the trench line, not just its y extent', () => {
    const [seg] = deriveSegments(scenarioWith([trench('t', [[0, 0], [300, 400]])], [garrison('g1', 200, 't', 150)]));
    expect(seg!.lengthM).toBeCloseTo(500, 6);
  });

  it('garrisons at the same place share one segment', () => {
    const segs = deriveSegments(scenarioWith([trench('t', [[100, 0], [100, 400]])], [garrison('a', 100, 't'), garrison('b', 100, 't'), garrison('c', 300, 't')]));
    expect(segs.map((x) => [x.garrisonIds, x.yMin, x.yMax])).toEqual([[['a', 'b'], 0, 200], [['c'], 200, 400]]);
  });

  it('a garrison past the end of its trench gets a segment clamped to the trench', () => {
    const segs = deriveSegments(scenarioWith([trench('t', [[100, -500], [100, 500]])], [garrison('a', 0, 't'), garrison('b', 1200, 't')]));
    expect(segs.map((x) => [x.yMin, x.yMax])).toEqual([[-500, 500], [500, 500]]);
    expect(segs[1]!.lengthM).toBe(0);
  });

  it('the garrisons of a point strongpoint share one zero-length segment there; features without garrisons get none', () => {
    const sp: Feature = { id: 'sp', kind: 'strongpoint', side: 'central', geometry: { type: 'Point', coordinates: [300, 250] }, cite };
    const segs = deriveSegments(scenarioWith([trench('empty', [[0, 0], [0, 400]]), sp], [garrison('b', 240, 'sp', 300), garrison('a', 260, 'sp', 300)]));
    expect(segs.map((x) => [x.featureId, x.garrisonIds, x.yMin, x.yMax, x.lengthM])).toEqual([['sp', ['a', 'b'], 250, 250, 0]]);
  });

  it('needs every garrison dugout depth resolved', () => {
    const s = threeGarrisonsOnOneTrench();
    delete s.forces[1]!.formations[0]!.companies![0]!.dugoutDepthM;
    expect(() => deriveSegments(s)).toThrow(/g3: dugoutDepthM/);
  });
});
