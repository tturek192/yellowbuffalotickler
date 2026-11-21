import { v } from '@wwi/scenario';
import type { Doctrine, Tables, Weapon } from '@wwi/scenario';
import { bucketsOf, within } from './buckets';
import type { Buckets } from './buckets';
import { emit } from './causes';
import type { Cause } from './causes';
import { byId, leadFactor } from './companies';
import type { CompanyState } from './companies';
import { groundAt } from './ground';
import { visibility, visibilityM } from './light';
import { round } from './record';
import { lineOfSight } from './sight';
import { onField } from './step';
import type { SimState, StepContext } from './step';
import type { FireGroup, Pending, Side } from './types';

/*
 * Direct fire (the model, "Fire"): rifles, light machine guns and machine guns, gathered as pending damage for
 * `resolve`. Each company that can fire (on the field, not down in its dugouts) engages the nearest enemy companies
 * it can see within its weapons' reach, at most `maxTargetsPerFirer` of them, splitting its fire evenly. For each
 * weapon w of the firer and target T at range r:
 *
 *   rounds = n_w · rpm_w · dt · share · (1 − F.suppression) · leadFactor(F) · ammo
 *   hits   = rounds · lethality_w · exp(−r / rangeScale_w) · [r ≤ maxRange_w]
 *            · cover[T.posture][ground at T] · min(1, T.men / densityRefMen) · visibility(r)
 *
 * Observation(F) is 1: a firer that sees its target lays its own fire on it, and how well it sees is the sight and
 * visibility terms. `ammo` is the share of this step's rounds the firer still has ammunition for. A target is in
 * sight when the line of sight between the two is clear (sight.ts) and it is nearer than the visibility; men down
 * in their dugouts cannot be seen. Firer-target pairs are found through a bucket grid (buckets.ts), never by
 * looking at every pair.
 *
 * Every number is data: the weapons, cover, the doctrine's companyWeapons and rounds carried, and the effects keys
 * maxTargetsPerFirer, densityRefMen, crewPerLewis, crewPerMg and mgUnobservedBelow.
 */

const SIDES: readonly Side[] = ['allied', 'central'];
const enemyOf = (s: Side): Side => (s === 'allied' ? 'central' : 'allied');

/** The weapons a company serves: machine guns first, then light machine guns, and the rest of its men are riflemen. */
export type Arms = { rifles: number; lightMgs: number; mgs: number };

/**
 * The weapons `men` men can serve, with `lewisGuns` light and `machineGuns` heavy machine guns: each machine gun takes
 * `crewPerMg` men and each light machine gun `crewPerLewis`, who fire no rifle (`men − crewPerLewis × lightMgs −
 * crewPerMg × mgs` riflemen); too few men serve fewer guns, in proportion.
 */
export function armsOf(men: number, lewisGuns: number, machineGuns: number, tables: Tables): Arms {
  const crewMg = v(tables.effects.crewPerMg);
  const crewLewis = v(tables.effects.crewPerLewis);
  const mgs = crewMg > 0 ? Math.min(machineGuns, men / crewMg) : machineGuns;
  const left = Math.max(0, men - mgs * crewMg);
  const lightMgs = crewLewis > 0 ? Math.min(lewisGuns, left / crewLewis) : lewisGuns;
  return { rifles: Math.max(0, left - lightMgs * crewLewis), lightMgs, mgs };
}

/** A company's men at Zero (after the bombardment's losses, which are in its totals too). */
const menAtStart = (c: CompanyState): number => c.men + c.killed + c.wounded + c.captured;

/**
 * Rounds a company carries into the battle, which its `ammo` (1 = full) is a share of: its weapons at full strength
 * times the doctrine's rounds carried per rifle, per light machine gun and per machine gun.
 */
export function ammoLoad(c: CompanyState, d: Doctrine, tables: Tables): number {
  const a = armsOf(menAtStart(c), c.lewisGuns, c.machineGuns, tables);
  const k = d.companyDefaults;
  return a.rifles * v(k.roundsPerRifle) + a.lightMgs * v(k.roundsPerLightMg) + a.mgs * v(k.roundsPerMg);
}

