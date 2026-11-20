import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { sourced, v } from './sourced';
import { ScenarioSchema } from './schema';
import { minimalScenario } from './test-fixtures';

describe('sourced', () => {
  it('accepts a value with a source', () => {
    expect(sourced(z.number()).safeParse({ value: 640, source: 'nicholson-1962', page: '246' }).success).toBe(true);
  });
  it('accepts a value with an estimate reason', () => {
    expect(sourced(z.number()).safeParse({ value: 150, estimate: 'brief: 600–800 per bn ÷ 4' }).success).toBe(true);
  });
  it('rejects a bare number', () => {
    expect(sourced(z.number()).safeParse(640).success).toBe(false);
  });
  it('rejects an empty estimate', () => {
    expect(sourced(z.number()).safeParse({ value: 1, estimate: '' }).success).toBe(false);
  });
  it('v() unwraps either form', () => {
    expect(v({ value: 3, source: 's' })).toBe(3);
    expect(v({ value: 4, estimate: 'e' })).toBe(4);
  });
});

describe('ScenarioSchema', () => {
  it('parses the minimal fixture and rejects an unsourced company strength', () => {
    expect(ScenarioSchema.safeParse(minimalScenario()).success).toBe(true);
    const bad = minimalScenario();
    bad.forces[0].formations[0].companies![0].strength = 150 as any;
    const r = ScenarioSchema.safeParse(bad);
    expect(r.success).toBe(false);
    expect(JSON.stringify(r.error!.issues[0].path)).toContain('strength');
  });
});
