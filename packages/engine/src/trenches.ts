import { v } from '@wwi/scenario';
import type { Point } from '@wwi/scenario';
import { distanceTo, segmentSamples } from './artillery';
import { counterAttackOrder } from './movement';
import { CAUSES, emit } from './causes';
import type { Cause, NewEvent } from './causes';
import { inBox, sideBuckets } from './buckets';
import type { Buckets } from './buckets';
import { byId } from './companies';
import type { CompanyState } from './companies';
import { lineXAt } from './geometry';
import { round } from './record';
import type { Scheduled } from './schedule';
import { stochasticRound } from './stochastic';
import { onField } from './step';
import type { SimState, StepContext } from './step';
import type { BatteryState, DugoutPoint, SegmentState, Side } from './types';

/*
 * The fight for the trenches (the model's movement phase, after the companies have moved and the gap is taken):
 * segments changing hands, guns overrun, the dugouts mopped up, and the men left in them coming up behind the
 * attackers. And which segments belong to an objective line, for the line-taken rule (step.ts).
 *
 * Every number is data: the effects keys captureRadiusM, captureRatio, gunCaptureRadiusM, sortieDelayMin,
 * lineFeatureMatchM, wireUncutBelow and bombsPerManCleared, and the doctrine's attack.mopUpRateMenPerMin.
 */

const enemyOf = (s: Side): Side => (s === 'allied' ? 'central' : 'allied');
const at = (c: Pick<CompanyState, 'x' | 'y'>): Point => [c.x, c.y];
const sum = <T>(xs: readonly T[], f: (x: T) => number): number => xs.reduce((t, x) => t + f(x), 0);
const sortedUnique = (xs: number[]): number[] => xs.filter((x, i) => xs.indexOf(x) === i).sort((a, b) => a - b);
const ordered = (cs: Cause[]): Cause[] => CAUSES.filter((x) => cs.includes(x));

