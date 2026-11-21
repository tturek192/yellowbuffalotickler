import type { Why } from '@wwi/engine';
import { addMinutes } from '@wwi/scenario';
import { clock } from './format';

/** Minutes from the record's zero hour ('YYYY-MM-DDTHH:MM') to the clock time HH:MM on the zero day (negative before it). */
export function atMinute(zeroHour: string, hhmm: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new Error(`--at must be HH:MM, got '${hhmm}'`);
  const zero = addMinutes(zeroHour, 0);
  return Number(m[1]) * 60 + Number(m[2]) - (zero.getUTCHours() * 60 + zero.getUTCMinutes());
}

/** The chain as an indented list: the event, why it happened, then (indented) the earlier events that led to it. */
export function formatWhy(w: Why, zeroHour: string, depth = 0): string {
  const pad = '  '.repeat(depth);
  const head = `${pad}#${w.event.id} ${clock(zeroHour, w.event.minute)} ${w.event.kind}: ${w.event.text}`;
  const why = w.causes.length > 0 ? [`${pad}  because: ${w.causes.map((c) => c.text).join('; ')}`] : [];
  return [head, ...why, ...w.because.map((b) => formatWhy(b, zeroHour, depth + 1))].join('\n');
}