type Slot = { slot: 'rifle' | 'lightMg' | 'mg'; n: number; w: Weapon };

function slotsOf(c: CompanyState, d: Doctrine, tables: Tables): Slot[] {
  const a = armsOf(c.men, c.lewisGuns, c.machineGuns, tables);
  const all: Slot[] = [
    { slot: 'rifle', n: a.rifles, w: tables.weapons[d.companyWeapons.rifle]! },
    { slot: 'lightMg', n: a.lightMgs, w: tables.weapons[d.companyWeapons.lightMg]! },
    { slot: 'mg', n: a.mgs, w: tables.weapons[d.companyWeapons.mg]! },
  ];
  return all.filter((s) => s.n > 0);
}

/** Whether a company can fire this step: on the field, not down in its dugouts, with ammunition left. */
const canFire = (c: CompanyState): boolean => onField(c) && c.posture !== 'in-dugout' && c.ammo > 0;

/**
 * The directFire phase: gather every company's rifle and machine-gun fire into `pending` (in ascending firer id order,
 * each firer's targets nearest first), one fire group per target for `resolve`'s `direct-fire` event. The first time
 * a garrison's machine guns fire it emits `fire-opened` (cause `mg-fire`, and `mg-unobserved` when its segment was
 * spared by the bombardment or its trench is less than `mgUnobservedBelow` wrecked), which that fire refers to.
 */
