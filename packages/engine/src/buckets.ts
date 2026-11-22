import { dist } from './geometry';

/**
 * A uniform grid of square buckets over the field, so that "who is within r of here" looks only at nearby
 * buckets instead of at every unit (fire, contact and isolation all ask it). The bucket size is a
 * numerical-method constant, not a model number: answers never depend on it, only the work done.
 */
export const BUCKET_M = 250;

type At = { x: number; y: number };

/**
 * The buckets as typed arrays (a numerical-method layout, Task 21): a dense grid of cells over the items' own extent,
 * each cell's items kept together in the order given, with their places copied out so that a search reads numbers only.
 */
export type Buckets<T extends At> = {
  /** The items, in the order given. */
  items: readonly T[];
  /** The grid's first cell column and row, and its size in cells (0 × 0 with no items). */
  i0: number;
  j0: number;
  cols: number;
  rows: number;
  /** Cell k = (j − j0) · cols + (i − i0) holds the items at places start[k] .. start[k + 1] − 1 of `order`. */
  start: Int32Array;
  /** Each place's item, by its index in `items` (by cell, and in the order given within a cell). */
  order: Int32Array;
  /** Each place's item's x and y. */
  xs: Float64Array;
  ys: Float64Array;
};

const cellOf = (v: number): number => Math.floor(v / BUCKET_M);
const NONE = new Int32Array(1);
const NO_PLACES = new Float64Array(0);
/** Room to fill the cells in, reused by every build (it holds nothing between builds). */
let scratch = new Int32Array(1024);

/** Put the items in their buckets; each bucket keeps them in the order given. Items not at a finite place are in none. */
export function bucketsOf<T extends At>(items: readonly T[]): Buckets<T> {
  const n = items.length;
  let i0 = Infinity, i1 = -Infinity, j0 = Infinity, j1 = -Infinity;
  for (let k = 0; k < n; k++) {
    const it = items[k]!;
    const i = cellOf(it.x);
    const j = cellOf(it.y);
    if (!Number.isFinite(i) || !Number.isFinite(j)) continue;
    if (i < i0) i0 = i;
    if (i > i1) i1 = i;
    if (j < j0) j0 = j;
    if (j > j1) j1 = j;
  }
  if (!(i1 >= i0)) return { items, i0: 0, j0: 0, cols: 0, rows: 0, start: NONE, order: new Int32Array(0), xs: NO_PLACES, ys: NO_PLACES };
  const cols = i1 - i0 + 1;
  const rows = j1 - j0 + 1;
  const cells = cols * rows;
  // A counting sort by cell, stable (the order given within a cell); `start` and `order` share one buffer, as do xs and ys.
  const ints = new Int32Array(cells + 1 + n);
  const start = ints.subarray(0, cells + 1);
  let placed = 0;
  for (let k = 0; k < n; k++) {
    const it = items[k]!;
    const i = cellOf(it.x);
    const j = cellOf(it.y);
    if (!Number.isFinite(i) || !Number.isFinite(j)) continue;
    start[(j - j0) * cols + (i - i0) + 1]!++;
    placed++;
  }
  for (let c = 0; c < cells; c++) start[c + 1]! += start[c]!;
  if (scratch.length < cells) scratch = new Int32Array(Math.max(cells, 2 * scratch.length));
  const fill = scratch;
  fill.set(start.subarray(0, cells));
  const order = ints.subarray(cells + 1, cells + 1 + placed);
  const places = new Float64Array(2 * placed);
  const xs = places.subarray(0, placed);
  const ys = places.subarray(placed);
  for (let k = 0; k < n; k++) {
    const it = items[k]!;
    const i = cellOf(it.x);
    const j = cellOf(it.y);
    if (!Number.isFinite(i) || !Number.isFinite(j)) continue;
    const p = fill[(j - j0) * cols + (i - i0)]!++;
    order[p] = k;
    xs[p] = it.x;
    ys[p] = it.y;
  }
  return { items, i0, j0, cols, rows, start, order, xs, ys };
}

/**
 * Visit every place in the cells the box of cells [ci0, ci1] × [cj0, cj1] covers (clamped to the grid), cell row by cell
 * row; stop when `visit` returns true. Gives whether it stopped.
 */
