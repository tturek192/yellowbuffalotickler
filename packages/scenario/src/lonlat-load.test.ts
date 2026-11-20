import { describe, it, expect } from 'vitest';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadScenario } from './load-node';
import { minimalScenario, toYaml, fixtureWithDoctrine } from './test-fixtures';

const frame = { origin: { lon: 2.7735, lat: 50.3796 }, bearingDeg: { value: 90, estimate: 't' }, extent: { minX: -5000, maxX: 9000, minY: -6000, maxY: 6000 } };

function setup(withFrame: boolean) {
  const dir = mkdtempSync(join(tmpdir(), 'wwi-ll-'));
  mkdirSync(join(dir, 'doctrine'));
  writeFileSync(join(dir, 'doctrine', 'bef-1917.yaml'), toYaml(fixtureWithDoctrine().doctrines['bef-1917']));
  const s = minimalScenario();
  (s.forces[0]!.formations[0]!.companies![0] as any).start = { lonLat: [2.7735, 50.3796] };
  writeFileSync(join(dir, 's.yaml'), toYaml({ ...s, ...(withFrame ? { frame } : {}) }));
  return { path: join(dir, 's.yaml'), doctrineDir: join(dir, 'doctrine') };
}

describe('lonLat company starts', () => {
  it('projects to a local Point using the frame', () => {
    const { path, doctrineDir } = setup(true);
    const c = loadScenario(path, doctrineDir).scenario.forces[0]!.formations[0]!.companies![0]!;
    expect(c.start).toEqual([0, 0]);
  });
  it('names the company when there is no frame', () => {
    const { path, doctrineDir } = setup(false);
    expect(() => loadScenario(path, doctrineDir)).toThrow(/company c1\.start: lonLat needs a frame/);
  });
});
