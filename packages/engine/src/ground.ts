import { minutesBetween, v } from '@wwi/scenario';
import type { EffectKey, Feature, Ground, GroundCondition, Point, Scenario, Tables, Terrain } from '@wwi/scenario';

/** Side of a churn cell and of a line-of-sight cache cell, in metres (numerical-method constant). */
export const CELL_M = 50;
const MIN_PER_DAY = 1440;

type Shape = { id: string; kind: Feature['kind']; geometry: Feature['geometry']; box: [number, number, number, number] };

/** Everything the ground, sight and light modules read, built once per run. */
export type World = {
  tables: Tables;
  terrain: Terrain | undefined;
  /** Wood, village, crater, trench and communication-trench features, in file order. */
  shapes: Shape[];
  /** Weather changes in minutes after Zero, ascending; `wet` is whether it is precipitating. */
  weather: Array<{ min: number; wet: boolean }>;
  /** The ground's factor on wetness (`tables.effects.groundDry` … `groundQuagmire` by `groundCondition`; absent: `groundNormal`). */
  groundFactor: number;
  /** The 50 m grid (churn and the line-of-sight cache): origin and size. */
  originX: number;
  originY: number;
  cols: number;
  rows: number;
  /** Shells landed per 50 m cell, row-major. This is `SimState.churn`: the one array a run mutates in place. */
  churn: Float32Array;
  /** Bumped by every `churn()`, so what was worked out from the churn (comms.ts's cut surface lines) can be redone. */
  churnGen: number;
  /** Wood and village raster at 25 m, built by the first line-of-sight query (sight.ts). */
  blockers?: { data: Uint8Array; cols: number; rows: number };
  /** Line-of-sight results by the viewer's 50 m cell, then the target's (sight.ts). */
  losCache: Map<number, Map<number, boolean>>;
};

const USED: ReadonlySet<string> = new Set(['wood', 'village', 'crater', 'trench', 'communication-trench']);

function coords(g: Feature['geometry']): Point[] {
  return g.type === 'Point' ? [g.coordinates] : g.coordinates;
}

function boxOf(g: Feature['geometry']): [number, number, number, number] {
  const pad = g.type === 'Point' ? (g.radiusM ?? 0) : 0;
  const pts = coords(g);
  return [
    Math.min(...pts.map((p) => p[0])) - pad,
    Math.min(...pts.map((p) => p[1])) - pad,
    Math.max(...pts.map((p) => p[0])) + pad,
    Math.max(...pts.map((p) => p[1])) + pad,
  ];
}

const GROUND_FACTOR: Record<GroundCondition, EffectKey> = { dry: 'groundDry', normal: 'groundNormal', wet: 'groundWet', quagmire: 'groundQuagmire' };

/** The world for a run: features, weather clock, terrain and an empty churn grid over the scenario's extent. */
export function buildWorld(s: Scenario, tables: Tables, terrain?: Terrain): World {
  const shapes: Shape[] = s.features
    .filter((f) => USED.has(f.kind))
    .map((f) => ({ id: f.id, kind: f.kind, geometry: f.geometry, box: boxOf(f.geometry) }));
  const xs: number[] = [];
  const ys: number[] = [];
  const add = (x0: number, y0: number, x1: number, y1: number) => void (xs.push(x0, x1), ys.push(y0, y1));
  if (s.frame) add(s.frame.extent.minX, s.frame.extent.minY, s.frame.extent.maxX, s.frame.extent.maxY);
  if (terrain) add(terrain.originX, terrain.originY, terrain.originX + (terrain.cols - 1) * terrain.cellM, terrain.originY + (terrain.rows - 1) * terrain.cellM);
  for (const sh of shapes) add(...sh.box);
  for (const l of s.lines) for (const p of l.points) add(p[0], p[1], p[0], p[1]);
  const originX = xs.length ? Math.min(...xs) : 0;
  const originY = ys.length ? Math.min(...ys) : 0;
  const cols = Math.max(1, Math.ceil(((xs.length ? Math.max(...xs) : 0) - originX) / CELL_M) + 1);
  const rows = Math.max(1, Math.ceil(((ys.length ? Math.max(...ys) : 0) - originY) / CELL_M) + 1);
  const zero = v(s.zeroHour);
  return {
    tables,
    terrain,
    shapes,
    weather: s.weather.map((w) => ({ min: minutesBetween(zero, w.at), wet: v(w.precipitation) !== 'none' })),
    groundFactor: v(tables.effects[GROUND_FACTOR[s.groundCondition ? v(s.groundCondition) : 'normal']]),
    originX,
    originY,
    cols,
    rows,
    churn: new Float32Array(cols * rows),
    churnGen: 0,
    losCache: new Map(),
  };
}

