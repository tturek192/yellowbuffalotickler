import { describe, expect, it } from 'vitest';
import { est } from '@wwi/scenario/test-fixtures';
import { bucketsOf, within } from './buckets';
import { byId } from './companies';
import { armsOf, directFire } from './fire';
import { resolve } from './resolve';
import { createRng } from './rng';
import { initRun, runScenario } from './run';
import type { SimState, StepContext } from './step';
import { attackerLosses, fixtureFire, median, ofKind, snapshotsOf } from './test-helpers';
import type { FireOpts } from './test-helpers';
import type { Pending } from './types';

/** The fire fixture at Zero with its garrisons up in their trench and c1 placed at x with a posture; c2 out of the way. */
function standoff(o: FireOpts & { posture?: 'moving' | 'prone' | 'in-trench'; x?: number } = {}): { state: SimState; ctx: StepContext } {
  const { state, ctx } = initRun(...fixtureFire(o), { seed: 1 });
  const companies = state.companies.map((c) => {
    if (c.side === 'central') return { ...c, posture: 'in-trench' as const };
    if (c.id === 'c1') return { ...c, x: o.x ?? -200, posture: o.posture ?? 'moving' };
    return { ...c, x: -5000 };
  });
  return { state: { ...state, minute: 10, companies }, ctx };
}

/** Expected men hit on c1 by one 2-minute step of the garrisons' fire. */
function lossesByPosture(posture: 'moving' | 'prone' | 'in-trench'): number {
  const { state, ctx } = standoff({ posture });
  const pending: Pending = { damage: [] };
  directFire(state, ctx, 2, pending);
  return pending.damage.filter((p) => p.targetId === 'c1').reduce((a, p) => a + p.hits, 0);
}

