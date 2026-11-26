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

export type Side = 'attacker' | 'defender';
export type Status = 'waiting' | 'advancing' | 'holding' | 'pinned' | 'falling-back' | 'surrendered' | 'destroyed';
export type Unit = {
  id: string; side: Side; kind: 'battalion' | 'battery';
  x: number; y: number; men: number;
  killed: number; wounded: number; captured: number;
  /** 0..1 */ morale: number;
  /** 0..1 */ suppression: number;
  status: Status;
  reserve: boolean;
  target?: { x: number; y: number };
  /** While minute < this, the unit is under a barrage (sheltering); it emerges emergeMin later. */
  shelteredUntil?: number;
  /** The minute the unit went to ground; it gets up after at least 10 quiet minutes. */
  pinnedAt?: number;
};
export type Line = { kind: 'trench' | 'wire'; side: Side; points: [number, number][]; cut?: number };
export type SandboxEvent = { minute: number; kind: string; unitId?: string; why: string };
export type OrderKind = 'send-reserve' | 'barrage' | 'hold' | 'pull-back';
export type Order = { side: Side; kind: OrderKind; unitId?: string; at?: { x: number; y: number }; issuedAt: number; dueAt: number };
export type Controller = Record<Side, 'human' | 'computer'>;
