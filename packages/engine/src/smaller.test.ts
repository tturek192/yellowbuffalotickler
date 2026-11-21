import { describe, expect, it } from 'vitest';
import type { Scenario } from '@wwi/scenario';
import { est, wx } from '@wwi/scenario/test-fixtures';
import { barrageXAt } from './barrage';
import { lineXAt } from './geometry';
import { directFire } from './fire';
import { resolve } from './resolve';
import type { RunRecord } from './record';
import { initRun, runScenario } from './run';
import type { Models } from './run';
import { inContact, isBusy } from './step';
import type { SimState } from './step';
import { fixtureArtillery, fixtureFire, ofKind, runStates, snapshotsOf, withQuietStep } from './test-helpers';
import type { Pending } from './types';

const cite = { value: 'test tank', estimate: 'test fixture' };
const TANK_EFFECTS = { tankBogPerKm: 0.3, tankBogMudFactor: 3, tankSuppressRadiusM: 100, tankMachineGuns: 5 };

/**
 * fixtureArtillery (the barrage lifts 91 m every 3 minutes from x 150 to the Black Line, x 1150, then stands 180 m
 * beyond it for 40 minutes) with `n` tanks starting at x 0 across the sector, making for `objective` (default the
 * Black Line; `brown`, x 2000, lies beyond the barrage's last line). `rain`: it rained all the day before Zero.
 */
function fixtureTanks(o: { n?: number; rain?: boolean; objective?: 'black' | 'brown'; lagMin?: number; effects?: Record<string, number> } = {}): [Scenario, Models] {
  const [s, m] = fixtureArtillery({ lagMin: o.lagMin ?? 0, effects: { ...TANK_EFFECTS, ...o.effects } });
  const n = o.n ?? 8;
  s.lines.push({ id: 'brown', name: 'Brown Line', kind: 'objective', color: '#8b4513', points: [[2000, 0], [2000, 400]] });
  s.tanks = Array.from({ length: n }, (_, i) => ({
    id: `t${i + 1}`,
    side: 'allied' as const,
    start: [0, n === 1 ? 200 : 25 + (350 * i) / (n - 1)] as [number, number],
    sectorId: 's1',
    objectiveLineId: o.objective ?? 'black',
    cite,
  }));
  if (o.rain) s.weather = [wx('1916-06-30T07:00')];
  return [s, m];
}

/** Each tank's row in a snapshot of the record, by column. */
function tanksAt(r: RunRecord, k: number): Array<{ id: string; x: number; y: number; status: string }> {
  const t = snapshotsOf(r)[k]!.tanks!;
  return t.rows.map((row) => Object.fromEntries(t.columns.map((c, i) => [c, row[i]])) as { id: string; x: number; y: number; status: string });
}

/** Tanks bogged per kilometre they drove, over 30 seeds of eight tanks each. */
function bogRate(o: { rain: boolean }): number {
  let bogged = 0;
  let km = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const r = runScenario(...fixtureTanks({ rain: o.rain }), { seed, endMinute: 120 });
    bogged += ofKind(r, 'tank-bogged').length;
    const first = tanksAt(r, 0);
    const last = tanksAt(r, snapshotsOf(r).length - 1);
    km += last.reduce((a, t, i) => a + (t.x - first[i]!.x), 0) / 1000;
  }
  return bogged / km;
}

/**
 * fixtureArtillery with a horse-drawn German battery `gb` (6 guns) 250 m behind the trench the attackers take, and a
 * preliminary bombardment of 300 rounds from g1 on it: gas with `gas`, otherwise high explosive (`battery`).
 */
function runGassed(o: { gas: boolean; seed?: number }): RunRecord {
  const [s, m] = fixtureArtillery({ effects: { horseLossPerGasRound: 0.01, gasHorseRadiusM: 200 } });
  s.artillery.push({ id: 'gb', side: 'central', weapon: '18pdr', count: est(6), role: 'defensive', position: [400, 200], horseDrawn: true });
  s.bombardment = {
    from: { value: '1916-06-24T06:00', estimate: 'test fixture' },
    allocations: [{ artilleryId: 'g1', task: o.gas ? 'gas' : 'battery', rounds: est(300) }],
    spared: [],
    wire: [],
  };
  return runScenario(s, m, { seed: o.seed ?? 1, endMinute: 120 });
}
const gunsCaptured = (o: { gas: boolean }): number => runGassed(o).summary.gunsCaptured;

