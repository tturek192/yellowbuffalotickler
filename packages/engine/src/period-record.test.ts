import { describe, expect, it } from 'vitest';
import { runScenario } from './run';
import { fixtureBomb, fixtureComms } from './test-helpers';

/** What the period map's vignettes are drawn from (engine 0.4.6 on): batteries' places and contact-patrol flights. */
describe('the record carries what the map vignettes stand on', () => {
  it("every battery with a position is in the geometry, with its side, weapon and count", () => {
    const [s, m] = fixtureBomb();
    const r = runScenario(s, m, { seed: 1, endMinute: 4 });
    const placed = s.artillery.filter((a) => Array.isArray(a.position));
    expect(placed.length).toBeGreaterThan(0);
    expect(r.geometry.batteries).toEqual(
      placed.map((a) => ({ id: a.id, side: a.side, weapon: a.weapon, count: a.count.value, at: a.position })),
    );
  });

  it('a contact-patrol message is recorded while in flight: who sent it, when it left and when it lands', () => {
    const f = fixtureComms({ links: 'runners' });
    f[0].communications = { links: [{ side: 'allied', from: 'battalion', to: 'corps', channels: ['contact-patrol'] }] };
    const r = runScenario(f[0], f[1], { seed: 1, endMinute: 300 });
    expect(r.contactPatrols?.length).toBeGreaterThan(0);
    for (const p of r.contactPatrols!) {
      expect(p).toMatchObject({ fromId: 'bn1', side: 'allied' });
      expect(p.dueMin).toBeGreaterThan(p.sentMin);
    }
  });

  it('a run with no contact patrol records none (the field is left out)', () => {
    const f = fixtureComms({ links: 'runners' });
    const r = runScenario(f[0], f[1], { seed: 1, endMinute: 120 });
    expect('contactPatrols' in r).toBe(false);
  });
});
