import { describe, expect, it } from 'vitest';
import { est } from '@wwi/scenario/test-fixtures';
import type { Scenario } from '@wwi/scenario';
import { commandPending, commandPhase, counterAttackRetries, offMapAttackWindows, operationStarts, orderStarts, stallChecks } from './command';
import { send } from './comms';
import { captureSegments } from './trenches';
import { morale } from './morale';
import { runPipeline } from './pipeline';
import { initRun, runScenario } from './run';
import type { Models } from './run';
import { quietStep, SCHEDULES } from './schedule';
import { isBusy, takeLines } from './step';
import type { SimState, StepContext } from './step';
import { fixtureComms, fixtureCounter, fixtureReserves, fixtureStall, runStates, withQuietStep, withRearTrench } from './test-helpers';
import type { CommandOpts, CounterOpts } from './test-helpers';
import type { Order, SimEvent } from './types';

type Run = { states: SimState[]; ctx: StepContext };
const eventsOf = (r: Run): SimEvent[] => r.states.flatMap((s) => s.events);
const firstOf = (r: Run, kind: SimEvent['kind']): SimEvent | undefined => eventsOf(r).find((e) => e.kind === kind);

/** The minute the brigade commits its reserve to the stalled Black Line (Infinity: never, within 300 minutes). */
function commitMinute(o: CommandOpts): number {
  return firstOf(runStates(fixtureStall(o), { endMinute: 300 }), 'order-issued')?.minute ?? Infinity;
}

/** Whether the brigade commits its reserve battalion at this force ratio (reserve men to the 400 defenders it knows of). */
function attacked(o: { riskTolerance: number; ratio: number }): boolean {
  return commitMinute({ riskTolerance: o.riskTolerance, reserveMen: o.ratio * 400 }) < Infinity;
}

/** The minute a counter-attack is ordered on a lost segment (local), or goes in (divisional: kr first counter-attacking). */
function counterAttackMinute(o: CounterOpts & { seed?: number }): number {
  const r = runStates(fixtureCounter(o), { seed: o.seed ?? 1, endMinute: 400 });
  if (o.divOrderSpeed !== undefined) return r.states.find((s) => s.companies.find((c) => c.id === 'kr')!.status === 'counter-attacking')?.minute ?? Infinity;
  return firstOf(r, 'counter-attack-ordered')?.minute ?? Infinity;
}

/** fixtureStall with the Black Line taken (k3 only 20 men) and op1: bn2 attacks the Brown Line (x 1600) once Black is taken. */
function fixtureOperation(o: { notBefore?: string } = {}): [Scenario, Models] {
  const f = fixtureStall({ holdout: 20, stallToleranceMin: 600 });
  const s = f[0];
  s.lines.push({ id: 'brown', name: 'Brown Line', kind: 'objective', color: '#885522', points: [[1600, 0], [1600, 400]] });
  s.operations = [
    {
      id: 'op1', side: 'allied', formationId: 'bn2', kind: 'attack', target: { lineId: 'brown', sectorId: 's1' }, prerequisite: { lineId: 'black', sectorId: 's1' },
      ...(o.notBefore ? { notBefore: o.notBefore } : {}), plan: { value: 'the written plan', estimate: 'test' },
    },
  ];
  return f;
}
const runOperation = (o: { notBefore?: string } = {}): Run => runStates(fixtureOperation(o), { endMinute: 300 });
const launchMinute = (r: Run): number => firstOf(r, 'operation-launched')?.minute ?? Infinity;
/** The minute the prerequisite (the Black Line) was taken on the ground. */
const prereqKnownMinute = (r: Run): number => firstOf(r, 'line-taken')!.minute;
/** The minute brigade b1 (the HQ responsible for op1) first knew the Black Line taken. */
const brigadeKnewMinute = (r: Run): number => r.states.find((s) => typeof s.hqs.find((h) => h.formationId === 'b1')!.picture.lines['black|s1'] === 'number')!.minute;

