import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { Marker } from '../playback';
import { layoutMarkers, shortMarkerLabel } from '../playback/markerLabels';

const LABEL_ROWS = 3;
/** Estimated label width: ~5.4 px a character at 13 px (measured about 4.6) plus padding; errs wide so neighbours never touch. */
const labelWidth = (text: string): number => text.length * 5.4 + 10;

type Props = {
  minute: number;
  endMinute: number;
  markers: Marker[];
  valueText: string;
  startLabel: string;
  endLabel: string;
  onSeek: (minute: number) => void;
};

/** The scrubber, with zero hour and the line-taken markers drawn above it. */
export function Timeline({ minute, endMinute, markers, valueText, startLabel, endLabel, onSeek }: Props) {
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
  const shown = useMemo(() => markers.map((m) => ({ ...m, short: shortMarkerLabel(m.label) })), [markers]);
  const slots = useMemo(
    () => layoutMarkers(shown.map((m) => (pct(m.minute) / 100) * trackPx), shown.map((m) => labelWidth(m.short)), trackPx, LABEL_ROWS),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, trackPx, endMinute],
  );
  return (
    <div className="timeline">
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
