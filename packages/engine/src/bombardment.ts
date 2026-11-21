import { ScenarioError, v } from '@wwi/scenario';
import type { Feature, Point, Scenario, WeaponKind } from '@wwi/scenario';
import { emit } from './causes';
import type { Cause, NewEvent } from './causes';
import { byId } from './companies';
import { CELL_M, churn } from './ground';
import type { World } from './ground';
import { round } from './record';
import { featurePieces, pathLength } from './segments';
import { stochasticRound } from './stochastic';
import type { SimState, StepContext } from './step';
import type { BatteryState, CasualtyCount, SegmentState, Side, SimEvent } from './types';

// ---- churn ---------------------------------------------------------------------------------------------

/** Spread `rounds` along polylines in proportion to length, a 50 m piece at a time (all on the first point if they have no length). */
function churnAlong(w: World, pieces: Point[][], rounds: number): void {
  const total = pieces.reduce((a, p) => a + pathLength(p), 0);
  if (total === 0) {
    if (pieces[0]) churn(w, pieces[0][0]!, rounds);
    return;
  }
  for (const pts of pieces)
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(1, Math.ceil(len / CELL_M));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        churn(w, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], (rounds * len) / n / total);
      }
    }
}

// ---- batteries -------------------------------------------------------------------------------------------

/** One battery per artillery entry, in ascending id order, unsuppressed; missing ammunition and horses are listed as defaults. */
export function initBatteries(s: Scenario, defaultsUsed: Set<string>): BatteryState[] {
  return [...s.artillery].sort(byId).map((a): BatteryState => {
    if (a.ammunition === undefined) defaultsUsed.add(`artillery[${a.id}].ammunition ← unlimited (none given)`);
    if (a.horseDrawn === undefined) defaultsUsed.add(`artillery[${a.id}].horseDrawn ← false (not given)`);
    if (a.observation === undefined) defaultsUsed.add(`artillery[${a.id}].observation ← map (not given)`);
    return {
      id: a.id,
      side: a.side,
      weapon: a.weapon,
      role: a.role,
      observation: a.observation ?? 'map',
      guns: v(a.count),
      suppressedUntilMin: null,
      ammoLeft: a.ammunition === undefined ? Infinity : v(a.ammunition),
      ...(Array.isArray(a.position) ? { position: a.position as Point } : {}),
      horses: a.horseDrawn ?? false,
    };
  });
}

/**
 * The counter-battery state at Zero: of each German battery, `suppressedAtZeroFrac` of its guns (rounded
 * without bias) are silenced. Each silenced gun becomes a battery of its own that comes back into action at a
 * minute drawn so that, on average, half are back after `batteryRecoveryHalfLifeMin`.
 */
function suppressAtZero(batteries: BatteryState[], ctx: StepContext): BatteryState[] {
  const cb = ctx.scenario.counterBattery;
  if (!cb) {
    if (batteries.some((b) => b.side === 'central')) ctx.defaultsUsed.add('counterBattery ← none (no German battery suppressed at Zero)');
    return batteries;
  }
  // counterBattery.side is the side firing the counter-battery programme; the other side's guns are silenced.
  const target: Side = cb.side === 'allied' ? 'central' : 'allied';
  const frac = v(cb.suppressedAtZeroFrac);
  const halfLife = v(ctx.tables.effects.batteryRecoveryHalfLifeMin);
  const out: BatteryState[] = [];
  for (const b of batteries) {
    if (b.side !== target) {
      out.push(b);
      continue;
    }
    const down = Math.min(b.guns, stochasticRound(b.guns * frac, ctx.rng));
    if (b.guns - down > 0) out.push({ ...b, guns: b.guns - down, ammoLeft: (b.ammoLeft * (b.guns - down)) / b.guns });
    const width = Math.max(3, String(down).length);
    for (let i = 1; i <= down; i++)
      out.push({
        ...b,
        id: `${b.id}/s${String(i).padStart(width, '0')}`,
        guns: 1,
        ammoLeft: b.ammoLeft / b.guns,
        suppressedUntilMin: -halfLife * Math.log2(1 - ctx.rng()),
      });
  }
  return out.sort(byId);
}

// ---- the bombardment -----------------------------------------------------------------------------------

type Bombardment = NonNullable<Scenario['bombardment']>;
type Allocation = Bombardment['allocations'][number];
type WireBand = Bombardment['wire'][number];
type SparedBand = Bombardment['spared'][number];

/**
 * A stretch of one segment over which the wire belts and the spared bands do not change: the segment cut at
 * every band edge inside it. A band over part of a segment so counts by the share of its y extent it covers.
 */
