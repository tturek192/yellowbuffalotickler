import { CHANNEL_KINDS, v } from '@wwi/scenario';
import type { ChannelKind, EffectKey, Formation, Point, Scenario } from '@wwi/scenario';
import { distanceTo, segmentSamples } from './artillery';
import { emit } from './causes';
import type { NewEvent } from './causes';
import type { CompanyState } from './companies';
import { CELL_M } from './ground';
import { round } from './record';
import type { Scheduled } from './schedule';
import type { SimState, StepContext } from './step';
import type { BatteryState, CallForFire, CutLine, FireMission, FormationKind, HqNews, HqState, Message, Order, Report, Side } from './types';

/*
 * Communications (the model, "Command"): reports, orders and calls for fire travel as messages, one hop at a time, over
 * the channels the scenario's `communications.links` give between two levels of a side.
 *
 * - A hop from a formation (or a company) goes to its nearest ancestor (or, for an order, the nearest formation down
 *   toward the destination) that a link from its level reaches: a link that skips a level is used where the level
 *   between has none, and the message is forwarded from there. Where no link reaches any of them, it goes to the next
 *   formation by runner. The links have no company level: a company's messages go to its battalion by runner. Without a
 *   `communications` section every link is by runner. Each default is listed in `defaultsUsed`.
 * - Of the hop's channels the fastest not cut is taken (by its expected delay). A surface line, between two
 *   headquarters in both directions, is cut where shelling has churned any 50 m cell along it (the churn grid holds a
 *   shell), or for good once a failure draw has lost a message on it; each cut is noted once in `cutLines`, and a
 *   message that could not use the line says why (`factors.cutBy`). When every channel is cut, a runner goes.
 * - Headquarters stand at their formation's `hqPosition`, else behind their companies by their level's rear offset
 *   (`hqPlace`); a company at its own place.
 * - Delay: (delayMin + runnerMinPerKm × the km beyond runnerDelayCoversKm, for a runner) × (0.5 + rng()), × (6 −
 *   orderSpeed) / 3 of the sending HQ's leader for orders; the chance it is lost is 1 − exp(−failPerHour · delay / 60),
 *   drawn at once. A lost message is known lost when it would have arrived (`message-lost`, cause `lost-contact`, refs
 *   to the event it was about), and the sender sends it again then by the next channel (round again to the first after
 *   the last).
 * - The comms phase delivers messages whose dueMin is at or before the step's end in (dueMin, id) order, each at its
 *   own dueMin, so a headquarters passes news on when it gets it, whatever the step.
 *
 * Reports. A company reports to its battalion when its status changes, it takes a segment, its own segment changes
 * hands or its line is taken (`companyReports`, at the end of the step). A headquarters merges a report into its
 * picture and passes a summary of what is new up to the next headquarters: at once when a unit's status, a segment's
 * holder or a line changed, otherwise `reportEveryMin` (doctrine) after its last summary.
 *
 * Calls for fire. A company that is pinned calls for fire on the nearest segment held by the enemy within
 * `observerRangeM`. The call goes up the chain until it reaches a formation the scenario's `liaison` covers, which
 * passes it to the artillery by buried cable (its delayMin: the liaison officer's call); with no liaison on the way it
 * reaches the top of the chain, where the artillery is commanded. On arrival `callForFireGuns` guns of the nearest
 * batteries of the side in action (not the creeping or machine-gun barrage, which keep the timetable) fire on the
 * segment for `callForFireMin`, taken off their own task (artillery.ts); it falls on the enemy there, never on the
 * caller's side, even if the segment has changed hands by then.
 *
 * Orders are delivered to the companies of the formation they are addressed to (`orders`); deciding them is the
 * command model's (Task 12). Every number is data: the channels' delayMin and failPerHour, the effects keys
 * runnerMinPerKm, runnerDelayCoversKm, the hqRearOffset…M keys, callForFireMin, callForFireGuns and observerRangeM, the
 * doctrine's reportEveryMin and the leaders' orderSpeed.
 */

/** The last hop of a call for fire: the artillery itself. */
export const ARTILLERY = '@artillery';

type Kind = FormationKind | 'company';
type Node = { id: string; name: string; kind: Kind; side: Side; parentId: string | null; leaderId?: string; doctrineId: string; pos: Point | null };
type Topology = {
  /** Formations and companies, looked up only. */
  nodes: Map<string, Node>;
  /** `side|from|to` → channels; null when the scenario has no communications section (every link a runner). */
  links: Map<string, ChannelKind[]> | null;
  /** Formation ids the liaison covers, looked up only. */
  liaison: Map<string, true>;
  /** Formation id → its index in `SimState.hqs`. */
  hqIndex: Map<string, number>;
  /** Each HQ's `reportEveryMin` (its side's doctrine), by its index in `SimState.hqs`. */
  everyMin: number[];
  /** Whether shelling has churned a cell along the line between two HQs, by `a|b` pair (looked up only), as of `alongGen`. */
  along: Map<string, boolean>;
  /** The world's `churnGen` the memo holds for; a newer one empties it. */
  alongGen: number;
};
const topologies = new WeakMap<Scenario, Topology>();

const byStr = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The headquarters of every formation, in ascending id order, with their pictures at Zero (every company under it as it
 * stands, every segment's holder, its attackers' objective lines not taken), and the comms topology for the run.
 */
