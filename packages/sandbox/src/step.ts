import type { SandboxMap, Side, Unit } from './types';
import type { Battle } from './state';
import { rngNext } from './rng';
import { terrainAt, inMap } from './map';

const other = (s: Side): Side => (s === 'attacker' ? 'defender' : 'attacker');
const alive = (u: Unit) => u.status !== 'surrendered' && u.status !== 'destroyed';
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** True when nothing higher than the sight line, and no wood or village, stands between two points (eyes 2 m up). */
export function losClear(m: SandboxMap, a: { x: number; y: number }, b: { x: number; y: number }): boolean {
  const d = dist(a, b); const n = Math.floor(d / 100);
  const ha = terrainAt(m, a.x, a.y).h + 2, hb = terrainAt(m, b.x, b.y).h + 2;
  for (let i = 1; i < n; i++) {
    const t = i / n; const c = terrainAt(m, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
    if (c.h > ha + (hb - ha) * t + 2) return false;   // 2 m slack: rolling ground does not hide a battalion
    if ((c.t === 'wood' || c.t === 'village') && i > 1 && i < n - 1) return false;
  }
  return true;
}

function segDist(px: number, py: number, pts: [number, number][]): number {
  let best = Infinity;
  for (let i = 0; i + 1 < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[i + 1]; const dx = x2 - x1, dy = y2 - y1; const L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy)));
  }
  if (pts.length === 1) best = Math.hypot(px - pts[0][0], py - pts[0][1]);
  return best;
}

