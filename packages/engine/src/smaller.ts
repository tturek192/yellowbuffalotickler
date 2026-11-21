import { v } from '@wwi/scenario';
import type { Point, Scenario, Tables } from '@wwi/scenario';
import { barrageXAt } from './barrage';
import { emit } from './causes';
import type { NewEvent } from './causes';
import { byId } from './companies';
import type { CompanyState } from './companies';
import { lineXAt } from './geometry';
import { CELL_M, cellOf, churn, wetness } from './ground';
import { visibilityM } from './light';
import type { Scheduled } from './schedule';
import { sightFrom } from './sight';
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

/**
 * Counter-attacked, as the company sees it (Task 14 fix round): one of the enemies it sees and fires on, within
 * `reserveReleaseRangeM`, has come at it since it last looked (`prev`, the places it saw its targets at then): at least
 * `closingShareMin` of the ground that enemy covered was toward the company. An enemy it has not seen before, one standing
 * still, or one marching across its front or away does not count, whatever its orders.
 */
export function counterAttacked(
  f: CompanyState,
  targets: ReadonlyArray<{ t: CompanyState; r: number }>,
  prev: ReadonlyArray<readonly [string, number, number]> | undefined,
  ctx: StepContext,
): boolean {
  if (!prev || prev.length === 0) return false;
  const range = v(ctx.tables.effects.reserveReleaseRangeM);
  const share = v(ctx.tables.effects.closingShareMin);
  for (const { t, r } of targets) {
    if (r > range) continue;
    const p = prev.find((x) => x[0] === t.id);
    if (!p) continue;
    const dx = t.x - p[1];
    const dy = t.y - p[2];
    const moved = Math.hypot(dx, dy);
    const toX = f.x - p[1];
    const toY = f.y - p[2];
    const d0 = Math.hypot(toX, toY);
    if (!(moved > 0) || !(d0 > 0)) continue;
    if ((dx * toX + dy * toY) / d0 >= share * moved) return true;
  }
  return false;
}

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


// ---- batteries withdrawing --------------------------------------------------------------------------------------

const EPS_MIN = 1e-9;

/**
 * Horse-drawn batteries withdraw (the movement phase, after the trenches change hands; Task 14 fix round):
 * - a battery under way moves from its old place toward its new one at `batteryWithdrawMPerMin` once limbered up, and at
 *   `doneMin` stands in its new place, in action again;
 * - a battery with horses, in its place and not overrun, that sees enemy infantry up within `batteryWithdrawRangeM` (and
 *   within the light's visibility, in its line of sight) limbers up: out of action from now, it can be captured until
 *   `limberedMin` (`limberMin` later, trenches.ts `capturable`), then moves `batteryWithdrawM` toward its side's rear
 *   (x up for the side defending in x, down for the side attacking in it: away from the enemy's line of advance).
 * Batteries at one place go together, places in the order of their first battery; one `guns-withdrawn` event (cause
 * `enemy-near`) for each place.
 */
