import { minutesBetween, v } from '@wwi/scenario';
import type { Doctrine, Formation, Scenario } from '@wwi/scenario';
import { distanceTo, segmentSamples } from './artillery';
import { lineTimetableMin } from './barrage';
import { emit } from './causes';
import type { Cause } from './causes';
import { isHolding } from './companies';
import type { CompanyState, Role } from './companies';
import { send } from './comms';
import { lineXAt } from './geometry';
import { adaptFactor, delayFactor, leaderOf, riskRatio } from './leaders';
import type { Ratings } from './leaders';
import { round } from './record';
import type { Scheduled } from './schedule';
import { onField } from './step';
import type { SimState, StepContext } from './step';
import { segmentsOnLine } from './trenches';
import type { CommandState, Decision, FormationKind, HqState, Order, OrderTarget, SegmentState, Side } from './types';

/*
 * The command model (the model, "Command"; spec 12): each headquarters decides only from its picture of the battle (what
 * the reports that reached it told it, comms.ts), its leader's ratings adjusting the doctrine values (leaders.ts), and
 * sends its orders and calls for fire as messages. In the command phase, in this order:
 *
 * 1. Off-map attacks (`offMap.attacks`): forces outside the simulated one, on a fixed schedule (spec 13.9). Inside its
 *    window an attack holds the suppression of the enemy companies on its target feature at `suppressFrac` or above,
 *    with cause `off-map-fire` (an `off-map-attack` event when it opens).
 * 2. Defender, local counter-attack. The lowest battalion, regiment or brigade over a garrison's segment that has
 *    reserve-role or support companies of its own, once its picture shows the segment lost, orders them to counter-attack it, if their men are at least
 *    `counterAttackMinRatio` times the enemy it knows there — `counterAttackConsolidatedFactor` times that once the
 *    attackers have had `counterAttackConsolidateMin` to consolidate by the time it would go in. They go in
 *    `localCounterAttackDelayMin · delayFactor` after the decision (`counter-attack-ordered`, cause `ground-lost`).
 * 3. Defender, divisional counter-attack. A division whose picture shows at least `commitReserveWhenLostFrac` of its front
 *    (the segments its garrisons hold) lost orders its off-map reserves forward (`reserve-ordered`; Task 13 marches them)
 *    and plans a counter-attack for when they are there; then its reserve-role companies (those on the map, and the
 *    reserves once arrived) go in `divisionalCounterAttackDelayMin · delayFactor` after that, at the same ratio test.
 * 4. Attacker, stall. The timetable runs itself (companies' starts, companies.ts). A headquarters whose picture shows a
 *    line not taken `stallToleranceMin · adaptFactor` after its timetable minute (the barrage's arrival beyond it, or its
 *    last commitment to that line), and that is the lowest seeing it with a reserve-role battalion within its formation,
 *    commits the battalion nearest the line — and any companies of its own aimed at the line that fell back and rallied
 *    — if their men are at least `riskRatio` times the defenders it knows hold the line. It orders them to attack the
 *    line and calls for a standing barrage of `stallBarrageMin` on each segment of it it knows the enemy holds:
 *    `order-issued`, causes `leader-adapted` and `leader-bold` or `leader-cautious` as the leader's risk tolerance is
 *    above or below the midpoint, refs to the events the reports that showed the stall were about.
 * 5. Planned operations (`Scenario.operations`): one launches when the headquarters responsible for it (the lowest that
 *    commands both the operation's formation and the attackers of its prerequisite line) knows the prerequisite taken,
 *    `notBefore` has passed, and the operation's formation's reserve-role companies are at least `riskRatio` times the
 *    enemy it knows at the target: `operation-launched`, cause `planned-operation`; those companies attack the target.
 *
 * What an HQ knows of the enemy: its pre-battle intelligence picture at Zero (comms.ts), replaced piece by piece by what
 * reports have seen since. Ground it knows nothing of is unknown, and no ratio test passes on unknown ground; a decision
 * that rested on intelligence alone says so (factor `intelligence`).
 *
 * Orders are delivered only to the companies a decision concerns (`Order.unitIds`). Every number is data: the doctrine's
 * attack and defence keys named above, the effects keys stallBarrageMin, counterAttackConsolidateMin and counterAttackConsolidatedFactor,
 * the leaders' ratings, and the scenario's operations and off-map attacks.
 */

const enemyOf = (s: Side): Side => (s === 'allied' ? 'central' : 'allied');
const byStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const sorted = (xs: Iterable<string>): string[] => [...xs].sort(byStr);
const unique = (xs: number[]): number[] => xs.filter((x, i) => xs.indexOf(x) === i).sort((a, b) => a - b);
/** Statuses an HQ's picture shows for a unit out of the fight. */
const OUT: ReadonlySet<string> = new Set(['destroyed', 'surrendered', 'off-map', 'marching']);

// ---- the order of battle, as the command model needs it -----------------------------------------------------------