export function initComms(state: SimState, ctx: StepContext): SimState {
  const s = ctx.scenario;
  const nodes = new Map<string, Node>();
  const formations: Array<Node & { kind: FormationKind; companyIds: string[] }> = [];
  const given = new Map<string, Point>();
  const walk = (f: Formation, side: Side, doctrineId: string, parentId: string | null): void => {
    const node: Node & { kind: FormationKind; companyIds: string[] } = { id: f.id, name: f.name, kind: f.kind, side, parentId, ...(f.leaderId !== undefined ? { leaderId: f.leaderId } : {}), doctrineId, pos: null, companyIds: [] };
    if (f.hqPosition !== undefined) {
      if (!Array.isArray(f.hqPosition)) throw new Error(`Formation ${f.id}: hqPosition was not projected to a local point`);
      given.set(f.id, [f.hqPosition[0], f.hqPosition[1]]);
    }
    formations.push(node);
    nodes.set(f.id, node);
    for (const ch of f.children ?? []) walk(ch, side, doctrineId, f.id);
  };
  for (const force of s.forces) for (const f of force.formations) walk(f, force.side, force.doctrine, null);
  const formationOf = new Map(formations.map((f) => [f.id, f]));
  for (const c of state.companies) {
    nodes.set(c.id, { id: c.id, name: c.name, kind: 'company', side: c.side, parentId: c.battalionId, doctrineId: c.doctrineId, pos: null });
    for (const id of c.formationPath) formationOf.get(id)?.companyIds.push(c.id);
  }
  const byCompany = new Map(state.companies.map((c) => [c.id, c]));
  for (const f of formations) f.pos = hqPlace(f, f.companyIds.map((id) => byCompany.get(id)!), given.get(f.id), ctx);
  const comms = s.communications;
  let links: Topology['links'] = null;
  if (comms) {
    links = new Map();
    for (const l of comms.links) if (l.channels.length) links.set(`${l.side}|${l.from}|${l.to}`, [...l.channels]);
  } else ctx.defaultsUsed.add('communications ← none: every link between headquarters is by runner');
  const liaison = new Map<string, true>((comms?.liaison ?? []).map((l) => [l.formationId, true]));
  const sorted = [...formations].sort((a, b) => byStr(a.id, b.id));
  const everyMin = sorted.map((f) => v(ctx.doctrines[f.doctrineId]!.common.reportEveryMin));
  const topo: Topology = { nodes, links, liaison, hqIndex: new Map(sorted.map((f, i) => [f.id, i])), everyMin, along: new Map(), alongGen: ctx.world.churnGen };
  topologies.set(s, topo);

  // Every unit's way up, so the defaults the run will use are listed whatever happens.
  const ids = [...formations.map((f) => f.id), ...state.companies.map((c) => c.id)].sort(byStr);
  for (const id of ids) if (nodes.get(id)!.parentId !== null) hopToward(topo, ctx, id, rootOf(topo, id));

  const segments = Object.fromEntries(state.segments.map((x) => [x.id, x.holder]));
  const hqs = sorted.map((f): HqState => {
    const cs = f.companyIds.map((id) => byCompany.get(id)!).sort((a, b) => byStr(a.id, b.id));
    const lines = cs.filter((c) => c.role !== 'garrison' && c.role !== 'reserve' && c.objectiveLineId !== undefined).map((c) => `${c.objectiveLineId}|${c.sectorId}`);
    return {
      formationId: f.id,
      side: f.side,
      kind: f.kind,
      ...(f.leaderId !== undefined ? { leaderId: f.leaderId } : {}),
      picture: {
        segments: { ...segments },
        lines: Object.fromEntries(lines.filter((k, j) => lines.indexOf(k) === j).sort(byStr).map((k) => [k, null])),
        units: Object.fromEntries(cs.map((c) => [c.id, { status: c.status, men: c.men, atMin: state.minute }])),
      },
      pending: [],
      news: emptyNews(state.minute),
    };
  });
  const segmentOf = new Map(state.segments.map((x) => [x.id, x.holder]));
  return {
    ...state,
    hqs,
    messages: [],
    nextMessageId: 0,
    cutLines: [],
    fireMissions: [],
    lastReport: Object.fromEntries(
      state.companies.map((c) => [c.id, { status: c.status, men: c.men, holder: c.segmentId === undefined ? null : (segmentOf.get(c.segmentId) ?? null), atMin: state.minute }]),
    ),
  };
}

/** The tables key of a level's rear offset: a regiment counts as a brigade, a group as a corps. */
const REAR_KEY: Record<FormationKind, EffectKey> = {
  battalion: 'hqRearOffsetBattalionM',
  regiment: 'hqRearOffsetBrigadeM',
  brigade: 'hqRearOffsetBrigadeM',
  division: 'hqRearOffsetDivisionM',
  group: 'hqRearOffsetCorpsM',
  corps: 'hqRearOffsetCorpsM',
  army: 'hqRearOffsetArmyM',
};

/**
 * Where a headquarters stands: its `hqPosition`; else behind the middle of its companies' places at Zero by its
 * level's rear offset, straight back from the front (−x for the allied side, +x for the central, which attacks toward
 * −x), held inside the frame's extent; with neither, nowhere (its messages then have no distance and no shelled end).
 * The defaults are listed.
 */
