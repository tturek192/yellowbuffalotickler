import { useCallback, useState } from 'react';
import { addMinutes } from '@wwi/scenario';

/** The two map styles: the owner's period sheet (Clegg-style frame), and the plain trench map. */
export type MapStyle = 'period' | 'plain';
export const MAP_STYLES: readonly MapStyle[] = ['period', 'plain'];
/** Where the viewer's choice is kept (this browser only). */
export const STYLE_KEY = 'wwi-sim.mapStyle';

const browserStorage = (): Storage => window.localStorage;

/** The viewer's style, or the period style when none is kept, storage is blocked or holds something else. */
export function readMapStyle(storage: () => Storage = browserStorage): MapStyle {
  try {
    const v = storage().getItem(STYLE_KEY);
    return v === 'plain' || v === 'period' ? v : 'period';
  } catch {
    return 'period';
  }
}

/** Keep the viewer's style; where storage is blocked the choice lasts only for this visit. */
export function writeMapStyle(style: MapStyle, storage: () => Storage = browserStorage): void {
  try {
    storage().setItem(STYLE_KEY, style);
  } catch {
    /* storage blocked (private window, site data off): nothing to keep it in */
  }
}

/** The map style and a setter that remembers it. */
export function useMapStyle(): [MapStyle, (s: MapStyle) => void] {
  const [style, setStyle] = useState<MapStyle>(() => readMapStyle());
  const set = useCallback((s: MapStyle) => {
    writeMapStyle(s);
    setStyle(s);
  }, []);
  return [style, set];
}

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const ordinal = (n: number): string => {
  const teen = n % 100 >= 11 && n % 100 <= 13;
  const suffix = teen ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
};

/** 'Monday, 9th April' (with the year when asked): the day as the period maps letter it. */
export function periodDay(zeroHourIso: string, minute: number, withYear = false): string {
  const t = addMinutes(zeroHourIso, Math.floor(minute));
  return `${DAYS[t.getUTCDay()]}, ${ordinal(t.getUTCDate())} ${MONTHS[t.getUTCMonth()]}${withYear ? ` ${t.getUTCFullYear()}` : ''}`;
}

/** '7.0 a.m.', '5.30 p.m.', '12 noon', '12 midnight'. */
export function periodTime(zeroHourIso: string, minute: number): string {
  const t = addMinutes(zeroHourIso, Math.floor(minute));
  const h = t.getUTCHours();
  const m = t.getUTCMinutes();
  if (m === 0 && h === 12) return '12 noon';
  if (m === 0 && h === 0) return '12 midnight';
  return `${h % 12 === 0 ? 12 : h % 12}.${m === 0 ? '0' : String(m).padStart(2, '0')} ${h < 12 ? 'a.m.' : 'p.m.'}`;
}

/** 'Monday, 9th April · 7.0 a.m.': the clock lettered as the period maps letter times. */
export function periodClock(zeroHourIso: string, minute: number): string {
  return `${periodDay(zeroHourIso, minute)} · ${periodTime(zeroHourIso, minute)}`;
}

const UNITS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty'];

/** A number below 60 in words. */
const words = (n: number): string => (n < 20 ? UNITS[n]! : `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${UNITS[n % 10]}` : ''}`);
const count = (n: number, unit: string): string => `${words(n)} ${unit}${n === 1 ? '' : 's'}`;

/** 'One hour and thirty minutes after zero', in words; 'Zero hour' at zero. */
export function periodElapsed(minute: number): string {
  const total = Math.max(0, Math.floor(minute));
  if (total === 0) return 'Zero hour';
  const d = Math.floor(total / 1440);
  const h = Math.floor((total % 1440) / 60);
  const m = total % 60;
  const parts = [d ? count(d, 'day') : '', h ? count(h, 'hour') : '', m ? count(m, 'minute') : ''].filter(Boolean);
  const text = parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  return `${text.charAt(0).toUpperCase()}${text.slice(1)} after zero`;
}
