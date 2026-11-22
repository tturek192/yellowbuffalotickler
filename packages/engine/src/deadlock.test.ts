import { describe, expect, it } from 'vitest';
import { checkReferences, ScenarioSchema } from '@wwi/scenario';
import type { Scenario } from '@wwi/scenario';
import { est } from '@wwi/scenario/test-fixtures';
import { summarizeBatch, extractRun } from './batch';
import { deadlockPhase, deadlockSummary, forceFit, scoreDeadlock } from './deadlock';
import { holderOf } from './end';
import type { By } from './deadlock';
import { runPipeline } from './pipeline';
import { round } from './record';
import type { RunRecord } from './record';
import { initRun, runScenario } from './run';
import type { Models } from './run';
import type { SimEvent, Side } from './types';
import type { SimState } from './step';
import { fixtureFire, fixtureReserves, fixtureWithDoctrineV3, runStates, vimy, vimyDoctrines, withQuietStep } from './test-helpers';

/*
 * Deadlock scoring (Plan 4 Task 3). The fixtures are the v3 fixture (two assault companies, 300 men, against two garrison
 * companies, 240 men, on the German front at x 150, the Black Line at x 1150): its garrisons are trapped and all taken
 * prisoner by minute 4, and the attackers go on to the Black Line, past a German gun line drawn at x 600, and on to a
 * knoll there (the stronghold). With an off-map German reserve `gres` (two companies of 100 men at x 3000, inside the
 * sector) where a test needs one.
 */

const cite = est('test');

const HOLD_DEFAULT = 'deadlock.strongholdHoldMin ← 60 (an estimate: a local counter-attack\'s chance: the loss reported, the reserve formed up, deployed and in)';

type Opts = { conditions?: By[]; surrenderFrac?: number; reserve?: boolean; section?: boolean; sector2?: boolean; holdMin?: number; knollAt?: [number, number] };

/** The v3 fixture, scored: the gun line at x 600, the knoll at (1150, 100) the stronghold, and optionally the reserve gres. */
function scored(o: Opts = {}): [Scenario, Models] {
  const [s, m] = fixtureWithDoctrineV3();
  s.features.push({ id: 'guns', kind: 'battery', side: 'central', geometry: { type: 'LineString', coordinates: [[600, -100], [600, 500]] }, cite });
  s.features.push({ id: 'knoll', kind: 'strongpoint', side: 'central', geometry: { type: 'Point', coordinates: o.knollAt ?? [1150, 100] }, cite });
  if (o.section !== false)
    s.deadlock = {
      attacker: 'allied',
      artilleryLine: { featureId: 'guns' },
      strongholds: [{ featureId: 'knoll' }],
      ...(o.conditions ? { conditions: o.conditions } : {}),
      ...(o.surrenderFrac !== undefined ? { surrenderFrac: est(o.surrenderFrac) } : {}),
      ...(o.holdMin !== undefined ? { strongholdHoldMin: est(o.holdMin) } : {}),
    };
  if (o.sector2) {
    // A second sector north of s1 (y 400 to 800) with a German trench of its own, ger-front-b, held by k3 (50 men).
    s.sectors.push({ ...structuredClone(s.sectors[0]!), id: 's2', name: 'Sector 2', yMin: 400, yMax: 800 });
    s.features.push({ id: 'ger-front-b', kind: 'trench', side: 'central', geometry: { type: 'LineString', coordinates: [[150, 500], [150, 700]] }, cite });
    s.forces[1]!.formations[0]!.companies!.push({ id: 'k3', name: '3. Kompanie', role: 'garrison', strength: est(50), start: [150, 600], trenchFeatureId: 'ger-front-b' });
  }
  if (o.reserve) {
    s.forces[1]!.formations[0]!.children = [
      {
        id: 'gres',
        name: 'Ruhe-Bataillon',
        kind: 'battalion',
        companies: [1, 2].map((n) => ({ id: `gres-${n}`, name: `Ruhe-Kompanie ${n}`, role: 'reserve' as const, strength: est(100), start: [3000, 100 + 200 * (n - 1)] as [number, number] })),
      },
    ];
    s.reserves = [{ formationId: 'gres', side: 'central', distanceKm: est(8), entryPoint: [3000, 200] }];
  }
  return [s, m];
}

/** A record's deadlock and events, from a run of the pipeline to `endMinute`, with `at` applied to the state at Zero. */
function runFrom(f: [Scenario, Models], at?: (s: SimState) => SimState, endMinute = 120): Pick<RunRecord, 'events'> & { summary: Pick<RunRecord['summary'], 'deadlock'>; last: SimState } {
  const { state, ctx } = initRun(...f, { seed: 1 });
  let s = at ? at(state) : state;
  const events = [...s.events];
  while (s.minute < endMinute) {
    s = runPipeline(s, ctx, 2);
    events.push(...s.events);
  }
  return { events, summary: { deadlock: deadlockSummary(s) }, last: s };
}

