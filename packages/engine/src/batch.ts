import { minutesBetween, v } from '@wwi/scenario';
import type { Scenario } from '@wwi/scenario';
import type { RunRecord } from './record';
import { runScenario } from './run';
import type { Models } from './run';
import { expandSnapshots } from './snapshots';
import type { Side } from './types';

/*
 * Batch v2 (Task 15): a batch of runs set against the scenario's historical targets, the only place the engine reads
 * `historical.*`. Each run is reduced to what the comparison needs (`extractRun`, which a worker thread can do and send
 * back), and the reductions are summarised in seed order (`summarizeBatch`), so the summary is the same however the runs
 * were shared out. Reported only: nothing is tuned (Global Constraints, "No tuning in this plan").
 */

export interface BatchLine {
  lineId: string;
  sectorId: string;
  takenIn: number;
  p10: number | null;
  median: number | null;
  p90: number | null;
  historicalEarliest: number | null;
  historicalLatest: number | null;
}

/** The batch's spread of a number over its runs. */
export type Spread = { p10: number; median: number; p90: number };

/** A target from `historical.*`: its value, and its range when the sources disagree (Disputed). */
export type Target = { value: number; range?: [number, number] };

/** A casualty target (`historical.casualties`): side, formation and window (minutes after Zero), beside the batch. */
export type CasualtyRow = Spread & { side: Side; formationId?: string; from: number; to: number; target: number; range?: [number, number]; pass: boolean | null };
/** A prisoners target (`historical.prisonersTaken`), by the side that took them; reported only (pass null). */
export type PrisonerRow = Spread & { bySide: Side; from: number; to: number; target: number; range?: [number, number]; pass: null };
/** Field guns captured (`historical.gunsCaptured.field`) in its window; reported only. */
export type GunsRow = Spread & { from: number; to: number; target: number; range?: [number, number]; pass: null };
/** When runs ended (minutes after Zero), beside `historical.endedAt`. */
export type DurationRow = Spread & { target: number | null; range?: [number, number]; pass: boolean | null };
/** The share of runs each side won (none: no side held more of the key ground), beside `historical.winner`. */
export type WinnerRow = { allied: number; central: number; none: number; historical: Side | null; pass: boolean | null };

export interface BatchSummary {
  runs: number;
  lines: BatchLine[];
  casualties: CasualtyRow[];
  prisoners: PrisonerRow[];
  gunsCaptured: GunsRow | null;
  duration: DurationRow;
  winner: WinnerRow;
}

/** What the batch needs of one run: its lines taken, its numbers for each target (in the targets' order), its end and winner. */
export type RunExtract = {
  seed: number;
  lineTaken: RunRecord['summary']['lineTaken'];
  casualties: number[];
  prisoners: number[];
  gunsCaptured: number | null;
  endedAt: number;
  winner: Side | null;
};

/** Linear-interpolation quantiles (qs in [0,1]) over the sorted values. */
export function quantiles(values: number[], qs: number[]): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  return qs.map((q) => {
    const pos = q * (sorted.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
  });
}

const spreadOf = (xs: number[]): Spread => {
  const [p10, median, p90] = quantiles(xs, [0.1, 0.5, 0.9]);
  return { p10: p10 ?? 0, median: median ?? 0, p90: p90 ?? 0 };
};

/** A Sourced or Disputed count or time as a target: its value, with the range of a disputed one. */
function targetOf<T>(x: { value: T; range?: [T, T] }, f: (t: T) => number): Target {
  return { value: f(x.value), ...(x.range ? { range: [f(x.range[0]), f(x.range[1])] as [number, number] } : {}) };
}

/**
 * Spec section 7's casualty criterion: the target inside the middle 80% of runs (p10–p90) and the median within ±25% of
 * it; for a disputed target, the median inside its range.
 */
export function casualtyPass(t: Target, s: Spread): boolean {
  if (t.range) return s.median >= t.range[0] && s.median <= t.range[1];
  return t.value >= s.p10 && t.value <= s.p90 && Math.abs(s.median - t.value) <= 0.25 * t.value;
}

/** Spec section 7's duration criterion: the median end within ±1 day of the historical one, or ±30% for a longer battle (of its range, for a disputed one). */
export function durationPass(t: Target, median: number): boolean {
  const tol = (x: number): number => Math.max(1440, 0.3 * x);
  const [lo, hi] = t.range ?? [t.value, t.value];
  return median >= lo - tol(lo) && median <= hi + tol(hi);
}

/** Minutes after Zero of a scenario time. */
const minuteOf = (s: Scenario, t: string): number => minutesBetween(v(s.zeroHour), t);

/**
 * Men a set of companies has lost by minute m (killed, wounded and captured, the bombardment's among them), as the run's
 * snapshots show it: at the last snapshot at or before m (snapshot resolution: 10 minutes while busy, 60 otherwise).
 */
function lostBy(snaps: RunRecord['snapshots'], ids: ReadonlySet<string>, m: number, what: 'lost' | 'captured'): number {
  let at = snaps[0]!;
  for (const x of snaps) {
    if (x.minute > m) break;
    at = x;
  }
  const t = at.companies;
  const col = (n: string): number => (t.columns as readonly string[]).indexOf(n);
  const [id, k, w, c] = [col('id'), col('killed'), col('wounded'), col('captured')];
  let n = 0;
  for (const row of t.rows) if (ids.has(row[id] as string)) n += what === 'captured' ? (row[c] as number) : (row[k] as number) + (row[w] as number) + (row[c] as number);
  return n;
}