type FNode = {
  id: string;
  name: string;
  kind: FormationKind;
  side: Side;
  doctrineId: string;
  /** Its ancestors, nearest first. */
  up: string[];
  depth: number;
  /** Every company under it, in id order. */
  companies: string[];
  /** Companies directly in it, in id order. */
  own: string[];
};
type Topo = {
  nodes: Map<string, FNode>;
  /** Formation ids, lowest first (deepest, then by id). */
  bottomUp: string[];
  /** Formations under each formation that directly hold companies, every one of them reserve-role, in id order. */
  reserveBattalions: Map<string, string[]>;
  /** The garrison segments (ids) of the companies directly in a formation, and of all companies under a division. */
  front: Map<string, string[]>;
  divisionFront: Map<string, string[]>;
  /** The segments of each feature, by feature id. */
  featureSegments: Map<string, string[]>;
  /** The HQ responsible for each operation, by operation id. */
  responsible: Map<string, string>;
  /** Each formation's leader's ratings, and each line key's timetable minute, worked out once (looked up only). */
  ratings: Map<string, Ratings>;
  timetable: Map<string, number | null>;
};
const topologies = new WeakMap<StepContext, Topo>();

function topologyOf(state: SimState, ctx: StepContext): Topo {
  const hit = topologies.get(ctx);
  if (hit) return hit;
  const s = ctx.scenario;
  const nodes = new Map<string, FNode>();
  const walk = (f: Formation, side: Side, doctrineId: string, up: string[]): void => {
    nodes.set(f.id, { id: f.id, name: f.name, kind: f.kind, side, doctrineId, up, depth: up.length, companies: [], own: [] });
    for (const ch of f.children ?? []) walk(ch, side, doctrineId, [f.id, ...up]);
  };
  for (const force of s.forces) for (const f of force.formations) walk(f, force.side, force.doctrine, []);
  for (const c of state.companies) {
    nodes.get(c.battalionId)?.own.push(c.id);
    for (const id of c.formationPath) nodes.get(id)?.companies.push(c.id);
  }
  const role = new Map(state.companies.map((c) => [c.id, c.role]));
  const ids = sorted(nodes.keys());
  const reserveBattalions = new Map<string, string[]>(ids.map((id) => [id, []]));
  for (const id of ids) {
    const n = nodes.get(id)!;
    if (n.own.length > 0 && n.own.every((c) => role.get(c) === 'reserve')) for (const a of n.up) reserveBattalions.get(a)!.push(id);
  }
  const garrisonOf = new Map<string, string[]>();
  for (const seg of state.segments) for (const g of seg.garrisonIds) garrisonOf.set(g, [...(garrisonOf.get(g) ?? []), seg.id]);
  const segsOf = (cs: string[]): string[] => sorted(new Set(cs.flatMap((c) => garrisonOf.get(c) ?? [])));
  // A local counter-attack is a battalion's, a regiment's or a brigade's: their front is every garrison segment under them.
  const LOCAL: ReadonlySet<FormationKind> = new Set<FormationKind>(['battalion', 'regiment', 'brigade']);
  const front = new Map(ids.map((id) => [id, LOCAL.has(nodes.get(id)!.kind) ? segsOf(nodes.get(id)!.companies) : []]));
  const divisionFront = new Map(ids.filter((id) => nodes.get(id)!.kind === 'division').map((id) => [id, segsOf(nodes.get(id)!.companies)]));
  const featureSegments = new Map<string, string[]>();
  for (const seg of state.segments) featureSegments.set(seg.featureId, [...(featureSegments.get(seg.featureId) ?? []), seg.id]);
  const responsible = new Map<string, string>();
  for (const op of s.operations ?? []) {
    const chain = [op.formationId, ...(nodes.get(op.formationId)?.up ?? [])];
    let at = op.formationId;
    if (op.prerequisite) {
      const key = `${op.prerequisite.lineId}|${op.prerequisite.sectorId}`;
      const paths = state.companies.filter((c) => c.objectiveLineId !== undefined && `${c.objectiveLineId}|${c.sectorId}` === key && c.role !== 'garrison' && c.role !== 'reserve').map((c) => c.formationPath);
      at = chain.find((id) => paths.every((p) => p.includes(id))) ?? op.formationId;
    }
    responsible.set(op.id, at);
  }
  const bottomUp = [...ids].sort((a, b) => nodes.get(b)!.depth - nodes.get(a)!.depth || byStr(a, b));
  const t: Topo = { nodes, bottomUp, reserveBattalions, front, divisionFront, featureSegments, responsible, ratings: new Map(), timetable: new Map() };
  topologies.set(ctx, t);
  return t;
}

// ---- reading a picture ---------------------------------------------------------------------------------------------

/** A step's working view: the state as decisions change it, and lookups. */
type Work = { state: SimState; ctx: StepContext; topo: Topo; company: Map<string, CompanyState>; hqAt: Map<string, number> };

const hqOf = (w: Work, id: string): HqState | undefined => {
  const i = w.hqAt.get(id);
  return i === undefined ? undefined : w.state.hqs[i];
};
const doctrineOf = (w: Work, formationId: string): Doctrine => w.ctx.doctrines[w.topo.nodes.get(formationId)!.doctrineId]!;
function ratingsOf(w: Work, formationId: string): Ratings {
  let r = w.topo.ratings.get(formationId);
  if (!r) w.topo.ratings.set(formationId, (r = leaderOf(w.ctx.scenario, formationId, w.ctx.defaultsUsed)));
  return r;
}

/** Men the HQ's picture shows standing in these companies. */
function menOf(h: HqState, ids: readonly string[]): number {
  let n = 0;
  for (const id of ids) {
    const u = h.picture.units[id];
    if (u && !OUT.has(u.status)) n += u.men;
  }
  return n;
}

/**
 * Companies under a formation that the HQ can send: its picture shows them holding with men, the plan gives them one of
 * the roles, and the command model has not already ordered them forward.
 */
