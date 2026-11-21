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
  units: [
    { id: 'c', battalionId: 'bn1', name: 'A Company', side: 'allied' },
    { id: 'g', battalionId: 'rir262', name: '1. Kompanie', side: 'central' },
  ],
  snapshots: [
    {
      minute: 0,
      companies: {
        columns: ['id', 'x', 'y', 'men', 'status', 'morale', 'suppression', 'posture', 'killed', 'wounded', 'captured'],
        rows: [
          ['c', 0, 0, 150, 'waiting', 1, 0, 'in-trench', 0, 0, 0],
          ['g', 9, 9, 120, 'holding', 1, 0, 'in-dugout', 0, 0, 0],
        ],
      },
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
const withRow = (row: unknown) => {
  const r = good();
  return { ...r, snapshots: [{ ...r.snapshots[0]!, companies: { ...r.snapshots[0]!.companies, rows: [row] } }] };
};
const withUnit = (u: unknown) => ({ ...good(), units: [...good().units, u] });
/** The good record with one trench segment in its geometry and its state in the snapshot. */
const withSegments = (geometrySegments: unknown = [{ id: 't:001', featureId: 't', garrisonIds: ['g'], yMin: 0, yMax: 10, lengthM: 11.2 }], snapshotSegments: unknown = { columns: ['segment', 'holder', 'wireCut', 'emerged'], rows: [[0, 'central', 0.85, false]] }) => {
  const r = good();
  return { ...r, geometry: { ...r.geometry, segments: geometrySegments }, snapshots: [{ ...r.snapshots[0]!, segments: snapshotSegments }] };
};
const segRows = (rows: unknown[]) => withSegments(undefined, { columns: ['segment', 'holder', 'wireCut', 'emerged'], rows });

describe('parseRunRecord', () => {
  it('accepts a well-formed record, with features and holding companies', () => {
    const r = parseRunRecord(good());
    expect(r.zeroHour).toBe('1917-04-09T05:30');
    expect(r.geometry.features.map((f) => f.kind)).toEqual(['trench', 'wood', 'crater']);
    expect(r.snapshots[0]!.companies.rows.map((c) => c[4])).toEqual(['waiting', 'holding']);
  });

  it('accepts a record with trench segments and their state in each snapshot', () => {
    const r = parseRunRecord(withSegments());
    expect(r.geometry.segments.map((x) => x.id)).toEqual(['t:001']);
    expect(r.snapshots[0]!.segments.rows).toEqual([[0, 'central', 0.85, false]]);
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
    ['a company with an unknown status', () => withRow(['c', 0, 0, 1, 'fleeing', 1, 0, 'moving', 0, 0, 0]), /snapshots\[0\]\.companies\.rows\[0\]/],
    ['a company without a position', () => withRow(['c', null, null, 1, 'waiting', 1, 0, 'moving', 0, 0, 0]), /snapshots\[0\]\.companies\.rows\[0\]/],
    ['a row shorter than the columns', () => withRow(['c', 0, 0, 1, 'waiting']), /snapshots\[0\]\.companies\.rows\[0\]/],
    ['a row for a company that is not a unit', () => withRow(['x', 0, 0, 1, 'waiting', 1, 0, 'moving', 0, 0, 0]), /snapshots\[0\]\.companies\.rows\[0\]/],
    ['company columns without morale, suppression and posture', () => ({ ...good(), snapshots: [{ minute: 0, companies: { columns: ['id', 'x', 'y', 'men', 'status'], rows: [] }, barrages: [] }] }), /snapshots\[0\]\.companies\.columns lacks morale, suppression, posture/],
    ['a morale above 1', () => withRow(['c', 0, 0, 1, 'waiting', 1.5, 0, 'moving', 0, 0, 0]), /snapshots\[0\]\.companies\.rows\[0\]/],
    ['an unknown posture', () => withRow(['c', 0, 0, 1, 'waiting', 1, 0, 'flying', 0, 0, 0]), /snapshots\[0\]\.companies\.rows\[0\]/],
    ['company columns without men', () => ({ ...good(), snapshots: [{ minute: 0, companies: { columns: ['id', 'x', 'y', 'status'], rows: [] }, barrages: [] }] }), /snapshots\[0\]\.companies\.columns lacks men/],
    ['companies as a list of objects (a record from before engine 0.3.0)', () => ({ ...good(), snapshots: [{ minute: 0, companies: [], barrages: [] }] }), /snapshots\[0\]/],
    ['no units (a record from before engine 0.3.0)', () => { const { units: _, ...r } = good(); return r; }, /units must be an array/],
    ['a unit on an unknown side', () => withUnit({ id: 'n', battalionId: 'b', name: 'N', side: 'neutral' }), /units\[2\]/],
    ['empty snapshots', () => ({ ...good(), snapshots: [] }), /snapshots/],
    ['a malformed snapshot', () => ({ ...good(), snapshots: [{ minute: 0 }] }), /snapshots\[0\]/],
    ['a barrage without done (a record from before barrage phases)', () => ({ ...good(), snapshots: [{ ...good().snapshots[0]!, barrages: [{ sectorId: 's', points: [] }] }] }), /snapshots\[0\]\.barrages\[0\]/],
    ['a barrage without points', () => ({ ...good(), snapshots: [{ ...good().snapshots[0]!, barrages: [{ sectorId: 's', done: true }] }] }), /snapshots\[0\]\.barrages\[0\]/],
    ['events not an array', () => ({ ...good(), events: {} }), /events/],
    ['a malformed event', () => ({ ...good(), events: [{ minute: 'x', text: 'a' }] }), /events\[0\]/],
    ['a terrain grid whose cells do not match cols × rows', () => withTerrain({ ...terrain(), rows: 3 }), /geometry\.terrain: .*2 × 3 = 6 cells but elevDm holds 4/],
    ['a terrain grid with a zero cell size', () => withTerrain({ ...terrain(), cellM: 0 }), /geometry\.terrain: .*cellM/],
    ['a terrain grid that is not an object', () => withTerrain('hills'), /geometry\.terrain/],
    ['a negative end', () => ({ ...good(), endMinute: -1 }), /endMinute/],
    ['geometry segments that are not an array', () => withSegments({}), /geometry\.segments must be an array/],
    ['a segment without a feature', () => withSegments([{ id: 's', garrisonIds: [], yMin: 0, yMax: 1, lengthM: 1 }]), /geometry\.segments\[0\]/],
    ['a segment with yMin above yMax', () => withSegments([{ id: 's', featureId: 't', garrisonIds: [], yMin: 5, yMax: 1, lengthM: 1 }]), /geometry\.segments\[0\]/],
    ['segments in the geometry but none in a snapshot', () => { const r = withSegments(); const { segments: _, ...snap } = r.snapshots[0]!; return { ...r, snapshots: [snap] }; }, /snapshots\[0\]\.segments needs columns and rows/],
    ['segment state without geometry segments', () => ({ ...good(), snapshots: [{ ...good().snapshots[0]!, segments: { columns: [], rows: [] } }] }), /snapshots\[0\]\.segments needs geometry\.segments/],
    ['segment columns without wireCut', () => withSegments(undefined, { columns: ['segment', 'holder', 'emerged'], rows: [[0, 'central', false]] }), /snapshots\[0\]\.segments\.columns lacks wireCut/],
    ['a missing segment row', () => segRows([]), /one row per segment/],
    ['a segment row indexing no segment', () => segRows([[1, 'central', 0, false]]), /snapshots\[0\]\.segments\.rows\[0\]/],
    ['a segment row with an unknown holder', () => segRows([[0, 'neutral', 0, false]]), /snapshots\[0\]\.segments\.rows\[0\]/],
    ['a wire cut above 1', () => segRows([[0, 'central', 1.2, false]]), /snapshots\[0\]\.segments\.rows\[0\]/],
    ['an emerged flag that is not a boolean', () => segRows([[0, 'central', 0.5, 0]]), /snapshots\[0\]\.segments\.rows\[0\]/],
  ])('rejects %s', (_, make, message) => {
    expect(() => parseRunRecord(make())).toThrow(message);
  });
});
