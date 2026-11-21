import { describe, expect, it } from 'vitest';
import type { Scenario } from '@wwi/scenario';
import { churn, groundAt, speedFactor, wetness } from './ground';
import { featureOf, woodAt, worldWith } from './test-helpers';

const feature = featureOf;
const rain = (at: string, p: 'none' | 'rain'): Scenario['weather'][number] => ({ at, precipitation: { value: p, estimate: 'test' } });

describe('groundAt', () => {
  it('is open by default, wood inside a wood polygon, village inside a village radius', () => {
    const w = worldWith([woodAt(100, 300), feature('v', 'village', { type: 'Point', coordinates: [600, 0], radiusM: 50 })]);
    expect(groundAt(w, [0, 0])).toBe('open');
    expect(groundAt(w, [200, 0])).toBe('wood');
    expect(groundAt(w, [620, 0])).toBe('village');
    expect(groundAt(w, [700, 0])).toBe('open');
  });
  it('a trench is anything within trenchProximityM of a trench line, and beats the wood around it', () => {
    const w = worldWith([woodAt(100, 300), feature('t', 'trench', { type: 'LineString', coordinates: [[150, -80], [150, 80]] })]);
    expect(groundAt(w, [164, 0])).toBe('trench');
    expect(groundAt(w, [166, 0])).toBe('wood');
  });
  it('mapped craters and heavy churn make cratered ground; light churn does not', () => {
    const w = worldWith([feature('c', 'crater', { type: 'Point', coordinates: [500, 0], radiusM: 20 })]);
    expect(groundAt(w, [510, 0])).toBe('cratered');
    expect(groundAt(w, [300, 0])).toBe('open');
    churn(w, [300, 0], 3);
    expect(groundAt(w, [300, 0])).toBe('open');
    churn(w, [300, 0], 500);
    expect(groundAt(w, [300, 0])).toBe('cratered');
  });
});

describe('speedFactor', () => {
  it('rain over the previous day and heavy churn both slow movement, and combine', () => {
    const w = worldWith();
    const dry = speedFactor(w, [0, 0], 0);
    expect(dry).toBe(1);
    churn(w, [0, 0], 5000);
    expect(speedFactor(w, [0, 0], 1)).toBeLessThan(speedFactor(w, [0, 0], 0));
    expect(speedFactor(w, [0, 0], 0)).toBeLessThan(dry);
    expect(speedFactor(w, [900, 0], 1)).toBeLessThan(1); // rain alone, on unchurned ground
  });
  it('climbing costs uphillPenaltyPer10m per 10 m gained; descending is free', () => {
    const w = worldWith([], (x) => x / 10); // rises 1 m per 10 m
    expect(speedFactor(w, [0, 0], 0, [500, 0])).toBeCloseTo(1 - 0.02 * 5, 6);
    expect(speedFactor(w, [500, 0], 0, [0, 0])).toBe(1);
    expect(speedFactor(w, [0, 0], 0)).toBe(1);
  });
});

describe('wetness', () => {
  it('is the share of the past 24 h that it was precipitating', () => {
    const w = worldWith([], undefined, [rain('1917-04-09T05:30', 'rain'), rain('1917-04-09T17:30', 'none')]);
    expect(wetness(w, 0)).toBe(0);
    expect(wetness(w, 360)).toBeCloseTo(360 / 1440, 9);
    expect(wetness(w, 720)).toBeCloseTo(0.5, 9);
    expect(wetness(w, 1440 + 720)).toBeCloseTo(0, 9); // rain ended 24 h earlier
  });
  it('is 1 after a whole day of rain', () => {
    const w = worldWith([], undefined, [rain('1917-04-08T05:30', 'rain')]);
    expect(wetness(w, 0)).toBe(1);
  });
});