function free(w: Work, h: HqState, under: string, roles: readonly Role[]): string[] {
  return w.topo.nodes.get(under)!.companies.filter((id) => {
    const u = h.picture.units[id];
    return u !== undefined && u.status === 'holding' && u.men > 0 && roles.includes(w.company.get(id)!.role) && w.state.command.ordered[id] === undefined;
  });
}

/**
 * The enemy the HQ believes is on this ground (segment ids, or `place:<featureId>` keys): on each segment it shows held
 * by the enemy, and on each place, what the last report seen there said, else its intelligence estimate. Ground it has
 * neither for is unknown, which no ratio test passes: unknown is never taken for empty. `intel`: the pieces of ground
 * whose men came from intelligence alone.
 */
function enemyKnown(h: HqState, ground: readonly string[]): { men: number; unknown: boolean; intel: number } {
  let men = 0;
  let unknown = false;
  let intel = 0;
  for (const id of ground) {
    const place = id.startsWith('place:');
    if (!place && (h.picture.segments[id] === undefined || h.picture.segments[id] === h.side)) continue;
    const e = h.picture.enemy[id];
    if (!e) {
      unknown = true;
      continue;
    }
    men += e.men;
    if (e.intel) intel++;
  }
  return { men, unknown, intel };
}

/** The factors a decision's event carries about the enemy: its men, and how many pieces of ground intelligence alone gave. */
const enemyFactors = (k: { men: number; intel: number }): Record<string, number> => ({ enemy: k.men, ...(k.intel ? { intelligence: k.intel } : {}) });

/** The refs of a decision: the events its picture's pieces were about. */
const aboutOf = (h: HqState, keys: readonly string[]): number[] => unique(keys.flatMap((k) => (h.picture.about[k] === undefined ? [] : [h.picture.about[k]!])));

const ratioOf = (men: number, enemy: number): number => (enemy > 0 ? men / enemy : Infinity);

/** The leader's risk tolerance as a cause, when it is off the midpoint. */
const riskCause = (r: Ratings): Cause[] => (r.riskTolerance > 3 ? ['leader-bold'] : r.riskTolerance < 3 ? ['leader-cautious'] : []);

function setCommand(w: Work, patch: Partial<CommandState>): void {
  w.state = { ...w.state, command: { ...w.state.command, ...patch } };
}

function markOrdered(w: Work, h: HqState, ids: readonly string[], lineKey?: string): void {
  const entry = { hqId: h.formationId, atMin: w.state.minute, ...(lineKey !== undefined ? { lineKey } : {}), started: false };
  setCommand(w, { ordered: { ...w.state.command.ordered, ...Object.fromEntries(ids.map((id) => [id, { ...entry }])) } });
}

/**
 * What each ordering HQ has heard of its companies since: a report written at or after the order showing them out of
 * `holding` means they took it up; one showing them holding again after that releases them.
 */
function hearBack(w: Work): void {
  const was = w.state.command.ordered;
  let next: CommandState['ordered'] | null = null;
  for (const id of sorted(Object.keys(was))) {
    const o = was[id]!;
    const u = hqOf(w, o.hqId)?.picture.units[id];
    if (!u || u.atMin < o.atMin) continue;
    if (!o.started && u.status !== 'holding') (next ??= { ...was })[id] = { ...o, started: true };
    else if (o.started && u.status === 'holding') {
      next ??= { ...was };
      delete next[id];
    }
  }
  if (next) setCommand(w, { ordered: next });
}

/** Send an order from an HQ to companies, one message for each battalion they are in (to the company itself with `each`). */
function orderCompanies(w: Work, h: HqState, ids: readonly string[], o: Omit<Order, 'fromFormationId' | 'issuedMin' | 'unitIds'>, each = false): void {
  const groups = new Map<string, string[]>();
  for (const id of ids) {
    const to = each ? id : w.company.get(id)!.battalionId;
    groups.set(to, [...(groups.get(to) ?? []), id]);
  }
  for (const to of sorted(groups.keys())) {
    const order: Order = { ...o, fromFormationId: h.formationId, issuedMin: w.state.minute, unitIds: groups.get(to)! };
    w.state = send(w.state, w.ctx, { side: h.side, kind: 'order', fromFormationId: h.formationId, toFormationId: to, sentMin: w.state.minute, payload: order, ...(o.eventId !== undefined ? { aboutEventId: o.eventId } : {}) });
  }
}

// ---- the command phase -------------------------------------------------------------------------------------------

export function commandPhase(state: SimState, ctx: StepContext, dt: number): SimState {
  const topo = topologyOf(state, ctx);
  const w: Work = { state, ctx, topo, company: new Map(state.companies.map((c) => [c.id, c])), hqAt: new Map(state.hqs.map((h, i) => [h.formationId, i])) };
  hearBack(w);
  offMapAttacks(w, dt);
  localCounterAttacks(w);
  divisionalCounterAttacks(w);
  stalls(w);
  operations(w);
  return w.state;
}

// ---- 1. off-map attacks --------------------------------------------------------------------------------------------

type OffMapAttack = NonNullable<Scenario['offMap']>['attacks'][number] & { fromMin: number; toMin: number };
const offMapCache = new WeakMap<Scenario, OffMapAttack[]>();
function offMapAttacksOf(s: Scenario): OffMapAttack[] {
  let out = offMapCache.get(s);
  if (!out) {
    const zero = v(s.zeroHour);
    out = (s.offMap?.attacks ?? []).map((a) => ({ ...a, fromMin: minutesBetween(zero, a.window.from), toMin: minutesBetween(zero, a.window.to) }));
    offMapCache.set(s, out);
  }
  return out;
}

