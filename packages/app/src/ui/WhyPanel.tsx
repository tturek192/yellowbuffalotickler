import type { Why } from '@wwi/engine/reader';
import { whyRows } from './why';

type Props = {
  /** The chain to show; null when the unit asked about has no event yet. */
  why: Why | null;
  /** What was asked about (a unit's name, or "Event"). */
  title: string;
  timeOf: (minute: number) => string;
  /** Jump the playhead to a step's minute. */
  onSeek: (minute: number) => void;
  onClose: () => void;
};

/** Up to this many of an event's numbers are shown under it. */
const MAX_FACTORS = 6;

const factorText = (f: Record<string, number> | undefined): string =>
  Object.entries(f ?? {})
    .slice(0, MAX_FACTORS)
    .map(([k, v]) => `${k} ${Number.isInteger(v) ? v : v.toFixed(2)}`)
    .join(' · ');

/**
 * The "why" trace (spec 8, 9.2): the event asked about, the causes behind it in plain words, and below it, indented, the
 * earlier events that led to it, each with its own causes. Every step is a button that moves the playhead to it. A step
 * already shown elsewhere in the chain is not repeated but noted "see above".
 */
export function WhyPanel({ why, title, timeOf, onSeek, onClose }: Props) {
  const rows = why ? whyRows(why) : [];
  return (
    <aside className="why-panel" role="dialog" aria-modal="false" aria-labelledby="why-title">
      <header className="why-head">
        <h2 id="why-title" className="panel-title">
          Why? <span className="why-subject">{title}</span>
        </h2>
        <button type="button" className="icon-btn why-close" aria-label="Close why panel" onClick={onClose}>
          ×
        </button>
      </header>
      {rows.length === 0 ? (
        <p className="why-empty">Nothing has happened to it yet at this time.</p>
      ) : (
        <ol className="why-chain">
          {rows.map(({ event: e, depth, causes, seeAbove }) => (
            <li key={e.id} className={`why-step${depth === 0 ? ' is-root' : ''}`} style={{ marginLeft: `${Math.min(depth, 5) * 14}px` }}>
              {depth > 0 && <span className="why-because">because</span>}
              <button type="button" className="why-event" data-minute={e.minute} onClick={() => onSeek(e.minute)} title="Jump to this moment">
                <span className="log-time">{timeOf(e.minute)}</span> <span className="why-text">{e.text}</span>
              </button>
              {causes.length > 0 && (
                <ul className="why-causes">
                  {causes.map((c) => (
                    <li key={c.cause} className="why-cause">
                      {c.text}
                    </li>
                  ))}
                </ul>
              )}
              {e.factors && Object.keys(e.factors).length > 0 && <p className="why-factors">{factorText(e.factors)}</p>}
              {seeAbove.map((s) => (
                <p key={s.id} className="why-see-above">
                  and {timeOf(s.minute)} {s.text} (see above)
                </p>
              ))}
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