/**
 * The seal, with a real order and arrival: fixtureReserves (the German division orders its resting battalion gres, two
 * companies of 100 men, at minute 6 once its front is lost; gres comes on to the map at (2500, 200) at minute 8 and walks
 * to the German front at x 150, past x 1100 at about minute 30), the attackers going to the Black Line at x 1150, past
 * a gun line at x 900 at about minute 24. With `entryY` gres comes on at (2500, entryY), in a sector s2 (y 800 to 1200).
 */
function sealRun(o: { sealDistanceM: number; entryY?: number }): RunRecord {
  const [s, m] = fixtureReserves({ objective: 'black', distanceKm: 0, noCompanies: false });
  const de = m.doctrines['de-1917']!;
  const fast = (value: number) => ({ value, estimate: 'test', description: 'test' });
  de.common = { ...de.common, baseOrderDelayMin: fast(1), deployMin: fast(1), reportEveryMin: fast(2) };
  m.tables.channels.runner = { delayMin: fast(1), failPerHour: fast(0) };
  s.features.push({ id: 'guns', kind: 'battery', side: 'central', geometry: { type: 'LineString', coordinates: [[900, -100], [900, 1300]] }, cite });
  s.features.push({ id: 'knoll', kind: 'strongpoint', side: 'central', geometry: { type: 'Point', coordinates: [1150, 100] }, cite });
  s.deadlock = { attacker: 'allied', artilleryLine: { featureId: 'guns' }, sealDistanceM: est(o.sealDistanceM), strongholds: [{ featureId: 'knoll' }], conditions: ['breakthrough', 'stronghold'] };
  if (o.entryY !== undefined) {
    s.sectors.push({ ...structuredClone(s.sectors[0]!), id: 's2', name: 'Sector 2', yMin: 800, yMax: 1200 });
    s.reserves[0]!.entryPoint = [2500, o.entryY];
  }
  return runScenario(s, m, { seed: 1, endMinute: 120 });
}

/**
 * fixtureReserves with real orders: the division orders gres (two companies, 100 men each, off the map at Zero, entering
 * at (2500, 200)) forward once its front is lost, at minute 50 (minute 6 with `fast`), to a segment of ger-front-a in s1;
 * gres arrives at minute 96 (8) and walks to the front. Scored on collapse only; the states to `endMinute`.
 */
function reserveStates(o: { fast?: boolean; endMinute?: number }) {
  const [s, m] = fixtureReserves({ objective: 'black', distanceKm: 0, noCompanies: false });
  if (o.fast) {
    const de = m.doctrines['de-1917']!;
    const fast = (value: number) => ({ value, estimate: 'test', description: 'test' });
    de.common = { ...de.common, baseOrderDelayMin: fast(1), deployMin: fast(1), reportEveryMin: fast(2) };
    m.tables.channels.runner = { delayMin: fast(1), failPerHour: fast(0) };
  }
  s.features.push({ id: 'guns', kind: 'battery', side: 'central', geometry: { type: 'LineString', coordinates: [[5000, -100], [5000, 1300]] }, cite });
  s.deadlock = { attacker: 'allied', artilleryLine: { featureId: 'guns' }, strongholds: [], conditions: ['collapse'] };
  return { f: [s, m] as [Scenario, Models], ...runStates([s, m], { endMinute: o.endMinute ?? 200 }) };
}

/** The German men fit, counted by hand over the whole force: every company with men not pinned, surrendered, falling back or destroyed (off-map reserves not yet arrived included). */
const UNFIT_TEST = ['pinned', 'surrendered', 'falling-back', 'destroyed'];
const handFit = (s: SimState): number => s.companies.filter((c) => c.side === 'central' && c.men > 0 && !UNFIT_TEST.includes(c.status)).reduce((a, c) => a + c.men, 0);
/** Every German man at Zero (conservation: the same at every state). */
const allMen = (s: SimState): number => s.companies.filter((c) => c.side === 'central').reduce((a, c) => a + c.men + c.killed + c.wounded + c.captured, 0);

/** Breakthrough, then stronghold: gres comes within 1,600 m behind the gun line on arrival (minute 8), or 100 m only at about minute 30. */
const runBreak = (o: { reserveArrivesFirst: boolean }) => sealRun({ sealDistanceM: o.reserveArrivesFirst ? 1600 : 100 });
/** The garrisons all taken prisoner at minute 4. */
const runSurrender = () => runScenario(...scored(), { seed: 1 });
/** The same, collapse checked first: no German left fit in the whole force, and no reserve. */
const runCollapse = (o: Opts = {}) => runScenario(...scored({ conditions: ['collapse', 'surrender', 'stronghold'], ...o }), { seed: 1 });
/** Breakthrough excluded: the attackers stand on the knoll from minute 32 and hold it; held 10 minutes, it counts at 42. */
const runStronghold = (holdMin = 10) => runScenario(...scored({ conditions: ['stronghold'], holdMin }), { seed: 1 });
/** fixtureFire: four machine guns to each garrison hold the attackers off until the time cap. */
function runUnbroken(): RunRecord {
  const [s, m] = fixtureFire({ mgs: 4, startX: -500 });
  s.timeLimitMinutes = 240;
  s.features.push({ id: 'guns', kind: 'battery', side: 'central', geometry: { type: 'LineString', coordinates: [[600, -100], [600, 500]] }, cite });
  s.deadlock = { attacker: 'allied', artilleryLine: { featureId: 'guns' }, strongholds: [{ featureId: 'ger-front-a' }] };
  return runScenario(s, m, { seed: 1 });
}