/**
 * Companies of the attacked side on an off-map attack's target feature: the garrisons of its segments, and any company
 * of that side up within `captureRadiusM` of them.
 */
function onTarget(w: Work, a: OffMapAttack): CompanyState[] {
  const side = enemyOf(a.side);
  const segs = (w.topo.featureSegments.get(a.targetFeatureId) ?? []).map((id) => w.state.segments.find((x) => x.id === id)!);
  const r = v(w.ctx.tables.effects.captureRadiusM);
  const ids = new Set(segs.map((x) => x.id));
  return w.state.companies.filter((c) => {
    if (c.side !== side || !onField(c)) return false;
    if (c.segmentId !== undefined && ids.has(c.segmentId)) return true;
    return c.posture !== 'in-dugout' && segs.some((x) => distanceTo(segmentSamples(w.ctx, x, w.state.companies), [c.x, c.y]) <= r);
  });
}

function offMapAttacks(w: Work, dt: number): void {
  const M = w.state.minute;
  for (const a of offMapAttacksOf(w.ctx.scenario)) {
    // The step (M − dt, M] overlaps the window [from, to).
    if (!(M > a.fromMin && M - dt < a.toMin)) continue;
    let id = w.state.command.offMap[a.id];
    if (id === undefined) {
      id = w.state.nextEventId;
      w.state = emit(w.state, { minute: M, kind: 'off-map-attack', text: `${a.name} attacks`, causes: ['off-map-fire'], factors: { suppressFrac: v(a.suppressFrac) } });
      setCommand(w, { offMap: { ...w.state.command.offMap, [a.id]: id } });
    }
    const frac = v(a.suppressFrac);
    const hit = new Set(onTarget(w, a).map((c) => c.id));
    if (hit.size === 0) continue;
    const eventId = id;
    w.state = {
      ...w.state,
      companies: w.state.companies.map((c) =>
        hit.has(c.id) ? { ...c, suppression: Math.max(c.suppression, frac), recentFire: [...c.recentFire, { minute: M, eventId, causes: ['off-map-fire'] }] } : c,
      ),
    };
  }
}

// ---- 2. local counter-attacks ----------------------------------------------------------------------------------------

/** When the HQ believes the segment changed hands: what its picture was told, else now. */
const lostAt = (h: HqState, segmentId: string, now: number): number => h.picture.segmentsAt[segmentId] ?? now;

/** The ratio a counter-attack needs: `counterAttackMinRatio`, × `counterAttackConsolidatedFactor` once the attackers have consolidated by `goAt`. */
function counterAttackNeed(w: Work, d: Doctrine, since: number, goAt: number): { need: number; consolidated: boolean } {
  const fx = w.ctx.tables.effects;
  const consolidated = goAt - since >= v(fx.counterAttackConsolidateMin);
  return { need: v(d.defence!.counterAttackMinRatio) * (consolidated ? v(fx.counterAttackConsolidatedFactor) : 1), consolidated };
}

/** Whether an HQ below this one, whose front holds the segment, has reserve or support companies of its own to send. */
function lowerWithForce(w: Work, fid: string, seg: string): boolean {
  for (const x of w.topo.bottomUp) {
    if (x === fid || !w.topo.nodes.get(x)!.up.includes(fid) || !w.topo.front.get(x)!.includes(seg)) continue;
    const h = hqOf(w, x);
    if (h && free(w, h, x, ['reserve', 'support']).length > 0) return true;
  }
  return false;
}

function localCounterAttacks(w: Work): void {
  const M = w.state.minute;
  for (const fid of w.topo.bottomUp) {
    const front = w.topo.front.get(fid)!;
    if (front.length === 0) continue;
    const h = hqOf(w, fid);
    const d = doctrineOf(w, fid);
    if (!h || !d.defence) continue;
    for (const seg of front) {
      const done = w.state.command.counterAttacks[seg];
      if (h.picture.segments[seg] === h.side) {
        // Known retaken by the HQ that ordered the counter-attack: a later loss is a new decision.
        if (done?.hqId === fid) {
          const { [seg]: _released, ...rest } = w.state.command.counterAttacks;
          setCommand(w, { counterAttacks: rest });
        }
        continue;
      }
      if (done !== undefined) continue;
      const force = free(w, h, fid, ['reserve', 'support']);
      // The lowest HQ over the segment with companies to send decides.
      if (force.length === 0 || lowerWithForce(w, fid, seg)) continue;
      const r = ratingsOf(w, fid);
      const f = delayFactor(r);
      const goAt = M + v(d.defence.localCounterAttackDelayMin) * f;
      const since = lostAt(h, seg, M);
      const { need, consolidated } = counterAttackNeed(w, d, since, goAt);
      const men = menOf(h, force);
      const known = enemyKnown(h, [seg]);
      const ratio = ratioOf(men, known.men);
      if (known.unknown || ratio < need) continue;
      const eventId = w.state.nextEventId;
      w.state = emit(w.state, {
        minute: M,
        kind: 'counter-attack-ordered',
        segmentId: seg,
        text: `${w.topo.nodes.get(fid)!.name} orders ${force.length} ${force.length === 1 ? 'company' : 'companies'} to counter-attack ${seg}${consolidated ? ' (the enemy will have consolidated)' : ''}`,
        causes: ['ground-lost', ...(f > 1 ? (['leader-slow'] as const) : [])],
        refs: aboutOf(h, [`s:${seg}`]),
        factors: { men, ...enemyFactors(known), ...(Number.isFinite(ratio) ? { ratio: round(ratio, 2) } : {}), need: round(need, 2), goAtMin: round(goAt, 1), consolidated: consolidated ? 1 : 0 },
      });
      setCommand(w, { counterAttacks: { ...w.state.command.counterAttacks, [seg]: { hqId: fid, atMin: M } } });
      markOrdered(w, h, force);
      orderCompanies(w, h, force, { kind: 'counter-attack', target: { segmentId: seg }, eventId, goAtMin: goAt }, true);
    }
  }
}