type Piece = {
  /** Index of its segment. */
  seg: number;
  y0: number;
  y1: number;
  /** Length along the trench: the segment's length times the piece's share of its y extent. */
  lenM: number;
  /** Summed depth of the wire belts over it (two bands over the same stretch are two belts); 0: no wire. */
  beltDepthM: number;
  /** The spared bands over it. */
  spared: SparedBand[];
  /** Rounds landed on it: wire-cutting, on the trench (all kinds), on the trench by heavy pieces, and all of them. */
  wire: number;
  trench: number;
  heavy: number;
  fired: number;
};

/** Whether a spared band keeps rounds of this weapon kind off it (no `onlyKinds`: every kind). */
const sparesKind = (b: SparedBand, kind: WeaponKind): boolean => !b.onlyKinds || b.onlyKinds.includes(kind);

function piecesOf(seg: SegmentState, k: number, wire: WireBand[], spared: SparedBand[]): Piece[] {
  const inside = [...wire, ...spared].flatMap((b) => [b.yMin, b.yMax]).filter((y) => y > seg.yMin && y < seg.yMax);
  const ys = [...new Set([seg.yMin, ...inside, seg.yMax])].sort((a, b) => a - b);
  const spans: Array<[number, number]> = ys.length > 1 ? ys.slice(1).map((y, i) => [ys[i]!, y]) : [[seg.yMin, seg.yMax]];
  const width = seg.yMax - seg.yMin;
  return spans.map(([y0, y1]): Piece => {
    const mid = (y0 + y1) / 2;
    const over = <T extends { yMin: number; yMax: number }>(bands: T[]): T[] => bands.filter((b) => b.yMin <= mid && mid <= b.yMax);
    return {
      seg: k,
      y0,
      y1,
      lenM: width > 0 ? (seg.lengthM * (y1 - y0)) / width : 0,
      beltDepthM: over(wire).reduce((t, b) => t + v(b.beltDepthM), 0),
      spared: over(spared),
      wire: 0,
      trench: 0,
      heavy: 0,
      fired: 0,
    };
  });
}

const pct = (x: number): string => `${Math.round(x * 100)}%`;
const sum = <T>(xs: T[], f: (x: T) => number): number => xs.reduce((t, x) => t + f(x), 0);

/**
 * The compressed preliminary bombardment (the model, "Bombardment"), run once before Zero:
 * - each allocation's rounds are shared among the stretches its task covers, by their share of that
 *   frontage: wire-cutting over the wired stretches, trench fire (and harassing fire, where the enemy has no
 *   communication trenches) over every stretch of the enemy's segments. A stretch spared from the
 *   allocation's weapon kind gets none of it;
 * - battery rounds land on the enemy batteries' positions, harassing fire along its communication trenches;
 * - every round churns the ground where it lands;
 * - wire cut, trench and dugout damage follow from the rounds on each stretch, and a segment's are the
 *   length-weighted mean of its stretches'; garrison losses follow from the segment's trench damage and the
 *   dugouts' depth, drawn through `stochasticRound` in ascending company id order;
 * - the German batteries are suppressed at Zero (counterBattery);
 * - one `bombardment-result` event per segment.
 * A scenario with no bombardment shells nothing, and the default is listed.
 */
