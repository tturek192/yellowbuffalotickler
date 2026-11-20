import { describe, expect, it } from 'vitest';
import type { Scenario } from './schema';
import { est, minimalScenario } from './test-fixtures';
import {
  allFormations,
  attackingCompanies,
  battalions,
  companiesOf,
  divisionOf,
  formation,
  formationIds,
  inExtent,
  leader,
  regimentsOf,
} from './queries';

/** Two sides: an allied division → brigade → battalion, and a central division → regiment → battalion. */
function twoSided(): Scenario {
  const s = minimalScenario();
  const bn = s.forces[0]!.formations[0]!;
  s.leaders = [{ id: 'gen', name: { value: 'A. General', source: 'test-src' }, rank: { value: 'Major-General', source: 'test-src' } }];
  s.forces[0]!.formations = [
    { id: 'div1', name: '1st Division', kind: 'division', leaderId: 'gen', children: [{ id: 'bde1', name: '1st Brigade', kind: 'brigade', children: [bn] }] },
  ];
  s.forces.push({
    side: 'central',
    doctrine: 'bef-1917',
    formations: [
      {
        id: 'rd79',
        name: '79th Reserve Division',
        kind: 'division',
        children: [
          {
            id: 'rir261',
            name: 'RIR 261',
            kind: 'regiment',
            children: [
              {
                id: 'i-261',
                name: 'I/RIR 261',
                kind: 'battalion',
                companies: [{ id: 'g1', name: '1st Company', strength: est(150), start: [200, 100], role: 'garrison' }],
              },
            ],
          },
          { id: 'rir262', name: 'RIR 262', kind: 'regiment' },
        ],
      },
    ],
  });
  return s;
}

describe('scenario queries', () => {
  it('lists every formation depth-first with its side, and finds one by id', () => {
    const s = twoSided();
    expect(allFormations(s).map((f) => [f.id, f.side])).toEqual([
      ['div1', 'allied'], ['bde1', 'allied'], ['bn1', 'allied'],
      ['rd79', 'central'], ['rir261', 'central'], ['i-261', 'central'], ['rir262', 'central'],
    ]);
    expect(formation(s, 'bde1').kind).toBe('brigade');
    expect(() => formation(s, 'nope')).toThrow(/unknown formation "nope"/);
    expect(formationIds(s, 'central')).toEqual(['rd79', 'rir261', 'i-261', 'rir262']);
  });

  it('finds a division’s regiments, each side’s battalions and companies, and the attacking companies', () => {
    const s = twoSided();
    expect(regimentsOf(s, 'rd79').map((r) => r.id)).toEqual(['rir261', 'rir262']);
    expect(battalions(s, 'allied').map((b) => b.id)).toEqual(['bn1']);
    expect(companiesOf(s, 'central').map((c) => c.id)).toEqual(['g1']);
    expect(attackingCompanies(s).map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('names a company’s division, and refuses a company outside any division', () => {
    const s = twoSided();
    expect(divisionOf(s, companiesOf(s, 'allied')[0]!)).toBe('div1');
    const orphan = minimalScenario();
    expect(() => divisionOf(orphan, orphan.forces[0]!.formations[0]!.companies![0]!)).toThrow(/c1.*no division/);
  });

  it('finds a leader by id', () => {
    const s = twoSided();
    expect(leader(s, 'gen').name.value).toBe('A. General');
    expect(() => leader(s, 'nobody')).toThrow(/unknown leader "nobody"/);
  });

  it('checks a local or lon/lat start against the frame extent', () => {
    const s = minimalScenario();
    expect(() => inExtent(s, [0, 0])).toThrow(/no frame/);
    s.frame = { origin: { lon: 2.7736, lat: 50.3794 }, bearingDeg: est(90), extent: { minX: -100, maxX: 100, minY: -100, maxY: 100 } };
    expect(inExtent(s, [0, 0])).toBe(true);
    expect(inExtent(s, [150, 0])).toBe(false);
    expect(inExtent(s, { lonLat: [2.7736, 50.3794] })).toBe(true);
    expect(inExtent(s, { lonLat: [2.79, 50.3794] })).toBe(false);
  });
});
