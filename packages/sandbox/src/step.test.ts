import { describe, it, expect } from 'vitest';
import { MAPS } from './map';
import { newBattle, unit, totalOf } from './state';
import { step } from './step';
import { losClear } from './step';

const open = MAPS.find(m => m.id === 'open')!;
const ridge = MAPS.find(m => m.id === 'ridge')!;
const run = (b: ReturnType<typeof newBattle>, n: number) => { for (let i = 0; i < n; i++) b = step(b); return b; };

describe('rules', () => {
  it('a pinned unit does not advance', () => {
    const b = newBattle(open, { units: [unit({ id: 'a', side: 'attacker', x: 1000, y: 3000, status: 'pinned', target: { x: 8000, y: 3000 } })] });
    expect(run(b, 5).units[0].x).toBe(1000);
  });
  it('the gap rule traps a garrison when an attacker is within 50 m as the barrage lifts, not at 200 m', () => {
    for (const [gap, trapped] of [[40, true], [200, false]] as const) {
      const d = unit({ id: 'd', side: 'defender', x: 4000, y: 3000, status: 'holding', shelteredUntil: 1 });
      const a = unit({ id: 'a', side: 'attacker', x: 4000 - gap, y: 3000, status: 'holding' });
      const b = run(newBattle(open, { units: [a, d] }), 2);
      const dd = b.units.find(u => u.id === 'd')!;
      expect(dd.captured > 0).toBe(trapped);
    }
  });
  it('uncut wire slows an advance by at least half', () => {
    const go = (wire: boolean) => {
      const a = unit({ id: 'a', side: 'attacker', x: 2000, y: 3000, status: 'advancing', target: { x: 6000, y: 3000 } });
      const lines = wire ? [{ kind: 'wire' as const, side: 'defender' as const, points: [[2000, 0], [2000, 6000]] as [number, number][], cut: 0 }] : [];
      return run(newBattle(open, { units: [a], lines }), 10).units[0].x - 2000;
    };
    expect(go(true)).toBeLessThanOrEqual(go(false) / 2);
  });
  it('line of sight is blocked by a ridge', () => {
    expect(losClear(ridge, { x: 3000, y: 3000 }, { x: 8500, y: 3000 })).toBe(false);
    const row = Array.from({ length: open.h }, (_, y) => y).find(y => open.cells.slice(y * open.w + 10, y * open.w + 17).every(c => c.t === 'open'))!;
    expect(losClear(open, { x: 1050, y: row * 100 + 50 }, { x: 1650, y: row * 100 + 50 })).toBe(true);
  });
  it('men are conserved over 600 minutes of fighting', () => {
    const units = [0, 1, 2].map(i => unit({ id: `a${i}`, side: 'attacker', x: 2000, y: 2000 + i * 800, status: 'advancing', target: { x: 8000, y: 2000 + i * 800 } }))
      .concat([0, 1, 2].map(i => unit({ id: `d${i}`, side: 'defender', x: 4000, y: 2000 + i * 800, status: 'holding' })));
    const b0 = newBattle(open, { units });
    const b = run(b0, 600);
    for (const u of b.units) { const z = b0.units.find(x => x.id === u.id)!; expect(totalOf(u)).toBe(z.men); }
  });
  it('the same seed gives the same battle; another seed differs', () => {
    const mk = (seed: number) => newBattle(open, { seed, units: [unit({ id: 'a', side: 'attacker', x: 3200, y: 3000, status: 'advancing', target: { x: 8000, y: 3000 } }), unit({ id: 'd', side: 'defender', x: 3900, y: 3000, status: 'holding' })] });
    expect(JSON.stringify(run(mk(1), 300))).toBe(JSON.stringify(run(mk(1), 300)));
    expect(JSON.stringify(run(mk(1), 300))).not.toBe(JSON.stringify(run(mk(2), 300)));
  });
});
