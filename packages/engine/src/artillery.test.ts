import { describe, expect, it } from 'vitest';
import { est } from '@wwi/scenario/test-fixtures';
import type { Scenario } from '@wwi/scenario';
import { artilleryFire, observationFactor } from './artillery';
import type { Pending } from './types';
import { initRun, runScenario } from './run';
import type { Models } from './run';
import type { RunRecord } from './record';
import { SCHEDULES } from './schedule';
import {
  companyIds, eventsOf, fixtureArtillery, hash, ofKind, rowsOf, totalsOverTime, vimy, vimyDoctrines, withAlliedFront, withQuietStep,
  withRearTrench, withReserve,
} from './test-helpers';

type F = [Scenario, Models];
const run = (f: F, seed = 1, endMinute?: number): RunRecord =>
  runScenario(f[0], f[1], { seed, ...(endMinute !== undefined ? { endMinute, stopEarly: false } : {}) });

/** Attackers following 20 m behind a barrage whose band is 90 m deep: inside it. */
const runTooClose = () => run(fixtureArtillery({ followDistanceM: 20 }));

/** The German field battery `gb` (10 guns, defensive) at [900, 200], and the counter-battery state at Zero. */
function withGermanGuns(f: F, suppressedAtZeroFrac?: number): F {
  f[0].artillery.push({ id: 'gb', side: 'central', weapon: '18pdr', count: est(10), role: 'defensive', observation: 'map', position: [900, 200], horseDrawn: true });
  if (suppressedAtZeroFrac !== undefined) f[0].counterBattery = { side: 'allied', suppressedAtZeroFrac: est(suppressedAtZeroFrac), note: 'test' };
  return f;
}

/** A reserve holding in no man's land (between the allied front at x −100 and gfront at x 150) under German guns, for five hours. */
const runDefensive = (o: { suppressedAtZeroFrac: number }, seed = 1) =>
  run(withGermanGuns(withReserve(withAlliedFront(fixtureArtillery()), 50), o.suppressedAtZeroFrac), seed, 300);

/** Rounds of German defensive fire in each hour after Zero. */
function defensiveFireByHour(r: RunRecord): number[] {
  const out = [0, 0, 0, 0, 0];
  for (const e of ofKind(r, 'shelled')) if (e.causes.includes('defensive-barrage')) out[Math.floor((e.minute - 1) / 60)]! += e.factors!.fired!;
  return out;
}

/**
 * A German rear trench at x 1000 (garrison k3, in its dugouts) under a standing barrage of 200 guns observed by
 * aircraft, with air observation `observedFrac`: the garrison's losses, summed over five seeds.
 */
function lossesUnder(o: { observedFrac: number }): number {
  let lost = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const f = withRearTrench(fixtureArtillery(), 1000);
    f[0].artillery.push({ id: 'st', side: 'allied', weapon: '18pdr', count: est(200), role: 'standing', observation: 'aircraft', position: [-800, 200] });
    f[0].air = { superiority: 'allied', observedFrac: est(o.observedFrac) };
    const k3 = rowsOf(run(f, seed), 'k3').at(-1)!;
    lost += (k3.killed as number) + (k3.wounded as number);
  }
  return lost;
}

