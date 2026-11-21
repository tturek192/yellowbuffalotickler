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
import { captureSegments, dugoutSorties } from './trenches';
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

  it('men left in the dugouts come up after sortieDelayMin, retake the segment the attackers left, and are not new men', () => {
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
    const retaken = ofKind(r, 'segment-retaken');
    expect(retaken.length).toBeGreaterThan(0);
    expect(retaken[0]!.causes).toContain('dugouts-uncleared');
    for (const id of companyIds(r)) expect(new Set(totalsOverTime(r, id))).toHaveLength(1);
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
    const s = { ...state, minute: 10, segments: [{ ...seg, dugoutPoints: [{ companyId: 'k1', point: [150, 100] as [number, number], men: 50, leftMin: 8, eventId: 0, cleared: 0 }] }, ...state.segments.slice(1)] };
    expect(dugoutSorties(s, ctx)).toEqual([{ minute: 38, startsMovement: false }]);
    const coarse = runScenario(...withQuiet(fixtureDugouts({ mopUp: false }), 10), { seed: 3, endMinute: 120 });
    const fine = runScenario(...withQuiet(fixtureDugouts({ mopUp: false }), 2), { seed: 3, endMinute: 120 });
    // What the trench fight did (the artillery's own ammunition accounting at the barrage's end is another matter).
    const KINDS = ['defenders-trapped', 'segment-lost', 'segment-retaken', 'dugout-sortie', 'dugout-cleared', 'company-reached', 'line-taken'];
    const fight = (r: RunRecord) => JSON.stringify(r.events.filter((e) => KINDS.includes(e.kind)).map(({ id: _, refs: __, ...e }) => e));
    expect(ofKind(coarse, 'dugout-sortie').length).toBeGreaterThan(0);
    expect(ofKind(coarse, 'segment-retaken').length).toBeGreaterThan(0);
    expect(fight(coarse)).toBe(fight(fine));
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
