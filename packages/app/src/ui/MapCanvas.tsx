import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RunRecord } from '@wwi/engine';
import { frameAt } from '../playback';
import { drawFrame } from '../map/draw';
import { fitView, recordBounds, type View } from '../map/projection';
import { clampView, detailAt, panBy, pinchFactor, wheelFactor, zoomAt, zoomBy } from '../map/zoom';
import { pulsePhase } from '../map/unitMarkers';

/**
 * Room kept clear for the clock card (top) and the scale bar (bottom), in CSS pixels. The map key sits in a strip
 * under the canvas (styles.css), so it needs no room here.
 */
const INSET_TOP = 92;
const INSET_BOTTOM = 40;

/** Button zoom step, and how often the suppression rings are redrawn while they pulse (ms). */
const ZOOM_STEP = 1.6;
const PULSE_FRAME_MS = 50;
/** Where a pulse is held for readers who ask for no motion. */
const STILL_PHASE = 0.25;

const CANVAS_FONTS = ['italic 15px "EB Garamond"', '600 11px "Barlow Condensed"'];

const prefersStill = (): boolean => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * The trench map: a devicePixelRatio-aware canvas that tracks its container's size. Wheel and pinch zoom about the
 * pointer, drag pans, and the buttons zoom about the middle; battalions show at corps zoom and companies when zoomed in.
 */
export function MapCanvas({ record, minute, label }: { record: RunRecord; minute: number; label: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [fontsReady, setFontsReady] = useState(0);
  /** Null is fit-all (what a new record or a resize starts from). */
  const [zoomed, setZoomed] = useState<View | null>(null);
  const bounds = useMemo(() => recordBounds(record), [record]);
  const fit = useMemo(() => {
    const f = fitView(bounds, size.w, Math.max(size.h - INSET_TOP - INSET_BOTTOM, 1), 24);
    return { ...f, ty: f.ty + INSET_TOP };
  }, [bounds, size]);
  const view = zoomed ? clampView(zoomed, fit, bounds, size) : fit;
  const detail = detailAt(view);
  const frame = useMemo(() => frameAt(record, minute), [record, minute]);
  const pulsing = useMemo(() => frame.companies.some((c) => c.suppression >= 0.05 && c.status !== 'off-map'), [frame]);

  useEffect(() => setZoomed(null), [record, size]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((s) => (s.w === width && s.h === height ? s : { w: width, h: height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Canvas text only uses web fonts once they are loaded; redraw when they arrive.
  useEffect(() => {
    if (!document.fonts) return;
    let live = true;
    Promise.allSettled(CANVAS_FONTS.map((f) => document.fonts.load(f))).then(() => live && setFontsReady((n) => n + 1));
    return () => {
      live = false;
    };
  }, []);

  const paint = useCallback(
    (pulse: number): void => {
      const canvas = canvasRef.current;
      if (!canvas || size.w === 0 || size.h === 0) return;
      const dpr = window.devicePixelRatio || 1;
      const pw = Math.round(size.w * dpr);
      const ph = Math.round(size.h * dpr);
      if (canvas.width !== pw) canvas.width = pw;
      if (canvas.height !== ph) canvas.height = ph;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawFrame(ctx, view, record, frame, { pulse });
    },
    // `view` is rebuilt every render; its parts are what matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [size, view.scale, view.tx, view.ty, record, frame, fontsReady],
  );

  // Redraw on every change; while a marker is suppressed also pulse its ring from wall time (never battle time).
  useEffect(() => {
    const still = prefersStill();
    paint(still ? STILL_PHASE : pulsePhase(performance.now()));
    if (!pulsing || still) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number): void => {
      if (now - last >= PULSE_FRAME_MS) {
        last = now;
        paint(pulsePhase(now));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paint, pulsing]);

  // Wheel zoom about the pointer. Not a React handler: React's wheel listeners are passive and cannot stop the page scrolling.
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const at: [number, number] = [e.clientX - rect.left, e.clientY - rect.top];
      setZoomed((z) => zoomAt(z ?? fit, fit, at, wheelFactor(e.deltaY, e.deltaMode), size, bounds));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [fit, size, bounds]);

  // Drag to pan; two fingers pinch to zoom (and pan with their midpoint).
  const pointers = useRef(new Map<number, [number, number]>());
  const [dragging, setDragging] = useState(false);
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    e.currentTarget.setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, [e.clientX, e.clientY]);
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const all = [...pointers.current.values()];
    const next: [number, number] = [e.clientX, e.clientY];
    const rect = e.currentTarget.getBoundingClientRect();
    if (all.length === 1) {
      pointers.current.set(e.pointerId, next);
      setZoomed((z) => panBy(z ?? fit, fit, next[0] - prev[0], next[1] - prev[1], size, bounds));
    } else if (all.length === 2) {
      const other = [...pointers.current].find(([id]) => id !== e.pointerId)![1];
      const span = (a: [number, number], b: [number, number]): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
      const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2 - rect.left, (a[1] + b[1]) / 2 - rect.top];
      pointers.current.set(e.pointerId, next);
      const [m0, m1] = [mid(prev, other), mid(next, other)];
      setZoomed((z) => {
        const panned = panBy(z ?? fit, fit, m1[0] - m0[0], m1[1] - m0[1], size, bounds);
        return zoomAt(panned, fit, m1, pinchFactor(span(prev, other), span(next, other)), size, bounds);
      });
    }
  };
  const onPointerEnd = (e: React.PointerEvent<HTMLCanvasElement>): void => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) setDragging(false);
  };

  const zoomButton = (factor: number) => (): void => setZoomed((z) => zoomBy(z ?? fit, fit, factor, size, bounds));
  const atFit = view.scale <= fit.scale;
  const atMax = view.scale >= 2;

  return (
    <div ref={wrapRef} className="map-canvas">
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        data-detail={detail}
        className={dragging ? 'is-dragging' : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
      />
      <div className="zoom-controls" role="group" aria-label="Map zoom">
        <button type="button" aria-label="Zoom in" disabled={atMax} onClick={zoomButton(ZOOM_STEP)}>
          +
        </button>
        <button type="button" aria-label="Zoom out" disabled={atFit} onClick={zoomButton(1 / ZOOM_STEP)}>
          −
        </button>
        <button type="button" aria-label="Fit all" className="zoom-fit" disabled={atFit} onClick={() => setZoomed(null)}>
          Fit
        </button>
      </div>
    </div>
  );
}
