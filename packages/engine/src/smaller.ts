import { v } from '@wwi/scenario';
import type { Point, Scenario, Tables } from '@wwi/scenario';
import { barrageXAt } from './barrage';
import { emit } from './causes';
import type { NewEvent } from './causes';
import { byId } from './companies';
import type { CompanyState } from './companies';
import { lineXAt } from './geometry';
import { wetness } from './ground';
import { round } from './record';
import { stochasticRound } from './stochastic';
import { onField } from './step';
import type { SimState, StepContext } from './step';
import type { BatteryState, FireGroup, Pending, TankState } from './types';

/*
 * The smaller mechanics (Task 14):
 * - tanks, which follow their sector's creeping barrage toward their objective line, bog in the mud, and suppress the
 *   enemy close to them while they move;
 * - gas in the preliminary bombardment, which takes the draught horses of the enemy batteries near where it falls, so
 *   that those guns cannot be pulled away and are captured when overrun (trenches.ts `captureGuns`);
 * - the attackers' ammunition reserve: a company that has made its advance keeps back a share of its rounds, and fires it
 *   only when counter-attacked (fire.ts).
 *
 * Every number is data: the effects keys tankBogPerKm, tankBogMudFactor, tankSuppressRadiusM, tankMachineGuns,
 * horseLossPerGasRound and gasHorseRadiusM, the tank side's doctrine `attack.followDistanceM` and its machine gun
 * (`companyWeapons.mg`), and each doctrine's `attack.ammoReserveFrac`. BOG_CHECK_M is the unit conversion that makes a
 * per-kilometre chance a per-100-m one.
 */

/** Metres between a tank's bog checks: the chance at each is tankBogPerKm / 10 (1 km = 10 × 100 m). */
export const BOG_CHECK_M = 100;
const EPS = 1e-9;

// ---- tanks -----------------------------------------------------------------------------------------------------

/** The scenario's tanks at Zero, in ascending id order, each moving from its start. */
export function initTanks(s: Scenario): TankState[] {
  return [...(s.tanks ?? [])].sort(byId).map((t): TankState => {
    if (!Array.isArray(t.start)) throw new Error(`Tank ${t.id}: start was not projected to a local point`);
    return { id: t.id, side: t.side, sectorId: t.sectorId, objectiveLineId: t.objectiveLineId, x: t.start[0], y: t.start[1], metres: 0, status: 'moving' };
  });
}

/**
 * The chance a tank bogs at one 100 m mark: `tankBogPerKm / 10` times the mud factor, `tankBogMudFactor ^ wet`, where
 * `wet` is the share of the past 24 hours it rained (ground.ts `wetness`); at most 1.
 */
export function bogChance(tables: Tables, wet: number): number {
  return Math.min(1, (v(tables.effects.tankBogPerKm) / 10) * v(tables.effects.tankBogMudFactor) ** wet);
}

/** The doctrine of a side's first force (the tanks' follow distance and machine gun are its). */
function doctrineOf(side: TankState['side'], ctx: StepContext) {
  const force = ctx.scenario.forces.find((f) => f.side === side);
  const d = force ? ctx.doctrines[force.doctrine] : undefined;
  if (!d) throw new Error(`No doctrine for the ${side} tanks`);
  return d;
}

/**
 * Where a tank is making for and how fast it may go: the creeping barrage's line in its sector at its y, less its side's
 * follow distance, but no farther than its objective line; once the barrage is done, the objective line. Its pace is the
 * barrage's, the current leg's lift over its lift time. `fromMin`: the barrage finished inside this step at that minute,
 * so the tank set off again only then.
 */
function tankTarget(t: TankState, state: SimState, ctx: StepContext): { x: number; objX: number; pace: number; fromMin: number } {
  const sector = ctx.scenario.sectors.find((x) => x.id === t.sectorId)!;
  const b = state.barrages.find((x) => x.sectorId === t.sectorId)!;
  const objX = lineXAt(ctx.lines.get(t.objectiveLineId)!, t.y);
  const leg = sector.legs[b.legIndex]!;
  const pace = v(leg.liftM) / v(leg.liftMin);
  if (b.phase === 'done') return { x: objX, objX, pace, fromMin: b.phaseStartMin };
  const follow = v(doctrineOf(t.side, ctx).attack!.followDistanceM);
  return { x: Math.min(objX, barrageXAt(b, sector, ctx.lines, state.minute, t.y) - follow), objX, pace, fromMin: -Infinity };
}

