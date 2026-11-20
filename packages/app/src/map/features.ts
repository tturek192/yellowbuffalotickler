import type { Feature, FeatureKind } from '@wwi/scenario';
import type { Screen } from './declutter';
import { worldToScreen, type View } from './projection';
import { alongPath, crenellatedPath, LABEL_FONT, MAP_COLORS, sideColor, tracePath } from './style';

/** Drawing order, bottom first: ground cover, then communications, craters, trenches, then positions. */
const LAYER: Record<FeatureKind, number> = {
  wood: 0,
  village: 0,
  road: 1,
  railway: 1,
  crater: 2,
  subway: 3,
  tunnel: 3,
  'communication-trench': 4,
  wire: 5,
  trench: 6,
  strongpoint: 7,
  battery: 7,
};

/** Radius used when a point feature gives none, metres. */
const DEFAULT_RADIUS_M: Partial<Record<FeatureKind, number>> = { wood: 60, village: 50, crater: 10 };

type AreaStyle = { fill: string; hatch: string; edge: string; spacing: number; cross: boolean };
const AREA: Partial<Record<FeatureKind, AreaStyle>> = {
  wood: { fill: 'rgba(86, 100, 46, 0.10)', hatch: 'rgba(86, 100, 46, 0.42)', edge: 'rgba(86, 100, 46, 0.75)', spacing: 5, cross: false },
  village: { fill: 'rgba(59, 51, 38, 0.08)', hatch: 'rgba(59, 51, 38, 0.32)', edge: 'rgba(59, 51, 38, 0.8)', spacing: 6, cross: true },
};

function inkOf(f: Feature): string {
  if (f.kind === 'wood') return MAP_COLORS.wood;
  if (f.kind === 'village' || f.kind === 'road' || f.kind === 'railway' || f.kind === 'crater') return MAP_COLORS.sepia;
  return sideColor(f.side);
}

/** Fill a closed path, hatch inside it (diagonal, or crossed), then edge it. */
function hatchedArea(ctx: CanvasRenderingContext2D, path: () => void, box: [number, number, number, number], s: AreaStyle): void {
  const [minX, minY, maxX, maxY] = box;
  const span = maxY - minY;
  ctx.save();
  path();
  ctx.fillStyle = s.fill;
  ctx.fill();
  ctx.clip();
  ctx.strokeStyle = s.hatch;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let x = minX - span; x <= maxX; x += s.spacing) {
    ctx.moveTo(x, maxY);
    ctx.lineTo(x + span, minY);
    if (s.cross) {
      ctx.moveTo(x, minY);
      ctx.lineTo(x + span, maxY);
    }
  }
  ctx.stroke();
  ctx.restore();
  ctx.save();
  path();
  ctx.strokeStyle = s.edge;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

const boxOf = (pts: Screen[]): [number, number, number, number] => [
  Math.min(...pts.map((p) => p[0])),
  Math.min(...pts.map((p) => p[1])),
  Math.max(...pts.map((p) => p[0])),
  Math.max(...pts.map((p) => p[1])),
];

function drawPolygon(ctx: CanvasRenderingContext2D, f: Feature, pts: Screen[]): void {
  const path = (): void => {
    tracePath(ctx, pts);
    ctx.closePath();
  };
  const style = AREA[f.kind];
  if (style) return hatchedArea(ctx, path, boxOf(pts), style);
  // Any other kind drawn as an area (a crater field, a battery position): a light wash and an edge.
  ctx.save();
  path();
  ctx.globalAlpha = 0.1;
  ctx.fillStyle = inkOf(f);
  ctx.fill();
  ctx.globalAlpha = 0.8;
  ctx.strokeStyle = inkOf(f);
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

function drawPoint(ctx: CanvasRenderingContext2D, view: View, f: Feature, [x, y]: Screen, radiusM: number | undefined): void {
  const r = (radiusM ?? DEFAULT_RADIUS_M[f.kind] ?? 0) * view.scale;
  const style = AREA[f.kind];
  const ink = inkOf(f);
  ctx.save();
  if (style) {
    const rr = Math.max(r, 6);
    hatchedArea(ctx, () => {
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
    }, [x - rr, y - rr, x + rr, y + rr], style);
  } else if (f.kind === 'crater') {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(r, 2.5), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(122, 96, 52, 0.16)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(90, 70, 36, 0.8)';
    ctx.lineWidth = 1;
    ctx.stroke();
  } else if (f.kind === 'battery') {
    // A small gun-position triangle pointing north.
    ctx.beginPath();
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x + 4.5, y + 3.5);
    ctx.lineTo(x - 4.5, y + 3.5);
    ctx.closePath();
    ctx.fillStyle = ink;
    ctx.fill();
    ctx.strokeStyle = MAP_COLORS.paper;
    ctx.lineWidth = 0.75;
    ctx.stroke();
  } else if (f.kind === 'strongpoint') {
    ctx.strokeStyle = ink;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 4, y - 4, 8, 8);
    ctx.fillStyle = ink;
    ctx.fillRect(x - 1, y - 1, 2, 2);
  } else {
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fillStyle = ink;
    ctx.fill();
  }
  ctx.restore();
}

