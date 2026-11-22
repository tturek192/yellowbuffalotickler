import { CHANNEL_KINDS, v } from '@wwi/scenario';
import type { ChannelKind, EffectKey, Formation, Point, Scenario } from '@wwi/scenario';
import { distanceTo, segmentSamples } from './artillery';
import { emit } from './causes';
import type { NewEvent } from './causes';
import type { CompanyState } from './companies';
import { CELL_M } from './ground';
import { lineXAt } from './geometry';
import { visibility, visibilityM } from './light';
import { featurePoints as featurePointsOf, pointRadiusM } from './segments';
import { sightFrom } from './sight';
import { lineTakerOf, segmentDefenders, segmentsOnLine, segmentById } from './trenches';
import { round } from './record';
import type { Scheduled } from './schedule';
import { onField } from './step';
import type { SimState, StepContext } from './step';
import type { BatteryState, CallForFire, CutLine, EnemyKnown, FireMission, FormationKind, HqNews, HqState, Message, Order, Report, Side } from './types';

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
 * hands or its line is taken or lost again (`companyReports`, at the end of the step). Each report also tells of the
 * enemy it sees: for each segment the enemy holds that it can see some of (within the visibility and `observerRangeM`, in
 * its line of sight: `eyesOf`), the enemy's men up in it (Task 12, for the command model's force ratios). A headquarters merges a report into its picture (with when each segment changed hands,
 * the lines lost again, the enemy seen, and the event each piece was about) and passes a summary of what is new up to
 * the next headquarters: at once when a unit's status, a segment's holder or a line changed, otherwise
 * `reportEveryMin` (doctrine) after its last summary; news of the enemy alone goes up with the next summary.
 *
 * Calls for fire. A company that is pinned calls for fire on the nearest segment held by the enemy that it can see some
 * of (the same test). The call goes up the chain until it reaches a formation the scenario's `liaison` covers, which
 * passes it to the artillery by buried cable (its delayMin: the liaison officer's call); with no liaison on the way it
 * reaches the top of the chain, where the artillery is commanded. On arrival `callForFireGuns` guns of the nearest
 * batteries of the side in action (not the creeping or machine-gun barrage, which keep the timetable) fire on the
 * segment for `callForFireMin`, taken off their own task (artillery.ts); it falls on the enemy there, never on the
 * caller's side, even if the segment has changed hands by then.
 *
 * Orders are delivered to the companies of the formation (or the company) they are addressed to that the order names
 * (`Order.unitIds`; every one when it names none); deciding them is the command model's (Task 12, command.ts). Every number is data: the channels' delayMin and failPerHour, the effects keys
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
  // Behind its companies on the map: an off-map reserve's companies count only for a formation that has no others.
  for (const f of formations) {
    const cs = f.companyIds.map((id) => byCompany.get(id)!);
    const on = cs.filter((c) => c.status !== 'off-map');
    f.pos = hqPlace(f, on.length ? on : cs, given.get(f.id), ctx);
  }
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
  const intel = { allied: intelligence(state, ctx, 'allied'), central: intelligence(state, ctx, 'central') };
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
        segmentsAt: {},
        linesLost: {},
        plans: {},
        enemy: { ...intel[f.side] },
        about: {},
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
    lastReport: new Map(
      state.companies.map((c) => [c.id, { status: c.status, men: c.men, holder: c.segmentId === undefined ? null : (segmentOf.get(c.segmentId) ?? null), atMin: state.minute }]),
    ),
  };
}

/** An operation's target place that no segment of its own covers: its ground is the place itself (Task 12). */
export type Place = { key: string; featureId: string; point: Point; radiusM: number };
const placesCache = new WeakMap<StepContext, Place[]>();

/** The target places of the scenario's operations whose feature has no segment, in feature-id order (worked out once). */
export function operationPlaces(state: Pick<SimState, 'segments'>, ctx: StepContext): Place[] {
  let out = placesCache.get(ctx);
  if (out) return out;
  const ids = new Set<string>();
  for (const op of ctx.scenario.operations ?? []) if ('featureId' in op.target && !state.segments.some((x) => x.featureId === (op.target as { featureId: string }).featureId)) ids.add(op.target.featureId);
  out = [...ids].sort(byStr).flatMap((id): Place[] => {
    const f = ctx.scenario.features.find((x) => x.id === id);
    if (!f) return [];
    const pts = featurePointsOf(f);
    if (pts.length === 0) return [];
    const point: Point = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
    return [{ key: `place:${id}`, featureId: id, point, radiusM: Math.max(pointRadiusM(f, ctx.tables, ctx.defaultsUsed), v(ctx.tables.effects.captureRadiusM)) }];
  });
  placesCache.set(ctx, out);
  return out;
}

/**
 * The ground of an attacked line that runs along no segment (Task 12, the fix round): the stretch of its sector between
 * the line before it and this one, `lineFeatureMatchM` beyond each, `line:<lineId>|<sectorId>`. `side`: the side that
 * attacks it (in the plan, or by an operation).
 */
