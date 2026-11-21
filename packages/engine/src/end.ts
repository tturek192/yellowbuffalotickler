import { v } from '@wwi/scenario';
import { distanceTo } from './artillery';
import { emit } from './causes';
import { commandPending } from './command';
import { isHolding } from './companies';
import type { CompanyState } from './companies';
import { featurePoints, pointRadiusM } from './segments';
import type { EndReason } from './record';
import { reservesUnderWay } from './reserves';
import { SCHEDULES } from './schedule';
import { onField } from './step';
import type { SimState, StepContext } from './step';
import type { Side } from './types';

/*
 * How a run ends and who wins (the model, "Run end and winner"; spec 12). A run ends at the first of:
 * 1. objectives-held: the attacker holds every final objective line (each sector's last leg's line is in `taken`: taken,
 *    and not lost again), no counter-attack is ordered or under way, the command model has nothing in hand
 *    (`commandPending`: no order on its way, no stall to act on, no operation ready but for its hour), no reserve is on its
 *    way, and nothing is due within `end.lullMin` (`lullDue`: no men in dug-outs due to come up, no wave due to start, no
 *    off-map fire or attack due) — the plan has run and nobody is coming to take the lines back;
 * 2. lull: nothing is fighting (no fire came in on anyone this step), nothing is moving toward an objective (every company
 *    holding, consolidating, out of the fight, or off the map unordered; no barrage still to run), the command model has
 *    nothing in hand and no reserve is on its way, and nothing is due within `end.lullMin` (`lullDue`): a run waiting for
 *    an authored operation's hour is never in a lull. This folds in the run end of Tasks 12–13 ("finished").
 * 3. time-cap: the run's last minute (`timeLimitMinutes`, or the run's `endMinute`).
 * The winner is the side holding the most of `end.keyGround` at the end (`holderOf`), none on a tie or with no key ground.
 */

/** Statuses of a company that has nothing more to do in the attack (consolidating, out of the fight, or off the map). */
const DONE: ReadonlySet<string> = new Set(['consolidating', 'surrendered', 'destroyed', 'off-map']);

/**
 * The lull to wait for: `end.lullMin`, or with no `end` section the run's time limit (listed in defaultsUsed), so that
 * only a run with nothing left to happen before its time cap ends in a lull.
 */
export function lullMin(ctx: StepContext): number {
  if (ctx.scenario.end) return v(ctx.scenario.end.lullMin);
  ctx.defaultsUsed.add(`end.lullMin ← timeLimitMinutes, ${ctx.scenario.timeLimitMinutes} (no end section)`);
  return ctx.scenario.timeLimitMinutes;
}

/**
 * Sources of scheduled minutes that change nothing a lull is about: reports on their way (an order is the command model's,
 * `commandPending`), fire on call stopping, batteries running out and barrage phases (a barrage still to run is
 * movement toward an objective).
 */
const NOT_DUE: ReadonlySet<string> = new Set(['messages', 'fire-missions', 'ammunition-runs-out', 'barrage-phases']);

/** Whether something is due within `withinMin` minutes: any other scheduled minute (schedule.ts) after now and up to then. */
export function lullDue(state: SimState, ctx: StepContext, withinMin: number): boolean {
  for (const [name, source] of SCHEDULES) {
    if (NOT_DUE.has(name)) continue;
    for (const s of source(state, ctx)) if (s.minute > state.minute && s.minute <= state.minute + withinMin) return true;
  }
  return false;
}

/** Whether some fire came in on a company this step. */
const fighting = (state: SimState): boolean => state.companies.some((c) => c.recentFire.some((f) => f.minute === state.minute));

/** A counter-attack ordered or under way: companies on it or holding an order for one, an order for one in transit, a planned one. */
function counterAttackUnderWay(state: SimState): boolean {
  if (state.companies.some((c) => onField(c) && (c.status === 'counter-attacking' || (c.posture !== 'in-dugout' && c.orders.some((o) => o.kind === 'counter-attack'))))) return true;
  if (state.messages.some((m) => m.kind === 'order' && (m.payload as { kind?: string }).kind === 'counter-attack')) return true;
  return state.hqs.some((h) => h.pending.length > 0);
}

/** Each sector's final objective line, as `lineId|sectorId`: where its barrage's last leg goes. */
export const finalLines = (ctx: StepContext): string[] => ctx.scenario.sectors.map((s) => `${s.legs[s.legs.length - 1]!.toLineId}|${s.id}`);

