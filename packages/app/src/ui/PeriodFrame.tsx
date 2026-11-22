import type { ReactNode } from 'react';
import type { RunRecord, Side } from '@wwi/engine';
import { niceScaleLength } from '../map/draw';
import { objectiveLabelGroups } from '../map/labels';
import { blockColour, PERIOD_STYLE } from '../map/period';
import { MapKey } from './MapKey';
import { periodDay, periodTime } from './periodStyle';

type Swatch = { name: string; fill: string; edge: string; edgeWidth: number };

/** What the Explanatory Notes list for a record: each side's divisions (those with battalions on the map), the patches, the lines. */
export function notesFor(r: RunRecord): {
  allied: Swatch[];
  german: Swatch[];
  patches: Array<{ label: string; fill: string }>;
  lines: Array<{ text: string; color: string }>;
} {
  const divisions = r.divisions ?? [];
  const ids = new Set(divisions.map((d) => d.id));
  // A battalion's division is the first division-level formation up its path (a group above a division is not listed).
  const used = new Set<string>();
  for (const u of r.units) {
    const d = (u.formationPath ?? []).find((id) => ids.has(id));
    if (d) used.add(d);
  }
  const swatch = (d: (typeof divisions)[number]): Swatch => ({
    name: d.name.replace(/\s*\(.*\)\s*$/, ''),
    fill: blockColour({ side: d.side, ...(d.insignia ? { insignia: d.insignia } : {}) }),
    edge: d.side === 'central' ? PERIOD_STYLE.germanEdge : PERIOD_STYLE.ink,
    edgeWidth: d.side === 'central' ? 2 : 1,
  });
  const of = (side: Side) => divisions.filter((d) => d.side === side && used.has(d.id)).map(swatch);
  const patches = divisions
    .filter((d) => d.side === 'allied' && used.has(d.id) && d.insignia)
    .map((d) => ({ label: /^(\d+(st|nd|rd|th))\b/.exec(d.name)?.[1] ?? d.name, fill: d.insignia! }));
  const lines = objectiveLabelGroups(r.geometry.lines.filter((l) => l.kind === 'objective')).map((g) => ({ text: g.text, color: g.anchor.color ?? PERIOD_STYLE.ink }));
  return { allied: of('allied'), german: of('central'), patches, lines };
}

/** The battle's place and the force, from a title like 'Vimy Ridge, 9-12 April 1917: Canadian Corps'. */
export function titleParts(title: string): { place: string; force: string | null } {
  const [head, force] = title.split(':').map((s) => s.trim());
  return { place: (head ?? title).split(',')[0]!.trim(), force: force || null };
}

/** A small ornament for the corners of the sheet: a lozenge in a ring, between four dots. */
function Ornament({ className }: { className: string }) {
  return (
    <svg className={`period-ornament ${className}`} viewBox="0 0 32 32" aria-hidden="true">
      <circle cx="16" cy="16" r="9" fill="none" stroke={PERIOD_STYLE.red} strokeWidth="1.4" />
      <path d="M16 9.5 20 16 16 22.5 12 16Z" fill={PERIOD_STYLE.red} />
      {[[16, 2.5], [29.5, 16], [16, 29.5], [2.5, 16]].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.8" fill={PERIOD_STYLE.ink} />
      ))}
    </svg>
  );
}

function Block({ s }: { s: Swatch }) {
  return <span className="period-block" aria-hidden="true" style={{ background: s.fill, borderColor: s.edge, borderWidth: s.edgeWidth }} />;
}

/** The scale bar for the map as drawn (px per metre): four alternate segments and its length. */
function ScaleBar({ pxPerM }: { pxPerM: number }) {
  const metres = niceScaleLength(pxPerM, 150);
  const len = metres * pxPerM;
  const label = (m: number): string => (m >= 1000 ? `${m / 1000}` : `${m}`);
  const unit = metres >= 1000 ? 'km' : 'm';
  return (
    <div className="period-scale" role="img" aria-label={`Scale bar: ${label(metres)} ${unit}`}>
      <div className="period-scale-bar" style={{ width: `${len}px` }}>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={i % 2 === 0 ? 'is-dark' : ''} />
        ))}
      </div>
      <div className="period-scale-labels" style={{ width: `${len}px` }}>
        <span>0</span>
        <span>{label(metres / 2)}</span>
        <span>
          {label(metres)} {unit}
        </span>
      </div>
    </div>
  );
}

type Props = {
  record: RunRecord;
  minute: number;
  /** The map's scale as drawn, for the scale bar (0 until the map has measured itself). */
  pxPerM: number;
  map: ReactNode;
  controls: ReactNode;
};