// ---- 3. divisional counter-attacks and reserves -------------------------------------------------------------------

function divisionalCounterAttacks(w: Work): void {
  const M = w.state.minute;
  for (const fid of sorted(w.topo.divisionFront.keys())) {
    const h0 = hqOf(w, fid);
    const d = doctrineOf(w, fid);
    if (!h0 || !d.defence) continue;
    if (w.state.command.divisions[fid] === undefined) {
      const front = w.topo.divisionFront.get(fid)!;
      const lost = front.filter((x) => h0.picture.segments[x] !== undefined && h0.picture.segments[x] !== h0.side);
      if (front.length === 0 || lost.length / front.length < v(d.defence.commitReserveWhenLostFrac)) continue;
      // Its off-map reserves: those of formations within it.
      const reserves = w.state.reserves.filter((x) => x.status === 'waiting' && (x.formationId === fid || (w.topo.nodes.get(x.formationId)?.up.includes(fid) ?? false)));
      const r = ratingsOf(w, fid);
      const refs = aboutOf(h0, lost.map((x) => `s:${x}`));
      const ordered: number[] = [];
      for (const res of reserves) {
        ordered.push(w.state.nextEventId);
        w.state = emit(w.state, {
          minute: M,
          kind: 'reserve-ordered',
          text: `${w.topo.nodes.get(fid)!.name} orders ${w.topo.nodes.get(res.formationId)?.name ?? res.formationId} forward`,
          causes: ['ground-lost', ...(delayFactor(r) > 1 ? (['leader-slow'] as const) : [])],
          refs,
          factors: { lostSegments: lost.length, frontSegments: front.length },
        });
      }
      if (reserves.length) {
        const ids = new Set(reserves.map((x) => x.formationId));
        w.state = { ...w.state, reserves: w.state.reserves.map((x) => (ids.has(x.formationId) ? { ...x, status: 'ordered' as const, orderedMin: M } : x)) };
      }
      const plan: Decision = { kind: 'divisional-counter-attack', atMin: M, formationId: fid, segmentIds: lost, reserveIds: reserves.map((x) => x.formationId), eventRefs: unique([...refs, ...ordered]) };
      const i = w.hqAt.get(fid)!;
      w.state = { ...w.state, hqs: w.state.hqs.map((x, j) => (j === i ? { ...x, pending: [...x.pending, plan] } : x)) };
      setCommand(w, { divisions: { ...w.state.command.divisions, [fid]: M } });
    }
    goDivisional(w, fid, d);
  }
}

/** A division's planned counter-attack goes in once its reserves are there (all its off-map ones arrived). */
function goDivisional(w: Work, fid: string, d: Doctrine): void {
  const M = w.state.minute;
  const i = w.hqAt.get(fid)!;
  const h = w.state.hqs[i]!;
  const plan = h.pending.find((x) => x.kind === 'divisional-counter-attack');
  if (!plan) return;
  const drop = (): void => {
    w.state = { ...w.state, hqs: w.state.hqs.map((x, j) => (j === i ? { ...x, pending: x.pending.filter((p) => p !== plan) } : x)) };
  };
  const waited = w.state.reserves.filter((x) => plan.reserveIds.includes(x.formationId));
  if (waited.some((x) => x.status !== 'arrived')) return;
  const targets = plan.segmentIds.filter((x) => h.picture.segments[x] !== h.side);
  const force = free(w, h, fid, ['reserve']);
  if (targets.length === 0 || force.length === 0) {
    // Retaken already, or nobody to send (and no reserve on its way): nothing left to do.
    drop();
    return;
  }
  const there = Math.max(plan.atMin, ...waited.map((x) => x.arriveMin ?? plan.atMin));
  const r = ratingsOf(w, fid);
  const f = delayFactor(r);
  const goAt = Math.max(M, there + v(d.defence!.divisionalCounterAttackDelayMin) * f);
  const since = Math.min(...targets.map((x) => lostAt(h, x, M)));
  const { need, consolidated } = counterAttackNeed(w, d, since, goAt);
  const men = menOf(h, force);
  const known = enemyKnown(h, targets);
  const ratio = ratioOf(men, known.men);
  if (known.unknown || ratio < need) return;
  const eventId = w.state.nextEventId;
  w.state = emit(w.state, {
    minute: M,
    kind: 'counter-attack-ordered',
    segmentId: targets[0]!,
    text: `${w.topo.nodes.get(fid)!.name} orders a counter-attack by ${force.length} companies on ${targets.join(', ')}`,
    causes: ['ground-lost', ...(f > 1 ? (['leader-slow'] as const) : [])],
    refs: plan.eventRefs,
    factors: { men, ...enemyFactors(known), ...(Number.isFinite(ratio) ? { ratio: round(ratio, 2) } : {}), need: round(need, 2), goAtMin: round(goAt, 1), consolidated: consolidated ? 1 : 0 },
  });
  drop();
  markOrdered(w, h, force);
  // Each company to the lost segment nearest it.
  const segs = targets.map((id) => w.state.segments.find((x) => x.id === id)!);
  const nearest = (c: CompanyState): SegmentState => {
    let best = segs[0]!;
    let bd = Infinity;
    for (const x of segs) {
      const dd = distanceTo(segmentSamples(w.ctx, x, w.state.companies), [c.x, c.y]);
      if (dd < bd) [best, bd] = [x, dd];
    }
    return best;
  };
  const bySeg = new Map<string, string[]>();
  for (const id of force) {
    const seg = nearest(w.company.get(id)!).id;
    bySeg.set(seg, [...(bySeg.get(seg) ?? []), id]);
  }
  for (const seg of sorted(bySeg.keys())) orderCompanies(w, h, bySeg.get(seg)!, { kind: 'counter-attack', target: { segmentId: seg }, eventId, goAtMin: goAt }, true);
}

