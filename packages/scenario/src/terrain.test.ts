import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { decodeTerrain, encodeTerrain, terrainGridProblem, TerrainGridSchema } from './terrain';
import { loadScenario } from './load-node';
import { minimalScenario, toYaml, fixtureWithDoctrine } from './test-fixtures';

const cite = { source: 'test-src', note: 'synthetic' };

describe('terrain grid encoding', () => {
  it('round-trips a grid and interpolates bilinearly', () => {
    const g = encodeTerrain({ cellM: 25, originX: 0, originY: 0, cols: 2, rows: 2, elevM: [100, 110, 120, 130] });
    const t = decodeTerrain(g);
    expect(t.at(12.5, 12.5)).toBeCloseTo(115, 1);
    expect(t.min).toBe(100);
    expect(t.max).toBe(130);
  });

  it('stores decimetres, row-major from the origin going +x then +y, and clamps outside the grid', () => {
    const g = encodeTerrain({ cellM: 10, originX: 100, originY: -50, cols: 3, rows: 2, elevM: [1.04, 2, 3, 4, 5, 6.66] });
    const t = decodeTerrain(g);
    expect(t.at(100, -50)).toBeCloseTo(1, 5); // 1.04 m rounds to 10 dm
    expect(t.at(120, -50)).toBe(3);
    expect(t.at(100, -40)).toBe(4);
    expect(t.at(120, -40)).toBeCloseTo(6.7, 5);
    expect(t.at(-1e6, -1e6)).toBeCloseTo(1, 5);
    expect(t.at(1e6, 1e6)).toBeCloseTo(6.7, 5);
    expect(t.at(105, -50)).toBeCloseTo(1.5, 5);
    // Little-endian Int16: 10 dm → 0x0a 0x00.
    expect(atobBytes(g.elevDm).slice(0, 2)).toEqual([10, 0]);
  });

  it('holds negative and large elevations', () => {
    const t = decodeTerrain(encodeTerrain({ cellM: 1, originX: 0, originY: 0, cols: 3, rows: 1, elevM: [-12.3, 0, 3000] }));
    expect([t.at(0, 0), t.at(1, 0), t.at(2, 0)].map((v) => Math.round(v * 10) / 10)).toEqual([-12.3, 0, 3000]);
  });

  it('refuses elevations Int16 decimetres cannot hold, and the wrong number of cells', () => {
    expect(() => encodeTerrain({ cellM: 1, originX: 0, originY: 0, cols: 1, rows: 1, elevM: [4000] })).toThrow(/cannot be stored/);
    expect(() => encodeTerrain({ cellM: 1, originX: 0, originY: 0, cols: 2, rows: 1, elevM: [1] })).toThrow(/2 cells/);
  });

  it('validates a grid: cellM > 0 and cols × rows matching the decoded length', () => {
    const ok = { source: cite, method: 'test', ...encodeTerrain({ cellM: 25, originX: 0, originY: 0, cols: 2, rows: 2, elevM: [1, 2, 3, 4] }) };
    expect(TerrainGridSchema.safeParse(ok).success).toBe(true);
    expect(terrainGridProblem(ok)).toBeUndefined();
    expect(terrainGridProblem({ ...ok, cellM: 0 })).toMatch(/cellM/);
    expect(terrainGridProblem({ ...ok, cols: 3 })).toMatch(/3 × 2 = 6 cells but elevDm holds 4/);
    expect(terrainGridProblem({ ...ok, elevDm: 'not base64!' })).toMatch(/elevDm/);
    expect(terrainGridProblem({ ...ok, source: undefined })).toMatch(/source/);
  });
});

function atobBytes(b64: string): number[] {
  return [...Buffer.from(b64, 'base64')];
}

describe('loadScenario terrain', () => {
  const frame = { origin: { lon: 2.7735, lat: 50.3796 }, bearingDeg: { value: 90, estimate: 't' }, extent: { minX: 0, maxX: 100, minY: 0, maxY: 50 } };
  const grid = (over: Record<string, unknown> = {}) => ({
    source: cite,
    method: 'synthetic',
    ...encodeTerrain({ cellM: 25, originX: 12.5, originY: 12.5, cols: 4, rows: 2, elevM: [1, 2, 3, 4, 5, 6, 7, 8] }),
    ...over,
  });

  function setup(terrainFile: unknown, extra: Record<string, unknown> = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'wwi-terrain-'));
    mkdirSync(join(dir, 'doctrine'));
    writeFileSync(join(dir, 'doctrine', 'bef-1917.yaml'), toYaml(fixtureWithDoctrine().doctrines['bef-1917']));
    mkdirSync(join(dir, 'terrain'));
    if (terrainFile !== undefined) {
      writeFileSync(join(dir, 'terrain', 'g.json'), typeof terrainFile === 'string' ? terrainFile : JSON.stringify(terrainFile));
    }
    writeFileSync(join(dir, 's.yaml'), toYaml({ ...minimalScenario(), terrain: 'terrain/g.json', ...extra }));
    return () => loadScenario(join(dir, 's.yaml'), join(dir, 'doctrine'));
  }

  it('reads the terrain file into scenario.terrainGrid', () => {
    const { scenario } = setup(grid())();
    expect(scenario.terrainGrid?.cols).toBe(4);
    expect(decodeTerrain(scenario.terrainGrid!).max).toBe(8);
  });

  it('names a terrain file that is missing, not JSON, or not a grid', () => {
    expect(setup(undefined)).toThrow(/terrain: cannot read terrain\/g\.json/);
    expect(setup('{nope')).toThrow(/terrain: invalid JSON in terrain\/g\.json/);
    expect(setup(grid({ rows: 3 }))).toThrow(/terrain\/g\.json: .*4 × 3 = 12 cells but elevDm holds 8/);
  });

  it('requires the grid source to be a registered source', () => {
    expect(setup(grid({ source: { source: 'nowhere' } }))).toThrow(/terrainGrid\.source\.source: unknown source "nowhere"/);
  });

  it('requires the grid to cover the frame extent', () => {
    expect(setup(grid(), { frame })).not.toThrow();
    expect(setup(grid(), { frame: { ...frame, extent: { ...frame.extent, maxX: 200 } } })).toThrow(
      /terrain\/g\.json: the grid covers x 0…100, y 0…50 but the frame extent is x 0…200, y 0…50/,
    );
  });
});
