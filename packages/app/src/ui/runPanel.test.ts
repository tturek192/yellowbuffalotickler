import { describe, expect, it } from 'vitest';
import type { RunRecord } from '@wwi/engine';
import { presetsFor, resultLine, type PresetEntry } from './RunPanel';

const margins = {
  breakthrough: { furthestBeyondM: 420.4, sectorId: 's1', minute: 300 },
  surrender: { capturedFrac: 0.12, minute: 200 },
  collapse: { minFitFrac: 0.61, minute: 250 },
  stronghold: { held: 1, of: 3, minute: 280, longestHoldMin: 20, longestHoldMinute: 300 },
};

const record = (summary: Partial<RunRecord['summary']>): RunRecord =>
  ({ zeroHour: '1917-04-09T05:30', endMinute: 600, summary: { endedAt: 450, endReason: 'objectives-held', winner: 'allied', deadlock: null, ...summary } }) as unknown as RunRecord;

describe('resultLine', () => {
  it('names the winner, the end and the condition that broke the deadlock', () => {
    const r = resultLine(record({ deadlock: { broken: true, by: 'stronghold', minute: 300, margins, atBreak: { ...margins, collapse: { minFitFrac: 0.7, minute: 100 } } } }));
    expect(r.text).toBe('Allied win, ended 13:00 (objectives held). Deadlock broken by stronghold at 10:30.');
    expect(r.margins).toContain('70% still fit');
    expect(r.margins).toContain('420 m beyond the gun line');
  });

  it('says the deadlock held, with the run’s closest margins', () => {
    const r = resultLine(record({ winner: 'central', endReason: 'time-cap', deadlock: { broken: false, margins, atBreak: null } }));
    expect(r.text).toBe('German win, ended 13:00 (the time limit). Deadlock held.');
    expect(r.margins).toBe('Closest: 420 m beyond the gun line, 12% of the defenders captured, 61% still fit, 1 of 3 strongholds held.');
  });

  it('leaves the deadlock out when the scenario is not scored', () => {
    expect(resultLine(record({ winner: null, endReason: null })).text).toBe('No winner, ended 13:00.');
  });
});

describe('presetsFor', () => {
  const index: PresetEntry[] = [
    { id: 'a', file: 'a.json', title: 'A', scenarioId: 'vimy-1917' },
    { id: 'b', file: 'b.json', title: 'B', scenarioId: 'other' },
  ];
  it('lists the presets written for the chosen scenario', () => {
    expect(presetsFor(index, 'vimy-1917').map((p) => p.id)).toEqual(['a']);
    expect(presetsFor(index, 'draft')).toEqual([]);
  });
});
