import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mergeScenarioParts } from './include';
import { loadScenario } from './load-node';
import { ScenarioError } from './load';
import { minimalScenario, toYaml, fixtureWithDoctrine } from './test-fixtures';

/** Write a scenario file (plus any extra files) into a fresh tmp dir with a fixture doctrine; returns its path. */
function tmpScenario(include: string[], extra: Record<string, unknown> = {}, main: Record<string, unknown> = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'wwi-include-'));
  mkdirSync(join(dir, 'doctrine'));
  writeFileSync(join(dir, 'doctrine', 'bef-1917.yaml'), toYaml(fixtureWithDoctrine().doctrines['bef-1917']));
  for (const [name, data] of Object.entries(extra)) writeFileSync(join(dir, name), toYaml(data));
  const path = join(dir, 'scenario.yaml');
  writeFileSync(path, toYaml({ ...(include.length ? { include } : {}), ...main }));
  return { path, doctrineDir: join(dir, 'doctrine') };
}

describe('mergeScenarioParts', () => {
  it('concatenates arrays in include order and merges maps', () => {
    const { merged, problems } = mergeScenarioParts([
      { file: 'a.yaml', data: { lines: [{ id: 'x' }], sources: { s1: { title: 'S1' } }, historical: { objectives: [1] } } },
      { file: 'b.yaml', data: { lines: [{ id: 'y' }], sources: { s2: { title: 'S2' } }, historical: { objectives: [2] } } },
    ]);
    expect(problems).toEqual([]);
    expect(merged).toEqual({
      lines: [{ id: 'x' }, { id: 'y' }],
      sources: { s1: { title: 'S1' }, s2: { title: 'S2' } },
      historical: { objectives: [1, 2] },
    });
  });
  it('names both files on a duplicate key (Review Focus 2)', () => {
    const { problems } = mergeScenarioParts([
      { file: 'scenario.yaml', data: { sources: { a: { title: 'A', tier: 'official' } } } },
      { file: 'fireplan.yaml', data: { sources: { a: { title: 'A2', tier: 'official' } } } },
    ]);
    expect(problems).toEqual(['sources.a: defined in scenario.yaml and fireplan.yaml']);
  });
  it('reports a scalar defined in two parts', () => {
    const { problems } = mergeScenarioParts([
      { file: 'a.yaml', data: { id: 'x' } },
      { file: 'b.yaml', data: { id: 'y' } },
    ]);
    expect(problems).toEqual(['id: defined in a.yaml and b.yaml']);
  });
});

describe('mergeScenarioParts (more)', () => {
  it('allows a scalar in only one part', () => {
    const { merged, problems } = mergeScenarioParts([
      { file: 'a.yaml', data: { id: 'x' } },
      { file: 'b.yaml', data: { title: 'T' } },
    ]);
    expect(problems).toEqual([]);
    expect(merged).toEqual({ id: 'x', title: 'T' });
  });
  it('names both files when a map meets an array', () => {
    const { problems } = mergeScenarioParts([
      { file: 'a.yaml', data: { lines: { a: 1 } } },
      { file: 'b.yaml', data: { lines: [1] } },
    ]);
    expect(problems).toEqual(['lines: defined in a.yaml and b.yaml']);
  });
});

describe('loadScenario includes', () => {
  const s = minimalScenario();
  const { lines, sectors, forces, historical, sources, ...scalars } = s;

  it('loads a scenario split across files, with stubs omitting collections', () => {
    const { path, doctrineDir } = tmpScenario(
      ['sources.yaml', 'geometry.yaml', 'forces.yaml'],
      { 'sources.yaml': { sources }, 'geometry.yaml': { lines, sectors }, 'forces.yaml': { forces, historical } },
      scalars,
    );
    const { scenario } = loadScenario(path, doctrineDir);
    expect(scenario.lines.map((l) => l.id)).toEqual(['gfront', 'black']);
    expect(scenario.forces).toHaveLength(1);
  });
  it('reports a missing include by index and name (Review Focus 2)', () => {
    const { path, doctrineDir } = tmpScenario(['sources.yaml', 'missing.yaml'], { 'sources.yaml': { sources } }, s);
    const attempt = () => loadScenario(path, doctrineDir);
    expect(attempt).toThrow(ScenarioError);
    expect(attempt).toThrow(/include\[1\]: cannot read missing\.yaml/);
  });
  it('reports a key defined in two files', () => {
    const { path, doctrineDir } = tmpScenario(['more.yaml'], { 'more.yaml': { sources } }, s);
    expect(() => loadScenario(path, doctrineDir)).toThrow(/sources\.test-src: defined in scenario\.yaml and more\.yaml/);
  });
  it('reports invalid YAML inside an include file', () => {
    const { path, doctrineDir } = tmpScenario(['bad.yaml'], {}, s);
    writeFileSync(join(path, '..', 'bad.yaml'), 'a: [1,');
    expect(() => loadScenario(path, doctrineDir)).toThrow(/include\[0\]: invalid YAML in bad\.yaml/);
  });
  it('rejects a non-list include', () => {
    const { path, doctrineDir } = tmpScenario([], {}, { ...s, include: 'sources.yaml' });
    expect(() => loadScenario(path, doctrineDir)).toThrow(/include: expected a list/);
  });
  it('rejects an include nested inside an included file', () => {
    const { path, doctrineDir } = tmpScenario(['inner.yaml'], { 'inner.yaml': { include: ['x.yaml'] } }, s);
    expect(() => loadScenario(path, doctrineDir)).toThrow(/include\[0\]: inner\.yaml must not contain its own include/);
  });
  it('still reports scenario problems when a doctrine file is missing', () => {
    const bad: any = structuredClone(s);
    bad.sectors[0].legs[0].liftM = { value: 91, source: 'nope' };
    bad.forces[0].doctrine = 'ghost';
    const { path, doctrineDir } = tmpScenario([], {}, bad);
    let msg = '';
    try {
      loadScenario(path, doctrineDir);
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg).toMatch(/doctrine ghost: cannot read/);
    expect(msg).toMatch(/liftM\.source: unknown source "nope"/);
  });
});
