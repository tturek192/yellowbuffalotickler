import { v } from '@wwi/scenario';
import type { Formation, Scenario } from '@wwi/scenario';
import { bucketsOf, within } from './buckets';
import type { Buckets } from './buckets';
import { emit } from './causes';
import type { Cause, NewEvent } from './causes';
import { CAUSES } from './causes';
import { byId } from './companies';
import type { CompanyState, CompanyStatus } from './companies';
import { lineXAt } from './geometry';
import { round } from './record';
import { onField } from './step';
import type { SimState, StepContext } from './step';
import type { Intent, Pending, Side } from './types';

/*
 * Morale (the model, "Suppression and morale"). Every number is doctrine `common.*` data, the attack block's
 * `trainingBonusRehearsed`, the leaders' `moraleEffect` ratings, and the effects keys isolationRadiusM and fireRefsMin.
 */

const SIDES: readonly Side[] = ['allied', 'central'];
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
 * - a company with no men left standing is destroyed (`company-destroyed`);
 * - morale `m ← m − lossShock · casualties / men − suppressedDrain · s · dt/60 − isolationDrain · dt/60` (the last only
 *   when isolated: no other company of its side on the field within `isolationRadiusM` while an enemy is), recovering
 *   by `recoveryPerHour · dt/60`, up to its starting morale, when no fire came in this step;
 * - `m < surrender` with an enemy within `closeRangeM` (one that is not down in its dugouts): surrendered, every man
 *   standing captured (`company-surrendered`);
 * - an attacking company that has started: `m < fallBack` falls back (`company-fell-back`); one falling back whose
 *   morale is back at `fallBack` or above rallies where it has got to and holds (Task 10: it does not take up the attack
 *   again unless ordered); else `m < goToGround` or `s > pinSuppression` pins it (`company-pinned`, posture prone unless
 *   it is in a trench), else it goes on (advancing, or consolidating once at its objective). Holding and waiting
 *   companies change state only by surrendering.
 * Men down in their dugouts are left alone: no fire reaches them, and the gap and mopping up decide their fate.
 * Each state event carries the causes of the fire of the last `fireRefsMin` minutes, `suppressed`, `isolated`,
 * `officers-lost` and `morale-broke` as they apply, and refs to that fire's events (and to `officers-lost`).
 */
export function morale(state: SimState, ctx: StepContext, dt: number, pending: Pending): SimState {
  const fx = ctx.tables.effects;
  const isoR = v(fx.isolationRadiusM);
  const field = state.companies.filter(onField);
  const up = field.filter((c) => c.posture !== 'in-dugout');
  const friends = Object.fromEntries(SIDES.map((s) => [s, bucketsOf(field.filter((c) => c.side === s))])) as Record<Side, Buckets<CompanyState>>;
  const foes = Object.fromEntries(SIDES.map((s) => [s, bucketsOf(up.filter((c) => c.side === s))])) as Record<Side, Buckets<CompanyState>>;
  const events: NewEvent[] = [];

  const companies = state.companies.map((c): CompanyState => {
    if (c.status === 'surrendered' || c.status === 'destroyed' || c.status === 'off-map' || c.status === 'marching') return c;
    if (c.men <= 0) {
      // No men left: shot down (the recent fire says by what), taken in its dugouts, or lost in the bombardment.
      const extra: Cause[] = [];
      if (c.captured > 0 && c.segmentId !== undefined) extra.push('defenders-trapped');
      if (c.recentFire.length === 0 && c.bombardment.killed + c.bombardment.wounded > 0) extra.push('artillery-fire');
      events.push(stateEvent(c, 'destroyed', state.minute, { isolated: false, extra }));
      return { ...c, status: 'destroyed', intent: 'hold', officers: 0 };
    }
    if (c.posture === 'in-dugout') return c;
    const d = ctx.doctrines[c.doctrineId]!;
    const k = d.common;
    const a = pending.applied?.get(c.id);
    const enemies = within(foes[enemyOf(c.side)], c.x, c.y, Math.max(isoR, v(k.closeRangeM)), byId);
    const isolated = enemies.some((e) => e.d <= isoR) && !within(friends[c.side], c.x, c.y, isoR, byId).some((f) => f.item.id !== c.id);
    let m = c.morale;
    if (a && a.menBefore > 0) m -= (v(k.lossShock) * a.hit) / a.menBefore;
    m -= (v(k.suppressedDrain) * c.suppression * dt) / 60;
    if (isolated) m -= (v(k.isolationDrain) * dt) / 60;
    if (!a) m = Math.min(c.moraleStart, m + (v(k.recoveryPerHour) * dt) / 60);
    m = clamp01(m);
    const moved: CompanyState = m === c.morale ? c : { ...c, morale: m };

    const near = enemies.find((e) => e.d <= v(k.closeRangeM));
    if (m < v(k.surrender) && near) {
      events.push(stateEvent(moved, 'surrendered', state.minute, { isolated, extra: ['morale-broke'], to: near.item, toM: near.d }));
      return { ...moved, status: 'surrendered', intent: 'hold', men: 0, captured: c.captured + c.men, officers: 0 };
    }
    if (!FIGHTING.has(c.status)) return moved;

    const fall = m < v(k.fallBack);
    if (c.status === 'falling-back' && !fall)
      // A company that broke and fell back does not take up the attack again by itself (Task 10, now that falling back
      // moves it): once its morale is back above fallBack it rallies where it has got to, and holds until ordered on.
      return { ...moved, status: 'holding', intent: 'hold', posture: c.posture === 'moving' ? 'prone' : c.posture };
    const pin = !fall && (m < v(k.goToGround) || c.suppression > v(k.pinSuppression));
    if (fall || pin) {
      const status: CompanyStatus = fall ? 'falling-back' : 'pinned';
      const intent: Intent = fall ? 'fall-back' : 'go-to-ground';
      // Pinned men go to ground; falling back keeps the posture it has (Task 10 moves it back).
      const posture = pin && c.posture === 'moving' ? 'prone' : c.posture;
      if (c.status !== status)
        events.push(stateEvent(moved, status, state.minute, { isolated, extra: [...(fall ? (['morale-broke'] as const) : []), ...(c.suppression > v(k.pinSuppression) ? (['suppressed'] as const) : [])] }));
      return c.status === status && c.intent === intent && c.posture === posture ? moved : { ...moved, status, intent, posture };
    }
    if (c.status === 'pinned') {
      // It goes on: back to its trench if it is at its objective, else on toward it.
      const line = ctx.scenario.lines.find((l) => l.id === c.objectiveLineId);
      const at = line !== undefined && lineXAt(line.points, c.y) - c.x <= 1;
      return { ...moved, status: at ? 'consolidating' : 'advancing', intent: at ? 'hold' : 'advance', posture: at ? 'in-trench' : 'moving' };
    }
    return moved;
  });
  return emit({ ...state, companies }, ...events);
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
