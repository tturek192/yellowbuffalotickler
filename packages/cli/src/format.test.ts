import { describe, expect, it } from 'vitest';
import type { BatchSummary } from '@wwi/engine';
import { clock, formatBatch, formatBatchV2 } from './format';

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

describe('formatBatch v2 (Task 15)', () => {
  const b: BatchSummary = {
    runs: 20,
    lines: [{ lineId: 'black', sectorId: 's', takenIn: 20, p10: 30, median: 32, p90: 34, historicalEarliest: 35, historicalLatest: 45 }],
    casualties: [
      { side: 'allied', from: 0, to: 2669, target: 7707, p10: 6000, median: 7000, p90: 9000, pass: true },
      { side: 'allied', formationId: '2cdn', from: 0, to: 2669, target: 2413, range: [2000, 2500], p10: 100, median: 300, p90: 900, pass: false },
    ],
    prisoners: [{ bySide: 'allied', from: 0, to: 1109, target: 3404, range: [3400, 3404], p10: 2000, median: 3000, p90: 3500, pass: null }],
    gunsCaptured: { from: 0, to: 8189, target: 54, p10: 0, median: 0, p90: 10, pass: null },
    duration: { target: 4350, range: [4350, 7710], p10: 4000, median: 5216, p90: 6000, pass: true },
    winner: { allied: 0.25, central: 0.7, none: 0.05, historical: 'allied', pass: false },
  };

  it('sets each target beside the batch: casualties, prisoners, guns, duration and the winner, with pass or fail', () => {
    const out = formatBatchV2(b, zero);
    expect(out).toMatch(/allied\s+—\s+05:30–11 Apr 01:59/);
    expect(out).toMatch(/2cdn.*2413 \(2000–2500\).*300.*fail/);
    expect(out).toMatch(/7707.*7000.*pass/);
    expect(out).toMatch(/prisoners/i);
    expect(out).toMatch(/3404 \(3400–3404\).*3000.*—/);
    expect(out).toMatch(/guns captured[\s\S]*\s54\s+0\s+0\s+10\s+—/i);
    expect(out).toMatch(/ended[\s\S]*12 Apr 06:00 \(12 Apr 06:00–14 Apr 14:00\).*12 Apr 20:26.*pass/i);
    expect(out).toMatch(/winner.*allied 25%.*central 70%.*historical allied.*fail/i);
  });
});
