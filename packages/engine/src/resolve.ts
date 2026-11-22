import { v } from '@wwi/scenario';
import { emit } from './causes';
import type { Cause, NewEvent } from './causes';
import { CAUSES } from './causes';
import type { CompanyState } from './companies';
import { stochasticRound } from './stochastic';
import type { SimState, StepContext } from './step';
import type { Applied, FireGroup, Pending, PendingDamage, Side } from './types';

/**
 * The resolve phase, the one place damage is applied (the model, "Fire", "Suppression" and "Officers"), all at once:
 * - companies in ascending id order, each one's pending damage in the order it was gathered: casualties
 *   `stochasticRound(min(hits, men left))`, split into killed and wounded by `killedFrac`, and of them officers
 *   `stochasticRound(casualties × min(1, officerExposure × officers / men))` (three draws for each pending entry,
 *   whatever its values, so the draw order depends only on what was gathered; a mine's entries carry their casualties
 *   already drawn, `exact`, and draw nothing here);
 * - suppression `s ← min(1, s + Σ suppressPerRound · rounds / max(men, 1))`, then for every company
 *   `s ← s · 2^(−dt / suppressionHalfLifeMin)`;
 * - each firer's ammunition goes down by the share of its load it fired (`ammunition-exhausted` when it runs out);
 * - one event for each fire: `shelled` for every artillery fire that reached anyone, `direct-fire` for rifle and
 *   machine-gun fire that hit at least one man; each names the men it hit;
 * - `officers-lost` when a company's last officer falls (cause `officers-lost`, refs to the fire that did it);
 * - every company remembers the fire of the last `fireRefsMin` minutes (`recentFire`), for its morale events, and
 *   `pending.applied` tells the morale phase whom fire came in on and how many men it hit.
 */