/** Losses in a window: by its end, less those by its start (from Zero on: the bombardment counts only in a window that starts before Zero). */
function inWindow(snaps: RunRecord['snapshots'], ids: ReadonlySet<string>, from: number, to: number, what: 'lost' | 'captured'): number {
  const base = from < 0 ? 0 : lostBy(snaps, ids, from, what);
  return lostBy(snaps, ids, to, what) - base;
}

/** One run reduced to the batch's measures against the scenario's targets. */
export function extractRun(s: Scenario, r: RunRecord): RunExtract {
  const h = s.historical;
  const snaps = expandSnapshots(r);
  const units = (side: Side, formationId?: string) =>
    new Set(r.units.filter((u) => u.side === side && (formationId === undefined || (u.formationPath ?? [u.battalionId]).includes(formationId))).map((u) => u.id));
  const g = h.gunsCaptured;
  return {
    seed: r.seed,
    lineTaken: r.summary.lineTaken,
    casualties: h.casualties.map((t) => inWindow(snaps, units(t.side, t.formationId), minuteOf(s, t.window.from), minuteOf(s, t.window.to), 'lost')),
    // Prisoners taken by a side: the other side's men captured.
    prisoners: h.prisonersTaken.map((t) => inWindow(snaps, units(t.bySide === 'allied' ? 'central' : 'allied'), minuteOf(s, t.window.from), minuteOf(s, t.window.to), 'captured')),
    gunsCaptured: g
      ? r.events.filter((e) => e.kind === 'guns-captured' && e.minute >= minuteOf(s, g.window.from) && e.minute <= minuteOf(s, g.window.to)).reduce((a, e) => a + (e.factors?.guns ?? 0), 0)
      : null,
    endedAt: r.summary.endedAt,
    winner: r.summary.winner,
  };
}

/** The batch summary from its runs' extracts, taken in seed order. */
export function summarizeBatch(s: Scenario, runs: RunExtract[]): BatchSummary {
  const ordered = [...runs].sort((a, b) => a.seed - b.seed);
  const h = s.historical;
  const zero = v(s.zeroHour);
  const rows = new Map<string, { lineId: string; sectorId: string; times: number[]; hist: [number, number] | null }>();
  const row = (lineId: string, sectorId: string) => {
    const key = `${lineId}|${sectorId}`;
    let r = rows.get(key);
    if (!r) rows.set(key, (r = { lineId, sectorId, times: [], hist: null }));
    return r;
  };
  for (const o of h.objectives) row(o.lineId, o.sectorId).hist = [minutesBetween(zero, v(o.earliest)), minutesBetween(zero, v(o.latest))];
  for (const run of ordered) for (const t of run.lineTaken) row(t.lineId, t.sectorId).times.push(t.minute);
  const lines = [...rows.values()].map((r) => {
    const [p10, median, p90] = quantiles(r.times, [0.1, 0.5, 0.9]);
    return {
      lineId: r.lineId,
      sectorId: r.sectorId,
      takenIn: r.times.length,
      p10: p10 ?? null,
      median: median ?? null,
      p90: p90 ?? null,
      historicalEarliest: r.hist?.[0] ?? null,
      historicalLatest: r.hist?.[1] ?? null,
    };
  });

  const count = (x: Parameters<typeof targetOf<number>>[0]) => targetOf(x, (n) => n);
  const casualties = h.casualties.map((t, i): CasualtyRow => {
    const sp = spreadOf(ordered.map((r) => r.casualties[i]!));
    const target = count(t.total);
    return {
      side: t.side,
      ...(t.formationId !== undefined ? { formationId: t.formationId } : {}),
      from: minuteOf(s, t.window.from),
      to: minuteOf(s, t.window.to),
      target: target.value,
      ...(target.range ? { range: target.range } : {}),
      ...sp,
      pass: ordered.length ? casualtyPass(target, sp) : null,
    };
  });
  const prisoners = h.prisonersTaken.map((t, i): PrisonerRow => {
    const target = count(t.count);
    return { bySide: t.bySide, from: minuteOf(s, t.window.from), to: minuteOf(s, t.window.to), target: target.value, ...(target.range ? { range: target.range } : {}), ...spreadOf(ordered.map((r) => r.prisoners[i]!)), pass: null };
  });
  const g = h.gunsCaptured;
  const gunsCaptured: GunsRow | null = g
    ? ((target) => ({ from: minuteOf(s, g.window.from), to: minuteOf(s, g.window.to), target: target.value, ...(target.range ? { range: target.range } : {}), ...spreadOf(ordered.map((r) => r.gunsCaptured ?? 0)), pass: null }))(count(g.field))
    : null;
  const ended = spreadOf(ordered.map((r) => r.endedAt));
  const endTarget = h.endedAt ? targetOf(h.endedAt, (t) => minutesBetween(zero, t)) : null;
  const duration: DurationRow = { target: endTarget?.value ?? null, ...(endTarget?.range ? { range: endTarget.range } : {}), ...ended, pass: endTarget && ordered.length ? durationPass(endTarget, ended.median) : null };
  const share = (w: Side | null) => (ordered.length ? ordered.filter((r) => r.winner === w).length / ordered.length : 0);
  const historical = h.winner ? v(h.winner) : null;
  const winner: WinnerRow = { allied: share('allied'), central: share('central'), none: share(null), historical, pass: historical && ordered.length ? share(historical) > 0.5 : null };
  return { runs: ordered.length, lines, casualties, prisoners, gunsCaptured, duration, winner };
}

/** Run the seeds in this process and summarise them. */
export function runBatch(s: Scenario, models: Models, seeds: number[]): BatchSummary {
  return summarizeBatch(
    s,
    seeds.map((seed) => extractRun(s, runScenario(s, models, { seed }))),
  );
}
