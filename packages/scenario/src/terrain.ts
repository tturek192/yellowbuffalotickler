import { z } from 'zod';
import { CiteSchema } from './sourced';

/**
 * An elevation grid in the scenario's local metres. Value k lies at
 * (originX + (k mod cols)·cellM, originY + ⌊k / cols⌋·cellM): row-major from the origin, +x then +y.
 * `elevDm` is base64 of little-endian Int16 elevations in decimetres.
 */
export type TerrainGridData = {
  cellM: number;
  originX: number;
  originY: number;
  cols: number;
  rows: number;
  elevDm: string;
};

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_INDEX = new Map([...B64].map((c, i) => [c, i]));
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;

function toBase64(bytes: Uint8Array): string {
  const out: string[] = [];
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const left = bytes.length - i;
    out.push(B64[(n >> 18) & 63]!, B64[(n >> 12) & 63]!, left > 1 ? B64[(n >> 6) & 63]! : '=', left > 2 ? B64[n & 63]! : '=');
  }
  return out.join('');
}

/** Decode base64, or undefined if the text is not base64. */
function fromBase64(text: string): Uint8Array | undefined {
  if (text.length % 4 !== 0 || !B64_RE.test(text)) return undefined;
  const pad = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((text.length / 4) * 3 - pad);
  let o = 0;
  for (let i = 0; i < text.length; i += 4) {
    const n =
      (B64_INDEX.get(text[i]!)! << 18) |
      (B64_INDEX.get(text[i + 1]!)! << 12) |
      ((B64_INDEX.get(text[i + 2]!) ?? 0) << 6) |
      (B64_INDEX.get(text[i + 3]!) ?? 0);
    for (const b of [(n >> 16) & 255, (n >> 8) & 255, n & 255]) if (o < bytes.length) bytes[o++] = b;
  }
  return bytes;
}

/** Number of Int16 cells the base64 text holds, or undefined if it is not base64 of whole cells. */
function cellCount(elevDm: string): number | undefined {
  if (elevDm.length % 4 !== 0 || !B64_RE.test(elevDm)) return undefined;
  const bytes = (elevDm.length / 4) * 3 - (elevDm.endsWith('==') ? 2 : elevDm.endsWith('=') ? 1 : 0);
  return bytes % 2 === 0 ? bytes / 2 : undefined;
}

const TerrainGridObject = z.object({
  /** Where the elevations come from. */
  source: CiteSchema,
  /** How they were sampled, for the record. */
  method: z.string().min(1),
  cellM: z.number().positive(),
  originX: z.number(),
  originY: z.number(),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
  elevDm: z.string(),
});

export const TerrainGridSchema = TerrainGridObject.superRefine((g, ctx) => {
  const n = cellCount(g.elevDm);
  if (n === undefined) {
    ctx.addIssue({ code: 'custom', path: ['elevDm'], message: 'elevDm must be base64 of little-endian Int16 values' });
  } else if (n !== g.cols * g.rows) {
    ctx.addIssue({ code: 'custom', path: ['elevDm'], message: `cols × rows = ${g.cols} × ${g.rows} = ${g.cols * g.rows} cells but elevDm holds ${n}` });
  }
});
export type TerrainGrid = z.infer<typeof TerrainGridObject>;

/** Why `data` is not a usable terrain grid (the first problem, with its field), or undefined if it is one. */
export function terrainGridProblem(data: unknown): string | undefined {
  const r = TerrainGridSchema.safeParse(data);
  if (r.success) return undefined;
  const i = r.error.issues[0]!;
  return `${i.path.join('.') || '(grid)'}: ${i.message}`;
}

/** Pack elevations in metres (row-major, +x then +y) into a grid; values are stored to the decimetre. */
export function encodeTerrain(g: Omit<TerrainGridData, 'elevDm'> & { elevM: ArrayLike<number> }): TerrainGridData {
  const n = g.cols * g.rows;
  if (g.elevM.length !== n) throw new Error(`encodeTerrain: ${g.cols} × ${g.rows} grid needs ${n} cells, got ${g.elevM.length}`);
  const bytes = new Uint8Array(n * 2);
  const dv = new DataView(bytes.buffer);
  for (let k = 0; k < n; k++) {
    const dm = Math.round(g.elevM[k]! * 10);
    if (!Number.isFinite(dm) || dm < -32768 || dm > 32767) {
      throw new Error(`encodeTerrain: elevation ${g.elevM[k]} m at cell ${k} cannot be stored as Int16 decimetres`);
    }
    dv.setInt16(k * 2, dm, true);
  }
  return { cellM: g.cellM, originX: g.originX, originY: g.originY, cols: g.cols, rows: g.rows, elevDm: toBase64(bytes) };
}

export type Terrain = {
  /** Elevation in metres at a local point: bilinear between grid values, clamped to the grid's edge. */
  at(x: number, y: number): number;
  min: number;
  max: number;
  cellM: number;
  originX: number;
  originY: number;
  cols: number;
  rows: number;
  /** Elevations in metres, row-major as in the grid. */
  elevM: Float32Array;
};

export function decodeTerrain(g: TerrainGridData): Terrain {
  const bytes = fromBase64(g.elevDm);
  const n = g.cols * g.rows;
  if (!bytes || bytes.length !== n * 2) throw new Error(`decodeTerrain: elevDm does not hold ${g.cols} × ${g.rows} Int16 cells`);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const elevM = new Float32Array(n);
  let min = Infinity;
  let max = -Infinity;
  for (let k = 0; k < n; k++) {
    const m = dv.getInt16(k * 2, true) / 10;
    elevM[k] = m;
    if (m < min) min = m;
    if (m > max) max = m;
  }
  const { cellM, originX, originY, cols, rows } = g;
  const at = (x: number, y: number): number => {
    const fx = Math.min(Math.max((x - originX) / cellM, 0), cols - 1);
    const fy = Math.min(Math.max((y - originY) / cellM, 0), rows - 1);
    const i = Math.min(Math.floor(fx), Math.max(cols - 2, 0));
    const j = Math.min(Math.floor(fy), Math.max(rows - 2, 0));
    const i1 = Math.min(i + 1, cols - 1);
    const j1 = Math.min(j + 1, rows - 1);
    const tx = fx - i;
    const ty = fy - j;
    const z00 = elevM[j * cols + i]!;
    const z10 = elevM[j * cols + i1]!;
    const z01 = elevM[j1 * cols + i]!;
    const z11 = elevM[j1 * cols + i1]!;
    return (z00 * (1 - tx) + z10 * tx) * (1 - ty) + (z01 * (1 - tx) + z11 * tx) * ty;
  };
  return { at, min, max, cellM, originX, originY, cols, rows, elevM };
}