/** The record's events with the deadlock-broken event taken out and the ids after it (and refs to them) moved back. */
function withoutDeadlock(events: RunRecord['events']): RunRecord['events'] {
  const gone = events.filter((e) => e.kind === 'deadlock-broken').map((e) => e.id);
  const shift = (id: number) => id - gone.filter((g) => g < id).length;
  return events.filter((e) => e.kind !== 'deadlock-broken').map((e) => ({ ...e, id: shift(e.id), refs: e.refs.map(shift) }));
}

/**
 * The stronghold's clock, step by step: the v3 fixture scored on the stronghold alone, the knoll moved out to (1400, 100),
 * beyond every trench, so that it is the Allies' only while men of theirs stand on it. From the state at Zero, each step
 * given as [minute, on]: c1 (150 men) stands on the knoll (on) or back where it started (off), and the deadlock is checked
 * (deadlockPhase) at that minute. A step longer than 2 minutes stands for a quiet step: nobody moves within it, and what
 * changed shows at its end, as in a run.
 */
function clock(holdMin: number, steps: Array<[number, boolean]>): { d: NonNullable<RunRecord['summary']['deadlock']>; holders: Array<Side | null>; broken: SimEvent[] } {
  const { state, ctx } = initRun(...scored({ conditions: ['stronghold'], holdMin, knollAt: [1400, 100] }), { seed: 1 });
  const home = state.companies.find((c) => c.id === 'c1')!;
  let s = state;
  const holders: Array<Side | null> = [];
  const broken: SimEvent[] = [];
  for (const [minute, on] of steps) {
    const companies = s.companies.map((c) => (c.id === 'c1' ? { ...c, x: on ? 1400 : home.x, y: on ? 100 : home.y } : c));
    s = deadlockPhase({ ...s, minute, events: [], companies }, ctx);
    holders.push(holderOf(s, ctx, 'knoll'));
    broken.push(...s.events.filter((e) => e.kind === 'deadlock-broken'));
  }
  return { d: deadlockSummary(s)!, holders, broken };
}

/** Fine steps of 2 minutes from `from` to `to`, c1 on the knoll or off it throughout. */
const steps = (from: number, to: number, on: boolean): Array<[number, boolean]> => Array.from({ length: (to - from) / 2 + 1 }, (_, i) => [from + 2 * i, on]);

let vimy1: RunRecord | undefined;
const vimySeed1 = (): RunRecord => (vimy1 ??= runScenario(vimy(), vimyDoctrines(), { seed: 1 }));

