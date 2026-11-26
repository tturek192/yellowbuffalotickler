import { describe, it, expect } from 'vitest';
import { MAPS, parseMap, terrainAt } from './map';

describe('maps', () => {
  it('the four ready-made maps parse and are sized as planned', () => {
    expect(MAPS.map(m => m.id).sort()).toEqual(['open', 'ridge', 'river', 'wooded-hill']);
    for (const m of MAPS) {
      expect(m.w).toBeGreaterThanOrEqual(60); expect(m.w).toBeLessThanOrEqual(120);
      expect(m.h).toBeGreaterThanOrEqual(40); expect(m.h).toBeLessThanOrEqual(80);
      expect(m.strongholds.length).toBeGreaterThanOrEqual(1);
      expect(m.cells.length).toBe(m.w * m.h);
    }
  });
  it('the ridge rises at least 40 m from edge to crest', () => {
    const m = MAPS.find(x => x.id === 'ridge')!;
    const hs = m.cells.map(c => c.h);
    expect(Math.max(...hs) - Math.min(...hs)).toBeGreaterThanOrEqual(40);
  });
  it('the river map has a continuous river and a road crossing', () => {
    const m = MAPS.find(x => x.id === 'river')!;
    for (let y = 0; y < m.h; y++) {
      const row = m.cells.slice(y * m.w, (y + 1) * m.w);
      expect(row.some(c => c.t === 'river' || c.t === 'road')).toBe(true);
    }
    const crossings = Array.from({ length: m.h }, (_, y) => m.cells.slice(y * m.w, (y + 1) * m.w)).filter(r => r.some(c => c.t === 'road') && !r.some(c => c.t === 'river'));
    expect(crossings.length).toBeGreaterThanOrEqual(1);
  });
  it('terrainAt reads metres', () => {
    const m = MAPS[0]; expect(terrainAt(m, 150, 250)).toBe(m.cells[2 * m.w + 1]);
  });
  it('parseMap rejects a wrong-length cells array, naming the field', () => {
    const m = { ...MAPS[0], cells: MAPS[0].cells.slice(1) };
    expect(() => parseMap(m)).toThrow(/cells/);
  });
});