export type LineZone = { key: string; lineKey: string; side: Side; sectorId: string; yMin: number; yMax: number; prev: Point[]; line: Point[] };
const zonesCache = new WeakMap<StepContext, LineZone[]>();

export function lineZones(state: Pick<SimState, 'segments' | 'companies'>, ctx: StepContext): LineZone[] {
  let out = zonesCache.get(ctx);
  if (out) return out;
  // The lines attacked in each sector: by the plan's companies, and by the operations.
  const keys = new Map<string, Side>();
  for (const c of state.companies) if (c.objectiveLineId !== undefined && c.role !== 'garrison' && c.role !== 'reserve') keys.set(`${c.objectiveLineId}|${c.sectorId}`, c.side);
  for (const op of ctx.scenario.operations ?? []) if ('lineId' in op.target) keys.set(`${op.target.lineId}|${op.target.sectorId}`, op.side);
  out = [];
  for (const lineKey of [...keys.keys()].sort(byStr)) {
    const [lineId, sectorId] = lineKey.split('|') as [string, string];
    const sector = ctx.scenario.sectors.find((x) => x.id === sectorId);
    const line = ctx.lines.get(lineId);
    if (!sector || !line || segmentsOnLine(state as SimState, ctx, lineId, sectorId).length > 0) continue;
    // The line before it: of the sector's start line, its timetable's lines and the other lines attacked in it, the
    // last one short of this one at the sector's middle.
    const yMid = (sector.yMin + sector.yMax) / 2;
    const x = lineXAt(line, yMid);
    const candidates = [sector.startLineId, ...sector.legs.map((l) => l.toLineId), ...[...keys.keys()].filter((k) => k.endsWith(`|${sectorId}`)).map((k) => k.split('|')[0]!)];
    let prevId = sector.startLineId;
    let prevX = -Infinity;
    for (const id of candidates) {
      const pts = ctx.lines.get(id);
      if (!pts || id === lineId) continue;
      const px = lineXAt(pts, yMid);
      if (px < x && px > prevX) [prevId, prevX] = [id, px];
    }
    const prev = ctx.lines.get(prevId);
    if (!prev) continue;
    out.push({ key: `line:${lineKey}`, lineKey, side: keys.get(lineKey)!, sectorId, yMin: sector.yMin, yMax: sector.yMax, prev, line });
  }
  zonesCache.set(ctx, out);
  return out;
}

/** Whether a place lies in a line's ground, its x within `slack` of the zone's (inclusive). */
export function inZone(z: LineZone, x: number, y: number, match: number, slack = 0): boolean {
  if (y < z.yMin - slack || y > z.yMax + slack) return false;
  const yy = Math.min(Math.max(y, z.yMin), z.yMax);
  return x >= lineXAt(z.prev, yy) - match - slack && x <= lineXAt(z.line, yy) + match + slack;
}

/** A company's men at Zero, before the bombardment: what the other side's intelligence counted. */
const zeroMen = (c: CompanyState): number => c.men + c.bombardment.killed + c.bombardment.wounded;

/**
 * The pre-battle intelligence picture of a side (Task 12; spec 13: aerial photography and raids gave the Canadians a
 * detailed picture of the defences, and the Germans knew the Canadian front line): the enemy companies on the map at
 * their Zero places and strengths (never the off-map reserves), by ground. On an enemy trench segment: the enemy within
 * `captureRadiusM` of it (its garrison and those who stand on it). On a segment of its own side's trench: the enemy
 * attackers facing it (their Zero y inside its y range), what would be there if it were lost. On an operation's target
 * place: the enemy within its radius. Ground with no enemy found gets no entry: it stays unknown.
 */
