import type { RunRecord } from '@wwi/engine';
import type { Frame } from '../playback';
import { BARRAGE_DEPTH_M, worldToScreen, type Point, type View } from './projection';
import { declutter, type Screen } from './declutter';
import { divisionTags, nudgeClear, objectiveLabelGroups, overlaps, placeClear, trenchLabel, type Box } from './labels';
import { drawFeatures } from './features';
import { terrainLayer } from './hillshade';
import { LABEL_FONT, MAP_COLORS, MARKER_FONT, crenellatedPath, sideColor, tracePath } from './style';

export { crenellatedPath, MAP_COLORS } from './style';

/** Vertical room one company marker needs: 16 px box, 2 px gap, 3 px strength bar, 3 px air. */
const MARKER_PITCH = 24;
/** Furthest a marker may be nudged from its true position; beyond this, markers overlap rather than mislead. */
const MARKER_MAX_SHIFT = Math.min(13, MARKER_PITCH / 2);
type Line = RunRecord['geometry']['lines'][number];

/** '16bn-a' → '16A'; 'rir262-1' → '1/262' (company/regiment); otherwise the first three characters, upper-cased. */
export function shortId(id: string): string {
  const m = /^(\d+)[a-z]*-([a-z0-9]+)$/i.exec(id);
  if (m) return `${m[1]}${m[2]!.toUpperCase()}`;
  const g = /^[a-z]+(\d+)-(\d+)$/i.exec(id);
  if (g) return `${g[2]}/${g[1]}`;
  return id.slice(0, 3).toUpperCase();
}

const SCALE_STEPS = [50, 100, 200, 250, 500, 1000, 2000, 5000, 10000];

/** The longest round length (m) whose bar fits within targetPx at scale px/m. */
export function niceScaleLength(scale: number, targetPx: number): number {
  let best = SCALE_STEPS[0]!;
  for (const m of SCALE_STEPS) if (m * scale <= targetPx) best = m;
  return best;
}

/** Line labels shrink a little on narrow sheets so neighbours fit side by side. */
function labelSize(ctx: CanvasRenderingContext2D, size: number): number {
  return cssSize(ctx).w < 600 ? size - 3 : size;
}

function cssSize(ctx: CanvasRenderingContext2D): { w: number; h: number } {
  const t = ctx.getTransform();
  const k = t.a || 1;
  return { w: ctx.canvas.width / k, h: ctx.canvas.height / k };
}

/**
 * Label a line just above its northern (topmost) end. `align` says which way the text runs from the
 * line. A label that would run off the sheet is pulled back inside, and one that would collide with a
 * label already drawn (recorded in `placed`) is lifted a row at a time, up to three rows.
 */
