import type { FeatureKind } from '@wwi/scenario';
import type { Screen } from './declutter';

/** The trench-map palette: inks on aged paper. */
export const MAP_COLORS = {
  paper: '#efe6cf',
  ink: '#3b3326',
  allied: '#1f4e8c',
  central: '#c0392b',
  /** Outline of German company markers. */
  centralEdge: '#8e2418',
  hatch: '#c9a24a',
  wood: '#56642e',
  sepia: '#7a6034',
  /** German battalion blocks in the period style: dark field grey, edged in red. */
  german: '#454a44',
} as const;

/** Radius a point feature is drawn with when it gives none, metres. */
export const DEFAULT_RADIUS_M: Partial<Record<FeatureKind, number>> = { wood: 60, village: 50, crater: 10 };

export const LABEL_FONT = '"EB Garamond", Garamond, "Iowan Old Style", Georgia, serif';
export const MARKER_FONT = '"Barlow Condensed", "Arial Narrow", "Roboto Condensed", system-ui, sans-serif';

/** The ink of a side: blue for allied, red for central, plain ink for neither. */
export function sideColor(side: 'allied' | 'central' | undefined): string {
  return side === 'central' ? MAP_COLORS.central : side === 'allied' ? MAP_COLORS.allied : MAP_COLORS.ink;
}

export function tracePath(ctx: CanvasRenderingContext2D, pts: Screen[]): void {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
}

/** A square wave of ±amp either side of a screen polyline, flipping every `half` pixels. */
export function crenellatedPath(pts: Screen[], half: number, amp: number): Screen[] {
  const out: Screen[] = [];
  let sign = 1;
  let phase = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[i + 1]!;
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len === 0) continue;
    const ux = (x1 - x0) / len;
    const uy = (y1 - y0) / len;
    const nx = -uy;
    const ny = ux;
    const at = (s: number): Screen => [x0 + ux * s + nx * amp * sign, y0 + uy * s + ny * amp * sign];
    if (out.length === 0) out.push(at(0));
    let s = 0;
    while (phase + (len - s) > half) {
      s += half - phase;
      phase = 0;
      out.push(at(s));
      sign = -sign;
      out.push(at(s));
    }
    phase += len - s;
    out.push(at(len));
  }
  return out;
}

/**
 * Points every `spacing` pixels along a screen polyline (starting half a spacing in), each with the
 * unit direction of the segment it lies on.
 */
export function alongPath(pts: Screen[], spacing: number): Array<{ at: Screen; dir: Screen }> {
  const out: Array<{ at: Screen; dir: Screen }> = [];
  let next = spacing / 2;
  let walked = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[i + 1]!;
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len === 0) continue;
    const dir: Screen = [(x1 - x0) / len, (y1 - y0) / len];
    while (next <= walked + len) {
      const s = next - walked;
      out.push({ at: [x0 + dir[0] * s, y0 + dir[1] * s], dir });
      next += spacing;
    }
    walked += len;
  }
  return out;
}
