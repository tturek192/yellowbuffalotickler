import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';
import { chromium } from '@playwright/test';
import { fitAffine } from './fit';
import { launchChromium, renderOverlay } from './overlay';

/** A solid white RGB PNG of the given size. */
function whitePng(w: number, h: number): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const rows = Buffer.alloc((w * 3 + 1) * h, 255);
  for (let y = 0; y < h; y++) rows[y * (w * 3 + 1)] = 0; // filter: none
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Read the RGBA of some pixels of a PNG file, through the browser's own decoder. */
async function pixels(file: string, at: Array<[number, number]>): Promise<{ w: number; h: number; rgba: number[][] }> {
  const browser = await launchChromium();
  try {
    const page = await browser.newPage();
    return await page.evaluate(
      async ({ src, at }) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        return { w: c.width, h: c.height, rgba: at.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data]) };
      },
      { src: `data:image/png;base64,${readFileSync(file).toString('base64')}`, at },
    );
  } finally {
    await browser.close();
  }
}

const chromiumPath = process.env.PW_CHROMIUM_PATH ?? chromium.executablePath();

describe.skipIf(!existsSync(chromiumPath))('renderOverlay', () => {
  it('draws digitized GeoJSON in magenta over the scan, at the fitted pixels, keeping the scan size', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wwi-georef-'));
    const scan = join(dir, 'scan.png');
    writeFileSync(scan, whitePng(80, 60));
    const truth = (px: [number, number]): [number, number] => [2.7 + px[0] * 1e-5, 50.4 - px[1] * 1e-5];
    const fit = fitAffine([[0, 0], [80, 0], [0, 60], [80, 60]].map((p) => ({ px: p as [number, number], lonLat: truth(p as [number, number]) })));
    const out = join(dir, 'overlay.png');
    await renderOverlay(scan, fit, {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', properties: { id: 'row-30' }, geometry: { type: 'LineString', coordinates: [truth([5, 30]), truth([75, 30])] } },
        { type: 'Feature', properties: { id: 'pt' }, geometry: { type: 'Point', coordinates: truth([60, 10]) } },
      ],
    }, out);
    const { w, h, rgba } = await pixels(out, [[40, 30], [60, 10], [40, 50]]);
    expect([w, h]).toEqual([80, 60]);
    const [onLine, onPoint, clear] = rgba as [number[], number[], number[]];
    for (const p of [onLine, onPoint]) {
      expect(p[0]).toBeGreaterThan(200); // magenta: red and blue high, green low
      expect(p[1]).toBeLessThan(80);
      expect(p[2]).toBeGreaterThan(200);
    }
    expect(clear.slice(0, 3)).toEqual([255, 255, 255]); // the scan shows through elsewhere
  });
});