function hqPlace(f: { id: string; kind: FormationKind; side: Side }, cs: readonly CompanyState[], given: Point | undefined, ctx: StepContext): Point | null {
  if (given) return given;
  if (cs.length === 0) {
    ctx.defaultsUsed.add(`formations[${f.id}].hqPosition ← none (no hqPosition and no companies: its messages have no distance or shelled end)`);
    return null;
  }
  const key = REAR_KEY[f.kind];
  const back = v(ctx.tables.effects[key]) * (f.side === 'allied' ? -1 : 1);
  let x = cs.reduce((a, c) => a + c.startX, 0) / cs.length + back;
  let y = cs.reduce((a, c) => a + c.startY, 0) / cs.length;
  const e = ctx.scenario.frame?.extent;
  let held = '';
  if (e) {
    const cx = Math.min(Math.max(x, e.minX), e.maxX);
    const cy = Math.min(Math.max(y, e.minY), e.maxY);
    if (cx !== x || cy !== y) held = ', held inside the frame extent';
    x = cx;
    y = cy;
  }
  ctx.defaultsUsed.add(`formations[${f.id}].hqPosition ← behind its companies by effects.${key}${held}`);
  return [x, y];
}

/** Where a formation's headquarters stands for the run (`hqPlace`); null: nowhere. */
export function hqPositionOf(ctx: StepContext, formationId: string): Point | null {
  return topologyOf(ctx).nodes.get(formationId)?.pos ?? null;
}

const emptyNews = (sentMin: number): HqNews => ({ units: [], segments: [], lines: [], sinceMin: null, urgent: false, aboutEventId: null, sentMin });

function topologyOf(ctx: StepContext): Topology {
  const t = topologies.get(ctx.scenario);
  if (!t) throw new Error('communications were not set up for this run (initComms)');
  return t;
}

// ---- routing --------------------------------------------------------------------------------------------------

const chainUp = (topo: Topology, id: string): string[] => {
  const out: string[] = [];
  for (let n = topo.nodes.get(id); n; n = n.parentId === null ? undefined : topo.nodes.get(n.parentId)) out.push(n.id);
  return out;
};
const rootOf = (topo: Topology, id: string): string => chainUp(topo, id).at(-1)!;

/** The channels of the link from one level to another of a side; null where the scenario links them by nothing. */
function linkOf(topo: Topology, side: Side, from: Kind, to: Kind): ChannelKind[] | null {
  if (topo.links === null) return ['runner'];
  if (from === 'company' || to === 'company') return null;
  return topo.links.get(`${side}|${from}|${to}`) ?? null;
}

/**
 * The next hop from `fromId` toward `finalId` (up, down, or up to their common formation): the nearest formation on
 * the way that a link from the sender's level reaches, else the next one, by runner (noted in defaultsUsed).
 */
function hopToward(topo: Topology, ctx: StepContext, fromId: string, finalId: string): string {
  const from = topo.nodes.get(fromId)!;
  const up = chainUp(topo, fromId);
  const down = chainUp(topo, finalId);
  let path: string[];
  const iUp = up.indexOf(finalId);
  const iDown = down.indexOf(fromId);
  if (iUp > 0) path = up.slice(1, iUp + 1);
  else if (iDown > 0) path = down.slice(0, iDown).reverse();
  else {
    const common = up.find((x) => down.includes(x));
    if (common === undefined) throw new Error(`no chain of command links ${fromId} to ${finalId}`);
    path = up.slice(1, up.indexOf(common) + 1);
  }
  if (path.length === 0) throw new Error(`${fromId} has nowhere to send to reach ${finalId}`);
  for (const id of path) if (linkOf(topo, from.side, from.kind, topo.nodes.get(id)!.kind)) return id;
  const to = topo.nodes.get(path[0]!)!;
  ctx.defaultsUsed.add(
    from.kind === 'company'
      ? `communications.links: ${from.side} company → ${to.kind} ← runner (the links have no company level)`
      : `communications.links: ${from.side} ${from.kind} → ${to.kind} ← runner (no link from ${from.kind} on the way)`,
  );
  return to.id;
}

/** The channels of a hop: the link between the two levels, else a runner; the liaison's call to the artillery by buried cable. */
function channelsOf(topo: Topology, fromId: string, toId: string): ChannelKind[] {
  if (toId === ARTILLERY) return ['buried-cable'];
  const from = topo.nodes.get(fromId)!;
  return linkOf(topo, from.side, from.kind, topo.nodes.get(toId)!.kind) ?? ['runner'];
}

// ---- a step's working copy ----------------------------------------------------------------------------------

type Work = {
  state: SimState;
  ctx: StepContext;
  topo: Topology;
  queue: Message[];
  nextId: number;
  cut: CutLine[];
  /** Cut pairs, looked up only. */
  cutSet: Map<string, CutLine['by']>;
  hqs: HqState[];
  /** Per HQ, the parts copied this step (UNITS | SEGMENTS | LINES | NEWS). */
  touched: number[];
  companies: CompanyState[] | null;
  missions: FireMission[];
  events: NewEvent[];
  /** The companies by id, made when first needed (looked up only). */
  companyAt: Map<string, CompanyState> | null;
};

function begin(state: SimState, ctx: StepContext): Work {
  return {
    state,
    ctx,
    topo: topologyOf(ctx),
    queue: [...state.messages],
    nextId: state.nextMessageId,
    cut: [...state.cutLines],
    cutSet: new Map(state.cutLines.map((x) => [x.pair, x.by])),
    hqs: [...state.hqs],
    touched: state.hqs.map(() => 0),
    companies: null,
    missions: [...state.fireMissions],
    events: [],
    companyAt: null,
  };
}

