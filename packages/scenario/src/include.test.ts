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

describe('load errors name the file and the index within it (I2)', () => {
  const s = minimalScenario();
  const { forces, leaders, ...rest } = s;
  /** Every problem from loading, or [] if it loads. */
  const problemsOf = (path: string, doctrineDir: string): string[] => {
    try {
      loadScenario(path, doctrineDir);
      return [];
    } catch (e) {
      if (!(e instanceof ScenarioError)) throw e;
      return e.problems;
    }
  };
  const german = (): any => ({
    side: 'central',
    doctrine: 'bef-1917',
    formations: [{ id: 'g1', name: 'Gruppe', kind: 'battalion', companies: [{ ...structuredClone(forces[0]!.formations[0]!.companies![0]!), id: 'gc1', objectiveLineId: 'blak' }] }],
  });

  it('a reference error in the second file of a merged array names that file and its own index', () => {
    const { path, doctrineDir } = tmpScenario(
      ['oob-a.yaml', 'oob-b.yaml'],
      { 'oob-a.yaml': { forces }, 'oob-b.yaml': { forces: [german()] } },
      { ...rest, leaders },
    );
    expect(problemsOf(path, doctrineDir)).toEqual([
      'oob-b.yaml: forces[0].formations[0].companies[0].objectiveLineId: unknown line "blak"',
    ]);
  });
  it('a schema error in an include names the file and its own index', () => {
    const g = german();
    g.formations[0].companies[0].objectiveLineId = 'black';
    g.formations[0].companies[0].strength = 'lots';
    const { path, doctrineDir } = tmpScenario(['oob-a.yaml', 'oob-b.yaml'], { 'oob-a.yaml': { forces }, 'oob-b.yaml': { forces: [g] } }, rest);
    const p = problemsOf(path, doctrineDir);
    expect(p.length).toBeGreaterThan(0);
    expect(p.every((x) => x.startsWith('oob-b.yaml: forces[0].formations[0].companies[0].strength'))).toBe(true);
  });
  it('a duplicate id across two files names both files, each with its own index', () => {
    const byng = { id: 'byng', name: { value: 'Julian Byng', estimate: 't' }, rank: { value: 'Lieutenant-General', estimate: 't' } };
    const currie = { ...byng, id: 'currie' };
    const { path, doctrineDir } = tmpScenario(
      ['leaders-a.yaml', 'leaders-b.yaml'],
      { 'leaders-a.yaml': { leaders: [byng] }, 'leaders-b.yaml': { leaders: [currie, byng] } },
      { ...rest, forces },
    );
    expect(problemsOf(path, doctrineDir)).toEqual([
      'leaders-b.yaml: leaders[1].id: duplicate id "byng" (first defined at leaders-a.yaml: leaders[0].id)',
    ]);
  });
  it('a duplicate company id across two OOB files names both files', () => {
    const g = german();
    g.formations[0].companies[0].objectiveLineId = 'black';
    g.formations[0].companies[0].id = 'c2';
    const { path, doctrineDir } = tmpScenario(['oob-a.yaml', 'oob-b.yaml'], { 'oob-a.yaml': { forces }, 'oob-b.yaml': { forces: [g] } }, rest);
    expect(problemsOf(path, doctrineDir)).toEqual([
      'oob-b.yaml: forces[0].formations[0].companies[0].id: duplicate id "c2" (first defined at oob-a.yaml: forces[0].formations[0].companies[1].id)',
    ]);
  });
  it('a problem in a map entry or scalar names the file that defined it', () => {
    const { path, doctrineDir } = tmpScenario(['more.yaml'], { 'more.yaml': { zeroHour: { value: '1916-07-01T07:30', source: 'nope' } } }, (({ zeroHour, ...r }) => r)(s));
    expect(problemsOf(path, doctrineDir)).toEqual(['more.yaml: zeroHour.source: unknown source "nope"']);
  });
  it('a single-file scenario names its own file', () => {
    const bad: any = structuredClone(s);
    bad.lines[1].id = 'gfront';
    const { path, doctrineDir } = tmpScenario([], {}, bad);
    expect(problemsOf(path, doctrineDir)).toContainEqual(
      'scenario.yaml: lines[1].id: duplicate id "gfront" (first defined at scenario.yaml: lines[0].id)',
    );
  });
});

describe('Provenance.locate', () => {
  it('maps merged indices back to each file, names labelled elements by label, and leaves unknown paths alone', () => {
    const { provenance } = mergeScenarioParts([
      { file: 'a.yaml', data: { lines: [{ id: 'x' }], historical: { casualties: [1, 2] } } },
      { file: 'b.yaml', data: { lines: [{ id: 'y' }], historical: { casualties: [3] } } },
    ]);
    provenance.addSegment('lines', 'geo/l.geojson', 2, 1, ['brown']);
    expect(provenance.locate('lines[1].points[0]')).toBe('b.yaml: lines[0].points[0]');
    expect(provenance.locate('historical.casualties[2].total')).toBe('b.yaml: historical.casualties[0].total');
    expect(provenance.locate('historical.casualties[1]')).toBe('a.yaml: historical.casualties[1]');
    expect(provenance.locate('lines[2].id')).toBe('geo/l.geojson#brown.id');
    expect(provenance.locate('(root)')).toBe('(root)');
  });
});

