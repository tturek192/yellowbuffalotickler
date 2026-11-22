import { DEADLOCK_CONDITIONS, ScenarioError, v } from '@wwi/scenario';
import type { DeadlockCondition, Point, Scenario } from '@wwi/scenario';
import { emit } from './causes';
import type { Cause } from './causes';
import type { CompanyState } from './companies';
import { holderOf } from './end';
import { lineXAt } from './geometry';
import { round } from './record';
import { onField } from './step';
import type { SimState, StepContext } from './step';
import type { Side } from './types';

/*
 * Deadlock scoring (Plan 4 Task 3; Deadlock design, Goal 1). An observer: it reads the true state, because it measures
 * the battle, and it decides nothing in it. Nothing in the step pipeline reads `SimState.deadlock`; scoring with every
 * condition switched off (`conditions: []`) leaves the record's events (but for `deadlock-broken`, and the ids after it)
 * and snapshots byte-identical (deadlock.test.ts).
 *
 * The four conditions, checked at the end of every step (the `log` phase, after the companies' reports):
 * - breakthrough: a company of the attacker, on the field, stands beyond the defender's artillery line (at greater x: the
 *   attack runs along x) in a sector before any of the defender's off-map reserves has come on to the map in that sector;
 * - surrender: the defenders' captured men reach `surrenderFrac` of their men (each company's men at Zero, counted once the
 *   company is on the map: an off-map reserve never sent counts for nothing);
 * - collapse: in some sector, the defenders on the map there and fit to fight (not pinned, surrendered, falling back,
 *   destroyed, off the map or marching) fall below `collapseFrac` of those there at Zero; reserves count once on the map;
 * - stronghold: the attacker holds every stronghold (end.ts `holderOf`); never with no strongholds.
 * A company is in the sector whose y-band holds its y (the first in the scenario's order on a shared edge).
 * The first condition in `conditions` to hold is recorded, with its minute, and `deadlock-broken` says so. The margins
 * are the closest the run came to each condition at any step (Zero included), so an unbroken run shows how near it was.
 */

export type By = DeadlockCondition;
export const BY: readonly By[] = DEADLOCK_CONDITIONS;

/** How near the run came to each condition (SP3): the furthest beyond the gun line, the most captured, the fewest fit, the most strongholds held. */
export type Margins = {
  /** Metres beyond the artillery line (negative: short of it) of the attacking company furthest on, in a sector no reserve had reached; null with no line, or no such company. */
  breakthrough: { furthestBeyondM: number | null; sectorId: string | null };
  surrender: { capturedFrac: number };
  /** The lowest share of a sector's fit defenders at Zero still fit; 1 with no sector holding defenders at Zero. */
  collapse: { minFitFrac: number; sectorId: string | null };
  stronghold: { held: number; of: number };
};

export type DeadlockSummary = { broken: boolean; by?: By; minute?: number; sectorId?: string; margins: Margins };

/** The run's deadlock score as it stands (`SimState.deadlock`). Read by nothing in the battle. */
export type DeadlockState = {
  /** The first condition to hold, once one has. */
  broken: { by: By; minute: number; sectorId?: string } | null;
  /** Each sector's fit defenders on the map at Zero (men), by sector id. */
  zeroFit: Record<string, number>;
  /** Sectors one of the defender's off-map reserves has come into, in the scenario's sector order: no breakthrough there counts. */
  sealed: string[];
  margins: Margins;
};

/** The scoring as resolved for a run, defaults filled. */
type Config = {
  attacker: Side;
  defender: Side;
  /** The artillery line, south to north; null when none is given (breakthrough then never holds). */
  line: Point[] | null;
  surrenderFrac: number;
  collapseFrac: number;
  strongholds: string[];
  conditions: By[];
  /** The defender's off-map reserve companies (their arrival seals a sector). */
  reserveIds: ReadonlySet<string>;
};

const configs = new WeakMap<StepContext, Config>();

const DEFAULT_SURRENDER_FRAC = 0.5;
const DEFAULT_COLLAPSE_FRAC = 0.1;

