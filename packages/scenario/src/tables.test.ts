import { describe, it, expect, expectTypeOf } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse, stringify } from 'yaml';
import { ParamSchema, type Param, TablesSchema, EFFECT_KEYS, EFFECT_RANGES } from './tables';
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

describe('every table key declares its range (final review fix)', () => {
  const repoDir = (edit: (files: Record<string, any>) => void): string => {
    const dir = mkdtempSync(join(tmpdir(), 'tables-range-'));
    const files: Record<string, any> = {};
    for (const f of readdirSync(join(repoRoot, 'tables')).filter((x) => x.endsWith('.yaml'))) files[f] = parse(readFileSync(join(repoRoot, 'tables', f), 'utf8'));
    edit(files);
    for (const [f, data] of Object.entries(files)) writeFileSync(join(dir, f), stringify(data));
    return dir;
  };
  it('each effects key has one, and the repository tables are within them', () => {
    expect(Object.keys(EFFECT_RANGES).sort()).toEqual([...EFFECT_KEYS].sort());
    expect(() => loadTables(join(repoRoot, 'tables'))).not.toThrow();
  });
  it.each<[string, (f: Record<string, any>) => void, RegExp]>([
    ['a negative killed share (conservation)', (f) => (f['effects.yaml'].effects.killedFrac.value = -0.2), /effects\.yaml: effects\.killedFrac\.value: .*greater than or equal to 0/],
    ['a killed share above 1', (f) => (f['effects.yaml'].effects.killedFrac.value = 1.5), /effects\.killedFrac\.value: .*less than or equal to 1/],
    ['a half-life of 0', (f) => (f['effects.yaml'].effects.suppressionHalfLifeMin.value = 0), /effects\.suppressionHalfLifeMin\.value: .*greater than 0/],
    ['a mud speed factor of 0', (f) => (f['effects.yaml'].effects.mudSpeedFactor.value = 0), /effects\.mudSpeedFactor\.value: .*greater than 0/],
    ['a negative capture radius', (f) => (f['effects.yaml'].effects.captureRadiusM.value = -1), /effects\.captureRadiusM\.value: .*greater than or equal to 0/],
    ['a cover above 1', (f) => (f['cover.yaml'].cover.moving.open.value = 1.2), /cover\.yaml: cover\.moving\.open\.value: .*less than or equal to 1/],
    ['a negative fail rate', (f) => (f['channels.yaml'].channels.runner.failPerHour.value = -1), /channels\.runner\.failPerHour\.value: .*greater than or equal to 0/],
    ['a negative rate of fire', (f) => (f['weapons-1917.yaml'].weapons.rifle.rpm.value = -1), /weapons\.rifle\.rpm\.value: .*greater than or equal to 0/],
    ['a range scale of 0', (f) => (f['weapons-1917.yaml'].weapons.rifle.rangeScaleM.value = 0), /weapons\.rifle\.rangeScaleM\.value: .*greater than 0/],
  ])('rejects %s, naming file and path', (_, edit, message) => {
    expect(() => loadTables(repoDir(edit))).toThrow(message);
  });
});
