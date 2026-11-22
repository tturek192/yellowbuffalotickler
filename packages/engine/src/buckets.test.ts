import { describe, expect, it } from 'vitest';
import { anyWithin, bucketsOf, inBox, nearestAccepted, nearestWithin, sideBuckets, within } from './buckets';
import { byId } from './companies';
import { dist } from './geometry';
import { createRng } from './rng';

/*
 * The buckets are a numerical method (Task 21: typed arrays over a dense grid, and each side's buckets kept while nobody
 * moves): every search must give exactly what looking at every item gives, so records never depend on them.
 */

type U = { id: string; x: number; y: number; side: string; up: boolean };

function field(seed: number, n: number): U[] {
  const rng = createRng(seed);
  return Array.from({ length: n }, (_, i) => ({
    id: `u${String(i).padStart(3, '0')}`,
    x: rng() * 9000 - 4000,
    y: rng() * 5000 - 2500,
    side: rng() < 0.5 ? 'allied' : 'central',
    up: rng() < 0.8,
  }));
}

const brute = (us: readonly U[], x: number, y: number, r: number) =>
  us
    .map((u) => ({ item: u, d: dist(u.x - x, u.y - y) }))
    .filter((e) => e.d <= r)
    .sort((a, b) => a.d - b.d || byId(a.item, b.item));

