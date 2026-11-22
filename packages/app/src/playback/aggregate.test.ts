import { describe, expect, it } from 'vitest';
import type { CompanyStatus, RunRecord } from '@wwi/engine';
import { aggregateBattalions, battalionLabel } from './aggregate';
import { frameAt, type FrameCompany } from './interpolate';
import { companyTable, unitsFor, type TestCompany } from '../test-record';

type Spec = { id: string; bn: string; men: number; morale?: number; suppression?: number; status?: CompanyStatus; x?: number; y?: number; side?: 'allied' | 'central' };

const company = (s: Spec): TestCompany => ({
  id: s.id, battalionId: s.bn, side: s.side ?? 'allied', x: s.x ?? 0, y: s.y ?? 0, men: s.men, status: s.status ?? 'advancing', morale: s.morale ?? 1, suppression: s.suppression ?? 0,
});

/** A record whose first snapshot holds `initial` and whose second holds `now`; returns the frame at the end. */
function setup(now: Spec[], initial: Spec[] = now): { rows: FrameCompany[]; record: RunRecord } {
  const cs = now.map(company);
  const record = {
    units: unitsFor(initial.map(company), cs),
    snapshots: [
      { minute: 0, companies: companyTable(initial.map(company)), barrages: [] },
      { minute: 10, companies: companyTable(cs), barrages: [] },
    ],
  } as unknown as RunRecord;
  return { rows: frameAt(record, 10).companies, record };
}

describe('aggregateBattalions', () => {
  it('sums men and weights morale and suppression by men', () => {
    const { rows, record } = setup([
      { id: 'a', bn: 'bn1', men: 100, morale: 0.8, suppression: 0.1 },
      { id: 'b', bn: 'bn1', men: 50, morale: 0.2, suppression: 0.4 },
    ]);
    const [b] = aggregateBattalions(rows, record);
    expect(b).toMatchObject({ id: 'bn1', men: 150, side: 'allied' });
    expect(b!.morale).toBeCloseTo(0.6);
    expect(b!.suppression).toBeCloseTo(0.2);
  });

  it('puts the marker at the centroid of its living companies', () => {
    const { rows, record } = setup([
      { id: 'a', bn: 'bn1', men: 100, x: 0, y: 0 },
      { id: 'b', bn: 'bn1', men: 100, x: 100, y: 200 },
      { id: 'c', bn: 'bn1', men: 0, status: 'destroyed', x: 5000, y: 5000 },
    ]);
    expect(aggregateBattalions(rows, record)[0]).toMatchObject({ x: 50, y: 100 });
  });

  it('keeps the last centroid once every company is destroyed or surrendered', () => {
    const { rows, record } = setup(
      [
        { id: 'a', bn: 'bn1', men: 0, status: 'destroyed', x: 10, y: 20 },
        { id: 'b', bn: 'bn1', men: 0, status: 'surrendered', x: 30, y: 40 },
      ],
      [
        { id: 'a', bn: 'bn1', men: 100, x: 10, y: 20 },
        { id: 'b', bn: 'bn1', men: 100, x: 30, y: 40 },
      ],
    );
    const [b] = aggregateBattalions(rows, record);
    expect(b).toMatchObject({ x: 20, y: 30, men: 0, status: 'surrendered' });
  });

  it('never draws off-map companies, and omits a battalion that is wholly off the map', () => {
    const { rows, record } = setup([
      { id: 'a', bn: 'bn1', men: 100, x: 0, status: 'advancing' },
      { id: 'b', bn: 'bn1', men: 100, x: 9000, status: 'off-map' },
      { id: 'c', bn: 'bn2', men: 100, status: 'off-map' },
    ]);
    const out = aggregateBattalions(rows, record);
    expect(out.map((b) => b.id)).toEqual(['bn1']);
    expect(out[0]).toMatchObject({ x: 0, men: 100, companies: 1 });
  });

  it('takes the status with the most men, ties broken surrendered, destroyed, falling-back, pinned, the rest', () => {
    const status = (...ss: CompanyStatus[]): string => {
      const { rows, record } = setup(ss.map((st, i) => ({ id: `c${i}`, bn: 'bn1', men: 50, status: st })));
      return aggregateBattalions(rows, record)[0]!.status;
    };
    expect(status('advancing', 'advancing', 'pinned')).toBe('advancing');
    expect(status('pinned', 'advancing')).toBe('pinned');
    expect(status('advancing', 'falling-back')).toBe('falling-back');
    expect(status('surrendered', 'destroyed', 'pinned')).toBe('surrendered');
    expect(status('destroyed', 'falling-back', 'pinned')).toBe('destroyed');
    expect(status('falling-back', 'pinned', 'advancing')).toBe('falling-back');
  });

  it('weights each company by its starting men, so surrendered and destroyed companies still count', () => {
    const start = (st: CompanyStatus, id: string): Spec => ({ id, bn: 'bn1', men: 100, status: st });
    const { rows, record } = setup(
      [
        { id: 'a', bn: 'bn1', men: 0, status: 'surrendered' },
        { id: 'b', bn: 'bn1', men: 0, status: 'surrendered' },
        { id: 'c', bn: 'bn1', men: 0, status: 'surrendered' },
        { id: 'd', bn: 'bn1', men: 20, status: 'advancing' },
      ],
      ['a', 'b', 'c', 'd'].map((id) => start('advancing', id)),
    );
    expect(aggregateBattalions(rows, record)[0]).toMatchObject({ status: 'surrendered', men: 20 });
  });

  it('measures strength against the battalion at Zero, losses and surrenders included', () => {
    const { rows, record } = setup(
      [
        { id: 'a', bn: 'bn1', men: 60 },
        { id: 'b', bn: 'bn1', men: 0, status: 'surrendered' },
      ],
      [
        { id: 'a', bn: 'bn1', men: 100 },
        { id: 'b', bn: 'bn1', men: 100 },
      ],
    );
    expect(aggregateBattalions(rows, record)[0]).toMatchObject({ men: 60, fullMen: 200 });
  });

  it('is ordered by battalion id', () => {
    const { rows, record } = setup([{ id: 'z', bn: 'b2', men: 1 }, { id: 'y', bn: 'b1', men: 1 }]);
    expect(aggregateBattalions(rows, record).map((b) => b.id)).toEqual(['b1', 'b2']);
  });
});

describe('battalionLabel', () => {
  it('names battalions compactly from their ids', () => {
    expect(battalionLabel('102bn')).toBe('102');
    expect(battalionLabel('12glosters')).toBe('12 Glosters');
    expect(battalionLabel('bir14-iii')).toBe('III/BIR14');
    expect(battalionLabel('111id-bn5')).toBe('111D B5');
    expect(battalionLabel('4gd-bn4')).toBe('4G B4');
    expect(battalionLabel('whatever')).toBe('WHA');
  });
});