const ATTACKING: ReadonlySet<string> = new Set(['assault', 'mopup', 'support']);
/** Statuses of a defending company that is not fit to fight, or not on the map. */
const UNFIT: ReadonlySet<string> = new Set(['pinned', 'surrendered', 'falling-back', 'destroyed', 'off-map', 'marching']);
/** Statuses of a company not (yet) on the map. */
const OFF: ReadonlySet<string> = new Set(['off-map', 'marching']);

const other = (s: Side): Side => (s === 'allied' ? 'central' : 'allied');
const sideName = (s: Side): string => (s === 'allied' ? 'Allied' : 'German');

/**
 * The scoring for this scenario, with every default it takes listed in `defaultsUsed`; null when the scenario has no
 * `deadlock` section and either no `end.keyGround` or no attacker to infer (the only side with attacking companies).
 */
function resolveConfig(state: SimState, ctx: StepContext): Config | null {
  const s = ctx.scenario;
  const d = s.deadlock;
  const used = ctx.defaultsUsed;
  const keyGround = s.end?.keyGround ?? [];
  let attacker: Side;
  if (d) attacker = d.attacker;
  else {
    const sides = [...new Set(state.companies.filter((c) => ATTACKING.has(c.role)).map((c) => c.side))];
    if (keyGround.length === 0 || sides.length !== 1) return null;
    attacker = sides[0]!;
    used.add(`deadlock ← defaults (no deadlock section): attacker ${attacker}, the only side with attacking companies`);
    used.add('deadlock.artilleryLine ← none (no deadlock section): breakthrough is not scored');
  }
  const conditions = d?.conditions ?? [...BY];
  if (!d?.conditions) used.add(`deadlock.conditions ← all four: ${BY.join(', ')}`);
  if (!d?.surrenderFrac) used.add(`deadlock.surrenderFrac ← ${DEFAULT_SURRENDER_FRAC} (an estimate)`);
  if (!d?.collapseFrac) used.add(`deadlock.collapseFrac ← ${DEFAULT_COLLAPSE_FRAC} (the owner's: fewer than 10% of the defending troops in the sector fit to fight)`);
  const strongholds = d?.strongholds?.map((x) => x.featureId) ?? keyGround.map((k) => k.featureId);
  if (!d?.strongholds) used.add(`deadlock.strongholds ← end.keyGround: ${strongholds.join(', ') || 'none'}`);
  const defender = other(attacker);
  const reserveFormations = s.reserves.filter((r) => r.side === defender).map((r) => r.formationId);
  const reserveIds = new Set(state.companies.filter((c) => c.side === defender && c.formationPath.some((f) => reserveFormations.includes(f))).map((c) => c.id));
  return {
    attacker,
    defender,
    line: d ? artilleryLineOf(s, d.artilleryLine) : null,
    surrenderFrac: d?.surrenderFrac ? v(d.surrenderFrac) : DEFAULT_SURRENDER_FRAC,
    collapseFrac: d?.collapseFrac ? v(d.collapseFrac) : DEFAULT_COLLAPSE_FRAC,
    strongholds,
    conditions,
    reserveIds,
  };
}

/** The artillery line's points, south to north: a scenario line, or a LineString feature with ascending y. */
function artilleryLineOf(s: Scenario, ref: NonNullable<Scenario['deadlock']>['artilleryLine']): Point[] {
  if ('lineId' in ref) {
    const l = s.lines.find((x) => x.id === ref.lineId);
    if (!l) throw new ScenarioError([`deadlock.artilleryLine.lineId: unknown line "${ref.lineId}"`]);
    return l.points;
  }
  const f = s.features.find((x) => x.id === ref.featureId);
  if (!f || f.geometry.type !== 'LineString' || !f.geometry.coordinates.every((p, i, ps) => i === 0 || p[1] > ps[i - 1]![1]))
    throw new ScenarioError([`deadlock.artilleryLine.featureId: "${ref.featureId}" must be a LineString feature with strictly ascending y`]);
  return f.geometry.coordinates.map((p): Point => [p[0], p[1]]);
}

