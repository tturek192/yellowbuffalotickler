import { describe, expect, it } from 'vitest';
import { est } from '@wwi/scenario/test-fixtures';
import { commandPending } from './command';
import { endCheck, finalLines, holderOf, lullMin } from './end';
import { initRun, runScenario } from './run';
import type { RunRecord } from './record';
import type { Message, Report } from './types';
import { v } from '@wwi/scenario';
import { fixtureFire, fixtureTables, fixtureWithDoctrineV3, ofKind } from './test-helpers';

/**
 * The v3 fixture with a German knoll on the Black Line its key ground: the two assault companies take the Black Line, its
 * final objective, and stand on the knoll.
 */
function runEasy(): RunRecord {
  const [s, m] = fixtureWithDoctrineV3();
  s.features.push({ id: 'knoll', kind: 'strongpoint', side: 'central', geometry: { type: 'Point', coordinates: [1150, 100] }, cite: est('test') });
  s.end = { keyGround: [{ id: 'knoll', name: 'The knoll', featureId: 'knoll', cite: est('test') }], lullMin: est(120) };
  return runScenario(s, m, { seed: 1 });
}

/** Four machine guns to each garrison and a ridge between: the attackers are held off under fire until the time cap. */
function runStalled(): RunRecord {
  const [s, m] = fixtureFire({ mgs: 4, startX: -500 });
  s.timeLimitMinutes = 240;
  s.end = { keyGround: [{ id: 'front', name: 'The German front trench', featureId: 'ger-front-a', cite: est('test') }], lullMin: est(120) };
  return runScenario(s, m, { seed: 1 });
}

