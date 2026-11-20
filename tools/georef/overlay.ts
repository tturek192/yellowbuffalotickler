/**
 * Visual check of digitized geometry: draw a GeoJSON FeatureCollection in magenta over the scanned
 * map it was traced from, using the GCP fit, and save the result as a PNG. Drawing happens on a
 * canvas in Playwright's Chromium (set PW_CHROMIUM_PATH to use a particular browser binary).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import type { AffineFit } from './fit';

type Pos = [number, number];
type Geometry =
  | { type: 'Point'; coordinates: Pos }
  | { type: 'MultiPoint'; coordinates: Pos[] }
  | { type: 'LineString'; coordinates: Pos[] }
  | { type: 'MultiLineString'; coordinates: Pos[][] }
  | { type: 'Polygon'; coordinates: Pos[][] }
  | { type: 'MultiPolygon'; coordinates: Pos[][][] };
export type OverlayFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{ type: 'Feature'; id?: string | number; properties?: Record<string, unknown> | null; geometry: Geometry | null }>;
};

/** One thing to draw, already in image pixels. */
type Shape = { kind: 'point' | 'line' | 'ring'; pts: Pos[]; label?: string };

const MIME: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

/** Chromium from @playwright/test, at PW_CHROMIUM_PATH when that is set. */
export function launchChromium(): Promise<Browser> {
  const executablePath = process.env.PW_CHROMIUM_PATH;
  return chromium.launch(executablePath ? { executablePath } : {});
}

function shapesOf(fit: Pick<AffineFit, 'toPx'>, fc: OverlayFeatureCollection): Shape[] {
  const shapes: Shape[] = [];
  for (const f of fc.features) {
    const g = f.geometry;
    if (!g) continue;
    const id = f.properties?.id ?? f.id;
    let label = id === undefined ? undefined : String(id); // on the feature's first part only
    const add = (kind: Shape['kind'], ps: Pos[]) => {
      shapes.push({ kind, pts: ps.map((p) => fit.toPx(p)), label });
      label = undefined;
    };
    switch (g.type) {
      case 'Point': add('point', [g.coordinates]); break;
      case 'MultiPoint': g.coordinates.forEach((p) => add('point', [p])); break;
      case 'LineString': add('line', g.coordinates); break;
      case 'MultiLineString': g.coordinates.forEach((l) => add('line', l)); break;
      case 'Polygon': g.coordinates.forEach((r) => add('ring', r)); break;
      case 'MultiPolygon': g.coordinates.forEach((poly) => poly.forEach((r) => add('ring', r))); break;
    }
  }
  return shapes;
}

/**
 * Draw `featureCollection` (WGS84 [lon, lat]) in magenta over the image at `imagePath`, placing each
 * vertex with `fit.toPx`, and write a PNG of the scan's own size to `outPng`.
 */
export async function renderOverlay(
  imagePath: string,
  fit: Pick<AffineFit, 'toPx'>,
  featureCollection: OverlayFeatureCollection,
  outPng: string,
): Promise<void> {
  const mime = MIME[extname(imagePath).toLowerCase()];
  if (!mime) throw new Error(`renderOverlay: ${imagePath}: expected a .png or .jpg scan`);
  const src = `data:${mime};base64,${readFileSync(imagePath).toString('base64')}`;
  const shapes = shapesOf(fit, featureCollection);
  const browser = await launchChromium();
  try {
    const page = await browser.newPage();
    const dataUrl = await page.evaluate(
      async ({ src, shapes }) => {
        const img = new Image();
        img.src = src;
        await img.decode();
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const lw = Math.max(2, Math.round(canvas.width / 600));
        ctx.strokeStyle = '#ff00ff';
        ctx.fillStyle = '#ff00ff';
        ctx.lineWidth = lw;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.font = `${6 * lw}px sans-serif`;
        for (const s of shapes) {
          ctx.beginPath();
          if (s.kind === 'point') {
            ctx.arc(s.pts[0]![0], s.pts[0]![1], 2 * lw, 0, Math.PI * 2);
            ctx.fill();
          } else {
            s.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
            if (s.kind === 'ring') ctx.closePath();
            ctx.stroke();
          }
          if (s.label) ctx.fillText(s.label, s.pts[0]![0] + 3 * lw, s.pts[0]![1] - 3 * lw);
        }
        return canvas.toDataURL('image/png');
      },
      { src, shapes },
    );
    writeFileSync(outPng, Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64'));
  } finally {
    await browser.close();
  }
}
