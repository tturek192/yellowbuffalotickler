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

/** Runs a setup to its end: the deadlock broken, 120 quiet minutes, or maxMin. */
export function runToEnd(setup: Setup, seed: number, maxMin = 2880): { battle: Battle; outcome: Outcome } {
  let b = startBattle(setup, seed);
  if (!b.units.some(u => u.side === 'attacker' && u.kind === 'battalion') || !b.units.some(u => u.side === 'defender')) {
    return { battle: b, outcome: { broken: false, margins: initDeadlock(b).best, ended: 'nothing-to-fight' } };
  }
  let dl: DeadlockState = initDeadlock(b), outcome: Outcome = { broken: false, margins: dl.best };
  let lastLoss = 0, lossTotal = 0;
  while (b.minute < maxMin) {
    b = step(b);
    ({ outcome, state: dl } = checkDeadlock(b, dl));
    if (outcome.broken) return { battle: b, outcome };
    const t = b.units.reduce((n, u) => n + u.killed + u.wounded + u.captured, 0);
    if (t !== lossTotal) { lossTotal = t; lastLoss = b.minute; }
    if (b.minute - lastLoss >= 120 && b.creepX === null && !b.pending.length) return { battle: b, outcome: { ...outcome, ended: 'quiet' } };
  }
  return { battle: b, outcome: { ...outcome, ended: 'time-up' } };
}
