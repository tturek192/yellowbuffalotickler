import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScenario } from '@wwi/scenario/node';
import { quantiles, runBatch } from './batch';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('batch', () => {
  it('quantiles', () => {
    expect(quantiles([1, 2, 3, 4, 5], [0.1, 0.5, 0.9])).toEqual([1.4, 3, 4.6]);
    expect(quantiles([], [0.5])).toEqual([]);
  });

  it('runBatch summarises each line over the seeds, with historical minutes', () => {
    const { scenario: s, doctrines } = loadScenario(
      resolve(repoRoot, 'scenarios/vimy-1917/1cdn-3bde-draft.yaml'),
      resolve(repoRoot, 'doctrine'),
    );
    const b = runBatch(s, doctrines, [1, 2, 3, 4, 5]);
    const black = b.lines.find((l) => l.lineId === 'black')!;
    expect(b.runs).toBe(5);
    expect(black.takenIn).toBe(5);
    // The draft's Black Line window, 06:05-06:15 (BOH p. 322; Nicholson p. 254; Task 10).
    expect(black.historicalEarliest).toBe(35);
    expect(black.historicalLatest).toBe(45);
  });
});
