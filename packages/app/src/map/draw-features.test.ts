import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunRecord } from '@wwi/engine';
import { encodeTerrain, FEATURE_KINDS, type Feature, type FeatureKind, type TerrainGrid } from '@wwi/scenario';
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

const fillTextY = (calls: Call[], text: string): number | undefined => calls.find((c) => c.name === 'fillText' && c.args[0] === text)?.args[2] as number | undefined;

describe('map labels', () => {
  // Drawn lower than the shared view so the clock card's corner (reserved at the sheet's top left) is not in the way:
  // the German front line's label sits just above its north end, at screen (175, 160).
  const labelView: View = { scale: 0.5, tx: 100, ty: 560 };
  const woodAt = (id: string, name: string): Feature => ({
    id, kind: 'wood', name, cite,
    geometry: { type: 'Polygon', coordinates: [[150, 780], [250, 780], [250, 860], [150, 860]] },
  });

  it('lifts a line label clear of a wood or village name', () => {
    const plain = recordingContext();
    drawFrame(plain.ctx, labelView, record([]), frameAt(record([]), 0));
    const r = record([woodAt('w', 'Bois')]);
    const withWood = recordingContext();
    drawFrame(withWood.ctx, labelView, r, frameAt(r, 0));
    expect(fillTextY(plain.calls, 'German front line')).toBe(153);
    expect(fillTextY(withWood.calls, 'German front line')!).toBeLessThan(153);
  });

  it('prints a trench name without its qualifier, each objective line once, and one tag per division', () => {
    const base = record([]);
    const lines: RunRecord['geometry']['lines'] = [
      { id: 'c', name: 'Canadian front line, last light 8 April', kind: 'trench', side: 'allied', points: [[0, 0], [0, 800]] },
      { id: 'a1', name: 'Red Line, 1st Canadian Division', kind: 'objective', color: '#c00', points: [[300, 0], [320, 300]] },
      { id: 'a2', name: 'Red Line, 2nd Canadian Division', kind: 'objective', color: '#c00', points: [[320, 400], [330, 700]] },
      { id: 'b1', name: 'Black Line, 1st Canadian Division', kind: 'objective', color: '#000', points: [[200, 0], [220, 300]] },
      { id: 'd', name: 'Plain Line', kind: 'objective', color: '#080', points: [[260, 0], [260, 300]] },
    ];
    const r: RunRecord = { ...base, geometry: { ...base.geometry, lines } };
    const rec = recordingContext();
    drawFrame(rec.ctx, labelView, r, frameAt(r, 0));
    const texts = rec.calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
    const n = (t: string) => texts.filter((x) => x === t).length;
    expect(n('Canadian front line')).toBe(1);
    expect(texts.some((t) => String(t).includes('last light'))).toBe(false);
    expect([n('Red Line'), n('Black Line'), n('Plain Line')]).toEqual([1, 1, 1]);
    expect(texts.filter((t) => String(t).includes('Division'))).toEqual([]);
    expect([n('1st Cdn Div'), n('2nd Cdn Div')]).toEqual([1, 1]);
  });

  it('keeps two area names from printing over each other', () => {
    const r = record([woodAt('w1', 'Bois Un'), woodAt('w2', 'Bois Deux')]);
    const calls = recordingContext();
    drawFrame(calls.ctx, view, r, frameAt(r, 0));
    expect(fillTextY(calls.calls, 'Bois Un')).not.toBe(fillTextY(calls.calls, 'Bois Deux'));
  });
});

describe('terrain', () => {
  let made = 0;
  const saved = { OffscreenCanvas: globalThis.OffscreenCanvas, ImageData: globalThis.ImageData };
  beforeEach(() => {
    made = 0;
    (globalThis as Record<string, unknown>).OffscreenCanvas = class {
      constructor(public width: number, public height: number) {
        made++;
      }
      getContext() {
        return recordingContext().ctx;
      }
    };
    (globalThis as Record<string, unknown>).ImageData = class {
      constructor(public data: Uint8ClampedArray, public width: number, public height: number) {}
    };
  });
  afterEach(() => Object.assign(globalThis, saved));

  const ridge = (): TerrainGrid => {
    const elevM: number[] = [];
    for (let j = 0; j < 40; j++) for (let i = 0; i < 40; i++) elevM.push(100 + 40 * Math.exp(-(((i - 20) / 6) ** 2)));
    return { source: { source: 'test-src' }, method: 'test', ...encodeTerrain({ cellM: 25, originX: -100, originY: -100, cols: 40, rows: 40, elevM }) };
  };
  const withTerrain = (features: Feature[]): RunRecord => {
    const r = record(features);
    return { ...r, geometry: { ...r.geometry, terrain: ridge() } };
  };
  const crater: Feature = { id: 'k', kind: 'crater', geometry: { type: 'Point', coordinates: [400, 500], radiusM: 20 }, cite };

  it('draws the hillshade and contours over the paper and under the features', () => {
    const r = withTerrain([crater]);
    const calls = recordingContext();
    drawFrame(calls.ctx, view, r, frameAt(r, 0));
    const names = calls.calls.map((c) => c.name);
    const paper = names.indexOf('fillRect');
    const terrain = names.indexOf('drawImage');
    expect(paper).toBeGreaterThanOrEqual(0);
    expect(terrain).toBeGreaterThan(paper);
    expect(terrain).toBeLessThan(names.indexOf('arc'));
    expect(calls.calls[terrain]!.args.slice(1)).toEqual([0, 0, 800, 600]);
  });

  it('draws no terrain layer for a record without one', () => {
    const calls = recordingContext();
    drawFrame(calls.ctx, view, record([crater]), frameAt(record([crater]), 0));
    expect(calls.count('drawImage')).toBe(0);
    expect(made).toBe(0);
  });

  it('shades once per view and size, not once per frame', () => {
    const r = withTerrain([]);
    for (let i = 0; i < 3; i++) drawFrame(recordingContext().ctx, view, r, frameAt(r, 0));
    expect(made).toBe(1);
    drawFrame(recordingContext().ctx, { ...view, scale: 0.6 }, r, frameAt(r, 0));
    expect(made).toBe(2);
  });
});

