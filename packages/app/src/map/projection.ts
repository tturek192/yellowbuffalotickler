import type { RunRecord } from '@wwi/engine';
import { DEFAULT_RADIUS_M } from './style';

export type Point = [number, number];
export type Bounds = { minX: number; maxX: number; minY: number; maxY: number };
/** Screen = (tx + x·scale, ty − y·scale): uniform scale, y flipped so north is up. */
export type View = { scale: number; tx: number; ty: number };

/** Depth of the drawn barrage band east of each barrage polyline, metres. */
export const BARRAGE_DEPTH_M = 90;

/** Fit bounds into a w×h viewport with pad pixels of margin, centred on the slack axis. */
export function fitView(bounds: Bounds, w: number, h: number, pad = 24): View {
  const bw = Math.max(bounds.maxX - bounds.minX, 1e-9);
  const bh = Math.max(bounds.maxY - bounds.minY, 1e-9);
  const availW = Math.max(w - 2 * pad, 1);
  const availH = Math.max(h - 2 * pad, 1);
  const degenerate = bounds.maxX === bounds.minX && bounds.maxY === bounds.minY;
  const scale = degenerate ? 1 : Math.min(availW / bw, availH / bh);
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  return { scale, tx: w / 2 - cx * scale, ty: h / 2 + cy * scale };
}

export function worldToScreen(view: View, p: Point): [number, number] {
  return [view.tx + p[0] * view.scale, view.ty - p[1] * view.scale];
}

/** Everything the map draws: lines, features (point features at their drawn radius), sector extents, companies and barrage bands across all snapshots. */
export function recordBounds(r: RunRecord): Bounds {
  const b: Bounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const add = (x: number, y: number): void => {
    b.minX = Math.min(b.minX, x);
    b.maxX = Math.max(b.maxX, x);
    b.minY = Math.min(b.minY, y);
    b.maxY = Math.max(b.maxY, y);
  };
  for (const l of r.geometry.lines) for (const [x, y] of l.points) add(x, y);
  for (const f of r.geometry.features) {
    const g = f.geometry;
    if (g.type !== 'Point') for (const [x, y] of g.coordinates) add(x, y);
    else {
      const [x, y] = g.coordinates;
      const rad = g.radiusM ?? DEFAULT_RADIUS_M[f.kind] ?? 0;
      add(x - rad, y - rad);
      add(x + rad, y + rad);
    }
  }
  for (const s of r.snapshots) {
    for (const c of s.companies) add(c.x, c.y);
    for (const br of s.barrages) for (const [x, y] of br.points) add(x + BARRAGE_DEPTH_M, y);
  }
  for (const s of r.geometry.sectors) {
    b.minY = Math.min(b.minY, s.yMin);
    b.maxY = Math.max(b.maxY, s.yMax);
  }
  if (!Number.isFinite(b.minX)) return { minX: 0, maxX: 1, minY: 0, maxY: 1 };
  return b;
}
