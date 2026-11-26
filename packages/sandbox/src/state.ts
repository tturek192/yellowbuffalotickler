import type { Controller, Line, Order, SandboxEvent, SandboxMap, Side, Unit } from './types';
import { SETTINGS, type Settings } from './settings';

export type PointBarrage = { side: Side; x: number; y: number; until: number };
export type Battle = {
  map: SandboxMap; settings: Settings;
  units: Unit[]; lines: Line[];
  minute: number; rngState: number;
  events: SandboxEvent[]; pending: Order[];
  controller: Controller;
  /** +1 when the attacker moves east, −1 west. */
  dir: 1 | -1;
  /** The attacker's creeping barrage: the rear edge of its band, or null when it has stopped. */
  creepX: number | null;
  creepStopX: number;
  pointBarrages: PointBarrage[];
  /** The minute each side's guns can take a new called barrage. */
  barrageReadyAt: Record<Side, number>;
};

export function unit(p: Partial<Unit> & Pick<Unit, 'id' | 'side' | 'x' | 'y'>): Unit {
  const men = p.men ?? (p.kind === 'battery' ? 150 : 800);
  return { kind: 'battalion', killed: 0, wounded: 0, captured: 0, morale: 1, suppression: 0, status: 'holding', reserve: false, ...p, men };
}
export const totalOf = (u: Unit) => u.men + u.killed + u.wounded + u.captured;

export function newBattle(map: SandboxMap, o: { units?: Unit[]; lines?: Line[]; seed?: number; settings?: Partial<Settings>; controller?: Controller; dir?: 1 | -1; creepX?: number | null; creepStopX?: number } = {}): Battle {
  return {
    map, settings: { ...SETTINGS, ...(o.settings ?? {}) },
    units: (o.units ?? []).slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    lines: o.lines ?? [], minute: 0, rngState: (o.seed ?? 1) >>> 0,
    events: [], pending: [], controller: o.controller ?? { attacker: 'human', defender: 'computer' },
    dir: o.dir ?? 1, creepX: o.creepX ?? null, creepStopX: o.creepStopX ?? 0, pointBarrages: [], barrageReadyAt: { attacker: 0, defender: 0 },
  };
}
