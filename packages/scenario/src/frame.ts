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