describe('the command model', () => {
  it('a stalled line brings the reserve battalion in; a more adaptive leader commits it sooner', () => {
    expect(commitMinute({ adaptiveness: 5 })).toBeLessThan(commitMinute({ adaptiveness: 1 }));
  });
  it('a cautious leader does not attack at a poor force ratio; a bold one does', () => {
    expect(attacked({ riskTolerance: 1, ratio: 1.2 })).toBe(false); expect(attacked({ riskTolerance: 5, ratio: 1.2 })).toBe(true);
  });
  it('decisions are made only on what has been reported: a lost runner delays the counter-attack', () => {
    expect(counterAttackMinute({ failPerHour: 0 })).toBeLessThan(counterAttackMinute({ failPerHour: 3, seed: 2 }));
  });
  it('a planned operation launches only after its prerequisite is known taken, never on a fixed clock', () => {
    const r = runOperation();
    expect(launchMinute(r)).toBeGreaterThan(prereqKnownMinute(r));
  });
  it('swapping a slow divisional commander for a fast one changes when the counter-attack goes in', () => {
    expect(counterAttackMinute({ divOrderSpeed: 5 })).toBeLessThan(counterAttackMinute({ divOrderSpeed: 1 }));
  });

  // Guards beside the brief's five tests.
  it('the stall commitment: the battalion attacks the stalled line, and fire is called for on its trench', () => {
    const r = runStates(fixtureStall(), { endMinute: 300 });
    const e = firstOf(r, 'order-issued')!;
    expect(e.lineId).toBe('black');
    expect(e.causes).toEqual(['leader-adapted']);
    expect(e.refs.length).toBeGreaterThan(0);
    for (const ref of e.refs) expect(ref).toBeLessThan(e.id);
    expect(e.factors).toMatchObject({ men: 1200, enemy: 400, ratio: 3, riskRatio: 1.5 });
    // The brigade knew both companies on the line had stopped before it decided.
    const at = r.states.find((s) => s.minute === e.minute)!;
    const pic = at.hqs.find((h) => h.formationId === 'b1')!.picture;
    expect([pic.units['c1']!.status, pic.units['c2']!.status]).toEqual(['consolidating', 'consolidating']);
    // Its companies take the order up and go for the Black Line; the call for fire reaches the artillery.
    const end = r.states.at(-1)!;
    for (const id of ['r1', 'r2', 'r3', 'r4']) expect(end.companies.find((c) => c.id === id)!.objectiveLineId).toBe('black');
    expect(r.states.some((s) => s.fireMissions.length > 0 || s.messages.some((m) => m.kind === 'call-for-fire'))).toBe(true);
    // 1,500 men against 400 take the trench and the line.
    expect(eventsOf(r).some((x) => x.kind === 'line-taken' && x.lineId === 'black')).toBe(true);
    // Once: the reserve is spent.
    expect(eventsOf(r).filter((x) => x.kind === 'order-issued')).toHaveLength(1);
  });

  it('a bold leader\'s commitment says so; with no news that the attack has stopped, nobody is committed', () => {
    expect(firstOf(runStates(fixtureStall({ riskTolerance: 5 }), { endMinute: 300 }), 'order-issued')!.causes).toEqual(['leader-adapted', 'leader-bold']);
    expect(firstOf(runStates(fixtureStall({ riskTolerance: 1, reserveMen: 4000 }), { endMinute: 300 }), 'order-issued')!.causes).toEqual(['leader-adapted', 'leader-cautious']);
    // Every report lost on the way (runner failing always): the brigade never learns the companies stopped.
    const f = fixtureStall();
    f[1].tables.channels.runner = { delayMin: { value: 6, estimate: 'test' }, failPerHour: { value: 1e6, estimate: 'test' } };
    expect(firstOf(runStates(f, { endMinute: 300 }), 'order-issued')).toBeUndefined();
  });

  it('companies that fell back and rallied go forward again with the reserve when the stall is answered', () => {
    const rallied = (s: SimState): SimState => ({
      ...s,
      companies: s.companies.map((c) => (c.id === 'c2' ? { ...c, status: 'holding' as const, intent: 'hold' as const } : c)),
      hqs: s.hqs.map((h) => (h.picture.units['c2'] ? { ...h, picture: { ...h.picture, units: { ...h.picture.units, c2: { ...h.picture.units['c2']!, status: 'holding' } } } } : h)),
      lastReport: { ...s.lastReport, c2: { ...s.lastReport['c2']!, status: 'holding' } },
    });
    const r = runStates(fixtureStall(), { endMinute: 300, at: rallied });
    const e = firstOf(r, 'order-issued')!;
    expect(e.text).toMatch(/and 1 rallied company/);
    expect(e.factors!.men).toBe(1350);
    expect(r.states.at(-1)!.companies.find((c) => c.id === 'c2')!.status).not.toBe('holding');
  });

  it('an operation waits for notBefore as well as for its prerequisite, and launches the formation\'s reserve companies', () => {
    const r = runOperation();
    expect(brigadeKnewMinute(r)).toBeLessThanOrEqual(launchMinute(r));
    const e = firstOf(r, 'operation-launched')!;
    expect(e.causes).toEqual(['planned-operation']);
    expect(e.refs.length).toBeGreaterThan(0);
    for (const id of ['r1', 'r2', 'r3', 'r4']) expect(r.states.at(-1)!.companies.find((c) => c.id === id)!.objectiveLineId).toBe('brown');
    // notBefore 09:41 is minute 131 on the fixture's clock (Zero 07:30), long after the prerequisite was known.
    const late = runOperation({ notBefore: '1916-07-01T09:41' });
    expect(launchMinute(late)).toBe(132);
    // With nothing known of its prerequisite (every report lost), it never launches.
    const f = fixtureOperation();
    f[1].tables.channels.runner = { delayMin: { value: 6, estimate: 'test' }, failPerHour: { value: 1e6, estimate: 'test' } };
    expect(launchMinute(runStates(f, { endMinute: 300 }))).toBe(Infinity);
  });

  it('each headquarters starts with the pre-battle intelligence picture, marked as such; reports replace it', () => {
    const r = runStates(fixtureStall(), { endMinute: 120 });
    const seg = r.states[0]!.segments.find((x) => x.featureId === 'ger-rear-k3')!.id;
    const b1 = (s: SimState) => s.hqs.find((h) => h.formationId === 'b1')!.picture.enemy;
    expect(b1(r.states[0]!)[seg]).toEqual({ men: 400, atMin: 0, intel: true, base: 400 });
    // The German side's estimate of the attackers facing its own trench (c1 and c2, by their Zero y).
    const k = r.states[0]!.hqs.find((h) => h.formationId === 'rir262')!.picture.enemy;
    expect(Object.values(k).every((e) => e.intel)).toBe(true);
    expect(Object.values(k).map((e) => e.men).sort((a, b) => a - b)).toEqual([150, 150, 300]); // k3's trench faces both
    // Once the companies on the line have reported, the brigade's picture holds what they saw.
    const later = b1(r.states.at(-1)!)[seg]!;
    expect(later.intel).toBeUndefined();
    expect(later.men).toBe(400);
  });

  it('an operation into ground where intelligence shows defenders does not launch at a poor ratio', () => {
    // A German trench on the Brown Line (x 1600) that no report reaches (observerRangeM 100 from the Black Line, 450 m
    // off): only the intelligence picture tells the brigade who holds it.
    const run = (men: number) => {
      const f = withRearTrench(fixtureOperation(), 1600, 'k4');
      f[0].forces[1]!.formations[0]!.companies!.find((c) => c.id === 'k4')!.strength = est(men);
      (f[1].tables.effects as Record<string, unknown>)['observerRangeM'] = { value: 100, estimate: 'test', description: 'test' };
      return firstOf(runStates(f, { endMinute: 300 }), 'operation-launched');
    };
    expect(run(2000)).toBeUndefined(); // 1,200 men against 2,000 by intelligence: 0.6, below 1.5
    expect(run(100)!.factors).toMatchObject({ enemy: 100, ratio: 12, intelligence: 1 });
  });

  it('a target place nobody has seen is unknown, not empty: the operation waits for a report showing it clear', () => {
    // op1 on the Old Wood (x 500, no trench, no enemy): with nobody in sight of it, it never launches; once the companies
    // passing it report it empty, it does, on what they saw.
    const run = (range: number) => {
      const f = fixtureOperation();
      f[0].operations![0]!.target = { featureId: 'old-wood' };
      (f[1].tables.effects as Record<string, unknown>)['observerRangeM'] = { value: range, estimate: 'test', description: 'test' };
      return firstOf(runStates(f, { endMinute: 300 }), 'operation-launched');
    };
    expect(run(0)).toBeUndefined();
    const e = run(1500)!;
    expect(e.factors).toMatchObject({ enemy: 0 });
    expect(e.factors!.intelligence).toBeUndefined();
  });

  it('a line with no segment: its ground is the intelligence between the lines, and a cautious leader does not commit at a poor ratio', () => {
    // k3's trench 50 m short of the Black Line (beyond lineFeatureMatchM, 1 m here): the line runs along no segment. The
    // attack never goes (c1 and c2 have rallied and hold), so the line stays untaken. Intelligence puts k1, k2 and k3,
    // 640 men, between the German front line and the Black Line; bn2 and the rallied companies have 1,500.
    const commit = (riskTolerance: number) => {
      const f = fixtureStall({ riskTolerance });
      const k3 = f[0].forces[1]!.formations[0]!.companies!.find((c) => c.id === 'k3')!;
      k3.start = [1100, 200];
      f[0].features.find((x) => x.id === 'ger-rear-k3')!.geometry = { type: 'LineString', coordinates: [[1100, 0], [1100, 400]] };
      const rallied = (s: SimState): SimState => ({
        ...s,
        companies: s.companies.map((c) => (c.id === 'c1' || c.id === 'c2' ? { ...c, status: 'holding' as const, intent: 'hold' as const } : c)),
        hqs: s.hqs.map((h) => ({ ...h, picture: { ...h.picture, units: Object.fromEntries(Object.entries(h.picture.units).map(([id, u]) => [id, id === 'c1' || id === 'c2' ? { ...u, status: 'holding' } : u])) } })),
        lastReport: { ...s.lastReport, c1: { ...s.lastReport['c1']!, status: 'holding' }, c2: { ...s.lastReport['c2']!, status: 'holding' } },
      });
      const r = runStates(f, { endMinute: 200, at: rallied });
      expect(r.states[0]!.hqs.find((h) => h.formationId === 'b1')!.picture.enemy['line:black|s1']).toEqual({ men: 640, atMin: 0, intel: true, base: 640 });
      return firstOf(r, 'order-issued');
    };
    expect(commit(1)).toBeUndefined(); // 1,500 / 640 = 2.34, below 2.5
    expect(commit(5)!.factors).toMatchObject({ men: 1500, enemy: 640, intelligence: 1, riskRatio: 0.5 });
  });

  it('men in dug-outs are invisible, not gone: a cautious leader facing a garrison seen 0 but known 150 does not commit at a poor ratio', () => {
    // k3 (150 men) holds a trench 100 m beyond the Black Line (inside lineFeatureMatchM, 150 here, so it is the line's
    // segment; beyond captureRadiusM of the companies on the line, so they cannot take it) and never comes up out of its
    // dug-outs (emergeMin 100,000): every report sees 0 men up. bn2 has 300 men: 2 to 1 on the estimate.
    const commit = (riskTolerance: number, at?: (s: SimState) => SimState) => {
      const f = fixtureStall({ riskTolerance, holdout: 150, reserveMen: 300 });
      const k3 = f[0].forces[1]!.formations[0]!.companies!.find((c) => c.id === 'k3')!;
      k3.start = [1250, 200];
      f[0].features.find((x) => x.id === 'ger-rear-k3')!.geometry = { type: 'LineString', coordinates: [[1250, 0], [1250, 400]] };
      (f[1].tables.effects as Record<string, unknown>)['lineFeatureMatchM'] = { value: 150, estimate: 'test', description: 'test' };
      f[1].doctrines['de-1917']!.defence!.emergeMin = { value: 100000, estimate: 'test', description: 'test' };
      const r = runStates(f, { endMinute: 200, ...(at ? { at } : {}) });
      const seg = r.states[0]!.segments.find((x) => x.featureId === 'ger-rear-k3')!.id;
      return { e: firstOf(r, 'order-issued'), belief: r.states.at(-1)!.hqs.find((h) => h.formationId === 'b1')!.picture.enemy[seg]! };
    };
    const cautious = commit(1);
    expect(cautious.e).toBeUndefined(); // 300 / 150 = 2, below 2.5
    expect(cautious.belief).toMatchObject({ men: 150, seen: 0, base: 150, intel: true });
    expect(commit(5).e!.factors).toMatchObject({ men: 300, enemy: 150, ratio: 2, intelligence: 1 });
    // Losses reported lower the estimate: with 100 of k3's men taken prisoner (as a trapping would), the brigade believes
    // 50 are left, and even the cautious leader commits (6 to 1).
    const taken = (s: SimState): SimState => ({ ...s, companies: s.companies.map((c) => (c.id === 'k3' ? { ...c, men: 50, captured: 100 } : c)) });
    const after = commit(1, taken);
    expect(after.belief).toMatchObject({ men: 50, seen: 0, lost: 100, intel: true });
    expect(after.e!.factors).toMatchObject({ enemy: 50, ratio: 6 });
  });

  it('a retake nobody ordered of a trench nobody held says so: cause left-unheld, ref the loss it undoes', () => {
    const { state, ctx } = initRun(...fixtureCounter(), { seed: 1 });
    const seg = state.segments[0]!;
    const s: SimState = {
      ...state,
      minute: 2,
      events: [],
      segments: state.segments.map((x) => (x.id === seg.id ? { ...x, holder: 'allied' as const, holderEventId: 0 } : x)),
      companies: state.companies.map((c) => (c.id === 'k1' ? { ...c, posture: 'in-trench' as const } : c.id === 'c1' || c.id === 'c2' ? { ...c, x: -600 } : c)),
    };
    const e = captureSegments(s, ctx).events.find((x) => x.kind === 'segment-retaken')!;
    expect(e).toMatchObject({ segmentId: seg.id, unitId: 'k1', causes: ['left-unheld'], refs: [0] });
  });

  it('a counter-attack needs counterAttackMinMen whatever the odds, and a failed one may be ordered again after counterAttackRetryMin', () => {
    const { state, ctx } = initRun(...fixtureCounter(), { seed: 1 });
    const seg = state.segments[0]!.id;
    const decide = (minute: number, krMen: number, done?: number) => {
      const hqs = state.hqs.map((h) =>
        h.formationId !== 'rir262'
          ? h
          : { ...h, picture: { ...h.picture, segments: { ...h.picture.segments, [seg]: 'allied' as const }, segmentsAt: { [seg]: minute }, enemy: { [seg]: { men: 0, atMin: minute } }, units: { ...h.picture.units, kr: { status: 'holding', men: krMen, atMin: 0 } } } },
      );
      const command = done === undefined ? state.command : { ...state.command, counterAttacks: { [seg]: { hqId: 'rir262', atMin: done } } };
      return commandPhase({ ...state, minute, events: [], hqs, command }, ctx, 2).events.find((e) => e.kind === 'counter-attack-ordered');
    };
    // An empty trench gives any force infinite odds; 20 men are still too few.
    expect(decide(10, 20)).toBeUndefined();
    expect(decide(10, 40)!.factors).toMatchObject({ men: 40, enemy: 0, minMen: 35 });
    // Ordered at 10 and the trench still lost: not again before 70, again from then.
    expect(decide(68, 300, 10)).toBeUndefined();
    expect(decide(70, 300, 10)!.factors).toMatchObject({ again: 1 });
  });

  it('an off-map attack leaves men down in their dugouts alone', () => {
    const f = fixtureComms();
    f[0].offMap = { fire: [], attacks: [offMapAttack()] };
    const { state, ctx } = initRun(...f, { seed: 1 });
    const below = state.companies.map((c) => (c.id === 'k1' ? { ...c, posture: 'in-dugout' as const } : c.id === 'k2' ? { ...c, posture: 'in-trench' as const } : c));
    const out = commandPhase({ ...state, minute: 110, events: [], companies: below }, ctx, 2);
    expect(out.companies.find((c) => c.id === 'k1')!.suppression).toBe(0);
    expect(out.companies.find((c) => c.id === 'k2')!.suppression).toBe(0.25);
  });

  it('an order a company cannot carry out is dropped and logged, and does not hold the run open', () => {
    const { state, ctx } = initRun(...fixtureCounter(), { seed: 1 });
    const order: Order = { kind: 'counter-attack', target: { segmentId: 'no-such-segment' }, fromFormationId: 'rir262', issuedMin: 0, eventId: 0 };
    const s: SimState = { ...state, companies: state.companies.map((c) => (c.id === 'kr' ? { ...c, orders: [order] } : c)) };
    const out = runPipeline(s, ctx, 2);
    const kr = out.companies.find((c) => c.id === 'kr')!;
    expect([kr.status, kr.orders]).toEqual(['holding', []]);
    expect(out.events.find((e) => e.kind === 'order-dropped')).toMatchObject({ unitId: 'kr', refs: [0] });
    expect(commandPending(out, ctx)).toBe(false);
  });

  it('the stall commitment calls for stallBarrageMin of standing barrage on the stalled line', () => {
    const f = fixtureStall();
    (f[1].tables.effects as Record<string, unknown>)['stallBarrageMin'] = { value: 25, estimate: 'test', description: 'test' };
    // A battery to answer it that fires nothing of its own here (defensive fire falls only on its side's lost trench;
    // the fixture's creeping guns keep to the timetable).
    f[0].artillery.push({ id: 'st', side: 'allied', weapon: '18pdr', count: est(6), role: 'defensive', ammunition: est(20000), observation: 'map', position: [-800, 200], horseDrawn: false });
    const r = runStates(f, { endMinute: 300 });
    const missions = r.states.flatMap((s) => s.fireMissions).filter((m, i, xs) => m.byUnitId === 'b1' && xs.findIndex((x) => x.id === m.id) === i);
    expect(missions).toHaveLength(1);
    expect(missions[0]!.toMin - missions[0]!.fromMin).toBe(25);
    expect(missions[0]!.guns.reduce((a, g) => a + g.guns, 0)).toBeGreaterThan(0);
    expect(missions[0]!.refs).toEqual([firstOf(r, 'order-issued')!.id]);
  });

  it('a local counter-attack: the reserve company goes in localCounterAttackDelayMin after the loss is known, and retakes the trench at the taken line', () => {
    const r = runStates(fixtureCounter(), { endMinute: 300 });
    const e = firstOf(r, 'counter-attack-ordered')!;
    expect(e.causes).toEqual(['ground-lost']);
    expect(e.factors!.goAtMin).toBe(e.minute + 5);
    expect(e.refs.length).toBeGreaterThan(0);
    // kr starts once formed up (and once the runner has brought it the order).
    const going = r.states.find((s) => s.companies.find((c) => c.id === 'kr')!.status === 'counter-attacking')!;
    expect(going.minute).toBeGreaterThanOrEqual(e.minute + 5);
    // The trench was at the attackers' taken Front Line, held by the men on that line, and the men who had come up out of
    // its dugouts behind the attackers could not retake it on their own (the rear rule): the ordered counter-attack does,
    // when kr gets there (with them: 1,000 + 58 men against the 300 on the line), and the Front Line is lost.
    const there = r.states.find((s) => s.companies.find((c) => c.id === 'kr')!.intent === 'counter-attack' && s.companies.find((c) => c.id === 'kr')!.status === 'holding')!;
    const retaken = there.events.find((x) => x.kind === 'segment-retaken')!;
    expect(retaken.segmentId).toBe(e.segmentId);
    expect(retaken.factors!.attackers).toBeGreaterThanOrEqual(1000);
    expect(retaken.factors!.defenders).toBe(300);
    expect(r.states.some((s) => s.taken.includes('frontline|s1') && s.minute < there.minute && s.segments.find((x) => x.id === e.segmentId)!.holder === 'allied')).toBe(true);
    expect(there.events.find((x) => x.kind === 'line-lost')).toMatchObject({ lineId: 'frontline' });
    expect(eventsOf(r).filter((x) => x.kind === 'segment-retaken' && x.minute < there.minute)).toEqual([]);
    // The retake explains itself: an ordered counter-attack, with a ref to the decision.
    expect(retaken.causes).toContain('counter-attack');
    expect(retaken.refs).toContain(e.id);
    // The order lapses the step after: kr holds there.
    const next = r.states[r.states.indexOf(there) + 1]!.companies.find((c) => c.id === 'kr')!;
    expect([next.status, next.intent, next.orders]).toEqual(['holding', 'hold', []]);
  });

  it('a counter-attack cannot pass through an intact enemy line, as its HQ knows the lines: none goes for a trench behind a taken line until the picture shows it lost', () => {
    // fixtureCounter with the Black Line as the attackers' objective, and a German trench on it (k3, 20 men, x 1150): c1 and c2
    // take ger-front-a (x 150) and then the Black Line with k3's trench, so ger-front-a lies 1,000 m behind a taken line.
    const f = withRearTrench(fixtureCounter({ objective: 'black' }), 1150, 'k3');
    f[0].forces[1]!.formations[0]!.companies!.find((c) => c.id === 'k3')!.strength = est(20);
    const r = runStates(f, { endMinute: 160 });
    const s = r.states.find((x) => x.taken.includes('black|s1'))!;
    expect(s).toBeDefined();
    // kr, 550 m off, sees the line taken and reports it: rir262's picture comes to show it, and from then on no
    // counter-attack is ordered on ger-front-a.
    const knows = r.states.find((x) => typeof x.hqs.find((h) => h.formationId === 'rir262')!.picture.lines['black|s1'] === 'number')!;
    expect(knows).toBeDefined();
    expect(knows.minute).toBeGreaterThan(s.minute);
    expect(r.states.flatMap((x) => x.events).filter((e) => e.kind === 'counter-attack-ordered' && e.minute >= knows.minute && e.segmentId!.startsWith('ger-front-a'))).toEqual([]);
    const front = s.segments.find((x) => x.id === 'ger-front-a:001')!.id;
    const black = s.segments.find((x) => x.featureId === 'ger-rear-k3')!.id;
    // rir262 knows ger-front-a:001 lost and k3's trench its own, with kr free to send; and the Black Line as `lines` says.
    const decide = (st: SimState, lines: Record<string, number | null>) => {
      const hqs = st.hqs.map((h) =>
        h.formationId !== 'rir262'
          ? h
          : { ...h, picture: { ...h.picture, lines, segments: { ...h.picture.segments, [front]: 'allied' as const, [black]: 'central' as const }, segmentsAt: { [front]: 4 }, enemy: { [front]: { men: 0, atMin: 4 } }, units: { ...h.picture.units, kr: { status: 'holding', men: 300, atMin: st.minute } } } },
      );
      const free = { ...st, events: [], hqs, command: { ...st.command, ordered: {}, counterAttacks: {} }, companies: st.companies.map((c) => (c.id === 'kr' ? { ...c, status: 'holding' as const, orders: [] } : c)) };
      return commandPhase({ ...free, minute: st.minute + 2 }, r.ctx, 2).events.filter((e) => e.kind === 'counter-attack-ordered').map((e) => e.segmentId);
    };
    // The truth: the Black Line taken (s). Its picture: taken, so nothing; not heard of, so it goes for ger-front-a:001.
    expect(decide(s, { 'black|s1': s.minute })).toEqual([]);
    expect(decide(s, {})).toEqual([front]);
    // The truth: k3's trench back in German hands, the Black Line lost (line-lost). Its picture: still taken (the news
    // not yet in), so nothing; known lost (null), so it goes.
    const retook = { ...s, events: [], segments: s.segments.map((x) => (x.id === black ? { ...x, holder: 'central' as const } : x)) };
    const lost = takeLines(retook, r.ctx);
    expect(lost.events.map((e) => e.kind)).toContain('line-lost');
    expect(lost.taken).not.toContain('black|s1');
    expect(decide(lost, { 'black|s1': s.minute })).toEqual([]);
    expect(decide(lost, { 'black|s1': null })).toEqual([front]);
  });

  it('German counter-attack odds depend on whether the attacker has consolidated', () => {
    // A slow report (runner 120 minutes): by the time kr would go in, the attackers have had an hour on the trench, so it
    // needs counterAttackConsolidatedFactor (2) × 0.75 = 1.5 times the men it knows are there; 300 against 150 still go.
    const slow = firstOf(runStates(fixtureCounter({ runnerMin: 120 }), { endMinute: 400 }), 'counter-attack-ordered')!;
    expect(slow.factors).toMatchObject({ consolidated: 1, need: 1.5 });
    const fast = firstOf(runStates(fixtureCounter({ runnerMin: 2 }), { endMinute: 400 }), 'counter-attack-ordered')!;
    expect(fast.factors).toMatchObject({ consolidated: 0, need: 0.75 });
    // The mechanism alone: rir262's picture shows ger-front-a:001 lost at minute 4 with 150 of the enemy in it; kr has 200
    // men (1.33 to 1). Decided at minute 10 it would go in at 15, before the attackers have consolidated (need 0.75): it
    // goes. Decided at minute 100, it would meet them consolidated (need 1.5): it does not; with 300 men (2 to 1) it does.
    const { state, ctx } = initRun(...fixtureCounter(), { seed: 1 });
    const seg = state.segments[0]!.id;
    const decide = (minute: number, krMen: number) => {
      const hqs = state.hqs.map((h) =>
        h.formationId !== 'rir262'
          ? h
          : { ...h, picture: { ...h.picture, segments: { ...h.picture.segments, [seg]: 'allied' as const }, segmentsAt: { [seg]: 4 }, enemy: { [seg]: { men: 150, atMin: 4 } }, units: { ...h.picture.units, kr: { status: 'holding', men: krMen, atMin: 0 } } } },
      );
      return commandPhase({ ...state, minute, events: [], hqs }, ctx, 2).events.find((e) => e.kind === 'counter-attack-ordered');
    };
    expect(decide(10, 200)?.factors).toMatchObject({ consolidated: 0, need: 0.75, ratio: 1.33 });
    expect(decide(100, 200)).toBeUndefined();
    expect(decide(100, 300)?.factors).toMatchObject({ consolidated: 1, need: 1.5, ratio: 2 });
  });

  it('a division that has lost enough of its front orders its off-map reserves forward and plans a counter-attack', () => {
    const r = runStates(fixtureCounter({ divOrderSpeed: 3, offMapReserve: true }), { endMinute: 300 });
    const e = firstOf(r, 'reserve-ordered')!;
    expect(e.causes).toEqual(['ground-lost']);
    const after = r.states.find((s) => s.minute === e.minute)!;
    expect(after.reserves[0]).toMatchObject({ formationId: 'gres', status: 'ordered', orderedMin: e.minute });
    expect(after.hqs.find((h) => h.formationId === 'gd')!.pending.map((p) => p.kind)).toEqual(['divisional-counter-attack']);
    // The reserve marches (reserves.ts: 8 km at the fixture's 1 km/h); until it arrives the counter-attack waits.
    expect(firstOf(r, 'counter-attack-ordered')).toBeUndefined();
    // With the repository's march values it arrives at its entry point at 60 + 15 + (8 − onMapKm) / 4 · 60 + 30 and walks on
    // to the division's front; once the division's picture shows its companies there, it sends its reserve companies in,
    // divisionalCounterAttackDelayMin (30) after the arrival or at once.
    const run = runStates(fixtureReserves(), { endMinute: 400 });
    const ordered = firstOf(run, 'reserve-ordered')!;
    const arrived = firstOf(run, 'reserve-arrived')!;
    const at = ordered.minute + 15 + ((8 - arrived.factors!.onMapKm!) / 4) * 60 + 30;
    expect(arrived.factors!.arriveMin).toBeCloseTo(at, 0);
    const go = firstOf(run, 'counter-attack-ordered')!;
    expect(go.minute).toBeGreaterThan(arrived.minute);
    const known = run.states.find((x) => x.minute === go.minute)!.hqs.find((h) => h.formationId === 'gd')!;
    expect(['gres-g1', 'gres-g2', 'gres-g3', 'gres-g4'].every((id) => known.picture.units[id]!.status === 'holding')).toBe(true);
    expect(go.factors!.goAtMin).toBeCloseTo(Math.max(go.minute, at + 30), 0);
    expect(go.text).toMatch(/by 5 companies/);
    expect(go.refs).toContain(ordered.id);
  });

  it('orders reach only the companies they name', () => {
    const order: Order = { kind: 'hold', fromFormationId: 'cc', issuedMin: 0, unitIds: ['c2'] };
    const r = runStates(fixtureComms(), { endMinute: 200, at: (s, ctx) => send(s, ctx, { side: 'allied', kind: 'order', fromFormationId: 'cc', toFormationId: 'bn1', sentMin: 0, payload: order }) });
    const end = r.states.at(-1)!;
    expect(end.companies.find((c) => c.id === 'c1')!.orders).toEqual([]);
    expect(end.companies.find((c) => c.id === 'c2')!.orders).toHaveLength(1);
  });

  it('a pinned counter-attacking company takes up its counter-attack again when it recovers', () => {
    const { state, ctx } = initRun(...fixtureCounter(), { seed: 1 });
    const order: Order = { kind: 'counter-attack', target: { segmentId: state.segments[0]!.id }, fromFormationId: 'rir262', issuedMin: 0 };
    const s: SimState = { ...state, minute: 2, events: [], companies: state.companies.map((c) => (c.id === 'kr' ? { ...c, status: 'pinned' as const, intent: 'go-to-ground' as const, orders: [order] } : c)) };
    const out = morale(s, ctx, 2, { damage: [] });
    expect(out.companies.find((c) => c.id === 'kr')!.status).toBe('counter-attacking');
  });

  it('a taken line whose segment the enemy takes back is lost (line-lost, with causes and refs), and can be taken again', () => {
    const f = fixtureStall({ holdout: 20 });
    const r = runStates(f, { endMinute: 120 });
    const taken = r.states.find((s) => s.taken.includes('black|s1'))!;
    const ctx = r.ctx;
    const seg = taken.segments.find((x) => x.featureId === 'ger-rear-k3')!;
    // The enemy takes the trench back (as a counter-attack would).
    const s: SimState = { ...taken, minute: taken.minute + 2, events: [], segments: taken.segments.map((x) => (x.id === seg.id ? { ...x, holder: 'central' as const } : x)) };
    const out = takeLines(s, ctx);
    const lost = out.events.find((e) => e.kind === 'line-lost')!;
    expect(lost).toMatchObject({ lineId: 'black', sectorId: 's1', causes: ['ground-lost'] });
    expect(lost.refs).toContain(taken.takenEventIds['black|s1']);
    expect(out.taken).not.toContain('black|s1');
    // Back in allied hands, the line is taken again.
    const again = takeLines({ ...out, minute: out.minute + 2, events: [], segments: out.segments.map((x) => (x.id === seg.id ? { ...x, holder: 'allied' as const } : x)) }, ctx);
    expect(again.events.map((e) => e.kind)).toEqual(['line-taken']);
  });

  it('the run does not end while an order is on its way or an operation waits for its hour', () => {
    const f = fixtureOperation({ notBefore: '1916-07-01T12:00' });
    const r = runScenario(...f, { seed: 1 });
    expect(r.events.some((e) => e.kind === 'operation-launched')).toBe(true);
    expect(r.endMinute).toBeGreaterThan(270);
  });
});