// ---- 4. the attacker's stall -----------------------------------------------------------------------------------------

/** The minute the HQ's line counts as stalled: its timetable minute (or its last commitment to it) + stallToleranceMin · adaptFactor. */
function stallDue(w: Work, h: HqState, key: string): number | null {
  const attack = doctrineOf(w, h.formationId).attack;
  if (!attack) return null;
  let tt = w.topo.timetable.get(key);
  if (tt === undefined) {
    const [lineId, sectorId] = key.split('|') as [string, string];
    const sector = w.ctx.scenario.sectors.find((x) => x.id === sectorId);
    w.topo.timetable.set(key, (tt = sector ? lineTimetableMin(sector, w.ctx.lines, lineId) : null));
  }
  if (tt === null) return null;
  const last = w.state.command.stallCommits[`${h.formationId}|${key}`];
  return Math.max(tt, last ?? -Infinity) + v(attack.stallToleranceMin) * adaptFactor(ratingsOf(w, h.formationId));
}

/** An HQ in action: its picture holds lines its companies attack. */
const engaged = (w: Work, id: string): boolean => {
  const h = hqOf(w, id);
  return h !== undefined && Object.keys(h.picture.lines).length > 0;
};

/**
 * The HQ's reserve-role battalions: those within its formation whose every company its picture shows free to send, and
 * that are no lower HQ's in action (a brigade fighting keeps its reserve; its division commits only reserves outside
 * its fighting brigades, such as a whole brigade in reserve).
 */
function reservesOf(w: Work, h: HqState): string[] {
  return w.topo.reserveBattalions.get(h.formationId)!.filter((b) => {
    const between = w.topo.nodes.get(b)!.up;
    const own = between.slice(0, between.indexOf(h.formationId)).filter((x) => x !== b);
    return !own.some((x) => engaged(w, x)) && free(w, h, b, ['reserve']).length === w.topo.nodes.get(b)!.own.length;
  });
}

/** Statuses of an attacking company the picture shows on its way. */
const GOING: ReadonlySet<string> = new Set(['waiting', 'advancing', 'counter-attacking']);

/**
 * Whether the HQ's picture shows the attack on a line come to a stop short of it: of the line's companies under it (its
 * attackers, and those it has ordered against it), it knows of none still on its way (on the move, or ordered and not
 * yet seen to go), and of at least one; with the line not taken, the attack has stalled.
 */
function stopped(w: Work, h: HqState, ids: readonly string[], key: string): boolean {
  const ordered = w.state.command.ordered;
  const all = [...ids, ...Object.keys(ordered).filter((id) => ordered[id]!.lineKey === key && ordered[id]!.hqId === h.formationId && !ids.includes(id))];
  if (all.length === 0) return false;
  return all.every((id) => {
    const o = ordered[id];
    if (o && !o.started) return false;
    const u = h.picture.units[id];
    return u !== undefined && !GOING.has(u.status);
  });
}

/** The companies under a formation attacking a line in a sector (as the plan, or an order taken up, aims them). */
const lineCompanies = (w: Work, fid: string, lineId: string, sectorId: string): string[] =>
  w.topo.nodes.get(fid)!.companies.filter((id) => {
    const c = w.company.get(id)!;
    return c.objectiveLineId === lineId && c.sectorId === sectorId && c.role !== 'garrison' && !(c.role === 'reserve' && isHolding(c) && c.orders.length === 0 && w.state.command.ordered[id] === undefined);
  });

/** HQs below this one that see the line and have a reserve battalion to send (the lowest decides). */
const lowerWithReserve = (w: Work, h: HqState, key: string): boolean =>
  w.state.hqs.some((x) => x !== h && w.topo.nodes.get(x.formationId)!.up.includes(h.formationId) && x.picture.lines[key] === null && reservesOf(w, x).length > 0);

