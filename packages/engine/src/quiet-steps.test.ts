import { describe, expect, it } from 'vitest';
import type { RunRecord } from './record';
import { runScenario } from './run';
import { doctrines, draft, fixtureFire, fixtureWithDoctrineV3, withQuietStep } from './test-helpers';

/** What the battle did: arrivals and lines taken, by minute and unit. */
const outcome = (r: RunRecord) =>
  r.events.filter((e) => e.kind === 'company-reached' || e.kind === 'line-taken').map((e) => [e.minute, e.kind, e.unitId ?? null, e.lineId ?? null]);

describe('quiet steps', () => {
  it('do not change what happens: arrivals and lines taken match a run stepped finely throughout (draft)', () => {
    const coarse = runScenario(draft(), withQuietStep(doctrines(), 10), { seed: 1 });
    const fine = runScenario(draft(), withQuietStep(doctrines(), 2), { seed: 1 });
    expect(outcome(coarse)).toEqual(outcome(fine));
    expect(coarse.summary.lineTaken.map((t) => t.minute)).toEqual([32, 92, 316, 438]);
  });

  it.each([1, 2, 3, 4, 5])('do not change what happens on the v3 fixture (seed %i)', (seed) => {
    const [s, m] = fixtureWithDoctrineV3();
    // A second wave starting long after the first has consolidated: its start falls inside a quiet stretch.
    s.forces[0]!.formations[0]!.companies!.push({ ...structuredClone(s.forces[0]!.formations[0]!.companies![0]!), id: 'c3', name: 'C Company', startAfterMin: { value: 121, estimate: 'test' } });
    const coarse = runScenario(s, withQuietStep(m, 10), { seed });
    const fine = runScenario(s, withQuietStep(m, 2), { seed });
    expect(outcome(coarse)).toEqual(outcome(fine));
    expect(outcome(coarse).some((o) => o[2] === 'c3')).toBe(true);
  });

  it('do not change what happens while companies fire on each other with nobody moving (Task 9)', () => {
    // The attackers wait 550 m off for 100 minutes under the garrisons' fire, then go in.
    const [s, m] = fixtureFire({ lagMin: 100 });
    const coarse = runScenario(s, withQuietStep(m, 10), { seed: 1, endMinute: 160 });
    const fine = runScenario(s, withQuietStep(m, 2), { seed: 1, endMinute: 160 });
    expect(coarse.events.filter((e) => e.kind === 'direct-fire').length).toBeGreaterThan(0);
    expect(JSON.stringify(coarse.events)).toBe(JSON.stringify(fine.events));
    expect(JSON.stringify(coarse.snapshots)).toBe(JSON.stringify(fine.snapshots));
  });
});
