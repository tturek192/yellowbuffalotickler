/**
 * Sample IGN RGE ALTI elevations over a scenario's frame extent into a terrain grid.
 *
 *   npx tsx scripts/fetch-dem.ts scenarios/vimy-1917/scenario.yaml --cell 25 --out scenarios/vimy-1917/terrain/rge-alti-25m.json
 *
 * Each 200-point request is cached under --cache (default .cache/dem), so an interrupted run resumes
 * where it stopped. The grid is written only once every cell has a value; on no-data cells or a failed
 * request it exits 1 and writes nothing. Behind an HTTPS proxy, run with NODE_USE_ENV_PROXY=1.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { decodeTerrain, encodeTerrain, FrameSchema, unprojectXY, type Frame, type TerrainGrid } from '@wwi/scenario';

/** Fetch a URL and return its parsed JSON body; throw on any failure. */
export type Fetcher = (url: string) => Promise<unknown>;

/** The elevation data has holes: the grid would be incomplete. */
export class DemError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DemError';
  }
}

const SERVICE = 'https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json';
const RESOURCE = 'ign_rge_alti_wld';
/** Most points the service is asked for in one call. */
export const BATCH = 200;
/** Waits before each retry of a failed call: four retries. */
export const RETRY_MS = [1000, 2000, 4000, 8000];
/** The service's no-data value. */
const NO_DATA = -99999;

/** The elevation request for these [lon, lat] points (to 1e-7°, about 1 cm). */
export function demUrl(points: ReadonlyArray<readonly [number, number]>): string {
  const lon = points.map((p) => p[0].toFixed(7)).join('|');
  const lat = points.map((p) => p[1].toFixed(7)).join('|');
  return `${SERVICE}?lon=${lon}&lat=${lat}&resource=${RESOURCE}&zonly=true`;
}

/** The real fetcher: Node's fetch, one minute per request. */
export const httpFetcher: Fetcher = async (url) => {
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json();
};

const sleepMs = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** The elevations of a well-formed reply for `n` points, or undefined. Values are checked later, cell by cell. */
function elevationsOf(reply: unknown, n: number): unknown[] | undefined {
  const e = (reply as { elevations?: unknown } | null)?.elevations;
  return Array.isArray(e) && e.length === n ? e : undefined;
}

function readCache(file: string, n: number): unknown[] | undefined {
  if (!existsSync(file)) return undefined;
  try {
    return elevationsOf(JSON.parse(readFileSync(file, 'utf8')), n);
  } catch {
    return undefined; // a torn or corrupt file: fetch it again
  }
}

/** Write via a temporary file and a rename, so a crash never leaves a torn file under the real name. */
function writeAtomic(file: string, text: string): void {
  const tmp = `${file}.tmp-${process.pid}`;
  writeFileSync(tmp, text);
  renameSync(tmp, file);
}

export type FetchDemOptions = {
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
  /** Requests in flight at once. */
  concurrency?: number;
};

/**
 * Sample the elevation at every cell centre of a cellM grid laid over frame.extent (from its south-west
 * corner, +x then +y), BATCH points a call. Throws DemError if any cell has no data.
 */
export async function fetchDem(frame: Frame, cellM: number, fetcher: Fetcher, cacheDir: string, opts: FetchDemOptions = {}): Promise<TerrainGrid> {
  const { sleep = sleepMs, log = () => {}, concurrency = 4 } = opts;
  const e = frame.extent;
  if (!(cellM > 0)) throw new Error(`cell size must be positive, got ${cellM}`);
  if (!(e.maxX > e.minX && e.maxY > e.minY)) throw new Error('the frame extent is empty');
  const cols = Math.ceil((e.maxX - e.minX) / cellM - 1e-9);
  const rows = Math.ceil((e.maxY - e.minY) / cellM - 1e-9);
  const originX = e.minX + cellM / 2;
  const originY = e.minY + cellM / 2;
  const n = cols * rows;
  const xy = (k: number): [number, number] => [originX + (k % cols) * cellM, originY + Math.floor(k / cols) * cellM];

  mkdirSync(cacheDir, { recursive: true });
  const values: unknown[] = new Array(n);
  const batches = Math.ceil(n / BATCH);
  let next = 0;
  let done = 0;
  let cached = 0;
  let failure: Error | undefined;

  const runBatch = async (b: number): Promise<void> => {
    const from = b * BATCH;
    const count = Math.min(BATCH, n - from);
    const url = demUrl(Array.from({ length: count }, (_, i) => unprojectXY(frame, xy(from + i))));
    const file = resolve(cacheDir, `${createHash('sha256').update(url).digest('hex')}.json`);
    let elevations = readCache(file, count);
    if (elevations) cached++;
    for (let attempt = 0; !elevations; attempt++) {
      let why: string;
      try {
        const reply = await fetcher(url);
        elevations = elevationsOf(reply, count);
        if (elevations) {
          writeAtomic(file, JSON.stringify({ elevations }));
          break;
        }
        why = `malformed reply (expected ${count} elevations)`;
      } catch (err) {
        why = (err as Error).message;
      }
      if (attempt >= RETRY_MS.length) throw new Error(`batch ${b + 1}/${batches} failed after ${attempt + 1} attempts: ${why}`);
      log(`batch ${b + 1}/${batches}: ${why}; retrying in ${RETRY_MS[attempt]! / 1000} s`);
      await sleep(RETRY_MS[attempt]!);
    }
    elevations.forEach((v, i) => (values[from + i] = v));
    done++;
    if (done % 25 === 0 || done === batches) log(`${done}/${batches} batches (${cached} from cache)`);
  };

  const worker = async (): Promise<void> => {
    while (!failure && next < batches) {
      const b = next++;
      try {
        await runBatch(b);
      } catch (err) {
        failure ??= err as Error;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, batches)) }, worker));
  if (failure) throw failure;

  const holes = values.flatMap((v, k) => (typeof v !== 'number' || !Number.isFinite(v) || v <= NO_DATA ? [k] : []));
  if (holes.length) {
    const [x, y] = xy(holes[0]!);
    throw new DemError(`${holes.length} cells have no data (first at x=${Math.round(x * 10) / 10}, y=${Math.round(y * 10) / 10})`);
  }
  return {
    source: { source: 'ign-rge-alti', note: `${SERVICE} (resource ${RESOURCE})` },
    method: `IGN RGE ALTI elevations from the Géoplateforme altimetry service (resource ${RESOURCE}), sampled at the centres of ${cellM} m cells over the frame extent`,
    ...encodeTerrain({ cellM, originX, originY, cols, rows, elevM: values as number[] }),
  };
}