/** Advances the battle one minute. Pure: returns a new Battle. */
export function step(b0: Battle): Battle {
  const s = b0.settings, m = b0.map, minute = b0.minute;
  let rng = b0.rngState;
  const rand = () => { const [v, n] = rngNext(rng); rng = n; return v; };
  const sround = (x: number) => { const f = Math.floor(x); return f + (rand() < x - f ? 1 : 0); };
  const units = b0.units.map(u => ({ ...u }));
  const lines = b0.lines.map(l => ({ ...l }));
  const events = b0.events.slice();
  const ev = (kind: string, u: Unit | undefined, why: string) => events.push({ minute, kind, unitId: u?.id, why });
  const hits = new Map<string, number>(); const sup = new Map<string, number>();
  const hit = (u: Unit, h: number, su: number) => { hits.set(u.id, (hits.get(u.id) ?? 0) + h); sup.set(u.id, (sup.get(u.id) ?? 0) + su); };
  const inTrench = (u: Unit) => lines.some(l => l.kind === 'trench' && l.side === u.side && segDist(u.x, u.y, l.points) < 50);
  const cover = (u: Unit) => { if (inTrench(u)) return 0.7; const t = terrainAt(m, u.x, u.y).t; return t === 'village' ? 0.5 : t === 'wood' ? 0.4 : 0; };

  // 1. Barrages: the attacker's creeping barrage and any called point barrages shell, shelter and cut wire.
  const shell = (u: Unit) => { hit(u, u.men * s.shellLethality * (1 - cover(u) * 0.8), 0.3); u.shelteredUntil = minute + 1; };
  let creepX = b0.creepX;
  if (creepX !== null) {
    const lo = Math.min(creepX, creepX + b0.dir * s.barrageDepthM), hi = Math.max(creepX, creepX + b0.dir * s.barrageDepthM);
    for (const u of units) if (u.side === 'defender' && alive(u) && u.kind === 'battalion' && u.x >= lo && u.x <= hi) shell(u);
    for (const l of lines) if (l.kind === 'wire' && l.points.some(([x]) => x >= lo && x <= hi)) l.cut = Math.min(1, (l.cut ?? 0) + 0.03);
    creepX += b0.dir * s.barrageSpeedMPerMin;
    if (b0.dir * (creepX - b0.creepStopX) > 0) creepX = null;
  }
  const pointBarrages = b0.pointBarrages.filter(p => p.until > minute);
  for (const p of pointBarrages) {
    for (const u of units) if (u.side !== p.side && alive(u) && dist(u, p) <= 150) shell(u);
    for (const l of lines) if (l.kind === 'wire' && segDist(p.x, p.y, l.points) <= 150) l.cut = Math.min(1, (l.cut ?? 0) + 0.05);
  }

  // 2. The gap: a garrison still sheltering or climbing out when attackers reach it is trapped.
  for (const d of units) {
    if (!alive(d) || d.kind !== 'battalion' || d.shelteredUntil === undefined || minute >= d.shelteredUntil + s.emergeMin) continue;
    const near = units.find(a => a.side === other(d.side) && a.kind === 'battalion' && alive(a) && a.status !== 'falling-back' && dist(a, d) <= 50);
    if (!near) continue;
    const taken = Math.min(d.men, Math.round(d.men * s.surrenderTrappedFrac));
    d.men -= taken; d.captured += taken; d.shelteredUntil = undefined;
    d.status = d.men > 0 ? 'falling-back' : 'surrendered';
    ev('trapped', d, `${taken} men trapped in their dugouts: the barrage lifted and the enemy reached the parapet first`);
  }
  const sheltering = (u: Unit) => u.shelteredUntil !== undefined && minute < u.shelteredUntil + s.emergeMin;

  // 3. Fire: each battalion fires at the nearest enemy it can see in range; batteries at observed enemies.
  for (const f of units) {
    if (!alive(f) || f.status === 'falling-back' || f.status === 'waiting' || sheltering(f) || f.men <= 0) continue;
    let best: Unit | undefined, bd = Infinity;
    const reach = f.kind === 'battery' ? 5000 : s.rangeM;
    for (const t of units) {
      if (t.side === f.side || !alive(t) || t.status === 'waiting') continue;
      const d = dist(f, t); if (d > reach || d >= bd) continue;
      const seen = f.kind === 'battery'
        ? units.some(o => o.side === f.side && o.kind === 'battalion' && alive(o) && dist(o, t) <= 2000 && losClear(m, o, t))
        : losClear(m, f, t);
      if (seen) { best = t; bd = d; }
    }
    if (!best) continue;
    if (f.kind === 'battery') hit(best, best.men * s.shellLethality * (1 - cover(best) * 0.5) * (f.men / 150), 0.2);
    else {
      const leth = f.status === 'holding' ? s.mgLethality : s.rifleLethality;
      const h = f.men * leth * (1 - f.suppression * 0.7) * (1 - cover(best));
      hit(best, h, (h / Math.max(1, best.men)) * 15);
    }
  }

  // 4. Losses, suppression and morale.
  for (const u of units) {
    const h = hits.get(u.id) ?? 0;
    const n = Math.min(u.men, sround(h));
    if (n > 0) { const k = Math.floor(n / 3); u.killed += k; u.wounded += n - k; }
    const before = u.men; u.men -= n;
    u.suppression = Math.min(1, u.suppression * 0.8 + (sup.get(u.id) ?? 0));
    if (n > 0 && before > 0) u.morale -= (n / before) * 4;
    u.morale -= u.suppression * 0.01;
    if (n === 0 && u.suppression < 0.1) u.morale += 0.004;
    u.morale = Math.max(0, Math.min(1, u.morale));
    if (!alive(u)) continue;
    if (u.kind === 'battalion' && u.men < 20 && u.men + u.killed + u.wounded + u.captured > 0) {
      u.wounded += u.men; u.men = 0; u.status = 'destroyed'; ev('destroyed', u, 'too few men left standing to fight'); continue;
    }
    if (u.kind !== 'battalion') continue;
    if ((u.status === 'holding' || u.status === 'advancing' || u.status === 'pinned') && u.morale < s.breakAt) {
      u.status = 'falling-back'; ev('falling-back', u, 'losses broke its nerve; it falls back');
    } else if (u.status === 'advancing' && u.morale < s.pinAt) {
      u.status = 'pinned'; u.pinnedAt = minute; ev('pinned', u, 'pinned down: heavy fire from enemies it could see');
    } else if (u.status === 'pinned' && u.morale > s.pinAt + 0.1 && u.suppression < 0.1 && minute - (u.pinnedAt ?? minute) >= 10) u.status = 'advancing';
    else if (u.status === 'falling-back' && u.morale > s.pinAt) u.status = 'holding';
  }

  // 5. Movement.
  for (const u of units) {
    if (!alive(u) || u.kind !== 'battalion') continue;
    let tx: number, ty: number, base: number;
    if (u.status === 'advancing' && u.target) { tx = u.target.x; ty = u.target.y; base = u.reserve ? s.reserveMarchMPerMin : s.advanceMPerMin; }
    else if (u.status === 'falling-back') { const back = u.side === 'attacker' ? -b0.dir : b0.dir; tx = u.x + back * 1000; ty = u.y; base = s.advanceMPerMin * 0.8; }
    else continue;
    const d = Math.hypot(tx - u.x, ty - u.y); if (d < 1) { if (u.status === 'advancing') u.status = 'holding'; continue; }
    const here = terrainAt(m, u.x, u.y);
    let speed = base * (here.t === 'wood' ? 0.6 : here.t === 'village' ? 0.8 : 1);
    for (const l of lines) if (l.kind === 'wire' && l.side !== u.side && segDist(u.x, u.y, l.points) < s.wireBeltM) speed *= s.wireSlow + (1 - s.wireSlow) * (l.cut ?? 0);
    let mv = Math.min(speed, d);
    let nx = u.x + ((tx - u.x) / d) * mv, ny = u.y + ((ty - u.y) / d) * mv;
    const ahead = terrainAt(m, nx, ny);
    if (ahead.h > here.h) { const f = Math.max(0.5, 1 - (ahead.h - here.h) / 20); nx = u.x + (nx - u.x) * f; ny = u.y + (ny - u.y) * f; }
    if (ahead.t === 'river' || !inMap(m, nx, ny)) continue;
    if (u.side === 'attacker' && creepX !== null && u.status === 'advancing' && b0.dir * (u.x - creepX) <= -50) {
      const lim = creepX - b0.dir * 50; if (b0.dir * (nx - lim) > 0) nx = lim;
    }
    u.x = nx; u.y = ny;
    if (u.status === 'advancing' && Math.hypot(tx - u.x, ty - u.y) < 1) { u.status = 'holding'; u.reserve = false; }
  }

  return { ...b0, units, lines, events, minute: minute + 1, rngState: rng, creepX, pointBarrages };
}
