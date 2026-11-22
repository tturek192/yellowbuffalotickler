import { v } from '@wwi/scenario';
import type { Doctrine, Point, Scenario, Tables, Terrain } from '@wwi/scenario';
import type { World } from './ground';
import type { BarrageState } from './barrage';
import { CAUSES, emit } from './causes';
import type { Cause } from './causes';
import { anyWithin, sideBuckets } from './buckets';
import { isHolding } from './companies';
import type { CompanyState, CompanyStatus } from './companies';
import type { PhaseName } from './pipeline';
import type { Streams } from './rng';
import { ammoReserve } from './smaller';
import { segmentsOnLine, takerOf } from './trenches';
import type { BatteryState, CommandState, CutLine, FireMission, HqState, Message, ReserveState, SegmentState, Side, SimEvent, TankState } from './types';

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
  lastReport: ReadonlyMap<string, { status: CompanyStatus; men: number; holder: Side | null; atMin: number }>;
  /** Batteries answering calls for fire (Task 11), in id order. */
  fireMissions: FireMission[];
  /** Off-map formations (Task 13), in the scenario's order. */
  reserves: ReserveState[];
  /** Tanks (Task 14), in ascending id order. */
  tanks: TankState[];
  /**
   * What each company holding its ammunition reserve saw of its targets when it last looked (Task 14 fix round): each
   * target's id and place, so it can tell an enemy coming at it. Looked up only. Not in the run record.
   */
  seen: ReadonlyMap<string, ReadonlyArray<readonly [id: string, x: number, y: number]>>;
  /** The ids of the mines blown so far (Task 14 fix round). */
  minesFired: string[];
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
  /** The run's only sources of randomness: one stream per subsystem, derived from the seed (rng.ts), each drawn in a fixed order. */
  rngs: Streams;
  terrain?: Terrain;
  /** Ground, sight and light for the run (Task 6). */
  world: World;
  /** Defaults applied, at setup and during the run; the record lists them sorted. */
  defaultsUsed: Set<string>;
  /** Called with each phase's name before it runs (tests and profiling). */
  onPhase?: (name: PhaseName) => void;
};

/** On the field as a fighting body: men standing, and not surrendered, destroyed, off the map or marching. */
export const onField = (c: CompanyState): boolean => {
  if (!(c.men > 0)) return false;
  const s = c.status;
  return s !== 'surrendered' && s !== 'destroyed' && s !== 'off-map' && s !== 'marching';
};

/** A company that can fight with its own weapons: on the field, up (not down in its dugouts), with ammunition left. */
export const armed = (c: CompanyState): boolean => onField(c) && c.posture !== 'in-dugout' && c.ammo > 0;

/**
 * Contact, the one definition every task extends: some attacking company (any that is not holding) is
 * within its doctrine's `closeRangeM` of an enemy company on the field, and one of the two can fight (`armed`; Task 15):
 * two companies neither of which can fire on the other (no ammunition left, or down in their dugouts) exchange nothing,
 * and what can still change between them is scheduled (schedule.ts: morale thresholds, emergence, sorties, orders).
 */
export function inContact(state: SimState, ctx: StepContext): boolean {
  const field = state.companies.filter(onField);
  // Task 14: a company down to its ammunition reserve fires it only on a counter-attack, whose companies are on the move
  // (so the run is busy anyway); in contact it counts as unable to fire.
  const canFire = (c: CompanyState): boolean => armed(c) && c.ammo > ammoReserve(c, ctx);
  // Each side's enemies, in buckets (buckets.ts), so contact never looks at every pair; those on the field are kept as it looks.
  for (const a of field) {
    if (isHolding(a)) continue;
    const r = v(ctx.doctrines[a.doctrineId]!.common.closeRangeM);
    if (anyWithin(sideBuckets(state.companies, a.side === 'allied' ? 'central' : 'allied'), a.x, a.y, r, canFire(a) ? onField : canFire)) return true;
  }
  return false;
}

/** Statuses of companies on the move. */
const MOVING: ReadonlySet<string> = new Set(['advancing', 'falling-back', 'counter-attacking']);

/**
 * Busy: something is happening that needs the fine step and close snapshots — contact, a barrage
 * lifting, a company on the move, fire coming in on a company this step, a company pinned (whose
 * recovery sets it moving again), men coming up out of their dugouts this step (whose fire starts
 * next step), men mopping up dugouts (Task 15), or a tank moving (Task 14). Otherwise the battle is quiet.
 */
export function isBusy(state: SimState, ctx: StepContext): boolean {
  // Asked twice of the same state (the run end and the next step): worked out once (a state never changes once made).
  let m = busyMemo.get(ctx);
  if (!m) busyMemo.set(ctx, (m = new WeakMap()));
  let hit = m.get(state);
  if (hit === undefined) m.set(state, (hit = workBusy(state, ctx)));
  return hit;
}
const busyMemo = new WeakMap<StepContext, WeakMap<SimState, boolean>>();

function workBusy(state: SimState, ctx: StepContext): boolean {
  return (
    state.barrages.some((b) => b.phase === 'lifting') ||
    state.companies.some((c) => MOVING.has(c.status) || c.status === 'pinned' || c.recentFire.some((f) => f.minute === state.minute)) ||
    state.events.some((e) => e.kind === 'dugout-sortie') ||
    // Task 15: men clearing dugouts draw their progress each step.
    state.companies.some((c) => c.intent === 'mop-up') ||
    // Task 14: a tank on the move (smaller.ts), whose bog checks and fire come every step.
    state.tanks.some((t) => t.status === 'moving') ||
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
  // Grouped by line, then sector (no key string made for each company each step).
  const byLine = new Map<string, Map<string, CompanyState[]>>();
  for (const c of state.companies) {
    if (!aimsAtLine(c)) continue;
    let bySector = byLine.get(c.objectiveLineId!);
    if (!bySector) byLine.set(c.objectiveLineId!, (bySector = new Map()));
    const g = bySector.get(c.sectorId);
    if (g) g.push(c);
    else bySector.set(c.sectorId, [c]);
  }
  const groups = new Map<string, CompanyState[]>();
  for (const [lineId, bySector] of byLine) for (const [sectorId, cs] of bySector) groups.set(`${lineId}|${sectorId}`, cs);
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
