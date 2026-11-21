import { describe, expect, it } from 'vitest';
import type { RunRecord, SimEvent } from '@wwi/engine';
import { advancePlayhead, seek, formatClock, frameAt, isQuiet, timelineMarkers } from './index';
import { companyTable, unitsFor, type TestCompany } from '../test-record';

function recordWith(
  points: Array<{ minute: number; x: number }>,
  events: Array<Partial<SimEvent> & { minute: number; kind: SimEvent['kind'] }> = [{ minute: 0, kind: 'zero-hour' }],
): RunRecord {
  const c1 = (x: number): TestCompany => ({ id: 'c1', side: 'allied', x, y: 0, men: 100, status: 'advancing' });
  return {
    engineVersion: 'test', scenarioId: 't', scenarioTitle: 't', scenarioStatus: 'draft', seed: 1,
    zeroHour: '1917-04-09T05:30', stepMin: 1, endMinute: points[points.length - 1]!.minute,
    geometry: { lines: [], sectors: [], features: [] },
    units: unitsFor([c1(0)]),
    snapshots: points.map((p) => ({
      minute: p.minute,
      companies: companyTable([c1(p.x)]),
      barrages: [],
    })),
    events: events.map((e, i) => ({ id: i, text: e.kind, causes: [], refs: [], ...e })),
    summary: { lineTaken: [] },
  } as RunRecord;
}

describe('playback', () => {
  it('advances by speed × dt, ×10 when quiet', () => {
    expect(advancePlayhead(0, 1, 10, false, 1000)).toEqual({ minute: 10, ended: false });
    expect(advancePlayhead(0, 1, 10, true, 1000)).toEqual({ minute: 100, ended: false });
  });
  it('clamps at the end and reports ended; seek clamps both ways (Review Focus 4)', () => {
    expect(advancePlayhead(995, 1, 360, false, 1000)).toEqual({ minute: 1000, ended: true });
    expect(advancePlayhead(1000, 1, 1, false, 1000)).toEqual({ minute: 1000, ended: true });
    expect(seek(-5, 1000)).toBe(0);
    expect(seek(5000, 1000)).toBe(1000);
  });
  it('interpolates company positions between snapshots', () => {
    const r = recordWith([{ minute: 0, x: 0 }, { minute: 10, x: 100 }]);
    expect(frameAt(r, 5).companies[0]!.x).toBe(50);
  });
  it('handles a one-snapshot, no-event record (Review Focus 5)', () => {
    const r = recordWith([{ minute: 0, x: 0 }], []);
    expect(frameAt(r, 0).companies[0]!.x).toBe(0);
    expect(frameAt(r, 99).companies[0]!.x).toBe(0);
    expect(timelineMarkers(r)).toEqual([]);
    expect(isQuiet(r, 0)).toBe(true);
  });
  it('quiet only when nothing moves and no events nearby', () => {
    const r = recordWith([{ minute: 0, x: 0 }, { minute: 100, x: 0 }, { minute: 200, x: 500 }], [{ minute: 10, kind: 'zero-hour' }]);
    expect(isQuiet(r, 20)).toBe(false);
    expect(isQuiet(r, 60)).toBe(true);
    expect(isQuiet(r, 150)).toBe(false);
  });
  it('takes status from the earlier snapshot and interpolates barrages', () => {
    const r = recordWith([{ minute: 0, x: 0 }, { minute: 10, x: 10 }]);
    r.snapshots[0]!.barrages = [{ sectorId: 's', done: false, points: [[0, 0]] }];
    r.snapshots[1]!.barrages = [{ sectorId: 's', done: false, points: [[10, 20]] }];
    r.snapshots[1]!.companies.rows[0]![4] = 'consolidating';
    const f = frameAt(r, 5);
    expect(f.companies[0]!.status).toBe('advancing');
    expect(f.barrages[0]!.points[0]).toEqual([5, 10]);
  });
  it('marks a barrage done from the minute its barrage-done event says it ended', () => {
    const r = recordWith([{ minute: 0, x: 0 }, { minute: 10, x: 10 }, { minute: 20, x: 20 }], [
      { minute: 0, kind: 'zero-hour' },
      { minute: 13, kind: 'barrage-done', sectorId: 's' },
    ]);
    r.snapshots.forEach((snap) => (snap.barrages = [{ sectorId: 's', done: snap.minute >= 13, points: [[1330, 0]] }]));
    expect(frameAt(r, 5).barrages[0]!.done).toBe(false);
    expect(frameAt(r, 12).barrages[0]!.done).toBe(false);
    expect(frameAt(r, 13).barrages[0]!.done).toBe(true);
    expect(frameAt(r, 15).barrages[0]!.done).toBe(true);
    expect(frameAt(r, 25).barrages[0]!.done).toBe(true);
  });
  it('builds zero and line-taken markers in time order', () => {
    const r = recordWith([{ minute: 0, x: 0 }], [
      { minute: 90, kind: 'line-taken', text: 'Blue Line taken' },
      { minute: 0, kind: 'zero-hour' },
      { minute: 40, kind: 'line-taken', text: 'Black Line taken' },
      { minute: 50, kind: 'barrage-done' },
    ]);
    expect(timelineMarkers(r)).toEqual([
      { minute: 0, label: 'Zero hour', kind: 'zero' },
      { minute: 40, label: 'Black Line taken', kind: 'line-taken' },
      { minute: 90, label: 'Blue Line taken', kind: 'line-taken' },
    ]);
  });
  it('formats the battle clock', () => {
    expect(formatClock('1917-04-09T05:30', 55)).toBe('Mon 9 Apr · 06:25');
    expect(formatClock('1917-04-09T23:30', 90)).toBe('Tue 10 Apr · 01:00');
  });
});