export function withdrawBatteries(state: SimState, ctx: StepContext): SimState {
  const minute = state.minute;
  const horsed = (b: BatteryState): boolean => b.horses && !b.captured && b.position !== undefined;
  if (!state.batteries.some(horsed)) return state;
  const fx = ctx.tables.effects;
  // 1. Batteries under way.
  let batteries = state.batteries.map((b): BatteryState => {
    const w = b.withdrawal;
    if (!w || b.captured) return b;
    if (minute >= w.doneMin - EPS_MIN) {
      const { withdrawal: _w, ...rest } = b;
      return { ...rest, position: w.to };
    }
    if (minute <= w.limberedMin) return b;
    const t = (minute - w.limberedMin) / (w.doneMin - w.limberedMin);
    return { ...b, position: [w.from[0] + (w.to[0] - w.from[0]) * t, w.from[1] + (w.to[1] - w.from[1]) * t] };
  });
  // 2. Batteries in place that see the enemy close.
  const idle = batteries.filter((b) => horsed(b) && b.withdrawal === undefined);
  if (idle.length === 0) return { ...state, batteries };
  const range = Math.min(v(fx.batteryWithdrawRangeM), visibilityM(ctx.scenario, ctx.tables, minute));
  if (!(range > 0)) return { ...state, batteries };
  const keyOf = (b: BatteryState): string => `${b.side}|${b.position![0]}|${b.position![1]}`;
  const keys: string[] = [];
  const first = new Map<string, BatteryState>(); // place key -> its first battery (looked up only)
  for (const b of idle) {
    const k = keyOf(b);
    if (!first.has(k)) (first.set(k, b), keys.push(k));
  }
  const up = state.companies.filter((c) => onField(c) && c.posture !== 'in-dugout');
  const going = new Map<string, { enemyM: number; eventId: number }>(); // place key -> why it goes (looked up only)
  const events: NewEvent[] = [];
  const dist = v(fx.batteryWithdrawM);
  const speed = v(fx.batteryWithdrawMPerMin);
  const limber = v(fx.limberMin);
  for (const k of keys) {
    const b = first.get(k)!;
    const p = b.position!;
    let nearest = Infinity;
    let sees: ((x: number, y: number) => boolean) | undefined;
    for (const c of up) {
      if (c.side === b.side) continue;
      const d = Math.hypot(c.x - p[0], c.y - p[1]);
      if (d > range || d >= nearest) continue;
      if ((sees ??= sightFrom(ctx.world, p))(c.x, c.y)) nearest = d;
    }
    if (!Number.isFinite(nearest)) continue;
    const at = idle.filter((x) => keyOf(x) === k);
    const ids = at.map((x) => x.id.split('/')[0]!).filter((x, i, xs) => xs.indexOf(x) === i);
    going.set(k, { enemyM: nearest, eventId: state.nextEventId + events.length });
    events.push({
      minute,
      kind: 'guns-withdrawn',
      text: `${at.reduce((a, x) => a + x.guns, 0)} guns (${ids.join(', ')}) limber up and withdraw: enemy infantry ${Math.round(nearest)} m off`,
      causes: ['enemy-near'],
      factors: { guns: at.reduce((a, x) => a + x.guns, 0), enemyM: round(nearest) },
    });
  }
  if (going.size === 0) return { ...state, batteries };
  // The side whose companies start farther along x defends toward +x: its rear is +x (central at Vimy).
  const rearSign = (side: BatteryState['side']): number => {
    const xs = (sd: BatteryState['side']) => state.companies.filter((c) => c.side === sd).map((c) => c.startX);
    const mean = (a: number[]) => (a.length ? a.reduce((t, x) => t + x, 0) / a.length : 0);
    return mean(xs(side)) >= mean(xs(side === 'allied' ? 'central' : 'allied')) ? 1 : -1;
  };
  batteries = batteries.map((b) => {
    if (!(horsed(b) && b.withdrawal === undefined)) return b;
    const g = going.get(keyOf(b));
    if (!g) return b;
    const p = b.position!;
    const limberedMin = minute + limber;
    return { ...b, withdrawal: { limberedMin, doneMin: limberedMin + (speed > 0 ? dist / speed : 0), from: p, to: [p[0] + rearSign(b.side) * dist, p[1]] as Point, eventId: g.eventId } };
  });
  return emit({ ...state, batteries }, ...events);
}

/** A withdrawal's minutes: limbered up and back in action (schedule.ts; they move nobody). */
export function batteryWithdrawals(state: SimState): Scheduled[] {
  return state.batteries.flatMap((b) => (b.withdrawal && !b.captured ? [{ minute: b.withdrawal.limberedMin, startsMovement: false }, { minute: b.withdrawal.doneMin, startsMovement: false }] : []));
}

// ---- mines ---------------------------------------------------------------------------------------------------