/**
 * The period sheet (Task 20, the owner's choice of a Clegg-style frame): parchment with a dark border, a red double rule
 * and corner ornaments; a title over the map; the Explanatory Notes beside it (collapsible); under it a cartouche with the
 * battle, the date and a scale bar, and the lettered clock and controls. The frame is laid out round the map, never over
 * it. On a phone it collapses to a thin border, the cartouche above the map and the Notes below.
 */
export function PeriodFrame({ record, minute, pxPerM, map, controls }: Props) {
  const notes = notesFor(record);
  const { place, force } = titleParts(record.scenarioTitle);
  const draft = record.scenarioStatus === 'draft';
  return (
    <section className="period-sheet" aria-label="Time-lapse map">
      <div className="period-grid">
        <Ornament className="is-tl" />
        <Ornament className="is-tr" />
        <Ornament className="is-bl" />
        <Ornament className="is-br" />
        <header className="period-title">
          <span className="period-rule" aria-hidden="true" />
          <div>
            <div className="period-eyebrow">The Great War</div>
            <div className="period-heading">Map of the Battle Line at {place}</div>
          </div>
          <span className="period-rule" aria-hidden="true" />
        </header>

        <div className="period-map">{map}</div>

        <aside className="period-notes">
          <details open>
            <summary>Explanatory Notes</summary>
            <div className="period-notes-body" role="group" aria-label="Explanatory Notes">
              {notes.allied.length > 0 && (
                <>
                  <div className="period-notes-head">Allied</div>
                  {notes.allied.map((s) => (
                    <div className="period-note" key={s.name}>
                      <Block s={s} />
                      <span>{s.name}</span>
                    </div>
                  ))}
                </>
              )}
              {notes.german.length > 0 && (
                <>
                  <div className="period-notes-head">German</div>
                  {notes.german.map((s) => (
                    <div className="period-note" key={s.name}>
                      <Block s={s} />
                      <span>{s.name}</span>
                    </div>
                  ))}
                </>
              )}
              <div className="period-note">
                <span className="period-block is-open" aria-hidden="true" />
                <span>Open block: waiting or in reserve</span>
              </div>
              <div className="period-note">
                <span className="period-block" aria-hidden="true" style={{ background: PERIOD_STYLE.fill.allied, opacity: 0.8 }} />
                <span>Allied-held ground</span>
              </div>
              <div className="period-note">
                <span className="period-block" aria-hidden="true" style={{ background: PERIOD_STYLE.fill.central, opacity: 0.8 }} />
                <span>German-held ground</span>
              </div>
              {notes.lines.length > 0 && (
                <div className="period-notes-lines">
                  {notes.lines.map((l) => (
                    <div className="period-note" key={l.text}>
                      <span className="period-line" aria-hidden="true" style={{ borderTopColor: l.color }} />
                      <span>{l.text}</span>
                    </div>
                  ))}
                </div>
              )}
              {notes.patches.length > 0 && (
                <div className="period-patches">
                  <div className="period-patches-head">Divisional Patches</div>
                  <div className="period-patches-row">
                    {notes.patches.map((p) => (
                      <div key={p.label} className="period-patch">
                        <span style={{ background: p.fill }} aria-hidden="true" />
                        {p.label}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <details className="period-more">
                <summary>Other signs</summary>
                <MapKey record={record} label="Other map signs" collapsible={false} />
              </details>
            </div>
          </details>
        </aside>

        <div className="period-cartouche" role="group" aria-label="Title cartouche">
          <svg className="period-flourish" viewBox="0 0 200 20" aria-hidden="true">
            <path d="M8 10H78M122 10H192" stroke={PERIOD_STYLE.red} strokeWidth="1.4" />
            <path d="M100 3 107 10 100 17 93 10Z" fill="none" stroke={PERIOD_STYLE.red} strokeWidth="1.6" />
            <circle cx="100" cy="10" r="2.2" fill={PERIOD_STYLE.red} />
            <circle cx="84" cy="10" r="2" fill={PERIOD_STYLE.ink} />
            <circle cx="116" cy="10" r="2" fill={PERIOD_STYLE.ink} />
          </svg>
          {force && <div className="period-cart-force">The {force.replace(/^the\s+/i, '').replace(/\s*\(.*\)\s*$/, '')} at</div>}
          <div className="period-cart-place">{place}</div>
          <div className="period-cart-when">
            Positions at {periodTime(record.zeroHour, minute)}, {periodDay(record.zeroHour, minute, true)}
          </div>
          <div className="period-cart-note">
            Battalions as simulated, seed {record.seed}
            {draft ? ', from draft data awaiting the owner’s review' : ''}.
          </div>
          {pxPerM > 0 && <ScaleBar pxPerM={pxPerM} />}
        </div>

        <div className="period-controls">{controls}</div>
      </div>
    </section>
  );
}
