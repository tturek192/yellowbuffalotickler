import type { Order, Side, Unit } from './types';
import type { Battle } from './state';
import { losClear } from './sight';

type NewOrder = Omit<Order, 'issuedAt' | 'dueAt'>;
const alive = (u: Unit) => u.status !== 'surrendered' && u.status !== 'destroyed';
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Queues an order; it reaches its unit orderDelayMin minutes later. */
export function issue(b: Battle, o: NewOrder): Battle {
  return { ...b, pending: [...b.pending, { ...o, issuedAt: b.minute, dueAt: b.minute + b.settings.orderDelayMin }] };
}

/** Carries out every order whose time has come. */
export function applyDue(b: Battle): Battle {
  const due = b.pending.filter(o => o.dueAt <= b.minute);
  if (!due.length) return b;
  const units = b.units.map(u => ({ ...u }));
  const pointBarrages = b.pointBarrages.slice();
  const events = b.events.slice();
  for (const o of due) {
    const u = o.unitId ? units.find(x => x.id === o.unitId && alive(x)) : undefined;
    if (o.kind === 'barrage' && o.at) { pointBarrages.push({ side: o.side, x: o.at.x, y: o.at.y, until: b.minute + 10 }); events.push({ minute: b.minute, kind: 'barrage', why: 'the guns open on the spot they were given' }); continue; }
    if (!u) continue;
    if (o.kind === 'send-reserve' && o.at) { u.status = 'advancing'; u.target = { ...o.at }; events.push({ minute: b.minute, kind: 'reserve-sent', unitId: u.id, why: 'the reserve got its order and moves up' }); }
    else if (o.kind === 'hold') { u.status = 'holding'; u.target = undefined; }
    else if (o.kind === 'pull-back') { const back = u.side === 'attacker' ? -b.dir : b.dir; u.status = 'advancing'; u.reserve = false; u.target = { x: u.x + back * 500, y: u.y }; }
  }
  return { ...b, units, pointBarrages, events, pending: b.pending.filter(o => o.dueAt > b.minute) };
}

/** What the computer orders for a side. It knows only what its own battalions can see (picture-only). */
export function aiDecide(b: Battle, side: Side): NewOrder[] {
  const own = b.units.filter(u => u.side === side && alive(u));
  const eyes = own.filter(u => u.kind === 'battalion' && u.status !== 'waiting');
  const seen = b.units.filter(e => e.side !== side && alive(e) && e.status !== 'waiting' && eyes.some(o => dist(o, e) <= 2000 && losClear(b.map, o, e)));
  const pendingIds = new Set(b.pending.filter(o => o.side === side).map(o => o.unitId));
  const reserves = own.filter(u => u.reserve && u.status === 'waiting' && !pendingIds.has(u.id));
  const out: NewOrder[] = [];
  const nearestReserve = (p: { x: number; y: number }) => reserves.filter(r => !out.some(o => o.unitId === r.id)).sort((a, c) => dist(a, p) - dist(c, p) || (a.id < c.id ? -1 : 1))[0];
  if (side === 'defender') {
    // Counter-attack the deepest attacker it can see that is past its front line.
    const front = own.filter(u => u.kind === 'battalion' && !u.reserve);
    const frontX = front.length ? (b.dir > 0 ? Math.min(...front.map(u => u.x)) : Math.max(...front.map(u => u.x))) : Infinity;
    const through = seen.filter(e => b.dir * (e.x - frontX) > 0).sort((a, c) => b.dir * (c.x - a.x) || (a.id < c.id ? -1 : 1));
    if (through[0]) { const r = nearestReserve(through[0]); if (r) out.push({ side, kind: 'send-reserve', unitId: r.id, at: { x: through[0].x, y: through[0].y } }); }
  } else {
    // Help a stalled (pinned) battalion: a reserve to its spot and, once per half hour, a barrage on the enemy it can see.
    const stalled = own.filter(u => u.status === 'pinned').sort((a, c) => (a.id < c.id ? -1 : 1));
    for (const p of stalled) {
      const r = nearestReserve(p); if (r) out.push({ side, kind: 'send-reserve', unitId: r.id, at: { x: p.x, y: p.y } });
      const foe = seen.filter(e => dist(e, p) <= 1500).sort((a, c) => dist(a, p) - dist(c, p))[0];
      if (foe && b.minute % 30 === 0 && !b.pending.some(o => o.side === side && o.kind === 'barrage')) out.push({ side, kind: 'barrage', at: { x: foe.x, y: foe.y } });
      if (r || foe) break;
    }
  }
  return out;
}
