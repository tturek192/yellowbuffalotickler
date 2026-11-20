import { stringify } from 'yaml';
import type { Doctrine, Scenario } from './schema';

export const est = (value: number, estimate = 'test fixture') => ({ value, estimate });

export function minimalScenario(): Scenario {
  return {
    id: 'fixture',
    title: 'Fixture scenario',
    status: 'draft',
    sources: { 'test-src': { title: 'Test source', tier: 'official' } },
    zeroHour: { value: '1916-07-01T07:30', estimate: 'test fixture' },
    timeLimitMinutes: 600,
    geometrySource: { value: 'fixture geometry', estimate: 'synthetic test geometry' },
    features: [],
    leaders: [],
    reserves: [],
    artillery: [],
    weather: [],
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
      casualties: [],
      prisonersTaken: [],
      reserveArrivals: [],
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

type Company = NonNullable<Scenario['forces'][number]['formations'][number]['companies']>[number];

/** The minimal scenario plus one leader, a German trench feature and a German doctrine reference. */
export function minimalScenarioV2(): Scenario {
  const s = minimalScenario();
  s.leaders = [
    { id: 'currie', name: est2('Arthur Currie'), rank: est2('Major-General') },
  ];
  s.features = [
    {
      id: 'ger-front-a',
      kind: 'trench',
      side: 'central',
      geometry: { type: 'LineString', coordinates: [[150, 0], [150, 400]] },
      cite: est2('schematic'),
    },
    { id: 'old-wood', kind: 'wood', geometry: { type: 'Point', coordinates: [500, 200] }, cite: est2('schematic') },
  ];
  s.forces[0]!.formations[0]!.leaderId = 'currie';
  return s;
}

function est2<T>(value: T) {
  return { value, estimate: 'test fixture' };
}

/** A German force (doctrine de-1917) holding one battalion with the given companies. */
export function germanForce(companies: Array<Omit<Company, 'start'> & { start: Company['start'] }>): Scenario['forces'][number] {
  return {
    side: 'central',
    doctrine: 'de-1917',
    formations: [{ id: 'rir262', name: 'RIR 262', kind: 'regiment', companies }],
  };
}

export function wx(at: string): Scenario['weather'][number] {
  return { at, precipitation: { value: 'rain', estimate: 'test fixture' } };
}

/** 3 sourced, 2 estimates and 1 disputed value, with a mix in the first section (historical targets). */
export function fixtureWithMixedValues(): Scenario {
  const s = minimalScenario();
  s.sources['gossip'] = { title: 'A blog', tier: 'tertiary' };
  s.zeroHour = { value: '1916-07-01T07:30', source: 'test-src', page: '1' };
  s.geometrySource = { value: 'a map', source: 'test-src' };
  s.frame = {
    origin: { lon: 2, lat: 50 },
    bearingDeg: est(75, 'measured off the map'),
    extent: { minX: -10, maxX: 10, minY: -10, maxY: 10 },
  } as Scenario['frame'];
  s.lines = [];
  s.sectors = [];
  s.forces = [];
  s.historical = {
    objectives: [
      {
        lineId: 'black',
        sectorId: 's1',
        earliest: { value: '1916-07-01T09:00', estimate: 'inferred from the timetable' },
        latest: { value: '1916-07-01T12:00', source: 'test-src', page: '5' },
      },
    ],
    casualties: [],
    prisonersTaken: [],
    reserveArrivals: [],
    endedAt: {
      value: '1916-07-01T20:00',
      range: ['1916-07-01T18:00', '1916-07-01T22:00'],
      sources: [{ source: 'test-src', page: '9' }, { source: 'gossip' }],
      note: 'sources disagree',
    },
  };
  return s;
}

export function fixtureWithLeaders(): Scenario {
  const s = fixtureWithMixedValues();
  s.leaders = [
    {
      id: 'currie',
      name: { value: 'Arthur Currie', source: 'test-src' },
      rank: { value: 'Major-General', estimate: 'test fixture' },
      ratings: { planning: est(5, 'well-documented planner') } as NonNullable<Scenario['leaders'][number]['ratings']>,
    },
  ];
  return s;
}

