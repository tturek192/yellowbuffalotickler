// Deadlock 1916 Sandbox: shared types.

export type Terrain = 'open' | 'wood' | 'village' | 'river' | 'road';
/** One 100 m map cell: its height in metres and its ground. */
export type Cell = { h: number; t: Terrain };
export type Edge = 'west' | 'east';

export type SandboxMap = {
  id: string;
  title: string;
  /** Metres per cell side (always 100). */
  cellM: number;
  w: number;
  h: number;
  /** Row-major, w × h. */
  cells: Cell[];
  attackerEdge: Edge;
  strongholds: Array<{ id: string; name: string; x: number; y: number }>;
};
