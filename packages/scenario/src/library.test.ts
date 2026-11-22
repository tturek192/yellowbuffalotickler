import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadLibrary } from './load-node';
import { applyOverlay, type Library, type Overlay, type OverlayOp, type WeatherPreset } from './overlay';
import { checkReferences, collectSourceRefs } from './references';
import { vimyScenario } from './test-fixtures';
import type { Formation } from './schema';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const LIB = resolve(repoRoot, 'library');
const DOCS = ['bef-1917', 'de-1917'];
/** On the western edge of the Vimy frame (extent x −6000…7700), behind the Canadian line. */
const VIMY_ALLIED_ENTRY: [number, number] = [-6000, -1000];
/** On the eastern edge, behind the German line. */
const VIMY_CENTRAL_ENTRY: [number, number] = [7700, 0];
const ov = (ops: OverlayOp[]): Overlay => ({ id: 'test', title: 'test', scenarioId: 'vimy-1917', ops });
const spanDays = (p: WeatherPreset) => (Math.max(...p.map((e) => e.afterMin)) - Math.min(...p.map((e) => e.afterMin))) / 1440;
const divisions = (lib: Library) => lib.formations.filter((f) => f.kind === 'division');
const firstLibraryDivision = (lib: Library) => divisions(lib)[0]!.id;
const companiesOf = (f: Formation): number => (f.companies?.length ?? 0) + (f.children ?? []).reduce((n, c) => n + companiesOf(c), 0);
const battalionsOf = (f: Formation): Formation[] => (f.kind === 'battalion' ? [f] : (f.children ?? []).flatMap(battalionsOf));
/** A library directory of these files (name → YAML text). */
function libDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'lib-'));
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text);
  return dir;
}

describe('the leader and formation library (Plan 4 Task 2)', () => {
  it('the library loads, every leader has a sourced name and drafted ratings, and every preset spans at least 4 days', () => {
    const lib = loadLibrary(LIB);
    expect(lib.leaders.length).toBeGreaterThanOrEqual(12);
    expect(lib.leaders.length).toBeLessThanOrEqual(20);
    for (const l of lib.leaders) {
      expect('source' in l.name, l.id).toBe(true);
      expect('source' in l.rank, l.id).toBe(true);
      expect(l.ratings, l.id).toBeDefined();
      // The ratings are drafts for the owner: every one an estimate with its justification.
      for (const r of Object.values(l.ratings!)) expect('estimate' in r, l.id).toBe(true);
    }
    expect(Object.keys(lib.weatherPresets).sort()).toEqual(['dry-spring', 'fog-at-dawn', 'heavy-rain', 'snow-and-sleet', 'wet-spring']);
    for (const [id, p] of Object.entries(lib.weatherPresets)) expect(spanDays(p), id).toBeGreaterThanOrEqual(4);
  });

  it('holds six to ten complete divisions of both sides, down to companies, each led by a library leader', () => {
    const lib = loadLibrary(LIB);
    const divs = divisions(lib);
    expect(divs.length).toBeGreaterThanOrEqual(6);
    expect(divs.length).toBeLessThanOrEqual(10);
    expect(lib.formations.every((f) => f.kind === 'division')).toBe(true);
    for (const d of divs) {
      expect(lib.leaders.map((l) => l.id), d.id).toContain(d.leaderId);
      const bns = battalionsOf(d);
      expect(bns.length, d.id).toBeGreaterThanOrEqual(9);
      for (const bn of bns) expect(bn.companies?.length, bn.id).toBe(4);
      expect(companiesOf(d), d.id).toBe(bns.length * 4);
    }
    const ids = (f: Formation): string[] => [f.id, ...(f.companies ?? []).map((c) => c.id), ...(f.children ?? []).flatMap(ids)];
    const all = lib.formations.flatMap(ids);
    expect(new Set(all).size).toBe(all.length);
  });

  it('every source the library cites is in lib.sources', () => {
    const lib = loadLibrary(LIB);
    const refs = collectSourceRefs({ leaders: lib.leaders, formations: lib.formations, weatherPresets: lib.weatherPresets }, '');
    expect(refs.length).toBeGreaterThan(0);
    expect(refs.filter((r) => !Object.hasOwn(lib.sources, r.id))).toEqual([]);
  });

  it('every preset applies to Vimy without error', () => {
    const lib = loadLibrary(LIB);
    for (const id of Object.keys(lib.weatherPresets)) {
      const r = applyOverlay(vimyScenario(), ov([{ op: 'weather', preset: id }]), lib, DOCS);
      expect(r.unresolved, id).toEqual([]);
      expect(r.scenario.weather.length, id).toBe(lib.weatherPresets[id]!.length);
    }
  });

  it('a library division dropped into Vimy with add-formation passes checkReferences', () => {
    const lib = loadLibrary(LIB);
    const s = applyOverlay(
      vimyScenario(),
      ov([{ op: 'add-formation', from: { libraryId: firstLibraryDivision(lib) }, side: 'allied', underFormationId: 'cdn-corps', entryPoint: VIMY_ALLIED_ENTRY, distanceKm: 5 }]),
      lib,
      DOCS,
    ).scenario;
    expect(checkReferences(s, DOCS)).toEqual([]);
  });

  it('every library division and leader drops into Vimy on its own side, and passes checkReferences', () => {
    const lib = loadLibrary(LIB);
    const sideOf = (id: string): 'allied' | 'central' => (id.startsWith('de-') ? 'central' : 'allied');
    for (const d of divisions(lib)) {
      const side = sideOf(d.id);
      const r = applyOverlay(
        vimyScenario(),
        ov([
          side === 'allied'
            ? { op: 'add-formation', from: { libraryId: d.id }, side, underFormationId: 'cdn-corps', entryPoint: VIMY_ALLIED_ENTRY, distanceKm: 12 }
            : { op: 'add-formation', from: { libraryId: d.id }, side, underFormationId: 'sixth-army', entryPoint: VIMY_CENTRAL_ENTRY, distanceKm: 12 },
        ]),
        lib,
        DOCS,
      );
      expect(r.unresolved, d.id).toEqual([]);
      expect(r.scenario.leaders.map((l) => l.id), d.id).toContain(d.leaderId);
      expect(checkReferences(r.scenario, DOCS), d.id).toEqual([]);
    }
    for (const l of lib.leaders) {
      const formationId = l.id.startsWith('de-') ? '79rd' : '4cdn';
      const r = applyOverlay(vimyScenario(), ov([{ op: 'swap-leader', formationId, leaderId: l.id }]), lib, DOCS);
      expect(r.unresolved, l.id).toEqual([]);
      expect(checkReferences(r.scenario, DOCS), l.id).toEqual([]);
    }
  });
});

