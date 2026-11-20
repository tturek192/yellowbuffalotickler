import type { CSSProperties } from 'react';
import type { Marker } from '../playback';

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
  return (
    <div className="timeline">
      <div className="timeline-markers" aria-hidden="true">
        {markers.map((m, i) => {
          const p = pct(m.minute);
          const align = p < 8 ? 'start' : p > 92 ? 'end' : 'middle';
          return (
            <div
              key={`${m.minute}-${m.label}`}
              className={`marker marker-${m.kind} marker-${align} ${i % 2 ? 'marker-high' : 'marker-low'} ${m.minute <= minute ? 'marker-past' : ''}`}
              style={{ left: `${p}%` }}
            >
              <span className="marker-label">{m.label}</span>
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