export function directFire(state: SimState, ctx: StepContext, dt: number, pending: Pending): SimState {
  const fx = ctx.tables.effects;
  const visM = visibilityM(ctx.scenario, ctx.tables, state.minute);
  if (!(visM > 0) || !(dt > 0)) return state;
  const maxTargets = v(fx.maxTargetsPerFirer);
  const densityRef = v(fx.densityRefMen);
  const unobservedBelow = v(fx.mgUnobservedBelow);
  // Men down in their dugouts cannot be seen, so are no one's target.
  const seen = state.companies.filter((c) => onField(c) && c.posture !== 'in-dugout');
  const grid = Object.fromEntries(SIDES.map((s) => [s, bucketsOf(seen.filter((c) => c.side === s))])) as Record<Side, Buckets<CompanyState>>;
  const segs = new Map(state.segments.map((x) => [x.id, x]));

  // One fire group per target, in the order targets are first fired on; looked up by target id.
  type Group = FireGroup & { firers: string[]; minR: number; rounds: number };
  const groups: Group[] = [];
  const groupOf = new Map<string, Group>();
  const opened = new Map<string, number>(); // firer id -> its fire-opened event (looked up only)
  let out = state;

  for (const f of state.companies) {
    if (!canFire(f)) continue;
    const d = ctx.doctrines[f.doctrineId]!;
    const slots = slotsOf(f, d, ctx.tables);
    if (slots.length === 0) continue;
    const reach = Math.min(visM, Math.max(...slots.map((s) => v(s.w.maxRangeM))));
    const targets: Array<{ t: CompanyState; r: number }> = [];
    for (const { item: t, d: r } of within(grid[enemyOf(f.side)], f.x, f.y, reach, byId)) {
      if (targets.length >= maxTargets) break;
      if (visibility(r, visM) <= 0 || !lineOfSight(ctx.world, [f.x, f.y], [t.x, t.y])) continue;
      targets.push({ t, r });
    }
    if (targets.length === 0) continue;

    // Rounds each weapon would fire at each target at the firer's rate; then as many as its ammunition allows.
    const share = 1 / targets.length;
    const rate = (1 - f.suppression) * leadFactor(f, d) * share * dt;
    const plan = targets.map(({ t, r }) => ({ t, r, by: slots.map((s) => (r <= v(s.w.maxRangeM) ? s.n * v(s.w.rpm) * rate : 0)) }));
    const want = plan.reduce((a, p) => a + p.by.reduce((x, y) => x + y, 0), 0);
    const load = ammoLoad(f, d, ctx.tables);
    if (!(want > 0) || !(load > 0)) continue;
    const afford = Math.min(1, (f.ammo * load) / want);

    // A garrison's machine guns opening fire for the first time.
    const mgRounds = plan.reduce((a, p) => a + p.by.reduce((x, y, i) => x + (slots[i]!.slot === 'rifle' ? 0 : y), 0), 0);
    let openedRef: number[] = [];
    if (f.segmentId !== undefined && f.mgOpenedEventId === null && mgRounds > 0) {
      const seg = segs.get(f.segmentId);
      const unobserved = seg !== undefined && (seg.spared || seg.trenchDamage < unobservedBelow);
      const id = out.nextEventId;
      const nearest = plan[0]!;
      out = emit(out, {
        minute: state.minute,
        kind: 'fire-opened',
        unitId: f.id,
        segmentId: f.segmentId,
        text: `The machine guns of ${f.name} open fire on ${plan.map((p) => p.t.name).join(' and ')}, ${Math.round(nearest.r)} m off${unobserved ? ', from a stretch of trench the bombardment did not deal with' : ''}`,
        causes: unobserved ? ['mg-fire', 'mg-unobserved'] : ['mg-fire'],
        refs: seg && seg.barrageEventId !== null ? [seg.barrageEventId] : [],
        factors: {
          rangeM: round(nearest.r),
          machineGuns: round(slots.filter((s) => s.slot !== 'rifle').reduce((a, s) => a + s.n, 0), 2),
          ...(seg ? { trenchDamage: round(seg.trenchDamage, 3) } : {}),
        },
      });
      opened.set(f.id, id);
      openedRef = [id];
    }

    for (const { t, r, by } of plan) {
      const cover = v(ctx.tables.cover[t.posture][groundAt(ctx.world, [t.x, t.y])]);
      const density = Math.min(1, t.men / densityRef);
      const vis = visibility(r, visM);
      let hits = 0;
      let rounds = 0;
      let weighted = 0;
      const causes: Cause[] = [];
      slots.forEach((s, i) => {
        const n = by[i]! * afford;
        if (!(n > 0)) return;
        rounds += n;
        weighted += n * v(s.w.suppressPerRound);
        hits += n * v(s.w.lethality) * Math.exp(-r / v(s.w.rangeScaleM)) * cover * density * vis;
        const cause: Cause = s.slot === 'rifle' ? 'rifle-fire' : 'mg-fire';
        if (!causes.includes(cause)) causes.push(cause);
      });
      if (!(rounds > 0)) continue;
      let g = groupOf.get(t.id);
      if (!g) {
        g = { key: `direct:${t.id}`, kind: 'direct-fire', text: '', unitId: t.id, factors: {}, firers: [], minR: Infinity, rounds: 0 };
        if (t.sectorId) g.sectorId = t.sectorId;
        groups.push(g);
        groupOf.set(t.id, g);
      }
      if (!g.firers.includes(f.name)) g.firers.push(f.name);
      g.minR = Math.min(g.minR, r);
      g.rounds += rounds;
      pending.damage.push({
        targetId: t.id,
        source: 'direct-fire',
        firerId: f.id,
        hits,
        rounds,
        suppressPerRound: weighted / rounds,
        causes,
        refs: [...openedRef],
        fire: g,
        ammoUsed: rounds / load,
      });
    }
  }

  for (const g of groups) {
    const from = g.firers.length <= 3 ? g.firers.join(', ') : `${g.firers.length} companies`;
    g.text = `Fire from ${from}`;
    g.factors = { firers: g.firers.length, rangeM: round(g.minR), rounds: round(g.rounds), visibilityM: round(visM) };
  }
  if (opened.size === 0) return out;
  return { ...out, companies: out.companies.map((c) => (opened.has(c.id) ? { ...c, mgOpenedEventId: opened.get(c.id)! } : c)) };
}