function finish(w: Work): SimState {
  const out: SimState = {
    ...w.state,
    messages: w.queue,
    nextMessageId: w.nextId,
    cutLines: w.cut.length === w.state.cutLines.length ? w.state.cutLines : [...w.cut].sort((a, b) => byStr(a.pair, b.pair)),
    hqs: w.hqs,
    fireMissions: w.missions,
    ...(w.companies ? { companies: w.companies } : {}),
  };
  return w.events.length ? emit(out, ...w.events) : out;
}

/** Insert in (dueMin, id) order. */
function enqueue(q: Message[], m: Message): void {
  let lo = 0;
  let hi = q.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const x = q[mid]!;
    if (x.dueMin < m.dueMin || (x.dueMin === m.dueMin && x.id < m.id)) lo = mid + 1;
    else hi = mid;
  }
  q.splice(lo, 0, m);
}

const companyAt = (w: Work): Map<string, CompanyState> => (w.companyAt ??= new Map((w.companies ?? w.state.companies).map((c) => [c.id, c])));

const posOf = (w: Work, id: string): Point | null => {
  const c = companyAt(w).get(id);
  if (c) return [c.x, c.y];
  return w.topo.nodes.get(id)?.pos ?? null;
};

/** A shell has landed in the 50 m cell holding p (points off the grid: none has). */
function shelledAt(w: Work, p: Point): boolean {
  const g = w.ctx.world;
  const cx = Math.floor((p[0] - g.originX) / CELL_M);
  const cy = Math.floor((p[1] - g.originY) / CELL_M);
  if (cx < 0 || cy < 0 || cx >= g.cols || cy >= g.rows) return false;
  return g.churn[cy * g.cols + cx]! > 0;
}

/** Points along a line every half cell (numerical method: no 50 m cell it crosses by more than a corner is missed). */
const ALONG_STEP_M = CELL_M / 2;

/** Whether shelling has churned any cell along the straight line from a to b, walking from a and stopping at the first. */
function shelledAlong(w: Work, a: Point, b: Point): boolean {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / ALONG_STEP_M));
  for (let k = 0; k <= n; k++) if (shelledAt(w, [a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n])) return true;
  return false;
}

/** The two ends of a line as one key, the same in both directions. */
const pairKey = (from: string, to: string): string => (from < to ? `${from}|${to}` : `${to}|${from}`);

/**
 * Whether the surface line between two places is cut by shelling. Between two headquarters (which stand still) the
 * answer is remembered by pair until the churn changes; a company's end moves, so its lines are walked each time.
 */
function shelledLine(w: Work, fromId: string, toId: string, a: Point | null, b: Point | null): boolean {
  if (!a || !b) return (a !== null && shelledAt(w, a)) || (b !== null && shelledAt(w, b));
  const fixed = w.topo.hqIndex.has(fromId) && w.topo.hqIndex.has(toId);
  if (!fixed) return shelledAlong(w, a, b);
  const topo = w.topo;
  if (topo.alongGen !== w.ctx.world.churnGen) {
    topo.along.clear();
    topo.alongGen = w.ctx.world.churnGen;
  }
  const key = pairKey(fromId, toId);
  let hit = topo.along.get(key);
  if (hit === undefined) topo.along.set(key, (hit = shelledAlong(w, a, b)));
  return hit;
}

/** Note a surface line cut, once. */
function noteCut(w: Work, pair: string, by: CutLine['by'], t: number): void {
  if (w.cutSet.has(pair)) return;
  w.cutSet.set(pair, by);
  w.cut.push({ pair, by, atMin: t });
}

/** The leader's (6 − orderSpeed) / 3 of a formation that sends an order; 1 for a formation with no leader or ratings (noted). */
function orderFactor(w: Work, formationId: string): number {
  const node = w.topo.nodes.get(formationId);
  const s = w.ctx.scenario;
  if (!node || node.kind === 'company') return 1;
  if (node.leaderId === undefined) {
    w.ctx.defaultsUsed.add(`formations[${formationId}] leader ← none (orderSpeed 3)`);
    return 1;
  }
  const leader = s.leaders.find((l) => l.id === node.leaderId);
  if (!leader?.ratings) {
    w.ctx.defaultsUsed.add(`leaders[${node.leaderId}].ratings.orderSpeed ← 3 (${leader ? 'no ratings given' : 'no such leader'})`);
    return 1;
  }
  return (6 - v(leader.ratings.orderSpeed)) / 3;
}

type Draft = Pick<Message, 'side' | 'kind' | 'payload'> & { aboutEventId?: number; finalId?: string };

/**
 * Send one hop from `fromId` to `toId` at minute t: the fastest channel not cut (after `prev`, when sending again),
 * its delay and its failure, drawn in that order.
 */
