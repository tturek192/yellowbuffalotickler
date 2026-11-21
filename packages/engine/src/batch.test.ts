import { describe, expect, it } from 'vitest';
import type { Scenario } from '@wwi/scenario';
import { est } from '@wwi/scenario/test-fixtures';
import { casualtyPass, durationPass, extractRun, quantiles, runBatch, summarizeBatch } from './batch';
import { runScenario } from './run';
import type { Models } from './run';
import { doctrines, draft, fixtureWithDoctrineV3 } from './test-helpers';

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

describe('batch v2: runs against the historical targets (Task 15)', () => {
  /** The v3 fixture with targets: allied casualties on the day and for the 1st battalion, prisoners, guns, its length and winner. */
  const withTargets = (): [Scenario, Models] => {
    const [s, m] = fixtureWithDoctrineV3();
    const day = { from: '1916-07-01T07:30', to: '1916-07-01T23:59' };
    s.historical.casualties = [
      { side: 'central', window: day, total: est(240) },
      { side: 'allied', formationId: 'bn1', window: day, total: { value: 10, range: [0, 20], sources: [{ source: 'a' }, { source: 'b' }], note: 'test' } as never },
    ];
    s.historical.prisonersTaken = [{ bySide: 'allied', window: day, count: est(200) }];
    s.historical.gunsCaptured = { window: day, field: est(0) };
    s.historical.endedAt = est('1916-07-01T08:30');
    s.historical.winner = est('allied') as never;
    return [s, m];
  };

  it('the pass criteria of spec section 7: inside p10–p90 and the median within ±25%, or a disputed median in its range', () => {
    expect(casualtyPass({ value: 100 }, { p10: 80, median: 110, p90: 130 })).toBe(true);
    expect(casualtyPass({ value: 100 }, { p10: 101, median: 110, p90: 130 })).toBe(false);
    expect(casualtyPass({ value: 100 }, { p10: 50, median: 130, p90: 160 })).toBe(false);
    expect(casualtyPass({ value: 100, range: [90, 140] }, { p10: 0, median: 130, p90: 900 })).toBe(true);
    expect(casualtyPass({ value: 100, range: [90, 120] }, { p10: 0, median: 130, p90: 900 })).toBe(false);
    // Duration: ±1 day, or ±30% for a battle longer than that makes.
    expect(durationPass({ value: 4350 }, 4350 + 1440)).toBe(true);
    expect(durationPass({ value: 4350 }, 4350 + 1441)).toBe(false);
    expect(durationPass({ value: 10000 }, 12900)).toBe(true);
    expect(durationPass({ value: 4350, range: [4350, 7710] }, 9000)).toBe(true);
    // A disputed end: ±1 day of its range, no more.
    expect(durationPass({ value: 4350, range: [4350, 7710] }, 7710 + 1441)).toBe(false);
    expect(durationPass({ value: 4350, range: [4350, 7710] }, 4350 - 1441)).toBe(false);
  });

  it('each target row has the batch p10, median and p90 of the same side, formation and window, beside the target', () => {
    const [s, m] = withTargets();
    const seeds = [1, 2, 3, 4];
    const b = runBatch(s, m, seeds);
    const per = seeds.map((seed) => extractRun(s, runScenario(s, m, { seed })));
    expect(b.casualties.map((c) => [c.side, c.formationId ?? null, c.target])).toEqual([['central', null, 240], ['allied', 'bn1', 10]]);
    expect(b.casualties[1]!.range).toEqual([0, 20]);
    const [p10, med, p90] = quantiles(per.map((x) => x.casualties[0]!), [0.1, 0.5, 0.9]);
    expect(b.casualties[0]).toMatchObject({ p10, median: med, p90 });
    expect(b.casualties[0]!.pass).toBe(casualtyPass({ value: 240 }, { p10: p10!, median: med!, p90: p90! }));
    // The garrisons of the fixture are taken in their dugouts: the Germans' casualties are their 240 men, every run.
    expect(per.every((x) => x.casualties[0] === 240)).toBe(true);
    expect(b.prisoners[0]).toMatchObject({ bySide: 'allied', target: 200, median: 240, pass: null });
    expect(b.gunsCaptured).toMatchObject({ target: 0, median: 0, pass: null });
    expect(b.duration).toMatchObject({ target: 60, median: quantiles(per.map((x) => x.endedAt), [0.5])[0] });
    expect(b.winner).toMatchObject({ allied: 0, central: 0, none: 1, historical: 'allied', pass: false });
    expect(b.lines.map((l) => l.lineId)).toEqual(['black']);
    // A line taken, lost and taken again counts once a run, at its first taking.
    const again = summarizeBatch(s, per.map((x) => ({ ...x, lineTaken: [...x.lineTaken, { ...x.lineTaken[0]!, minute: 999 }] })));
    expect(again.lines[0]).toMatchObject({ takenIn: 4, median: b.lines[0]!.median });
  });

  it('the same summary whatever order the runs come in (merged in seed order)', () => {
    const [s, m] = withTargets();
    const per = [3, 1, 2].map((seed) => extractRun(s, runScenario(s, m, { seed })));
    expect(summarizeBatch(s, per)).toEqual(runBatch(s, m, [1, 2, 3]));
  });
});
