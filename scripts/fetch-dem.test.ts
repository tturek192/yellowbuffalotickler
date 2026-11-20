import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { decodeTerrain, projectLonLat, type Frame } from '@wwi/scenario';
import { DemError, demUrl, fetchDem, main, type Fetcher } from './fetch-dem';

const smallFrame: Frame = {
  origin: { lon: 2.7735, lat: 50.3796 },
  bearingDeg: { value: 80, estimate: 'test' },
  extent: { minX: -1000, maxX: 4000, minY: -2000, maxY: 2200 },
};
// 5000 m / 500 m = 10 cols; 4200 m / 500 m = 8.4 → 9 rows.
const expectedCells = 10 * 9;
const noSleep = async (): Promise<void> => {};

const tmp = (): string => mkdtempSync(join(tmpdir(), 'wwi-dem-'));

/** Parse the lon/lat lists back out of a request URL. */
function pointsOf(url: string): Array<[number, number]> {
  const q = new URL(url).searchParams;
  const lons = q.get('lon')!.split('|').map(Number);
  const lats = q.get('lat')!.split('|').map(Number);
  return lons.map((lon, i) => [lon, lats[i]!]);
}

/**
 * A stand-in for the IGN service. The first `failFirst` calls fail (thrown network errors). Elevation is a
 * smooth function of position in the frame, so a grid can be checked against it; the n-th point served
 * (counting from 0, in request order) is "no data" when n is in `noDataAt`.
 */
function flakyFetcher({ failFirst, noDataAt, frame = smallFrame }: { failFirst: number; noDataAt: number[]; frame?: Frame }) {
  let served = 0;
  const seenBatches = new Set<string>();
  const f = (async (url: string) => {
    f.calls++;
    seenBatches.add(url);
    f.batches = seenBatches.size;
    if (f.calls <= failFirst) throw new Error('ECONNRESET');
    const pts = pointsOf(url);
    const elevations = pts.map((ll) => {
      const n = served++;
      if (noDataAt.includes(n)) return -99999;
      const [x, y] = projectLonLat(frame, ll);
      return 100 + x / 100 + y / 200;
    });
    return { elevations };
  }) as Fetcher & { calls: number; batches: number };
  f.calls = 0;
  f.batches = 0;
  return f;
}

