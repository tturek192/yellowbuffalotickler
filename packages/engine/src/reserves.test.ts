import { readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { encodeTerrain } from '@wwi/scenario';
import type { Scenario } from '@wwi/scenario';
import { est, minimalDoctrineV2, minimalScenario } from '@wwi/scenario/test-fixtures';
import { resolveDefaults } from './defaults';
import { runPipeline } from './pipeline';
import { RESERVE_COLUMNS } from './record';
import type { RunRecord } from './record';
import { arrivalOf, reserveTimes } from './reserves';
import { commandPhase } from './command';
import { hqPositionOf } from './comms';
import { initRun, runScenario } from './run';
import type { Models } from './run';
import { quietStep, SCHEDULES } from './schedule';
import type { SimState } from './step';
import { fixtureFire, fixtureReserves, hash, ofKind, runStates, withQuietStep } from './test-helpers';
import type { ReserveOpts } from './test-helpers';

/** The minute the fixture's reserve gres would arrive if its division ordered it at minute 60. */
function arrival(o: ReserveOpts): number {
  const { state, ctx } = initRun(...fixtureReserves(o), { seed: 1 });
  return arrivalOf(state.reserves[0]!, 60, ctx).arriveMin;
}

/** The fixture run to minute 600 (its division orders gres forward once it has lost a quarter of its front). */
const runReserves = (o: ReserveOpts = {}, m?: (f: [Scenario, Models]) => [Scenario, Models]): RunRecord => {
  const f = fixtureReserves(o);
  return runScenario(...(m ? m(f) : f), { seed: 1, endMinute: 600 });
};

/** A snapshot's reserve rows, as objects keyed by column. */
const reserveRows = (r: RunRecord, i: number) => {
  const t = r.snapshots[i]!.reserves!;
  return t.rows.map((row) => Object.fromEntries(t.columns.map((c, j) => [c, row[j]])));
};

// ---- the uphill counter-attack -----------------------------------------------------------------------------------

/**
 * fixtureFire with the attack over: c1 and c2, 40 men each, hold the German trench at x 150 (its garrisons gone), and
 * the German reserve company kr (150 men) counter-attacks it from x 650 under their fire, the ground rising `climbM`
 * from x 650 to the trench. Returns kr after `minutes`, and the events.
 */
function counterAttack(o: { climbM: number; seed?: number; minutes?: number }) {
  const [s, m] = fixtureFire();
  s.forces[1]!.formations[0]!.companies!.push({ id: 'kr', name: 'Reserve-Kompanie', role: 'reserve', strength: est(150), start: [650, 200] });
  const cellM = 25;
  const originX = -1000;
  const originY = -200;
  const cols = 121;
  const rows = 33;
  const elev = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) elev[j * cols + i] = o.climbM * Math.min(1, Math.max(0, (650 - (originX + i * cellM)) / 500));
  s.terrainGrid = encodeTerrain({ cellM, originX, originY, cols, rows, elevM: elev });
  const { state, ctx } = initRun(s, m, { seed: o.seed ?? 1 });
  const seg = state.segments[0]!;
  let st: SimState = {
    ...state,
    segments: state.segments.map((x) => ({ ...x, holder: 'allied' as const, emerged: true })),
    companies: state.companies.map((c) => {
      if (c.id === 'c1' || c.id === 'c2') return { ...c, x: 150, men: 40, killed: c.men - 40, status: 'holding' as const, intent: 'hold' as const, posture: 'in-trench' as const, startMin: 0 };
      if (c.id === 'k1' || c.id === 'k2') return { ...c, killed: c.killed + c.men, men: 0, status: 'destroyed' as const, posture: 'in-trench' as const };
      if (c.id === 'kr')
        return { ...c, status: 'counter-attacking' as const, intent: 'counter-attack' as const, posture: 'moving' as const, orders: [{ kind: 'counter-attack' as const, target: { segmentId: seg.id }, fromFormationId: 'rir262', issuedMin: 0 }] };
      return c;
    }),
  };
  const events: RunRecord['events'] = [];
  const end = st.minute + (o.minutes ?? 20);
  while (st.minute < end) {
    st = runPipeline(st, ctx, 2);
    events.push(...st.events);
  }
  return { kr: st.companies.find((c) => c.id === 'kr')!, events };
}