/**
 * Tanks move (the movement phase), in ascending id order: each that is not bogged or arrived drives toward its target at
 * no more than the barrage's pace, never backward. At every 100 m it has driven since Zero it may bog (one draw from the
 * `tanks` stream, `bogChance`): it stops at that mark for the rest of the run, with `tank-bogged` (cause `mud`). One that
 * reaches its objective line has arrived; one that has caught up with its barrage is halted until the barrage moves on.
 * A tank's moving time in the step starts no earlier than the barrage's end (`tankTarget`), so a quiet step that ends
 * just after it moves the tank as far as a fine one (schedule.ts: the barrage's end is scheduled).
 */
export function moveTanks(state: SimState, ctx: StepContext, dt: number): SimState {
  if (state.tanks.length === 0) return state;
  const events: NewEvent[] = [];
  let wet: number | undefined;
  const tanks = state.tanks.map((t): TankState => {
    if (t.status === 'bogged' || t.status === 'arrived') return t;
    const g = tankTarget(t, state, ctx);
    const time = Math.max(0, Math.min(dt, state.minute - g.fromMin));
    const go = Math.max(0, Math.min(g.x - t.x, g.pace * time));
    if (!(go > EPS)) return { ...t, status: t.x >= g.objX - EPS ? 'arrived' : 'halted' };
    // The 100 m marks it passes, in order: each a draw.
    for (let mark = (Math.floor(t.metres / BOG_CHECK_M + EPS) + 1) * BOG_CHECK_M; mark <= t.metres + go + EPS; mark += BOG_CHECK_M) {
      const p = bogChance(ctx.tables, (wet ??= wetness(ctx.world, state.minute)));
      if (!(ctx.rngs.tanks() < p)) continue;
      const x = t.x + (mark - t.metres);
      events.push({
        minute: state.minute,
        kind: 'tank-bogged',
        unitId: t.id,
        sectorId: t.sectorId,
        text: `Tank ${t.id} bogs down in the mud, ${round(mark)} m from where it started`,
        causes: ['mud'],
        factors: { metres: round(mark), chance: round(p, 3), wetness: round(wet!, 2) },
      });
      return { ...t, x, metres: mark, status: 'bogged' };
    }
    const x = t.x + go;
    return { ...t, x, metres: t.metres + go, status: x >= g.objX - EPS ? 'arrived' : x >= g.x - EPS ? 'halted' : 'moving' };
  });
  return emit({ ...state, tanks }, ...events);
}

/**
 * A moving tank's machine guns (the directFire phase): every enemy company up on the field within
 * `tankSuppressRadiusM` of a tank that is moving gets `tankMachineGuns` of its side's machine gun's rounds for the step,
 * which suppress it (the suppression rule, resolve.ts) and hit no one: the tanks fight no other way. Cause `tank-fire`.
 * A tank that is halted, arrived or bogged fires at no one.
 */
export function tankFire(state: SimState, ctx: StepContext, dt: number, pending: Pending): SimState {
  const moving = state.tanks.filter((t) => t.status === 'moving');
  if (moving.length === 0 || !(dt > 0)) return state;
  const r = v(ctx.tables.effects.tankSuppressRadiusM);
  const guns = v(ctx.tables.effects.tankMachineGuns);
  for (const t of moving) {
    const w = ctx.tables.weapons[doctrineOf(t.side, ctx).companyWeapons.mg]!;
    const rounds = guns * v(w.rpm) * dt;
    if (!(rounds > 0)) continue;
    const fire: FireGroup = { key: `tank:${t.id}`, kind: 'direct-fire', text: `Tank ${t.id}'s machine guns`, sectorId: t.sectorId, factors: { machineGuns: guns } };
    for (const c of state.companies) {
      if (c.side === t.side || !onField(c) || c.posture === 'in-dugout' || Math.hypot(c.x - t.x, c.y - t.y) > r) continue;
      pending.damage.push({ targetId: c.id, source: 'direct-fire', hits: 0, rounds, suppressPerRound: v(w.suppressPerRound), causes: ['tank-fire'], refs: [], fire });
    }
  }
  return state;
}

// ---- gassed horses -----------------------------------------------------------------------------------------------

/** Gas rounds landed at a point in the bombardment. */
export type GasFall = { point: Point; rounds: number };

