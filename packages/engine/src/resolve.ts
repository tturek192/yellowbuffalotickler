import { v } from '@wwi/scenario';
import { emit } from './causes';
import type { Cause, NewEvent } from './causes';
import { CAUSES } from './causes';
import type { CompanyState } from './companies';
import { stochasticRound } from './stochastic';
import type { SimState, StepContext } from './step';
import type { FireGroup, Pending, PendingDamage } from './types';

/**
 * The resolve phase, the one place damage is applied (the model, "Fire" and "Suppression"). Task 8 holds its
 * minimal form, which Task 9 extends (officer losses, ammunition, `officers-lost`):
 * - companies in ascending id order, each one's pending damage in the order it was gathered: casualties
 *   `stochasticRound(min(hits, men left))`, split into killed and wounded by `killedFrac` (two draws for each
 *   pending entry, whatever its values, so the draw order depends only on what was gathered);
 * - suppression `s ← min(1, s + Σ suppressPerRound · rounds / max(men, 1))`, then for every company
 *   `s ← s · 2^(−dt / suppressionHalfLifeMin)`;
 * - one `shelled` event for each fire that hit anyone this step, with the men it hit and its factors.
 */
export function resolve(state: SimState, ctx: StepContext, dt: number, pending: Pending): SimState {
  const fx = ctx.tables.effects;
  const killedFrac = v(fx.killedFrac);
  const decay = 2 ** (-dt / v(fx.suppressionHalfLifeMin));
  const byTarget = new Map<string, PendingDamage[]>();
  for (const p of pending.damage) byTarget.set(p.targetId, [...(byTarget.get(p.targetId) ?? []), p]);

  // Arrays, in the order the fires were gathered, so nothing depends on Map or Set iteration order.
  type Tally = { fire: FireGroup; causes: Cause[]; refs: number[]; targets: Array<{ id: string; name: string }>; hit: number; killed: number; wounded: number };
  const tallies: Tally[] = [];
  for (const p of pending.damage)
    if (p.fire && !tallies.some((t) => t.fire.key === p.fire!.key)) tallies.push({ fire: p.fire, causes: [], refs: [], targets: [], hit: 0, killed: 0, wounded: 0 });

  const companies = state.companies.map((c): CompanyState => {
    const ps = byTarget.get(c.id);
    if (!ps) {
      const s = c.suppression * decay;
      return s === c.suppression ? c : { ...c, suppression: s };
    }
    let men = c.men;
    let killed = 0;
    let wounded = 0;
    let gain = 0;
    for (const p of ps) {
      const n = Math.min(men, stochasticRound(Math.min(p.hits, men), ctx.rng));
      const k = Math.min(n, stochasticRound(n * killedFrac, ctx.rng));
      men -= n;
      killed += k;
      wounded += n - k;
      gain += (p.suppressPerRound * p.rounds) / Math.max(c.men, 1);
      const t = p.fire && tallies.find((x) => x.fire.key === p.fire!.key);
      if (t) {
        for (const x of p.causes) if (!t.causes.includes(x)) t.causes.push(x);
        for (const r of p.refs) if (!t.refs.includes(r)) t.refs.push(r);
        if (!t.targets.some((x) => x.id === c.id)) t.targets.push({ id: c.id, name: c.name });
        t.hit += n;
        t.killed += k;
        t.wounded += n - k;
      }
    }
    return { ...c, men, killed: c.killed + killed, wounded: c.wounded + wounded, suppression: Math.min(1, c.suppression + gain) * decay };
  });

  const events: NewEvent[] = tallies.map((t) => {
    const unitId = t.fire.unitId ?? (t.targets.length === 1 ? t.targets[0]!.id : undefined);
    const on = t.targets.length <= 3 ? t.targets.map((x) => x.name).join(', ') : `${t.targets.length} companies`;
    return {
      minute: state.minute,
      kind: 'shelled',
      ...(t.fire.sectorId !== undefined ? { sectorId: t.fire.sectorId } : {}),
      ...(unitId !== undefined ? { unitId } : {}),
      text: `${t.fire.text} on ${on}: ${t.hit} men hit (${t.killed} killed, ${t.wounded} wounded)`,
      causes: CAUSES.filter((x) => t.causes.includes(x)),
      refs: [...t.refs].sort((a, b) => a - b),
      factors: { ...t.fire.factors, targets: t.targets.length, hit: t.hit, killed: t.killed, wounded: t.wounded },
    };
  });
  return emit({ ...state, companies }, ...events);
}
