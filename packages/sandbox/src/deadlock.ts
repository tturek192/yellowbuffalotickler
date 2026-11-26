import type { Outcome, Unit } from './types';
import type { Battle } from './state';

const alive = (u: Unit) => u.status !== 'surrendered' && u.status !== 'destroyed';
const SECTORS = 4;
export type DeadlockState = { zeroDefMen: number; holdSince: number | null; longestHold: number; sealed: boolean[]; best: Outcome['margins']; done?: Outcome };

export function initDeadlock(b: Battle): DeadlockState {
  const zero = b.units.filter(u => u.side === 'defender').reduce((n, u) => n + u.men + u.killed + u.wounded + u.captured, 0);
  return { zeroDefMen: zero, holdSince: null, longestHold: 0, sealed: Array(SECTORS).fill(false), best: { beyondGunLineM: -Infinity, capturedFrac: 0, fitFrac: 1, longestHoldMin: 0 } };
}

/** The defender's gun line at a given y: straight through its batteries (sorted by y), extended flat to the map edges. */
export function gunLineX(b: Battle, y: number): number | null {
  const g = b.units.filter(u => u.side === 'defender' && u.kind === 'battery' && alive(u)).sort((a, c) => a.y - c.y || (a.id < c.id ? -1 : 1));
  if (!g.length) return null;
  if (y <= g[0].y) return g[0].x;
  for (let i = 0; i + 1 < g.length; i++) if (y <= g[i + 1].y) { const t = (y - g[i].y) / Math.max(1, g[i + 1].y - g[i].y); return g[i].x + (g[i + 1].x - g[i].x) * t; }
  return g[g.length - 1].x;
}

/** Checks the four conditions after a step; returns the outcome and the carried state. Once broken it stays broken. */
export function checkDeadlock(b: Battle, s: DeadlockState): { outcome: Outcome; state: DeadlockState } {
  if (s.done) return { outcome: s.done, state: s };
  const set = b.settings, m = b.map, H = m.h * m.cellM;
  const sector = (y: number) => Math.min(SECTORS - 1, Math.max(0, Math.floor((y / H) * SECTORS)));
  const sealed = s.sealed.slice();
  const def = b.units.filter(u => u.side === 'defender');
  for (const r of def) if (r.startedReserve && alive(r) && r.status !== 'waiting' && r.kind === 'battalion') {
    const gx = gunLineX(b, r.y); if (gx !== null && b.dir * (r.x - gx) <= set.sealDistanceM) sealed[sector(r.y)] = true;
  }
  let beyond = -Infinity, broke: Outcome['by'];
  for (const a of b.units) if (a.side === 'attacker' && a.kind === 'battalion' && alive(a)) {
    const gx = gunLineX(b, a.y); if (gx === null) continue;
    const d = b.dir * (a.x - gx); beyond = Math.max(beyond, d);
    if (d > 0 && !sealed[sector(a.y)]) broke ??= 'breakthrough';
  }
  const captured = def.reduce((n, u) => n + u.captured, 0);
  const fit = def.filter(u => alive(u) && u.status !== 'pinned' && u.status !== 'falling-back').reduce((n, u) => n + u.men, 0);
  const capturedFrac = s.zeroDefMen ? captured / s.zeroDefMen : 0, fitFrac = s.zeroDefMen ? fit / s.zeroDefMen : 1;
  if (!broke && s.zeroDefMen && capturedFrac >= 0.5) broke = 'surrender';
  if (!broke && s.zeroDefMen && fitFrac < 0.1) broke = 'collapse';
  const held = m.strongholds.length > 0 && m.strongholds.every(h =>
    b.units.some(u => u.side === 'attacker' && u.kind === 'battalion' && alive(u) && Math.hypot(u.x - h.x, u.y - h.y) <= 300) &&
    !def.some(u => u.kind === 'battalion' && alive(u) && u.status !== 'falling-back' && Math.hypot(u.x - h.x, u.y - h.y) <= 300));
  const holdSince = held ? (s.holdSince ?? b.minute) : null;
  const holdLen = holdSince === null ? 0 : b.minute - holdSince + 1;
  if (!broke && held && holdLen >= set.strongholdHoldMin) broke = 'stronghold';
  const best = { beyondGunLineM: Math.max(s.best.beyondGunLineM, beyond), capturedFrac: Math.max(s.best.capturedFrac, capturedFrac), fitFrac: Math.min(s.best.fitFrac, fitFrac), longestHoldMin: Math.max(s.best.longestHoldMin, holdLen) };
  const outcome: Outcome = broke ? { broken: true, by: broke, minute: b.minute, margins: best, ended: 'deadlock-broken' } : { broken: false, margins: best };
  return { outcome, state: { ...s, sealed, holdSince, longestHold: best.longestHoldMin, best, done: broke ? outcome : undefined } };
}