function sendHop(w: Work, d: Draft, fromId: string, toId: string, t: number, prev?: ChannelKind): void {
  const ctx = w.ctx;
  const a = posOf(w, fromId);
  const b = toId === ARTILLERY ? null : posOf(w, toId);
  const km = a && b ? Math.hypot(a[0] - b[0], a[1] - b[1]) / 1000 : 0;
  // A runner's delayMin already allows for runnerDelayCoversKm of his way; only the rest adds runnerMinPerKm.
  const beyondKm = Math.max(0, km - v(ctx.tables.effects.runnerDelayCoversKm));
  const perKm = v(ctx.tables.effects.runnerMinPerKm);
  const base = (ch: ChannelKind): number => v(ctx.tables.channels[ch].delayMin) + (ch === 'runner' ? perKm * beyondKm : 0);
  const order = [...channelsOf(w.topo, fromId, toId)].sort((x, y) => base(x) - base(y) || CHANNEL_KINDS.indexOf(x) - CHANNEL_KINDS.indexOf(y));
  const key = pairKey(fromId, toId);
  const isCut = (ch: ChannelKind): boolean => {
    if (ch !== 'surface-line') return false;
    if (w.cutSet.has(key)) return true;
    if (!shelledLine(w, fromId, toId, a, b)) return false;
    noteCut(w, key, 'shelling', t);
    return true;
  };
  const start = prev === undefined ? 0 : (order.indexOf(prev) + 1) % order.length;
  let channel: ChannelKind | undefined;
  for (let k = 0; k < order.length && channel === undefined; k++) {
    const ch = order[(start + k) % order.length]!;
    if (!isCut(ch)) channel = ch;
  }
  if (channel === undefined) {
    const from = w.topo.nodes.get(fromId)!;
    ctx.defaultsUsed.add(`communications: ${from.side} ${from.kind} → ${toId === ARTILLERY ? 'artillery' : w.topo.nodes.get(toId)!.kind} ← runner (every channel cut)`);
    channel = 'runner';
  }
  // A hop that would rather have used its surface line (no slower than the channel taken) and could not says why.
  const cutBy = channel !== 'surface-line' && order.includes('surface-line') && base('surface-line') <= base(channel) ? w.cutSet.get(key) : undefined;
  const factor = d.kind === 'order' ? orderFactor(w, fromId) : 1;
  const delay = base(channel) * (0.5 + ctx.rng()) * factor;
  const pLost = 1 - Math.exp((-v(ctx.tables.channels[channel].failPerHour) * delay) / 60);
  const lost = ctx.rng() < pLost;
  enqueue(w.queue, {
    id: w.nextId++,
    side: d.side,
    kind: d.kind,
    fromFormationId: fromId,
    toFormationId: toId,
    sentMin: t,
    dueMin: t + delay,
    channel,
    payload: d.payload,
    ...(d.aboutEventId !== undefined ? { aboutEventId: d.aboutEventId } : {}),
    ...(d.finalId !== undefined ? { finalId: d.finalId } : {}),
    ...(lost ? { lost: true as const } : {}),
    ...(cutBy !== undefined && channel !== 'surface-line' ? { factors: { cutBy } } : {}),
  });
}

/** Send a message toward its destination from `fromId` (its first hop, or the next from a headquarters it reached). */
function sendOn(w: Work, d: Draft, fromId: string, t: number): void {
  if (d.kind === 'call-for-fire') {
    if (w.topo.liaison.has(fromId)) return sendHop(w, { ...d, finalId: ARTILLERY }, fromId, ARTILLERY, t);
    if (w.topo.nodes.get(fromId)!.parentId === null) return answerCall(w, d, t);
    return sendHop(w, { ...d, finalId: ARTILLERY }, fromId, hopToward(w.topo, w.ctx, fromId, rootOf(w.topo, fromId)), t);
  }
  const finalId = d.finalId ?? rootOf(w.topo, fromId);
  const to = hopToward(w.topo, w.ctx, fromId, finalId);
  sendHop(w, to === finalId || d.kind === 'report' ? { ...d, finalId: undefined } : { ...d, finalId }, fromId, to, t);
}

/**
 * Queue a message from `fromFormationId` (a formation or a company) to `toFormationId`: a report to the headquarters
 * it names (one hop); an order to the formation it is for, hop by hop; a call for fire to the artillery (its
 * `toFormationId` is ignored). Draws from the run's rng (two draws for each hop sent).
 */
export function send(
  state: SimState,
  ctx: StepContext,
  msg: Pick<Message, 'side' | 'kind' | 'fromFormationId' | 'toFormationId' | 'sentMin' | 'payload'> & { aboutEventId?: number },
): SimState {
  const w = begin(state, ctx);
  const d: Draft = { side: msg.side, kind: msg.kind, payload: msg.payload, ...(msg.aboutEventId !== undefined ? { aboutEventId: msg.aboutEventId } : {}) };
  if (msg.kind === 'report') sendHop(w, d, msg.fromFormationId, msg.toFormationId, msg.sentMin);
  else sendOn(w, { ...d, finalId: msg.toFormationId }, msg.fromFormationId, msg.sentMin);
  return finish(w);
}

// ---- delivery ---------------------------------------------------------------------------------------------------

const nameOf = (w: Work, id: string): string => (id === ARTILLERY ? 'the artillery' : (w.topo.nodes.get(id)?.name ?? id));
const KIND_TEXT: Record<Message['kind'], string> = { report: 'Report', order: 'Order', 'call-for-fire': 'Call for fire' };

