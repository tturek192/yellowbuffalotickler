import type { Change, Feature, Point, Posture, Scenario, TerrainGrid } from '@wwi/scenario';
import type { CompanyState, CompanyStatus, Role } from './companies';
import type { DeadlockSummary } from './deadlock';
import type { DivisionInsignia } from './insignia';
import type { CasualtyCount, ReserveState, SegmentState, Side, SimEvent, TankState } from './types';

export const ENGINE_VERSION = '0.5.2';

/** Snapshot spacing in battle-minutes: while anything is happening, and otherwise (output resolution, not a model number). */
export const SNAPSHOT_BUSY_MIN = 10;
export const SNAPSHOT_QUIET_MIN = 60;

/**
 * A table held as column names and rows of values in that order. Snapshot tables use it: `companies`, `segments`
 * and `reserves` (Task 13). Readers find a value by its column name, so a table can gain columns without breaking them.
 */
export type Columnar<C extends string, R extends readonly unknown[]> = { columns: C[]; rows: R[] };

export const COMPANY_COLUMNS = ['id', 'x', 'y', 'men', 'status', 'morale', 'suppression', 'posture', 'killed', 'wounded', 'captured', 'gapM'] as const;
export type CompanyColumn = (typeof COMPANY_COLUMNS)[number];
/** x and y to 1 m; morale and suppression to 0.01; counts are whole men; gapM (Task 8) to 1 m, null when the company has no barrage to follow. */
export type CompanyRow = [
  id: string,
  x: number,
  y: number,
  men: number,
  status: CompanyStatus,
  morale: number,
  suppression: number,
  posture: Posture,
  killed: number,
  wounded: number,
  captured: number,
  gapM: number | null,
];

export const SEGMENT_COLUMNS = ['segment', 'holder', 'wireCut', 'emerged'] as const;
export type SegmentColumn = (typeof SEGMENT_COLUMNS)[number];
/** `segment` is the segment's index in `geometry.segments`; wireCut to 0.01. */
export type SegmentRow = [segment: number, holder: Side, wireCut: number, emerged: boolean];

export const RESERVE_COLUMNS = ['formationId', 'status', 'orderedMin', 'arriveMin'] as const;
export type ReserveColumn = (typeof RESERVE_COLUMNS)[number];
/** An off-map reserve (Task 13): its formation, status, the minute it was ordered and the minute it arrives (to 0.1), null until ordered. */
export type ReserveRow = [formationId: string, status: ReserveState['status'], orderedMin: number | null, arriveMin: number | null];

export const TANK_COLUMNS = ['id', 'x', 'y', 'status'] as const;
export type TankColumn = (typeof TANK_COLUMNS)[number];
/** A tank (Task 14): its id, where it is (to 1 m) and its status (`bogged` once stuck in the mud). */
export type TankRow = [id: string, x: number, y: number, status: TankState['status']];

/** A trench segment as the record's geometry lists it: what does not change during the run (y and length to 0.1 m). */
export type SegmentGeometry = Pick<SegmentState, 'id' | 'featureId' | 'garrisonIds' | 'yMin' | 'yMax' | 'lengthM'>;

export type Snapshot = {
  minute: number;
  /**
   * Engine 0.3.13 on: set on a snapshot that holds only the rows (and barrages) that changed since the snapshot before;
   * absent on a keyframe, which holds them all (snapshots.ts `expandSnapshots` gives every snapshot in full).
   */
  delta?: true;
  /** One row per company, in ascending id order (in a delta, only the companies whose row changed). */
  companies: Columnar<CompanyColumn, CompanyRow>;
  /** One row per trench segment, in `geometry.segments` order (in a delta, only those that changed). */
  segments: Columnar<SegmentColumn, SegmentRow>;
  /** One row per off-map reserve, in the scenario's order (Task 13; absent in records before engine 0.3.7). */
  reserves?: Columnar<ReserveColumn, ReserveRow>;
  /** One row per tank, in ascending id order (Task 14; only in the snapshots of a run with tanks, engine 0.4.2 on). */
  tanks?: Columnar<TankColumn, TankRow>;
  /** `done` once the sector's barrage has ended; its points then hold where it last stood. */
  barrages: Array<{ sectorId: string; done: boolean; points: Point[] }>;
};

/** A weather entry as the record holds it: from `minute` (after Zero; before Zero is negative) until the next. */
export type WeatherEntry = { minute: number; precipitation: Scenario['weather'][number]['precipitation']['value']; windFromDeg?: number; visibilityM?: number };

/**
 * The sun's place and clock as the light model uses them (light.ts `daylight`: the frame origin, else 0, 0; the clock
 * offset, else 0; the twilight minutes), so a reader can work out day and night with `sunTimes`; and the scenario's weather.
 */
export type RunConditions = { sun: { lat: number; lon: number; utcOffsetMin: number; twilightMin: number }; weather: WeatherEntry[] };

/** Casualties of one side in one period, with the same counts for every formation it has, by formation id. */
export type SideCasualties = CasualtyCount & { formations: Record<string, CasualtyCount> };
export type PeriodCasualties = Record<Side, SideCasualties>;
export type EndReason = 'objectives-held' | 'lull' | 'time-cap';

/** The what-if a run was made with (Plan 4 Task 1): the overlay's id and title, and every value it changed, by op index. */
export type WhatIf = { overlayId: string; title: string; changes: Change[] };

