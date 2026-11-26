import { describe, it, expect } from 'vitest';
import { defaultSetup } from './defaults';
import { encodeSetup, decodeSetup, validateSetup } from './setup';
import { mapById } from './map';
import { RULES_VERSION } from './settings';

describe('setups', () => {
  it('encode then decode gives the same setup', () => {
    const s = { ...defaultSetup('ridge'), mapEdits: [[5, { h: 70, t: 'wood' }]] as [number, { h: number; t: 'wood' }][], settings: { mgLethality: 0.003 }, seed: 42 };
    expect(decodeSetup(encodeSetup(s)).setup).toEqual(s);
  });
  it('a damaged link returns a notice, not a crash', () => {
    expect(decodeSetup('nonsense!!')).toEqual({ notice: 'This link is damaged.' });
  });
  it('a link from older rules loads with a notice', () => {
    const r = decodeSetup(encodeSetup({ ...defaultSetup('open'), rulesVersion: RULES_VERSION - 1 }));
    expect(r.setup?.mapId).toBe('open');
    expect(r.notice).toBe('Made with older rules: it may play out differently.');
  });
  it('validateSetup flags a unit in a river and a unit off the map', () => {
    const m = mapById('river')!; const ri = m.cells.findIndex(c => c.t === 'river');
    const x = (ri % m.w) * 100 + 50, y = Math.floor(ri / m.w) * 100 + 50;
    const s = { ...defaultSetup('river'), units: [{ id: 'x', side: 'attacker' as const, kind: 'battalion' as const, x, y, men: 800, reserve: false }, { id: 'y', side: 'attacker' as const, kind: 'battalion' as const, x: -5, y: 100, men: 800, reserve: false }] };
    const p = validateSetup(s, m);
    expect(p.some(t => /river/.test(t))).toBe(true);
    expect(p.some(t => /off the map/.test(t))).toBe(true);
  });
  it('a default setup encodes to under 2,000 characters', () => {
    expect(encodeSetup(defaultSetup('wooded-hill')).length).toBeLessThan(2000);
  });
});
