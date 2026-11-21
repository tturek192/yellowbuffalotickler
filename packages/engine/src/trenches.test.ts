import { describe, expect, it } from 'vitest';
import type { Scenario } from '@wwi/scenario';
import { est } from '@wwi/scenario/test-fixtures';
import { runPipeline } from './pipeline';
import type { RunRecord } from './record';
import { initRun, runScenario } from './run';
import type { Models } from './run';
import { SCHEDULES } from './schedule';
import { takeLines } from './step';
import type { SimState, StepContext } from './step';
import { emergence } from './gap';
import { captureSegments, dugoutSorties, sorties } from './trenches';
import {
  companyIds, eventsOf, fixtureArtillery, fixtureDugouts, fixtureWithDoctrineV3, lineTakenMinute, ofKind, rowsOf, runDugouts, runHoldout,
  runOverrun, totalsOverTime, withQuietStep,
} from './test-helpers';

/** Every ref of every event points to an earlier event. */
const refsBackward = (r: RunRecord): boolean => r.events.every((e) => e.refs.every((x) => x < e.id));

describe('the fight for trenches', () => {
  it('trapped defenders left in dugouts sortie against later waves unless mopped up', () => {
    expect(eventsOf(runDugouts({ mopUp: false })).map((e) => e.kind)).toContain('dugout-sortie');
    expect(eventsOf(runDugouts({ mopUp: true })).map((e) => e.kind)).not.toContain('dugout-sortie');
  });

  it('a line is not taken while a defended segment on it still holds out', () => {
    expect(lineTakenMinute(runHoldout({ holdout: true }))).toBeNull();
    expect(lineTakenMinute(runHoldout({ holdout: false }))).not.toBeNull();
  });

  it('German gun positions overrun after their horses are lost count as captured guns', () => {
    expect(runOverrun({ horsesLost: true }).summary.gunsCaptured).toBeGreaterThan(0);
    // With its horses the battery gets its guns away.
    expect(runOverrun({ horsesLost: false }).summary.gunsCaptured).toBe(0);
  });

  it('guns-captured refers to the loss of the segment and has its causes; captured guns fire no more', () => {
    const r = runOverrun({ horsesLost: true });
    const [g] = ofKind(r, 'guns-captured');
    expect(g!.factors!.guns).toBe(6);
    const lost = r.events[g!.refs[0]!]!;
    expect(lost.kind).toBe('segment-lost');
    expect(g!.causes).toEqual(lost.causes);
    expect(ofKind(r, 'shelled').filter((e) => e.minute > g!.minute && e.text.startsWith('German defensive'))).toHaveLength(0);
  });

  it('a battery whose horses are lost after its segment fell is captured then, with cause horses-gassed (the Task 14 hook)', () => {
    const [s, m] = fixtureArtillery();
    s.artillery.push({ id: 'gb', side: 'central', weapon: '18pdr', count: est(6), role: 'defensive', position: [400, 200], horseDrawn: true });
    const { state, ctx } = initRun(s, m, { seed: 1 });
    const lostSeg = { ...state.segments[0]!, holder: 'allied' as const, holderEventId: 0 };
    const base: SimState = { ...state, minute: 40, events: [], segments: [lostSeg, ...state.segments.slice(1)] };
    expect(captureSegments(base, ctx).batteries.find((b) => b.id === 'gb')!.captured).toBe(false);
    const after = captureSegments({ ...base, batteries: base.batteries.map((b) => (b.id === 'gb' ? { ...b, horses: false } : b)) }, ctx);
    expect(after.batteries.find((b) => b.id === 'gb')!.captured).toBe(true);
    expect(after.events.find((e) => e.kind === 'guns-captured')).toMatchObject({ causes: ['horses-gassed'], refs: [0], factors: { guns: 6 } });
  });

  it('a segment is lost when attackers reach a garrison trapped below; the event says why and refers to the trapping', () => {
    const r = runDugouts({ mopUp: false });
    const lost = ofKind(r, 'segment-lost');
    expect(lost.map((e) => e.segmentId).sort()).toEqual(['ger-front-a:001', 'ger-front-a:002']);
    for (const e of lost) {
      expect(e.causes).toContain('defenders-trapped');
      expect(r.events[e.refs[0]!]!.kind).toBe('defenders-trapped');
      expect(e.factors!.defenders).toBe(0);
    }
    expect(refsBackward(r)).toBe(true);
  });

  it('a garrison up in its trench is not overrun until the attackers outnumber it captureRatio to 1', () => {
    // 300 attackers against 400 (no): the holdout. Against 20: lost, outnumbered.
    expect(ofKind(runHoldout({ holdout: true }), 'segment-lost').filter((e) => e.segmentId!.startsWith('ger-rear'))).toHaveLength(0);
    const taken = ofKind(runHoldout({ holdout: false }), 'segment-lost').find((e) => e.segmentId!.startsWith('ger-rear'))!;
    expect(taken.causes).toContain('outnumbered');
    expect(taken.factors!.defenders).toBe(20);
    expect(taken.factors!.attackers).toBeGreaterThanOrEqual(3 * 20);
  });

  it('men left in the dugouts come up after sortieDelayMin, fire from their trench, and are not new men', () => {
    const r = runDugouts({ mopUp: false });
    const trapped = ofKind(r, 'defenders-trapped');
    const sorties = ofKind(r, 'dugout-sortie');
    expect(sorties.map((e) => e.unitId).sort()).toEqual(['k1', 'k2']);
    for (const e of sorties) {
      expect(e.causes).toEqual(['dugouts-uncleared']);
      const t = r.events[e.refs[0]!]!;
      expect(t.kind).toBe('defenders-trapped');
      expect(e.minute - t.minute).toBeGreaterThanOrEqual(30);
      expect(e.factors!.men).toBe(trapped.find((x) => x.segmentId === e.segmentId)!.factors!.inDugouts);
    }
    for (const id of companyIds(r)) expect(new Set(totalsOverTime(r, id))).toHaveLength(1);
  });

  it('a sortie with no attacker nearby cannot retake a segment behind a taken line, but a 3:1 sortie can', () => {
    // The Black Line (x 1150) is taken at minute 32; the trench at x 150 is behind it.
    const alone = runDugouts({ mopUp: false });
    expect(ofKind(alone, 'line-taken')[0]!.minute).toBeLessThan(ofKind(alone, 'dugout-sortie')[0]!.minute);
    expect(ofKind(alone, 'segment-retaken')).toHaveLength(0);
    expect(alone.snapshots.at(-1)!.segments.rows.map((x) => x[1])).toEqual(['allied', 'allied']);
    // 15 men holding the trench against about 60 from each dugout: 3 to 1, retaken.
    const held = runDugouts({ mopUp: false, holders: 15 });
    const retaken = ofKind(held, 'segment-retaken');
    expect(retaken.map((e) => e.segmentId).sort()).toEqual(['ger-front-a:001', 'ger-front-a:002']);
    for (const e of retaken) {
      expect(e.factors!.defenders).toBe(15);
      expect(e.factors!.attackers).toBeGreaterThanOrEqual(45);
      expect(e.causes).toEqual(['dugouts-uncleared', 'outnumbered']);
      expect(held.events[e.refs[0]!]!.kind).toBe('dugout-sortie');
    }
    // 30 men are too many for 60 to retake.
    expect(ofKind(runDugouts({ mopUp: false, holders: 30 }), 'segment-retaken')).toHaveLength(0);
  });

  it('a segment ahead of the furthest taken line, abandoned by its holders, can be retaken', () => {
    const { state, ctx } = initRun(...fixtureDugouts({ mopUp: false }), { seed: 1 });
    const k1 = { ...state.companies.find((c) => c.id === 'k1')!, posture: 'in-trench' as const, men: 50 };
    const s: SimState = {
      ...state, minute: 40, events: [],
      companies: state.companies.map((c) => (c.id === 'k1' ? k1 : c.side === 'allied' ? { ...c, x: 900 } : c)),
      segments: state.segments.map((x) => ({ ...x, holder: 'allied' as const, holderEventId: 0 })),
    };
    // Black not taken: the abandoned trench goes back.
    expect(captureSegments(s, ctx).events.filter((e) => e.kind === 'segment-retaken').map((e) => e.segmentId)).toEqual(['ger-front-a:001']);
    // Black taken: it is the attackers' rear, and stays theirs.
    expect(captureSegments({ ...s, taken: ['black|s1'] }, ctx).events.filter((e) => e.kind === 'segment-retaken')).toHaveLength(0);
  });

  it('enemy companies at the entrances hold a dugout sortie; its clock starts when the last of them leaves', () => {
    const { state, ctx } = initRun(...fixtureDugouts({ mopUp: false }), { seed: 1 });
    const point = { companyId: 'k1', point: [150, 100] as [number, number], men: 50, leftMin: 0, unguardedMin: 0, eventId: 0, cleared: 0 };
    const k1 = { ...state.companies.find((c) => c.id === 'k1')!, men: 50, posture: 'in-dugout' as const };
    const base: SimState = {
      ...state, minute: 40, events: [],
      companies: state.companies.map((c) => (c.id === 'k1' ? k1 : c.id === 'c1' ? { ...c, x: 150, y: 130, status: 'consolidating' as const } : c.side === 'allied' ? { ...c, x: 900 } : c)),
      segments: state.segments.map((x, i) => ({ ...x, holder: 'allied' as const, holderEventId: 0, dugoutPoints: i === 0 ? [point] : [] })),
    };
    // c1 (no mopper) stands 30 m from the entrances: no sortie, and the clock restarts.
    const guarded = sorties(base, ctx);
    expect(guarded.events.filter((e) => e.kind === 'dugout-sortie')).toHaveLength(0);
    expect(guarded.segments[0]!.dugoutPoints[0]!.unguardedMin).toBe(40);
    // It leaves at 40: nothing at 60, the sortie at 70.
    const gone = { ...guarded, companies: guarded.companies.map((c) => (c.id === 'c1' ? { ...c, x: 900 } : c)) };
    expect(sorties({ ...gone, minute: 60 }, ctx).events.filter((e) => e.kind === 'dugout-sortie')).toHaveLength(0);
    expect(sorties({ ...gone, minute: 70 }, ctx).events.filter((e) => e.kind === 'dugout-sortie')).toHaveLength(1);
    // Nobody comes up while a barrage falls on the trench at the entrances.
    const shelled = { ...gone, minute: 70, segments: gone.segments.map((x, i) => (i === 0 ? { ...x, barrageLastOverMin: 70, barrageOn: [4] } : x)) };
    expect(sorties(shelled, ctx).events.filter((e) => e.kind === 'dugout-sortie')).toHaveLength(0);
  });

  it('a retake brings up the garrison still below as a sortie', () => {
    // k1 is still below when k2, up in the trench, retakes the segment.
    const { state, ctx } = initRun(...fixtureDugouts({ mopUp: false }), { seed: 1 });
    const k1 = { ...state.companies.find((c) => c.id === 'k1')!, men: 50, posture: 'in-dugout' as const };
    const k2 = { ...state.companies.find((c) => c.id === 'k2')!, x: 150, y: 120, posture: 'in-trench' as const };
    const s: SimState = {
      ...state, minute: 40, events: [],
      companies: state.companies.map((c) => (c.id === 'k1' ? k1 : c.id === 'k2' ? k2 : c.side === 'allied' ? { ...c, x: 900 } : c)),
      segments: state.segments.map((x, i) => ({ ...x, holder: 'allied' as const, holderEventId: 0, dugoutPoints: i === 0 ? [{ companyId: 'k1', point: [150, 100] as [number, number], men: 50, leftMin: 0, unguardedMin: 0, eventId: 0, cleared: 0 }] : [] })),
    };
    const out = captureSegments(s, ctx);
    const [ret, sortie] = out.events;
    expect(ret!.kind).toBe('segment-retaken');
    expect(sortie).toMatchObject({ kind: 'dugout-sortie', unitId: 'k1', causes: ['dugouts-uncleared'], refs: [0, ret!.id] });
    expect(out.companies.find((c) => c.id === 'k1')).toMatchObject({ posture: 'in-trench', sortieEventId: sortie!.id });
  });

  it('mopping up clears the dugouts at mopUpRateMenPerMin with bombs; the men cleared are prisoners of the garrison they belong to', () => {
    const r = runDugouts({ mopUp: true });
    const cleared = ofKind(r, 'dugout-cleared');
    expect(cleared.map((e) => e.segmentId).sort()).toEqual(['ger-front-a:001', 'ger-front-a:002']);
    for (const e of cleared) {
      expect(e.causes).toEqual(['defenders-trapped']);
      expect(r.events[e.refs[0]!]!.kind).toBe('defenders-trapped');
      // 3 men a minute: about 60 men take about 20 minutes.
      expect(e.factors!.minutesBelow).toBeGreaterThanOrEqual(Math.floor(e.factors!.prisoners / 3) - 4);
    }
    for (const k of ['k1', 'k2']) {
      const last = rowsOf(r, k).at(-1)!;
      expect(last.men).toBe(0);
      expect(last.captured).toBe(120);
    }
    expect(r.summary.prisoners.allied).toBe(240);
    for (const id of companyIds(r)) expect(new Set(totalsOverTime(r, id))).toHaveLength(1);
    expect(refsBackward(r)).toBe(true);
  });

  it('mopping up uses the moppers’ bombs: bombsPerManCleared for each man cleared', () => {
    const f = fixtureDugouts({ mopUp: true });
    const { state, ctx } = initRun(f[0], f[1], { seed: 1 });
    const bombs0 = state.companies.find((c) => c.id === 'm1')!.bombs;
    const { state: s, events } = steps(state, ctx, 30);
    const trappedK1 = events.find((e) => e.kind === 'defenders-trapped' && e.segmentId === 'ger-front-a:001')!.factors!.captured!;
    const clearedFromK1 = s.companies.find((c) => c.id === 'k1')!.captured - trappedK1;
    expect(clearedFromK1).toBeGreaterThan(0);
    expect(bombs0 - s.companies.find((c) => c.id === 'm1')!.bombs).toBeCloseTo(0.5 * clearedFromK1, 9);
  });

  it('dugout sorties are scheduled (moving nobody), and quiet steps do not change them', () => {
    expect(SCHEDULES.map(([name]) => name)).toContain('dugout-sorties');
    const f = fixtureDugouts({ mopUp: false });
    const { state, ctx } = initRun(f[0], f[1], { seed: 1 });
    const seg = state.segments[0]!;
    const s = { ...state, minute: 10, segments: [{ ...seg, dugoutPoints: [{ companyId: 'k1', point: [150, 100] as [number, number], men: 50, leftMin: 6, unguardedMin: 8, eventId: 0, cleared: 0 }] }, ...state.segments.slice(1)] };
    expect(dugoutSorties(s, ctx)).toEqual([{ minute: 38, startsMovement: false }]);
    const coarse = runScenario(...withQuiet(fixtureDugouts({ mopUp: false, holders: 15 }), 10), { seed: 3, endMinute: 120 });
    const fine = runScenario(...withQuiet(fixtureDugouts({ mopUp: false, holders: 15 }), 2), { seed: 3, endMinute: 120 });
    expect(ofKind(coarse, 'dugout-sortie').length).toBeGreaterThan(0);
    expect(ofKind(coarse, 'segment-retaken').length).toBeGreaterThan(0);
    expect(ofKind(coarse, 'ammunition-exhausted').length).toBeGreaterThan(0);
    expect(JSON.stringify(coarse.events)).toBe(JSON.stringify(fine.events));
  });
});

