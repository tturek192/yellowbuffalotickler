import type { RunRecord, Side } from '@wwi/engine';
import type { Feature } from '@wwi/scenario';
import { frameAt, surrounding } from '../playback';
import type { Point } from './projection';

/**
 * The front (spec 9.2, "each side's front line is redrawn as it moves; captured ground fills in"). The ground is cut into
 * north–south bins FRONT_BIN_M deep; in each, a side's front is its forward edge: the furthest its held trench segments and
 * its living companies on the map reach towards the enemy (allied: east, +x; central: west, −x). Display resolution only.
 */
export const FRONT_BIN_M = 100;
/** A gap of up to this many bins with nobody of a side in it is bridged; a wider one breaks the line. */
const MAX_GAP_BINS = 6;
/** Fronts kept per record (one per battle minute asked for), so scrubbing back and forth reuses them. */
const CACHE_MINUTES = 240;

export type FrontLine = Point[][];
/** Ground a side has taken: a polygon between its front at Zero and its front now, where it has moved forward. */
export type Captured = { side: Side; polygon: Point[] };
export type Front = { allied: FrontLine; central: FrontLine; captured: Captured[] };

type Bins = { y0: number; n: number; allied: Array<number | undefined>; central: Array<number | undefined> };

const SIDES: readonly Side[] = ['allied', 'central'];
const forward = (side: Side): ((a: number, b: number) => number) => (side === 'allied' ? Math.max : Math.min);
/** A company holds this far of the front either side of where it stands (about a company's frontage), so the line has no dips between companies. */
const COMPANY_REACH_M = 150;
/** Companies that hold ground: men standing, on the map, not given up, and not a column on the march. */
const HOLDS = (status: string, men: number): boolean => men > 0 && status !== 'off-map' && status !== 'surrendered' && status !== 'destroyed' && status !== 'marching';
/**
 * A bin held only from far behind (its forward edge well back of the bins either side) is pulled up to the median of the
 * bins this far either side of it, so the line makes no spike back to a rear company; a bin forward of its neighbours keeps its place.
 */
const MEDIAN_HALF_BINS = 2;

/** A feature's points (a Point feature is its one point). */
const pointsOf = (f: Feature): Point[] => (f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.coordinates) as Point[];

/** x on a polyline at y, at every bin centre the polyline passes (each piece between two points read once). */
function xsByBin(pts: readonly Point[], y0: number, n: number, out: (bin: number, x: number) => void): void {
  const bin = (y: number): number => Math.floor((y - y0) / FRONT_BIN_M);
  if (pts.length === 1) {
    const b = bin(pts[0]![1]);
    if (b >= 0 && b < n) out(b, pts[0]![0]);
    return;
  }
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]!;
    const [bx, by] = pts[i + 1]!;
    const lo = Math.min(ay, by);
    const hi = Math.max(ay, by);
    for (let b = Math.max(0, bin(lo)); b <= Math.min(n - 1, bin(hi)); b++) {
      const yc = y0 + (b + 0.5) * FRONT_BIN_M;
      const y = Math.min(Math.max(yc, lo), hi);
      out(b, hi === lo ? ax : ax + ((bx - ax) * (y - ay)) / (by - ay));
    }
  }
}

/** The pieces of a polyline with y in [y0, y1]. */
export function clipByY(pts: readonly Point[], y0: number, y1: number): Point[][] {
  if (pts.length === 1) return pts[0]![1] >= y0 && pts[0]![1] <= y1 ? [[pts[0]!]] : [];
  const out: Point[][] = [];
  let cur: Point[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const dy = b[1] - a[1];
    const at = (t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + dy * t];
    const inside = a[1] >= y0 && a[1] <= y1;
    const t0 = dy === 0 ? (inside ? 0 : 1) : Math.max(0, Math.min((y0 - a[1]) / dy, (y1 - a[1]) / dy));
    const t1 = dy === 0 ? (inside ? 1 : 0) : Math.min(1, Math.max((y0 - a[1]) / dy, (y1 - a[1]) / dy));
    if (t0 > t1 || (t0 === t1 && y0 !== y1)) {
      if (cur.length >= 2) out.push(cur);
      cur = [];
      continue;
    }
    if (cur.length === 0 || t0 > 0) {
      if (cur.length >= 2) out.push(cur);
      cur = [at(t0)];
    }
    cur.push(at(t1));
    if (t1 < 1) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length >= 2) out.push(cur);
  return out;
}