function labelAtNorthEnd(
  ctx: CanvasRenderingContext2D,
  placed: Box[],
  pts: Screen[],
  text: string,
  color: string,
  size: number,
  align: CanvasTextAlign,
  softCount: number,
): void {
  if (pts.length === 0) return;
  const { w } = cssSize(ctx);
  const top = pts.reduce((a, b) => (b[1] < a[1] ? b : a));
  ctx.save();
  ctx.font = `italic ${size}px ${LABEL_FONT}`;
  const width = ctx.measureText(text).width;
  const want = align === 'right' ? top[0] - 4 - width : align === 'left' ? top[0] + 4 : top[0] - width / 2;
  const margin = 16;
  const x0 = Math.min(Math.max(want, margin), w - margin - width);
  const baseline = top[1] - 7;
  const want0 = { x0: x0 - 2, x1: x0 + width + 2, y0: baseline - size, y1: baseline + 3 };
  const find = (against: readonly Box[]): Box => placeClear(want0, against, size + 3, 10, 10, 24, margin, w - margin, margin);
  let box = find(placed);
  // Crowded: if every spot touches something, settle for overlapping only a map name (the first `softCount` boxes), never another line label.
  if (placed.some((p) => overlaps(box, p))) box = find(placed.slice(softCount));
  placed.push(box);
  const y = box.y1 - 3;
  const tx = box.x0 + 2;
  if (y < baseline || box.x0 !== want0.x0) {
    // Moved clear of a neighbour: a hairline leads back down to the line it names.
    const lx = Math.min(Math.max(top[0], box.x0 + 4), box.x1 - 4);
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    ctx.moveTo(lx, y + 3);
    ctx.lineTo(top[0], top[1] - 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = MAP_COLORS.paper;
  ctx.lineWidth = 4;
  ctx.strokeText(text, tx, y);
  ctx.fillStyle = color;
  ctx.fillText(text, tx, y);
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

  // Relief: hillshade and 5 m contours, printed on the paper under everything else.
  if (r.geometry.terrain) {
    const dpr = ctx.getTransform().a || 1;
    ctx.drawImage(terrainLayer(r.geometry.terrain, view, w, h, dpr), 0, 0, w, h);
  }

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
  const color = sideColor(line.side);
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
}

function labelTrench(ctx: CanvasRenderingContext2D, view: View, line: Line, labels: Box[], soft: number): void {
  const pts = line.points.map((p) => worldToScreen(view, p));
  labelAtNorthEnd(ctx, labels, pts, trenchLabel(line.name), sideColor(line.side), labelSize(ctx, 14), line.side === 'central' ? 'left' : line.side === 'allied' ? 'right' : 'center', soft);
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
}

/** Each objective-line group (Black Line, Red Line …) is labelled once, at the north end of its northernmost segment. */
function labelObjectives(ctx: CanvasRenderingContext2D, view: View, lines: Line[], labels: Box[], soft: number): void {
  for (const { text, anchor } of objectiveLabelGroups(lines)) {
    const pts = anchor.points.map((p) => worldToScreen(view, p));
    labelAtNorthEnd(ctx, labels, pts, text, anchor.color ?? MAP_COLORS.ink, labelSize(ctx, 16), 'center', soft);
  }
}

/**
 * One small upright sector tag per division, right-aligned just west of the allied front (behind it) at
 * the middle of that division's objective lines; nudged along the margin clear of other labels and kept inside the sheet.
 */
function drawDivisionTags(ctx: CanvasRenderingContext2D, view: View, r: RunRecord, lines: Line[], placed: Box[]): void {
  const { w, h } = cssSize(ctx);
  const rear = r.geometry.lines.filter((l) => l.kind === 'trench' && l.side === 'allied');
  const rearPts = (rear.length > 0 ? rear : r.geometry.lines).flatMap((l) => l.points.map((p) => worldToScreen(view, p)));
  if (rearPts.length === 0) return;
  // Behind the front, and behind the companies drawn there at the start, so the tag is not buried under markers.
  const startPts = (r.snapshots[0]?.companies ?? []).map((c) => worldToScreen(view, [c.x, c.y])[0] - 16);
  const edge = Math.min(...rearPts.map((p) => p[0]), ...startPts) - 10;
  const size = labelSize(ctx, 12);
  const margin = 16;
  ctx.save();
  ctx.font = `${size}px ${LABEL_FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  for (const tag of divisionTags(lines)) {
    const width = ctx.measureText(tag.text).width;
    const x0 = Math.max(margin, edge - width);
    const mid = worldToScreen(view, [0, tag.y])[1];
    const want = { x0: x0 - 2, x1: x0 + width + 2, y0: mid - size / 2 - 1, y1: mid + size / 2 + 3 };
    const box = nudgeClear(want, placed, size + 4, 12);
    if (box.y0 < margin || box.y1 > h - margin || box.x1 > w) continue;
    placed.push(box);
    const y = box.y1 - 3;
    ctx.strokeStyle = MAP_COLORS.paper;
    ctx.lineWidth = 3;
    ctx.strokeText(tag.text, x0, y);
    ctx.fillStyle = MAP_COLORS.sepia;
    ctx.fillText(tag.text, x0, y);
  }
  ctx.restore();
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
  const placed = declutter(frame.companies.map((c) => worldToScreen(view, [c.x, c.y])), W + 2, MARKER_PITCH, MARKER_MAX_SHIFT);
  const order = frame.companies.map((c, i) => ({ c, at: placed[i]! })).sort((a, b) => a.at[1] - b.at[1]);
  for (const { c, at } of order) {
    const [sx, sy] = at;
    const x = Math.round(sx - W / 2);
    const y = Math.round(sy - H / 2);
    const color = sideColor(c.side);

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
    } else if (c.side === 'central') {
      ctx.strokeStyle = MAP_COLORS.centralEdge;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x + 0.75, y + 0.75, W - 1.5, H - 1.5);
    } else {
      ctx.strokeStyle = 'rgba(20, 16, 8, 0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, W - 1, H - 1);
    }

    const text = shortId(c.id);
    ctx.fillStyle = '#ffffff';
    ctx.font = `600 11px ${MARKER_FONT}`;
    // Longer ids (German company/regiment) step down a size to stay inside the marker.
    if (ctx.measureText(text).width > W - 4) ctx.font = `600 9.5px ${MARKER_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + W / 2, y + H / 2 + 0.5);

    // Holding companies (garrisons, reserves) have no attack to wear them down: no strength bar.
    if (c.status === 'holding') continue;
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
 * Draw one frame in CSS pixels (the caller sets the devicePixelRatio transform): paper and terrain, map
 * features, trenches, objective lines, barrage bands (until each barrage ends), then company markers.
 */
export function drawFrame(ctx: CanvasRenderingContext2D, view: View, r: RunRecord, frame: Frame): void {
  drawPaper(ctx, view, r);
  const labels: Box[] = [];
  drawFeatures(ctx, view, r.geometry.features, labels);
  const soft = labels.length; // map names: a line label may overlap one of these only when nothing else is free
  const trenches = r.geometry.lines.filter((l) => l.kind === 'trench');
  for (const l of trenches) drawTrench(ctx, view, l);
  const objectives = r.geometry.lines.filter((l) => l.kind === 'objective');
  for (const l of objectives) drawObjective(ctx, view, l);
  for (const b of frame.barrages) if (!b.done) drawBarrage(ctx, view, b.points);
  drawCompanies(ctx, view, r, frame);
  // The clock card (HTML, .clock-card in styles.css) hides the sheet's top-left corner: keep labels out from under it.
  labels.push({ x0: 0, x1: cssSize(ctx).w < 600 ? 230 : 300, y0: 0, y1: 86 });
  // Line labels go on top of the markers so a stack of companies never hides a name.
  for (const l of trenches) labelTrench(ctx, view, l, labels, soft);
  labelObjectives(ctx, view, objectives, labels, soft);
  drawDivisionTags(ctx, view, r, objectives, labels);
  drawFurniture(ctx, view);
}