describe('direct fire', () => {
  it('more machine guns in the garrison cause more attacker casualties (median over 50 seeds)', () => {
    expect(median(attackerLosses({ mgs: 4 }))).toBeGreaterThan(median(attackerLosses({ mgs: 1 })));
  });

  it('targets out of sight or beyond range take no direct fire', () => {
    expect(attackerLosses({ ridgeBetween: true, seeds: [1] })[0]).toBe(0);
    // The same attackers, waiting in the open with no ridge between, are shot at.
    expect(attackerLosses({ lagMin: 100, seeds: [1] })[0]).toBeGreaterThan(0);
    // Beyond every weapon's 1,000 m: nothing.
    expect(attackerLosses({ startX: -1000, lagMin: 100, seeds: [1] })[0]).toBe(0);
  });

  it('prone and entrenched targets lose fewer men than men moving in the open', () => {
    expect(lossesByPosture('in-trench')).toBeLessThan(lossesByPosture('moving'));
    expect(lossesByPosture('prone')).toBeLessThan(lossesByPosture('moving'));
    expect(lossesByPosture('in-trench')).toBeGreaterThan(0);
  });

  it('weapons are the riflemen (men − crewPerLewis × light MGs − crewPerMg × MGs), the light MGs and the MGs, by doctrine companyWeapons', () => {
    const { tables } = fixtureFire()[1];
    expect(armsOf(120, 1, 1.5, tables)).toEqual({ rifles: 120 - 2 - 6, lightMgs: 1, mgs: 1.5 });
    // Too few men serve fewer guns, the machine guns first.
    expect(armsOf(5, 1, 2, tables)).toEqual({ rifles: 0, lightMgs: 0, mgs: 1.25 });
    expect(armsOf(7, 1, 1, tables)).toEqual({ rifles: 1, lightMgs: 1, mgs: 1 });
    // The German doctrine's light MG is whatever weapon its companyWeapons names: a slower one fires fewer rounds.
    const roundsWith = (rpm: number): number => {
      const f = fixtureFire({ mgs: 0 });
      const de = f[1].doctrines['de-1917']!;
      f[1].tables.weapons['mgx'] = { ...f[1].tables.weapons['lewis']!, rpm: { value: rpm, estimate: 'test', description: 'test' } };
      de.companyWeapons = { ...de.companyWeapons, lightMg: 'mgx' };
      for (const c of f[0].forces[1]!.formations[0]!.companies!) c.lewisGuns = est(1);
      const { state, ctx } = initRun(f[0], f[1], { seed: 1 });
      const s = { ...state, minute: 10, companies: state.companies.map((c) => (c.side === 'central' ? { ...c, posture: 'in-trench' as const } : c)) };
      const pending: Pending = { damage: [] };
      directFire(s, ctx, 2, pending);
      return pending.damage.filter((p) => p.firerId === 'k1').reduce((a, p) => a + p.rounds, 0);
    };
    expect(roundsWith(100) - roundsWith(50)).toBeCloseTo(50 * 2, 6);
  });

  it('a firer splits its fire over at most maxTargetsPerFirer targets, nearest first', () => {
    const { state, ctx } = standoff();
    const s = { ...state, companies: state.companies.map((c) => (c.id === 'c2' ? { ...c, x: -300 } : c)) };
    const pending: Pending = { damage: [] };
    directFire(s, { ...ctx, tables: { ...ctx.tables, effects: { ...ctx.tables.effects, maxTargetsPerFirer: { value: 1, estimate: 't', description: 't' } } } }, 2, pending);
    expect(pending.damage.filter((p) => p.firerId === 'k1').map((p) => p.targetId)).toEqual(['c1']);
    const two: Pending = { damage: [] };
    directFire(s, ctx, 2, two);
    expect(two.damage.filter((p) => p.firerId === 'k1').map((p) => p.targetId)).toEqual(['c1', 'c2']);
  });

  it('the bucket grid finds exactly the units a look at every pair finds, in the same order', () => {
    const rng = createRng(11);
    const pts = Array.from({ length: 400 }, (_, i) => ({ id: `u${String(i).padStart(3, '0')}`, x: rng() * 6000 - 3000, y: rng() * 4000 - 2000 }));
    const b = bucketsOf(pts);
    for (const r of [0, 40, 260, 900, 4000]) {
      const q = pts[17]!;
      const brute = pts
        .map((p) => ({ item: p, d: Math.hypot(p.x - q.x, p.y - q.y) }))
        .filter((x) => x.d <= r)
        .sort((a, c) => a.d - c.d || byId(a.item, c.item));
      expect(within(b, q.x, q.y, r, byId).map((x) => x.item.id)).toEqual(brute.map((x) => x.item.id));
    }
  });

  it("a garrison's machine guns opening fire emit fire-opened once, with mg-unobserved for an undamaged stretch", () => {
    const f = fixtureFire({ mgs: 2 });
    const r = runScenario(f[0], f[1], { seed: 1, endMinute: 40 });
    const opened = ofKind(r, 'fire-opened');
    expect(opened.map((e) => e.unitId).sort()).toEqual(['k1', 'k2']);
    // No bombardment touched the trench: its posts were never dealt with.
    for (const e of opened) expect(e.causes).toEqual(['mg-fire', 'mg-unobserved']);
    // The fire that follows refers to it.
    const refd = new Set(r.events.filter((e) => e.kind === 'direct-fire').flatMap((e) => e.refs));
    for (const e of opened) expect(refd.has(e.id)).toBe(true);
  });

  it('fire-opened leaves out mg-unobserved where the trench is wrecked', () => {
    const { state, ctx } = standoff();
    const wrecked = { ...state, segments: state.segments.map((x) => ({ ...x, trenchDamage: 0.5, spared: false })) };
    const out = directFire(wrecked, ctx, 2, { damage: [] });
    const opened = out.events.filter((e) => e.kind === 'fire-opened');
    expect(opened.length).toBeGreaterThan(0);
    for (const e of opened) expect(e.causes).toEqual(['mg-fire']);
  });

  it('ammunition goes down by the rounds fired, and a company with none left does not fire', () => {
    const { state, ctx } = standoff();
    const pending: Pending = { damage: [] };
    const after = resolve(directFire(state, ctx, 2, pending), ctx, 2, pending);
    const used = pending.damage.filter((p) => p.firerId === 'k1').reduce((a, p) => a + p.ammoUsed!, 0);
    expect(used).toBeGreaterThan(0);
    expect(after.companies.find((c) => c.id === 'k1')!.ammo).toBeCloseTo(1 - used, 12);
    const dry = { ...state, companies: state.companies.map((c) => (c.id === 'k1' ? { ...c, ammo: 0 } : c)) };
    const none: Pending = { damage: [] };
    directFire(dry, ctx, 2, none);
    expect(none.damage.filter((p) => p.firerId === 'k1')).toHaveLength(0);
  });

  it('resolve reports direct fire that hit someone as a direct-fire event with its causes, and keeps men conserved', () => {
    const f = fixtureFire({ mgs: 4 });
    const r = runScenario(f[0], f[1], { seed: 3, endMinute: 40 });
    const fire = ofKind(r, 'direct-fire');
    expect(fire.length).toBeGreaterThan(0);
    for (const e of fire) {
      expect(e.factors!.hit).toBeGreaterThan(0);
      expect(e.causes.some((c) => c === 'mg-fire' || c === 'rifle-fire')).toBe(true);
    }
    const last = snapshotsOf(r).at(-1)!.companies;
    const col = (n: string) => last.columns.indexOf(n as never);
    for (const row of last.rows) {
      const total = (row[col('men')] as number) + (row[col('killed')] as number) + (row[col('wounded')] as number) + (row[col('captured')] as number);
      const first = snapshotsOf(r)[0]!.companies.rows.find((x) => x[0] === row[0])!;
      expect(total).toBe((first[col('men')] as number) + (first[col('killed')] as number) + (first[col('wounded')] as number) + (first[col('captured')] as number));
    }
  });
});
