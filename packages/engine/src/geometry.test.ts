import { describe, it, expect } from 'vitest';
import { lineXAt, sampleYs } from './geometry';

describe('lineXAt', () => {
  it('interpolates x along a line', () => {
    expect(lineXAt([[100, 0], [300, 400]], 200)).toBe(200);
  });

  it('clamps outside the line extent instead of returning NaN (Review Focus 2)', () => {
    expect(lineXAt([[100, 0], [300, 400]], -50)).toBe(100);
    expect(lineXAt([[100, 0], [300, 400]], 900)).toBe(300);
    expect(lineXAt([[120, 50]], 999)).toBe(120);
  });
});

describe('sampleYs', () => {
  it('spans the sector inclusively', () => {
    expect(sampleYs(0, 400, 5)).toEqual([0, 100, 200, 300, 400]);
  });
});
