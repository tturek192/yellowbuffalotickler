import { describe, it, expect } from 'vitest';
import { geoToScenarioParts, type GeoJsonFeature } from './geo';

const frame = { origin: { lon: 2.7735, lat: 50.3796 }, bearingDeg: { value: 90, estimate: 'test' }, extent: { minX: -5000, maxX: 9000, minY: -6000, maxY: 6000 } };
const featureCollection = (features: GeoJsonFeature[]) => ({ type: 'FeatureCollection' as const, features });
const line = (id: string, kind: string, coordinates: number[][]): GeoJsonFeature => ({
  type: 'Feature',
  properties: { id, kind, name: id, side: 'allied', color: '#000' },
  geometry: { type: 'LineString', coordinates },
});

describe('geoToScenarioParts', () => {
  it('rejects swapped lon/lat with the file and feature named (Review Focus 1)', () => {
    const fc = featureCollection([line('black-1cdn', 'objective-line', [[50.37, 2.77], [50.38, 2.77]])]);
    expect(geoToScenarioParts(fc, frame, 'geo/lines.geojson').problems[0]).toMatch(/geo\/lines\.geojson#black-1cdn: point 0 .* outside the scenario extent — are lon\/lat swapped\?/);
  });
  it('names the first vertex where an engine line stops increasing in y (Review Focus 3)', () => {
    const fc = featureCollection([line('red-4cdn', 'objective-line', [[2.78, 50.37], [2.78, 50.38], [2.781, 50.3799]])]);
    expect(geoToScenarioParts(fc, frame, 'geo/lines.geojson').problems[0]).toMatch(/#red-4cdn: y must strictly increase along the line; vertex 2/);
  });
  it('turns lines into Plan 1 lines (front-line -> trench, objective-line -> objective)', () => {
    const fc = featureCollection([
      line('a', 'front-line', [[2.77, 50.37], [2.771, 50.375]]),
      line('b', 'objective-line', [[2.78, 50.37], [2.781, 50.375]]),
    ]);
    const r = geoToScenarioParts(fc, frame, 'f');
    expect(r.problems).toEqual([]);
    expect(r.lines.map((l) => [l.id, l.kind, l.side, l.color])).toEqual([['a', 'trench', 'allied', '#000'], ['b', 'objective', 'allied', '#000']]);
  });
  it('turns a trench LineString into a feature with its citation', () => {
    const fc = featureCollection([{ ...line('ger-front-a', 'trench', [[2.77, 50.37], [2.771, 50.375]]), properties: { id: 'ger-front-a', kind: 'trench', side: 'central', source: 'nicholson-1962', page: 'Map 7' } }]);
    const r = geoToScenarioParts(fc, frame, 'f');
    expect(r.features[0]).toMatchObject({ id: 'ger-front-a', kind: 'trench', side: 'central', cite: { source: 'nicholson-1962', page: 'Map 7' } });
  });
  it('accepts an estimate citation, a Point radius, and rejects a missing citation', () => {
    const pt = (props: Record<string, unknown>): GeoJsonFeature => ({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [2.775, 50.38] } });
    const ok = geoToScenarioParts(featureCollection([pt({ id: 'c1', kind: 'crater', estimate: 'eyeballed', radiusM: 12 })]), frame, 'f');
    expect(ok.features[0]).toMatchObject({ geometry: { type: 'Point', radiusM: 12 }, cite: { estimate: 'eyeballed' } });
    const bad = geoToScenarioParts(featureCollection([pt({ id: 'c2', kind: 'crater' })]), frame, 'f');
    expect(bad.problems[0]).toMatch(/f#c2: needs properties.source/);
  });
});
