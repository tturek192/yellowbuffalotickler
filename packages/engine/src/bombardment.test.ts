import { describe, expect, it } from 'vitest';
import { est } from '@wwi/scenario/test-fixtures';
import { runBombardment } from './bombardment';
import { initRun, runScenario } from './run';
import type { SimState } from './step';
import { companyIds, doctrines, draft, fixtureBomb, fixtureBombarded, fixtureWithDoctrineV3, runBombardmentOn, totalsOverTime, wireCutOf, snapshotsOf } from './test-helpers';

/** Men a fixture's garrisons lose to the same shelling (trench rounds only) with dugouts `depth` m deep. */
const lossesAt = (depth: number): number =>
  runBombardmentOn(fixtureBomb({ trenchRounds: 400, depth })).companies.reduce((a, c) => a + c.bombardment.killed + c.bombardment.wounded, 0);

const results = (state: SimState) => state.events.filter((e) => e.kind === 'bombardment-result');

describe('the compressed bombardment', () => {
  it('more wire rounds cut more wire; a spared segment gets none', () => {
    const lo = wireCutOf(runBombardmentOn(fixtureBomb({ wireRounds: 1000 }))), hi = wireCutOf(runBombardmentOn(fixtureBomb({ wireRounds: 10000 })));
    expect(hi).toBeGreaterThan(lo); expect(wireCutOf(runBombardmentOn(fixtureBomb({ wireRounds: 10000, spared: true })))).toBe(0);
  });

  it('deeper dugouts lose fewer men to the same shelling', () => {
    expect(lossesAt(15)).toBeLessThan(lossesAt(3));
  });

  it('bombardment losses respect conservation and appear in the summary as their own period', () => {
    const r = runScenario(...fixtureBombarded(), { seed: 1 });
    expect(r.summary.casualties.bombardment.central.total).toBeGreaterThan(0);
    for (const id of companyIds(r)) expect(new Set(totalsOverTime(r, id))).toHaveLength(1);
    expect(totalsOverTime(r, 'k1')[0]).toBe(120);
    const k = snapshotsOf(r)[0]!.companies.rows.find((x) => x[0] === 'k1')!;
    expect(k[3]).toBeLessThan(120);
    // Bombardment losses are not counted again in the battle (its only German losses are the garrisons the attackers
    // trapped in their dugouts, captured); they roll up by formation.
    const battle = r.summary.casualties.battle.central;
    expect([battle.killed, battle.wounded]).toEqual([0, 0]);
    expect(battle.captured).toBe(r.summary.prisoners.allied);
    expect(r.summary.casualties.bombardment.central.formations['rir262']!.total).toBe(r.summary.casualties.bombardment.central.total);
    expect(r.summary.casualties.bombardment.allied.total).toBe(0);
  });

  it('a scenario with no bombardment runs and records the default', () => {
    expect(runScenario(draft(), doctrines(), { seed: 1 }).defaultsUsed).toContain('bombardment ← none (no preliminary bombardment)');
  });

  it('heavy rounds break dugouts; field-gun rounds do not', () => {
    const field = runBombardmentOn(fixtureBomb({ trenchRounds: 400 })).segments;
    const heavy = runBombardmentOn(fixtureBomb({ heavyRounds: 400 })).segments;
    expect(field.every((x) => x.dugoutDamage === 0 && x.trenchDamage > 0)).toBe(true);
    expect(heavy.every((x) => x.dugoutDamage > 0 && x.trenchDamage > 0)).toBe(true);
  });

  it('a stretch spared only from heavy guns still has its wire cut by the field guns', () => {
    const f = runBombardmentOn(fixtureBomb({ wireRounds: 1000, heavyRounds: 400, spared: [{ yMin: 0, yMax: 400, onlyKinds: ['heavy'] }] }));
    expect(wireCutOf(f)).toBeGreaterThan(0);
    expect(f.segments.every((x) => x.dugoutDamage === 0 && x.trenchDamage === 0 && x.spared)).toBe(true);
    const all = runBombardmentOn(fixtureBomb({ wireRounds: 1000, heavyRounds: 400, spared: true }));
    expect(wireCutOf(all)).toBe(0);
  });

  it('a spared band over part of a segment maps onto it by the share of its y extent it covers', () => {
    const s = runBombardmentOn(fixtureBomb({ trenchRounds: 60, wireRounds: 3000, spared: [{ yMin: 0, yMax: 100 }] })).segments;
    // 60 rounds over 100 + 200 m of unspared frontage: 20 on the unspared half of the first segment, 40 on the
    // other; the spared half is untouched, so the first segment's damage is half its unspared half's.
    expect(s[0]!.trenchDamage).toBeCloseTo(0.5 * (1 - Math.exp((-20 * 5) / 100)), 9);
    expect(s[1]!.trenchDamage).toBeCloseTo(1 - Math.exp((-40 * 5) / 200), 9);
    expect([s[0]!.spared, s[1]!.spared]).toEqual([true, false]);
    // Its wire is cut only where it was shelled: however many rounds, half of it stands.
    expect(s[0]!.wireCut).toBeLessThanOrEqual(0.5);
    expect(s[0]!.wireCut).toBeCloseTo(0.5, 3);
    expect(s[1]!.wireCut).toBeCloseTo(1, 3);
  });

  it('a band spared from heavy guns only, over part of a segment, keeps its dugouts whole and lets the field guns cut its wire', () => {
    const s = runBombardmentOn(fixtureBomb({ wireRounds: 3000, heavyRounds: 400, depth: 6, spared: [{ yMin: 0, yMax: 100, onlyKinds: ['heavy'] }] })).segments;
    expect(s[0]!.wireCut).toBeCloseTo(1, 2);
    // 400 heavy rounds over 300 m: 133.3 on the unspared 100 m of the first segment.
    expect(s[0]!.dugoutDamage).toBeCloseTo(0.5 * (1 - Math.exp((-(400 / 3) * 10) / (100 * 6))), 9);
    expect(s[1]!.dugoutDamage).toBeCloseTo(1 - Math.exp((-(800 / 3) * 10) / (200 * 6)), 9);
    expect(s[0]!.spared).toBe(true);
  });

  it('follows the model formulas for wire, trench and dugout damage', () => {
    const [seg] = runBombardmentOn(fixtureBomb({ wireRounds: 200, trenchRounds: 100, heavyRounds: 40, depth: 6 })).segments;
    // Each 200 m segment gets half of every allocation; wire belt 20 m.
    expect(seg!.wireBeltDepthM).toBe(20);
    expect(seg!.wireCut).toBeCloseTo(1 - Math.exp((-100 * 20) / (20 * 200)), 9);
    expect(seg!.trenchDamage).toBeCloseTo(1 - Math.exp((-(50 + 20) * 5) / 200), 9);
    expect(seg!.dugoutDamage).toBeCloseTo(1 - Math.exp((-20 * 10) / (200 * 6)), 9);
  });

  it('emits one bombardment-result per segment, with its factors and causes', () => {
    const state = runBombardmentOn(fixtureBomb({ wireRounds: 50, trenchRounds: 400, spared: [{ yMin: 0, yMax: 100 }] }));
    const ev = results(state);
    expect(ev.map((e) => e.segmentId)).toEqual(state.segments.map((x) => x.id));
    expect(Object.keys(ev[0]!.factors!).sort()).toEqual(['dugoutDamage', 'losses', 'sparedFrac', 'trenchDamage', 'wireCut']);
    expect(Object.keys(ev[1]!.factors!).sort()).toEqual(['dugoutDamage', 'losses', 'trenchDamage', 'wireCut']);
    expect(ev[0]!.causes).toEqual(['spared-by-bombardment', 'wire-uncut']);
    expect(ev[1]!.causes).toEqual(['wire-uncut']);
    expect(ev.every((e) => e.minute === 0)).toBe(true);
    const cut = results(runBombardmentOn(fixtureBomb({ wireRounds: 10000 })));
    expect(cut.every((e) => !e.causes.includes('wire-uncut'))).toBe(true);
  });

  it('runBombardment returns its events and the losses it caused', () => {
    const [s, m] = fixtureBombarded();
    const { state, ctx } = initRun(...fixtureWithDoctrineV3(), { seed: 3 });
    const r = runBombardment(state, { ...ctx, scenario: { ...ctx.scenario, artillery: s.artillery, bombardment: s.bombardment! }, tables: m.tables });
    // One result per segment (a company that lost its last officers also has an officers-lost, as the draws fall).
    expect(r.events.filter((e) => e.kind === 'bombardment-result').map((e) => e.segmentId)).toEqual(['ger-front-a:001', 'ger-front-a:002']);
    const lost = r.state.companies.reduce((a, c) => a + c.bombardment.killed + c.bombardment.wounded, 0);
    expect(r.losses.total).toBe(lost);
    expect(r.losses.killed + r.losses.wounded).toBe(lost);
    expect(r.losses.total).toBeGreaterThan(0);
  });

  it('every round fired churns the ground where it lands', () => {
    const state = runBombardmentOn(fixtureBomb({ wireRounds: 300, trenchRounds: 200, harassRounds: 50, heavyRounds: 70, batteryRounds: 80 }));
    expect(state.churn.reduce((a, x) => a + x, 0)).toBeCloseTo(700, 2);
  });

  it('a garrison on a point strongpoint loses men to a bombardment that covers its y-range', () => {
    const [s, m] = fixtureBomb({ trenchRounds: 600, heavyRounds: 300 });
    // y 200 ± 100 (strongpointRadiusM): 200 m of frontage beside the trench's 400 m.
    s.features.push({ id: 'sp', kind: 'strongpoint', side: 'central', geometry: { type: 'Point', coordinates: [300, 200] }, cite: { value: 'x', estimate: 'test' } });
    s.forces[1]!.formations[0]!.companies!.push({ id: 'k3', name: '3. Kompanie', role: 'garrison', strength: est(120), start: [300, 200], trenchFeatureId: 'sp' });
    const r = runScenario(s, m, { seed: 1 });
    expect(r.geometry.segments.find((x) => x.id === 'sp:001')).toMatchObject({ yMin: 100, yMax: 300, lengthM: 200 });
    const ev = r.events.find((e) => e.kind === 'bombardment-result' && e.segmentId === 'sp:001')!;
    // A third of each allocation (200 of 600 m of frontage): 300 trench rounds, 100 of them heavy.
    expect(ev.factors!.trenchDamage).toBeCloseTo(1 - Math.exp((-300 * 5) / 200), 3);
    expect(ev.factors!.dugoutDamage).toBeGreaterThan(0);
    expect(ev.factors!.losses).toBeGreaterThan(0);
    const k3 = snapshotsOf(r)[0]!.companies.rows.find((x) => x[0] === 'k3')!;
    expect(k3[3]).toBe(120 - ev.factors!.losses!);
    expect(r.summary.casualties.bombardment.central.formations['rir262']!.total).toBe(r.summary.casualties.bombardment.central.total);
    expect(r.defaultsUsed).toContain('features[sp].radiusM ← effects.strongpointRadiusM');
    expect(r.defaultsUsed.some((x) => x.includes('no frontage'))).toBe(false);
  });

  it('a spared band straddling two segments maps onto each by the share of its y extent it covers', () => {
    const state = runBombardmentOn(fixtureBomb({ trenchRounds: 60, spared: [{ yMin: 150, yMax: 250 }] }));
    expect(state.segments.map((x) => x.spared)).toEqual([true, true]);
    expect(results(state).map((e) => e.factors!.sparedFrac)).toEqual([0.25, 0.25]);
    // 60 rounds over the 300 m left unspared: 30 on each segment's 150 m, so the two are damaged alike.
    for (const x of state.segments) expect(x.trenchDamage).toBeCloseTo(0.75 * (1 - Math.exp((-30 * 5) / 150)), 9);
  });

  it('a wire belt or spared band on a garrisoned trench but beyond its segments is recorded, not dropped silently', () => {
    const [s, m] = fixtureBomb({ wireRounds: 1000, spared: [{ yMin: 500, yMax: 600 }] });
    s.bombardment!.wire.push({ featureId: 'ger-front-a', yMin: 400, yMax: 450, beltDepthM: { value: 10, estimate: 'test' } });
    const r = runScenario(s, m, { seed: 1 });
    expect(r.defaultsUsed).toContain('bombardment.spared[ger-front-a y 500 to 600] ← not applied (no garrison segment over it)');
    expect(r.defaultsUsed).toContain('bombardment.wire[ger-front-a y 400 to 450] ← not applied (no garrison segment over it)');
    expect(r.defaultsUsed.filter((x) => x.includes('y 0 to 400'))).toEqual([]);
  });

  it('a wire belt or spared stretch on a trench with no garrison is recorded once and affects nothing', () => {
    const [s, m] = fixtureBomb({ wireRounds: 1000 });
    s.features.push({ id: 'ger-support', kind: 'trench', side: 'central', geometry: { type: 'LineString', coordinates: [[400, 0], [400, 400]] }, cite: { value: 'x', estimate: 'test' } });
    s.bombardment!.wire.push({ featureId: 'ger-support', yMin: 0, yMax: 200, beltDepthM: { value: 10, estimate: 'test' } }, { featureId: 'ger-support', yMin: 200, yMax: 400, beltDepthM: { value: 10, estimate: 'test' } });
    const r = runScenario(s, m, { seed: 1 });
    expect(r.defaultsUsed.filter((x) => x.includes('ger-support'))).toEqual(['bombardment.wire[ger-support] ← not applied (no garrison segment on the feature)']);
    expect(r.geometry.segments.map((x) => x.featureId)).toEqual(['ger-front-a', 'ger-front-a']);
  });
});

