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

const range = (r: [number, number] | undefined): string => (r ? ` (${r[0]}–${r[1]})` : '');
const passText = (p: boolean | null): string => (p === null ? '—' : p ? 'pass' : 'fail');
const pct = (x: number): string => `${Math.round(x * 100)}%`;

/** A table of string rows, columns padded to their widest cell. */
function table(header: string[], body: string[][]): string {
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((r) => r[i]!.length)));
  const fmt = (r: string[]) => r.map((c, i) => c.padEnd(widths[i]!)).join('  ').trimEnd();
  return [fmt(header), ...body.map(fmt)].join('\n');
}

/**
 * Batch v2 (Task 15): the lines table, then each historical target beside the batch's p10, median and p90 over its runs —
 * casualties by side, formation and window, prisoners, guns captured, when the runs ended — with pass or fail under
 * spec section 7's criteria (— where none applies), and the share of runs each side won.
 */
export function formatBatchV2(b: BatchSummary, zeroHour: string): string {
  const win = (from: number, to: number): string => `${clock(zeroHour, from)}–${clock(zeroHour, to)}`;
  const parts = [formatBatch(b, zeroHour)];
  if (b.casualties.length)
    parts.push(
      table(
        ['casualties', 'formation', 'window', 'target', 'p10', 'median', 'p90', 'pass'],
        b.casualties.map((c) => [c.side, c.formationId ?? '—', win(c.from, c.to), `${c.target}${range(c.range)}`, String(Math.round(c.p10)), String(Math.round(c.median)), String(Math.round(c.p90)), passText(c.pass)]),
      ),
    );
  if (b.prisoners.length)
    parts.push(
      table(
        ['prisoners by', 'window', 'target', 'p10', 'median', 'p90', 'pass'],
        b.prisoners.map((p) => [p.bySide, win(p.from, p.to), `${p.target}${range(p.range)}`, String(Math.round(p.p10)), String(Math.round(p.median)), String(Math.round(p.p90)), passText(p.pass)]),
      ),
    );
  const g = b.gunsCaptured;
  if (g) parts.push(table(['guns captured', 'target', 'p10', 'median', 'p90', 'pass'], [[win(g.from, g.to), `${g.target}${range(g.range)}`, String(Math.round(g.p10)), String(Math.round(g.median)), String(Math.round(g.p90)), passText(g.pass)]]));
  const d = b.duration;
  const endTarget = d.target === null ? '—' : `${clock(zeroHour, d.target)}${d.range ? ` (${clock(zeroHour, d.range[0])}–${clock(zeroHour, d.range[1])})` : ''}`;
  parts.push(table(['ended', 'target', 'p10', 'median', 'p90', 'pass'], [['runs', endTarget, clock(zeroHour, d.p10), clock(zeroHour, d.median), clock(zeroHour, d.p90), passText(d.pass)]]));
  const w = b.winner;
  parts.push(`winner: allied ${pct(w.allied)}, central ${pct(w.central)}, none ${pct(w.none)} of ${b.runs} runs · historical ${w.historical ?? '—'} · ${passText(w.pass)}`);
  if (b.keyGround?.length) parts.push(`key ground at the end: ${b.keyGround.map((k) => `${k.id} allied ${pct(k.allied)} / central ${pct(k.central)} / none ${pct(k.none)}`).join('; ')}`);
  return parts.join('\n\n');
}
