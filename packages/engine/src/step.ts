import { v } from '@wwi/scenario';
import type { Doctrine, Point, Scenario, Tables, Terrain } from '@wwi/scenario';
import type { World } from './ground';
import type { BarrageState } from './barrage';
import { emit } from './causes';
import { bucketsOf, within } from './buckets';
import { byId, isHolding } from './companies';
import type { CompanyState } from './companies';
import type { PhaseName } from './pipeline';
import type { BatteryState, HqState, Message, ReserveState, SegmentState, Side, SimEvent } from './types';

export type SimState = {
  minute: number;
  barrages: BarrageState[];
  /** In ascending id order, always. */
  companies: CompanyState[];
  /** "lineId|sectorId" keys of lines already taken. */
  taken: string[];
  /** Events emitted by the most recent step, in order. */
  events: SimEvent[];
  /** Trench segments (Task 7). */
  segments: SegmentState[];
  /** Batteries (Tasks 7–8). */
  batteries: BatteryState[];
  /** Headquarters and what each knows (Tasks 11–12). */
  hqs: HqState[];
  /** Messages in transit (Task 11). */
  messages: Message[];
  /** Off-map formations (Task 13). */
  reserves: ReserveState[];
  /** Shells landed per 50 m cell (Task 6), row-major over the world's grid; the same array as `World.churn`. Not in the run record. */
  churn: Float32Array;
  /** The id the next emitted event gets. */
  nextEventId: number;
  /** Each side's last `batteries-recovered` event, for the refs of the defensive fire after it (Task 8). */
  batteriesRecoveredEventId?: Partial<Record<Side, number>>;
};

export type StepContext = {
  /** The scenario with its defaults resolved. */
  scenario: Scenario;
  lines: Map<string, Point[]>;
  doctrines: Record<string, Doctrine>;
  tables: Tables;
  /** The run's only source of randomness: createRng(seed), drawn in a fixed order. */
  rng: () => number;
  terrain?: Terrain;
  /** Ground, sight and light for the run (Task 6). */
  world: World;
  /** Defaults applied, at setup and during the run; the record lists them sorted. */
  defaultsUsed: Set<string>;
  /** Called with each phase's name before it runs (tests and profiling). */
  onPhase?: (name: PhaseName) => void;
};

/** Statuses of companies that are not on the field as a fighting body. */
const GONE: ReadonlySet<string> = new Set(['surrendered', 'destroyed', 'off-map', 'marching']);
/** On the field as a fighting body: men standing, and not surrendered, destroyed, off the map or marching. */
export const onField = (c: CompanyState): boolean => c.men > 0 && !GONE.has(c.status);

/**
 * Contact, the one definition every task extends: some attacking company (any that is not holding) is
 * within its doctrine's `closeRangeM` of an enemy company on the field.
 */
export function inContact(state: SimState, ctx: StepContext): boolean {
  const field = state.companies.filter(onField);
  // Each side's enemies, in buckets (buckets.ts), so contact never looks at every pair.
  const enemies = { allied: bucketsOf(field.filter((c) => c.side === 'central')), central: bucketsOf(field.filter((c) => c.side === 'allied')) };
  for (const a of field) {
    if (isHolding(a)) continue;
    const r = v(ctx.doctrines[a.doctrineId]!.common.closeRangeM);
    if (within(enemies[a.side], a.x, a.y, r, byId).length > 0) return true;
  }
  return false;
}

/** Statuses of companies on the move. */
const MOVING: ReadonlySet<string> = new Set(['advancing', 'falling-back', 'counter-attacking']);

/**
 * Busy: something is happening that needs the fine step and close snapshots — contact, a barrage
 * lifting, a company on the move, fire coming in on a company this step, or a company pinned (whose
 * recovery sets it moving again). Otherwise the battle is quiet.
 */
export function isBusy(state: SimState, ctx: StepContext): boolean {
  return (
    state.barrages.some((b) => b.phase === 'lifting') ||
    state.companies.some((c) => MOVING.has(c.status) || c.status === 'pinned' || c.recentFire.some((f) => f.minute === state.minute)) ||
    inContact(state, ctx)
  );
}

/**
 * The line-taken check (the log phase): a line is taken in a sector once every attacking company aimed
 * at it is consolidating. The event refers to the arrivals of this step that completed it.
 */
export function takeLines(state: SimState, ctx: StepContext): SimState {
  const groups = new Map<string, CompanyState[]>();
  for (const c of state.companies) {
    // Garrisons and reserves (and a garrison that has given up, which no longer holds) aim at no line.
    if (isHolding(c) || c.objectiveLineId === undefined) continue;
    const key = `${c.objectiveLineId}|${c.sectorId}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  let out = state;
  for (const key of [...groups.keys()].sort()) {
    const cs = groups.get(key)!;
    if (out.taken.includes(key) || !cs.every((c) => c.status === 'consolidating')) continue;
    const [lineId, sectorId] = key.split('|') as [string, string];
    const line = ctx.scenario.lines.find((l) => l.id === lineId)!;
    const ids = new Set(cs.map((c) => c.id));
    const refs = out.events.filter((e) => e.kind === 'company-reached' && e.unitId !== undefined && ids.has(e.unitId)).map((e) => e.id);
    out = emit({ ...out, taken: [...out.taken, key] }, {
      minute: out.minute,
      kind: 'line-taken',
      sectorId,
      lineId,
      text: `${line.name} taken`,
      causes: ['followed-barrage'],
      refs,
    });
  }
  return out;
}