function deliver(w: Work, m: Message): void {
  const t = m.dueMin;
  if (m.lost) {
    const unit = companyAt(w).has(m.fromFormationId) ? m.fromFormationId : companyAt(w).has(m.toFormationId) ? m.toFormationId : undefined;
    w.events.push({
      minute: w.state.minute,
      kind: 'message-lost',
      ...(unit !== undefined ? { unitId: unit } : {}),
      text: `${KIND_TEXT[m.kind]} from ${nameOf(w, m.fromFormationId)} to ${nameOf(w, m.toFormationId)} lost (${m.channel}); sent again`,
      causes: ['lost-contact'],
      refs: m.aboutEventId !== undefined ? [m.aboutEventId] : [],
      factors: { sentMin: round(m.sentMin, 1), lostAtMin: round(t, 1) },
    });
    if (m.channel === 'surface-line') noteCut(w, pairKey(m.fromFormationId, m.toFormationId), 'failure', t);
    const d: Draft = { side: m.side, kind: m.kind, payload: m.payload, ...(m.aboutEventId !== undefined ? { aboutEventId: m.aboutEventId } : {}), ...(m.finalId !== undefined ? { finalId: m.finalId } : {}) };
    return sendHop(w, d, m.fromFormationId, m.toFormationId, t, m.channel);
  }
  const d: Draft = { side: m.side, kind: m.kind, payload: m.payload, ...(m.aboutEventId !== undefined ? { aboutEventId: m.aboutEventId } : {}) };
  if (m.kind === 'call-for-fire') return m.toFormationId === ARTILLERY ? answerCall(w, d, t) : sendOn(w, d, m.toFormationId, t);
  if (m.kind === 'order') {
    if (m.finalId !== undefined && m.finalId !== m.toFormationId) return sendOn(w, { ...d, finalId: m.finalId }, m.toFormationId, t);
    return deliverOrder(w, m.toFormationId, m.payload as Order);
  }
  merge(w, m.toFormationId, m.payload as Report, t, m.aboutEventId);
}

/** The parts of an HQ a step has copied for writing (bits). */
const UNITS = 1;
const SEGMENTS = 2;
const LINES = 4;
const NEWS = 8;

/** An HQ for writing the parts named (bits): each part copied once a step, the rest shared with the step before. */
function hqForWrite(w: Work, i: number, parts: number): HqState {
  const need = parts & ~w.touched[i]!;
  if (need) {
    const h = w.hqs[i]!;
    const p = h.picture;
    w.hqs[i] = {
      ...h,
      picture: need & (UNITS | SEGMENTS | LINES) ? { segments: need & SEGMENTS ? { ...p.segments } : p.segments, lines: need & LINES ? { ...p.lines } : p.lines, units: need & UNITS ? { ...p.units } : p.units } : p,
      news: need & NEWS ? { ...h.news, units: [...h.news.units], segments: [...h.news.segments], lines: [...h.news.lines] } : h.news,
    };
    w.touched[i]! |= need;
  }
  return w.hqs[i]!;
}

const addKey = (xs: string[], k: string): void => {
  if (!xs.includes(k)) xs.push(k);
};

/** A report reaches an HQ at t: what is newer goes into its picture; news that changed something urgent goes up at once. */
function merge(w: Work, hqId: string, r: Report, t: number, aboutEventId: number | undefined): void {
  const i = w.topo.hqIndex.get(hqId);
  if (i === undefined) throw new Error(`a report reached "${hqId}", which is no headquarters`);
  const was = w.hqs[i]!.picture;
  // What is new, read first, so only the parts that change are copied.
  const units = Object.keys(r.units).sort(byStr).filter((id) => {
    const u = r.units[id]!;
    const cur = was.units[id];
    return !cur || (u.atMin >= cur.atMin && (cur.status !== u.status || cur.men !== u.men || cur.atMin !== u.atMin));
  });
  const segments = Object.keys(r.segments).sort(byStr).filter((id) => was.segments[id] !== r.segments[id]);
  const lines = Object.keys(r.lines).sort(byStr).filter((k) => r.lines[k] !== null && r.lines[k] !== undefined && (was.lines[k] === null || was.lines[k] === undefined));
  if (units.length + segments.length + lines.length === 0) return;
  const top = w.topo.nodes.get(hqId)!.parentId === null;
  const h = hqForWrite(w, i, (units.length ? UNITS : 0) | (segments.length ? SEGMENTS : 0) | (lines.length ? LINES : 0) | (top ? 0 : NEWS));
  const pic = h.picture;
  let urgent = segments.length + lines.length > 0;
  for (const id of units) {
    const u = r.units[id]!;
    if (pic.units[id]?.status !== u.status) urgent = true;
    pic.units[id] = { status: u.status, men: u.men, atMin: u.atMin };
    if (!top) addKey(h.news.units, id);
  }
  for (const id of segments) {
    pic.segments[id] = r.segments[id]!;
    if (!top) addKey(h.news.segments, id);
  }
  for (const k of lines) {
    pic.lines[k] = r.lines[k]!;
    if (!top) addKey(h.news.lines, k);
  }
  if (top) return;
  h.news.sinceMin ??= t;
  if (aboutEventId !== undefined) h.news.aboutEventId = Math.max(h.news.aboutEventId ?? -1, aboutEventId);
  if (urgent) h.news.urgent = true;
  if (h.news.urgent) forward(w, i, t);
}

/** An HQ sends what is new in its picture up to the next headquarters, at t. */
function forward(w: Work, i: number, t: number): void {
  const h = hqForWrite(w, i, NEWS);
  const n = h.news;
  const pic = h.picture;
  const report: Report = {
    atMin: t,
    units: Object.fromEntries([...n.units].sort(byStr).map((id) => [id, { ...pic.units[id]! }])),
    segments: Object.fromEntries([...n.segments].sort(byStr).map((id) => [id, pic.segments[id]!])),
    lines: Object.fromEntries([...n.lines].sort(byStr).map((k) => [k, pic.lines[k] ?? null])),
  };
  const about = n.aboutEventId;
  h.news = emptyNews(t);
  sendOn(w, { side: h.side, kind: 'report', payload: report, ...(about !== null ? { aboutEventId: about } : {}) }, h.formationId, t);
}

