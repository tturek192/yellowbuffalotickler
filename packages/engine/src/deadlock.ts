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
 * the battle, and it decides nothing in it. Nothing in the step pipeline but this module reads `SimState.deadlock`: a run
 * with it null from Zero (`RunOptions.unscored`) has the same events (but for `deadlock-broken`, and the ids after it)
 * and snapshots, byte for byte (deadlock.test.ts).
 *
 * The four conditions, checked at the end of every step (the `log` phase, after the companies' reports):
 * - breakthrough: a company of the attacker, on the field, stands beyond the defender's artillery line (at greater x: the
 *   attack runs along x) in a sector not yet sealed. A sector is sealed, for good, once a company of one of the defender's
 *   off-map reserves stands in it on the field within `sealDistanceM` behind the line, or in front of it: the reserve has
 *   come up to seal the gap;
 * - surrender: the defenders' captured men reach `surrenderFrac` of their men at Zero: every defending company's, the
 *   off-map reserves' included, a number fixed at Zero;
 * - collapse (the owner's: "fewer than 10% of enemy troops remaining"): the defender's whole force in the battle, its
 *   reserves included, falls below `collapseFrac` of its men at Zero (the same fixed number as surrender's). Fit: every
 *   defending company's men that is not pinned, surrendered, falling back or destroyed, wherever it is: on the map, or an
 *   off-map reserve not yet arrived (waiting, ordered or marching, wherever sent). Not measured per sector; no sector;
 * - stronghold: the attacker holds every stronghold (end.ts `holderOf`); never with no strongholds.
 * A company is in the sector whose y-band holds its y (the first in the scenario's order on a shared edge).
 * The first condition in `conditions` to hold is recorded, with its minute, and `deadlock-broken` says so. The margins
 * are the closest the run came to each condition at any step (Zero included), each with the minute it was first reached,
 * kept to the run's end; `atBreak` holds them as they stood at the break.
 */

export type By = DeadlockCondition;
export const BY: readonly By[] = DEADLOCK_CONDITIONS;

/**
 * How near the run came to each condition (SP3), each with the minute its value was first reached (null with no value):
 * the furthest beyond the gun line, the most captured, the fewest fit, the most strongholds held at once.
 */
export type Margins = {
  /** Metres beyond the artillery line (negative: short of it) of the attacking company furthest on, in a sector not sealed; null with no line, or no such company. */
  breakthrough: { furthestBeyondM: number | null; sectorId: string | null; minute: number | null };
  surrender: { capturedFrac: number; minute: number };
  /** The lowest share of the defender's men at Zero still fit, over the whole force, reserves included. */
  collapse: { minFitFrac: number; minute: number };
  stronghold: { held: number; of: number; minute: number };
};

export type DeadlockSummary = { broken: boolean; by?: By; minute?: number; sectorId?: string; margins: Margins; atBreak: Margins | null };

/** The run's deadlock score as it stands (`SimState.deadlock`). Read by nothing in the battle. */
export type DeadlockState = {
  /** The first condition to hold, once one has. */
  broken: { by: By; minute: number; sectorId?: string } | null;
  /**
   * Sectors sealed, in the scenario's sector order: one of the defender's off-map reserve companies has stood there within
   * `sealDistanceM` behind the gun line (or in front of it). No breakthrough there counts.
   */
  sealed: string[];
  /** The margins, to the end of the run. */
  margins: Margins;
  /** The margins as they stood at the break; null before it. */
  atBreak: Margins | null;
};

/** The scoring as resolved for a run, defaults filled. */
type Config = {
  attacker: Side;
  defender: Side;
  /** The artillery line, south to north; null when none is given (breakthrough then never holds, and nothing seals). */
  line: Point[] | null;
  surrenderFrac: number;
  collapseFrac: number;
  sealDistanceM: number;
  strongholds: string[];
  conditions: By[];
  /** The defender's off-map reserve companies, each with its reserve's formation id. */
  reserveOf: ReadonlyMap<string, string>;
  /** Surrender's and collapse's denominator: every defending company's men at Zero, off-map reserves included. */
  surrenderMen: number;
};

const configs = new WeakMap<StepContext, Config>();

const DEFAULT_SURRENDER_FRAC = 0.5;
const DEFAULT_COLLAPSE_FRAC = 0.1;
/** An estimate: a reserve company within a kilometre behind the gun line stands among the batteries it is to cover. */
const DEFAULT_SEAL_DISTANCE_M = 1000;

const ATTACKING: ReadonlySet<string> = new Set(['assault', 'mopup', 'support']);
/** Statuses of a defending company that is not fit to fight (an off-map reserve not yet arrived is fit: still available). */
const UNFIT: ReadonlySet<string> = new Set(['pinned', 'surrendered', 'falling-back', 'destroyed']);
/** Statuses of a company not (yet) on the map. */
const OFF: ReadonlySet<string> = new Set(['off-map', 'marching']);

const other = (s: Side): Side => (s === 'allied' ? 'central' : 'allied');
const sideName = (s: Side): string => (s === 'allied' ? 'Allied' : 'German');

/** A company's men at Zero (the run's conservation: men, killed, wounded and captured). */
const menAtZero = (c: CompanyState): number => c.men + c.killed + c.wounded + c.captured;

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
  const line = d ? artilleryLineOf(s, d.artilleryLine) : null;
  const conditions = d?.conditions ?? [...BY];
  if (!d?.conditions) used.add(`deadlock.conditions ← all four: ${BY.join(', ')}`);
  if (!d?.surrenderFrac) used.add(`deadlock.surrenderFrac ← ${DEFAULT_SURRENDER_FRAC} (an estimate)`);
  if (!d?.collapseFrac) used.add(`deadlock.collapseFrac ← ${DEFAULT_COLLAPSE_FRAC} (the owner's: "fewer than 10% of enemy troops remaining")`);
  if (line && !d?.sealDistanceM) used.add(`deadlock.sealDistanceM ← ${DEFAULT_SEAL_DISTANCE_M} (an estimate)`);
  const strongholds = d?.strongholds?.map((x) => x.featureId) ?? keyGround.map((k) => k.featureId);
  if (!d?.strongholds) used.add(`deadlock.strongholds ← end.keyGround: ${strongholds.join(', ') || 'none'}`);
  const defender = other(attacker);

  // The defender's off-map reserves' companies (a sector's seal).
  const reserves = state.reserves.filter((r) => r.side === defender);
  const reserveOf = new Map<string, string>();
  for (const c of state.companies) {
    if (c.side !== defender) continue;
    const r = reserves.find((x) => c.formationPath.includes(x.formationId));
    if (r) reserveOf.set(c.id, r.formationId);
  }

  return {
    attacker,
    defender,
    line,
    surrenderFrac: d?.surrenderFrac ? v(d.surrenderFrac) : DEFAULT_SURRENDER_FRAC,
    collapseFrac: d?.collapseFrac ? v(d.collapseFrac) : DEFAULT_COLLAPSE_FRAC,
    sealDistanceM: d?.sealDistanceM ? v(d.sealDistanceM) : DEFAULT_SEAL_DISTANCE_M,
    strongholds,
    conditions,
    reserveOf,
    surrenderMen: state.companies.reduce((a, c) => (c.side === defender ? a + menAtZero(c) : a), 0),
  };
}

/** The artillery line's points, south to north: a scenario line, or a LineString feature with ascending y. */
function artilleryLineOf(s: Scenario, ref: NonNullable<Scenario['deadlock']>['artilleryLine']): Point[] {
  const ascending = (ps: readonly Point[]) => ps.every((p, i) => i === 0 || p[1] > ps[i - 1]![1]);
  if ('lineId' in ref) {
    const l = s.lines.find((x) => x.id === ref.lineId);
    if (!l || !ascending(l.points)) throw new ScenarioError([`deadlock.artilleryLine.lineId: "${ref.lineId}" must be a line with strictly ascending y`]);
    return l.points;
  }
  const f = s.features.find((x) => x.id === ref.featureId);
  if (!f || f.geometry.type !== 'LineString' || !ascending(f.geometry.coordinates))
    throw new ScenarioError([`deadlock.artilleryLine.featureId: "${ref.featureId}" must be a LineString feature with strictly ascending y`]);
  return f.geometry.coordinates.map((p): Point => [p[0], p[1]]);
}

/** The sector whose y-band holds y (the first in the scenario's order on a shared edge), or none. */
function sectorAt(ctx: StepContext, y: number): string | null {
  for (const s of ctx.scenario.sectors) if (y >= s.yMin && y <= s.yMax) return s.id;
  return null;
}

/**
 * One pass over the defenders: the whole force's fit men (every company with men not pinned, surrendered, falling back or
 * destroyed, off-map reserves not yet arrived included, so each man counts once wherever he is), the men captured, and the
 * sectors a reserve company seals this step.
 */
function defenders(state: SimState, ctx: StepContext, cfg: Config): { fit: number; captured: number; sealing: Set<string> } {
  const sealing = new Set<string>();
  let captured = 0;
  let fit = 0;
  for (const c of state.companies) {
    if (c.side !== cfg.defender) continue;
    captured += c.captured;
    if (c.men > 0 && !UNFIT.has(c.status)) fit += c.men;
    if (OFF.has(c.status) || !cfg.line || !cfg.reserveOf.has(c.id) || !onField(c)) continue;
    const id = sectorAt(ctx, c.y);
    if (id !== null && c.x - lineXAt(cfg.line, c.y) <= cfg.sealDistanceM) sealing.add(id);
  }
  return { fit, captured, sealing };
}

/** The defender's whole force still fit, in men (collapse's numerator); 0 for a run that is not scored. */
export function forceFit(state: SimState, ctx: StepContext): number {
  const cfg = configs.get(ctx);
  return cfg ? defenders(state, ctx, cfg).fit : 0;
}

/** What holds now, for one condition: the sector, and what the event says of it. */
type Hold = { sectorId?: string; text: string; causes: Cause[]; refs: number[]; factors: Record<string, number> };

/** The latest ten event ids among those given, ascending and once each. */
const latest = (ids: Array<number | null | undefined>): number[] =>
  [...new Set(ids.filter((x): x is number => typeof x === 'number'))].sort((a, b) => a - b).slice(-10);

/** One step's measures: the sectors sealed, which conditions hold, the margins they move, and what an event would say of each. */
type Checked = { sealed: string[]; holding: Partial<Record<By, string | null>>; margins: Margins; hold: (by: By) => Hold };

/** The first condition in `conditions` that holds, if any. */
const firstHolding = (cfg: Config, holding: Checked['holding']): By | undefined => cfg.conditions.find((k) => holding[k] !== undefined);

/**
 * One step's check: the sectors sealed, which conditions hold now (each with its sector, null for none), the margins
 * brought up to date from `prev` (each with the minute it was first reached), and the event's details for a condition
 * (worked out only when asked: a run breaks the deadlock once).
 */
function check(state: SimState, ctx: StepContext, cfg: Config, prev: DeadlockState | null): Checked {
  const sectors = ctx.scenario.sectors;
  const sectorIds = sectors.map((s) => s.id);
  const M = state.minute;
  const { fit, captured, sealing } = defenders(state, ctx, cfg);
  const sealedSet = new Set([...(prev?.sealed ?? []), ...sealing]);
  const sealed = sectorIds.filter((id) => sealedSet.has(id));

  // Breakthrough: the attacking company furthest beyond the line, in a sector not sealed (a seal this step counts first).
  let beyond: { d: number; c: CompanyState; sectorId: string } | null = null;
  if (cfg.line)
    for (const c of state.companies) {
      if (c.side !== cfg.attacker || !onField(c)) continue;
      const id = sectorAt(ctx, c.y);
      if (id === null || sealedSet.has(id)) continue;
      const d = c.x - lineXAt(cfg.line, c.y);
      if (beyond === null || d > beyond.d) beyond = { d, c, sectorId: id };
    }
  // Surrender: the defenders' captured men against all their men at Zero.
  const capturedFrac = cfg.surrenderMen > 0 ? captured / cfg.surrenderMen : 0;
  // Collapse: the whole force still fit against its men at Zero.
  const fitFrac = cfg.surrenderMen > 0 ? fit / cfg.surrenderMen : 1;
  // Stronghold: the attacker holds every one.
  const held = cfg.strongholds.filter((id) => holderOf(state, ctx, id) === cfg.attacker).length;
  const of = cfg.strongholds.length;

  const holding: Checked['holding'] = {};
  if (beyond && beyond.d > 0) holding.breakthrough = beyond.sectorId;
  if (cfg.surrenderMen > 0 && capturedFrac >= cfg.surrenderFrac) holding.surrender = null;
  if (cfg.surrenderMen > 0 && fitFrac < cfg.collapseFrac) holding.collapse = null;
  if (of > 0 && held === of) holding.stronghold = null;

  // Each margin moves only when the run comes nearer than before, and takes this step's minute then.
  const m0 = prev?.margins;
  const b0 = m0?.breakthrough.furthestBeyondM ?? null;
  const margins: Margins = {
    breakthrough:
      beyond !== null && (b0 === null || beyond.d > b0)
        ? { furthestBeyondM: beyond.d, sectorId: beyond.sectorId, minute: M }
        : (m0?.breakthrough ?? { furthestBeyondM: null, sectorId: null, minute: null }),
    surrender: m0 && capturedFrac <= m0.surrender.capturedFrac ? m0.surrender : { capturedFrac, minute: M },
    collapse: m0 && fitFrac >= m0.collapse.minFitFrac ? m0.collapse : { minFitFrac: fitFrac, minute: M },
    stronghold: m0 && held <= m0.stronghold.held ? m0.stronghold : { held, of, minute: M },
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
        text: `The deadlock is broken: ${c.name} is ${Math.round(d)} m beyond the ${def} gun line in ${name(sectorId)}, before any ${def} reserve has come up to it there`,
        causes: ['beyond-the-guns'],
        refs: latest([c.reached?.eventId, lastFire(c), ...taken, ...segs]),
        factors: { beyondM: Math.round(d), companies: there },
      };
    }
    if (by === 'surrender') {
      const takers = state.companies.filter((c) => c.side === cfg.defender && c.captured > 0);
      return {
        text: `The deadlock is broken: ${captured} of the ${cfg.surrenderMen} ${def} men in the battle (${Math.round(capturedFrac * 100)}%) have been taken prisoner`,
        causes: ['mass-surrender'],
        refs: latest(takers.map((c) => c.takenPrisoner?.eventId ?? lastFire(c))),
        factors: { captured, men: cfg.surrenderMen, frac: round(capturedFrac, 4) },
      };
    }
    if (by === 'collapse') {
      const down = state.companies.filter((c) => c.side === cfg.defender && (UNFIT.has(c.status) || !(c.men > 0)));
      return {
        text: `The deadlock is broken: of the ${cfg.surrenderMen} ${def} men in the battle at Zero, reserves included, ${fit} are fit to fight (${Math.round(fitFrac * 100)}%)`,
        causes: ['defence-collapsed'],
        refs: latest(down.flatMap((c) => [c.takenPrisoner?.eventId, c.fellBackEventId, c.officersLostEventId, lastFire(c)])),
        factors: { fit, atZero: cfg.surrenderMen, frac: round(fitFrac, 4) },
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
 * The scoring at Zero (initRun, after the bombardment): its defaults listed in `defaultsUsed` and the margins as they
 * stand. `deadlock` is null for a scenario that is not scored.
 */
export function initDeadlock(state: SimState, ctx: StepContext): SimState {
  const cfg = resolveConfig(state, ctx);
  if (!cfg) return { ...state, deadlock: null };
  configs.set(ctx, cfg);
  const { sealed, margins } = check(state, ctx, cfg, null);
  return { ...state, deadlock: { broken: null, sealed, margins, atBreak: null } };
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
  const { holding } = check(state, ctx, cfg, dl);
  const by = firstHolding(cfg, holding);
  if (by === undefined) return { broken: false };
  const sectorId = holding[by];
  return { broken: true, by, minute: state.minute, ...(sectorId ? { sectorId } : {}) };
}

/**
 * The log phase's deadlock check (pipeline.ts, after `companyReports`, so it reads the step's final state): the margins
 * and sealed sectors brought up to date, and, the first time a listed condition holds, the breaking and the margins at
 * it recorded and `deadlock-broken` emitted (no unit; no sector for surrender or stronghold).
 */
export function deadlockPhase(state: SimState, ctx: StepContext): SimState {
  const dl = state.deadlock;
  const cfg = configs.get(ctx);
  if (!dl || !cfg) return state;
  const { holding, sealed, margins, hold } = check(state, ctx, cfg, dl);
  const by = dl.broken ? undefined : firstHolding(cfg, holding);
  if (by === undefined) return { ...state, deadlock: { ...dl, sealed, margins } };
  const h = hold(by);
  const broken = { by, minute: state.minute, ...(h.sectorId !== undefined ? { sectorId: h.sectorId } : {}) };
  // Refs: what led to it; the zero-hour event when nothing more particular is at hand.
  return emit(
    { ...state, deadlock: { ...dl, broken, sealed, margins, atBreak: margins } },
    { minute: state.minute, kind: 'deadlock-broken', ...(h.sectorId !== undefined ? { sectorId: h.sectorId } : {}), text: h.text, causes: h.causes, refs: h.refs.length ? h.refs : [0], factors: { ...h.factors, [`by:${by}`]: 1 } },
  );
}

/** Margins as the record holds them: metres to 1, shares to 0.0001. */
function rounded(m: Margins): Margins {
  const b = m.breakthrough.furthestBeyondM;
  return {
    breakthrough: { ...m.breakthrough, furthestBeyondM: b === null ? null : Math.round(b) },
    surrender: { ...m.surrender, capturedFrac: round(m.surrender.capturedFrac, 4) },
    collapse: { ...m.collapse, minFitFrac: round(m.collapse.minFitFrac, 4) },
    stronghold: { ...m.stronghold },
  };
}

/** The run's `summary.deadlock`: null when it is not scored. */
export function deadlockSummary(state: SimState): DeadlockSummary | null {
  const dl = state.deadlock;
  if (!dl) return null;
  return { broken: dl.broken !== null, ...(dl.broken ?? {}), margins: rounded(dl.margins), atBreak: dl.atBreak ? rounded(dl.atBreak) : null };
}
