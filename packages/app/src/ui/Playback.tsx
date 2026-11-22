import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RunRecord } from '@wwi/engine';
import { explain } from '@wwi/engine/reader';
import { advancePlayhead, battalionLabel, formatClock, isQuiet, QUIET_SPEEDUP, seek, SPEEDS, timelineMarkers, totalsAt } from '../playback';
import { MapCanvas } from './MapCanvas';
import { Timeline } from './Timeline';
import { EventLog } from './EventLog';
import { capQuietAdvance, elapsedLabel, nextEventMinute, prevEventMinute, QUIET_WINDOW_MIN } from './steps';
import { MapKey } from './MapKey';
import { Totals } from './Totals';
import { WhyPanel } from './WhyPanel';
import { whyRefFor, type WhyPick } from './why';
import { PeriodFrame } from './PeriodFrame';
import { periodClock, periodDay, periodElapsed, periodTime, type MapStyle } from './periodStyle';

const SPEED_LABELS: Record<(typeof SPEEDS)[number], string> = {
  1: '1 s = 1 min',
  10: '1 s = 10 min',
  60: '1 s = 1 h',
  360: '1 s = 6 h',
};

/** The period style's speed lettering (the plain labels stay the buttons' accessible names). */
const PERIOD_SPEED_LABELS: Record<(typeof SPEEDS)[number], string> = { 1: '1 min', 10: '10 min', 60: '1 hour', 360: '6 hours' };

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

