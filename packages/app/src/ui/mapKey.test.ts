import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { RunRecord } from '@wwi/engine';
import { encodeTerrain, type Feature, type FeatureKind } from '@wwi/scenario';
import { MapKey } from './MapKey';

const feature = (kind: FeatureKind): Feature => ({
  id: kind,
  kind,
  geometry: { type: 'Point', coordinates: [0, 0] },
  cite: { value: 'x', estimate: 'test' },
});

function keyOf(kinds: FeatureKind[], terrain = false): string {
  const geometry = {
    lines: [],
    sectors: [],
    features: kinds.map(feature),
    ...(terrain ? { terrain: { source: { source: 's' }, method: 't', ...encodeTerrain({ cellM: 1, originX: 0, originY: 0, cols: 1, rows: 1, elevM: [1] }) } } : {}),
  };
  return renderToStaticMarkup(createElement(MapKey, { record: { geometry } as unknown as RunRecord }));
}

describe('MapKey', () => {
  it('always names trenches, objectives, the barrage and companies', () => {
    const html = keyOf([]);
    for (const t of ['Allied trench', 'German trench', 'Objective line', 'Barrage', 'Battalion', 'Company', 'Consolidating', 'Strength', 'Steady', 'Pinned', 'Falling back', 'Surrendered', 'Destroyed', 'Suppressed']) expect(html).toContain(t);
  });

  it('adds a feature symbol only when the record has that kind', () => {
    const none = keyOf([]);
    for (const t of ['Wire', 'Wood', 'Village', 'Crater', 'Subway', 'Battery', 'Contours']) expect(none).not.toContain(t);
    const some = keyOf(['wire', 'crater', 'trench']);
    expect(some).toContain('Wire');
    expect(some).toContain('Crater');
    expect(some).not.toContain('Wood');
    const all = keyOf(['wire', 'wood', 'village', 'crater', 'subway', 'battery'], true);
    for (const t of ['Wire', 'Wood', 'Village', 'Crater', 'Subway', 'Battery', 'Contours (5 m)']) expect(all).toContain(t);
  });

  it('names roads, railways, tunnels, strongpoints and communication trenches when the record has them', () => {
    const labels = ['Road', 'Railway', 'Tunnel', 'Strongpoint', 'Communication trench'];
    const none = keyOf(['wire']);
    for (const t of labels) expect(none).not.toContain(t);
    const all = keyOf(['road', 'railway', 'tunnel', 'strongpoint', 'communication-trench']);
    for (const t of labels) expect(all).toContain(t);
    expect(keyOf(['tunnel'])).not.toContain('Subway');
  });
});
