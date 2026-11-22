import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { applyOverlay, checkOverlaid, emptyLibrary, parseOverlay, type Library, type Overlay, type OverlayOp } from './overlay';
import { checkReferences } from './references';
import { minutesBetween } from './local-time';
import { allFormations } from './queries';
import { totalMen, vimyScenario } from './test-fixtures';
import type { Company, Formation, Scenario } from './schema';

const DOCS = ['bef-1917', 'de-1917'];
const ov = (ops: OverlayOp[]): Overlay => ({ id: 'test', title: 'test', scenarioId: 'vimy-1917', ops });
const ovYaml = (ops: unknown[]): string => stringify({ id: 'test', title: 'test', scenarioId: 'vimy-1917', ops });
const apply = (ops: OverlayOp[], lib: Library = emptyLibrary(), s: Scenario = vimyScenario()) => applyOverlay(s, ov(ops), lib, DOCS);

const companiesUnder = (f: Formation): Company[] => [...(f.companies ?? []), ...(f.children ?? []).flatMap(companiesUnder)];
const companiesOf = (s: Scenario, side: 'allied' | 'central'): Company[] =>
  s.forces.filter((f) => f.side === side).flatMap((f) => f.formations.flatMap(companiesUnder));
const formation = (s: Scenario, id: string): Formation | undefined => allFormations(s).find((f) => f.id === id);
const parentOf = (s: Scenario, id: string): Formation | undefined => allFormations(s).find((f) => f.children?.some((c) => c.id === id));

/** remove-formation ops for every highest formation holding an attacking company of the sector (no op nested in another). */
function removeEveryAttackingDivisionOf(sectorId: string): OverlayOp[] {
  const s = vimyScenario();
  const holds = (f: Formation) => companiesUnder(f).some((c) => c.sectorId === sectorId && ['assault', 'mopup', 'support'].includes(c.role));
  const ids: string[] = [];
  const walk = (f: Formation): void => {
    if (f.kind === 'division' && holds(f)) ids.push(f.id);
    else if (holds(f)) (f.children ?? []).forEach(walk);
  };
  s.forces.forEach((force) => force.formations.forEach(walk));
  return ids.map((formationId) => ({ op: 'remove-formation', formationId }));
}

/** The scenario's weather with one more entry a minute past the time limit. */
function weatherAfterTheLimit(): Scenario['weather'] {
  const s = vimyScenario();
  return [...s.weather, { at: '1917-04-20T06:00', precipitation: { value: 'rain', estimate: 'test' } }];
}

