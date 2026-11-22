import { addMinutes, minutesBetween, v } from '@wwi/scenario';
import type { Scenario, Tables } from '@wwi/scenario';
import { sunTimes } from './sun';

export { sunTimes } from './sun';

/** Used for the clear-weather bound only when the scenario has neither a frame nor a terrain grid. */
const FALLBACK_CLEAR_M = 10_000;

/** The scenario's clock offset from UTC in minutes: the sourced value, else 0. */
export const utcOffsetOf = (s: Scenario): number => (s.utcOffsetMin ? v(s.utcOffsetMin) : 0);

/**
 * Record the light module's defaults: the wiring phase calls this once at setup, so a run that uses
 * daylight lists a missing `utcOffsetMin` in `defaultsUsed`. (Adding it in resolveDefaults would list
 * it for every run, including the draft scenario, and change its record.)
 */
export function noteLightDefaults(s: Scenario, defaultsUsed: Set<string>): void {
  if (!s.utcOffsetMin) defaultsUsed.add('utcOffsetMin ← 0 (no clock offset given; sun times taken as UTC)');
}

/** Share of a clear day's light at a minute (0 night, 1 day), linear through `twilightMin` before sunrise and after sunset. */
export function daylight(s: Scenario, tables: Tables, minuteAfterZero: number): number {
  const at = addMinutes(v(s.zeroHour), minuteAfterZero); // the local wall clock, read through UTC fields
  const date = at.toISOString().slice(0, 10);
  const min = (((at.getTime() % 86_400_000) + 86_400_000) % 86_400_000) / 60_000; // positive before 1970 too
  const lat = s.frame?.origin.lat ?? 0;
  const lon = s.frame?.origin.lon ?? 0;
  const { sunrise, sunset } = sunTimes(lat, lon, date, utcOffsetOf(s));
  const tw = Math.max(v(tables.effects.twilightMin), 1e-9);
  if (min >= sunrise && min <= sunset) return 1;
  if (min < sunrise) return Math.max(0, 1 - (sunrise - min) / tw);
  return Math.max(0, 1 - (min - sunset) / tw);
}

/** The farthest a man can see in clear weather: the scenario's own extent, as no weather entry limits it. */
function clearM(s: Scenario): number {
  if (s.frame) return Math.hypot(s.frame.extent.maxX - s.frame.extent.minX, s.frame.extent.maxY - s.frame.extent.minY);
  const g = s.terrainGrid;
  return g ? Math.hypot(g.cols * g.cellM, g.rows * g.cellM) : FALLBACK_CLEAR_M;
}

/** Weather visibility: each entry's value holds until the next, and is interpolated when the next gives one too. */
function weatherVisibilityM(s: Scenario, minute: number): number {
  const clear = clearM(s);
  const zero = v(s.zeroHour);
  const at = (i: number) => minutesBetween(zero, s.weather[i]!.at);
  const val = (i: number) => (s.weather[i]!.visibilityM ? v(s.weather[i]!.visibilityM!) : clear);
  const n = s.weather.length;
  if (n === 0 || minute < at(0)) return clear;
  let i = 0;
  while (i + 1 < n && at(i + 1) <= minute) i++;
  if (i + 1 >= n || !s.weather[i]!.visibilityM || !s.weather[i + 1]!.visibilityM) return val(i);
  const t = (minute - at(i)) / (at(i + 1) - at(i));
  return val(i) + t * (val(i + 1) - val(i));
}

/**
 * How far men can see at a minute: the weather's visibility, held down by the light. By day the
 * weather rules; at night `nightVisibilityM`; between, linear over `twilightMin`. `tables` carries
 * the night and twilight values.
 */
export function visibilityM(s: Scenario, tables: Tables, minuteAfterZero: number): number {
  // Asked several times a step for the same minute: the last answer is kept (it depends on nothing else).
  const last = lastVisibility.get(s);
  if (last && last.tables === tables && last.minute === minuteAfterZero) return last.value;
  const value = workVisibilityM(s, tables, minuteAfterZero);
  lastVisibility.set(s, { tables, minute: minuteAfterZero, value });
  return value;
}
const lastVisibility = new WeakMap<Scenario, { tables: Tables; minute: number; value: number }>();

function workVisibilityM(s: Scenario, tables: Tables, minuteAfterZero: number): number {
  const weather = weatherVisibilityM(s, minuteAfterZero);
  const night = Math.min(weather, v(tables.effects.nightVisibilityM));
  const f = daylight(s, tables, minuteAfterZero);
  return night + f * (weather - night);
}

/** How well a target at range r shows: 1 at the firer, falling linearly to 0 at the visibility limit. */
export function visibility(r: number, visM: number): number {
  return visM <= 0 ? 0 : Math.min(1, Math.max(0, 1 - r / visM));
}
