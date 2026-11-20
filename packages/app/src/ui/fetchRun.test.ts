import { describe, expect, it } from 'vitest';
import { fetchRun } from './fetchRun';

const record = {
  scenarioTitle: 't',
  zeroHour: '1917-04-09T05:30',
  endMinute: 0,
  geometry: { lines: [], sectors: [], features: [] },
  snapshots: [{ minute: 0, companies: [], barrages: [] }],
  events: [],
};

const serve = (body: string, status: number, contentType: string) => {
  const urls: string[] = [];
  const fetcher = async (url: string): Promise<Response> => {
    urls.push(url);
    return new Response(body, { status, headers: { 'content-type': contentType } });
  };
  return { fetcher, urls };
};

describe('fetchRun', () => {
  it('loads /runs/<name>.json and checks it is a run record', async () => {
    const { fetcher, urls } = serve(JSON.stringify(record), 200, 'application/json');
    expect((await fetchRun('sample', fetcher)).scenarioTitle).toBe('t');
    expect(urls).toEqual(['/runs/sample.json']);
  });

  it('says there is no such run when the dev server falls back to index.html', async () => {
    const { fetcher } = serve('<!doctype html><html></html>', 200, 'text/html');
    await expect(fetchRun('missing', fetcher)).rejects.toThrow(/^No run named “missing”/);
  });

  it('says there is no such run on a 404', async () => {
    const { fetcher } = serve('Not found', 404, 'text/plain');
    await expect(fetchRun('missing', fetcher)).rejects.toThrow(/^No run named “missing”/);
  });

  it('reports other HTTP failures with their status', async () => {
    const { fetcher } = serve('oops', 500, 'text/plain');
    await expect(fetchRun('sample', fetcher)).rejects.toThrow(/HTTP 500/);
  });

  it('rejects names that are not plain file names, without fetching', async () => {
    const { fetcher, urls } = serve('{}', 200, 'application/json');
    await expect(fetchRun('../etc/passwd', fetcher)).rejects.toThrow(/not a valid run name/);
    expect(urls).toEqual([]);
  });
});
