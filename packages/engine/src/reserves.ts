import { v } from '@wwi/scenario';
import type { Doctrine, Formation, FORMATION_KINDS, Scenario } from '@wwi/scenario';
import { emit } from './causes';
import type { NewEvent } from './causes';
import type { CompanyState } from './companies';
import type { World } from './ground';
import { wetness } from './ground';
import { delayFactor, leaderOf } from './leaders';
import { round } from './record';
import type { Scheduled } from './schedule';
import type { SimState, StepContext } from './step';
import type { HqState, ReserveState } from './types';

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
 * At `arriveMin` its companies stand at its entry point, holding (`reserve-arrived`, cause `reserve-arrived`, refs its
 * `reserve-ordered`); from there the command model can send them like any other reserve.
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

/** When a reserve ordered at `orderedMin` starts its march and arrives, and the numbers behind it. */
export function arrivalOf(r: Pick<ReserveState, 'formationId' | 'orderedBy'>, orderedMin: number, ctx: StepContext): { marchMin: number; arriveMin: number; factors: Record<string, number> } {
  const k = doctrineOf(ctx, r.formationId).common;
  const delay = v(k.baseOrderDelayMin) * delayFactor(leaderOf(ctx.scenario, r.orderedBy ?? ordererOf(ctx, r.formationId), ctx.defaultsUsed));
  const marchMin = orderedMin + delay;
  const km = v(indexOf(ctx.scenario).reserves.get(r.formationId)!.distanceKm);
  const kmh = v(k.marchKmPerHour);
  const atStart = weatherAt(ctx.world, marchMin);
  const weather = (atStart + weatherAt(ctx.world, marchMin + (km / (kmh * atStart)) * 60)) / 2;
  const walk = (km / (kmh * weather)) * 60;
  const deploy = v(k.deployMin);
  return {
    marchMin,
    arriveMin: marchMin + walk + deploy,
    factors: { distanceKm: km, orderDelayMin: round(delay, 1), marchMin: round(walk, 1), deployMin: deploy, weather: round(weather, 3) },
  };
}

/** A reserve ordered forward at minute M by headquarters `by` (command.ts), with its `reserve-ordered` event: when it will arrive. */
export function orderReserve(r: ReserveState, ctx: StepContext, M: number, by: string, eventId: number): ReserveState {
  const at = { ...r, orderedBy: by };
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

/** Whether an HQ's picture shows every company of a reserve formation off the march: on the map, or out of the fight there. */
export function arrivalKnown(state: SimState, ctx: StepContext, h: HqState, formationId: string): boolean {
  return companiesOf(state, ctx, formationId).every((id) => {
    const u = h.picture.units[id];
    return u !== undefined && u.status !== 'off-map' && u.status !== 'marching';
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
  state.reserves.forEach((r0, i) => {
    if (r0.status !== 'ordered' && r0.status !== 'marching') return;
    let r = r0;
    const a = arrivalOf(r, r.orderedMin!, ctx);
    if (r.status === 'ordered' && M >= a.marchMin) {
      r = { ...r, status: 'marching' };
      companies = companies.map((c) => (c.status === 'off-map' && ofReserve(c, r.formationId) ? { ...c, status: 'marching', intent: 'march' } : c));
    }
    if (r.status === 'marching' && M >= r.arriveMin!) {
      r = { ...r, status: 'arrived' };
      const [x, y] = r.entryPoint;
      let n = 0;
      let men = 0;
      companies = companies.map((c) => {
        if ((c.status !== 'marching' && c.status !== 'off-map') || !ofReserve(c, r.formationId)) return c;
        n++;
        men += c.men;
        return { ...c, x, y, startX: x, startY: y, status: 'holding', intent: 'hold', posture: 'prone' };
      });
      events.push({
        minute: M,
        kind: 'reserve-arrived',
        text: `${infoOf(ctx, r.formationId).name} arrives: ${n} companies, ${men} men`,
        causes: ['reserve-arrived'],
        refs: r.orderedEventId === null ? [] : [r.orderedEventId],
        factors: { ...a.factors, arriveMin: round(r.arriveMin!, 1), companies: n, men },
      });
    }
    if (r !== r0) reserves = reserves.map((x, j) => (j === i ? r : x));
  });
  if (reserves === state.reserves) return state;
  return emit({ ...state, reserves, companies }, ...events);
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
