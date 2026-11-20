import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseScenario, ScenarioError } from './load';
import { loadScenario } from './load-node';
import { minimalScenario, toYaml } from './test-fixtures';

const doctrine = (sources: object, source = 'd-src') =>
  toYaml({
    id: 'bef-1917',
    title: 'BEF 1917',
    sources,
    followDistanceM: { value: 50, source },
    maxAdvanceMPerMin: { value: 30, estimate: 'x' },
    startJitterMin: { value: 1, estimate: 'x' },
    speedJitterFrac: { value: 0.1, estimate: 'x' },
  });

describe('parseScenario', () => {
  it('parses a valid scenario', () => {
    expect(parseScenario(toYaml(minimalScenario()), ['bef-1917']).id).toBe('fixture');
  });
  it('reports every broken reference with its path (Review Focus 1)', () => {
    const s = minimalScenario();
    s.forces[0].formations[0].companies![1].objectiveLineId = 'blak';
    s.sectors[0].legs[0].liftM = { value: 91, source: 'nope' };
    s.forces[0].doctrine = 'bef-1916';
    try {
      parseScenario(toYaml(s), ['bef-1917']);
      expect.unreachable();
    } catch (e) {
      const p = (e as ScenarioError).problems;
      expect(p).toContainEqual(expect.stringContaining('companies[1].objectiveLineId: unknown line "blak"'));
      expect(p).toContainEqual(expect.stringContaining('legs[0].liftM.source: unknown source "nope"'));
      expect(p).toContainEqual(expect.stringContaining('forces[0].doctrine: unknown doctrine "bef-1916"'));
    }
  });
  it('reports duplicate ids', () => {
    const s = minimalScenario();
    s.lines[1].id = 'gfront';
    expect(() => parseScenario(toYaml(s), ['bef-1917'])).toThrow(/duplicate id "gfront"/);
  });
  it('reports schema errors with their path, not a stack trace', () => {
    const s: any = minimalScenario();
    delete s.zeroHour;
    expect(() => parseScenario(toYaml(s), ['bef-1917'])).toThrow(/zeroHour/);
  });
});

describe('yaml and root errors', () => {
  it('wraps malformed YAML in ScenarioError', () => {
    expect(() => parseScenario('a: [1,', [])).toThrow(ScenarioError);
  });
  it('labels root-level schema issues', () => {
    expect(() => parseScenario('42', [])).toThrow(/\(root\)/);
  });
});

describe('loadScenario', () => {
  const setup = (doctrineYaml: string) => {
    const dir = mkdtempSync(join(tmpdir(), 'wwi-'));
    writeFileSync(join(dir, 'scenario.yaml'), toYaml(minimalScenario()));
    writeFileSync(join(dir, 'bef-1917.yaml'), doctrineYaml);
    return dir;
  };
  it('loads the scenario and its doctrines', () => {
    const dir = setup(doctrine({ 'd-src': { title: 'D' } }));
    const r = loadScenario(join(dir, 'scenario.yaml'), dir);
    expect(r.scenario.id).toBe('fixture');
    expect(r.doctrines['bef-1917'].id).toBe('bef-1917');
  });
  it("rejects doctrine values citing sources missing from the doctrine's own sources", () => {
    const dir = setup(doctrine({ other: { title: 'O' } }));
    expect(() => loadScenario(join(dir, 'scenario.yaml'), dir)).toThrow(/followDistanceM.source: unknown source "d-src"/);
  });
  it('reports a missing doctrine file', () => {
    const dir = setup('');
    writeFileSync(join(dir, 'scenario.yaml'), toYaml({ ...minimalScenario(), forces: [{ ...minimalScenario().forces[0], doctrine: 'nope' }] }));
    expect(() => loadScenario(join(dir, 'scenario.yaml'), dir)).toThrow(/doctrine nope: cannot read/);
  });
});
