import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { disputed, sourcedOrDisputed, v } from './sourced';
import { historicalTierRule } from './sources';
import { parseScenario } from './load';
import { minimalScenario, toYaml } from './test-fixtures';

const cites = [{ source: 'a' }, { source: 'b' }];

describe('source tiers', () => {
  it('requires a tier on every source', () => {
    const s: any = minimalScenario();
    delete s.sources['test-src'].tier;
    expect(() => parseScenario(toYaml(s), ['bef-1917'])).toThrow(/sources\.test-src\.tier/);
  });
  it('rejects an unknown tier', () => {
    const s: any = minimalScenario();
    s.sources['test-src'].tier = 'rumour';
    expect(() => parseScenario(toYaml(s), ['bef-1917'])).toThrow(/sources\.test-src\.tier/);
  });
  it('rejects historical targets that cite tertiary or secondary sources', () => {
    const s = minimalScenario();
    s.sources['wiki'] = { title: 'Wikipedia', tier: 'tertiary' };
    s.historical.objectives[0].earliest = { value: '1916-07-01T09:00', source: 'wiki' };
    expect(() => parseScenario(toYaml(s), ['bef-1917'])).toThrow(/historical\.objectives\[0\]\.earliest.*tertiary/);
  });
  it('accepts historical targets citing primary, official or scholarly sources', () => {
    const s = minimalScenario();
    s.sources['war-diary'] = { title: 'War diary', tier: 'primary' };
    s.historical.objectives[0].earliest = { value: '1916-07-01T09:00', source: 'war-diary' };
    expect(() => parseScenario(toYaml(s), ['bef-1917'])).not.toThrow();
  });
  it('flags each weak citation of a disputed historical value, by index', () => {
    const s = minimalScenario();
    s.sources['wiki-vimy'] = { title: 'Wikipedia', tier: 'tertiary' };
    s.sources['nich'] = { title: 'Nicholson', tier: 'official' };
    s.historical.objectives[0].earliest = {
      value: '1916-07-01T10:00',
      range: ['1916-07-01T09:00', '1916-07-01T11:00'],
      sources: [{ source: 'nich' }, { source: 'wiki-vimy' }],
      note: 'accounts differ',
    };
    expect(historicalTierRule(s)).toEqual([
      'historical.objectives[0].earliest.sources[1]: source "wiki-vimy" is tertiary; historical targets need primary, official or scholarly sources',
    ]);
  });
});

describe('disputed values', () => {
  const D = disputed(z.number());
  it('holds a range containing the working value and at least 2 sources', () => {
    expect(D.safeParse({ value: 4000, range: [3404, 6000], sources: cites, note: 'prisoner counts differ' }).success).toBe(true);
    expect(D.safeParse({ value: 7000, range: [3404, 6000], sources: cites, note: 'x' }).success).toBe(false);
    expect(D.safeParse({ value: 4000, range: [3404, 6000], sources: [cites[0]], note: 'x' }).success).toBe(false);
  });
  it('compares local times chronologically', () => {
    const T = disputed(z.string());
    const base = { range: ['1917-04-09T06:15', '1917-04-09T07:00'], sources: cites, note: 'x' };
    expect(T.safeParse({ ...base, value: '1917-04-09T06:30' }).success).toBe(true);
    expect(T.safeParse({ ...base, value: '1917-04-09T07:30' }).success).toBe(false);
  });
  it('v() unwraps sourced, estimate and disputed forms', () => {
    expect(v({ value: 1, source: 's' })).toBe(1);
    expect(v({ value: 2, estimate: 'e' })).toBe(2);
    expect(v({ value: 4000, range: [3404, 6000], sources: cites, note: 'x' })).toBe(4000);
  });
  it('sourcedOrDisputed accepts either form', () => {
    const S = sourcedOrDisputed(z.number());
    expect(S.safeParse({ value: 1, source: 's' }).success).toBe(true);
    expect(S.safeParse({ value: 5, range: [1, 9], sources: cites, note: 'x' }).success).toBe(true);
  });
});
