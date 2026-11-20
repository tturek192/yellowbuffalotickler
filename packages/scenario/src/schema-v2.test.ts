import { describe, it, expect } from 'vitest';
import { parseScenario } from './load';
import { checkReferences } from './references';
import { minimalScenarioV2, germanForce, est, wx, toYaml } from './test-fixtures';

const DOC = ['bef-1917', 'de-1917'];
const garrison = (extra: Record<string, unknown> = {}) => ({
  id: 'rir262-1', name: '1./RIR 262', role: 'garrison' as const, strength: est(150), paperStrength: est(264),
  start: [400, 100] as [number, number], trenchFeatureId: 'ger-front-a', ...extra,
});

describe('scenario v2', () => {
  it('garrison companies need no sector or objective; assault companies still do', () => {
    const s = minimalScenarioV2();
    s.forces.push(germanForce([garrison()]));
    expect(() => parseScenario(toYaml(s), DOC)).not.toThrow();
    delete (s.forces[0]!.formations[0]!.companies![0] as any).objectiveLineId;
    expect(() => parseScenario(toYaml(s), DOC)).toThrow(/companies\[0\]\.objectiveLineId: required for role "assault"/);
  });
  it('checks leader references', () => {
    const s = minimalScenarioV2();
    s.forces[0]!.formations[0]!.leaderId = 'nobody';
    expect(() => parseScenario(toYaml(s), DOC)).toThrow(/leaderId: unknown leader "nobody"/);
  });
  it('trenchFeatureId must name a trench or strongpoint feature', () => {
    const s = minimalScenarioV2();
    s.forces.push(germanForce([garrison({ trenchFeatureId: 'missing' })]));
    expect(() => parseScenario(toYaml(s), DOC)).toThrow(/trenchFeatureId: unknown feature "missing"/);
    s.forces[1]!.formations[0]!.companies![0]!.trenchFeatureId = 'old-wood';
    expect(() => parseScenario(toYaml(s), DOC)).toThrow(/trenchFeatureId: feature "old-wood" is a wood/);
  });
  it('checks formation references in reserves, artillery and historical results', () => {
    const s = minimalScenarioV2();
    s.reserves = [{ formationId: 'ghost', side: 'central', distanceKm: est(8) as any, entryPoint: [900, 200] }];
    s.artillery = [{ id: 'g1', side: 'allied', formationId: 'ghost2', weapon: '18-pdr', count: est(100) as any, role: 'creeping' }];
    s.historical.casualties = [{ side: 'allied', formationId: 'ghost3', window: { from: '1917-04-09T05:30', to: '1917-04-09T18:00' }, total: est(10) as any }];
    s.historical.reserveArrivals = [{ formationId: 'ghost4', at: { value: '1917-04-09T12:00', estimate: 't' }, where: 'Farbus' }];
    const p = checkReferences(s, DOC);
    for (const n of ['reserves[0].formationId', 'artillery[0].formationId', 'historical.casualties[0].formationId', 'historical.reserveArrivals[0].formationId']) {
      expect(p.some((m) => m.startsWith(n))).toBe(true);
    }
  });
  it('leader ratings are integers 1–5', () => {
    const s = minimalScenarioV2();
    const r = est(3);
    s.leaders[0]!.ratings = { planning: est(6), orderSpeed: r, adaptiveness: r, riskTolerance: r, moraleEffect: r };
    expect(() => parseScenario(toYaml(s), DOC)).toThrow(/leaders\[0\]\.ratings\.planning/);
  });
  it('weather must be in time order', () => {
    const s = minimalScenarioV2();
    s.weather = [wx('1917-04-09T06:00'), wx('1917-04-09T05:00')];
    expect(() => parseScenario(toYaml(s), DOC)).toThrow(/weather\[1\]\.at: must be after weather\[0\]\.at/);
  });
  it('accepts a full set of v2 sections', () => {
    const s = minimalScenarioV2();
    s.weather = [wx('1917-04-09T05:00'), wx('1917-04-09T06:00')];
    s.counterBattery = { side: 'allied', suppressedAtZeroFrac: est(0.8) as any, note: 'test' };
    s.artillery = [{ id: 'g1', side: 'allied', weapon: '18-pdr', count: est(100) as any, role: 'creeping' }];
    s.historical.endedAt = { value: '1917-04-12T00:00', estimate: 't' };
    expect(() => parseScenario(toYaml(s), DOC)).not.toThrow();
  });
  it('historical results reject non-official sources', () => {
    const s = minimalScenarioV2();
    s.sources['weak'] = { title: 'Weak', tier: 'secondary' };
    s.historical.prisonersTaken = [{ bySide: 'allied', window: { from: '1917-04-09T05:30', to: '1917-04-09T18:00' }, count: { value: 4000, source: 'weak' } as any }];
    expect(() => parseScenario(toYaml(s), DOC)).toThrow(/historical\.prisonersTaken\[0\]\.count\.source/);
  });
});