/**
 * The bombardment's gas on the enemy's draught horses, before Zero (bombardment.ts): each battery with horses and a
 * position, in ascending id order, takes every gas round that fell within `gasHorseRadiusM` of it, and loses
 * `1 − (1 − horseLossPerGasRound)^rounds` of its horses. The guns left without teams (`stochasticRound` of that share of
 * its guns, one draw from the `gas` stream) are split off as a battery of their own, `<id>/g`, with no horses: they
 * cannot be pulled away, so they are captured when the enemy overruns them (trenches.ts). One `horses-gassed` event
 * (cause `counter-battery`) for each battery that lost any, ids from `firstId` on.
 */
export function gasHorses(batteries: BatteryState[], falls: GasFall[], ctx: StepContext, firstId: number): { batteries: BatteryState[]; events: NewEvent[] } {
  if (falls.length === 0) return { batteries, events: [] };
  const fx = ctx.tables.effects;
  const rad = v(fx.gasHorseRadiusM);
  const per = v(fx.horseLossPerGasRound);
  const events: NewEvent[] = [];
  const out: BatteryState[] = [];
  for (const b of batteries) {
    if (!b.horses || !b.position || !(b.guns > 0)) {
      out.push(b);
      continue;
    }
    const n = falls.reduce((a, f) => a + (Math.hypot(f.point[0] - b.position![0], f.point[1] - b.position![1]) <= rad ? f.rounds : 0), 0);
    if (!(n > 0)) {
      out.push(b);
      continue;
    }
    const lost = 1 - (1 - Math.min(1, per)) ** n;
    const k = Math.min(b.guns, stochasticRound(b.guns * lost, ctx.rngs.gas));
    if (k === 0) {
      out.push(b);
      continue;
    }
    const gassedEventId = firstId + events.length;
    events.push({
      minute: 0,
      kind: 'horses-gassed',
      text: `Battery ${b.id} (${b.guns} × ${b.weapon}): gas takes the horses of ${k} of its guns, which can no longer be pulled away`,
      causes: ['counter-battery'],
      factors: { guns: k, rounds: round(n, 1), horsesLost: round(lost, 3) },
    });
    if (k === b.guns) out.push({ ...b, horses: false, gassedEventId });
    else
      out.push(
        { ...b, guns: b.guns - k, ammoLeft: (b.ammoLeft * (b.guns - k)) / b.guns },
        { ...b, id: `${b.id}/g`, guns: k, ammoLeft: (b.ammoLeft * k) / b.guns, horses: false, gassedEventId },
      );
  }
  return { batteries: out.sort(byId), events };
}

// ---- the ammunition reserve -----------------------------------------------------------------------------------

/**
 * The share of its rounds a company keeps back (fire.ts): its doctrine's `attack.ammoReserveFrac` once it has made its
 * advance (consolidating on its objective, or holding where it got to), otherwise 0. It fires into it only when
 * counter-attacked (`counterAttacked`).
 */
export function ammoReserve(c: CompanyState, ctx: StepContext): number {
  if (!(c.status === 'consolidating' || (c.status === 'holding' && c.reached !== null))) return 0;
  const a = ctx.doctrines[c.doctrineId]?.attack;
  return a ? v(a.ammoReserveFrac) : 0;
}

/** Counter-attacked: among the enemy a company sees and fires on, one is coming at it (advancing or counter-attacking). */
export const counterAttacked = (targets: ReadonlyArray<{ t: CompanyState }>): boolean =>
  targets.some(({ t }) => t.status === 'advancing' || t.status === 'counter-attacking');

/** A company's `ammunition-low` event: down to its reserve, which it now holds (or fires against a counter-attack). */
export function ammunitionLow(c: CompanyState, reserve: number, against: boolean, minute: number): NewEvent {
  return {
    minute,
    kind: 'ammunition-low',
    unitId: c.id,
    ...(c.sectorId ? { sectorId: c.sectorId } : {}),
    text: against
      ? `${c.name} fires into its ammunition reserve (the last ${Math.round(reserve * 100)}% of its rounds) against a counter-attack`
      : `${c.name} is down to its ammunition reserve (the last ${Math.round(reserve * 100)}% of its rounds) and holds it for a counter-attack`,
    causes: ['ammunition-low'],
    refs: c.reached ? [c.reached.eventId] : [],
    factors: { reserve: round(reserve, 3), ammo: round(c.ammo, 3) },
  };
}

