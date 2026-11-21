import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { stringify } from 'yaml';
import { ParamSchema, TablesSchema, EFFECT_KEYS } from './tables';
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
});
