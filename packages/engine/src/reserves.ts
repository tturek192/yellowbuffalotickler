import { v } from '@wwi/scenario';
import type { Doctrine, Formation, FORMATION_KINDS, Point, Scenario } from '@wwi/scenario';
import { emit } from './causes';
import type { NewEvent } from './causes';
import type { CompanyState } from './companies';
import type { World } from './ground';
import { wetness } from './ground';
import { delayFactor, leaderOf } from './leaders';
import { round } from './record';
import type { Scheduled } from './schedule';
import type { SimState, StepContext } from './step';
import { distanceTo, segmentSamples } from './artillery';
import { moveHq } from './comms';
import type { HqState, ReserveState, SegmentState } from './types';

/*
 * Reserves off the map (spec 13.5): formations that start a set distance behind the front, off the map, until a
 * headquarters orders them forward (command.ts: a division that has lost enough of its front). Then:
 *
 *   arriveMin = orderedMin + baseOrderDelayMin · delayFactor + distanceKm / (marchKmPerHour · weather) · 60 + deployMin
 *
 * - `delayFactor` is the ordering headquarters' leader's (leaders.ts: orderSpeed), the time its staff takes to get the
 *   order out; the reserve marches from then (status `marching`, its companies `marching`, still off the map).
 * - `weather` is the march's ground: the mud of the past day's rain (ground.ts: `mudSpeedFactor ^ wetness`; off the map
 *   there is no shell churn and no terrain), taken for the route as a whole as the mean of its value at the start of
 *   the march and at the arrival that value gives.
 * - `deployMin` is the time to get from column into line, before the reserve can be used.
 * - The march off the map covers `distanceKm` less the part of it on the map: the distance from the entry point to the
 *   nearest segment of the front it is sent to (`onMapKm`), which it walks on the map.
 * At `arriveMin` its companies stand at its entry point (`reserve-arrived`, cause `reserve-arrived`, refs its
 * `reserve-ordered`) and walk on at `marchKmPerHour` (the ground's speed factor on the map) to that segment, where they
 * hold; from there the command model can send them like any other reserve.
 *
 * The scenario's historical order times and the historical arrival times are validation targets, never inputs: nothing
 * here, or anywhere in the engine, reads them. Every number is data: the doctrine's `common` march keys and `mudSpeedFactor`.
 */

type FormationKind = (typeof FORMATION_KINDS)[number];
type Info = { name: string; kind: FormationKind; doctrineId: string; up: string[] };
type Index = { formations: Map<string, Info>; reserves: Map<string, Scenario['reserves'][number]> };
const indexes = new WeakMap<Scenario, Index>();

function indexOf(s: Scenario): Index {
  let ix = indexes.get(s);
  if (ix) return ix;
  const formations = new Map<string, Info>();
  const walk = (f: Formation, doctrineId: string, up: string[]): void => {
    formations.set(f.id, { name: f.name, kind: f.kind, doctrineId, up });
    for (const ch of f.children ?? []) walk(ch, doctrineId, [f.id, ...up]);
  };
  for (const force of s.forces) for (const f of force.formations) walk(f, force.doctrine, []);
  indexes.set(s, (ix = { formations, reserves: new Map(s.reserves.map((r) => [r.formationId, r])) }));
  return ix;
}

const infoOf = (ctx: StepContext, id: string): Info => {
  const f = indexOf(ctx.scenario).formations.get(id);
  if (!f) throw new Error(`Reserve ${id}: no such formation`);
  return f;
};
const doctrineOf = (ctx: StepContext, id: string): Doctrine => ctx.doctrines[infoOf(ctx, id).doctrineId]!;

/** The headquarters that orders a reserve when none is recorded: the nearest division over it (or itself), else the formation. */
function ordererOf(ctx: StepContext, id: string): string {
  const f = infoOf(ctx, id);
  return [id, ...f.up].find((x) => infoOf(ctx, x).kind === 'division') ?? id;
}

/** The march's weather: the mud of the past day's rain at the minute (no churn and no climb off the map). */
const weatherAt = (w: World, minute: number): number => v(w.tables.effects.mudSpeedFactor) ** wetness(w, minute);

/**
 * When a reserve ordered at `orderedMin` starts its march and arrives at its entry point, and the numbers behind it. Its
 * `distanceKm` runs from its billets to the front; the part of it on the map (`onMapKm`, from the entry point to the
 * front it is sent to, set when it is ordered) it walks on the map, so the march off the map covers the rest.
 */