describe('deadlock scoring (Plan 4 Task 3)', () => {
  it('records breakthrough when an attacker passes the artillery line before any reserve arrives, and not after one has', () => {
    expect(runBreak({ reserveArrivesFirst: false }).summary.deadlock).toMatchObject({ broken: true, by: 'breakthrough' });
    expect(runBreak({ reserveArrivesFirst: true }).summary.deadlock!.by).not.toBe('breakthrough');
    // With the reserve there, the run still breaks it, by the next condition listed.
    expect(runBreak({ reserveArrivesFirst: true }).summary.deadlock).toMatchObject({ broken: true, by: 'stronghold' });
    expect(runBreak({ reserveArrivesFirst: false }).summary.deadlock).toMatchObject({ sectorId: 's1', margins: { breakthrough: { sectorId: 's1' } } });
  });

  it('a reserve seals a sector only within sealDistanceM behind the gun line, and only its own sector (real order and arrival)', () => {
    // On the map from minute 8 but 1,600 m behind the line: no seal; the attackers cross at about minute 24.
    const far = sealRun({ sealDistanceM: 100 });
    const arrived = far.events.find((e) => e.kind === 'reserve-arrived')!;
    expect(arrived.minute).toBeLessThan(far.summary.deadlock!.minute!);
    expect(far.summary.deadlock).toMatchObject({ by: 'breakthrough', sectorId: 's1' });
    // Within the distance on arrival: sealed before the crossing.
    const near = sealRun({ sealDistanceM: 1600 });
    expect(near.events.find((e) => e.kind === 'reserve-arrived')!.minute).toBe(arrived.minute);
    expect(near.summary.deadlock!.by).toBe('stronghold');
    // Within the distance on arrival, but in s2: s1 is not sealed until gres walks into it, after the crossing.
    const other = sealRun({ sealDistanceM: 1600, entryY: 1000 });
    expect(other.events.some((e) => e.kind === 'reserve-arrived' && e.minute < other.summary.deadlock!.minute!)).toBe(true);
    expect(other.summary.deadlock).toMatchObject({ by: 'breakthrough', sectorId: 's1' });
  });

  it('sealDistanceM: the default is listed in defaultsUsed, and the schema takes only a positive distance', () => {
    expect(runScenario(...scored(), { seed: 1, endMinute: 4 }).defaultsUsed).toContain('deadlock.sealDistanceM ← 1000 (an estimate)');
    const [s] = scored();
    for (const value of [0, -100]) expect(ScenarioSchema.safeParse({ ...s, deadlock: { ...s.deadlock, sealDistanceM: est(value) } }).success).toBe(false);
    expect(ScenarioSchema.safeParse({ ...s, deadlock: { ...s.deadlock, sealDistanceM: est(500) } }).success).toBe(true);
  });

  it('records surrender when captured defenders reach surrenderFrac of their men at Zero', () => {
    expect(runSurrender().summary.deadlock).toMatchObject({ broken: true, by: 'surrender' });
    expect(runSurrender().summary.deadlock).toMatchObject({ minute: 4, margins: { surrender: { capturedFrac: 1 } } });
    expect(runSurrender().summary.deadlock!.sectorId).toBeUndefined();
  });

  it("surrender's denominator is every defender's men at Zero, off-map reserves included: a reserve's arrival does not change it", () => {
    // gres (200 men) off the map until minute 8, a real order and arrival; k1 and k2 taken prisoner.
    const { states } = reserveStates({ fast: true, endMinute: 40 });
    const all = (s: SimState) => s.companies.filter((c) => c.side === 'central').reduce((a, c) => a + c.men + c.killed + c.wounded + c.captured, 0);
    const captured = (s: SimState) => s.companies.filter((c) => c.side === 'central').reduce((a, c) => a + c.captured, 0);
    const before = states.find((s) => s.minute === 6)!;
    const after = states.at(-1)!;
    expect(before.reserves[0]!.status).not.toBe('arrived');
    expect(after.reserves[0]!.status).toBe('arrived');
    expect(all(before)).toBe(all(after));
    // Every margin step at the fixed denominator, gres's men in it from Zero.
    for (const s of [before, after]) expect(deadlockSummary(s)!.margins.surrender.capturedFrac).toBeCloseTo(captured(s) / all(states[0]!), 4);
    expect(captured(after)).toBeGreaterThan(0);
  });

  it('records collapse when the whole force, reserves included, falls below collapseFrac of its men at Zero, naming no sector', () => {
    const d = runCollapse().summary.deadlock!;
    expect(d).toMatchObject({ broken: true, by: 'collapse', minute: 4 });
    expect(d.sectorId).toBeUndefined();
    expect(d.margins.collapse).toEqual({ minFitFrac: 0, minute: 4 });
    const e = runCollapse().events.find((x) => x.kind === 'deadlock-broken')!;
    expect(e.sectorId).toBeUndefined();
  });

  it("losing one sector's garrison does not collapse the force", () => {
    // v3 with s2 (k3, 50 men) and the resting battalion gres (200, never sent): k1 and k2 (240) are taken in s1, and the
    // force keeps at least gres's 200 of its 490 (k3 is under s2's barrage too).
    const r = runFrom(scored({ conditions: ['collapse'], reserve: true, sector2: true }));
    expect(r.last.companies.filter((c) => c.id === 'k1' || c.id === 'k2').every((c) => c.men === 0)).toBe(true);
    expect(r.summary.deadlock).toMatchObject({ broken: false });
    expect(r.summary.deadlock!.margins.collapse.minFitFrac).toBeGreaterThanOrEqual(round(200 / 490, 4));
  });

  it('an arrived reserve is counted once, and every reserve counts wherever it is sent (real order and arrival)', () => {
    const { states, ctx } = reserveStates({});
    expect(new Set(states.map((s) => s.reserves[0]!.status))).toEqual(new Set(['waiting', 'ordered', 'marching', 'arrived']));
    for (const s of states) expect(forceFit(s, ctx)).toBe(handFit(s));
    // The share against the men at Zero, gres's included and fixed.
    const last = states.at(-1)!;
    expect(deadlockSummary(last)!.margins.collapse.minFitFrac).toBeCloseTo(Math.min(...states.map((s) => handFit(s) / allMen(states[0]!))), 4);
  });

  it('records stronghold when the attacker holds every stronghold feature', () => {
    expect(runStronghold().summary.deadlock).toMatchObject({ broken: true, by: 'stronghold' });
    expect(runStronghold().summary.deadlock!.margins.stronghold).toMatchObject({ held: 1, of: 1 });
    // Taken at 32, the run ends at 46: held 14 minutes, short of 20.
    expect(runStronghold(20).summary.deadlock).toMatchObject({ broken: false, margins: { stronghold: { held: 1, longestHoldMin: 14 } } });
  });

  it('the stronghold clock: the knoll is the Allies\' while c1 stands on it, and the Germans\' when it does not', () => {
    const { holders } = clock(30, [[2, false], [4, true], [6, false]]);
    expect(holders).toEqual(['central', 'allied', 'central']);
  });

  it('a momentary majority shorter than strongholdHoldMin does not break the deadlock', () => {
    // Held from minute 10 to 30 (20 minutes), then lost: short of 30.
    const { d, broken } = clock(30, [...steps(2, 8, false), ...steps(10, 30, true), ...steps(32, 80, false)]);
    expect(d).toMatchObject({ broken: false, atBreak: null });
    expect(broken).toEqual([]);
    expect(d.margins.stronghold).toEqual({ held: 1, of: 1, minute: 10, longestHoldMin: 20, longestHoldMinute: 30 });
  });

  it('a hold of strongholdHoldMin or longer breaks the deadlock, at the minute the hold completes', () => {
    const { d, broken } = clock(30, [...steps(2, 8, false), ...steps(10, 80, true)]);
    expect(d).toMatchObject({ broken: true, by: 'stronghold', minute: 40 });
    expect(broken.map((e) => e.minute)).toEqual([40]);
    expect(broken[0]!.causes).toEqual(['stronghold-held']);
    expect(d.atBreak!.stronghold).toMatchObject({ longestHoldMin: 30, longestHoldMinute: 40 });
    // The hold goes on after the break: the whole-run margin keeps counting.
    expect(d.margins.stronghold).toMatchObject({ longestHoldMin: 70, longestHoldMinute: 80 });
    // A hold of a length off the 2-minute grid completes between two steps: the break is at its minute (41), seen at 42.
    const odd = clock(31, [...steps(2, 8, false), ...steps(10, 80, true)]);
    expect(odd.d.minute).toBe(41);
    expect(odd.broken.map((e) => e.minute)).toEqual([41]);
    // Exactly strongholdHoldMin and then lost: it breaks.
    expect(clock(30, [...steps(10, 40, true), ...steps(42, 60, false)]).d).toMatchObject({ broken: true, minute: 40 });
  });

  it('a hold that is lost and then regained restarts the clock', () => {
    // Held 10 to 30, lost at 32, held again from 34: 30 minutes from 34, at 64 (not 40).
    const { d, broken } = clock(30, [...steps(10, 30, true), [32, false], ...steps(34, 90, true)]);
    expect(d).toMatchObject({ broken: true, by: 'stronghold', minute: 64 });
    expect(broken.map((e) => e.minute)).toEqual([64]);
  });

  it('quiet steps do not change the stronghold\'s outcome: a hold completing inside a quiet step', () => {
    // On the knoll at 10; the next step a quiet one to 50, lost at its end. Fine steps see the hold from 10 to 48.
    for (const holdMin of [33, 38, 40, 45]) {
      const coarse = clock(holdMin, [...steps(2, 10, true).map(([m]): [number, boolean] => [m, m >= 10]), [50, false], ...steps(52, 60, false)]);
      const fine = clock(holdMin, [...steps(2, 10, true).map(([m]): [number, boolean] => [m, m >= 10]), ...steps(12, 48, true), ...steps(50, 60, false)]);
      expect(JSON.stringify(coarse.d)).toBe(JSON.stringify(fine.d));
      expect(JSON.stringify(coarse.broken.map((e) => [e.minute, e.text, e.refs]))).toBe(JSON.stringify(fine.broken.map((e) => [e.minute, e.text, e.refs])));
    }
    // Completing by 48 (33, 38): broken at 10 + holdMin; completing at 50, the quiet step's end, when the knoll is lost: not.
    expect(clock(33, [[10, true], [50, false]]).d).toMatchObject({ broken: true, minute: 43 });
    expect(clock(38, [[10, true], [50, false]]).d).toMatchObject({ broken: true, minute: 48 });
    expect(clock(40, [[10, true], [50, false]]).d).toMatchObject({ broken: false, margins: { stronghold: { longestHoldMin: 38, longestHoldMinute: 48 } } });
    // Held at the quiet step's end: it breaks at the completion minute.
    expect(clock(40, [[10, true], [50, true]]).d).toMatchObject({ broken: true, minute: 50 });
  });

  it('quiet steps do not change the stronghold\'s outcome in a run (quiet steps of 10 against 2)', () => {
    // The attackers stand on the knoll from minute 32 and consolidate there; held 45 minutes, the hold completes at 77,
    // inside the coarse run's quiet step from 74 to 84 (a finely stepped run sees it at 78).
    const run = (n: number) => {
      const [s, m] = scored({ conditions: ['stronghold'], holdMin: 45 });
      return runScenario(s, withQuietStep(m, n), { seed: 1, endMinute: 120, stopEarly: false, snapshotEveryStep: true });
    };
    const coarse = run(10);
    const fine = run(2);
    expect(coarse.summary.deadlock).toMatchObject({ broken: true, by: 'stronghold', minute: 77 });
    expect(JSON.stringify(coarse.summary.deadlock)).toBe(JSON.stringify(fine.summary.deadlock));
    const stepEnds = coarse.snapshots.map((x) => x.minute);
    expect(stepEnds).not.toContain(78);
    expect(stepEnds.some((m, i) => i > 0 && stepEnds[i - 1]! < 77 && m > 78)).toBe(true);
    // The event the same in both, at the minute the hold completed.
    const ev = (r: RunRecord) => JSON.stringify(r.events.filter((e) => e.kind === 'deadlock-broken').map((e) => [e.minute, e.text, e.factors]));
    expect(ev(coarse)).toBe(ev(fine));
  });

  it('strongholdHoldMin: the default is listed in defaultsUsed, and the schema takes only a positive number of minutes up to a day', () => {
    expect(runScenario(...scored(), { seed: 1, endMinute: 4 }).defaultsUsed).toContain(HOLD_DEFAULT);
    const [s] = scored();
    for (const value of [0, -5, 2000]) expect(ScenarioSchema.safeParse({ ...s, deadlock: { ...s.deadlock, strongholdHoldMin: est(value) } }).success).toBe(false);
    expect(ScenarioSchema.safeParse({ ...s, deadlock: { ...s.deadlock, strongholdHoldMin: est(30) } }).success).toBe(true);
    expect(runScenario(...scored({ holdMin: 30 }), { seed: 1, endMinute: 4 }).defaultsUsed).not.toContain(HOLD_DEFAULT);
  });

  it("the stronghold event's refs point to the step the hold began", () => {
    const r = runStronghold();
    expect(r.summary.deadlock).toMatchObject({ broken: true, by: 'stronghold', minute: 42 });
    const e = r.events.find((x) => x.kind === 'deadlock-broken')!;
    expect(e.minute).toBe(42);
    expect(e.refs.length).toBeGreaterThan(0);
    expect(e.refs.every((id) => id < e.id)).toBe(true);
    // The hold began at minute 32, when the attackers came on to the knoll: the refs are that step's events.
    expect(e.refs.map((id) => r.events.find((x) => x.id === id)!.minute)).toContain(32);
    expect(e.refs.every((id) => r.events.find((x) => x.id === id)!.minute <= 32)).toBe(true);
    expect(e.factors).toMatchObject({ since: 32, holdMin: 10 });
  });

  it('only the listed conditions apply', () => {
    expect(runCollapse({ conditions: ['stronghold'] }).summary.deadlock!.by).not.toBe('collapse');
    expect(runCollapse({ conditions: [] }).summary.deadlock).toMatchObject({ broken: false });
  });

  it('the defaults are listed in defaultsUsed', () => {
    const [s, m] = scored();
    delete s.deadlock!.strongholds;
    s.end = { keyGround: [{ id: 'knoll', name: 'The knoll', featureId: 'knoll', cite }], lullMin: est(120) };
    const used = runScenario(s, m, { seed: 1 }).defaultsUsed.filter((d) => d.startsWith('deadlock'));
    expect(used).toEqual([
      'deadlock.collapseFrac ← 0.1 (the owner\'s: "fewer than 10% of enemy troops remaining")',
      'deadlock.conditions ← all four: breakthrough, surrender, collapse, stronghold',
      'deadlock.sealDistanceM ← 1000 (an estimate)',
      HOLD_DEFAULT,
      'deadlock.strongholds ← end.keyGround: knoll',
      'deadlock.surrenderFrac ← 0.5 (an estimate)',
    ]);
    // Everything given: no default.
    const [t, n] = scored({ conditions: ['surrender'], surrenderFrac: 0.6 });
    t.deadlock!.collapseFrac = est(0.2);
    t.deadlock!.sealDistanceM = est(500);
    t.deadlock!.strongholdHoldMin = est(30);
    expect(runScenario(t, n, { seed: 1 }).defaultsUsed.filter((d) => d.startsWith('deadlock'))).toEqual([]);
  });

  it('a scenario with no deadlock section is scored from defaults when end.keyGround and an attacker exist, else null', () => {
    const withKeyGround = (): [Scenario, Models] => {
      const f = scored({ section: false });
      f[0].end = { keyGround: [{ id: 'knoll', name: 'The knoll', featureId: 'knoll', cite }], lullMin: est(120) };
      return f;
    };
    const r = runScenario(...withKeyGround(), { seed: 1 });
    expect(r.summary.deadlock).toMatchObject({ broken: true, by: 'surrender', margins: { breakthrough: { furthestBeyondM: null }, stronghold: { of: 1 } } });
    expect(r.defaultsUsed).toEqual(
      expect.arrayContaining([
        'deadlock ← defaults (no deadlock section): attacker allied, the only side with attacking companies',
        'deadlock.artilleryLine ← none (no deadlock section): breakthrough is not scored',
      ]),
    );
    // No key ground: not scored.
    expect(runScenario(...scored({ section: false }), { seed: 1 }).summary.deadlock).toBeNull();
    // No side attacks: not scored.
    const [s, m] = withKeyGround();
    for (const c of s.forces[0]!.formations[0]!.companies!) c.role = 'reserve';
    const quiet = runScenario(s, m, { seed: 1, endMinute: 10 });
    expect(quiet.summary.deadlock).toBeNull();
    expect(quiet.events.some((e) => e.kind === 'deadlock-broken')).toBe(false);
  });

  it('an unbroken run records its margins', () => {
    expect(runUnbroken().summary.deadlock).toMatchObject({ broken: false, margins: { stronghold: { of: expect.any(Number) } } });
    const d = runUnbroken().summary.deadlock!;
    expect(d.by).toBeUndefined();
    expect(d.minute).toBeUndefined();
    // Held off short of the gun line; the garrisons fit.
    expect(d.margins.breakthrough.furthestBeyondM).toBeLessThan(0);
    expect(d.margins).toMatchObject({ surrender: { capturedFrac: 0 }, stronghold: { held: 0, of: 1 } });
    expect(d.margins.collapse.minFitFrac).toBeGreaterThan(0.1);
    expect(d.atBreak).toBeNull();
  });

  it('each margin records the minute it was reached; the margins run to the end, and atBreak holds them as they stood at the break', () => {
    const r = runSurrender().summary.deadlock!;
    // All taken prisoner at minute 4: the surrender margin and the collapse margin both reached then.
    expect(r.margins.surrender).toEqual({ capturedFrac: 1, minute: 4 });
    expect(r.margins.collapse).toMatchObject({ minFitFrac: 0, minute: 4 });
    expect(r.atBreak!.surrender).toEqual({ capturedFrac: 1, minute: 4 });
    // The attackers go on past the line after the break: the whole-run margin is further on, and later, than at the break.
    const b = runBreak({ reserveArrivesFirst: false }).summary.deadlock!;
    expect(b.margins.breakthrough.furthestBeyondM!).toBeGreaterThan(b.atBreak!.breakthrough.furthestBeyondM!);
    expect(b.margins.breakthrough.minute!).toBeGreaterThan(b.minute!);
    expect(b.atBreak!.breakthrough.minute).toBe(b.minute);
    expect(b.atBreak!.stronghold.minute === null || b.atBreak!.stronghold.minute <= b.minute!).toBe(true);
    // Unmoved from Zero: minute 0.
    expect(runUnbroken().summary.deadlock!.margins.surrender).toEqual({ capturedFrac: 0, minute: 0 });
  });

  it('the deadlock-broken event has causes and refs', () => {
    const e = runBreak({ reserveArrivesFirst: false }).events.find((x) => x.kind === 'deadlock-broken')!;
    expect(e.causes.length).toBeGreaterThan(0);
    expect(e.refs.length).toBeGreaterThan(0);
    expect(e).toMatchObject({ sectorId: 's1', causes: ['beyond-the-guns'] });
    expect(e.unitId).toBeUndefined();
    // Surrender names no sector; each event's refs point backwards.
    const s = runSurrender().events.find((x) => x.kind === 'deadlock-broken')!;
    expect(s.sectorId).toBeUndefined();
    expect(s.causes).toEqual(['mass-surrender']);
    expect(s.refs.every((r) => r < s.id)).toBe(true);
    // Emitted once, at the minute recorded.
    const r = runSurrender();
    expect(r.events.filter((x) => x.kind === 'deadlock-broken').map((x) => x.minute)).toEqual([r.summary.deadlock!.minute]);
  });

  it('scoreDeadlock reports the first breaking, with its minute and sector', () => {
    const f = scored({ conditions: ['breakthrough', 'stronghold'] });
    const { last } = runFrom(f);
    const { ctx } = initRun(...scored({ conditions: ['breakthrough', 'stronghold'] }), { seed: 1 });
    const d = deadlockSummary(last)!;
    expect(d).toMatchObject({ broken: true, by: 'breakthrough' });
    expect(scoreDeadlock(last, ctx)).toEqual({ broken: true, by: d.by, minute: d.minute, sectorId: d.sectorId });
  });

  it('is an observer: unscored (state.deadlock null), the events (but deadlock-broken, ids moved back) and snapshots are byte-identical', () => {
    const on = runScenario(...scored(), { seed: 1 });
    const off = runScenario(...scored(), { seed: 1, unscored: true });
    expect(on.events.some((e) => e.kind === 'deadlock-broken')).toBe(true);
    expect(off.summary.deadlock).toBeNull();
    expect(JSON.stringify(withoutDeadlock(on.events))).toBe(JSON.stringify(off.events));
    expect(JSON.stringify(on.snapshots)).toBe(JSON.stringify(off.snapshots));
    // The same through the pipeline alone, the state's deadlock set to null at Zero.
    const a = runFrom(scored({ reserve: true }));
    const b = runFrom(scored({ reserve: true }), (s) => ({ ...s, deadlock: null }));
    expect(JSON.stringify(withoutDeadlock(a.events))).toBe(JSON.stringify(b.events));
    // Vimy seed 1.
    const vOff = runScenario(vimy(), vimyDoctrines(), { seed: 1, unscored: true });
    const vOn = vimySeed1();
    // Unbroken (engine 0.5.4): the Canadians stand on Hill 145 in the majority from 06:50 (minute 80), but lose it again
    // 34 minutes later, short of the hour strongholdHoldMin asks; the Germans hold it at the end.
    expect(vOn.summary.deadlock).toMatchObject({ broken: false, margins: { stronghold: { held: 1, of: 1, minute: 80, longestHoldMin: 34 } } });
    expect(vOn.events.some((e) => e.kind === 'deadlock-broken')).toBe(false);
    expect(vOff.summary.deadlock).toBeNull();
    expect(JSON.stringify(withoutDeadlock(vOn.events))).toBe(JSON.stringify(vOff.events));
    expect(JSON.stringify(vOn.snapshots)).toBe(JSON.stringify(vOff.snapshots));
  }, 60000);

  it('the batch reports exactly the share of runs that broke the deadlock, by condition', () => {
    const seeds = [1, 2, 3];
    const runs = seeds.map((seed) => (seed === 1 ? vimySeed1() : runScenario(vimy(), vimyDoctrines(), { seed })));
    const b = summarizeBatch(vimy(), runs.map((r) => extractRun(vimy(), r)));
    expect(b.deadlock!.brokenShare).toBe(runs.filter((r) => r.summary.deadlock?.broken).length / 3);
    expect(Object.values(b.deadlock!.byShare).reduce((a, x) => a + x, 0)).toBeCloseTo(b.deadlock!.brokenShare);
    expect(b.deadlock!.minute === null).toBe(runs.every((r) => !r.summary.deadlock?.broken));
    for (const k of ['breakthrough', 'surrender', 'collapse', 'stronghold'] as const)
      expect(b.deadlock!.byShare[k]).toBeCloseTo(runs.filter((r) => r.summary.deadlock?.by === k).length / 3, 6);
    // The longest hold of every stronghold, over the runs.
    const holds = runs.map((r) => r.summary.deadlock!.margins.stronghold.longestHoldMin);
    expect(b.deadlock!.margins.strongholdHoldMin.median).toBe([...holds].sort((x, y) => x - y)[1]);
  }, 60000);

  it('the batch: none broken gives a null minute; unscored runs give a null deadlock', () => {
    const s = scored()[0];
    const ex = (r: RunRecord) => extractRun(s, r);
    const unbroken = summarizeBatch(s, [runUnbroken(), runUnbroken()].map((r, i) => ({ ...ex(r), seed: i + 1 })));
    expect(unbroken.deadlock).toMatchObject({ brokenShare: 0, minute: null, byShare: { breakthrough: 0, surrender: 0, collapse: 0, stronghold: 0 } });
    const unscored = runScenario(...scored({ section: false }), { seed: 1 });
    expect(summarizeBatch(s, [ex(unscored)]).deadlock).toBeNull();
  });

  it('the deadlock section is checked: strict keys, known features, a line from south to north', () => {
    const [s] = scored();
    expect(ScenarioSchema.safeParse({ ...s, deadlock: { ...s.deadlock, surenderFrac: est(0.5) } }).success).toBe(false);
    expect(ScenarioSchema.safeParse({ ...s, deadlock: { ...s.deadlock, conditions: ['collapse', 'collapse'] } }).success).toBe(false);
    expect(checkReferences(s, ['bef-1917', 'de-1917'])).toEqual([]);
    const bad = structuredClone(s);
    bad.deadlock = { ...bad.deadlock!, artilleryLine: { featureId: 'nowhere' }, strongholds: [{ featureId: 'nothing' }] };
    expect(checkReferences(bad, ['bef-1917', 'de-1917'])).toEqual(['deadlock.artilleryLine.featureId: unknown feature "nowhere"', 'deadlock.strongholds[0].featureId: unknown feature "nothing"']);
    const north = structuredClone(s);
    (north.features.find((f) => f.id === 'guns')!.geometry.coordinates as number[][]).reverse();
    expect(checkReferences(north, ['bef-1917', 'de-1917'])).toEqual(['deadlock.artilleryLine.featureId: feature "guns" must be a LineString with strictly ascending y (south to north)']);
  });

  it("Vimy's artillery line covers every sector's y-band", () => {
    const s = vimy();
    const ref = s.deadlock!.artilleryLine;
    expect('featureId' in ref && ref.featureId).toBe('ger-gun-line');
    const f = s.features.find((x) => x.id === (ref as { featureId: string }).featureId)!;
    expect(f.geometry.type).toBe('LineString');
    const ys = (f.geometry.coordinates as Array<[number, number]>).map((p) => p[1]);
    expect(Math.min(...ys)).toBeLessThanOrEqual(Math.min(...s.sectors.map((x) => x.yMin)));
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(Math.max(...s.sectors.map((x) => x.yMax)));
    // South to north, and not the two German artillery points of the fire plan.
    expect(ys.every((y, i) => i === 0 || y > ys[i - 1]!)).toBe(true);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(5000);
    expect(s.deadlock!.strongholds).toEqual([{ featureId: 'hill-145' }]);
    // Graded an estimate, naming its sourced stretches.
    expect(f.cite).toMatchObject({ estimate: expect.stringMatching(/boh-1917-1 p\. 336.*Bois du Goulot/s) });
    expect('source' in f.cite).toBe(false);
    expect(s.deadlock!.sealDistanceM).toMatchObject({ value: 1000, estimate: expect.any(String) });
  });
});