export function runBombardment(state: SimState, ctx: StepContext): { state: SimState; events: SimEvent[]; losses: CasualtyCount } {
  const losses: CasualtyCount = { killed: 0, wounded: 0, captured: 0, total: 0 };
  const b = ctx.scenario.bombardment;
  if (!b) {
    ctx.defaultsUsed.add('bombardment ← none (no preliminary bombardment)');
    return { state: { ...state, batteries: suppressAtZero(state.batteries, ctx) }, events: [], losses };
  }
  const s = ctx.scenario;
  const fx = ctx.tables.effects;
  const features = new Map(s.features.map((f) => [f.id, f]));
  const segFeatures = new Set(state.segments.map((x) => x.featureId));
  /** The bands on each feature that has segments; a band on a feature without one is listed once and dropped. */
  const bandsOn = <T extends { featureId: string }>(list: T[], what: string): Map<string, T[]> => {
    const by = new Map<string, T[]>();
    for (const x of list) {
      if (!segFeatures.has(x.featureId)) ctx.defaultsUsed.add(`bombardment.${what}[${x.featureId}] ← not applied (no garrison segment on the feature)`);
      else by.set(x.featureId, [...(by.get(x.featureId) ?? []), x]);
    }
    return by;
  };
  const wireBy = bandsOn(b.wire, 'wire');
  const sparedBy = bandsOn(b.spared, 'spared');
  // A band on a feature with segments that overlaps none of them (it lies beyond the garrisons' stretches) is listed too.
  const overlaps = (x: { featureId: string; yMin: number; yMax: number }): boolean =>
    state.segments.some((seg) => seg.featureId === x.featureId && (seg.yMin === seg.yMax ? x.yMin <= seg.yMin && seg.yMin <= x.yMax : x.yMin < seg.yMax && x.yMax > seg.yMin));
  for (const [what, by] of [['wire', wireBy], ['spared', sparedBy]] as const)
    for (const x of [...by.values()].flat())
      if (!overlaps(x)) ctx.defaultsUsed.add(`bombardment.${what}[${x.featureId} y ${x.yMin} to ${x.yMax}] ← not applied (no garrison segment over it)`);
  const pieces = state.segments.flatMap((seg, k) => piecesOf(seg, k, wireBy.get(seg.featureId) ?? [], sparedBy.get(seg.featureId) ?? []));
  for (const seg of state.segments)
    if (seg.lengthM === 0) ctx.defaultsUsed.add(`bombardment of ${seg.id} ← no rounds (the segment has no frontage to share them by)`);
  // (A point strongpoint has its diameter as frontage, so only a garrison placed past its trench's end, or on a
  // point of a kind with no radius default, has none.)

  const noTarget = (i: number, a: Allocation) => ctx.defaultsUsed.add(`bombardment.allocations[${i}] (${a.artilleryId} ${a.task}) ← not fired (nothing for it to hit)`);
  b.allocations.forEach((a, i) => {
    const art = s.artillery.find((x) => x.id === a.artilleryId);
    if (!art) throw new ScenarioError([`bombardment.allocations[${i}].artilleryId: unknown artillery "${a.artilleryId}"`]);
    const weapon = ctx.tables.weapons[art.weapon];
    if (!weapon) throw new ScenarioError([`bombardment.allocations[${i}]: artillery ${art.id} fires weapon "${art.weapon}", which the tables do not hold`]);
    const rounds = v(a.rounds);
    const enemy: Side = art.side === 'allied' ? 'central' : 'allied';
    if (a.task === 'battery') {
      const targets = state.batteries.filter((x) => x.side === enemy && x.position);
      const guns = sum(targets, (x) => x.guns);
      if (guns === 0) return void noTarget(i, a);
      for (const x of targets) churn(ctx.world, x.position!, (rounds * x.guns) / guns);
      return;
    }
    if (a.task === 'harass') {
      const comms = s.features.filter((f): f is Feature => f.kind === 'communication-trench' && f.side === enemy && f.geometry.type !== 'Point');
      if (comms.length) return void churnAlong(ctx.world, comms.map((f) => f.geometry.coordinates as Point[]), rounds);
    }
    const targets = pieces.filter(
      (p) => p.lenM > 0 && state.segments[p.seg]!.holder === enemy && (a.task !== 'wire' || p.beltDepthM > 0) && !p.spared.some((x) => sparesKind(x, weapon.kind)),
    );
    const front = sum(targets, (p) => p.lenM);
    if (front === 0) return void noTarget(i, a);
    for (const p of targets) {
      const r = (rounds * p.lenM) / front;
      if (a.task === 'wire') p.wire += r;
      if (a.task === 'trench') {
        p.trench += r;
        if (weapon.kind === 'heavy') p.heavy += r;
      }
      p.fired += r;
    }
  });
  // A point strongpoint's rounds fall across it, along its y band through the point.
  const landsOn = (f: Feature, p: Piece): Point[][] =>
    f.geometry.type === 'Point' ? [[[f.geometry.coordinates[0], p.y0], [f.geometry.coordinates[0], p.y1]]] : featurePieces(f, p.y0, p.y1);
  for (const p of pieces) if (p.fired > 0) churnAlong(ctx.world, landsOn(features.get(state.segments[p.seg]!.featureId)!, p), p.fired);

  // Damage to each segment: each stretch's by the model's formulas, weighted by its length.
  const cutPerRound = v(fx.cutPerRound);
  const damagePerRound = v(fx.damagePerRound);
  const dugoutPerRound = v(fx.dugoutPerRound);
  const sparedShare: number[] = [];
  const segments = state.segments.map((seg, k): SegmentState => {
    const ps = pieces.filter((p) => p.seg === k);
    const L = seg.lengthM;
    const width = seg.yMax - seg.yMin;
    const wired = ps.filter((p) => p.beltDepthM > 0);
    const wiredLen = sum(wired, (p) => p.lenM);
    // A segment of no length (a garrison placed past its trench's end) takes the belt over its place.
    const wireBeltDepthM = wiredLen > 0 ? sum(wired, (p) => p.beltDepthM * p.lenM) / wiredLen : L === 0 ? (ps[0]?.beltDepthM ?? 0) : 0;
    const wireCut = wiredLen > 0 ? sum(wired, (p) => p.lenM * (1 - Math.exp((-p.wire * cutPerRound) / (p.beltDepthM * p.lenM)))) / wiredLen : 0;
    const trenchDamage = L > 0 ? sum(ps, (p) => (p.lenM > 0 ? p.lenM * (1 - Math.exp((-p.trench * damagePerRound) / p.lenM)) : 0)) / L : 0;
    const d = seg.dugoutDepthM;
    const broken = (p: Piece): number => (p.heavy === 0 ? 0 : d > 0 ? 1 - Math.exp((-p.heavy * dugoutPerRound) / (p.lenM * d)) : 1);
    const dugoutDamage = L > 0 ? sum(ps, (p) => p.lenM * broken(p)) / L : 0;
    const sparedPs = ps.filter((p) => p.spared.length > 0);
    sparedShare.push(width > 0 ? sum(sparedPs, (p) => p.y1 - p.y0) / width : sparedPs.length > 0 ? 1 : 0);
    return { ...seg, wireBeltDepthM, wireCut, trenchDamage, dugoutDamage, spared: sparedPs.length > 0 };
  });

  // Garrison losses, in ascending company id order (two draws for each garrison that has a segment).
  const segIndex = new Map(segments.map((x, k) => [x.id, k]));
  const lostIn = segments.map(() => 0);
  const lossRate = v(fx.lossRate);
  const safeDepthM = v(fx.safeDepthM);
  const killedFrac = v(fx.killedFrac);
  const companies = state.companies.map((c) => {
    const k = c.segmentId === undefined ? undefined : segIndex.get(c.segmentId);
    if (k === undefined) return c;
    const seg = segments[k]!;
    const d = seg.dugoutDepthM;
    const exposed = d + safeDepthM > 0 ? 1 - d / (d + safeDepthM) : 1;
    const n = Math.min(c.men, stochasticRound(Math.min(c.men, c.men * lossRate * seg.trenchDamage * exposed), ctx.rng));
    const killed = Math.min(n, stochasticRound(n * killedFrac, ctx.rng));
    const wounded = n - killed;
    lostIn[k]! += n;
    losses.killed += killed;
    losses.wounded += wounded;
    losses.total += n;
    if (n === 0) return c;
    return {
      ...c,
      men: c.men - n,
      killed: c.killed + killed,
      wounded: c.wounded + wounded,
      bombardment: { killed: c.bombardment.killed + killed, wounded: c.bombardment.wounded + wounded },
    };
  });

  const names = new Map(state.companies.map((c) => [c.id, c.name]));
  const uncutBelow = v(fx.wireUncutBelow);
  const events: NewEvent[] = segments.map((seg, k) => {
    const causes: Cause[] = [];
    if (seg.spared) causes.push('spared-by-bombardment');
    if (seg.wireBeltDepthM > 0 && seg.wireCut < uncutBelow) causes.push('wire-uncut');
    const wireText = seg.wireBeltDepthM > 0 ? `wire ${pct(seg.wireCut)} cut` : 'no wire';
    const by = [...new Set(pieces.filter((p) => p.seg === k).flatMap((p) => p.spared.map((x) => (x.onlyKinds ? x.onlyKinds.join(', ') : 'all'))))];
    const sparedText = seg.spared ? `; ${pct(sparedShare[k]!)} of it spared on purpose from ${by.join('; ')} fire` : '';
    return {
      minute: 0,
      kind: 'bombardment-result',
      segmentId: seg.id,
      text: `Bombardment of ${seg.id} (${seg.garrisonIds.map((id) => names.get(id) ?? id).join(', ')}): ${wireText}, trench ${pct(seg.trenchDamage)} wrecked, dugouts ${pct(seg.dugoutDamage)} broken, ${lostIn[k]} men lost${sparedText}`,
      causes,
      factors: {
        wireCut: round(seg.wireCut, 3),
        trenchDamage: round(seg.trenchDamage, 3),
        dugoutDamage: round(seg.dugoutDamage, 3),
        losses: lostIn[k]!,
        ...(seg.spared ? { sparedFrac: round(sparedShare[k]!, 3) } : {}),
      },
    };
  });

  const first = state.nextEventId;
  // Each segment's result is the last word on fire over it until a barrage lifts off it (Task 8's emergence refs).
  const told = segments.map((seg, k): SegmentState => ({ ...seg, barrageEventId: first + k }));
  const out = emit({ ...state, segments: told, companies, batteries: suppressAtZero(state.batteries, ctx) }, ...events);
  return { state: out, events: out.events.filter((e) => e.id >= first), losses };
}
