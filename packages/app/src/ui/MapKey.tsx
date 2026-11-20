import type { ReactNode } from 'react';
import type { RunRecord } from '@wwi/engine';
import type { FeatureKind } from '@wwi/scenario';
import { featureInk } from '../map/features';
import { MAP_COLORS } from '../map/style';

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

/** The map key, styled as part of the paper sheet. Feature and terrain entries appear only when the run has them. */
export function MapKey({ record }: { record: RunRecord }) {
  const first = new Map<FeatureKind, Feature>();
  for (const f of record.geometry.features) if (!first.has(f.kind)) first.set(f.kind, f);
  return (
    <div className="map-key" aria-label="Map key" role="group">
      <KeyRow label="Allied trench">
        <path d="M0 3h4v4h4V3h4v4h4V3h4v4h4V3h4" fill="none" stroke={MAP_COLORS.allied} strokeWidth="1.6" />
      </KeyRow>
      <KeyRow label="German trench">
        <path d="M0 3h4v4h4V3h4v4h4V3h4v4h4V3h4" fill="none" stroke={MAP_COLORS.central} strokeWidth="1.6" />
      </KeyRow>
      <KeyRow label="Objective line">
        <path d="M0 5h28" stroke={MAP_COLORS.ink} strokeWidth="2" strokeDasharray="6 3" />
      </KeyRow>
      <KeyRow label="Barrage">
        <defs>
          <pattern id="key-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <path d="M0 0v4" stroke={MAP_COLORS.hatch} strokeWidth="2" />
          </pattern>
        </defs>
        <rect x="1" y="1" width="26" height="8" fill="url(#key-hatch)" stroke="rgba(150,116,40,.85)" strokeWidth="1" />
      </KeyRow>
      <KeyRow label="Company">
        <rect x="1" y="1" width="12" height="8" fill={MAP_COLORS.allied} />
        <rect x="15.5" y="1.5" width="11" height="7" fill={MAP_COLORS.central} stroke={MAP_COLORS.centralEdge} strokeWidth="1" />
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
}
