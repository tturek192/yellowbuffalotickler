import { describe, it, expect } from 'vitest';
import { resultText, minutesPerSecond, clockText } from './playText';

const margins = { beyondGunLineM: -736, capturedFrac: 0.1, fitFrac: 0.77, longestHoldMin: 34 };
describe('play text', () => {
  it('names the condition and time when the deadlock breaks', () => {
    expect(resultText({ broken: true, by: 'stronghold', minute: 1594, margins, ended: 'deadlock-broken' }).headline).toBe('Deadlock broken: stronghold taken and held, day 2 · 02:34');
  });
  it('says the deadlock held, with the closest margins', () => {
    const r = resultText({ broken: false, margins, ended: 'time-up' });
    expect(r.headline).toBe('Deadlock held');
    expect(r.detail).toBe('Closest: 736 m short of the gun line, 10% of defenders captured, 77% still fit, stronghold held 34 of 60 min.');
  });
  it('says when there was nothing to fight', () => {
    expect(resultText({ broken: false, margins, ended: 'nothing-to-fight' }).headline).toBe('Nothing to fight: both sides need units');
  });
  it('maps the four speeds to game minutes per second (1× plays two days in about four minutes)', () => {
    expect([0.5, 1, 4, 16].map(minutesPerSecond)).toEqual([6, 12, 48, 192]);
  });
  it('shows the battle clock from Zero', () => {
    expect(clockText(0)).toBe('day 1 · 00:00'); expect(clockText(1500)).toBe('day 2 · 01:00');
  });
});
import { minutesForFrame } from './playText';
describe('frame clock', () => {
  it('a long gap (a backgrounded tab) counts as at most a quarter second', () => {
    expect(minutesForFrame(60_000, 16)).toBe(minutesForFrame(250, 16));
    expect(minutesForFrame(100, 1)).toBeCloseTo(1.2);
  });
});