/** The minute an HQ's routine summary is due: reportEveryMin after its last, once it has news (none at the top); Infinity: none. */
const cadenceDue = (topo: Topology, h: HqState, i: number): number =>
  h.news.sinceMin === null ? Infinity : Math.max(h.news.sentMin + topo.everyMin[i]!, h.news.sinceMin);

/** An order reaches the formation it is for: every company under it holds it. */
function deliverOrder(w: Work, formationId: string, o: Order): void {
  const cs = w.companies ?? w.state.companies;
  w.companies = cs.map((c) => (c.formationPath.includes(formationId) ? { ...c, orders: [...c.orders, o] } : c));
  w.companyAt = null;
}

/**
 * A call for fire reaches the artillery at t: `callForFireGuns` guns of the side's nearest batteries in action (by
 * distance to the segment; none placed come last, by id), less those already answering a call then, fire on it for
 * `callForFireMin`. Creeping and machine-gun barrage batteries keep to the timetable. A call no gun can answer leaves a
 * mission with no guns; a call on a segment with no trench to aim at is dropped.
 */
function answerCall(w: Work, d: Draft, t: number): void {
  const ctx = w.ctx;
  const call = d.payload as CallForFire;
  const seg = w.state.segments.find((x) => x.id === call.segmentId);
  if (!seg) return;
  const pts = segmentSamples(ctx, seg, w.state.companies);
  // A segment with no trench to aim at (no samples) cannot be fired on: the call goes unanswered.
  if (pts.length === 0) return;
  const centre: Point = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
  const dur = v(ctx.tables.effects.callForFireMin);
  const busy = (b: BatteryState): number =>
    w.missions.filter((m) => m.toMin > t && m.fromMin < t + dur).reduce((a, m) => a + m.guns.filter((g) => g.batteryId === b.id).reduce((x, g) => x + g.guns, 0), 0);
  const ready = w.state.batteries
    .filter((b) => b.side === d.side && b.role !== 'creeping' && b.role !== 'mg-barrage' && !b.captured && b.ammoLeft > 0 && (b.suppressedUntilMin === null || b.suppressedUntilMin <= t))
    .map((b) => ({ b, dist: b.position ? Math.hypot(b.position[0] - centre[0], b.position[1] - centre[1]) : Infinity }))
    .sort((p, q) => p.dist - q.dist || byStr(p.b.id, q.b.id));
  let need = v(ctx.tables.effects.callForFireGuns);
  const guns: FireMission['guns'] = [];
  for (const { b } of ready) {
    if (!(need > 0)) break;
    const n = Math.min(need, b.guns - busy(b));
    if (!(n > 0)) continue;
    guns.push({ batteryId: b.id, guns: n });
    need -= n;
  }
  w.missions.push({ id: w.nextId++, side: d.side, segmentId: seg.id, byUnitId: call.byUnitId, fromMin: t, toMin: t + dur, guns, refs: d.aboutEventId !== undefined ? [d.aboutEventId] : [] });
}

// ---- the phases -------------------------------------------------------------------------------------------------

/**
 * The comms phase: deliver every message due by the step's end and every routine summary due, each at its own
 * minute, in time order (messages in (dueMin, id) order; a summary due at the same minute as a message after it),
 * into the receiving headquarters' pictures, and pass on what goes further.
 */
export function commsPhase(state: SimState, ctx: StepContext): SimState {
  const M = state.minute;
  const topo = topologyOf(ctx);
  const anyDue = (state.messages[0] !== undefined && state.messages[0].dueMin <= M) || state.hqs.some((h, i) => cadenceDue(topo, h, i) <= M);
  if (!anyDue) return state;
  const w = begin(state, ctx);
  for (;;) {
    const head = w.queue[0];
    const tm = head && head.dueMin <= M ? head.dueMin : Infinity;
    let ti = -1;
    let tc = Infinity;
    // Only HQs holding news can have a summary due (most send theirs at once).
    for (let i = 0; i < w.hqs.length; i++) {
      const h = w.hqs[i]!;
      if (h.news.sinceMin === null) continue;
      const due = cadenceDue(topo, h, i);
      if (due <= M && due < tc) {
        tc = due;
        ti = i;
      }
    }
    if (tm === Infinity && tc === Infinity) break;
    if (tm <= tc) deliver(w, w.queue.shift()!);
    else forward(w, ti, tc);
  }
  return finish(w);
}

/**
 * The end of a step (the log phase): every company whose status changed, that took a segment, whose own segment
 * changed hands, or whose objective line was taken reports to its battalion; so does one whose men have changed since
 * its last report once `reportEveryMin` (its doctrine) has passed since then (a routine report: at most one a period,
 * and none while nothing changed). A company newly pinned calls for fire on the nearest segment the enemy holds within
 * `observerRangeM`. Companies in ascending id order, the report before the call. Companies off the map report nothing.
 * A report is about the company's last event this step (not a message lost), else the line taken, else its segment's
 * change of hands, else the last fire on it.
 */