describe('batteries at Zero', () => {
  it('every artillery entry becomes batteries with its guns, position, ammunition and horses', () => {
    const { state } = initRun(...fixtureBomb(), { seed: 1 });
    const g1 = state.batteries.find((b) => b.id === 'g1')!;
    expect(g1).toEqual({ id: 'g1', side: 'allied', weapon: '18pdr', role: 'creeping', observation: 'map', guns: 18, suppressedUntilMin: null, ammoLeft: 5000, position: [-800, 200], horses: false, captured: false });
    expect(state.batteries.map((b) => b.id)).toEqual([...state.batteries.map((b) => b.id)].sort());
  });

  it('suppresses the German share given by counterBattery at Zero, each gun recovering at its own minute', () => {
    const { state } = initRun(...fixtureBomb({ suppressedAtZeroFrac: 0.5 }), { seed: 1 });
    const gb = state.batteries.filter((b) => b.id === 'gb' || b.id.startsWith('gb/'));
    expect(gb.reduce((a, b) => a + b.guns, 0)).toBe(10);
    const down = gb.filter((b) => b.suppressedUntilMin !== null);
    expect(down.reduce((a, b) => a + b.guns, 0)).toBe(5);
    expect(down.every((b) => b.suppressedUntilMin! >= 0)).toBe(true);
    expect(new Set(down.map((b) => b.suppressedUntilMin)).size).toBe(5);
    expect(state.batteries.filter((b) => b.side === 'allied').every((b) => b.suppressedUntilMin === null)).toBe(true);
  });

  it('without a counterBattery section no German battery is suppressed, and the default is recorded', () => {
    const r = runScenario(...fixtureBomb(), { seed: 1 });
    expect(r.defaultsUsed).toContain('counterBattery ← none (no German battery suppressed at Zero)');
    const { state } = initRun(...fixtureBomb(), { seed: 1 });
    expect(state.batteries.every((b) => b.suppressedUntilMin === null)).toBe(true);
  });

  it('records the defaults for missing ammunition and horses', () => {
    const r = runScenario(...fixtureBomb(), { seed: 1 });
    expect(r.defaultsUsed).toContain('artillery[gb].ammunition ← unlimited (none given)');
    const [s, m] = fixtureBomb();
    delete s.artillery[0]!.horseDrawn;
    expect(runScenario(s, m, { seed: 1 }).defaultsUsed).toContain('artillery[g1].horseDrawn ← false (not given)');
  });
});

