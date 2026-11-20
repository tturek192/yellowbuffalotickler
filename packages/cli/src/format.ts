import type { BatchSummary } from '@wwi/engine';
import { addMinutes } from '@wwi/scenario';

const pad = (n: number): string => String(n).padStart(2, '0');

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Clock time HH:MM for `minutes` (rounded) after a zero hour given as 'YYYY-MM-DDTHH:MM'. A time that is
 * not on the zero day also carries its day, e.g. '10 Apr 15:00'.
 */
export function clock(zeroHour: string, minutes: number | null): string {
  if (minutes === null) return '—';
  const t = addMinutes(zeroHour, Math.round(minutes));
  const hm = `${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
  const zero = addMinutes(zeroHour, 0);
  if (t.toISOString().slice(0, 10) === zero.toISOString().slice(0, 10)) return hm;
  return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${hm}`;
}

export function formatBatch(b: BatchSummary, zeroHour: string): string {
  const header = ['line', 'sector', 'taken', 'p10', 'median', 'p90', 'historical'];
  const body = b.lines.map((l) => [
    l.lineId,
    l.sectorId,
    `${l.takenIn}/${b.runs}`,
    clock(zeroHour, l.p10),
    clock(zeroHour, l.median),
    clock(zeroHour, l.p90),
    l.historicalEarliest === null || l.historicalLatest === null
      ? '—'
      : `${clock(zeroHour, l.historicalEarliest)}–${clock(zeroHour, l.historicalLatest)}`,
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((r) => r[i].length)));
  const fmt = (r: string[]) => r.map((c, i) => c.padEnd(widths[i])).join('  ').trimEnd();
  return [fmt(header), ...body.map(fmt)].join('\n');
}
