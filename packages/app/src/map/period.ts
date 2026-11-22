import type { CompanyStatus, RunRecord, Side } from '@wwi/engine';
import { frameAt, surrounding } from '../playback';
import type { Screen } from './declutter';
import { frontAt } from './front';
import { overlaps, placeClear, type Box } from './labels';
import { recordBounds, worldToScreen, type Bounds, type Point, type View } from './projection';
import { MAP_COLORS } from './style';
import { unit as hash01 } from './effects';

/*
 * The period map style (Task 20, the owner's choice): a Clegg-style sheet with each side's held ground washed in a pastel
 * (tan for the attacker, green for the defender) up to the moving front, battalion blocks in their division's patch colour,
 * a compass rose, and small ink vignettes, each standing on something real in the run or the scenario: a tank where the
 * record puts one, a gun at each battery's place, a balloon at each `balloon` feature, an aircraft while a contact-patrol
 * message is in flight. All artwork is drawn here as canvas paths. The pure parts (what to draw, in world metres) come
 * first; the drawing, with every look in PERIOD_STYLE, after.
 */

export const PERIOD_FONT = {
  fell: '"IM Fell English", "EB Garamond", Georgia, serif',
  fellSc: '"IM Fell English SC", "IM Fell English", "EB Garamond", Georgia, serif',
} as const;

/** How the period style looks. */
export const PERIOD_STYLE = {
  paper: '#efe2bf',
  paperDeep: '#e9d6a6',
  ink: '#2a2118',
  vignetteInk: '#3b2f22',
  vignetteFill: '#d6c497',
  red: '#8e2418',
  blue: '#2c5fa8',
  /** Held ground: a pastel wash multiplied into the paper. */
  fill: { allied: '#e8b98a', central: '#9fc08a', alpha: 0.42 },
  /** German blocks are edged in this red. */
  germanEdge: '#c0392b',
  /** Paper grain: a tile of this many px, multiplied in at this opacity. */
  texture: { size: 192, alpha: 0.16 },
  /** Vignette width (px) and the distance (px) within which like vignettes are drawn as one. */
  vignette: { w: 34, merge: 30, labelPx: 12 },
} as const;

/* ------------------------------------------------------------------ what to draw (pure) */

const boundsCache = new WeakMap<RunRecord, Bounds>();
const boundsOf = (r: RunRecord): Bounds => {
  let b = boundsCache.get(r);
  if (!b) boundsCache.set(r, (b = recordBounds(r)));
  return b;
};

/** Ground a side holds: a polygon from its front back to the sheet's edge behind it (west for allied, east for central). */
export type TerritoryFill = { side: Side; polygon: Point[] };

/**
 * Each side's held ground at a minute: behind each piece of its front (front.ts `frontAt`, which moves as segments change
 * hands and companies advance), out to the map's edge on its own side. No man's land, between the two fronts, is left bare.
 */
export function territoryFills(r: RunRecord, minute: number): TerritoryFill[] {
  const front = frontAt(r, minute);
  const b = boundsOf(r);
  const half = 50; // half a front bin (FRONT_BIN_M), so a one-bin piece still has area
  const out: TerritoryFill[] = [];
  for (const side of ['allied', 'central'] as const) {
    const edge = side === 'allied' ? Math.min(b.minX, ...front.allied.flat().map((p) => p[0])) : Math.max(b.maxX, ...front.central.flat().map((p) => p[0]));
    for (const line of front[side]) {
      if (line.length === 0) continue;
      const first = line[0]!;
      const last = line[line.length - 1]!;
      out.push({ side, polygon: [[edge, first[1] - half], [first[0], first[1] - half], ...line, [last[0], last[1] + half], [edge, last[1] + half]] });
    }
  }
  return out;
}

/** The area (m²) of a side's held ground at a minute. */
export function fillArea(r: RunRecord, minute: number, side: Side): number {
  let a = 0;
  for (const f of territoryFills(r, minute)) {
    if (f.side !== side) continue;
    const p = f.polygon;
    let s = 0;
    for (let i = 0; i < p.length; i++) {
      const [x0, y0] = p[i]!;
      const [x1, y1] = p[(i + 1) % p.length]!;
      s += x0 * y1 - x1 * y0;
    }
    a += Math.abs(s) / 2;
  }
  return a;
}

