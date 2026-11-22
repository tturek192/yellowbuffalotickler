import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Marker } from '../playback';
import { estimateTextWidth, labelBoxWidth, layoutMarkers, shortMarkerLabel } from '../playback/markerLabels';

const LABEL_ROWS = 3;
/** The font of `.marker-label` at its widest weight (a passed marker is 600), so a label never outgrows its box. */
const LABEL_FONT = '600 13px "Barlow Condensed", "Arial Narrow", "Roboto Condensed", system-ui, sans-serif';
/** The period ribbon's milestone labels: italic IM Fell English (`.timeline-period .marker-label`). */
const PERIOD_LABEL_FONT = 'italic 14px "IM Fell English", "EB Garamond", Georgia, serif';

/** A text measurer on a canvas, or the character-count estimate where there is none (server rendering, tests). */
function textMeasurer(font: string): (text: string) => number {
  try {
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx) {
      ctx.font = font;
      // `.marker-label` letter-spacing is 0.02em: 0.26 px a character at 13 px.
      return (text) => ctx.measureText(text).width + text.length * 0.26;
    }
  } catch {
    /* no DOM: fall through */
  }
  return estimateTextWidth;
}

type Props = {
  minute: number;
  endMinute: number;
  markers: Marker[];
  valueText: string;
  startLabel: string;
  endLabel: string;
  onSeek: (minute: number) => void;
  /** The period style's ribbon: a notched band, milestone labels in italics (Task 20). */
  period?: boolean;
};

/** The scrubber, with zero hour and the line-taken markers drawn above it. */
export function Timeline({ minute, endMinute, markers, valueText, startLabel, endLabel, onSeek, period = false }: Props) {
  const font = period ? PERIOD_LABEL_FONT : LABEL_FONT;
  const pct = (m: number): number => (endMinute > 0 ? (m / endMinute) * 100 : 0);
  const track = useRef<HTMLDivElement>(null);
  const [trackPx, setTrackPx] = useState(600);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const measure = (): void => setTrackPx(el.clientWidth || 600);
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Web fonts change a label's width when they arrive: measure again then.
  const [fontsReady, setFontsReady] = useState(0);
  useEffect(() => {
    if (!document.fonts) return;
    let live = true;
    document.fonts.load(font).finally(() => live && setFontsReady((n) => n + 1));
    return () => {
      live = false;
    };
  }, [font]);
  const shown = useMemo(() => markers.map((m) => ({ ...m, short: shortMarkerLabel(m.label) })), [markers]);
  const slots = useMemo(
    () => {
      const measure = textMeasurer(font);
      return layoutMarkers(shown.map((m) => (pct(m.minute) / 100) * trackPx), shown.map((m) => labelBoxWidth(m.short, measure)), trackPx, LABEL_ROWS);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, trackPx, endMinute, fontsReady, font],
  );
  return (
    <div className={period ? 'timeline timeline-period' : 'timeline'}>
      <div className="timeline-markers" aria-hidden="true" ref={track}>
        {shown.map((m, i) => {
          const slot = slots[i]!;
          return (
            <div
              key={`${m.minute}-${m.label}`}
              className={`marker marker-${m.kind} marker-row-${slot.row} ${m.minute <= minute ? 'marker-past' : ''}`}
              style={{ left: `${pct(m.minute)}%` }}
              title={m.label}
            >
              <span className="marker-hit" />
              {!slot.hidden && (
                <span className="marker-label" style={{ left: `${slot.offset}px` }}>
                  {m.short}
                </span>
              )}
            </div>
          );
        })}
      </div>
      <input
        className="scrubber"
        type="range"
        aria-label="Battle time"
        aria-valuetext={valueText}
        min={0}
        max={endMinute}
        step={1}
        value={Math.floor(minute)}
        style={{ '--progress': `${pct(minute)}%` } as CSSProperties}
        onInput={(e) => onSeek(Number(e.currentTarget.value))}
      />
      <div className="timeline-ends" aria-hidden="true">
        <span>{startLabel}</span>
        <span>{endLabel}</span>
      </div>
    </div>
  );
}
