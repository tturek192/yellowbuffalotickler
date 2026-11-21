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

/** What a report tells the HQ that receives it (Task 11). */
export type Report = {
  atMin: number;
  units: Record<string, { status: string; men: number }>;
  segments: Record<string, Side>;
  lines: Record<string, number | null>;
};

/** A message in transit over a channel (Task 11). */
export type Message = {
  id: number;
  side: Side;
  kind: 'report' | 'order' | 'call-for-fire';
  fromFormationId: string;
  toFormationId: string;
  sentMin: number;
  dueMin: number;
  channel: ChannelKind;
  payload: Report | Order;
  aboutEventId?: number;
};

/** A decision an HQ has taken but not yet acted on (Task 12). */
export type Decision = { kind: string; atMin: number; formationId: string; eventRefs: number[] };

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
};

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
  /** The last minute a barrage (creeping or standing) was on it; null: none since Zero (Task 8). */
  barrageLastOverMin: number | null;
  /**
   * The event that last told of fire on it, for the refs of its garrison's emergence: the `barrage-passed`
   * when the creeping barrage lifted off it, else its `bombardment-result`; null: neither (Task 8).
   */
  barrageEventId: number | null;
  /** Its garrison is up and manning the trench (Task 8). */
  emerged: boolean;
  /** Attackers reached it before its garrison emerged: part surrendered, the rest are left in its dugouts (Task 8). */
  trapped: boolean;
  /** Men of a garrison company left below ground when the segment was taken over them, to be cleared (Tasks 8, 10). */
  dugoutPoints: Array<{ companyId: string; point: Point; men: number }>;
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
  /** Whether it has draught horses (the artillery entry's horseDrawn). */
  horses: boolean;
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
};
export type Pending = { damage: PendingDamage[] };
