import { describe, expect, it } from 'vitest';
import { liftClear } from './labels';

describe('liftClear', () => {
  const box = { x0: 0, x1: 50, y0: 90, y1: 100 };
  it('keeps a label on its own row when nothing is in the way', () => {
    expect(liftClear(box, [{ x0: 60, x1: 90, y0: 90, y1: 100 }], 12, 3)).toEqual(box);
  });
  it('lifts a label a row at a time until it clears the labels already placed', () => {
    const placed = [{ x0: 40, x1: 90, y0: 90, y1: 100 }, { x0: 0, x1: 20, y0: 78, y1: 88 }];
    expect(liftClear(box, placed, 12, 3)).toEqual({ x0: 0, x1: 50, y0: 66, y1: 76 });
  });
  it('gives up at the top row', () => {
    const wall = [0, 1, 2].map((r) => ({ x0: 0, x1: 50, y0: 90 - 12 * r, y1: 100 - 12 * r }));
    expect(liftClear(box, wall, 12, 3)).toEqual({ x0: 0, x1: 50, y0: 66, y1: 76 });
  });
});