/**
 * A consolidated attacker under fire (fixtureFire, its small arms carrying 100 rounds a rifle and 1,000 a gun): c1 has
 * reached the Black Line and holds it at x 600 with `ammo` of its rounds left; k1 is up in its trench (x 150), 450 m
 * off. With `counterAttack`, k2 comes at c1 across the open (x 450). The state and context at Zero, so arranged.
 */
function consolidated(o: { counterAttack: boolean; ammo?: number }) {
  const [s, m] = fixtureFire({ lagMin: 500 });
  for (const d of Object.values(m.doctrines)) {
    d.companyDefaults.roundsPerRifle = { ...d.companyDefaults.roundsPerRifle, value: 100 };
    d.companyDefaults.roundsPerLightMg = { ...d.companyDefaults.roundsPerLightMg, value: 1000 };
    d.companyDefaults.roundsPerMg = { ...d.companyDefaults.roundsPerMg, value: 1000 };
    d.attack!.ammoReserveFrac = { ...d.attack!.ammoReserveFrac, value: 0.2 };
  }
  const { state, ctx } = initRun(s, m, { seed: 1 });
  const companies = state.companies.map((c) => {
    if (c.id === 'c1') return { ...c, x: 600, y: 100, status: 'consolidating' as const, intent: 'hold' as const, posture: 'in-trench' as const, ammo: o.ammo ?? 0.3, reached: { eventId: 0, causes: ['followed-barrage' as const] } };
    if (c.id === 'c2') return { ...c, men: 0, killed: c.men };
    if (c.id === 'k1') return { ...c, posture: 'in-trench' as const };
    if (c.id === 'k2') return o.counterAttack ? { ...c, x: 450, y: 150, status: 'counter-attacking' as const, intent: 'counter-attack' as const, posture: 'moving' as const } : { ...c, men: 0, killed: c.men };
    return c;
  });
  return { state: { ...state, companies }, ctx };
}

/** Five steps of direct fire and its resolution on `consolidated`: the share of its rounds c1 fired, and the states. */
function fireSteps(o: { counterAttack: boolean; ammo?: number }) {
  const { state, ctx } = consolidated(o);
  let s: SimState = state;
  const events: SimState['events'] = [];
  for (let i = 0; i < 5; i++) {
    const pending: Pending = { damage: [] };
    s = { ...s, minute: s.minute + 2, events: [] };
    s = resolve(directFire(s, ctx, 2, pending), ctx, 2, pending);
    events.push(...s.events);
  }
  const c1 = (x: SimState) => x.companies.find((c) => c.id === 'c1')!;
  return { fired: c1(state).ammo - c1(s).ammo, left: c1(s).ammo, events, state: s, ctx };
}
const firedWhileConsolidating = (o: { counterAttack: boolean }): number => fireSteps(o).fired;

describe('smaller mechanics (Task 14): the brief', () => {
  it('tanks bog more in mud', () => {
    expect(bogRate({ rain: true })).toBeGreaterThan(bogRate({ rain: false }));
  });
  it('gassed horses leave guns to be captured', () => {
    expect(gunsCaptured({ gas: true })).toBeGreaterThan(gunsCaptured({ gas: false }));
  });
  it('attackers keep an ammunition reserve until counter-attacked', () => {
    expect(firedWhileConsolidating({ counterAttack: false })).toBeLessThan(firedWhileConsolidating({ counterAttack: true }));
  });
});