/** The sector whose y-band holds y (the first in the scenario's order on a shared edge), or none. */
function sectorAt(ctx: StepContext, y: number): string | null {
  for (const s of ctx.scenario.sectors) if (y >= s.yMin && y <= s.yMax) return s.id;
  return null;
}

/**
 * The fit defenders on the map in each sector, in men, by sector id (every sector listed): on the map, with men, and not
 * pinned, surrendered, falling back or destroyed. Off-map reserves count once they are on the map.
 */
export function fitBySector(state: SimState, ctx: StepContext, defender: Side): Record<string, number> {
  const out: Record<string, number> = Object.fromEntries(ctx.scenario.sectors.map((s) => [s.id, 0]));
  for (const c of state.companies) {
    if (c.side !== defender || !(c.men > 0) || UNFIT.has(c.status)) continue;
    const id = sectorAt(ctx, c.y);
    if (id !== null) out[id]! += c.men;
  }
  return out;
}

/** A company's men at Zero (the run's conservation: men, killed, wounded and captured). */
const menAtZero = (c: CompanyState): number => c.men + c.killed + c.wounded + c.captured;

/** What holds now, for one condition: the sector, and what the event says of it. */
type Hold = { sectorId?: string; text: string; causes: Cause[]; refs: number[]; factors: Record<string, number> };

/** The latest ten event ids among those given, ascending and once each. */
const latest = (ids: Array<number | null | undefined>): number[] =>
  [...new Set(ids.filter((x): x is number => typeof x === 'number'))].sort((a, b) => a - b).slice(-10);

/** One step's measures: the sectors sealed, which conditions hold, the margins they move, and what an event would say of each. */
type Checked = { sealed: string[]; holding: Partial<Record<By, string | null>>; margins: Margins; hold: (by: By) => Hold };

/**
 * One step's check, in one pass over the companies: the sectors sealed, which conditions hold now (each with its sector,
 * null for none), the margins brought up to date from `prev`, and the event's details for a condition (worked out only
 * when asked: a run breaks the deadlock once).
 */