describe('the barrage on a segment is local', () => {
  // ger-front-a:001 runs from y 0 to 200 at x 150 (samples 25 m apart, indices 0 to 8); c1 stands at its south end.
  const setup = (barrageOn: number[]) => {
    const { state, ctx } = initRun(...fixtureArtillery(), { seed: 1 });
    const s: SimState = {
      ...state, minute: 20, events: [],
      companies: state.companies.map((c) => (c.id === 'c1' ? { ...c, x: 150, y: 10, status: 'advancing' as const } : c.side === 'allied' ? { ...c, x: -900 } : c)),
      segments: state.segments.map((x, i) => (i === 0 ? { ...x, barrageLastOverMin: 20, barrageOn } : x)),
    };
    return { s, ctx };
  };

  it('a long segment partly under the barrage can be trapped and taken where the attackers stand, but not where shells fall near them', () => {
    const far = setup([6, 7, 8]);
    const on001 = (st: SimState) => st.events.filter((e) => e.segmentId === 'ger-front-a:001').map((e) => e.kind);
    const trappedFar = emergence(far.s, far.ctx);
    expect(on001(trappedFar)).toEqual(['defenders-trapped']);
    expect(captureSegments(trappedFar, far.ctx).events.filter((e) => e.kind === 'segment-lost').map((e) => e.segmentId)).toEqual(['ger-front-a:001']);
    const near = setup([0, 1, 2, 3]);
    expect(on001(emergence(near.s, near.ctx))).toEqual([]);
    // The garrison still below (not trapped, not up) would not be taken either, with the shells on the trench at c1.
    const k1Up = { ...near.s, companies: near.s.companies.map((c) => (c.id === 'k1' ? { ...c, posture: 'in-trench' as const, men: 10 } : c)) };
    expect(on001(captureSegments(k1Up, near.ctx))).toEqual([]);
    expect(on001(captureSegments({ ...k1Up, segments: far.s.segments }, near.ctx))).toEqual(['segment-lost']);
  });
});

