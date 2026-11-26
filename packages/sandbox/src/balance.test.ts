import { it, expect } from 'vitest';
import { MAPS } from './map';
import { defaultSetup } from './defaults';
import { runToEnd } from './run';

it('computer against computer: the deadlock is hard but breakable, by more than one route', () => {
  const by = new Set<string>(); const table: string[] = []; let good = 0;
  for (const m of MAPS) {
    let broken = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const r = runToEnd({ ...defaultSetup(m.id), controller: { attacker: 'computer', defender: 'computer' } }, seed);
      if (r.outcome.broken) { broken++; by.add(r.outcome.by!); }
    }
    table.push(`${m.id}: ${broken}/20`); if (broken >= 3 && broken <= 14) good++;
  }
  console.log('balance', table.join('  '), [...by].join(','));
  expect(good).toBeGreaterThanOrEqual(3);
  expect(by.size).toBeGreaterThanOrEqual(2);
}, 300_000);
