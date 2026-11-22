import { decodeTerrain, minutesBetween, ScenarioError, v } from '@wwi/scenario';
import type { Doctrine, Point, Scenario, Tables } from '@wwi/scenario';
import { initBarrage, planReachX } from './barrage';
import { sampleYs } from './geometry';
import { noteArtilleryDefaults } from './artillery';
import { initBatteries, runBombardment } from './bombardment';
import { emit } from './causes';
import { initComms } from './comms';
import { initCompanies } from './companies';
import { buildWorld } from './ground';
import { resolveDefaults } from './defaults';
import { noteLightDefaults, utcOffsetOf } from './light';
import { withStartingMorale } from './morale';
import { runPipeline } from './pipeline';
import { deriveSegments } from './segments';
import { quietStep } from './schedule';
import { snapshotWriter } from './snapshots';
import { endCheck, endRun, lullMin } from './end';
import { summarize } from './summary';
import { createStreams } from './rng';
import { ENGINE_VERSION, round, SNAPSHOT_BUSY_MIN, SNAPSHOT_QUIET_MIN } from './record';
import { offMapAtZero } from './reserves';
import { initTanks } from './smaller';
import { insigniaOf } from './insignia';
import type { EndReason, RunRecord } from './record';
import { isBusy } from './step';
import type { SimState, StepContext } from './step';
import type { ReserveState } from './types';

/** What the model runs on besides the scenario: the doctrines its forces name, and the weapon and effect tables. */
export type Models = { doctrines: Record<string, Doctrine>; tables: Tables };

export type RunOptions = {
  seed: number;
  /** The fine step, in minutes (default 2); quiet stretches step by doctrine `common.quietStepMin`. */
  stepMin?: number;
  endMinute?: number;
  stopEarly?: boolean;
  /** Snapshot after every step instead of on the busy/quiet schedule (tests). */
  snapshotEveryStep?: boolean;
  /** Snapshots from one keyframe to the next (default KEYFRAME_EVERY; 1: every snapshot in full, tests). */
  keyframeEvery?: number;
};

const WEAPON_SLOTS = ['rifle', 'lightMg', 'mg'] as const;

/** Every weapon a force's doctrine names for its companies must be in the tables. */
function checkCompanyWeapons(s: Scenario, models: Models): void {
  const problems: string[] = [];
  for (const id of [...new Set(s.forces.map((f) => f.doctrine))].sort()) {
    const d = models.doctrines[id];
    if (!d) continue; // reported by initCompanies, as before
    for (const k of WEAPON_SLOTS) {
      const w = d.companyWeapons[k];
      if (!Object.hasOwn(models.tables.weapons, w)) problems.push(`doctrine ${id}: companyWeapons.${k} names weapon "${w}", which the tables do not hold`);
    }
  }
  if (problems.length) throw new ScenarioError(problems);
}

/**
 * The run's state at Zero and its step context: defaults resolved, companies placed, trench segments and
 * batteries set out, the zero-hour event emitted, and then the preliminary bombardment run (its losses taken
 * before Zero, its results emitted at minute 0).
 */
