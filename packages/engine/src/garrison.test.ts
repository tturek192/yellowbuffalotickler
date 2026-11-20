import { describe, expect, it } from 'vitest';
import { est, fixtureWithDoctrine, germanForce } from '@wwi/scenario/test-fixtures';
import type { Doctrine, Scenario } from '@wwi/scenario';
import { runScenario } from './run';

type Company = NonNullable<Scenario['forces'][number]['formations'][number]['companies']>[number];

const garrison = (i: number, extra: Partial<Company> = {}): Company => ({
  id: `g${i}`,
  name: `${i}. Kompanie`,
  role: 'garrison',
  strength: est(120),
  start: [200 + 60 * (i % 2), 30 + 60 * i],
  ...extra,
});

function withGerman(companies: Company[]): { scenario: Scenario; doctrines: Record<string, Doctrine> } {
  const { scenario, doctrines } = fixtureWithDoctrine();
  scenario.forces.push(germanForce(companies));
  return { scenario, doctrines: { ...doctrines, 'de-1917': { ...doctrines['bef-1917']!, id: 'de-1917' } } };
}

/** fixtureWithDoctrine + 6 central garrison companies. */
const fixtureWithGarrisons = () => withGerman(Array.from({ length: 6 }, (_, i) => garrison(i)));

const cite = { value: 'schematic', estimate: 'test fixture' };

function fixtureWithFeatures(): { scenario: Scenario; doctrines: Record<string, Doctrine> } {
  const f = fixtureWithDoctrine();
  f.scenario.features = [
    { id: 't1', kind: 'trench', side: 'central', geometry: { type: 'LineString', coordinates: [[150, 0], [160, 400]] }, cite },
    { id: 'w1', kind: 'wood', geometry: { type: 'Polygon', coordinates: [[400, 50], [600, 50], [500, 200]] }, cite },
    { id: 'k1', kind: 'crater', geometry: { type: 'Point', coordinates: [300, 250], radiusM: 15 }, cite },
  ];
  return f;
}

const allied = (r: ReturnType<typeof runScenario>) =>
  r.snapshots.map((s) => s.companies.filter((c) => c.side === 'allied'));

describe('garrison and reserve companies', () => {
  it('garrisons hold, and do not block the early stop (Review Focus 4)', () => {
    const { scenario, doctrines } = fixtureWithGarrisons();
    const r = runScenario(scenario, doctrines, { seed: 1 });
    const first = r.snapshots[0]!.companies.filter((c) => c.side === 'central');
    const last = r.snapshots.at(-1)!.companies.filter((c) => c.side === 'central');
    expect(first).toHaveLength(6);
    expect(last.map((c) => [c.x, c.y, c.status])).toEqual(first.map((c) => [c.x, c.y, 'holding']));
    expect(r.endMinute).toBeLessThan(scenario.timeLimitMinutes);
  });

  it('holding companies start as holding', () => {
    const { scenario, doctrines } = fixtureWithGarrisons();
    const r = runScenario(scenario, doctrines, { seed: 1 });
    expect(r.snapshots[0]!.companies.filter((c) => c.side === 'central').every((c) => c.status === 'holding')).toBe(true);
  });

  it('a garrison with an objective line but no sector holds instead of crashing', () => {
    const { scenario, doctrines } = withGerman([garrison(0, { objectiveLineId: 'black' })]);
    const r = runScenario(scenario, doctrines, { seed: 1 });
    const g = r.snapshots.at(-1)!.companies.find((c) => c.id === 'g0')!;
    expect([g.x, g.y, g.status]).toEqual([200, 30, 'holding']);
  });

  it('a reserve with an objective line and sector holds, and does not stop the line being taken', () => {
    const { scenario, doctrines } = fixtureWithDoctrine();
    scenario.forces[0]!.formations[0]!.companies!.push({
      id: 'res', name: 'Reserve', role: 'reserve', strength: est(150), start: [-300, 200], sectorId: 's1', objectiveLineId: 'black',
    });
    const r = runScenario(scenario, doctrines, { seed: 1 });
    const res = r.snapshots.at(-1)!.companies.find((c) => c.id === 'res')!;
    expect([res.x, res.y, res.status]).toEqual([-300, 200, 'holding']);
    expect(r.summary.lineTaken.map((t) => t.lineId)).toEqual(['black']);
    expect(r.endMinute).toBeLessThan(scenario.timeLimitMinutes);
  });

  it('adding garrisons does not change the attackers’ run for a seed', () => {
    const plain = fixtureWithDoctrine();
    const { scenario, doctrines } = fixtureWithGarrisons();
    // German force listed first, so any random draws it took would shift the Allied ones.
    scenario.forces.reverse();
    const a = runScenario(plain.scenario, plain.doctrines, { seed: 5 });
    const b = runScenario(scenario, doctrines, { seed: 5 });
    expect(allied(b)).toEqual(allied(a));
    expect(b.summary).toEqual(a.summary);
  });
});

describe('record features', () => {
  it('the record carries features in local metres', () => {
    const { scenario, doctrines } = fixtureWithFeatures();
    const r = runScenario(scenario, doctrines, { seed: 1 });
    expect(r.geometry.features.map((f) => f.kind)).toEqual(['trench', 'wood', 'crater']);
    expect(r.geometry.features[2]!.geometry).toEqual({ type: 'Point', coordinates: [300, 250], radiusM: 15 });
  });
});
