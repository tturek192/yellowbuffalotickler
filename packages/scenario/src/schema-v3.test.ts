import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ScenarioSchema } from './schema';
import { checkReferences } from './references';
import { loadScenario } from './load-node';
import { parseScenario } from './load';
import { minimalScenarioV3, minimalTables, minimalDoctrineV2, opWithPrereq, bombWith, toYaml, est } from './test-fixtures';

const e = <T,>(value: T) => ({ value, estimate: 'test fixture' });
const repoRoot = resolve(__dirname, '../../..');
const doctrineDir = join(repoRoot, 'doctrine');
const refs = (s: ReturnType<typeof minimalScenarioV3>) => checkReferences(s, ['bef-1917'], undefined, minimalTables());

describe('scenario v3', () => {
  it('Plan 1 and Plan 2 scenarios still load unchanged', () => {
    expect(loadScenario(join(repoRoot, 'scenarios/vimy-1917/1cdn-3bde-draft.yaml'), doctrineDir).scenario.id).toBeTruthy();
    expect(loadScenario(join(repoRoot, 'scenarios/vimy-1917/scenario.yaml'), doctrineDir).scenario.id).toBeTruthy();
  });
  it('a scenario with every v3 section is valid and has no reference problems', () => {
    const s = minimalScenarioV3({
      utcOffsetMin: e(60),
      bombardment: { ...bombWith('g1'), spared: [{ featureId: 'ger-front-a', yMin: 0, yMax: 50, reason: e('spared') }], wire: [{ featureId: 'ger-front-a', yMin: 0, yMax: 400, beltDepthM: e(30) }] },
      communications: { links: [{ side: 'allied', from: 'battalion', to: 'brigade', channels: ['runner', 'buried-cable'] }], liaison: [{ side: 'allied', formationId: 'bn1', note: e('x') }] },
      operations: [{ ...opWithPrereq('black', 's1'), notBefore: '1916-07-01T12:00' }],
      offMap: {
        fire: [{ id: 'f1', side: 'allied', weapon: '18pdr', guns: e(6), window: { from: '1916-07-01T07:30', to: '1916-07-01T08:30' }, target: { yMin: 0, yMax: 100, xMin: 0, xMax: 200 }, cite: e('x') }],
        attacks: [{ id: 'a1', side: 'allied', name: 'Raid', window: { from: '1916-07-01T07:30', to: '1916-07-01T08:30' }, targetFeatureId: 'ger-front-a', suppressFrac: e(0.5), cite: e('x') }],
      },
      air: { superiority: 'contested', observedFrac: e(0.5) },
      end: { keyGround: [{ id: 'k1', name: 'Ridge', featureId: 'ger-front-a' }], lullMin: e(120) },
    });
    expect(ScenarioSchema.parse(s).end!.lullMin.value).toBe(120);
    expect(refs(s)).toEqual([]);
    expect(parseScenario(toYaml(s), ['bef-1917']).id).toBe('fixture');
  });
  it('rejects an operation whose prerequisite line/sector pair does not exist', () => {
    const s = minimalScenarioV3({ operations: [opWithPrereq('nope', 'barrage-x')] });
    expect(refs(s)).toContainEqual(expect.stringMatching(/operations\[0\]\.prerequisite.*nope/));
    expect(refs(s)).toContainEqual(expect.stringMatching(/operations\[0\]\.prerequisite.*barrage-x/));
  });
  it('rejects a bombardment allocation naming unknown artillery', () => {
    expect(refs(minimalScenarioV3({ bombardment: bombWith('ghost') }))).toContainEqual(
      expect.stringMatching(/bombardment\.allocations\[0\]\.artilleryId.*ghost/),
    );
  });
  it('rejects unknown features, formations and weapons in the new sections', () => {
    const s = minimalScenarioV3({
      bombardment: { ...bombWith('g1'), spared: [{ featureId: 'nowhere', yMin: 5, yMax: 1, reason: e('x') }], wire: [] },
      communications: { links: [], liaison: [{ side: 'allied', formationId: 'ghost-bn', note: e('x') }] },
      offMap: {
        fire: [{ id: 'f1', side: 'allied', weapon: 'death-ray', guns: e(1), window: { from: '1916-07-01T07:30', to: '1916-07-01T08:30' }, target: { featureId: 'nope-f' }, cite: e('x') }],
        attacks: [],
      },
      end: { keyGround: [{ id: 'k1', name: 'Ridge', featureId: 'nope-k' }], lullMin: e(60) },
    });
    const p = refs(s);
    for (const re of [/spared\[0\]\.featureId.*nowhere/, /spared\[0\]: yMin 5 is above yMax 1/, /liaison\[0\]\.formationId.*ghost-bn/, /offMap\.fire\[0\]\.weapon.*death-ray/, /offMap\.fire\[0\]\.target\.featureId.*nope-f/, /end\.keyGround\[0\]\.featureId.*nope-k/]) {
      expect(p).toContainEqual(expect.stringMatching(re));
    }
  });
  it('checks weapon ids only when tables are passed', () => {
    const s = minimalScenarioV3();
    s.artillery[0]!.weapon = 'unlisted';
    expect(checkReferences(s, ['bef-1917'])).toEqual([]);
    expect(refs(s)).toContainEqual(expect.stringMatching(/artillery\[0\]\.weapon.*unlisted/));
  });
  it('an unknown channel kind is rejected by the schema', () => {
    const s: any = minimalScenarioV3({ communications: { links: [{ side: 'allied', from: 'battalion', to: 'brigade', channels: ['smoke'] as any }] } });
    expect(() => ScenarioSchema.parse(s)).toThrow(/channels/);
  });
});

describe('scenario v3 files', () => {
  const write = (artilleryPos: unknown) => {
    const dir = mkdtempSync(join(tmpdir(), 'v3-'));
    mkdirSync(join(dir, 'doctrine'));
    writeFileSync(join(dir, 'doctrine', 'bef-1917.yaml'), toYaml(minimalDoctrineV2()));
    const s: any = minimalScenarioV3();
    s.frame = { origin: { lon: 2.7, lat: 50.37 }, bearingDeg: e(75), extent: { minX: -2000, maxX: 3000, minY: -1000, maxY: 1500 } };
    s.artillery[0].position = artilleryPos;
    writeFileSync(join(dir, 'scenario.yaml'), toYaml(s));
    return dir;
  };
  it('projects an artillery lonLat position through the frame', () => {
    const dir = write({ lonLat: [2.7, 50.37] });
    const { scenario } = loadScenario(join(dir, 'scenario.yaml'), join(dir, 'doctrine'));
    const pos = scenario.artillery[0]!.position as [number, number];
    expect(pos[0]).toBeCloseTo(0, 3);
    expect(pos[1]).toBeCloseTo(0, 3);
  });
  it('rejects an artillery lonLat position outside the frame extent, naming the entry', () => {
    const dir = write({ lonLat: [50.37, 2.7] });
    expect(() => loadScenario(join(dir, 'scenario.yaml'), join(dir, 'doctrine'))).toThrow(/artillery\[0\]\.position: artillery g1 projects to/);
  });
});