export type RunRecord = {
  engineVersion: string;
  scenarioId: string;
  scenarioTitle: string;
  scenarioStatus: Scenario['status'];
  seed: number;
  zeroHour: string;
  stepMin: number;
  endMinute: number;
  geometry: {
    lines: Scenario['lines'];
    /**
     * `reach` (engine 0.4.5 on): how far the sector's fire plan reaches (barrage.ts `planReachX`, its last leg's line plus
     * the stand-off) at sample ys across it, to 0.1 m: the standing barrages fall no further than this.
     */
    sectors: Array<{ id: string; yMin: number; yMax: number; reach?: Point[] }>;
    /** Map features (trenches, wire, woods, …) in local metres, as the scenario holds them. */
    features: Feature[];
    /** The scenario's elevation grid; absent (not undefined) when the scenario has none. */
    terrain?: TerrainGrid;
    /** The German trench segments (Task 7), in the order snapshot segment rows index them. */
    segments: SegmentGeometry[];
    /** How deep the creeping barrage's band and the machine-gun barrage's zone beyond it are, in metres (absent before engine 0.4.4). */
    barrageDepthM?: { band: number; mg: number };
    /** Every battery the scenario places (engine 0.4.6 on): the period map draws a gun there. `count` is the working value. */
    batteries?: Array<{ id: string; side: Side; weapon: string; count: number; at: Point }>;
  };
  /** What playback needs for weather and light (absent before engine 0.4.4). */
  conditions?: RunConditions;
  /**
   * Every company, in ascending id order: the battalion it belongs to, its name and side; its formations, battalion up
   * (engine 0.4.0 on); its division's patch colour (0.4.6 on) and its role in the plan (0.4.7 on).
   */
  units: Array<{ id: string; battalionId: string; name: string; side: Side; formationPath?: string[]; insignia?: string; role?: Role }>;
  /**
   * The divisions (and division-sized groups), with their sleeve-patch colour where the scenario gives one (engine
   * 0.4.6 on): the period map's notes. A unit's `insignia` is its nearest formation's patch (insignia.ts).
   */
  divisions?: DivisionInsignia[];
  /**
   * Contact-patrol messages (engine 0.4.6 on; absent when the run sent none): the formation that sent each and its side, the minute
   * it left and the minute it was due (to 0.1). The period map draws an aircraft while one is in flight.
   */
  contactPatrols?: Array<{ fromId: string; side: Side; sentMin: number; dueMin: number }>;
  /**
   * Every SNAPSHOT_BUSY_MIN minutes while anything is happening, otherwise every SNAPSHOT_QUIET_MIN; always the first and
   * last state. A keyframe every KEYFRAME_EVERY snapshots, the first among them, and between them deltas (`delta`).
   */
  snapshots: Snapshot[];
  events: SimEvent[];
  summary: {
    lineTaken: Array<{ lineId: string; sectorId: string; minute: number }>;
    /** The preliminary bombardment (before Zero) and the battle, counted apart. */
    casualties: { bombardment: PeriodCasualties; battle: PeriodCasualties };
    /** Men taken prisoner by each side. */
    prisoners: Record<Side, number>;
    gunsCaptured: number;
    endedAt: number;
    /** Why the run ended (Task 15; null in records before engine 0.4.0). */
    endReason: EndReason | null;
    winner: Side | null;
    keyGround: Array<{ id: string; name: string; holder: Side | null }>;
    /**
     * Whether the deadlock broke (engine 0.5.0 on; absent before): the first condition to hold, its minute and sector, the
     * margins to the run's end and as they stood at the break, each with its minute (0.5.1 on); null for a scenario that is
     * not scored (deadlock.ts).
     */
    deadlock: DeadlockSummary | null;
  };
  /** Every default the run applied, sorted (Review Focus 2). */
  defaultsUsed: string[];
  /** The what-if overlay the scenario was run with (engine 0.4.10 on); absent for the scenario as it stands. */
  whatIf?: WhatIf;
};

/** Round to the given number of decimals (0 = whole units). */
export const round = (n: number, decimals = 0): number => {
  const k = 10 ** decimals;
  return Math.round(n * k) / k;
};

const zero = (): CasualtyCount => ({ killed: 0, wounded: 0, captured: 0, total: 0 });
const add = (a: CasualtyCount, killed: number, wounded: number, captured: number): void => {
  a.killed += killed;
  a.wounded += wounded;
  a.captured += captured;
  a.total += killed + wounded + captured;
};

/**
 * Casualties by side and by formation, each company's counts rolled up along its formation path.
 * Every formation of every company is listed (with zeros if it lost nobody), in ascending id order.
 */
export function tallyCasualties(
  companies: CompanyState[],
  count: (c: CompanyState) => { killed: number; wounded: number; captured: number },
): PeriodCasualties {
  const out: PeriodCasualties = { allied: { ...zero(), formations: {} }, central: { ...zero(), formations: {} } };
  const formations = { allied: new Map<string, CasualtyCount>(), central: new Map<string, CasualtyCount>() };
  for (const c of companies) {
    const { killed, wounded, captured } = count(c);
    add(out[c.side], killed, wounded, captured);
    for (const f of c.formationPath) {
      let t = formations[c.side].get(f);
      if (!t) formations[c.side].set(f, (t = zero()));
      add(t, killed, wounded, captured);
    }
  }
  for (const side of ['allied', 'central'] as const)
    for (const id of [...formations[side].keys()].sort()) out[side].formations[id] = formations[side].get(id)!;
  return out;
}