describe('the line-taken rule', () => {
  const settle = (status: string) => {
    const { state, ctx } = initRun(...fixtureWithDoctrineV3(), { seed: 1 });
    const s: SimState = {
      ...state,
      minute: 60,
      events: [],
      companies: state.companies.map((c) =>
        c.id === 'c1' ? { ...c, x: 1150, status: 'consolidating' as const, reached: { eventId: 0, causes: ['followed-barrage' as const] } } : c.id === 'c2' ? { ...c, status: status as 'destroyed' } : c,
      ),
    };
    return takeLines(s, ctx).events.filter((e) => e.kind === 'line-taken');
  };

  it('a destroyed, surrendered or pinned attacker does not keep its line from being taken; one still advancing does', () => {
    for (const st of ['destroyed', 'surrendered', 'pinned', 'consolidating']) expect(settle(st)).toHaveLength(1);
    expect(settle('advancing')).toHaveLength(0);
    expect(settle('falling-back')).toHaveLength(0);
  });

  it('needs at least one company consolidating', () => {
    const { state, ctx } = initRun(...fixtureWithDoctrineV3(), { seed: 1 });
    const s: SimState = { ...state, minute: 60, events: [], companies: state.companies.map((c) => (c.side === 'allied' ? { ...c, status: 'destroyed' as const } : c)) };
    expect(takeLines(s, ctx).events.filter((e) => e.kind === 'line-taken')).toHaveLength(0);
  });

  it('takes its causes from what happened, with refs to the arrivals and the segments taken', () => {
    const [s, m] = fixtureArtillery();
    // An objective line on the German front trench itself (x 150), so its two segments belong to it.
    s.lines.push({ id: 'near', name: 'Near Line', kind: 'objective', color: '#777777', points: [[170, 0], [170, 400]] });
    for (const c of s.forces[0]!.formations[0]!.companies!) c.objectiveLineId = 'near';
    const r = runScenario(s, m, { seed: 1, endMinute: 60 });
    const [t] = ofKind(r, 'line-taken');
    expect(t!.causes).toEqual(['followed-barrage', 'defenders-trapped']);
    const kinds = t!.refs.map((x) => r.events[x]!.kind);
    expect(kinds).toContain('company-reached');
    expect(kinds).toContain('segment-lost');
    expect(kinds).toContain('defenders-trapped');
    expect(t!.factors).toMatchObject({ segments: 2 });
  });
});

// ---- helpers ----

/** n pipeline steps of 2 minutes, with every event they emitted. */
function steps(state: SimState, ctx: StepContext, n: number): { state: SimState; events: RunRecord['events'] } {
  let s = state;
  const events = [...state.events];
  for (let i = 0; i < n; i++) {
    s = runPipeline(s, ctx, 2);
    events.push(...s.events);
  }
  return { state: s, events };
}
const withQuiet = (f: [Scenario, Models], n: number): [Scenario, Models] => [f[0], withQuietStep(f[1], n)];
