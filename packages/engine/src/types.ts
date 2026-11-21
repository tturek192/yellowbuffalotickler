import type { ChannelKind, FORMATION_KINDS, Point, Scenario } from '@wwi/scenario';
import type { Cause } from './causes';

export type Side = 'allied' | 'central';
export type ArtilleryRole = Scenario['artillery'][number]['role'];
export type Observation = NonNullable<Scenario['artillery'][number]['observation']>;
export type FormationKind = (typeof FORMATION_KINDS)[number];

export const EVENT_KINDS = [
  // Plan 2
  'zero-hour', 'barrage-pause', 'barrage-resume', 'barrage-done', 'company-reached', 'line-taken',
  // Plan 3
  'company-pinned', 'company-fell-back', 'company-surrendered', 'company-destroyed',
  'garrison-emerged', 'defenders-trapped', 'segment-lost', 'segment-retaken', 'dugout-cleared', 'dugout-sortie',
  'officers-lost', 'fire-opened', 'bombardment-result', 'message-lost', 'order-issued', 'counter-attack-ordered',
  'operation-launched', 'reserve-ordered', 'reserve-arrived', 'run-ended',
  // Plan 3, artillery in battle (Task 8)
  'shelled', 'barrage-passed', 'barrage-lost', 'batteries-recovered', 'ammunition-exhausted',
  // Plan 3, direct fire (Task 9): rifle and machine-gun fire on one company in one step
  'direct-fire',
  // Plan 3, the fight for trenches (Task 10): batteries overrun when a segment near them is lost
  'guns-captured',
  // A company that fell back rallies and holds (Task 10)
  'company-rallied',
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export type SimEvent = {
  /** Sequential within the run: the record's events[i] has id i. */
  id: number;
  minute: number;
  kind: EventKind;
  sectorId?: string;
  lineId?: string;
  unitId?: string;
  /** The trench segment the event is about (Task 7). */
  segmentId?: string;
  text: string;
  causes: Cause[];
  /** Ids of earlier events that led to this one. */
  refs: number[];
  /** Numbers behind the event (a gap in metres, a wire-cut fraction, …), for the "why" trace. */
  factors?: Record<string, number>;
};

/** What a company is trying to do this step (chosen by the behaviour phase). */
export type Intent = 'advance' | 'hold' | 'go-to-ground' | 'fall-back' | 'mop-up' | 'counter-attack' | 'march';

export type CasualtyCount = { killed: number; wounded: number; captured: number; total: number };

/** Where an order sends a unit. */
export type OrderTarget = { lineId: string; sectorId: string } | { featureId: string } | { segmentId: string };

/** An order a company or formation holds (Tasks 11–12 issue them). */
export type Order = {
  kind: 'attack' | 'hold' | 'counter-attack' | 'march' | 'fall-back';
  target?: OrderTarget;
  fromFormationId: string;
  issuedMin: number;
  /** The `order-issued` event, for refs. */
  eventId?: number;
};

/**
 * What a report tells the HQ that receives it (Task 11): written at `atMin`; each unit as it stood at its own `atMin`
 * (a summary passes on what reached its sender, which is older than the summary itself).
 */
export type Report = {
  atMin: number;
  units: Record<string, { status: string; men: number; atMin: number }>;
  /** Segments by id and the side holding them. */
  segments: Record<string, Side>;
  /** Lines taken, by `lineId|sectorId`, with the minute they were taken. */
  lines: Record<string, number | null>;
};

/** A company's call for fire on an enemy-held trench segment (Task 11). */
export type CallForFire = { segmentId: string; byUnitId: string; atMin: number };

/**
 * A message in transit over a channel (Task 11), one hop of its journey: `fromFormationId` sends it to
 * `toFormationId` (a formation id, a company id for a company's own reports and calls, or ARTILLERY for the last hop of
 * a call for fire); a message going further names its destination in `finalId`, and each headquarters it reaches
 * sends it on.
 */
export type Message = {
  id: number;
  side: Side;
  kind: 'report' | 'order' | 'call-for-fire';
  fromFormationId: string;
  toFormationId: string;
  sentMin: number;
  dueMin: number;
  channel: ChannelKind;
  payload: Report | Order | CallForFire;
  aboutEventId?: number;
  /** Where the message is going, when that is beyond this hop. */
  finalId?: string;
  /** The failure draw lost it: at `dueMin` it is known lost (`message-lost`) and sent again by the next channel. */
  lost?: true;
  /** Its hop had a surface line it could not use: cut by shelling along the line, or by an earlier failure draw. */
  factors?: { cutBy: 'shelling' | 'failure' };
};

/** A surface line between two headquarters cut for the rest of the run (both directions): its `a|b` pair, sorted. */
export type CutLine = { pair: string; by: 'shelling' | 'failure'; atMin: number };

/** A decision an HQ has taken but not yet acted on (Task 12). */
export type Decision = { kind: string; atMin: number; formationId: string; eventRefs: number[] };

/**
 * What an HQ has learnt and not yet passed up (Task 11): the keys of its picture that changed, from when, whether any
 * change is urgent (a unit's status, a segment's holder, a line taken), the latest event the news was about, and when it
 * last sent a summary up.
 */
export type HqNews = {
  units: string[];
  segments: string[];
  lines: string[];
  sinceMin: number | null;
  urgent: boolean;
  aboutEventId: number | null;
  sentMin: number;
};

/** A headquarters: what it knows (only what reports have told it) and what it has decided (Tasks 11–12). */
export type HqState = {
  formationId: string;
  side: Side;
  kind: FormationKind;
  leaderId?: string;
  picture: {
    segments: Record<string, Side>;
    lines: Record<string, number | null>;
    units: Record<string, { status: string; men: number; atMin: number }>;
  };
  pending: Decision[];
  news: HqNews;
};

/**
 * Batteries answering a call for fire (Task 11): from `fromMin` to `toMin` the `guns` of each battery fire on the
 * segment instead of their own task. `id` is a fresh id from the message counter, taken when the call is answered;
 * `refs` the event the call was about.
 */
export type FireMission = {
  id: number;
  side: Side;
  segmentId: string;
  byUnitId: string;
  fromMin: number;
  toMin: number;
  guns: Array<{ batteryId: string; guns: number }>;
  refs: number[];
};

/** Men of one garrison company left in the dugouts of a segment (Tasks 8, 10). */
/**
 * `leftMin`: the minute the leading wave left them below (the trapping); `unguardedMin`: the last minute an enemy company
 * stood at the entrances (within captureRadiusM), from which the sortie delay runs.
 */
export type DugoutPoint = { companyId: string; point: Point; men: number; leftMin: number; unguardedMin: number; eventId: number; cleared: number };

/**
 * A stretch of German trench held by one garrison company (Task 7): the stretch of its feature between the
 * midpoints to the neighbouring garrisons on the same feature (garrisons at the same place share one).
 */
export type SegmentState = {
  /** `featureId:NNN`, numbered south to north along the feature. */
  id: string;
  featureId: string;
  /** In ascending id order. */
  garrisonIds: string[];
  yMin: number;
  yMax: number;
  /** Length along the trench line between yMin and yMax (0 for a garrison on a point feature). */
  lengthM: number;
  /** Share of the segment's wire cut, 0 to 1; 0 when it has no wire (wireBeltDepthM 0). */
  wireCut: number;
  /** Depth of the wire belt in front of it, in metres; 0 when no wire belt lies on it. */
  wireBeltDepthM: number;
  /** Share of the trench wrecked, 0 to 1. */
  trenchDamage: number;
  /** Share of the dugouts broken, 0 to 1. */
  dugoutDamage: number;
  /** Mean dugout depth of its garrisons, in metres. */
  dugoutDepthM: number;
  /** Whether any part of it was spared by the bombardment, by any weapon kind. */
  spared: boolean;
  holder: Side;
  /** The side its garrison belongs to (central at Vimy): it is lost while the other side holds it, and retaken when it holds it again (Task 10). */
  garrisonSide: Side;
  /** Its last `segment-lost` or `segment-retaken` event; null while it has never changed holder (Task 10). */
  holderEventId: number | null;
  /** The `defenders-trapped` event that caught its garrison below; null if none did (Task 10). */
  trappedEventId: number | null;
  /** The last minute a barrage (creeping or standing) was on it; null: none since Zero (Task 8). */
  barrageLastOverMin: number | null;
  /**
   * Which of its trench samples (artillery.ts `segmentSamples`, by index) a barrage was on at `barrageLastOverMin`, for
   * the local checks of capture, trapping and sorties: only the trench near the men matters (Task 10 fix round).
   */
  barrageOn: number[];
  /**
   * The event that last told of fire on it, for the refs of its garrison's emergence: the `barrage-passed`
   * when the creeping barrage lifted off it, else its `bombardment-result`; null: neither (Task 8).
   */
  barrageEventId: number | null;
  /** Its garrison is up and manning the trench (Task 8). */
  emerged: boolean;
  /** Attackers reached it before its garrison emerged: part surrendered, the rest are left in its dugouts (Task 8). */
  trapped: boolean;
  /**
   * Men of a garrison company left below ground when the attackers reached the segment over them, to be cleared by
   * mopping up or to sortie (Tasks 8, 10).
   */
  dugoutPoints: DugoutPoint[];
};

/**
 * A battery of guns (Tasks 7–8, 14): one per artillery entry. The guns of a German entry that the
 * counter-battery fire silenced at Zero are split off one gun to a battery, `<entry id>/sNNN`, each with
 * the minute it comes back into action (Task 7).
 */
export type BatteryState = {
  id: string;
  side: Side;
  weapon: string;
  /** The artillery entry's role: what it fires in the battle (Task 8). */
  role: ArtilleryRole;
  /** How it sees its fall of shot (the entry's observation; map when none is given). */
  observation: Observation;
  guns: number;
  /** The minute after Zero the battery fires again; null: in action. */
  suppressedUntilMin: number | null;
  /** Rounds left for the battle; Infinity when the scenario gives no ammunition. */
  ammoLeft: number;
  position?: Point;
  /** Whether it has draught horses (the artillery entry's horseDrawn; Task 14 takes them away when they are gassed). */
  horses: boolean;
  /** Overrun by the enemy: its guns are taken and fire no more (Task 10). */
  captured: boolean;
};

/** An off-map formation (Task 13). */
export type ReserveState = {
  formationId: string;
  side: Side;
  status: 'waiting' | 'ordered' | 'marching' | 'arrived';
  orderedMin: number | null;
  arriveMin: number | null;
  entryPoint: Point;
};

/**
 * One fire in one step (an artillery source, Task 8): `resolve` reports all the damage that names it in one
 * event, with these factors and the men it hit.
 */
export type FireGroup = {
  /** Unique within the step. */
  key: string;
  /** The event `resolve` reports it with: `shelled` (artillery, the default) or `direct-fire` (Task 9). */
  kind?: 'shelled' | 'direct-fire';
  /** What fired, for the event's text ("Creeping barrage, Sector 1"). */
  text: string;
  sectorId?: string;
  /** Set when the fire is about one company (the own barrage on a company too close to it). */
  unitId?: string;
  factors: Record<string, number>;
};

/**
 * Damage gathered by the artillery and direct-fire phases, applied all at once by `resolve` (Task 8's
 * minimal resolve; Task 9 extends it). `hits` is an expected count, rounded by `stochasticRound` only when applied.
 */
export type PendingDamage = {
  targetId: string;
  source: 'artillery' | 'direct-fire';
  firerId?: string;
  hits: number;
  /** Rounds that arrived, for suppression. */
  rounds: number;
  /** Suppression per round (the rounds-weighted mean of the weapons that fired them). */
  suppressPerRound: number;
  causes: Cause[];
  refs: number[];
  /** The fire this damage is part of. */
  fire?: FireGroup;
  /** Direct fire: the share of the firer's ammunition load (its `ammo`) these rounds used up (Task 9). */
  ammoUsed?: number;
};

/** What `resolve` did to a company this step, for the morale phase (Task 9). */
export type Applied = { menBefore: number; hit: number };

export type Pending = {
  damage: PendingDamage[];
  /** Filled by `resolve`, by company id (looked up only, never iterated): companies some fire came in on. */
  applied?: Map<string, Applied>;
};
