import { describe, expect, it } from 'vitest';
import type { BatchSummary } from '@wwi/engine';
import { clock, formatBatch } from './format';

const zero = '1917-04-09T05:30';

describe('clock', () => {
  it('shows only HH:MM on the zero day', () => {
    expect(clock(zero, 0)).toBe('05:30');
    expect(clock(zero, 90)).toBe('07:00');
  });
  it('adds the day when the time is not on the zero day', () => {
    expect(clock(zero, 18 * 60 + 30)).toBe('10 Apr 00:00');
    expect(clock(zero, 24 * 60 + 9 * 60 + 30)).toBe('10 Apr 15:00');
  });
  it('shows a dash for no time', () => {
    expect(clock(zero, null)).toBe('—');
  });
});

describe('formatBatch', () => {
  it('shows the day in run and historical columns for windows after the zero day', () => {
    const b = {
      runs: 3,
      lines: [
        { lineId: 'black-4cdn', sectorId: '4cdn', takenIn: 3, p10: 800, median: 900, p90: 1000, historicalEarliest: 795, historicalLatest: 1350 },
        { lineId: 'red-4cdn', sectorId: '4cdn', takenIn: 3, p10: 1500, median: 1600, p90: 1700, historicalEarliest: 2010, historicalLatest: 2070 },
      ],
    } as unknown as BatchSummary;
    const out = formatBatch(b, zero);
    expect(out).toMatch(/18:45–10 Apr 04:00/);
    expect(out).toMatch(/10 Apr 15:00–10 Apr 16:00/);
    expect(out).toMatch(/10 Apr 08:10/);
  });
});
