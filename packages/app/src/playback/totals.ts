import type { RunRecord, Side } from '@wwi/engine';

export type Losses = { killed: number; wounded: number; captured: number };
/** Running totals at a minute: each side's casualties since Zero, the prisoners each side took, and the guns captured. */
export type Totals = { casualties: Record<Side, Losses>; prisoners: Record<Side, number>; guns: number };

const other = (s: Side): Side => (s === 'allied' ? 'central' : 'allied');

/** The columns of the prefix sums, in order. */
const FIELDS = ['aK', 'aW', 'aC', 'cK', 'cW', 'cC', 'guns'] as const;
type Field = (typeof FIELDS)[number];
const LOSS: Record<Side, [Field, Field, Field]> = { allied: ['aK', 'aW', 'aC'], central: ['cK', 'cW', 'cC'] };

type Prefix = { minutes: Float64Array; sums: Record<Field, Float64Array> };
const cache = new WeakMap<RunRecord, Prefix>();

/** One pass over the events, once per record: each event's additions, summed in minute order. */
function prefixOf(r: RunRecord): Prefix {
  const hit = cache.get(r);
  if (hit) return hit;
  const units = new Map(r.units.map((u) => [u.id, u.side]));
  const sideOf = (id: string): Side | undefined => units.get(id);
  const events = [...r.events].sort((a, b) => a.minute - b.minute || a.id - b.id);
  const n = events.length;
  const sums = Object.fromEntries(FIELDS.map((f) => [f, new Float64Array(n)])) as Record<Field, Float64Array>;
  const run: Record<Field, number> = { aK: 0, aW: 0, aC: 0, cK: 0, cW: 0, cC: 0, guns: 0 };
  events.forEach((e, i) => {
    const f = e.factors ?? {};
    const num = (k: string): number => (Number.isFinite(f[k]) ? f[k]! : 0);
    const add = (side: Side, killed: number, wounded: number, captured: number): void => {
      const [k, w, c] = LOSS[side];
      run[k] += killed;
      run[w] += wounded;
      run[c] += captured;
    };
    const unitSide = e.unitId !== undefined ? sideOf(e.unitId) : undefined;
    switch (e.kind) {
      case 'direct-fire':
      case 'shelled':
      case 'mine-fired':
        if (e.losses) {
          // Engine 0.4.5 on: the event says whose men it hit (by the sides of the companies it fell on).
          for (const side of ['allied', 'central'] as const) {
            const l = e.losses[side];
            if (l) add(side, l.killed, l.wounded, 0);
          }
        } else if (unitSide && e.kind !== 'mine-fired') {
          // An older record: only fire on one named company can be put to a side.
          add(unitSide, num('killed'), num('wounded'), 0);
        }
        break;
      case 'company-surrendered':
        if (unitSide) add(unitSide, 0, 0, num('men'));
        break;
      case 'defenders-trapped':
        if (unitSide) add(other(unitSide), 0, 0, num('captured'));
        break;
      case 'dugout-cleared':
        if (unitSide) add(other(unitSide), 0, 0, num('prisoners'));
        break;
      case 'guns-captured':
        run.guns += num('guns');
        break;
      default:
        break;
    }
    for (const k of FIELDS) sums[k][i] = run[k];
  });
  const out = { minutes: Float64Array.from(events, (e) => e.minute), sums };
  cache.set(r, out);
  return out;
}

/** Index of the last event at or before minute, or −1 (binary search). */
function lastAtOrBefore(minutes: Float64Array, minute: number): number {
  let lo = 0;
  let hi = minutes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (minutes[mid]! <= minute) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/**
 * Cumulative from the events up to the playhead (fire and mines by the sides their events name, engine 0.4.5 on), by prefix sums built once per record (each frame is a binary search).
 * The preliminary bombardment before Zero is left out, as the summary keeps it apart from the battle.
 */
export function totalsAt(r: RunRecord, minute: number): Totals {
  const p = prefixOf(r);
  const i = lastAtOrBefore(p.minutes, minute);
  const v = (k: Field): number => (i < 0 ? 0 : p.sums[k][i]!);
  const casualties = {
    allied: { killed: v('aK'), wounded: v('aW'), captured: v('aC') },
    central: { killed: v('cK'), wounded: v('cW'), captured: v('cC') },
  };
  return { casualties, prisoners: { allied: casualties.central.captured, central: casualties.allied.captured }, guns: v('guns') };
}
