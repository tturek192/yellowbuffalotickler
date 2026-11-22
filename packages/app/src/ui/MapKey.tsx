import type { ReactNode } from 'react';
import type { RunRecord } from '@wwi/engine';
import type { FeatureKind } from '@wwi/scenario';
import { featureInk } from '../map/features';
import { MAP_COLORS } from '../map/style';
import { MARKER_STYLE } from '../map/unitMarkers';
import { EFFECT_STYLE } from '../map/effects';

type Feature = RunRecord['geometry']['features'][number];

/** Key symbols for the map features worth naming, in key order; each shows only if the record has one. */
const FEATURE_KEYS: Array<{ kind: FeatureKind; label: string; symbol: (ink: string) => ReactNode }> = [
  {
    kind: 'communication-trench',
    label: 'Communication trench',
    symbol: (ink) => (
      <path d="M0 4h3v2h3V4h3v2h3V4h3v2h3V4h3v2h3V4h3" fill="none" stroke={ink} strokeWidth="0.8" opacity="0.8" />
    ),
  },
  {
    kind: 'wire',
    label: 'Wire',
    symbol: (ink) => (
      <path d="M2 3l4 4M6 3l-4 4M9 3l4 4M13 3l-4 4M16 3l4 4M20 3l-4 4M23 3l4 4M27 3l-4 4" stroke={ink} strokeWidth="0.9" opacity="0.9" />
    ),
  },
  {
    kind: 'wood',
    label: 'Wood',
    symbol: () => (
      <>
        <defs>
          <pattern id="key-wood" width="3.5" height="3.5" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <path d="M0 0v3.5" stroke="rgba(86,100,46,.55)" strokeWidth="1" />
          </pattern>
        </defs>
        <ellipse cx="14" cy="5" rx="10" ry="4" fill="url(#key-wood)" stroke="rgba(86,100,46,.8)" strokeWidth="1" />
      </>
    ),
  },
  {
    kind: 'village',
    label: 'Village',
    symbol: () => (
      <>
        <defs>
          <pattern id="key-village" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <path d="M0 0v4M0 0h4" stroke="rgba(59,51,38,.45)" strokeWidth="0.8" />
          </pattern>
        </defs>
        <rect x="5" y="1" width="18" height="8" fill="url(#key-village)" stroke="rgba(59,51,38,.8)" strokeWidth="1" />
      </>
    ),
  },
  {
    kind: 'road',
    label: 'Road',
    symbol: (ink) => (
      <>
        <path d="M1 5h26" stroke={ink} strokeWidth="3.5" strokeLinecap="round" />
        <path d="M1 5h26" stroke={MAP_COLORS.paper} strokeWidth="1.75" strokeLinecap="round" />
      </>
    ),
  },
  {
    kind: 'railway',
    label: 'Railway',
    symbol: (ink) => <path d="M0 5h28M4 2v6M12 2v6M20 2v6" stroke={ink} strokeWidth="1.2" />,
  },
  {
    kind: 'crater',
    label: 'Crater',
    symbol: () => (
      <>
        <circle cx="9" cy="5" r="3.5" fill="rgba(122,96,52,.16)" stroke="rgba(90,70,36,.8)" strokeWidth="1" />
        <circle cx="18" cy="5" r="2.5" fill="rgba(122,96,52,.16)" stroke="rgba(90,70,36,.8)" strokeWidth="1" />
      </>
    ),
  },
  {
    kind: 'subway',
    label: 'Subway',
    symbol: (ink) => <path d="M0 5h28" stroke={ink} strokeWidth="2.25" strokeDasharray="7 4" opacity="0.5" />,
  },
  {
    kind: 'tunnel',
    label: 'Tunnel',
    symbol: (ink) => <path d="M0 5h28" stroke={ink} strokeWidth="2.25" strokeDasharray="3 3" opacity="0.5" />,
  },
  {
    kind: 'strongpoint',
    label: 'Strongpoint',
    symbol: (ink) => (
      <>
        <rect x="10" y="1" width="8" height="8" fill="none" stroke={ink} strokeWidth="1.5" />
        <rect x="13" y="4" width="2" height="2" fill={ink} />
      </>
    ),
  },
  {
    kind: 'battery',
    label: 'Battery',
    symbol: (ink) => <path d="M14 0.5l4.5 8.5h-9z" fill={ink} stroke={MAP_COLORS.paper} strokeWidth="0.75" />,
  },
];

function KeyRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="key-row">
      <svg viewBox="0 0 28 10" aria-hidden="true">
        {children}
      </svg>
      {label}
    </div>
  );
}

