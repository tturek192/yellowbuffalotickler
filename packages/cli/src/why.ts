import type { Why } from '@wwi/engine';
import { addMinutes } from '@wwi/scenario';
import { clock } from './format';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const p2 = (n: number): string => String(n).padStart(2, '0');

/**
 * Minutes from the record's zero hour ('YYYY-MM-DDTHH:MM') to a time given as 'HH:MM' (zero day; only when the record
 * ends on that day), 'D Mon HH:MM' (as the CLI prints it) or 'YYYY-MM-DDTHH:MM'. A time after the record ends is an error.
 */
export function atMinute(zeroHour: string, text: string, endMinute: number): number {
  const zero = addMinutes(zeroHour, 0);
  const endAt = addMinutes(zeroHour, endMinute);
  const day = (d: Date) => d.toISOString().slice(0, 10);
  const range = `${day(zero)} to ${day(endAt)}`;
  const form = "'D Mon HH:MM' (e.g. '10 Apr 14:00') or 'YYYY-MM-DDTHH:MM'";
  const bad = () => new Error(`--at must be HH:MM, ${form}, got '${text}'`);
  let iso: string;
  let m: RegExpExecArray | null;
  if ((m = /^(\d{1,2}):(\d{2})$/.exec(text))) {
    if (day(zero) !== day(endAt)) throw new Error(`--at '${text}' is ambiguous: the record spans ${range}; give ${form}`);
    iso = `${day(zero)}T${p2(Number(m[1]))}:${m[2]}`;
  } else if ((m = /^(\d{1,2}) ([A-Z][a-z]{2}) (\d{1,2}):(\d{2})$/.exec(text))) {
    const mon = MONTHS.indexOf(m[2]!);
    if (mon < 0) throw bad();
    iso = `${zero.getUTCFullYear()}-${p2(mon + 1)}-${p2(Number(m[1]))}T${p2(Number(m[3]))}:${m[4]}`;
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) {
    iso = text;
  } else throw bad();
  const t = Date.parse(`${iso}:00Z`);
  const hh = /T(\d{2}):(\d{2})$/.exec(iso)!;
  if (Number.isNaN(t) || Number(hh[1]) > 23 || Number(hh[2]) > 59 || new Date(t).toISOString().slice(0, 16) !== iso) throw bad();
  const minute = (t - zero.getTime()) / 60000;
  if (minute > endMinute) throw new Error(`--at '${text}' is after the record ends (${day(endAt)}T${p2(endAt.getUTCHours())}:${p2(endAt.getUTCMinutes())}; the record spans ${range})`);
  return minute;
}

/** The chain as an indented list: the event, why it happened, then (indented) the earlier events that led to it. */
export function formatWhy(w: Why, zeroHour: string, depth = 0): string {
  const pad = '  '.repeat(depth);
  const head = `${pad}#${w.event.id} ${clock(zeroHour, w.event.minute)} ${w.event.kind}: ${w.event.text}`;
  const why = w.causes.length > 0 ? [`${pad}  because: ${w.causes.map((c) => c.text).join('; ')}`] : [];
  return [head, ...why, ...w.because.map((b) => formatWhy(b, zeroHour, depth + 1))].join('\n');
}
