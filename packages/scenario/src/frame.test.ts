import { describe, it, expect } from 'vitest';
import { projectLonLat, unprojectXY } from './frame';

const frame = { origin: { lon: 2.7735, lat: 50.3796 }, bearingDeg: { value: 90, estimate: 'test' }, extent: { minX: -5000, maxX: 9000, minY: -6000, maxY: 6000 } };

describe('frame', () => {
  it('projects east of the origin onto +x for an eastward attack, and round-trips', () => {
    const p = projectLonLat(frame, [2.7735 + 0.01, 50.3796]);
    expect(p[0]).toBeCloseTo(0.01 * 111320 * Math.cos((50.3796 * Math.PI) / 180), 1);
    expect(p[1]).toBeCloseTo(0, 6);
    const back = unprojectXY(frame, p);
    expect(back[0]).toBeCloseTo(2.7835, 9);
    expect(back[1]).toBeCloseTo(50.3796, 9);
  });
  it('rotates by the bearing: with bearing 0 (northward attack), north maps to +x', () => {
    const p = projectLonLat({ ...frame, bearingDeg: { value: 0, estimate: 't' } }, [2.7735, 50.3796 + 0.01]);
    expect(p[0]).toBeCloseTo(1105.4, 1);
    expect(p[1]).toBeCloseTo(0, 6);
  });
  it('round-trips at an oblique bearing', () => {
    const f = { ...frame, bearingDeg: { value: 73, estimate: 't' } };
    const b = unprojectXY(f, projectLonLat(f, [2.79, 50.39]));
    expect(b[0]).toBeCloseTo(2.79, 9);
    expect(b[1]).toBeCloseTo(50.39, 9);
  });
});
