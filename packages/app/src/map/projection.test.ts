import { describe, expect, it } from 'vitest';
import type { RunRecord } from '@wwi/engine';
import { fitView, recordBounds, worldToScreen } from './projection';
import { companyTable, unitsFor } from '../test-record';

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
        features: [],
      },
      units: unitsFor([{ id: 'c', side: 'allied', x: 0, y: 0, men: 1, status: 'waiting' }]),
      snapshots: [
        { minute: 0, companies: companyTable([{ id: 'c', side: 'allied', x: -400, y: 10, men: 1, status: 'waiting' }]), barrages: [] },
        { minute: 10, companies: companyTable([{ id: 'c', side: 'allied', x: 900, y: 10, men: 1, status: 'advancing' }]),
          barrages: [{ sectorId: 's', points: [[1000, 0], [1000, 1200]] }] },
      ],
    } as unknown as RunRecord;
    expect(recordBounds(r)).toEqual({ minX: -400, maxX: 1090, minY: -100, maxY: 1300 });
  });

  it('bounds cover every feature geometry, including a crater radius', () => {
    const r = {
      geometry: {
        lines: [{ id: 'a', name: 'A', kind: 'trench', points: [[0, 0], [0, 100]] }],
        sectors: [],
        features: [
          { id: 'w', kind: 'wood', geometry: { type: 'Polygon', coordinates: [[-50, 10], [20, -300], [40, 30]] } },
          { id: 't', kind: 'trench', geometry: { type: 'LineString', coordinates: [[10, 10], [700, 20]] } },
          { id: 'k', kind: 'crater', geometry: { type: 'Point', coordinates: [100, 400], radiusM: 25 } },
          { id: 'b', kind: 'battery', geometry: { type: 'Point', coordinates: [-200, 50] } },
        ],
      },
      units: [],
      snapshots: [{ minute: 0, companies: companyTable([]), barrages: [] }],
    } as unknown as RunRecord;
    expect(recordBounds(r)).toEqual({ minX: -200, maxX: 700, minY: -300, maxY: 425 });
  });

  it('bounds cover the radius a point wood, village or crater is drawn with when it gives none', () => {
    const r = {
      geometry: {
        lines: [{ id: 'a', name: 'A', kind: 'trench', points: [[0, 0], [0, 100]] }],
        sectors: [],
        features: [
          { id: 'w', kind: 'wood', geometry: { type: 'Point', coordinates: [1000, 50] } },
          { id: 'v', kind: 'village', geometry: { type: 'Point', coordinates: [-500, 50] } },
          { id: 'k', kind: 'crater', geometry: { type: 'Point', coordinates: [0, 300] } },
        ],
      },
      units: [],
      snapshots: [{ minute: 0, companies: companyTable([]), barrages: [] }],
    } as unknown as RunRecord;
    expect(recordBounds(r)).toEqual({ minX: -550, maxX: 1060, minY: -10, maxY: 310 });
  });
});
