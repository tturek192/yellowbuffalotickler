import { useEffect, useMemo, useRef, useState } from 'react';
import type { RunRecord } from '@wwi/engine';
import { frameAt } from '../playback';
import { drawFrame } from '../map/draw';
import { fitView, recordBounds } from '../map/projection';

/**
 * Room kept clear for the clock card (top) and the scale bar (bottom), in CSS pixels. The map key sits in a strip
 * under the canvas (styles.css), so it needs no room here.
 */
const INSET_TOP = 92;
const INSET_BOTTOM = 40;

const CANVAS_FONTS = ['italic 15px "EB Garamond"', '600 11px "Barlow Condensed"'];

/** The trench map: a devicePixelRatio-aware canvas that tracks its container's size. */
export function MapCanvas({ record, minute, label }: { record: RunRecord; minute: number; label: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [fontsReady, setFontsReady] = useState(0);
  const bounds = useMemo(() => recordBounds(record), [record]);

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

  useEffect(() => {
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
    const fitted = fitView(bounds, size.w, Math.max(size.h - INSET_TOP - INSET_BOTTOM, 1), 24);
    drawFrame(ctx, { ...fitted, ty: fitted.ty + INSET_TOP }, record, frameAt(record, minute));
  }, [size, minute, record, bounds, fontsReady]);

  return (
    <div ref={wrapRef} className="map-canvas">
      <canvas ref={canvasRef} role="img" aria-label={label} />
    </div>
  );
}
