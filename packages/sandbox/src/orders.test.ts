import { describe, it, expect } from 'vitest';
import { MAPS } from './map';
import { newBattle, unit, type Battle } from './state';
import { step } from './step';
import { issue, aiDecide } from './orders';

const open = MAPS.find(m => m.id === 'open')!;
const run = (b: Battle, n: number) => { for (let i = 0; i < n; i++) b = step(b); return b; };
const both = { attacker: 'human', defender: 'human' } as const;

describe('orders', () => {
  it('an order takes effect at dueAt, not before', () => {
    let b = newBattle(open, { controller: both, units: [unit({ id: 'r', side: 'attacker', x: 1000, y: 3000, status: 'waiting', reserve: true })] });
    b = issue(b, { side: 'attacker', kind: 'send-reserve', unitId: 'r', at: { x: 3000, y: 3000 } });
    expect(b.pending[0].dueAt).toBe(b.settings.orderDelayMin);
    expect(run(b, b.settings.orderDelayMin).units[0].x).toBe(1000);
    expect(run(b, b.settings.orderDelayMin + 2).units[0].x).toBeGreaterThan(1000);
  });
  it('a barrage order shells its point for 10 minutes', () => {
    let b = newBattle(open, { controller: both, settings: { orderDelayMin: 0 }, units: [unit({ id: 'd', side: 'defender', x: 5000, y: 3000 })] });
    b = issue(b, { side: 'attacker', kind: 'barrage', at: { x: 5000, y: 3000 } });
    const after = run(b, 11);
    expect(after.units[0].killed + after.units[0].wounded).toBeGreaterThan(0);
    const shelledMinutes = after.events.length; // not used
    expect(run(after, 1).pointBarrages.length).toBe(0);
    void shelledMinutes;
  });
  it('pull back moves the unit away from the enemy', () => {
    let b = newBattle(open, { controller: both, settings: { orderDelayMin: 0 }, units: [unit({ id: 'a', side: 'attacker', x: 4000, y: 3000 })] });
    b = issue(b, { side: 'attacker', kind: 'pull-back', unitId: 'a' });
    expect(run(b, 5).units[0].x).toBeLessThan(4000);
  });
  it('the defender does not react to an attacker none of its units can see', () => {
    const ridge = MAPS.find(m => m.id === 'ridge')!;
    const b = newBattle(ridge, {
      controller: { attacker: 'human', defender: 'computer' },
      units: [unit({ id: 'a', side: 'attacker', x: 3000, y: 3000 }), unit({ id: 'd', side: 'defender', x: 8500, y: 3000 }), unit({ id: 'r', side: 'defender', x: 8800, y: 3000, status: 'waiting', reserve: true })],
    });
    expect(aiDecide(b, 'defender')).toEqual([]);
  });
  it('with both sides on the computer, a battle runs 600 minutes on every map without error', () => {
    for (const m of MAPS) {
      const units = [0, 1, 2, 3].flatMap(i => [
        unit({ id: `a${i}`, side: 'attacker', x: 1500, y: 1200 + i * 1000, status: 'advancing', target: { x: 8000, y: 1200 + i * 1000 } }),
        unit({ id: `d${i}`, side: 'defender', x: 5000, y: 1200 + i * 1000 }),
      ]).concat([unit({ id: 'ar', side: 'attacker', x: 500, y: 3000, status: 'waiting', reserve: true }), unit({ id: 'dr', side: 'defender', x: 8000, y: 3000, status: 'waiting', reserve: true })]);
      const b = run(newBattle(m, { controller: { attacker: 'computer', defender: 'computer' }, units }), 600);
      expect(b.minute).toBe(600);
    }
  });
});