export function initRun(s: Scenario, models: Models, opts: Pick<RunOptions, 'seed'>): { state: SimState; ctx: StepContext } {
  checkCompanyWeapons(s, models);
  const { scenario, used } = resolveDefaults(s, models.doctrines, models.tables);
  const rngs = createStreams(opts.seed);
  const terrain = scenario.terrainGrid ? decodeTerrain(scenario.terrainGrid) : undefined;
  const ctx: StepContext = {
    scenario,
    lines: new Map(scenario.lines.map((l) => [l.id, l.points])),
    doctrines: models.doctrines,
    tables: models.tables,
    rngs,
    ...(terrain ? { terrain } : {}),
    world: buildWorld(scenario, models.tables, terrain),
    defaultsUsed: new Set(used),
  };
  noteLightDefaults(scenario, ctx.defaultsUsed);
  noteArtilleryDefaults(scenario, ctx.defaultsUsed);
  // The run's lull (end.ts): its default is recorded whether or not the run ever comes to one.
  lullMin(ctx);
  const segments = deriveSegments(scenario, models.tables, ctx.defaultsUsed);
  // A garrison's segment: the one whose garrisons it is among.
  const segmentOf = new Map(segments.flatMap((x) => x.garrisonIds.map((id) => [id, x.id] as const)));
  const state: SimState = {
    minute: 0,
    barrages: scenario.sectors.map(initBarrage),
    // The companies of off-map reserves wait off the map until they are ordered forward and arrive (reserves.ts).
    companies: offMapAtZero(withStartingMorale(initCompanies(scenario, models.doctrines, rngs.companies, ctx.defaultsUsed), ctx), scenario).map((c) => {
      const seg = segmentOf.get(c.id);
      return seg === undefined ? c : { ...c, segmentId: seg };
    }),
    taken: [],
    takenEventIds: {},
    events: [],
    segments,
    batteries: initBatteries(scenario, ctx.defaultsUsed),
    hqs: [],
    messages: [],
    nextMessageId: 0,
    cutLines: [],
    lastReport: new Map(),
    fireMissions: [],
    reserves: initReserves(scenario),
    tanks: initTanks(scenario),
    seen: new Map(),
    minesFired: [],
    command: { ordered: {}, stallCommits: {}, launched: {}, counterAttacks: {}, divisions: {}, offMap: {} },
    churn: ctx.world.churn,
    nextEventId: 0,
  };
  const atZero = emit(state, { minute: 0, kind: 'zero-hour', text: 'Zero hour' });
  // Headquarters start knowing their companies and the trenches as they stand once the bombardment is over (comms.ts).
  return { state: initComms(runBombardment(atZero, ctx).state, ctx), ctx };
}

/** The off-map reserves, waiting where the scenario puts them until a headquarters orders them forward (Tasks 12–13). */
function initReserves(s: Scenario): ReserveState[] {
  return s.reserves.map((r) => {
    if (!Array.isArray(r.entryPoint)) throw new Error(`Reserve ${r.formationId}: entryPoint was not projected to a local point`);
    return { formationId: r.formationId, side: r.side, status: 'waiting', orderedMin: null, arriveMin: null, entryPoint: [r.entryPoint[0], r.entryPoint[1]], orderedBy: null, orderedEventId: null, toSegmentId: null, onMapKm: 0, frontSegmentIds: [], starts: [], ends: [] };
  });
}

/** The quiet step: the smallest `common.quietStepMin` among the forces' doctrines. */
function quietStepMin(ctx: StepContext): number {
  const ids = [...new Set(ctx.scenario.forces.map((f) => f.doctrine))].sort();
  return Math.min(...ids.flatMap((id) => (ctx.doctrines[id] ? [v(ctx.doctrines[id].common.quietStepMin)] : [])));
}

