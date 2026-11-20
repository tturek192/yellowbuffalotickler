import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadScenario } from './load-node';
import { minimalScenario, toYaml, fixtureWithDoctrine } from './test-fixtures';

const frame = { origin: { lon: 2.7735, lat: 50.3796 }, bearingDeg: { value: 90, estimate: 't' }, extent: { minX: -5000, maxX: 9000, minY: -6000, maxY: 6000 } };

function setup(withFrame: boolean, reserve = false, at: [number, number] = [2.7735, 50.3796], reserveAt = at) {
  const dir = mkdtempSync(join(tmpdir(), 'wwi-ll-'));
  mkdirSync(join(dir, 'doctrine'));
  writeFileSync(join(dir, 'doctrine', 'bef-1917.yaml'), toYaml(fixtureWithDoctrine().doctrines['bef-1917']));
  const s = minimalScenario();
  (s.forces[0]!.formations[0]!.companies![0] as any).start = { lonLat: at };
  const reserves = reserve
    ? [{ formationId: 'bn1', side: 'allied', distanceKm: { value: 5, estimate: 't' }, entryPoint: { lonLat: reserveAt } }]
    : [];
  writeFileSync(join(dir, 's.yaml'), toYaml({ ...s, reserves, ...(withFrame ? { frame } : {}) }));
  return { path: join(dir, 's.yaml'), doctrineDir: join(dir, 'doctrine') };
}

describe('lonLat company starts', () => {
  it('projects to a local Point using the frame', () => {
    const { path, doctrineDir } = setup(true);
    const c = loadScenario(path, doctrineDir).scenario.forces[0]!.formations[0]!.companies![0]!;
    expect(c.start).toEqual([0, 0]);
  });
  it('projects a reserve entryPoint lonLat', () => {
    const { path, doctrineDir } = setup(true, true);
    expect(loadScenario(path, doctrineDir).scenario.reserves[0]!.entryPoint).toEqual([0, 0]);
  });
  it('names the company when there is no frame', () => {
    const { path, doctrineDir } = setup(false);
    expect(() => loadScenario(path, doctrineDir)).toThrow(/s\.yaml: forces\[0\]\.formations\[0\]\.companies\[0\]\.start: company c1: lonLat needs a frame/);
  });
  it('rejects a company start outside the extent, naming the company (lon/lat swapped)', () => {
    const { path, doctrineDir } = setup(true, false, [50.3796, 2.7735]);
    expect(() => loadScenario(path, doctrineDir)).toThrow(
      /s\.yaml: forces\[0\]\.formations\[0\]\.companies\[0\]\.start: company c1 projects to \(-?\d+, -?\d+\), outside the frame extent x -5000…9000, y -6000…6000 — are lon\/lat swapped\?/,
    );
  });
  it('rejects a reserve entry point outside the extent', () => {
    const { path, doctrineDir } = setup(true, true, [2.7735, 50.3796], [2.7735, 50.5]);
    expect(() => loadScenario(path, doctrineDir)).toThrow(/s\.yaml: reserves\[0\]\.entryPoint: reserve bn1 projects to \(0, 13309\), outside the frame extent/);
  });
  it('accepts a point on the extent edge within the 1 m rounding tolerance', () => {
    // 6-decimal lon/lat rounds to about 0.1 m; the Vimy German reserves enter on the extent's edge.
    const edgeLat = 50.3796 + 6000.5 / 110540;
    const { path, doctrineDir } = setup(true, true, [2.7735, 50.3796], [2.7735, edgeLat]);
    expect((loadScenario(path, doctrineDir).scenario.reserves[0]!.entryPoint as [number, number])[1]).toBeCloseTo(6000.5, 3);
  });
});
