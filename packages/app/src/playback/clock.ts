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