export function arrivalOf(r: Pick<ReserveState, 'formationId' | 'orderedBy' | 'onMapKm'>, orderedMin: number, ctx: StepContext): { marchMin: number; arriveMin: number; factors: Record<string, number> } {
  const k = doctrineOf(ctx, r.formationId).common;
  const delay = v(k.baseOrderDelayMin) * delayFactor(leaderOf(ctx.scenario, r.orderedBy ?? ordererOf(ctx, r.formationId), ctx.defaultsUsed));
  const marchMin = orderedMin + delay;
  const distanceKm = v(indexOf(ctx.scenario).reserves.get(r.formationId)!.distanceKm);
  const km = Math.max(0, distanceKm - r.onMapKm);
  const kmh = v(k.marchKmPerHour);
  const atStart = weatherAt(ctx.world, marchMin);
  const weather = (atStart + weatherAt(ctx.world, marchMin + (km / (kmh * atStart)) * 60)) / 2;
  const walk = (km / (kmh * weather)) * 60;
  const deploy = v(k.deployMin);
  return {
    marchMin,
    arriveMin: marchMin + walk + deploy,
    factors: { distanceKm, onMapKm: round(r.onMapKm, 2), offMapKm: round(km, 2), orderDelayMin: round(delay, 1), marchMin: round(walk, 1), deployMin: deploy, weather: round(weather, 3) },
  };
}

/**
 * A reserve ordered forward at minute M by headquarters `by` (command.ts), with its `reserve-ordered` event, to the front
 * of segments `front` (the ones it may march to: the command model passes those its picture shows its side holding, or
 * the whole front if none): it will walk on the map from its entry point to the nearest of them, and march the rest of
 * its distance off the map; when it arrives at its entry point.
 */