// ---- scheduled minutes and quiet steps -------------------------------------------------------------------------------

/** A run stepped as runScenario steps it (quiet steps of `quietMin` when nothing is busy), keeping every state. */
function quietRun(f: [Scenario, Models], quietMin: number, endMinute: number, seed = 1): SimState[] {
  const m = withQuietStep(f[1], quietMin);
  const { state, ctx } = initRun(f[0], m, { seed });
  let s = state;
  const out = [s];
  while (s.minute < endMinute) {
    const dt = isBusy(s, ctx) ? 2 : quietStep(s, ctx, 2, quietMin);
    out.push((s = runPipeline(s, ctx, Math.min(dt, endMinute - s.minute))));
  }
  return out;
}

/** Events and the companies' states at the end compare equal (company numbers to 1e-9: fatigue sums differ in the last digits). */
function expectSameBattle(coarse: SimState[], fine: SimState[]): void {
  const ev = (xs: SimState[]) => JSON.stringify(xs.flatMap((s) => s.events));
  expect(ev(coarse)).toBe(ev(fine));
  const a = coarse.at(-1)!.companies;
  const b = fine.at(-1)!.companies;
  expect(a.map((c) => [c.id, c.status, c.men, c.killed, c.wounded, c.captured])).toEqual(b.map((c) => [c.id, c.status, c.men, c.killed, c.wounded, c.captured]));
  for (let i = 0; i < a.length; i++) {
    expect(a[i]!.x).toBeCloseTo(b[i]!.x, 9);
    expect(a[i]!.suppression).toBeCloseTo(b[i]!.suppression, 9);
    expect(a[i]!.morale).toBeCloseTo(b[i]!.morale, 9);
  }
}

