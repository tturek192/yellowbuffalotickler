import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ATTACK_KEYS, ATTACK_RANGES, COMMON_KEYS, COMMON_RANGES, COMPANY_DEFAULT_KEYS, COMPANY_DEFAULT_RANGES, DEFENCE_KEYS, DEFENCE_RANGES, NCO_RANGES } from './doctrine';
import { parseDoctrine, parseScenario, ScenarioError } from './load';
import { loadScenario } from './load-node';
import { minimalScenario, minimalDoctrineV2, toYaml } from './test-fixtures';

const repoRoot = resolve(__dirname, '../../..');

const doctrine = (sources: object, source = 'd-src') => {
  const d = minimalDoctrineV2();
  return toYaml({ ...d, title: 'BEF 1917', sources, attack: { ...d.attack, followDistanceM: { value: 50, source, description: 'follow distance' } } });
};

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
    const dir = setup(doctrine({ 'd-src': { title: 'D', tier: 'official' } }));
    const r = loadScenario(join(dir, 'scenario.yaml'), dir);
    expect(r.scenario.id).toBe('fixture');
    expect(r.doctrines['bef-1917'].id).toBe('bef-1917');
  });
  it("rejects doctrine values citing sources missing from the doctrine's own sources", () => {
    const dir = setup(doctrine({ other: { title: 'O', tier: 'official' } }));
    expect(() => loadScenario(join(dir, 'scenario.yaml'), dir)).toThrow(/followDistanceM.source: unknown source "d-src"/);
  });
  it('reports a missing doctrine file', () => {
    const dir = setup('');
    writeFileSync(join(dir, 'scenario.yaml'), toYaml({ ...minimalScenario(), forces: [{ ...minimalScenario().forces[0], doctrine: 'nope' }] }));
    expect(() => loadScenario(join(dir, 'scenario.yaml'), dir)).toThrow(/doctrine nope: cannot read/);
  });
});

describe('values the engine cannot run are rejected at load, with their path', () => {
  const rejects = (mutate: (s: any) => void, message: RegExp) => {
    const s: any = minimalScenario();
    mutate(s);
    expect(() => parseScenario(toYaml(s), ['bef-1917'])).toThrow(message);
  };
  it.each<[string, (s: any) => void, RegExp]>([
    ['a sector with no legs', (s) => (s.sectors[0].legs = []), /sectors\[0\]\.legs: .*at least 1/],
    ['a line with one point', (s) => (s.lines[1].points = [[1150, 0]]), /lines\[1\]\.points: .*at least 2/],
    ['a line whose y does not strictly ascend', (s) => (s.lines[1].points = [[1150, 400], [1150, 0]]), /lines\[1\]\.points: .*strictly ascending y/],
    ['a line with a repeated y', (s) => (s.lines[0].points = [[150, 0], [160, 0], [150, 400]]), /lines\[0\]\.points: .*strictly ascending y/],
    ['a zero lift distance', (s) => (s.sectors[0].legs[0].liftM.value = 0), /sectors\[0\]\.legs\[0\]\.liftM\.value: .*greater than 0/],
    ['a zero lift interval', (s) => (s.sectors[0].legs[0].liftMin.value = 0), /sectors\[0\]\.legs\[0\]\.liftMin\.value: .*greater than 0/],
    ['a negative pause', (s) => (s.sectors[0].legs[0].pauseMin.value = -1), /sectors\[0\]\.legs\[0\]\.pauseMin\.value: .*greater than or equal to 0/],
    ['a negative stand-off', (s) => (s.sectors[0].standOffM.value = -5), /sectors\[0\]\.standOffM\.value: .*greater than or equal to 0/],
    ['a zero hour with a zone', (s) => (s.zeroHour.value = '1916-07-01T07:30Z'), /zeroHour\.value: .*YYYY-MM-DDTHH:MM/],
    ['a zero hour with seconds', (s) => (s.zeroHour.value = '1916-07-01T07:30:00'), /zeroHour\.value: .*YYYY-MM-DDTHH:MM/],
    ['a bad historical earliest', (s) => (s.historical.objectives[0].earliest.value = '1 July 1916 10:00'), /historical\.objectives\[0\]\.earliest\.value: .*YYYY-MM-DDTHH:MM/],
    ['a bad historical latest', (s) => (s.historical.objectives[0].latest.value = '1916-07-01T14:00+01:00'), /historical\.objectives\[0\]\.latest\.value: .*YYYY-MM-DDTHH:MM/],
  ])('rejects %s', (_, mutate, message) => rejects(mutate, message));
});