function intelligence(state: SimState, ctx: StepContext, side: Side): Record<string, EnemyKnown> {
  const r = v(ctx.tables.effects.captureRadiusM);
  const enemies = state.companies.filter((c) => c.side !== side && c.status !== 'off-map' && c.status !== 'marching');
  const out: Record<string, EnemyKnown> = {};
  // `kept`: an estimate reports of men up do not override (an enemy trench, a line's ground: see EnemyKnown).
  const put = (key: string, men: number, kept = false): void => {
    if (men > 0) out[key] = { men, atMin: state.minute, intel: true, ...(kept ? { base: men } : {}) };
  };
  for (const seg of state.segments) {
    if (seg.garrisonSide !== side) {
      const pts = segmentSamples(ctx, seg, state.companies);
      put(seg.id, enemies.reduce((a, c) => a + (c.segmentId === seg.id || (pts.length > 0 && distanceTo(pts, [c.startX, c.startY]) <= r) ? zeroMen(c) : 0), 0), true);
    } else put(seg.id, enemies.reduce((a, c) => a + (c.role !== 'reserve' && c.role !== 'garrison' && c.startY >= seg.yMin && c.startY <= seg.yMax ? zeroMen(c) : 0), 0));
  }
  for (const p of operationPlaces(state, ctx)) put(p.key, enemies.reduce((a, c) => a + (Math.hypot(c.startX - p.point[0], c.startY - p.point[1]) <= p.radiusM ? zeroMen(c) : 0), 0));
  // An objective line's ground lies in the defence system the attacker photographed: intelligence knows it, even empty.
  const match = v(ctx.tables.effects.lineFeatureMatchM);
  for (const z of lineZones(state, ctx))
    if (z.side === side) {
      const men = enemies.reduce((a, c) => a + (inZone(z, c.startX, c.startY, match) ? zeroMen(c) : 0), 0);
      out[z.key] = { men, atMin: state.minute, intel: true, base: men };
    }
  return out;
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

/**
 * An off-map reserve's battalion headquarters moves with its companies when they come on to the map (Task 13): it stands
 * behind the places they are going to at the front by the battalion's rear offset, by `hqPlace`'s rule (held inside the
 * frame's extent), as the battalions on the map stand behind their companies. Mutates the run's comms topology (one per
 * run), and forgets what was worked out from the old place (the shelled lines along its links).
 */
export function moveHq(ctx: StepContext, formationId: string, places: readonly Point[]): void {
  const topo = topologyOf(ctx);
  const n = topo.nodes.get(formationId);
  if (!n || n.kind === 'company' || places.length === 0) return;
  const key = REAR_KEY[n.kind];
  const back = v(ctx.tables.effects[key]) * (n.side === 'allied' ? -1 : 1);
  let x = places.reduce((a, p) => a + p[0], 0) / places.length + back;
  let y = places.reduce((a, p) => a + p[1], 0) / places.length;
  const e = ctx.scenario.frame?.extent;
  if (e) {
    x = Math.min(Math.max(x, e.minX), e.maxX);
    y = Math.min(Math.max(y, e.minY), e.maxY);
  }
  n.pos = [x, y];
  topo.along.clear();
  ctx.defaultsUsed.add(`formations[${formationId}].hqPosition ← moves with its companies to behind their places at the front by effects.${key} (an off-map reserve's battalion)`);
}

/** Where a formation's headquarters stands for the run (`hqPlace`); null: nowhere. */
export function hqPositionOf(ctx: StepContext, formationId: string): Point | null {
  return topologyOf(ctx).nodes.get(formationId)?.pos ?? null;
}

const emptyNews = (sentMin: number): HqNews => ({ units: [], segments: [], lines: [], enemy: [], plans: [], sinceMin: null, urgent: false, aboutEventId: null, sentMin });

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
  companyAt: ById | null;
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

const companyAt = (w: Work): ById => (w.companyAt ??= byIdOf(w.companies ?? w.state.companies));

/**
 * The companies by id. Every state's companies are the same ids in the same order, so each id's place is worked out once
 * (and checked on each look-up: a list of other ids is looked through).
 */
type ById = { get(id: string): CompanyState | undefined; has(id: string): boolean };
let places: Map<string, number> = new Map();
/** Lists whose every id is where `places` says (checked once for each list). */
const placed = new WeakSet<readonly CompanyState[]>();
function byIdOf(cs: readonly CompanyState[]): ById {
  if (!placed.has(cs)) {
    if (places.size !== cs.length || cs.some((c, k) => places.get(c.id) !== k)) places = new Map(cs.map((c, k) => [c.id, k]));
    placed.add(cs);
  }
  const at = places;
  const get = (id: string): CompanyState | undefined => {
    const i = at.get(id);
    return i === undefined ? undefined : cs[i];
  };
  return { get, has: (id) => at.has(id) };
}

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
  const delay = base(channel) * (0.5 + ctx.rngs.comms()) * factor;
  const pLost = 1 - Math.exp((-v(ctx.tables.channels[channel].failPerHour) * delay) / 60);
  const lost = ctx.rngs.comms() < pLost;
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

/**
 * An HQ's planned counter-attack has gone in or been given up at minute t (Task 13): it notes it in its own picture and
 * reports it at once to the headquarters above, which pass it on as urgent news, so it reaches each over the channels
 * with their delays. `aboutEventId`: the `counter-attack-ordered` or `counter-attack-dropped` event.
 */
export function reportPlan(state: SimState, ctx: StepContext, hqId: string, t: number, aboutEventId: number): SimState {
  const w = begin(state, ctx);
  const i = w.topo.hqIndex.get(hqId)!;
  hqForWrite(w, i, PLANS).picture.plans[hqId] = t;
  if (w.topo.nodes.get(hqId)!.parentId !== null) {
    const report: Report = { atMin: t, units: {}, segments: {}, lines: {}, plans: { [hqId]: t } };
    sendOn(w, { side: w.hqs[i]!.side, kind: 'report', payload: report, aboutEventId }, hqId, t);
  }
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

/** The parts of an HQ a step has copied for writing (bits): segments with their minutes, lines with those lost. */
const UNITS = 1;
const SEGMENTS = 2;
const LINES = 4;
const NEWS = 8;
const ENEMY = 16;
const ABOUT = 32;
const PLANS = 64;
const PICTURE = UNITS | SEGMENTS | LINES | ENEMY | ABOUT | PLANS;

/**
 * A copy of a picture's `about` to write to: a fresh object over the one before (its prototype), so a copy costs nothing
 * however much the HQ knows; every LAYERS_MAX copies they are flattened into one. `about` is only ever read by key
 * (command.ts `aboutOf`), never listed or spread, so a key reads the same either way.
 */
const LAYERS_MAX = 32;
const layerDepth = new WeakMap<object, number>();
function layered<T extends Record<string, number>>(o: T): T {
  const depth = layerDepth.get(o) ?? 0;
  if (depth < LAYERS_MAX) {
    const next = Object.create(o) as T;
    layerDepth.set(next, depth + 1);
    return next;
  }
  const flat = {} as Record<string, number>;
  for (const k in o) flat[k] = o[k]!;
  return flat as T;
}

/** An HQ for writing the parts named (bits): each part copied once a step, the rest shared with the step before. */
function hqForWrite(w: Work, i: number, parts: number): HqState {
  const need = parts & ~w.touched[i]!;
  if (need) {
    const h = w.hqs[i]!;
    const p = h.picture;
    w.hqs[i] = {
      ...h,
      picture: need & PICTURE
        ? {
            segments: need & SEGMENTS ? { ...p.segments } : p.segments,
            segmentsAt: need & SEGMENTS ? { ...p.segmentsAt } : p.segmentsAt,
            lines: need & LINES ? { ...p.lines } : p.lines,
            linesLost: need & LINES ? { ...p.linesLost } : p.linesLost,
            units: need & UNITS ? { ...p.units } : p.units,
            enemy: need & ENEMY ? { ...p.enemy } : p.enemy,
            about: need & ABOUT ? layered(p.about) : p.about,
            plans: need & PLANS ? { ...p.plans } : p.plans,
          }
        : p,
      news: need & NEWS ? { ...h.news, units: [...h.news.units], segments: [...h.news.segments], lines: [...h.news.lines], enemy: [...h.news.enemy], plans: [...h.news.plans] } : h.news,
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
  // A line taken: news unless it is known taken, or known lost since (a stale report). A line lost: news if it is known
  // taken before then (Task 12).
  const lines = Object.keys(r.lines).sort(byStr).filter((k) => {
    const x = r.lines[k];
    return x !== null && x !== undefined && (was.lines[k] === null || was.lines[k] === undefined) && !((was.linesLost[k] ?? -Infinity) >= x);
  });
  const lost = r.lost ? Object.keys(r.lost).sort(byStr).filter((k) => typeof was.lines[k] === 'number' && r.lost![k]! >= was.lines[k]!) : [];
  // The enemy seen: news when the men differ from what it knows (Task 12).
  // What the report changes in its belief of the enemy (`believe`); nothing when it says nothing new.
  const side = w.hqs[i]!.side;
  const believed = new Map<string, EnemyKnown>();
  if (r.enemy)
    for (const id of Object.keys(r.enemy).sort(byStr)) {
      const cur = was.enemy[id];
      const e = r.enemy[id]!;
      if (e.atMin < (cur?.atMin ?? -Infinity)) continue;
      const next = believe(cur, e, keepsEstimate(w, id, side, was.segments[id]));
      if (next) believed.set(id, next);
    }
  const enemy = [...believed.keys()];
  // A planned counter-attack gone in or given up (Task 13): news when newer than what it knows.
  const plans = r.plans ? Object.keys(r.plans).sort(byStr).filter((k) => !((was.plans[k] ?? -Infinity) >= r.plans![k]!)) : [];
  if (units.length + segments.length + lines.length + lost.length + enemy.length + plans.length === 0) return;
  const top = w.topo.nodes.get(hqId)!.parentId === null;
  const parts = (units.length ? UNITS : 0) | (segments.length ? SEGMENTS | ENEMY : 0) | (lines.length + lost.length ? LINES : 0) | (enemy.length ? ENEMY : 0) | (plans.length ? PLANS : 0);
  const h = hqForWrite(w, i, parts | (aboutEventId !== undefined && parts & (UNITS | SEGMENTS | LINES) ? ABOUT : 0) | (top ? 0 : NEWS));
  const pic = h.picture;
  const about = (key: string): void => {
    if (aboutEventId !== undefined) pic.about[key] = aboutEventId;
  };
  let urgent = segments.length + lines.length + lost.length + plans.length > 0;
  for (const id of units) {
    const u = r.units[id]!;
    if (pic.units[id]?.status !== u.status) urgent = true;
    pic.units[id] = { status: u.status, men: u.men, atMin: u.atMin };
    about(`u:${id}`);
    if (!top) addKey(h.news.units, id);
  }
  for (const id of segments) {
    pic.segments[id] = r.segments[id]!;
    // A segment its side has taken: its belief of the enemy there drops to the defenders seen (the estimate is spent).
    const e = pic.enemy[id];
    if (r.segments[id] === side && e?.base !== undefined) pic.enemy[id] = { men: e.seen ?? 0, atMin: t };
    pic.segmentsAt[id] = r.segmentsAt?.[id] ?? r.atMin;
    about(`s:${id}`);
    if (!top) addKey(h.news.segments, id);
  }
  for (const k of lines) {
    pic.lines[k] = r.lines[k]!;
    about(`l:${k}`);
    if (!top) addKey(h.news.lines, k);
  }
  for (const k of lost) {
    pic.lines[k] = null;
    pic.linesLost[k] = r.lost![k]!;
    about(`l:${k}`);
    if (!top) addKey(h.news.lines, k);
  }
  for (const id of enemy) {
    pic.enemy[id] = believed.get(id)!;
    if (!top) addKey(h.news.enemy, id);
  }
  for (const k of plans) {
    pic.plans[k] = r.plans![k]!;
    if (!top) addKey(h.news.plans, k);
  }
  if (top) return;
  // The enemy seen goes up with the HQ's next summary; on its own it is no reason to send one.
  if (units.length + segments.length + lines.length + lost.length + plans.length === 0) return;
  h.news.sinceMin ??= t;
  if (aboutEventId !== undefined) h.news.aboutEventId = Math.max(h.news.aboutEventId ?? -1, aboutEventId);
  if (urgent) h.news.urgent = true;
  if (h.news.urgent) forward(w, i, t);
}

/**
 * Whether the HQ keeps its estimate on this ground against reports of men up: an enemy trench it still shows the enemy
 * holding (men in dug-outs are invisible, not gone), or a line's ground.
 */
function keepsEstimate(w: Work, id: string, side: Side, holder: Side | undefined): boolean {
  if (id.startsWith('line:')) return true;
  if (id.startsWith('place:') || holder === undefined || holder === side) return false;
  return segmentById(w.state.segments, id)?.garrisonSide !== side;
}

/**
 * A belief from a report (EnemyKnown): where the estimate is kept, the greater of the men seen up and the estimate less
 * the losses reported (never less than reported before); elsewhere what was seen. Null: nothing changes.
 */
function believe(cur: EnemyKnown | undefined, e: { men: number; atMin: number; lost?: number }, keep: boolean): EnemyKnown | null {
  if (!keep || cur?.base === undefined) {
    if (cur && !cur.intel && cur.men === e.men && (cur.lost ?? 0) === (e.lost ?? 0) && cur.base === undefined) return null;
    return { men: e.men, atMin: e.atMin, seen: e.men, ...(e.lost ? { lost: e.lost } : {}), ...(cur?.base !== undefined ? { base: cur.base } : {}) };
  }
  const lost = Math.max(cur.lost ?? 0, e.lost ?? 0);
  const estimate = Math.max(0, cur.base - lost);
  const men = Math.max(e.men, estimate);
  if (cur.seen === e.men && (cur.lost ?? 0) === lost && cur.men === men) return null;
  return { men, atMin: e.atMin, base: cur.base, seen: e.men, ...(lost ? { lost } : {}), ...(estimate > e.men ? { intel: true as const } : {}) };
}

/** An HQ sends what is new in its picture up to the next headquarters, at t. */
function forward(w: Work, i: number, t: number): void {
  const h = hqForWrite(w, i, NEWS);
  const n = h.news;
  const pic = h.picture;
  const segs = [...n.segments].sort(byStr);
  const lines = [...n.lines].sort(byStr);
  const lost = lines.filter((k) => (pic.lines[k] === null || pic.lines[k] === undefined) && pic.linesLost[k] !== undefined);
  const report: Report = {
    atMin: t,
    units: Object.fromEntries([...n.units].sort(byStr).map((id) => [id, { ...pic.units[id]! }])),
    segments: Object.fromEntries(segs.map((id) => [id, pic.segments[id]!])),
    lines: Object.fromEntries(lines.filter((k) => !lost.includes(k)).map((k) => [k, pic.lines[k] ?? null])),
    ...(lost.length ? { lost: Object.fromEntries(lost.map((k) => [k, pic.linesLost[k]!])) } : {}),
    ...(segs.some((id) => pic.segmentsAt[id] !== undefined) ? { segmentsAt: Object.fromEntries(segs.flatMap((id) => (pic.segmentsAt[id] === undefined ? [] : [[id, pic.segmentsAt[id]!]]))) } : {}),
    // What was seen and lost goes up; each HQ forms its own belief from it with its own intelligence.
    ...(n.plans.length ? { plans: Object.fromEntries([...n.plans].sort(byStr).map((k) => [k, pic.plans[k]!])) } : {}),
    ...(n.enemy.length
      ? { enemy: Object.fromEntries([...n.enemy].sort(byStr).map((id) => { const e = pic.enemy[id]!; return [id, { men: e.seen ?? e.men, atMin: e.atMin, ...(e.lost ? { lost: e.lost } : {}) }]; })) }
      : {}),
  };
  const about = n.aboutEventId;
  h.news = emptyNews(t);
  sendOn(w, { side: h.side, kind: 'report', payload: report, ...(about !== null ? { aboutEventId: about } : {}) }, h.formationId, t);
}

/** The minute an HQ's routine summary is due: reportEveryMin after its last, once it has news (none at the top); Infinity: none. */
const cadenceDue = (topo: Topology, h: HqState, i: number): number =>
  h.news.sinceMin === null ? Infinity : Math.max(h.news.sentMin + topo.everyMin[i]!, h.news.sinceMin);

/**
 * An order reaches the formation (or the company) it is for: the companies under it that it names (`unitIds`; absent:
 * every one) hold it (Task 12 narrows delivery to the companies a decision concerns).
 */
function deliverOrder(w: Work, formationId: string, o: Order): void {
  const cs = w.companies ?? w.state.companies;
  const named = o.unitIds;
  w.companies = cs.map((c) => ((c.id === formationId || c.formationPath.includes(formationId)) && (named === undefined || named.includes(c.id)) ? { ...c, orders: [...c.orders, o] } : c));
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
  const seg = segmentById(w.state.segments, call.segmentId);
  if (!seg) return;
  const pts = segmentSamples(ctx, seg, w.state.companies);
  // A segment with no trench to aim at (no samples) cannot be fired on: the call goes unanswered.
  if (pts.length === 0) return;
  const centre: Point = [pts.reduce((a, p) => a + p[0], 0) / pts.length, pts.reduce((a, p) => a + p[1], 0) / pts.length];
  const dur = call.forMin ?? v(ctx.tables.effects.callForFireMin);
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
 * changed hands, or whose objective line was taken, or that sees an enemy line taken or lost (within `observerRangeM` of
 * it in its sector: the enemy's lines in its HQs' pictures come only from these, Task 13) reports to its battalion; so does one whose men have changed since
 * its last report once `reportEveryMin` (its doctrine) has passed since then (a routine report: at most one a period,
 * and none while nothing changed). A company newly pinned calls for fire on the nearest segment the enemy holds that it
 * can see some of (`eyesOf`: within the visibility and `observerRangeM`, in its line of sight). Companies in ascending id order, the report before the call. Companies off the map report nothing.
 * A report is about the company's last event this step (not a message lost), else the line taken, else its segment's
 * change of hands, else the last fire on it.
 */
export function companyReports(state: SimState, ctx: StepContext): SimState {
  const M = state.minute;
  const holderOf = new Map(state.segments.map((x) => [x.id, x]));
  const took = new Map<string, string[]>();
  const lastEvent = new Map<string, number>();
  const linesTaken = new Map<string, number>();
  const linesLost = new Map<string, number>();
  for (const e of state.events) {
    if (e.unitId !== undefined && e.kind !== 'message-lost') lastEvent.set(e.unitId, e.id);
    if ((e.kind === 'segment-lost' || e.kind === 'segment-retaken') && e.unitId !== undefined && e.segmentId !== undefined) took.set(e.unitId, [...(took.get(e.unitId) ?? []), e.segmentId]);
    if (e.kind === 'line-taken') linesTaken.set(`${e.lineId}|${e.sectorId}`, e.id);
    if (e.kind === 'line-lost') linesLost.set(`${e.lineId}|${e.sectorId}`, e.id);
  }
  let seen: ReturnType<typeof enemySeen> | undefined;
  let eyes: ReturnType<typeof eyesOf> | undefined;
  let w: Work | null = null;
  let last: Map<string, SimState['lastReport'] extends ReadonlyMap<string, infer R> ? R : never> | null = null;
  const range = v(ctx.tables.effects.observerRangeM);
  // Segments change hands only with a segment-lost or segment-retaken event: without one, no holder is looked at.
  const anySeg = took.size > 0;
  const every = (c: CompanyState): number => v(ctx.doctrines[c.doctrineId]!.common.reportEveryMin);
  // The enemy's lines taken or lost this step, which its companies in sight of them report (Task 13: what a defender's
  // headquarters knows of the attacker's lines comes from these reports).
  const enemyLineEvents = [...[...linesTaken.keys()].map((k) => [k, 'taken'] as const), ...[...linesLost.keys()].map((k) => [k, 'lost'] as const)];
  const seesLines = (c: CompanyState): Array<readonly [string, 'taken' | 'lost']> =>
    enemyLineEvents.filter(([k]) => {
      if (lineTakerOf(state, ctx, k) === c.side || !onField(c)) return false;
      const [lineId, sectorId] = k.split('|') as [string, string];
      const line = ctx.lines.get(lineId);
      const sector = ctx.scenario.sectors.find((x) => x.id === sectorId);
      if (!line || !sector) return false;
      const y = Math.min(Math.max(c.y, sector.yMin), sector.yMax);
      return Math.hypot(lineXAt(line, y) - c.x, y - c.y) <= range;
    });
  for (const c of state.companies) {
    if (c.status === 'off-map') continue;
    const had = state.lastReport.get(c.id);
    const before = had ?? { status: c.status, men: c.men, holder: null, atMin: M };
    const routine = had !== undefined && c.men !== had.men && M >= had.atMin + every(c);
    const aim = c.objectiveLineId === undefined || linesLost.size === 0 ? '' : `${c.objectiveLineId}|${c.sectorId}`;
    const lostEvent = aim ? linesLost.get(aim) : undefined;
    const sighted = enemyLineEvents.length ? seesLines(c) : [];
    if (!anySeg && !routine && before.status === c.status && !(c.status === 'consolidating' && linesTaken.size) && lostEvent === undefined && sighted.length === 0) continue;
    const own = c.segmentId === undefined ? undefined : holderOf.get(c.segmentId);
    const holder = own ? own.holder : null;
    const taken = took.get(c.id) ?? [];
    const key = c.status === 'consolidating' && linesTaken.size ? `${c.objectiveLineId}|${c.sectorId}` : '';
    const lineEvent = key ? linesTaken.get(key) : undefined;
    const statusChanged = before.status !== c.status;
    const segChanged = own !== undefined && before.holder !== holder;
    if (!routine && !statusChanged && !segChanged && taken.length === 0 && lineEvent === undefined && lostEvent === undefined && sighted.length === 0) continue;
    w ??= begin(state, ctx);
    last ??= new Map(state.lastReport);
    last.set(c.id, { status: c.status, men: c.men, holder, atMin: M });
    const segments: Report['segments'] = {};
    for (const id of taken) segments[id] = holderOf.get(id)!.holder;
    if (segChanged) segments[own!.id] = holder!;
    // A line lost: the report says which of its trench the enemy has taken back.
    if (lostEvent !== undefined) {
      const [lineId, sectorId] = aim.split('|') as [string, string];
      for (const x of segmentsOnLine(state, ctx, lineId, sectorId)) segments[x.id] = x.holder;
    }
    const enemy = (seen ??= enemySeen(state, ctx))(c);
    const lines: Report['lines'] = lineEvent !== undefined ? { [key]: M } : {};
    const lost: Record<string, number> = lostEvent !== undefined ? { [aim]: M } : {};
    for (const [k, what] of sighted) (what === 'taken' ? lines : lost)[k] = M;
    const report: Report = {
      atMin: M,
      units: { [c.id]: { status: c.status, men: c.men, atMin: M } },
      segments,
      lines,
      ...(Object.keys(lost).length ? { lost } : {}),
      ...(Object.keys(enemy).length ? { enemy } : {}),
    };
    const segEvent = segChanged && own!.holderEventId !== null ? own!.holderEventId : undefined;
    const fireEvent = c.recentFire.at(-1)?.eventId;
    const about = lastEvent.get(c.id) ?? lineEvent ?? lostEvent ?? segEvent ?? (fireEvent === null ? undefined : fireEvent);
    sendOn(w, { side: c.side, kind: 'report', payload: report, ...(about !== undefined ? { aboutEventId: about } : {}) }, c.id, M);
    if (statusChanged && c.status === 'pinned') {
      const p: Point = [c.x, c.y];
      const e = (eyes ??= eyesOf(state, ctx));
      const look = e.of(c);
      let best: { id: string; d: number } | null = null;
      for (const x of state.segments) {
        if (x.holder === c.side || x.yMin - e.range > c.y || x.yMax + e.range < c.y) continue;
        const pts = segmentSamples(ctx, x, state.companies);
        const d = distanceTo(pts, p);
        // The nearest it can see some of (as for the enemy it reports).
        if (d <= e.range && (!best || d < best.d) && seesAny(look, pts)) best = { id: x.id, d };
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

/**
 * What a company can see from where it stands at this minute, by the tests direct fire uses (fire.ts): within the
 * visibility (the weather, held down by the light: light.ts `visibilityM` and `visibility`), in its line of sight
 * (sight.ts `sightFrom`, from the same cache), and no farther than `observerRangeM`. `range` is the farthest it can see.
 */
function eyesOf(state: SimState, ctx: StepContext): { range: number; of: (c: CompanyState) => (x: number, y: number) => boolean } {
  const visM = visibilityM(ctx.scenario, ctx.tables, state.minute);
  const range = Math.min(v(ctx.tables.effects.observerRangeM), Math.max(0, visM));
  return {
    range,
    of: (c) => {
      let sees: ((x: number, y: number) => boolean) | undefined;
      return (x, y) => {
        const r = Math.hypot(x - c.x, y - c.y);
        return r <= range && visibility(r, visM) > 0 && (sees ??= sightFrom(ctx.world, [c.x, c.y]))(x, y);
      };
    },
  };
}

/** Whether a company sees some sample of a trench (nearest first is not needed: any one will do). */
const seesAny = (look: (x: number, y: number) => boolean, pts: readonly Point[]): boolean => pts.some((p) => look(p[0], p[1]));

/** Points along a segment-less line's ground (its line and the line before it, every 25 m of y), worked out once. */
const zoneSamples = new WeakMap<LineZone, Point[]>();
function samplesOf(z: LineZone): Point[] {
  let out = zoneSamples.get(z);
  if (!out) {
    out = [];
    const n = Math.max(1, Math.ceil((z.yMax - z.yMin) / 25));
    for (let i = 0; i <= n; i++) {
      const y = z.yMin + ((z.yMax - z.yMin) * i) / n;
      out.push([lineXAt(z.line, y), y], [lineXAt(z.prev, y), y]);
    }
    zoneSamples.set(z, out);
  }
  return out;
}

/**
 * What a company sees of the enemy when it reports (Task 12; the final review fix): each segment the enemy holds with
 * some sample of its trench in the company's sight (`eyesOf`: within the visibility and `observerRangeM`, in its line of
 * sight), with the men of the enemy up there (on the field, not down in dugouts, within `captureRadiusM` of its trench),
 * segments in order; an operation's target place whose middle it sees (or that it stands in); the ground of a
 * segment-less objective line it sees some of (or stands on). Each segment's men are counted once a step.
 */
const zoneMemo = new WeakMap<StepContext, Map<string, string[]>>();

export function enemySeen(state: SimState, ctx: StepContext): (c: CompanyState) => Record<string, { men: number; atMin: number }> {
  const eyes = eyesOf(state, ctx);
  const range = eyes.range;
  const near = v(ctx.tables.effects.captureRadiusM);
  const M = state.minute;
  const menIn = new Map<string, number>();
  const up = state.companies.filter((c) => c.men > 0 && c.posture !== 'in-dugout' && c.status !== 'surrendered' && c.status !== 'destroyed' && c.status !== 'off-map' && c.status !== 'marching');
  const match = v(ctx.tables.effects.lineFeatureMatchM);
  // Its defenders as the capture rule counts them (trenches.ts segmentDefenders).
  const menAt = (seg: (typeof state.segments)[number], pts: readonly Point[]): number => {
    let n = menIn.get(seg.id);
    if (n === undefined) {
      const reach = Math.max(near, match);
      n = segmentDefenders(seg, pts, up.filter((e) => e.side === seg.holder && e.y >= seg.yMin - reach && e.y <= seg.yMax + reach), ctx).men;
      menIn.set(seg.id, n);
    }
    return n;
  };
  const zones = lineZones(state, ctx);
  const byId = byIdOf(state.companies);
  // The losses seen among companies: casualties in battle and men captured (not the bombardment's, which nobody saw).
  const boxes = new Map<string, [number, number, number, number]>();
  const boxOf = (id: string, pts: readonly Point[]): [number, number, number, number] => {
    let b = boxes.get(id);
    if (!b) {
      b = [Infinity, Infinity, -Infinity, -Infinity];
      for (const [x, y] of pts) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
      boxes.set(id, b);
    }
    return b;
  };
  const lostOf = (ids: readonly string[]): { lost?: number } => {
    let n = 0;
    for (const id of ids) {
      const x = byId.get(id);
      if (x) n += x.killed - x.bombardment.killed + x.wounded - x.bombardment.wounded + x.captured;
    }
    return n > 0 ? { lost: n } : {};
  };
  // By where the plan put them at Zero, which never changes: worked out once a run.
  let zoneIds = zoneMemo.get(ctx);
  if (!zoneIds) zoneMemo.set(ctx, (zoneIds = new Map()));
  const zoneCompanies = (z: LineZone): string[] => {
    let ids = zoneIds.get(z.key);
    if (!ids) zoneIds.set(z.key, (ids = state.companies.filter((x) => x.side !== z.side && inZone(z, x.startX, x.startY, match)).map((x) => x.id)));
    return ids;
  };
  const places = operationPlaces(state, ctx);
  const placeMen = new Map<string, number>();
  return (c) => {
    const out: Record<string, { men: number; atMin: number }> = {};
    if (!(range > 0)) return out;
    const p: Point = [c.x, c.y];
    const look = eyes.of(c);
    for (const x of state.segments) {
      if (x.holder === c.side || x.yMin - range > c.y || x.yMax + range < c.y) continue;
      const pts = segmentSamples(ctx, x, state.companies);
      if (pts.length === 0) continue;
      // Cheap first: the box around its trench.
      const b = boxOf(x.id, pts);
      if (c.x < b[0] - range || c.x > b[2] + range) continue;
      if (distanceTo(pts, p) > range || !seesAny(look, pts)) continue;
      out[x.id] = { men: menAt(x, pts), atMin: M, ...(x.garrisonSide !== c.side ? lostOf(x.garrisonIds) : {}) };
    }
    // An operation's target place in sight: the enemy up within its radius.
    for (const pl of places) {
      const d = Math.hypot(pl.point[0] - c.x, pl.point[1] - c.y);
      if (d > range + pl.radiusM || (d > pl.radiusM && !look(pl.point[0], pl.point[1]))) continue;
      const k = `${c.side}|${pl.key}`;
      let n = placeMen.get(k);
      if (n === undefined) {
        n = 0;
        for (const e of up) if (e.side !== c.side && Math.hypot(e.x - pl.point[0], e.y - pl.point[1]) <= pl.radiusM) n += e.men;
        placeMen.set(k, n);
      }
      out[pl.key] = { men: n, atMin: M };
    }
    // The ground of its side's segment-less objective lines in sight: the enemy up there.
    for (const z of zones) {
      if (z.side !== c.side || !inZone(z, c.x, c.y, match, range) || (!inZone(z, c.x, c.y, match) && !seesAny(look, samplesOf(z)))) continue;
      const k = z.key;
      let n = placeMen.get(k);
      if (n === undefined) {
        n = 0;
        for (const e of up) if (e.side !== c.side && inZone(z, e.x, e.y, match)) n += e.men;
        placeMen.set(k, n);
      }
      out[k] = { men: n, atMin: M, ...lostOf(zoneCompanies(z)) };
    }
    return out;
  };
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
    const last = state.lastReport.get(c.id);
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

