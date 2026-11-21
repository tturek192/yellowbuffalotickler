import { describe, expect, it } from 'vitest';
import type { RunRecord } from './record';
import { runScenario } from './run';
import { artilleryFire } from './artillery';
import { initRun } from './run';
import { est } from '@wwi/scenario/test-fixtures';
import type { Pending } from './types';
import { doctrines, draft, fixtureArtillery, fixtureFire, fixtureWithDoctrineV3, ofKind, withQuietStep, withRearTrench } from './test-helpers';

/** What the battle did: arrivals and lines taken, by minute and unit. */
const outcome = (r: RunRecord) =>
  r.events.filter((e) => e.kind === 'company-reached' || e.kind === 'line-taken').map((e) => [e.minute, e.kind, e.unitId ?? null, e.lineId ?? null]);

describe('quiet steps', () => {
  it('do not change what happens: arrivals and lines taken match a run stepped finely throughout (draft)', () => {
    const coarse = runScenario(draft(), withQuietStep(doctrines(), 10), { seed: 1 });
    const fine = runScenario(draft(), withQuietStep(doctrines(), 2), { seed: 1 });
    expect(outcome(coarse)).toEqual(outcome(fine));
    // Task 10: fatigue (fatiguePerKm) slows the companies that walk on to the Blue Line, which they take 2 minutes later.
    expect(coarse.summary.lineTaken.map((t) => t.minute)).toEqual([32, 92, 318, 438]);
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

  it('do not change what happens when a barrage ends inside a quiet step: it fires for its minutes, and was on the trench until its end (Task 10 fix round)', () => {
    // A German trench under the barrage's last pause (180 m beyond the Black Line), its garrison coming up after it ends.
    // Rounds enough that the guns fire to the barrage's end (minute 73); a standing battery keeps k3 below until the
    // creeping barrage comes over it and pauses there.
    const run = (n: number) => {
      const f = withRearTrench(fixtureArtillery(), 1330, 'k3');
      f[0].artillery[0]!.ammunition = est(20000);
      f[0].artillery.push({ id: 'st', side: 'allied', weapon: '18pdr', count: est(4), role: 'standing', ammunition: est(20000), observation: 'map', horseDrawn: false });
      return runScenario(f[0], withQuietStep(f[1], n), { seed: 1, endMinute: 120, stopEarly: false });
    };
    const coarse = run(10);
    const fine = run(2);
    const up = ofKind(coarse, 'garrison-emerged').find((e) => e.segmentId!.startsWith('ger-rear'))!;
    // Up emergeMin (3) after the barrage's end at 73: at the first step end from 76.
    expect(up.minute).toBe(76);
    expect(ofKind(coarse, 'barrage-passed').find((e) => e.segmentId!.startsWith('ger-rear'))!.factors!.lastOverMin).toBe(73);
    // Events only: snapshots fall on different minutes once steps are quiet (the snapshot schedule follows the steps).
    expect(JSON.stringify(coarse.events)).toBe(JSON.stringify(fine.events));
  });

  it('a barrage that ends inside a step fires for the minutes before its end', () => {
    const f = withRearTrench(fixtureArtillery(), 1330, 'k3');
    const { state, ctx } = initRun(f[0], f[1], { seed: 1 });
    // k3 up in its trench under the last pause; the barrage paused from 33 and ends at 73.
    const k3up = state.companies.map((c) => (c.id === 'k3' ? { ...c, posture: 'in-trench' as const } : c));
    const pausing = { ...state.barrages[0]!, phase: 'pausing' as const, phaseStartMin: 33 };
    const ended = { ...pausing, phase: 'done' as const, phaseStartMin: 73 };
    const roundsOn = (b: typeof pausing, minute: number): number => {
      const pending: Pending = { damage: [] };
      artilleryFire({ ...state, minute, companies: k3up, barrages: [b], events: [] }, ctx, 10, pending);
      return pending.damage.filter((p) => p.targetId === 'k3').reduce((a, p) => a + p.rounds, 0);
    };
    const full = roundsOn(pausing, 70);
    expect(full).toBeGreaterThan(0);
    expect(roundsOn(ended, 76) / full).toBeCloseTo(7 / 10, 9);
    expect(roundsOn(ended, 90)).toBe(0);
  });
});
