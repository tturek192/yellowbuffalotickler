import { v } from '@wwi/scenario';
import type { Formation, Scenario } from '@wwi/scenario';
import { anyWithin, changedNear, changesSince, nearestWithin, sideBuckets, tracker } from './buckets';
import type { Tracker } from './buckets';
import type { Buckets } from './buckets';
import { emit } from './causes';
import type { Cause, NewEvent } from './causes';
import { CAUSES } from './causes';
import { byId } from './companies';
import type { CompanyState, CompanyStatus } from './companies';
import { lineXAt } from './geometry';
import { counterAttackOrder, marchOrder } from './movement';
import { round } from './record';
import type { Scheduled } from './schedule';
import { onField } from './step';
import type { SimState, StepContext } from './step';
import type { Intent, Pending, Side } from './types';

/*
 * Morale (the model, "Suppression and morale"). Every number is doctrine `common.*` data, the attack block's
 * `trainingBonusRehearsed`, the leaders' `moraleEffect` ratings, and the effects keys isolationRadiusM and fireRefsMin.
 */

/** On the field and up (not down in its dugouts). */
const isUp = (c: CompanyState): boolean => onField(c) && c.posture !== 'in-dugout';
const enemyOf = (s: Side): Side => (s === 'allied' ? 'central' : 'allied');
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

// ---- morale at the start ------------------------------------------------------------------------------------

type Leader = Scenario['leaders'][number];
type Leadership = { formationLeader: Map<string, string>; leaders: Map<string, Leader> };
const leadershipCache = new WeakMap<Scenario, Leadership>();

function leadershipOf(s: Scenario): Leadership {
  const hit = leadershipCache.get(s);
  if (hit) return hit;
  const formationLeader = new Map<string, string>();
  const visit = (f: Formation): void => {
    if (f.leaderId !== undefined) formationLeader.set(f.id, f.leaderId);
    for (const ch of f.children ?? []) visit(ch);
  };
  for (const force of s.forces) for (const f of force.formations) visit(f);
  const out = { formationLeader, leaders: new Map(s.leaders.map((l) => [l.id, l])) };
  leadershipCache.set(s, out);
  return out;
}

/**
 * The `moraleEffect` rating that sets a company's starting morale: its battalion's leader's, or the nearest leader's
 * up its formation path. A formation with no leader up its chain, or a leader without ratings, counts as 3 (listed in
 * `defaultsUsed`).
 */
export function moraleEffectOf(c: Pick<CompanyState, 'formationPath' | 'battalionId'>, s: Scenario, defaultsUsed: Set<string>): number {
  const { formationLeader, leaders } = leadershipOf(s);
  for (const id of c.formationPath) {
    const leaderId = formationLeader.get(id);
    if (leaderId === undefined) continue;
    const leader = leaders.get(leaderId);
    if (leader?.ratings) return v(leader.ratings.moraleEffect);
    defaultsUsed.add(`leaders[${leaderId}].ratings.moraleEffect ← 3 (${leader ? 'no ratings given' : 'no such leader'})`);
    return 3;
  }
  defaultsUsed.add(`formations[${c.battalionId}] leader ← none up its chain (moraleEffect 3)`);
  return 3;
}

/**
 * Morale at the start (the model): `baseMorale + leaderMoraleStep · (moraleEffect − 3) + trainingBonus`, held to 0–1;
 * the training bonus is the doctrine's `attack.trainingBonusRehearsed` for a rehearsed company, else 0.
 */
export function startingMorale(c: CompanyState, ctx: Pick<StepContext, 'scenario' | 'doctrines' | 'defaultsUsed'>): number {
  const d = ctx.doctrines[c.doctrineId]!;
  const effect = moraleEffectOf(c, ctx.scenario, ctx.defaultsUsed);
  let bonus = 0;
  if (c.training === 'rehearsed') {
    if (d.attack) bonus = v(d.attack.trainingBonusRehearsed);
    else ctx.defaultsUsed.add(`${d.id}.attack.trainingBonusRehearsed ← 0 (the doctrine has no attack block)`);
  }
  return clamp01(v(d.common.baseMorale) + v(d.common.leaderMoraleStep) * (effect - 3) + bonus);
}

