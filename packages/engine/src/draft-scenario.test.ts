import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScenario } from '@wwi/scenario/node';
import { runScenario } from './run';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('draft Vimy scenario run', () => {
  it('a run of the draft scenario takes all four lines in order', () => {
    const { scenario: s, doctrines } = loadScenario(
      resolve(repoRoot, 'scenarios/vimy-1917/1cdn-3bde-draft.yaml'),
      resolve(repoRoot, 'doctrine'),
    );
    const r = runScenario(s, doctrines, { seed: 1 });
    expect(r.summary.lineTaken.map((t) => t.lineId)).toEqual(['black', 'red', 'blue', 'brown']);
  });
});
