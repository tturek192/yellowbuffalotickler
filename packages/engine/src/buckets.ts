import { dist } from './geometry';

/**
 * A uniform grid of square buckets over the field, so that "who is within r of here" looks only at nearby
 * buckets instead of at every unit (fire, contact and isolation all ask it). The bucket size is a
 * numerical-method constant, not a model number: answers never depend on it, only the work done.
 */
export const BUCKET_M = 250;

type At = { x: number; y: number };
type Cell<T> = { i: number; j: number; items: T[] };

export type Buckets<T extends At> = {
  /** Cells by integer key (`keyOf`), looked up only (never iterated). */
  byKey: Map<number, Cell<T>>;
  /** Every occupied cell, in the order first filled (no answer depends on it). */
  occupied: Cell<T>[];
};

const cellOf = (v: number): number => Math.floor(v / BUCKET_M);
/** An integer key for cell (i, j): exact for |i|, |j| < 2^20 buckets (262,000 km), far beyond any field. */
const OFFSET = 1 << 20;
const keyOf = (i: number, j: number): number => (i + OFFSET) * 2 * OFFSET + (j + OFFSET);

/** Put the items in their buckets; each bucket keeps them in the order given. */
export function bucketsOf<T extends At>(items: readonly T[]): Buckets<T> {
  const byKey = new Map<number, Cell<T>>();
  const occupied: Cell<T>[] = [];
  for (const it of items) {
    const i = cellOf(it.x);
    const j = cellOf(it.y);
    const k = keyOf(i, j);
    let cell = byKey.get(k);
    if (!cell) {
      cell = { i, j, items: [] };
      byKey.set(k, cell);
      occupied.push(cell);
    }
    cell.items.push(it);
  }
  return { byKey, occupied };
}

/** Visit every item in the buckets the circle's bounding square touches (or the occupied buckets inside it when fewer); stop when `visit` returns true. */
function scan<T extends At>(b: Buckets<T>, x: number, y: number, r: number, visit: (it: T) => boolean | void): void {
  const i0 = cellOf(x - r);
  const i1 = cellOf(x + r);
  const j0 = cellOf(y - r);
  const j1 = cellOf(y + r);
  if ((i1 - i0 + 1) * (j1 - j0 + 1) > b.occupied.length) {
    for (const cell of b.occupied) {
      if (cell.i < i0 || cell.i > i1 || cell.j < j0 || cell.j > j1) continue;
      for (const it of cell.items) if (visit(it)) return;
    }
    return;
  }
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const cell = b.byKey.get(keyOf(i, j));
      if (cell) for (const it of cell.items) if (visit(it)) return;
    }
}

/**
 * The items within distance r of (x, y), each with its distance, nearest first (ties by the order `tie` gives).
 * It visits the buckets the circle's bounding square touches, or the occupied buckets inside it when those are fewer.
 */
export function within<T extends At>(b: Buckets<T>, x: number, y: number, r: number, tie: (a: T, b: T) => number): Array<{ item: T; d: number }> {
  if (!(r >= 0)) return [];
  const out: Array<{ item: T; d: number }> = [];
  scan(b, x, y, r, (it) => {
    const d = dist(it.x - x, it.y - y);
    if (d <= r) out.push({ item: it, d });
  });
  return out.length > 1 ? out.sort((a, b2) => a.d - b2.d || tie(a.item, b2.item)) : out;
}

/** Whether any item for which `ok` holds lies within distance r of (x, y) (the same test as `within`, without the list). */
export function anyWithin<T extends At>(b: Buckets<T>, x: number, y: number, r: number, ok: (it: T) => boolean = () => true): boolean {
  if (!(r >= 0)) return false;
  let found = false;
  scan(b, x, y, r, (it) => {
    if (dist(it.x - x, it.y - y) <= r && ok(it)) found = true;
    return found;
  });
  return found;
}

/** The nearest item within distance r of (x, y), with its distance (ties by `tie`): `within(...)[0]`, without the list. */
export function nearestWithin<T extends At>(b: Buckets<T>, x: number, y: number, r: number, tie: (a: T, b: T) => number): { item: T; d: number } | undefined {
  if (!(r >= 0)) return undefined;
  let best: { item: T; d: number } | undefined;
  scan(b, x, y, r, (it) => {
    const d = dist(it.x - x, it.y - y);
    if (d > r) return;
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
  scan(b, x, y, r, (it) => {
    const d = dist(it.x - x, it.y - y);
    if (d <= r) all.push({ item: it, d });
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
  const i0 = cellOf(x0);
  const i1 = cellOf(x1);
  const j0 = cellOf(y0);
  const j1 = cellOf(y1);
  if ((i1 - i0 + 1) * (j1 - j0 + 1) > b.occupied.length) {
    for (const cell of b.occupied) if (cell.i >= i0 && cell.i <= i1 && cell.j >= j0 && cell.j <= j1) for (const it of cell.items) visit(it);
    return;
  }
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const cell = b.byKey.get(keyOf(i, j));
      if (cell) for (const it of cell.items) visit(it);
    }
}
