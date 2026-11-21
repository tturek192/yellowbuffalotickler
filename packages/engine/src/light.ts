import { addMinutes, minutesBetween, v } from '@wwi/scenario';
import type { Scenario, Tables } from '@wwi/scenario';

const RAD = Math.PI / 180;
/** The sun's apparent upper limb at the horizon, with refraction: zenith angle at sunrise and sunset. */
const HORIZON_ZENITH_DEG = 90.833;
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

/**
 * Sunrise and sunset in minutes after local midnight, by the NOAA solar-position approximation
 * (Meeus-based; good to about a minute away from the poles). `date` is 'YYYY-MM-DD' on the local clock,
 * which is `utcOffsetMin` east of UTC. At polar day or night the times collapse onto solar noon.
 */
export function sunTimes(lat: number, lon: number, date: string, utcOffsetMin: number): { sunrise: number; sunset: number } {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const jd = (Date.UTC(y, m - 1, d, 12) - Date.UTC(2000, 0, 1, 12)) / 86_400_000 + 2_451_545;
  const T = (jd - 2_451_545) / 36_525;
  const L0 = (280.46646 + T * (36_000.76983 + T * 0.0003032)) % 360;
  const M = 357.52911 + T * (35_999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C =
    Math.sin(M * RAD) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * M * RAD) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * M * RAD) * 0.000289;
  const omega = 125.04 - 1934.136 * T;
  const lambda = L0 + C - 0.00569 - 0.00478 * Math.sin(omega * RAD);
  const obliq0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const obliq = obliq0 + 0.00256 * Math.cos(omega * RAD);
  const decl = Math.asin(Math.sin(obliq * RAD) * Math.sin(lambda * RAD));
  const yy = Math.tan((obliq * RAD) / 2) ** 2;
  const eqTime =
    4 *
    (yy * Math.sin(2 * L0 * RAD) -
      2 * e * Math.sin(M * RAD) +
      4 * e * yy * Math.sin(M * RAD) * Math.cos(2 * L0 * RAD) -
      0.5 * yy * yy * Math.sin(4 * L0 * RAD) -
      1.25 * e * e * Math.sin(2 * M * RAD)) /
    RAD;
  const cosHa = Math.cos(HORIZON_ZENITH_DEG * RAD) / (Math.cos(lat * RAD) * Math.cos(decl)) - Math.tan(lat * RAD) * Math.tan(decl);
  const ha = Math.acos(Math.min(1, Math.max(-1, cosHa))) / RAD;
  const noon = 720 - 4 * lon - eqTime + utcOffsetMin;
  return { sunrise: noon - 4 * ha, sunset: noon + 4 * ha };
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
  const weather = weatherVisibilityM(s, minuteAfterZero);
  const night = Math.min(weather, v(tables.effects.nightVisibilityM));
  const f = daylight(s, tables, minuteAfterZero);
  return night + f * (weather - night);
}

/** How well a target at range r shows: 1 at the firer, falling linearly to 0 at the visibility limit. */
export function visibility(r: number, visM: number): number {
  return visM <= 0 ? 0 : Math.min(1, Math.max(0, 1 - r / visM));
}
