import { describe, expect, it } from 'vitest';
import { fitView, worldToScreen, type Bounds, type View } from './projection';
import { clampView, detailAt, MAX_SCALE, panBy, pinchFactor, wheelFactor, zoomAt, zoomBy } from './zoom';

const bounds: Bounds = { minX: -6000, maxX: 7700, minY: -5000, maxY: 3200 };
const size = { w: 1000, h: 700 };
const fit = fitView(bounds, size.w, size.h, 24);
/** A view that shows `metres` across the full width of the viewport. */
const zoomedTo = (metres: number): View => ({ ...fit, scale: size.w / metres });

describe('level of detail', () => {
  it('shows battalions at corps zoom and companies when zoomed in', () => {
    expect(detailAt(fit)).toBe('battalion');
    expect(detailAt(zoomedTo(2000))).toBe('company');
  });
  it('switches where 1 km is 250 px wide', () => {
    expect(detailAt({ ...fit, scale: 0.25 })).toBe('battalion');
    expect(detailAt({ ...fit, scale: 0.2501 })).toBe('company');
  });
});

describe('zoom limits', () => {
  it('never zooms out past fit-all', () => {
    const v = zoomAt(zoomedTo(4000), fit, [500, 350], 1e-6, size, bounds);
    expect(v).toEqual(fit);
  });
  it('never zooms in past 200 m across 400 px', () => {
    expect(MAX_SCALE).toBe(2);
    const v = zoomAt(zoomedTo(4000), fit, [500, 350], 1e6, size, bounds);
    expect(v.scale).toBe(2);
  });
});

describe('zoom about the cursor', () => {
  it('keeps the world point under the cursor fixed', () => {
    const start = zoomedTo(5000);
    const at: [number, number] = [300, 200];
    const world = (v: View): [number, number] => [(at[0] - v.tx) / v.scale, (v.ty - at[1]) / v.scale];
    const [x0, y0] = world(start);
    const next = zoomAt(start, fit, at, 1.7, size, bounds);
    expect(next.scale).toBeCloseTo(start.scale * 1.7);
    const [x1, y1] = world(next);
    expect(x1).toBeCloseTo(x0, 6);
    expect(y1).toBeCloseTo(y0, 6);
    expect(worldToScreen(next, [x0, y0])[0]).toBeCloseTo(at[0]);
  });
  it('zooms in and back out again to the same view', () => {
    const start = zoomedTo(5000);
    const out = zoomAt(zoomAt(start, fit, [420, 310], 2, size, bounds), fit, [420, 310], 0.5, size, bounds);
    expect(out.scale).toBeCloseTo(start.scale);
    expect(out.tx).toBeCloseTo(start.tx, 6);
    expect(out.ty).toBeCloseTo(start.ty, 6);
  });
  it('zooms the buttons about the middle of the viewport', () => {
    const v = zoomBy(fit, fit, 2, size, bounds);
    expect(v.scale).toBeCloseTo(fit.scale * 2);
    const mid = size.w / 2;
    expect((mid - v.tx) / v.scale).toBeCloseTo((mid - fit.tx) / fit.scale, 6);
  });
});

describe('pan', () => {
  it('drags the map with the pointer', () => {
    const start = clampView(zoomedTo(3000), fit, bounds, size);
    const moved = panBy(start, fit, 30, -20, size, bounds);
    expect(moved.tx - start.tx).toBeCloseTo(30);
    expect(moved.ty - start.ty).toBeCloseTo(-20);
  });
  it('cannot pan at fit-all, and cannot carry the map away when zoomed', () => {
    expect(panBy(fit, fit, 400, 400, size, bounds)).toEqual(fit);
    const far = panBy(zoomedTo(3000), fit, 1e7, 1e7, size, bounds);
    const cx = (size.w / 2 - far.tx) / far.scale;
    const cy = (far.ty - size.h / 2) / far.scale;
    expect(cx).toBeGreaterThanOrEqual(bounds.minX - 1e-6);
    expect(cy).toBeLessThanOrEqual(bounds.maxY + 1e-6);
  });
});

describe('gestures', () => {
  it('turns wheel travel into a smooth, symmetric factor', () => {
    expect(wheelFactor(0, 0)).toBe(1);
    expect(wheelFactor(-100, 0)).toBeGreaterThan(1);
    expect(wheelFactor(100, 0) * wheelFactor(-100, 0)).toBeCloseTo(1);
    // line-mode wheels (Firefox) count as about 16 px a line
    expect(wheelFactor(-3, 1)).toBeCloseTo(wheelFactor(-48, 0));
  });
  it('zooms a pinch by the ratio of finger spans', () => {
    expect(pinchFactor(100, 200)).toBe(2);
    expect(pinchFactor(0, 200)).toBe(1);
  });
});
