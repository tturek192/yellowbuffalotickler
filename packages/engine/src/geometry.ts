import type { Point } from '@wwi/scenario';

/**
 * Linear interpolation of x along a polyline sorted by y.
 * Clamps to the first or last point when y lies outside the line's y extent.
 */
export function lineXAt(points: Point[], y: number): number {
  const first = points[0];
  const last = points[points.length - 1];
  if (!first || !last) throw new RangeError('lineXAt requires at least one point');
  if (y <= first[1]) return first[0];
  if (y >= last[1]) return last[0];
  // Indexed reads, not destructuring: this runs millions of times a run, and destructuring allocates an iterator.
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const x0 = a[0];
    const y0 = a[1];
    const x1 = b[0];
    const y1 = b[1];
    if (y >= y0 && y <= y1) {
      if (y1 === y0) return x0;
      return x0 + ((y - y0) / (y1 - y0)) * (x1 - x0);
    }
  }
  return last[0];
}

/** n evenly spaced y values spanning [yMin, yMax] inclusively. */
export function sampleYs(yMin: number, yMax: number, n = 9): number[] {
  if (n < 2) return [yMin];
  const step = (yMax - yMin) / (n - 1);
  return Array.from({ length: n }, (_, i) => (i === n - 1 ? yMax : yMin + i * step));
}

/**
 * The length of (dx, dy): √(dx² + dy²). Not Math.hypot, whose results are boxed numbers and which the engine calls
 * millions of times a run (it guards against overflow at magnitudes no battlefield reaches).
 */
export const dist = (dx: number, dy: number): number => Math.sqrt(dx * dx + dy * dy);
