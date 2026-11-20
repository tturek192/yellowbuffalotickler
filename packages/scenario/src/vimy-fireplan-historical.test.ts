import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScenario } from './load-node';
import { parseLocalDateTime } from './local-time';
import { historicalTierRule } from './sources';
import { v } from './sourced';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** N from the line `Park total: N (source: …)` that a research note must contain. */
function parkTotalFromNotes(file: string): number {
  const m = readFileSync(resolve(repoRoot, file), 'utf8').match(/^Park total: (\d+) \(source: [^)]+\)/m);
  if (!m) throw new Error(`${file} has no line "Park total: N (source: …)"`);
  return Number(m[1]);
}

describe('Vimy fire plan, weather and historical results (Task 10)', () => {
  const { scenario: s } = loadScenario(resolve(repoRoot, 'scenarios/vimy-1917/scenario.yaml'), resolve(repoRoot, 'doctrine'));

  it('every attacking division has a barrage sector whose legs end on its own objective lines', () => {
    for (const d of ['1cdn', '2cdn', '3cdn', '4cdn']) {
      const sec = s.sectors.find(x => x.id === `barrage-${d}`)!;
      for (const leg of sec.legs) expect(leg.toLineId.endsWith(d)).toBe(true);
    }
  });
  it('artillery counts by role sum to the park total recorded in the notes', () => {
    const total = s.artillery.filter(a => a.side === 'allied').reduce((n, a) => n + v(a.count), 0);
    expect(total).toBe(parkTotalFromNotes('docs/research/vimy/fireplan.md'));
  });
  it('historical targets exist for every division line and for corps casualties, all within the tier rule', () => {
    expect(s.historical.objectives.length).toBeGreaterThanOrEqual(12);
    expect(s.historical.casualties.some(c => c.side === 'allied' && !c.formationId)).toBe(true);
    expect(historicalTierRule(s)).toEqual([]);
  });
  it('weather covers 9–12 April in order', () => {
    expect(s.weather[0].at <= '1917-04-09T05:30').toBe(true); expect(s.weather.at(-1)!.at >= '1917-04-12T00:00').toBe(true);
  });

  // Guards beside the brief's four tests.
  it('has a historical target for each of the twelve division objective lines, each in its own sector', () => {
    const divisionLines = s.lines.filter(l => l.kind === 'objective').map(l => l.id).sort();
    expect(divisionLines).toHaveLength(12);
    expect(s.historical.objectives.map(o => o.lineId).sort()).toEqual(divisionLines);
    for (const o of s.historical.objectives) expect(o.sectorId).toBe(`barrage-${o.lineId.split('-')[1]}`);
  });
  it('every objective window runs forwards: earliest no later than latest', () => {
    for (const o of s.historical.objectives) {
      expect(parseLocalDateTime(v(o.earliest)).getTime(), o.lineId).toBeLessThanOrEqual(parseLocalDateTime(v(o.latest)).getTime());
    }
  });
  it('no barrage leg is a Task 7 placeholder any more', () => {
    for (const sec of s.sectors) {
      for (const leg of sec.legs) {
        for (const x of [leg.liftM, leg.liftMin, leg.pauseMin]) expect(JSON.stringify(x)).not.toMatch(/placeholder/);
      }
      expect(JSON.stringify(sec.standOffM)).not.toMatch(/placeholder/);
    }
  });
  it('records the counter-battery state at Zero as a disputed value', () => {
    expect(s.counterBattery && 'range' in s.counterBattery.suppressedAtZeroFrac).toBe(true);
  });
});
