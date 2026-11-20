import { describe, expect, it } from 'vitest';
import { encodeTerrain } from '@wwi/scenario';
import { parseRunRecord } from './runRecord';

const good = () => ({
  scenarioTitle: 't',
  scenarioStatus: 'draft',
  zeroHour: '1917-04-09T05:30',
  endMinute: 10,
  geometry: {
    lines: [],
    sectors: [],
    features: [
      { id: 't', kind: 'trench', side: 'central', geometry: { type: 'LineString', coordinates: [[0, 0], [5, 10]] } },
      { id: 'w', kind: 'wood', geometry: { type: 'Polygon', coordinates: [[0, 0], [5, 10], [10, 0]] } },
      { id: 'k', kind: 'crater', geometry: { type: 'Point', coordinates: [3, 3], radiusM: 12 } },
    ],
  },
  snapshots: [
    {
      minute: 0,
      companies: [
        { id: 'c', side: 'allied', x: 0, y: 0, strength: 150, status: 'waiting' },
        { id: 'g', side: 'central', x: 9, y: 9, strength: 120, status: 'holding' },
      ],
      barrages: [{ sectorId: 's', done: false, points: [[0, 0], [0, 10]] }],
    },
  ],
  events: [{ minute: 0, kind: 'zero-hour', text: 'Zero hour', causes: [] }],
});

const withFeature = (f: unknown) => {
  const r = good();
  return { ...r, geometry: { ...r.geometry, features: [...r.geometry.features, f] } };
};
const terrain = () => ({ source: { source: 'ign-rge-alti' }, method: 'test', ...encodeTerrain({ cellM: 25, originX: 0, originY: 0, cols: 2, rows: 2, elevM: [1, 2, 3, 4] }) });
const withTerrain = (t: unknown) => {
  const r = good();
  return { ...r, geometry: { ...r.geometry, terrain: t } };
};
const withCompany = (c: unknown) => {
  const r = good();
  return { ...r, snapshots: [{ ...r.snapshots[0]!, companies: [c] }] };
};

describe('parseRunRecord', () => {
  it('accepts a well-formed record, with features and holding companies', () => {
    const r = parseRunRecord(good());
    expect(r.zeroHour).toBe('1917-04-09T05:30');
    expect(r.geometry.features.map((f) => f.kind)).toEqual(['trench', 'wood', 'crater']);
    expect(r.snapshots[0]!.companies.map((c) => c.status)).toEqual(['waiting', 'holding']);
  });

  it('accepts a record with a terrain grid', () => {
    expect(parseRunRecord(withTerrain(terrain())).geometry.terrain?.cols).toBe(2);
  });

  it.each([
    ['not an object', () => 42, /not a run record/],
    ['a bad zero hour', () => ({ ...good(), zeroHour: '9 April 1917' }), /zeroHour/],
    ['a zero hour with a zone', () => ({ ...good(), zeroHour: '1917-04-09T05:30Z' }), /zeroHour/],
    ['no geometry lines', () => ({ ...good(), geometry: { sectors: [] } }), /geometry\.lines/],
    ['no geometry sectors', () => ({ ...good(), geometry: { lines: [] } }), /geometry\.sectors/],
    ['no geometry features (a record from before engine 0.2.0)', () => ({ ...good(), geometry: { lines: [], sectors: [] } }), /geometry\.features/],
    ['a feature without an id', () => withFeature({ kind: 'wood', geometry: { type: 'Point', coordinates: [0, 0] } }), /geometry\.features\[3\]/],
    ['a feature of an unknown kind', () => withFeature({ id: 'x', kind: 'castle', geometry: { type: 'Point', coordinates: [0, 0] } }), /geometry\.features\[3\]/],
    ['a feature of an unknown geometry type', () => withFeature({ id: 'x', kind: 'wood', geometry: { type: 'MultiPolygon', coordinates: [] } }), /geometry\.features\[3\]/],
    ['a feature without geometry', () => withFeature({ id: 'x', kind: 'wood' }), /geometry\.features\[3\]/],
    ['a line feature with one point', () => withFeature({ id: 'x', kind: 'trench', geometry: { type: 'LineString', coordinates: [[0, 0]] } }), /geometry\.features\[3\]/],
    ['a polygon with two points', () => withFeature({ id: 'x', kind: 'wood', geometry: { type: 'Polygon', coordinates: [[0, 0], [1, 1]] } }), /geometry\.features\[3\]/],
    ['a point feature with bad coordinates', () => withFeature({ id: 'x', kind: 'crater', geometry: { type: 'Point', coordinates: ['a', 0] } }), /geometry\.features\[3\]/],
    ['a company with an unknown status', () => withCompany({ id: 'c', side: 'allied', x: 0, y: 0, strength: 1, status: 'fleeing' }), /snapshots\[0\]\.companies\[0\]/],
    ['a company without a position', () => withCompany({ id: 'c', side: 'allied', strength: 1, status: 'waiting' }), /snapshots\[0\]\.companies\[0\]/],
    ['a company on an unknown side', () => withCompany({ id: 'c', side: 'neutral', x: 0, y: 0, strength: 1, status: 'waiting' }), /snapshots\[0\]\.companies\[0\]/],
    ['empty snapshots', () => ({ ...good(), snapshots: [] }), /snapshots/],
    ['a malformed snapshot', () => ({ ...good(), snapshots: [{ minute: 0 }] }), /snapshots\[0\]/],
    ['a barrage without done (a record from before barrage phases)', () => ({ ...good(), snapshots: [{ minute: 0, companies: [], barrages: [{ sectorId: 's', points: [] }] }] }), /snapshots\[0\]\.barrages\[0\]/],
    ['a barrage without points', () => ({ ...good(), snapshots: [{ minute: 0, companies: [], barrages: [{ sectorId: 's', done: true }] }] }), /snapshots\[0\]\.barrages\[0\]/],
    ['events not an array', () => ({ ...good(), events: {} }), /events/],
    ['a malformed event', () => ({ ...good(), events: [{ minute: 'x', text: 'a' }] }), /events\[0\]/],
    ['a terrain grid whose cells do not match cols × rows', () => withTerrain({ ...terrain(), rows: 3 }), /geometry\.terrain: .*2 × 3 = 6 cells but elevDm holds 4/],
    ['a terrain grid with a zero cell size', () => withTerrain({ ...terrain(), cellM: 0 }), /geometry\.terrain: .*cellM/],
    ['a terrain grid that is not an object', () => withTerrain('hills'), /geometry\.terrain/],
    ['a negative end', () => ({ ...good(), endMinute: -1 }), /endMinute/],
  ])('rejects %s', (_, make, message) => {
    expect(() => parseRunRecord(make())).toThrow(message);
  });
});
