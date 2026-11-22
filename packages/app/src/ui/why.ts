import type { RunRecord, SimEvent } from '@wwi/engine';
import type { Why, WhyRef } from '@wwi/engine/reader';
import type { Hit, MapPick } from '../map/draw';

/** What the why panel is asked about: a marker picked on the map, or an event picked in the log. */
export type WhyPick = MapPick | { kind: 'event'; id: number };

/** The marker under a point on the sheet: the last drawn (topmost) whose box holds it, or null. */
export function pickAt(hits: readonly Hit[], [x, y]: readonly [number, number]): MapPick | null {
  for (let i = hits.length - 1; i >= 0; i--) {
    const { box, pick } = hits[i]!;
    if (x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1) return pick;
  }
  return null;
}

/**
 * What to explain for a pick at the playhead: an event as it is; a company by its latest event at or before the minute
 * (`explain`'s own unit lookup); a battalion by the latest event of any of its companies at or before the minute. Null
 * when nothing has happened to it yet.
 */
export function whyRefFor(r: Pick<RunRecord, 'events' | 'units'>, pick: WhyPick, minute: number): WhyRef | null {
  if (pick.kind === 'event') return { eventId: pick.id };
  const ids = pick.kind === 'company' ? new Set([pick.id]) : new Set(r.units.filter((u) => u.battalionId === pick.id).map((u) => u.id));
  let latest: SimEvent | undefined;
  for (const e of r.events) if (e.unitId !== undefined && ids.has(e.unitId) && e.minute <= minute && (latest === undefined || e.id > latest.id)) latest = e;
  if (!latest) return null;
  return pick.kind === 'company' ? { unitId: pick.id, minute } : { eventId: latest.id };
}

/** One step of a why chain as the panel lists it: how deep it lies, and the refs it has that were shown higher up. */
export type WhyRow = { event: SimEvent; depth: number; causes: Why['causes']; seeAbove: SimEvent[] };

/**
 * The chain flattened in reading order (each event once, as `explain` gives it). A ref that `explain` did not repeat
 * because it is already shown elsewhere in the chain is kept as a "see above" note on the step that refers to it.
 */
export function whyRows(why: Why): WhyRow[] {
  const shown = new Map<number, SimEvent>();
  const collect = (w: Why): void => {
    shown.set(w.event.id, w.event);
    w.because.forEach(collect);
  };
  collect(why);
  const rows: WhyRow[] = [];
  const walk = (w: Why, depth: number): void => {
    const under = new Set(w.because.map((b) => b.event.id));
    const seeAbove = w.event.refs.filter((id) => !under.has(id) && shown.has(id)).map((id) => shown.get(id)!);
    rows.push({ event: w.event, depth, causes: w.causes, seeAbove });
    for (const b of w.because) walk(b, depth + 1);
  };
  walk(why, 0);
  return rows;
}