export function resolve(state: SimState, ctx: StepContext, dt: number, pending: Pending): SimState {
  const fx = ctx.tables.effects;
  const killedFrac = v(fx.killedFrac);
  const exposure = v(fx.officerExposure);
  const decay = 2 ** (-dt / v(fx.suppressionHalfLifeMin));
  const since = state.minute - v(fx.fireRefsMin);
  const byTarget = new Map<string, PendingDamage[]>();
  const usedBy = new Map<string, number>();
  for (const p of pending.damage) {
    byTarget.set(p.targetId, [...(byTarget.get(p.targetId) ?? []), p]);
    if (p.firerId !== undefined && p.ammoUsed !== undefined) usedBy.set(p.firerId, (usedBy.get(p.firerId) ?? 0) + p.ammoUsed);
  }

  // Arrays, in the order the fires were gathered, so nothing depends on Map or Set iteration order.
  type Tally = {
    fire: FireGroup;
    causes: Cause[];
    refs: number[];
    targets: Array<{ id: string; name: string }>;
    hit: number;
    killed: number;
    wounded: number;
    /** The same, by the side of the company hit (Task 18 fix round: playback reads the sides from the event). */
    bySide: Partial<Record<Side, { killed: number; wounded: number }>>;
  };
  const tallies: Tally[] = [];
  for (const p of pending.damage)
    if (p.fire && !tallies.some((t) => t.fire.key === p.fire!.key)) tallies.push({ fire: p.fire, causes: [], refs: [], targets: [], hit: 0, killed: 0, wounded: 0, bySide: {} });

  // 1. Damage, company by company.
  type Done = { men: number; killed: number; wounded: number; officers: number; gain: number; hit: number; keys: Array<{ key: string; causes: Cause[] }> };
  const done = state.companies.map((c): Done | null => {
    const ps = byTarget.get(c.id);
    if (!ps) return null;
    const r: Done = { men: c.men, killed: 0, wounded: 0, officers: c.officers, gain: 0, hit: 0, keys: [] };
    for (const p of ps) {
      // A mine's casualties come already drawn (`exact`): all killed or buried, officers only as men are left.
      const exact = p.exact !== undefined;
      const n = exact ? Math.min(r.men, p.exact!) : Math.min(r.men, stochasticRound(Math.min(p.hits, r.men), ctx.rngs.casualties));
      const k = exact ? n : Math.min(n, stochasticRound(n * killedFrac, ctx.rngs.casualties));
      const share = Math.min(1, (exposure * r.officers) / Math.max(r.men, 1));
      const o = exact ? Math.max(0, r.officers - (r.men - n)) : Math.min(r.officers, n, stochasticRound(Math.min(r.officers, n * share), ctx.rngs.casualties));
      r.men -= n;
      // Officers are among the men: never more of them than men standing.
      r.officers = Math.min(r.officers - o, r.men);
      r.killed += k;
      r.wounded += n - k;
      r.hit += n;
      r.gain += (p.suppressPerRound * p.rounds) / Math.max(c.men, 1);
      const key = p.fire?.key ?? `${p.source}:${p.firerId ?? ''}`;
      const seen = r.keys.find((x) => x.key === key);
      if (seen) {
        for (const x of p.causes) if (!seen.causes.includes(x)) seen.causes.push(x);
      } else r.keys.push({ key, causes: [...p.causes] });
      const t = p.fire && tallies.find((x) => x.fire.key === p.fire!.key);
      if (t) {
        for (const x of p.causes) if (!t.causes.includes(x)) t.causes.push(x);
        for (const x of p.refs) if (!t.refs.includes(x)) t.refs.push(x);
        if (!t.targets.some((x) => x.id === c.id)) t.targets.push({ id: c.id, name: c.name });
        t.hit += n;
        t.killed += k;
        t.wounded += n - k;
        const side = (t.bySide[c.side] ??= { killed: 0, wounded: 0 });
        side.killed += k;
        side.wounded += n - k;
      }
    }
    return r;
  });

  // 2. One event for each fire: artillery always, direct fire only when it hit someone.
  // A fire an event already reports (a mine's, Task 14 fix round 2) gets none here; its companies refer to that one.
  const reported = tallies.filter((t) => t.fire.eventId === undefined && (t.fire.kind !== 'direct-fire' || t.hit > 0));
  const eventOf = new Map<string, number>(); // fire key -> event id (looked up only)
  reported.forEach((t, i) => eventOf.set(t.fire.key, state.nextEventId + i));
  for (const t of tallies) if (t.fire.eventId !== undefined) eventOf.set(t.fire.key, t.fire.eventId);
  const fireEvents: NewEvent[] = reported.map((t) => {
    const unitId = t.fire.unitId ?? (t.targets.length === 1 ? t.targets[0]!.id : undefined);
    const on = t.targets.length <= 3 ? t.targets.map((x) => x.name).join(', ') : `${t.targets.length} companies`;
    return {
      minute: state.minute,
      kind: t.fire.kind ?? 'shelled',
      ...(t.fire.sectorId !== undefined ? { sectorId: t.fire.sectorId } : {}),
      ...(unitId !== undefined ? { unitId } : {}),
      text: `${t.fire.text} on ${on}: ${t.hit} men hit (${t.killed} killed, ${t.wounded} wounded)`,
      causes: CAUSES.filter((x) => t.causes.includes(x)),
      refs: [...t.refs].sort((a, b) => a - b),
      factors: { ...t.fire.factors, targets: t.targets.length, hit: t.hit, killed: t.killed, wounded: t.wounded },
      // Sides in a fixed order, never the order the targets came in.
      losses: Object.fromEntries((['allied', 'central'] as const).flatMap((s) => (t.bySide[s] ? [[s, t.bySide[s]]] : []))),
    };
  });
  let out = emit(state, ...fireEvents);

  // 3. The companies, with their officer and ammunition events after the fire events, in ascending id order.
  const applied = new Map<string, Applied>();
  const later: NewEvent[] = [];
  const nextId = (): number => out.nextEventId + later.length;
  const companies = state.companies.map((c, i): CompanyState => {
    const r = done[i];
    const used = usedBy.get(c.id) ?? 0;
    const ammo = used > 0 ? Math.max(0, c.ammo - used) : c.ammo;
    // Fire is noted in minute order, so nothing has gone stale while the oldest is still recent.
    const recent = c.recentFire.length === 0 || c.recentFire[0]!.minute > since ? c.recentFire : c.recentFire.filter((x) => x.minute > since);
    let next: CompanyState = ammo === c.ammo && recent.length === c.recentFire.length ? c : { ...c, ammo, recentFire: recent };
    if (c.ammo > 0 && ammo <= 0) {
      later.push({ minute: state.minute, kind: 'ammunition-exhausted', unitId: c.id, ...(c.sectorId ? { sectorId: c.sectorId } : {}), text: `${c.name} has fired its last rounds`, causes: ['ammunition-low'] });
    }
    if (!r) {
      const s = next.suppression * decay;
      return s === next.suppression ? next : { ...next, suppression: s };
    }
    applied.set(c.id, { menBefore: c.men, hit: r.hit });
    const fireRefs = r.keys.flatMap((x) => (eventOf.has(x.key) ? [eventOf.get(x.key)!] : []));
    next = {
      ...next,
      men: r.men,
      killed: c.killed + r.killed,
      wounded: c.wounded + r.wounded,
      officers: r.officers,
      suppression: Math.min(1, c.suppression + r.gain) * decay,
      recentFire: [...recent, ...r.keys.map((x) => ({ minute: state.minute, eventId: eventOf.get(x.key) ?? null, causes: CAUSES.filter((y) => x.causes.includes(y)) }))],
    };
    if (c.officers > 0 && r.officers === 0) {
      next = { ...next, officersLostEventId: nextId() };
      later.push({
        minute: state.minute,
        kind: 'officers-lost',
        unitId: c.id,
        ...(c.sectorId ? { sectorId: c.sectorId } : {}),
        text: `${c.name} has lost the last of its officers: its NCOs lead it now`,
        causes: ['officers-lost'],
        refs: fireRefs.filter((x, j) => fireRefs.indexOf(x) === j).sort((a, b) => a - b),
        factors: { officersLost: c.officers, men: r.men },
      });
    }
    return next;
  });
  pending.applied = applied;
  out = emit({ ...out, companies }, ...later);
  return out;
}
