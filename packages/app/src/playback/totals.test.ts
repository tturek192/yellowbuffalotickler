import { describe, expect, it } from 'vitest';
import type { SimEvent } from '@wwi/engine';
import { battleRecord, trenchAt } from '../battle-record';
import type { TestCompany } from '../test-record';
import { totalsAt } from './totals';

const co = (id: string, side: TestCompany['side']): TestCompany => ({ id, side, x: 0, y: 0, men: 100, status: 'holding' });
const L = (side: 'allied' | 'central', killed: number, wounded: number) => ({ [side]: { killed, wounded } });
const events: Array<Partial<SimEvent> & Pick<SimEvent, 'kind' | 'minute'>> = [
  { kind: 'bombardment-result', minute: 0, factors: { losses: 16 } },
  { kind: 'mine-fired', minute: 0, factors: { menLost: 39 }, losses: L('central', 39, 0), at: [150, 100] },
  { kind: 'direct-fire', minute: 8, unitId: 'g1', factors: { killed: 1, wounded: 6 }, losses: L('central', 1, 6) },
  // The German defensive barrage on the attackers, and the attackers' standing barrage on the Germans.
  { kind: 'shelled', minute: 10, causes: ['defensive-barrage'], factors: { killed: 2, wounded: 3 }, losses: L('allied', 2, 3) },
  { kind: 'shelled', minute: 10, causes: ['artillery-fire'], factors: { killed: 4, wounded: 5 }, losses: L('central', 4, 5) },
  { kind: 'shelled', minute: 12, unitId: '1a', causes: ['artillery-fire', 'friendly-barrage'], factors: { killed: 1, wounded: 1 }, losses: L('allied', 1, 1) },
  { kind: 'defenders-trapped', minute: 14, unitId: '1a', factors: { captured: 66 } },
  { kind: 'dugout-cleared', minute: 30, unitId: '1a', factors: { prisoners: 44 } },
  { kind: 'company-surrendered', minute: 40, unitId: '1a', factors: { men: 57 } },
  { kind: 'guns-captured', minute: 50, unitId: '1a', factors: { guns: 89 } },
  // An allied defensive barrage on the Germans, and German off-map fire on the attackers (rules by cause would get both wrong).
  { kind: 'shelled', minute: 55, causes: ['artillery-fire', 'defensive-barrage'], factors: { killed: 3, wounded: 4 }, losses: L('central', 3, 4) },
  { kind: 'shelled', minute: 56, causes: ['off-map-fire'], factors: { killed: 5, wounded: 6 }, losses: L('allied', 5, 6) },
  // Fire that fell on both sides at once is split as the event says.
  { kind: 'shelled', minute: 57, causes: ['artillery-fire'], factors: { killed: 2, wounded: 2 }, losses: { allied: { killed: 1, wounded: 0 }, central: { killed: 1, wounded: 2 } } },
];
const r = battleRecord({ features: [trenchAt('f', 500)], snapshots: [{ minute: 0, companies: [co('1a', 'allied'), co('g1', 'central')] }], events, endMinute: 60 });

describe('running totals', () => {
  it('rise with the playhead: casualties by side, prisoners each side took and guns captured', () => {
    expect(totalsAt(r, 0)).toEqual({ casualties: { allied: { killed: 0, wounded: 0, captured: 0 }, central: { killed: 39, wounded: 0, captured: 0 } }, prisoners: { allied: 0, central: 0 }, guns: 0 });
    const mid = totalsAt(r, 50);
    expect(mid.casualties.allied).toEqual({ killed: 3, wounded: 4, captured: 57 });
    expect(mid.casualties.central).toEqual({ killed: 39 + 1 + 4, wounded: 6 + 5, captured: 110 });
    expect(mid.prisoners).toEqual({ allied: 110, central: 57 });
    expect(mid.guns).toBe(89);
    expect(totalsAt(r, 13).casualties.allied.killed).toBe(3);
    expect(totalsAt(r, 11).casualties.allied.killed).toBe(2);
  });

  it('the side hit is the one the event names: an allied defensive barrage, German off-map fire, fire on both sides', () => {
    const end = totalsAt(r, 60);
    expect(end.casualties.allied).toMatchObject({ killed: 3 + 5 + 1, wounded: 4 + 6 });
    expect(end.casualties.central).toMatchObject({ killed: 44 + 3 + 1, wounded: 11 + 4 + 2 });
  });

  it('the bombardment before Zero is not counted (the summary keeps it apart)', () => {
    expect(totalsAt(r, 50).casualties.central.killed).toBe(44);
  });

  it('a record from before engine 0.4.5 (no losses on its events) counts fire on a named company only', () => {
    const old = { ...r, events: r.events.map(({ losses: _l, ...e }) => e) } as typeof r;
    const end = totalsAt(old, 60);
    expect(end.casualties.central.killed).toBe(1); // only the direct fire on g1; the mine and unnamed fire carry no side
    expect(end.casualties.allied.killed).toBe(1); // the shelling of 1a
  });
});
