import type { RunRecord } from '@wwi/engine';
import type { Frame } from '../playback';
import { BARRAGE_DEPTH_M, worldToScreen, type Point, type View } from './projection';

export const MAP_COLORS = {
  paper: '#efe6cf',
  ink: '#3b3326',
  allied: '#1f4e8c',
  central: '#c0392b',
  hatch: '#c9a24a',
} as const;

const LABEL_FONT = '"EB Garamond", Garamond, "Iowan Old Style", Georgia, serif';
const MARKER_FONT = '"Barlow Condensed", "Arial Narrow", "Roboto Condensed", system-ui, sans-serif';

type Screen = [number, number];

/** Vertical room one company marker needs: 16 px box, 2 px gap, 3 px strength bar, 3 px air. */
const MARKER_PITCH = 24;
type Line = RunRecord['geometry']['lines'][number];

/** '16bn-a' → '16A'; otherwise the first three characters, upper-cased. */
export function shortId(id: string): string {
  const m = /^(\d+)[a-z]*-([a-z0-9]+)$/i.exec(id);
  if (m) return `${m[1]}${m[2]!.toUpperCase()}`;
  return id.slice(0, 3).toUpperCase();
}

/** A square wave of ±amp either side of a screen polyline, flipping every `half` pixels. */
export function crenellatedPath(pts: Screen[], half: number, amp: number): Screen[] {
  const out: Screen[] = [];
  let sign = 1;
  let phase = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[i + 1]!;
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len === 0) continue;
    const ux = (x1 - x0) / len;
    const uy = (y1 - y0) / len;
    const nx = -uy;
    const ny = ux;
    const at = (s: number): Screen => [x0 + ux * s + nx * amp * sign, y0 + uy * s + ny * amp * sign];
    if (out.length === 0) out.push(at(0));
    let s = 0;
    while (phase + (len - s) > half) {
      s += half - phase;
      phase = 0;
      out.push(at(s));
      sign = -sign;
      out.push(at(s));
    }
    phase += len - s;
    out.push(at(len));
  }
  return out;
}

const SCALE_STEPS = [50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];

/** The longest round length (m) whose bar fits within targetPx at scale px/m. */
export function niceScaleLength(scale: number, targetPx: number): number {
  let best = SCALE_STEPS[0]!;
  for (const m of SCALE_STEPS) if (m * scale <= targetPx) best = m;
  return best;
}

/**
 * Push markers that would overlap (closer than `width` across and `pitch` down) apart vertically,
 * symmetrically, so stacked companies stay legible. x is never changed.
 */
