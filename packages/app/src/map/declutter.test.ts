import { describe, expect, it } from 'vitest';
import { declutter } from './declutter';

describe('declutter', () => {
  it('spreads overlapping markers apart vertically around their centre, leaving others alone', () => {
    expect(declutter([[0, 0], [0, 0]], 26, 22, 20)).toEqual([[0, -11], [0, 11]]);
    const chain = declutter([[0, 0], [5, 15], [0, 30]], 26, 22, 20);
    expect(chain[1]![1] - chain[0]![1]).toBeGreaterThanOrEqual(21.99);
    expect(chain[2]![1] - chain[1]![1]).toBeGreaterThanOrEqual(21.99);
    expect((chain[0]![1] + chain[1]![1] + chain[2]![1]) / 3).toBeCloseTo(15);
    expect(chain.map((p) => p[0])).toEqual([0, 5, 0]);
    expect(declutter([[0, 0], [40, 5]], 26, 22, 20)).toEqual([[0, 0], [40, 5]]);
  });

  it('never moves a marker more than maxShift from its true y, accepting overlap instead', () => {
    // A phone-width map: twelve companies 75 m apart land ~5 px apart on screen.
    const truth = Array.from({ length: 12 }, (_, i): [number, number] => [100, 200 + i * 5]);
    const placed = declutter(truth, 28, 24, 12);
    placed.forEach(([x, y], i) => {
      expect(x).toBe(truth[i]![0]);
      expect(Math.abs(y - truth[i]![1])).toBeLessThanOrEqual(12 + 1e-9);
    });
    // The outermost markers use the full allowance to open the stack up.
    expect(placed[0]![1]).toBeCloseTo(188);
    expect(placed[11]![1]).toBeCloseTo(267);
  });
});