function scanCells<T extends At>(b: Buckets<T>, ci0: number, ci1: number, cj0: number, cj1: number, visit: (p: number) => boolean | void): boolean {
  const a0 = Math.max(ci0 - b.i0, 0);
  const a1 = Math.min(ci1 - b.i0, b.cols - 1);
  const c0 = Math.max(cj0 - b.j0, 0);
  const c1 = Math.min(cj1 - b.j0, b.rows - 1);
  if (a0 > a1 || c0 > c1) return false;
  const { start } = b;
  for (let j = c0; j <= c1; j++) {
    // The cells of a row are side by side, so a row's places are one run.
    const from = start[j * b.cols + a0]!;
    const to = start[j * b.cols + a1 + 1]!;
    for (let p = from; p < to; p++) if (visit(p)) return true;
  }
  return false;
}

/**
 * The items within distance r of (x, y), each with its distance, nearest first (ties by the order `tie` gives).
 * It visits the buckets the circle's bounding square touches.
 */
export function within<T extends At>(b: Buckets<T>, x: number, y: number, r: number, tie: (a: T, b: T) => number): Array<{ item: T; d: number }> {
  if (!(r >= 0)) return [];
  const out: Array<{ item: T; d: number }> = [];
  const { xs, ys, order, items } = b;
  scanCells(b, cellOf(x - r), cellOf(x + r), cellOf(y - r), cellOf(y + r), (p) => {
    const d = dist(xs[p]! - x, ys[p]! - y);
    if (d <= r) out.push({ item: items[order[p]!]!, d });
  });
  return out.length > 1 ? out.sort((a, b2) => a.d - b2.d || tie(a.item, b2.item)) : out;
}

/** Whether any item for which `ok` holds lies within distance r of (x, y) (the same test as `within`, without the list). */
export function anyWithin<T extends At>(b: Buckets<T>, x: number, y: number, r: number, ok?: (it: T) => boolean): boolean {
  if (!(r >= 0) || b.cols === 0) return false;
  const { xs, ys, order, items } = b;
  return scanCells(b, cellOf(x - r), cellOf(x + r), cellOf(y - r), cellOf(y + r), (p) => dist(xs[p]! - x, ys[p]! - y) <= r && (ok === undefined || ok(items[order[p]!]!)));
}

/** The nearest item within distance r of (x, y), with its distance (ties by `tie`): `within(...)[0]`, without the list. */
export function nearestWithin<T extends At>(b: Buckets<T>, x: number, y: number, r: number, tie: (a: T, b: T) => number): { item: T; d: number } | undefined {
  if (!(r >= 0)) return undefined;
  let best: { item: T; d: number } | undefined;
  const { xs, ys, order, items } = b;
  scanCells(b, cellOf(x - r), cellOf(x + r), cellOf(y - r), cellOf(y + r), (p) => {
    const d = dist(xs[p]! - x, ys[p]! - y);
    if (d > r) return;
    const it = items[order[p]!]!;
    if (best === undefined || d < best.d || (d === best.d && tie(it, best.item) < 0)) best = { item: it, d };
  });
  return best;
}

/**
 * The first `max` items within distance r of (x, y), nearest first (ties by `tie`), that `accept` takes: what walking
 * `within(...)` in order and keeping the accepted ones gives, without sorting every item in reach (the nearest are picked
 * one at a time, and only a long run of refusals sorts the rest).
 */