/** Every company with its starting morale (morale and moraleStart). */
export function withStartingMorale(companies: CompanyState[], ctx: Pick<StepContext, 'scenario' | 'doctrines' | 'defaultsUsed'>): CompanyState[] {
  return companies.map((c) => {
    const m = startingMorale(c, ctx);
    return { ...c, morale: m, moraleStart: m };
  });
}

// ---- the morale phase ---------------------------------------------------------------------------------------

/** Attacking companies that have started, whose state morale changes (holding and waiting ones only surrender). */
const FIGHTING: ReadonlySet<CompanyStatus> = new Set<CompanyStatus>(['advancing', 'consolidating', 'pinned', 'falling-back', 'counter-attacking']);

const STATE_EVENT = { pinned: 'company-pinned', 'falling-back': 'company-fell-back', surrendered: 'company-surrendered', destroyed: 'company-destroyed' } as const;

/**
 * The morale phase, company by company in ascending id order, after `resolve`:
 * - a company with no men left standing is destroyed (`company-destroyed`), or, taken prisoner to the last man (trapped
 *   or its dugouts cleared out, with no fire on it since), surrendered (`company-surrendered`, cause `defenders-trapped`);
 * - morale `m ← m − lossShock · casualties / men − suppressedDrain · s · dt/60 − isolationDrain · dt/60` (the last only
 *   when isolated: no other company of its side on the field within `isolationRadiusM` while an enemy is), recovering
 *   by `recoveryPerHour · dt/60`, up to its starting morale, when no fire came in this step;
 * - `m < surrender` with an enemy within `closeRangeM` (one that is not down in its dugouts): surrendered, every man
 *   standing captured (`company-surrendered`);
 * - an attacking company that has started: `m < fallBack` falls back (`company-fell-back`); one falling back whose
 *   morale is back at `fallBack` or above rallies where it has got to and holds (`company-rallied`, ref to its
 *   `company-fell-back`; Task 10: it does not take up the attack again unless ordered, and its orders lapse); else
 *   `m < goToGround` or `s > pinSuppression` pins it (`company-pinned`, posture prone unless it is in a trench), else it
 *   goes on (counter-attacking again if it holds a counter-attack order, Task 12; advancing, or consolidating once at its
 *   objective). Holding and waiting companies change state only by surrendering.
 * Men down in their dugouts are left alone: no fire reaches them, and the gap and mopping up decide their fate.
 * Each state event carries the causes of the fire of the last `fireRefsMin` minutes, `suppressed`, `isolated`,
 * `officers-lost` and `morale-broke` as they apply, and refs to that fire's events (and to `officers-lost`).
 */
