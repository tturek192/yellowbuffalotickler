import type { Cell, Line, SandboxMap, Setup, Terrain } from './types';
import { RULES_VERSION, SETTINGS } from './settings';
import { terrainAt, inMap, mapById } from './map';

// A compact JSON form (positions in metres, rounded; short keys) as base64url: no compression needed under 2,000 characters.
const T: Terrain[] = ['open', 'wood', 'village', 'river', 'road'];
type Packed = { v: number; m: string; e: Array<[number, number, number]>; a: 0 | 1; u: Array<[string, 0 | 1, 0 | 1, number, number, number, 0 | 1]>; l: Array<[0 | 1, 0 | 1, number, number[]]>; c: [0 | 1, 0 | 1]; s: Record<string, number>; d: number };

const b64 = (s: string) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

export function encodeSetup(s: Setup): string {
  const p: Packed = {
    v: s.rulesVersion, m: s.mapId, a: s.attackerEdge === 'west' ? 0 : 1, d: s.seed,
    e: (s.mapEdits ?? []).map(([i, c]) => [i, c.h, T.indexOf(c.t)]),
    u: s.units.map(u => [u.id, u.side === 'attacker' ? 0 : 1, u.kind === 'battalion' ? 0 : 1, Math.round(u.x), Math.round(u.y), u.men, u.reserve ? 1 : 0]),
    l: s.lines.map(l => [l.kind === 'trench' ? 0 : 1, l.side === 'attacker' ? 0 : 1, Math.round((l.cut ?? -1) * 100), l.points.flatMap(([x, y]) => [Math.round(x), Math.round(y)])]),
    c: [s.controller.attacker === 'human' ? 0 : 1, s.controller.defender === 'human' ? 0 : 1],
    s: (s.settings ?? {}) as Record<string, number>,
  };
  return b64(JSON.stringify(p));
}

export function decodeSetup(str: string): { setup?: Setup; notice?: string } {
  let p: Packed;
  try {
    p = JSON.parse(unb64(str));
    const num = (x: unknown) => typeof x === 'number' && Number.isFinite(x);
    if (typeof p !== 'object' || !p || !mapById(p.m) || !Array.isArray(p.u) || !num(p.v) || !num(p.d)) throw 0;
    if (!p.u.every(u => Array.isArray(u) && typeof u[0] === 'string' && num(u[3]) && num(u[4]) && num(u[5]))) throw 0;
    if (!(p.l ?? []).every(l => Array.isArray(l) && Array.isArray(l[3]) && l[3].every(num))) throw 0;
    if (!(p.e ?? []).every(e => Array.isArray(e) && num(e[0]) && num(e[1]))) throw 0;
  }
  catch { return { notice: 'This link is damaged.' }; }
  const settings = Object.fromEntries(Object.entries(p.s ?? {}).filter(([k, v]) => k in SETTINGS && typeof v === 'number'));
  const setup: Setup = {
    rulesVersion: p.v, mapId: p.m, attackerEdge: p.a ? 'east' : 'west', seed: p.d,
    ...(p.e?.length ? { mapEdits: p.e.map(([i, h, t]) => [i, { h, t: T[t] ?? 'open' }] as [number, Cell]) } : {}),
    units: p.u.map(([id, sd, k, x, y, men, r]) => ({ id, side: sd ? 'defender' : 'attacker', kind: k ? 'battery' : 'battalion', x, y, men, reserve: !!r })),
    lines: (p.l ?? []).map(([k, sd, cut, pts]) => {
      const l: Line = { kind: k ? 'wire' : 'trench', side: sd ? 'defender' : 'attacker', points: [] };
      for (let i = 0; i + 1 < pts.length; i += 2) l.points.push([pts[i], pts[i + 1]]);
      if (cut >= 0) l.cut = cut / 100;
      return l;
    }),
    controller: { attacker: p.c?.[0] ? 'computer' : 'human', defender: p.c?.[1] ? 'computer' : 'human' },
    ...(Object.keys(settings).length ? { settings } : {}),
  };
  return setup.rulesVersion < RULES_VERSION ? { setup, notice: 'Made with older rules: it may play out differently.' } : { setup };
}

/** Problems that stop a battle starting, in plain words. */
export function validateSetup(s: Setup, m: SandboxMap): string[] {
  const out: string[] = [];
  for (const u of s.units) {
    if (!inMap(m, u.x, u.y)) out.push(`${u.id} is off the map`);
    else if (terrainAt(m, u.x, u.y).t === 'river') out.push(`${u.id} is standing in the river`);
  }
  for (const side of ['attacker', 'defender'] as const) if (s.units.filter(u => u.side === side).length > (s.settings?.maxUnitsPerSide ?? SETTINGS.maxUnitsPerSide)) out.push(`too many ${side} units`);
  return out;
}
