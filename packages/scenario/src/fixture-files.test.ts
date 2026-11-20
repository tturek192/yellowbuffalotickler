import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { allCompanies, v } from './index';
import { loadScenario } from './load-node';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('draft scenario files', () => {
  it('the Vimy draft scenario loads, is draft, and has the expected structure', () => {
    const { scenario: s, doctrines } = loadScenario(
      resolve(repoRoot, 'scenarios/vimy-1917/1cdn-3bde-draft.yaml'),
      resolve(repoRoot, 'doctrine'),
    );
    expect(s.status).toBe('draft');
    expect(Object.keys(doctrines)).toEqual(['bef-1917']);
    expect(s.sectors[0]!.legs.map((l) => v(l.pauseMin))).toEqual([40, 150, 96, 0]);
    expect(allCompanies(s)).toHaveLength(12);
    expect(s.historical.objectives.map((o) => o.lineId)).toEqual(['black', 'red', 'blue', 'brown']);
  });
});
