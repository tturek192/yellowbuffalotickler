import { describe, expect, it } from 'vitest';
import { checkReferences, ScenarioSchema } from '@wwi/scenario';
import type { Scenario } from '@wwi/scenario';
import { est } from '@wwi/scenario/test-fixtures';
import { summarizeBatch, extractRun } from './batch';
import { deadlockSummary, fitBySector, scoreDeadlock } from './deadlock';
import type { By } from './deadlock';
import { runPipeline } from './pipeline';
import type { RunRecord } from './record';
import { initRun, runScenario } from './run';
import type { Models } from './run';
import type { SimState } from './step';
import { fixtureFire, fixtureReserves, fixtureWithDoctrineV3, vimy, vimyDoctrines } from './test-helpers';

/*
 * Deadlock scoring (Plan 4 Task 3). The fixtures are the v3 fixture (two assault companies, 300 men, against two garrison
 * companies, 240 men, on the German front at x 150, the Black Line at x 1150): its garrisons are trapped and all taken
 * prisoner by minute 4, and the attackers go on to the Black Line, past a German gun line drawn at x 600, and on to a
 * knoll there (the stronghold). With an off-map German reserve `gres` (two companies of 100 men at x 3000, inside the
 * sector) where a test needs one.
 */

const cite = est('test');

type Opts = { conditions?: By[]; surrenderFrac?: number; reserve?: boolean; section?: boolean; sector2?: boolean; reserveSectors?: Array<{ formationId: string; sectorId: string }> };