export function morale(state: SimState, ctx: StepContext, dt: number, pending: Pending): SimState {
  const fx = ctx.tables.effects;
  const isoR = v(fx.isolationRadiusM);
  // Each side's companies in buckets; those on the field (`onField`) and those up (`isUp`) are kept as the search goes.
  const gridOf = (s: Side): Buckets<CompanyState> => sideBuckets(state.companies, s);
  const events: NewEvent[] = [];
  // Isolation is worked out again only where something moved within isolationRadiusM (`isolationMemo`).
  let memo = isolationMemos.get(ctx);
  if (!memo) isolationMemos.set(ctx, (memo = { field: tracker(), up: tracker(), byAt: [] }));
  const fieldMoved = changesSince(memo.field, state.companies, onField, (c) => c.side);
  const upMoved = changesSince(memo.up, state.companies, isUp, (c) => c.side);
  const was = memo.field.fresh || memo.up.fresh ? [] : memo.byAt;
  const isolation: IsolationMemo['byAt'] = [];
  const isolatedNow = (c: CompanyState, i: number): boolean => {
    const last = was[i];
    if (last && last.x === c.x && last.y === c.y && !changedNear(fieldMoved, c.side, c.x, c.y, isoR) && !changedNear(upMoved, enemyOf(c.side), c.x, c.y, isoR)) {
      isolation[i] = last;
      return last.isolated;
    }
    const r = anyWithin(gridOf(enemyOf(c.side)), c.x, c.y, isoR, isUp) && !anyWithin(gridOf(c.side), c.x, c.y, isoR, (f) => onField(f) && f.id !== c.id);
    isolation[i] = { x: c.x, y: c.y, isolated: r };
    return r;
  };

  const companies = state.companies.map((c, i): CompanyState => {
    if (c.status === 'surrendered' || c.status === 'destroyed' || c.status === 'off-map' || c.status === 'marching') return c;
    if (c.men <= 0) {
      // No men left. Taken prisoner to the last man (trapped, its dugouts cleared out, no fire on it since): surrendered.
      const taken = c.takenPrisoner;
      if (taken && c.captured > 0 && c.recentFire.every((f) => f.minute <= taken.minute)) {
        events.push(takenEvent(c, state, taken.eventId));
        return { ...c, status: 'surrendered', intent: 'hold', officers: 0 };
      }
      // Else shot down (the recent fire says by what), the last of it taken below after fire, or lost in the bombardment.
      const extra: Cause[] = [];
      if (c.captured > 0 && c.segmentId !== undefined) extra.push('defenders-trapped');
      if (c.recentFire.length === 0 && c.captured === 0 && c.bombardment.killed + c.bombardment.wounded > 0) extra.push('artillery-fire');
      events.push(stateEvent(c, 'destroyed', state.minute, { isolated: false, extra }));
      return { ...c, status: 'destroyed', intent: 'hold', officers: 0 };
    }
    if (c.posture === 'in-dugout') return c;
    const d = ctx.doctrines[c.doctrineId]!;
    const k = d.common;
    const a = pending.applied?.get(c.id);
    const isolated = isolatedNow(c, i);
    let m = c.morale;
    if (a && a.menBefore > 0) m -= (v(k.lossShock) * a.hit) / a.menBefore;
    m -= (v(k.suppressedDrain) * c.suppression * dt) / 60;
    if (isolated) m -= (v(k.isolationDrain) * dt) / 60;
    if (!a) m = Math.min(c.moraleStart, m + (v(k.recoveryPerHour) * dt) / 60);
    m = clamp01(m);
    const moved: CompanyState = m === c.morale ? c : { ...c, morale: m };

    // The nearest enemy within closeRangeM (ties by id), looked for only when morale is low enough to surrender.
    const near = m < v(k.surrender) ? nearestWithin(gridOf(enemyOf(c.side)), c.x, c.y, v(k.closeRangeM), byId, isUp) : undefined;
    if (near) {
      events.push(stateEvent(moved, 'surrendered', state.minute, { isolated, extra: ['morale-broke'], to: near.item, toM: near.d }));
      return { ...moved, status: 'surrendered', intent: 'hold', men: 0, captured: c.captured + c.men, officers: 0 };
    }
    if (!FIGHTING.has(c.status)) return moved;

    const fall = m < v(k.fallBack);
    if (c.status === 'falling-back' && !fall) {
      // A company that broke and fell back does not take up the attack again by itself (Task 10, now that falling back
      // moves it): once its morale is back above fallBack it rallies where it has got to, and holds until ordered on.
      events.push({
        minute: state.minute,
        kind: 'company-rallied',
        unitId: c.id,
        ...(c.sectorId ? { sectorId: c.sectorId } : {}),
        text: `${c.name} rallies (morale ${round(m, 2)}) and holds where it is`,
        causes: ['morale-recovered'],
        refs: c.fellBackEventId === null ? [] : [c.fellBackEventId],
        factors: { morale: round(m, 3), men: c.men },
      });
      // Its orders lapse with its attack: going forward again is a new decision of its headquarters (Task 12).
      return { ...moved, status: 'holding', intent: 'hold', posture: c.posture === 'moving' ? 'prone' : c.posture, orders: [] };
    }
    const pin = !fall && (m < v(k.goToGround) || c.suppression > v(k.pinSuppression));
    if (fall || pin) {
      const status: CompanyStatus = fall ? 'falling-back' : 'pinned';
      const intent: Intent = fall ? 'fall-back' : 'go-to-ground';
      // Pinned men go to ground; falling back keeps the posture it has (Task 10 moves it back).
      const posture = pin && c.posture === 'moving' ? 'prone' : c.posture;
      const fellBack = fall && c.status !== status ? { fellBackEventId: state.nextEventId + events.length } : {};
      if (c.status !== status)
        events.push(stateEvent(moved, status, state.minute, { isolated, extra: [...(fall ? (['morale-broke'] as const) : []), ...(c.suppression > v(k.pinSuppression) ? (['suppressed'] as const) : [])] }));
      return c.status === status && c.intent === intent && c.posture === posture ? moved : { ...moved, status, intent, posture, ...fellBack };
    }
    if (c.status === 'pinned') {
      // It goes on: a company pinned on its way to counter-attack takes it up again (Task 12, the Task 9 carry); else back
      // to its trench if it is at its objective, else on toward it.
      if (counterAttackOrder(c)) return { ...moved, status: 'counter-attacking', intent: 'counter-attack', posture: 'moving' };
      // So does an arrived reserve pinned on its way to its front (Task 13).
      if (marchOrder(c)) return { ...moved, status: 'advancing', intent: 'march', posture: 'moving' };
      const line = ctx.scenario.lines.find((l) => l.id === c.objectiveLineId);
      const at = line !== undefined && lineXAt(line.points, c.y) - c.x <= 1;
      return { ...moved, status: at ? 'consolidating' : 'advancing', intent: at ? 'hold' : 'advance', posture: at ? 'in-trench' : 'moving' };
    }
    return moved;
  });
  memo.byAt = isolation;
  return emit({ ...state, companies }, ...events);
}