export function companyReports(state: SimState, ctx: StepContext): SimState {
  const M = state.minute;
  const holderOf = new Map(state.segments.map((x) => [x.id, x]));
  const took = new Map<string, string[]>();
  const lastEvent = new Map<string, number>();
  const linesTaken = new Map<string, number>();
  for (const e of state.events) {
    if (e.unitId !== undefined && e.kind !== 'message-lost') lastEvent.set(e.unitId, e.id);
    if ((e.kind === 'segment-lost' || e.kind === 'segment-retaken') && e.unitId !== undefined && e.segmentId !== undefined) took.set(e.unitId, [...(took.get(e.unitId) ?? []), e.segmentId]);
    if (e.kind === 'line-taken') linesTaken.set(`${e.lineId}|${e.sectorId}`, e.id);
  }
  let w: Work | null = null;
  let last: SimState['lastReport'] | null = null;
  const range = v(ctx.tables.effects.observerRangeM);
  // Segments change hands only with a segment-lost or segment-retaken event: without one, no holder is looked at.
  const anySeg = took.size > 0;
  const every = (c: CompanyState): number => v(ctx.doctrines[c.doctrineId]!.common.reportEveryMin);
  for (const c of state.companies) {
    if (c.status === 'off-map') continue;
    const before = state.lastReport[c.id] ?? { status: c.status, men: c.men, holder: null, atMin: M };
    const routine = c.men !== before.men && M >= before.atMin + every(c);
    if (!anySeg && !routine && before.status === c.status && !(c.status === 'consolidating' && linesTaken.size)) continue;
    const own = c.segmentId === undefined ? undefined : holderOf.get(c.segmentId);
    const holder = own ? own.holder : null;
    const taken = took.get(c.id) ?? [];
    const key = c.status === 'consolidating' && linesTaken.size ? `${c.objectiveLineId}|${c.sectorId}` : '';
    const lineEvent = key ? linesTaken.get(key) : undefined;
    const statusChanged = before.status !== c.status;
    const segChanged = own !== undefined && before.holder !== holder;
    if (!routine && !statusChanged && !segChanged && taken.length === 0 && lineEvent === undefined) continue;
    w ??= begin(state, ctx);
    last ??= { ...state.lastReport };
    last[c.id] = { status: c.status, men: c.men, holder, atMin: M };
    const segments: Report['segments'] = {};
    for (const id of taken) segments[id] = holderOf.get(id)!.holder;
    if (segChanged) segments[own!.id] = holder!;
    const report: Report = { atMin: M, units: { [c.id]: { status: c.status, men: c.men, atMin: M } }, segments, lines: lineEvent !== undefined ? { [key]: M } : {} };
    const segEvent = segChanged && own!.holderEventId !== null ? own!.holderEventId : undefined;
    const fireEvent = c.recentFire.at(-1)?.eventId;
    const about = lastEvent.get(c.id) ?? lineEvent ?? segEvent ?? (fireEvent === null ? undefined : fireEvent);
    sendOn(w, { side: c.side, kind: 'report', payload: report, ...(about !== undefined ? { aboutEventId: about } : {}) }, c.id, M);
    if (statusChanged && c.status === 'pinned') {
      const p: Point = [c.x, c.y];
      let best: { id: string; d: number } | null = null;
      for (const x of state.segments) {
        if (x.holder === c.side || x.yMin - range > c.y || x.yMax + range < c.y) continue;
        const d = distanceTo(segmentSamples(ctx, x, state.companies), p);
        if (d <= range && (!best || d < best.d)) best = { id: x.id, d };
      }
      if (best) {
        const call: CallForFire = { segmentId: best.id, byUnitId: c.id, atMin: M };
        sendOn(w, { side: c.side, kind: 'call-for-fire', payload: call, ...(about !== undefined ? { aboutEventId: about } : {}) }, c.id, M);
      }
    }
  }
  if (!w) return state;
  return { ...finish(w), lastReport: last! };
}

// ---- scheduled minutes ------------------------------------------------------------------------------------------

/**
 * A call for fire is answered where it arrives: at the artillery (the liaison's buried-cable call), or at the top of the
 * chain with no liaison there.
 */
const answersOnArrival = (topo: Topology, m: Message): boolean =>
  m.toFormationId === ARTILLERY || (topo.nodes.get(m.toFormationId)?.parentId === null && !topo.liaison.has(m.toFormationId));

/**
 * Messages' due minutes, and companies' and headquarters' routine reports. A report, or a call for fire on its way,
 * moves nobody. Two arrivals end a quiet step before them (`startsMovement`), so that the step they fall in is a fine
 * step: an order reaching the formation it is for (the command model sets units moving on it), and a call for fire
 * reaching the guns that answer it (fire that opens inside a quiet step would charge its per-step effects, such as
 * fatigue under fire, for the whole of that step).
 */
export function messageDueTimes(state: SimState, ctx: StepContext): Scheduled[] {
  const topo = topologyOf(ctx);
  const out: Scheduled[] = state.messages.map((m) => ({
    minute: m.dueMin,
    startsMovement: !m.lost && (m.kind === 'order' ? m.finalId === undefined || m.finalId === m.toFormationId : m.kind === 'call-for-fire' && answersOnArrival(topo, m)),
  }));
  // A company's routine report, once its men have changed since its last.
  for (const c of state.companies) {
    const last = state.lastReport[c.id];
    if (last && c.status !== 'off-map' && c.men !== last.men) out.push({ minute: last.atMin + v(ctx.doctrines[c.doctrineId]!.common.reportEveryMin), startsMovement: false });
  }
  if (state.hqs.some((h) => h.news.sinceMin !== null)) {
    state.hqs.forEach((h, i) => {
      const due = cadenceDue(topo, h, i);
      if (due < Infinity) out.push({ minute: due, startsMovement: false });
    });
  }
  return out;
}

/** The minutes fire on call stops. Fire moves nobody. */
export const fireMissionEnds = (state: SimState): Scheduled[] => state.fireMissions.map((m) => ({ minute: m.toMin, startsMovement: false }));

