import { describe, expect, it } from 'vitest';
import { est, minimalScenario } from '@wwi/scenario/test-fixtures';
import type { Scenario } from '@wwi/scenario';
import { noteLightDefaults, sunTimes, utcOffsetOf, visibility, visibilityM } from './light';
import { tablesWith, vimy } from './test-helpers';

describe('sunTimes', () => {
  it('sunrise and sunset at Greenwich on the 2000 March equinox fall within 5 min of 06:04 and 18:14 UTC', () => {
    const t = sunTimes(51.4769, 0, '2000-03-20', 0);
    expect(Math.abs(t.sunrise - 364)).toBeLessThanOrEqual(5);
    expect(Math.abs(t.sunset - 1094)).toBeLessThanOrEqual(5);
  });
  it('shifts with longitude and the clock offset', () => {
    const g = sunTimes(51.4769, 0, '2000-03-20', 0);
    expect(sunTimes(51.4769, 0, '2000-03-20', 60).sunrise).toBeCloseTo(g.sunrise + 60, 2);
    expect(sunTimes(51.4769, 15, '2000-03-20', 0).sunrise).toBeCloseTo(g.sunrise - 60, 2);
  });
  it('days are longer in June than in December at 50 N, and a polar night collapses to noon', () => {
    const len = (d: string) => { const t = sunTimes(50, 0, d, 0); return t.sunset - t.sunrise; };
    expect(len('2000-06-21')).toBeGreaterThan(len('2000-12-21') + 300);
    const polar = sunTimes(85, 0, '2000-12-21', 0);
    expect(polar.sunset - polar.sunrise).toBe(0);
  });
});

function sc(over: Partial<Scenario> = {}): Scenario {
  const s = minimalScenario();
  s.zeroHour = { value: '2000-03-20T12:00', estimate: 'test' };
  s.utcOffsetMin = est(0);
  s.frame = { origin: { lon: 0, lat: 51.4769 }, bearingDeg: est(90), extent: { minX: 0, maxX: 6000, minY: 0, maxY: 8000 } };
  return Object.assign(s, over);
}
const t = tablesWith();
const at = (hhmm: string) => (Number(hhmm.slice(0, 2)) - 12) * 60 + Number(hhmm.slice(3));

describe('visibilityM', () => {
  it('is the weather by day, nightVisibilityM at night, and linear through twilightMin', () => {
    const s = sc();
    s.weather = [{ at: '2000-03-20T00:00', precipitation: { value: 'none', estimate: 'test' }, visibilityM: est(800) }];
    const { sunset } = sunTimes(51.4769, 0, '2000-03-20', 0);
    const m = (clock: number) => clock - 12 * 60; // minutes after Zero (12:00)
    expect(visibilityM(s, t, m(720))).toBe(800);
    expect(visibilityM(s, t, m(sunset))).toBe(800);
    expect(visibilityM(s, t, m(sunset + 35))).toBeCloseTo(50, 2);
    expect(visibilityM(s, t, m(26 * 60))).toBe(50); // 02:00 next day
    expect(visibilityM(s, t, m(sunset + 17.5))).toBeCloseTo(425, 2);
    expect(visibilityM(s, t, m(sunset + 8.75))).toBeCloseTo(50 + 0.75 * 750, 2);
  });
  it('interpolates weather visibility between entries that give one, and holds otherwise', () => {
    const s = sc();
    const w = (at: string, vis?: number) => ({ at, precipitation: { value: 'none' as const, estimate: 'test' }, ...(vis ? { visibilityM: est(vis) } : {}) });
    s.weather = [w('2000-03-20T10:00', 1000), w('2000-03-20T14:00', 200), w('2000-03-20T15:00')];
    expect(visibilityM(s, t, at('12:00'))).toBe(600);
    expect(visibilityM(s, t, at('14:30'))).toBe(200); // next entry gives none: the earlier value holds
    expect(visibilityM(s, t, at('15:30'))).toBeGreaterThan(5000); // none given: clear, bounded by the extent
  });
  it('Vimy: the 12 April storm limits sight to its sourced figure, and the dawn after it is clear', () => {
    const s = vimy();
    const t = tablesWith();
    const zero = '1917-04-09T05:30';
    const minute = (clock: string) => (Date.parse(`${clock}:00Z`) - Date.parse(`${zero}:00Z`)) / 60000;
    expect(visibilityM(s, t, minute('1917-04-12T04:30'))).toBeLessThanOrEqual(11);
    expect(visibilityM(s, t, minute('1917-04-12T10:00'))).toBeGreaterThan(1000);
  });
});

describe('visibility', () => {
  it('is clamp(1 - r / visM, 0, 1)', () => {
    expect(visibility(0, 100)).toBe(1);
    expect(visibility(25, 100)).toBe(0.75);
    expect(visibility(100, 100)).toBe(0);
    expect(visibility(500, 100)).toBe(0);
    expect(visibility(-5, 100)).toBe(1);
    expect(visibility(10, 0)).toBe(0);
  });
});

describe('utcOffset default', () => {
  it('is 0 and is recorded in defaultsUsed when the scenario gives none', () => {
    const s = sc();
    delete s.utcOffsetMin;
    expect(utcOffsetOf(s)).toBe(0);
    const used = new Set<string>();
    noteLightDefaults(s, used);
    expect([...used]).toEqual(['utcOffsetMin ← 0 (no clock offset given; sun times taken as UTC)']);
    noteLightDefaults(sc(), used);
    expect(used.size).toBe(1);
  });

  it('a scenario with no frame records that its sun times are taken at lat 0, lon 0, and its clear-weather bound', () => {
    const s = sc();
    delete s.frame;
    const used = new Set<string>();
    noteLightDefaults(s, used);
    expect([...used]).toEqual([
      'frame.origin ← lat 0, lon 0 (no frame: sun times taken at the equator and the prime meridian)',
      'visibility (clear weather) ← 10000 m (no frame or terrain grid to bound it)',
    ]);
  });
});
