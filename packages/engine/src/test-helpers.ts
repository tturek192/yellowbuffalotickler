/**
 * Shared helpers for engine tests (not exported from the engine barrel, and excluded from the engine's
 * typecheck build because it reads files through '@wwi/scenario/node'). Later tasks add to it.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeTerrain, encodeTerrain } from '@wwi/scenario';
import type { Doctrine, Feature, Scenario, Tables, WeaponKind } from '@wwi/scenario';
import { est, germanForce, minimalDoctrineV2, minimalScenario, minimalScenarioV3, minimalTables } from '@wwi/scenario/test-fixtures';
import { loadScenario, loadTables } from '@wwi/scenario/node';
import { buildWorld } from './ground';
import { createRng } from './rng';
import type { RunRecord } from './record';
import { initRun } from './run';
import type { Models } from './run';
import type { SimState, StepContext } from './step';
import type { PhaseName } from './pipeline';

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const param = (value: number) => ({ value, estimate: 'test fixture', description: 'test fixture value' });

/** The minimal tables plus the three company weapons the fixture doctrines name. */
export function fixtureTables(): Tables {
  const t = minimalTables();
  const small = (kind: 'small-arms' | 'lewis' | 'mg', rpm: number) => ({
    kind,
    rpm: param(rpm),
    maxRangeM: param(1000),
    rangeScaleM: param(400),
    lethality: param(0.01),
    suppressPerRound: param(0.01),
  });
  t.weapons = { ...t.weapons, rifle: small('small-arms', 10), lewis: small('lewis', 150), vickers: small('mg', 250) };
  return t;
}

/** Doctrines with the fixture tables, as runScenario takes them. */
export const models = (doctrines: Record<string, Doctrine>, tables: Tables = fixtureTables()): Models => ({ doctrines, tables });

/** A fixture doctrine v2 with usable step and contact values (the minimal one sets every common value to 1). */
function fixtureDoctrine(id: string): Doctrine {
  const d = minimalDoctrineV2(id);
  d.common = { ...d.common, baseMorale: param(0.8), closeRangeM: param(50), quietStepMin: param(10) };
  return d;
}

/**
 * The v3 minimal scenario (two assault companies, one creeping battery) plus a German battalion of two
 * garrison companies on the German front line, with doctrines bef-1917 and de-1917 and the fixture tables.
 */
export function fixtureWithDoctrineV3(): [Scenario, Models] {
  const s = minimalScenarioV3();
  s.forces.push(
    germanForce([
      { id: 'k1', name: '1. Kompanie', role: 'garrison', strength: est(120), start: [150, 100], trenchFeatureId: 'ger-front-a' },
      { id: 'k2', name: '2. Kompanie', role: 'garrison', strength: est(120), start: [150, 300], trenchFeatureId: 'ger-front-a' },
    ]),
  );
  return [s, models({ 'bef-1917': fixtureDoctrine('bef-1917'), 'de-1917': fixtureDoctrine('de-1917') })];
}

const tables = (): Tables => loadTables(resolve(repoRoot, 'tables'));
const load = (file: string) => loadScenario(resolve(repoRoot, file), resolve(repoRoot, 'doctrine'));

/** The Plan 1 draft scenario (1st Canadian Division, 3rd Brigade): no v3 sections. */
export const draft = (): Scenario => load('scenarios/vimy-1917/1cdn-3bde-draft.yaml').scenario;
/** The draft's doctrines with the repository's tables. */
export const doctrines = (): Models => models(load('scenarios/vimy-1917/1cdn-3bde-draft.yaml').doctrines, tables());
/** The full Vimy scenario. */
export const vimy = (): Scenario => load('scenarios/vimy-1917/scenario.yaml').scenario;
/** Vimy's doctrines with the repository's tables. */
export const vimyDoctrines = (): Models => models(load('scenarios/vimy-1917/scenario.yaml').doctrines, tables());

export const eventsOf = (r: RunRecord): RunRecord['events'] => r.events;