type Mine = NonNullable<Scenario['mines']>[number];
const minesOf = (ctx: StepContext): Mine[] => [...(ctx.scenario.mines ?? [])].sort((a, b) => v(a.firedAfterMin) - v(b.firedAfterMin) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/**
 * Mines blown (the artillery phase; Task 14 fix round), in order of their minute, then id, each once when its minute has
 * come: every enemy company on the field (down in its dugouts too) with men within the crater (`craterRadiusM`) loses
 * `stochasticRound(men × share × mineLossFrac)` men killed or buried (one draw from the `mines` stream for each such
 * company, in ascending id order), gathered as pending damage with those casualties fixed (`exact`), which `resolve`
 * applies with the step's other losses, so they shake morale as any loss does. `share`: for a garrison of a trench segment within the radius of its trench, the part
 * of the segment's y extent the crater covers; for any other company, all its men if it stands within the radius. The
 * crater is broken ground: its 50 m cells are churned (ground.ts) to twice the depth at which ground counts as cratered
 * (`crateredShare`), so it is cratered and slow going (numerical method, not a model number). `mine-fired`, cause `mine`.
 */
export function fireMines(state: SimState, ctx: StepContext, pending: Pending): SimState {
  const all = ctx.scenario.mines;
  if (!all || all.length === 0) return state;
  const due = minesOf(ctx).filter((m) => !state.minesFired.includes(m.id) && v(m.firedAfterMin) <= state.minute);
  if (due.length === 0) return state;
  const fx = ctx.tables.effects;
  const lossFrac = v(fx.mineLossFrac);
  const events: NewEvent[] = [];
  for (const m of due) {
    if (!Array.isArray(m.at)) throw new Error(`Mine ${m.id}: at was not projected to a local point`);
    const [mx, my] = m.at;
    const r = v(m.craterRadiusM);
    let lost = 0;
    let hit = 0;
    const eventId = state.nextEventId + events.length;
    const fire: FireGroup = { key: `mine:${m.id}`, kind: 'shelled', text: `Mine ${m.id}`, factors: {}, eventId };
    for (const c of state.companies) {
      if (c.side === m.side || !onField(c)) continue;
      const seg = c.segmentId === undefined ? undefined : state.segments.find((x) => x.id === c.segmentId);
      let share = 0;
      if (seg && Math.abs(c.x - mx) <= r) {
        const w = seg.yMax - seg.yMin;
        share = w > 0 ? Math.max(0, Math.min(seg.yMax, my + r) - Math.max(seg.yMin, my - r)) / w : Math.abs(c.y - my) <= r ? 1 : 0;
      } else if (!seg && Math.hypot(c.x - mx, c.y - my) <= r) share = 1;
      if (!(share > 0)) continue;
      hit++;
      const n = Math.min(c.men, stochasticRound(c.men * Math.min(1, share * lossFrac), ctx.rngs.mines));
      lost += n;
      // Applied by resolve with the step's other losses (so the morale phase feels them), exactly as drawn here.
      if (n > 0) pending.damage.push({ targetId: c.id, source: 'mine', hits: n, exact: n, rounds: 0, suppressPerRound: 0, causes: ['mine'], refs: [eventId], fire });
    }
    // The crater: its cells churned past the cratered threshold.
    const per = (2 * -Math.log(1 - Math.min(0.999, v(fx.crateredShare))) * CELL_M * CELL_M) / v(fx.churnAreaPerShellM2);
    const w = ctx.world;
    const cells = new Set<number>([cellOf(w, [mx, my])]);
    for (let x = mx - r; x <= mx + r + EPS; x += CELL_M / 2)
      for (let y = my - r; y <= my + r + EPS; y += CELL_M / 2) if (Math.hypot(x - mx, y - my) <= r) cells.add(cellOf(w, [x, y]));
    for (const k of [...cells].sort((a, b) => a - b)) churn(w, [w.originX + (k % w.cols) * CELL_M + CELL_M / 2, w.originY + Math.floor(k / w.cols) * CELL_M + CELL_M / 2], per);
    events.push({
      minute: v(m.firedAfterMin),
      kind: 'mine-fired',
      text: `Mine ${m.id} is blown: ${lost} men killed or buried`,
      causes: ['mine'],
      factors: { menLost: lost, companies: hit, craterRadiusM: r },
    });
  }
  return emit({ ...state, minesFired: [...state.minesFired, ...due.map((m) => m.id)] }, ...events);
}

/** The minutes the mines not yet blown are due (schedule.ts; they move nobody). */
export function mineTimes(state: SimState, ctx: StepContext): Scheduled[] {
  return minesOf(ctx).filter((m) => !state.minesFired.includes(m.id)).map((m) => ({ minute: v(m.firedAfterMin), startsMovement: false }));
}
