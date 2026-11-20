import { describe, expect, it } from 'vitest';
import { elapsedLabel, nextEventMinute, prevEventMinute } from './steps';

const minutes = [0, 32, 32, 92, 316];

describe('event stepping', () => {
  it('finds the next event strictly after the playhead', () => {
    expect(nextEventMinute(minutes, 0)).toBe(32);
    expect(nextEventMinute(minutes, 31.6)).toBe(32);
    expect(nextEventMinute(minutes, 32)).toBe(92);
    expect(nextEventMinute(minutes, 316)).toBeNull();
  });
  it('finds the previous event strictly before the whole minute shown', () => {
    expect(prevEventMinute(minutes, 92)).toBe(32);
    expect(prevEventMinute(minutes, 92.7)).toBe(32);
    expect(prevEventMinute(minutes, 100)).toBe(92);
    expect(prevEventMinute(minutes, 0)).toBeNull();
  });
});

describe('labels', () => {
  it('describes time after zero hour', () => {
    expect(elapsedLabel(0)).toBe('0 h 0 min after zero hour');
    expect(elapsedLabel(92.9)).toBe('1 h 32 min after zero hour');
  });
});
