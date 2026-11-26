import { describe, it, expect } from 'vitest';
import { MAPS } from './map';
import { newBattle, unit, type Battle } from './state';
import { checkDeadlock, initDeadlock } from './deadlock';
import { runToEnd, startBattle } from './run';
import { defaultSetup } from './defaults';
import { step } from './step';

const open = MAPS.find(m => m.id === 'open')!;
const at = (b: Battle) => checkDeadlock(b, initDeadlock(b)).outcome;

describe('deadlock', () => {
  it('breakthrough: an attacker past the gun line with no reserve near', () => {
    const b = newBattle(open, { units: [unit({ id: 'g', side: 'defender', kind: 'battery', x: 7000, y: 3000 }), unit({ id: 'a', side: 'attacker', x: 7200, y: 3000 })] });
    expect(at(b)).toMatchObject({ broken: true, by: 'breakthrough' });
  });
  it('a reserve within sealDistance seals the sector', () => {
    const b = newBattle(open, { units: [unit({ id: 'g', side: 'defender', kind: 'battery', x: 7000, y: 3000 }), unit({ id: 'a', side: 'attacker', x: 7200, y: 3000 }), unit({ id: 'r', side: 'defender', x: 7500, y: 3000, startedReserve: true, status: 'holding' })] });
    expect(at(b).by).not.toBe('breakthrough');
  });
  it('surrender: half the defenders captured', () => {
    const b = newBattle(open, { units: [unit({ id: 'a', side: 'attacker', x: 1000, y: 3000 }), unit({ id: 'd', side: 'defender', x: 5000, y: 3000, men: 400, captured: 400 })] });
    const s = initDeadlock(newBattle(open, { units: [unit({ id: 'a', side: 'attacker', x: 1000, y: 3000 }), unit({ id: 'd', side: 'defender', x: 5000, y: 3000 })] }));
    expect(checkDeadlock(b, s).outcome).toMatchObject({ broken: true, by: 'surrender' });
  });
  it('collapse: the whole defending force below 10% fit', () => {
    const s = initDeadlock(newBattle(open, { units: [unit({ id: 'a', side: 'attacker', x: 1000, y: 3000 }), unit({ id: 'd', side: 'defender', x: 5000, y: 3000 })] }));
    const b = newBattle(open, { units: [unit({ id: 'a', side: 'attacker', x: 1000, y: 3000 }), unit({ id: 'd', side: 'defender', x: 5000, y: 3000, men: 60, killed: 740 })] });
    expect(checkDeadlock(b, s).outcome).toMatchObject({ broken: true, by: 'collapse' });
  });
  it('stronghold: held for strongholdHoldMin minutes, not less', () => {
    const sh = open.strongholds[0];
    let b = newBattle(open, { settings: { strongholdHoldMin: 5 }, units: [unit({ id: 'a', side: 'attacker', x: sh.x, y: sh.y }), unit({ id: 'd', side: 'defender', x: 100, y: 100 })] });
    let s = initDeadlock(b), o;
    for (let i = 0; i < 4; i++) { ({ outcome: o, state: s } = checkDeadlock(b, s)); b = { ...b, minute: b.minute + 1 }; expect(o.broken).toBe(false); }
    for (let i = 0; i < 3; i++) { ({ outcome: o, state: s } = checkDeadlock(b, s)); b = { ...b, minute: b.minute + 1 }; }
    expect(o!).toMatchObject({ broken: true, by: 'stronghold' });
  });
  it('an empty setup ends at once with nothing to fight', () => {
    const r = runToEnd({ ...defaultSetup('open'), units: [] }, 1);
    expect(r.outcome.ended).toBe('nothing-to-fight');
  });
  it('a full setup (maxUnitsPerSide a side) steps in under 2 ms per minute', () => {
    const base = defaultSetup('ridge');
    const units = Array.from({ length: 40 }, (_, i) => ({ id: `a${i}`, side: 'attacker' as const, kind: 'battalion' as const, x: 3000 + (i % 4) * 100, y: 300 + i * 140, men: 800, reserve: false }))
      .concat(Array.from({ length: 40 }, (_, i) => ({ id: `d${i}`, side: 'defender' as const, kind: 'battalion' as const, x: 4300 + (i % 4) * 100, y: 300 + i * 140, men: 800, reserve: false })));
    let b = startBattle({ ...base, units }, 1);
    const t0 = performance.now(); for (let i = 0; i < 200; i++) b = step(b);
    expect((performance.now() - t0) / 200).toBeLessThan(2);
  });
});