describe('fetchDem', () => {
  it('fetchDem retries, resumes from cache, and refuses holes (Review Focus 5)', async () => {
    const sameTmp = tmp();
    const fake = flakyFetcher({ failFirst: 2, noDataAt: [] });
    const g = await fetchDem(smallFrame, 500, fake, sameTmp, { sleep: noSleep });
    expect(g.cols * g.rows).toBe(expectedCells);
    expect(fake.calls).toBeGreaterThan(fake.batches); // retried
    const again = flakyFetcher({ failFirst: 0, noDataAt: [] });
    await fetchDem(smallFrame, 500, again, sameTmp, { sleep: noSleep });
    expect(again.calls).toBe(0); // fully cached
    await expect(fetchDem(smallFrame, 500, flakyFetcher({ failFirst: 0, noDataAt: [3] }), tmp(), { sleep: noSleep })).rejects.toThrow(
      /1 cells have no data/,
    );
  });

  it('samples cell centres across the extent, row-major from the south-west corner', async () => {
    const g = await fetchDem(smallFrame, 500, flakyFetcher({ failFirst: 0, noDataAt: [] }), tmp(), { sleep: noSleep });
    expect([g.cellM, g.originX, g.originY, g.cols, g.rows]).toEqual([500, -750, -1750, 10, 9]);
    const t = decodeTerrain(g);
    // The fake's elevation is 100 + x/100 + y/200, stored to the decimetre.
    for (const [x, y] of [[-750, -1750], [3750, -1750], [-750, 2250], [1250, 250]] as const) {
      expect(Math.abs(t.at(x, y) - (100 + x / 100 + y / 200))).toBeLessThanOrEqual(0.0501);
    }
    expect(g.source.source).toBe('ign-rge-alti');
    expect(g.method).toMatch(/ign_rge_alti_wld.*500 m/);
  });

  it('asks for at most 200 points a call, |-separated, from the RGE ALTI resource', async () => {
    const urls: string[] = [];
    const fake: Fetcher = async (url) => {
      urls.push(url);
      return { elevations: pointsOf(url).map(() => 100) };
    };
    // 2000 m / 50 m = 40 cols; 1000 m / 50 m = 20 rows: 800 cells in 4 batches.
    const frame = { ...smallFrame, extent: { minX: 0, maxX: 2000, minY: 0, maxY: 1000 } };
    const g = await fetchDem(frame, 50, fake, tmp(), { sleep: noSleep });
    expect(g.cols * g.rows).toBe(800);
    expect(urls).toHaveLength(4);
    expect(urls.every((u) => pointsOf(u).length === 200)).toBe(true);
    expect(urls[0]).toMatch(/^https:\/\/data\.geopf\.fr\/altimetrie\/1\.0\/calcul\/alti\/rest\/elevation\.json\?lon=[\d.]+\|[\d.]+/);
    expect(urls[0]).toMatch(/&resource=ign_rge_alti_wld&zonly=true$/);
    expect(demUrl([[2.7, 50.3], [2.8, 50.4]])).toBe(
      'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=2.7000000|2.8000000&lat=50.3000000|50.4000000&resource=ign_rge_alti_wld&zonly=true',
    );
  });

  it('backs off 1, 2, 4, 8 s, then gives up after 4 retries', async () => {
    const waits: number[] = [];
    const sleep = async (ms: number): Promise<void> => void waits.push(ms);
    const down = flakyFetcher({ failFirst: 1000, noDataAt: [] });
    await expect(fetchDem(smallFrame, 500, down, tmp(), { sleep })).rejects.toThrow(/after 5 attempts.*ECONNRESET/);
    expect(down.calls).toBe(5);
    expect(waits).toEqual([1000, 2000, 4000, 8000]);
  });

  it('treats a malformed or short reply as a failed attempt, never caching it', async () => {
    const dir = tmp();
    let n = 0;
    const fake: Fetcher = async (url) => {
      n++;
      if (n === 1) return { elevations: [1, 2] }; // too few values
      if (n === 2) return { oops: true };
      return { elevations: pointsOf(url).map(() => 50) };
    };
    const g = await fetchDem(smallFrame, 500, fake, dir, { sleep: noSleep });
    expect(decodeTerrain(g).min).toBe(50);
    expect(n).toBe(3);
  });

  it('counts every no-data or non-finite cell and names the first', async () => {
    const fake: Fetcher = async (url) => ({
      elevations: pointsOf(url).map((ll, i) => (i === 0 ? -99999 : i === 1 ? -100000 : i === 2 ? null : 10)),
    });
    await expect(fetchDem(smallFrame, 500, fake, tmp(), { sleep: noSleep })).rejects.toThrow(
      new DemError('3 cells have no data (first at x=-750, y=-1750)'),
    );
  });

  it('resumes after a failure part-way, fetching only the batches it lacks', async () => {
    const dir = tmp();
    const frame = { ...smallFrame, extent: { minX: 0, maxX: 2000, minY: 0, maxY: 1000 } }; // 4 batches at 50 m
    let n = 0;
    const dies: Fetcher = async (url) => {
      if (++n > 2) throw new Error('service down');
      return { elevations: pointsOf(url).map(() => 70) };
    };
    await expect(fetchDem(frame, 50, dies, dir, { sleep: noSleep })).rejects.toThrow(/service down/);
    expect(readdirSync(dir).filter((f) => f.endsWith('.json'))).toHaveLength(2);
    const back = flakyFetcher({ failFirst: 0, noDataAt: [], frame });
    await fetchDem(frame, 50, back, dir, { sleep: noSleep });
    expect(back.calls).toBe(2);
  });

  it('never caches a batch with no-data values, so a re-run fetches only that batch again', async () => {
    const dir = tmp();
    const frame = { ...smallFrame, extent: { minX: 0, maxX: 2000, minY: 0, maxY: 1000 } }; // 4 batches at 50 m
    // The 4th point of the 2nd request is no data (requests run one at a time here, in order).
    await expect(fetchDem(frame, 50, flakyFetcher({ failFirst: 0, noDataAt: [203], frame }), dir, { sleep: noSleep, concurrency: 1 })).rejects.toThrow(DemError);
    expect(readdirSync(dir).filter((f) => f.endsWith('.json'))).toHaveLength(3);
    const back = flakyFetcher({ failFirst: 0, noDataAt: [], frame });
    await fetchDem(frame, 50, back, dir, { sleep: noSleep });
    expect(back.calls).toBe(1);
  });

  it('does not trust a cached batch holding no-data or non-numeric values', async () => {
    const dir = tmp();
    await fetchDem(smallFrame, 500, flakyFetcher({ failFirst: 0, noDataAt: [] }), dir, { sleep: noSleep });
    for (const bad of [-99999, null, 'x']) {
      for (const f of readdirSync(dir)) {
        const cached = JSON.parse(readFileSync(join(dir, f), 'utf8')) as { elevations: unknown[] };
        cached.elevations[7] = bad;
        writeFileSync(join(dir, f), JSON.stringify(cached));
      }
      const again = flakyFetcher({ failFirst: 0, noDataAt: [] });
      await fetchDem(smallFrame, 500, again, dir, { sleep: noSleep });
      expect(again.calls).toBe(1);
    }
  });

  it('re-fetches a corrupt cache file instead of trusting it', async () => {
    const dir = tmp();
    await fetchDem(smallFrame, 500, flakyFetcher({ failFirst: 0, noDataAt: [] }), dir, { sleep: noSleep });
    for (const f of readdirSync(dir)) writeFileSync(join(dir, f), '{"elevations": [1');
    const again = flakyFetcher({ failFirst: 0, noDataAt: [] });
    await fetchDem(smallFrame, 500, again, dir, { sleep: noSleep });
    expect(again.calls).toBe(1);
  });
});

