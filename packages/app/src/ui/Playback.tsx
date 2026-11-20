import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RunRecord } from '@wwi/engine';
import { advancePlayhead, formatClock, isQuiet, seek, SPEEDS, timelineMarkers } from '../playback';
import { MapCanvas } from './MapCanvas';
import { Timeline } from './Timeline';
import { EventLog } from './EventLog';
import { elapsedLabel, nextEventMinute, prevEventMinute } from './steps';
import { MAP_COLORS } from '../map/draw';

const SPEED_LABELS: Record<(typeof SPEEDS)[number], string> = {
  1: '1 s = 1 min',
  10: '1 s = 10 min',
  60: '1 s = 1 h',
  360: '1 s = 6 h',
};

/** Longest real-time step taken in one animation frame, so a backgrounded tab does not leap ahead. */
const MAX_FRAME_SEC = 0.25;

const Icon = {
  play: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
    </svg>
  ),
  pause: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor" />
    </svg>
  ),
  prev: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 5h2.5v14H6zM19 5.5v13L9.5 12z" fill="currentColor" />
    </svg>
  ),
  next: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M15.5 5H18v14h-2.5zM5 5.5v13l9.5-6.5z" fill="currentColor" />
    </svg>
  ),
  draft: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 2 20h20zm-1 6h2v6h-2zm0 7.5h2v2h-2z" fill="currentColor" />
    </svg>
  ),
};

export function Playback({ record }: { record: RunRecord }) {
  const end = record.endMinute;
  const [minute, setMinute] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(10);
  const [skipQuiet, setSkipQuiet] = useState(true);
  const [quietNow, setQuietNow] = useState(false);
  const minuteRef = useRef(0);

  const seekTo = useCallback(
    (m: number) => {
      const v = seek(m, end);
      minuteRef.current = v;
      setMinute(v);
    },
    [end],
  );

  // A new record starts paused at zero hour.
  useEffect(() => {
    setPlaying(false);
    seekTo(0);
  }, [record, seekTo]);

  useEffect(() => {
    if (!playing) {
      setQuietNow(false);
      return;
    }
    let raf = 0;
    let last = performance.now();
    const tick = (now: number): void => {
      const dt = Math.min((now - last) / 1000, MAX_FRAME_SEC);
      last = now;
      const quiet = skipQuiet && isQuiet(record, minuteRef.current);
      const next = advancePlayhead(minuteRef.current, dt, speed, quiet, end);
      minuteRef.current = next.minute;
      setMinute(next.minute);
      setQuietNow(quiet);
      if (next.ended) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, skipQuiet, record, end]);

  const togglePlay = (): void => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (minuteRef.current >= end) seekTo(0);
    setPlaying(true);
  };

  const events = useMemo(() => [...record.events].sort((a, b) => a.minute - b.minute), [record]);
  const eventMinutes = useMemo(() => events.map((e) => e.minute), [events]);
  const markers = useMemo(() => timelineMarkers(record), [record]);
  const timeOf = useCallback((m: number) => formatClock(record.zeroHour, m).split(' · ')[1] ?? '', [record]);

  const shown = Math.floor(minute);
  let current = -1;
  for (let i = 0; i < events.length && events[i]!.minute <= shown; i++) current = i;
  const prev = prevEventMinute(eventMinutes, minute);
  const next = nextEventMinute(eventMinutes, minute);

  const clock = formatClock(record.zeroHour, minute);
  const elapsed = elapsedLabel(minute);

  return (
    <>
      {record.scenarioStatus === 'draft' && (
        <div className="draft-banner" role="note">
          {Icon.draft}
          <strong>Draft — unverified data</strong>
          <span className="draft-note">Scenario values are estimates awaiting owner review.</span>
        </div>
      )}
      <div className="layout">
        <section className="panel map-panel" aria-label="Time-lapse map">
          <div className="map-frame">
            <MapCanvas record={record} minute={minute} label={`Trench map of ${record.scenarioTitle} at ${clock}, ${elapsed}`} />
            <div className="clock-card">
              <div className="clock" data-testid="battle-clock">
                {clock}
              </div>
              <div className="elapsed">
                {elapsed}
                {quietNow && <span className="quiet-chip">Quiet · ×10</span>}
              </div>
            </div>
            <MapKey />
          </div>

          <div className="controls">
            <Timeline
              minute={minute}
              endMinute={end}
              markers={markers}
              valueText={`${clock}, ${elapsed}`}
              startLabel={timeOf(0)}
              endLabel={timeOf(end)}
              onSeek={seekTo}
            />
            <div className="transport">
              <div className="transport-group">
                <button type="button" className="icon-btn" aria-label="Previous event" disabled={prev === null} onClick={() => prev !== null && seekTo(prev)}>
                  {Icon.prev}
                </button>
                <button type="button" className="play-btn" aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
                  {playing ? Icon.pause : Icon.play}
                </button>
                <button type="button" className="icon-btn" aria-label="Next event" disabled={next === null} onClick={() => next !== null && seekTo(next)}>
                  {Icon.next}
                </button>
              </div>

              <div className="transport-group speeds" role="group" aria-label="Playback speed">
                <span className="group-label">Speed</span>
                <div className="segmented">
                  {SPEEDS.map((s) => (
                    <button key={s} type="button" aria-pressed={speed === s} className={speed === s ? 'is-active' : ''} onClick={() => setSpeed(s)}>
                      {SPEED_LABELS[s]}
                    </button>
                  ))}
                </div>
              </div>

              <label className="switch">
                <input type="checkbox" checked={skipQuiet} onChange={(e) => setSkipQuiet(e.currentTarget.checked)} />
                <span className="switch-track" aria-hidden="true" />
                <span>Skip quiet periods</span>
              </label>
            </div>
          </div>
        </section>

        <EventLog events={events} current={current} timeOf={timeOf} onSeek={seekTo} />
      </div>
    </>
  );
}

