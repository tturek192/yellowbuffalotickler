import { decodeTerrain, ScenarioError, v } from '@wwi/scenario';
import type { Doctrine, Point, Scenario, Tables } from '@wwi/scenario';
import { barrageXAt, initBarrage } from './barrage';
import { emit } from './causes';
import { initCompanies, isHolding } from './companies';
import { buildWorld } from './ground';
import { resolveDefaults } from './defaults';
import { sampleYs } from './geometry';
import { runPipeline } from './pipeline';
import { quietStep } from './schedule';
import { createRng } from './rng';
import { ENGINE_VERSION, round, SNAPSHOT_BUSY_MIN, SNAPSHOT_QUIET_MIN, tallyCasualties } from './record';
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

/** The run's state at Zero and its step context: defaults resolved, companies placed, the zero-hour event emitted. */
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
  const state: SimState = {
    minute: 0,
    barrages: scenario.sectors.map(initBarrage),
    companies: initCompanies(scenario, models.doctrines, rng),
    taken: [],
    events: [],
    segments: [],
    batteries: [],
    hqs: [],
    messages: [],
    reserves: [],
    churn: ctx.world.churn,
    nextEventId: 0,
  };
  return { state: emit(state, { minute: 0, kind: 'zero-hour', text: 'Zero hour' }), ctx };
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
      columns: ['id', 'x', 'y', 'men', 'status', 'morale', 'suppression', 'posture', 'killed', 'wounded', 'captured'],
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
      ]),
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
    },
    units: state.companies.map((c) => ({ id: c.id, battalionId: c.battalionId, name: c.name, side: c.side })),
    snapshots,
    events,
    summary: {
      lineTaken: events
        .filter((e) => e.kind === 'line-taken')
        .map((e) => ({ lineId: e.lineId!, sectorId: e.sectorId!, minute: e.minute })),
      casualties: {
        // No preliminary bombardment is simulated yet (Task 7): its period counts nobody.
        bombardment: tallyCasualties(state.companies, () => ({ killed: 0, wounded: 0, captured: 0 })),
        battle: tallyCasualties(state.companies, (c) => c),
      },
      prisoners: { allied: 0, central: 0 },
      gunsCaptured: 0,
      endedAt: state.minute,
      endReason: null,
      winner: null,
      keyGround: [],
    },
    defaultsUsed: [...ctx.defaultsUsed].sort(),
  };
}
