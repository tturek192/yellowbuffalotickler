import { describe, expect, it } from 'vitest';
import { runPipeline } from './pipeline';
import { initRun } from './run';
import type { RunRecord } from './record';
import { morale } from './morale';
import { moveCompanies, targetX } from './movement';
import { churn } from './ground';
import type { CompanyState } from './companies';
import type { SimState, StepContext } from './step';
import {
  barrageResumeMinute, fixtureArtillery, fixtureFire, ofKind, reachedMinute, rowsOf, runBrownCloseToBlue, timeToObjective,
} from './test-helpers';

/** c1 of fixtureFire at Zero + 10, started and with nothing ahead of it (the barrage far away), and the step context. */
function walker(over: Partial<CompanyState> = {}): { state: SimState; ctx: StepContext; c1: CompanyState } {
  const { state, ctx } = initRun(...fixtureFire(), { seed: 1 });
  const c1 = { ...state.companies.find((c) => c.id === 'c1')!, startMin: 0, intent: 'advance' as const, ...over };
  return { state: { ...state, minute: 10, barrages: [], companies: [c1] }, ctx, c1 };
}
const moved = (w: ReturnType<typeof walker>, dt = 2): CompanyState => moveCompanies(w.state, w.ctx, dt, { damage: [] }).companies[0]!;
const advance = (over: Partial<CompanyState> = {}): number => {
  const w = walker(over);
  return moved(w).x - w.c1.x;
};