/** The frame from the scenario's root file, or else from the first file it includes that has one. */
function readFrame(scenarioPath: string): Frame | undefined {
  const root = parse(readFileSync(scenarioPath, 'utf8')) as Record<string, unknown> | null;
  const candidates: unknown[] = [root?.frame];
  if (Array.isArray(root?.include)) {
    for (const f of root.include) {
      if (typeof f !== 'string') continue;
      try {
        candidates.push((parse(readFileSync(resolve(dirname(scenarioPath), f), 'utf8')) as Record<string, unknown> | null)?.frame);
      } catch {
        // an unreadable include holds no frame for us; loading the scenario reports it
      }
    }
  }
  for (const c of candidates) {
    if (c === undefined) continue;
    const r = FrameSchema.safeParse(c);
    if (r.success) return r.data;
  }
  return undefined;
}

const USAGE = 'usage: fetch-dem <scenario.yaml> --cell <metres> --out <grid.json> [--cache <dir>]';

export type MainDeps = FetchDemOptions & {
  fetcher?: Fetcher;
  cwd?: string;
  error?: (line: string) => void;
};

/** Run the command; resolves to the exit code (0 written, 1 fetch failed, 2 bad arguments or scenario). */
export async function main(args: string[], deps: MainDeps = {}): Promise<number> {
  const { fetcher = httpFetcher, cwd = process.cwd(), error = (l: string) => console.error(l), log = (l: string) => console.error(l) } = deps;
  const opts: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i]!;
    if (a.startsWith('--')) {
      const v = args[++i];
      if (v === undefined) return error(USAGE), 2;
      opts[a.slice(2)] = v;
    } else positional.push(a);
  }
  const cellM = Number(opts.cell);
  const unknown = Object.keys(opts).filter((k) => !['cell', 'out', 'cache'].includes(k));
  if (positional.length !== 1 || !opts.out || !(cellM > 0) || unknown.length) return error(USAGE), 2;
  const scenarioArg = positional[0]!;

  let frame: Frame | undefined;
  try {
    frame = readFrame(resolve(cwd, scenarioArg));
  } catch (e) {
    return error(`fetch-dem: ${scenarioArg}: ${(e as Error).message}`), 2;
  }
  if (!frame) return error(`fetch-dem: ${scenarioArg}: no valid frame (origin, bearingDeg, extent) in the file or its includes`), 2;

  let grid: TerrainGrid;
  try {
    grid = await fetchDem(frame, cellM, fetcher, resolve(cwd, opts.cache ?? '.cache/dem'), { ...deps, log });
  } catch (e) {
    error(`fetch-dem: ${(e as Error).message}`);
    if (!(e instanceof DemError) && process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) {
      error('fetch-dem: hint: Node ignores HTTPS_PROXY unless NODE_USE_ENV_PROXY=1 is set');
    }
    return 1;
  }
  const out = resolve(cwd, opts.out);
  mkdirSync(dirname(out), { recursive: true });
  writeAtomic(out, `${JSON.stringify(grid, null, 2)}\n`);
  const t = decodeTerrain(grid);
  log(`wrote ${opts.out}: ${grid.cols} × ${grid.rows} cells of ${cellM} m; elevation ${t.min}…${t.max} m`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