describe('the command model and quiet steps', () => {
  it('registers its sources with the right startsMovement flags', () => {
    const names = SCHEDULES.map(([n]) => n);
    for (const n of ['stall-checks', 'operation-starts', 'order-starts', 'off-map-attacks', 'counter-attack-retries']) expect(names).toContain(n);
    // Stall checks and operations' hours are decisions (their orders set units moving when they arrive).
    const stall = quietRun(fixtureStall({ stallToleranceMin: 61 }), 10, 60);
    const { ctx } = initRun(...fixtureStall({ stallToleranceMin: 61 }), { seed: 1 });
    const due = stallChecks(stall.at(-1)!, ctx);
    expect(due.length).toBeGreaterThan(0);
    for (const x of due) expect(x.startsMovement).toBe(false);
    const op = initRun(...fixtureOperation({ notBefore: '1916-07-01T09:41' }), { seed: 1 });
    expect(operationStarts(op.state, op.ctx)).toEqual([{ minute: 131, startsMovement: false }]);
    const off = fixtureComms();
    off[0].offMap = { fire: [], attacks: [offMapAttack()] };
    const o = initRun(...off, { seed: 1 });
    expect(offMapAttackWindows(o.state, o.ctx)).toEqual([{ minute: 101, startsMovement: true }, { minute: 131, startsMovement: false }]);
  });

  it('a stall decided inside a quiet stretch is decided at the same minute however the battle is stepped', () => {
    // The tolerance puts the decision at minute 33 + 61 = 94, when nothing has moved for an hour.
    const f = () => fixtureStall({ stallToleranceMin: 61 });
    const coarse = quietRun(f(), 10, 200);
    const fine = quietRun(f(), 2, 200);
    const e = coarse.flatMap((s) => s.events).find((x) => x.kind === 'order-issued')!;
    expect(e.minute).toBe(94);
    expectSameBattle(coarse, fine);
  });

  it('an operation whose hour falls in a quiet stretch launches at the same minute however the battle is stepped', () => {
    const f = () => fixtureOperation({ notBefore: '1916-07-01T09:41' });
    const coarse = quietRun(f(), 10, 250);
    const fine = quietRun(f(), 2, 250);
    expect(coarse.flatMap((s) => s.events).find((x) => x.kind === 'operation-launched')!.minute).toBe(132);
    expectSameBattle(coarse, fine);
  });

  it('a counter-attack formed up inside a quiet stretch goes in on the same minute however the battle is stepped', () => {
    // A slow runner (60 minutes) brings the news of the loss when the battle has gone quiet; forming up takes 120
    // minutes, so kr holds its order a while before it goes.
    const f = () => {
      const x = fixtureCounter({ runnerMin: 60 });
      const de = x[1].doctrines['de-1917']!;
      de.defence!.localCounterAttackDelayMin = { value: 121, estimate: 'test' };
      return x;
    };
    const coarse = quietRun(f(), 10, 300);
    const fine = quietRun(f(), 2, 300);
    expect(coarse.some((s) => orderStarts(s).length > 0)).toBe(true);
    expect(coarse.some((s) => s.companies.find((c) => c.id === 'kr')!.status === 'counter-attacking')).toBe(true);
    expectSameBattle(coarse, fine);
  });

  it('an off-map attack inside a quiet stretch holds its target down the same however the battle is stepped', () => {
    const f = () => {
      const x = fixtureComms();
      // The attackers wait 400 minutes: from minute 101 to 131 only the off-map attack happens.
      for (const c of x[0].forces[0]!.formations[0]!.children![0]!.children![0]!.children![0]!.companies!) c.startAfterMin = est(400);
      x[0].offMap = { fire: [], attacks: [offMapAttack()] };
      return x;
    };
    const coarse = quietRun(f(), 10, 200);
    const fine = quietRun(f(), 2, 200);
    const opened = coarse.flatMap((s) => s.events).find((e) => e.kind === 'off-map-attack')!;
    expect(opened).toMatchObject({ minute: 102, causes: ['off-map-fire'] });
    // Held at a quarter suppression or more in each step of its window (fire comes after the command phase; resolve then
    // lets it wear off), with the cause on the companies' recent fire.
    const inWindow = coarse.find((s) => s.minute === 110)!;
    const { ctx } = initRun(...f(), { seed: 1 });
    const held = commandPhase({ ...inWindow, minute: 112, events: [] }, ctx, 2);
    for (const id of ['k1', 'k2']) {
      expect(held.companies.find((c) => c.id === id)!.suppression).toBeGreaterThanOrEqual(0.25);
      const k = inWindow.companies.find((c) => c.id === id)!;
      expect(k.suppression).toBeGreaterThan(0);
      expect(k.recentFire.at(-1)).toMatchObject({ eventId: opened.id, causes: ['off-map-fire'] });
    }
    expect(coarse.find((s) => s.minute >= 140)!.companies.find((c) => c.id === 'k1')!.recentFire.some((x) => x.minute > 131)).toBe(false);
    expect(coarse.find((s) => s.minute === 100)!.companies.find((c) => c.id === 'k1')!.suppression).toBe(0);
    expectSameBattle(coarse, fine);
  });

  it('a counter-attack ordered again after counterAttackRetryMin, inside a quiet stretch, is ordered at the same minute however the battle is stepped', () => {
    // rir262 remembers counter-attacks on both its segments ordered at Zero (retry 101): the losses known by ~34 wait for it.
    const f = () => {
      const x = fixtureCounter();
      x[1].doctrines['de-1917']!.defence!.counterAttackRetryMin = { value: 101, estimate: 'test', description: 'test' };
      return x;
    };
    const run = (quietMin: number) => {
      const m = withQuietStep(f()[1], quietMin);
      const { state, ctx } = initRun(f()[0], m, { seed: 1 });
      const mem = Object.fromEntries(state.segments.map((x) => [x.id, { hqId: 'rir262', atMin: 0 }]));
      let s: SimState = { ...state, command: { ...state.command, counterAttacks: mem } };
      const out = [s];
      const due = counterAttackRetries(s, ctx);
      expect(due).toEqual([]); // the HQ does not yet know the segment lost
      while (s.minute < 250) out.push((s = runPipeline(s, ctx, isBusy(s, ctx) ? 2 : quietStep(s, ctx, 2, quietMin))));
      return out;
    };
    const coarse = run(10);
    const fine = run(2);
    const e = coarse.flatMap((s) => s.events).find((x) => x.kind === 'counter-attack-ordered' && x.segmentId === coarse[0]!.segments[0]!.id)!;
    expect(e.minute).toBe(102);
    expect(e.factors!.again).toBe(1);
    expectSameBattle(coarse, fine);
  });

  it('commandPending holds the run while an order is on its way', () => {
    const r = runStates(fixtureStall(), { endMinute: 300 });
    const e = firstOf(r, 'order-issued')!;
    const at = r.states.find((s) => s.minute === e.minute)!;
    expect(commandPending(at, r.ctx)).toBe(true);
  });
});

/** An off-map attack on the German trench (`ger-front-a`), minutes 101 to 131 of the fixture's clock (Zero 07:30). */
function offMapAttack(): NonNullable<Scenario['offMap']>['attacks'][number] {
  return {
    id: 'flank', side: 'allied', name: 'A flank division', window: { from: '1916-07-01T09:11', to: '1916-07-01T09:41' }, targetFeatureId: 'ger-front-a',
    suppressFrac: { value: 0.25, estimate: 'test' }, cite: { value: 'test', estimate: 'test' },
  };
}
