import { describe, expect, it } from 'vitest';
import type { RunRecord } from '@wwi/engine';
import { FEATURE_KINDS, type Feature, type FeatureKind } from '@wwi/scenario';
import { frameAt } from '../playback';
import { drawFrame, shortId } from './draw';
import type { View } from './projection';

type Call = { name: string; args: unknown[]; fillStyle: unknown; strokeStyle: unknown };

/** A 2D context stub that records every method call along with the fill and stroke styles in force. */
function recordingContext() {
  const calls: Call[] = [];
  const props: Record<string | symbol, unknown> = { canvas: { width: 800, height: 600 } };
  const returns: Record<string, (...a: unknown[]) => unknown> = {
    getTransform: () => ({ a: 1 }),
    createRadialGradient: () => ({ addColorStop() {} }),
    createLinearGradient: () => ({ addColorStop() {} }),
    measureText: (t) => ({ width: String(t).length * 6 }),
  };
  const ctx = new Proxy(
    {},
    {
      get: (_, k) =>
        k in props
          ? props[k]
          : (...args: unknown[]) => {
              calls.push({ name: String(k), args, fillStyle: props.fillStyle, strokeStyle: props.strokeStyle });
              return returns[String(k)]?.(...args);
            },
      set: (_, k, v) => {
        props[k] = v;
        return true;
      },
    },
  ) as CanvasRenderingContext2D;
  return { ctx, calls, count: (name: string) => calls.filter((c) => c.name === name).length };
}

const view: View = { scale: 0.5, tx: 100, ty: 500 };
const cite = { value: 'schematic', estimate: 'test fixture' };

type Company = RunRecord['snapshots'][number]['companies'][number];

function record(features: Feature[], companies: Company[] = []): RunRecord {
  return {
    engineVersion: '0.2.0',
    scenarioId: 'x',
    scenarioTitle: 'X',
    scenarioStatus: 'draft',
    seed: 1,
    zeroHour: '1917-04-09T05:30',
    stepMin: 2,
    endMinute: 10,
    geometry: {
      lines: [{ id: 'gfront', name: 'German front line', kind: 'trench', side: 'central', points: [[150, 0], [150, 800]] }],
      sectors: [{ id: 's1', yMin: 0, yMax: 800 }],
      features,
    },
    snapshots: [{ minute: 0, companies, barrages: [] }, { minute: 10, companies, barrages: [] }],
    events: [],
    summary: { lineTaken: [] },
  };
}

const line: Feature['geometry'] = { type: 'LineString', coordinates: [[100, 50], [140, 300], [120, 600]] };
const poly: Feature['geometry'] = { type: 'Polygon', coordinates: [[300, 100], [600, 120], [550, 400], [320, 380]] };
const point: Feature['geometry'] = { type: 'Point', coordinates: [400, 500], radiusM: 20 };

/** One feature of every kind, each in the geometry it usually has. */
function everyKind(): Feature[] {
  const geom: Record<FeatureKind, Feature['geometry']> = {
    trench: line,
    'communication-trench': line,
    wire: line,
    crater: point,
    subway: line,
    tunnel: line,
    wood: poly,
    village: poly,
    road: line,
    railway: line,
    strongpoint: point,
    battery: point,
  };
  return FEATURE_KINDS.map((kind, i) => ({ id: `f${i}`, kind, side: 'central', name: `F${i}`, geometry: geom[kind], cite }));
}

const holding = (id: string, side: Company['side']): Company => ({ id, side, x: 200, y: 200, strength: 120, status: 'holding' });

describe('drawing map features', () => {
  it('draws each feature kind without throwing on a stub context', () => {
    const r = record(everyKind());
    const calls = recordingContext();
    drawFrame(calls.ctx, view, r, frameAt(r, 0));
    expect(calls.count('stroke')).toBeGreaterThan(0);
    expect(calls.count('arc')).toBeGreaterThan(0);
  });

  it.each(FEATURE_KINDS)('draws a %s in every geometry type', (kind) => {
    const base = recordingContext();
    drawFrame(base.ctx, view, record([]), frameAt(record([]), 0));
    for (const geometry of [line, poly, point]) {
      const r = record([{ id: 'f', kind, side: 'allied', geometry, cite }]);
      const calls = recordingContext();
      drawFrame(calls.ctx, view, r, frameAt(r, 0));
      expect(calls.calls.length, `${kind} as ${geometry.type}`).toBeGreaterThan(base.calls.length);
    }
  });

  it('draws craters as circles sized by radiusM, at least a few pixels across', () => {
    const r = record([{ id: 'k', kind: 'crater', geometry: { type: 'Point', coordinates: [400, 500], radiusM: 20 }, cite }]);
    const calls = recordingContext();
    drawFrame(calls.ctx, view, r, frameAt(r, 0));
    const arcs = calls.calls.filter((c) => c.name === 'arc');
    expect(arcs.map((c) => c.args.slice(0, 3))).toContainEqual([300, 250, 10]);
  });

  it('draws features under the company markers', () => {
    const r = record(everyKind(), [holding('rir262-1', 'central')]);
    const calls = recordingContext();
    drawFrame(calls.ctx, view, r, frameAt(r, 0));
    const firstMarker = calls.calls.findIndex((c) => c.name === 'fillRect' && c.args[2] === 26 && c.args[3] === 16);
    const lastArc = calls.calls.map((c) => c.name).lastIndexOf('arc');
    expect(firstMarker).toBeGreaterThan(0);
    expect(lastArc).toBeGreaterThan(0);
    expect(lastArc).toBeLessThan(firstMarker);
  });

  it('outlines German markers in #8e2418', () => {
    const r = record([], [holding('rir262-1', 'central')]);
    const calls = recordingContext();
    drawFrame(calls.ctx, view, r, frameAt(r, 0));
    expect(calls.calls.some((c) => c.name === 'strokeRect' && c.strokeStyle === '#8e2418')).toBe(true);
  });

  it('gives holding companies no strength bar', () => {
    const bars = (c: Company) => {
      const r = record([], [c]);
      const calls = recordingContext();
      drawFrame(calls.ctx, view, r, frameAt(r, 0));
      return calls.calls.filter((x) => x.name === 'fillRect' && x.args[3] === 3).length;
    };
    expect(bars(holding('rir262-1', 'central'))).toBe(0);
    expect(bars({ ...holding('1bn-a', 'allied'), status: 'advancing' })).toBeGreaterThan(0);
  });

  it('shortens German company ids to company/regiment', () => {
    expect(shortId('rir262-1')).toBe('1/262');
    expect(shortId('ir11-12')).toBe('12/11');
  });
});
