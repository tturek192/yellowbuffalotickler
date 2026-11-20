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

  it('the Vimy scenario shell loads with its include stubs, is draft, and registers the starting sources', () => {
    const { scenario: s } = loadScenario(resolve(repoRoot, 'scenarios/vimy-1917/scenario.yaml'), resolve(repoRoot, 'doctrine'));
    expect(s.status).toBe('draft');
    expect(s.frame!.origin.lon).toBeCloseTo(2.7735, 3);
    expect(s.frame!.origin.lat).toBeCloseTo(50.3796, 3);
    expect(v(s.frame!.bearingDeg)).toBeGreaterThan(60);
    expect(v(s.frame!.bearingDeg)).toBeLessThan(100);
    const e = s.frame!.extent;
    expect(e.minX).toBeLessThan(0);
    expect(e.maxX).toBeGreaterThan(0);
    expect(e.minY).toBeLessThan(0);
    expect(e.maxY).toBeGreaterThan(0);
    const tiers = Object.fromEntries(Object.entries(s.sources).map(([id, x]) => [id, x.tier]));
    expect(tiers).toMatchObject({
      'nicholson-1962': 'official',
      'ign-rge-alti': 'secondary',
      'vimy-brief-2026': 'secondary',
      'artillery-notes-4': 'primary',
    });
    expect(s.sources['ign-rge-alti']!.note).toBe(
      'modern 1 m–5 m elevation resampled to 25 m; post-war terrain, including the memorial park; not 1917 micro-relief',
    );
  });
});
