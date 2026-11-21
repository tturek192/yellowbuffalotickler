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
  // The command model (Task 12): a taken line whose segments the enemy has taken back; an off-map attack on a flank opens
  'line-lost', 'off-map-attack',
  // An order a company could not carry out (its target names no place), dropped (Task 12)
  'order-dropped',
  // A planned divisional or army counter-attack given up (Task 13)
  'counter-attack-dropped',
  // Smaller mechanics (Task 14): a tank stuck in the mud, a battery's horses gassed, a company down to its ammunition reserve
  'tank-bogged', 'horses-gassed', 'ammunition-low',
  // Task 14 fix round: a horse-drawn battery limbering up to withdraw; a mine blown under the enemy
  'guns-withdrawn', 'mine-fired',
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
/** Where an order sends a unit: a line in a sector, a feature, a trench segment, or (a reserve's march, Task 13) a point. */
export type OrderTarget = { lineId: string; sectorId: string } | { featureId: string } | { segmentId: string } | { point: Point };

/** An order a company or formation holds (Tasks 11–12 issue them). */
export type Order = {
  kind: 'attack' | 'hold' | 'counter-attack' | 'march' | 'fall-back';
  target?: OrderTarget;
  fromFormationId: string;
  issuedMin: number;
  /** The `order-issued`, `operation-launched` or `counter-attack-ordered` event, for refs. */
  eventId?: number;
  /** The companies the order is for (Task 12): only these, under the formation it reaches, hold it. Absent: every one. */
  unitIds?: string[];
  /** The minute the companies go (Task 12: a counter-attack once formed up); absent: when the order reaches them. */
  goAtMin?: number;
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
  /** Lines lost again (Task 12), by `lineId|sectorId`, with the minute they were lost. */
  lost?: Record<string, number>;
  /**
   * Planned divisional or army counter-attacks resolved (Task 13): by the planning HQ's formation id, the minute its
   * plan went in or was given up. A headquarters above learns of it only so.
   */
  plans?: Record<string, number>;
  /** The minute each segment in `segments` changed hands, as the sender knows it (Task 12); absent: `atMin`. */
  segmentsAt?: Record<string, number>;
  /**
   * The enemy seen (Task 12): for each segment the enemy holds within `observerRangeM` of the reporting company, the men
   * of the enemy up in it (within `captureRadiusM` of its trench), and for each operation's target place in range
   * (`place:<featureId>`) the enemy up within its radius; and when they were seen. `lost`: on an enemy trench or a line's
   * ground, the losses seen among the enemy companies that hold it (their casualties in battle and their men captured).
   */
  enemy?: Record<string, { men: number; atMin: number; lost?: number }>;
};

/**
 * What an HQ believes of the enemy on a piece of ground (Task 12). `men`: its belief. On an enemy trench it still shows
 * the enemy holding, and on a line's ground, men down in dug-outs are invisible, not gone: the belief is the greater of
 * the men last `seen` up and the intelligence estimate `base` less the losses reported there (`lost`: casualties seen,
 * prisoners taken, garrisons trapped or surrendered). `intel`: the belief rests on intelligence (the estimate is the
 * greater). Elsewhere the last report seen replaces it.
 */
export type EnemyKnown = { men: number; atMin: number; intel?: true; base?: number; seen?: number; lost?: number };

/**
 * A company's call for fire on an enemy-held trench segment (Task 11). `forMin`: how long the guns are to fire (Task 12:
 * a headquarters' standing barrage on a stalled line, `stallBarrageMin`); absent: `callForFireMin`.
 */
export type CallForFire = { segmentId: string; byUnitId: string; atMin: number; forMin?: number };

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

/**
 * A decision an HQ has taken but not yet acted on (Task 12): a divisional counter-attack, planned when the division
 * ordered its reserves forward (`atMin`), to go in once they are there. `reserveIds`: the off-map reserves it waits for;
 * `eventRefs`: the `reserve-ordered` events and what led to them.
 */
export type Decision = {
  kind: 'divisional-counter-attack';
  atMin: number;
  formationId: string;
  /** The segments lost when it was planned (its targets are chosen again from the picture each time it is checked). */
  segmentIds: string[];
  reserveIds: string[];
  eventRefs: number[];
  /** The division whose front it is to retake (Task 13: the HQ's own for a division, a division under it for an army). */
  frontId: string;
  /** Since when its troops have been there with no lost ground it can reach (Task 13); absent: not waiting so. */
  blockedSinceMin?: number;
};

/**
 * What an HQ has learnt and not yet passed up (Task 11): the keys of its picture that changed, from when, whether any
 * change is urgent (a unit's status, a segment's holder, a line taken), the latest event the news was about, and when it
 * last sent a summary up.
 */
