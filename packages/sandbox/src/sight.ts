import type { SandboxMap } from './types';
import { terrainAt } from './map';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** True when nothing higher than the sight line, and no wood or village, stands between two points (eyes 2 m up). */
export function losClear(m: SandboxMap, a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const d = dist(a, b); const n = Math.floor(d / 100);
  const ha = terrainAt(m, a.x, a.y).h + 2, hb = terrainAt(m, b.x, b.y).h + 2;
  for (let i = 1; i < n; i++) {
    const t = i / n; const c = terrainAt(m, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    if (c.h > ha + (hb - ha) * t + 2) return false;   // 2 m slack: rolling ground does not hide a battalion
    if ((c.t === 'wood' || c.t === 'village') && i > 1 && i < n - 1) return false;
  }
  return true;
}

