import type { ChannelKind, FORMATION_KINDS, Point } from '@wwi/scenario';
import type { Cause } from './causes';

export type Side = 'allied' | 'central';
export type FormationKind = (typeof FORMATION_KINDS)[number];

export const EVENT_KINDS = [
  // Plan 2
  'zero-hour', 'barrage-pause', 'barrage-resume', 'barrage-done', 'company-reached', 'line-taken',
  // Plan 3
  'company-pinned', 'company-fell-back', 'company-surrendered', 'company-destroyed',
  'garrison-emerged', 'defenders-trapped', 'segment-lost', 'segment-retaken', 'dugout-cleared', 'dugout-sortie',
  'officers-lost', 'fire-opened', 'bombardment-result', 'message-lost', 'order-issued', 'counter-attack-ordered',
  'operation-launched', 'reserve-ordered', 'reserve-arrived', 'run-ended',
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

/** A stretch of German trench held by one garrison company (Task 7). */
export type SegmentState = {
  id: string;
  featureId: string;
  garrisonIds: string[];
  yMin: number;
  yMax: number;
  lengthM: number;
  wireCut: number;
  wireBeltDepthM: number;
  trenchDamage: number;
  dugoutDamage: number;
  dugoutDepthM: number;
  spared: boolean;
  holder: Side;
  barrageLastOverMin: number | null;
  emerged: boolean;
  dugoutPoints: Array<{ point: Point; men: number }>;
};

/** A battery of guns (Tasks 7–8, 14). */
export type BatteryState = {
  id: string;
  side: Side;
  weapon: string;
  guns: number;
  suppressedUntilMin: number | null;
  ammoLeft: number;
  position?: Point;
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
 * Damage gathered by the artillery and direct-fire phases, applied all at once by `resolve` (Task 9
 * fills it). `hits` is an expected count, rounded by `stochasticRound` only when applied.
 */
export type PendingDamage = {
  targetId: string;
  source: 'artillery' | 'direct-fire';
  firerId?: string;
  hits: number;
  /** Rounds that arrived, for suppression. */
  rounds: number;
  suppressPerRound: number;
  causes: Cause[];
  refs: number[];
};
export type Pending = { damage: PendingDamage[] };
