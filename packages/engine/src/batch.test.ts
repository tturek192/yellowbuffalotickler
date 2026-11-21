import { describe, expect, it } from 'vitest';
import { quantiles, runBatch } from './batch';
import { doctrines, draft } from './test-helpers';

describe('batch', () => {
  it('quantiles', () => {
    expect(quantiles([1, 2, 3, 4, 5], [0.1, 0.5, 0.9])).toEqual([1.4, 3, 4.6]);
    expect(quantiles([], [0.5])).toEqual([]);
  });

  it('runBatch summarises each line over the seeds, with historical minutes', () => {
    const b = runBatch(draft(), doctrines(), [1, 2, 3, 4, 5]);
    const black = b.lines.find((l) => l.lineId === 'black')!;
    expect(b.runs).toBe(5);
    expect(black.takenIn).toBe(5);
    // The draft's Black Line window, 06:05-06:15 (BOH p. 322; Nicholson p. 254; Task 10).
    expect(black.historicalEarliest).toBe(35);
    expect(black.historicalLatest).toBe(45);
  });
});