/** The map key, styled as part of the paper sheet. */
function MapKey() {
  return (
    <div className="map-key" aria-label="Map key" role="group">
      <div className="key-row">
        <svg viewBox="0 0 28 10" aria-hidden="true">
          <path d="M0 3h4v4h4V3h4v4h4V3h4v4h4V3h4" fill="none" stroke={MAP_COLORS.allied} strokeWidth="1.6" />
        </svg>
        Allied trench
      </div>
      <div className="key-row">
        <svg viewBox="0 0 28 10" aria-hidden="true">
          <path d="M0 3h4v4h4V3h4v4h4V3h4v4h4V3h4" fill="none" stroke={MAP_COLORS.central} strokeWidth="1.6" />
        </svg>
        German trench
      </div>
      <div className="key-row">
        <svg viewBox="0 0 28 10" aria-hidden="true">
          <path d="M0 5h28" stroke={MAP_COLORS.ink} strokeWidth="2" strokeDasharray="6 3" />
        </svg>
        Objective line
      </div>
      <div className="key-row">
        <svg viewBox="0 0 28 10" aria-hidden="true">
          <defs>
            <pattern id="key-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
              <path d="M0 0v4" stroke={MAP_COLORS.hatch} strokeWidth="2" />
            </pattern>
          </defs>
          <rect x="1" y="1" width="26" height="8" fill="url(#key-hatch)" stroke="rgba(150,116,40,.85)" strokeWidth="1" />
        </svg>
        Barrage
      </div>
      <div className="key-row">
        <svg viewBox="0 0 28 10" aria-hidden="true">
          <rect x="7" y="1" width="14" height="8" fill={MAP_COLORS.allied} />
        </svg>
        Company
      </div>
      <div className="key-row">
        <svg viewBox="0 0 28 10" aria-hidden="true">
          <rect x="5.5" y="0.5" width="17" height="9" fill="none" stroke="rgba(20,16,8,.45)" strokeWidth="1" />
          <rect x="7.25" y="2.25" width="13.5" height="5.5" fill={MAP_COLORS.allied} stroke="#fff" strokeWidth="1.5" />
        </svg>
        Consolidating
      </div>
    </div>
  );
}
