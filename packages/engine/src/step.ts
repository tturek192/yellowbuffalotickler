import { v } from '@wwi/scenario';
import type { Doctrine, Point, Scenario, Tables, Terrain } from '@wwi/scenario';
import type { World } from './ground';
import type { BarrageState } from './barrage';
import { CAUSES, emit } from './causes';
import type { Cause } from './causes';
import { anyWithin, bucketsOf } from './buckets';
import { isHolding } from './companies';
import type { CompanyState, CompanyStatus } from './companies';
import type { PhaseName } from './pipeline';
import { segmentsOnLine, takerOf } from './trenches';
import type { BatteryState, CommandState, CutLine, FireMission, HqState, Message, ReserveState, SegmentState, Side, SimEvent } from './types';

export type SimState = {
  minute: number;
  barrages: BarrageState[];
  /** In ascending id order, always. */
  companies: CompanyState[];
  /** "lineId|sectorId" keys of lines already taken. */
  taken: string[];
  /** The `line-taken` event of each line in `taken`, by key (Task 12: a `line-lost` refers to it). Looked up only. */
  takenEventIds: Record<string, number>;
  /** Events emitted by the most recent step, in order. */
  events: SimEvent[];
  /** Trench segments (Task 7). */
  segments: SegmentState[];
  /** Batteries (Tasks 7–8). */
  batteries: BatteryState[];
  /** Headquarters and what each knows (Tasks 11–12). */
  hqs: HqState[];
  /** Messages in transit (Task 11), in (dueMin, id) order. */
  messages: Message[];
  /** The id the next message gets (Task 11). */
  nextMessageId: number;
  /** Surface lines cut, by shelling along them or by a failure draw, in pair order (Task 11); each noted once. */
  cutLines: CutLine[];
  /**
   * What each company last reported (Task 11): its status, men, the holder of its own segment (null: none) and the
   * minute it reported. Looked up only.
   */
  lastReport: Record<string, { status: CompanyStatus; men: number; holder: Side | null; atMin: number }>;
  /** Batteries answering calls for fire (Task 11), in id order. */
  fireMissions: FireMission[];
  /** Off-map formations (Task 13), in the scenario's order. */
  reserves: ReserveState[];
  /** What the command model has decided (Task 12). */
  command: CommandState;
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
    if (anyWithin(enemies[a.side], a.x, a.y, r)) return true;
  }
  return false;
}

/** Statuses of companies on the move. */
const MOVING: ReadonlySet<string> = new Set(['advancing', 'falling-back', 'counter-attacking']);

/**
 * Busy: something is happening that needs the fine step and close snapshots — contact, a barrage
 * lifting, a company on the move, fire coming in on a company this step, a company pinned (whose
 * recovery sets it moving again), or men coming up out of their dugouts this step (whose fire starts
 * next step). Otherwise the battle is quiet.
 */
export function isBusy(state: SimState, ctx: StepContext): boolean {
  return (
    state.barrages.some((b) => b.phase === 'lifting') ||
    state.companies.some((c) => MOVING.has(c.status) || c.status === 'pinned' || c.recentFire.some((f) => f.minute === state.minute)) ||
    state.events.some((e) => e.kind === 'dugout-sortie') ||
    inContact(state, ctx)
  );
}

/** A company aimed at its objective line for the line-taken rule: an attacker (not a garrison, nor a reserve still held back) with an objective. */
const aimsAtLine = (c: CompanyState): boolean =>
  c.objectiveLineId !== undefined && c.role !== 'garrison' && !isHolding(c) && c.status !== 'marching' && c.status !== 'off-map';

/** Statuses of an attacking company that leave its line free to be taken: there, or out of the attack. */
const SETTLED: ReadonlySet<string> = new Set(['consolidating', 'pinned', 'destroyed', 'surrendered']);

/**
 * The line-taken rule (the log phase). A line is taken in a sector when:
 * - every attacking company aimed at it there is consolidating, pinned, destroyed or surrendered, and at least one
 *   is consolidating; and
 * - its side holds every trench segment the line runs along in the sector (`segmentsOnLine`: within
 *   `lineFeatureMatchM`), so a segment still held by its defenders keeps the line from being taken.
 * Its causes come from what happened: the arrivals' causes (`followed-barrage`, or `barrage-moved-on` for a company
 * that had lost its barrage), `defenders-trapped` when a garrison of one of those segments was caught in its
 * dugouts, and `wire-cut` when the wire in front of one of them was cut (at least `wireUncutBelow`). Refs: the
 * arrivals, and the segments' trapping and loss.
 */
