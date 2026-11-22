import type { RunRecord, SegmentRow, SimEvent, Snapshot } from '@wwi/engine';
import type { Feature } from '@wwi/scenario';
import { companyTable, unitsFor, type TestCompany } from './test-record';

const cite = { value: 'schematic', estimate: 'test fixture' };

/** A German trench as a feature: a straight north–south line at x from y0 to y1. */
export const trenchAt = (id: string, x: number, y0 = 0, y1 = 800): Feature => ({ id, kind: 'trench', side: 'central', geometry: { type: 'LineString', coordinates: [[x, y0], [x, y1]] }, cite });

export type TestSnapshot = { minute: number; companies: TestCompany[]; segments?: Array<[holder: SegmentRow[1], wireCut?: number]>; reserves?: Snapshot['reserves']; barrages?: Snapshot['barrages'] };

/**
 * A small battle as a record (app tests): German trenches as features, one segment per feature (whole length), the
 * given snapshots and events. Every company appears in the first snapshot.
 */
export function battleRecord(o: { features: Feature[]; snapshots: TestSnapshot[]; events?: Array<Partial<SimEvent> & Pick<SimEvent, 'kind' | 'minute'>>; endMinute?: number; extra?: Partial<RunRecord> }): RunRecord {
  const segments = o.features
    .filter((f) => f.kind === 'trench')
    .map((f) => {
      const ys = (f.geometry.type === 'Point' ? [f.geometry.coordinates] : f.geometry.coordinates).map((p) => p[1]);
      return { id: `${f.id}:001`, featureId: f.id, garrisonIds: [], yMin: Math.min(...ys), yMax: Math.max(...ys), lengthM: Math.max(...ys) - Math.min(...ys) };
    });
  const events = (o.events ?? []).map((e, id): SimEvent => ({ id, text: `${e.kind} ${id}`, causes: [], refs: [], ...e }) as SimEvent);
  return {
    engineVersion: '0.4.4',
    scenarioId: 'x',
    scenarioTitle: 'X',
    scenarioStatus: 'draft',
    seed: 1,
    zeroHour: '1917-04-09T05:30',
    stepMin: 2,
    endMinute: o.endMinute ?? o.snapshots.at(-1)!.minute,
    geometry: { lines: [], sectors: [{ id: 's1', yMin: 0, yMax: 800 }], features: o.features, segments, barrageDepthM: { band: 90, mg: 400 } },
    units: unitsFor(...o.snapshots.map((s) => s.companies)),
    snapshots: o.snapshots.map((s) => ({
      minute: s.minute,
      companies: companyTable(s.companies),
      segments: { columns: ['segment', 'holder', 'wireCut', 'emerged'], rows: segments.map((_, i): SegmentRow => [i, s.segments?.[i]?.[0] ?? 'central', s.segments?.[i]?.[1] ?? 0, false]) },
      ...(s.reserves ? { reserves: s.reserves } : {}),
      barrages: s.barrages ?? [],
    })),
    events,
    summary: { lineTaken: [] },
    defaultsUsed: [],
    ...o.extra,
  } as unknown as RunRecord;
}
