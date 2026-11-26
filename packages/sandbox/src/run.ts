import type { Outcome, Setup } from './types';
import { mapById } from './map';
import { newBattle, unit, type Battle } from './state';
import { step } from './step';
import { initDeadlock, checkDeadlock, gunLineX, type DeadlockState } from './deadlock';

/** Builds the battle at Zero from a setup. */
export function startBattle(setup: Setup, seed: number): Battle {
  const base = mapById(setup.mapId); if (!base) throw new Error(`unknown map ${setup.mapId}`);
  const cells = base.cells.slice(); for (const [i, c] of setup.mapEdits ?? []) if (i >= 0 && i < cells.length) cells[i] = c;
  const map = { ...base, cells, attackerEdge: setup.attackerEdge };
  const dir: 1 | -1 = setup.attackerEdge === 'west' ? 1 : -1;
  const W = map.w * map.cellM;
  const units = setup.units.map(u => unit({
    ...u, startedReserve: u.reserve,
    status: u.reserve ? 'waiting' : u.side === 'attacker' && u.kind === 'battalion' ? 'advancing' : 'holding',
    target: u.side === 'attacker' && u.kind === 'battalion' && !u.reserve ? { x: dir > 0 ? W - 200 : 200, y: u.y } : undefined,
  }));
  let b = newBattle(map, { units, lines: setup.lines.map(l => ({ ...l })), seed, settings: setup.settings, controller: setup.controller, dir });
  const front = units.filter(u => u.side === 'attacker' && u.kind === 'battalion' && !u.reserve);
  if (front.length && units.some(u => u.side === 'attacker' && u.kind === 'battery')) {
    const fx = dir > 0 ? Math.max(...front.map(u => u.x)) : Math.min(...front.map(u => u.x));
    const gx = gunLineX(b, map.h * map.cellM / 2);
    b = { ...b, creepX: fx + dir * 100, creepStopX: gx !== null ? gx + dir * 500 : fx + dir * 4000 };
  }
  return b;
}

export type Live = { battle: Battle; dl: DeadlockState; outcome: Outcome; lossTotal: number; lastLoss: number };
export const MAX_MIN = 2880;

/** The live state at Zero; its outcome is already "nothing-to-fight" when one side has nobody. */
export function startLive(setup: Setup, seed: number): Live {
  const battle = startBattle(setup, seed); const dl = initDeadlock(battle);
  const empty = !battle.units.some(u => u.side === 'attacker' && u.kind === 'battalion') || !battle.units.some(u => u.side === 'defender');
  return { battle, dl, outcome: { broken: false, margins: dl.best, ...(empty ? { ended: 'nothing-to-fight' as const } : {}) }, lossTotal: 0, lastLoss: 0 };
}

/** One minute: step, check the deadlock, and decide whether the battle has ended (broken, 120 quiet minutes, or the time limit). */
export function advance(l: Live, maxMin = l.battle.settings.battleMaxMin): Live {
  if (l.outcome.ended) return l;
  const battle = step(l.battle);
  const { outcome, state: dl } = checkDeadlock(battle, l.dl);
  const t = battle.units.reduce((n, u) => n + u.killed + u.wounded + u.captured, 0);
  const lastLoss = t !== l.lossTotal ? battle.minute : l.lastLoss;
  let ended = outcome.ended;
  if (!ended && battle.minute - lastLoss >= battle.settings.quietMin && battle.creepX === null && !battle.pending.length) ended = 'quiet';
  if (!ended && battle.minute >= maxMin) ended = 'time-up';
  return { battle, dl, outcome: ended ? { ...outcome, ended } : outcome, lossTotal: t, lastLoss };
}

/** Runs a setup to its end. */
export function runToEnd(setup: Setup, seed: number, maxMin?: number): { battle: Battle; outcome: Outcome } {
  let l = startLive(setup, seed);
  while (!l.outcome.ended) l = advance(l, maxMin);
  return { battle: l.battle, outcome: l.outcome };
}