describe('what-if overlays (Plan 4 Task 1)', () => {
  it('scale-men 2 on the Germans doubles every central company and marks each change as a what-if', () => {
    const { scenario, changes } = applyOverlay(vimyScenario(), ov([{ op: 'scale-men', side: 'central', factor: 2 }]), emptyLibrary(), DOCS);
    expect(totalMen(scenario, 'central')).toBe(2 * totalMen(vimyScenario(), 'central'));
    expect(changes.length).toBeGreaterThan(0);
    expect(JSON.stringify(scenario)).toMatch(/what-if: test — scale-men/);
    // The Allies are untouched; each German reserve with no companies carries the factor for the engine's made-up ones.
    expect(totalMen(scenario, 'allied')).toBe(totalMen(vimyScenario(), 'allied'));
    const empty = scenario.reserves.filter((r) => companiesUnder(formation(scenario, r.formationId)!).length === 0);
    expect(empty.length).toBeGreaterThan(0);
    expect(empty.every((r) => r.strengthFactor?.value === 2)).toBe(true);
    expect(changes.filter((c) => /^reserves\[\d+\]\.strengthFactor$/.test(c.path))).toHaveLength(empty.length);
  });

  it('scale-men multiplies into a reserve strengthFactor already set', () => {
    const { scenario } = apply([
      { op: 'scale-men', side: 'central', factor: 2 },
      { op: 'scale-men', side: 'central', factor: 1.5 },
    ]);
    expect(scenario.reserves.find((r) => r.formationId === '4gd')!.strengthFactor!.value).toBe(3);
  });

  it('scale-men 0.1 keeps at least one man in every company (attackers-x0.1)', () => {
    const { scenario } = applyOverlay(vimyScenario(), ov([{ op: 'scale-men', side: 'allied', factor: 0.1 }]), emptyLibrary(), DOCS);
    expect(companiesOf(scenario, 'allied').every((c) => c.strength.value >= 1)).toBe(true);
    expect(companiesOf(scenario, 'allied').every((c) => Number.isInteger(c.strength.value))).toBe(true);
  });

  it('scale-men on a formation scales only the companies under it', () => {
    const base = vimyScenario();
    const { scenario } = apply([{ op: 'scale-men', formationId: '1bde', factor: 2 }]);
    const men = (s: Scenario, id: string) => companiesUnder(formation(s, id)!).reduce((n, c) => n + c.strength.value, 0);
    expect(men(scenario, '1bde')).toBe(2 * men(base, '1bde'));
    expect(men(scenario, '2bde')).toBe(men(base, '2bde'));
  });

  it('a Disputed value replaced by a what-if keeps its range and sources in Change.from', () => {
    const base = vimyScenario();
    const i = base.reserves.findIndex((r) => r.formationId === '4gd');
    expect(base.reserves[i]!.distanceKm).toHaveProperty('range');
    const { scenario, changes } = apply([{ op: 'reserve-distance', formationId: '4gd', km: 12 }]);
    expect(scenario.reserves[i]!.distanceKm).toEqual({ value: 12, estimate: 'what-if: test — reserve-distance' });
    expect(changes).toEqual([{ index: 0, path: `reserves[${i}].distanceKm`, from: base.reserves[i]!.distanceKm, to: scenario.reserves[i]!.distanceKm }]);
    expect(changes[0]!.from).toMatchObject({ range: [16.1, 50.7], sources: expect.any(Array) });
  });

  it('a plain field (doctrine, leaderId, start) changes in place and is recorded only in changes', () => {
    const { scenario, changes } = apply([{ op: 'doctrine', side: 'allied', doctrineId: 'de-1917' }]);
    const i = scenario.forces.findIndex((f) => f.side === 'allied');
    expect(scenario.forces[i]!.doctrine).toBe('de-1917');
    expect(changes).toEqual([{ index: 0, path: `forces[${i}].doctrine`, from: 'bef-1917', to: 'de-1917' }]);
    expect(JSON.stringify(scenario)).not.toMatch(/what-if: test/);
  });

  // Review Focus 1: an overlay that breaks the scenario fails before any run, naming the op and its index.
  it('rejects scale-men with factor 0 before any run, naming ops[0].factor', () => {
    expect(() => parseOverlay(ovYaml([{ op: 'scale-men', side: 'central', factor: 0 }]))).toThrow(/ops\[0\]\.factor/);
  });

  it('rejects a negative reserve distance, naming ops[0].km', () => {
    expect(() => parseOverlay(ovYaml([{ op: 'reserve-distance', km: -3 }]))).toThrow(/ops\[0\]\.km/);
  });

  it('parses a good overlay, and rejects an unknown op, an unknown key and a weather op with both preset and timeline', () => {
    expect(parseOverlay(ovYaml([{ op: 'scale-men', side: 'central', factor: 2 }])).ops).toEqual([{ op: 'scale-men', side: 'central', factor: 2 }]);
    expect(() => parseOverlay(ovYaml([{ op: 'nuke', factor: 2 }]))).toThrow(/ops\[0\]\.op/);
    expect(() => parseOverlay(ovYaml([{ op: 'ground', preset: 'wet', extra: 1 }]))).toThrow(/ops\[0\]/);
    expect(() => parseOverlay(ovYaml([{ op: 'weather', preset: 'a', timeline: [] }]))).toThrow(/ops\[0\]: a weather op needs exactly one/);
    expect(() => parseOverlay(ovYaml([{ op: 'weather' }]))).toThrow(/ops\[0\]: a weather op needs exactly one/);
  });

  it('fails when an overlay removes every attacking company of a sector, naming the op', () => {
    const ops = removeEveryAttackingDivisionOf('barrage-1cdn');
    expect(ops.length).toBeGreaterThan(0);
    expect(() => applyOverlay(vimyScenario(), ov(ops), emptyLibrary(), DOCS)).toThrow(/ops\[\d+\].*attacking compan/);
  });

  it('fails when an overlay removes every company of a side, naming the op', () => {
    expect(() => apply([{ op: 'ground', preset: 'wet' }, { op: 'remove-formation', formationId: 'sixth-army' }])).toThrow(/ops\[1\] \(remove-formation\): forces: the central side has no companies left/);
  });

  it('fails when a weather timeline has an entry outside [zeroHour, zeroHour + timeLimitMinutes]', () => {
    expect(() => applyOverlay(vimyScenario(), ov([{ op: 'weather', timeline: weatherAfterTheLimit() }]), emptyLibrary(), DOCS)).toThrow(/ops\[0\].*weather/);
    // Its own weather, from the night before Zero, is inside the battle.
    expect(checkOverlaid(vimyScenario(), DOCS)).toEqual([]);
  });

  it('fails when a reference no longer checks (checkReferences after applying), naming the op', () => {
    const timeline: Scenario['weather'] = [{ at: '1917-04-09T05:30', precipitation: { value: 'rain', source: 'no-such-source' } }];
    expect(() => apply([{ op: 'weather', timeline }])).toThrow(/ops\[0\] \(weather\): weather\[0\]\.precipitation\.source: unknown source "no-such-source"/);
  });

  // Review Focus 2: ops written for an older scenario.
  it('reports ops that no longer resolve instead of skipping them', () => {
    const r = applyOverlay(vimyScenario(), ov([{ op: 'swap-leader', formationId: 'gone', leaderId: 'byng' }]), emptyLibrary(), DOCS);
    expect(r.unresolved).toEqual([expect.objectContaining({ index: 0, reason: expect.stringMatching(/formation "gone"/) })]);
  });

  it('lists every kind of id that no longer resolves, and still applies the other ops', () => {
    const r = apply([
      { op: 'scale-men', formationId: 'gone-f', factor: 2 },
      { op: 'scale-guns', artilleryId: 'gone-a', factor: 2 },
      { op: 'swap-leader', formationId: '1cdn', leaderId: 'gone-l' },
      { op: 'move', unitId: 'gone-u', by: [1, 1] },
      { op: 'reserve-distance', formationId: 'gone-r', km: 1 },
      { op: 'weather', preset: 'gone-p' },
      { op: 'add-formation', from: { libraryId: 'gone-lib' }, side: 'central', underFormationId: 'sixth-army', entryPoint: [0, 0], distanceKm: 5 },
      { op: 'ground', preset: 'wet' },
    ]);
    expect(r.unresolved.map((u) => [u.index, u.reason])).toEqual([
      [0, 'formation "gone-f"'],
      [1, 'artillery "gone-a"'],
      [2, 'leader "gone-l"'],
      [3, 'unit "gone-u"'],
      [4, 'reserve "gone-r"'],
      [5, 'weather preset "gone-p"'],
      [6, 'library formation "gone-lib"'],
    ]);
    expect(r.changes.map((c) => c.index)).toEqual([7]);
    expect(r.scenario.groundCondition?.value).toBe('wet');
  });

  it('an unknown doctrine id is unresolved; a known one swaps the side', () => {
    expect(apply([{ op: 'doctrine', side: 'allied', doctrineId: 'xx' }]).unresolved).toEqual([expect.objectContaining({ index: 0, reason: 'doctrine "xx"' })]);
    const { scenario } = apply([{ op: 'doctrine', side: 'allied', doctrineId: 'de-1917' }]);
    expect(scenario.forces.filter((f) => f.side === 'allied').every((f) => f.doctrine === 'de-1917')).toBe(true);
  });

  // One test per op.
  it('scale-guns 0.5 halves every artillery count of the side; factor 0 leaves no guns and still applies', () => {
    const base = vimyScenario();
    const { scenario } = apply([{ op: 'scale-guns', side: 'allied', factor: 0.5 }]);
    scenario.artillery.forEach((a, i) => {
      const was = base.artillery[i]!.count.value;
      expect(a.count.value).toBe(a.side === 'allied' ? Math.round(was * 0.5) : was);
    });
    const none = apply([{ op: 'scale-guns', side: 'allied', factor: 0 }]).scenario;
    expect(none.artillery.filter((a) => a.side === 'allied').every((a) => a.count.value === 0)).toBe(true);
    expect(none.artillery.some((a) => a.side === 'central' && a.count.value > 0)).toBe(true);
  });

  it("scale-ammunition scales artillery ammunition and the bombardment allocations' rounds", () => {
    const base = vimyScenario();
    const id = 'cdn-18pdr-creeping';
    const { scenario, changes } = apply([{ op: 'scale-ammunition', artilleryId: id, factor: 0.5 }]);
    const a = scenario.artillery.find((x) => x.id === id)!;
    expect(a.ammunition!.value).toBe(Math.round(base.artillery.find((x) => x.id === id)!.ammunition!.value * 0.5));
    const allocations = base.bombardment!.allocations.map((al, i) => [al, scenario.bombardment!.allocations[i]!] as const);
    expect(allocations.some(([al]) => al.artilleryId === id)).toBe(true);
    for (const [was, now] of allocations) expect(now.rounds.value).toBe(was.artilleryId === id ? Math.round(was.rounds.value * 0.5) : was.rounds.value);
    expect(changes.every((c) => /^(artillery\[\d+\]\.ammunition|bombardment\.allocations\[\d+\]\.rounds)$/.test(c.path))).toBe(true);
  });

  it('remove-formation removes its reserve, operation, artillery link and liaison entries, each a Change; historical targets stay', () => {
    // The 10th Brigade has an operation (the Pimple), and here a liaison entry; gruppe-vimy holds reserve battalions and has artillery.
    const base = vimyScenario();
    base.communications!.liaison!.push({ side: 'allied', formationId: '10bde', note: { value: 'test liaison', estimate: 'test' } });
    const { scenario, changes } = apply(
      [
        { op: 'remove-formation', formationId: '10bde' },
        { op: 'remove-formation', formationId: 'gruppe-vimy' },
      ],
      emptyLibrary(),
      base,
    );
    expect(formation(scenario, '10bde')).toBeUndefined();
    expect(formation(scenario, '79rd')).toBeUndefined();
    expect(scenario.operations!.some((o) => o.formationId === '10bde')).toBe(false);
    expect(scenario.communications!.liaison!.some((l) => l.formationId === '10bde')).toBe(false);
    expect(scenario.communications!.liaison).toHaveLength(base.communications!.liaison!.length - 1);
    expect(scenario.artillery.some((a) => a.formationId === 'gruppe-vimy')).toBe(false);
    expect(scenario.artillery).toHaveLength(base.artillery.length);
    const goneReserves = base.reserves.filter((r) => !scenario.reserves.some((x) => x.formationId === r.formationId));
    expect(goneReserves.length).toBeGreaterThan(0);
    for (const prefix of ['forces[', 'reserves[', 'operations[', 'communications.liaison[', 'artillery[']) {
      expect(changes.some((c) => c.path.startsWith(prefix) && c.to === undefined)).toBe(true);
    }
    expect(changes.filter((c) => c.path.startsWith('reserves['))).toHaveLength(goneReserves.length);
    expect(scenario.historical.casualties).toEqual(base.historical.casualties);
    expect(checkOverlaid(scenario, DOCS)).toEqual([]);
  });

  it('add-formation copies a scenario division in as an off-map reserve with role reserve, and passes checkReferences', () => {
    const { scenario, changes } = apply([
      { op: 'add-formation', from: { formationId: '79rd-bis', copyOf: '79rd' }, side: 'central', underFormationId: 'gruppe-vimy', entryPoint: [9000, 0], distanceKm: 20 },
    ]);
    const copy = formation(scenario, '79rd-bis')!;
    expect(parentOf(scenario, '79rd-bis')!.id).toBe('gruppe-vimy');
    const cs = companiesUnder(copy);
    expect(cs.length).toBe(companiesUnder(formation(vimyScenario(), '79rd')!).length);
    expect(cs.every((c) => c.role === 'reserve' && c.id.startsWith('79rd-bis-') && c.sectorId === undefined && (c.start as number[])[0] === 9000)).toBe(true);
    expect(scenario.reserves.at(-1)).toEqual({ formationId: '79rd-bis', side: 'central', distanceKm: { value: 20, estimate: 'what-if: test — add-formation' }, entryPoint: [9000, 0] });
    expect(changes.map((c) => c.path)).toEqual([expect.stringMatching(/\.children\[\d+\]$/), `reserves[${scenario.reserves.length - 1}]`]);
    expect(checkReferences(scenario, DOCS)).toEqual([]);
  });

  it('add-formation from the library merges the sources its items cite into s.sources, each merge a Change', () => {
    const lib: Library = {
      ...emptyLibrary(),
      sources: { 'lib-src': { title: 'A divisional history', tier: 'official' } },
      leaders: [{ id: 'lib-general', name: { value: 'A General', source: 'lib-src', page: '3' }, rank: { value: 'Generalleutnant', source: 'lib-src' } }],
      formations: [{ id: 'lib-div', name: 'A division', kind: 'division', leaderId: 'lib-general', insignia: { colour: { value: '#123456', source: 'lib-src' } } }],
    };
    const { scenario, changes } = apply(
      [{ op: 'add-formation', from: { libraryId: 'lib-div' }, side: 'central', underFormationId: 'sixth-army', entryPoint: [9000, 0], distanceKm: 30 }],
      lib,
    );
    expect(scenario.sources['lib-src']).toEqual(lib.sources['lib-src']);
    expect(scenario.leaders.at(-1)).toEqual(lib.leaders[0]);
    expect(formation(scenario, 'lib-div')!.insignia).toEqual(lib.formations[0]!.insignia);
    expect(changes.filter((c) => c.path === 'sources.lib-src')).toEqual([{ index: 0, path: 'sources.lib-src', from: undefined, to: lib.sources['lib-src'] }]);
    expect(changes.some((c) => c.path === `leaders[${scenario.leaders.length - 1}]`)).toBe(true);
    expect(checkReferences(scenario, DOCS)).toEqual([]);
  });

  it('a weather preset is converted from afterMin to at by zeroHour', () => {
    const lib: Library = {
      ...emptyLibrary(),
      weatherPresets: {
        downpour: [
          { afterMin: -600, precipitation: { value: 'rain', estimate: 'preset' } },
          { afterMin: 90, precipitation: { value: 'none', estimate: 'preset' } },
        ],
      },
    };
    const base = vimyScenario();
    const { scenario, changes } = apply([{ op: 'weather', preset: 'downpour' }], lib);
    expect(scenario.weather.map((w) => w.at)).toEqual(['1917-04-08T19:30', '1917-04-09T07:00']);
    expect(scenario.weather.map((w) => minutesBetween(base.zeroHour.value, w.at))).toEqual([-600, 90]);
    expect(scenario.weather[0]).toEqual({ at: '1917-04-08T19:30', precipitation: { value: 'rain', estimate: 'preset' } });
    expect(changes).toEqual([{ index: 0, path: 'weather', from: base.weather, to: scenario.weather }]);
  });

  it('ground sets groundCondition as a what-if estimate', () => {
    const { scenario, changes } = apply([{ op: 'ground', preset: 'quagmire' }]);
    expect(scenario.groundCondition).toEqual({ value: 'quagmire', estimate: 'what-if: test — ground' });
    expect(changes).toEqual([{ index: 0, path: 'groundCondition', from: undefined, to: scenario.groundCondition }]);
  });

  it('swap-leader puts a scenario leader in command (a plain change), or adds a library leader with its sources', () => {
    const base = vimyScenario();
    const r = apply([{ op: 'swap-leader', formationId: '1cdn', leaderId: 'watson' }]);
    expect(formation(r.scenario, '1cdn')!.leaderId).toBe('watson');
    expect(r.changes).toEqual([{ index: 0, path: expect.stringMatching(/\.leaderId$/), from: 'currie', to: 'watson' }]);
    const lib: Library = { ...emptyLibrary(), sources: { 'lib-src': { title: 'A memoir', tier: 'secondary' } }, leaders: [{ id: 'monash', name: { value: 'John Monash', source: 'lib-src' }, rank: { value: 'Major-General', source: 'lib-src' } }] };
    const { scenario } = apply([{ op: 'swap-leader', formationId: '1cdn', leaderId: 'monash' }], lib);
    expect(scenario.leaders).toHaveLength(base.leaders.length + 1);
    expect(scenario.sources['lib-src']).toBeDefined();
    expect(checkReferences(scenario, DOCS)).toEqual([]);
  });

  it('reserve-distance sets distanceKm on the named reserve or every reserve of the side', () => {
    const all = apply([{ op: 'reserve-distance', side: 'central', km: 5 }]).scenario;
    expect(all.reserves.every((r) => r.distanceKm.value === 5)).toBe(true);
    const one = apply([{ op: 'reserve-distance', formationId: '17id', km: 1 }]).scenario;
    expect(one.reserves.filter((r) => r.distanceKm.value === 1).map((r) => r.formationId)).toEqual(['17id']);
  });

  it('move by [dx, dy] shifts a company, and each company of a battalion', () => {
    const base = vimyScenario();
    const bn = allFormations(base).find((f) => f.kind === 'battalion' && (f.companies?.length ?? 0) > 1)!;
    const first = bn.companies![0]!;
    const one = apply([{ op: 'move', unitId: first.id, by: [100, -50] }]);
    const at = (s: Scenario, id: string) => allFormations(s).flatMap((f) => f.companies ?? []).find((c) => c.id === id)!.start as [number, number];
    expect(at(one.scenario, first.id)).toEqual([(first.start as number[])[0]! + 100, (first.start as number[])[1]! - 50]);
    expect(one.changes).toHaveLength(1);
    const all = apply([{ op: 'move', unitId: bn.id, by: [10, 20] }]);
    for (const c of bn.companies!) expect(at(all.scenario, c.id)).toEqual([(c.start as number[])[0]! + 10, (c.start as number[])[1]! + 20]);
    expect(all.changes).toHaveLength(bn.companies!.length);
    const div = apply([{ op: 'move', unitId: '1cdn', by: [1, 1] }]);
    expect(div.unresolved[0]!.reason).toMatch(/unit "1cdn" \(a division/);
  });

  it('never mutates the scenario it was given', () => {
    const s = vimyScenario();
    const before = JSON.stringify(s);
    applyOverlay(s, ov([{ op: 'scale-guns', factor: 0.5 }]), emptyLibrary(), DOCS);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('never mutates the scenario it was given, whatever the ops (the engine caches by scenario object)', () => {
    const s = vimyScenario();
    const before = structuredClone(s);
    const r = applyOverlay(
      s,
      ov([
        { op: 'scale-men', factor: 2 },
        { op: 'scale-ammunition', factor: 0.5 },
        { op: 'remove-formation', formationId: '10bde' },
        { op: 'add-formation', from: { formationId: 'copy', copyOf: '17id' }, side: 'central', underFormationId: 'sixth-army', entryPoint: [9000, 0], distanceKm: 3 },
        { op: 'ground', preset: 'dry' },
        { op: 'swap-leader', formationId: '1cdn', leaderId: 'watson' },
        { op: 'doctrine', side: 'central', doctrineId: 'bef-1917' },
        { op: 'reserve-distance', km: 2 },
        { op: 'move', unitId: allFormations(s).find((f) => f.kind === 'battalion' && f.companies?.length)!.id, by: [5, 5] },
      ]),
      emptyLibrary(),
      DOCS,
    );
    expect(s).toEqual(before);
    expect(r.scenario).not.toBe(s);
    expect(r.scenario.forces).not.toBe(s.forces);
    expect(r.scenario.reserves).not.toBe(s.reserves);
  });
});
