import { v } from '@wwi/scenario';
import type { Doctrine, Scenario } from '@wwi/scenario';
import { lineXAt } from './geometry';
import type { SimEvent } from './types';

export type CompanyState = {
  id: string;
  name: string;
  side: 'allied' | 'central';
  doctrineId: string;
  battalionId: string;
  sectorId: string;
  /** May be absent for holding (garrison/reserve) companies, which ignore it. */
  objectiveLineId: string | undefined;
  x: number;
  y: number;
  strength: number;
  /** `holding`: a garrison or reserve company, which stays where it starts for the whole run. */
  status: 'waiting' | 'advancing' | 'consolidating' | 'holding';
  startMin: number;
  speedMPerMin: number;
};

type Formation = NonNullable<Scenario['forces'][number]['formations']>[number];

/** Garrison and reserve companies hold; only the others attack. */
export const isHolding = (c: Pick<CompanyState, 'status'>): boolean => c.status === 'holding';

export function initCompanies(
  s: Scenario,
  doctrines: Record<string, Doctrine>,
  rng: () => number,
): CompanyState[] {
  const out: CompanyState[] = [];
  const visit = (f: Formation, side: 'allied' | 'central', doctrineId: string) => {
    const d = doctrines[doctrineId];
    for (const c of f.companies ?? []) {
      if (!d) throw new Error(`Unknown doctrine "${doctrineId}"`);
      if (!Array.isArray(c.start)) throw new Error(`Company ${c.id}: start was not projected to a local point`);
      const holding = c.role === 'garrison' || c.role === 'reserve';
      // Holding companies draw nothing from the rng, so adding them leaves the attackers' timing unchanged.
      const startMin = holding ? 0 : (c.startAfterMin ? v(c.startAfterMin) : 0) + rng() * v(d.startJitterMin);
      const speedMPerMin = holding ? 0 : v(d.maxAdvanceMPerMin) * (1 + (rng() * 2 - 1) * v(d.speedJitterFrac));
      out.push({
        id: c.id,
        name: c.name,
        side,
        doctrineId,
        battalionId: f.id,
        sectorId: c.sectorId ?? '',
        objectiveLineId: c.objectiveLineId,
        x: c.start[0],
        y: c.start[1],
        strength: v(c.strength),
        status: holding ? 'holding' : 'waiting',
        startMin,
        speedMPerMin,
      });
    }
    for (const child of f.children ?? []) visit(child, side, doctrineId);
  };
  for (const force of s.forces) for (const f of force.formations) visit(f, force.side, force.doctrine);
  return out;
}

export function moveCompanies(
  cs: CompanyState[],
  barrageX: (sectorId: string, y: number) => number,
  lines: Scenario['lines'],
  doctrines: Record<string, Doctrine>,
  minute: number,
  stepMin: number,
): { companies: CompanyState[]; events: SimEvent[] } {
  const events: SimEvent[] = [];
  const companies = cs.map((c) => {
    if (c.status === 'consolidating' || isHolding(c) || minute < c.startMin) return c;
    const line = lines.find((l) => l.id === c.objectiveLineId);
    const d = doctrines[c.doctrineId];
    if (!line || !d) throw new Error(`Company ${c.id}: unknown line or doctrine`);
    const objX = lineXAt(line.points, c.y);
    const target = Math.min(objX, barrageX(c.sectorId, c.y) - v(d.followDistanceM));
    const x = Math.max(c.x, Math.min(target, c.x + c.speedMPerMin * stepMin));
    if (objX - x <= 1) {
      events.push({
        minute,
        kind: 'company-reached',
        sectorId: c.sectorId,
        lineId: line.id,
        unitId: c.id,
        text: `${c.name} reaches ${line.name}`,
        causes: [],
      });
      return { ...c, x, status: 'consolidating' as const };
    }
    return { ...c, x, status: 'advancing' as const };
  });
  return { companies, events };
}