describe('loadLibrary', () => {
  const leader = (id: string, source: string) =>
    `leaders:\n  - id: ${id}\n    name: { value: "A. Name", source: ${source}, page: "1" }\n    rank: { value: "General", source: ${source}, page: "1" }\n`;
  const src = (id: string) => `sources:\n  ${id}: { title: "A history", tier: official }\n`;

  it('merges every file, sources included; an empty directory is an empty library', () => {
    const lib = loadLibrary(libDir({ 'a.yaml': src('s1') + leader('x', 's2'), 'b.yaml': src('s2'), 'notes.txt': 'not yaml' }));
    expect(Object.keys(lib.sources).sort()).toEqual(['s1', 's2']);
    expect(lib.leaders.map((l) => l.id)).toEqual(['x']);
    expect(loadLibrary(libDir({}))).toEqual({ sources: {}, leaders: [], formations: [], weatherPresets: {} });
  });

  it('fails on a source id defined twice, naming both files', () => {
    expect(() => loadLibrary(libDir({ 'a.yaml': src('s1'), 'b.yaml': src('s1') }))).toThrow(/sources\.s1: "s1" is defined in a\.yaml and b\.yaml/);
  });

  it('fails on a citation that does not resolve, naming the file and the item', () => {
    expect(() => loadLibrary(libDir({ 'a.yaml': src('s1') + leader('haig', 'nowhere') }))).toThrow(/a\.yaml: leaders\[0\] \(haig\)\.name: unknown source "nowhere"/);
  });

  it('fails on a leader, formation or preset id defined twice, an unknown section, or a schema problem, naming the file', () => {
    expect(() => loadLibrary(libDir({ 'a.yaml': src('s1') + leader('x', 's1'), 'b.yaml': leader('x', 's1') }))).toThrow(/leader "x" is defined in a\.yaml and b\.yaml/);
    expect(() => loadLibrary(libDir({ 'a.yaml': 'armies: []\n' }))).toThrow(/a\.yaml: armies: unknown section/);
    expect(() => loadLibrary(libDir({ 'a.yaml': 'weatherPresets:\n  dry:\n    - { afterMin: 0 }\n' }))).toThrow(/a\.yaml: weatherPresets\.dry\[0\]\.precipitation/);
    expect(() => loadLibrary(resolve(repoRoot, 'no-such-dir'))).toThrow(/cannot read library directory/);
  });
});