/** The box around a segment's trench samples, for cheap "could it be within r" tests (worked out once for each samples array). */
const boxMemo = new WeakMap<readonly Point[], [number, number, number, number]>();
function boxOf(pts: readonly Point[]): [number, number, number, number] {
  let hit = boxMemo.get(pts);
  if (!hit) boxMemo.set(pts, (hit = workBox(pts)));
  return hit;
}
function workBox(pts: readonly Point[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}

/** Companies in buckets, of which those `keep` holds for count (as a list in id order filtered by it would). */
export type Pool = { b: Buckets<CompanyState>; keep: (c: CompanyState) => boolean };

/** Companies (in the order given, or in id order from a pool: the same for a list in id order) within r of a segment's trench. */
function nearSegment(cs: readonly CompanyState[] | Pool, pts: readonly Point[], r: number): Array<{ c: CompanyState; d: number }> {
  const [x0, y0, x1, y1] = boxOf(pts);
  const out: Array<{ c: CompanyState; d: number }> = [];
  const look = (c: CompanyState): void => {
    if (c.x < x0 - r || c.x > x1 + r || c.y < y0 - r || c.y > y1 + r) return;
    const d = distanceTo(pts, at(c));
    if (d <= r) out.push({ c, d });
  };
  if (Array.isArray(cs)) for (const c of cs) look(c);
  else {
    const pool = cs as Pool;
    inBox(pool.b, x0 - r, y0 - r, x1 + r, y1 + r, look, pool.keep);
    out.sort((a, b) => byId(a.c, b.c));
  }
  return out;
}

/**
 * Whether a barrage is on the segment's trench within r of any of the points now: only the stretch of trench near the
 * men counts (the samples `barrageOn` names). A segment marked under the barrage this minute without samples counts as
 * covered all along.
 */
export function barrageNear(seg: SegmentState, ctx: StepContext, companies: readonly CompanyState[], minute: number, near: readonly Point[], r: number): boolean {
  if (seg.barrageLastOverMin !== minute) return false;
  if (seg.barrageOn.length === 0) return true;
  const pts = segmentSamples(ctx, seg, companies);
  return seg.barrageOn.some((i) => {
    const p = pts[i];
    return p !== undefined && near.some((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= r);
  });
}

/** The side whose companies aim at a taken line ("lineId|sectorId"), by the first company that does; null if none. */
export function takerOf(state: Pick<SimState, 'companies'>, key: string): Side | null {
  // Worked out once for each companies array (never changed once made) and line.
  let m = takerMemo.get(state.companies);
  if (!m) takerMemo.set(state.companies, (m = new Map()));
  const hit = m.get(key);
  if (hit !== undefined) return hit;
  const bar = key.indexOf('|');
  const lineId = key.slice(0, bar);
  const sectorId = key.slice(bar + 1);
  const c = state.companies.find((x) => x.objectiveLineId === lineId && x.sectorId === sectorId);
  const side = c ? c.side : null;
  m.set(key, side);
  return side;
}
const takerMemo = new WeakMap<readonly CompanyState[], Map<string, Side | null>>();

/** A segment by id: its place in the list worked out once for each segments array (never changed once made). */
export function segmentById(segments: readonly SegmentState[], id: string): SegmentState | undefined {
  let m = segmentPlaces.get(segments);
  if (!m) segmentPlaces.set(segments, (m = new Map(segments.map((x, i) => [x.id, i]))));
  const i = m.get(id);
  return i === undefined ? undefined : segments[i];
}
const segmentPlaces = new WeakMap<readonly SegmentState[], Map<string, number>>();

/**
 * Whether a segment lies in its holder's rear: some of its trench, inside a sector's y range, is at or behind a line
 * its holder has taken in that sector (at: within `lineFeatureMatchM` beyond it; behind: on the attackers' side, lower x).
 */
export function inRear(seg: SegmentState, state: SimState, ctx: StepContext): boolean {
  const match = v(ctx.tables.effects.lineFeatureMatchM);
  const pts = segmentSamples(ctx, seg, state.companies);
  for (const key of state.taken) {
    if (takerOf(state, key) !== seg.holder) continue;
    const [lineId, sectorId] = key.split('|') as [string, string];
    const line = ctx.lines.get(lineId);
    const sector = ctx.scenario.sectors.find((x) => x.id === sectorId);
    if (!line || !sector) continue;
    if (pts.some((p) => p[1] >= sector.yMin && p[1] <= sector.yMax && p[0] <= lineXAt(line, p[1]) + match)) return true;
  }
  return false;
}

/**
 * Which side attacks each line in each sector, `lineId|sectorId`, fixed for the run: the side whose companies the plan
 * sends at it (attackers, not garrisons or reserves), or whose operation does (Task 13). Looked up only.
 */
const lineTakers = new WeakMap<StepContext, Map<string, Side>>();
export function lineTakerOf(state: Pick<SimState, 'companies'>, ctx: StepContext, key: string): Side | null {
  let m = lineTakers.get(ctx);
  if (!m) {
    m = new Map();
    for (const c of state.companies) if (c.objectiveLineId !== undefined && c.role !== 'garrison' && c.role !== 'reserve') m.set(`${c.objectiveLineId}|${c.sectorId}`, c.side);
    for (const op of ctx.scenario.operations ?? []) if ('lineId' in op.target) m.set(`${op.target.lineId}|${op.target.sectorId}`, op.side);
    lineTakers.set(ctx, m);
  }
  return m.get(key) ?? null;
}

/**
 * Whether a segment lies behind one of these lines (`lineId|sectorId` keys: lines its holder has taken and holds, as a
 * headquarters believes; Task 13 ruling, a counter-attack cannot pass through an intact enemy line): all of its trench
 * inside that line's sector more than `lineFeatureMatchM` behind the line (on the attackers' side, lower x). A segment at
 * or in front of the furthest of them is not behind any.
 */
export function behindLines(seg: SegmentState, keys: readonly string[], state: Pick<SimState, 'companies'>, ctx: StepContext): boolean {
  if (keys.length === 0) return false;
  // The answer is the segment's and the lines' geometry only: worked out once for each segment and set of lines (by the
  // keys array itself while the caller keeps it, as command.ts's memoised lists are; else by its contents).
  let byArray = behindByArray.get(keys);
  if (!byArray) behindByArray.set(keys, (byArray = new Map()));
  let hit = byArray.get(seg.id);
  if (hit !== undefined) return hit;
  let memo = behindMemo.get(ctx);
  if (!memo) behindMemo.set(ctx, (memo = new Map()));
  const key = `${seg.id}#${keys.join('#')}`;
  hit = memo.get(key);
  if (hit === undefined) memo.set(key, (hit = isBehindLines(seg, keys, state, ctx)));
  byArray.set(seg.id, hit);
  return hit;
}
const behindMemo = new WeakMap<StepContext, Map<string, boolean>>();
const behindByArray = new WeakMap<readonly string[], Map<string, boolean>>();

function isBehindLines(seg: SegmentState, keys: readonly string[], state: Pick<SimState, 'companies'>, ctx: StepContext): boolean {
  const match = v(ctx.tables.effects.lineFeatureMatchM);
  const pts = segmentSamples(ctx, seg, state.companies);
  for (const key of keys) {
    const [lineId, sectorId] = key.split('|') as [string, string];
    const line = ctx.lines.get(lineId);
    const sector = ctx.scenario.sectors.find((x) => x.id === sectorId);
    if (!line || !sector) continue;
    const inSector = pts.filter((p) => p[1] >= sector.yMin && p[1] <= sector.yMax);
    if (inSector.length > 0 && inSector.every((p) => p[0] < lineXAt(line, p[1]) - match)) return true;
  }
  return false;
}

// ---- segments changing hands --------------------------------------------------------------------------------

/**
 * A battery the enemy can take when it overruns the guns' position: one with no draught horses to pull the guns
 * away, because it never had any (`horseDrawn` false) or because it has lost them. Task 14 takes a battery's horses
 * when they are gassed (sets `horses` false). A battery with horses is caught only while it limbers up to withdraw, before
 * `withdrawal.limberedMin` (smaller.ts `withdrawBatteries`); once it is moving, or before it has seen the enemy, it gets away.
 */
export const capturable = (b: BatteryState, minute: number): boolean => !b.horses || (b.withdrawal !== undefined && minute < b.withdrawal.limberedMin);

/**
 * Segments change hands, in segment order (the model's movement phase; the plan: "attackers within 50 m of it outnumber
 * its emerged defenders by 3:1, or the defenders are gone").
 * - Attackers: the companies of the side not holding it, on the field and up (not down in dugouts), not waiting to start
 *   and not falling back, within `captureRadiusM` of its trench. Nothing happens while a barrage is on the trench within
 *   `captureRadiusM` of them (`barrageNear`): the rest of a long segment may be under it.
 * - Defenders: the holder's companies up within `captureRadiusM`, and (except on a garrison's first loss, which is as it
 *   was) the holder's companies up, consolidating or holding, within `lineFeatureMatchM` of it: the men on a taken line
 *   hold the trench they stand on, at the distance the line-taken rule ties a trench to a line.
 * - It changes holder when there are attackers and at least `captureRatio` times as many attacking men as defending.
 *   With no defenders, the defenders are gone and it changes holder, except in its holder's rear (`inRear`: at or behind
 *   a line its holder has taken): there it changes hands only by the 3:1 clause, so with no defenders at all it stays —
 *   unless an ordered counter-attack (a company whose intent is `counter-attack`, from the command model) is among the
 *   attackers: that protection is against sorties and incidental presence only (Task 10 ruling, Task 12).
 * - `segment-lost` when its garrison's side loses it, `segment-retaken` when that side takes it back. On a retake any of
 *   its men left in the dugouts there come up and rejoin it (each a `dugout-sortie`), and it counts as manned.
 * - Causes: `counter-attack` for a retake on orders (with a ref to the `counter-attack-ordered`), `left-unheld` for a
 *   retake of a trench nobody held (with a ref to the loss it undoes), `defenders-trapped`
 *   (the first loss of a segment whose garrison was caught below, with a ref to the
 *   trapping), `wire-cut` or `wire-uncut` (a lost segment with wire), `dugouts-uncleared` (attackers who came up from
 *   the dugouts, with refs to their sorties), `outnumbered` (defenders there were overpowered), and otherwise the fire
 *   that took its garrison out.
 *
 * Then guns are overrun (`captureGuns`): by the loss of a trench near them, or by attackers at the guns themselves.
 */
export function captureSegments(state: SimState, ctx: StepContext): SimState {
  const fx = ctx.tables.effects;
  const r = v(fx.captureRadiusM);
  const ratio = v(fx.captureRatio);
  const uncutBelow = v(fx.wireUncutBelow);
  let out = state;
  // Each side's companies up (the holders), those of them consolidating or holding (settled), and those that can take a
  // trench (takers: not waiting, not falling back), as pools of each side's buckets (buckets.ts `sideBuckets`).
  type Pools = { holders: (s: Side) => Pool; settled: (s: Side) => Pool; takers: (s: Side) => Pool };
  const poolsOf = (cs: readonly CompanyState[]): Pools => ({
    holders: (s) => ({ b: sideBuckets(cs, s), keep: isUp }),
    settled: (s) => ({ b: sideBuckets(cs, s), keep: isUpSettled }),
    takers: (s) => ({ b: sideBuckets(cs, s), keep: isTaker }),
  });
  let pools = poolsOf(state.companies);
  for (let i = 0; i < state.segments.length; i++) {
    // Segments keep their places in the array: a capture replaces the one it is about.
    const seg = out.segments[i]!;
    const pts = segmentSamples(ctx, seg, out.companies);
    if (pts.length === 0) continue;
    const other = enemyOf(seg.holder);
    const attackers = nearSegment(pools.takers(other), pts, r);
    const a = sum(attackers, (x) => x.c.men);
    if (!(a > 0)) continue;
    // Nobody enters a trench a barrage is falling on (as with trapping, gap.ts): only the trench near them matters.
    if (barrageNear(seg, ctx, out.companies, out.minute, attackers.map((x) => at(x.c)), r)) continue;
    const d = segmentDefenders(seg, pts, pools.holders(seg.holder), ctx, pools.settled(seg.holder)).men;
    // An ORDERED counter-attack (the command model's, Task 12) is not held off by the rear rule: reaching a segment in its
    // holder's rear with nobody there to hold it, it takes it back (with defenders, it needs the 3:1 as anyone does).
    const onOrder = attackers.flatMap((x) => {
      const o = x.c.intent === 'counter-attack' ? counterAttackOrder(x.c) : null;
      return o ? [o] : [];
    });
    const onOrders = onOrder.length > 0;
    if (d > 0 ? a < ratio * d : !onOrders && inRear(seg, out, ctx)) continue;

    const lost = seg.holder === seg.garrisonSide;
    // The trapping explains the first loss only: a segment retaken and lost again was not lost over men below.
    const trappedNow = lost && seg.trapped && seg.holderEventId === null;
    const lead = [...attackers].sort((p, q) => p.d - q.d || (p.c.id < q.c.id ? -1 : 1))[0]!.c;
    const below = sum(seg.dugoutPoints, (p) => p.men);
    const causes: Cause[] = [];
    const refs: number[] = [];
    if (trappedNow) {
      causes.push('defenders-trapped');
      if (seg.trappedEventId !== null) refs.push(seg.trappedEventId);
    }
    if (lost && seg.wireBeltDepthM > 0) causes.push(seg.wireCut >= uncutBelow ? 'wire-cut' : 'wire-uncut');
    for (const { c } of attackers)
      if (c.sortieEventId !== null) {
        causes.push('dugouts-uncleared');
        refs.push(c.sortieEventId);
      }
    // On orders: the counter-attack explains the retake, with a ref to the decision.
    for (const o of onOrder) {
      causes.push('counter-attack');
      if (o.eventId !== undefined) refs.push(o.eventId);
    }
    if (d > 0) causes.push('outnumbered');
    else if (!lost) {
      // Retaken with nobody holding it: its takers had moved on and left it (ref: the loss it undoes), as well as what
      // brought the men back (a sortie or an order, above).
      causes.push('left-unheld');
      if (seg.holderEventId !== null) refs.push(seg.holderEventId);
    } else if (lost && !trappedNow) {
      // Nobody up to hold it: what took its garrison out.
      for (const c of out.companies.filter((x) => seg.garrisonIds.includes(x.id))) {
        for (const f of c.recentFire) causes.push(...f.causes);
        if (c.status === 'surrendered') causes.push('morale-broke');
      }
    }
    if (causes.length === 0) causes.push('outnumbered');

    const id = out.nextEventId;
    const kind = lost ? 'segment-lost' : 'segment-retaken';
    // Retaken: the men of its garrison still below come up and rejoin it, each a sortie (after the retake's event).
    const rejoin = lost ? [] : seg.dugoutPoints.filter((p) => p.men > 0 && out.companies.some((c) => c.id === p.companyId && onField(c) && c.posture === 'in-dugout'));
    const sortieId = (k: number): number => id + 1 + k;
    out = emit(
      {
        ...out,
        companies: rejoin.length
          ? out.companies.map((c) => {
              const k = rejoin.findIndex((p) => p.companyId === c.id);
              return k < 0 ? c : { ...c, posture: 'in-trench' as const, sortieEventId: sortieId(k) };
            })
          : out.companies,
        // Retaken: its garrison's side holds it with men up in it, so nobody is left below and none can be caught there.
        segments: out.segments.map((x) => (x.id === seg.id ? { ...x, holder: other, holderEventId: id, ...(lost ? {} : { dugoutPoints: [], emerged: true }) } : x)),
      },
      {
        minute: out.minute,
        kind,
        segmentId: seg.id,
        unitId: lead.id,
        ...(lead.sectorId ? { sectorId: lead.sectorId } : {}),
        text: lost
          ? `${lead.name} takes ${seg.id}: ${a} men against ${d} up in the trench${below > 0 ? `, ${below} still in its dugouts` : ''}`
          : `${lead.name} retakes ${seg.id}: ${a} men against ${d}`,
        causes: ordered(causes),
        refs: sortedUnique(refs),
        factors: { attackers: a, defenders: d, inDugouts: below, ...(seg.wireBeltDepthM > 0 ? { wireCut: round(seg.wireCut, 3) } : {}) },
      },
      ...rejoin.map((p): NewEvent => {
        const g = out.companies.find((c) => c.id === p.companyId)!;
        const men = Math.min(p.men, g.men);
        return {
          minute: out.minute,
          kind: 'dugout-sortie',
          segmentId: seg.id,
          unitId: g.id,
          text: `${men} men of ${g.name}, left in the dugouts of ${seg.id}, come up as their side retakes it`,
          causes: ['dugouts-uncleared'],
          refs: [p.eventId, id],
          factors: { men, minutesBelow: out.minute - p.leftMin },
        };
      }),
    );
    if (rejoin.length) pools = poolsOf(out.companies);
  }
  return captureGuns(out, ctx);
}

/**
 * A segment's defenders (the capture rule's own definition; Task 12 reports use it too, so a headquarters decides on the
 * quantity the fight is resolved on): `holders` (its holder's companies up on the field) within `captureRadiusM` of its
 * trench, and, except on a garrison's first loss, those of them consolidating or holding within `lineFeatureMatchM`.
 */
export function segmentDefenders(seg: SegmentState, pts: readonly Point[], holders: readonly CompanyState[], ctx: StepContext, settled?: readonly CompanyState[]): { men: number; ids: string[] };
/** Given a pool of holders, the settled ones must come as a pool too. */
export function segmentDefenders(seg: SegmentState, pts: readonly Point[], holders: Pool, ctx: StepContext, settled: Pool): { men: number; ids: string[] };
export function segmentDefenders(
  seg: SegmentState,
  pts: readonly Point[],
  holders: readonly CompanyState[] | Pool,
  ctx: StepContext,
  settled?: readonly CompanyState[] | Pool,
): { men: number; ids: string[] } {
  const fx = ctx.tables.effects;
  const firstLoss = seg.holder === seg.garrisonSide && seg.holderEventId === null;
  const close = nearSegment(holders, pts, v(fx.captureRadiusM));
  // `settled`: those of the holders consolidating or holding, when the caller has them already (given a pool of holders, it must).
  const onLine = firstLoss ? [] : nearSegment(settled ?? (holders as readonly CompanyState[]).filter(isSettled), pts, v(fx.lineFeatureMatchM));
  const all = [...close, ...onLine.filter((x) => !close.some((y) => y.c.id === x.c.id))];
  return { men: sum(all, (x) => x.c.men), ids: all.map((x) => x.c.id) };
}

const isSettled = (c: CompanyState): boolean => c.status === 'consolidating' || c.status === 'holding';
const isUp = (c: CompanyState): boolean => onField(c) && c.posture !== 'in-dugout';
const isUpSettled = (c: CompanyState): boolean => isUp(c) && isSettled(c);
const isTaker = (c: CompanyState): boolean => isUp(c) && c.status !== 'waiting' && c.status !== 'falling-back';

/**
 * Guns overrun: every capturable battery (`capturable`) not yet taken whose position lies within `gunCaptureRadiusM`
 * of a segment of its side's that the enemy holds is captured, and fires no more. One `guns-captured` event for each
 * segment that took guns, referring to the event that lost the segment and with its causes; guns whose horses the gas
 * took (Task 14) add the cause `horses-gassed` and a ref to their `horses-gassed` event, and a battery taken later than
 * the segment's loss (its horses lost after the segment fell) has that cause alone.
 */
export function captureGuns(state: SimState, ctx: StepContext): SimState {
  return overrunGuns(gunsWithSegments(state, ctx), ctx);
}

function gunsWithSegments(state: SimState, ctx: StepContext): SimState {
  const rad = v(ctx.tables.effects.gunCaptureRadiusM);
  const lostSegs = state.segments.filter((s) => s.holder !== s.garrisonSide);
  if (lostSegs.length === 0) return state;
  const taken = new Map<string, BatteryState[]>(); // segment id -> batteries (looked up only)
  const order: SegmentState[] = [];
  // Batteries split from one artillery entry share its position: each position and side is looked at once (looked up only).
  const near = new Map<string, SegmentState | undefined>();
  const batteries = state.batteries.map((b) => {
    if (b.captured || !capturable(b, state.minute) || !b.position) return b;
    const key = `${b.side}|${b.position[0]}|${b.position[1]}`;
    if (!near.has(key)) near.set(key, lostSegs.find((s) => s.garrisonSide === b.side && distanceTo(segmentSamples(ctx, s, state.companies), b.position!) <= rad));
    const seg = near.get(key);
    if (!seg) return b;
    if (!taken.has(seg.id)) {
      taken.set(seg.id, []);
      order.push(seg);
    }
    taken.get(seg.id)!.push(b);
    return { ...b, captured: true };
  });
  if (order.length === 0) return state;
  const events: NewEvent[] = order.map((seg) => {
    const bs = taken.get(seg.id)!;
    const guns = sum(bs, (b) => b.guns);
    const lostNow = state.events.find((e) => e.id === seg.holderEventId);
    const ids = bs.map((b) => b.id.split('/')[0]!).filter((x, i, xs) => xs.indexOf(x) === i);
    // Guns whose horses the gas took (Task 14): the gassing is a cause, and its event a ref.
    const gassed = bs.flatMap((b) => (b.gassedEventId === undefined ? [] : [b.gassedEventId]));
    // Caught limbering up (Task 14 fix round): the enemy it was withdrawing from, and a ref to its withdrawal.
    const limbering = bs.flatMap((b) => (b.horses && b.withdrawal ? [b.withdrawal.eventId] : []));
    const causes: Cause[] = [...(lostNow ? lostNow.causes : []), ...(limbering.length ? (['enemy-near'] as const) : []), ...(gassed.length || (!lostNow && !limbering.length) ? (['horses-gassed'] as const) : [])];
    return {
      minute: state.minute,
      kind: 'guns-captured',
      segmentId: seg.id,
      text: `${guns} guns (${ids.join(', ')}) are overrun with ${seg.id}`,
      causes: ordered(causes),
      refs: sortedUnique([...(seg.holderEventId === null ? [] : [seg.holderEventId]), ...gassed, ...limbering]),
      factors: { guns },
    };
  });
  return emit({ ...state, batteries }, ...events);
}

/**
 * Guns overrun where they stand (Task 14; the table's `gunCaptureRadiusM`, "within which attackers capture a battery"):
 * every capturable battery not yet taken, far from any lost trench, is captured when the enemy's companies up on the
 * field (not waiting or falling back) within `gunCaptureRadiusM` of its position number at least `captureRatio` times its
 * own side's men up there (any, when none of its side is). Batteries at one position go together, positions in the
 * order of their first battery; one `guns-captured` event for each, its `unitId` the nearest attacker, causes
 * `horses-gassed` (refs: the gassing) for guns whose horses the gas took and `outnumbered` when men of its side stood
 * by them (or nothing else explains it).
 */
function overrunGuns(state: SimState, ctx: StepContext): SimState {
  const left = state.batteries.filter((b) => !b.captured && capturable(b, state.minute) && b.position);
  if (left.length === 0) return state;
  const fx = ctx.tables.effects;
  const rad = v(fx.gunCaptureRadiusM);
  const ratio = v(fx.captureRatio);
  const keyOf = (b: BatteryState): string => `${b.side}|${b.position![0]}|${b.position![1]}`;
  // Batteries by position, positions in the order of their first battery (an array of keys, the map looked up only).
  const at = new Map<string, BatteryState[]>();
  const keys: string[] = [];
  for (const b of left) {
    const k = keyOf(b);
    const bs = at.get(k);
    if (bs) bs.push(b);
    else (at.set(k, [b]), keys.push(k));
  }
  const up = state.companies.filter((c) => onField(c) && c.posture !== 'in-dugout');
  const won = new Map<string, { lead: CompanyState; defenders: number }>(); // position key -> who took it (looked up only)
  for (const key of keys) {
    const b = at.get(key)![0]!;
    const [px, py] = b.position!;
    // Those in the box around the position first (a cheap test, padded by a metre so that it only ever skips companies
    // further off than rad, whatever the rounding).
    const box = rad + 1;
    const within = up.filter((c) => c.x >= px - box && c.x <= px + box && c.y >= py - box && c.y <= py + box && Math.hypot(c.x - px, c.y - py) <= rad);
    const attackers = within.filter((c) => c.side !== b.side && c.status !== 'waiting' && c.status !== 'falling-back');
    const a = sum(attackers, (c) => c.men);
    const d = sum(within.filter((c) => c.side === b.side), (c) => c.men);
    if (!(a > 0) || (d > 0 && a < ratio * d)) continue;
    const lead = [...attackers].sort((p, q) => Math.hypot(p.x - px, p.y - py) - Math.hypot(q.x - px, q.y - py) || (p.id < q.id ? -1 : 1))[0]!;
    won.set(key, { lead, defenders: d });
  }
  if (won.size === 0) return state;
  const batteries = state.batteries.map((b) => (!b.captured && capturable(b, state.minute) && b.position && won.has(keyOf(b)) ? { ...b, captured: true } : b));
  const events: NewEvent[] = keys.flatMap((key): NewEvent[] => {
    const w = won.get(key);
    if (!w) return [];
    const bs = at.get(key)!;
    const guns = sum(bs, (b) => b.guns);
    const ids = bs.map((b) => b.id.split('/')[0]!).filter((x, i, xs) => xs.indexOf(x) === i);
    const gassed = bs.flatMap((b) => (b.gassedEventId === undefined ? [] : [b.gassedEventId]));
    const limbering = bs.flatMap((b) => (b.horses && b.withdrawal ? [b.withdrawal.eventId] : []));
    const causes: Cause[] = [...(gassed.length ? (['horses-gassed'] as const) : []), ...(limbering.length ? (['enemy-near'] as const) : [])];
    if (w.defenders > 0 || causes.length === 0) causes.push('outnumbered');
    return [{
      minute: state.minute,
      kind: 'guns-captured',
      unitId: w.lead.id,
      ...(w.lead.sectorId ? { sectorId: w.lead.sectorId } : {}),
      text: `${guns} guns (${ids.join(', ')}) are overrun by ${w.lead.name}`,
      causes: ordered(causes),
      refs: sortedUnique([...gassed, ...limbering]),
      factors: { guns, defenders: w.defenders },
    }];
  });
  return emit({ ...state, batteries }, ...events);
}

// ---- the dugouts --------------------------------------------------------------------------------------------

/**
 * The dugout points a company could clear: men still below in segments its side holds, within `captureRadiusM` of
 * it, in segment order and then point order.
 */
export function dugoutsNear(state: SimState, ctx: StepContext, c: CompanyState): Array<{ seg: SegmentState; point: DugoutPoint }> {
  const r = v(ctx.tables.effects.captureRadiusM);
  const out: Array<{ seg: SegmentState; point: DugoutPoint }> = [];
  for (const seg of withDugouts(state.segments)) {
    if (seg.holder !== c.side) continue;
    for (const point of seg.dugoutPoints)
      if (point.men > 0 && Math.hypot(point.point[0] - c.x, point.point[1] - c.y) <= r) out.push({ seg, point });
  }
  return out;
}

/** The segments with men left in their dug-outs, in segment order (worked out once for each segments array, never changed once made). */
const dugoutMemo = new WeakMap<readonly SegmentState[], SegmentState[]>();
function withDugouts(segments: readonly SegmentState[]): SegmentState[] {
  let hit = dugoutMemo.get(segments);
  if (!hit) dugoutMemo.set(segments, (hit = segments.filter((x) => x.dugoutPoints.length > 0)));
  return hit;
}

/** Whether a company can mop up: men standing, bombs for at least one man (or none needed), and dugouts near it to clear. */
export function canMopUp(state: SimState, ctx: StepContext, c: CompanyState): boolean {
  const perMan = v(ctx.tables.effects.bombsPerManCleared);
  return onField(c) && (perMan <= 0 || c.bombs >= perMan) && dugoutsNear(state, ctx, c).length > 0;
}

/**
 * Mopping up (the model's movement phase): each company whose intent is `mop-up`, in ascending id order, clears up to
 * `mopUpRateMenPerMin × dt` men (rounded without bias: one draw for each such company) out of the dugouts near it
 * (`dugoutsNear`), as far as its bombs go at `bombsPerManCleared` a man. The men cleared are taken prisoner: they
 * move from the garrison company's men to its `captured`. Each point cleared out emits `dugout-cleared` (cause
 * `defenders-trapped`, ref to the trapping), and is gone.
 */
export function mopUp(state: SimState, ctx: StepContext, dt: number): SimState {
  if (!state.companies.some((c) => c.intent === 'mop-up')) return state;
  const perMan = v(ctx.tables.effects.bombsPerManCleared);
  let companies = state.companies;
  let segments = state.segments;
  const events: NewEvent[] = [];
  for (const m0 of state.companies) {
    if (m0.intent !== 'mop-up') continue;
    const attack = ctx.doctrines[m0.doctrineId]!.attack;
    if (!attack) continue;
    let cap = stochasticRound(v(attack.mopUpRateMenPerMin) * dt, ctx.rngs['mop-up']);
    const m = companies.find((c) => c.id === m0.id)!;
    if (perMan > 0) cap = Math.min(cap, Math.floor(m.bombs / perMan + 1e-9));
    let used = 0;
    for (const { seg, point } of dugoutsNear({ ...state, companies, segments }, ctx, m)) {
      if (cap <= 0) break;
      const g = companies.find((c) => c.id === point.companyId)!;
      // Never more than the company has left (fire may have reached men below since they were trapped).
      const left = Math.min(point.men, g.men);
      const n = Math.min(cap, left);
      cap -= n;
      used += n;
      const p: DugoutPoint = { ...point, men: left - n, cleared: point.cleared + n };
      // The event that took them: this point's clearing once it is cleared out (its id, as emitted below), else its trapping.
      const taken = p.men === 0 ? { eventId: state.nextEventId + events.length, minute: state.minute } : { eventId: point.eventId, minute: state.minute };
      companies = companies.map((c) => (c.id === g.id ? { ...c, men: c.men - n, captured: c.captured + n, ...(n > 0 ? { takenPrisoner: taken } : {}) } : c));
      // A company has at most one point in a segment: it is replaced, or gone once cleared out.
      segments = segments.map((x) => (x.id !== seg.id ? x : { ...x, dugoutPoints: x.dugoutPoints.flatMap((q) => (q.companyId !== point.companyId ? [q] : p.men > 0 ? [p] : [])) }));
      if (p.men === 0)
        events.push({
          minute: state.minute,
          kind: 'dugout-cleared',
          segmentId: seg.id,
          unitId: m.id,
          ...(m.sectorId ? { sectorId: m.sectorId } : {}),
          text: `${m.name} clears the dugouts of ${g.name} in ${seg.id}: ${p.cleared} prisoners`,
          causes: ['defenders-trapped'],
          refs: [point.eventId],
          factors: { prisoners: p.cleared, minutesBelow: state.minute - point.leftMin },
        });
    }
    if (used > 0) companies = companies.map((c) => (c.id === m.id ? { ...c, bombs: Math.max(0, c.bombs - used * perMan) } : c));
  }
  return emit({ ...state, companies, segments }, ...events);
}

/**
 * Sorties: men left in the dugouts come up behind the attackers once `sortieDelayMin` has passed since the last enemy
 * company stood at the entrances. Any enemy company up within `captureRadiusM` of a dugout point guards it (SS 143:
 * moppers-up "guard the entrances to dugouts", and the later waves passing over do the same while they are there); the
 * clock starts when the last of them leaves (`unguardedMin`). Nobody comes up while a barrage is on the trench within
 * `captureRadiusM` of them. They are the garrison company's own men, so the company comes up into its trench (no men
 * are made): it fires on the attackers' later waves and rear like any company. `dugout-sortie`, cause
 * `dugouts-uncleared`, ref to the trapping.
 */
export function sorties(state: SimState, ctx: StepContext): SimState {
  const fx = ctx.tables.effects;
  const delay = v(fx.sortieDelayMin);
  const r = v(fx.captureRadiusM);
  if (!state.segments.some((s) => s.dugoutPoints.length > 0)) return state;
  const up = state.companies.filter((c) => onField(c) && c.posture !== 'in-dugout');
  let out = state;
  for (const seg0 of state.segments) {
    for (const point of seg0.dugoutPoints) {
      const guarded = up.some((c) => c.side !== seg0.garrisonSide && Math.hypot(point.point[0] - c.x, point.point[1] - c.y) <= r);
      const swap = (q: DugoutPoint | null) => (x: SegmentState): SegmentState =>
        x.id === seg0.id ? { ...x, dugoutPoints: x.dugoutPoints.flatMap((p) => (p.companyId !== point.companyId ? [p] : q ? [q] : [])) } : x;
      if (guarded) {
        if (point.unguardedMin !== out.minute) out = { ...out, segments: out.segments.map(swap({ ...point, unguardedMin: out.minute })) };
        continue;
      }
      if (out.minute < point.unguardedMin + delay) continue;
      const seg = segmentById(out.segments, seg0.id)!;
      if (barrageNear(seg, ctx, out.companies, out.minute, [point.point], r)) continue;
      const g = out.companies.find((c) => c.id === point.companyId)!;
      const men = Math.min(point.men, g.men);
      if (men <= 0 || !onField(g)) {
        out = { ...out, segments: out.segments.map(swap(null)) };
        continue;
      }
      const id = out.nextEventId;
      out = emit(
        {
          ...out,
          companies: out.companies.map((c) => (c.id === g.id ? { ...c, posture: 'in-trench' as const, sortieEventId: id } : c)),
          segments: out.segments.map(swap(null)),
        },
        {
          minute: out.minute,
          kind: 'dugout-sortie',
          segmentId: seg0.id,
          unitId: g.id,
          text: `${men} men of ${g.name}, left in the dugouts of ${seg0.id} ${out.minute - point.leftMin} minutes ago, come up behind the attackers`,
          causes: ['dugouts-uncleared'],
          refs: [point.eventId],
          factors: { men, minutesBelow: out.minute - point.leftMin, unguardedMin: out.minute - point.unguardedMin },
        },
      );
    }
  }
  return out;
}

/** The minutes men left in dugouts are due to come up. A sortie moves nobody: the men fire from their own trench. */
export function dugoutSorties(state: SimState, ctx: StepContext): Scheduled[] {
  const delay = v(ctx.tables.effects.sortieDelayMin);
  return state.segments.flatMap((s) => s.dugoutPoints.filter((p) => p.men > 0).map((p) => ({ minute: p.unguardedMin + delay, startsMovement: false })));
}

// ---- segments of a line -------------------------------------------------------------------------------------

const onLineCache = new WeakMap<StepContext, Map<string, string[]>>();

/**
 * The segments an objective line runs along in a sector, for the line-taken rule: those with a point of their trench
 * inside the sector's y range (and the line's) lying within `lineFeatureMatchM` of the line, measured along x.
 * Fixed for the run, so worked out once.
 */
export function segmentsOnLine(state: SimState, ctx: StepContext, lineId: string, sectorId: string): SegmentState[] {
  // Keyed by the run's context: the answer depends on its tables (lineFeatureMatchM) and segments, not only on the scenario.
  let cache = onLineCache.get(ctx);
  if (!cache) onLineCache.set(ctx, (cache = new Map()));
  const key = `${lineId}|${sectorId}`;
  let ids = cache.get(key);
  if (!ids) {
    const pts = ctx.lines.get(lineId);
    const sector = ctx.scenario.sectors.find((x) => x.id === sectorId);
    const match = v(ctx.tables.effects.lineFeatureMatchM);
    ids = [];
    if (pts && pts.length > 0 && sector) {
      const lo = Math.max(sector.yMin, pts[0]![1]);
      const hi = Math.min(sector.yMax, pts[pts.length - 1]![1]);
      for (const seg of state.segments)
        if (segmentSamples(ctx, seg, state.companies).some((p) => p[1] >= lo && p[1] <= hi && Math.abs(p[0] - lineXAt(pts, p[1])) <= match)) ids.push(seg.id);
    }
    cache.set(key, ids);
  }
  // The same segments array gives the same answer (segments are never changed once made): kept for each array and key.
  let byKey = onLineBySegments.get(state.segments);
  if (!byKey) onLineBySegments.set(state.segments, (byKey = new Map()));
  let hit = byKey.get(key);
  if (!hit || hit.ids !== ids) {
    const want = ids;
    byKey.set(key, (hit = { ids, segs: state.segments.filter((s) => want.includes(s.id)) }));
  }
  return hit.segs.slice();
}
const onLineBySegments = new WeakMap<readonly SegmentState[], Map<string, { ids: string[]; segs: SegmentState[] }>>();