describe('tanks', () => {
  it('follow their barrage: never past its line less the follow distance while it lifts, never faster than it, and on to the objective', () => {
    const f = fixtureTanks({ n: 2, effects: { tankBogPerKm: 0 } });
    const { states, ctx } = runStates(f, { endMinute: 120 });
    const sector = ctx.scenario.sectors[0]!;
    const follow = f[1].doctrines['bef-1917']!.attack!.followDistanceM.value;
    const pace = 91 / 3;
    for (let k = 1; k < states.length; k++) {
      const s = states[k]!;
      for (const t of s.tanks) {
        const before = states[k - 1]!.tanks.find((x) => x.id === t.id)!;
        expect(t.x - before.x).toBeLessThanOrEqual(pace * 2 + 1e-9);
        expect(t.x).toBeGreaterThanOrEqual(before.x);
        if (s.barrages[0]!.phase !== 'done') expect(t.x).toBeLessThanOrEqual(Math.max(before.x, barrageXAt(s.barrages[0]!, sector, ctx.lines, s.minute, t.y) - follow) + 1e-9);
      }
    }
    const end = states[states.length - 1]!.tanks;
    for (const t of end) {
      expect(t.status).toBe('arrived');
      expect(t.x).toBeCloseTo(lineXAt(ctx.lines.get('black')!, t.y), 6);
    }
  });

  it('a tank bogs with tank-bogged (cause mud), at a 100 m mark, and stays there for the rest of the run', () => {
    const r = runScenario(...fixtureTanks({ effects: { tankBogPerKm: 4 } }), { seed: 3, endMinute: 120, snapshotEveryStep: true });
    const bogs = ofKind(r, 'tank-bogged');
    expect(bogs.length).toBeGreaterThan(0);
    for (const e of bogs) {
      expect(e.causes).toEqual(['mud']);
      expect(e.unitId).toMatch(/^t\d$/);
      expect((e.factors!.metres! + 1e-6) % 100).toBeLessThan(1e-3);
      const snaps = snapshotsOf(r);
      const at = snaps.findIndex((x) => x.minute >= e.minute);
      const xs = snaps.slice(at).map((_, k) => tanksAt(r, at + k).find((t) => t.id === e.unitId)!);
      expect(new Set(xs.map((t) => t.x)).size).toBe(1);
      expect(xs.every((t) => t.status === 'bogged')).toBe(true);
    }
  });

  it('bog with probability tankBogPerKm / 10 per 100 m: none at 0, all at the first mark at 10', () => {
    const none = runScenario(...fixtureTanks({ effects: { tankBogPerKm: 0 } }), { seed: 1, endMinute: 120 });
    expect(ofKind(none, 'tank-bogged')).toHaveLength(0);
    const all = runScenario(...fixtureTanks({ effects: { tankBogPerKm: 10 } }), { seed: 1, endMinute: 120 });
    expect(ofKind(all, 'tank-bogged')).toHaveLength(8);
    expect(tanksAt(all, snapshotsOf(all).length - 1).map((t) => t.x)).toEqual(Array(8).fill(100));
  });

  it('a moving tank suppresses the enemy within tankSuppressRadiusM (cause tank-fire); a bogged one far off does not', () => {
    // Nobody else fires: there are no guns, and the attackers wait 3 km off (beyond every weapon's reach) for 500 minutes.
    const run = (o: { tank: boolean; bogAtOnce?: boolean }) => {
      const [s, m] = fixtureFire({ lagMin: 500, startX: -3000, effects: { ...TANK_EFFECTS, tankBogPerKm: o.bogAtOnce ? 10 : 0 } });
      if (o.tank) s.tanks = [{ id: 't1', side: 'allied', start: [-400, 100], sectorId: 's1', objectiveLineId: 'black', cite }];
      return runStates([s, m], { endMinute: 60 }).states;
    };
    const k1 = (states: SimState[]) => states.map((s) => s.companies.find((c) => c.id === 'k1')!);
    const withTank = k1(run({ tank: true }));
    expect(Math.max(...withTank.map((c) => c.suppression))).toBeGreaterThan(0.1);
    expect(withTank.some((c) => c.recentFire.some((f) => f.causes.includes('tank-fire')))).toBe(true);
    expect(Math.max(...k1(run({ tank: false })).map((c) => c.suppression))).toBe(0);
    expect(Math.max(...k1(run({ tank: true, bogAtOnce: true })).map((c) => c.suppression))).toBe(0);
  });

  it('a run with tanks keeps them in its snapshots; a run without has no tanks table', () => {
    const r = runScenario(...fixtureTanks({ n: 3 }), { seed: 1, endMinute: 30 });
    expect(snapshotsOf(r)[0]!.tanks!.columns).toEqual(['id', 'x', 'y', 'status']);
    expect(tanksAt(r, 0).map((t) => [t.id, t.x, t.status])).toEqual([['t1', 0, 'moving'], ['t2', 0, 'moving'], ['t3', 0, 'moving']]);
    // A delta in which no tank moved leaves the table out; expanded, every snapshot has it.
    const quiet = runScenario(...fixtureTanks({ n: 3, effects: { tankBogPerKm: 10 } }), { seed: 1, endMinute: 120 });
    expect(quiet.snapshots.some((x) => x.delta && x.tanks === undefined)).toBe(true);
    expect(snapshotsOf(quiet).every((x) => x.tanks!.rows.length === 3)).toBe(true);
    const plain = runScenario(...fixtureArtillery(), { seed: 1, endMinute: 30 });
    expect(plain.snapshots.every((x) => x.tanks === undefined)).toBe(true);
  });

  it('a moving tank keeps the run busy; a tank halted behind a pausing barrage, arrived or bogged does not', () => {
    const { states, ctx } = runStates(fixtureTanks({ n: 1, objective: 'brown', lagMin: 200, effects: { tankBogPerKm: 0 } }), { endMinute: 120 });
    const halted = states.find((s) => s.barrages[0]!.phase === 'pausing' && s.minute > 40)!;
    expect(halted.tanks[0]!.status).toBe('halted');
    expect(isBusy(halted, ctx)).toBe(false);
    const after = states.find((s) => s.barrages[0]!.phase === 'done' && s.tanks[0]!.status === 'moving')!;
    expect(isBusy(after, ctx)).toBe(true);
  });

  it('quiet steps do not change what the tanks do (they move only in fine steps, and resume when the barrage moves on)', () => {
    for (const seed of [1, 2, 3, 4]) {
      const f = () => fixtureTanks({ objective: 'brown', lagMin: 200, effects: { tankBogPerKm: 2 } });
      const coarse = runScenario(f()[0], withQuietStep(f()[1], 10), { seed, endMinute: 240 });
      const fine = runScenario(f()[0], withQuietStep(f()[1], 2), { seed, endMinute: 240 });
      expect(ofKind(coarse, 'tank-bogged')).toEqual(ofKind(fine, 'tank-bogged'));
      expect(tanksAt(coarse, snapshotsOf(coarse).length - 1)).toEqual(tanksAt(fine, snapshotsOf(fine).length - 1));
    }
  });

  it('draw from their own stream: with tanks that never come near anyone, the battle is the same', () => {
    // Every tank bogs at once 400 m behind the attackers' start, so it suppresses nobody; its draws are its own.
    const [s, m] = fixtureFire();
    const plain = runScenario(s, m, { seed: 5, endMinute: 60 });
    const [s2, m2] = fixtureFire({ effects: { ...TANK_EFFECTS, tankBogPerKm: 10 } });
    s2.tanks = [{ id: 't1', side: 'allied', start: [-900, 200], sectorId: 's1', objectiveLineId: 'black', cite }];
    const withTank = runScenario(s2, m2, { seed: 5, endMinute: 60 });
    const fights = (r: RunRecord) => r.events.filter((e) => e.kind !== 'tank-bogged').map(({ id: _id, refs: _refs, ...e }) => e);
    expect(fights(withTank)).toEqual(fights(plain));
    expect(withTank.summary.casualties).toEqual(plain.summary.casualties);
  });
});

