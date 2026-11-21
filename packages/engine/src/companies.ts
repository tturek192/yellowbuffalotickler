import { v } from '@wwi/scenario';
import type { Doctrine, Formation, Posture, Scenario } from '@wwi/scenario';
import { lineXAt } from './geometry';
import type { NewEvent } from './causes';
import type { Intent, Order, Side } from './types';

export type CompanyStatus =
  | 'waiting'
  | 'advancing'
  | 'consolidating'
  | 'holding'
  | 'pinned'
  | 'falling-back'
  | 'counter-attacking'
  | 'surrendered'
  | 'destroyed'
  | 'marching'
  | 'off-map';

export type CompanyState = {
  id: string;
  name: string;
  side: Side;
  doctrineId: string;
  /** The formation the company sits in (normally its battalion). */
  battalionId: string;
  /** Formation ids from the battalion up to the top of its force. */
  formationPath: string[];
  sectorId: string;
  /** May be absent for holding (garrison/reserve) companies, which ignore it. */
  objectiveLineId: string | undefined;
  x: number;
  y: number;
  /** Men standing. `men + killed + wounded + captured` is the company's men at Zero for the whole run. */
  men: number;
  killed: number;
  wounded: number;
  captured: number;
  /** The part of `killed` and `wounded` lost in the preliminary bombardment, before Zero (Task 7). */
  bombardment: { killed: number; wounded: number };
  /** 0–1. */
  morale: number;
  /** Morale at Zero: recovery never takes morale above it. */
  moraleStart: number;
  /** 0–1. */
  suppression: number;
  /** 0 when fresh. */
  fatigue: number;
  officers: number;
  lewisGuns: number;
  machineGuns: number;
  bombs: number;
  /** Small-arms ammunition as a fraction of the company's load at Zero (1 = full). */
  ammo: number;
  posture: Posture;
  training: 'rehearsed' | 'standard';
  /** The trench segment the company is in, once segments exist (Task 7). */
  segmentId?: string;
  intent: Intent;
  orders: Order[];
  /** `holding`: a garrison or reserve company, which stays where it starts for the whole run. */
  status: CompanyStatus;
  startMin: number;
  speedMPerMin: number;
};

/** Garrison and reserve companies hold; only the others attack. */
export const isHolding = (c: Pick<CompanyState, 'status'>): boolean => c.status === 'holding';

/** Ascending by id (code-unit order, never locale order): the order every phase processes units in. */
export const byId = <T extends { id: string }>(a: T, b: T): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

type Company = NonNullable<Formation['companies']>[number];
type Placed = { c: Company; side: Side; doctrineId: string; path: string[] };

/**
 * The companies of a scenario whose defaults are resolved (`resolveDefaults`), in ascending id order.
 * Attacking companies draw their start delay and speed from rng in that order, so the order of companies
 * in the scenario file never changes a run. Holding companies draw nothing.
 */
export function initCompanies(s: Scenario, doctrines: Record<string, Doctrine>, rng: () => number): CompanyState[] {
  const placed: Placed[] = [];
  const visit = (f: Formation, side: Side, doctrineId: string, above: string[]) => {
    const path = [f.id, ...above];
    for (const c of f.companies ?? []) placed.push({ c, side, doctrineId, path });
    for (const child of f.children ?? []) visit(child, side, doctrineId, path);
  };
  for (const force of s.forces) for (const f of force.formations) visit(f, force.side, force.doctrine, []);
  placed.sort((a, b) => byId(a.c, b.c));

  return placed.map(({ c, side, doctrineId, path }): CompanyState => {
    const d = doctrines[doctrineId];
    if (!d) throw new Error(`Unknown doctrine "${doctrineId}"`);
    if (!Array.isArray(c.start)) throw new Error(`Company ${c.id}: start was not projected to a local point`);
    const holding = c.role === 'garrison' || c.role === 'reserve';
    if (!holding && !d.attack) throw new Error(`Doctrine "${doctrineId}" has no attack block, but company ${c.id} attacks`);
    const startMin = holding ? 0 : (c.startAfterMin ? v(c.startAfterMin) : 0) + rng() * v(d.attack!.startJitterMin);
    const speedMPerMin = holding ? 0 : v(d.attack!.maxAdvanceMPerMin) * (1 + (rng() * 2 - 1) * v(d.attack!.speedJitterFrac));
    const need = <T>(x: { value: T } | undefined, k: string): T => {
      if (x === undefined) throw new Error(`Company ${c.id}: ${k} has no value (defaults were not resolved)`);
      return x.value;
    };
    const men = v(c.strength);
    const morale = v(d.common.baseMorale);
    return {
      id: c.id,
      name: c.name,
      side,
      doctrineId,
      battalionId: path[0]!,
      formationPath: path,
      sectorId: c.sectorId ?? '',
      objectiveLineId: c.objectiveLineId,
      x: c.start[0],
      y: c.start[1],
      men,
      killed: 0,
      wounded: 0,
      captured: 0,
      bombardment: { killed: 0, wounded: 0 },
      morale,
      moraleStart: morale,
      suppression: 0,
      fatigue: 0,
      officers: need(c.officers, 'officers'),
      lewisGuns: need(c.lewisGuns, 'lewisGuns'),
      machineGuns: need(c.machineGuns, 'machineGuns'),
      bombs: v(d.companyDefaults.bombsPerMan) * men,
      ammo: 1,
      // Garrisons shelter in their dugouts until they emerge (Task 8); everyone else starts in a trench.
      posture: c.role === 'garrison' ? 'in-dugout' : 'in-trench',
      training: need(c.training === undefined ? undefined : { value: c.training }, 'training'),
      intent: holding ? 'hold' : 'advance',
      orders: [],
      status: holding ? 'holding' : 'waiting',
      startMin,
      speedMPerMin,
    };
  });
}

/** Plan 2's barrage-following: each attacker moves toward its objective, never closer than followDistanceM to the barrage. */
export function moveCompanies(
  cs: CompanyState[],
  barrageX: (sectorId: string, y: number) => number,
  lines: Scenario['lines'],
  doctrines: Record<string, Doctrine>,
  minute: number,
  stepMin: number,
): { companies: CompanyState[]; events: NewEvent[] } {
  const events: NewEvent[] = [];
  const companies = cs.map((c) => {
    if (c.intent !== 'advance' || c.status === 'consolidating' || isHolding(c) || minute < c.startMin) return c;
    const line = lines.find((l) => l.id === c.objectiveLineId);
    const d = doctrines[c.doctrineId];
    if (!line || !d) throw new Error(`Company ${c.id}: unknown line or doctrine`);
    const objX = lineXAt(line.points, c.y);
    const target = Math.min(objX, barrageX(c.sectorId, c.y) - v(d.attack!.followDistanceM));
    const x = Math.max(c.x, Math.min(target, c.x + c.speedMPerMin * stepMin));
    if (objX - x <= 1) {
      events.push({
        minute,
        kind: 'company-reached',
        sectorId: c.sectorId,
        lineId: line.id,
        unitId: c.id,
        text: `${c.name} reaches ${line.name}`,
        causes: ['followed-barrage'],
      });
      return { ...c, x, status: 'consolidating' as const, posture: 'in-trench' as const };
    }
    return { ...c, x, status: 'advancing' as const, posture: 'moving' as const };
  });
  return { companies, events };
}
