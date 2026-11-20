import { describe, expect, it } from 'vitest';
import type { RunRecord } from '@wwi/engine';
import { fitView, recordBounds, worldToScreen } from './projection';

describe('projection', () => {
  it('fits bounds and flips y so north is up', () => {
    const v = fitView({ minX: 0, maxX: 1000, minY: 0, maxY: 500 }, 1048, 548, 24);
    expect(worldToScreen(v, [0, 500])).toEqual([24, 24]);
    expect(worldToScreen(v, [1000, 0])).toEqual([1024, 524]);
  });

  it('keeps the aspect ratio and centres the slack axis', () => {
    const v = fitView({ minX: 0, maxX: 1000, minY: 0, maxY: 100 }, 1048, 548, 24);
    expect(v.scale).toBe(1);
    expect(worldToScreen(v, [0, 50])).toEqual([24, 274]);
  });

  it('survives degenerate bounds', () => {
    const v = fitView({ minX: 5, maxX: 5, minY: 5, maxY: 5 }, 100, 100, 10);
    expect(Number.isFinite(v.scale)).toBe(true);
    expect(worldToScreen(v, [5, 5])).toEqual([50, 50]);
  });

  it('bounds cover lines, sectors, companies in every snapshot and the barrage band', () => {
    const r = {
      geometry: {
        lines: [{ id: 'a', name: 'A', kind: 'trench', side: 'allied', points: [[0, 0], [0, 1200]] }],
        sectors: [{ id: 's', yMin: -100, yMax: 1300 }],
      },
      snapshots: [
        { minute: 0, companies: [{ id: 'c', side: 'allied', x: -400, y: 10, strength: 1, status: 'waiting' }], barrages: [] },
        { minute: 10, companies: [{ id: 'c', side: 'allied', x: 900, y: 10, strength: 1, status: 'advancing' }],
          barrages: [{ sectorId: 's', points: [[1000, 0], [1000, 1200]] }] },
      ],
    } as unknown as RunRecord;
    expect(recordBounds(r)).toEqual({ minX: -400, maxX: 1090, minY: -100, maxY: 1300 });
  });
});
