import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RunRecord } from '@wwi/engine';
import { encodeTerrain, FEATURE_KINDS, type Feature, type FeatureKind, type TerrainGrid } from '@wwi/scenario';
import { frameAt } from '../playback';
import { chipBox, drawFrame, placeChips, shortId } from './draw';
import { drawFeatures } from './features';
import { recordingContext as stubContext } from '../test-canvas';
import { markerStyleAt } from './zoom';
import type { View } from './projection';
import { companyTable, unitsFor, type TestCompany } from '../test-record';

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

type Company = TestCompany;

function record(features: Feature[], companies: Company[] = []): RunRecord {
  return {
    engineVersion: '0.3.0',
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
    units: unitsFor(companies),
    snapshots: [{ minute: 0, companies: companyTable(companies), barrages: [] }, { minute: 10, companies: companyTable(companies), barrages: [] }],
    events: [],
    summary: { lineTaken: [] },
  } as unknown as RunRecord;
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
    balloon: point,
  };
  return FEATURE_KINDS.map((kind, i) => ({ id: `f${i}`, kind, side: 'central', name: `F${i}`, geometry: geom[kind], cite }));
}

const holding = (id: string, side: Company['side']): Company => ({ id, side, x: 200, y: 200, men: 120, status: 'holding' });

describe('drawing map features', () => {
  it('a wood or village name with no clear room is left off, never printed over another name', () => {
    const at = (id: string, name: string): Feature => ({ id, kind: 'village', name, geometry: { type: 'Point', coordinates: [0, 0] }, cite });
    const { ctx, calls } = stubContext();
    // Lifting a row at a time finds no room: a box already fills the four rows above.
    const labels = [{ x0: -500, x1: 500, y0: -200, y1: -9 }];
    drawFeatures(ctx, { scale: 1, tx: 0, ty: 0 }, [at('a', 'Avion'), at('b', 'Bailleul')], labels);
    const names = calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);
    expect(names).toEqual(['Avion']);
  });

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

describe('a label slid sideways', () => {
  // Two objective lines end at the same spot under the top margin, so the second label cannot be lifted clear: it slides.
  const sheetView: View = { scale: 0.5, tx: 100, ty: 500 };
  const objective = (id: string, name: string): RunRecord['geometry']['lines'][number] => ({ id, name, kind: 'objective', color: '#222', points: [[800, 0], [800, 920]] });
  const r: RunRecord = (() => {
    const base = record([]);
    return { ...base, geometry: { ...base.geometry, lines: [objective('a', 'Alpha Line'), objective('b', 'Bravo Line')] } };
  })();

  it('is drawn where it was placed, clear of its neighbour, with its hairline leading back to the line', () => {
    const rec = recordingContext();
    drawFrame(rec.ctx, sheetView, r, frameAt(r, 0));
    const textX = (t: string): number => rec.calls.find((c) => c.name === 'fillText' && c.args[0] === t)!.args[1] as number;
    const width = 'Alpha Line'.length * 6; // the stub context measures 6 px a character
    const alpha = textX('Alpha Line');
    const bravo = textX('Bravo Line');
    // The first sits centred on the line's end (screen x 500); the second has moved sideways and no longer touches it.
    expect(alpha).toBe(500 - width / 2);
    expect(bravo).not.toBe(alpha);
    expect(bravo >= alpha + width || bravo + width <= alpha).toBe(true);
    // Its hairline starts on the moved label (within its box) and ends at the line's end.
    const leaders = rec.calls.filter((c, i) => c.name === 'lineTo' && rec.calls[i - 1]?.name === 'moveTo' && (c.args[0] as number) === 500 && (rec.calls[i - 1]!.args[0] as number) !== 500);
    expect(leaders.length).toBeGreaterThanOrEqual(1);
    const startX = rec.calls[rec.calls.indexOf(leaders[0]!) - 1]!.args[0] as number;
    expect(startX).toBeGreaterThanOrEqual(bravo);
    expect(startX).toBeLessThanOrEqual(bravo + width);
  });
});

describe('unit markers', () => {
  const unit = (id: string, bn: string, x: number, over: Partial<Company> = {}): Company => ({ id, battalionId: bn, side: 'allied', x, y: 300, men: 100, status: 'advancing', ...over } as Company);
  const texts = (r: RunRecord, v: View, pulse?: number): string[] => {
    const rec = recordingContext();
    drawFrame(rec.ctx, v, r, frameAt(r, 0), pulse === undefined ? {} : { pulse });
    return rec.calls.filter((c) => c.name === 'fillText').map((c) => String(c.args[0]));
  };
  const r = record([], [unit('12bn-a', '12bn', 100), unit('12bn-b', '12bn', 140), unit('13bn-a', '13bn', 600)]);
  const corps: View = { scale: 0.1, tx: 100, ty: 500 };

  it('draws one marker per battalion at corps zoom and one per company when zoomed in', () => {
    expect(texts(r, corps)).toEqual(expect.arrayContaining(['12', '13']));
    expect(texts(r, corps)).not.toContain('12A');
    expect(texts(r, view)).toEqual(expect.arrayContaining(['12A', '12B', '13A']));
    expect(texts(r, view)).not.toContain('12');
  });

  it('does not draw off-map companies at either zoom', () => {
    const away = record([], [unit('12bn-a', '12bn', 100), unit('99bn-a', '99bn', 300, { status: 'off-map' })]);
    expect(texts(away, view)).toContain('12A');
    expect(texts(away, view)).not.toContain('99A');
    expect(texts(away, corps)).not.toContain('99');
  });

  it('rings a suppressed marker, and the ring moves with the pulse phase, not with the record', () => {
    const calm = record([], [unit('12bn-a', '12bn', 100)]);
    const shaken = record([], [unit('12bn-a', '12bn', 100, { suppression: 0.7 } as Partial<Company>)]);
    const rects = (rr: RunRecord, pulse: number): unknown[][] => {
      const rec = recordingContext();
      drawFrame(rec.ctx, view, rr, frameAt(rr, 0), { pulse });
      return rec.calls.filter((c) => c.name === 'strokeRect' && c.strokeStyle === '#d9822b').map((c) => c.args);
    };
    expect(rects(calm, 0.25)).toEqual([]);
    expect(rects(shaken, 0.25)).toHaveLength(1);
    expect(rects(shaken, 0.25)).toEqual(rects(shaken, 1.25));
    expect(rects(shaken, 0.25)).not.toEqual(rects(shaken, 0.75));
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


describe('battalion chips at corps zoom', () => {
  /** 76 battalions spread over about 7 km by 6 km (Vimy's density), from a fixed pseudo-random sequence. */
  const battalions = (): Array<{ x: number; y: number; label: string; men: number }> => {
    let seed = 12345;
    const rnd = (): number => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    return Array.from({ length: 76 }, (_, i) => ({ x: rnd() * 7000, y: rnd() * 6000, label: `B${i}`, men: 100 + i }));
  };
  const fitAll: View = { scale: 0.027, tx: 20, ty: 200 };

  /**
   * The measure: a chip is crowded when another chip covers more than 30% of its own box (strength bar included).
   * The share of crowded chips is what must stay small.
   */
  const crowdedShare = (boxes: ReturnType<typeof chipBox>[]): number => {
    const area = (b: (typeof boxes)[number]): number => (b.x1 - b.x0) * (b.y1 - b.y0);
    const common = (a: (typeof boxes)[number], b: (typeof boxes)[number]): number =>
      Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
    const crowded = boxes.filter((a, i) => boxes.some((b, j) => j !== i && common(a, b) > 0.3 * area(a)));
    return crowded.length / boxes.length;
  };

  it('are small enough at fit-all that under a third are crowded by a neighbour, and far fewer than the labelled markers were', () => {
    const style = markerStyleAt(fitAll);
    expect(style.kind).toBe('chip');
    const { w, h } = style as { w: number; h: number };
    const placed = placeChips(fitAll, battalions(), w, h);
    // Uniform scatter is the hard case; Vimy's real record measures about 21-24% by this same measure (0.3 here).
    const share = crowdedShare(placed.map(chipBox));
    expect(share).toBeLessThanOrEqual(0.3);
    // The old 40 x 20 labelled markers on the same ground: nearly every one is crowded. That is what the chips fix.
    const old = crowdedShare(placeChips(fitAll, battalions(), 40, 20).map(chipBox));
    expect(old).toBeGreaterThan(0.8);
    expect(old).toBeGreaterThan(2 * share);
  });

  it('draw no text on the chip, and name only battalions whose names fit clear of everything', () => {
    const bs = battalions().map((b, i) => ({ id: `${i + 10}bn-a`, battalionId: `${i + 10}bn`, side: 'allied' as const, x: b.x, y: b.y, men: 100, status: 'advancing' as const }));
    const r = record([], bs as unknown as Company[]);
    const rec = recordingContext();
    drawFrame(rec.ctx, fitAll, r, frameAt(r, 0));
    const names = rec.calls.filter((c) => c.name === 'fillText' && /^\d+$/.test(String(c.args[0])));
    expect(names.length).toBeGreaterThan(0);
    expect(names.length).toBeLessThan(76); // crowded: not every battalion can be named
    const boxes = names.map((c) => ({ x0: c.args[1] as number, x1: (c.args[1] as number) + 6 * String(c.args[0]).length, y: c.args[2] as number }));
    for (const [i, a] of boxes.entries()) for (const b of boxes.slice(i + 1)) expect(Math.abs(a.y - b.y) >= 10 || a.x1 <= b.x0 || b.x1 <= a.x0).toBe(true);
  });
});
