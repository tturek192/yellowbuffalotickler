import { describe, expect, it } from 'vitest';
import type { Formation, Scenario } from '@wwi/scenario';
import { insigniaOf } from './insignia';
import { runScenario } from './run';
import { fixtureWithDoctrineV3 } from './test-helpers';

const colour = (value: string) => ({ value, source: 'x' });
const bn = (id: string): Formation => ({ id, name: id, kind: 'battalion' });

/** A corps of two divisions: one with a patch (and an attached brigade that wore none), one without. */
function forces(): Scenario['forces'] {
  return [
    {
      side: 'allied',
      doctrine: 'bef-1917',
      formations: [
        {
          id: 'corps', name: 'Corps', kind: 'corps',
          children: [
            {
              id: 'd1', name: '1st Division', kind: 'division', insignia: { colour: colour('#b3261e'), shape: 'rectangle' },
              children: [
                { id: 'b1', name: '1st Brigade', kind: 'brigade', children: [bn('bn1')] },
                { id: 'att', name: 'Attached Brigade', kind: 'brigade', insignia: { colour: colour('none') }, children: [bn('bn2')] },
              ],
            },
            { id: 'd2', name: '2nd Division', kind: 'division', children: [bn('bn3')] },
          ],
        },
      ],
    },
    { side: 'central', doctrine: 'de-1917', formations: [{ id: 'gd', name: 'German Division', kind: 'division', children: [bn('gbn')] }] },
  ];
}

const units = [
  { id: 'bn1-a', formationPath: ['bn1', 'b1', 'd1', 'corps'] },
  { id: 'bn2-a', formationPath: ['bn2', 'att', 'd1', 'corps'] },
  { id: 'bn3-a', formationPath: ['bn3', 'd2', 'corps'] },
  { id: 'gbn-a', formationPath: ['gbn', 'gd'] },
];

describe('battalion insignia in the record', () => {
  it("a battalion takes the nearest patch up its formations; 'none' stops it inheriting one", () => {
    const used = new Set<string>();
    const out = insigniaOf({ forces: forces() } as Scenario, units, used);
    expect(out.byUnit.get('bn1-a')).toBe('#b3261e');
    expect(out.byUnit.has('bn2-a')).toBe(false);
    expect(out.byUnit.has('bn3-a')).toBe(false);
    expect(out.byUnit.has('gbn-a')).toBe(false);
  });

  it('a formation without a patch falls back to the side colour, recorded in defaultsUsed once per formation', () => {
    const used = new Set<string>();
    insigniaOf({ forces: forces() } as Scenario, units, used);
    expect([...used].sort()).toEqual([
      'insignia: att ← side colour (wore none)',
      'insignia: d2 ← side colour (no insignia)',
      'insignia: gd ← side colour (no insignia)',
    ]);
  });

  it('lists the divisions for the map notes, with their patch where they have one, and any formation that wore none', () => {
    const out = insigniaOf({ forces: forces() } as Scenario, units, new Set());
    expect(out.divisions).toEqual([
      { id: 'd1', name: '1st Division', side: 'allied', insignia: '#b3261e' },
      { id: 'att', name: 'Attached Brigade', side: 'allied', noPatch: true },
      { id: 'd2', name: '2nd Division', side: 'allied' },
      { id: 'gd', name: 'German Division', side: 'central' },
    ]);
  });

  it("a run's units carry their division's insignia colour", () => {
    const [s, m] = fixtureWithDoctrineV3();
    const top = s.forces.find((f) => f.side === 'allied')!.formations[0]!;
    top.insignia = { colour: { value: '#3f7a3a', source: 'x' } };
    const r = runScenario(s, m, { seed: 1, endMinute: 4 });
    const allied = r.units.filter((u) => u.side === 'allied');
    expect(allied.length).toBeGreaterThan(0);
    for (const u of allied) expect(u.insignia).toBe('#3f7a3a');
    for (const u of r.units.filter((x) => x.side === 'central')) expect(u.insignia).toBeUndefined();
    expect(r.defaultsUsed.some((d) => d.startsWith('insignia: '))).toBe(true);
  });

  it("a run's units carry their company's role in the plan (the period map draws uncommitted reserves open)", () => {
    const [s, m] = fixtureWithDoctrineV3();
    const r = runScenario(s, m, { seed: 1, endMinute: 4 });
    const roles = new Map(s.forces.flatMap((f) => f.formations).flatMap(function all(f: Formation): Array<[string, string]> {
      return [...(f.companies ?? []).map((c): [string, string] => [c.id, c.role]), ...(f.children ?? []).flatMap(all)];
    }));
    expect(r.units.length).toBeGreaterThan(0);
    for (const u of r.units) expect(u.role).toBe(roles.get(u.id));
  });
});