describe('the run end and the winner (Task 15)', () => {
  it('a battle that stalls ends at the time cap with reason time-cap; one where the attacker holds everything ends objectives-held', () => {
    const stalled = runStalled();
    expect(stalled.summary.endReason).toBe('time-cap');
    expect(stalled.summary.endedAt).toBe(240);
    expect(ofKind(stalled, 'direct-fire').some((e) => e.minute > 200)).toBe(true);
    const easy = runEasy();
    expect(easy.summary.endReason).toBe('objectives-held');
    expect(easy.summary.lineTaken.map((t) => t.lineId)).toContain('black');
  });

  it('the winner is whoever holds the key ground at the end', () => {
    const easy = runEasy();
    expect(easy.summary.winner).toBe('allied');
    expect(easy.summary.keyGround).toEqual([{ id: 'knoll', name: 'The knoll', holder: 'allied' }]);
    // Held off, the Germans keep it.
    expect(runStalled().summary.winner).toBe('central');
  });

  it('emits run-ended last, with the reason in its factors', () => {
    const r = runEasy();
    const last = r.events.at(-1)!;
    expect(last.kind).toBe('run-ended');
    expect(last.minute).toBe(r.summary.endedAt);
    expect(last.factors).toMatchObject({ 'reason:objectives-held': 1, keyGroundAllied: 1, keyGroundCentral: 0 });
    expect(ofKind(r, 'run-ended')).toHaveLength(1);
  });

  it('final objectives are each sector last leg; without an end section the lull is the time limit, listed in defaultsUsed', () => {
    const [s, m] = fixtureWithDoctrineV3();
    const { ctx } = initRun(s, m, { seed: 1 });
    expect(finalLines(ctx)).toEqual(s.sectors.map((x) => `${x.legs.at(-1)!.toLineId}|${x.id}`));
    expect(lullMin(ctx)).toBe(s.timeLimitMinutes);
    expect([...ctx.defaultsUsed]).toContain(`end.lullMin ← timeLimitMinutes, ${s.timeLimitMinutes} (no end section)`);
    const r = runScenario(s, m, { seed: 1 });
    expect(r.summary.winner).toBeNull();
    expect(r.defaultsUsed).toContain('end.keyGround ← none: no winner is named');
  });

  it('a run waiting for nothing ends in a lull; one with something due within end.lullMin waits', () => {
    // The attackers held at their start line by the timetable: a lull from Zero, with a wave due at 300.
    const [s, m] = fixtureWithDoctrineV3();
    for (const c of s.forces[0]!.formations[0]!.companies!) c.startAfterMin = est(300);
    s.end = { keyGround: [], lullMin: est(120) };
    const { state, ctx } = initRun(s, m, { seed: 1 });
    const quiet = { ...state, minute: 100, events: [], barrages: state.barrages.map((b) => ({ ...b, phase: 'done' as const })) };
    const waiting = quiet.companies.map((c) => (c.side === 'allied' ? { ...c, status: 'holding' as const } : c));
    // Nothing due: a lull.
    expect(endCheck({ ...quiet, companies: waiting }, ctx)).toEqual({ ended: true, reason: 'lull' });
    // A company due to start within lullMin: not yet.
    const due = quiet.companies.map((c) => (c.side === 'allied' ? { ...c, status: 'waiting' as const, startMin: 150 } : c));
    expect(endCheck({ ...quiet, companies: due }, ctx).ended).toBe(false);
    // Due only after lullMin: a lull.
    const late = quiet.companies.map((c) => (c.side === 'allied' ? { ...c, status: 'holding' as const, startMin: 900 } : c));
    expect(endCheck({ ...quiet, companies: late }, ctx)).toEqual({ ended: true, reason: 'lull' });
  });

  it('a report on its way that tells of a change keeps the run going; a routine one does not (fix round 1, I-1)', () => {
    const [s, m] = fixtureWithDoctrineV3();
    s.end = { keyGround: [], lullMin: est(2880) };
    const { state, ctx } = initRun(s, m, { seed: 1 });
    const quiet = { ...state, minute: 400, events: [], messages: [], barrages: state.barrages.map((b) => ({ ...b, phase: 'done' as const })), companies: state.companies.map((c) => (c.side === 'allied' ? { ...c, status: 'holding' as const } : c)) };
    expect(endCheck(quiet, ctx)).toEqual({ ended: true, reason: 'lull' });
    const h = quiet.hqs.find((x) => x.side === 'allied' && x.picture.units['c1'] !== undefined)!;
    const known = h.picture.units['c1']!;
    const report = (status: string, extra: Partial<Report> = {}): Message => ({
      id: 999, side: 'allied', kind: 'report', fromFormationId: 'c1', toFormationId: h.formationId, sentMin: 395, dueMin: 410, channel: 'runner',
      payload: { atMin: 395, units: { c1: { status, men: known.men - 3, atMin: 395 } }, segments: {}, lines: {}, ...extra },
    });
    // c1 fell back, and its HQ has not heard yet: not a lull.
    expect(endCheck({ ...quiet, messages: [report('falling-back')] }, ctx).ended).toBe(false);
    // A segment changing hands, in a report with the status the HQ knows: not a lull either.
    expect(endCheck({ ...quiet, messages: [report(known.status, { segments: { 'ger-front-a:001': 'allied' } })] }, ctx).ended).toBe(false);
    // Only its men, as it knows them otherwise: routine, a lull.
    expect(endCheck({ ...quiet, messages: [report(known.status)] }, ctx)).toEqual({ ended: true, reason: 'lull' });
  });

  it('suppression wearing off after the fighting stops does not keep a run from its lull', () => {
    const [s, m] = fixtureWithDoctrineV3();
    s.end = { keyGround: [], lullMin: est(2880) };
    const { state, ctx } = initRun(s, m, { seed: 1 });
    const after = {
      ...state,
      minute: 400,
      events: [],
      barrages: state.barrages.map((b) => ({ ...b, phase: 'done' as const })),
      companies: state.companies.map((c) => (c.side === 'allied' ? { ...c, status: 'consolidating' as const, suppression: 0.3, morale: c.moraleStart } : c)),
    };
    expect(endCheck(after, ctx)).toEqual({ ended: true, reason: 'lull' });
  });

  it('a garrison ordered while in its dugout and trapped there holds no order open, and stops no run ending (Task 12 N-3)', () => {
    const [s, m] = fixtureWithDoctrineV3();
    s.end = { keyGround: [], lullMin: est(60) };
    const { state, ctx } = initRun(s, m, { seed: 1 });
    const order = { kind: 'counter-attack' as const, target: { segmentId: 'ger-front-a:001' }, fromFormationId: 'x', issuedMin: 0 };
    const trapped = {
      ...state,
      minute: 400,
      events: [],
      barrages: state.barrages.map((b) => ({ ...b, phase: 'done' as const })),
      companies: state.companies.map((c) => (c.side === 'central' ? { ...c, status: 'holding' as const, posture: 'in-dugout' as const, orders: [order] } : { ...c, status: 'consolidating' as const })),
    };
    expect(commandPending(trapped, ctx)).toBe(false);
    expect(endCheck(trapped, ctx)).toEqual({ ended: true, reason: 'lull' });
    // Up in its trench, the same order keeps the run going.
    const up = { ...trapped, companies: trapped.companies.map((c) => (c.side === 'central' ? { ...c, posture: 'in-trench' as const } : c)) };
    expect(commandPending(up, ctx)).toBe(true);
    expect(endCheck(up, ctx).ended).toBe(false);
  });

  describe('who holds a piece of key ground (fix round 1 ruling)', () => {
    // The v3 fixture: the German front trench ger-front-a at x 150 (segments :001 y 0-200, :002 y 200-400), the Black
    // Line at x 1150; a knoll put where each test needs it.
    const withKnoll = (x: number, y: number) => {
      const [s, m] = fixtureWithDoctrineV3();
      s.features.push({ id: 'knoll', kind: 'strongpoint', side: 'central', geometry: { type: 'Point', coordinates: [x, y] }, cite: est('test') });
      return initRun(s, m, { seed: 1 });
    };
    const near = v(fixtureTables().effects.lineFeatureMatchM);

    it('1. the side with men up within captureRadiusM of it', () => {
      const { state, ctx } = withKnoll(600, 200);
      const there = state.companies.map((c) => (c.id === 'c1' ? { ...c, x: 600, y: 200, posture: 'in-trench' as const } : c));
      expect(holderOf({ ...state, companies: there }, ctx, 'knoll')).toBe('allied');
      // Down in a dug-out men hold nothing.
      const below = there.map((c) => (c.id === 'c1' ? { ...c, posture: 'in-dugout' as const } : c));
      expect(holderOf({ ...state, companies: below }, ctx, 'knoll')).not.toBe('allied');
    });

    it('2. else the holder of the trench segment nearest it, within lineFeatureMatchM', () => {
      const { state, ctx } = withKnoll(150 + near / 2, 300);
      const empty = state.companies.map((c) => ({ ...c, x: c.x + 5000 }));
      expect(holderOf({ ...state, companies: empty }, ctx, 'knoll')).toBe('central');
      const taken = state.segments.map((x) => (x.id === 'ger-front-a:002' ? { ...x, holder: 'allied' as const } : x));
      expect(holderOf({ ...state, companies: empty, segments: taken }, ctx, 'knoll')).toBe('allied');
      // :001 taken instead: the nearest (:002, y 200-400) still German.
      const other = state.segments.map((x) => (x.id === 'ger-front-a:001' ? { ...x, holder: 'allied' as const } : x));
      expect(holderOf({ ...state, companies: empty, segments: other }, ctx, 'knoll')).toBe('central');
    });

    it('3. else the side holding the line it lies behind', () => {
      // Between the German front and the Black Line, far from any trench and with nobody on it.
      const { state, ctx } = withKnoll(700, 200);
      const empty = state.companies.map((c) => ({ ...c, x: c.x + 5000 }));
      // Behind the German front line (the defender's side of it): German.
      expect(holderOf({ ...state, companies: empty }, ctx, 'knoll')).toBe('central');
      // Once the Black Line is taken and held, the knoll lies behind it: the attacker's.
      expect(holderOf({ ...state, companies: empty, taken: [`black|${ctx.scenario.sectors[0]!.id}`] }, ctx, 'knoll')).toBe('allied');
    });
  });
});