/** The 50 m cell index of a point (clamped to the grid). */
export function cellOf(w: World, p: Point): number {
  const cx = Math.min(Math.max(Math.floor((p[0] - w.originX) / CELL_M), 0), w.cols - 1);
  const cy = Math.min(Math.max(Math.floor((p[1] - w.originY) / CELL_M), 0), w.rows - 1);
  return cy * w.cols + cx;
}

/** Whether (x, y) lies inside the polygon (even-odd rule). */
export function inPolygon(pts: Point[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i]![0];
    const yi = pts[i]![1];
    const xj = pts[j]![0];
    const yj = pts[j]![1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Distance from p to the straight piece a–b. */
export function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Whether a wood, village or crater shape covers the point (a Point shape covers its radius, 0 m if none). */
export function covers(sh: Shape, p: Point): boolean {
  const g = sh.geometry;
  const [x0, y0, x1, y1] = sh.box;
  if (p[0] < x0 || p[0] > x1 || p[1] < y0 || p[1] > y1) return false;
  if (g.type === 'Point') return Math.hypot(p[0] - g.coordinates[0], p[1] - g.coordinates[1]) <= (g.radiusM ?? 0);
  if (g.type === 'Polygon') return inPolygon(g.coordinates, p[0], p[1]);
  return false;
}

/** Share of the point's 50 m cell that shell holes cover, 0 to 1. */
export function churnShare(w: World, p: Point): number {
  return 1 - Math.exp((-w.churn[cellOf(w, p)]! * v(w.tables.effects.churnAreaPerShellM2)) / (CELL_M * CELL_M));
}

/**
 * The ground at a point. A trench is anything within `trenchProximityM` of a trench or communication
 * trench line; then village, wood and mapped craters; then churned open ground becomes cratered.
 */
export function groundAt(w: World, p: Point): Ground {
  const near = v(w.tables.effects.trenchProximityM);
  for (const sh of w.shapes) {
    if (sh.kind !== 'trench' && sh.kind !== 'communication-trench') continue;
    const [x0, y0, x1, y1] = sh.box;
    if (p[0] < x0 - near || p[0] > x1 + near || p[1] < y0 - near || p[1] > y1 + near) continue;
    const pts = coords(sh.geometry);
    for (let i = 0; i < pts.length - 1; i++) if (distToSegment(p, pts[i]!, pts[i + 1]!) <= near) return 'trench';
  }
  for (const kind of ['village', 'wood', 'crater'] as const) {
    for (const sh of w.shapes) if (sh.kind === kind && covers(sh, p)) return kind === 'crater' ? 'cratered' : kind;
  }
  return churnShare(w, p) >= v(w.tables.effects.crateredShare) ? 'cratered' : 'open';
}

/** Accumulate `rounds` shells into the 50 m cell at p. Mutates `world.churn`, which is `SimState.churn`. */
export function churn(w: World, p: Point, rounds: number): void {
  w.churn[cellOf(w, p)]! += rounds;
  w.churnGen++;
}

/**
 * How wet the ground is (0 to 1): the share of the 24 hours before `minute` that it was precipitating, times the
 * ground's factor (`World.groundFactor`, 1 for normal ground), clamped to [0, 1]. Before the first weather entry it
 * is taken as dry.
 */
export function wetness(w: World, minute: number): number {
  const from = minute - MIN_PER_DAY;
  let wet = 0;
  let state = false;
  let t = from;
  for (const e of w.weather) {
    if (e.min <= from) {
      state = e.wet;
      continue;
    }
    if (e.min >= minute) break;
    if (state) wet += e.min - t;
    t = e.min;
    state = e.wet;
  }
  if (state) wet += minute - t;
  return Math.min(1, Math.max(0, (wet / MIN_PER_DAY) * w.groundFactor));
}

/**
 * Walking-speed multiplier at p. `wet` is `wetness(world, minute)` (0 to 1). Mud from the past day's
 * rain and mud from shell churn each apply `mudSpeedFactor` in proportion, and multiply. If `to` is
 * given, climbing from p to `to` also costs `uphillPenaltyPer10m` per 10 m gained.
 */
export function speedFactor(w: World, p: Point, wet: number, to?: Point): number {
  const mud = v(w.tables.effects.mudSpeedFactor);
  let f = mud ** wet * mud ** churnShare(w, p);
  if (to && w.terrain) {
    const climb = Math.max(0, w.terrain.at(to[0], to[1]) - w.terrain.at(p[0], p[1]));
    f *= Math.max(0, 1 - (v(w.tables.effects.uphillPenaltyPer10m) * climb) / 10);
  }
  return f;
}