/**
 * The map key, styled as part of the paper sheet. Feature and terrain entries appear only when the run has them. It
 * folds away under its heading (`collapsible`, the default), so it never takes the map's room; the period style shows it
 * inside its Explanatory Notes instead, with its own label.
 */
export function MapKey({ record, label = 'Map key', collapsible = true }: { record: RunRecord; label?: string; collapsible?: boolean }) {
  const first = new Map<FeatureKind, Feature>();
  for (const f of record.geometry.features) if (!first.has(f.kind)) first.set(f.kind, f);
  const segments = (record.geometry.segments?.length ?? 0) > 0;
  const barrages = record.geometry.barrageDepthM !== undefined && (record.snapshots ?? []).some((x) => x.barrages.length > 0);
  const mines = (record.events ?? []).some((e) => e.kind === 'mine-fired' && e.at !== undefined);
  const reserves = (record.snapshots ?? []).some((x) => (x.reserves?.rows.length ?? 0) > 0);
  const key = (
    <div className="map-key" aria-label={label} role="group">
      <KeyRow label="Allied trench">
        <path d="M0 3h4v4h4V3h4v4h4V3h4v4h4V3h4" fill="none" stroke={MAP_COLORS.allied} strokeWidth="1.6" />
      </KeyRow>
      <KeyRow label="German trench">
        <path d="M0 3h4v4h4V3h4v4h4V3h4v4h4V3h4" fill="none" stroke={MAP_COLORS.central} strokeWidth="1.6" />
      </KeyRow>
      <KeyRow label="Objective line">
        <path d="M0 5h28" stroke={MAP_COLORS.ink} strokeWidth="2" strokeDasharray="6 3" />
      </KeyRow>
      <KeyRow label="Front line">
        <path d="M0 3h28" stroke={MAP_COLORS.allied} strokeWidth="2" />
        <path d="M0 7.5h28" stroke={MAP_COLORS.central} strokeWidth="2" strokeDasharray="5 2" />
      </KeyRow>
      <KeyRow label="Captured ground">
        <rect x="1" y="1" width="26" height="8" fill={MAP_COLORS.allied} opacity={EFFECT_STYLE.capturedAlpha * 2} />
      </KeyRow>
      {segments && (
        <>
          <KeyRow label="Trench taken">
            <path d="M0 5h28" stroke={MAP_COLORS.allied} strokeWidth="2" />
          </KeyRow>
          <KeyRow label="Wire: uncut / cut">
            <path d="M1 3l3 3M4 3l-3 3M6 3l3 3M9 3l-3 3M11 3l3 3M14 3l-3 3M19 3l3 3M22 3l-3 3M26 3l2 2M28 3l-2 2" stroke={EFFECT_STYLE.wire.ink} strokeWidth="0.8" fill="none" />
          </KeyRow>
        </>
      )}
      <KeyRow label="Barrage (creeping)">
        <defs>
          <pattern id="key-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <path d="M0 0v4" stroke={EFFECT_STYLE.creeping.hatch} strokeWidth="2" />
          </pattern>
        </defs>
        <rect x="1" y="1" width="26" height="8" fill="url(#key-hatch)" stroke="rgba(150,116,40,.85)" strokeWidth="1" />
      </KeyRow>
      {barrages && (
        <>
          <KeyRow label="Standing barrage">
            <path d="M0 5h28" stroke={EFFECT_STYLE.standing.band} strokeWidth="7" />
            <path d="M2 2v6M6 2v6M10 2v6M14 2v6M18 2v6M22 2v6M26 2v6" stroke={EFFECT_STYLE.standing.tick} strokeWidth="0.8" />
          </KeyRow>
          <KeyRow label="Machine-gun barrage zone">
            <defs>
              <pattern id="key-mg" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <path d="M0 0v4" stroke={EFFECT_STYLE.mg.hatch} strokeWidth="1" />
              </pattern>
            </defs>
            <rect x="1" y="1" width="26" height="8" fill="url(#key-mg)" stroke={EFFECT_STYLE.mg.edge} strokeWidth="1" strokeDasharray="2 3" />
          </KeyRow>
        </>
      )}
      <KeyRow label="Shell burst · rifle and MG fire">
        <circle cx="7" cy="5" r="3.6" fill={EFFECT_STYLE.burst.flash} />
        <circle cx="7" cy="5" r="2" fill={EFFECT_STYLE.burst.shell} />
        <path d="M15 7l3-3M20 6l3-2.5M24 8l3-3" stroke={EFFECT_STYLE.burst.bullet} strokeWidth="1" />
      </KeyRow>
      {mines && (
        <KeyRow label="Mine crater">
          <circle cx="14" cy="5" r="4" fill={EFFECT_STYLE.crater.fill} stroke={EFFECT_STYLE.crater.rim} strokeWidth="1.2" />
        </KeyRow>
      )}
      {reserves && (
        <KeyRow label="Reserve column marching in">
          <path d="M27 5H8" stroke={MAP_COLORS.central} strokeWidth="2.5" strokeDasharray="5 3" />
          <path d="M1 5l7-3.5v7z" fill={MAP_COLORS.central} />
        </KeyRow>
      )}
      <KeyRow label="Battalion (zoomed out)">
        <rect x="5" y="3.5" width="18" height="6" fill={MAP_COLORS.allied} />
        <path d="M12 0.5V2.5M16 0.5V2.5" stroke={MAP_COLORS.ink} strokeWidth="1" />
      </KeyRow>
      <KeyRow label="Company (zoomed in)">
        <rect x="1" y="1" width="12" height="8" fill={MAP_COLORS.allied} />
        <rect x="15.5" y="1.5" width="11" height="7" fill={MAP_COLORS.central} stroke={MAP_COLORS.centralEdge} strokeWidth="1" />
      </KeyRow>
      <KeyRow label="Strength (bar under)">
        <rect x="4" y="1" width="20" height="5" fill={MAP_COLORS.allied} />
        <rect x="4" y="7" width="20" height="2.5" fill="rgba(59,51,38,.25)" />
        <rect x="4" y="7" width="12" height="2.5" fill={MAP_COLORS.ink} />
      </KeyRow>
      <KeyRow label="Steady">
        <rect x="5" y="1" width="18" height="8" fill={MAP_COLORS.allied} />
      </KeyRow>
      <KeyRow label="Pinned (hatched)">
        <defs>
          <pattern id="key-pinned" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <path d="M0 0v4" stroke={MARKER_STYLE.hatch} strokeWidth="1.4" />
          </pattern>
        </defs>
        <rect x="5" y="1" width="18" height="8" fill={MAP_COLORS.allied} />
        <rect x="5" y="1" width="18" height="8" fill="url(#key-pinned)" />
      </KeyRow>
      <KeyRow label="Falling back">
        <rect x="11" y="1" width="14" height="8" fill={MAP_COLORS.allied} />
        <path d="M9 5H2M2 5l3-2.5M2 5l3 2.5" fill="none" stroke={MARKER_STYLE.arrow} strokeWidth="1.5" />
      </KeyRow>
      <KeyRow label="Surrendered (white flag)">
        <rect x="5" y="3" width="18" height="6" fill={MAP_COLORS.allied} opacity="0.7" />
        <path d="M20 3V0.3" stroke={MAP_COLORS.ink} strokeWidth="1" />
        <path d="M20 0.3l-6 1.2 6 1.8z" fill="#fff" stroke={MAP_COLORS.ink} strokeWidth="0.6" />
      </KeyRow>
      <KeyRow label="Destroyed">
        <rect x="5" y="1" width="18" height="8" fill={MARKER_STYLE.destroyed} opacity="0.55" />
      </KeyRow>
      <KeyRow label="Suppressed (pulsing ring)">
        <rect x="1.5" y="0.75" width="25" height="8.5" fill="none" stroke={MARKER_STYLE.suppression} strokeWidth="1.2" opacity="0.7" />
        <rect x="7" y="2.5" width="14" height="5" fill={MAP_COLORS.allied} />
      </KeyRow>
      <KeyRow label="Consolidating">
        <rect x="5.5" y="0.5" width="17" height="9" fill="none" stroke="rgba(20,16,8,.45)" strokeWidth="1" />
        <rect x="7.25" y="2.25" width="13.5" height="5.5" fill={MAP_COLORS.allied} stroke="#fff" strokeWidth="1.5" />
      </KeyRow>
      {FEATURE_KEYS.map(({ kind, label, symbol }) => {
        const f = first.get(kind);
        return f ? (
          <KeyRow key={kind} label={label}>
            {symbol(featureInk(f))}
          </KeyRow>
        ) : null;
      })}
      {record.geometry.terrain && (
        <KeyRow label="Contours (5 m)">
          <path d="M0 3.5c5-2 9 2 14 0s9-2 14 0" fill="none" stroke="rgba(110,80,38,.45)" strokeWidth="0.9" />
          <path d="M0 7.5c5-2 9 2 14 0s9-2 14 0" fill="none" stroke="rgba(110,80,38,.3)" strokeWidth="0.7" />
        </KeyRow>
      )}
    </div>
  );
  if (!collapsible) return key;
  return (
    <details className="map-key-fold" open>
      <summary>Map key</summary>
      {key}
    </details>
  );
}
