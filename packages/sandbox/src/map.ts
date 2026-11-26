import type { Cell, SandboxMap, Terrain } from './types';
import ridge from './maps/ridge.json';
import open from './maps/open.json';
import river from './maps/river.json';
import woodedHill from './maps/wooded-hill.json';

const TERRAINS: Terrain[] = ['open', 'wood', 'village', 'river', 'road'];

/** Validates a map read from JSON; throws naming the first bad field. */
export function parseMap(json: unknown): SandboxMap {
  const m = json as SandboxMap;
  const bad = (f: string) => { throw new Error(`map ${m?.id ?? '?'}: bad ${f}`); };
  if (!m || typeof m !== 'object') bad('map');
  if (typeof m.id !== 'string' || !m.id) bad('id');
  if (typeof m.title !== 'string') bad('title');
  if (m.cellM !== 100) bad('cellM');
  if (!Number.isInteger(m.w) || m.w < 10) bad('w');
  if (!Number.isInteger(m.h) || m.h < 10) bad('h');
  if (!Array.isArray(m.cells) || m.cells.length !== m.w * m.h) bad('cells');
  for (const c of m.cells) if (!c || typeof c.h !== 'number' || !TERRAINS.includes(c.t)) bad('cells');
  if (m.attackerEdge !== 'west' && m.attackerEdge !== 'east') bad('attackerEdge');
  if (!Array.isArray(m.strongholds)) bad('strongholds');
  return m;
}

export const MAPS: SandboxMap[] = [ridge, open, river, woodedHill].map(parseMap);

export function mapById(id: string): SandboxMap | undefined { return MAPS.find(m => m.id === id); }

/** The cell under a point in metres (clamped to the map). */
export function terrainAt(m: SandboxMap, x: number, y: number): Cell {
  const cx = Math.min(m.w - 1, Math.max(0, Math.floor(x / m.cellM)));
  const cy = Math.min(m.h - 1, Math.max(0, Math.floor(y / m.cellM)));
  return m.cells[cy * m.w + cx];
}

export function inMap(m: SandboxMap, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < m.w * m.cellM && y < m.h * m.cellM;
}