export type HqNews = {
  units: string[];
  segments: string[];
  lines: string[];
  /** Segments whose enemy it has news of (Task 12; never urgent). */
  enemy: string[];
  /** Planned counter-attacks it has news of having gone in or been given up (Task 13; urgent). */
  plans: string[];
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
    /** When each segment last changed hands, as far as it knows (Task 12); absent: not since Zero. */
    segmentsAt: Record<string, number>;
    /** Lines it knows were lost again, with the minute (Task 12); a line taken again later is taken. */
    linesLost: Record<string, number>;
    /** The planned counter-attacks it knows have gone in or been given up, by planning HQ, with the minute (Task 13). */
    plans: Record<string, number>;
    /**
     * The enemy it knows of on each piece of ground (Task 12): by segment id, or `place:<featureId>` for an operation's
     * target that no segment covers. At Zero it holds the pre-battle intelligence picture (`intel`: the enemy companies on
     * the map at their Zero places and strengths, never the off-map reserves); a report seen since replaces an entry.
     * Ground with no entry is unknown, never empty.
     */
    enemy: Record<string, EnemyKnown>;
    /**
     * The event each piece of its picture was last about, by `u:<unit>`, `s:<segment>` and `l:<line key>` (Task 12):
     * the refs of the decisions it takes on them.
     */
    about: Record<string, number>;
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
  /** The `horses-gassed` event that took its horses (Task 14); absent: it was never gassed. */
  gassedEventId?: number;
  /**
   * A withdrawal under way (Task 14 fix round): the battery limbers up until `limberedMin` (and can be captured meanwhile),
   * then moves from `from` to `to`, arriving at `doneMin`; out of action throughout. `eventId`: its `guns-withdrawn`.
   */
  withdrawal?: { limberedMin: number; doneMin: number; from: Point; to: Point; eventId: number };
};

/**
 * A tank (Task 14): `moving` behind its sector's barrage toward its objective line, `halted` while it has caught up with
 * the barrage (until the barrage moves on), `arrived` on the objective line, or `bogged` in the mud for the rest of the
 * run. `metres`: how far it has driven since Zero (its bog checks fall at every 100 m of it).
 */
export type TankState = {
  id: string;
  side: Side;
  sectorId: string;
  objectiveLineId: string;
  x: number;
  y: number;
  metres: number;
  status: 'moving' | 'halted' | 'arrived' | 'bogged';
};

/**
 * An off-map formation (Task 13): waiting where the scenario puts it until a headquarters orders it forward (`ordered`,
 * at `orderedMin`), marching from when the order is out until `arriveMin`, then `arrived`: its companies stand at
 * `entryPoint`. `orderedBy`: the headquarters that ordered it, whose leader's orderSpeed scales the order delay;
 * `orderedEventId`: its `reserve-ordered` event, which `reserve-arrived` refers to.
 */
export type ReserveState = {
  formationId: string;
  side: Side;
  status: 'waiting' | 'ordered' | 'marching' | 'arrived';
  orderedMin: number | null;
  arriveMin: number | null;
  entryPoint: Point;
  orderedBy: string | null;
  orderedEventId: number | null;
  /**
   * The front it is sent to (set when ordered): the segment it walks to on the map once arrived, and that walk's length
   * in km from `entryPoint` (the part of `distanceKm` on the map, which the march off the map leaves out); null and 0
   * until ordered, or with no front to go to.
   */
  toSegmentId: string | null;
  onMapKm: number;
  /** The front segments it is sent to (set when ordered), south to north: its companies' places at the front spread along them. */
  frontSegmentIds: string[];
  /** Where its companies came on to the map and the places at the front they were given (on arrival; empty before). */
  starts: Point[];
  ends: Point[];
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
  /** The event that already reports this fire (a `mine-fired`): `resolve` emits none for it and refers to this one. */
  eventId?: number;
};

/**
 * Damage gathered by the artillery and direct-fire phases, applied all at once by `resolve` (Task 8's
 * minimal resolve; Task 9 extends it). `hits` is an expected count, rounded by `stochasticRound` only when applied.
 */
export type PendingDamage = {
  targetId: string;
  source: 'artillery' | 'direct-fire' | 'mine';
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
  /**
   * Casualties already drawn (a mine's, Task 14 fix round 2, from its own stream): `resolve` applies exactly these, all
   * killed (or buried), with no draw of its own; officers only as there are men left.
   */
  exact?: number;
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

/**
 * What the command model has done, so that no decision is taken twice (Task 12). Looked up only, never iterated in
 * insertion order.
 */
export type CommandState = {
  /**
   * Companies the command model has ordered forward, by id: the HQ that ordered them, when, and to which line (for an
   * attack on one), and whether its picture has since shown them take the order up (`started`). A company the HQ then
   * sees holding again (it rallied, or its counter-attack is in) is released: it may be ordered again.
   */
  ordered: Record<string, { hqId: string; atMin: number; lineKey?: string; started: boolean }>;
  /** The minute each HQ last committed a reserve to a stalled line, by `hqId|lineId|sectorId` (also set on its HQs above). */
  stallCommits: Record<string, number>;
  /** Operations launched, by id, with the minute. */
  launched: Record<string, number>;
  /** Local counter-attacks ordered on a lost segment, by segment id: the HQ that ordered it and when, until that HQ knows the segment is its own again. */
  counterAttacks: Record<string, { hqId: string; atMin: number }>;
  /** Divisions that have ordered their reserves forward and planned their counter-attack, with the minute. */
  divisions: Record<string, number>;
  /** The `off-map-attack` event of each off-map attack under way or done, by its id. */
  offMap: Record<string, number>;
};