function check(state: SimState, ctx: StepContext, cfg: Config, prev: DeadlockState | null, zeroFit: Record<string, number>): Checked {
  const sectors = ctx.scenario.sectors;
  const sectorIds = sectors.map((s) => s.id);
  const sealedSet = new Set(prev?.sealed ?? []);
  const fit: Record<string, number> = Object.fromEntries(sectorIds.map((id) => [id, 0]));
  let captured = 0;
  let men = 0;
  for (const c of state.companies) {
    if (c.side !== cfg.defender) continue;
    captured += c.captured;
    if (OFF.has(c.status)) continue;
    men += menAtZero(c);
    const id = sectorAt(ctx, c.y);
    // Sealed: one of the defender's off-map reserve companies has come on to the map there (once, for good).
    if (id !== null && cfg.reserveIds.has(c.id)) sealedSet.add(id);
    if (id !== null && c.men > 0 && !UNFIT.has(c.status)) fit[id]! += c.men;
  }
  const sealed = sectorIds.filter((id) => sealedSet.has(id));

  // Breakthrough: the attacking company furthest beyond the line, in a sector not sealed.
  let beyond: { d: number; c: CompanyState; sectorId: string } | null = null;
  if (cfg.line)
    for (const c of state.companies) {
      if (c.side !== cfg.attacker || !onField(c)) continue;
      const id = sectorAt(ctx, c.y);
      if (id === null || sealedSet.has(id)) continue;
      const d = c.x - lineXAt(cfg.line, c.y);
      if (beyond === null || d > beyond.d) beyond = { d, c, sectorId: id };
    }
  // Surrender: the defenders' captured men against their men on the map (or once on it).
  const capturedFrac = men > 0 ? captured / men : 0;
  // Collapse: the sector with the lowest share of its fit defenders at Zero still fit.
  let low: { frac: number; sectorId: string } | null = null;
  for (const id of sectorIds) {
    const z = zeroFit[id] ?? 0;
    if (!(z > 0)) continue;
    const frac = fit[id]! / z;
    if (low === null || frac < low.frac) low = { frac, sectorId: id };
  }
  // Stronghold: the attacker holds every one.
  const held = cfg.strongholds.filter((id) => holderOf(state, ctx, id) === cfg.attacker).length;
  const of = cfg.strongholds.length;

  const holding: Partial<Record<By, string | null>> = {};
  if (beyond && beyond.d > 0) holding.breakthrough = beyond.sectorId;
  if (men > 0 && capturedFrac >= cfg.surrenderFrac) holding.surrender = null;
  if (low && low.frac < cfg.collapseFrac) holding.collapse = low.sectorId;
  if (of > 0 && held === of) holding.stronghold = null;

  const m0 = prev?.margins;
  const b0 = m0?.breakthrough.furthestBeyondM ?? null;
  const margins: Margins = {
    breakthrough: beyond !== null && (b0 === null || beyond.d > b0) ? { furthestBeyondM: beyond.d, sectorId: beyond.sectorId } : (m0?.breakthrough ?? { furthestBeyondM: null, sectorId: null }),
    surrender: { capturedFrac: Math.max(capturedFrac, m0?.surrender.capturedFrac ?? 0) },
    collapse: low !== null && (m0 === undefined || low.frac < m0.collapse.minFitFrac) ? { minFitFrac: low.frac, sectorId: low.sectorId } : (m0?.collapse ?? { minFitFrac: 1, sectorId: null }),
    stronghold: { held: Math.max(held, m0?.stronghold.held ?? 0), of },
  };

  const name = (id: string): string => sectors.find((x) => x.id === id)?.name ?? id;
  const lastFire = (c: CompanyState): number | null => c.recentFire.at(-1)?.eventId ?? null;
  const def = sideName(cfg.defender);
  const hold = (by: By): Hold => {
    if (by === 'breakthrough') {
      const { c, sectorId, d } = beyond!;
      const there = state.companies.filter((x) => x.side === cfg.attacker && onField(x) && sectorAt(ctx, x.y) === sectorId && x.x > lineXAt(cfg.line!, x.y)).length;
      const taken = Object.keys(state.takenEventIds).filter((k) => k.endsWith(`|${sectorId}`)).map((k) => state.takenEventIds[k]);
      const segs = state.segments.filter((x) => x.holder === cfg.attacker && sectorAt(ctx, (x.yMin + x.yMax) / 2) === sectorId).map((x) => x.holderEventId);
      return {
        sectorId,
        text: `The deadlock is broken: ${c.name} is ${Math.round(d)} m beyond the ${def} gun line in ${name(sectorId)}, before any ${def} reserve has come there`,
        causes: ['beyond-the-guns'],
        refs: latest([c.reached?.eventId, lastFire(c), ...taken, ...segs]),
        factors: { beyondM: Math.round(d), companies: there },
      };
    }
    if (by === 'surrender') {
      const takers = state.companies.filter((c) => c.side === cfg.defender && c.captured > 0);
      return {
        text: `The deadlock is broken: ${captured} of ${men} ${def} men (${Math.round(capturedFrac * 100)}%) have been taken prisoner`,
        causes: ['mass-surrender'],
        refs: latest(takers.map((c) => c.takenPrisoner?.eventId ?? lastFire(c))),
        factors: { captured, men, frac: round(capturedFrac, 4) },
      };
    }
    if (by === 'collapse') {
      const { sectorId, frac } = low!;
      const down = state.companies.filter((c) => c.side === cfg.defender && sectorAt(ctx, c.y) === sectorId && !OFF.has(c.status) && (UNFIT.has(c.status) || !(c.men > 0)));
      return {
        sectorId,
        text: `The deadlock is broken: ${fit[sectorId]} of the ${zeroFit[sectorId]} ${def} men in ${name(sectorId)} at Zero are fit to fight (${Math.round(frac * 100)}%)`,
        causes: ['defence-collapsed'],
        refs: latest(down.flatMap((c) => [c.takenPrisoner?.eventId, c.fellBackEventId, c.officersLostEventId, lastFire(c)])),
        factors: { fit: fit[sectorId]!, atZero: zeroFit[sectorId]!, frac: round(frac, 4) },
      };
    }
    return {
      text: `The deadlock is broken: the ${sideName(cfg.attacker)} side holds every stronghold (${cfg.strongholds.join(', ')})`,
      causes: ['stronghold-held'],
      refs: latest(Object.values(state.takenEventIds)),
      factors: { held, of },
    };
  };
  return { sealed, holding, margins, hold };
}