describe('the record of the bombardment', () => {
  it('lists the segments once in the geometry and their state in every snapshot', () => {
    const r = runScenario(...fixtureBomb({ wireRounds: 1000 }), { seed: 1 });
    expect(r.geometry.segments.map((x) => [x.featureId, x.yMin, x.yMax, x.garrisonIds])).toEqual([['ger-front-a', 0, 200, ['k1']], ['ger-front-a', 200, 400, ['k2']]]);
    for (const snap of snapshotsOf(r)) {
      expect(snap.segments.columns).toEqual(['segment', 'holder', 'wireCut', 'emerged']);
      expect(snap.segments.rows.map((x) => [x[0], x[1], x[3]])).toEqual([[0, 'central', false], [1, 'central', false]]);
    }
    expect(snapshotsOf(r)[0]!.segments.rows[0]![2]).toBeGreaterThan(0.5);
  });

  it('fills a garrison’s missing dugout depth from its doctrine and lists it, and lists a missing clock offset', () => {
    const r = runScenario(...fixtureBomb(), { seed: 1 });
    expect(r.defaultsUsed).toContain('companies[k1].dugoutDepthM ← de-1917.companyDefaults.dugoutDepthM');
    expect(r.defaultsUsed.some((x) => x.startsWith('companies[c1].dugoutDepthM'))).toBe(false);
    expect(r.defaultsUsed).toContain('utcOffsetMin ← 0 (no clock offset given; sun times taken as UTC)');
  });

  it('is deterministic for a seed', () => {
    const a = JSON.stringify(runScenario(...fixtureBomb({ wireRounds: 500, trenchRounds: 400, suppressedAtZeroFrac: 0.8 }), { seed: 9 }));
    expect(JSON.stringify(runScenario(...fixtureBomb({ wireRounds: 500, trenchRounds: 400, suppressedAtZeroFrac: 0.8 }), { seed: 9 }))).toBe(a);
  });
});
