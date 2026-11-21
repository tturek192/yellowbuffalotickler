import { v } from '@wwi/scenario';
import type { Formation, Scenario } from '@wwi/scenario';

/*
 * Leaders (the model, "Command"): each headquarters' decisions are adjusted by its leader's ratings, 1 to 5, with 3 the
 * midpoint. Each factor multiplies a doctrine value; the ratings and the doctrine values are data.
 */

/** A leader's five ratings, unwrapped. */
export type Ratings = { planning: number; orderSpeed: number; adaptiveness: number; riskTolerance: number; moraleEffect: number };

/** The midpoint ratings: a formation with no leader, or a leader without ratings, counts as these. */
export const MIDPOINT: Readonly<Ratings> = { planning: 3, orderSpeed: 3, adaptiveness: 3, riskTolerance: 3, moraleEffect: 3 };

type Index = { formationLeader: Map<string, string>; leaders: Map<string, Scenario['leaders'][number]> };
const indexes = new WeakMap<Scenario, Index>();

function indexOf(s: Scenario): Index {
  const hit = indexes.get(s);
  if (hit) return hit;
  const formationLeader = new Map<string, string>();
  const visit = (f: Formation): void => {
    if (f.leaderId !== undefined) formationLeader.set(f.id, f.leaderId);
    for (const ch of f.children ?? []) visit(ch);
  };
  for (const force of s.forces) for (const f of force.formations) visit(f);
  const out = { formationLeader, leaders: new Map(s.leaders.map((l) => [l.id, l])) };
  indexes.set(s, out);
  return out;
}

/** A leader's ratings by id, or null when the leader is unknown or has none (each noted in `defaultsUsed`). */
function ratingsOf(s: Scenario, leaderId: string, defaultsUsed?: Set<string>): Ratings | null {
  const leader = indexOf(s).leaders.get(leaderId);
  if (!leader?.ratings) {
    defaultsUsed?.add(`leaders[${leaderId}].ratings ← 3 (${leader ? 'no ratings given' : 'no such leader'})`);
    return null;
  }
  const r = leader.ratings;
  return { planning: v(r.planning), orderSpeed: v(r.orderSpeed), adaptiveness: v(r.adaptiveness), riskTolerance: v(r.riskTolerance), moraleEffect: v(r.moraleEffect) };
}

/**
 * The ratings of a formation's leader, the one whose headquarters decides: its own leader's, or all 3s where it has no
 * leader or its leader has no ratings (noted in `defaultsUsed`).
 */
export function leaderOf(s: Scenario, formationId: string, defaultsUsed?: Set<string>): Ratings {
  const leaderId = indexOf(s).formationLeader.get(formationId);
  if (leaderId === undefined) {
    defaultsUsed?.add(`formations[${formationId}] leader ← none (ratings 3)`);
    return MIDPOINT;
  }
  return ratingsOf(s, leaderId, defaultsUsed) ?? MIDPOINT;
}

/**
 * The ratings that lead a company: its battalion's leader's, or the nearest leader's up its formation path (as its
 * starting morale, morale.ts `moraleEffectOf`); all 3s where there is none, or that leader has no ratings (noted).
 */
export function companyLeaderOf(s: Scenario, formationPath: readonly string[], defaultsUsed?: Set<string>): Ratings {
  const { formationLeader } = indexOf(s);
  for (const id of formationPath) {
    const leaderId = formationLeader.get(id);
    if (leaderId !== undefined) return ratingsOf(s, leaderId, defaultsUsed) ?? MIDPOINT;
  }
  defaultsUsed?.add(`formations[${formationPath[0]}] leader ← none up its chain (ratings 3)`);
  return MIDPOINT;
}

/** `(6 − orderSpeed) / 3`: how long the leader's headquarters takes over a delay (1 at the midpoint; ⅓ fastest, 5⁄3 slowest). */
export const delayFactor = (r: Ratings): number => (6 - r.orderSpeed) / 3;

/** `(6 − adaptiveness) / 3`: scales `stallToleranceMin`, how long the leader waits before changing the plan. */
export const adaptFactor = (r: Ratings): number => (6 - r.adaptiveness) / 3;

/** `minAttackRatio · (6 − riskTolerance) / 3`: the force ratio the leader accepts for an attack. */
export const riskRatio = (minAttackRatio: number, r: Ratings): number => (minAttackRatio * (6 - r.riskTolerance)) / 3;

/** `startJitterMin · (6 − planning) / 3`: how far a company's start may stray from its timetable minute. */
export const timetableJitter = (startJitterMin: number, r: Ratings): number => (startJitterMin * (6 - r.planning)) / 3;