/** Whether the run ends after this step, and why; emits nothing (`endRun` does). */
export function endCheck(state: SimState, ctx: StepContext, o: { endMinute?: number; stopEarly?: boolean } = {}): { ended: boolean; reason?: EndReason } {
  const cap = o.endMinute ?? ctx.scenario.timeLimitMinutes;
  const early = o.stopEarly ?? true;
  if (early) {
    const finals = finalLines(ctx);
    const settled = () => !counterAttackUnderWay(state) && !commandPending(state, ctx) && !reservesUnderWay(state, ctx) && !lullDue(state, ctx, lullMin(ctx));
    if (finals.length > 0 && finals.every((k) => state.taken.includes(k)) && settled()) return { ended: true, reason: 'objectives-held' };
    const still =
      state.barrages.every((b) => b.phase === 'done') &&
      state.companies.every((c) => isHolding(c) || DONE.has(c.status)) &&
      !fighting(state) &&
      !reservesUnderWay(state, ctx) &&
      !commandPending(state, ctx);
    if (still && !lullDue(state, ctx, lullMin(ctx))) return { ended: true, reason: 'lull' };
  }
  if (state.minute >= cap) return { ended: true, reason: 'time-cap' };
  return { ended: false };
}

/** The side holding a piece of key ground (`end.keyGround`): of its trench segments, the side holding the greater length (the
 * defender on a tie); with none, the side with more men up within `captureRadiusM` of it; with nobody there, the feature's
 * own side, else none. */
export function holderOf(state: SimState, ctx: StepContext, featureId: string): Side | null {
  const segs = state.segments.filter((x) => x.featureId === featureId);
  if (segs.length > 0) {
    const len = { allied: 0, central: 0 } as Record<Side, number>;
    // A point strongpoint's segments have no length: each counts as one.
    for (const x of segs) len[x.holder] += x.lengthM > 0 ? x.lengthM : 1;
    if (len.allied === len.central) return segs[0]!.garrisonSide;
    return len.allied > len.central ? 'allied' : 'central';
  }
  const f = ctx.scenario.features.find((x) => x.id === featureId);
  if (!f) return null;
  const r = v(ctx.tables.effects.captureRadiusM) + (f.geometry.type === 'Point' ? pointRadiusM(f, ctx.tables) : 0);
  const pts = featurePoints(f);
  const men = { allied: 0, central: 0 } as Record<Side, number>;
  const near = (c: CompanyState) => onField(c) && c.posture !== 'in-dugout' && distanceTo(pts, [c.x, c.y]) <= r;
  for (const c of state.companies) if (near(c)) men[c.side] += c.men;
  if (men.allied !== men.central) return men.allied > men.central ? 'allied' : 'central';
  return f.side ?? null;
}

/** The key ground at the end, and the side holding the most of it (none on a tie, or with no key ground; listed in defaultsUsed). */
export function winnerOf(state: SimState, ctx: StepContext): { winner: Side | null; keyGround: Array<{ id: string; name: string; holder: Side | null }> } {
  const ground = ctx.scenario.end?.keyGround ?? [];
  if (ground.length === 0) ctx.defaultsUsed.add('end.keyGround ← none: no winner is named');
  const keyGround = ground.map((k) => ({ id: k.id, name: k.name, holder: holderOf(state, ctx, k.featureId) }));
  const n = { allied: keyGround.filter((k) => k.holder === 'allied').length, central: keyGround.filter((k) => k.holder === 'central').length };
  return { winner: n.allied === n.central ? null : n.allied > n.central ? 'allied' : 'central', keyGround };
}

/** The `run-ended` event: the reason (cause `timetable` for the cap, else none), the winner and the key ground held, in factors. */
export function endRun(state: SimState, ctx: StepContext, reason: EndReason): SimState {
  const { winner, keyGround } = winnerOf(state, ctx);
  const held = (side: Side) => keyGround.filter((k) => k.holder === side).length;
  return emit(state, {
    minute: state.minute,
    kind: 'run-ended',
    text: `The run ends (${reason === 'objectives-held' ? 'the attacker holds its final objectives' : reason === 'lull' ? 'a lull: nothing more is to happen' : 'the time cap'})${winner ? `; ${winner === 'allied' ? 'the Allies hold' : 'the Germans hold'} the key ground` : ''}`,
    causes: [],
    factors: { [`reason:${reason}`]: 1, keyGroundAllied: held('allied'), keyGroundCentral: held('central'), keyGround: keyGround.length },
  });
}
