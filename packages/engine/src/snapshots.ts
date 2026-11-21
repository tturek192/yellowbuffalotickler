import type { Point } from '@wwi/scenario';
import { barrageXAt } from './barrage';
import { sampleYs } from './geometry';
import { COMPANY_COLUMNS, RESERVE_COLUMNS, round, SEGMENT_COLUMNS, TANK_COLUMNS } from './record';
import type { CompanyRow, ReserveRow, RunRecord, SegmentRow, Snapshot, TankRow } from './record';
import type { SimState, StepContext } from './step';

/*
 * The record's snapshots (engine 0.3.13 on): a keyframe every KEYFRAME_EVERY snapshots holds every row; the snapshots
 * between hold only the rows that changed since the snapshot before (`delta: true`), each row carrying its key (a
 * company's id, a segment's index, a reserve's formation id, a tank's id; a barrage its sector). `expandSnapshots` gives them all
 * back in full. Output encoding, not a model number.
 */

/** Snapshots from one keyframe to the next (the first snapshot is one). */
export const KEYFRAME_EVERY = 24;

type Barrage = Snapshot['barrages'][number];

/** Takes the run's snapshots in turn, each a keyframe or the rows changed since the one before. */
export function snapshotWriter(ctx: StepContext, keyframeEvery = KEYFRAME_EVERY): (state: SimState) => Snapshot {
  let taken = 0;
  // What the last snapshot showed, by place (companies and segments keep their order through a run) or key.
  let objs: SimState['companies'] = [];
  let rows: CompanyRow[] = [];
  let segRows: SegmentRow[] = [];
  let resRows: ReserveRow[] = [];
  let tankRows: TankRow[] = [];
  let bars: string[] = [];
  const sectors = new Map(ctx.scenario.sectors.map((x) => [x.id, x]));
  return (state) => {
    const full = taken % Math.max(1, keyframeEvery) === 0 || state.companies.length !== objs.length;
    taken++;
    const cs = state.companies.map((c, i) => (!full && objs[i] === c ? rows[i]! : companyRow(c)));
    const ss = state.segments.map((x, i): SegmentRow => [i, x.holder, round(x.wireCut, 2), x.emerged]);
    const rs = state.reserves.map((r): ReserveRow => [r.formationId, r.status, r.orderedMin, r.arriveMin === null ? null : round(r.arriveMin, 1)]);
    const ts = state.tanks.map((t): TankRow => [t.id, round(t.x), round(t.y), t.status]);
    const bs = state.barrages.map((b): Barrage => {
      const sector = sectors.get(b.sectorId)!;
      return {
        sectorId: b.sectorId,
        done: b.phase === 'done',
        points: sampleYs(sector.yMin, sector.yMax).map((y) => [round(barrageXAt(b, sector, ctx.lines, state.minute, y), 1), round(y, 1)] as Point),
      };
    });
    const bj = bs.map((b) => JSON.stringify(b));
    const changed = <R>(now: R[], before: R[]): R[] => (full ? now : now.filter((r, i) => before[i] === undefined || !sameRow(r, before[i]!)));
    const snap: Snapshot = {
      minute: state.minute,
      ...(full ? {} : { delta: true as const }),
      companies: { columns: [...COMPANY_COLUMNS], rows: changed(cs, rows) },
      segments: { columns: [...SEGMENT_COLUMNS], rows: changed(ss, segRows) },
      reserves: { columns: [...RESERVE_COLUMNS], rows: changed(rs, resRows) },
      // Only a run with tanks has a tanks table (Task 14), so other records are as before; a delta in which no tank's row
      // changed leaves it out.
      ...((tankDelta) => (ts.length && (full || tankDelta.length) ? { tanks: { columns: [...TANK_COLUMNS], rows: tankDelta } } : {}))(changed(ts, tankRows)),
      barrages: full ? bs : bs.filter((_, i) => bj[i] !== bars[i]),
    };
    objs = state.companies;
    rows = cs;
    segRows = ss;
    resRows = rs;
    tankRows = ts;
    bars = bj;
    return snap;
  };
}

function companyRow(c: SimState['companies'][number]): CompanyRow {
  return [c.id, round(c.x), round(c.y), c.men, c.status, round(c.morale, 2), round(c.suppression, 2), c.posture, c.killed, c.wounded, c.captured, c.gapM === null ? null : round(c.gapM)];
}

const sameRow = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};

/**
 * Every snapshot in full: a delta snapshot's rows laid over the full one before it (rows by their key, in the keyframe's
 * order; a key new since then goes last). A record whose snapshots are all full (before engine 0.3.13) is given back as
 * it is.
 */
export function expandSnapshots(r: Pick<RunRecord, 'snapshots'>): Snapshot[] {
  if (!r.snapshots.some((s) => s.delta)) return r.snapshots;
  const out: Snapshot[] = [];
  let prev: Snapshot | undefined;
  for (const s of r.snapshots) {
    if (!s.delta || !prev) {
      const { delta: _d, ...whole } = s;
      out.push((prev = whole));
      continue;
    }
    const next: Snapshot = {
      minute: s.minute,
      companies: overlay(prev.companies, s.companies, 'id'),
      segments: overlay(prev.segments, s.segments, 'segment'),
      ...(prev.reserves || s.reserves ? { reserves: overlay(prev.reserves ?? { columns: s.reserves!.columns, rows: [] }, s.reserves ?? { columns: prev.reserves!.columns, rows: [] }, 'formationId') } : {}),
      ...(prev.tanks || s.tanks ? { tanks: overlay(prev.tanks ?? { columns: s.tanks!.columns, rows: [] }, s.tanks ?? { columns: prev.tanks!.columns, rows: [] }, 'id') } : {}),
      barrages: overlayBarrages(prev.barrages, s.barrages),
    };
    out.push((prev = next));
  }
  return out;
}

type Table = { columns: readonly string[]; rows: readonly (readonly unknown[])[] };
function overlay<T extends Table>(before: T, changes: T, key: string): T {
  const k = before.columns.indexOf(key);
  const kc = changes.columns.indexOf(key);
  const at = new Map(changes.rows.map((row) => [row[kc], row]));
  const rows = before.rows.map((row) => {
    const hit = at.get(row[k]);
    if (hit === undefined) return row;
    at.delete(row[k]);
    return hit;
  });
  for (const row of changes.rows) if (at.has(row[kc])) rows.push(row);
  return { ...before, columns: changes.columns, rows } as T;
}

function overlayBarrages(before: Snapshot['barrages'], changes: Snapshot['barrages']): Snapshot['barrages'] {
  const at = new Map(changes.map((b) => [b.sectorId, b]));
  const out = before.map((b) => at.get(b.sectorId) ?? b);
  for (const b of changes) if (!before.some((x) => x.sectorId === b.sectorId)) out.push(b);
  return out;
}

