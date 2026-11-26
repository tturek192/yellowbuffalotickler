import type { Line, SandboxMap, Unit } from '@wwi/sandbox';
import { MAP_COLORS } from '../map/style';

/** Map metres to screen pixels: the whole map fits the canvas width. */
export type SView = { scale: number; w: number; h: number };
export function fitView(m: SandboxMap, widthPx: number): SView {
  const scale = widthPx / (m.w * m.cellM); return { scale, w: widthPx, h: m.h * m.cellM * scale };
}
export const toScreen = (v: SView, x: number, y: number) => ({ x: x * v.scale, y: y * v.scale });
export const toMetres = (v: SView, px: number, py: number) => ({ x: px / v.scale, y: py / v.scale });

export const SIDE_COLOUR = { attacker: MAP_COLORS.allied, defender: MAP_COLORS.german } as const;
const GROUND: Record<string, string> = { wood: '#9aa57a', village: '#c9b48e', river: '#7f9fb5', road: '#d9c9a3' };

/** Paper-coloured ground shaded by height, with woods, villages, rivers and roads. Draw once per map into a cache. */
export function drawTerrain(ctx: CanvasRenderingContext2D, v: SView, m: SandboxMap): void {
  const hs = m.cells.map(c => c.h); const lo = Math.min(...hs), hi = Math.max(...hs) || 1; const c = m.cellM * v.scale;
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
    const cell = m.cells[y * m.w + x]; const t = (cell.h - lo) / Math.max(1, hi - lo);
    ctx.fillStyle = GROUND[cell.t] ?? `hsl(42, ${30 - t * 10}%, ${88 - t * 22}%)`;
    ctx.fillRect(x * c, y * c, c + 0.5, c + 0.5);
  }
  ctx.strokeStyle = 'rgba(122,96,52,0.35)'; ctx.lineWidth = 0.6;   // contour hint every 20 m
  for (let y = 0; y < m.h - 1; y++) for (let x = 0; x < m.w - 1; x++) {
    const a = Math.floor(m.cells[y * m.w + x].h / 20), b = Math.floor(m.cells[y * m.w + x + 1].h / 20), d = Math.floor(m.cells[(y + 1) * m.w + x].h / 20);
    if (a !== b) { ctx.beginPath(); ctx.moveTo((x + 1) * c, y * c); ctx.lineTo((x + 1) * c, (y + 1) * c); ctx.stroke(); }
    if (a !== d) { ctx.beginPath(); ctx.moveTo(x * c, (y + 1) * c); ctx.lineTo((x + 1) * c, (y + 1) * c); ctx.stroke(); }
  }
}

export type DrawData = { map: SandboxMap; units: Unit[]; lines: Line[]; creepX: number | null; dir: 1 | -1; pointBarrages: Array<{ x: number; y: number }>; selected?: string; barrageDepthM?: number };
export type HitBox = { id: string; x: number; y: number; w: number; h: number };

/** Lines, strongholds, barrages and units over the cached terrain. Returns each unit's on-screen box for tapping. */
export function drawSandbox(ctx: CanvasRenderingContext2D, v: SView, d: DrawData): { boxes: HitBox[] } {
  const H = d.map.h * d.map.cellM;
  for (const l of d.lines) {
    ctx.strokeStyle = l.kind === 'wire' ? MAP_COLORS.ink : l.side === 'attacker' ? SIDE_COLOUR.attacker : MAP_COLORS.central;
    ctx.lineWidth = l.kind === 'wire' ? 1 : 2.5; ctx.setLineDash(l.kind === 'wire' ? [2, 3] : []);
    ctx.globalAlpha = l.kind === 'wire' ? 1 - 0.7 * (l.cut ?? 0) : 1;
    ctx.beginPath(); l.points.forEach(([x, y], i) => { const p = toScreen(v, x, y); if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); }); ctx.stroke();
  }
  ctx.setLineDash([]); ctx.globalAlpha = 1;
  for (const s of d.map.strongholds) { const p = toScreen(v, s.x, s.y); ctx.strokeStyle = MAP_COLORS.central; ctx.lineWidth = 1.5; ctx.strokeRect(p.x - 5, p.y - 5, 10, 10); }
  const depth = d.barrageDepthM ?? 150;
  if (d.creepX !== null) { const a = toScreen(v, Math.min(d.creepX, d.creepX + d.dir * depth), 0); ctx.fillStyle = 'rgba(201,162,74,0.45)'; ctx.fillRect(a.x, 0, depth * v.scale, H * v.scale); }
  for (const p of d.pointBarrages) { const s = toScreen(v, p.x, p.y); ctx.fillStyle = 'rgba(201,162,74,0.55)'; ctx.beginPath(); ctx.arc(s.x, s.y, 150 * v.scale, 0, Math.PI * 2); ctx.fill(); }
  const boxes: HitBox[] = [];
  const bw = Math.max(10, 400 * v.scale), bh = Math.max(6, bw * 0.5);
  for (const u of d.units) {
    const p = toScreen(v, u.x, u.y); const gone = u.status === 'destroyed' || u.status === 'surrendered';
    ctx.globalAlpha = gone ? 0.35 : 1; ctx.fillStyle = SIDE_COLOUR[u.side]; ctx.strokeStyle = u.id === d.selected ? '#f0c419' : MAP_COLORS.ink; ctx.lineWidth = u.id === d.selected ? 2 : 1;
    if (u.kind === 'battery') {
      ctx.beginPath(); ctx.arc(p.x, p.y, bh * 0.7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      boxes.push({ id: u.id, x: p.x - bh, y: p.y - bh, w: bh * 2, h: bh * 2 });
    } else {
      const x = p.x - bw / 2, y = p.y - bh / 2;
      if (u.status === 'waiting') { ctx.fillStyle = '#f5efdf'; }
      ctx.fillRect(x, y, bw, bh); ctx.strokeRect(x, y, bw, bh);
      if (u.status === 'pinned') { ctx.strokeStyle = MAP_COLORS.paper; ctx.beginPath(); ctx.moveTo(x, y + bh); ctx.lineTo(x + bw, y); ctx.stroke(); }
      if (u.status === 'falling-back') { ctx.fillStyle = MAP_COLORS.ink; ctx.beginPath(); const back = (u.side === 'attacker' ? -d.dir : d.dir) * bw * 0.35; ctx.moveTo(p.x + back, p.y); ctx.lineTo(p.x - back * 0.3, p.y - bh * 0.3); ctx.lineTo(p.x - back * 0.3, p.y + bh * 0.3); ctx.fill(); }
      if (u.kind === 'battalion' && !gone) { const total = u.men + u.killed + u.wounded + u.captured; ctx.fillStyle = MAP_COLORS.ink; ctx.fillRect(x, y + bh + 1, bw * (u.men / Math.max(1, total)), 2); }
      boxes.push({ id: u.id, x, y, w: bw, h: bh });
    }
  }
  ctx.globalAlpha = 1;
  return { boxes };
}
