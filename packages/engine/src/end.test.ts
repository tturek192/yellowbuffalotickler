import { describe, expect, it } from 'vitest';
import { est } from '@wwi/scenario/test-fixtures';
import { commandPending } from './command';
import { endCheck, finalLines, holderOf, lullMin } from './end';
import { initRun, runScenario } from './run';
import type { RunRecord } from './record';
import { fixtureFire, fixtureWithDoctrineV3, ofKind } from './test-helpers';

/**
 * The v3 fixture with a German knoll on the Black Line its key ground: the two assault companies take the Black Line, its
 * final objective, and stand on the knoll.
 */
function runEasy(): RunRecord {
  const [s, m] = fixtureWithDoctrineV3();
  s.features.push({ id: 'knoll', kind: 'strongpoint', side: 'central', geometry: { type: 'Point', coordinates: [1150, 100] }, cite: est('test') });
  s.end = { keyGround: [{ id: 'knoll', name: 'The knoll', featureId: 'knoll' }], lullMin: est(120) };
  return runScenario(s, m, { seed: 1 });
}

/** Four machine guns to each garrison and a ridge between: the attackers are held off under fire until the time cap. */
function runStalled(): RunRecord {
  const [s, m] = fixtureFire({ mgs: 4, startX: -500 });
  s.timeLimitMinutes = 240;
  s.end = { keyGround: [{ id: 'front', name: 'The German front trench', featureId: 'ger-front-a' }], lullMin: est(120) };
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

  it('key ground with no trench segment is held by the side with more men up on it, else by its own side', () => {
    const [s, m] = fixtureWithDoctrineV3();
    s.features.push({ id: 'knoll', kind: 'strongpoint', side: 'central', geometry: { type: 'Point', coordinates: [600, 200] }, cite: est('test') });
    const { state, ctx } = initRun(s, m, { seed: 1 });
    expect(holderOf(state, ctx, 'knoll')).toBe('central');
    const there = state.companies.map((c) => (c.id === 'c1' ? { ...c, x: 600, y: 200, posture: 'in-trench' as const } : c));
    expect(holderOf({ ...state, companies: there }, ctx, 'knoll')).toBe('allied');
  });
});
