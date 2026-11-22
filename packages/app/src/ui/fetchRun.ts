import type { RunRecord } from '@wwi/engine';
import { parseRunRecord } from './runRecord';

type Fetcher = (url: string) => Promise<Response>;

/**
 * Load the run record served at /runs/<name>.json. A missing file shows up as a 404 or, from Vite's
 * dev server, as its index.html fallback (200, text/html); both mean there is no such run.
 */
export async function fetchRun(name: string, fetcher: Fetcher = (url) => fetch(url)): Promise<RunRecord> {
  if (!/^[\w.-]+$/.test(name)) throw new Error(`“${name}” is not a valid run name.`);
  const url = `${import.meta.env.BASE_URL}runs/${encodeURIComponent(name)}.json`;
  const res = await fetcher(url);
  const json = (res.headers.get('content-type') ?? '').includes('json');
  if (res.status === 404 || (res.ok && !json)) {
    throw new Error(`No run named “${name}”.`);
  }
  if (!res.ok) throw new Error(`Could not load ${url} (HTTP ${res.status}).`);
  return parseRunRecord(await res.json());
}