describe('gassed horses', () => {
  it('a gas allocation takes the horses of the batteries near its target (horses-gassed), and the guns are taken when overrun', () => {
    const r = runGassed({ gas: true });
    const gassed = ofKind(r, 'horses-gassed');
    expect(gassed).toHaveLength(1);
    expect(gassed[0]).toMatchObject({ minute: 0, causes: ['counter-battery'], factors: { rounds: 300 } });
    expect(gassed[0]!.factors!.guns).toBeGreaterThan(0);
    const taken = ofKind(r, 'guns-captured');
    expect(taken.length).toBeGreaterThan(0);
    expect(taken.some((e) => e.causes.includes('horses-gassed') && e.refs.includes(gassed[0]!.id))).toBe(true);
    expect(r.summary.gunsCaptured).toBe(gassed[0]!.factors!.guns);
  });
  it('guns with no horses far from any trench are captured when attackers overrun the guns themselves (gunCaptureRadiusM)', () => {
    const run = (horseDrawn: boolean) => {
      const [s, m] = fixtureArtillery({ effects: { gunCaptureRadiusM: 300 } });
      // 550 m behind the German trench (x 150): no segment within 300 m, but c1 and c2 walk through it to the Black Line.
      s.artillery.push({ id: 'gb', side: 'central', weapon: '18pdr', count: est(6), role: 'defensive', position: [700, 200], horseDrawn });
      return runScenario(s, m, { seed: 1, endMinute: 120 });
    };
    const r = run(false);
    expect(r.summary.gunsCaptured).toBe(6);
    const e = ofKind(r, 'guns-captured');
    expect(e).toHaveLength(1);
    expect(e[0]!.segmentId).toBeUndefined();
    expect(e[0]!.unitId).toMatch(/^c[12]$/);
    expect(e[0]!.causes.length).toBeGreaterThan(0);
    expect(run(true).summary.gunsCaptured).toBe(0);
  });
  it('high explosive on the battery takes no horses: it gets its guns away', () => {
    const r = runGassed({ gas: false });
    expect(ofKind(r, 'horses-gassed')).toHaveLength(0);
    expect(r.summary.gunsCaptured).toBe(0);
  });
  it('gas falls on the enemy batteries by their guns, and reaches the horses of every battery within gasHorseRadiusM of where it falls', () => {
    const [s, m] = fixtureArtillery({ effects: { horseLossPerGasRound: 0.01, gasHorseRadiusM: 200 } });
    s.artillery.push(
      { id: 'ga', side: 'central', weapon: '18pdr', count: est(6), role: 'defensive', position: [400, 100], horseDrawn: true },
      { id: 'gb', side: 'central', weapon: '18pdr', count: est(6), role: 'defensive', position: [400, 250], horseDrawn: true },
      { id: 'gz', side: 'central', weapon: '18pdr', count: est(6), role: 'defensive', position: [2400, 100], horseDrawn: true },
    );
    s.bombardment = { from: { value: '1916-06-24T06:00', estimate: 'test fixture' }, allocations: [{ artilleryId: 'g1', task: 'gas', rounds: est(600) }], spared: [], wire: [] };
    const { state } = initRun(s, m, { seed: 1 });
    const rounds = Object.fromEntries(state.events.filter((e) => e.kind === 'horses-gassed').map((e) => [e.text.split(' ')[1], e.factors!.rounds]));
    // 200 rounds on each position: ga and gb, 150 m apart, each take their own and the other's; gz only its own.
    expect(rounds).toEqual({ ga: 400, gb: 400, gz: 200 });
  });
  it('the gas is drawn from its own stream: the garrisons\' bombardment losses are as without it', () => {
    const base = (gas: boolean) => {
      const [s, m] = fixtureArtillery({ effects: { horseLossPerGasRound: 0.01, gasHorseRadiusM: 200 } });
      s.artillery.push({ id: 'gb', side: 'central', weapon: '18pdr', count: est(6), role: 'defensive', position: [400, 200], horseDrawn: true });
      s.bombardment = { from: { value: '1916-06-24T06:00', estimate: 'test fixture' }, allocations: [{ artilleryId: 'g1', task: 'trench', rounds: est(400) }, ...(gas ? [{ artilleryId: 'g1', task: 'gas' as const, rounds: est(100) }] : [])], spared: [], wire: [] };
      return initRun(s, m, { seed: 2 }).state.companies.map((c) => [c.id, c.men, c.killed]);
    };
    expect(base(true)).toEqual(base(false));
  });
});