/** kr's men lost (killed and wounded) in the counter-attack, summed over 30 seeds. */
function counterAttackLosses(o: { climbM: number }): number {
  let n = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const { kr } = counterAttack({ climbM: o.climbM, seed });
    n += kr.killed + kr.wounded;
  }
  return n;
}

describe('reserves off the map', () => {
  it('a reserve 5 km back arrives earlier than one 24 km back (the spec what-if)', () => {
    expect(arrival({ distanceKm: 5 })).toBeLessThan(arrival({ distanceKm: 24 }));
  });

  it('arrives orderedMin + baseOrderDelayMin · delayFactor + distanceKm / (marchKmPerHour · weather) · 60 + deployMin', () => {
    // 60 + 15 + 8 / 4 · 60 + 30.
    expect(arrival({})).toBeCloseTo(225, 9);
    // A slow division leader (orderSpeed 1: delayFactor 5/3) takes longer over the order.
    expect(arrival({ divOrderSpeed: 1 })).toBeCloseTo(60 + 25 + 120 + 30, 9);
    // In the rain the road is mud: mudSpeedFactor 0.6 over the march, every hour of the past day wet.
    expect(arrival({ rain: true })).toBeCloseTo(60 + 15 + 120 / 0.6 + 30, 6);
  });

  it('scenario orderedAt values are validation targets only and never change a run', () => {
    const early = runReserves({ orderedAt: '1917-04-09T08:00' });
    expect(ofKind(early, 'reserve-arrived')).toHaveLength(1);
    expect(hash(early)).toBe(hash(runReserves({ orderedAt: '1917-04-09T20:00' })));
    expect(hash(early)).toBe(hash(runReserves()));
  });

  it('no engine code reads orderedAt or historical.reserveArrivals', () => {
    const dir = dirname(fileURLToPath(import.meta.url));
    const src = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'test-helpers.ts');
    expect(src.length).toBeGreaterThan(20);
    for (const f of src) expect(readFileSync(resolve(dir, f), 'utf8'), f).not.toMatch(/orderedAt|reserveArrivals/);
  });

  it('marches off the map only the part of its distance not on the map, and walks the rest on the map to its front', () => {
    // gres 8 km back, entering 7 km from the trench it is sent to: it marches 1 km off the map; no mud on the way.
    const f = () => {
      const x = fixtureReserves({ entryX: 7150 });
      (x[1].tables.effects as Record<string, unknown>).mudSpeedFactor = { value: 1, estimate: 't', description: 't' };
      return x;
    };
    const run = runStates(f(), { endMinute: 360 });
    const ordered = run.states.flatMap((x) => x.events).find((e) => e.kind === 'reserve-ordered')!;
    const arrived = run.states.flatMap((x) => x.events).find((e) => e.kind === 'reserve-arrived')!;
    expect(arrived.factors).toMatchObject({ distanceKm: 8, onMapKm: 7, offMapKm: 1 });
    // Before (the whole 8 km off the map): ordered + 15 + 120 + 30; now 7 km' worth of march (105 minutes) sooner.
    const before = ordered.minute + 15 + 120 + 30;
    expect(arrived.factors!.arriveMin).toBeCloseTo(before - 105, 6);
    const r = run.states.find((x) => x.minute === ordered.minute)!.reserves[0]!;
    expect(arrivalOf({ ...r, onMapKm: 0 }, ordered.minute, run.ctx).arriveMin).toBeCloseTo(before, 6);
    // It reaches the front (its companies hold there) at the old arrival time, to within a step.
    const there = run.states.find((x) => x.companies.filter((c) => c.battalionId === 'gres').every((c) => c.status === 'holding'))!;
    expect(Math.abs(there.minute - before)).toBeLessThanOrEqual(2);
    expect(there.companies.find((c) => c.id === 'gres-g1')!.x).toBeCloseTo(150, -1);
  });

  it('an army orders its own reserves only once its picture shows a division whose own reserves have arrived and gone in, and still lost its front', () => {
    const r = runStates(fixtureReserves({ armyOrderSpeed: 3 }), { endMinute: 700 });
    const events = r.states.flatMap((x) => x.events);
    const div = events.find((e) => e.kind === 'reserve-ordered' && /German Division orders/.test(e.text))!;
    const divGo = events.find((e) => e.kind === 'counter-attack-ordered' && /German Division/.test(e.text))!;
    const army = events.find((e) => e.kind === 'reserve-ordered' && /German Army orders/.test(e.text))!;
    expect(army).toBeDefined();
    expect(army.text).toBe('German Army orders Reserve Division forward to German Division');
    expect(army.causes).toEqual(['ground-lost']);
    // Not while the division's reserve is on its way (ordered, marching, walking on to its front): only after its
    // divisional counter-attack has gone in, with the army's picture showing gres at its front.
    expect(army.minute).toBeGreaterThan(divGo.minute);
    expect(divGo.minute).toBeGreaterThan(div.minute);
    const ga = (minute: number) => r.states.find((x) => x.minute === minute)!.hqs.find((h) => h.formationId === 'ga')!;
    const onWay = (st: string) => st === 'off-map' || st === 'marching' || st === 'advancing';
    expect(['gres-g1', 'gres-g2', 'gres-g3', 'gres-g4'].every((id) => !onWay(ga(army.minute).picture.units[id]!.status))).toBe(true);
    // It learns that the division's counter-attack went in only from the division's report, over the channels: later than
    // the decision, and it does not commit before it has it.
    const heard = r.states.find((x) => x.hqs.find((h) => h.formationId === 'ga')!.picture.plans['gd'] !== undefined)!;
    expect(heard.hqs.find((h) => h.formationId === 'ga')!.picture.plans['gd']).toBe(divGo.minute);
    expect(heard.minute).toBeGreaterThan(divGo.minute);
    expect(army.minute).toBeGreaterThanOrEqual(heard.minute);
    expect(r.states.find((x) => x.minute === divGo.minute)!.hqs.find((h) => h.formationId === 'gd')!.picture.plans['gd']).toBe(divGo.minute);
    for (const x of r.states.filter((y) => y.minute < army.minute)) expect(x.reserves.find((y) => y.formationId === 'ares')!.status).toBe('waiting');
    // The division rule's march and plan: its leader's orderSpeed, its arrival, its counter-attack plan.
    const at = r.states.find((x) => x.minute === army.minute)!;
    expect(at.reserves.find((x) => x.formationId === 'ares')).toMatchObject({ status: 'ordered', orderedBy: 'ga', orderedEventId: army.id });
    expect(at.hqs.find((h) => h.formationId === 'ga')!.pending.map((p) => [p.kind, p.frontId, p.reserveIds])).toEqual([['divisional-counter-attack', 'gd', ['ares']]]);
    expect(events.find((e) => e.kind === 'reserve-arrived' && /Reserve Division/.test(e.text))!.refs).toEqual([army.id]);
    const slow = runStates(fixtureReserves({ armyOrderSpeed: 1 }), { endMinute: 700 });
    const slowArmy = slow.states.flatMap((x) => x.events).find((e) => e.kind === 'reserve-ordered' && /German Army/.test(e.text))!;
    expect(slowArmy.causes).toEqual(['ground-lost', 'leader-slow']);
    const delay = (x: typeof r, e: typeof army) => x.states.find((st) => st.minute === e.minute)!.reserves.find((y) => y.formationId === 'ares')!.arriveMin! - e.minute;
    expect(delay(slow, slowArmy) - delay(r, army)).toBeCloseTo(15 * (5 / 3 - 1), 6);
  });

  it('a reserve formation with no companies arrives with default companies, recorded in defaultsUsed', () => {
    const r = runReserves({ noCompanies: true });
    expect(r.defaultsUsed.some((d) => /companiesPerBattalion/.test(d))).toBe(true);
    expect(r.units.filter((u) => u.battalionId === 'gres').map((u) => u.id)).toEqual(['gres-g1', 'gres-g2', 'gres-g3', 'gres-g4']);
    const arrived = ofKind(r, 'reserve-arrived')[0]!;
    expect(arrived.causes).toEqual(['reserve-arrived']);
    expect(arrived.refs).toEqual([ofKind(r, 'reserve-ordered')[0]!.id]);
    expect(arrived.factors).toMatchObject({ companies: 4, men: 600 });
    // On the map across the entry point once arrived (walking on to its front), and not before.
    const i = r.snapshots.findIndex((x) => x.minute >= arrived.minute);
    const row = r.snapshots[i]!.companies.rows.find((x) => x[0] === 'gres-g1')!;
    expect([row[3], row[4]]).toEqual([150, 'advancing']);
    expect(row[1] as number).toBeLessThanOrEqual(2500);
    expect(r.snapshots[i - 1]!.companies.rows.find((x) => x[0] === 'gres-g1')![4]).toBe('marching');
  });

  it('a planned counter-attack chooses its targets afresh from its picture, and gives up after counterAttackPatienceMin with none it can reach', () => {
    // The attackers take ger-front-a and go on to the Black Line (x 1150): the division's whole front lies behind it, and kr
    // (550 m off) reports the line taken, so once gres is there its plan has lost ground but none it can reach.
    const run = runStates(fixtureReserves({ objective: 'black' }), { endMinute: 700 });
    const events = run.states.flatMap((x) => x.events);
    const gd = (x: SimState) => x.hqs.find((h) => h.formationId === 'gd')!;
    expect(events.filter((e) => e.kind === 'counter-attack-ordered' && /German Division/.test(e.text))).toEqual([]);
    const blocked = run.states.find((x) => gd(x).pending[0]?.blockedSinceMin !== undefined)!;
    expect(blocked).toBeDefined();
    expect(typeof gd(blocked).picture.lines['black|s1']).toBe('number');
    const dropped = events.find((e) => e.kind === 'counter-attack-dropped')!;
    expect(dropped).toMatchObject({ causes: ['out-of-reach'], minute: gd(blocked).pending[0]!.blockedSinceMin! + 120 });
    expect(dropped.refs).toContain(events.find((e) => e.kind === 'reserve-ordered')!.id);
    expect(run.states.find((x) => x.minute === dropped.minute)!.hqs.find((h) => h.formationId === 'gd')!.pending).toEqual([]);
    // Chosen afresh: the same blocked plan, once its picture shows the Black Line lost, goes for the lost trench at once.
    const known = { ...blocked, events: [], hqs: blocked.hqs.map((h) => (h.formationId === 'gd' ? { ...h, picture: { ...h.picture, lines: { ...h.picture.lines, 'black|s1': null } } } : h)) };
    const go = commandPhase({ ...known, minute: blocked.minute + 2 }, run.ctx, 2).events.filter((e) => e.kind === 'counter-attack-ordered');
    expect(go.map((e) => e.text)).toEqual([expect.stringMatching(/^German Division orders a counter-attack by \d+ companies on ger-front-a/)]);
  });

  it('a plan with no ground it can reach waits, and launches when reachable lost ground appears in its picture', () => {
    // fixtureReserves with the Black Line as objective and a strong German trench on it (k3, 400 men, x 1150, rir262's):
    // the trench holds, so the line is never taken; the HQ's picture is set by hand from there.
    const f = fixtureReserves({ objective: 'black' });
    f[0].features.push({ id: 'ger-rear-k3', kind: 'trench', side: 'central', geometry: { type: 'LineString', coordinates: [[1150, 0], [1150, 400]] }, cite: { value: 'fixture', estimate: 'test fixture' } });
    f[0].forces[1]!.formations[0]!.children!.find((x) => x.id === 'rir262')!.companies!.push({ id: 'k3', name: 'Rear garrison k3', role: 'garrison', strength: est(400), start: [1150, 200], trenchFeatureId: 'ger-rear-k3' });
    const run = runStates(f, { endMinute: 300 });
    const st = run.states.at(-1)!;
    const k3seg = st.segments.find((x) => x.featureId === 'ger-rear-k3')!.id;
    const gres = ['gres-g1', 'gres-g2', 'gres-g3', 'gres-g4'];
    // The division's plan, its reserve at its front; its picture: ger-front-a lost behind the Black Line it believes taken.
    const decide = (k3lost: boolean, blockedSinceMin?: number) => {
      const plan = { kind: 'divisional-counter-attack' as const, atMin: 50, formationId: 'gd', segmentIds: [], reserveIds: ['gres'], eventRefs: [], frontId: 'gd', ...(blockedSinceMin !== undefined ? { blockedSinceMin } : {}) };
      const hqs = st.hqs.map((h) =>
        h.formationId !== 'gd'
          ? h
          : {
              ...h,
              pending: [plan],
              picture: {
                ...h.picture,
                lines: { 'black|s1': 30 },
                segments: { ...h.picture.segments, 'ger-front-a:001': 'allied' as const, 'ger-front-a:002': 'allied' as const, [k3seg]: k3lost ? ('allied' as const) : ('central' as const) },
                segmentsAt: { [k3seg]: st.minute },
                enemy: { [k3seg]: { men: 50, atMin: st.minute } },
                units: { ...h.picture.units, ...Object.fromEntries(gres.map((id) => [id, { status: 'holding', men: 150, atMin: st.minute }])) },
              },
            },
      );
      const companies = st.companies.map((c) => (gres.includes(c.id) ? { ...c, status: 'holding' as const, orders: [] } : c));
      const reserves = st.reserves.map((x) => (x.formationId === 'gres' ? { ...x, status: 'arrived' as const, arriveMin: 200 } : x));
      return commandPhase({ ...st, minute: st.minute + 2, events: [], hqs, companies, reserves, command: { ...st.command, ordered: {} } }, run.ctx, 2);
    };
    const waiting = decide(false);
    expect(waiting.events.filter((e) => e.kind === 'counter-attack-ordered')).toEqual([]);
    expect(waiting.hqs.find((h) => h.formationId === 'gd')!.pending[0]!.blockedSinceMin).toBe(st.minute + 2);
    // k3's trench, at the Black Line, now known lost: reachable, so the waiting plan takes it as its target and goes.
    const go = decide(true, st.minute - 30).events.filter((e) => e.kind === 'counter-attack-ordered');
    expect(go.map((e) => e.segmentId)).toEqual([k3seg]);
  });

  it('comes on to the map spread along a frontage across its entry point, each company walking to its own place at the front', () => {
    const run = runStates(fixtureReserves(), { endMinute: 400 });
    const arrived = run.states.find((x) => x.events.some((e) => e.kind === 'reserve-arrived'))!;
    const g = (st: SimState) => st.companies.filter((c) => c.battalionId === 'gres');
    // companyFrontageM (200) apart along y, centred on the entry point (2500, 200); no two on one point.
    expect(g(arrived).map((c) => [c.startX, c.startY])).toEqual([[2500, -100], [2500, 100], [2500, 300], [2500, 500]]);
    const keys = g(arrived).map((c) => `${c.x}|${c.y}`);
    expect(new Set(keys).size).toBe(4);
    // Each to its own place along the front it was sent to, and there they stand apart.
    const to = g(arrived).map((c) => JSON.stringify(c.orders.at(-1)!.target));
    expect(new Set(to).size).toBe(4);
    const there = run.states.find((x) => g(x).every((c) => c.status === 'holding'))!;
    expect(new Set(g(there).map((c) => `${Math.round(c.x)}|${Math.round(c.y)}`)).size).toBe(4);
    // Its battalion headquarters moves with them: behind their places at the front by the battalion's rear offset (600 m,
    // +x for the German side), no longer at the map's edge.
    const ends = g(arrived).map((c) => (c.orders.at(-1)!.target as { point: [number, number] }).point);
    const [hx, hy] = hqPositionOf(run.ctx, 'gres')!;
    expect(hx).toBeCloseTo(ends.reduce((a, p) => a + p[0], 0) / 4 + 600, 6);
    expect(hy).toBeCloseTo(ends.reduce((a, p) => a + p[1], 0) / 4, 6);
    expect(run.ctx.defaultsUsed.has('formations[gres].hqPosition ← moves with its companies to behind their places at the front by effects.hqRearOffsetBattalionM (an off-map reserve\'s battalion)')).toBe(true);
    // Held inside the frame's extent: a long line closes up along the edge.
    const f = fixtureReserves();
    f[0].frame = { origin: { lon: 2.7, lat: 50.4 }, bearingDeg: est(75), extent: { minX: -1000, maxX: 2500, minY: 0, maxY: 450 } };
    const inFrame = runStates(f, { endMinute: 400 });
    const a2 = inFrame.states.find((x) => x.events.some((e) => e.kind === 'reserve-arrived'))!;
    expect(g(a2).map((c) => c.startY)).toEqual([0, 150, 300, 450]);
  });

  it('a reserve with companies of its own brings them, to its entry point; nothing is made up', () => {
    const r = runReserves({ noCompanies: false });
    expect(r.defaultsUsed.some((d) => d.startsWith('reserves[gres]'))).toBe(false);
    expect(r.units.filter((u) => u.battalionId === 'gres').map((u) => u.id)).toEqual(['gres-1', 'gres-2']);
    expect(ofKind(r, 'reserve-arrived')[0]!.factors).toMatchObject({ companies: 2, men: 200 });
    const last = r.snapshots.at(-1)!.companies.rows.find((x) => x[0] === 'gres-1')!;
    expect(last[4]).not.toBe('off-map');
  });

  it('a division with no battalions gets battalionsPerDivision battalions of companiesPerBattalion companies', () => {
    const s = minimalScenario();
    s.forces[0]!.formations.push({ id: 'rd', name: 'Reserve Division', kind: 'division' });
    s.reserves = [{ formationId: 'rd', side: 'allied', distanceKm: est(20), entryPoint: [-3000, 0] }];
    const d = minimalDoctrineV2();
    d.companyDefaults = { ...d.companyDefaults, battalionsPerDivision: { value: 3, estimate: 't', description: 't' }, companiesPerBattalion: { value: 2, estimate: 't', description: 't' } };
    const { scenario, used } = resolveDefaults(s, { 'bef-1917': d }, {} as never);
    const rd = scenario.forces[0]!.formations.find((f) => f.id === 'rd')!;
    expect(rd.children!.map((b) => [b.id, b.kind, b.companies!.map((c) => c.id)])).toEqual([
      ['rd-bn1', 'battalion', ['rd-bn1-g1', 'rd-bn1-g2']],
      ['rd-bn2', 'battalion', ['rd-bn2-g1', 'rd-bn2-g2']],
      ['rd-bn3', 'battalion', ['rd-bn3-g1', 'rd-bn3-g2']],
    ]);
    expect(rd.children![0]!.companies![0]).toMatchObject({ role: 'reserve', start: [-3000, 0], strength: { value: 1 }, officers: { value: 1 }, training: 'standard' });
    expect(used.filter((u) => u.startsWith('reserves[rd]'))).toEqual([
      'reserves[rd] ← 3 battalions (bef-1917.companyDefaults.battalionsPerDivision) of 2 companies (bef-1917.companyDefaults.companiesPerBattalion) of 1 men (bef-1917.companyDefaults.strength); officers, lewisGuns, machineGuns from bef-1917.companyDefaults, training standard',
    ]);
  });

  it('waits off the map, is ordered, marches and arrives; each snapshot says so', () => {
    const r = runReserves();
    expect(r.snapshots[0]!.reserves!.columns).toEqual([...RESERVE_COLUMNS]);
    expect(reserveRows(r, 0)).toEqual([{ formationId: 'gres', status: 'waiting', orderedMin: null, arriveMin: null }]);
    const ordered = ofKind(r, 'reserve-ordered')[0]!;
    const arrived = ofKind(r, 'reserve-arrived')[0]!;
    const last = reserveRows(r, r.snapshots.length - 1)[0]!;
    expect(last).toMatchObject({ status: 'arrived', orderedMin: ordered.minute });
    // Arrives at the first step end at or after arriveMin (a fine step: startsMovement).
    expect(arrived.minute).toBeGreaterThanOrEqual(last.arriveMin as number);
    expect(arrived.minute - (last.arriveMin as number)).toBeLessThan(2);
    const statuses = r.snapshots.flatMap((_, i) => reserveRows(r, i).map((x) => x.status));
    expect(statuses.filter((x, i) => statuses.indexOf(x) === i)).toEqual(['waiting', 'ordered', 'marching', 'arrived']);
    // The companies are off the map, then marching, then on it walking on to the front, then there.
    const g1 = r.snapshots.map((x) => x.companies.rows.find((y) => y[0] === 'gres-g1')![4]);
    expect(g1.filter((x, i) => g1.indexOf(x) === i).slice(0, 4)).toEqual(['off-map', 'marching', 'advancing', 'holding']);
  });

  it('the arrived reserve goes into the planned divisional counter-attack', () => {
    const r = runReserves();
    const arrived = ofKind(r, 'reserve-arrived')[0]!;
    const go = ofKind(r, 'counter-attack-ordered').find((e) => e.minute > arrived.minute)!;
    expect(go).toBeDefined();
    expect(go.text).toMatch(/counter-attack by \d+ companies/);
    // The arrived companies (walked on to the front) are in it, and retake the trench.
    expect(go.text).toMatch(/by 5 companies/);
    expect(ofKind(r, 'segment-retaken').some((e) => e.unitId?.startsWith('gres-g') && e.refs.includes(go.id))).toBe(true);
  });

  it('a run does not end while a reserve is on its way, and is not held open by reserves never ordered', () => {
    const r = runReserves();
    expect(r.endMinute).toBeGreaterThan(ofKind(r, 'reserve-arrived')[0]!.minute);
    // Nobody orders a reserve that is never needed: the fixture without its attack ends early with gres still waiting.
    const quiet = runReserves({}, ([s, m]) => {
      s.forces[0]!.formations[0]!.companies = s.forces[0]!.formations[0]!.companies!.map((c) => ({ ...c, startAfterMin: est(100000) }));
      s.timeLimitMinutes = 600;
      return [s, m];
    });
    expect(ofKind(quiet, 'reserve-ordered')).toEqual([]);
  });

  it('the arrival is a scheduled minute that starts movement, and the march start one that does not', () => {
    const { state, ctx } = initRun(...fixtureReserves(), { seed: 1 });
    expect(SCHEDULES.some(([name]) => name === 'reserves')).toBe(true);
    expect(reserveTimes(state, ctx)).toEqual([]);
    const ordered: SimState = { ...state, minute: 60, reserves: [{ ...state.reserves[0]!, status: 'ordered', orderedMin: 60, arriveMin: 225 }] };
    expect(reserveTimes(ordered, ctx)).toEqual([
      { minute: 75, startsMovement: false },
      { minute: 225, startsMovement: true },
    ]);
    // A quiet step ends on the last grid minute strictly before the arrival.
    const marching: SimState = { ...ordered, minute: 220, reserves: [{ ...ordered.reserves[0]!, status: 'marching' }] };
    expect(quietStep(marching, ctx, 2, 10)).toBe(4);
  });

  it('quiet steps do not change the march or the arrival', () => {
    const [s, m] = fixtureReserves();
    const coarse = runScenario(s, withQuietStep(m, 10), { seed: 1, endMinute: 600 });
    const fine = runScenario(s, withQuietStep(m, 2), { seed: 1, endMinute: 600 });
    const of = (r: RunRecord) => r.events.filter((e) => e.kind === 'reserve-ordered' || e.kind === 'reserve-arrived').map((e) => [e.minute, e.kind, e.text, e.factors]);
    expect(of(coarse)).toHaveLength(2);
    expect(of(coarse)).toEqual(of(fine));
    expect(reserveRows(coarse, coarse.snapshots.length - 1)).toEqual(reserveRows(fine, fine.snapshots.length - 1));
  });

  it('a counter-attack up the ridge is slower and weaker than the same attack on the flat', () => {
    expect(counterAttackLosses({ climbM: 40 })).toBeGreaterThan(counterAttackLosses({ climbM: 0 }));
    // Slower: after 6 minutes it is further from the trench.
    expect(counterAttack({ climbM: 40, minutes: 6 }).kr.x).toBeGreaterThan(counterAttack({ climbM: 0, minutes: 6 }).kr.x);
    // Weaker: its fire carries the cause, and the climb between it and its target.
    const fire = counterAttack({ climbM: 40, minutes: 6 }).events.filter((e) => e.kind === 'direct-fire' && (e.unitId === 'c1' || e.unitId === 'c2'));
    expect(fire.length).toBeGreaterThan(0);
    expect(fire.every((e) => e.causes.includes('uphill-counter-attack'))).toBe(true);
    expect(fire[0]!.factors!.climbM).toBeGreaterThan(0);
    const flat = counterAttack({ climbM: 0, minutes: 6 }).events.filter((e) => e.kind === 'direct-fire' && (e.unitId === 'c1' || e.unitId === 'c2'));
    expect(flat.some((e) => e.causes.includes('uphill-counter-attack'))).toBe(false);
  });
});