/**
 * The minutes companies' morale is due to fall through a threshold it changes state at (Task 15, so a quiet step ends
 * where fine steps would see it, and a run is not taken for a lull while one is due): `surrender` for any company up on
 * the field, and `fallBack` and `goToGround` for an attacking one that has started. Morale falls between fires by
 * `isolationDrain` (while isolated, as the morale phase last found it; isolated when that is not known) and
 * `suppressedDrain · suppression`, and recovers by `recoveryPerHour` (up to its starting morale). Suppression only decays
 * (`suppressionHalfLifeMin`), so the minute worked out at its present value is never late (an early guess only shortens a
 * quiet step), and while isolation does not outrun recovery, suppression can take only so much more: a threshold beyond
 * that is never reached. A fall starts movement (falling back) or changes what a company does, so the step that sees it
 * is a fine one.
 */
export function moraleThresholds(state: SimState, ctx: StepContext): Scheduled[] {
  const memo = isolationMemos.get(ctx);
  const known = memo !== undefined && !memo.field.fresh && !memo.up.fresh && memo.field.ids.length === state.companies.length;
  const out: Scheduled[] = [];
  state.companies.forEach((c, i) => {
    if (!onField(c) || c.posture === 'in-dugout') return;
    const k = ctx.doctrines[c.doctrineId]!.common;
    const last = known ? memo.byAt[i] : undefined;
    const isolated = last === undefined || last.x !== c.x || last.y !== c.y || last.isolated;
    // Per minute between fires: isolation's drain less the recovery (which follows any drain, up to the starting morale),
    // and suppression's drain, which decays with suppression: from now on it can take at most supTotal in all.
    const linear = ((isolated ? v(k.isolationDrain) : 0) - v(k.recoveryPerHour)) / 60;
    const sup = (v(k.suppressedDrain) * c.suppression) / 60;
    const supTotal = (sup * v(ctx.tables.effects.suppressionHalfLifeMin)) / Math.LN2;
    const fall = linear + sup;
    if (!(fall > 0)) return;
    const at = [v(k.surrender), ...(FIGHTING.has(c.status) ? [v(k.fallBack), v(k.goToGround)] : [])];
    for (const thr of at) {
      if (c.morale < thr) continue;
      // Not falling for good, and too far above the threshold for what suppression can still take: never reached.
      if (linear <= 0 && c.morale - thr > supTotal) continue;
      out.push({ minute: state.minute + (c.morale - thr) / fall, startsMovement: true });
    }
  });
  return out;
}

