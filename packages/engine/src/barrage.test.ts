import { describe, expect, it } from 'vitest';
import { minimalScenario } from '@wwi/scenario/test-fixtures';
import { advanceBarrage, barrageXAt, initBarrage } from './barrage';

const s = minimalScenario();
const sec = s.sectors[0]!;
const lines = new Map(s.lines.map((l) => [l.id, l.points]));

describe('creeping barrage', () => {
  it('opens on the German front line at zero', () => {
    expect(barrageXAt(initBarrage(sec), sec, lines, 0, 200)).toBe(150);
  });
  it('lifts in 91 m steps every 3 minutes', () => {
    const b = initBarrage(sec);
    expect(barrageXAt(b, sec, lines, 2, 200)).toBe(150);
    expect(barrageXAt(b, sec, lines, 3, 200)).toBeCloseTo(150 + (91 / 1000) * (1000 + 180), 6);
  });
  it('pauses beyond the objective after ceil(1000/91)*3 = 33 minutes, emitting barrage-pause', () => {
    const r = advanceBarrage(initBarrage(sec), sec, lines, 33);
    expect(r.state.phase).toBe('pausing');
    expect(r.events.map((e) => e.kind)).toEqual(['barrage-pause']);
    expect(r.events[0]).toMatchObject({ sectorId: 's1', causes: [] });
    expect(barrageXAt(r.state, sec, lines, 40, 200)).toBe(1150 + 180);
  });
  it('finishes after the last pause', () => {
    const b = advanceBarrage(initBarrage(sec), sec, lines, 33).state;
    const r = advanceBarrage(b, sec, lines, 73);
    expect(r.state.phase).toBe('done');
    expect(r.events.map((e) => e.kind)).toEqual(['barrage-done']);
    expect(barrageXAt(r.state, sec, lines, 100, 200)).toBe(1330);
  });
  it('emits every transition in order when one call jumps several phases', () => {
    const r = advanceBarrage(initBarrage(sec), sec, lines, 200);
    expect(r.events.map((e) => e.kind)).toEqual(['barrage-pause', 'barrage-done']);
    expect(r.state.phase).toBe('done');
  });
  it('does nothing before the first boundary', () => {
    const r = advanceBarrage(initBarrage(sec), sec, lines, 32);
    expect(r.events).toEqual([]);
    expect(r.state.phase).toBe('lifting');
  });
  it('resumes into the next leg in a two-leg sector', () => {
    const two = {
      ...sec,
      legs: [sec.legs[0]!, { ...sec.legs[0]!, toLineId: 'red' }],
    };
    const l2 = new Map(lines).set('red', [[2150, 0], [2150, 400]]);
    const r = advanceBarrage(initBarrage(two), two, l2, 73);
    expect(r.events.map((e) => e.kind)).toEqual(['barrage-pause', 'barrage-resume']);
    expect(r.state).toMatchObject({ legIndex: 1, phase: 'lifting', phaseStartMin: 73 });
  });
});