const piecesCache = new WeakMap<RunRecord, Point[][][]>();

/** Each trench segment's stretch of its feature, by segment index (cached: geometry never changes). */
export function segmentPieces(r: RunRecord): Point[][][] {
  const hit = piecesCache.get(r);
  if (hit) return hit;
  const features = new Map(r.geometry.features.map((f) => [f.id, f]));
  const out = (r.geometry.segments ?? []).map((s) => {
    const f = features.get(s.featureId);
    return f ? clipByY(pointsOf(f), s.yMin, s.yMax) : [];
  });
  piecesCache.set(r, out);
  return out;
}

/** Each segment's holder at a minute: the snapshot at or before it (a segment changes hands at a step, not gradually). */
export function holdersAt(r: RunRecord, minute: number): Side[] {
  const seg = surrounding(r, minute)[0].segments;
  if (!seg) return [];
  const si = seg.columns.indexOf('segment');
  const hi = seg.columns.indexOf('holder');
  const out: Side[] = [];
  for (const row of seg.rows) out[row[si] as number] = row[hi] as Side;
  return out;
}

const extentCache = new WeakMap<RunRecord, { y0: number; n: number }>();

/** The bins' span: the sectors' y extent, else every segment's and company's. */
function extentOf(r: RunRecord): { y0: number; n: number } {
  const hit = extentCache.get(r);
  if (hit) return hit;
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of r.geometry.sectors) [lo, hi] = [Math.min(lo, s.yMin), Math.max(hi, s.yMax)];
  if (!Number.isFinite(lo)) {
    for (const s of r.geometry.segments ?? []) [lo, hi] = [Math.min(lo, s.yMin), Math.max(hi, s.yMax)];
    const first = r.snapshots[0];
    if (first) {
      const yi = first.companies.columns.indexOf('y');
      for (const row of first.companies.rows) [lo, hi] = [Math.min(lo, row[yi] as number), Math.max(hi, row[yi] as number)];
    }
  }
  const out = Number.isFinite(lo) ? { y0: lo, n: Math.max(1, Math.ceil((hi - lo) / FRONT_BIN_M)) } : { y0: 0, n: 0 };
  extentCache.set(r, out);
  return out;
}

/** Each side's forward edge in each bin at a minute (undefined where it has nobody), gaps up to MAX_GAP_BINS bridged. */
function binsAt(r: RunRecord, minute: number): Bins {
  const { y0, n } = extentOf(r);
  const b: Bins = { y0, n, allied: new Array(n), central: new Array(n) };
  const put = (side: Side, bin: number, x: number): void => {
    const cur = b[side][bin];
    b[side][bin] = cur === undefined ? x : forward(side)(cur, x);
  };
  const holders = holdersAt(r, minute);
  segmentPieces(r).forEach((pieces, i) => {
    const side = holders[i];
    if (side) for (const p of pieces) xsByBin(p, y0, n, (bin, x) => put(side, bin, x));
  });
  for (const c of frameAt(r, minute).companies) {
    if (!HOLDS(c.status, c.men)) continue;
    const lo = Math.max(0, Math.floor((c.y - COMPANY_REACH_M - y0) / FRONT_BIN_M));
    const hi = Math.min(n - 1, Math.floor((c.y + COMPANY_REACH_M - y0) / FRONT_BIN_M));
    for (let bin = lo; bin <= hi; bin++) put(c.side, bin, c.x);
  }
  for (const side of SIDES) {
    bridge(b[side]);
    const med = median(b[side]);
    b[side] = b[side].map((x, i) => (x === undefined ? x : forward(side)(x, med[i]!)));
  }
  // Where the two have passed each other (a pocket left behind), the German line is drawn along the allied one.
  for (let i = 0; i < n; i++) {
    const a = b.allied[i];
    const c = b.central[i];
    if (a !== undefined && c !== undefined && c < a) b.central[i] = a;
  }
  return b;
}

