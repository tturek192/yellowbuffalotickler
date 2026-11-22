import type { Point } from '@wwi/scenario';
import { CELL_M, cellOf, covers } from './ground';
import type { World } from './ground';

/** Spacing of elevation and wood samples along a sight line, in metres (numerical-method constant). */
const STEP_M = 25;
const DEFAULT_EYE_M = 1.5;

function blockerRaster(w: World): NonNullable<World['blockers']> {
  if (w.blockers) return w.blockers;
  const cols = Math.ceil((w.cols * CELL_M) / STEP_M);
  const rows = Math.ceil((w.rows * CELL_M) / STEP_M);
  const data = new Uint8Array(cols * rows);
  for (const sh of w.shapes) {
    if (sh.kind !== 'wood' && sh.kind !== 'village') continue;
    const [x0, y0, x1, y1] = sh.box;
    const i0 = Math.max(0, Math.floor((x0 - w.originX) / STEP_M));
    const i1 = Math.min(cols - 1, Math.floor((x1 - w.originX) / STEP_M));
    const j0 = Math.max(0, Math.floor((y0 - w.originY) / STEP_M));
    const j1 = Math.min(rows - 1, Math.floor((y1 - w.originY) / STEP_M));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++)
        if (covers(sh, [w.originX + (i + 0.5) * STEP_M, w.originY + (j + 0.5) * STEP_M])) data[j * cols + i] = 1;
  }
  return (w.blockers = { data, cols, rows });
}

const centre = (w: World, cell: number): Point => [
  w.originX + ((cell % w.cols) + 0.5) * CELL_M,
  w.originY + (Math.floor(cell / w.cols) + 0.5) * CELL_M,
];

function trace(w: World, a: Point, b: Point, eyeM: number): boolean {
  const terrain = w.terrain;
  const { data, cols, rows } = blockerRaster(w);
  const [ax, ay] = a;
  const [bx, by] = b;
  const za = (terrain ? terrain.at(ax, ay) : 0) + eyeM;
  const zb = (terrain ? terrain.at(bx, by) : 0) + eyeM;
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / STEP_M));
  // The samples next to either end are skipped: men standing in a wood or village can see out of its edge.
  for (let k = 1; k < n; k++) {
    const t = k / n;
    const x = ax + t * (bx - ax);
    const y = ay + t * (by - ay);
    if ((terrain ? terrain.at(x, y) : 0) > za + t * (zb - za)) return false;
    const i = Math.min(cols - 1, Math.max(0, Math.floor((x - w.originX) / STEP_M)));
    const j = Math.min(rows - 1, Math.max(0, Math.floor((y - w.originY) / STEP_M)));
    if (data[j * cols + i] && k > 1 && k < n - 1) return false;
  }
  return true;
}

/**
 * Whether `from` can see `to`: elevation sampled every 25 m against the sight line between eyes
 * `eyeM` above the ground, and woods and villages block. Results are cached per pair of 50 m cells
 * (standing eyes), by the one cell and then the other, and computed between the cells' centres, so an answer never depends on which
 * query came first.
 */
export function lineOfSight(w: World, from: Point, to: Point, eyeM = DEFAULT_EYE_M): boolean {
  const ca = cellOf(w, from);
  const cb = cellOf(w, to);
  if (ca === cb) return true;
  if (eyeM !== DEFAULT_EYE_M) return trace(w, centre(w, ca), centre(w, cb), eyeM); // the cache holds standing eyes only
  let row = w.losCache.get(ca);
  if (!row) w.losCache.set(ca, (row = new Map()));
  const hit = row.get(cb);
  if (hit !== undefined) return hit;
  const r = trace(w, centre(w, ca), centre(w, cb), eyeM);
  row.set(cb, r);
  return r;
}

/**
 * `lineOfSight` from one place (standing eyes) to many: the viewer's cell and its row of the cache looked up once, and
 * each target's cell worked out from its coordinates without a point made for it. The same answers, from the same cache.
 */
export function sightFrom(w: World, from: Point): (x: number, y: number) => boolean {
  const ca = cellOf(w, from);
  let row = w.losCache.get(ca);
  if (!row) w.losCache.set(ca, (row = new Map()));
  const cache = row;
  return (x, y) => {
    const cx = Math.min(Math.max(Math.floor((x - w.originX) / CELL_M), 0), w.cols - 1);
    const cy = Math.min(Math.max(Math.floor((y - w.originY) / CELL_M), 0), w.rows - 1);
    const cb = cy * w.cols + cx;
    if (ca === cb) return true;
    const hit = cache.get(cb);
    if (hit !== undefined) return hit;
    const r = trace(w, centre(w, ca), centre(w, cb), DEFAULT_EYE_M);
    cache.set(cb, r);
    return r;
  };
}
