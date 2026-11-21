import { decodeTerrain, ScenarioError, v } from '@wwi/scenario';
import type { Doctrine, Point, Scenario, Tables } from '@wwi/scenario';
import { barrageXAt, initBarrage } from './barrage';
import { noteArtilleryDefaults } from './artillery';
import { initBatteries, runBombardment } from './bombardment';
import { emit } from './causes';
import { initCompanies, isHolding } from './companies';
import { buildWorld } from './ground';
import { resolveDefaults } from './defaults';
import { noteLightDefaults } from './light';
import { sampleYs } from './geometry';
import { runPipeline } from './pipeline';
import { deriveSegments } from './segments';
import { quietStep } from './schedule';
import { createRng } from './rng';
import { COMPANY_COLUMNS, ENGINE_VERSION, round, SEGMENT_COLUMNS, SNAPSHOT_BUSY_MIN, SNAPSHOT_QUIET_MIN, tallyCasualties } from './record';
import type { RunRecord, Snapshot } from './record';
import { isBusy } from './step';
import type { SimState, StepContext } from './step';

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
  const rng = createRng(opts.seed);
  const terrain = scenario.terrainGrid ? decodeTerrain(scenario.terrainGrid) : undefined;
  const ctx: StepContext = {
    scenario,
    lines: new Map(scenario.lines.map((l) => [l.id, l.points])),
    doctrines: models.doctrines,
    tables: models.tables,
    rng,
    ...(terrain ? { terrain } : {}),
    world: buildWorld(scenario, models.tables, terrain),
    defaultsUsed: new Set(used),
  };
  noteLightDefaults(scenario, ctx.defaultsUsed);
  noteArtilleryDefaults(scenario, ctx.defaultsUsed);
  const segments = deriveSegments(scenario, models.tables, ctx.defaultsUsed);
  // A garrison's segment: the one whose garrisons it is among.
  const segmentOf = new Map(segments.flatMap((x) => x.garrisonIds.map((id) => [id, x.id] as const)));
  const state: SimState = {
    minute: 0,
    barrages: scenario.sectors.map(initBarrage),
    companies: initCompanies(scenario, models.doctrines, rng).map((c) => {
      const seg = segmentOf.get(c.id);
      return seg === undefined ? c : { ...c, segmentId: seg };
    }),
    taken: [],
    events: [],
    segments,
    batteries: initBatteries(scenario, ctx.defaultsUsed),
    hqs: [],
    messages: [],
    reserves: [],
    churn: ctx.world.churn,
    nextEventId: 0,
  };
  const atZero = emit(state, { minute: 0, kind: 'zero-hour', text: 'Zero hour' });
  return { state: runBombardment(atZero, ctx).state, ctx };
}

/** The quiet step: the smallest `common.quietStepMin` among the forces' doctrines. */
function quietStepMin(ctx: StepContext): number {
  const ids = [...new Set(ctx.scenario.forces.map((f) => f.doctrine))].sort();
  return Math.min(...ids.flatMap((id) => (ctx.doctrines[id] ? [v(ctx.doctrines[id].common.quietStepMin)] : [])));
}

function snapshot(state: SimState, ctx: StepContext): Snapshot {
  return {
    minute: state.minute,
    companies: {
      columns: [...COMPANY_COLUMNS],
      rows: state.companies.map((c) => [
        c.id,
        round(c.x),
        round(c.y),
        c.men,
        c.status,
        round(c.morale, 2),
        round(c.suppression, 2),
        c.posture,
        c.killed,
        c.wounded,
        c.captured,
        c.gapM === null ? null : round(c.gapM),
      ]),
    },
    segments: {
      columns: [...SEGMENT_COLUMNS],
      rows: state.segments.map((x, i) => [i, x.holder, round(x.wireCut, 2), x.emerged]),
    },
    barrages: state.barrages.map((b) => {
      const sector = ctx.scenario.sectors.find((x) => x.id === b.sectorId)!;
      return {
        sectorId: b.sectorId,
        done: b.phase === 'done',
        points: sampleYs(sector.yMin, sector.yMax).map(
          (y) => [round(barrageXAt(b, sector, ctx.lines, state.minute, y), 1), round(y, 1)] as Point,
        ),
      };
    }),
  };
}

export function runScenario(s: Scenario, models: Models, opts: RunOptions): RunRecord {
  const stepMin = opts.stepMin ?? 2;
  const endMinute = opts.endMinute ?? s.timeLimitMinutes;
  const stopEarly = opts.stopEarly ?? true;
  const init = initRun(s, models, opts);
  const { ctx } = init;
  let state = init.state;

  const events: RunRecord['events'] = [...state.events];
  const snapshots = [snapshot(state, ctx)];
  let lastSnapshot = 0;
  const quietMin = quietStepMin(ctx);
  let busy = isBusy(state, ctx);

  while (state.minute < endMinute) {
    // stepMin while busy; otherwise a quiet step, cut at whatever is scheduled next (schedule.ts).
    const dt = busy ? stepMin : quietStep(state, ctx, stepMin, quietMin);
    state = runPipeline(state, ctx, Math.min(dt, endMinute - state.minute));
    events.push(...state.events);
    busy = isBusy(state, ctx);
    const finished =
      stopEarly &&
      state.barrages.every((b) => b.phase === 'done') &&
      state.companies.every((c) => isHolding(c) || c.status === 'consolidating');
    const every = busy ? SNAPSHOT_BUSY_MIN : SNAPSHOT_QUIET_MIN;
    const due = opts.snapshotEveryStep || Math.floor(state.minute / every) > Math.floor(lastSnapshot / every);
    if (due || state.minute >= endMinute || finished) {
      snapshots.push(snapshot(state, ctx));
      lastSnapshot = state.minute;
    }
    if (finished) break;
  }

  const sc = ctx.scenario;
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
      sectors: sc.sectors.map((x) => ({ id: x.id, yMin: x.yMin, yMax: x.yMax })),
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
    },
    units: state.companies.map((c) => ({ id: c.id, battalionId: c.battalionId, name: c.name, side: c.side })),
    snapshots,
    events,
    summary: {
      lineTaken: events
        .filter((e) => e.kind === 'line-taken')
        .map((e) => ({ lineId: e.lineId!, sectorId: e.sectorId!, minute: e.minute })),
      casualties: {
        // Men lost before Zero are in each company's totals and counted here apart from the battle.
        bombardment: tallyCasualties(state.companies, (c) => ({ ...c.bombardment, captured: 0 })),
        battle: tallyCasualties(state.companies, (c) => ({
          killed: c.killed - c.bombardment.killed,
          wounded: c.wounded - c.bombardment.wounded,
          captured: c.captured,
        })),
      },
      // Men taken prisoner by each side: the other side's captured.
      prisoners: {
        allied: state.companies.filter((c) => c.side === 'central').reduce((a, c) => a + c.captured, 0),
        central: state.companies.filter((c) => c.side === 'allied').reduce((a, c) => a + c.captured, 0),
      },
      gunsCaptured: 0,
      endedAt: state.minute,
      endReason: null,
      winner: null,
      keyGround: [],
    },
    defaultsUsed: [...ctx.defaultsUsed].sort(),
  };
}