export type Vignette = {
  kind: 'tank' | 'gun' | 'balloon' | 'aircraft';
  x: number;
  y: number;
  side?: Side;
  label: string;
  /** A tank stuck in the mud. */
  bogged?: boolean;
};

/** Readable names for the weapon ids the scenarios use (plural: a vignette stands for a battery position). */
const WEAPON_NAMES: Record<string, string> = {
  '13pdr': '13-pounders',
  '18pdr': '18-pounders',
  '4.5in-how': '4.5-inch howitzers',
  '60pdr': '60-pounders',
  '6in-gun': '6-inch guns',
  '6in-how': '6-inch howitzers',
  '8in-how': '8-inch howitzers',
  '9.2in-how': '9.2-inch howitzers',
  '12in-how': '12-inch howitzers',
  '15in-how': '15-inch howitzers',
  '77mm-fk': 'German field guns',
  '105mm-lfh': 'German light howitzers',
  '150mm-sfh': 'German heavy howitzers',
};
const weaponName = (id: string): string => WEAPON_NAMES[id] ?? id;

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Tanks at a minute: the snapshot rows either side, moved between them; bogged from the snapshot at or before. */
function tanksAt(r: RunRecord, minute: number): Vignette[] {
  const [a, b] = surrounding(r, minute);
  if (!a.tanks) return [];
  const col = (t: NonNullable<typeof a.tanks>, name: string): number => t.columns.indexOf(name as never);
  const [ia, xa, ya, sa] = ['id', 'x', 'y', 'status'].map((c) => col(a.tanks!, c));
  const next = new Map<string, [number, number]>();
  if (b !== a && b.tanks) {
    const [ib, xb, yb] = ['id', 'x', 'y'].map((c) => col(b.tanks!, c));
    for (const row of b.tanks.rows) next.set(row[ib!] as string, [row[xb!] as number, row[yb!] as number]);
  }
  const t = b === a ? 0 : (minute - a.minute) / (b.minute - a.minute);
  return a.tanks.rows.map((row): Vignette => {
    const x0 = row[xa!] as number;
    const y0 = row[ya!] as number;
    const n = next.get(row[ia!] as string);
    const bogged = row[sa!] === 'bogged';
    return { kind: 'tank', side: 'allied', x: n && !bogged ? lerp(x0, n[0], t) : x0, y: n && !bogged ? lerp(y0, n[1], t) : y0, label: bogged ? 'tank, bogged' : 'tank', bogged };
  });
}

/** One gun per battery position (several entries at one place are one drawing), named by its most numerous weapon. */
function gunsOf(r: RunRecord): Vignette[] {
  const byPlace = new Map<string, NonNullable<RunRecord['geometry']['batteries']>>();
  for (const b of r.geometry.batteries ?? []) {
    const k = `${b.side}|${b.at[0]}|${b.at[1]}`;
    const list = byPlace.get(k);
    if (list) list.push(b);
    else byPlace.set(k, [b]);
  }
  return [...byPlace.values()].map((list) => {
    const main = [...list].sort((p, q) => q.count - p.count || p.id.localeCompare(q.id))[0]!;
    return { kind: 'gun', side: main.side, x: main.at[0], y: main.at[1], label: weaponName(main.weapon) };
  });
}

const unitsCache = new WeakMap<RunRecord, Map<string, RunRecord['units'][number]>>();
const unitsById = (r: RunRecord): Map<string, RunRecord['units'][number]> => {
  let m = unitsCache.get(r);
  if (!m) unitsCache.set(r, (m = new Map(r.units.map((u) => [u.id, u]))));
  return m;
};