export function takeLines(state0: SimState, ctx: StepContext): SimState {
  const state = loseLines(state0, ctx);
  const groups = new Map<string, CompanyState[]>();
  for (const c of state.companies) {
    if (!aimsAtLine(c)) continue;
    const key = `${c.objectiveLineId}|${c.sectorId}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  const uncutBelow = v(ctx.tables.effects.wireUncutBelow);
  let out = state;
  for (const key of [...groups.keys()].sort()) {
    const cs = groups.get(key)!;
    if (out.taken.includes(key) || !cs.every((c) => SETTLED.has(c.status)) || !cs.some((c) => c.status === 'consolidating')) continue;
    const [lineId, sectorId] = key.split('|') as [string, string];
    const side = cs[0]!.side;
    const segs = segmentsOnLine(out, ctx, lineId, sectorId);
    if (!segs.every((x) => x.holder === side)) continue;
    const line = ctx.scenario.lines.find((l) => l.id === lineId)!;
    const there = cs.filter((c) => c.status === 'consolidating');
    const causes: Cause[] = there.flatMap((c) => c.reached?.causes ?? []);
    if (segs.some((x) => x.trapped)) causes.push('defenders-trapped');
    if (segs.some((x) => x.wireBeltDepthM > 0 && x.wireCut >= uncutBelow)) causes.push('wire-cut');
    if (causes.length === 0) causes.push('followed-barrage');
    const refs = [
      ...there.flatMap((c) => (c.reached ? [c.reached.eventId] : [])),
      ...segs.flatMap((x) => [x.trappedEventId, x.holderEventId].filter((id): id is number => id !== null)),
    ];
    out = emit({ ...out, taken: [...out.taken, key], takenEventIds: { ...out.takenEventIds, [key]: out.nextEventId } }, {
      minute: out.minute,
      kind: 'line-taken',
      sectorId,
      lineId,
      text: `${line.name} taken`,
      causes: CAUSES.filter((x) => causes.includes(x)),
      refs: refs.filter((x, i) => refs.indexOf(x) === i).sort((a, b) => a - b),
      factors: { companies: cs.length, consolidating: there.length, segments: segs.length },
    });
  }
  return out;
}

/**
 * A taken line is lost again (Task 10 ruling, Task 12) when its taker no longer holds every segment that made it taken
 * (`segmentsOnLine`): it leaves `taken`, so the line-taken rule can take it again once those segments are back, and
 * `line-lost` (cause `ground-lost`) refers to its `line-taken` and to the events that took the segments back. A line
 * that runs along no segment is never lost this way.
 */
export function loseLines(state: SimState, ctx: StepContext): SimState {
  let out = state;
  for (const key of state.taken) {
    const [lineId, sectorId] = key.split('|') as [string, string];
    const side = takerOf(state, key);
    const gone = segmentsOnLine(out, ctx, lineId, sectorId).filter((x) => x.holder !== side);
    if (side === null || gone.length === 0) continue;
    const line = ctx.scenario.lines.find((l) => l.id === lineId)!;
    const takenId = out.takenEventIds[key];
    const refs = [...(takenId === undefined ? [] : [takenId]), ...gone.flatMap((x) => (x.holderEventId === null ? [] : [x.holderEventId]))];
    const { [key]: _gone, ...takenEventIds } = out.takenEventIds;
    out = emit({ ...out, taken: out.taken.filter((k) => k !== key), takenEventIds }, {
      minute: out.minute,
      kind: 'line-lost',
      sectorId,
      lineId,
      text: `${line.name} lost: ${gone.map((x) => x.id).join(', ')} taken back`,
      causes: ['ground-lost'],
      refs: refs.filter((x, i) => refs.indexOf(x) === i).sort((a, b) => a - b),
      factors: { segments: gone.length },
    });
  }
  return out;
}
