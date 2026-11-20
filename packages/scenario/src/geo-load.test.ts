import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadScenario } from './load-node';
import { checkReferences } from './references';
import { minimalScenario, toYaml, fixtureWithDoctrine } from './test-fixtures';

const frame = { origin: { lon: 2.7735, lat: 50.3796 }, bearingDeg: { value: 90, estimate: 't' }, extent: { minX: -5000, maxX: 9000, minY: -6000, maxY: 6000 } };
const fc = (props: Record<string, unknown>, coordinates: number[][]) => ({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates } }],
});

function setup(geo: unknown, withFrame = true) {
  const dir = mkdtempSync(join(tmpdir(), 'wwi-geo-'));
  mkdirSync(join(dir, 'doctrine'));
  writeFileSync(join(dir, 'doctrine', 'bef-1917.yaml'), toYaml(fixtureWithDoctrine().doctrines['bef-1917']));
  mkdirSync(join(dir, 'geo'));
  if (geo !== undefined) writeFileSync(join(dir, 'geo', 'f.geojson'), typeof geo === 'string' ? geo : JSON.stringify(geo));
  const s = { ...minimalScenario(), lines: [], sectors: [], forces: [], historical: { objectives: [] }, geo: ['geo/f.geojson'], ...(withFrame ? { frame } : {}) };
  writeFileSync(join(dir, 's.yaml'), toYaml(s));
  return { path: join(dir, 's.yaml'), doctrineDir: join(dir, 'doctrine') };
}

describe('loadScenario geo files', () => {
  it('merges GeoJSON lines and features, projected to local metres', () => {
    const { path, doctrineDir } = setup(fc({ id: 'g', kind: 'front-line', name: 'G' }, [[2.77, 50.37], [2.771, 50.375]]));
    const { scenario } = loadScenario(path, doctrineDir);
    expect(scenario.lines.map((l) => [l.id, l.kind])).toEqual([['g', 'trench']]);
  });
  it('names a geo file that is missing, invalid, or whose geometry is bad', () => {
    expect(() => { const a = setup(undefined); loadScenario(a.path, a.doctrineDir); }).toThrow(/geo: cannot read geo\/f\.geojson/);
    expect(() => { const a = setup('{nope'); loadScenario(a.path, a.doctrineDir); }).toThrow(/geo: invalid JSON in geo\/f\.geojson/);
    expect(() => { const a = setup(fc({ id: 'x', kind: 'objective-line' }, [[50.37, 2.77], [50.38, 2.77]])); loadScenario(a.path, a.doctrineDir); }).toThrow(/geo\/f\.geojson#x: point 0 .* swapped/);
  });
  it('requires a frame when geo files are listed', () => {
    const { path, doctrineDir } = setup(fc({ id: 'g', kind: 'front-line' }, [[2.77, 50.37], [2.771, 50.375]]), false);
    expect(() => loadScenario(path, doctrineDir)).toThrow(/geo: a valid frame is required/);
  });
});

describe('checkReferences features', () => {
  it('flags duplicate feature ids', () => {
    const s = minimalScenario();
    const f = { id: 'f1', kind: 'crater' as const, geometry: { type: 'Point' as const, coordinates: [0, 0] as [number, number] }, cite: { value: 'm', estimate: 'e' } };
    s.features = [f, f];
    expect(checkReferences(s, ['bef-1917'])).toContain('features[1].id: duplicate id "f1" (first defined at features[0].id)');
  });
});
