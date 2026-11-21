import { describe, expect, it } from 'vitest';
import { est } from '@wwi/scenario/test-fixtures';
import { leadFactor, moveCompanies } from './companies';
import { directFire } from './fire';
import { resolve } from './resolve';
import { initRun, runScenario } from './run';
import { fixtureBomb, fixtureFire, ofKind } from './test-helpers';
import type { Pending } from './types';

/** c1's speed in metres a minute over one 2-minute step once its officers are down, with the barrage far ahead. */
function speedAfterOfficersLost(training: 'rehearsed' | 'standard'): number {
  const f = fixtureFire();
  for (const c of f[0].forces[0]!.formations[0]!.companies!) c.training = training;
  const { state, ctx } = initRun(f[0], f[1], { seed: 1 });
  const c1 = { ...state.companies.find((c) => c.id === 'c1')!, officers: 0, startMin: 0 };
  const moved = moveCompanies([c1], () => 1e6, ctx.scenario.lines, ctx.doctrines, 10, 2).companies[0]!;
  return (moved.x - c1.x) / 2;
}

describe('officers', () => {
  it('a rehearsed company loses less speed than a standard one when its officers fall', () => {
    expect(speedAfterOfficersLost('rehearsed')).toBeGreaterThan(speedAfterOfficersLost('standard'));
  });

  it('with no officers, speed and fire are multiplied by 1 − ncoPenalty[training]', () => {
    const { state, ctx } = initRun(...fixtureFire(), { seed: 1 });
    const d = ctx.doctrines['bef-1917']!;
    const c1 = state.companies.find((c) => c.id === 'c1')!;
    expect(leadFactor(c1, d)).toBe(1);
    expect(leadFactor({ ...c1, officers: 0, training: 'standard' }, d)).toBeCloseTo(0.7, 12);
    expect(leadFactor({ ...c1, officers: 0, training: 'rehearsed' }, d)).toBeCloseTo(0.9, 12);
    // Fire: the garrison k1 with and without officers.
    const up = { ...state, minute: 10, companies: state.companies.map((c) => (c.side === 'central' ? { ...c, posture: 'in-trench' as const } : c)) };
    const rounds = (officers: number): number => {
      const pending: Pending = { damage: [] };
      directFire({ ...up, companies: up.companies.map((c) => (c.id === 'k1' ? { ...c, officers } : c)) }, ctx, 2, pending);
      return pending.damage.filter((p) => p.firerId === 'k1').reduce((a, p) => a + p.rounds, 0);
    };
    expect(rounds(0) / rounds(1)).toBeCloseTo(0.7, 9); // the garrisons are untrained: standard
  });

  it('officers fall with the casualties; officers-lost when the last one falls, referring to the fire that did it', () => {
    const f = fixtureFire({ mgs: 4 });
    for (const c of f[0].forces[0]!.formations[0]!.companies!) c.officers = est(3);
    let events = 0;
    for (const seed of [1, 2, 3, 4, 5]) {
      const r = runScenario(f[0], f[1], { seed, endMinute: 40 });
      const ev = ofKind(r, 'officers-lost').filter((e) => e.unitId === 'c1' || e.unitId === 'c2');
      events += ev.length;
      for (const e of ev) {
        expect(e.causes).toEqual(['officers-lost']);
        expect(e.refs.length).toBeGreaterThan(0);
        for (const ref of e.refs) expect(r.events[ref]!.kind).toBe('direct-fire');
      }
    }
    expect(events).toBeGreaterThan(0);
  });

  it('resolve never takes more officers than men or than the company has', () => {
    const { state, ctx } = initRun(...fixtureFire({ mgs: 40 }), { seed: 2 });
    let s = { ...state, minute: 10, companies: state.companies.map((c) => (c.side === 'central' ? { ...c, posture: 'in-trench' as const } : { ...c, x: -100, officers: 5 })) };
    for (let i = 0; i < 20; i++) {
      const pending: Pending = { damage: [] };
      s = resolve(directFire(s, ctx, 2, pending), ctx, 2, pending);
      for (const c of s.companies) {
        expect(c.officers).toBeGreaterThanOrEqual(0);
        expect(c.officers).toBeLessThanOrEqual(c.men);
      }
    }
    expect(s.companies.find((c) => c.id === 'c1')!.officers).toBeLessThan(5);
  });

  it('officers are lost in the preliminary bombardment by the same rule, before Zero', () => {
    let lost = 0;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const f = fixtureBomb({ trenchRounds: 4000, heavyRounds: 200, depth: 0 });
      for (const c of f[0].forces[1]!.formations[0]!.companies!) c.officers = est(3);
      const { state } = initRun(f[0], f[1], { seed });
      for (const c of state.companies.filter((x) => x.side === 'central')) lost += 3 - c.officers;
      for (const e of state.events.filter((x) => x.kind === 'officers-lost')) {
        expect(e.minute).toBe(0);
        expect(state.events[e.refs[0]!]!.kind).toBe('bombardment-result');
      }
    }
    expect(lost).toBeGreaterThan(0);
  });

  it("garrisons sharing a segment take bombardment losses at their own dugouts' depth", () => {
    let shallow = 0;
    let deep = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const f = fixtureBomb({ trenchRounds: 4000 });
      const [k1, k2] = f[0].forces[1]!.formations[0]!.companies!;
      Object.assign(k1!, { start: [150, 200], dugoutDepthM: est(0) });
      Object.assign(k2!, { start: [150, 200], dugoutDepthM: est(15) });
      const { state } = initRun(f[0], f[1], { seed });
      expect(state.segments).toHaveLength(1);
      shallow += state.companies.find((c) => c.id === 'k1')!.bombardment.killed + state.companies.find((c) => c.id === 'k1')!.bombardment.wounded;
      deep += state.companies.find((c) => c.id === 'k2')!.bombardment.killed + state.companies.find((c) => c.id === 'k2')!.bombardment.wounded;
    }
    expect(shallow).toBeGreaterThan(2 * deep);
  });
});
