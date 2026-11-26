import { describe, it, expect } from 'vitest';
import { recordingContext } from '../test-canvas';
import { MAPS, defaultSetup, startBattle } from '@wwi/sandbox';
import { drawSandbox, drawTerrain, fitView, toMetres } from './drawSandbox';

describe('drawSandbox', () => {
  it('draws every unit and line and returns a hit box per unit', () => {
    const b = startBattle(defaultSetup('ridge'), 1);
    const { ctx, count } = recordingContext(900, 600);
    const v = fitView(b.map, 900);
    const out = drawSandbox(ctx, v, { map: b.map, units: b.units, lines: b.lines, creepX: b.creepX, dir: b.dir, pointBarrages: [] });
    expect(out.boxes.map(x => x.id).sort()).toEqual(b.units.map(u => u.id).sort());
    expect(count('stroke')).toBeGreaterThanOrEqual(b.lines.length);
  });
  it('terrain draws one rectangle per cell', () => {
    const m = MAPS[0]; const { ctx, count } = recordingContext(900, 600);
    drawTerrain(ctx, fitView(m, 900), m);
    expect(count('fillRect')).toBeGreaterThanOrEqual(m.w * m.h);
  });
  it('screen and map coordinates round-trip', () => {
    const v = fitView(MAPS[0], 450); const p = toMetres(v, 225, 100);
    expect(Math.round(p.x)).toBe(4500); expect(Math.round(p.y)).toBe(2000);
  });
});