/** An aircraft over each formation with a contact-patrol message in flight, at its companies' middle on the map. */
function aircraftAt(r: RunRecord, minute: number): Vignette[] {
  const flying = (r.contactPatrols ?? []).filter((p) => p.sentMin <= minute && minute < p.dueMin);
  if (flying.length === 0) return [];
  const units = unitsById(r);
  const companies = frameAt(r, minute).companies;
  const out: Vignette[] = [];
  for (const fromId of [...new Set(flying.map((p) => p.fromId))].sort()) {
    const side = flying.find((p) => p.fromId === fromId)!.side;
    const under = companies.filter((c) => {
      if (c.side !== side || c.status === 'off-map') return false;
      const u = units.get(c.id);
      return c.battalionId === fromId || (u?.formationPath ?? []).includes(fromId);
    });
    if (under.length === 0) continue; // nothing on the map to fly over: no aircraft
    const x = under.reduce((a, c) => a + c.x, 0) / under.length;
    const y = under.reduce((a, c) => a + c.y, 0) / under.length;
    out.push({ kind: 'aircraft', side, x, y, label: 'contact patrol' });
  }
  return out;
}

/** Every vignette at a minute, each anchored to a thing in the record; none without one. */
export function vignettes(r: RunRecord, minute: number): Vignette[] {
  const balloons = r.geometry.features
    .filter((f) => (f.kind as string) === 'balloon')
    .map((f): Vignette => {
      const p = f.geometry.type === 'Point' ? f.geometry.coordinates : f.geometry.coordinates[0]!;
      return { kind: 'balloon', ...(f.side ? { side: f.side } : {}), x: p[0], y: p[1], label: f.name ?? 'observation balloon' };
    });
  return [...gunsOf(r), ...balloons, ...tanksAt(r, minute), ...aircraftAt(r, minute)];
}

/** A battalion block's colour: its division's patch, else its side's colour (German blocks are dark). */
export function blockColour(u: { side: Side; insignia?: string }): string {
  return u.insignia ?? (u.side === 'central' ? MAP_COLORS.german : MAP_COLORS.allied);
}

/** An open block (outline only) is waiting or in reserve; a filled one is in action. A German garrison holding its trench is in action. */
export function blockOpen(status: CompanyStatus, side: Side): boolean {
  return status === 'waiting' || status === 'marching' || (status === 'holding' && side === 'allied');
}

/** A period block's paint: its colour, open or filled, and its edge (German blocks edged in red, a little heavier). */
export function blockPaint(side: Side, status: CompanyStatus, insignia?: string): { fill: string; open: boolean; edge: string; edgeWidth: number } {
  return {
    fill: blockColour({ side, ...(insignia ? { insignia } : {}) }),
    open: blockOpen(status, side),
    edge: side === 'central' ? PERIOD_STYLE.germanEdge : PERIOD_STYLE.ink,
    edgeWidth: side === 'central' ? 2 : 1,
  };
}

/* ------------------------------------------------------------------ drawing */