describe('movement', () => {
  it('uncut wire slows the advance and holds the company in the open', () => {
    expect(timeToObjective({ wireCut: 0.1 })).toBeGreaterThan(timeToObjective({ wireCut: 0.95 }));
    // Inside the belt it is moving, not taking cover.
    const f = fixtureArtillery({ lagMin: 30 });
    const { state, ctx } = initRun(f[0], f[1], { seed: 1 });
    let s: SimState = { ...state, segments: state.segments.map((x) => ({ ...x, wireBeltDepthM: 200, wireCut: 0 })) };
    while (s.minute < 34) s = runPipeline(s, ctx, 2);
    const c1 = s.companies.find((c) => c.id === 'c1')!;
    expect(c1.x).toBeGreaterThan(-50);
    expect(c1.x).toBeLessThan(150);
    expect(c1.posture).toBe('moving');
  });

  it('fully cut wire costs nothing and fully uncut wire slows to wireSpeedFactor', () => {
    expect(timeToObjective({ wireCut: 1 })).toBe(timeToObjective({ wireCut: 0, beltDepthM: 0 }));
    const free = timeToObjective({ wireCut: 1 });
    const uncut = timeToObjective({ wireCut: 0 });
    // 200 m of wire at half speed takes 2 minutes more than at full speed (50 m a minute): 4 minutes in all, give or take a step.
    expect(uncut - free).toBeGreaterThanOrEqual(2);
    expect(uncut - free).toBeLessThanOrEqual(6);
  });

  it('no company passes a line the barrage is still standing beyond (Plan 2 artefact: brown 44 m past blue)', () => {
    const r = runBrownCloseToBlue();
    expect(reachedMinute(r, 'brown')).toBeGreaterThanOrEqual(barrageResumeMinute(r, 'brown'));
    // c1 waits on the Blue Line while the barrage stands beyond it.
    const resume = barrageResumeMinute(r, 'brown');
    const waiting = rowsOf(r, 'c1').filter((x) => (x.x as number) >= 590 && (x.x as number) <= 600);
    expect(waiting.length).toBeGreaterThan(0);
    expect(ofKind(r, 'company-reached').find((e) => e.unitId === 'c2')!.minute).toBeLessThan(resume);
  });

  it('the target is the nearest of the objective, the barrage less the follow distance, and the line the barrage protects', () => {
    const w = walker();
    const { state, ctx } = initRun(...fixtureArtillery(), { seed: 1 });
    const c1 = state.companies.find((c) => c.id === 'c1')!;
    // Zero: the barrage on the German front line (x 150) and lifting to the Black Line, c1's own objective.
    expect(targetX(c1, state, ctx)).toBe(150 - 70);
    // No barrage in its sector: the objective.
    expect(targetX(w.c1, w.state, w.ctx)).toBe(1150);
  });

  it('speed: the NCO penalty, suppression (× 1 − 0.5 s) and fatigue (× 1 − f) slow a company', () => {
    const full = advance();
    expect(full).toBeGreaterThan(0);
    expect(advance({ suppression: 1 }) / full).toBeCloseTo(0.5, 9);
    expect(advance({ fatigue: 0.25 }) / full).toBeCloseTo(0.75, 9);
    expect(advance({ officers: 0, training: 'standard' }) / full).toBeCloseTo(0.7, 9);
  });

  it('speed: shell-churned ground is mud and slows a company (speedFactor)', () => {
    const full = advance();
    const w = walker();
    churn(w.ctx.world, [w.c1.x, w.c1.y], 1e6);
    expect((moved(w).x - w.c1.x) / full).toBeCloseTo(0.6, 3);
  });

  it('fatigue rises with distance moved and with time under fire, and falls at rest', () => {
    const w = walker();
    const after = moved(w, 10);
    expect(after.fatigue).toBeCloseTo((0.02 * (after.x - w.c1.x)) / 1000, 12);
    const fired = moveCompanies({ ...w.state, companies: [{ ...w.c1, intent: 'hold' }] }, w.ctx, 30, { damage: [], applied: new Map([['c1', { menBefore: 150, hit: 0 }]]) }).companies[0]!;
    expect(fired.fatigue).toBeCloseTo(0.1 * 0.5, 12);
    const rested = moveCompanies({ ...w.state, companies: [{ ...w.c1, intent: 'hold', fatigue: 0.3 }] }, w.ctx, 60, { damage: [] }).companies[0]!;
    expect(rested.fatigue).toBeCloseTo(0.3 - 0.05, 12);
    const fresh = moveCompanies({ ...w.state, companies: [{ ...w.c1, intent: 'hold', fatigue: 0.01 }] }, w.ctx, 60, { damage: [] }).companies[0]!;
    expect(fresh.fatigue).toBe(0);
  });

  it('a falling-back company makes for its start point; a pinned one does not move', () => {
    const w = walker({ x: 300, y: 150, status: 'falling-back', intent: 'fall-back' });
    const back = moved(w, 2);
    const d0 = Math.hypot(300 - w.c1.startX, 150 - w.c1.startY);
    const d1 = Math.hypot(back.x - w.c1.startX, back.y - w.c1.startY);
    expect(d1).toBeLessThan(d0);
    expect(back.posture).toBe('moving');
    const home = moveCompanies({ ...w.state, companies: [back] }, w.ctx, 60, { damage: [] }).companies[0]!;
    expect([home.x, home.y]).toEqual([w.c1.startX, w.c1.startY]);
    expect(home.posture).toBe('in-trench');
    const pinned = moved(walker({ x: 300, status: 'pinned', intent: 'go-to-ground' }));
    expect(pinned.x).toBe(300);
  });

  it('a company that fell back rallies once its morale is back above fallBack, and holds: it does not take up the attack again by itself', () => {
    const w = walker({ x: -300, status: 'falling-back', intent: 'fall-back', morale: 0.4, posture: 'moving' });
    const fellBackEventId = w.state.nextEventId - 1;
    const out = morale({ ...w.state, companies: [{ ...w.c1, fellBackEventId }] }, w.ctx, 2, { damage: [], applied: new Map() });
    expect(out.companies[0]).toMatchObject({ status: 'holding', intent: 'hold', posture: 'prone' });
    expect(out.events.filter((e) => e.kind === 'company-rallied')).toMatchObject([{ unitId: 'c1', causes: ['morale-recovered'], refs: [fellBackEventId] }]);
    // A pinned company with the same morale stays pinned, and goes on once it recovers (Task 9's rule).
    const pinned = morale({ ...w.state, companies: [{ ...w.c1, status: 'pinned', intent: 'go-to-ground' }] }, w.ctx, 2, { damage: [], applied: new Map() }).companies[0]!;
    expect(pinned.status).toBe('pinned');
  });

  it('a holding company moves only when ordered to counter-attack: then toward its target, and holds it on arrival', () => {
    // No guns and the attackers far off and late: nothing but the order moves k1.
    const f = fixtureArtillery({ lagMin: 100 });
    f[0].artillery = [];
    const { state, ctx } = initRun(f[0], f[1], { seed: 1 });
    const k1 = { ...state.companies.find((c) => c.id === 'k1')!, posture: 'in-trench' as const };
    let s: SimState = { ...state, minute: 10, companies: state.companies.map((c) => (c.id === 'k1' ? k1 : c)) };
    s = runPipeline(s, ctx, 2);
    expect(s.companies.find((c) => c.id === 'k1')!.x).toBe(k1.x);
    const order = { kind: 'counter-attack' as const, target: { lineId: 'black' }, fromFormationId: 'rir262', issuedMin: 10 };
    s = { ...s, companies: s.companies.map((c) => (c.id === 'k1' ? { ...c, orders: [order] } : c)) };
    s = runPipeline(s, ctx, 2);
    const k = s.companies.find((c) => c.id === 'k1')!;
    expect(k.status).toBe('counter-attacking');
    expect(k.x).toBeGreaterThan(k1.x);
    for (let i = 0; i < 60 && s.companies.find((c) => c.id === 'k1')!.status === 'counter-attacking'; i++) s = runPipeline(s, ctx, 2);
    const there = s.companies.find((c) => c.id === 'k1')!;
    expect(there.status).toBe('holding');
    expect(1150 - there.x).toBeLessThanOrEqual(50);
    // Task 12 fix round: it keeps the order (intent counter-attack) through the step it arrives, so a retake that step
    // can cite it; the order lapses at the next behaviour phase.
    expect([there.intent, there.orders]).toEqual(['counter-attack', [order]]);
    const after = runPipeline(s, ctx, 2).companies.find((c) => c.id === 'k1')!;
    expect([after.status, after.intent, after.orders]).toEqual(['holding', 'hold', []]);
  });

  it('reaching the objective is a company-reached event with its cause, which the company keeps for the line-taken rule', () => {
    const r: RunRecord = runBrownCloseToBlue();
    for (const e of ofKind(r, 'company-reached')) expect(e.causes).toEqual(['followed-barrage']);
    // A company that had lost its barrage arrives for that reason, referring to the event that said so.
    const lostId = 0;
    const w = walker({ x: 1140, barrageLost: true, barrageLostEventId: lostId });
    const out = moveCompanies(w.state, w.ctx, 2, { damage: [] });
    const reached = out.events.filter((e) => e.kind === 'company-reached');
    expect(reached).toMatchObject([{ unitId: 'c1', causes: ['barrage-moved-on'], refs: [lostId] }]);
    expect(out.companies[0]!.reached).toEqual({ eventId: reached[0]!.id, causes: ['barrage-moved-on'] });
  });
});
