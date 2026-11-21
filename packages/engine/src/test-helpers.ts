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
import { initRun, runScenario } from './run';
import type { Models } from './run';
import type { SimState, StepContext } from './step';
import type { PhaseName } from './pipeline';
import { runPipeline } from './pipeline';

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

/**
 * A fixture doctrine v2 with usable step, contact and morale values (the minimal one sets every common value to 1):
 * the repository doctrines' starting values for morale, the NCO penalty and the training bonus, and ammunition
 * enough that no fixture runs out unless a test says so.
 */
function fixtureDoctrine(id: string): Doctrine {
  const d = minimalDoctrineV2(id);
  d.common = {
    ...d.common,
    baseMorale: param(0.8), closeRangeM: param(50), quietStepMin: param(10),
    goToGround: param(0.5), fallBack: param(0.35), surrender: param(0.15), pinSuppression: param(0.7),
    lossShock: param(1), suppressedDrain: param(0.3), isolationDrain: param(0.1), recoveryPerHour: param(0.2), leaderMoraleStep: param(0.03),
  };
  d.ncoPenalty = { rehearsed: param(0.1), standard: param(0.3) };
  d.companyDefaults = { ...d.companyDefaults, roundsPerRifle: param(1e6), roundsPerLightMg: param(1e6), roundsPerMg: param(1e6), bombsPerMan: param(2) };
  d.attack = { ...d.attack!, trainingBonusRehearsed: param(0.1), mopUpRateMenPerMin: param(3) };
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

/** Movement's and the fight for trenches' effect keys at the repository's starting values (tables/effects.yaml), for fixtures (Task 10). */
export const TRENCH_EFFECTS = {
  captureRatio: 3, sortieDelayMin: 30, gunCaptureRadiusM: 300, lineFeatureMatchM: 150, wireSpeedFactor: 0.5,
  suppressionSpeedLoss: 0.5, fatiguePerHourUnderFire: 0.1, bombsPerManCleared: 0.5,
};

/** Fixture tables with ground, mud, uphill, light, movement and trench-fighting values set. */
export function tablesWith(over: Record<string, number> = {}) {
  const t = fixtureTables();
  const set = { mudSpeedFactor: 0.6, uphillPenaltyPer10m: 0.02, trenchProximityM: 15, churnAreaPerShellM2: 30, crateredShare: 0.5, nightVisibilityM: 50, twilightMin: 35, ...TRENCH_EFFECTS, ...over };
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

// ---- artillery in battle (Task 8) -------------------------------------------------------------------------

/** The battle artillery's effect keys at the repository's starting values (tables/effects.yaml), for fixtures. */
export const ARTILLERY_EFFECTS = {
  barrageBandDepthM: 90, mgBarrageDepthM: 400, gapMultiplier: 2, densityRefMen: 30, suppressionHalfLifeMin: 5, captureRadiusM: 50,
  unobservedFireFactor: 0.3, observerRangeM: 1500, batteriesRecoveredFrac: 0.5, blockedExitFactor: 1,
};

export type ArtilleryOpts = {
  /** Every attacking company starts this many minutes late (default 0). */
  lagMin?: number;
  /** The attackers' doctrine followDistanceM (default 70) and maxAdvanceMPerMin (default 50). */
  followDistanceM?: number;
  speedMPerMin?: number;
  /** The attackers' start x (default 0). */
  startX?: number;
  /** Garrison doctrine emergeMin (default 3). */
  emergeMin?: number;
  /** Extra effect keys. */
  effects?: Record<string, number>;
  /** Whether companies fire their rifles and machine guns (default false: these fixtures measure the artillery). */
  directFire?: boolean;
};

/**
 * fixtureWithDoctrineV3 with real-sized effect values: assault companies c1 (y 100) and c2 (y 300) behind the
 * creeping battery g1 (18 18-pdrs); German garrisons k1 and k2 on `ger-front-a` (x 150), each 120 men, in two
 * segments of 200 m; de-1917 emergeMin 3 and trappedSurrenderFrac 0.5. The barrage lifts 91 m every 3 minutes
 * from x 150 to the Black Line (x 1150), then stands 180 m beyond it for 40 minutes. Its companies fire no small
 * arms unless `directFire` is set.
 */
export function fixtureArtillery(o: ArtilleryOpts = {}): [Scenario, Models] {
  const [s, m] = fixtureWithDoctrineV3();
  for (const c of s.forces[0]!.formations[0]!.companies!) {
    c.startAfterMin = est(o.lagMin ?? 0);
    if (o.startX !== undefined && Array.isArray(c.start)) c.start = [o.startX, c.start[1]];
  }
  const doctrines = structuredClone(m.doctrines);
  const bef = doctrines['bef-1917']!;
  bef.attack!.followDistanceM = { ...bef.attack!.followDistanceM, value: o.followDistanceM ?? 70 };
  bef.attack!.maxAdvanceMPerMin = { ...bef.attack!.maxAdvanceMPerMin, value: o.speedMPerMin ?? 50 };
  for (const d of Object.values(doctrines)) {
    d.defence!.emergeMin = { ...d.defence!.emergeMin, value: o.emergeMin ?? 3 };
    d.defence!.trappedSurrenderFrac = { ...d.defence!.trappedSurrenderFrac, value: 0.5 };
  }
  const tables = bombTables({ ...ARTILLERY_EFFECTS, ...o.effects });
  if (!o.directFire) for (const w of ['rifle', 'lewis', 'vickers']) tables.weapons[w] = { ...tables.weapons[w]!, rpm: param(0) };
  return [s, { doctrines, tables }];
}

/** Add a German trench at x with one garrison company `id` (120 men) at its middle, y 0 to 400. */
export function withRearTrench(f: [Scenario, Models], x: number, id = 'k3'): [Scenario, Models] {
  const [s, m] = f;
  s.features.push({ id: `ger-rear-${id}`, kind: 'trench', side: 'central', geometry: { type: 'LineString', coordinates: [[x, 0], [x, 400]] }, cite });
  s.forces[1]!.formations[0]!.companies!.push({ id, name: `Rear garrison ${id}`, role: 'garrison', strength: est(120), start: [x, 200], trenchFeatureId: `ger-rear-${id}` });
  return [s, m];
}

/** Add a holding allied reserve company `res` (150 men) at (x, y). */
export function withReserve(f: [Scenario, Models], x: number, y = 200): [Scenario, Models] {
  f[0].forces[0]!.formations[0]!.companies!.push({ id: 'res', name: 'Reserve Company', role: 'reserve', strength: est(150), start: [x, y] });
  return f;
}

/** Add an allied front trench line at x (y 0 to 400), so the fixture has a no man's land between it and gfront (x 150). */
export function withAlliedFront(f: [Scenario, Models], x = -100): [Scenario, Models] {
  f[0].lines.unshift({ id: 'afront', name: 'Allied front line', kind: 'trench', side: 'allied', points: [[x, 0], [x, 400]] });
  return f;
}

/** Events of a kind. */
export const ofKind = (r: RunRecord, kind: RunRecord['events'][number]['kind']) => r.events.filter((e) => e.kind === kind);

// ---- direct fire, morale and officers (Task 9) ---------------------------------------------------------------

/** The direct fire's and morale's effect keys at the repository's starting values (tables/effects.yaml), for fixtures. */
export const FIRE_EFFECTS = {
  maxTargetsPerFirer: 2, crewPerLewis: 2, crewPerMg: 4, officerExposure: 1.5, killedFrac: 0.25,
  isolationRadiusM: 300, mgUnobservedBelow: 0.2, fireRefsMin: 10,
};

/** The repository's cover table (tables/cover.yaml), for fixtures whose cover matters. */
export const COVER: Record<string, Record<string, number>> = {
  moving: { open: 1, cratered: 0.8, wood: 0.6, village: 0.6, trench: 0.5 },
  prone: { open: 0.4, cratered: 0.25, wood: 0.3, village: 0.25, trench: 0.2 },
  'in-trench': { open: 0.2, cratered: 0.2, wood: 0.15, village: 0.15, trench: 0.15 },
  'in-dugout': { open: 0.02, cratered: 0.02, wood: 0.02, village: 0.02, trench: 0.02 },
};

export type FireOpts = {
  /** Machine guns of each German garrison company (default 1). */
  mgs?: number;
  /**
   * A ridge 30 m high across the whole front at x 0, between the attackers and the garrisons; the attackers then
   * wait behind it (they start 100 minutes late unless lagMin says otherwise).
   */
  ridgeBetween?: boolean;
  /** The attackers' start x (default -400) and how late they start (default 6 minutes, after the garrisons are up). */
  startX?: number;
  lagMin?: number;
  /** Extra effect keys. */
  effects?: Record<string, number>;
};

/**
 * fixtureArtillery with no artillery at all and with small arms: the German garrisons k1 (y 100) and k2 (y 300) on
 * `ger-front-a` (x 150) come up at minute 4 (no barrage keeps them down), and the assault companies c1 and c2 start
 * at x -400 six minutes after Zero and walk at them behind the (gunless) barrage timetable. Cover is the
 * repository's table; daylight (Zero 07:30 at the frame's default place).
 */
export function fixtureFire(o: FireOpts = {}): [Scenario, Models] {
  const lagMin = o.lagMin ?? (o.ridgeBetween ? 100 : 6);
  const [s, m] = fixtureArtillery({ directFire: true, startX: o.startX ?? -400, lagMin, effects: { ...FIRE_EFFECTS, ...o.effects } });
  s.artillery = [];
  for (const c of s.forces[1]!.formations[0]!.companies!) c.machineGuns = est(o.mgs ?? 1);
  for (const [p, row] of Object.entries(COVER)) for (const [g, value] of Object.entries(row)) (m.tables.cover as Record<string, Record<string, unknown>>)[p]![g] = param(value);
  if (o.ridgeBetween) {
    const cellM = 25;
    const originX = -1000;
    const originY = -200;
    const cols = 121; // -1000 to 2000 m
    const rows = 33; // -200 to 600 m
    const elev = new Float32Array(cols * rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) elev[j * cols + i] = Math.abs(originX + i * cellM) <= 50 ? 30 : 0;
    s.terrainGrid = encodeTerrain({ cellM, originX, originY, cols, rows, elevM: elev });
  }
  return [s, m];
}

/** Allied casualties (killed and wounded in the battle) in each seed's run of fixtureFire, up to `endMinute` (default 40). */
export function attackerLosses(o: FireOpts & { seeds?: number[]; endMinute?: number } = {}): number[] {
  const seeds = o.seeds ?? Array.from({ length: 50 }, (_, i) => i + 1);
  return seeds.map((seed) => {
    const f = fixtureFire(o);
    const r = runScenario(f[0], f[1], { seed, endMinute: o.endMinute ?? 40 });
    return r.summary.casualties.battle.allied.killed + r.summary.casualties.battle.allied.wounded;
  });
}

export const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[(n - 1) / 2]! : (s[n / 2 - 1]! + s[n / 2]!) / 2;
};

/**
 * Two fights 1,600 m apart on one front (beyond every fixture weapon's 1,000 m): A Company (150 men, y 100) walks at
 * 1. Kompanie (120 men with 12 machine guns); B Company (300 men, y 1700) closes to 30 m of a weak 2. Kompanie (25
 * men, no machine guns) on its own trench, its objective line just past it, and stays there.
 */
export function fixtureCrush(): [Scenario, Models] {
  const [s, m] = fixtureFire();
  s.sectors[0]!.yMax = 2000;
  for (const l of s.lines) l.points = [[l.points[0]![0], 0], [l.points[0]![0], 2000]];
  s.lines.push({ id: 'near', name: 'Near Line', kind: 'objective', color: '#777777', points: [[180, 1400], [180, 2000]] });
  s.features.push({ id: 'ger-front-b', kind: 'trench', side: 'central', geometry: { type: 'LineString', coordinates: [[150, 1500], [150, 1900]] }, cite });
  const [k1, k2] = s.forces[1]!.formations[0]!.companies!;
  Object.assign(k1!, { machineGuns: est(12) });
  Object.assign(k2!, { strength: est(25), machineGuns: est(0), lewisGuns: est(0), start: [150, 1700], trenchFeatureId: 'ger-front-b' });
  const c2 = s.forces[0]!.formations[0]!.companies!.find((c) => c.id === 'c2')!;
  Object.assign(c2, { strength: est(300), start: [-400, 1700], objectiveLineId: 'near' });
  return [s, m];
}

export const runCrush = (seed = 1): RunRecord => runScenario(...fixtureCrush(), { seed, endMinute: 90 });

// ---- movement and the fight for trenches (Task 10) ------------------------------------------------------------

/**
 * The minute c1 of fixtureArtillery (starting 30 minutes late, so the barrage never holds it back) reaches the Black
 * Line, with a wire belt `beltDepthM` deep (default 200: x -50 to 150), cut by `wireCut`, in front of both segments of
 * `ger-front-a`.
 */
export function timeToObjective(o: { wireCut: number; beltDepthM?: number }): number {
  const f = fixtureArtillery({ lagMin: 30 });
  const { state, ctx } = initRun(f[0], f[1], { seed: 1 });
  let s: SimState = { ...state, segments: state.segments.map((x) => ({ ...x, wireBeltDepthM: o.beltDepthM ?? 200, wireCut: o.wireCut })) };
  while (s.minute < 300) {
    s = runPipeline(s, ctx, 2);
    const e = s.events.find((x) => x.kind === 'company-reached' && x.unitId === 'c1');
    if (e) return e.minute;
  }
  return Infinity;
}

/**
 * fixtureArtillery with a Blue Line at x 600 and a Brown Line only 30 m beyond it (the barrage stands 180 m beyond
 * each, 110 m past the follow distance): legs gfront → blue (pause 30) → brown; c1 aims at brown, c2 at blue.
 */
export function runBrownCloseToBlue(): RunRecord {
  const [s, m] = fixtureArtillery();
  s.lines = [
    s.lines[0]!,
    { id: 'blue', name: 'Blue Line', kind: 'objective', color: '#2255cc', points: [[600, 0], [600, 400]] },
    { id: 'brown', name: 'Brown Line', kind: 'objective', color: '#885522', points: [[630, 0], [630, 400]] },
  ];
  s.sectors[0]!.legs = [
    { toLineId: 'blue', liftM: est(91), liftMin: est(3), pauseMin: est(30) },
    { toLineId: 'brown', liftM: est(91), liftMin: est(3), pauseMin: est(30) },
  ];
  const [c1, c2] = s.forces[0]!.formations[0]!.companies!;
  c1!.objectiveLineId = 'brown';
  c2!.objectiveLineId = 'blue';
  s.historical.objectives = [];
  return runScenario(s, m, { seed: 1, endMinute: 150 });
}

/** The first minute a company reaches the line. */
export const reachedMinute = (r: RunRecord, lineId: string): number => Math.min(...ofKind(r, 'company-reached').filter((e) => e.lineId === lineId).map((e) => e.minute));
/** The minute the barrage resumes toward the line. */
export const barrageResumeMinute = (r: RunRecord, lineId: string): number => ofKind(r, 'barrage-resume').find((e) => e.lineId === lineId)!.minute;

/**
 * fixtureArtillery (c1 and c2 trap the garrisons k1 and k2, leaving about 60 men of each in the dugouts at x 150, and
 * take the Black Line at minute 32, so that trench is behind a taken line), and:
 * - with `mopUp` two mopping-up companies m1 (y 100) and m2 (y 300), 100 men each, following 4 minutes behind;
 * - with `holders` a holding company `res` of that many men on the trench at (150, 200), 100 m from both dugouts (so it
 *   does not guard them) but holding both segments (within lineFeatureMatchM).
 */
export function fixtureDugouts(o: { mopUp: boolean; holders?: number }): [Scenario, Models] {
  const f = fixtureArtillery();
  if (o.holders !== undefined) {
    withReserve(f, 150, 200);
    f[0].forces[0]!.formations[0]!.companies!.find((c) => c.id === 'res')!.strength = est(o.holders);
  }
  if (o.mopUp)
    f[0].forces[0]!.formations[0]!.companies!.push(
      ...[100, 300].map((y, i) => ({
        id: `m${i + 1}`, name: `Moppers ${i + 1}`, role: 'mopup' as const, strength: est(100), start: [0, y] as [number, number],
        sectorId: 's1', objectiveLineId: 'black', startAfterMin: est(4),
      })),
    );
  return f;
}
export const runDugouts = (o: { mopUp: boolean; holders?: number }, seed = 1): RunRecord => runScenario(...fixtureDugouts(o), { seed, endMinute: 120 });

/**
 * fixtureArtillery with the attackers 30 minutes late and a German trench on the Black Line itself (x 1150) held by
 * k3, up and manning it before they arrive: 400 men (a holdout: 300 attackers do not outnumber them 3 to 1) or 20.
 */
export function runHoldout(o: { holdout: boolean }): RunRecord {
  const f = withRearTrench(fixtureArtillery({ lagMin: 30 }), 1150, 'k3');
  f[0].forces[1]!.formations[0]!.companies!.find((c) => c.id === 'k3')!.strength = est(o.holdout ? 400 : 20);
  return runScenario(...f, { seed: 1, endMinute: 150 });
}

/** The minute of the first line taken, or null. */
export const lineTakenMinute = (r: RunRecord): number | null => r.summary.lineTaken[0]?.minute ?? null;

/**
 * fixtureArtillery (the garrisons on `ger-front-a` trapped and their segments taken) with a German battery of 6 guns
 * 250 m behind that trench. `horsesLost` stands in for Task 14's gassed horses: the battery has none to pull its guns
 * away (horseDrawn false); otherwise it is horse-drawn and gets away.
 */
export function runOverrun(o: { horsesLost: boolean }): RunRecord {
  const [s, m] = fixtureArtillery();
  s.artillery.push({ id: 'gb', side: 'central', weapon: '18pdr', count: est(6), role: 'defensive', position: [400, 200], horseDrawn: !o.horsesLost });
  return runScenario(s, m, { seed: 1, endMinute: 120 });
}

// ---- communications (Task 11) -------------------------------------------------------------------------------------

export type CommsOpts = {
  /** Every link of the allied chain by runner, or by buried cable (the company's own report still goes by runner). */
  links?: 'runners' | 'buried-cable' | 'none';
  /** The runner's failPerHour (default 0). */
  failPerHour?: number;
  /** The orderSpeed of the leader of every allied headquarters (default: no leader). */
  orderSpeed?: number;
  /** Extra effect keys (runnerMinPerKm defaults to 0 here). */
  effects?: Record<string, number>;
};

/**
 * fixtureWithDoctrineV3 with the allied battalion bn1 (companies c1 and c2) under brigade `b1`, division `d1` and corps
 * `cc`, linked up and down by one channel; channels: runner 30 min, buried cable 5, every other 10, none failing unless
 * `failPerHour` (runner). Every company fires no small arms, so nothing but the plan changes their status.
 */
export function fixtureComms(o: CommsOpts = {}): [Scenario, Models] {
  const [s, m] = fixtureWithDoctrineV3();
  const force = s.forces[0]!;
  const bn = force.formations[0]!;
  const lead = o.orderSpeed === undefined ? {} : { leaderId: 'gen' };
  force.formations = [
    { id: 'cc', name: 'Corps', kind: 'corps', ...lead, children: [{ id: 'd1', name: '1st Division', kind: 'division', ...lead, children: [{ id: 'b1', name: '1st Brigade', kind: 'brigade', ...lead, children: [bn] }] }] },
  ];
  if (o.orderSpeed !== undefined) {
    const r = est(o.orderSpeed);
    s.leaders.push({ id: 'gen', name: { value: 'A. General', estimate: 'test' }, rank: { value: 'General', estimate: 'test' }, ratings: { planning: est(3), orderSpeed: r, adaptiveness: est(3), riskTolerance: est(3), moraleEffect: est(3) } });
  }
  if (o.links !== 'none') {
    const ch = o.links === 'buried-cable' ? (['buried-cable'] as const) : (['runner'] as const);
    const pairs: Array<[FormationKindT, FormationKindT]> = [['battalion', 'brigade'], ['brigade', 'division'], ['division', 'corps']];
    s.communications = {
      links: pairs.flatMap(([a, b]) => [
        { side: 'allied' as const, from: a, to: b, channels: [...ch] },
        { side: 'allied' as const, from: b, to: a, channels: [...ch] },
      ]),
    };
  }
  const tables = structuredClone(m.tables);
  for (const k of Object.keys(tables.channels) as Array<keyof Tables['channels']>) tables.channels[k] = { delayMin: param(10), failPerHour: param(0) };
  tables.channels.runner = { delayMin: param(30), failPerHour: param(o.failPerHour ?? 0) };
  tables.channels['buried-cable'] = { delayMin: param(5), failPerHour: param(0) };
  for (const [k, value] of Object.entries({ runnerMinPerKm: 0, callForFireMin: 10, callForFireGuns: 6, observerRangeM: 1500, captureRadiusM: 50, ...o.effects }))
    (tables.effects as Record<string, unknown>)[k] = param(value);
  for (const w of ['rifle', 'lewis', 'vickers']) tables.weapons[w] = { ...tables.weapons[w]!, rpm: param(0) };
  return [s, { ...m, tables }];
}
type FormationKindT = Scenario['forces'][number]['formations'][number]['kind'];

/** A run stepped by hand (initRun, then runPipeline every `stepMin`), keeping every state. */
export function runStates(f: [Scenario, Models], o: { seed?: number; endMinute?: number; stepMin?: number; at?: (s: SimState, ctx: StepContext) => SimState } = {}): { states: SimState[]; ctx: StepContext } {
  const { state, ctx } = initRun(f[0], f[1], { seed: o.seed ?? 1 });
  let s = o.at ? o.at(state, ctx) : state;
  const states = [s];
  while (s.minute < (o.endMinute ?? 120)) states.push((s = runPipeline(s, ctx, o.stepMin ?? 2)));
  return { states, ctx };
}
