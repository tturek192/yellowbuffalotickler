import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScenario } from './load-node';
import { formation } from './queries';
import { InsigniaSchema, type Scenario } from './schema';
import { v } from './sourced';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

let cached: Scenario | undefined;
const vimy = (): Scenario => (cached ??= loadScenario(resolve(repoRoot, 'scenarios/vimy-1917/scenario.yaml'), resolve(repoRoot, 'doctrine')).scenario);

describe('Vimy divisional insignia (the period map style)', () => {
  it('every Canadian division has a sourced or estimated insignia colour', () => {
    for (const d of ['1cdn', '2cdn', '3cdn', '4cdn']) expect(formation(vimy(), d).insignia).toBeDefined();
  });

  it('each colour cites a source or gives its reasoning, and is a colour or "none" (no patch worn)', () => {
    for (const d of ['1cdn', '2cdn', '3cdn', '4cdn', '5bdiv', '13bde-brit']) {
      const c = formation(vimy(), d).insignia!.colour;
      expect('source' in c || 'estimate' in c, d).toBe(true);
      expect(v(c), d).toMatch(/^(#[0-9a-f]{6}|none)$/);
    }
  });

  it('the Canadian divisional patch is a rectangle; the British 5th Division wore none', () => {
    for (const d of ['1cdn', '2cdn', '3cdn', '4cdn']) expect(formation(vimy(), d).insignia!.shape).toBe('rectangle');
    expect(v(formation(vimy(), '5bdiv').insignia!.colour)).toBe('none');
    // The attached British 13th Brigade did not wear the 2nd Canadian Division's patch.
    expect(v(formation(vimy(), '13bde-brit').insignia!.colour)).toBe('none');
  });

  it('the schema rejects an insignia colour that is not a hex colour or "none", and an unknown shape', () => {
    expect(InsigniaSchema.safeParse({ colour: { value: '#b3261e', source: 'x' }, shape: 'rectangle' }).success).toBe(true);
    expect(InsigniaSchema.safeParse({ colour: { value: 'none', estimate: 'no patch' } }).success).toBe(true);
    expect(InsigniaSchema.safeParse({ colour: { value: 'red', source: 'x' } }).success).toBe(false);
    expect(InsigniaSchema.safeParse({ colour: { value: '#b3261e', source: 'x' }, shape: 'star' }).success).toBe(false);
  });
});
