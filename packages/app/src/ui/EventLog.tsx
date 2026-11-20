import { memo, useEffect, useRef } from 'react';
import type { SimEvent } from '@wwi/engine';

type Props = {
  events: SimEvent[];
  /** Index of the latest event at or before the playhead, or -1. */
  current: number;
  timeOf: (minute: number) => string;
  onSeek: (minute: number) => void;
};

/** The event log; clicking an entry seeks to that event's minute. */
export const EventLog = memo(function EventLog({ events, current, timeOf, onSeek }: Props) {
  const listRef = useRef<HTMLUListElement>(null);

  // Keep the current entry in view without scrolling the page.
  useEffect(() => {
    const list = listRef.current;
    const item = list?.children[Math.max(current, 0)] as HTMLElement | undefined;
    if (!list || !item) return;
    const top = item.offsetTop - list.offsetTop;
    if (top < list.scrollTop) list.scrollTop = top - 8;
    else if (top + item.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + item.offsetHeight - list.clientHeight + 8;
  }, [current]);

  return (
    <section className="panel side" aria-labelledby="event-log-title">
      <div className="side-inner">
        <h2 id="event-log-title" className="panel-title">
          Event log <span className="count">{events.length}</span>
        </h2>
        <ul ref={listRef} className="log">
          {events.map((e, i) => (
            <li key={i} className={`log-item kind-${e.kind} ${i === current ? 'is-current' : i > current ? 'is-future' : ''}`}>
              <button type="button" onClick={() => onSeek(e.minute)}>
                <span className="log-time">{timeOf(e.minute)}</span>{' '}
                <span className="log-text">{e.text}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
});
