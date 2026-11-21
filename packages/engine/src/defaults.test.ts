import { describe, expect, it } from 'vitest';
import { allCompanies, v } from '@wwi/scenario';
import { resolveDefaults } from './defaults';
import { runScenario } from './run';
import { doctrines, draft, fixtureWithDoctrineV3, vimy, vimyDoctrines } from './test-helpers';

describe('defaults', () => {
  it('the Plan 1 draft runs and lists every default it used', () => {
    const r = runScenario(draft(), doctrines(), { seed: 1 });
    expect(r.defaultsUsed).toEqual(expect.arrayContaining([expect.stringMatching(/officers ← bef-1917\.companyDefaults\.officers/)]));
  });

  it('fills every absent company value from its doctrine, names it by company id, and leaves given values alone', () => {
    const [s, m] = fixtureWithDoctrineV3();
    allCompanies(s).find((c) => c.id === 'c1')!.officers = { value: 3, estimate: 'test' };
    const { scenario, used } = resolveDefaults(s, m.doctrines, m.tables);
    const byId = new Map(allCompanies(scenario).map((c) => [c.id, c]));
    expect(v(byId.get('c1')!.officers!)).toBe(3);
    expect(v(byId.get('c2')!.officers!)).toBe(1);
    expect(used).not.toContain('companies[c1].officers ← bef-1917.companyDefaults.officers');
    expect(used).toContain('companies[c2].officers ← bef-1917.companyDefaults.officers');
    expect(used).toContain('companies[k1].machineGuns ← de-1917.companyDefaults.machineGuns');
    expect(used).toContain('companies[k1].training ← standard (no training given)');
    for (const c of allCompanies(scenario)) for (const k of ['officers', 'lewisGuns', 'machineGuns', 'training'] as const) expect(c[k]).toBeDefined();
  });

  it('does not change the scenario it is given', () => {
    const [s, m] = fixtureWithDoctrineV3();
    const before = JSON.stringify(s);
    resolveDefaults(s, m.doctrines, m.tables);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('a defaulted value is listed once in the record, in sorted order', () => {
    const r = runScenario(...fixtureWithDoctrineV3(), { seed: 1 });
    expect(r.defaultsUsed).toEqual([...new Set(r.defaultsUsed)].sort());
  });

  it('a doctrine naming a weapon the tables lack is rejected at run setup, naming the doctrine', () => {
    const [s, m] = fixtureWithDoctrineV3();
    m.doctrines['de-1917']!.companyWeapons.mg = 'mg-unknown';
    expect(() => runScenario(s, m, { seed: 1 })).toThrow(/doctrine de-1917: companyWeapons\.mg names weapon "mg-unknown", which the tables do not hold/);
  });

  it('the full Vimy scenario runs with the repository tables and ends early, with movement only', () => {
    const r = runScenario(vimy(), vimyDoctrines(), { seed: 1 });
    // Ends before the time cap (Task 12: the command model's operations run it on to the Pimple, after 20:00 on 9 April;
    // Task 13: the reserves' counter-attacks, the army's divisions among them, can run it on to a later operation's hour,
    // 12 April at seed 1).
    expect(r.endMinute).toBeLessThan(vimy().timeLimitMinutes);
    // Task 13 fix round 1: every division and army that planned a counter-attack has it go in or give it up (none waits
    // to the end on ground it cannot reach).
    const planners = [...new Set(r.events.filter((e) => e.kind === 'reserve-ordered').map((e) => e.text.split(' orders ')[0]!))];
    expect(planners.length).toBeGreaterThanOrEqual(4);
    for (const p of planners) expect(r.events.some((e) => (e.kind === 'counter-attack-ordered' || e.kind === 'counter-attack-dropped') && e.text.startsWith(`${p} `)), p).toBe(true);
    expect(r.summary.lineTaken.length).toBeGreaterThan(0);
    // A whole Vimy run plus loading (see artillery.test.ts).
  }, 30_000);
});
