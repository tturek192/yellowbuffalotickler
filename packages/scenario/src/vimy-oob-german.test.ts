import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScenario } from './load-node';
import { companiesOf, formationIds, regimentsOf } from './queries';
import { v } from './sourced';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('Vimy German order of battle (Task 9)', () => {
  const { scenario: s } = loadScenario(resolve(repoRoot, 'scenarios/vimy-1917/scenario.yaml'), resolve(repoRoot, 'doctrine'));

  it('has the two Gruppen and three front-line divisions with their regiments', () => {
    expect(formationIds(s, 'central')).toEqual(expect.arrayContaining(['gruppe-vimy', 'gruppe-souchez', '79rd', '1brd']));
    expect(regimentsOf(s, '79rd').map(r => r.id)).toEqual(['rir261', 'rir262', 'rir263']);
  });
  it('every front-line company is a garrison on a German trench feature, with paper and actual strength', () => {
    for (const c of companiesOf(s, 'central').filter(c => c.role === 'garrison')) {
      const f = s.features.find(x => x.id === c.trenchFeatureId)!;
      expect(f.side).toBe('central'); expect(c.paperStrength).toBeDefined();
      expect(v(c.strength)).toBeLessThanOrEqual(v(c.paperStrength!));
    }
  });
  it('lists off-map reserves with distance and entry point', () => {
    expect(s.reserves.filter(r => r.side === 'central').length).toBeGreaterThanOrEqual(2);
  });
});