describe('fetch-dem CLI', () => {
  /** A scenario directory whose scenario.yaml has this frame (null: no frame at all). */
  function scenarioDir(frame: unknown = smallFrame): string {
    const dir = tmp();
    mkdirSync(join(dir, 'terrain'));
    writeFileSync(join(dir, 'scenario.yaml'), frame === null ? 'id: x\n' : `id: x\nframe: ${JSON.stringify(frame)}\n`);
    return dir;
  }
  const quiet = { sleep: noSleep, log: () => {} };

  it('writes the whole grid and exits 0', async () => {
    const dir = scenarioDir();
    const out = join(dir, 'terrain', 'g.json');
    const errs: string[] = [];
    const code = await main(['scenario.yaml', '--cell', '500', '--out', out, '--cache', join(dir, 'cache')], {
      ...quiet, cwd: dir, fetcher: flakyFetcher({ failFirst: 0, noDataAt: [] }), error: (m) => errs.push(m),
    });
    expect([code, errs]).toEqual([0, []]);
    const g = JSON.parse(readFileSync(out, 'utf8'));
    expect(g.cols * g.rows).toBe(expectedCells);
    expect(readdirSync(join(dir, 'terrain'))).toEqual(['g.json']); // no temporary file left behind
  });

  it('exits non-zero and writes nothing on holes or a network failure', async () => {
    for (const fetcher of [flakyFetcher({ failFirst: 0, noDataAt: [5] }), flakyFetcher({ failFirst: 1000, noDataAt: [] })]) {
      const dir = scenarioDir();
      const out = join(dir, 'terrain', 'g.json');
      const errs: string[] = [];
      const code = await main(['scenario.yaml', '--cell', '500', '--out', out, '--cache', join(dir, 'cache')], {
        ...quiet, cwd: dir, fetcher, error: (m) => errs.push(m),
      });
      expect(code).toBe(1);
      expect(errs.join('\n')).toMatch(/fetch-dem: (1 cells have no data|.*ECONNRESET)/);
      expect(readdirSync(join(dir, 'terrain'))).toEqual([]);
    }
  });

  it('on no-data cells, names the cache directory that keeps the complete batches', async () => {
    const dir = scenarioDir();
    const cache = join(dir, 'my-cache');
    const errs: string[] = [];
    const code = await main(['scenario.yaml', '--cell', '500', '--out', join(dir, 'g.json'), '--cache', cache], {
      ...quiet, cwd: dir, fetcher: flakyFetcher({ failFirst: 0, noDataAt: [5] }), error: (m) => errs.push(m),
    });
    expect(code).toBe(1);
    expect(errs.join('\n')).toContain(cache);
    expect(errs.join('\n')).toMatch(/1 cells have no data.*nothing written/s);
  });

  it('reads the frame from an included file when the root has none', async () => {
    const dir = scenarioDir(null);
    writeFileSync(join(dir, 'scenario.yaml'), 'id: x\ninclude: [shell.yaml]\n');
    writeFileSync(join(dir, 'shell.yaml'), `frame: ${JSON.stringify(smallFrame)}\n`);
    const out = join(dir, 'g.json');
    const code = await main(['scenario.yaml', '--cell', '500', '--out', out, '--cache', join(dir, 'cache')], {
      ...quiet, cwd: dir, fetcher: flakyFetcher({ failFirst: 0, noDataAt: [] }), error: () => {},
    });
    expect(code).toBe(0);
  });

  it('refuses a scenario without a frame, and bad arguments, with exit 2 (run as a script)', () => {
    const script = join(import.meta.dirname, 'fetch-dem.ts');
    const tsx = join(import.meta.dirname, '..', 'node_modules', '.bin', 'tsx');
    const run = (args: string[], cwd: string) => spawnSync(tsx, [script, ...args], { cwd, encoding: 'utf8' });
    const dir = scenarioDir(null);
    const r = run(['scenario.yaml', '--cell', '25', '--out', 'o.json'], dir);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/fetch-dem: scenario\.yaml: no valid frame/);
    const bad = run(['scenario.yaml', '--cell', 'x', '--out', 'o.json'], dir);
    expect(bad.status).toBe(2);
    expect(bad.stderr).toMatch(/usage: /);
    expect(existsSync(join(dir, 'o.json'))).toBe(false);
  }, 30000);
});
