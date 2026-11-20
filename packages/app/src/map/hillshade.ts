import { decodeTerrain, type Terrain, type TerrainGrid } from '@wwi/scenario';
import type { View } from './projection';

/**
 * Vertical exaggeration for shading. The ridge's slopes are gentle (a few per cent on the western
 * glacis): true to scale they would barely tint the paper.
 */
const Z_FACTOR = 3;
/** Warm sepia for slopes turned from the sun, and a paper-white highlight for slopes facing it. */
const SHADOW_RGB = [92, 66, 30] as const;
const LIGHT_RGB = [255, 251, 238] as const;
/** Strongest tint either way: the shading stays a wash on the paper, never a photograph. */
const MAX_SHADOW_ALPHA = 0.34;
const MAX_LIGHT_ALPHA = 0.28;
/** Change in illumination (against flat ground) that reaches the strongest tint. */
const SHADOW_FULL = 0.45;
const LIGHT_FULL = 0.22;

const decoded = new WeakMap<TerrainGrid, Terrain>();

/** Decode a grid once and reuse it. */
export function terrainOf(grid: TerrainGrid): Terrain {
  let t = decoded.get(grid);
  if (!t) decoded.set(grid, (t = decodeTerrain(grid)));
  return t;
}

/**
 * Illumination at each grid value minus that of flat ground: > 0 lit, < 0 in shade. The sun's azimuth is
 * clockwise from map-up (+y), so 315° lights from the upper left, as cartographers do.
 */
function nodeShade(t: Terrain, sunAzimuthDeg: number, sunAltDeg: number): Float32Array {
  const { cols, rows, cellM, elevM } = t;
  const az = (sunAzimuthDeg * Math.PI) / 180;
  const alt = (sunAltDeg * Math.PI) / 180;
  const lx = Math.sin(az) * Math.cos(alt);
  const ly = Math.cos(az) * Math.cos(alt);
  const lz = Math.sin(alt);
  const out = new Float32Array(cols * rows);
  const z = (i: number, j: number): number => elevM[j * cols + i]!;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const i0 = Math.max(i - 1, 0);
      const i1 = Math.min(i + 1, cols - 1);
      const j0 = Math.max(j - 1, 0);
      const j1 = Math.min(j + 1, rows - 1);
      const dzdx = i1 > i0 ? ((z(i1, j) - z(i0, j)) / ((i1 - i0) * cellM)) * Z_FACTOR : 0;
      const dzdy = j1 > j0 ? ((z(i, j1) - z(i, j0)) / ((j1 - j0) * cellM)) * Z_FACTOR : 0;
      // Surface normal (−dz/dx, −dz/dy, 1), normalised, against the sun.
      const lit = Math.max(0, (-dzdx * lx - dzdy * ly + lz) / Math.hypot(dzdx, dzdy, 1));
      out[j * cols + i] = lit - lz;
    }
  }
  return out;
}

/**
 * Shade the terrain into a w×h image for the given view: a sepia wash on slopes turned from the sun and a
 * faint highlight on those facing it; flat ground, and anywhere off the grid, stay transparent.
 */
export function hillshade(grid: TerrainGrid, view: View, w: number, h: number, sunAzimuthDeg = 315, sunAltDeg = 45): ImageData {
  const t = terrainOf(grid);
  const shade = nodeShade(t, sunAzimuthDeg, sunAltDeg);
  const { cols, rows, cellM, originX, originY } = t;
  const data = new Uint8ClampedArray(w * h * 4);
  // Grid index of each pixel column and row (pixel centres).
  const fxs = Float64Array.from({ length: w }, (_, px) => ((px + 0.5 - view.tx) / view.scale - originX) / cellM);
  for (let py = 0; py < h; py++) {
    const fy = ((view.ty - (py + 0.5)) / view.scale - originY) / cellM;
    if (fy < -0.5 || fy > rows - 0.5) continue;
    const cy = Math.min(Math.max(fy, 0), rows - 1);
    const j = Math.min(Math.floor(cy), Math.max(rows - 2, 0));
    const j1 = Math.min(j + 1, rows - 1);
    const ty = cy - j;
    for (let px = 0; px < w; px++) {
      const fx = fxs[px]!;
      if (fx < -0.5 || fx > cols - 0.5) continue;
      const cx = Math.min(Math.max(fx, 0), cols - 1);
      const i = Math.min(Math.floor(cx), Math.max(cols - 2, 0));
      const i1 = Math.min(i + 1, cols - 1);
      const tx = cx - i;
      const s =
        (shade[j * cols + i]! * (1 - tx) + shade[j * cols + i1]! * tx) * (1 - ty) +
        (shade[j1 * cols + i]! * (1 - tx) + shade[j1 * cols + i1]! * tx) * ty;
      if (s === 0) continue;
      const [rgb, alpha] = s < 0 ? [SHADOW_RGB, MAX_SHADOW_ALPHA * Math.min(1, -s / SHADOW_FULL)] : [LIGHT_RGB, MAX_LIGHT_ALPHA * Math.min(1, s / LIGHT_FULL)];
      const o = (py * w + px) * 4;
      data[o] = rgb[0];
      data[o + 1] = rgb[1];
      data[o + 2] = rgb[2];
      data[o + 3] = Math.round(alpha * 255);
    }
  }
  return new ImageData(data, w, h);
}

