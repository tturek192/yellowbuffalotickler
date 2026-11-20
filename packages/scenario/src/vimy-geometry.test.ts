import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeTerrain } from './terrain';
import { loadScenario } from './load-node';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('Vimy geometry (Task 7)', () => {
  const { scenario: s } = loadScenario(resolve(repoRoot, 'scenarios/vimy-1917/scenario.yaml'), resolve(repoRoot, 'doctrine'));

  it('has one front line per side and the four objective lines for every attacking division', () => {
    const ids = s.lines.map((l) => l.id);
    expect(ids).toEqual(expect.arrayContaining(['cdn-front', 'ger-front']));
    for (const d of ['1cdn', '2cdn', '3cdn', '4cdn']) expect(ids).toEqual(expect.arrayContaining([`black-${d}`, `red-${d}`]));
    for (const d of ['1cdn', '2cdn']) expect(ids).toEqual(expect.arrayContaining([`blue-${d}`, `brown-${d}`]));
  });

  it('places Hill 145 on the terrain high point of the ridge within 150 m', () => {
    const hill = s.features.find((f) => f.id === 'hill-145')!;
    const t = decodeTerrain(s.terrainGrid!);
    // The widened western extent (to the battery positions) takes in the Lorette spur at the north-west corner,
    // which is higher than Hill 145 (geometry.md, "Terrain grid"). The ridge is the part of the frame east of
    // x = -2000 m, the extent before it was widened.
    let ridgeMax = -Infinity;
    for (let k = 0; k < t.elevM.length; k++) {
      if (t.originX + (k % t.cols) * t.cellM >= -2000) ridgeMax = Math.max(ridgeMax, t.elevM[k]!);
    }
    expect(t.at(...(hill.geometry.coordinates as [number, number]))).toBeGreaterThan(ridgeMax - 5);
  });

  it('every feature is cited, and the georeference fit is recorded under 60 m rms', () => {
    for (const f of s.features) expect(f.cite).toBeDefined();
    const m = readFileSync(resolve(repoRoot, 'docs/research/vimy/geometry.md'), 'utf8').match(/affine fit rms: (\d+(?:\.\d+)?) m/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeLessThan(60);
  });

  it('has a barrage sector for every attacking division, starting at the German front line', () => {
    expect(s.sectors.map((x) => x.id)).toEqual(['barrage-1cdn', 'barrage-2cdn', 'barrage-3cdn', 'barrage-4cdn']);
    for (const sec of s.sectors) {
      expect(sec.startLineId).toBe('ger-front');
      const d = sec.id.replace('barrage-', '');
      for (const leg of sec.legs) expect(leg.toLineId.endsWith(`-${d}`)).toBe(true);
    }
  });
});
