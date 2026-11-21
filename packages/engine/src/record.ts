import type { Feature, Point, Posture, Scenario, TerrainGrid } from '@wwi/scenario';
import type { CompanyState, CompanyStatus } from './companies';
import type { CasualtyCount, Side, SimEvent } from './types';

export const ENGINE_VERSION = '0.3.0';

/** Snapshot spacing in battle-minutes: while anything is happening, and otherwise (output resolution, not a model number). */
export const SNAPSHOT_BUSY_MIN = 10;
export const SNAPSHOT_QUIET_MIN = 60;

/**
 * A table held as column names and rows of values in that order. Snapshot tables use it: `companies` now;
 * `segments` (Task 7) and `reserves` (Task 13) are added beside it the same way. Readers find a value by
 * its column name, so a table can gain columns without breaking them.
 */
export type Columnar<C extends string, R extends readonly unknown[]> = { columns: C[]; rows: R[] };

export const COMPANY_COLUMNS = ['id', 'x', 'y', 'men', 'status', 'morale', 'suppression', 'posture', 'killed', 'wounded', 'captured'] as const;
export type CompanyColumn = (typeof COMPANY_COLUMNS)[number];
/** x and y to 1 m; morale and suppression to 0.01; counts are whole men. */
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
];

export type Snapshot = {
  minute: number;
  /** One row per company, in ascending id order. */
  companies: Columnar<CompanyColumn, CompanyRow>;
  /** `done` once the sector's barrage has ended; its points then hold where it last stood. */
  barrages: Array<{ sectorId: string; done: boolean; points: Point[] }>;
};

/** Casualties of one side in one period, with the same counts for every formation it has, by formation id. */
export type SideCasualties = CasualtyCount & { formations: Record<string, CasualtyCount> };
export type PeriodCasualties = Record<Side, SideCasualties>;
export type EndReason = 'objectives-held' | 'lull' | 'time-cap';

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
    sectors: Array<{ id: string; yMin: number; yMax: number }>;
    /** Map features (trenches, wire, woods, …) in local metres, as the scenario holds them. */
    features: Feature[];
    /** The scenario's elevation grid; absent (not undefined) when the scenario has none. */
    terrain?: TerrainGrid;
  };
  /** Every company, in ascending id order: the battalion it belongs to, its name and side. */
  units: Array<{ id: string; battalionId: string; name: string; side: Side }>;
  /** Every SNAPSHOT_BUSY_MIN minutes while anything is happening, otherwise every SNAPSHOT_QUIET_MIN; always the first and last state. */
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
    /** Why the run ended, and who won (Task 15); null until decided. */
    endReason: EndReason | null;
    winner: Side | null;
    keyGround: Array<{ id: string; name: string; holder: Side | null }>;
  };
  /** Every default the run applied, sorted (Review Focus 2). */
  defaultsUsed: string[];
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
