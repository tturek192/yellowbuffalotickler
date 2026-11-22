import type { RunRecord } from '@wwi/engine';
import { aggregateBattalions, companiesOf, type Frame } from '../playback';
import { BARRAGE_DEPTH_M, recordBounds, worldToScreen, type View } from './projection';
import { declutter, type Screen } from './declutter';
import { divisionTags, nudgeClear, objectiveLabelGroups, overlaps, placeClear, trenchLabel, type Box } from './labels';
import { drawFeatures } from './features';
import { terrainLayer } from './hillshade';
import { LABEL_FONT, MAP_COLORS, MARKER_FONT, crenellatedPath, sideColor, tracePath } from './style';
import { markerStyleAt } from './zoom';
import { MARKER_STYLE, drawUnitMarker } from './unitMarkers';
import { frontAt } from './front';
import {
  bursts, craters, drawBursts, drawCaptured, drawCraters, drawCreeping, drawFronts, drawMgZones, drawReserves, drawSegmentStates, drawStanding,
  fireEventsAt, mgZones, reserveColumns, segmentStates, standingBarrages,
} from './effects';
import { drawSky } from './sky';

export { crenellatedPath, MAP_COLORS } from './style';

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

function drawPaper(ctx: CanvasRenderingContext2D, view: View, r: RunRecord, settled: boolean): void {
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
    const t = terrainLayer(r.geometry.terrain, view, w, h, dpr, settled);
    ctx.drawImage(t.image, t.x, t.y, t.w, t.h);
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
  const startPts = (r.snapshots[0] ? companiesOf(r, r.snapshots[0]) : []).map((c) => worldToScreen(view, [c.x, c.y])[0] - 16);
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

/** What changes between frames of the same battle minute: the wall-clock pulse of the suppression rings, and the weather's fall. */
export type DrawOptions = {
  /**
   * False in the middle of a pan or zoom: the terrain is moved from its last layer, not rebuilt, and the costlier effects
   * (captured ground, fire bursts, falling weather) wait until the view settles.
   */
  settled?: boolean;
  /** Suppression-ring phase in cycles (wall time, never battle time); 0 holds the rings still. */
  pulse?: number;
  /** Playback speed (battle minutes per second): fire bursts thin out as it rises. */
  speed?: number;
  /** Wall-clock seconds for the falling weather; null or absent holds it still. */
  wallSec?: number | null;
};

/** What a click on the map can pick: a company marker (zoomed in) or a battalion marker (corps zoom). */
export type MapPick = { kind: 'company' | 'battalion'; id: string };
/** A marker as drawn: the room it takes on the sheet, and what it stands for. Later entries are drawn on top. */
export type Hit = { box: Box; pick: MapPick };

/** Draw markers declutted against each other, top to bottom so the lower ones overlap the upper ones' bars. */
function placeMarkers<T extends { x: number; y: number }>(view: View, items: readonly T[], w: (t: T) => number, h: number): Array<{ item: T; at: Screen }> {
  const pitch = MARKER_STYLE.pitch(h);
  const wide = Math.max(0, ...items.map(w));
  const placed = declutter(items.map((t) => worldToScreen(view, [t.x, t.y])), wide + 2, pitch, Math.min(13, pitch / 2));
  return items.map((item, i) => ({ item, at: placed[i]! })).sort((a, b) => a.at[1] - b.at[1]);
}

/** A battalion chip as drawn: its centre on the sheet, size and the battalion it stands for. */
export type PlacedChip = { at: Screen; w: number; h: number; label: string; men: number };

/** The room a chip takes on the sheet, strength bar included. */
export const chipBox = (c: Pick<PlacedChip, 'at' | 'w' | 'h'>): Box => ({
  x0: c.at[0] - c.w / 2,
  x1: c.at[0] + c.w / 2,
  y0: c.at[1] - c.h / 2,
  y1: c.at[1] + c.h / 2 + MARKER_STYLE.barGap + MARKER_STYLE.chipBarH,
});

/** Place battalion chips (pure): each at its true position, spread vertically a little where they stack. */
export function placeChips(view: View, bns: readonly { x: number; y: number; label: string; men: number }[], w: number, h: number): Array<PlacedChip & { index: number }> {
  const pitch = h + MARKER_STYLE.barGap + MARKER_STYLE.chipBarH + 2;
  const at = declutter(bns.map((b) => worldToScreen(view, [b.x, b.y])), w + 1, pitch, Math.min(13, pitch / 2));
  return bns.map((b, index) => ({ index, at: at[index]!, w, h, label: b.label, men: b.men }));
}

/**
 * Corps zoom (`markerStyleAt`): a text-free chip per battalion, small enough to tell apart at fit-all. Returns what was
 * drawn so the labels can be placed once the line names are down.
 */
function drawChips(ctx: CanvasRenderingContext2D, view: View, r: RunRecord, frame: Frame, phase: number, size: { w: number; h: number }, hits: Hit[]): PlacedChip[] {
  const bns = aggregateBattalions(frame.companies, r);
  const placed = placeChips(view, bns, size.w, size.h);
  for (const c of [...placed].sort((a, b) => a.at[1] - b.at[1])) {
    const b = bns[c.index]!;
    drawUnitMarker(ctx, { at: c.at, w: c.w, h: c.h, label: b.label, side: b.side, status: b.status, morale: b.morale, suppression: b.suppression, men: b.men, full: b.fullMen, chip: true, phase });
    hits.push({ box: chipBox(c), pick: { kind: 'battalion', id: b.id } });
  }
  return placed;
}

/**
 * Name the chips where the name fits clear of every chip, line name, map name and the clock card, biggest battalions
 * first. A name that fits nowhere is left off (zoom in to read it).
 */
function labelChips(ctx: CanvasRenderingContext2D, chips: readonly PlacedChip[], placed: Box[]): void {
  const { w: sheetW } = cssSize(ctx);
  const size = 10;
  const margin = 16;
  const all = [...placed, ...chips.map(chipBox)];
  ctx.save();
  ctx.font = `600 ${size}px ${MARKER_FONT}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  for (const c of [...chips].sort((a, b) => b.men - a.men || a.label.localeCompare(b.label))) {
    const width = ctx.measureText(c.label).width;
    const x0 = c.at[0] - width / 2;
    const want: Box = { x0: x0 - 1, x1: x0 + width + 1, y0: c.at[1] - c.h / 2 - size - 3, y1: c.at[1] - c.h / 2 - 1 };
    const box = placeClear(want, all, size + 2, 3, 6, 6, margin, sheetW - margin, margin);
    if (all.some((p) => overlaps(box, p))) continue;
    all.push(box);
    ctx.strokeStyle = MAP_COLORS.paper;
    ctx.lineWidth = 3;
    ctx.strokeText(c.label, box.x0 + 1, box.y1 - 1);
    ctx.fillStyle = MAP_COLORS.ink;
    ctx.fillText(c.label, box.x0 + 1, box.y1 - 1);
  }
  ctx.restore();
}

/** Between the chip threshold and the company switch: one labelled marker per battalion. */
function drawBattalions(ctx: CanvasRenderingContext2D, view: View, r: RunRecord, frame: Frame, phase: number, hits: Hit[]): void {
  const { minW, h, padX } = MARKER_STYLE.battalion;
  ctx.font = `600 11px ${MARKER_FONT}`;
  const wOf = (label: string): number => Math.max(minW, Math.ceil(ctx.measureText(label).width) + 2 * padX);
  for (const { item: b, at } of placeMarkers(view, aggregateBattalions(frame.companies, r), (b) => wOf(b.label), h)) {
    const w = wOf(b.label);
    drawUnitMarker(ctx, { at, w, h, label: b.label, side: b.side, status: b.status, morale: b.morale, suppression: b.suppression, men: b.men, full: b.fullMen, battalion: true, phase });
    hits.push({ box: markerBox(at, w, h), pick: { kind: 'battalion', id: b.id } });
  }
}

/** The room a marker takes, its strength bar included. */
const markerBox = (at: Screen, w: number, h: number): Box => ({ x0: at[0] - w / 2, x1: at[0] + w / 2, y0: at[1] - h / 2, y1: at[1] + h / 2 + MARKER_STYLE.barGap + MARKER_STYLE.barH });

/** Zoomed in: one marker per company on the map. */
function drawCompanies(ctx: CanvasRenderingContext2D, view: View, r: RunRecord, frame: Frame, phase: number, hits: Hit[]): void {
  const initial = new Map((r.snapshots[0] ? companiesOf(r, r.snapshots[0]) : []).map((c) => [c.id, c.men]));
  const { w, h } = MARKER_STYLE.company;
  for (const { item: c, at } of placeMarkers(view, frame.companies.filter((c) => c.status !== 'off-map'), () => w, h)) {
    drawUnitMarker(ctx, { at, w, h, label: shortId(c.id), side: c.side, status: c.status, morale: c.morale, suppression: c.suppression, men: c.men, full: initial.get(c.id) ?? c.men, phase });
    hits.push({ box: markerBox(at, w, h), pick: { kind: 'company', id: c.id } });
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

const boundsCache = new WeakMap<RunRecord, ReturnType<typeof recordBounds>>();
const boundsOf = (r: RunRecord): ReturnType<typeof recordBounds> => {
  let b = boundsCache.get(r);
  if (!b) boundsCache.set(r, (b = recordBounds(r)));
  return b;
};

/**
 * Draw one frame in CSS pixels (the caller sets the devicePixelRatio transform), bottom to top: paper and terrain, map
 * features, captured ground, trenches and their segments' state (holder, wire), objective lines, the barrages (machine-gun
 * zone, standing, creeping), both fronts, reserve columns, fire bursts, then unit markers (battalions at corps zoom,
 * companies once 1 km is wider than 250 px, `detailAt`), night and weather, and the labels on top. Returns the markers as
 * drawn, for picking one with a click.
 */
export function drawFrame(ctx: CanvasRenderingContext2D, view: View, r: RunRecord, frame: Frame, opts: DrawOptions = {}): Hit[] {
  const settled = opts.settled ?? true;
  drawPaper(ctx, view, r, settled);
  const labels: Box[] = [];
  drawFeatures(ctx, view, r.geometry.features, labels);
  const soft = labels.length; // map names: a line label may overlap one of these only when nothing else is free
  const front = frontAt(r, frame.minute);
  if (settled) drawCaptured(ctx, view, front);
  const trenches = r.geometry.lines.filter((l) => l.kind === 'trench');
  for (const l of trenches) drawTrench(ctx, view, l);
  drawSegmentStates(ctx, view, segmentStates(r, frame.minute));
  drawCraters(ctx, view, craters(r, frame.minute));
  const objectives = r.geometry.lines.filter((l) => l.kind === 'objective');
  for (const l of objectives) drawObjective(ctx, view, l);
  if (settled) {
    drawMgZones(ctx, view, mgZones(r, frame));
    drawStanding(ctx, view, standingBarrages(r, frame));
  }
  const band = r.geometry.barrageDepthM?.band ?? BARRAGE_DEPTH_M;
  for (const b of frame.barrages) if (!b.done) drawCreeping(ctx, view, b.points, band);
  drawFronts(ctx, view, front);
  drawReserves(ctx, view, reserveColumns(r, frame.minute, boundsOf(r)));
  if (settled) drawBursts(ctx, view, bursts(fireEventsAt(r, frame.minute), opts.speed ?? 1, frame, front, r.geometry.barrageDepthM));
  const style = markerStyleAt(view);
  const phase = opts.pulse ?? 0;
  const hits: Hit[] = [];
  let chips: PlacedChip[] = [];
  if (style.kind === 'company') drawCompanies(ctx, view, r, frame, phase, hits);
  else if (style.kind === 'chip') chips = drawChips(ctx, view, r, frame, phase, style, hits);
  else drawBattalions(ctx, view, r, frame, phase, hits);
  const sheet = cssSize(ctx);
  drawSky(ctx, r, frame.minute, sheet.w, sheet.h, opts.wallSec ?? null, settled);
  // The clock card (HTML, .clock-card in styles.css) hides the sheet's top-left corner: keep labels out from under it.
  labels.push({ x0: 0, x1: cssSize(ctx).w < 600 ? 230 : 300, y0: 0, y1: 86 });
  // Line labels go on top of the markers so a stack of companies never hides a name.
  for (const l of trenches) labelTrench(ctx, view, l, labels, soft);
  labelObjectives(ctx, view, objectives, labels, soft);
  drawDivisionTags(ctx, view, r, objectives, labels);
  labelChips(ctx, chips, labels);
  drawFurniture(ctx, view);
  return hits;
}
