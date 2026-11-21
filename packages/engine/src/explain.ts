import { CAUSE_TEXT } from './cause-text';
import type { Cause } from './causes';
import type { RunRecord } from './record';
import type { SimEvent } from './types';

export type Why = { event: SimEvent; causes: Array<{ cause: Cause; text: string }>; because: Why[] };
export type WhyRef = { eventId: number } | { unitId: string; minute: number };

/** How many levels of `because` lie below the root. */
const MAX_DEPTH = 6;

/**
 * Follow an event's causes and refs back to the events that led to it. Reads only the record's events (never its snapshots).
 * Each event appears once in the whole tree (a ref shared by two branches is shown under the first), to MAX_DEPTH levels.
 * For `{ unitId, minute }` it starts at that unit's latest event at or before the minute.
 */
export function explain(record: Pick<RunRecord, 'events'>, ref: WhyRef): Why {
  const { events } = record;
  let root: SimEvent | undefined;
  if ('eventId' in ref) {
    root = events[ref.eventId];
    if (root === undefined || root.id !== ref.eventId) throw new Error(`no event ${ref.eventId}`);
  } else {
    for (const e of events) if (e.unitId === ref.unitId && e.minute <= ref.minute && (root === undefined || e.id > root.id)) root = e;
    if (root === undefined) throw new Error(`no event for ${ref.unitId} at or before minute ${ref.minute}`);
  }
  const seen = new Set<number>([root.id]);
  const walk = (e: SimEvent, depth: number): Why => {
    const because: Why[] = [];
    if (depth < MAX_DEPTH) {
      for (const id of e.refs) {
        const r = events[id];
        if (r === undefined || r.id !== id || seen.has(id)) continue;
        seen.add(id);
        because.push(walk(r, depth + 1));
      }
    }
    return { event: e, causes: e.causes.map((cause) => ({ cause, text: CAUSE_TEXT[cause] })), because };
  };
  return walk(root, 0);
}