function stalls(w: Work): void {
  const M = w.state.minute;
  for (const fid of w.topo.bottomUp) {
    const h0 = hqOf(w, fid);
    if (!h0) continue;
    for (const key of sorted(Object.keys(h0.picture.lines))) {
      const h = hqOf(w, fid)!;
      if (h.picture.lines[key] !== null) continue;
      const due = stallDue(w, h, key);
      if (due === null || M < due) continue;
      const reserves = reservesOf(w, h);
      if (reserves.length === 0 || lowerWithReserve(w, h, key)) continue;
      const [lineId, sectorId] = key.split('|') as [string, string];
      const attackers = lineCompanies(w, fid, lineId, sectorId);
      if (!stopped(w, h, attackers, key)) continue;
      const line = w.ctx.lines.get(lineId)!;
      const far = (b: string): number => {
        const cs = w.topo.nodes.get(b)!.own.map((id) => w.company.get(id)!);
        return cs.reduce((a, c) => a + Math.abs(lineXAt(line, c.y) - c.x), 0) / cs.length;
      };
      const battalion = [...reserves].sort((a, b) => far(a) - far(b) || byStr(a, b))[0]!;
      // Its own companies on that line that fell back and rallied go forward with the reserve (Task 10 ruling).
      const rallied = attackers.filter((id) => h.picture.units[id]?.status === 'holding' && (h.picture.units[id]?.men ?? 0) > 0 && w.state.command.ordered[id] === undefined);
      const force = [...w.topo.nodes.get(battalion)!.own, ...rallied].sort(byStr);
      const segs = segmentsOnLine(w.state, w.ctx, lineId, sectorId).map((x) => x.id);
      const men = menOf(h, force);
      const known = enemyKnown(h, segs);
      const ratio = ratioOf(men, known.men);
      const r = ratingsOf(w, fid);
      const attack = doctrineOf(w, fid).attack!;
      const accept = riskRatio(v(attack.minAttackRatio), r);
      if (known.unknown || ratio < accept) continue;
      const lineName = w.ctx.scenario.lines.find((l) => l.id === lineId)?.name ?? lineId;
      const eventId = w.state.nextEventId;
      w.state = emit(w.state, {
        minute: M,
        kind: 'order-issued',
        lineId,
        sectorId,
        text: `${w.topo.nodes.get(fid)!.name} commits ${w.topo.nodes.get(battalion)!.name}${rallied.length ? ` and ${rallied.length} rallied ${rallied.length === 1 ? 'company' : 'companies'}` : ''} to the stalled ${lineName}`,
        causes: ['leader-adapted', ...riskCause(r)],
        refs: aboutOf(h, [`l:${key}`, ...attackers.map((id) => `u:${id}`), ...segs.map((x) => `s:${x}`)]),
        factors: { men, ...enemyFactors(known), ...(Number.isFinite(ratio) ? { ratio: round(ratio, 2) } : {}), riskRatio: round(accept, 2), lateMin: round(M - (due - v(attack.stallToleranceMin) * adaptFactor(r)), 1) },
      });
      const commits = { ...w.state.command.stallCommits };
      for (const x of [fid, ...w.topo.nodes.get(fid)!.up]) commits[`${x}|${key}`] = M;
      setCommand(w, { stallCommits: commits });
      markOrdered(w, h, force, key);
      orderCompanies(w, h, force, { kind: 'attack', target: { lineId, sectorId }, eventId });
      // The standing barrage: a call for fire on each segment of the line it knows the enemy holds, for stallBarrageMin.
      const forMin = v(w.ctx.tables.effects.stallBarrageMin);
      for (const seg of segs) {
        if (h.picture.segments[seg] === undefined || h.picture.segments[seg] === h.side) continue;
        w.state = send(w.state, w.ctx, { side: h.side, kind: 'call-for-fire', fromFormationId: fid, toFormationId: fid, sentMin: M, payload: { segmentId: seg, byUnitId: fid, atMin: M, forMin }, aboutEventId: eventId });
      }
    }
  }
}

// ---- 5. planned operations -------------------------------------------------------------------------------------------

type Operation = NonNullable<Scenario['operations']>[number];

/** An operation's target ground: the segments on its line, or of its feature, else the feature as a place. */
function targetGround(w: Work, target: Operation['target']): string[] {
  if ('lineId' in target) return segmentsOnLine(w.state, w.ctx, target.lineId, target.sectorId).map((x) => x.id);
  return w.topo.featureSegments.get(target.featureId) ?? [`place:${target.featureId}`];
}

/** Whether an operation is ready but for `notBefore`, and its responsible HQ; null when it is not ready. */
function readiness(w: Work, op: Operation): { h: HqState; force: string[] } | null {
  if (w.state.command.launched[op.id] !== undefined) return null;
  const h = hqOf(w, w.topo.responsible.get(op.id)!);
  if (!h || !w.topo.nodes.has(op.formationId)) return null;
  if (op.prerequisite && typeof h.picture.lines[`${op.prerequisite.lineId}|${op.prerequisite.sectorId}`] !== 'number') return null;
  const force = free(w, h, op.formationId, ['reserve']);
  return force.length ? { h, force } : null;
}

const notBeforeMin = (w: Work, op: Operation): number => (op.notBefore === undefined ? -Infinity : minutesBetween(v(w.ctx.scenario.zeroHour), op.notBefore));

