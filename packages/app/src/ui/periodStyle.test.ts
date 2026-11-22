import { describe, expect, it } from 'vitest';
import { periodClock, periodElapsed, readMapStyle, STYLE_KEY, writeMapStyle } from './periodStyle';

const memory = (): Storage => {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k), clear: () => m.clear(), key: () => null, length: 0 } as Storage;
};
const throwing = (): Storage => {
  throw new Error('storage blocked');
};

describe('the map style switch (periodStyle.ts)', () => {
  it('defaults to the period style and remembers the viewer\'s choice', () => {
    const s = memory();
    expect(readMapStyle(() => s)).toBe('period');
    writeMapStyle('plain', () => s);
    expect(s.getItem(STYLE_KEY)).toBe('plain');
    expect(readMapStyle(() => s)).toBe('plain');
  });

  it('still works when storage throws or holds rubbish', () => {
    expect(readMapStyle(throwing)).toBe('period');
    expect(() => writeMapStyle('plain', throwing)).not.toThrow();
    const s = memory();
    s.setItem(STYLE_KEY, 'neon');
    expect(readMapStyle(() => s)).toBe('period');
  });
});

describe('the period clock', () => {
  it('letters the time as the period maps do', () => {
    expect(periodClock('1917-04-09T05:30', 90)).toBe('Monday, 9th April · 7.0 a.m.');
    expect(periodClock('1917-04-09T05:30', 0)).toBe('Monday, 9th April · 5.30 a.m.');
    expect(periodClock('1917-04-09T05:30', 870)).toBe('Monday, 9th April · 8.0 p.m.');
    expect(periodClock('1917-04-09T05:30', 390)).toBe('Monday, 9th April · 12 noon');
    expect(periodClock('1917-04-09T05:30', 1110)).toBe('Tuesday, 10th April · 12 midnight');
    expect(periodClock('1917-04-09T05:30', 1385)).toBe('Tuesday, 10th April · 4.35 a.m.');
    expect(periodClock('1917-04-09T05:30', 3 * 1440)).toBe('Thursday, 12th April · 5.30 a.m.');
    expect(periodClock('1917-04-21T05:30', 0)).toBe('Saturday, 21st April · 5.30 a.m.');
    expect(periodClock('1917-04-22T05:30', 0)).toBe('Sunday, 22nd April · 5.30 a.m.');
    expect(periodClock('1917-04-23T05:30', 0)).toBe('Monday, 23rd April · 5.30 a.m.');
    expect(periodClock('1917-04-11T05:30', 0)).toBe('Wednesday, 11th April · 5.30 a.m.');
  });

  it('says how long after zero in words', () => {
    expect(periodElapsed(0)).toBe('Zero hour');
    expect(periodElapsed(10)).toBe('Ten minutes after zero');
    expect(periodElapsed(60)).toBe('One hour after zero');
    expect(periodElapsed(90)).toBe('One hour and thirty minutes after zero');
    expect(periodElapsed(61)).toBe('One hour and one minute after zero');
    expect(periodElapsed(14 * 60 + 30)).toBe('Fourteen hours and thirty minutes after zero');
    expect(periodElapsed(1440 + 125)).toBe('One day, two hours and five minutes after zero');
    expect(periodElapsed(2 * 1440)).toBe('Two days after zero');
  });
});