/** Wash each side's held ground into the paper. */
export function drawTerritory(ctx: CanvasRenderingContext2D, view: View, fills: readonly TerritoryFill[]): void {
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = PERIOD_STYLE.fill.alpha;
  for (const f of fills) {
    ctx.fillStyle = PERIOD_STYLE.fill[f.side];
    ctx.beginPath();
    f.polygon.forEach((p, i) => {
      const [x, y] = worldToScreen(view, p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

type Texture = { size: number; alpha: Uint8ClampedArray };
let texture: Texture | null = null;

/** The paper grain: a tile of fixed noise (two octaves of hashed value noise), made once and kept. */
export function paperTexture(): Texture {
  if (texture) return texture;
  const n = PERIOD_STYLE.texture.size;
  const alpha = new Uint8ClampedArray(n * n);
  const cell = (cx: number, cy: number, k: number): number => hash01(((cx % k) + k) % k, ((cy % k) + k) % k + 977 * k);
  const smooth = (x: number, y: number, k: number): number => {
    const s = n / k;
    const gx = x / s;
    const gy = y / s;
    const x0 = Math.floor(gx);
    const y0 = Math.floor(gy);
    const fx = gx - x0;
    const fy = gy - y0;
    const top = lerp(cell(x0, y0, k), cell(x0 + 1, y0, k), fx);
    const bottom = lerp(cell(x0, y0 + 1, k), cell(x0 + 1, y0 + 1, k), fx);
    return lerp(top, bottom, fy);
  };
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const v = 0.45 * smooth(x, y, 12) + 0.35 * smooth(x, y, 48) + 0.2 * hash01(x, y + 7919);
      alpha[y * n + x] = Math.round(255 * Math.min(1, Math.max(0, (v - 0.25) * 1.6)));
    }
  return (texture = { size: n, alpha });
}

let grainImage: OffscreenCanvas | HTMLCanvasElement | null | undefined;
const patterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern | null>();

/** The grain as an image, made once (null where there is no canvas to make it on). */
function grain(): OffscreenCanvas | HTMLCanvasElement | null {
  if (grainImage !== undefined) return grainImage;
  const t = paperTexture();
  try {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(t.size, t.size) : typeof document !== 'undefined' ? document.createElement('canvas') : null;
    if (!c) return (grainImage = null);
    c.width = t.size;
    c.height = t.size;
    const g = c.getContext('2d') as CanvasRenderingContext2D | null;
    if (!g || typeof ImageData === 'undefined') return (grainImage = null);
    const img = new ImageData(t.size, t.size);
    for (let i = 0; i < t.alpha.length; i++) {
      img.data[4 * i] = 140;
      img.data[4 * i + 1] = 107;
      img.data[4 * i + 2] = 64;
      img.data[4 * i + 3] = t.alpha[i]!;
    }
    g.putImageData(img, 0, 0);
    return (grainImage = c);
  } catch {
    return (grainImage = null);
  }
}

/** Multiply the cached paper grain over the sheet. */
export function drawPaperGrain(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  let p = patterns.get(ctx);
  if (p === undefined) {
    const img = grain();
    p = img ? ctx.createPattern(img as CanvasImageSource, 'repeat') : null;
    patterns.set(ctx, p);
  }
  if (!p) return;
  ctx.save();
  ctx.globalCompositeOperation = 'multiply';
  ctx.globalAlpha = PERIOD_STYLE.texture.alpha;
  ctx.fillStyle = p;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

/** The compass rose (in place of the north arrow): a ring, eight points, north half red, the diagonals blue, and N. */
export function drawCompassRose(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
  const S = PERIOD_STYLE;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = 'rgba(239, 226, 191, 0.9)';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = S.ink;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([1.5, 2.5]);
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.86, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  const point = (angle: number, len: number, wide: number, left: string, right: string): void => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const tip: Screen = [c * len, s * len];
    for (const [sign, fill] of [[1, left], [-1, right]] as const) {
      ctx.beginPath();
      ctx.moveTo(tip[0], tip[1]);
      ctx.lineTo(-s * wide * sign, c * wide * sign);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = S.ink;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }
  };
  for (const a of [-3, -1, 1, 3]) point((a * Math.PI) / 4, r * 0.55, r * 0.06, S.blue, S.blue);
  point(Math.PI / 2, r * 0.9, r * 0.11, S.ink, S.paper);
  point(0, r * 0.9, r * 0.11, S.paper, S.ink);
  point(Math.PI, r * 0.9, r * 0.11, S.ink, S.paper);
  point(-Math.PI / 2, r * 0.9, r * 0.11, S.ink, S.red);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.08, 0, Math.PI * 2);
  ctx.fillStyle = S.paper;
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = S.red;
  ctx.font = `${Math.round(r * 0.32)}px ${PERIOD_FONT.fellSc}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('N', 0, -r * 0.9);
  ctx.restore();
}

/* --- vignettes: small ink drawings, original paths, about PERIOD_STYLE.vignette.w px wide, centred on (0, 0) --- */

function inkStyle(ctx: CanvasRenderingContext2D, width = 1.3): void {
  ctx.strokeStyle = PERIOD_STYLE.vignetteInk;
  ctx.fillStyle = PERIOD_STYLE.vignetteFill;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}

/** A rhomboid tank in profile: the track's lozenge, a sponson, and the bogies; a bogged one tilts nose-down in mud. */
function tankPath(ctx: CanvasRenderingContext2D, w: number, bogged: boolean): void {
  const h = w * 0.42;
  ctx.save();
  if (bogged) ctx.rotate(0.2);
  inkStyle(ctx);
  ctx.beginPath();
  ctx.moveTo(-w * 0.5, h * 0.15);
  ctx.lineTo(-w * 0.3, -h * 0.5);
  ctx.lineTo(w * 0.32, -h * 0.5);
  ctx.quadraticCurveTo(w * 0.5, -h * 0.45, w * 0.5, h * 0.05);
  ctx.lineTo(w * 0.36, h * 0.5);
  ctx.lineTo(-w * 0.36, h * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.rect(-w * 0.1, -h * 0.12, w * 0.24, h * 0.32);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 0.8;
  for (let k = -2; k <= 2; k++) {
    ctx.beginPath();
    ctx.arc(k * w * 0.13, h * 0.36, w * 0.035, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  if (bogged) {
    ctx.save();
    inkStyle(ctx, 1);
    ctx.beginPath();
    for (let k = -3; k <= 3; k++) {
      ctx.moveTo(k * w * 0.13 - w * 0.05, h * 0.78);
      ctx.quadraticCurveTo(k * w * 0.13, h * 0.62, k * w * 0.13 + w * 0.05, h * 0.78);
    }
    ctx.stroke();
    ctx.restore();
  }
}

/** A field gun: a spoked wheel, the shield, the barrel raised to the east and the trail to the ground behind. */
function gunPath(ctx: CanvasRenderingContext2D, w: number, facing: 1 | -1): void {
  ctx.save();
  ctx.scale(facing, 1);
  inkStyle(ctx);
  const r = w * 0.2;
  ctx.beginPath();
  ctx.moveTo(-r * 0.3, 0);
  ctx.lineTo(-w * 0.5, w * 0.26);
  ctx.stroke();
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(0, -r * 0.5);
  ctx.lineTo(w * 0.5, -w * 0.28);
  ctx.stroke();
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.rect(-r * 0.2, -r * 1.25, r * 0.9, r * 0.75);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, r * 0.4, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  for (let k = 0; k < 6; k++) {
    const a = (k * Math.PI) / 6;
    ctx.moveTo(Math.cos(a) * r, r * 0.4 + Math.sin(a) * r);
    ctx.lineTo(-Math.cos(a) * r, r * 0.4 - Math.sin(a) * r);
  }
  ctx.stroke();
  ctx.restore();
}

/** A kite balloon: a long envelope with three lobed fins at the tail and a tether down to the winch. */
function balloonPath(ctx: CanvasRenderingContext2D, w: number): void {
  inkStyle(ctx, 1.2);
  const h = w * 0.34;
  ctx.beginPath();
  ctx.ellipse(0, -h * 0.4, w * 0.4, h * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 0.7;
  for (const dx of [-0.18, 0, 0.18]) {
    ctx.beginPath();
    ctx.moveTo(w * dx, -h * 0.88);
    ctx.lineTo(w * dx, h * 0.08);
    ctx.stroke();
  }
  ctx.lineWidth = 1.1;
  for (const dy of [-0.85, 0.05]) {
    ctx.beginPath();
    ctx.ellipse(-w * 0.42, h * dy * 0.6 - h * 0.4, w * 0.07, h * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(0, h * 0.1);
  ctx.lineTo(w * 0.04, h * 1.1);
  ctx.stroke();
}

/** A biplane seen from the side, flying east: fuselage, two wings with struts, tail and propeller disc. */
function aircraftPath(ctx: CanvasRenderingContext2D, w: number): void {
  inkStyle(ctx, 1.2);
  const h = w * 0.36;
  ctx.beginPath();
  ctx.moveTo(-w * 0.48, -h * 0.12);
  ctx.lineTo(w * 0.36, h * 0.04);
  ctx.quadraticCurveTo(w * 0.44, h * 0.04, w * 0.45, -h * 0.06);
  ctx.stroke();
  ctx.beginPath();
  ctx.rect(-w * 0.2, -h * 0.5, w * 0.42, h * 0.09);
  ctx.rect(-w * 0.22, h * 0.18, w * 0.44, h * 0.09);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-w * 0.1, -h * 0.41);
  ctx.lineTo(-w * 0.12, h * 0.18);
  ctx.moveTo(w * 0.14, -h * 0.41);
  ctx.lineTo(w * 0.12, h * 0.18);
  ctx.moveTo(-w * 0.48, -h * 0.12);
  ctx.lineTo(-w * 0.5, -h * 0.4);
  ctx.lineTo(-w * 0.38, -h * 0.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(w * 0.47, -h * 0.06, w * 0.015, h * 0.32, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-w * 0.02, h * 0.5, w * 0.04, 0, Math.PI * 2);
  ctx.stroke();
}

/** Like vignettes close together on the sheet (a troop of tanks at corps zoom) are drawn as one, named with their number. */
export type PlacedVignette = { kind: Vignette['kind']; at: Screen; label: string; bogged: boolean; side?: Side };

export function placeVignettes(view: View, vs: readonly Vignette[]): PlacedVignette[] {
  const groups: Array<{ v: Vignette[]; at: Screen }> = [];
  for (const v of vs) {
    const at = worldToScreen(view, [v.x, v.y]);
    const g = groups.find((x) => x.v[0]!.kind === v.kind && x.v[0]!.side === v.side && Math.hypot(x.at[0] - at[0], x.at[1] - at[1]) < PERIOD_STYLE.vignette.merge);
    if (g) {
      g.v.push(v);
      const n = g.v.length;
      g.at = [(g.at[0] * (n - 1) + at[0]) / n, (g.at[1] * (n - 1) + at[1]) / n];
    } else groups.push({ v: [v], at });
  }
  return groups.map(({ v, at }) => {
    const first = v[0]!;
    const bogged = v.filter((x) => x.bogged).length;
    let label = first.label;
    if (v.length > 1 && first.kind === 'tank') label = `${v.length} tanks${bogged ? `, ${bogged} bogged` : ''}`;
    else if (v.length > 1 && first.kind === 'gun') label = [...new Set(v.map((x) => x.label))].join(', ');
    return { kind: first.kind, at, label, bogged: first.kind === 'tank' ? bogged === v.length : false, ...(first.side ? { side: first.side } : {}) };
  });
}

/** The room a vignette's drawing takes. */
export const vignetteBox = (p: PlacedVignette): Box => {
  const w = PERIOD_STYLE.vignette.w;
  const lift = p.kind === 'aircraft' ? w * 0.9 : 0;
  return { x0: p.at[0] - w / 2, x1: p.at[0] + w / 2, y0: p.at[1] - w * 0.35 - lift, y1: p.at[1] + w * 0.35 - lift };
};

/** Draw the vignettes (under the unit markers). An aircraft flies a little above the ground it reports on. */
export function drawVignettes(ctx: CanvasRenderingContext2D, placed: readonly PlacedVignette[]): void {
  const w = PERIOD_STYLE.vignette.w;
  for (const p of placed) {
    const b = vignetteBox(p);
    ctx.save();
    ctx.translate((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    if (p.kind === 'tank') tankPath(ctx, w, p.bogged);
    else if (p.kind === 'gun') gunPath(ctx, w * 0.85, p.side === 'central' ? -1 : 1);
    else if (p.kind === 'balloon') balloonPath(ctx, w);
    else aircraftPath(ctx, w);
    ctx.restore();
  }
}

/** Letter each vignette's name in italics under it, where it fits clear of what is already placed; else leave it off. */
export function labelVignettes(ctx: CanvasRenderingContext2D, placed: readonly PlacedVignette[], boxes: Box[], sheetW: number): void {
  const size = PERIOD_STYLE.vignette.labelPx;
  ctx.save();
  ctx.font = `italic ${size}px ${PERIOD_FONT.fell}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  for (const p of placed) {
    const b = vignetteBox(p);
    const width = ctx.measureText(p.label).width;
    const cx = (b.x0 + b.x1) / 2;
    const want: Box = { x0: cx - width / 2 - 1, x1: cx + width / 2 + 1, y0: b.y1 + 1, y1: b.y1 + size + 3 };
    const box = placeClear(want, boxes, size + 2, 2, 8, 8, 12, sheetW - 12, 12);
    if (boxes.some((x) => overlaps(box, x))) continue;
    boxes.push(box);
    ctx.strokeStyle = 'rgba(239, 226, 191, 0.9)';
    ctx.lineWidth = 3;
    ctx.strokeText(p.label, box.x0 + 1, box.y1 - 3);
    ctx.fillStyle = PERIOD_STYLE.vignetteInk;
    ctx.fillText(p.label, box.x0 + 1, box.y1 - 3);
  }
  ctx.restore();
}
