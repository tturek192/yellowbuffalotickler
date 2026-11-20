import { z } from 'zod';
import { sourced, type Point } from './sourced';

export const FrameSchema = z.object({
  origin: z.object({ lon: z.number(), lat: z.number() }),
  /** Attack direction in degrees clockwise from north (0 = north, 90 = east); it maps to +x. */
  bearingDeg: sourced(z.number()),
  /** Local metres; holds every projected point. */
  extent: z.object({ minX: z.number(), maxX: z.number(), minY: z.number(), maxY: z.number() }),
});
export type Frame = z.infer<typeof FrameSchema>;

const M_PER_DEG_LON_EQ = 111320;
const M_PER_DEG_LAT = 110540;
const RAD = Math.PI / 180;

function basis(frame: Frame) {
  const theta = (90 - frame.bearingDeg.value) * RAD;
  return { c: Math.cos(theta), s: Math.sin(theta), kx: M_PER_DEG_LON_EQ * Math.cos(frame.origin.lat * RAD) };
}

/** Local equirectangular tangent plane at the origin, rotated so the attack bearing is +x. */
export function projectLonLat(frame: Frame, [lon, lat]: [number, number]): Point {
  const { c, s, kx } = basis(frame);
  const dx = (lon - frame.origin.lon) * kx;
  const dy = (lat - frame.origin.lat) * M_PER_DEG_LAT;
  return [dx * c + dy * s, -dx * s + dy * c];
}

/** Exact inverse of projectLonLat. */
export function unprojectXY(frame: Frame, [x, y]: Point): [number, number] {
  const { c, s, kx } = basis(frame);
  const dx = x * c - y * s;
  const dy = x * s + y * c;
  return [frame.origin.lon + dx / kx, frame.origin.lat + dy / M_PER_DEG_LAT];
}

/**
 * Replace `{ lonLat }` company starts and reserve entry points in a raw scenario document with
 * projected local points. Returns problems (naming the item) for any that cannot be projected.
 */
export function projectLonLatPlacements(data: unknown, frame: Frame | undefined): string[] {
  const problems: string[] = [];
  const isLonLat = (p: unknown): p is { lonLat: [number, number] } =>
    !!p && typeof p === 'object' && !Array.isArray(p) && Array.isArray((p as { lonLat?: unknown }).lonLat);
  const place = (owner: Record<string, unknown>, key: string, label: string) => {
    const p = owner[key];
    if (!isLonLat(p)) return;
    if (!frame) return void problems.push(`${label}: lonLat needs a frame in the scenario file`);
    const ll = p.lonLat;
    if (ll.length !== 2 || typeof ll[0] !== 'number' || typeof ll[1] !== 'number') {
      return void problems.push(`${label}: lonLat must be [lon, lat]`);
    }
    owner[key] = projectLonLat(frame, ll);
  };
  const walk = (fs: unknown) => {
    if (!Array.isArray(fs)) return;
    for (const f of fs) {
      if (!f || typeof f !== 'object') continue;
      const fo = f as Record<string, unknown>;
      if (Array.isArray(fo.companies)) {
        for (const c of fo.companies) {
          if (c && typeof c === 'object') {
            const co = c as Record<string, unknown>;
            place(co, 'start', `company ${String(co.id)}.start`);
          }
        }
      }
      walk(fo.children);
    }
  };
  const d = data as { forces?: unknown; reserves?: unknown } | null;
  if (Array.isArray(d?.forces)) for (const force of d.forces) walk((force as { formations?: unknown } | null)?.formations);
  if (Array.isArray(d?.reserves)) {
    d.reserves.forEach((r, i) => {
      if (r && typeof r === 'object') place(r as Record<string, unknown>, 'entryPoint', `reserves[${i}] (${String((r as { formationId?: unknown }).formationId)}).entryPoint`);
    });
  }
  return problems;
}
