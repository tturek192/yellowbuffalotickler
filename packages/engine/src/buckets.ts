/**
 * A uniform grid of square buckets over the field, so that "who is within r of here" looks only at nearby
 * buckets instead of at every unit (fire, contact and isolation all ask it). The bucket size is a
 * numerical-method constant, not a model number: answers never depend on it, only the work done.
 */
export const BUCKET_M = 250;

type At = { x: number; y: number };
type Cell<T> = { i: number; j: number; items: T[] };

export type Buckets<T extends At> = {
  /** Cells by key, looked up only (never iterated). */
  byKey: Map<string, Cell<T>>;
  /** Every occupied cell, by row then column. */
  occupied: Cell<T>[];
};

const cellOf = (v: number): number => Math.floor(v / BUCKET_M);
const keyOf = (i: number, j: number): string => `${i},${j}`;

/** Put the items in their buckets; each bucket keeps them in the order given. */
export function bucketsOf<T extends At>(items: readonly T[]): Buckets<T> {
  const byKey = new Map<string, Cell<T>>();
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
  occupied.sort((a, b) => a.j - b.j || a.i - b.i);
  return { byKey, occupied };
}

/**
 * The items within distance r of (x, y), each with its distance, nearest first (ties by the order `tie` gives).
 * It visits the buckets the circle's bounding square touches, or the occupied buckets inside it when those are fewer.
 */
export function within<T extends At>(b: Buckets<T>, x: number, y: number, r: number, tie: (a: T, b: T) => number): Array<{ item: T; d: number }> {
  if (!(r >= 0)) return [];
  const i0 = cellOf(x - r);
  const i1 = cellOf(x + r);
  const j0 = cellOf(y - r);
  const j1 = cellOf(y + r);
  const out: Array<{ item: T; d: number }> = [];
  const take = (cell: Cell<T>): void => {
    for (const it of cell.items) {
      const d = Math.hypot(it.x - x, it.y - y);
      if (d <= r) out.push({ item: it, d });
    }
  };
  if ((i1 - i0 + 1) * (j1 - j0 + 1) > b.occupied.length) {
    for (const cell of b.occupied) if (cell.i >= i0 && cell.i <= i1 && cell.j >= j0 && cell.j <= j1) take(cell);
  } else {
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const cell = b.byKey.get(keyOf(i, j));
        if (cell) take(cell);
      }
  }
  return out.sort((a, b2) => a.d - b2.d || tie(a.item, b2.item));
}
