import { describe, expect, it } from 'vitest';
import { decodeTerrain } from '@wwi/scenario';
import { buildWorld } from './ground';
import { lineOfSight } from './sight';
import { vimy, vimyDoctrines, woodAt, worldWith } from './test-helpers';

const ridge = (h: number) => (x: number) => (Math.abs(x - 500) <= 50 ? h : 0);

describe('lineOfSight', () => {
  it('a ridge between two points blocks sight; removing it restores sight', () => {
    expect(lineOfSight(worldWith([], ridge(10)), [0, 0], [1000, 0])).toBe(false);
    expect(lineOfSight(worldWith([], ridge(0)), [0, 0], [1000, 0])).toBe(true);
  });
  it('a low rise under the sight line does not block', () => {
    expect(lineOfSight(worldWith([], ridge(1)), [0, 0], [1000, 0])).toBe(true);
  });
  it('a wood polygon blocks sight across it, but not from inside its edge or outside it', () => {
    const w = worldWith([woodAt(150, 250)]);
    expect(lineOfSight(w, [0, 0], [400, 0])).toBe(false);
    expect(lineOfSight(w, [0, 0], [100, 0])).toBe(true);
    expect(lineOfSight(w, [300, 0], [900, 0])).toBe(true);
  });
  it('is symmetric and the same on a second, cached query', () => {
    const w = worldWith([], ridge(10));
    expect(lineOfSight(w, [0, 0], [1000, 0])).toBe(lineOfSight(w, [1000, 0], [0, 0]));
    expect(lineOfSight(w, [3, 4], [990, 7])).toBe(false);
    expect(w.losCache.size).toBeGreaterThan(0);
  });
  it('the answer does not depend on which query came first', () => {
    const a = worldWith([], ridge(10));
    const b = worldWith([], ridge(10));
    lineOfSight(a, [1, 1], [999, 1]);
    expect(lineOfSight(a, [24, 0], [976, 0])).toBe(lineOfSight(b, [24, 0], [976, 0]));
  });
  it('a taller eye sees over a low rise', () => {
    const w = worldWith([], ridge(3));
    expect(lineOfSight(w, [0, 0], [1000, 0])).toBe(false);
    expect(lineOfSight(w, [0, 0], [1000, 0], 6)).toBe(true);
  });
  it('LOS over the Vimy grid is fast enough: 100k cached queries < 300 ms', () => {
    const s = vimy();
    const w = buildWorld(s, vimyDoctrines().tables, decodeTerrain(s.terrainGrid!));
    const g = s.terrainGrid!;
    const pairs: Array<[[number, number], [number, number]]> = [];
    for (let i = 0; i < 400; i++) {
      const a: [number, number] = [g.originX + ((i * 7919) % 1000) * 12, g.originY + ((i * 104729) % 1000) * 7];
      pairs.push([a, [a[0] + 300 + ((i * 31) % 1500), a[1] + ((i * 17) % 600) - 300]]);
    }
    for (const [a, b] of pairs) lineOfSight(w, a, b); // warm the cache
    const t0 = performance.now();
    let seen = 0;
    for (let i = 0; i < 100_000; i++) {
      const [a, b] = pairs[i % pairs.length]!;
      if (lineOfSight(w, a, b)) seen++;
    }
    const ms = performance.now() - t0;
    expect(seen).toBeGreaterThan(0);
    expect(seen).toBeLessThan(100_000);
    expect(ms).toBeLessThan(300);
  });
});
