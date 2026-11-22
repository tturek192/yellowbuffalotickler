import type { RunRecord, Side, SimEvent } from '@wwi/engine';
import { battalionLabel, surrounding, type Frame, type FrameCompany } from '../playback';
import type { Front } from './front';
import { holdersAt, segmentPieces } from './front';
import { BARRAGE_DEPTH_M, worldToScreen, type Bounds, type Point, type View } from './projection';
import { MAP_COLORS, MARKER_FONT, sideColor, tracePath } from './style';
import type { Screen } from './declutter';
import { overlaps, placeClear, type Box } from './labels';

/*
 * The battle's effects on the map (spec 9.2, Task 18): the fronts and captured ground, trench segments' holders and wire,
 * the standing barrages and the machine-gun barrage's zone, fire bursts, and reserve columns marching in. The pure parts
 * (what to draw, in world metres) come first; the drawing, with every look in EFFECT_STYLE, after (Task 20 restyles it).
 */

/** How the effects look. */
export const EFFECT_STYLE = {
  capturedAlpha: 0.15,
  front: { width: 2.5, casing: 4.5, alpha: 0.9, central: [7, 3] as number[] },
  /** A taken segment is drawn over in the captor's ink. */
  taken: { wash: 9, washAlpha: 0.22, width: 2 },
  /** Wire: a row of crosses this far (m, at least `minPx`) in front of the trench, one every `step` px; cut wire loses crosses. */
  wire: { offsetM: 25, minPx: 4, step: 6, arm: 1.6, ink: '#4d4537', width: 0.8 },
  creeping: { fill: 'rgba(201, 162, 74, 0.34)', hatch: '#a77d22', hatchWidth: 1.6, hatchStep: 6, edge: 'rgba(120, 88, 20, 0.95)', minPx: 8 },
  standing: { band: 'rgba(214, 120, 48, 0.28)', tick: 'rgba(160, 70, 20, 0.85)', widthM: 60, minPx: 7, tickStep: 4 },
  mg: { fill: 'rgba(112, 100, 140, 0.10)', hatch: 'rgba(90, 76, 130, 0.45)', hatchStep: 7, edge: 'rgba(90, 76, 130, 0.55)' },
  burst: { shell: '#4a3a26', flash: 'rgba(230, 150, 40, 0.9)', bullet: '#2a2622', shellPx: 2.6, bulletPx: 3.2 },
  crater: { fill: 'rgba(110, 84, 44, 0.32)', rim: 'rgba(80, 60, 30, 0.9)', rimWidth: 1.6, minPx: 4 },
  reserve: { width: 3, head: 9, dash: [8, 5] as number[], font: `600 11px ${MARKER_FONT}` },
} as const;

/* ------------------------------------------------------------------ what to draw (pure) */

