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
import { fixtureFire, fixtureWithDoctrineV3, vimy, vimyDoctrines } from './test-helpers';

/*
 * Deadlock scoring (Plan 4 Task 3). The fixtures are the v3 fixture (two assault companies, 300 men, against two garrison
 * companies, 240 men, on the German front at x 150, the Black Line at x 1150): its garrisons are trapped and all taken
 * prisoner by minute 4, and the attackers go on to the Black Line, past a German gun line drawn at x 600, and on to a
 * knoll there (the stronghold). With an off-map German reserve `gres` (two companies of 100 men at x 3000, inside the
 * sector) where a test needs one.
 */

const cite = est('test');

type Opts = { conditions?: By[]; surrenderFrac?: number; reserve?: boolean; section?: boolean };

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
    };
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

/** gres on the map at Zero, holding where it stands (x 3000, in the sector): a German reserve that has arrived. */
const reserveArrived = (s: SimState): SimState => ({
  ...s,
  reserves: s.reserves.map((r) => ({ ...r, status: 'arrived' as const })),
  companies: s.companies.map((c) => (c.id.startsWith('gres-') ? { ...c, status: 'holding' as const, intent: 'hold' as const } : c)),
});

/** Breakthrough and stronghold only: the attackers pass the gun line (x 600) on their way to the knoll. */
const runBreak = (o: { reserveArrivesFirst: boolean }) =>
  runFrom(scored({ conditions: ['breakthrough', 'stronghold'], reserve: true }), o.reserveArrivesFirst ? reserveArrived : undefined);
/** The garrisons all taken prisoner at minute 4. */
const runSurrender = () => runScenario(...scored(), { seed: 1 });
/** The same, collapse checked first: no German left fit in s1 (the off-map reserve gres, never sent, counts for nothing). */
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

  it('records surrender when captured defenders reach surrenderFrac of their men at Zero', () => {
    expect(runSurrender().summary.deadlock).toMatchObject({ broken: true, by: 'surrender' });
    expect(runSurrender().summary.deadlock).toMatchObject({ minute: 4, margins: { surrender: { capturedFrac: 1 } } });
    expect(runSurrender().summary.deadlock!.sectorId).toBeUndefined();
  });

  it('records collapse per sector when fewer than collapseFrac of the on-map defenders in a sector remain fit, naming the sector', () => {
    expect(runCollapse().summary.deadlock).toMatchObject({ broken: true, by: 'collapse', sectorId: 's1' });
    expect(runCollapse().summary.deadlock!.margins.collapse).toEqual({ minFitFrac: 0, sectorId: 's1' });
  });

  it('off-map reserves do not count toward collapse until they are on the map', () => {
    const { state, ctx } = initRun(...scored({ reserve: true }), { seed: 1 });
    // At Zero: k1 and k2 (240 men), not gres (200 men, off the map).
    expect(state.deadlock!.zeroFit).toEqual({ s1: 240 });
    expect(fitBySector(state, ctx, 'central')).toEqual({ s1: 240 });
    // On the map, gres counts.
    expect(fitBySector(reserveArrived(state), ctx, 'central')).toEqual({ s1: 440 });
    // So the sector collapses with gres off the map, and not with gres there from Zero (200 of 240 is above 10%).
    expect(runFrom(scored({ conditions: ['collapse'], reserve: true })).summary.deadlock).toMatchObject({ broken: true, by: 'collapse' });
    expect(runFrom(scored({ conditions: ['collapse'], reserve: true }), reserveArrived).summary.deadlock).toMatchObject({ broken: false });
  });

  it('records stronghold when the attacker holds every stronghold feature', () => {
    expect(runStronghold().summary.deadlock).toMatchObject({ broken: true, by: 'stronghold' });
    expect(runStronghold().summary.deadlock!.margins.stronghold).toEqual({ held: 1, of: 1 });
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
      'deadlock.strongholds ← end.keyGround: knoll',
      'deadlock.surrenderFrac ← 0.5 (an estimate)',
    ]);
    // Everything given: no default.
    const [t, n] = scored({ conditions: ['surrender'], surrenderFrac: 0.6 });
    t.deadlock!.collapseFrac = est(0.2);
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
    const { last } = runBreak({ reserveArrivesFirst: false });
    const { ctx } = initRun(...scored({ conditions: ['breakthrough', 'stronghold'], reserve: true }), { seed: 1 });
    const d = deadlockSummary(last)!;
    expect(scoreDeadlock(last, ctx)).toEqual({ broken: true, by: d.by, minute: d.minute, sectorId: d.sectorId });
  });

  it('is an observer: with every condition off the events (but deadlock-broken, ids moved back) and snapshots are byte-identical', () => {
    const on = runScenario(...scored(), { seed: 1 });
    const off = runScenario(...scored({ conditions: [] }), { seed: 1 });
    expect(on.events.some((e) => e.kind === 'deadlock-broken')).toBe(true);
    expect(JSON.stringify(withoutDeadlock(on.events))).toBe(JSON.stringify(off.events));
    expect(JSON.stringify(on.snapshots)).toBe(JSON.stringify(off.snapshots));
    // Vimy seed 1.
    const s = vimy();
    s.deadlock = { ...s.deadlock!, conditions: [] };
    const vOff = runScenario(s, vimyDoctrines(), { seed: 1 });
    const vOn = vimySeed1();
    expect(vOn.summary.deadlock!.broken).toBe(true);
    expect(vOff.summary.deadlock!.broken).toBe(false);
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
  });
});
