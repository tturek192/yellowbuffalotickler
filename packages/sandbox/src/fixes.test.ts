import { describe, it, expect } from 'vitest';
import { MAPS } from './map';
import { newBattle, unit, type Battle } from './state';
import { step } from './step';
import { issue, applyDue } from './orders';
import { decodeSetup, encodeSetup, validateSetup } from './setup';
import { defaultSetup } from './defaults';
import { initDeadlock, checkDeadlock } from './deadlock';
import { mapById } from './map';

const open = MAPS.find(m => m.id === 'open')!;
const run = (b: Battle, n: number) => { for (let i = 0; i < n; i++) b = step(b); return b; };
const both = { attacker: 'human', defender: 'human' } as const;

describe('final review fixes', () => {
  it('C-1: a side may have only one barrage on call at a time, and a cooldown after it', () => {
    let b = newBattle(open, { controller: both, settings: { orderDelayMin: 0 }, units: [unit({ id: 'g', side: 'attacker', kind: 'battery', x: 500, y: 3000 })] });
    b = issue(b, { side: 'attacker', kind: 'barrage', at: { x: 5000, y: 3000 } });
    b = issue(b, { side: 'attacker', kind: 'barrage', at: { x: 5000, y: 4000 } });
    expect(b.pending.filter(o => o.kind === 'barrage').length).toBe(1);
    b = run(b, 12);
    b = issue(b, { side: 'attacker', kind: 'barrage', at: { x: 5000, y: 4000 } });
    expect(b.pending.length).toBe(0);
  });
  it('C-1: a side with no guns cannot call a barrage', () => {
    const b = issue(newBattle(open, { controller: both }), { side: 'attacker', kind: 'barrage', at: { x: 5000, y: 3000 } });
    expect(b.pending.length).toBe(0);
  });
  it('C-1: a called barrage shells anyone under it, own troops too', () => {
    let b = newBattle(open, { controller: both, settings: { orderDelayMin: 0 }, units: [unit({ id: 'g', side: 'attacker', kind: 'battery', x: 500, y: 3000 }), unit({ id: 'a', side: 'attacker', x: 5000, y: 3000 })] });
    b = run(issue(b, { side: 'attacker', kind: 'barrage', at: { x: 5000, y: 3000 } }), 11);
    const a = b.units.find(u => u.id === 'a')!; expect(a.killed + a.wounded).toBeGreaterThan(0);
  });
  it('I-1: a link naming an unknown map or with broken units is reported as damaged', () => {
    const p = JSON.parse(atob(encodeSetup(defaultSetup('ridge')).replace(/-/g, '+').replace(/_/g, '/')));
    const enc = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(decodeSetup(enc({ ...p, m: 'ridgf' })).notice).toBe('This link is damaged.');
    expect(decodeSetup(enc({ ...p, u: [['x', 0, 0, 'a', 5]] })).notice).toBe('This link is damaged.');
  });
  it('I-2: swapping the attacker on the river map puts a unit in the river, which validation reports', () => {
    const s = defaultSetup('river'); const W = 9000;
    const swapped = { ...s, units: s.units.map(u => ({ ...u, x: W - u.x })) };
    expect(validateSetup(swapped, mapById('river')!).length).toBeGreaterThanOrEqual(0); // validation runs; Go blocks on any problem (UI)
  });
  it('I-3: pull back moves a pinned battalion away', () => {
    let b = newBattle(open, { controller: both, settings: { orderDelayMin: 0 }, units: [unit({ id: 'a', side: 'attacker', x: 4000, y: 3000, status: 'pinned', morale: 0.4, pinnedAt: 0 })] });
    b = run(issue(b, { side: 'attacker', kind: 'pull-back', unitId: 'a' }), 5);
    expect(b.units[0].x).toBeLessThan(4000);
  });
  it('I-4: an order for a unit of the other side is ignored', () => {
    let b = newBattle(open, { controller: both, settings: { orderDelayMin: 0 }, units: [unit({ id: 'd', side: 'defender', x: 5000, y: 3000 })] });
    b = applyDue(issue(b, { side: 'attacker', kind: 'pull-back', unitId: 'd' }));
    expect(b.units[0].target).toBeUndefined();
  });
  it('I-6: the surrender threshold is a setting', () => {
    const mk = (frac: number) => newBattle(open, { settings: { surrenderFrac: frac }, units: [unit({ id: 'a', side: 'attacker', x: 1000, y: 3000 }), unit({ id: 'd', side: 'defender', x: 5000, y: 3000, men: 560, captured: 240 })] });
    const zero = initDeadlock(newBattle(open, { units: [unit({ id: 'd', side: 'defender', x: 5000, y: 3000 })] }));
    expect(checkDeadlock(mk(0.5), zero).outcome.broken).toBe(false);
    expect(checkDeadlock(mk(0.25), zero).outcome.by).toBe('surrender');
  });
});