function drawLine(ctx: CanvasRenderingContext2D, f: Feature, pts: Screen[]): void {
  const ink = inkOf(f);
  ctx.save();
  ctx.strokeStyle = ink;
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'butt';
  switch (f.kind) {
    case 'trench':
      ctx.lineWidth = 1.3;
      tracePath(ctx, crenellatedPath(pts, 3.5, 2));
      ctx.stroke();
      break;
    case 'communication-trench':
      ctx.globalAlpha = 0.8;
      ctx.lineWidth = 0.8;
      tracePath(ctx, crenellatedPath(pts, 2.5, 1.2));
      ctx.stroke();
      break;
    case 'wire': {
      // A fine row of crosses.
      ctx.globalAlpha = 0.85;
      ctx.lineWidth = 0.75;
      const k = 1.8 / Math.SQRT2;
      ctx.beginPath();
      for (const { at: [x, y], dir: [ux, uy] } of alongPath(pts, 6)) {
        const [ax, ay] = [(ux - uy) * k, (uy + ux) * k];
        const [bx, by] = [(ux + uy) * k, (uy - ux) * k];
        ctx.moveTo(x - ax, y - ay);
        ctx.lineTo(x + ax, y + ay);
        ctx.moveTo(x - bx, y - by);
        ctx.lineTo(x + bx, y + by);
      }
      ctx.stroke();
      break;
    }
    case 'subway':
    case 'tunnel':
      // Underground: dashed and faint.
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 2.25;
      ctx.setLineDash(f.kind === 'subway' ? [7, 4] : [3, 3]);
      tracePath(ctx, pts);
      ctx.stroke();
      break;
    case 'road':
      // A cased road: two thin edges with paper between.
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 3.5;
      tracePath(ctx, pts);
      ctx.stroke();
      ctx.strokeStyle = MAP_COLORS.paper;
      ctx.lineWidth = 1.75;
      ctx.stroke();
      break;
    case 'railway':
      ctx.lineWidth = 1.2;
      tracePath(ctx, pts);
      ctx.stroke();
      ctx.beginPath();
      for (const { at: [x, y], dir: [ux, uy] } of alongPath(pts, 8)) {
        ctx.moveTo(x - uy * 3, y + ux * 3);
        ctx.lineTo(x + uy * 3, y - ux * 3);
      }
      ctx.stroke();
      break;
    case 'crater':
      // A line of crater lips: small circles along it.
      ctx.lineWidth = 1;
      for (const { at: [x, y] } of alongPath(pts, 7)) {
        ctx.beginPath();
        ctx.arc(x, y, 2.5, 0, Math.PI * 2);
        ctx.stroke();
      }
      break;
    default:
      ctx.lineWidth = 1;
      tracePath(ctx, pts);
      ctx.stroke();
  }
  ctx.restore();
}

/** Name woods and villages at their centre, as the period sheets do. */
function labelArea(ctx: CanvasRenderingContext2D, f: Feature, pts: Screen[]): void {
  if (!f.name) return;
  const x = pts.reduce((a, p) => a + p[0], 0) / pts.length;
  const y = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  ctx.save();
  ctx.font = `italic 12px ${LABEL_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = MAP_COLORS.paper;
  ctx.lineWidth = 3;
  ctx.strokeText(f.name, x, y);
  ctx.fillStyle = inkOf(f);
  ctx.fillText(f.name, x, y);
  ctx.restore();
}

/** Draw the scenario's map features, ground cover first, positions last, then name woods and villages. */
export function drawFeatures(ctx: CanvasRenderingContext2D, view: View, features: readonly Feature[]): void {
  const ordered = [...features].sort((a, b) => LAYER[a.kind] - LAYER[b.kind]);
  for (const f of ordered) {
    const g = f.geometry;
    if (g.type === 'Point') drawPoint(ctx, view, f, worldToScreen(view, g.coordinates), g.radiusM);
    else if (g.type === 'Polygon') drawPolygon(ctx, f, g.coordinates.map((p) => worldToScreen(view, p)));
    else drawLine(ctx, f, g.coordinates.map((p) => worldToScreen(view, p)));
  }
  for (const f of features) {
    if (f.kind !== 'wood' && f.kind !== 'village') continue;
    const g = f.geometry;
    labelArea(ctx, f, g.type === 'Point' ? [worldToScreen(view, g.coordinates)] : g.coordinates.map((p) => worldToScreen(view, p)));
  }
}