/** One contour level: its line segments as x0, y0, x1, y1 runs in local metres. */
export type ContourLevel = { level: number; index: boolean; segs: number[] };

/**
 * Contour lines every `interval` metres by marching squares over the grid, in local metres. Every fifth
 * level is an index contour. Levels with no line are left out.
 */
export function contourSegments(grid: TerrainGrid, interval: number): ContourLevel[] {
  const t = terrainOf(grid);
  const { cols, rows, cellM, originX, originY, elevM } = t;
  const kMin = Math.floor(t.min / interval) + 1;
  const kMax = Math.ceil(t.max / interval) - 1;
  const segs: number[][] = Array.from({ length: Math.max(kMax - kMin + 1, 0) }, () => []);
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = elevM[j * cols + i]!; // south-west
      const b = elevM[j * cols + i + 1]!; // south-east
      const c = elevM[(j + 1) * cols + i + 1]!; // north-east
      const d = elevM[(j + 1) * cols + i]!; // north-west
      // A level equal to the cell's lowest corner cannot cross it (every corner counts as above).
      const lo = Math.max(Math.floor(Math.min(a, b, c, d) / interval) + 1, kMin);
      const hi = Math.min(Math.floor(Math.max(a, b, c, d) / interval), kMax);
      const x0 = originX + i * cellM;
      const y0 = originY + j * cellM;
      for (let k = lo; k <= hi; k++) {
        const L = k * interval;
        const at = (z0: number, z1: number): number => (L - z0) / (z1 - z0);
        const above = (z: number): boolean => z >= L;
        // Crossing points on the south, east, north and west edges.
        const S = above(a) !== above(b) ? [x0 + at(a, b) * cellM, y0] : null;
        const E = above(b) !== above(c) ? [x0 + cellM, y0 + at(b, c) * cellM] : null;
        const N = above(d) !== above(c) ? [x0 + at(d, c) * cellM, y0 + cellM] : null;
        const W = above(a) !== above(d) ? [x0, y0 + at(a, d) * cellM] : null;
        const out = segs[k - kMin]!;
        const seg = (p: number[] | null, q: number[] | null): void => void (p && q && out.push(p[0]!, p[1]!, q[0]!, q[1]!));
        if (S && E && N && W) {
          // A saddle: the mean of the corners says which pair of opposite corners the high ground joins.
          const centreAbove = above((a + b + c + d) / 4);
          const isolateSEandNW = above(a) === centreAbove;
          if (isolateSEandNW) {
            seg(S, E);
            seg(N, W);
          } else {
            seg(S, W);
            seg(E, N);
          }
        } else {
          const pts = [S, E, N, W].filter((p): p is number[] => p !== null);
          if (pts.length === 2) seg(pts[0]!, pts[1]!);
        }
      }
    }
  }
  return segs
    .map((s, n) => ({ level: (kMin + n) * interval, index: (kMin + n) % 5 === 0, segs: s }))
    .filter((l) => l.segs.length > 0);
}

const CONTOUR_RGB = '110, 80, 38';
/** Scale (CSS px per metre) from which 5 m contours print at full strength. */
const FINE_CONTOUR_SCALE = 0.15;
const contourCache = new WeakMap<TerrainGrid, ContourLevel[]>();
type Layer = { key: string; canvas: OffscreenCanvas | HTMLCanvasElement };
const layerCache = new WeakMap<TerrainGrid, Layer>();

function newCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/**
 * The terrain as one image for a w×h CSS-pixel view at `dpr` device pixels per CSS pixel: the hillshade
 * with 5 m contours over it. Built once per grid, view and size, so playback only copies it.
 */
export function terrainLayer(grid: TerrainGrid, view: View, w: number, h: number, dpr: number): CanvasImageSource {
  const key = `${w}x${h}@${dpr}:${view.scale},${view.tx},${view.ty}`;
  const cached = layerCache.get(grid);
  if (cached?.key === key) return cached.canvas;
  const pw = Math.max(1, Math.round(w * dpr));
  const ph = Math.max(1, Math.round(h * dpr));
  const dv: View = { scale: view.scale * dpr, tx: view.tx * dpr, ty: view.ty * dpr };
  const canvas = newCanvas(pw, ph);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (ctx) {
    ctx.putImageData(hillshade(grid, dv, pw, ph), 0, 0);
    let levels = contourCache.get(grid);
    if (!levels) contourCache.set(grid, (levels = contourSegments(grid, 5)));
    ctx.lineCap = 'round';
    // Zoomed far out, 5 m contours on a steep slope crowd into a smudge: fade them, keep the index contours.
    const fine = Math.min(1, Math.max(0.35, view.scale / FINE_CONTOUR_SCALE));
    for (const l of levels) {
      ctx.strokeStyle = `rgba(${CONTOUR_RGB}, ${l.index ? 0.42 : 0.2 * fine})`;
      ctx.lineWidth = (l.index ? 0.9 : 0.6) * dpr;
      ctx.beginPath();
      for (let s = 0; s < l.segs.length; s += 4) {
        ctx.moveTo(dv.tx + l.segs[s]! * dv.scale, dv.ty - l.segs[s + 1]! * dv.scale);
        ctx.lineTo(dv.tx + l.segs[s + 2]! * dv.scale, dv.ty - l.segs[s + 3]! * dv.scale);
      }
      ctx.stroke();
    }
  }
  layerCache.set(grid, { key, canvas });
  return canvas;
}
