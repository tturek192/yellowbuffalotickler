import { v } from '@wwi/scenario';
import type { Point } from '@wwi/scenario';
import { distanceTo, segmentSamples } from './artillery';
import { CAUSES, emit } from './causes';
import type { Cause, NewEvent } from './causes';
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

/** The box around a segment's trench samples, for cheap "could it be within r" tests. */
function boxOf(pts: readonly Point[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return [x0, y0, x1, y1];
}

/** Companies (in the order given) within r of a segment's trench. */
function nearSegment(cs: readonly CompanyState[], pts: readonly Point[], r: number): Array<{ c: CompanyState; d: number }> {
  const [x0, y0, x1, y1] = boxOf(pts);
  const out: Array<{ c: CompanyState; d: number }> = [];
  for (const c of cs) {
    if (c.x < x0 - r || c.x > x1 + r || c.y < y0 - r || c.y > y1 + r) continue;
    const d = distanceTo(pts, at(c));
    if (d <= r) out.push({ c, d });
  }
  return out;
}

// ---- segments changing hands --------------------------------------------------------------------------------

/**
 * A battery the enemy can take when it overruns the guns' position: one with no draught horses to pull the guns
 * away, because it never had any (`horseDrawn` false) or because it has lost them. Task 14 takes a battery's horses
 * when they are gassed (sets `horses` false); until then a horse-drawn battery always gets its guns away.
 */
export const capturable = (b: BatteryState): boolean => !b.horses;

/**
 * Segments change hands, in segment order (the model's movement phase). A segment's attackers are the companies of
 * the side not holding it, on the field and up (not down in dugouts), not waiting to start and not falling back,
 * within `captureRadiusM` of its trench (none while a barrage is on it); its defenders are the holder's companies up
 * and within that distance (a garrison still down in its dugouts defends nothing). It changes holder when there are
 * attackers and either no defenders or at least `captureRatio` times as many attacking men as defending:
 * `segment-lost` when its garrison's side loses it, `segment-retaken` when that side takes it back (any of its men left
 * in the dugouts there come up and rejoin it, and it counts as manned). Causes: `defenders-trapped` (the first loss of
 * a segment whose garrison was caught below, with a ref to the trapping), `wire-cut` or `wire-uncut` (a lost segment
 * with wire), `dugouts-uncleared` (attackers who came up from the dugouts, with refs to their sorties), `outnumbered`
 * (defenders there were overpowered), and otherwise the fire that took its garrison out.
 *
 * Then guns are overrun (`captureGuns`).
 */
export function captureSegments(state: SimState, ctx: StepContext): SimState {
  const fx = ctx.tables.effects;
  const r = v(fx.captureRadiusM);
  const ratio = v(fx.captureRatio);
  const uncutBelow = v(fx.wireUncutBelow);
  let out = state;
  const upOf = (cs: readonly CompanyState[]) => cs.filter((c) => onField(c) && c.posture !== 'in-dugout');
  let up = upOf(state.companies);
  for (const seg0 of state.segments) {
    const seg = out.segments.find((x) => x.id === seg0.id)!;
    // Nobody enters a trench a barrage is falling on (as with trapping, gap.ts).
    if (seg.barrageLastOverMin === out.minute) continue;
    const pts = segmentSamples(ctx, seg, out.companies);
    if (pts.length === 0) continue;
    const other = enemyOf(seg.holder);
    const attackers = nearSegment(up.filter((c) => c.side === other && c.status !== 'waiting' && c.status !== 'falling-back'), pts, r);
    const defenders = nearSegment(up.filter((c) => c.side === seg.holder), pts, r);
    const a = sum(attackers, (x) => x.c.men);
    const d = sum(defenders, (x) => x.c.men);
    if (!(a > 0) || (d > 0 && a < ratio * d)) continue;

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
    if (d > 0) causes.push('outnumbered');
    else if (lost && !trappedNow) {
      // Nobody up to hold it: what took its garrison out.
      for (const c of out.companies.filter((x) => seg.garrisonIds.includes(x.id))) {
        for (const f of c.recentFire) causes.push(...f.causes);
        if (c.status === 'surrendered') causes.push('morale-broke');
      }
    }
    if (causes.length === 0) causes.push('outnumbered');

    const id = out.nextEventId;
    const kind = lost ? 'segment-lost' : 'segment-retaken';
    const rejoin = lost ? [] : seg.dugoutPoints.map((p) => p.companyId);
    out = emit(
      {
        ...out,
        companies: rejoin.length ? out.companies.map((c) => (rejoin.includes(c.id) && c.posture === 'in-dugout' ? { ...c, posture: 'in-trench' as const } : c)) : out.companies,
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
    );
    if (rejoin.length) up = upOf(out.companies);
  }
  return captureGuns(out, ctx);
}

/**
 * Guns overrun: every capturable battery (`capturable`) not yet taken whose position lies within `gunCaptureRadiusM`
 * of a segment of its side's that the enemy holds is captured, and fires no more. One `guns-captured` event for each
 * segment that took guns, referring to the event that lost the segment and with its causes; a battery taken later
 * than that (its horses lost after the segment fell) has the cause `horses-gassed`.
 */
export function captureGuns(state: SimState, ctx: StepContext): SimState {
  const rad = v(ctx.tables.effects.gunCaptureRadiusM);
  const lostSegs = state.segments.filter((s) => s.holder !== s.garrisonSide);
  if (lostSegs.length === 0) return state;
  const taken = new Map<string, BatteryState[]>(); // segment id -> batteries (looked up only)
  const order: SegmentState[] = [];
  const batteries = state.batteries.map((b) => {
    if (b.captured || !capturable(b) || !b.position) return b;
    const seg = lostSegs.find((s) => s.garrisonSide === b.side && distanceTo(segmentSamples(ctx, s, state.companies), b.position!) <= rad);
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
    return {
      minute: state.minute,
      kind: 'guns-captured',
      segmentId: seg.id,
      text: `${guns} guns (${ids.join(', ')}) are overrun with ${seg.id}`,
      causes: lostNow ? lostNow.causes : ['horses-gassed'],
      refs: seg.holderEventId === null ? [] : [seg.holderEventId],
      factors: { guns },
    };
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
  for (const seg of state.segments) {
    if (seg.holder !== c.side || seg.dugoutPoints.length === 0) continue;
    for (const point of seg.dugoutPoints)
      if (point.men > 0 && Math.hypot(point.point[0] - c.x, point.point[1] - c.y) <= r) out.push({ seg, point });
  }
  return out;
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
    let cap = stochasticRound(v(attack.mopUpRateMenPerMin) * dt, ctx.rng);
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
      companies = companies.map((c) => (c.id === g.id ? { ...c, men: c.men - n, captured: c.captured + n } : c));
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
 * Sorties: men left in the dugouts come up behind the attackers once `sortieDelayMin` has passed since the leading wave
 * left them there, unless a mopping-up company is at the entrances (an enemy company mopping up within
 * `captureRadiusM` of them). They are the garrison company's own men, so the company comes up into its trench (no men
 * are made): it fires on the attackers' later waves and rear like any company, and can retake the segment.
 * `dugout-sortie`, cause `dugouts-uncleared`, ref to the trapping.
 */
export function sorties(state: SimState, ctx: StepContext): SimState {
  const fx = ctx.tables.effects;
  const delay = v(fx.sortieDelayMin);
  const r = v(fx.captureRadiusM);
  if (!state.segments.some((s) => s.dugoutPoints.length > 0)) return state;
  const moppers = state.companies.filter((c) => onField(c) && c.intent === 'mop-up');
  let out = state;
  for (const seg0 of state.segments) {
    for (const point of seg0.dugoutPoints) {
      if (out.minute < point.leftMin + delay) continue;
      if (moppers.some((c) => c.side !== seg0.garrisonSide && Math.hypot(point.point[0] - c.x, point.point[1] - c.y) <= r)) continue;
      const g = out.companies.find((c) => c.id === point.companyId)!;
      const men = Math.min(point.men, g.men);
      const id = out.nextEventId;
      const drop = (x: SegmentState): SegmentState => (x.id === seg0.id ? { ...x, dugoutPoints: x.dugoutPoints.filter((q) => q.companyId !== point.companyId) } : x);
      if (men <= 0 || !onField(g)) {
        out = { ...out, segments: out.segments.map(drop) };
        continue;
      }
      out = emit(
        {
          ...out,
          companies: out.companies.map((c) => (c.id === g.id ? { ...c, posture: 'in-trench' as const, sortieEventId: id } : c)),
          segments: out.segments.map(drop),
        },
        {
          minute: out.minute,
          kind: 'dugout-sortie',
          segmentId: seg0.id,
          unitId: g.id,
          text: `${men} men of ${g.name}, left in the dugouts of ${seg0.id} ${out.minute - point.leftMin} minutes ago, come up behind the attackers`,
          causes: ['dugouts-uncleared'],
          refs: [point.eventId],
          factors: { men, minutesBelow: out.minute - point.leftMin },
        },
      );
    }
  }
  return out;
}

/** The minutes men left in dugouts are due to come up. A sortie moves nobody: the men fire from their own trench. */
export function dugoutSorties(state: SimState, ctx: StepContext): Scheduled[] {
  const delay = v(ctx.tables.effects.sortieDelayMin);
  return state.segments.flatMap((s) => s.dugoutPoints.filter((p) => p.men > 0).map((p) => ({ minute: p.leftMin + delay, startsMovement: false })));
}

// ---- segments of a line -------------------------------------------------------------------------------------

const onLineCache = new WeakMap<object, Map<string, string[]>>();

/**
 * The segments an objective line runs along in a sector, for the line-taken rule: those with a point of their trench
 * inside the sector's y range (and the line's) lying within `lineFeatureMatchM` of the line, measured along x.
 * Fixed for the run, so worked out once.
 */
export function segmentsOnLine(state: SimState, ctx: StepContext, lineId: string, sectorId: string): SegmentState[] {
  let cache = onLineCache.get(ctx.scenario);
  if (!cache) onLineCache.set(ctx.scenario, (cache = new Map()));
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
  const want = ids;
  return state.segments.filter((s) => want.includes(s.id));
}
