import { describe, expect, it } from 'vitest';
import type { SimEvent } from '@wwi/engine';
import { battleRecord, trenchAt } from '../battle-record';
import type { TestCompany } from '../test-record';
import { totalsAt, victimSide } from './totals';

const co = (id: string, side: TestCompany['side']): TestCompany => ({ id, side, x: 0, y: 0, men: 100, status: 'holding' });
const events: Array<Partial<SimEvent> & Pick<SimEvent, 'kind' | 'minute'>> = [
  { kind: 'bombardment-result', minute: 0, factors: { losses: 16 } },
  { kind: 'mine-fired', minute: 0, factors: { menLost: 39 } },
  { kind: 'direct-fire', minute: 8, unitId: 'g1', factors: { killed: 1, wounded: 6 } },
  { kind: 'shelled', minute: 10, causes: ['defensive-barrage'], factors: { killed: 2, wounded: 3 } },
  { kind: 'shelled', minute: 10, causes: ['artillery-fire'], factors: { killed: 4, wounded: 5 } },
  { kind: 'shelled', minute: 12, unitId: '1a', causes: ['artillery-fire', 'friendly-barrage'], factors: { killed: 1, wounded: 1 } },
  { kind: 'defenders-trapped', minute: 14, unitId: '1a', factors: { captured: 66 } },
  { kind: 'dugout-cleared', minute: 30, unitId: '1a', factors: { prisoners: 44 } },
  { kind: 'company-surrendered', minute: 40, unitId: '1a', factors: { men: 57 } },
  { kind: 'guns-captured', minute: 50, unitId: '1a', factors: { guns: 89 } },
];
const r = battleRecord({ features: [trenchAt('f', 500)], snapshots: [{ minute: 0, companies: [co('1a', 'allied'), co('g1', 'central')] }], events, endMinute: 60 });

describe('running totals', () => {
  it('rise with the playhead: casualties by side, prisoners each side took and guns captured', () => {
    expect(totalsAt(r, 0)).toEqual({ casualties: { allied: { killed: 0, wounded: 0, captured: 0 }, central: { killed: 39, wounded: 0, captured: 0 } }, prisoners: { allied: 0, central: 0 }, guns: 0 });
    const end = totalsAt(r, 60);
    expect(end.casualties.allied).toEqual({ killed: 3, wounded: 4, captured: 57 });
    expect(end.casualties.central).toEqual({ killed: 39 + 1 + 4, wounded: 6 + 5, captured: 110 });
    expect(end.prisoners).toEqual({ allied: 110, central: 57 });
    expect(end.guns).toBe(89);
    expect(totalsAt(r, 13).casualties.allied.killed).toBe(3);
    expect(totalsAt(r, 11).casualties.allied.killed).toBe(2);
  });

  it('the bombardment before Zero is not counted (the summary keeps it apart)', () => {
    expect(totalsAt(r, 60).casualties.central.killed).toBe(44);
  });

  it('fire falls on the side named by its company; with none, a defensive barrage falls on the attackers', () => {
    const side = (id: string) => (id === '1a' ? 'allied' : id === 'g1' ? 'central' : undefined);
    expect(victimSide({ kind: 'direct-fire', unitId: 'g1', causes: [] } as never, side)).toBe('central');
    expect(victimSide({ kind: 'shelled', causes: ['defensive-barrage'] } as never, side)).toBe('allied');
    expect(victimSide({ kind: 'shelled', causes: ['artillery-fire'] } as never, side)).toBe('central');
    // Fire called for by a company falls on its enemy: the call's event (its ref) names the caller.
    const caller = (id: number) => (id === 7 ? ({ unitId: 'g1' } as never) : undefined);
    expect(victimSide({ kind: 'shelled', causes: ['artillery-fire'], refs: [7] } as never, side, caller)).toBe('allied');
  });
});
