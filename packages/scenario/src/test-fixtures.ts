import { stringify } from 'yaml';
import type { Doctrine, Scenario } from './schema';

const est = (value: number, estimate = 'test fixture') => ({ value, estimate });

export function minimalScenario(): Scenario {
  return {
    id: 'fixture',
    title: 'Fixture scenario',
    status: 'draft',
    sources: { 'test-src': { title: 'Test source' } },
    zeroHour: { value: '1916-07-01T07:30', estimate: 'test fixture' },
    timeLimitMinutes: 600,
    geometrySource: { value: 'fixture geometry', estimate: 'synthetic test geometry' },
    lines: [
      { id: 'gfront', name: 'German front line', kind: 'trench', side: 'central', points: [[150, 0], [150, 400]] },
      { id: 'black', name: 'Black Line', kind: 'objective', color: '#1a1a1a', points: [[1150, 0], [1150, 400]] },
    ],
    sectors: [
      {
        id: 's1',
        name: 'Sector 1',
        yMin: 0,
        yMax: 400,
        startLineId: 'gfront',
        legs: [{ toLineId: 'black', liftM: est(91), liftMin: est(3), pauseMin: est(40) }],
        standOffM: est(180),
      },
    ],
    forces: [
      {
        side: 'allied',
        doctrine: 'bef-1917',
        formations: [
          {
            id: 'bn1',
            name: '1st Battalion',
            kind: 'battalion',
            companies: [
              { id: 'c1', name: 'A Company', strength: est(150), start: [0, 100], sectorId: 's1', objectiveLineId: 'black', startAfterMin: est(0), role: 'assault' },
              { id: 'c2', name: 'B Company', strength: est(150), start: [0, 300], sectorId: 's1', objectiveLineId: 'black', startAfterMin: est(0), role: 'assault' },
            ],
          },
        ],
      },
    ],
    historical: {
      objectives: [
        { lineId: 'black', sectorId: 's1', earliest: { value: '1916-07-01T10:00', estimate: 'test fixture' }, latest: { value: '1916-07-01T14:00', estimate: 'test fixture' } },
      ],
    },
  };
}

export function toYaml(obj: unknown): string {
  return stringify(obj);
}

export function fixtureWithDoctrine(): { scenario: Scenario; doctrines: Record<string, Doctrine> } {
  const doctrine: Doctrine = {
    id: 'bef-1917',
    title: 'Fixture doctrine',
    sources: {},
    followDistanceM: est(70),
    maxAdvanceMPerMin: est(50),
    startJitterMin: est(2),
    speedJitterFrac: est(0.1),
  };
  return { scenario: minimalScenario(), doctrines: { 'bef-1917': doctrine } };
}

/** Clone the first formation's companies so the scenario holds n companies, spread across the sector. */
export function withManyCompanies(s: Scenario, n: number): Scenario {
  const clone: Scenario = structuredClone(s);
  const force = clone.forces[0]!;
  const bn = force.formations[0]!;
  const template = bn.companies![0]!;
  const sector = clone.sectors.find((x) => x.id === template.sectorId)!;
  const companies = Array.from({ length: n }, (_, i) => ({
    ...structuredClone(template),
    id: `c${i + 1}`,
    name: `Company ${i + 1}`,
    start: [0, sector.yMin + ((i + 0.5) / n) * (sector.yMax - sector.yMin)] as [number, number],
  }));
  bn.companies = companies;
  return clone;
}
