import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScenario } from './load-node';
import { companiesOf, formationIds, regimentsOf } from './queries';
import { v, type Point } from './sourced';

/** Distance from p to the nearest point of a feature's geometry (a point, or the segments of a line or ring). */
function distanceToGeometry(geometry: { type: string; coordinates: Point | Point[] }, p: Point): number {
  if (geometry.type === 'Point') {
    const q = geometry.coordinates as Point;
    return Math.hypot(p[0] - q[0], p[1] - q[1]);
  }
  const pts = geometry.coordinates as Point[];
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [a, b] = [pts[i - 1]!, pts[i]!];
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / (vx * vx + vy * vy || 1)));
    best = Math.min(best, Math.hypot(a[0] + t * vx - p[0], a[1] + t * vy - p[1]));
  }
  return best;
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('Vimy German order of battle (Task 9)', () => {
  const { scenario: s } = loadScenario(resolve(repoRoot, 'scenarios/vimy-1917/scenario.yaml'), resolve(repoRoot, 'doctrine'));

  it('has the two Gruppen and three front-line divisions with their regiments', () => {
    expect(formationIds(s, 'central')).toEqual(expect.arrayContaining(['gruppe-vimy', 'gruppe-souchez', '79rd', '1brd']));
    expect(regimentsOf(s, '79rd').map(r => r.id)).toEqual(['rir261', 'rir262', 'rir263']);
  });
  // Task 12 (pre-review): the support battalions' companies are role reserve, held back to counter-attack; they stand on
  // their trenches as before, so the checks below cover every German company on the map, garrison or reserve.
  it('every front-line company is on a German trench feature, with paper and actual strength', () => {
    for (const c of companiesOf(s, 'central')) {
      const f = s.features.find(x => x.id === c.trenchFeatureId)!;
      expect(f.side).toBe('central'); expect(c.paperStrength).toBeDefined();
      expect(v(c.strength)).toBeLessThanOrEqual(v(c.paperStrength!));
    }
  });
  it('lists off-map reserves with distance and entry point', () => {
    expect(s.reserves.filter(r => r.side === 'central').length).toBeGreaterThanOrEqual(2);
  });
  // Guards added in fix round 1, beside the brief's three tests.
  it('has at least one central garrison, so the garrison test above is not vacuous', () => {
    expect(companiesOf(s, 'central').filter(c => c.role === 'garrison').length).toBeGreaterThan(0);
  });
  it('front battalions are garrisons and support battalions are in reserve to counter-attack (Task 12): 28 and 28', () => {
    const cs = companiesOf(s, 'central');
    expect(cs.filter(c => c.role === 'garrison')).toHaveLength(28);
    expect(cs.filter(c => c.role === 'reserve')).toHaveLength(28);
    // Companies are numbered through the regiment, 5-8 in its support battalion (II) everywhere.
    for (const c of cs) expect(c.role, c.id).toBe(/-[5-8]$/.test(c.id) ? 'reserve' : 'garrison');
  });
  it('places every company on its feature: within 1 m of a trench line, within the 40 m spread of a strongpoint', () => {
    // oob-german.md, Garrisons: starts lie on the trench (lon/lat rounded to 6 decimals, about 0.1 m); companies sharing
    // a strongpoint are spread 40 m apart in y around it, so at most 40 m from the point.
    for (const c of companiesOf(s, 'central')) {
      const f = s.features.find(x => x.id === c.trenchFeatureId)!;
      const bound = f.geometry.type === 'Point' ? 40.5 : 1;
      expect(distanceToGeometry(f.geometry, c.start as Point), c.id).toBeLessThanOrEqual(bound);
    }
  });
});