/** The v3 fixture, scored: the gun line at x 600, the knoll at (1150, 100) the stronghold, and optionally the reserve gres. */
function scored(o: Opts = {}): [Scenario, Models] {
  const [s, m] = fixtureWithDoctrineV3();
  s.features.push({ id: 'guns', kind: 'battery', side: 'central', geometry: { type: 'LineString', coordinates: [[600, -100], [600, 500]] }, cite });
  s.features.push({ id: 'knoll', kind: 'strongpoint', side: 'central', geometry: { type: 'Point', coordinates: [1150, 100] }, cite });
  if (o.section !== false)
    s.deadlock = {
      attacker: 'allied',
      artilleryLine: { featureId: 'guns' },
      strongholds: [{ featureId: 'knoll' }],
      ...(o.conditions ? { conditions: o.conditions } : {}),
      ...(o.surrenderFrac !== undefined ? { surrenderFrac: est(o.surrenderFrac) } : {}),
      ...(o.reserveSectors ? { reserveSectors: o.reserveSectors } : {}),
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

/** gres on the map at Zero, holding where it stands (x 3000, in s1): a German reserve that has arrived (staged). */
const reserveArrived = (s: SimState): SimState => ({
  ...s,
  reserves: s.reserves.map((r) => ({ ...r, status: 'arrived' as const })),
  companies: s.companies.map((c) => (c.id.startsWith('gres-') ? { ...c, status: 'holding' as const, intent: 'hold' as const } : c)),
});

/** gres ordered at Zero and marching (never arriving in the test's span) to the first segment of `featureId` (staged). */
const reserveMarching = (featureId = 'ger-front-a') => (s: SimState): SimState => ({
  ...s,
  reserves: s.reserves.map((r) => ({ ...r, status: 'marching' as const, orderedMin: 0, arriveMin: 1e6, toSegmentId: s.segments.find((x) => x.featureId === featureId)!.id })),
  companies: s.companies.map((c) => (c.id.startsWith('gres-') ? { ...c, status: 'marching' as const, intent: 'march' as const } : c)),
});

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

/** Breakthrough, then stronghold: gres comes within 1,600 m behind the gun line on arrival (minute 8), or 100 m only at about minute 30. */
const runBreak = (o: { reserveArrivesFirst: boolean }) => sealRun({ sealDistanceM: o.reserveArrivesFirst ? 1600 : 100 });
/** The garrisons all taken prisoner at minute 4. */
const runSurrender = () => runScenario(...scored(), { seed: 1 });
/** The same, collapse checked first: no German left fit in s1, nor on its way (gres, assigned to s1, is never sent). */
const runCollapse = (o: Opts = {}) => runScenario(...scored({ conditions: ['collapse', 'surrender', 'stronghold'], reserve: true, ...o }), { seed: 1 });
/** Breakthrough excluded: the knoll is taken once the attackers stand on it. */
const runStronghold = () => runScenario(...scored({ conditions: ['stronghold'] }), { seed: 1 });
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
    // k1 and k2 (240) are all taken; gres (200) is off the map throughout, or on it from Zero.
    const frac = (at?: (s: SimState) => SimState) => runFrom(scored({ conditions: [], reserve: true }), at).summary.deadlock!.margins.surrender.capturedFrac;
    expect(frac()).toBeCloseTo(240 / 440, 4);
    expect(frac(reserveArrived)).toBe(frac());
    expect(frac(reserveMarching())).toBe(frac());
  });

  it('records collapse per sector when fewer than collapseFrac of the on-map defenders in a sector remain fit, naming the sector', () => {
    expect(runCollapse().summary.deadlock).toMatchObject({ broken: true, by: 'collapse', sectorId: 's1' });
    expect(runCollapse().summary.deadlock!.margins.collapse).toMatchObject({ minFitFrac: 0, sectorId: 's1' });
  });

  it('a sector does not collapse while a reserve is on its way to it: the baseline counts the reserves assigned to it', () => {
    // (b) gres never sent: s1's baseline is k1, k2 and gres (440), and with k1 and k2 taken it collapses.
    const { state, ctx } = initRun(...scored({ reserve: true }), { seed: 1 });
    expect(state.deadlock!.zeroFit).toEqual({ s1: 440 });
    expect(runFrom(scored({ conditions: ['collapse'], reserve: true })).summary.deadlock).toMatchObject({ broken: true, by: 'collapse', sectorId: 's1' });
    // (a) gres ordered and marching to s1: 200 of 440 still to come, no collapse.
    expect(runFrom(scored({ conditions: ['collapse'], reserve: true }), reserveMarching()).summary.deadlock).toMatchObject({ broken: false, margins: { collapse: { minFitFrac: expect.closeTo(200 / 440, 4) } } });
    // (c) s1's fit men with gres waiting, marching to s1, and arrived in s1: counted once each time.
    expect(fitBySector(state, ctx)).toEqual({ s1: 240 });
    expect(fitBySector(reserveMarching()(state), ctx)).toEqual({ s1: 440 });
    expect(fitBySector(reserveArrived(state), ctx)).toEqual({ s1: 440 });
  });

  it('a reserve on its way counts in the sector of the segment it is sent to; the assignment defaults to its entry point', () => {
    // (d) gres sent to ger-front-b in s2: it counts there, not in s1.
    const f = scored({ reserve: true, sector2: true });
    const { state, ctx } = initRun(...f, { seed: 1 });
    expect(fitBySector(reserveMarching('ger-front-b')(state), ctx)).toEqual({ s1: 240, s2: 250 });
    // (e) the baseline: gres assigned to s1 by its entry point (3000, 200), the default listed; or to s2 by reserveSectors.
    expect(state.deadlock!.zeroFit).toEqual({ s1: 440, s2: 50 });
    expect(ctx.defaultsUsed).toContain("deadlock.reserveSectors ← each reserve by its entry point's y: gres → s1");
    const g = initRun(...scored({ reserve: true, sector2: true, reserveSectors: [{ formationId: 'gres', sectorId: 's2' }] }), { seed: 1 });
    expect(g.state.deadlock!.zeroFit).toEqual({ s1: 240, s2: 250 });
    expect([...g.ctx.defaultsUsed].some((d) => d.startsWith('deadlock.reserveSectors'))).toBe(false);
  });

  it('records stronghold when the attacker holds every stronghold feature', () => {
    expect(runStronghold().summary.deadlock).toMatchObject({ broken: true, by: 'stronghold' });
    expect(runStronghold().summary.deadlock!.margins.stronghold).toMatchObject({ held: 1, of: 1 });
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
      'deadlock.collapseFrac ← 0.1 (the owner\'s: fewer than 10% of the defending troops in the sector fit to fight)',
      'deadlock.conditions ← all four: breakthrough, surrender, collapse, stronghold',
      'deadlock.sealDistanceM ← 1000 (an estimate)',
      'deadlock.strongholds ← end.keyGround: knoll',
      'deadlock.surrenderFrac ← 0.5 (an estimate)',
    ]);
    // Everything given: no default.
    const [t, n] = scored({ conditions: ['surrender'], surrenderFrac: 0.6 });
    t.deadlock!.collapseFrac = est(0.2);
    t.deadlock!.sealDistanceM = est(500);
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
    expect(vOn.summary.deadlock!.broken).toBe(true);
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
