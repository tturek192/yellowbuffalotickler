import { describe, it, expect } from 'vitest';
import { createRng } from './rng';

describe('createRng', () => {
  it('same seed gives the same sequence; different seeds differ', () => {
    const a = createRng(42), b = createRng(42), c = createRng(43);
    const sa = [a(), a(), a()], sb = [b(), b(), b()];
    expect(sa).toEqual(sb);
    expect(c()).not.toBe(sa[0]);
    sa.forEach(x => {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    });
  });
});