describe('artillery in the battle', () => {
  it('a company inside its own barrage band takes casualties tagged friendly-barrage', () => {
    expect(eventsOf(runTooClose()).some((e) => e.causes.includes('friendly-barrage'))).toBe(true);
    const own = ofKind(runTooClose(), 'shelled').filter((e) => e.causes.includes('friendly-barrage'));
    expect(own.every((e) => e.unitId === 'c1' || e.unitId === 'c2')).toBe(true);
    expect(own.reduce((a, e) => a + e.factors!.hit!, 0)).toBeGreaterThan(0);
    // At 70 m behind, outside the band's 45 m, nobody is hit by his own barrage.
    expect(eventsOf(run(fixtureArtillery())).some((e) => e.causes.includes('friendly-barrage'))).toBe(false);
  });

  it('German defensive fire rises as batteries recover, and never drops to zero while any battery is unsuppressed', () => {
    const f = defensiveFireByHour(runDefensive({ suppressedAtZeroFrac: 0.83 }));
    expect(f[0]).toBeGreaterThan(0); expect(f[3]).toBeGreaterThan(f[0]!);
    for (const h of f) expect(h).toBeGreaterThan(0);
  });

  it('emits batteries-recovered once half the German guns are back', () => {
    const r = runDefensive({ suppressedAtZeroFrac: 0.83 });
    const rec = ofKind(r, 'batteries-recovered');
    expect(rec).toHaveLength(1);
    expect(rec[0]!.causes).toEqual(['batteries-recovered']);
    expect(rec[0]!.factors!.inActionFrac).toBeGreaterThanOrEqual(0.5);
    // Defensive fire after it says so.
    const later = ofKind(r, 'shelled').filter((e) => e.causes.includes('defensive-barrage') && e.minute > rec[0]!.minute);
    expect(later.every((e) => e.causes.includes('batteries-recovered'))).toBe(true);
  });

  it('without air observation, artillery fire on unseen targets is less effective', () => {
    expect(lossesUnder({ observedFrac: 0.0 })).toBeLessThan(lossesUnder({ observedFrac: 0.75 }));
  });

  it('observation: map fire is unaffected; observed fire falls toward unobservedFireFactor in the dark', () => {
    const { ctx } = initRun(...fixtureArtillery(), { seed: 1 });
    expect(observationFactor('map', ctx, 50, 0)).toBe(1);
    expect(observationFactor('forward-observer', ctx, 3000, 0)).toBe(1);
    expect(observationFactor('aircraft', ctx, 3000, 0.75)).toBeCloseTo(0.3 + 0.7 * 0.75, 9);
    expect(observationFactor('aircraft', ctx, 50, 0.75)).toBeCloseTo(0.3 + 0.7 * 0.75 * (50 / 1500), 9);
  });

  it('defenders in dugouts under the creeping band lose nobody to it, and a garrison up in the open ahead of it does', () => {
    // A rear garrison outside every standing barrage (there is none) is up by minute 3; the band reaches it later.
    const r = run(withRearTrench(fixtureArtillery({ lagMin: 12 }), 600));
    const creeping = ofKind(r, 'shelled').filter((e) => e.text.startsWith('Creeping barrage'));
    expect(creeping.length).toBeGreaterThan(0);
    expect(creeping.reduce((a, e) => a + e.factors!.hit!, 0)).toBeGreaterThan(0);
    // The front garrisons were under the band only while down in their dugouts: it took none of them.
    for (const id of ['k1', 'k2']) expect(rowsOf(r, id).at(-1)!.killed).toBe(0);
    expect(creeping.every((e) => e.unitId === undefined || e.unitId === 'k3')).toBe(true);
    const k3 = rowsOf(r, 'k3').at(-1)!;
    expect((k3.killed as number) + (k3.wounded as number)).toBeGreaterThan(0);
  });

  it('a standing barrage keeps a rear garrison down until the creeping barrage has passed over it', () => {
    const bare = run(withRearTrench(fixtureArtillery({ lagMin: 60 }), 600));
    const f = withRearTrench(fixtureArtillery({ lagMin: 60 }), 600);
    f[0].artillery.push({ id: 'st', side: 'allied', weapon: '18pdr', count: est(20), role: 'standing', observation: 'map', position: [-800, 200] });
    const held = run(f);
    const up = (r: RunRecord) => ofKind(r, 'garrison-emerged').find((e) => e.segmentId === 'ger-rear-k3:001')!;
    expect(up(bare).minute).toBeLessThanOrEqual(4);
    const passed = ofKind(held, 'barrage-passed').find((e) => e.segmentId === 'ger-rear-k3:001')!;
    expect(passed.minute).toBeGreaterThan(10);
    expect(up(held).minute).toBeGreaterThanOrEqual(passed.minute);
    expect(ofKind(held, 'shelled').some((e) => e.text.startsWith('Standing barrage'))).toBe(true);
  });

  it('the machine-gun barrage ahead of the band suppresses a garrison in the open but hits nobody', () => {
    const f = withRearTrench(fixtureArtillery({ lagMin: 60 }), 900);
    f[0].artillery.push({ id: 'mgb', side: 'allied', weapon: '18pdr', count: est(40), role: 'mg-barrage', observation: 'map' });
    const r = run(f);
    const mg = ofKind(r, 'shelled').filter((e) => e.causes.includes('mg-fire'));
    expect(mg.length).toBeGreaterThan(0);
    expect(mg.every((e) => e.factors!.hit === 0)).toBe(true);
    expect(rowsOf(r, 'k3').some((x) => (x.suppression as number) > 0)).toBe(true);
  });

  it('a battery that runs out of ammunition stops, with cause ammunition-low, and its barrage no longer keeps garrisons down', () => {
    const f = fixtureArtillery({ lagMin: 30 });
    f[0].artillery[0]!.ammunition = est(500);
    const r = run(f);
    const out = ofKind(r, 'ammunition-exhausted');
    expect(out.map((e) => e.causes)).toEqual([['ammunition-low']]);
    // 18 guns × 4 rounds a minute: 500 rounds last 6.9 minutes, the barrage stops in the step ending at minute 8.
    expect(out[0]!.minute).toBe(8);
    expect(ofKind(r, 'barrage-passed').every((e) => e.minute <= 8)).toBe(true);
  });

  it('off-map fire falls only inside its window, on the units in its target', () => {
    const f = withReserve(fixtureArtillery(), -300);
    f[0].zeroHour = { value: '1916-07-01T07:30', estimate: 'test' };
    f[0].offMap = {
      attacks: [],
      fire: [{ id: 'flank', side: 'central', weapon: '18pdr', guns: est(10), window: { from: '1916-07-01T08:15', to: '1916-07-01T08:30' }, target: { xMin: -400, xMax: -200, yMin: 100, yMax: 300 }, cite: { value: 'test', estimate: 'test' } }],
    };
    const r = run(f);
    const off = ofKind(r, 'shelled').filter((e) => e.causes.includes('off-map-fire'));
    expect(off.length).toBeGreaterThan(0);
    expect(off.every((e) => e.minute > 45 && e.minute <= 62 && e.unitId === 'res')).toBe(true);
    expect(off[0]!.minute).toBe(46);
  });

  it('battery recoveries and off-map windows in a quiet stretch happen at the same minute however long the quiet step', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const f = withGermanGuns(withReserve(fixtureArtillery({ effects: { batteryRecoveryHalfLifeMin: 50 } }), -300), 1);
      f[0].offMap = {
        attacks: [],
        fire: [{ id: 'flank', side: 'central', weapon: '18pdr', guns: est(10), window: { from: '1916-07-01T08:15', to: '1916-07-01T08:30' }, target: { xMin: -400, xMax: -200, yMin: 100, yMax: 300 }, cite: { value: 'test', estimate: 'test' } }],
      };
      const timeline = (q: number) => {
        const r = runScenario(f[0], withQuietStep(f[1], q), { seed });
        return [ofKind(r, 'batteries-recovered').map((e) => e.minute), ofKind(r, 'shelled').filter((e) => e.causes.includes('off-map-fire')).map((e) => e.minute)[0]];
      };
      expect(timeline(10)).toEqual(timeline(2));
      expect(timeline(10)[1]).toBe(46);
    }
  });

  it('registers its scheduled minutes, none of which starts movement', () => {
    expect(SCHEDULES.map(([n]) => n)).toEqual(expect.arrayContaining(['battery-recovery', 'garrison-emergence', 'off-map-fire']));
    const { state, ctx } = initRun(...withGermanGuns(fixtureArtillery(), 1), { seed: 1 });
    for (const [name, source] of SCHEDULES)
      if (['battery-recovery', 'garrison-emergence', 'off-map-fire'].includes(name)) for (const s of source(state, ctx)) expect(s.startsMovement).toBe(false);
    expect(SCHEDULES.find(([n]) => n === 'battery-recovery')![1](state, ctx).length).toBe(10);
  });

  it('records that aircraft-observed fire is unobserved when the scenario has no air section', () => {
    const f = fixtureArtillery();
    f[0].artillery[0]!.observation = 'aircraft';
    expect(run(f).defaultsUsed).toContain('air ← none (fire observed by aircraft is unobserved: observedFrac 0)');
    const g = fixtureArtillery();
    delete g[0].artillery[0]!.observation;
    expect(run(g).defaultsUsed).toContain('artillery[g1].observation ← map (not given)');
  });

  it('keeps conservation and determinism under fire', () => {
    const f = () => withGermanGuns(withReserve(withAlliedFront(fixtureArtillery({ followDistanceM: 20 })), 50), 0.5);
    const a = run(f(), 3, 200);
    expect(hash(run(f(), 3, 200))).toBe(hash(a));
    expect(a.summary.casualties.battle.allied.total).toBeGreaterThan(0);
    for (const id of companyIds(a)) expect(new Set(totalsOverTime(a, id))).toHaveLength(1);
    for (const id of companyIds(a)) for (const row of rowsOf(a, id)) for (const k of ['men', 'killed', 'wounded', 'captured', 'suppression'] as const) expect(row[k]).toBeGreaterThanOrEqual(0);
  });

  it('runs the full Vimy scenario with every fire source and ends as before', () => {
    const r = runScenario(vimy(), vimyDoctrines(), { seed: 1 });
    expect(r.endMinute).toBeLessThan(1000);
    expect(ofKind(r, 'shelled').some((e) => e.causes.includes('defensive-barrage'))).toBe(true);
    for (const id of companyIds(r)) expect(new Set(totalsOverTime(r, id))).toHaveLength(1);
  });
  it('defensive fire falls on a segment its side has lost, on the enemies in it', () => {
    // No allied trench line, so no no man's land: only the lost segment can draw the fire.
    const { state, ctx } = initRun(...withGermanGuns(fixtureArtillery()), { seed: 1 });
    const lostSeg = state.segments[0]!; // ger-front-a:001, x 150, y 0 to 200
    const s = {
      ...state,
      minute: 2,
      segments: state.segments.map((x) => (x.id === lostSeg.id ? { ...x, holder: 'allied' as const } : x)),
      companies: state.companies.map((c) => (c.id === 'c1' ? { ...c, x: 160, y: 100, status: 'consolidating' as const } : c.id === 'c2' ? { ...c, x: -500 } : c)),
    };
    const pending: Pending = { damage: [] };
    artilleryFire(s, ctx, 2, pending);
    const def = pending.damage.filter((p) => p.causes.includes('defensive-barrage'));
    expect(def.map((p) => p.targetId)).toEqual(['c1']);
    expect(def[0]!.hits).toBeGreaterThan(0);
    // Its frontage is the lost segment's 200 m: 10 guns × 100 / 200 on each 100 m.
    expect(def[0]!.fire!.factors.guns).toBe(10);
    // With the segment held again, nobody is shelled.
    const none: Pending = { damage: [] };
    artilleryFire({ ...s, segments: state.segments }, ctx, 2, none);
    expect(none.damage.filter((p) => p.causes.includes('defensive-barrage'))).toEqual([]);
  });

  it('defensive fire after batteries-recovered refers to that event, and fire on a company that lost its barrage to its barrage-lost', () => {
    const r = runDefensive({ suppressedAtZeroFrac: 0.83 });
    const rec = ofKind(r, 'batteries-recovered')[0]!;
    const after = ofKind(r, 'shelled').filter((e) => e.causes.includes('batteries-recovered'));
    expect(after.length).toBeGreaterThan(0);
    for (const e of after) expect(e.refs).toContain(rec.id);
    const f = withGermanGuns(withAlliedFront(fixtureArtillery({ startX: -90, speedMPerMin: 20 }), -100));
    const slow = run(f);
    const lostFire = ofKind(slow, 'shelled').filter((e) => e.causes.includes('barrage-moved-on'));
    expect(lostFire.length).toBeGreaterThan(0);
    for (const e of lostFire) expect(e.refs.some((x) => slow.events[x]!.kind === 'barrage-lost')).toBe(true);
  });

  it('records that barrage guns are shared across sectors by width, and that fire-plan fire has no range term', () => {
    const d = run(withGermanGuns(fixtureArtillery())).defaultsUsed;
    expect(d).toContain('artillery[g1] ← shared across sectors by width (no sector given)');
    expect(d).toContain("fire-plan fire ← no range term (an artillery entry's position stands for many batteries along the front)");
    expect(d.filter((x) => x.startsWith('artillery[gb] ← shared'))).toEqual([]);
  });
});