/** 32-bit FNV-1a over the UTF-16 code units of the record's JSON, as 8 hex digits. */
export function hash(r: RunRecord | string): string {
  const text = typeof r === 'string' ? r : JSON.stringify(r);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/**
 * The scenario in another file order: every formation's companies in a seeded random order (Fisher–Yates),
 * and the forces, each force's formations and each formation's children reversed.
 */
export function shuffleCompanies(s: Scenario, seed: number): Scenario {
  const out = structuredClone(s);
  const rng = createRng(seed);
  type F = Scenario['forces'][number]['formations'][number];
  const walk = (f: F): void => {
    const cs = f.companies;
    if (cs)
      for (let i = cs.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [cs[i], cs[j]] = [cs[j]!, cs[i]!];
      }
    f.children?.reverse().forEach(walk);
  };
  out.forces.reverse();
  for (const force of out.forces) force.formations.reverse().forEach(walk);
  return out;
}

/** The models with every doctrine's `common.quietStepMin` set to n. */
export function withQuietStep(m: Models, n: number): Models {
  const doctrines = structuredClone(m.doctrines);
  for (const d of Object.values(doctrines)) d.common.quietStepMin = { ...d.common.quietStepMin, value: n };
  return { ...m, doctrines };
}

export const companyIds = (r: RunRecord): string[] => r.units.map((u) => u.id);

/** Each snapshot's row for a company, as an object keyed by column. */
export function rowsOf(r: RunRecord, id: string): Array<Record<string, number | string>> {
  return r.snapshots.flatMap((snap) => {
    const { columns, rows } = snap.companies;
    const row = rows.find((x) => x[0] === id);
    return row ? [Object.fromEntries(columns.map((c, i) => [c, row[i]!]))] : [];
  });
}

/** men + killed + wounded + captured of a company in every snapshot. */
export const totalsOverTime = (r: RunRecord, id: string): number[] =>
  rowsOf(r, id).map((x) => (x.men as number) + (x.killed as number) + (x.wounded as number) + (x.captured as number));

/** The fixture's state at Zero, before any step. */
export const initialState = (): SimState => initRun(...fixtureWithDoctrineV3(), { seed: 1 }).state;

/** The fixture's step context, recording the name of every phase it runs into `seen`. */
export function ctxWithPhaseSpy(seen: string[]): StepContext {
  const { ctx } = initRun(...fixtureWithDoctrineV3(), { seed: 1 });
  return { ...ctx, onPhase: (name: PhaseName) => void seen.push(name) };
}

const cite = { value: 'fixture', estimate: 'test fixture' };

/** Fixture tables with ground, mud, uphill and light values set. */
export function tablesWith(over: Record<string, number> = {}) {
  const t = fixtureTables();
  const set = { mudSpeedFactor: 0.6, uphillPenaltyPer10m: 0.02, trenchProximityM: 15, churnAreaPerShellM2: 30, crateredShare: 0.5, nightVisibilityM: 50, twilightMin: 35, ...over };
  for (const [k, value] of Object.entries(set)) (t.effects as Record<string, unknown>)[k] = { value, estimate: 'test', description: 'test', calibrated: true };
  return t;
}

/** A world over a 1000 × 200 m frame at 50.4 N; `elevM(x)` makes a terrain grid, `weather` the weather list. */
export function worldWith(features: Feature[] = [], elevM?: (x: number) => number, weather: Scenario['weather'] = []) {
  const s = minimalScenario();
  s.zeroHour = { value: '1917-04-09T05:30', estimate: 'test fixture' };
  s.features = features;
  s.weather = weather;
  s.frame = { origin: { lon: 2.7, lat: 50.4 }, bearingDeg: est(75), extent: { minX: 0, maxX: 1000, minY: -100, maxY: 100 } };
  let terrain;
  if (elevM) {
    const cols = 41; // 0..1000 m at 25 m
    const elev = new Float32Array(cols * 9);
    for (let j = 0; j < 9; j++) for (let i = 0; i < cols; i++) elev[j * cols + i] = elevM(i * 25);
    terrain = decodeTerrain(encodeTerrain({ cellM: 25, originX: 0, originY: -100, cols, rows: 9, elevM: elev }));
  }
  return buildWorld(s, tablesWith(), terrain);
}

export const featureOf = (id: string, kind: Feature['kind'], geometry: Feature['geometry']): Feature => ({ id, kind, geometry, cite });
export const woodAt = (x0: number, x1: number) =>
  featureOf('w', 'wood', { type: 'Polygon', coordinates: [[x0, -100], [x1, -100], [x1, 100], [x0, 100]] });


/** The bombardment's effect keys at the repository's starting values (tables/effects.yaml), for fixtures. */
export const BOMB_EFFECTS = {
  cutPerRound: 20, damagePerRound: 5, dugoutPerRound: 10, safeDepthM: 3, lossRate: 0.5, killedFrac: 0.25,
  batteryRecoveryHalfLifeMin: 120, wireUncutBelow: 0.5, strongpointRadiusM: 100,
};

/** Fixture tables with ground, light and bombardment values set, and a heavy howitzer (`6in-how`). */
export function bombTables(over: Record<string, number> = {}): Tables {
  const t = tablesWith({ ...BOMB_EFFECTS, ...over });
  t.weapons = { ...t.weapons, '6in-how': { ...t.weapons['18pdr']!, kind: 'heavy' } };
  return t;
}

export type BombOpts = {
  /** Rounds of the allied 18-pdrs (`g1`, kind field-gun) on wire, on trenches and on harassing fire. */
  wireRounds?: number;
  trenchRounds?: number;
  harassRounds?: number;
  /** Rounds of the allied heavy howitzers (`h1`, kind heavy) on trenches and on the German battery. */
  heavyRounds?: number;
  batteryRounds?: number;
  /** true: the whole trench is spared from every kind; or the spared bands. */
  spared?: boolean | Array<{ yMin: number; yMax: number; onlyKinds?: WeaponKind[] }>;
  /** Both garrisons' dugout depth in metres (absent: the doctrine default). */
  depth?: number;
  /** counterBattery.suppressedAtZeroFrac (absent: no counterBattery section). */
  suppressedAtZeroFrac?: number;
};

/**
 * fixtureWithDoctrineV3 (garrisons k1 at y 100 and k2 at y 300 on `ger-front-a`, y 0 to 400, so two segments
 * of 200 m) plus a bombardment: wire 20 m deep along the whole trench, heavy howitzers `h1`, a German field
 * battery `gb` (10 guns at [900, 200]) and the bombardment tables.
 */
export function fixtureBomb(o: BombOpts = {}): [Scenario, Models] {
  const [s, m] = fixtureWithDoctrineV3();
  s.artillery.push(
    { id: 'h1', side: 'allied', weapon: '6in-how', count: est(8), role: 'heavy', position: [-1500, 200], horseDrawn: false, ammunition: est(1000) },
    { id: 'gb', side: 'central', weapon: '18pdr', count: est(10), role: 'defensive', position: [900, 200], horseDrawn: true },
  );
  const alloc = (artilleryId: string, task: 'wire' | 'trench' | 'battery' | 'harass', rounds: number | undefined) =>
    rounds ? [{ artilleryId, task, rounds: est(rounds) }] : [];
  const spared = o.spared === true ? [{ yMin: 0, yMax: 400 }] : o.spared || [];
  s.bombardment = {
    from: { value: '1916-06-24T06:00', estimate: 'test fixture' },
    allocations: [
      ...alloc('g1', 'wire', o.wireRounds), ...alloc('g1', 'trench', o.trenchRounds), ...alloc('g1', 'harass', o.harassRounds),
      ...alloc('h1', 'trench', o.heavyRounds), ...alloc('h1', 'battery', o.batteryRounds),
    ],
    spared: spared.map((b) => ({ featureId: 'ger-front-a', ...b, reason: { value: 'spared', estimate: 'test fixture' } })),
    wire: [{ featureId: 'ger-front-a', yMin: 0, yMax: 400, beltDepthM: est(20) }],
  };
  if (o.suppressedAtZeroFrac !== undefined) s.counterBattery = { side: 'allied', suppressedAtZeroFrac: est(o.suppressedAtZeroFrac), note: 'test fixture' };
  if (o.depth !== undefined) for (const c of s.forces[1]!.formations[0]!.companies!) c.dugoutDepthM = est(o.depth);
  return [s, { ...m, tables: bombTables() }];
}

/** A bombarded fixture (trench rounds only) for whole runs. */
export const fixtureBombarded = (): [Scenario, Models] => fixtureBomb({ trenchRounds: 400, heavyRounds: 200 });

/** The state at Zero of a fixture: the bombardment has run. */
export const runBombardmentOn = (f: [Scenario, Models], seed = 1): SimState => initRun(f[0], f[1], { seed }).state;

/** The mean wire cut over a state's segments. */
export const wireCutOf = (state: SimState): number => state.segments.reduce((a, x) => a + x.wireCut, 0) / state.segments.length;