function operations(w: Work): void {
  const M = w.state.minute;
  for (const op of [...(w.ctx.scenario.operations ?? [])].sort((a, b) => byStr(a.id, b.id))) {
    if (M < notBeforeMin(w, op)) continue;
    const ready = readiness(w, op);
    if (!ready) continue;
    const { h, force } = ready;
    const fid = h.formationId;
    const attack = doctrineOf(w, fid).attack;
    if (!attack) continue;
    const men = menOf(h, force);
    const known = enemyKnown(h, targetGround(w, op.target));
    const ratio = ratioOf(men, known.men);
    const r = ratingsOf(w, fid);
    const accept = riskRatio(v(attack.minAttackRatio), r);
    if (known.unknown || ratio < accept) continue;
    const key = op.prerequisite ? `${op.prerequisite.lineId}|${op.prerequisite.sectorId}` : '';
    const eventId = w.state.nextEventId;
    const where = 'lineId' in op.target ? (w.ctx.scenario.lines.find((l) => l.id === (op.target as { lineId: string }).lineId)?.name ?? op.target.lineId) : op.target.featureId;
    w.state = emit(w.state, {
      minute: M,
      kind: 'operation-launched',
      ...('lineId' in op.target ? { lineId: op.target.lineId, sectorId: op.target.sectorId } : {}),
      text: `${w.topo.nodes.get(fid)!.name} launches ${op.id}: ${force.length} companies of ${w.topo.nodes.get(op.formationId)!.name} on ${where}`,
      causes: ['planned-operation', ...riskCause(r)],
      refs: key ? aboutOf(h, [`l:${key}`]) : [],
      factors: { men, ...enemyFactors(known), ...(Number.isFinite(ratio) ? { ratio: round(ratio, 2) } : {}), riskRatio: round(accept, 2) },
    });
    setCommand(w, { launched: { ...w.state.command.launched, [op.id]: M } });
    markOrdered(w, h, force, 'lineId' in op.target ? `${op.target.lineId}|${op.target.sectorId}` : undefined);
    const target: OrderTarget = 'lineId' in op.target ? { lineId: op.target.lineId, sectorId: op.target.sectorId } : { featureId: op.target.featureId };
    orderCompanies(w, h, force, { kind: op.kind, target, eventId });
  }
}

// ---- scheduled minutes, and whether the command model has anything in hand -----------------------------------------

const workOf = (state: SimState, ctx: StepContext): Work => ({
  state,
  ctx,
  topo: topologyOf(state, ctx),
  company: new Map(state.companies.map((c) => [c.id, c])),
  hqAt: new Map(state.hqs.map((h, i) => [h.formationId, i])),
});

/** The minutes lines will count as stalled at HQs with a reserve battalion to send. A decision moves nobody (its order does, on arrival). */
export function stallChecks(state: SimState, ctx: StepContext): Scheduled[] {
  const w = workOf(state, ctx);
  const out: Scheduled[] = [];
  for (const h of state.hqs) {
    const keys = Object.keys(h.picture.lines).filter((k) => h.picture.lines[k] === null);
    if (keys.length === 0 || w.topo.reserveBattalions.get(h.formationId)!.length === 0 || reservesOf(w, h).length === 0) continue;
    for (const k of keys) {
      const due = stallDue(w, h, k);
      if (due !== null && due > state.minute) out.push({ minute: due, startsMovement: false });
    }
  }
  return out;
}

/** The `notBefore` minutes of operations not yet launched. A launch moves nobody (its orders do, on arrival). */
export function operationStarts(state: SimState, ctx: StepContext): Scheduled[] {
  const w = workOf(state, ctx);
  return (ctx.scenario.operations ?? []).flatMap((op) => {
    const nb = notBeforeMin(w, op);
    return state.command.launched[op.id] === undefined && nb > state.minute ? [{ minute: nb, startsMovement: false }] : [];
  });
}

/** The minutes companies holding an order go (a counter-attack formed up): each sets a company moving. */
export const orderStarts = (state: SimState): Scheduled[] =>
  state.companies.flatMap((c) => {
    const o = c.orders.at(-1);
    return o?.goAtMin !== undefined && o.goAtMin > state.minute && isHolding(c) ? [{ minute: o.goAtMin, startsMovement: true }] : [];
  });

/**
 * The minutes off-map attacks open and close. The opening ends a quiet step before it (as if it set units moving), so
 * the attack's first step is a fine one; while it is under way the companies it holds down count as under fire (busy).
 */
export const offMapAttackWindows = (_state: SimState, ctx: StepContext): Scheduled[] =>
  offMapAttacksOf(ctx.scenario).flatMap((a) => [{ minute: a.fromMin, startsMovement: true }, { minute: a.toMin, startsMovement: false }]);

/**
 * Whether the command model has something in hand that a run must not end before: an order on its way, a company holding
 * an order it has not yet taken up, a stall it will act on, or an operation ready but for its `notBefore`.
 */
export function commandPending(state: SimState, ctx: StepContext): boolean {
  if (state.messages.some((m) => m.kind === 'order')) return true;
  if (state.companies.some((c) => isHolding(c) && onField(c) && c.orders.some((o) => o.kind === 'attack' || o.kind === 'counter-attack'))) return true;
  if (stallChecks(state, ctx).length > 0) return true;
  const w = workOf(state, ctx);
  return (ctx.scenario.operations ?? []).some((op) => notBeforeMin(w, op) > state.minute && readiness(w, op) !== null);
}

/** For tests: the command model's view of the order of battle. */
export const commandTopology = (state: SimState, ctx: StepContext): { bottomUp: string[]; responsible: Map<string, string> } => {
  const t = topologyOf(state, ctx);
  return { bottomUp: t.bottomUp, responsible: t.responsible };
};

