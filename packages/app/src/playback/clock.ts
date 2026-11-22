import { addMinutes } from '@wwi/scenario';

export const SPEEDS = [1, 10, 60, 360] as const;
export const QUIET_SPEEDUP = 10;

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

/** Advance the playhead by speed × dt (×QUIET_SPEEDUP when quiet), clamped to [0, endMinute]. */
export function advancePlayhead(
  minute: number,
  realDtSec: number,
  speed: number,
  quiet: boolean,
  endMinute: number,
): { minute: number; ended: boolean } {
  const next = clamp(minute + realDtSec * speed * (quiet ? QUIET_SPEEDUP : 1), 0, endMinute);
  return { minute: next, ended: next >= endMinute };
}

export function seek(minute: number, endMinute: number): number {
  return clamp(minute, 0, endMinute);
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (n: number): string => String(n).padStart(2, '0');

/** 'Mon 9 Apr · 06:25' from the ISO local zero hour plus minutes; time-zone independent. */
export function formatClock(zeroHourIso: string, minute: number): string {
  const t = addMinutes(zeroHourIso, Math.floor(minute));
  return `${DAYS[t.getUTCDay()]} ${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} · ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

/** Whether a run from Zero to `endMinute` ends on a later day than it started. */
export function spansDays(zeroHourIso: string, endMinute: number): boolean {
  const day = (m: number): string => addMinutes(zeroHourIso, Math.floor(m)).toISOString().slice(0, 10);
  return day(0) !== day(endMinute);
}

/**
 * A time for the event log, the why panel and the timeline's ends: 'HH:MM' for a run that ends on the day of Zero,
 * and the clock's own form with its day ('Tue 10 Apr · 05:30') for one that spans more than one day.
 */
export function timeLabel(zeroHourIso: string, minute: number, endMinute: number): string {
  const full = formatClock(zeroHourIso, minute);
  return spansDays(zeroHourIso, endMinute) ? full : full.split(' · ')[1]!;
}
