import { describe, expect, it } from 'vitest';
import type { SimEvent } from '@wwi/engine';
import { frameAt } from '../playback';
import { battleRecord, trenchAt } from '../battle-record';
import type { TestCompany } from '../test-record';
import { bursts, craters, FIRE_WINDOW_MIN, fireEventsAt, reserveColumns, segmentStates, standingBarrages } from './effects';
import { frontAt } from './front';

const co = (id: string, side: TestCompany['side'], x: number, y: number): TestCompany => ({ id, side, x, y, men: 100, status: 'holding' });

/** A busy minute: rifle and machine-gun fire on German companies, and shells on the Canadians. */
function busy() {
  const companies = [co('1a', 'allied', 300, 200), co('1b', 'allied', 300, 600), co('g1', 'central', 500, 200), co('g2', 'central', 500, 600)];
  const events: Array<Partial<SimEvent> & Pick<SimEvent, 'kind' | 'minute'>> = [];
  for (let i = 0; i < 12; i++) {
    events.push({ kind: 'direct-fire', minute: 10, unitId: i % 2 ? 'g1' : 'g2', factors: { firers: 4, hit: 6, killed: 1, wounded: 5 } });
    events.push({ kind: 'shelled', minute: 10, unitId: i % 2 ? '1a' : '1b', causes: ['defensive-barrage'], factors: { hit: 9, killed: 2, wounded: 7 } });
  }
  const r = battleRecord({ features: [trenchAt('front', 500)], snapshots: [{ minute: 0, companies }, { minute: 20, companies }], events });
  return { r, frame: frameAt(r, 10), ev: fireEventsAt(r, 10) };
}

describe('fire bursts', () => {
  it('the burst sampler is deterministic and thins with speed', () => {
    const { ev, frame } = busy();
    expect(bursts(ev, 1, frame)).toEqual(bursts(ev, 1, frame));
    expect(bursts(ev, 360, frame).length).toBeLessThan(bursts(ev, 1, frame).length);
  });

  it('thins steadily: each faster speed shows no more marks than the one before', () => {
    const { ev, frame } = busy();
    const n = [1, 10, 60, 360].map((s) => bursts(ev, s, frame).length);
    expect(n[0]).toBeGreaterThan(0);
    for (let i = 1; i < n.length; i++) expect(n[i]).toBeLessThanOrEqual(n[i - 1]!);
  });

  it('places marks round the company fired on: bullets on the Germans, shells on the Canadians', () => {
    const { ev, frame } = busy();
    const marks = bursts(ev, 1, frame);
    const near = (x: number, y: number) => marks.filter((m) => Math.hypot(m.x - x, m.y - y) < 80);
    expect(near(500, 200).every((m) => m.kind === 'bullet')).toBe(true);
    expect(near(300, 200).every((m) => m.kind === 'shell')).toBe(true);
    expect(near(500, 200).length + near(500, 600).length + near(300, 200).length + near(300, 600).length).toBe(marks.length);
  });

  it('a different frame minute draws a different scatter, and Math.random is never used', () => {
    const { r, ev } = busy();
    const a = bursts(ev, 1, frameAt(r, 10));
    const b = bursts(ev, 1, frameAt(r, 11));
    expect(a).not.toEqual(b);
    const real = Math.random;
    Math.random = () => {
      throw new Error('Math.random');
    };
    try {
      expect(bursts(ev, 1, frameAt(r, 10))).toEqual(a);
    } finally {
      Math.random = real;
    }
  });

  it('only fire events of the last few minutes, fading with age', () => {
    const { r } = busy();
    expect(fireEventsAt(r, 10).length).toBe(24);
    expect(fireEventsAt(r, 10 + FIRE_WINDOW_MIN).length).toBe(0);
    expect(fireEventsAt(r, 9).length).toBe(0);
    const old = bursts(fireEventsAt(r, 12), 1, frameAt(r, 12));
    const fresh = bursts(fireEventsAt(r, 10), 1, frameAt(r, 10));
    expect(Math.max(...old.map((m) => m.alpha))).toBeLessThan(Math.max(...fresh.map((m) => m.alpha)));
  });
});

describe('trench states', () => {
  it('a segment shows its holder and how much of its wire is cut', () => {
    const r = battleRecord({
      features: [trenchAt('front', 500), trenchAt('second', 800)],
      snapshots: [{ minute: 0, companies: [co('1a', 'allied', 300, 200)], segments: [['allied', 1], ['central', 0.2]] }],
    });
    const s = segmentStates(r, 0);
    expect(s.map((x) => [x.holder, x.wireCut, x.taken])).toEqual([
      ['allied', 1, true],
      ['central', 0.2, false],
    ]);
    expect(s[0]!.pieces[0]).toEqual([[500, 0], [500, 800]]);
  });
});

describe('standing barrages', () => {
  it('lie on the German-held segments ahead of a creeping barrage still going, as far as the last objective', () => {
    const base = battleRecord({
      features: [trenchAt('front', 500), trenchAt('second', 800), trenchAt('far', 2000)],
      snapshots: [{ minute: 0, companies: [co('1a', 'allied', 300, 200)], segments: [['allied'], ['central'], ['central']], barrages: [{ sectorId: 's1', done: false, points: [[450, 0], [450, 800]] }] }],
    });
    const r = { ...base, geometry: { ...base.geometry, lines: [{ id: 'blue', name: 'Blue Line', kind: 'objective', points: [[1000, 0], [1000, 800]] }] } } as typeof base;
    const frame = frameAt(r, 0);
    expect(standingBarrages(r, frame).map((p) => p[0]![0])).toEqual([800]);
    const done = frameAt({ ...r, snapshots: [{ ...r.snapshots[0]!, barrages: [{ sectorId: 's1', done: true, points: [[450, 0], [450, 800]] }] }] }, 0);
    expect(standingBarrages(r, done)).toEqual([]);
  });
});

