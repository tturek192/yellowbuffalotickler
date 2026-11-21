import type { RunRecord } from '@wwi/engine';
import { companiesOf, surrounding } from './interpolate';

/** Quiet: no event within ±windowMin and no company moving more than 1 m between the surrounding snapshots. */
export function isQuiet(r: RunRecord, minute: number, windowMin = 20): boolean {
  if (r.events.some((e) => e.minute >= minute - windowMin && e.minute <= minute + windowMin)) return false;
  const [a, b] = surrounding(r, minute);
  if (a === b) return true;
  const next = new Map(companiesOf(r, b).map((c) => [c.id, c]));
  return !companiesOf(r, a).some((c) => {
    const n = next.get(c.id);
    return n !== undefined && Math.hypot(n.x - c.x, n.y - c.y) > 1;
  });
}
