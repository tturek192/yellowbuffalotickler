import { describe, expect, it } from 'vitest';
import { v } from '@wwi/scenario';
import type { Scenario } from '@wwi/scenario';
import type { RunRecord } from './record';
import { moraleThresholds } from './morale';
import type { Models } from './run';
import { SCHEDULES } from './schedule';
import { inContact, isBusy } from './step';
import type { SimState } from './step';
import { quietStep } from './schedule';
import { runPipeline } from './pipeline';
import { runScenario } from './run';
import { artilleryFire } from './artillery';
import { initRun } from './run';
import { est } from '@wwi/scenario/test-fixtures';
import type { Pending } from './types';
import { doctrines, draft, fixtureArtillery, fixtureFire, fixtureWithDoctrineV3, ofKind, withQuietStep, withRearTrench, snapshotsOf } from './test-helpers';

/** What the battle did: arrivals and lines taken, by minute and unit. */
const outcome = (r: RunRecord) =>
  r.events.filter((e) => e.kind === 'company-reached' || e.kind === 'line-taken').map((e) => [e.minute, e.kind, e.unitId ?? null, e.lineId ?? null]);

describe('quiet steps', () => {
  it('do not change what happens: arrivals and lines taken match a run stepped finely throughout (draft)', () => {
    const coarse = runScenario(draft(), withQuietStep(doctrines(), 10), { seed: 1 });
    const fine = runScenario(draft(), withQuietStep(doctrines(), 2), { seed: 1 });
    expect(outcome(coarse)).toEqual(outcome(fine));
    // Task 10: fatigue (fatiguePerKm) slows the companies that walk on to the Blue Line. Task 15: with one rng stream per
    // subsystem the companies' start and speed draws differ, and the Blue Line falls at 316 (it was 318).
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
    expect(JSON.stringify(snapshotsOf(coarse))).toBe(JSON.stringify(snapshotsOf(fine)));
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

describe('quiet steps in contact with nobody able to fire (Task 15)', () => {
  /**
   * fixtureFire with so few rounds that every company has fired its last within minutes, and a third garrison k3 in a
   * trench 30 m beyond the Black Line in front of A Company: once A Company has consolidated the two stand in contact with
   * neither able to fire.
   */
  const dry = (): [Scenario, Models] => {
    const [s, m] = withRearTrench(fixtureFire({ startX: -300 }), 1180, 'k3');
    s.forces[1]!.formations[0]!.companies!.find((c) => c.id === 'k3')!.start = [1180, 100];
    for (const d of Object.values(m.doctrines)) d.companyDefaults = { ...d.companyDefaults, roundsPerRifle: est(0.05), roundsPerLightMg: est(1), roundsPerMg: est(2) };
    return [s, m];
  };
  /** The run stepped as runScenario steps it, with this quiet step: every state, and the steps taken. */
  const stepped = (quietMin: number, endMinute: number): SimState[] => {
    const [s, m] = dry();
    const { state, ctx } = initRun(s, withQuietStep(m, quietMin), { seed: 1 });
    const out = [state];
    let st = state;
    while (st.minute < endMinute) out.push((st = runPipeline(st, ctx, Math.min(isBusy(st, ctx) ? 2 : quietStep(st, ctx, 2, quietMin), endMinute - st.minute))));
    return out;
  };

  it('contact counts only while one of the two companies can fire', () => {
    const { state, ctx } = initRun(...dry(), { seed: 1 });
    const c1 = state.companies.find((c) => c.id === 'c1')!;
    const k1 = state.companies.find((c) => c.id === 'k1')!;
    const near = state.companies.map((c) => (c.id === 'c1' ? { ...c, status: 'consolidating' as const, x: k1.x - 20, y: k1.y } : c.id === 'k1' ? { ...c, posture: 'in-trench' as const } : c));
    expect(inContact({ ...state, companies: near }, ctx)).toBe(true);
    const spent = near.map((c) => (c.id === 'c1' || c.id === 'k1' ? { ...c, ammo: 0 } : c));
    expect(inContact({ ...state, companies: spent }, ctx)).toBe(false);
    // Down in its dugout a garrison cannot fire either.
    const below = near.map((c) => (c.id === 'c1' ? { ...c, ammo: 0 } : c.id === 'k1' ? { ...c, posture: 'in-dugout' as const } : c));
    expect(inContact({ ...state, companies: below }, ctx)).toBe(false);
    expect(c1.ammo).toBeGreaterThan(0);
  });

  it('do not change what happens: attackers and garrisons that have fired their last rounds sit in contact, stepped quietly', () => {
    const coarse = runScenario(dry()[0], withQuietStep(dry()[1], 10), { seed: 1, endMinute: 400, stopEarly: false });
    const fine = runScenario(dry()[0], withQuietStep(dry()[1], 2), { seed: 1, endMinute: 400, stopEarly: false });
    expect(ofKind(coarse, 'ammunition-exhausted').length).toBe(5);
    expect(JSON.stringify(coarse.events)).toBe(JSON.stringify(fine.events));
    expect(JSON.stringify(coarse.summary)).toBe(JSON.stringify(fine.summary));
    // A Company and k3 30 m apart from the consolidation on, and the run stepping quietly through it.
    const states = stepped(10, 400);
    const late = states.filter((x) => x.minute >= 100);
    for (const x of late) {
      const c1 = x.companies.find((c) => c.id === 'c1')!;
      const k3 = x.companies.find((c) => c.id === 'k3')!;
      expect(c1.status).toBe('consolidating');
      expect(Math.hypot(c1.x - k3.x, c1.y - k3.y)).toBeLessThanOrEqual(50);
    }
    expect(late.length).toBeLessThan(40);
    expect(stepped(2, 400).filter((x) => x.minute >= 100).length).toBe(151);
  });

  it('men mopping up dugouts keep the step fine (their clearing draws each step)', () => {
    const { state, ctx } = initRun(...dry(), { seed: 1 });
    const quiet = { ...state, minute: 300, events: [], barrages: state.barrages.map((b) => ({ ...b, phase: 'done' as const })) };
    expect(isBusy(quiet, ctx)).toBe(false);
    expect(isBusy({ ...quiet, companies: quiet.companies.map((c) => (c.id === 'c1' ? { ...c, intent: 'mop-up' as const } : c)) }, ctx)).toBe(true);
  });

  it('registers morale thresholds as minutes that start movement, at the minute the morale reaches them', () => {
    expect(SCHEDULES.some(([name, source]) => name === 'morale-thresholds' && source === moraleThresholds)).toBe(true);
    /** The dry fixture with its morale numbers pinned (per hour; suppression halving in 5 minutes). */
    const pinned = (isolationDrain: number) => {
      const [s, m] = dry();
      const d = m.doctrines['bef-1917']!;
      d.common = { ...d.common, isolationDrain: est(isolationDrain), recoveryPerHour: est(0.2), suppressedDrain: est(0.3), fallBack: est(0.35), surrender: est(0.15), goToGround: est(0.5) };
      m.tables.effects = { ...m.tables.effects, suppressionHalfLifeMin: est(5) };
      return initRun(s, m, { seed: 1 });
    };
    const at = (o: ReturnType<typeof pinned>, suppression: number, morale: number) =>
      moraleThresholds({ ...o.state, companies: o.state.companies.map((c) => (c.id === 'c1' ? { ...c, status: 'advancing' as const, morale, moraleStart: 1, suppression } : c)) }, o.ctx);
    // c1 attacking and isolated as far as anyone knows (no morale phase has run), 0.06 above falling back (0.35).
    // Isolation outrunning recovery (0.3 against 0.2 an hour): due when the net fall of 0.1 an hour reaches it, 36 minutes.
    expect(at(pinned(0.3), 0, 0.41).map((x) => x.minute)).toContainEqual(expect.closeTo(36, 6));
    // Isolation slower than recovery: never due.
    const slow = pinned(0.1);
    expect(at(slow, 0, 0.41)).toEqual([]);
    // Full suppression close above the threshold: 0.3/60 a minute can take 0.3 · 5 / (60 ln 2) ≈ 0.036 before it wears
    // off, so 0.02 above it is due, at the present rate of fall (an early guess): 0.02 / ((0.1 − 0.2 + 0.3) / 60) = 6 min.
    expect(at(slow, 1, 0.37)).toContainEqual({ minute: expect.closeTo(6, 9), startsMovement: true });
    // 0.06 above it is beyond what suppression can take: never due.
    expect(at(slow, 1, 0.41)).toEqual([]);
  });

  it('an off-map attack opening inside a quiet stretch opens at the minute fine steps open it', () => {
    const run = (n: number) => {
      const [s, m] = fixtureFire({ startX: -300 });
      s.offMap = {
        fire: [],
        attacks: [{ id: 'flank', side: 'allied', name: 'A flank division', window: { from: '1916-07-01T10:50', to: '1916-07-01T11:30' }, targetFeatureId: 'ger-front-a', suppressFrac: est(0.25), cite: est('test') }],
      };
      return runScenario(s, withQuietStep(m, n), { seed: 1, endMinute: 300, stopEarly: false });
    };
    const at = (r: RunRecord) => ofKind(r, 'off-map-attack').map((e) => e.minute);
    expect(at(run(10))).toEqual(at(run(2)));
    expect(at(run(2)).length).toBe(1);
  });
});
