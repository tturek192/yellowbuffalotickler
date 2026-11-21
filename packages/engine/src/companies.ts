import { v } from '@wwi/scenario';
import type { Company, Doctrine, Formation, Posture, Scenario } from '@wwi/scenario';
import type { Cause } from './causes';
import { companyLeaderOf, timetableJitter } from './leaders';
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

/** What a company is for in the plan (the scenario's role): it never changes during the run. */
export type Role = Company['role'];

export type CompanyState = {
  id: string;
  name: string;
  side: Side;
  /** Its part in the plan (Task 10): assault, mopup and support companies attack; garrison and reserve companies hold. */
  role: Role;
  /** A garrison held as a local counter-attack force (the scenario's `counterAttacks`, Task 12): it may be ordered out. */
  counterAttacks: boolean;
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
  /** Where it stood at Zero: a company falling back makes for it (Task 10). */
  startX: number;
  startY: number;
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
  /**
   * How far its sector's barrage stands ahead of it, `barrageX − x`, in metres, as of the end of its last
   * step (Task 8); null for holding companies and once the barrage has ended.
   */
  gapM: number | null;
  /** It has fallen so far behind its barrage that the barrage no longer protects it (Task 8, `barrage-lost`). */
  barrageLost: boolean;
  /** The `barrage-lost` event of its present loss, for refs; null while it has its barrage. */
  barrageLostEventId: number | null;
  /** A garrison's own dugout depth in metres (absent for companies with no dugouts given). */
  dugoutDepthM?: number;
  /** A garrison's `fire-opened` event, once its machine guns have fired (Task 9); null before. */
  mgOpenedEventId: number | null;
  /** The `officers-lost` event, once its officers are all down (Task 9); null while it has officers. */
  officersLostEventId: number | null;
  /**
   * The fire that came in on it over the last `fireRefsMin` minutes, a step at a time (Task 9): the event that
   * reported it (null when none did, e.g. fire that hit nobody) and its causes. The morale events take their causes
   * and refs from it.
   */
  recentFire: Array<{ minute: number; eventId: number | null; causes: Cause[] }>;
  /** Its `company-reached` event and that event's causes, once it has reached its objective line (Task 10); null before. */
  reached: { eventId: number; causes: Cause[] } | null;
  /** Its latest `company-fell-back` event, for the refs of its rally (Task 10); null if it never fell back. */
  fellBackEventId: number | null;
  /** A garrison's `dugout-sortie` event, once its men left in the dugouts have come up behind the attackers (Task 10); null before. */
  sortieEventId: number | null;
  /** Its `ammunition-low` event, once it is down to its ammunition reserve (Task 14); null before. */
  ammoLowEventId: number | null;
};

/**
 * How much of its speed and fire a company keeps under its leaders (the model, "Officers"): 1 while it has an
 * officer; with none, `1 − ncoPenalty[training]`, the NCOs leading.
 */
export function leadFactor(c: Pick<CompanyState, 'officers' | 'training'>, d: Doctrine): number {
  return c.officers > 0 ? 1 : 1 - v(d.ncoPenalty[c.training]);
}

/** Garrison and reserve companies hold, and so do attackers that rallied after falling back (Task 10); only the others attack. */
export const isHolding = (c: Pick<CompanyState, 'status'>): boolean => c.status === 'holding';

/** Ascending by id (code-unit order, never locale order): the order every phase processes units in. */
export const byId = <T extends { id: string }>(a: T, b: T): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

type Placed = { c: Company; side: Side; doctrineId: string; path: string[] };

/**
 * The companies of a scenario whose defaults are resolved (`resolveDefaults`), in ascending id order.
 * Attacking companies draw their start delay and speed from rng in that order, so the order of companies
 * in the scenario file never changes a run. Holding companies draw nothing. An attacker's start is its
 * `startAfterMin` plus up to `timetableJitter` (its leader's planning, leaders.ts; a leader-less chain counts as 3,
 * listed in `defaultsUsed` when given).
 */
export function initCompanies(s: Scenario, doctrines: Record<string, Doctrine>, rng: () => number, defaultsUsed?: Set<string>): CompanyState[] {
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
    // The timetable runs itself (Task 12): its start, late by up to timetableJitter, the startJitterMin its leader's planning scales.
    const startMin = holding ? 0 : (c.startAfterMin ? v(c.startAfterMin) : 0) + rng() * timetableJitter(v(d.attack!.startJitterMin), companyLeaderOf(s, path, defaultsUsed));
    // A holding company draws nothing; it moves only if ordered to counter-attack, at its doctrine's pace (none without an attack block).
    const speedMPerMin = holding ? (d.attack ? v(d.attack.maxAdvanceMPerMin) : 0) : v(d.attack!.maxAdvanceMPerMin) * (1 + (rng() * 2 - 1) * v(d.attack!.speedJitterFrac));
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
      role: c.role,
      counterAttacks: c.counterAttacks === true,
      doctrineId,
      battalionId: path[0]!,
      formationPath: path,
      sectorId: c.sectorId ?? '',
      objectiveLineId: c.objectiveLineId,
      x: c.start[0],
      y: c.start[1],
      startX: c.start[0],
      startY: c.start[1],
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
      gapM: null,
      barrageLost: false,
      barrageLostEventId: null,
      ...(c.dugoutDepthM !== undefined ? { dugoutDepthM: v(c.dugoutDepthM) } : {}),
      mgOpenedEventId: null,
      officersLostEventId: null,
      recentFire: [],
      reached: null,
      fellBackEventId: null,
      sortieEventId: null,
      ammoLowEventId: null,
    };
  });
}