describe('doctrine parameters the engine cannot use are rejected, with their path', () => {
  type D = ReturnType<typeof minimalDoctrineV2> & { attack: NonNullable<ReturnType<typeof minimalDoctrineV2>['attack']> };
  const base = () => minimalDoctrineV2() as D;
  it('accepts sensible values, including zero follow distance, jitters and fraction', () => {
    const d = base();
    d.attack.followDistanceM.value = 0;
    d.attack.startJitterMin.value = 0;
    d.attack.speedJitterFrac.value = 0;
    expect(parseDoctrine(toYaml(d)).id).toBe('bef-1917');
  });
  it.each<[string, (d: ReturnType<typeof base>) => void, RegExp]>([
    ['a negative follow distance', (d) => (d.attack.followDistanceM.value = -1), /attack\.followDistanceM\.value: .*greater than or equal to 0/],
    ['a zero advance rate', (d) => (d.attack.maxAdvanceMPerMin.value = 0), /attack\.maxAdvanceMPerMin\.value: .*greater than 0/],
    ['a negative start jitter', (d) => (d.attack.startJitterMin.value = -2), /attack\.startJitterMin\.value: .*greater than or equal to 0/],
    ['a negative speed jitter', (d) => (d.attack.speedJitterFrac.value = -0.1), /attack\.speedJitterFrac\.value: .*greater than or equal to 0/],
    ['a speed jitter of 1', (d) => (d.attack.speedJitterFrac.value = 1), /attack\.speedJitterFrac\.value: .*less than 1/],
    // Final review fix: every key declares its range (fractions in [0, 1], rates and counts >= 0, speeds > 0).
    ['a march rate of 0 (an arrival time of NaN)', (d) => (d.common.marchKmPerHour.value = 0), /common\.marchKmPerHour\.value: .*greater than 0/],
    ['a quiet step of 0', (d) => (d.common.quietStepMin.value = 0), /common\.quietStepMin\.value: .*greater than 0/],
    ['a starting morale above 1', (d) => (d.common.baseMorale.value = 1.2), /common\.baseMorale\.value: .*less than or equal to 1/],
    ['a negative morale drain', (d) => (d.common.suppressedDrain.value = -0.3), /common\.suppressedDrain\.value: .*greater than or equal to 0/],
    ['an NCO penalty above 1', (d) => (d.ncoPenalty.standard.value = 1.5), /ncoPenalty\.standard\.value: .*less than or equal to 1/],
    ['a negative company strength', (d) => (d.companyDefaults.strength.value = -1), /companyDefaults\.strength\.value: .*greater than or equal to 0/],
    ['an ammunition reserve above 1', (d) => (d.attack.ammoReserveFrac.value = 2), /attack\.ammoReserveFrac\.value: .*less than or equal to 1/],
    ['a trapped share above 1', (d) => (d.defence!.trappedSurrenderFrac.value = 2), /defence\.trappedSurrenderFrac\.value: .*less than or equal to 1/],
    ['a negative counter-attack delay', (d) => (d.defence!.localCounterAttackDelayMin.value = -5), /defence\.localCounterAttackDelayMin\.value: .*greater than or equal to 0/],
  ])('rejects %s', (_, mutate, message) => {
    const d = base();
    mutate(d);
    expect(() => parseDoctrine(toYaml(d))).toThrow(message);
  });
});

describe('every doctrine key declares its range (final review fix)', () => {
  it('each common, ncoPenalty, companyDefaults, attack and defence key has one, and the repository doctrines are within them', () => {
    for (const [keys, ranges] of [[COMMON_KEYS, COMMON_RANGES], [['rehearsed', 'standard'], NCO_RANGES], [COMPANY_DEFAULT_KEYS, COMPANY_DEFAULT_RANGES], [ATTACK_KEYS, ATTACK_RANGES], [DEFENCE_KEYS, DEFENCE_RANGES]] as const)
      expect(Object.keys(ranges).sort()).toEqual([...keys].sort());
    for (const f of ['bef-1917.yaml', 'de-1917.yaml']) expect(() => parseDoctrine(readFileSync(join(repoRoot, 'doctrine', f), 'utf8'))).not.toThrow();
  });
});