/** A running median over MEDIAN_HALF_BINS either side, of the defined bins only; an undefined bin stays undefined. */
function median(xs: ReadonlyArray<number | undefined>): Array<number | undefined> {
  return xs.map((x, i) => {
    if (x === undefined) return undefined;
    const w: number[] = [];
    for (let k = Math.max(0, i - MEDIAN_HALF_BINS); k <= Math.min(xs.length - 1, i + MEDIAN_HALF_BINS); k++) if (xs[k] !== undefined) w.push(xs[k]!);
    w.sort((a, b) => a - b);
    return w.length % 2 ? w[(w.length - 1) / 2]! : (w[w.length / 2 - 1]! + w[w.length / 2]!) / 2;
  });
}

/** Fill runs of up to MAX_GAP_BINS undefined bins between two defined ones, linearly. */
function bridge(xs: Array<number | undefined>): void {
  let last = -1;
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] === undefined) continue;
    if (last >= 0 && i - last > 1 && i - last - 1 <= MAX_GAP_BINS) {
      const a = xs[last]!;
      const z = xs[i]!;
      for (let k = last + 1; k < i; k++) xs[k] = a + ((z - a) * (k - last)) / (i - last);
    }
    last = i;
  }
}

/** The polylines through the defined bins' centres, broken where a bin is undefined. */
function lines(xs: ReadonlyArray<number | undefined>, y0: number): FrontLine {
  const out: FrontLine = [];
  let cur: Point[] = [];
  for (let i = 0; i <= xs.length; i++) {
    const x = xs[i];
    if (x === undefined) {
      if (cur.length) out.push(cur);
      cur = [];
    } else cur.push([x, y0 + (i + 0.5) * FRONT_BIN_M]);
  }
  return out;
}

/** Polygons where a side's front now is ahead of its front at Zero: bin edges, so a run of one bin still has area. */
function capturedGround(side: Side, now: ReadonlyArray<number | undefined>, zero: ReadonlyArray<number | undefined>, y0: number): Captured[] {
  const ahead = (i: number): boolean => {
    const a = now[i];
    const z = zero[i];
    return a !== undefined && z !== undefined && (side === 'allied' ? a > z : a < z);
  };
  const out: Captured[] = [];
  for (let i = 0; i < now.length; i++) {
    if (!ahead(i)) continue;
    let j = i;
    while (j + 1 < now.length && ahead(j + 1)) j++;
    const near: Point[] = [];
    const far: Point[] = [];
    for (let k = i; k <= j; k++) {
      const ya = y0 + k * FRONT_BIN_M;
      const yb = ya + FRONT_BIN_M;
      near.push([zero[k]!, ya], [zero[k]!, yb]);
      far.push([now[k]!, ya], [now[k]!, yb]);
    }
    out.push({ side, polygon: [...near, ...far.reverse()] });
    i = j;
  }
  return out;
}

const cache = new WeakMap<RunRecord, { zero: Bins; byMinute: Map<number, Front> }>();

/**
 * Both fronts and the captured ground at a battle minute (pure; cached per whole minute, so every frame within a minute
 * shares one). Captured ground: where a side's front has moved forward of where it stood at Zero, filled in its colour.
 */
export function frontAt(r: RunRecord, minute: number): Front {
  const m = Math.floor(minute);
  let c = cache.get(r);
  if (!c) cache.set(r, (c = { zero: binsAt(r, 0), byMinute: new Map() }));
  const hit = c.byMinute.get(m);
  if (hit) return hit;
  const b = m === 0 ? c.zero : binsAt(r, m);
  const front: Front = {
    allied: lines(b.allied, b.y0),
    central: lines(b.central, b.y0),
    captured: [...capturedGround('allied', b.allied, c.zero.allied, b.y0), ...capturedGround('central', b.central, c.zero.central, b.y0)],
  };
  if (c.byMinute.size >= CACHE_MINUTES) c.byMinute.clear();
  c.byMinute.set(m, front);
  return front;
}