/**
 * Each company's isolation when last worked out, and where the companies on the field and those up stood then (a
 * numerical shortcut, not a model rule: answers never depend on it). Isolation is the same while the company stands where
 * it stood and no company of its side on the field, nor enemy up, has come, gone or moved within isolationRadiusM.
 */
type IsolationMemo = { field: Tracker; up: Tracker; byAt: Array<{ x: number; y: number; isolated: boolean } | undefined> };
const isolationMemos = new WeakMap<StepContext, IsolationMemo>();

/**
 * A garrison taken prisoner to the last man (`company-surrendered`): cause `defenders-trapped`, refs to its segment's
 * trapping and to the event that took its last men (its dugouts cleared out). Its men were counted captured by those
 * events, so this one adds none (`men` 0).
 */
function takenEvent(c: CompanyState, state: SimState, lastEventId: number): NewEvent {
  const seg = c.segmentId === undefined ? undefined : state.segments.find((x) => x.id === c.segmentId);
  const refs = [...(seg?.trappedEventId != null ? [seg.trappedEventId] : []), lastEventId];
  return {
    minute: state.minute,
    kind: 'company-surrendered',
    unitId: c.id,
    ...(c.sectorId ? { sectorId: c.sectorId } : {}),
    ...(c.segmentId ? { segmentId: c.segmentId } : {}),
    text: `${c.name} is taken prisoner to the last man: ${c.captured} men captured`,
    causes: ['defenders-trapped'],
    refs: refs.filter((x, i) => refs.indexOf(x) === i).sort((a, b) => a - b),
    factors: { morale: round(c.morale, 3), suppression: round(c.suppression, 3), men: 0, captured: c.captured, lostInBattle: c.killed + c.wounded - c.bombardment.killed - c.bombardment.wounded, officers: c.officers },
  };
}

/** A morale event: the causes of the recent fire on the company and of its state, with refs to that fire. */
function stateEvent(
  c: CompanyState,
  status: keyof typeof STATE_EVENT,
  minute: number,
  o: { isolated: boolean; extra: Cause[]; to?: CompanyState; toM?: number },
): NewEvent {
  const causes: Cause[] = [...c.recentFire.flatMap((x) => x.causes), ...o.extra];
  if (o.isolated) causes.push('isolated');
  if (c.officers === 0) causes.push('officers-lost');
  const refs = c.recentFire.flatMap((x) => (x.eventId === null ? [] : [x.eventId]));
  if (c.officers === 0 && c.officersLostEventId !== null) refs.push(c.officersLostEventId);
  const lost = c.killed + c.wounded - c.bombardment.killed - c.bombardment.wounded;
  const text =
    status === 'surrendered'
      ? `${c.name} surrenders to ${o.to!.name}, ${Math.round(o.toM!)} m off: ${c.men} men taken prisoner`
      : status === 'destroyed'
        ? `${c.name} is destroyed: no men left standing`
        : status === 'pinned'
          ? `${c.name} is pinned down (morale ${round(c.morale, 2)}, suppression ${round(c.suppression, 2)})`
          : `${c.name} falls back (morale ${round(c.morale, 2)})`;
  return {
    minute,
    kind: STATE_EVENT[status],
    unitId: c.id,
    ...(c.sectorId ? { sectorId: c.sectorId } : {}),
    text,
    causes: CAUSES.filter((x) => causes.includes(x)),
    refs: refs.filter((x, i) => refs.indexOf(x) === i).sort((a, b) => a - b),
    factors: {
      morale: round(c.morale, 3),
      suppression: round(c.suppression, 3),
      men: c.men,
      lostInBattle: lost,
      officers: c.officers,
      ...(o.toM !== undefined ? { enemyM: round(o.toM) } : {}),
    },
  };
}