/** A small fixed integer hash to [0, 1): the effects never use Math.random. */
export function unit(a: number, b: number): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul((b + 0x27d4eb2f) | 0, 0xc2b2ae35);
  h ^= h >>> 15;
  h = Math.imul(h, 0x2c1b3c6d);
  h ^= h >>> 12;
  h = Math.imul(h, 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

/** x on a line of strictly ascending y at y (held flat past its ends). */
export function xOnLine(pts: readonly Point[], y: number): number {
  if (pts.length === 0) return NaN;
  if (y <= pts[0]![1]) return pts[0]![0];
  for (let i = 1; i < pts.length; i++) {
    const [x1, y1] = pts[i]!;
    if (y <= y1) {
      const [x0, y0] = pts[i - 1]!;
      return y1 === y0 ? x1 : x0 + ((x1 - x0) * (y - y0)) / (y1 - y0);
    }
  }
  return pts[pts.length - 1]![0];
}

const depthsOf = (r: RunRecord): { band: number; mg: number } => r.geometry.barrageDepthM ?? { band: BARRAGE_DEPTH_M, mg: 0 };

/** The kinds of event that suggest fire on the map. */
const FIRE_KINDS: ReadonlySet<string> = new Set(['direct-fire', 'shelled', 'fire-opened']);
/** Fire is shown for this many minutes after its event (two steps), fading. */
export const FIRE_WINDOW_MIN = 4;

type FireIndex = { events: SimEvent[]; minutes: Float64Array };
const fireCache = new WeakMap<RunRecord, FireIndex>();
function fireIndex(r: RunRecord): FireIndex {
  let f = fireCache.get(r);
  if (!f) {
    const events = r.events.filter((e) => FIRE_KINDS.has(e.kind)).sort((a, b) => a.minute - b.minute || a.id - b.id);
    fireCache.set(r, (f = { events, minutes: Float64Array.from(events, (e) => e.minute) }));
  }
  return f;
}

/** First index with minutes[i] > m. */
function upper(minutes: Float64Array, m: number): number {
  let lo = 0;
  let hi = minutes.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (minutes[mid]! <= m) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The fire events of the last FIRE_WINDOW_MIN minutes up to a minute (two binary searches over a per-record index). */
export function fireEventsAt(r: RunRecord, minute: number): SimEvent[] {
  const { events, minutes } = fireIndex(r);
  return events.slice(upper(minutes, minute - FIRE_WINDOW_MIN), upper(minutes, minute));
}

export type Burst = { kind: 'shell' | 'bullet'; x: number; y: number; alpha: number; seed: number };
/** Most marks in one frame, however much fire there is. */
const MAX_BURSTS = 400;

const byIdCache = new WeakMap<readonly FrameCompany[], Map<string, FrameCompany>>();
function companyById(frame: Frame): Map<string, FrameCompany> {
  let m = byIdCache.get(frame.companies);
  if (!m) byIdCache.set(frame.companies, (m = new Map(frame.companies.map((c) => [c.id, c]))));
  return m;
}

/** Where an event's marks fall: a point to scatter round, or a sampler over a line or band; null if it has no place. */
type Place = (i: number, seed: number) => Point | null;

function placeOf(e: SimEvent, frame: Frame, front: Front | undefined, depths: { band: number; mg: number }): { place: Place; spread: number } | null {
  const c = e.unitId !== undefined ? companyById(frame).get(e.unitId) : undefined;
  if (c && c.status !== 'off-map') return { place: () => [c.x, c.y], spread: e.kind === 'shelled' ? 45 : 30 };
  if (e.kind !== 'shelled') return null;
  const bar = e.sectorId !== undefined ? frame.barrages.find((b) => b.sectorId === e.sectorId && !b.done && b.points.length >= 2) : undefined;
  if (bar) {
    const mg = e.causes.includes('mg-fire');
    return {
      place: (i, seed) => {
        const p = bar.points[Math.floor(unit(seed, 3 * i + 7) * bar.points.length)]!;
        const along = unit(seed, 3 * i + 8);
        return [p[0] + (mg ? depths.band + along * depths.mg : along * depths.band), p[1]];
      },
      spread: 40,
    };
  }
  // Unnamed fire with no band: along the front of the side the event says it hit (the one that lost most men; engine 0.4.5
  // on). An older event, with no sides, has no place.
  const side = hitSide(e);
  if (!side) return null;
  const line = front?.[side].flat();
  if (!line || line.length === 0) return null;
  return { place: (i, seed) => line[Math.floor(unit(seed, 3 * i + 7) * line.length)]!, spread: 60 };
}

/** The side a fire event hit hardest, by its `losses` (the first listed of those it reached, if it hit nobody); else undefined. */
function hitSide(e: SimEvent): Side | undefined {
  let best: Side | undefined;
  let most = -1;
  for (const s of ['allied', 'central'] as const) {
    const l = e.losses?.[s];
    if (l && l.killed + l.wounded > most) [best, most] = [s, l.killed + l.wounded];
  }
  return best;
}

/** How many marks an event is worth at speed 1: a few, more for fire that hit more men. */
function weight(e: SimEvent): number {
  const hit = e.factors?.hit ?? 0;
  if (e.kind === 'fire-opened') return 3;
  return 2 + Math.min(6, Math.round(Math.log2(1 + hit)));
}

/**
 * Shell bursts and fire marks for a frame (world metres), drawn from the step's fire events. Deterministic: each event's
 * marks are seeded by the frame's whole minute and the event's id, so the same frame always shows the same marks. Thinned
 * with playback speed (1 / √speed of the marks at speed 1, rounded by the same seed), and capped at MAX_BURSTS.
 */
export function bursts(events: readonly SimEvent[], speed: number, frame: Frame, front?: Front, depths: { band: number; mg: number } = { band: BARRAGE_DEPTH_M, mg: 0 }): Burst[] {
  const keep = 1 / Math.sqrt(Math.max(1, speed));
  const minute = Math.floor(frame.minute);
  const out: Burst[] = [];
  for (const e of events) {
    if (out.length >= MAX_BURSTS) break;
    const age = frame.minute - e.minute;
    if (age < 0 || age >= FIRE_WINDOW_MIN) continue;
    const seed = Math.imul(minute + 1, 0x01000193) ^ e.id;
    const n = Math.floor(weight(e) * keep + unit(seed, 1));
    if (n === 0) continue;
    const at = placeOf(e, frame, front, depths);
    if (!at) continue;
    const kind = e.kind === 'shelled' && !e.causes.includes('mg-fire') ? 'shell' : 'bullet';
    const alpha = Math.max(0.2, 1 - age / FIRE_WINDOW_MIN);
    for (let i = 0; i < n && out.length < MAX_BURSTS; i++) {
      const p = at.place(i, seed);
      if (!p) continue;
      const r = at.spread * Math.sqrt(unit(seed, 3 * i + 2));
      const a = 2 * Math.PI * unit(seed, 3 * i + 3);
      out.push({ kind, x: p[0] + r * Math.cos(a), y: p[1] + r * Math.sin(a), alpha, seed: (seed + i) >>> 0 });
    }
  }
  return out;
}

export type SegmentView = { index: number; id: string; holder: Side; garrisonSide: Side; taken: boolean; wireCut: number; pieces: Point[][] };

/** Each trench segment at a minute: who holds it, whether it is taken from its garrison's side, how cut its wire is. */
export function segmentStates(r: RunRecord, minute: number): SegmentView[] {
  const geo = r.geometry.segments;
  if (!geo || geo.length === 0) return [];
  const seg = surrounding(r, minute)[0].segments;
  if (!seg) return [];
  const units = sideByUnit(r);
  const holders = holdersAt(r, minute);
  const wi = seg.columns.indexOf('wireCut');
  const si = seg.columns.indexOf('segment');
  const wire: number[] = [];
  for (const row of seg.rows) wire[row[si] as number] = row[wi] as number;
  const pieces = segmentPieces(r);
  return geo.map((g, index) => {
    const garrisonSide = g.garrisonIds.map((id) => units.get(id)).find((s) => s !== undefined) ?? 'central';
    const holder = holders[index] ?? garrisonSide;
    return { index, id: g.id, holder, garrisonSide, taken: holder !== garrisonSide, wireCut: wire[index] ?? 0, pieces: pieces[index] ?? [] };
  });
}

const sideCache = new WeakMap<RunRecord, Map<string, Side>>();
function sideByUnit(r: RunRecord): Map<string, Side> {
  let m = sideCache.get(r);
  if (!m) sideCache.set(r, (m = new Map(r.units.map((u) => [u.id, u.side]))));
  return m;
}

/**
 * How far the fire plan reaches at y: the sector's recorded reach (engine 0.4.5 on, barrage.ts `planReachX`), else, for an
 * older record, the furthest objective line spanning y; undefined where neither says.
 */
function reachAt(r: RunRecord, y: number): number | undefined {
  const sec = r.geometry.sectors.find((s) => s.reach && s.reach.length >= 2 && y >= s.yMin && y <= s.yMax);
  if (sec) return xOnLine(sec.reach!, y);
  let best: number | undefined;
  for (const l of r.geometry.lines) {
    if (l.kind !== 'objective' || l.points.length < 2) continue;
    if (y < l.points[0]![1] || y > l.points[l.points.length - 1]![1]) continue;
    const x = xOnLine(l.points, y);
    best = best === undefined ? x : Math.max(best, x);
  }
  return best;
}

/** Standing-barrage events (shelled, with a `segments` count) within this many minutes keep the barrage drawn. */
const STANDING_RECENT_MIN = 10;
const standingCache = new WeakMap<RunRecord, Float64Array>();
function standingFiredNear(r: RunRecord, minute: number): boolean {
  let m = standingCache.get(r);
  if (!m) standingCache.set(r, (m = Float64Array.from(r.events.filter((e) => e.kind === 'shelled' && e.factors?.segments !== undefined && e.unitId === undefined).map((e) => e.minute)).sort()));
  if (m.length === 0) return true; // a record with no such events to go by (a hand-made one): draw from the rule alone
  const i = upper(m, minute);
  return i > 0 && minute - m[i - 1]! < STANDING_RECENT_MIN;
}

/**
 * The standing barrages (world pieces of trench): as the engine lays them (artillery.ts), on the enemy-held segments
 * ahead of a creeping barrage that is still going, as far as the fire plan reaches (here: the furthest objective line),
 * while the standing batteries have fired in the last few minutes.
 */
export function standingBarrages(r: RunRecord, frame: Frame): Point[][] {
  const active = frame.barrages.filter((b) => !b.done && b.points.length >= 2);
  if (active.length === 0 || !standingFiredNear(r, frame.minute)) return [];
  const sectors = new Map(r.geometry.sectors.map((s) => [s.id, s]));
  const band = depthsOf(r).band;
  const out: Point[][] = [];
  for (const s of segmentStates(r, frame.minute)) {
    if (s.holder !== s.garrisonSide) continue;
    for (const piece of s.pieces) {
      const mid = piece[Math.floor(piece.length / 2)]!;
      const y = piece.length === 2 ? (piece[0]![1] + piece[1]![1]) / 2 : mid[1];
      const x = piece.length === 2 ? (piece[0]![0] + piece[1]![0]) / 2 : mid[0];
      const bar = active.find((b) => {
        const sec = sectors.get(b.sectorId);
        return sec ? y >= sec.yMin && y <= sec.yMax : false;
      });
      if (!bar) continue;
      const reach = reachAt(r, y);
      if (x > xOnLine(bar.points, y) + band && reach !== undefined && x <= reach) out.push(piece);
    }
  }
  return out;
}

const mgCache = new WeakMap<RunRecord, Set<string>>();
/** The machine-gun barrage's zones (world polygons): beyond each going creeping band, in the sectors it fired in. */
export function mgZones(r: RunRecord, frame: Frame): Point[][] {
  const { band, mg } = depthsOf(r);
  if (!(mg > 0)) return [];
  let sectors = mgCache.get(r);
  if (!sectors) mgCache.set(r, (sectors = new Set(r.events.filter((e) => e.kind === 'shelled' && e.causes.includes('mg-fire') && e.sectorId !== undefined).map((e) => e.sectorId!))));
  return frame.barrages
    .filter((b) => !b.done && b.points.length >= 2 && sectors.has(b.sectorId))
    .map((b) => [...b.points.map(([x, y]): Point => [x + band, y]), ...[...b.points].reverse().map(([x, y]): Point => [x + band + mg, y])]);
}

export type Crater = { x: number; y: number; radiusM: number };
const craterCache = new WeakMap<RunRecord, Array<Crater & { minute: number }>>();
/** The craters of the mines blown by a minute (spec 9.2, "craters are blown"): where each was, at its radius (engine 0.4.5 on). */
export function craters(r: RunRecord, minute: number): Crater[] {
  let all = craterCache.get(r);
  if (!all) {
    all = r.events.flatMap((e) => (e.kind === 'mine-fired' && e.at ? [{ minute: e.minute, x: e.at[0], y: e.at[1], radiusM: e.factors?.craterRadiusM ?? 0 }] : []));
    craterCache.set(r, all);
  }
  return all.filter((c) => c.minute <= minute && c.radiusM > 0).map(({ x, y, radiusM }) => ({ x, y, radiusM }));
}

export type ReserveColumn = { formationId: string; side: Side; label: string; from: Point; to: Point; progress: number };
/** How far into the sheet a column's arrow reaches when it arrives: this share of the sheet's depth, at most COLUMN_MAX_M. */
const COLUMN_SHARE = 0.18;
const COLUMN_MAX_M = 1500;

/**
 * Off-map reserves on the march (spec 9.2, "German reserve columns move in from the edge of the map"): an arrow from the
 * sheet's edge on the enemy's far side, at the y of the reserve's way in (where its companies wait off the map), growing
 * from when it was ordered to when it arrives. Once arrived its companies march on the map themselves.
 */
export function reserveColumns(r: RunRecord, minute: number, bounds: Bounds): ReserveColumn[] {
  const snap = surrounding(r, minute)[0];
  const res = snap.reserves;
  if (!res) return [];
  const col = (n: string): number => res.columns.indexOf(n as never);
  const [fi, st, om, am] = [col('formationId'), col('status'), col('orderedMin'), col('arriveMin')];
  const ci = snap.companies.columns;
  const [idI, yI] = [ci.indexOf('id'), ci.indexOf('y')];
  const units = new Map(r.units.map((u) => [u.id, u]));
  const depth = Math.min(COLUMN_MAX_M, (bounds.maxX - bounds.minX) * COLUMN_SHARE);
  const out: ReserveColumn[] = [];
  for (const row of res.rows) {
    if (row[st] !== 'marching') continue;
    const id = row[fi] as string;
    const ordered = row[om] as number | null;
    const arrive = row[am] as number | null;
    const ys: number[] = [];
    let side: Side | undefined;
    for (const c of snap.companies.rows) {
      const u = units.get(c[idI] as string);
      if (!u || (u.battalionId !== id && !u.formationPath?.includes(id))) continue;
      ys.push(c[yI] as number);
      side ??= u.side;
    }
    if (ys.length === 0 || !side) continue;
    const y = Math.min(Math.max(ys.reduce((a, b) => a + b, 0) / ys.length, bounds.minY), bounds.maxY);
    const progress = ordered !== null && arrive !== null && arrive > ordered ? Math.min(1, Math.max(0, (minute - ordered) / (arrive - ordered))) : 0.5;
    const dir = side === 'central' ? -1 : 1;
    const edge = side === 'central' ? bounds.maxX : bounds.minX;
    out.push({ formationId: id, side, label: battalionLabel(id), from: [edge, y], to: [edge + dir * depth * Math.max(progress, 0.08), y], progress });
  }
  return out;
}

/* ------------------------------------------------------------------ drawing */

const toScreen = (view: View, pts: readonly Point[]): Screen[] => pts.map((p) => worldToScreen(view, p));

/** Captured ground: each side's taken ground in its own ink, faintly. */
export function drawCaptured(ctx: CanvasRenderingContext2D, view: View, front: Front): void {
  ctx.save();
  ctx.globalAlpha = EFFECT_STYLE.capturedAlpha;
  for (const c of front.captured) {
    ctx.fillStyle = sideColor(c.side);
    tracePath(ctx, toScreen(view, c.polygon));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/** Both fronts: the allied a solid line, the German dashed, each on a paper casing so it reads over trenches. */
export function drawFronts(ctx: CanvasRenderingContext2D, view: View, front: Front): void {
  const s = EFFECT_STYLE.front;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const side of ['allied', 'central'] as const) {
    for (const line of front[side]) {
      if (line.length < 2) continue;
      const pts = toScreen(view, line);
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = MAP_COLORS.paper;
      ctx.lineWidth = s.casing;
      tracePath(ctx, pts);
      ctx.stroke();
      ctx.globalAlpha = s.alpha;
      ctx.strokeStyle = sideColor(side);
      ctx.lineWidth = s.width;
      ctx.setLineDash(side === 'central' ? s.central : []);
      tracePath(ctx, pts);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Trench segments' state: a taken one drawn over in its captor's ink; wire in front, losing crosses as it is cut. */
export function drawSegmentStates(ctx: CanvasRenderingContext2D, view: View, states: readonly SegmentView[]): void {
  const t = EFFECT_STYLE.taken;
  const w = EFFECT_STYLE.wire;
  ctx.save();
  ctx.lineCap = 'round';
  for (const s of states) {
    for (const piece of s.pieces) {
      if (piece.length < 2) continue;
      const pts = toScreen(view, piece);
      if (s.taken) {
        ctx.strokeStyle = sideColor(s.holder);
        ctx.globalAlpha = t.washAlpha;
        ctx.lineWidth = t.wash;
        tracePath(ctx, pts);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.lineWidth = t.width;
        tracePath(ctx, pts);
        ctx.stroke();
      }
      // The wire lies on the attackers' side of the garrison's trench (west of a German one).
      const dir = s.garrisonSide === 'central' ? -1 : 1;
      const off = dir * Math.max(w.minPx, w.offsetM * view.scale);
      const wirePts = pts.map(([x, y]): Screen => [x + off, y]);
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = w.ink;
      ctx.lineWidth = w.width;
      ctx.beginPath();
      let k = 0;
      for (let i = 0; i < wirePts.length - 1; i++) {
        const [x0, y0] = wirePts[i]!;
        const [x1, y1] = wirePts[i + 1]!;
        const len = Math.hypot(x1 - x0, y1 - y0);
        for (let d = w.step / 2; d < len; d += w.step, k++) {
          // Cut wire: a cross stands only where the wire was not cut (the same crosses go, frame after frame).
          if (unit(s.index, k) < s.wireCut) continue;
          const x = x0 + ((x1 - x0) * d) / len;
          const y = y0 + ((y1 - y0) * d) / len;
          ctx.moveTo(x - w.arm, y - w.arm);
          ctx.lineTo(x + w.arm, y + w.arm);
          ctx.moveTo(x - w.arm, y + w.arm);
          ctx.lineTo(x + w.arm, y - w.arm);
        }
      }
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Hatch a closed screen polygon with parallel lines (slope +1 or −1) `step` px apart. */
function hatch(ctx: CanvasRenderingContext2D, poly: readonly Screen[], step: number, slope: 1 | -1, style: string, width: number): void {
  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const span = maxY - minY;
  ctx.save();
  tracePath(ctx, poly as Screen[]);
  ctx.closePath();
  ctx.clip();
  ctx.strokeStyle = style;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (let x = minX - span; x <= maxX + span; x += step) {
    if (slope === 1) {
      ctx.moveTo(x, maxY);
      ctx.lineTo(x + span, minY);
    } else {
      ctx.moveTo(x, minY);
      ctx.lineTo(x + span, maxY);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/** The creeping barrage: an ochre band hatched /, at least `minPx` deep so it reads at every zoom. */
export function drawCreeping(ctx: CanvasRenderingContext2D, view: View, points: readonly Point[], depthM: number): void {
  if (points.length < 2) return;
  const c = EFFECT_STYLE.creeping;
  const depth = Math.max(depthM, c.minPx / view.scale);
  const poly = [...toScreen(view, points), ...toScreen(view, [...points].reverse().map(([x, y]): Point => [x + depth, y]))];
  ctx.save();
  tracePath(ctx, poly);
  ctx.closePath();
  ctx.fillStyle = c.fill;
  ctx.fill();
  ctx.restore();
  hatch(ctx, poly, c.hatchStep, 1, c.hatch, c.hatchWidth);
  ctx.save();
  ctx.strokeStyle = c.edge;
  ctx.lineWidth = 1.25;
  tracePath(ctx, poly);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

/** The machine-gun barrage's zone: a faint violet wash hatched \, dotted at its edge. */
export function drawMgZones(ctx: CanvasRenderingContext2D, view: View, zones: readonly Point[][]): void {
  const m = EFFECT_STYLE.mg;
  for (const z of zones) {
    const poly = toScreen(view, z);
    ctx.save();
    tracePath(ctx, poly);
    ctx.closePath();
    ctx.fillStyle = m.fill;
    ctx.fill();
    ctx.restore();
    hatch(ctx, poly, m.hatchStep, -1, m.hatch, 0.8);
    ctx.save();
    ctx.strokeStyle = m.edge;
    ctx.setLineDash([2, 3]);
    ctx.lineWidth = 1;
    tracePath(ctx, poly);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }
}

/** Standing barrages: an orange band along each trench stretch under fire, combed with short ticks across it. */
export function drawStanding(ctx: CanvasRenderingContext2D, view: View, pieces: readonly Point[][]): void {
  const s = EFFECT_STYLE.standing;
  const width = Math.max(s.minPx, s.widthM * view.scale);
  ctx.save();
  ctx.lineCap = 'butt';
  for (const piece of pieces) {
    if (piece.length < 2) continue;
    const pts = toScreen(view, piece);
    ctx.strokeStyle = s.band;
    ctx.lineWidth = width;
    tracePath(ctx, pts);
    ctx.stroke();
    ctx.strokeStyle = s.tick;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i]!;
      const [x1, y1] = pts[i + 1]!;
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len === 0) continue;
      const [nx, ny] = [-(y1 - y0) / len, (x1 - x0) / len];
      for (let d = s.tickStep / 2; d < len; d += s.tickStep) {
        const x = x0 + ((x1 - x0) * d) / len;
        const y = y0 + ((y1 - y0) * d) / len;
        ctx.moveTo(x - (nx * width) / 2, y - (ny * width) / 2);
        ctx.lineTo(x + (nx * width) / 2, y + (ny * width) / 2);
      }
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Mine craters: a churned pit with a raised rim, at least `minPx` across. */
export function drawCraters(ctx: CanvasRenderingContext2D, view: View, list: readonly Crater[]): void {
  const c = EFFECT_STYLE.crater;
  ctx.save();
  for (const k of list) {
    const [x, y] = worldToScreen(view, [k.x, k.y]);
    const rad = Math.max(c.minPx, k.radiusM * view.scale);
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fillStyle = c.fill;
    ctx.fill();
    ctx.strokeStyle = c.rim;
    ctx.lineWidth = c.rimWidth;
    ctx.stroke();
  }
  ctx.restore();
}

/** Fire marks: a shell burst is a dark puff with a flash; rifle and machine-gun fire a short stroke. */
export function drawBursts(ctx: CanvasRenderingContext2D, view: View, marks: readonly Burst[]): void {
  const b = EFFECT_STYLE.burst;
  ctx.save();
  for (const m of marks) {
    const [x, y] = worldToScreen(view, [m.x, m.y]);
    ctx.globalAlpha = m.alpha;
    if (m.kind === 'shell') {
      const r = b.shellPx * (0.8 + 0.5 * unit(m.seed, 5));
      ctx.fillStyle = b.flash;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = b.shell;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const a = Math.PI * unit(m.seed, 6);
      const l = b.bulletPx;
      ctx.strokeStyle = b.bullet;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x - Math.cos(a) * l, y - Math.sin(a) * l);
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Reserve columns: a dashed shaft in the side's ink from the sheet's edge, an arrowhead where the column has got to, its name at the tail. */
export function drawReserves(ctx: CanvasRenderingContext2D, view: View, cols: readonly ReserveColumn[]): void {
  const s = EFFECT_STYLE.reserve;
  ctx.save();
  for (const c of cols) {
    const [fx, fy] = worldToScreen(view, c.from);
    const [tx, ty] = worldToScreen(view, c.to);
    const len = Math.hypot(tx - fx, ty - fy);
    if (len < 2) continue;
    const [ux, uy] = [(tx - fx) / len, (ty - fy) / len];
    const ink = sideColor(c.side);
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = ink;
    ctx.lineWidth = s.width;
    ctx.setLineDash(s.dash);
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(tx - ux * s.head, ty - uy * s.head);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(tx - ux * s.head - uy * s.head * 0.6, ty - uy * s.head + ux * s.head * 0.6);
    ctx.lineTo(tx - ux * s.head + uy * s.head * 0.6, ty - uy * s.head - ux * s.head * 0.6);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Name each reserve column at its tail, where the name fits clear of every label and marker already placed (`placed`,
 * which it joins); a name that fits nowhere is left off (zoom in to read it).
 */
export function labelReserves(ctx: CanvasRenderingContext2D, view: View, cols: readonly ReserveColumn[], placed: Box[], sheetW: number): void {
  const s = EFFECT_STYLE.reserve;
  ctx.save();
  ctx.font = s.font;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  for (const c of cols) {
    const [fx, fy] = worldToScreen(view, c.from);
    const [tx, ty] = worldToScreen(view, c.to);
    const len = Math.hypot(tx - fx, ty - fy);
    if (len < 2) continue;
    const ux = (tx - fx) / len;
    const width = ctx.measureText(c.label).width;
    const x0 = ux < 0 ? fx + ux * 4 - width : fx + ux * 4;
    const want: Box = { x0: x0 - 1, x1: x0 + width + 1, y0: fy - 4 - 12, y1: fy - 3 };
    const box = placeClear(want, placed, 13, 3, 8, 4, 12, sheetW - 12, 12);
    if (placed.some((p) => overlaps(box, p))) continue;
    placed.push(box);
    ctx.strokeStyle = MAP_COLORS.paper;
    ctx.lineWidth = 3;
    ctx.strokeText(c.label, box.x0 + 1, box.y1 - 2);
    ctx.fillStyle = sideColor(c.side);
    ctx.fillText(c.label, box.x0 + 1, box.y1 - 2);
  }
  ctx.restore();
}
