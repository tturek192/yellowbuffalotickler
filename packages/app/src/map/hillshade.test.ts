import { beforeAll, describe, expect, it } from 'vitest';
import { encodeTerrain, type TerrainGrid } from '@wwi/scenario';
import { contourSegments, gestureSettled, hillshade, TERRAIN_SETTLE_MS, terrainOf, terrainPlan, transformedRect } from './hillshade';
import type { View } from './projection';

beforeAll(() => {
  // Node has no ImageData; a minimal stand-in with the same shape.
  if (typeof globalThis.ImageData === 'undefined') {
    (globalThis as { ImageData?: unknown }).ImageData = class {
      constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
    };
  }
});

const cite = { source: 'test-src' };

/** A 5×5 grid, 25 m cells, from z(x, y). */
function grid(z: (x: number, y: number) => number, n = 5, cellM = 25): TerrainGrid {
  const elevM: number[] = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) elevM.push(z(i * cellM, j * cellM));
  return { source: cite, method: 'test', ...encodeTerrain({ cellM, originX: 0, originY: 0, cols: n, rows: n, elevM }) };
}

/** Ground falling away to the north-west (up and left on the map): it faces the default sun. */
const rampFacingNorthWest = () => grid((x, y) => 100 + 0.2 * x - 0.2 * y);
const rampFacingSouthEast = () => grid((x, y) => 100 - 0.2 * x + 0.2 * y);
const flat = () => grid(() => 100);

// 100 m of ground across 4 px: the whole 4×4 image lies inside the grid.
const view: View = { scale: 0.04, tx: 0, ty: 4 };

/** Brightness of a pixel as it lands on the paper: the shade composited over a mid-grey. */
function seen(img: ImageData, i = 0): number {
  const d = img.data;
  const a = d[i + 3]! / 255;
  const lum = (d[i]! + d[i + 1]! + d[i + 2]!) / 3;
  return lum * a + 200 * (1 - a);
}

describe('hillshade', () => {
  it('hillshade is brighter on slopes facing the sun', () => {
    const img = hillshade(rampFacingNorthWest(), view, 4, 4);
    expect(img.data[0]).toBeGreaterThan(hillshade(rampFacingSouthEast(), view, 4, 4).data[0]!);
    expect(seen(img)).toBeGreaterThan(seen(hillshade(rampFacingSouthEast(), view, 4, 4)));
  });

  it('leaves flat ground as bare paper, and follows the sun round', () => {
    const img = hillshade(flat(), view, 4, 4);
    expect(img.width * img.height).toBe(16);
    expect(Math.max(...[...img.data].filter((_, i) => i % 4 === 3))).toBe(0);
    // With the sun in the south-east the same slopes swap.
    expect(seen(hillshade(rampFacingSouthEast(), view, 4, 4, 135))).toBeGreaterThan(seen(hillshade(rampFacingNorthWest(), view, 4, 4, 135)));
  });

  it('stays subtle: no pixel is more than half opaque, and shading is sepia, not grey', () => {
    const steep = grid((x) => 3 * x);
    const img = hillshade(steep, view, 4, 4, 90 + 180); // sun from the west: steep east-rising ground is lit…
    const dark = hillshade(steep, view, 4, 4, 90); // …and in shadow with the sun in the east.
    for (const im of [img, dark]) for (let i = 0; i < im.data.length; i += 4) expect(im.data[i + 3]!).toBeLessThanOrEqual(128);
    expect(dark.data[0]!).toBeGreaterThan(dark.data[2]!); // red over blue: a warm shadow
  });

  it('leaves pixels outside the grid transparent', () => {
    const img = hillshade(rampFacingNorthWest(), { scale: 0.04, tx: 2, ty: 4 }, 4, 4); // grid starts 2 px in
    expect(img.data[3]).toBe(0);
    expect(img.data[4 * 3 + 3]!).toBeGreaterThan(0);
  });
});

describe('contourSegments', () => {
  it('traces a level every 5 m in world coordinates, with every fifth one an index contour', () => {
    // A plane rising 1 m per metre eastwards from 100 m: x = 0…100, z = 100…200 → levels 105…195 inside.
    const levels = contourSegments(grid((x) => 100 + x), 5);
    expect(levels.map((l) => l.level)).toEqual(Array.from({ length: 19 }, (_, i) => 105 + 5 * i));
    expect(levels.filter((l) => l.index).map((l) => l.level)).toEqual([125, 150, 175]);
    const l110 = levels.find((l) => l.level === 110)!;
    // Each segment is x0, y0, x1, y1; every vertex of the 110 m contour lies on x = 10.
    expect(l110.segs.length % 4).toBe(0);
    for (let i = 0; i < l110.segs.length; i += 2) expect(l110.segs[i]).toBeCloseTo(10, 6);
    const ys = l110.segs.filter((_, i) => i % 2 === 1);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([0, 100]);
  });

  it('draws nothing on flat ground', () => {
    expect(contourSegments(flat(), 5)).toEqual([]);
  });
});

describe('terrain layer reuse during a gesture', () => {
  const spec = (view: View, w = 800, h = 600, dpr = 2) => ({ w, h, dpr, view });
  const a: View = { scale: 0.1, tx: 10, ty: 500 };
  const b: View = { scale: 0.2, tx: 30, ty: 450 };

  it('reuses a layer built for the same view, settled or not', () => {
    expect(terrainPlan(spec(a), spec(a), true)).toBe('exact');
    expect(terrainPlan(spec(a), spec(a), false)).toBe('exact');
  });
  it('moves the cached layer mid-gesture and rebuilds once settled', () => {
    expect(terrainPlan(spec(a), spec(b), false)).toBe('transform');
    expect(terrainPlan(spec(a), spec(b), true)).toBe('rebuild');
  });
  it('rebuilds when there is no layer or the sheet size or pixel ratio changed', () => {
    expect(terrainPlan(null, spec(b), false)).toBe('rebuild');
    expect(terrainPlan(spec(a), spec(b, 900), false)).toBe('rebuild');
    expect(terrainPlan(spec(a), spec(b, 800, 600, 1), false)).toBe('rebuild');
  });
  it('places a moved layer so a world point stays where the new view puts it', () => {
    const r = transformedRect(a, b, 800, 600);
    // world point p sits at a.tx + p*a.scale in the old image; the rect must map it to b.tx + p*b.scale.
    for (const p of [0, 250, 1000]) {
      const old = a.tx + p * a.scale;
      expect(r.x + (old / 800) * r.w).toBeCloseTo(b.tx + p * b.scale);
    }
    expect(r.w).toBeCloseTo(1600);
  });
  it('settles only after the quiet period since the last gesture event', () => {
    expect(gestureSettled(1000, 1100)).toBe(false);
    expect(gestureSettled(1000, 1000 + TERRAIN_SETTLE_MS)).toBe(true);
    expect(TERRAIN_SETTLE_MS).toBe(150);
  });
  it('shades each grid once, whatever the view', () => {
    let reads = 0;
    const g = flat();
    const t = terrainOf(g);
    const elev = t.elevM;
    Object.defineProperty(t, 'elevM', { get: () => (reads++, elev) });
    hillshade(g, view, 4, 4);
    const first = reads;
    hillshade(g, { ...view, tx: 1 }, 4, 4);
    expect(first).toBeGreaterThan(0);
    expect(reads).toBe(first);
  });
});