describe('reserve columns', () => {
  it('a marching reserve is an arrow from the map edge, further on the longer it has marched', () => {
    const reserves = (status: string) => ({ columns: ['formationId', 'status', 'orderedMin', 'arriveMin'], rows: [['rir1-iii', status, 0, 100]] }) as never;
    const offMap = { ...co('rir1-iii-g1', 'central', 3000, 400), status: 'off-map' as const, battalionId: 'rir1-iii' };
    const r = battleRecord({
      features: [trenchAt('front', 500)],
      snapshots: [
        { minute: 0, companies: [co('1a', 'allied', 300, 200), offMap], reserves: reserves('marching') },
        { minute: 100, companies: [co('1a', 'allied', 300, 200), { ...offMap, status: 'marching', x: 1000 }], reserves: reserves('arrived') },
      ],
    });
    const bounds = { minX: 0, maxX: 1000, minY: 0, maxY: 800 };
    const at = (m: number) => reserveColumns(r, m, bounds);
    expect(at(20)).toHaveLength(1);
    expect(at(20)[0]!.side).toBe('central');
    expect(at(20)[0]!.from).toEqual([1000, 400]);
    expect(at(60)[0]!.to[0]).toBeLessThan(at(20)[0]!.to[0]);
    expect(at(100)).toEqual([]);
  });
});

describe('fire with no company named (Task 18 fix round)', () => {
  it('falls along the front of the side its event says it hit, whatever its cause', () => {
    const companies = [co('1a', 'allied', 300, 400), co('g1', 'central', 500, 400)];
    const unnamed = (cause: 'defensive-barrage' | 'off-map-fire', side: 'allied' | 'central') => ({
      kind: 'shelled' as const,
      minute: 10,
      causes: [cause],
      factors: { hit: 40 },
      losses: { [side]: { killed: 10, wounded: 30 } },
    });
    // An allied defensive barrage (on the Germans) and German off-map fire (on the Canadians).
    const r = battleRecord({
      features: [trenchAt('front', 500)],
      snapshots: [{ minute: 0, companies }, { minute: 20, companies }],
      events: [unnamed('defensive-barrage', 'central'), unnamed('off-map-fire', 'allied')],
    });
    const front = frontAt(r, 10);
    const marks = (i: number) => bursts([fireEventsAt(r, 10)[i]!], 1, frameAt(r, 10), front);
    expect(marks(0).length).toBeGreaterThan(0);
    for (const m of marks(0)) expect(Math.abs(m.x - 500)).toBeLessThan(80);
    for (const m of marks(1)) expect(Math.abs(m.x - 300)).toBeLessThan(80);
  });

  it('a fire event without a side (a record before engine 0.4.5) and no company draws no marks', () => {
    const companies = [co('1a', 'allied', 300, 400), co('g1', 'central', 500, 400)];
    const r = battleRecord({ features: [], snapshots: [{ minute: 0, companies }], events: [{ kind: 'shelled', minute: 0, causes: ['artillery-fire'], factors: { hit: 9 } }] });
    expect(bursts(fireEventsAt(r, 0), 1, frameAt(r, 0), frontAt(r, 0))).toEqual([]);
  });
});

describe('mine craters', () => {
  it('appear where a mine was blown, from the minute it was, at its radius', () => {
    const r = battleRecord({
      features: [],
      snapshots: [{ minute: 0, companies: [co('1a', 'allied', 300, 400)] }],
      events: [{ kind: 'mine-fired', minute: 5, at: [480, 410], factors: { craterRadiusM: 30, menLost: 20 }, losses: { central: { killed: 20, wounded: 0 } } }],
      endMinute: 30,
    });
    expect(craters(r, 4)).toEqual([]);
    expect(craters(r, 5)).toEqual([{ x: 480, y: 410, radiusM: 30 }]);
  });
});

describe('the standing barrage reaches as far as the fire plan', () => {
  it('uses the sector\'s recorded reach rather than the furthest objective', () => {
    const base = battleRecord({
      features: [trenchAt('front', 500), trenchAt('second', 800), trenchAt('far', 2000)],
      snapshots: [{ minute: 0, companies: [co('1a', 'allied', 300, 200)], segments: [['allied'], ['central'], ['central']], barrages: [{ sectorId: 's1', done: false, points: [[450, 0], [450, 800]] }] }],
    });
    const r = {
      ...base,
      geometry: {
        ...base.geometry,
        lines: [{ id: 'blue', name: 'Blue Line', kind: 'objective', points: [[1000, 0], [1000, 800]] }],
        sectors: [{ id: 's1', yMin: 0, yMax: 800, reach: [[2100, 0], [2100, 800]] }],
      },
    } as unknown as typeof base;
    expect(standingBarrages(r, frameAt(r, 0)).map((p) => p[0]![0])).toEqual([800, 2000]);
  });
});