/**
 * The scoring at Zero (initRun, after the bombardment): its defaults listed in `defaultsUsed`, each sector's fit defenders
 * on the map counted, and the margins as they stand. `deadlock` is null for a scenario that is not scored.
 */
export function initDeadlock(state: SimState, ctx: StepContext): SimState {
  const cfg = resolveConfig(state, ctx);
  if (!cfg) return { ...state, deadlock: null };
  configs.set(ctx, cfg);
  const zeroFit = fitBySector(state, ctx, cfg.defender);
  const { sealed, margins } = check(state, ctx, cfg, null, zeroFit);
  return { ...state, deadlock: { broken: null, zeroFit, sealed, margins } };
}

/**
 * Whether the deadlock is broken as of this step: the run's first breaking once there is one, else the first condition
 * in `conditions` that holds now, at this step's minute, with its sector (none for surrender and stronghold).
 */
export function scoreDeadlock(state: SimState, ctx: StepContext): { broken: boolean; by?: By; minute?: number; sectorId?: string } {
  const dl = state.deadlock;
  const cfg = configs.get(ctx);
  if (!dl || !cfg) return { broken: false };
  if (dl.broken) return { broken: true, ...dl.broken };
  const { holding } = check(state, ctx, cfg, dl, dl.zeroFit);
  const by = cfg.conditions.find((k) => holding[k] !== undefined);
  if (by === undefined) return { broken: false };
  const sectorId = holding[by];
  return { broken: true, by, minute: state.minute, ...(sectorId ? { sectorId } : {}) };
}

/**
 * The log phase's deadlock check (pipeline.ts, after `companyReports`, so it reads the step's final state): the margins
 * and sealed sectors brought up to date, and, the first time a listed condition holds, the breaking recorded and
 * `deadlock-broken` emitted (no unit; no sector for surrender or stronghold).
 */
export function deadlockPhase(state: SimState, ctx: StepContext): SimState {
  const dl = state.deadlock;
  const cfg = configs.get(ctx);
  if (!dl || !cfg) return state;
  const { holding, sealed, margins, hold } = check(state, ctx, cfg, dl, dl.zeroFit);
  const by = dl.broken ? undefined : cfg.conditions.find((k) => holding[k] !== undefined);
  if (by === undefined) return { ...state, deadlock: { ...dl, sealed, margins } };
  const h = hold(by);
  const broken = { by, minute: state.minute, ...(h.sectorId !== undefined ? { sectorId: h.sectorId } : {}) };
  // Refs: what led to it; the zero-hour event when nothing more particular is at hand.
  return emit(
    { ...state, deadlock: { ...dl, broken, sealed, margins } },
    { minute: state.minute, kind: 'deadlock-broken', ...(h.sectorId !== undefined ? { sectorId: h.sectorId } : {}), text: h.text, causes: h.causes, refs: h.refs.length ? h.refs : [0], factors: { ...h.factors, [`by:${by}`]: 1 } },
  );
}

/** The run's `summary.deadlock`: null when it is not scored; the margins rounded (metres to 1, shares to 0.0001). */
export function deadlockSummary(state: SimState): DeadlockSummary | null {
  const dl = state.deadlock;
  if (!dl) return null;
  const m = dl.margins;
  const b = m.breakthrough.furthestBeyondM;
  return {
    broken: dl.broken !== null,
    ...(dl.broken ?? {}),
    margins: {
      breakthrough: { furthestBeyondM: b === null ? null : Math.round(b), sectorId: m.breakthrough.sectorId },
      surrender: { capturedFrac: round(m.surrender.capturedFrac, 4) },
      collapse: { minFitFrac: round(m.collapse.minFitFrac, 4), sectorId: m.collapse.sectorId },
      stronghold: { ...m.stronghold },
    },
  };
}