export function nearestAccepted<T extends At>(
  b: Buckets<T>,
  x: number,
  y: number,
  r: number,
  tie: (a: T, b: T) => number,
  max: number,
  accept: (it: T, d: number) => boolean,
): Array<{ item: T; d: number }> {
  if (!(r >= 0) || !(max > 0)) return [];
  const all: Array<{ item: T; d: number }> = [];
  const { xs, ys, order, items } = b;
  scanCells(b, cellOf(x - r), cellOf(x + r), cellOf(y - r), cellOf(y + r), (p) => {
    const d = dist(xs[p]! - x, ys[p]! - y);
    if (d <= r) all.push({ item: items[order[p]!]!, d });
  });
  const out: Array<{ item: T; d: number }> = [];
  const before = (a: { item: T; d: number }, c: { item: T; d: number }): boolean => a.d < c.d || (a.d === c.d && tie(a.item, c.item) < 0);
  // Pick the nearest of the rest into place k, a few times; then sort what is left once.
  const PICKS = 8;
  let k = 0;
  for (; k < all.length && k < PICKS; k++) {
    let m = k;
    for (let i = k + 1; i < all.length; i++) if (before(all[i]!, all[m]!)) m = i;
    if (m !== k) [all[k], all[m]] = [all[m]!, all[k]!];
    const c = all[k]!;
    if (accept(c.item, c.d)) out.push(c);
    if (out.length >= max) return out;
  }
  if (k >= all.length) return out;
  const rest = all.slice(k).sort((a, c) => a.d - c.d || tie(a.item, c.item));
  for (const c of rest) {
    if (accept(c.item, c.d)) out.push(c);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Where a set of placed items stood when last looked at, for memos that hold while nothing near them moves (a numerical
 * shortcut: answers never depend on it). Items are looked at by their place in a list that keeps its order from call to
 * call (the state's companies, in id order); a list of other ids starts afresh. `changesSince` gives, by group, every
 * place where an item came into the set, left it or moved since the last call (both its old and its new place), and
 * remembers the items as they are now.
 */
export type Tracker = {
  ids: readonly string[];
  x: Float64Array;
  y: Float64Array;
  member: Uint8Array;
  group: string[];
  /** The last call started afresh (another list): memos by place in the list from before it do not hold. */
  fresh: boolean;
};
export const tracker = (): Tracker => ({ ids: [], x: new Float64Array(0), y: new Float64Array(0), member: new Uint8Array(0), group: [], fresh: true });

/** Lists already found to hold a tracker's ids in its order, by the ids array they matched. */
const sameIds = new WeakMap<object, readonly string[]>();

export function changesSince<T extends At & { id: string }>(tr: Tracker, items: readonly T[], inSet: (it: T) => boolean, groupOf: (it: T) => string): Map<string, Buckets<At>> {
  const n = items.length;
  const same = tr.ids.length === n && (sameIds.get(items) === tr.ids || items.every((it, i) => it.id === tr.ids[i]));
  if (same) sameIds.set(items, tr.ids);
  tr.fresh = !same;
  if (!same) {
    tr.ids = items.map((it) => it.id);
    tr.x = new Float64Array(n);
    tr.y = new Float64Array(n);
    tr.member = new Uint8Array(n);
    tr.group = new Array<string>(n).fill('');
  }
  const changed = new Map<string, At[]>();
  const add = (g: string, x: number, y: number): void => {
    let xs = changed.get(g);
    if (!xs) changed.set(g, (xs = []));
    xs.push({ x, y });
  };
  for (let i = 0; i < n; i++) {
    const it = items[i]!;
    const now = inSet(it);
    const was = tr.member[i] === 1;
    if (!now && !was) continue;
    const g = now ? groupOf(it) : '';
    if (now && was && tr.x[i] === it.x && tr.y[i] === it.y && tr.group[i] === g) continue;
    if (was) add(tr.group[i]!, tr.x[i]!, tr.y[i]!);
    if (now) add(g, it.x, it.y);
    tr.member[i] = now ? 1 : 0;
    tr.x[i] = it.x;
    tr.y[i] = it.y;
    tr.group[i] = g;
  }
  return new Map([...changed].map(([g, xs]) => [g, bucketsOf(xs)]));
}

/** Whether anything in `group` changed within r of (x, y), as `changesSince` gave it. */
export const changedNear = (changes: Map<string, Buckets<At>>, group: string, x: number, y: number, r: number): boolean => {
  const b = changes.get(group);
  return b !== undefined && anyWithin(b, x, y, r);
};

/** Visit every item in the buckets the box [x0, x1] × [y0, y1] touches (items outside the box may be visited too). */
export function inBox<T extends At>(b: Buckets<T>, x0: number, y0: number, x1: number, y1: number, visit: (it: T) => void): void {
  const { order, items } = b;
  scanCells(b, cellOf(x0), cellOf(x1), cellOf(y0), cellOf(y1), (p) => {
    visit(items[order[p]!]!);
  });
}
