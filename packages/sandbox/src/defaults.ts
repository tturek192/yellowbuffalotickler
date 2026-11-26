import type { Line, Setup, Unit } from './types';
import { mapById } from './map';
import { RULES_VERSION } from './settings';

type U = Setup['units'][number];
/** Where each map's defender front trench runs (m from the west edge). */
/** How well the preliminary bombardment cut the front wire, by map (the ridge got Vimy's long bombardment). */
const WIRE_CUT: Record<string, number> = { ridge: 0.85, open: 0.6, river: 0.6, 'wooded-hill': 0.6 };
const FRONT: Record<string, number> = { ridge: 5000, open: 4500, river: 5200, 'wooded-hill': 5000 };

/** A ready-to-play setup: a defended trench system and an attacking corps with guns and reserves. */
export function defaultSetup(mapId: string): Setup {
  const m = mapById(mapId); if (!m) throw new Error(`unknown map ${mapId}`);
  const H = m.h * m.cellM, fx = FRONT[mapId] ?? 4500, ax = fx - (mapId === 'river' ? 1200 : 600);
  const ys = (n: number) => Array.from({ length: n }, (_, i) => Math.round(((i + 0.5) / n) * H));
  const units: U[] = [];
  const add = (id: string, side: Unit['side'], kind: Unit['kind'], x: number, y: number, reserve = false) =>
    units.push({ id, side, kind, x, y, men: kind === 'battery' ? 150 : 800, reserve });
  ys(8).forEach((y, i) => add(`a${i + 1}`, 'attacker', 'battalion', ax, y));
  ys(4).forEach((y, i) => add(`ar${i + 1}`, 'attacker', 'battalion', ax - 1500, y, true));
  ys(4).forEach((y, i) => add(`ag${i + 1}`, 'attacker', 'battery', ax - 2500, y));
  ys(6).forEach((y, i) => add(`d${i + 1}`, 'defender', 'battalion', fx, y));
  ys(2).forEach((y, i) => add(`ds${i + 1}`, 'defender', 'battalion', fx + 600, y));
  ys(4).forEach((y, i) => add(`dr${i + 1}`, 'defender', 'battalion', Math.min(fx + 4000, m.w * m.cellM - 300), y, true));
  ys(3).forEach((y, i) => add(`dg${i + 1}`, 'defender', 'battery', fx + 2500, y));
  const vline = (x: number): [number, number][] => [[x, 0], [x, H]];
  const lines: Line[] = [
    { kind: 'trench', side: 'defender', points: vline(fx) },
    { kind: 'trench', side: 'defender', points: vline(fx + 600) },
    { kind: 'wire', side: 'defender', points: vline(fx - 100), cut: WIRE_CUT[mapId] ?? 0.6 },
    ...(mapId === 'open' ? [{ kind: 'wire' as const, side: 'defender' as const, points: vline(fx + 500), cut: 0.2 }] : []),
    { kind: 'trench', side: 'attacker', points: vline(ax) },
  ];
  return { rulesVersion: RULES_VERSION, mapId, attackerEdge: 'west', units, lines, controller: { attacker: 'human', defender: 'computer' }, seed: 1 };
}
