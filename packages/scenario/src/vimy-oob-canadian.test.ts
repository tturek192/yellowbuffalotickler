import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScenario } from './load-node';
import { allFormations, attackingCompanies, battalions, divisionOf, formation, inExtent, leader } from './queries';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('Vimy Canadian order of battle (Task 8)', () => {
  const { scenario: s } = loadScenario(resolve(repoRoot, 'scenarios/vimy-1917/scenario.yaml'), resolve(repoRoot, 'doctrine'));

  it('has the corps → 4 divisions → 12 Canadian brigades + British 13th Brigade structure', () => {
    const corps = formation(s, 'cdn-corps');
    expect(corps.children!.filter(c => c.kind === 'division').map(d => d.id)).toEqual(['1cdn', '2cdn', '3cdn', '4cdn']);
    expect(allFormations(s).filter(f => f.kind === 'brigade' && f.side === 'allied').length).toBeGreaterThanOrEqual(13);
  });
  it('every battalion has companies A–D with a sourced or estimated strength, inside the scenario extent', () => {
    for (const bn of battalions(s, 'allied')) {
      expect(bn.companies!.map(c => c.name.slice(-1))).toEqual(['A', 'B', 'C', 'D']);
      for (const c of bn.companies!) expect(inExtent(s, c.start)).toBe(true);
    }
  });
  it('every attacking company aims at a line in its own division sector', () => {
    for (const c of attackingCompanies(s)) expect(c.objectiveLineId!.endsWith(divisionOf(s, c))).toBe(true);
  });
  it('every formation down to brigade has a leader with a sourced name; corps-to-brigade leaders have drafted ratings', () => {
    for (const f of allFormations(s).filter(f => ['corps', 'division', 'brigade'].includes(f.kind) && f.side === 'allied')) {
      const l = leader(s, f.leaderId!); expect('source' in l.name).toBe(true); expect(l.ratings).toBeDefined();
    }
  });
});
