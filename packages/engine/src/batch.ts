import { minutesBetween, v } from '@wwi/scenario';
import type { Doctrine, Scenario } from '@wwi/scenario';
import { runScenario } from './run';

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

export interface BatchSummary {
  runs: number;
  lines: BatchLine[];
}

/** Linear-interpolation quantiles (qs in [0,1]) over the sorted values. */
export function quantiles(values: number[], qs: number[]): number[] {
  if (values.length === 0) return [];
  const sorted = [...values].sort((a, b) => a - b);
  return qs.map((q) => {
    const pos = q * (sorted.length - 1);
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  });
}

export function runBatch(s: Scenario, doctrines: Record<string, Doctrine>, seeds: number[]): BatchSummary {
  const zero = v(s.zeroHour);
  const rows = new Map<string, { lineId: string; sectorId: string; times: number[]; hist: [number, number] | null }>();
  const row = (lineId: string, sectorId: string) => {
    const key = `${lineId}|${sectorId}`;
    let r = rows.get(key);
    if (!r) rows.set(key, (r = { lineId, sectorId, times: [], hist: null }));
    return r;
  };
  for (const o of s.historical.objectives) {
    row(o.lineId, o.sectorId).hist = [minutesBetween(zero, v(o.earliest)), minutesBetween(zero, v(o.latest))];
  }
  for (const seed of seeds) {
    for (const t of runScenario(s, doctrines, { seed }).summary.lineTaken) {
      row(t.lineId, t.sectorId).times.push(t.minute);
    }
  }
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
  return { runs: seeds.length, lines };
}
