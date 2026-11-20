import type { BatchSummary } from '@wwi/engine';

/** Clock time HH:MM for `minutes` after a zero hour given as 'YYYY-MM-DDTHH:MM'. */
export function clock(zeroHour: string, minutes: number | null): string {
  if (minutes === null) return '—';
  const m = /T(\d{2}):(\d{2})/.exec(zeroHour);
  if (!m) throw new Error(`bad zero hour "${zeroHour}"`);
  const total = Math.round(Number(m[1]) * 60 + Number(m[2]) + minutes);
  const day = 24 * 60;
  const t = ((total % day) + day) % day;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
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