export function orderReserve(r: ReserveState, state: SimState, ctx: StepContext, M: number, by: string, eventId: number, front: readonly SegmentState[]): ReserveState {
  let to: SegmentState | null = null;
  let d = Infinity;
  for (const seg of front) {
    const dd = distanceTo(segmentSamples(ctx, seg, state.companies), r.entryPoint);
    if (dd < d) [to, d] = [seg, dd];
  }
  const ys = (x: SegmentState): number => (x.yMin + x.yMax) / 2;
  const along = [...front].sort((a, b) => ys(a) - ys(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((x) => x.id);
  const at: ReserveState = { ...r, orderedBy: by, onMapKm: to ? d / 1000 : 0, toSegmentId: to ? to.id : null, frontSegmentIds: to ? along : [] };
  return { ...at, status: 'ordered', orderedMin: M, orderedEventId: eventId, arriveMin: arrivalOf(at, M, ctx).arriveMin };
}

/** The companies of a reserve formation (any formation on their path). */
const ofReserve = (c: CompanyState, id: string): boolean => c.formationPath.includes(id);

/** At Zero, the companies of every off-map reserve are off the map. */
export function offMapAtZero(companies: CompanyState[], s: Scenario): CompanyState[] {
  if (s.reserves.length === 0) return companies;
  const ids = s.reserves.map((r) => r.formationId);
  return companies.map((c) => (ids.some((id) => ofReserve(c, id)) ? { ...c, status: 'off-map', intent: 'hold' } : c));
}

/** A reserve is under way: ordered and not yet arrived. */
const underWay = (state: Pick<SimState, 'reserves'>): boolean => state.reserves.some((r) => r.status === 'ordered' || r.status === 'marching');

/** Each reserve's company ids, worked out once a run (looked up only). */
const companyIds = new WeakMap<StepContext, Map<string, string[]>>();
function companiesOf(state: SimState, ctx: StepContext, id: string): string[] {
  let m = companyIds.get(ctx);
  if (!m) companyIds.set(ctx, (m = new Map()));
  let ids = m.get(id);
  if (!ids) m.set(id, (ids = state.companies.filter((c) => ofReserve(c, id)).map((c) => c.id)));
  return ids;
}

/** Statuses of a reserve's company still on its way: off the map, marching to its entry point, or walking on to the front. */
const ON_ITS_WAY: ReadonlySet<string> = new Set(['off-map', 'marching', 'advancing']);

/**
 * Whether an HQ's picture shows every company of a reserve formation at the end of its march: at the front, or out of
 * the fight on the way (an arrived reserve's companies walk on to the front as `advancing`, which the reserves never
 * otherwise are).
 */
export function arrivalKnown(state: SimState, ctx: StepContext, h: HqState, formationId: string): boolean {
  return companiesOf(state, ctx, formationId).every((id) => {
    const u = h.picture.units[id];
    return u !== undefined && !ON_ITS_WAY.has(u.status);
  });
}


/**
 * Whether the run must wait for a reserve (run.ts: it does not end before): one under way, or one arrived whose
 * ordering headquarters does not yet know it has (`arrivalKnown`): it would act on the news.
 */
export function reservesUnderWay(state: SimState, ctx: StepContext): boolean {
  if (underWay(state)) return true;
  return state.reserves.some((r) => {
    if (r.status !== 'arrived' || r.orderedBy === null) return false;
    const h = state.hqs.find((x) => x.formationId === r.orderedBy);
    return h !== undefined && !arrivalKnown(state, ctx, h, r.formationId);
  });
}

/**
 * The movement phase's march (the model, "Step pipeline" 8): an ordered reserve whose order is out sets off (it and its
 * companies `marching`); one whose `arriveMin` has come arrives: its companies stand at its entry point, holding and
 * deployed (prone, in the open), and `reserve-arrived` says so.
 */
export function marchReserves(state: SimState, ctx: StepContext): SimState {
  if (!underWay(state)) return state;
  const M = state.minute;
  let reserves = state.reserves;
  let companies = state.companies;
  const events: NewEvent[] = [];
  // In ascending reserve id, so reserves arriving together take their places in a fixed order.
  const order = state.reserves.map((_, i) => i).sort((a, b) => (state.reserves[a]!.formationId < state.reserves[b]!.formationId ? -1 : state.reserves[a]!.formationId > state.reserves[b]!.formationId ? 1 : 0));
  for (const i of order) {
    const r0 = state.reserves[i]!;
    if (r0.status !== 'ordered' && r0.status !== 'marching') continue;
    let r = r0;
    const a = arrivalOf(r, r.orderedMin!, ctx);
    if (r.status === 'ordered' && M >= a.marchMin) {
      r = { ...r, status: 'marching' };
      companies = companies.map((c) => (c.status === 'off-map' && ofReserve(c, r.formationId) ? { ...c, status: 'marching', intent: 'march' } : c));
    }
    if (r.status === 'marching' && M >= r.arriveMin!) {
      r = { ...r, status: 'arrived' };
      const eventId = state.nextEventId + events.length;
      const coming = companies.filter((c) => (c.status === 'marching' || c.status === 'off-map') && ofReserve(c, r.formationId));
      const n = coming.length;
      const men = coming.reduce((acc, c) => acc + c.men, 0);
      // On the map: spread along a frontage across its entry point, deployed, each company walking on to its own place
      // along the front it was sent to (movement.ts, a march order).
      // Its places, clear of those other reserves' companies have taken (on the map, and at the front).
      const places = startSlots(r, n, reserves.flatMap((x) => x.starts), ctx);
      const ends = endSlots(r, n, reserves.flatMap((x) => x.ends), state, ctx);
      r = { ...r, starts: places, ends: ends.filter((p): p is Point => p !== undefined) };
      const k = new Map(coming.map((c, j) => [c.id, j]));
      // Each of its battalions' headquarters moves with its companies, to behind their places at the front.
      const byBattalion = new Map<string, Point[]>();
      coming.forEach((c, j) => {
        const to = ends[j] ?? places[j]!;
        byBattalion.set(c.battalionId, [...(byBattalion.get(c.battalionId) ?? []), to]);
      });
      for (const b of [...byBattalion.keys()].sort()) moveHq(ctx, b, byBattalion.get(b)!);
      companies = companies.map((c) => {
        const j = k.get(c.id);
        if (j === undefined) return c;
        const [x, y] = places[j]!;
        const placed = { ...c, x, y, startX: x, startY: y };
        const to = ends[j];
        return to
          ? { ...placed, status: 'advancing', intent: 'march', posture: 'moving', orders: [...c.orders, { kind: 'march', target: { point: to }, fromFormationId: r.orderedBy ?? r.formationId, issuedMin: M, eventId }] }
          : { ...placed, status: 'holding', intent: 'hold', posture: 'prone' };
      });
      events.push({
        minute: M,
        kind: 'reserve-arrived',
        text: `${infoOf(ctx, r.formationId).name} arrives: ${n} companies, ${men} men${r.toSegmentId ? `, marching on to ${r.toSegmentId}` : ''}`,
        causes: ['reserve-arrived'],
        refs: r.orderedEventId === null ? [] : [r.orderedEventId],
        factors: { ...a.factors, arriveMin: round(r.arriveMin!, 1), companies: n, men },
      });
    }
    if (r !== r0) reserves = reserves.map((x, j) => (j === i ? r : x));
  }
  if (reserves === state.reserves) return state;
  return emit({ ...state, reserves, companies }, ...events);
}

/** Whether a point is free of every point taken: none within half a gap of it, across or along. */
const freeOf = (taken: readonly Point[], gap: number) => (p: Point): boolean => !taken.some((q) => Math.abs(q[0] - p[0]) < gap / 2 && Math.abs(q[1] - p[1]) < gap / 2);

/**
 * Where a reserve's `n` companies come on to the map (Task 13): along the frame's edge at its entry point, `companyFrontageM`
 * apart (its doctrine), outward from the entry point both ways, skipping places other reserves' companies came on at
 * (`taken`) and places outside the frame's extent; when the edge is full, a row further in. South to north.
 */
function startSlots(r: ReserveState, n: number, taken: readonly Point[], ctx: StepContext): Point[] {
  const [x0, y0] = r.entryPoint;
  const gap = v(doctrineOf(ctx, r.formationId).common.companyFrontageM);
  const e = ctx.scenario.frame?.extent;
  const inward = r.side === 'central' ? -1 : 1;
  const free = freeOf(taken, gap);
  const out: Point[] = [];
  for (let row = 0; out.length < n && row <= n; row++) {
    const x = x0 + inward * row * gap;
    for (let k = 0; out.length < n && k <= 2 * n + 2; k++) {
      const y = y0 + (k % 2 === 0 ? 1 : -1) * Math.ceil(k / 2) * gap;
      if (e && (y < e.minY || y > e.maxY)) continue;
      const p: Point = [x, y];
      if (free(p) && !out.some((q) => q[0] === p[0] && q[1] === p[1])) out.push(p);
    }
  }
  return out.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

/**
 * Each of a reserve's `n` companies' own place at its front (in the same order as its companies, south to north): along
 * the trench of the front segments it was sent to, `companyFrontageM` apart, the places nearest its entry point first,
 * skipping places other reserves' companies were given (`taken`), so reserves sent to one front fill it in turn; when the
 * front is full, a row behind it (on its side of the trench). None when it has no front to go to.
 */
function endSlots(r: ReserveState, n: number, taken: readonly Point[], state: SimState, ctx: StepContext): Array<Point | undefined> {
  const segs = r.frontSegmentIds.flatMap((id) => state.segments.filter((x) => x.id === id));
  const pts = segs.flatMap((x) => [...segmentSamples(ctx, x, state.companies)].sort((a, b) => a[1] - b[1]));
  if (pts.length === 0) return Array.from({ length: n }, () => undefined);
  const gap = v(doctrineOf(ctx, r.formationId).common.companyFrontageM);
  // Places along the trench a frontage apart.
  const line: Point[] = [];
  for (const p of pts) if (line.length === 0 || Math.hypot(p[0] - line.at(-1)![0], p[1] - line.at(-1)![1]) >= gap) line.push(p);
  const back = r.side === 'central' ? 1 : -1;
  const free = freeOf(taken, gap);
  const [ex, ey] = r.entryPoint;
  const out: Point[] = [];
  for (let row = 0; out.length < n && row <= n; row++) {
    // This row's free places, nearest the entry point first (the shortest walks); ties south first.
    const places = line.map(([x, y]): Point => [x + back * row * gap, y]).filter(free);
    places.sort((a, b) => Math.hypot(a[0] - ex, a[1] - ey) - Math.hypot(b[0] - ex, b[1] - ey) || a[1] - b[1]);
    out.push(...places.slice(0, n - out.length));
  }
  return out.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

/**
 * The reserves' scheduled minutes: an ordered reserve setting off (its companies change status off the map, which moves
 * nobody) and arriving (its companies come on to the map, where they can be fired on and sent at once: a fine step).
 */
export function reserveTimes(state: SimState, ctx: StepContext): Scheduled[] {
  const out: Scheduled[] = [];
  for (const r of state.reserves) {
    if (r.status === 'ordered') out.push({ minute: arrivalOf(r, r.orderedMin!, ctx).marchMin, startsMovement: false });
    if (r.status === 'ordered' || r.status === 'marching') out.push({ minute: r.arriveMin!, startsMovement: true });
  }
  return out;
}

/**
 * The uphill counter-attack (spec 13.5): a company counter-attacking fires at a target above it at
 * `1 − uphillPenaltyPer10m · climb / 10` of its rate, `climb` the height in metres of the target above it on the
 * terrain grid (its speed pays for the slope under its feet, ground.ts `speedFactor`, as every company's does). Null when
 * there is no penalty: not counter-attacking, no terrain, or a target not above it.
 */
export function uphillCounterAttack(f: Pick<CompanyState, 'status' | 'x' | 'y'>, t: Pick<CompanyState, 'x' | 'y'>, w: World): { factor: number; climbM: number } | null {
  if (f.status !== 'counter-attacking' || !w.terrain) return null;
  const climbM = w.terrain.at(t.x, t.y) - w.terrain.at(f.x, f.y);
  if (!(climbM > 0)) return null;
  return { factor: Math.max(0, 1 - (v(w.tables.effects.uphillPenaltyPer10m) * climbM) / 10), climbM };
}
