import { describe, expect, it } from 'vitest';
import { crenellatedPath, niceScaleLength, shortId } from './draw';

describe('map drawing helpers', () => {
  it('shortens company ids for markers', () => {
    expect(shortId('16bn-a')).toBe('16A');
    expect(shortId('1bn-d')).toBe('1D');
    expect(shortId('alpha')).toBe('ALP');
  });

  it('crenellates a straight line into a square wave either side of it', () => {
    const pts = crenellatedPath([[0, 0], [0, -20]], 5, 2);
    const xs = new Set(pts.map((p) => p[0]));
    expect(xs).toEqual(new Set([2, -2]));
    expect(pts[0]).toEqual([2, 0]);
    expect(pts[pts.length - 1]![1]).toBe(-20);
    // four half-periods → a riser at each of the three boundaries between them
    expect(pts.filter((p, i) => i > 0 && p[1] === pts[i - 1]![1]).length).toBe(3);
  });

  it('picks a round scale-bar length near the target width', () => {
    expect(niceScaleLength(0.2, 120)).toBe(500);
    expect(niceScaleLength(1, 120)).toBe(100);
    expect(niceScaleLength(0.05, 120)).toBe(2000);
  });
});
