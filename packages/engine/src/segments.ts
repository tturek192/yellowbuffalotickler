import { v } from '@wwi/scenario';
import { EFFECT_KEYS } from '@wwi/scenario';
import type { EffectKey, Feature, Formation, Point, Scenario, Tables } from '@wwi/scenario';
import { byId } from './companies';
import type { SegmentState } from './types';

type Company = NonNullable<Formation['companies']>[number];
/** A y interval, yMin ≤ yMax. */
export type Interval = [number, number];

/** A feature's points (a Point feature is its one point). */
export function featurePoints(f: Feature): Point[] {
  return f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.coordinates;
}

/** The parts of a line with y between y0 and y1, each a polyline of at least two points. */
export function clipByY(pts: Point[], y0: number, y1: number): Point[][] {
  const out: Point[][] = [];
  let cur: Point[] = [];
  const at = (a: Point, b: Point, t: number): Point => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const dy = b[1] - a[1];
    // The share of the piece a→b inside [y0, y1].
    const inside = a[1] >= y0 && a[1] <= y1;
    const ta = (y0 - a[1]) / dy;
    const tb = (y1 - a[1]) / dy;
    // A level piece is wholly in or wholly out.
    const t0 = dy === 0 ? (inside ? 0 : 1) : Math.max(0, Math.min(ta, tb));
    const t1 = dy === 0 ? (inside ? 1 : 0) : Math.min(1, Math.max(ta, tb));
    // Nothing inside, or only a touch at one point of a band of some width.
    if (t0 > t1 || (t0 === t1 && y0 !== y1)) {
      if (cur.length >= 2) out.push(cur);
      cur = [];
      continue;
    }
    const p = at(a, b, t0);
    const q = at(a, b, t1);
    if (cur.length === 0 || t0 > 0) {
      if (cur.length >= 2) out.push(cur);
      cur = [p];
    }
    cur.push(q);
    if (t1 < 1) {
      out.push(cur);
      cur = [];
    }
  }
  if (cur.length >= 2) out.push(cur);
  return out;
}

/** Length of a polyline. */
export const pathLength = (pts: Point[]): number => pts.slice(1).reduce((a, p, i) => a + Math.hypot(p[0] - pts[i]![0], p[1] - pts[i]![1]), 0);

/** The y extent of a feature. */
function yExtent(f: Feature): Interval {
  const ys = featurePoints(f).map((p) => p[1]);
  return [Math.min(...ys), Math.max(...ys)];
}

/** The pieces of a feature's line between y0 and y1 (none for a Point feature). */
export function featurePieces(f: Feature, y0: number, y1: number): Point[][] {
  return f.geometry.type === 'Point' ? [] : clipByY(featurePoints(f), y0, y1);
}

/**
 * The radius of a Point feature in metres: its own `radiusM`, else the `<kind>RadiusM` default in
 * `tables.effects` (listed in `defaultsUsed`), else 0 (no tables, or no default for the kind).
 */
export function pointRadiusM(f: Feature, tables?: Tables, defaultsUsed?: Set<string>): number {
  if (f.geometry.type !== 'Point') return 0;
  if (f.geometry.radiusM !== undefined) return f.geometry.radiusM;
  const key = `${f.kind}RadiusM`;
  if (!tables || !(EFFECT_KEYS as readonly string[]).includes(key)) return 0;
  defaultsUsed?.add(`features[${f.id}].radiusM ← effects.${key}`);
  return v(tables.effects[key as EffectKey]);
}

/** Every central garrison company that names a trench feature, in ascending id order. */
function garrisons(s: Scenario): Company[] {
  const out: Company[] = [];
  const walk = (f: Formation): void => {
    for (const c of f.companies ?? []) if (c.role === 'garrison' && c.trenchFeatureId !== undefined) out.push(c);
    for (const ch of f.children ?? []) walk(ch);
  };
  for (const force of s.forces) if (force.side === 'central') for (const f of force.formations) walk(f);
  return out.sort(byId);
}

/**
 * One segment per German garrison company (garrisons at the same y, or on the same point strongpoint, share
 * one): the stretch of its `trenchFeatureId` between the midpoints to its neighbouring garrisons on the same
 * feature, the first and last running to the ends of the feature. Features in ascending id order, each south
 * to north. A Point feature (a strongpoint) has one segment, y ± its radius (`pointRadiusM`), whose frontage
 * (length) is its diameter. The scenario's defaults must be resolved (every garrison has `dugoutDepthM`).
 */
export function deriveSegments(s: Scenario, tables?: Tables, defaultsUsed?: Set<string>): SegmentState[] {
  const byFeature = new Map<string, Company[]>();
  for (const c of garrisons(s)) byFeature.set(c.trenchFeatureId!, [...(byFeature.get(c.trenchFeatureId!) ?? []), c]);
  const out: SegmentState[] = [];
  for (const featureId of [...byFeature.keys()].sort()) {
    const f = s.features.find((x) => x.id === featureId);
    if (!f) throw new Error(`Garrison ${byFeature.get(featureId)![0]!.id}: trenchFeatureId names no feature "${featureId}"`);
    const point = f.geometry.type === 'Point';
    const r = point ? pointRadiusM(f, tables, defaultsUsed) : 0;
    const [lo, hi] = point ? [yExtent(f)[0] - r, yExtent(f)[1] + r] : yExtent(f);
    const yOf = (c: Company): number => {
      if (!Array.isArray(c.start)) throw new Error(`Company ${c.id}: start was not projected to a local point`);
      return c.start[1];
    };
    // Garrisons grouped by y, south to north (ids ascending within a group); every garrison of a point
    // feature (a strongpoint) is at the same place, so they share its one segment.
    const groups: Company[][] = [];
    for (const c of [...byFeature.get(featureId)!].sort((a, b) => yOf(a) - yOf(b) || byId(a, b))) {
      const last = groups.at(-1);
      if (last && (point || yOf(last[0]!) === yOf(c))) last.push(c);
      else groups.push([c]);
    }
    for (const g of groups) g.sort(byId);
    const clamp = (y: number): number => Math.min(hi, Math.max(lo, y));
    groups.forEach((g, i) => {
      const yMin = i === 0 ? lo : clamp((yOf(groups[i - 1]![0]!) + yOf(g[0]!)) / 2);
      const yMax = i === groups.length - 1 ? hi : clamp((yOf(g[0]!) + yOf(groups[i + 1]![0]!)) / 2);
      const depths = g.map((c) => {
        if (c.dugoutDepthM === undefined) throw new Error(`Company ${c.id}: dugoutDepthM has no value (defaults were not resolved)`);
        return v(c.dugoutDepthM);
      });
      out.push({
        id: `${featureId}:${String(i + 1).padStart(3, '0')}`,
        featureId,
        garrisonIds: g.map((c) => c.id),
        yMin,
        yMax,
        lengthM: point ? yMax - yMin : featurePieces(f, yMin, yMax).reduce((a, p) => a + pathLength(p), 0),
        wireCut: 0,
        wireBeltDepthM: 0,
        trenchDamage: 0,
        dugoutDamage: 0,
        dugoutDepthM: depths.reduce((a, d) => a + d, 0) / depths.length,
        spared: false,
        holder: 'central',
        garrisonSide: 'central',
        holderEventId: null,
        trappedEventId: null,
        barrageLastOverMin: null,
        barrageOn: [],
        barrageEventId: null,
        emerged: false,
        trapped: false,
        dugoutPoints: [],
      });
    });
  }
  return out;
}
