import { describe, expect, it } from 'vitest';
import { est } from '@wwi/scenario/test-fixtures';
import type { Scenario } from '@wwi/scenario';
import { CAUSES } from './causes';
import { runPipeline } from './pipeline';
import type { SimState, StepContext } from './step';
import { initRun } from './run';
import { morale } from './morale';
import { eventsOf, fixtureDugouts, fixtureFire, ofKind, runCrush, runDugouts, totalsOverTime } from './test-helpers';

const runStep = (s: SimState, ctx: StepContext): SimState => runPipeline(s, ctx, 2);
const ratings = (moraleEffect: number) => ({ planning: est(3), orderSpeed: est(3), adaptiveness: est(3), riskTolerance: est(3), moraleEffect: est(moraleEffect) });

/** c1's starting morale with the battalion's leader rated `moraleEffect` (and the company's training). */
function startMorale(o: { moraleEffect?: number; training?: 'rehearsed' | 'standard'; edit?: (s: Scenario) => void } = {}): number {
  const [s, m] = fixtureFire();
  if (o.moraleEffect !== undefined) s.leaders[0]!.ratings = ratings(o.moraleEffect);
  if (o.training) for (const c of s.forces[0]!.formations[0]!.companies!) c.training = o.training;
  o.edit?.(s);
  return initRun(s, m, { seed: 1 }).state.companies.find((c) => c.id === 'c1')!.morale;
}

describe('morale', () => {
  it('heavy losses pin a company; further losses make it fall back; a broken garrison at close range surrenders', () => {
    const kinds = eventsOf(runCrush()).map((e) => e.kind);
    expect(kinds).toEqual(expect.arrayContaining(['company-pinned', 'company-fell-back', 'company-surrendered']));
  });

  it('a better moraleEffect rating gives higher starting morale', () => {
    expect(startMorale({ moraleEffect: 5 })).toBeGreaterThan(startMorale({ moraleEffect: 1 }));
  });

  it('starting morale: baseMorale + leaderMoraleStep × (moraleEffect − 3) + the rehearsed bonus, from the nearest leader up the chain', () => {
    // Fixture doctrine: baseMorale 0.8, leaderMoraleStep 0.03, trainingBonusRehearsed 0.1.
    expect(startMorale({ moraleEffect: 1 })).toBeCloseTo(0.8 - 0.06, 12);
    expect(startMorale({ moraleEffect: 1, training: 'rehearsed' })).toBeCloseTo(0.8 - 0.06 + 0.1, 12);
    // The battalion's own leader outranks one higher up.
    const nested = (s: Scenario) => {
      const bn = s.forces[0]!.formations[0]!;
      s.leaders.push({ id: 'bde', name: est('Brigadier'), rank: est('Brigadier-General'), ratings: ratings(5) } as Scenario['leaders'][number]);
      s.forces[0]!.formations = [{ id: 'bde1', name: '1st Brigade', kind: 'brigade', leaderId: 'bde', children: [bn] }];
    };
    expect(startMorale({ moraleEffect: 1, edit: nested })).toBeCloseTo(0.74, 12);
    // With no battalion leader, the brigade's leader counts.
    const noBnLeader = (s: Scenario) => {
      nested(s);
      delete s.forces[0]!.formations[0]!.children![0]!.leaderId;
    };
    expect(startMorale({ edit: noBnLeader })).toBeCloseTo(0.86, 12);
  });

  it('a formation with no leader up its chain, or a leader without ratings, counts as 3 and is listed in defaultsUsed', () => {
    const [s, m] = fixtureFire();
    const { state, ctx } = initRun(s, m, { seed: 1 });
    expect(state.companies.find((c) => c.id === 'c1')!.morale).toBeCloseTo(0.8, 12);
    expect([...ctx.defaultsUsed]).toEqual(expect.arrayContaining(['leaders[currie].ratings.moraleEffect ← 3 (no ratings given)', 'formations[rir262] leader ← none up its chain (moraleEffect 3)']));
  });

  it('every morale event has causes from the vocabulary and refs to earlier fire events of the last fireRefsMin minutes', () => {
    const r = runCrush();
    const states = r.events.filter((e) => ['company-pinned', 'company-fell-back', 'company-surrendered', 'company-destroyed'].includes(e.kind));
    expect(states.length).toBeGreaterThan(0);
    for (const e of states) {
      expect(e.causes.length).toBeGreaterThan(0);
      for (const c of e.causes) expect(CAUSES).toContain(c);
      expect(e.refs.length).toBeGreaterThan(0);
      for (const ref of e.refs) {
        const x = r.events[ref]!;
        expect(x.id).toBeLessThan(e.id);
        expect(['direct-fire', 'shelled', 'officers-lost']).toContain(x.kind);
        if (x.kind !== 'officers-lost') expect(e.minute - x.minute).toBeLessThan(10);
      }
    }
    const pinned = ofKind(r, 'company-pinned')[0]!;
    expect(pinned.causes).toContain('mg-fire');
    expect(pinned.causes).toContain('suppressed');
  });

  it('a surrendered company: every man standing is captured, men are conserved, and it fires no more', () => {
    const r = runCrush();
    const sur = ofKind(r, 'company-surrendered')[0]!;
    expect(sur.unitId).toBe('k2');
    expect(sur.causes).toContain('morale-broke');
    expect(new Set(totalsOverTime(r, 'k2'))).toHaveLength(1);
    expect(r.summary.prisoners.allied).toBe(sur.factors!.men);
    expect(r.events.filter((e) => e.kind === 'direct-fire' && e.text.includes('from 2. Kompanie') && e.minute > sur.minute)).toHaveLength(0);
  });

  it('morale recovers toward its start when no fire comes in, and suppression wears off', () => {
    const { state, ctx } = initRun(...fixtureFire({ lagMin: 100, startX: -2000 }), { seed: 1 });
    const shaken = { ...state, minute: 10, companies: state.companies.map((c) => (c.id === 'c1' ? { ...c, morale: 0.6, suppression: 0.2 } : c)) };
    // A quiet hour: c1 is 2 km off, out of everyone's reach.
    let s = shaken;
    for (let i = 0; i < 30; i++) s = runStep(s, ctx);
    const c1 = s.companies.find((c) => c.id === 'c1')!;
    expect(c1.morale).toBeGreaterThan(0.6);
    expect(c1.morale).toBeLessThanOrEqual(c1.moraleStart);
    expect(c1.suppression).toBeLessThan(0.01);
  });
});

