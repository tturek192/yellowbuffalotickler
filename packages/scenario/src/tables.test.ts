import { describe, it, expect, expectTypeOf } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { stringify } from 'yaml';
import { ParamSchema, type Param, TablesSchema, EFFECT_KEYS } from './tables';
import { loadTables } from './load-node';
import { minimalTables } from './test-fixtures';

const repoRoot = resolve(__dirname, '../../..');

/** A tables directory holding `a.yaml` and `b.yaml`, both defining the weapon 18pdr. */
function fixtureDir(name: 'tables-dup'): string {
  const dir = mkdtempSync(join(tmpdir(), `${name}-`));
  const weapons = { '18pdr': minimalTables().weapons['18pdr'] };
  writeFileSync(join(dir, 'a.yaml'), stringify({ weapons }));
  writeFileSync(join(dir, 'b.yaml'), stringify({ weapons }));
  return dir;
}

describe('tables', () => {
  it('loads tables and rejects a calibrated entry without an estimate', () => {
    expect(() => ParamSchema.parse({ value: 1, source: 'x', description: 'd', calibrated: true })).toThrow(/calibrated.*estimate/);
  });
  it('accepts a calibrated estimate and a sourced entry', () => {
    expect(ParamSchema.parse({ value: 1, estimate: 'e', description: 'd', calibrated: true }).calibrated).toBe(true);
    expect(ParamSchema.parse({ value: 1, source: 's', page: '3', description: 'd' }).value).toBe(1);
  });
  it('rejects an entry with both or neither of source and estimate', () => {
    expect(() => ParamSchema.parse({ value: 1, description: 'd' })).toThrow(/source or estimate/);
    expect(() => ParamSchema.parse({ value: 1, source: 's', estimate: 'e', description: 'd' })).toThrow(/source or estimate/);
  });
  it('rejects a table entry without a description', () => {
    expect(() => ParamSchema.parse({ value: 1, estimate: 'e' })).toThrow(/description/);
  });
  it('merges every tables/*.yaml and rejects the same weapon id in two files, naming both', () => {
    expect(() => loadTables(fixtureDir('tables-dup'))).toThrow(/18pdr.*a\.yaml.*b\.yaml/);
  });
  it('rejects a missing effects key by name', () => {
    const t = structuredClone(minimalTables()) as Record<string, any>;
    delete t.effects.captureRatio;
    expect(() => TablesSchema.parse(t)).toThrow(/effects\.captureRatio/);
  });
  it('the repository tables load, and hold every effects key', () => {
    const t = loadTables(join(repoRoot, 'tables'));
    expect(Object.keys(t.effects).sort()).toEqual([...EFFECT_KEYS].sort());
    expect(readdirSync(join(repoRoot, 'tables')).some((f) => f === 'README.md')).toBe(true);
    expect(t.effects.barrageBandDepthM.value).toBe(90);
  });
  it('names a file for an invalid entry', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tables-bad-'));
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'w.yaml'), stringify({ weapons: { x: { kind: 'laser' } } }));
    expect(() => loadTables(dir)).toThrow(/w\.yaml: weapons\.x/);
  });
  const dirWith = (files: Record<string, unknown>) => {
    const dir = mkdtempSync(join(tmpdir(), 'tables-x-'));
    for (const [f, data] of Object.entries(files)) writeFileSync(join(dir, f), stringify(data));
    return dir;
  };
  it('rejects an unknown section, naming the file', () => {
    expect(() => loadTables(dirWith({ 'effects.yaml': { effcts: {} } }))).toThrow(/effects\.yaml: effcts: unknown section/);
  });
  it('rejects an unknown entry in a section, naming the file', () => {
    expect(() => loadTables(dirWith({ 'e.yaml': { effects: { captureRatioo: minimalTables().effects.captureRatio } } }))).toThrow(/e\.yaml: effects: .*captureRatioo/);
  });
  it('merges sources blocks, and a duplicate source id names both files', () => {
    const src = { 'nich': { title: 'Nicholson', tier: 'official' } };
    expect(() => loadTables(dirWith({ 'a.yaml': { sources: src }, 'b.yaml': { sources: src } }))).toThrow(/sources\.nich.*a\.yaml.*b\.yaml/);
  });
  it('rejects a param whose source id is not registered, naming file and path', () => {
    const { rpm, ...rest } = minimalTables().weapons['18pdr'];
    const w = { ...rest, rpm: { value: 4, source: 'ghost', description: 'd' } };
    expect(() => loadTables(dirWith({ 'w.yaml': { weapons: { '18pdr': w } } }))).toThrow(/w\.yaml: weapons\.18pdr\.rpm\.source: unknown source "ghost"/);
  });
  it('accepts a registered source in another file', () => {
    const { rpm, ...rest } = minimalTables().weapons['18pdr'];
    const w = { ...rest, rpm: { value: 4, source: 'nich', description: 'd' } };
    const dir = dirWith({ 'a.yaml': { sources: { nich: { title: 'N', tier: 'official' } } }, 'w.yaml': { weapons: { '18pdr': w } } });
    expect(() => loadTables(dir)).toThrow(/cover|channels|effects/); // only the other sections are missing, not the source
    expect(() => loadTables(dir)).not.toThrow(/unknown source/);
  });
  it('Param does not admit disputed values', () => {
    expectTypeOf<Param>().not.toMatchTypeOf<{ range: [number, number] }>();
    expect(() => ParamSchema.parse({ value: 1, range: [0, 2], sources: [{ source: 'a' }, { source: 'b' }], note: 'n', description: 'd' })).toThrow();
  });
});
