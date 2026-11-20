import type { Frame } from './frame';
import { projectLonLat } from './frame';
import { FEATURE_KINDS, type Feature, type Line } from './schema';
import type { Point, Sourced } from './sourced';

/** Minimal local GeoJSON typing (no dependency). */
export interface GeoJsonFeature {
  type: 'Feature';
  properties?: Record<string, unknown> | null;
  geometry: { type: string; coordinates: unknown } | null;
}
export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJsonFeature[];
}

const fmt = (n: number) => n.toFixed(1);
const isPos = (x: unknown): x is [number, number] =>
  Array.isArray(x) && x.length >= 2 && typeof x[0] === 'number' && typeof x[1] === 'number';

export function geoToScenarioParts(
  fc: GeoJsonFeatureCollection,
  frame: Frame,
  file: string,
): { lines: Line[]; features: Feature[]; problems: string[] } {
  const lines: Line[] = [];
  const features: Feature[] = [];
  const problems: string[] = [];
  const { minX, maxX, minY, maxY } = frame.extent;

  (Array.isArray(fc?.features) ? fc.features : []).forEach((gf, n) => {
    const props = (gf?.properties ?? {}) as Record<string, unknown>;
    const id = typeof props.id === 'string' && props.id ? props.id : undefined;
    const where = id ? `${file}#${id}` : `${file}#features[${n}]`;
    if (!id) return void problems.push(`${where}: properties.id is required`);
    const kind = props.kind;
    const isLine = kind === 'front-line' || kind === 'objective-line';
    if (!isLine && !(FEATURE_KINDS as readonly unknown[]).includes(kind)) {
      return void problems.push(`${where}: unknown kind ${JSON.stringify(kind)}`);
    }
    const side = props.side;
    if (side !== undefined && side !== 'allied' && side !== 'central') {
      return void problems.push(`${where}: side must be "allied" or "central"`);
    }
    const g = gf.geometry;
    const gtype = g?.type;
    if (gtype !== 'Point' && gtype !== 'LineString' && gtype !== 'Polygon') {
      return void problems.push(`${where}: unsupported geometry ${JSON.stringify(gtype)} (use Point, LineString or Polygon)`);
    }
    if (isLine && gtype !== 'LineString') return void problems.push(`${where}: ${String(kind)} must be a LineString`);
    const raw: unknown[] = gtype === 'Point' ? [g!.coordinates] : gtype === 'LineString' ? (g!.coordinates as unknown[]) : ((g!.coordinates as unknown[])?.[0] as unknown[]);
    if (!Array.isArray(raw) || !raw.length || !raw.every(isPos)) {
      return void problems.push(`${where}: malformed ${gtype} coordinates`);
    }
    const pts: Point[] = raw.map((p) => projectLonLat(frame, p as [number, number]));
    const bad = pts.findIndex(([x, y]) => x < minX || x > maxX || y < minY || y > maxY);
    if (bad >= 0) {
      return void problems.push(
        `${where}: point ${bad} at (${fmt(pts[bad]![0])}, ${fmt(pts[bad]![1])}) is outside the scenario extent — are lon/lat swapped?`,
      );
    }

    if (isLine) {
      const mono = pts.findIndex((p, i) => i > 0 && p[1] <= pts[i - 1]![1]);
      if (mono >= 0) {
        return void problems.push(
          `${where}: y must strictly increase along the line; vertex ${mono} (y=${fmt(pts[mono]![1])}) ≤ vertex ${mono - 1} (y=${fmt(pts[mono - 1]![1])}) — simplify or reorder the trace`,
        );
      }
      lines.push({
        id,
        name: typeof props.name === 'string' ? props.name : id,
        kind: kind === 'front-line' ? 'trench' : 'objective',
        ...(side ? { side } : {}),
        ...(typeof props.color === 'string' ? { color: props.color } : {}),
        points: pts,
      });
      return;
    }

    const method = typeof props.method === 'string' && props.method ? props.method : 'digitized from source map';
    let cite: Sourced<string>;
    if (typeof props.source === 'string' && props.source) {
      cite = { value: method, source: props.source, ...(typeof props.page === 'string' ? { page: props.page } : {}) };
    } else if (typeof props.estimate === 'string' && props.estimate) {
      cite = { value: method, estimate: props.estimate };
    } else {
      return void problems.push(`${where}: needs properties.source (+page) or properties.estimate`);
    }
    const geometry: Feature['geometry'] =
      gtype === 'Point'
        ? { type: 'Point', coordinates: pts[0]!, ...(typeof props.radiusM === 'number' ? { radiusM: props.radiusM } : {}) }
        : { type: gtype, coordinates: pts };
    features.push({
      id,
      kind: kind as Feature['kind'],
      ...(side ? { side } : {}),
      ...(typeof props.name === 'string' ? { name: props.name } : {}),
      geometry,
      cite,
    });
  });
  return { lines, features, problems };
}