describe('a garrison taken prisoner to the last man (final review fix)', () => {
  it('is logged as surrendered, not destroyed: cause defenders-trapped, refs to its trapping and to the dugouts cleared', () => {
    const r = runDugouts({ mopUp: true });
    const k1 = r.events.filter((e) => e.unitId === 'k1' && (e.kind === 'company-destroyed' || e.kind === 'company-surrendered'));
    expect(k1.map((e) => e.kind)).toEqual(['company-surrendered']);
    const e = k1[0]!;
    const trapped = r.events.find((x) => x.kind === 'defenders-trapped' && x.segmentId === 'ger-front-a:001')!;
    const cleared = r.events.find((x) => x.kind === 'dugout-cleared' && x.segmentId === 'ger-front-a:001')!;
    expect(e.text).toBe('1. Kompanie is taken prisoner to the last man: 120 men captured');
    expect(e.causes).toEqual(['defenders-trapped']);
    expect(e.refs).toEqual([trapped.id, cleared.id]);
    // The men were counted as captured by the trapping and the clearing; this event adds none (playback totals, the report).
    expect(e.factors).toMatchObject({ men: 0, captured: 120 });
  });

  it('a garrison shelled in the bombardment and then taken prisoner does not give artillery fire as the cause', () => {
    const { state, ctx } = initRun(...fixtureDugouts({ mopUp: false }), { seed: 1 });
    const s: SimState = {
      ...state,
      minute: 40,
      events: [],
      companies: state.companies.map((c) =>
        c.id === 'k1' ? { ...c, men: 0, captured: c.men - 10, bombardment: { ...c.bombardment, killed: 4, wounded: 6 }, killed: c.killed + 4, wounded: c.wounded + 6, recentFire: [], takenPrisoner: { eventId: 0, minute: 30 } } : c,
      ),
    };
    const out = morale(s, ctx, 2, { damage: [] });
    const e = out.events.find((x) => x.unitId === 'k1')!;
    expect(e.kind).toBe('company-surrendered');
    expect(e.causes).not.toContain('artillery-fire');
    expect(out.companies.find((c) => c.id === 'k1')!.status).toBe('surrendered');
  });

  it('a company shot down to the last man is still destroyed', () => {
    const { state, ctx } = initRun(...fixtureFire(), { seed: 1 });
    const s: SimState = { ...state, minute: 40, events: [], companies: state.companies.map((c) => (c.id === 'c1' ? { ...c, men: 0, killed: c.men, recentFire: [{ minute: 40, eventId: null, causes: ['mg-fire'] }] } : c)) };
    const e = morale(s, ctx, 2, { damage: [] }).events.find((x) => x.unitId === 'c1')!;
    expect(e.kind).toBe('company-destroyed');
    expect(e.causes).toContain('mg-fire');
  });
});