export function runScenario(s: Scenario, models: Models, opts: RunOptions): RunRecord {
  const stepMin = opts.stepMin ?? 2;
  const endMinute = opts.endMinute ?? s.timeLimitMinutes;
  const stopEarly = opts.stopEarly ?? true;
  const init = initRun(s, models, opts);
  const { ctx } = init;
  let state = init.state;

  const events: RunRecord['events'] = [...state.events];
  const snapshot = snapshotWriter(ctx, opts.keyframeEvery);
  const snapshots = [snapshot(state)];
  let lastSnapshot = 0;
  const quietMin = quietStepMin(ctx);
  let busy = isBusy(state, ctx);

  // Contact-patrol messages as they are sent (each read off the queue once, by id), for the map's aircraft.
  const patrols: NonNullable<RunRecord['contactPatrols']> = [];
  const seenPatrols = new Set<number>();
  const notePatrols = (): void => {
    for (const m of state.messages) {
      if (m.channel !== 'contact-patrol' || seenPatrols.has(m.id)) continue;
      seenPatrols.add(m.id);
      patrols.push({ fromId: m.fromFormationId, side: m.side, sentMin: round(m.sentMin, 1), dueMin: round(m.dueMin, 1) });
    }
  };
  notePatrols();

  let reason: EndReason = 'time-cap';
  while (state.minute < endMinute) {
    // stepMin while busy; otherwise a quiet step, cut at whatever is scheduled next (schedule.ts).
    const dt = busy ? stepMin : quietStep(state, ctx, stepMin, quietMin);
    state = runPipeline(state, ctx, Math.min(dt, endMinute - state.minute));
    // The run's end (end.ts): its event is the last of the step's.
    const end = endCheck(state, ctx, { endMinute, stopEarly });
    if (end.ended) {
      reason = end.reason!;
      state = endRun(state, ctx, reason);
    }
    events.push(...state.events);
    notePatrols();
    busy = isBusy(state, ctx);
    const every = busy ? SNAPSHOT_BUSY_MIN : SNAPSHOT_QUIET_MIN;
    const due = opts.snapshotEveryStep || Math.floor(state.minute / every) > Math.floor(lastSnapshot / every);
    if (due || end.ended) {
      snapshots.push(snapshot(state));
      lastSnapshot = state.minute;
    }
    if (end.ended) break;
  }
  if (!events.some((e) => e.kind === 'run-ended')) {
    // A run with no step (endMinute 0) ends at once, at its cap.
    state = endRun({ ...state, events: [] }, ctx, reason);
    events.push(...state.events);
  }

  const sc = ctx.scenario;
  const insignia = insigniaOf(sc, state.companies, ctx.defaultsUsed);
  return {
    engineVersion: ENGINE_VERSION,
    scenarioId: sc.id,
    scenarioTitle: sc.title,
    scenarioStatus: sc.status,
    seed: opts.seed,
    zeroHour: v(sc.zeroHour),
    stepMin,
    endMinute: state.minute,
    geometry: {
      lines: sc.lines,
      sectors: sc.sectors.map((x) => ({
        id: x.id,
        yMin: x.yMin,
        yMax: x.yMax,
        reach: sampleYs(x.yMin, x.yMax).map((y): Point => [round(planReachX(x, ctx.lines, y), 1), round(y, 1)]),
      })),
      features: sc.features,
      ...(sc.terrainGrid ? { terrain: sc.terrainGrid } : {}),
      segments: state.segments.map((x) => ({
        id: x.id,
        featureId: x.featureId,
        garrisonIds: x.garrisonIds,
        yMin: round(x.yMin, 1),
        yMax: round(x.yMax, 1),
        lengthM: round(x.lengthM, 1),
      })),
      barrageDepthM: { band: v(ctx.tables.effects.barrageBandDepthM), mg: v(ctx.tables.effects.mgBarrageDepthM) },
      batteries: sc.artillery.flatMap((a) =>
        Array.isArray(a.position) ? [{ id: a.id, side: a.side, weapon: a.weapon, count: v(a.count), at: [a.position[0], a.position[1]] as Point }] : [],
      ),
    },
    conditions: conditionsOf(sc, ctx),
    // Task 15: each company's formations, battalion up, so the batch can set formations' casualties beside targets.
    units: state.companies.map((c) => {
      const colour = insignia.byUnit.get(c.id);
      return { id: c.id, battalionId: c.battalionId, name: c.name, side: c.side, formationPath: c.formationPath, ...(colour ? { insignia: colour } : {}) };
    }),
    divisions: insignia.divisions,
    ...(patrols.length > 0 ? { contactPatrols: patrols } : {}),
    snapshots,
    events,
    summary: summarize(state, ctx, events, reason),
    defaultsUsed: [...ctx.defaultsUsed].sort(),
  };
}

/** The weather by minute after Zero, and the sun's place and clock as `daylight` reads them (Task 18, for playback). */
function conditionsOf(sc: Scenario, ctx: StepContext): RunRecord['conditions'] {
  const zero = v(sc.zeroHour);
  return {
    sun: { lat: sc.frame?.origin.lat ?? 0, lon: sc.frame?.origin.lon ?? 0, utcOffsetMin: utcOffsetOf(sc), twilightMin: v(ctx.tables.effects.twilightMin) },
    weather: sc.weather.map((w) => ({
      minute: minutesBetween(zero, w.at),
      precipitation: v(w.precipitation),
      ...(w.windFromDeg ? { windFromDeg: v(w.windFromDeg) } : {}),
      ...(w.visibilityM ? { visibilityM: v(w.visibilityM) } : {}),
    })),
  };
}
