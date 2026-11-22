import { sunTimes } from '@wwi/engine/reader';
import type { RunRecord, WeatherEntry } from '@wwi/engine';

/** How weather and night look on the sheet (Task 20 restyles these). */
export const SKY_STYLE = {
  /** Night: a blue-black wash, this strong at full dark. */
  night: 'rgb(18, 24, 48)',
  nightAlpha: 0.42,
  /** Mist below this visibility, whitening up to mistAlpha at none. */
  mistBelowM: 500,
  mist: 'rgb(236, 236, 232)',
  mistAlpha: 0.35,
  /** Particles per screen pixel, and their speeds in px per wall-clock second. */
  density: { rain: 1 / 3600, snow: 1 / 5200 },
  fall: { rain: 520, snow: 46 },
  /** Sideways drift with the wind, px/s. */
  drift: { rain: 90, snow: 30 },
  rain: 'rgba(70, 86, 110, 0.38)',
  snow: 'rgba(255, 255, 255, 0.85)',
  snowEdge: 'rgba(90, 96, 110, 0.35)',
} as const;

const zeroCache = new Map<string, number>();
/** Zero hour's local wall clock as UTC milliseconds (local times are read through UTC fields, as the engine does). */
function zeroMs(zeroHour: string): number {
  let t = zeroCache.get(zeroHour);
  if (t === undefined) {
    const [d, hm] = zeroHour.split('T') as [string, string];
    const [y, mo, da] = d.split('-').map(Number) as [number, number, number];
    const [h, mi] = hm.split(':').map(Number) as [number, number];
    zeroCache.set(zeroHour, (t = Date.UTC(y, mo - 1, da, h, mi)));
  }
  return t;
}

/** The weather in force at a minute: the latest entry at or before it; null when the record has none. */
export function weatherAt(r: RunRecord, minute: number): WeatherEntry | null {
  const w = r.conditions?.weather;
  if (!w || w.length === 0) return null;
  let hit: WeatherEntry | null = null;
  for (const e of w) {
    if (e.minute > minute) break;
    hit = e;
  }
  return hit;
}

const sunCache = new Map<string, { sunrise: number; sunset: number }>();

/**
 * How dark it is (0 day, 1 night), as the engine's light model has it: full light from sunrise to sunset, fading over
 * the twilight minutes either side (light.ts `daylight`, with `sunTimes` shared through `@wwi/engine/reader`).
 * A record without conditions (before engine 0.4.4) is always day.
 */
export function darknessAt(r: RunRecord, minute: number): number {
  const sun = r.conditions?.sun;
  if (!sun) return 0;
  const at = new Date(zeroMs(r.zeroHour) + minute * 60_000);
  const date = at.toISOString().slice(0, 10);
  const min = at.getUTCHours() * 60 + at.getUTCMinutes() + at.getUTCSeconds() / 60;
  const key = `${sun.lat},${sun.lon},${sun.utcOffsetMin},${date}`;
  let t = sunCache.get(key);
  if (!t) sunCache.set(key, (t = sunTimes(sun.lat, sun.lon, date, sun.utcOffsetMin)));
  const tw = Math.max(sun.twilightMin, 1e-9);
  const light = min >= t.sunrise && min <= t.sunset ? 1 : min < t.sunrise ? Math.max(0, 1 - (t.sunrise - min) / tw) : Math.max(0, 1 - (min - t.sunset) / tw);
  return 1 - light;
}

/** A small fixed hash to [0, 1): the particles' places never use Math.random, so a frame always looks the same. */
const unit = (i: number, k: number): number => {
  let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(k + 0x27d4eb2f, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  return (h >>> 0) / 4294967296;
};

export type Particle = { kind: 'rain' | 'snow'; x: number; y: number; dx: number; dy: number };

/**
 * Rain, sleet (both) or snow over a w × h sheet at wall-clock second t: each particle at a fixed hashed start, carried down
 * the sheet and across it with the wind (blowing from `windFromDeg`, north up). None for no precipitation.
 */
export function precipitation(kind: WeatherEntry['precipitation'], windFromDeg: number | undefined, w: number, h: number, t: number): Particle[] {
  if (kind === 'none' || w <= 0 || h <= 0) return [];
  const kinds: Array<'rain' | 'snow'> = kind === 'sleet' ? ['rain', 'snow'] : [kind];
  const wind = windFromDeg === undefined ? [0, 0] : [-Math.sin((windFromDeg * Math.PI) / 180), Math.cos((windFromDeg * Math.PI) / 180)];
  const out: Particle[] = [];
  kinds.forEach((k, ki) => {
    const n = Math.round(w * h * SKY_STYLE.density[k] * (kind === 'sleet' ? 0.6 : 1));
    const fall = SKY_STYLE.fall[k];
    const drift = SKY_STYLE.drift[k];
    for (let i = 0; i < n; i++) {
      const speed = 0.7 + 0.6 * unit(i, ki * 7 + 3);
      const vx = wind[0]! * drift * speed;
      const vy = fall * speed + wind[1]! * drift * 0.3;
      const x = (((unit(i, ki * 7 + 1) * w + vx * t) % w) + w) % w;
      const y = (((unit(i, ki * 7 + 2) * h + vy * t) % h) + h) % h;
      // A streak along the motion for rain; a flake's short wobble for snow.
      const len = k === 'rain' ? 9 : 1.2;
      const norm = Math.hypot(vx, vy) || 1;
      out.push({ kind: k, x, y, dx: k === 'rain' ? (vx / norm) * len : vx === 0 ? 0 : (Math.sign(vx) * len) / 2, dy: k === 'rain' ? (vy / norm) * len : 0 });
    }
  });
  return out;
}

/**
 * Night, mist and the falling weather over the map (CSS pixels); `t` is wall-clock seconds, or null to hold still. The
 * particles are left out while `particles` is false (in the middle of a pan or zoom).
 */
export function drawSky(ctx: CanvasRenderingContext2D, r: RunRecord, minute: number, w: number, h: number, t: number | null, particles = true): void {
  const dark = darknessAt(r, minute);
  const wx = weatherAt(r, minute);
  ctx.save();
  if (dark > 0) {
    ctx.globalAlpha = SKY_STYLE.nightAlpha * dark;
    ctx.fillStyle = SKY_STYLE.night;
    ctx.fillRect(0, 0, w, h);
  }
  const vis = wx?.visibilityM;
  if (vis !== undefined && vis < SKY_STYLE.mistBelowM) {
    ctx.globalAlpha = SKY_STYLE.mistAlpha * (1 - vis / SKY_STYLE.mistBelowM);
    ctx.fillStyle = SKY_STYLE.mist;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.globalAlpha = 1;
  if (particles && wx && wx.precipitation !== 'none') {
    const ps = precipitation(wx.precipitation, wx.windFromDeg, w, h, t ?? 0);
    ctx.lineCap = 'round';
    ctx.strokeStyle = SKY_STYLE.rain;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (const p of ps) if (p.kind === 'rain') {
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.dx, p.y + p.dy);
    }
    ctx.stroke();
    ctx.fillStyle = SKY_STYLE.snow;
    ctx.strokeStyle = SKY_STYLE.snowEdge;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (const p of ps) if (p.kind === 'snow') {
      ctx.moveTo(p.x + p.dx + 1.6, p.y);
      ctx.arc(p.x + p.dx, p.y, 1.6, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

/** Whether the sky moves (something falls), so the map keeps redrawing in wall time. */
export const skyMoves = (r: RunRecord, minute: number): boolean => {
  const wx = weatherAt(r, minute);
  return !!wx && wx.precipitation !== 'none';
};