export function Playback({ record, mapStyle = 'plain' }: { record: RunRecord; mapStyle?: MapStyle }) {
  const period = mapStyle === 'period';
  const [pxPerM, setPxPerM] = useState(0);
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

  const events = useMemo(() => [...record.events].sort((a, b) => a.minute - b.minute), [record]);
  const eventMinutes = useMemo(() => events.map((e) => e.minute), [events]);

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
      // rAF timestamps can precede the performance.now() taken when the loop started.
      const dt = Math.max(0, Math.min((now - last) / 1000, MAX_FRAME_SEC));
      last = now;
      const from = minuteRef.current;
      const quiet = skipQuiet && isQuiet(record, from, QUIET_WINDOW_MIN);
      const advanced = advancePlayhead(from, dt, speed, quiet, end);
      const reached = quiet ? capQuietAdvance(from, advanced.minute, eventMinutes) : advanced.minute;
      minuteRef.current = reached;
      setMinute(reached);
      setQuietNow(quiet);
      if (reached >= end) {
        setPlaying(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, skipQuiet, record, end, eventMinutes]);

  const togglePlay = (): void => {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (minuteRef.current >= end) seekTo(0);
    setPlaying(true);
  };

  // The why panel: what was picked, at the minute it was picked (the chain stays put while its steps move the playhead).
  const [asked, setAsked] = useState<{ pick: WhyPick; minute: number } | null>(null);
  useEffect(() => setAsked(null), [record]);
  const explainEvent = useCallback((id: number) => setAsked({ pick: { kind: 'event', id }, minute: minuteRef.current }), []);
  const explainUnit = useCallback((pick: WhyPick) => setAsked({ pick, minute: minuteRef.current }), []);
  const whyShown = useMemo(() => {
    if (!asked) return null;
    const { pick } = asked;
    const unitName = pick.kind === 'company' ? record.units.find((u) => u.id === pick.id)?.name ?? pick.id : '';
    const kind = pick.kind === 'event' ? (record.events[pick.id]?.kind ?? 'event').replace(/-/g, ' ') : '';
    const title = pick.kind === 'event' ? kind : pick.kind === 'company' ? unitName : `battalion ${battalionLabel(pick.id)}`;
    const ref = whyRefFor(record, pick, asked.minute);
    return { title, why: ref ? explain(record, ref) : null };
  }, [asked, record]);

  const markers = useMemo(() => timelineMarkers(record), [record]);
  const timeOf = useCallback((m: number) => formatClock(record.zeroHour, m).split(' · ')[1] ?? '', [record]);

  const shown = Math.floor(minute);
  let current = -1;
  for (let i = 0; i < events.length && events[i]!.minute <= shown; i++) current = i;
  const prev = prevEventMinute(eventMinutes, minute);
  const next = nextEventMinute(eventMinutes, minute);

  const totals = useMemo(() => totalsAt(record, shown), [record, shown]);

  const clock = formatClock(record.zeroHour, minute);
  const elapsed = elapsedLabel(minute);

  const mapCanvas = (
    <MapCanvas
      record={record}
      minute={minute}
      speed={speed}
      onPick={explainUnit}
      period={period}
      onScale={setPxPerM}
      label={`Trench map of ${record.scenarioTitle} at ${clock}, ${elapsed}`}
    />
  );
  const timeline = (
    <Timeline
      minute={minute}
      endMinute={end}
      markers={markers}
      valueText={`${clock}, ${elapsed}`}
      startLabel={period ? periodTime(record.zeroHour, 0) : timeOf(0)}
      endLabel={period ? `${periodDay(record.zeroHour, end).split(',')[0]} ${periodTime(record.zeroHour, end)}` : timeOf(end)}
      onSeek={seekTo}
      period={period}
    />
  );
  const stepButton = (dir: 'prev' | 'next') => {
    const to = dir === 'prev' ? prev : next;
    return (
      <button type="button" className="icon-btn" aria-label={dir === 'prev' ? 'Previous event' : 'Next event'} disabled={to === null} onClick={() => to !== null && seekTo(to)}>
        {Icon[dir]}
      </button>
    );
  };
  const playButton = (
    <button type="button" className="play-btn" aria-label={playing ? 'Pause' : 'Play'} onClick={togglePlay}>
      {playing ? Icon.pause : Icon.play}
    </button>
  );
  const speeds = (labels: Record<(typeof SPEEDS)[number], string>) => (
    <div className="segmented">
      {SPEEDS.map((s) => (
        <button key={s} type="button" aria-label={SPEED_LABELS[s]} aria-pressed={speed === s} className={speed === s ? 'is-active' : ''} onClick={() => setSpeed(s)}>
          {labels[s]}
        </button>
      ))}
    </div>
  );
  const skipSwitch = (
    <label className="switch">
      <input type="checkbox" checked={skipQuiet} onChange={(e) => setSkipQuiet(e.currentTarget.checked)} />
      <span className="switch-track" aria-hidden="true" />
      <span>Skip quiet periods</span>
    </label>
  );
  const quietChip = quietNow && <span className="quiet-chip">Quiet · ×{QUIET_SPEEDUP}</span>;
  const n = (v: number): string => Math.round(v).toLocaleString('en-GB');
  const casualties = (side: 'allied' | 'central'): number => totals.casualties[side].killed + totals.casualties[side].wounded + totals.casualties[side].captured;

  const sidePanel = (
    <div className="panel side">
      <div className="side-inner">
        <Totals totals={totals} />
        {whyShown && <WhyPanel why={whyShown.why} title={whyShown.title} timeOf={timeOf} onSeek={seekTo} onClose={() => setAsked(null)} />}
        <EventLog events={events} current={current} timeOf={timeOf} onSeek={seekTo} onExplain={explainEvent} />
      </div>
    </div>
  );

  return (
    <>
      {record.scenarioStatus === 'draft' && (
        <div className="draft-banner" role="note">
          {Icon.draft}
          <strong>Draft — unverified data</strong>
          <span className="draft-note">Scenario values are estimates awaiting owner review.</span>
        </div>
      )}
      {period ? (
        <div className="layout">
          <PeriodFrame
            record={record}
            minute={minute}
            pxPerM={pxPerM}
            map={mapCanvas}
            controls={
              <>
                <div className="period-clockrow">
                  {playButton}
                  <div className="period-clockface">
                    <div className="period-clock" data-testid="battle-clock">
                      {periodClock(record.zeroHour, minute)}
                    </div>
                    <div className="period-elapsed">
                      {periodElapsed(minute)}
                      {quietChip}
                    </div>
                  </div>
                </div>
                <div className="period-transport">
                  <div className="transport-group">
                    {stepButton('prev')}
                    {stepButton('next')}
                  </div>
                  <div className="transport-group speeds" role="group" aria-label="Playback speed">
                    <span className="group-label">1 s =</span>
                    {speeds(PERIOD_SPEED_LABELS)}
                  </div>
                  {skipSwitch}
                </div>
                {timeline}
                <div className="period-totals">
                  <div>
                    <span className="period-sc">Casualties</span> · Allied <b>{n(casualties('allied'))}</b> · German <b>{n(casualties('central'))}</b>
                  </div>
                  <div>
                    <span className="period-sc">Prisoners</span> <b>{n(totals.prisoners.allied + totals.prisoners.central)}</b>
                  </div>
                  <div>
                    <span className="period-sc">Guns taken</span> <b>{n(totals.guns)}</b>
                  </div>
                </div>
              </>
            }
          />
          {sidePanel}
        </div>
      ) : (
        <div className="layout">
          <section className="panel map-panel" aria-label="Time-lapse map">
            <div className="map-frame">
              {mapCanvas}
              <div className="clock-card">
                <div className="clock" data-testid="battle-clock">
                  {clock}
                </div>
                <div className="elapsed">
                  {elapsed}
                  {quietChip}
                </div>
              </div>
              <MapKey record={record} />
            </div>

            <div className="controls">
              {timeline}
              <div className="transport">
                <div className="transport-group">
                  {stepButton('prev')}
                  {playButton}
                  {stepButton('next')}
                </div>

                <div className="transport-group speeds" role="group" aria-label="Playback speed">
                  <span className="group-label">Speed</span>
                  {speeds(SPEED_LABELS)}
                </div>

                {skipSwitch}
              </div>
            </div>
          </section>
          {sidePanel}
        </div>
      )}
    </>
  );
}
