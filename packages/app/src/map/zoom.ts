import type { Bounds, View } from './projection';

/** Closest zoom: 200 m across 400 px. */
export const MAX_SCALE = 400 / 200;

/** The closest a view may zoom: MAX_SCALE, or fit-all when that is already closer. */
export const maxScale = (fit: View): number => Math.max(MAX_SCALE, fit.scale);
/** Companies are drawn once 1 km is wider than this many pixels; battalions before that. */
export const COMPANY_DETAIL_PX_PER_KM = 250;

export type Detail = 'battalion' | 'company';
export type Viewport = { w: number; h: number };

/** Spec 9.2: the corps view shows battalions; zooming in breaks them into companies. */
export function detailAt(view: View): Detail {
  return view.scale * 1000 > COMPANY_DETAIL_PX_PER_KM ? 'company' : 'battalion';
}

/**
 * Hold a view inside the limits: no further out than `fit` (fit-all, where there is nothing to pan), no further in than
 * MAX_SCALE, and the middle of the viewport somewhere over the map's bounds so it can never be carried away.
 */
export function clampView(view: View, fit: View, bounds: Bounds, size: Viewport): View {
  const scale = Math.min(Math.max(view.scale, fit.scale), maxScale(fit));
  if (scale <= fit.scale) return fit;
  const cx = Math.min(Math.max((size.w / 2 - view.tx) / view.scale, bounds.minX), bounds.maxX);
  const cy = Math.min(Math.max((view.ty - size.h / 2) / view.scale, bounds.minY), bounds.maxY);
  return { scale, tx: size.w / 2 - cx * scale, ty: size.h / 2 + cy * scale };
}

/** Zoom by `factor` keeping the world point under screen position `at` where it is. */
export function zoomAt(view: View, fit: View, at: readonly [number, number], factor: number, size: Viewport, bounds: Bounds): View {
  const scale = Math.min(Math.max(view.scale * factor, fit.scale), maxScale(fit));
  const wx = (at[0] - view.tx) / view.scale;
  const wy = (view.ty - at[1]) / view.scale;
  return clampView({ scale, tx: at[0] - wx * scale, ty: at[1] + wy * scale }, fit, bounds, size);
}

/** Zoom about the middle of the viewport (the + and − buttons). */
export function zoomBy(view: View, fit: View, factor: number, size: Viewport, bounds: Bounds): View {
  return zoomAt(view, fit, [size.w / 2, size.h / 2], factor, size, bounds);
}

/** Drag the map by (dx, dy) screen pixels. */
export function panBy(view: View, fit: View, dx: number, dy: number, size: Viewport, bounds: Bounds): View {
  return clampView({ ...view, tx: view.tx + dx, ty: view.ty + dy }, fit, bounds, size);
}

/** Zoom factor for a wheel event: smooth, and the inverse of the opposite turn. Line and page modes are scaled to pixels. */
export function wheelFactor(deltaY: number, deltaMode: number): number {
  const px = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 400 : 1);
  return Math.exp(-px * 0.0015);
}

/** Zoom factor for a pinch whose fingers moved from `before` to `now` apart. */
export function pinchFactor(before: number, now: number): number {
  return before > 0 && now > 0 ? now / before : 1;
}

/** Below this many px per km a battalion is too small to carry a label: it is drawn as a compact chip. */
export const CHIP_PX_PER_KM = 120;
/** Chip width, px, at the smallest scale a map can show (about 20 px/km) and at the chip threshold. */
const CHIP_W_MIN = 8;
const CHIP_W_MAX = 18;
const CHIP_PX_PER_KM_MIN = 20;

export type MarkerStyle = { kind: 'chip'; w: number; h: number } | { kind: 'battalion' } | { kind: 'company' };

/**
 * How units are drawn at a view: compact text-free chips sized to the scale at corps zoom, labelled battalion markers
 * from CHIP_PX_PER_KM up to the company switch, then company markers.
 */
export function markerStyleAt(view: View): MarkerStyle {
  if (detailAt(view) === 'company') return { kind: 'company' };
  const perKm = view.scale * 1000;
  if (perKm >= CHIP_PX_PER_KM) return { kind: 'battalion' };
  const t = Math.min(1, Math.max(0, (perKm - CHIP_PX_PER_KM_MIN) / (CHIP_PX_PER_KM - CHIP_PX_PER_KM_MIN)));
  const w = Math.round(CHIP_W_MIN + (CHIP_W_MAX - CHIP_W_MIN) * t);
  return { kind: 'chip', w, h: Math.round(w * 0.62) };
}