describe('buckets (a numerical method: the same answers as looking at every item)', () => {
  const us = field(7, 500);
  const queries = [us[3]!, us[99]!, { x: 0, y: 0 }, { x: -9000, y: 9000 }, { x: 4800, y: -2400 }];
  const radii = [0, 30, 250, 777, 3000, 20000];

  it('within, nearestWithin, anyWithin and inBox match a look at every item', () => {
    const b = bucketsOf(us);
    for (const q of queries)
      for (const r of radii) {
        const all = brute(us, q.x, q.y, r);
        expect(within(b, q.x, q.y, r, byId).map((e) => e.item.id)).toEqual(all.map((e) => e.item.id));
        expect(nearestWithin(b, q.x, q.y, r, byId)?.item.id).toBe(all[0]?.item.id);
        expect(anyWithin(b, q.x, q.y, r)).toBe(all.length > 0);
        const seen: string[] = [];
        inBox(b, q.x - r, q.y - r, q.x + r, q.y + r, (u) => seen.push(u.id));
        // Every item in the box is visited, once.
        const inside = us.filter((u) => u.x >= q.x - r && u.x <= q.x + r && u.y >= q.y - r && u.y <= q.y + r).map((u) => u.id);
        expect(new Set(seen).size).toBe(seen.length);
        for (const id of inside) expect(seen).toContain(id);
      }
  });

  it('nearestAccepted takes the first accepted items in nearest order, however many are refused', () => {
    const b = bucketsOf(us);
    const accept = (u: U, d: number): boolean => (Number(u.id.slice(1)) * 7 + Math.floor(d)) % 3 === 0;
    for (const q of queries)
      for (const r of radii)
        for (const max of [1, 3, 20]) {
          const want = brute(us, q.x, q.y, r)
            .filter((e) => accept(e.item, e.d))
            .slice(0, max);
          expect(nearestAccepted(b, q.x, q.y, r, byId, max, accept).map((e) => [e.item.id, e.d])).toEqual(want.map((e) => [e.item.id, e.d]));
        }
  });

  it("a side's buckets searched with a keep test give what buckets of the side's filtered list give, and follow moves", () => {
    let list = us;
    for (let round = 0; round < 3; round++) {
      for (const side of ['allied', 'central']) {
        const own = list.filter((u) => u.side === side && u.up);
        const b = sideBuckets(list, side);
        const keep = (u: U): boolean => u.up;
        for (const q of queries)
          for (const r of radii) {
            expect(within(b, q.x, q.y, r, byId, keep).map((e) => e.item)).toEqual(brute(own, q.x, q.y, r).map((e) => e.item));
            expect(anyWithin(b, q.x, q.y, r, keep)).toBe(brute(own, q.x, q.y, r).length > 0);
          }
      }
      // New copies of every item (the same places), then some moved: the buckets give the list's own items, where they are now.
      list = list.map((u, i) => (i % 5 === round ? { ...u, x: u.x + 400, up: !u.up } : { ...u }));
    }
  });

  // Ties: co-located companies (a trench, a start line) and items at equal distances on opposite sides. The id tie-break
  // is what makes every answer independent of the order the cells are visited in.
  const ties: U[] = [];
  {
    let k = 0;
    const put = (x: number, y: number, side = 'allied', up = true): void => {
      // Ids out of order with places, so a visit order by place is not the id order.
      ties.push({ id: `t${String((k * 37) % 101).padStart(3, '0')}`, x, y, side, up });
      k++;
    };
    for (let i = 0; i < 6; i++) put(100, 100, i % 2 ? 'allied' : 'central', i !== 3); // six at one point
    for (const [dx, dy] of [[300, 0], [-300, 0], [0, 300], [0, -300], [180, 240], [-240, -180]]) put(100 + dx, 100 + dy); // all 300 m off
    for (let i = 0; i < 5; i++) put(-250, 250); // on a cell corner
    for (let i = 0; i < 4; i++) put(1100, 100, 'central'); // 1000 m off, together
    for (let i = 0; i < 30; i++) put(100 + 250 * (i % 6) - 625, 100 + 250 * Math.floor(i / 6) - 500, i % 3 ? 'allied' : 'central'); // a lattice on cell edges
  }
  const tieQueries = [{ x: 100, y: 100 }, { x: -250, y: 250 }, { x: 600, y: 100 }, { x: -125, y: 100 }];

  it('ties: within and nearestWithin give the id order a look at every item gives', () => {
    expect(new Set(ties.map((u) => u.id)).size).toBe(ties.length);
    const b = bucketsOf(ties);
    for (const q of tieQueries)
      for (const r of [0, 1, 250, 300, 1000, 5000]) {
        const all = brute(ties, q.x, q.y, r);
        expect(within(b, q.x, q.y, r, byId).map((e) => e.item.id)).toEqual(all.map((e) => e.item.id));
        // The nearest is the lowest id among the nearest.
        const nearest = nearestWithin(b, q.x, q.y, r, byId);
        expect(nearest?.item.id).toBe(all[0]?.item.id);
        if (nearest) expect(nearest.item.id).toBe(all.filter((e) => e.d === all[0]!.d).map((e) => e.item.id).sort()[0]);
      }
  });

  it('ties: nearestAccepted takes the first accepted in (distance, id) order', () => {
    const b = bucketsOf(ties);
    const accepts = [(u: U): boolean => u.up, (u: U): boolean => Number(u.id.slice(1)) % 2 === 0, (): boolean => true];
    for (const q of tieQueries)
      for (const r of [0, 300, 1000, 5000])
        for (const accept of accepts)
          for (const max of [1, 2, 5, 12, 100]) {
            const want = brute(ties, q.x, q.y, r).filter((e) => accept(e.item)).slice(0, max);
            expect(nearestAccepted(b, q.x, q.y, r, byId, max, accept).map((e) => [e.item.id, e.d])).toEqual(want.map((e) => [e.item.id, e.d]));
          }
  });

  it("ties: a side's buckets with a keep test, the same list met again, and a list of another length", () => {
    const byIdOrder = [...ties].sort(byId);
    for (const list of [byIdOrder, byIdOrder, byIdOrder.slice(5), byIdOrder])
      for (const side of ['allied', 'central']) {
        const b = sideBuckets(list, side);
        const own = list.filter((u) => u.side === side && u.up);
        for (const q of tieQueries)
          for (const r of [0, 300, 1000]) {
            expect(within(b, q.x, q.y, r, byId, (u) => u.up).map((e) => e.item)).toEqual(brute(own, q.x, q.y, r).map((e) => e.item));
            expect(nearestWithin(b, q.x, q.y, r, byId, (u) => u.up)?.item).toBe(brute(own, q.x, q.y, r)[0]?.item);
          }
      }
  });

  it('nearestAccepted called from inside an accept test gets its own room and leaves the outer answer as it was', () => {
    const b = bucketsOf(us);
    const q = us[10]!;
    const plain = nearestAccepted(b, q.x, q.y, 3000, byId, 20, (u) => Number(u.id.slice(1)) % 3 === 0);
    const inner: string[] = [];
    const nested = nearestAccepted(b, q.x, q.y, 3000, byId, 20, (u) => {
      inner.push(nearestAccepted(b, u.x, u.y, 800, byId, 3, () => true).map((e) => e.item.id).join(','));
      return Number(u.id.slice(1)) % 3 === 0;
    });
    expect(nested).toEqual(plain);
    expect(inner.length).toBeGreaterThan(0);
    // And the next call after it is answered as before.
    expect(nearestAccepted(b, q.x, q.y, 3000, byId, 20, (u) => Number(u.id.slice(1)) % 3 === 0)).toEqual(plain);
  });
});