describe('the ammunition reserve', () => {
  it('a consolidating company stops at its reserve (ammoReserveFrac), with one ammunition-low referring to its arrival', () => {
    const { left, events } = fireSteps({ counterAttack: false });
    expect(left).toBeCloseTo(0.2, 9);
    const low = events.filter((e) => e.kind === 'ammunition-low');
    expect(low).toHaveLength(1);
    expect(low[0]).toMatchObject({ unitId: 'c1', causes: ['ammunition-low'], refs: [0] });
  });
  it('fires into it when counter-attacked', () => {
    const { left } = fireSteps({ counterAttack: true });
    expect(left).toBeLessThan(0.2);
  });
  it('a company held to its reserve is not armed: next to men down in their dugouts it is in contact with nobody who can fire', () => {
    const { state, ctx } = consolidated({ counterAttack: false, ammo: 0.2 });
    const near = (ammo: number): SimState => ({
      ...state,
      companies: state.companies.map((c) => (c.id === 'c1' ? { ...c, x: 130, ammo } : c.id === 'k1' ? { ...c, posture: 'in-dugout' as const } : c)),
    });
    // Contact is about attackers not holding: a consolidating company is one.
    expect(inContact(near(0.5), ctx)).toBe(true);
    expect(inContact(near(0.2), ctx)).toBe(false);
  });
  it('a company still advancing has no reserve: it fires to its last round', () => {
    const { state, ctx } = consolidated({ counterAttack: false, ammo: 0.1 });
    let s: SimState = { ...state, companies: state.companies.map((c) => (c.id === 'c1' ? { ...c, status: 'advancing' as const, intent: 'advance' as const, posture: 'moving' as const, reached: null } : c)) };
    for (let i = 0; i < 5; i++) {
      const pending: Pending = { damage: [] };
      s = resolve(directFire({ ...s, minute: s.minute + 2, events: [] }, ctx, 2, pending), ctx, 2, pending);
    }
    expect(s.companies.find((c) => c.id === 'c1')!.ammo).toBe(0);
  });
});