export function declutter(points: Screen[], width: number, pitch: number, iterations = 60): Screen[] {
  const out = points.map(([x, y]): Screen => [x, y]);
  for (let it = 0; it < iterations; it++) {
    let moved = false;
    for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i]!;
        const b = out[j]!;
        if (Math.abs(a[0] - b[0]) >= width) continue;
        const dy = b[1] - a[1];
        const overlap = pitch - Math.abs(dy);
        if (overlap <= 1e-9) continue;
        const dir = dy < 0 ? -1 : 1;
        a[1] -= (dir * overlap) / 2;
        b[1] += (dir * overlap) / 2;
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

function tracePath(ctx: CanvasRenderingContext2D, pts: Screen[]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
}

function cssSize(ctx: CanvasRenderingContext2D): { w: number; h: number } {
  const t = ctx.getTransform();
  const k = t.a || 1;
  return { w: ctx.canvas.width / k, h: ctx.canvas.height / k };
}

/**
 * Label a line just above its northern (topmost) end. `align` says which way the text runs from the
 * line; a label that would run off the sheet is pulled back inside and lifted a row clear of its neighbour.
 */
function labelAtNorthEnd(ctx: CanvasRenderingContext2D, pts: Screen[], text: string, color: string, size: number, align: CanvasTextAlign): void {
  if (pts.length === 0) return;
  const { w } = cssSize(ctx);
  const top = pts.reduce((a, b) => (b[1] < a[1] ? b : a));
  ctx.save();
  ctx.font = `italic ${size}px ${LABEL_FONT}`;
  const width = ctx.measureText(text).width;
  let x0 = align === 'right' ? top[0] - 4 - width : align === 'left' ? top[0] + 4 : top[0] - width / 2;
  let y = top[1] - 7;
  const margin = 16;
  const clamped = Math.min(Math.max(x0, margin), w - margin - width);
  if (clamped !== x0 && align !== 'center') y -= size + 2;
  x0 = clamped;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = MAP_COLORS.paper;
  ctx.lineWidth = 4;
  ctx.strokeText(text, x0, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x0, y);
  ctx.restore();
}

function drawPaper(ctx: CanvasRenderingContext2D, view: View, r: RunRecord): void {
  const { w, h } = cssSize(ctx);
  ctx.fillStyle = MAP_COLORS.paper;
  ctx.fillRect(0, 0, w, h);

  // Age the sheet: a soft darkening towards the edges.
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
  g.addColorStop(0, 'rgba(120, 92, 40, 0)');
  g.addColorStop(1, 'rgba(120, 92, 40, 0.16)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Map squares every 500 m, as on the period sheets.
  const grid = 500;
  const x0 = Math.floor((0 - view.tx) / view.scale / grid) * grid;
  const x1 = (w - view.tx) / view.scale;
  const y0 = Math.floor((view.ty - h) / view.scale / grid) * grid;
  const y1 = view.ty / view.scale;
  ctx.strokeStyle = 'rgba(122, 96, 52, 0.16)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = x0; x <= x1; x += grid) {
    const [sx] = worldToScreen(view, [x, 0]);
    ctx.moveTo(Math.round(sx) + 0.5, 0);
    ctx.lineTo(Math.round(sx) + 0.5, h);
  }
  for (let y = y0; y <= y1; y += grid) {
    const [, sy] = worldToScreen(view, [0, y]);
    ctx.moveTo(0, Math.round(sy) + 0.5);
    ctx.lineTo(w, Math.round(sy) + 0.5);
  }
  ctx.stroke();

  // Sector boundaries: dash-dot, full width.
  ctx.save();
  ctx.strokeStyle = 'rgba(59, 51, 38, 0.45)';
  ctx.setLineDash([14, 4, 2, 4]);
  ctx.lineWidth = 1;
  for (const s of r.geometry.sectors) {
    for (const y of [s.yMin, s.yMax]) {
      const [, sy] = worldToScreen(view, [0, y]);
      ctx.beginPath();
      ctx.moveTo(0, Math.round(sy) + 0.5);
      ctx.lineTo(w, Math.round(sy) + 0.5);
      ctx.stroke();
    }
  }
  ctx.restore();

  // Neatline.
  ctx.strokeStyle = 'rgba(59, 51, 38, 0.7)';
  ctx.lineWidth = 1;
  ctx.strokeRect(6.5, 6.5, w - 13, h - 13);
  ctx.lineWidth = 0.5;
  ctx.strokeRect(10, 10, w - 20, h - 20);
}

function drawTrench(ctx: CanvasRenderingContext2D, view: View, line: Line): void {
  const color = line.side === 'central' ? MAP_COLORS.central : line.side === 'allied' ? MAP_COLORS.allied : MAP_COLORS.ink;
  const pts = line.points.map((p) => worldToScreen(view, p));
  ctx.save();
  // A faint wash under the trace, like a coloured-in parapet.
  ctx.globalAlpha = 0.14;
  ctx.strokeStyle = color;
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  tracePath(ctx, pts);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1.75;
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';
  tracePath(ctx, crenellatedPath(pts, 4, 2.5));
  ctx.stroke();
  ctx.restore();
  labelAtNorthEnd(ctx, pts, line.name, color, 14, line.side === 'central' ? 'left' : line.side === 'allied' ? 'right' : 'center');
}

function drawObjective(ctx: CanvasRenderingContext2D, view: View, line: Line): void {
  const color = line.color ?? MAP_COLORS.ink;
  const pts = line.points.map((p) => worldToScreen(view, p));
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.25;
  ctx.setLineDash([11, 6]);
  tracePath(ctx, pts);
  ctx.stroke();
  ctx.restore();
  labelAtNorthEnd(ctx, pts, line.name, color, 16, 'center');
}

function drawBarrage(ctx: CanvasRenderingContext2D, view: View, points: Point[]): void {
  if (points.length < 2) return;
  const near = points.map((p) => worldToScreen(view, p));
  const far = points.map(([x, y]) => worldToScreen(view, [x + BARRAGE_DEPTH_M, y]));
  const poly = [...near, ...far.reverse()];
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  ctx.save();
  tracePath(ctx, poly);
  ctx.closePath();
  ctx.fillStyle = 'rgba(201, 162, 74, 0.2)';
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = MAP_COLORS.hatch;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  const step = 6;
  const span = maxY - minY;
  for (let x = minX - span; x <= maxX; x += step) {
    ctx.moveTo(x, maxY);
    ctx.lineTo(x + span, minY);
  }
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(150, 116, 40, 0.85)';
  ctx.lineWidth = 1;
  tracePath(ctx, poly);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function drawCompanies(ctx: CanvasRenderingContext2D, view: View, r: RunRecord, frame: Frame): void {
  const initial = new Map((r.snapshots[0]?.companies ?? []).map((c) => [c.id, c.strength]));
  const W = 26;
  const H = 16;
  const placed = declutter(frame.companies.map((c) => worldToScreen(view, [c.x, c.y])), W + 2, MARKER_PITCH);
  const order = frame.companies.map((c, i) => ({ c, at: placed[i]! })).sort((a, b) => a.at[1] - b.at[1]);
  for (const { c, at } of order) {
    const [sx, sy] = at;
    const x = Math.round(sx - W / 2);
    const y = Math.round(sy - H / 2);
    const color = c.side === 'central' ? MAP_COLORS.central : MAP_COLORS.allied;

    ctx.save();
    ctx.shadowColor = 'rgba(40, 30, 10, 0.35)';
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 1;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, W, H);
    ctx.restore();

    if (c.status === 'consolidating') {
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 1, y - 1, W + 2, H + 2);
      ctx.strokeStyle = 'rgba(20, 16, 8, 0.4)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 2.5, y - 2.5, W + 5, H + 5);
    } else {
      ctx.strokeStyle = 'rgba(20, 16, 8, 0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, W - 1, H - 1);
    }

    ctx.fillStyle = '#ffffff';
    ctx.font = `600 11px ${MARKER_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(shortId(c.id), x + W / 2, y + H / 2 + 0.5);

    const full = initial.get(c.id) ?? c.strength;
    const ratio = full > 0 ? Math.max(0, Math.min(1, c.strength / full)) : 0;
    const by = y + H + 2;
    ctx.fillStyle = 'rgba(59, 51, 38, 0.25)';
    ctx.fillRect(x, by, W, 3);
    ctx.fillStyle = MAP_COLORS.ink;
    ctx.fillRect(x, by, Math.round(W * ratio), 3);
  }
}

/** Scale bar (bottom left) and north arrow (top right). */
function drawFurniture(ctx: CanvasRenderingContext2D, view: View): void {
  const { w, h } = cssSize(ctx);
  const metres = niceScaleLength(view.scale, 160);
  const len = metres * view.scale;
  const x = 24;
  const y = h - 30;
  ctx.save();
  ctx.fillStyle = MAP_COLORS.ink;
  ctx.strokeStyle = MAP_COLORS.ink;
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const seg = len / 4;
    if (i % 2 === 0) ctx.fillRect(x + i * seg, y, seg, 4);
  }
  ctx.strokeRect(x + 0.5, y + 0.5, len, 4);
  ctx.font = `italic 13px ${LABEL_FONT}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText('0', x - 2, y + 7);
  ctx.textAlign = 'right';
  ctx.fillText(metres >= 1000 ? `${metres / 1000} km` : `${metres} m`, x + len + 4, y + 7);

  const nx = w - 30;
  const ny = 26;
  ctx.beginPath();
  ctx.moveTo(nx, ny);
  ctx.lineTo(nx + 6, ny + 18);
  ctx.lineTo(nx, ny + 14);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(nx, ny);
  ctx.lineTo(nx - 6, ny + 18);
  ctx.lineTo(nx, ny + 14);
  ctx.closePath();
  ctx.stroke();
  ctx.font = `600 12px ${MARKER_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('N', nx, ny + 21);
  ctx.restore();
}

/**
 * Draw one frame in CSS pixels (the caller sets the devicePixelRatio transform):
 * paper, trenches, objective lines, barrage bands, then company markers.
 */
export function drawFrame(ctx: CanvasRenderingContext2D, view: View, r: RunRecord, frame: Frame): void {
  drawPaper(ctx, view, r);
  for (const l of r.geometry.lines) if (l.kind === 'trench') drawTrench(ctx, view, l);
  for (const l of r.geometry.lines) if (l.kind === 'objective') drawObjective(ctx, view, l);
  for (const b of frame.barrages) drawBarrage(ctx, view, b.points);
  drawCompanies(ctx, view, r, frame);
  drawFurniture(ctx, view);
}
