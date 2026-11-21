import { minutesBetween, ScenarioError, v } from '@wwi/scenario';
import type { Point, Scenario, Weapon } from '@wwi/scenario';
import { bandAt, barrageXAt, planReachX } from './barrage';
import { emit } from './causes';
import type { Cause, NewEvent } from './causes';
import type { CompanyState } from './companies';
import { lineXAt } from './geometry';
import { distToSegment, groundAt, inPolygon } from './ground';
import { visibilityM } from './light';
import { round } from './record';
import type { Scheduled } from './schedule';
import { featurePieces, featurePoints, pointRadiusM } from './segments';
import { onField } from './step';
import type { SimState, StepContext } from './step';
import type { BatteryState, FireGroup, Observation, Pending, SegmentState, Side } from './types';

/*
 * Artillery in the battle (the model, "Fire" and "The gap"). Each step the artillery phase gathers, as
 * pending damage for `resolve`:
 * 1. the creeping barrage on everyone inside its band, own troops too (`friendly-barrage`); men down in their
 *    dugouts under it take nothing, but it keeps them there;
 * 2. standing barrages (`standing` and `heavy` artillery) on the enemy's trench segments ahead of the band, as far as
 *    the fire plan reaches, until the creeping barrage comes over them;
 * 3. the machine-gun barrage, a zone `mgBarrageDepthM` deep beyond the band, which suppresses only;
 * 4. defensive fire of the `defensive` batteries on no man's land and on their side's lost segments, whenever
 *    enemies are there (`defensive-barrage`);
 * 5. off-map fire inside its window (`off-map-fire`), on the units in its target.
 *
 * Counter-battery fire during the battle (on-map `counter-battery` batteries and off-map fire on battery positions
 * alike) is not modelled yet: it should come as one mechanism with a data coefficient, with gas on the batteries
 * (Task 14). Until then the German batteries recover from their Zero suppression only by `batteryRecoveryHalfLifeMin`.
 *
 * Fire-plan fire (1 to 4) is laid on lines the batteries were sited to reach, so it has no range term: one artillery
 * entry's position stands for many batteries spread along the front (at Vimy the 108 German field guns share one
 * point), and positions matter for counter-battery, not for where a barrage lands.
 *
 * Every number is data: weapons' rpm, lethality and suppression, cover, and the `tables.effects` keys
 * (barrageBandDepthM, mgBarrageDepthM, densityRefMen, safeDepthM, unobservedFireFactor, observerRangeM,
 * batteriesRecoveredFrac, blockedExitFactor, gapMultiplier, captureRadiusM, trenchProximityM). SAMPLE_M is a
 * numerical-method constant.
 */

/** Spacing of the sample points along a segment's trench, in metres (numerical-method constant, like sight's 25 m). */
const SAMPLE_M = 25;

type Sector = Scenario['sectors'][number];
const SIDES: readonly Side[] = ['allied', 'central'];
const enemyOf = (s: Side): Side => (s === 'allied' ? 'central' : 'allied');
const sum = <T>(xs: readonly T[], f: (x: T) => number): number => xs.reduce((t, x) => t + f(x), 0);
const at = (c: Pick<CompanyState, 'x' | 'y'>): Point => [c.x, c.y];

// ---- geometry -----------------------------------------------------------------------------------------------

const samplesCache = new WeakMap<Scenario, Map<string, Point[]>>();

/**
 * Points along a segment's stretch of trench, at most SAMPLE_M apart; a point strongpoint's run along its y band
 * through the point. A garrison placed past its trench's end has no stretch, so its garrisons' places stand for it.
 */
export function segmentSamples(ctx: StepContext, seg: SegmentState, companies: readonly CompanyState[]): Point[] {
  let cache = samplesCache.get(ctx.scenario);
  if (!cache) samplesCache.set(ctx.scenario, (cache = new Map()));
  const hit = cache.get(seg.id);
  if (hit) return hit;
  const f = ctx.scenario.features.find((x) => x.id === seg.featureId);
  if (!f) throw new Error(`Segment ${seg.id}: no feature "${seg.featureId}"`);
  const out: Point[] = [];
  const along = (a: Point, b: Point): void => {
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / SAMPLE_M));
    for (let k = 0; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  };
  if (f.geometry.type === 'Point') along([f.geometry.coordinates[0], seg.yMin], [f.geometry.coordinates[0], seg.yMax]);
  else for (const piece of featurePieces(f, seg.yMin, seg.yMax)) for (let i = 0; i < piece.length - 1; i++) along(piece[i]!, piece[i + 1]!);
  if (out.length === 0) for (const c of companies) if (seg.garrisonIds.includes(c.id)) out.push(at(c));
  cache.set(seg.id, out);
  return out;
}

/** The distance from p to the nearest of the points. */
export const distanceTo = (pts: readonly Point[], p: Point): number => {
  let d = Infinity;
  for (const q of pts) d = Math.min(d, Math.hypot(q[0] - p[0], q[1] - p[1]));
  return d;
};

/** The sector a y falls in: yMin ≤ y < yMax, or y = yMax of a sector no other sector continues. */
function sectorAtY(sectors: readonly Sector[], y: number): Sector | undefined {
  return sectors.find((s) => s.yMin <= y && y < s.yMax) ?? sectors.find((s) => s.yMax === y);
}

/** Sectors in ascending id order (the order fire is gathered in). */
const sortedSectors = (ctx: StepContext): Sector[] => [...ctx.scenario.sectors].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

type Lines = StepContext['scenario']['lines'];
const covering = (lines: Lines, side: Side, y: number) =>
  lines.filter((l) => l.kind === 'trench' && l.side === side && l.points[0]![1] <= y && y <= l.points[l.points.length - 1]![1]);

/**
 * No man's land at y for the defensive fire of `side`: between its own trench line and the enemy's (the pair of
 * lines closest together there), as [lower x, higher x]; null where either side has no trench line at y.
 */
export function noMansLandAt(lines: Lines, side: Side, y: number): [number, number] | null {
  let best: [number, number] | null = null;
  for (const own of covering(lines, side, y))
    for (const foe of covering(lines, enemyOf(side), y)) {
      const a = lineXAt(own.points, y);
      const b = lineXAt(foe.points, y);
      if (!best || Math.abs(a - b) < best[1] - best[0]) best = [Math.min(a, b), Math.max(a, b)];
    }
  return best;
}

const nmlAtCache = new WeakMap<Scenario, Map<string, [number, number] | null>>();
/** `noMansLandAt` for the scenario's lines, remembered by side and y (lines are fixed for the run; looked up only). */
function nmlAt(ctx: StepContext, side: Side, y: number): [number, number] | null {
  let m = nmlAtCache.get(ctx.scenario);
  if (!m) nmlAtCache.set(ctx.scenario, (m = new Map()));
  const key = `${side}|${y}`;
  const hit = m.get(key);
  if (hit !== undefined) return hit;
  const out = noMansLandAt(ctx.scenario.lines, side, y);
  m.set(key, out);
  return out;
}

const nmlCache = new WeakMap<Scenario, Map<Side, number>>();
/** The frontage of no man's land for `side`'s defensive fire: the length of y over which both sides have a trench line. */
function noMansLandWidth(ctx: StepContext, side: Side): number {
  let m = nmlCache.get(ctx.scenario);
  if (!m) nmlCache.set(ctx.scenario, (m = new Map()));
  const hit = m.get(side);
  if (hit !== undefined) return hit;
  const extent = (l: Lines[number]): [number, number] => [l.points[0]![1], l.points[l.points.length - 1]![1]];
  const own = ctx.scenario.lines.filter((l) => l.kind === 'trench' && l.side === side).map(extent);
  const foe = ctx.scenario.lines.filter((l) => l.kind === 'trench' && l.side === enemyOf(side)).map(extent);
  const parts = own.flatMap((a) => foe.flatMap((b): Array<[number, number]> => (Math.max(a[0], b[0]) < Math.min(a[1], b[1]) ? [[Math.max(a[0], b[0]), Math.min(a[1], b[1])]] : [])));
  parts.sort((a, b) => a[0] - b[0]);
  let width = 0;
  let end = -Infinity;
  for (const [lo, hi] of parts) {
    if (hi <= end) continue;
    width += hi - Math.max(lo, end);
    end = hi;
  }
  if (width === 0 && ctx.scenario.artillery.some((a) => a.side === side && a.role === 'defensive'))
    ctx.defaultsUsed.add(`defensive fire of ${side} on no man's land ← none (no trench line of both sides over the same stretch)`);
  m.set(side, width);
  return width;
}

/** An off-map fire as the engine uses it: its window in minutes after Zero, what lies in its target, and the target's frontage. */
type OffMapFire = { id: string; side: Side; weapon: Weapon; weaponId: string; guns: number; fromMin: number; toMin: number; inside: (p: Point) => boolean; frontageM: number };
const offMapCache = new WeakMap<Scenario, OffMapFire[]>();

function offMapFires(ctx: StepContext): OffMapFire[] {
  const s = ctx.scenario;
  const hit = offMapCache.get(s);
  if (hit) return hit;
  const zero = v(s.zeroHour);
  const out = [...(s.offMap?.fire ?? [])]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .flatMap((e): OffMapFire[] => {
      const weapon = ctx.tables.weapons[e.weapon];
      if (!weapon) throw new ScenarioError([`offMap.fire[${e.id}]: weapon "${e.weapon}" is not in the tables`]);
      let inside: (p: Point) => boolean;
      let frontageM: number;
      const t = e.target;
      if ('featureId' in t) {
        const f = s.features.find((x) => x.id === t.featureId);
        if (!f) throw new ScenarioError([`offMap.fire[${e.id}]: target names no feature "${t.featureId}"`]);
        const ys = featurePoints(f).map((p) => p[1]);
        if (f.geometry.type === 'Point') {
          const c = f.geometry.coordinates;
          const r = pointRadiusM(f, ctx.tables, ctx.defaultsUsed);
          inside = (p) => Math.hypot(p[0] - c[0], p[1] - c[1]) <= r;
          frontageM = 2 * r;
        } else if (f.geometry.type === 'Polygon') {
          const pts = f.geometry.coordinates;
          inside = (p) => inPolygon(pts, p[0], p[1]);
          frontageM = Math.max(...ys) - Math.min(...ys);
        } else {
          const pts = f.geometry.coordinates;
          const near = v(ctx.tables.effects.trenchProximityM);
          inside = (p) => pts.slice(1).some((b, i) => distToSegment(p, pts[i]!, b) <= near);
          frontageM = Math.max(...ys) - Math.min(...ys);
        }
      } else {
        inside = (p) => p[0] >= t.xMin && p[0] <= t.xMax && p[1] >= t.yMin && p[1] <= t.yMax;
        frontageM = t.yMax - t.yMin;
      }
      if (!(frontageM > 0)) {
        ctx.defaultsUsed.add(`offMap.fire[${e.id}] ← not fired (its target has no frontage)`);
        return [];
      }
      return [{ id: e.id, side: e.side, weapon, weaponId: e.weapon, guns: v(e.guns), fromMin: minutesBetween(zero, e.window.from), toMin: minutesBetween(zero, e.window.to), inside, frontageM }];
    });
  offMapCache.set(s, out);
  return out;
}

/**
 * Record the rules the battle's artillery applies for want of data (Review Focus 2), once at setup:
 * - creeping and machine-gun barrage batteries name no sector, so they are shared among the sectors by width;
 * - fire-plan fire has no range term, because one artillery entry's position stands for many batteries.
 */
export function noteArtilleryDefaults(s: Scenario, defaultsUsed: Set<string>): void {
  for (const a of s.artillery)
    if ((a.role === 'creeping' || a.role === 'mg-barrage') && s.sectors.length > 0) defaultsUsed.add(`artillery[${a.id}] ← shared across sectors by width (no sector given)`);
  if (s.artillery.some((a) => (['creeping', 'standing', 'heavy', 'mg-barrage', 'defensive'] as const).some((r) => r === a.role)))
    defaultsUsed.add("fire-plan fire ← no range term (an artillery entry's position stands for many batteries along the front)");
}

// ---- observation and fire -----------------------------------------------------------------------------------

/**
 * How well a battery's fire finds its targets (the model's observation(F) for artillery), 0 to 1:
 * - map: 1. Fire on positions plotted in advance (trenches, barrage and SOS lines) is what the weapon's
 *   lethality describes;
 * - forward observer or aircraft: `unobservedFireFactor` + (1 − it) × the share of its fire seen, which is the
 *   visibility factor (visibility over `observerRangeM`, at most 1), times `air.observedFrac` for aircraft.
 */
export function observationFactor(o: Observation, ctx: StepContext, visM: number, observedFrac: number): number {
  if (o === 'map') return 1;
  const fx = ctx.tables.effects;
  const unseen = v(fx.unobservedFireFactor);
  const sight = Math.min(1, visM / v(fx.observerRangeM));
  return unseen + (1 - unseen) * (o === 'aircraft' ? observedFrac * sight : sight);
}

/** Guns of one weapon, seen one way, firing on each 100 m of a frontage. */
type Fire = { weapon: Weapon; per100: number; obs: number };

/** A company's cover from shells: the cover table for its posture and ground; men in dugouts by their dugouts' depth too (their own, else the segment's mean). */
function shellCover(c: CompanyState, ctx: StepContext, segs: ReadonlyMap<string, SegmentState>): number {
  const cover = v(ctx.tables.cover[c.posture][groundAt(ctx.world, at(c))]);
  if (c.posture !== 'in-dugout') return cover;
  const d = c.dugoutDepthM ?? (c.segmentId === undefined ? 0 : (segs.get(c.segmentId)?.dugoutDepthM ?? 0));
  const safe = v(ctx.tables.effects.safeDepthM);
  return cover * (d + safe > 0 ? 1 - d / (d + safe) : 1);
}

/**
 * Expected hits and rounds on a company from `fires` for `min` minutes (the model's fire formula with n_w the guns
 * on 100 m, and observation in place of the range and visibility terms). Men in dugouts are not suppressed.
 */
function fireOn(c: CompanyState, fires: readonly Fire[], min: number, ctx: StepContext, segs: ReadonlyMap<string, SegmentState>, suppressOnly = false) {
  const density = Math.min(1, c.men / v(ctx.tables.effects.densityRefMen));
  const cover = suppressOnly ? 0 : shellCover(c, ctx, segs);
  let hits = 0;
  let rounds = 0;
  let weighted = 0;
  for (const f of fires) {
    const r = f.per100 * v(f.weapon.rpm) * min * f.obs;
    if (!suppressOnly) hits += r * v(f.weapon.lethality) * cover * density;
    if (c.posture !== 'in-dugout') {
      rounds += r;
      weighted += r * v(f.weapon.suppressPerRound);
    }
  }
  return { hits, rounds, suppressPerRound: rounds > 0 ? weighted / rounds : 0 };
}

/** Rounds a set of fires puts on a frontage of `frontageM` in `min` minutes. */
const roundsOver = (fires: readonly Fire[], frontageM: number, min: number): number => sum(fires, (f) => (f.per100 * frontageM * v(f.weapon.rpm) * min * f.obs) / 100);

type Spent = { battery: BatteryState; guns: number };

/**
 * The guns of these batteries that fire `share` of `min` minutes, as far as their ammunition lasts; spends it
 * (mutating the batteries, which are this step's copies). A battery with too little left fires what it has.
 */
function spend(batteries: BatteryState[], ctx: StepContext, min: number, share: number): Spent[] {
  return batteries.map((b) => {
    const need = b.guns * v(ctx.tables.weapons[b.weapon]!.rpm) * min * share;
    if (!(need > 0)) return { battery: b, guns: 0 };
    const frac = Math.min(1, b.ammoLeft / need);
    b.ammoLeft = frac < 1 ? 0 : b.ammoLeft - need;
    return { battery: b, guns: b.guns * frac };
  });
}

/** Spent guns as fires on 100 m of `frontageM`, one per weapon and observation, in the order the batteries come. */
function firesOf(spent: Spent[], frontageM: number, obsOf: (o: Observation) => number, ctx: StepContext): Fire[] {
  const out: Array<Fire & { key: string }> = [];
  for (const { battery: b, guns } of spent) {
    if (!(guns > 0)) continue;
    const key = `${b.weapon}|${b.observation}`;
    let f = out.find((x) => x.key === key);
    if (!f) out.push((f = { key, weapon: ctx.tables.weapons[b.weapon]!, per100: 0, obs: obsOf(b.observation) }));
    f.per100 += (guns * 100) / frontageM;
  }
  return out;
}

/** A battery fires while it is not silenced, has rounds left and has not been overrun (Task 10). */
const inAction = (b: BatteryState): boolean => b.suppressedUntilMin === null && b.ammoLeft > 0 && !b.captured;
const gunsIn = (bs: readonly BatteryState[], side: Side, pred: (b: BatteryState) => boolean = () => true): number =>
  sum(bs.filter((b) => b.side === side && pred(b)), (b) => b.guns);

// ---- the artillery phase --------------------------------------------------------------------------------------

/**
 * Gather this step's artillery fire (the module comment's five sources) into `pending`, bring recovered
 * batteries back into action, spend ammunition, and mark the segments a barrage is on. Emits
 * `batteries-recovered`, `ammunition-exhausted` and `barrage-passed`.
 */
export function artilleryFire(state: SimState, ctx: StepContext, dt: number, pending: Pending): SimState {
  const minute = state.minute;
  const from = minute - dt;
  const fx = ctx.tables.effects;
  const s = ctx.scenario;
  const events: NewEvent[] = [];
  const bats = state.batteries.map((b) => ({ ...b }));
  const ammoBefore = bats.map((b) => b.ammoLeft);
  const segs = new Map(state.segments.map((x) => [x.id, x]));
  const field = state.companies.filter(onField);
  const sectors = sortedSectors(ctx);
  const barrageOf = new Map(state.barrages.map((b) => [b.sectorId, b]));
  // Each sector's barrage fires for the minutes of this step it was active: all of them, or, in the step it ends in,
  // those before its end (so a quiet step that takes in a barrage's end fires as many minutes as fine steps would).
  // A barrage that ended within the step lies where it last stood (pausing beyond its last line) for that fire.
  const endedAt = (b: SimState['barrages'][number]): number | null => (b.phase === 'done' && b.phaseStartMin > from ? b.phaseStartMin : null);
  const minutesOf = new Map(
    sectors.map((x) => {
      const b = barrageOf.get(x.id);
      if (!b) return [x.id, 0] as const;
      const end = endedAt(b);
      return [x.id, b.phase !== 'done' ? dt : end !== null ? Math.min(dt, end - from) : 0] as const;
    }),
  );
  const firing = (x: Sector): number => minutesOf.get(x.id) ?? 0;
  /** Its barrage is still going at the step's end: only then does it cover trench (segments under it). */
  const standsNow = (x: Sector): boolean => barrageOf.get(x.id)?.phase !== 'done';
  const active = sectors.filter((x) => firing(x) > 0);
  const width = (x: Sector) => x.yMax - x.yMin;
  const allWidth = sum(s.sectors, width);
  // The share of the step's fire across the whole front: each active sector's width for the share of dt it fired.
  const activeShare = allWidth > 0 ? sum(active, (x) => width(x) * (firing(x) / dt)) / allWidth : 0;
  const effective = (x: Sector) => {
    const b = barrageOf.get(x.id)!;
    return endedAt(b) !== null ? { ...b, phase: 'pausing' as const } : b;
  };
  const band = (x: Sector, y: number) => bandAt(effective(x), x, ctx.lines, minute, y, v(fx.barrageBandDepthM));
  const visM = visibilityM(s, ctx.tables, minute);
  if (s.air === undefined && bats.some((b) => b.observation === 'aircraft')) ctx.defaultsUsed.add('air ← none (fire observed by aircraft is unobserved: observedFrac 0)');
  const observedFrac = s.air ? v(s.air.observedFrac) : 0;
  const obsOf = (o: Observation) => observationFactor(o, ctx, visM, observedFrac);
  const airCause = (spent: Spent[]): Cause[] => (spent.some((x) => x.guns > 0 && x.battery.observation === 'aircraft') ? ['air-observation'] : []);
  const push = (c: CompanyState, fires: Fire[], min: number, causes: Cause[], fire: FireGroup, suppressOnly = false, refs: number[] = []): void => {
    const r = fireOn(c, fires, min, ctx, segs, suppressOnly);
    if (r.hits <= 0 && r.rounds <= 0) return;
    pending.damage.push({ targetId: c.id, source: 'artillery', hits: r.hits, rounds: r.rounds, suppressPerRound: r.suppressPerRound, causes, refs, fire });
  };

  const offMap = offMapFires(ctx).map((e) => ({ e, overlap: Math.min(minute, e.toMin) - Math.max(from, e.fromMin) }));

  // Batteries whose silence has run out fire again; "batteries recovered" once a side has the share of its guns back.
  const thr = v(fx.batteriesRecoveredFrac);
  const shareOf = (side: Side) => {
    const all = gunsIn(bats, side);
    return all > 0 ? gunsIn(bats, side, (b) => b.suppressedUntilMin === null && !b.captured) / all : 1;
  };
  const before = SIDES.map(shareOf);
  for (const b of bats) if (b.suppressedUntilMin !== null && b.suppressedUntilMin <= minute) b.suppressedUntilMin = null;
  const recovered = SIDES.map(shareOf);
  // Emitted at once, so that the fire that follows can refer to it.
  let out = emit({ ...state, batteries: bats });
  const recoveredEvent = { ...(state.batteriesRecoveredEventId ?? {}) };
  SIDES.forEach((side, i) => {
    if (before[i]! < thr && recovered[i]! >= thr) {
      recoveredEvent[side] = out.nextEventId;
      out = emit(out, {
        minute,
        kind: 'batteries-recovered',
        text: `${pctText(recovered[i]!)} of the ${side === 'central' ? 'German' : 'Allied'} guns are back in action`,
        causes: ['batteries-recovered'],
        factors: { inActionFrac: round(recovered[i]!, 3), guns: gunsIn(bats, side, (b) => b.suppressedUntilMin === null && !b.captured) },
      });
    }
  });

  // 1. The creeping barrage. A sector's creeping artillery is its side's creeping batteries shared among the
  // sectors by width (the artillery entries name no sector), so guns on 100 m = guns × 100 / all sectors' width.
  const covered = new Set<string>();
  // Which of each segment's trench samples a barrage is on now, by segment id (looked up only), for local checks (trenches.ts).
  const onSamples = new Map<string, number[]>();
  const markSamples = (seg: SegmentState, idx: number[]): void => {
    if (idx.length === 0) return;
    covered.add(seg.id);
    const had = onSamples.get(seg.id) ?? [];
    onSamples.set(seg.id, [...had, ...idx.filter((i) => !had.includes(i))].sort((a, b) => a - b));
  };
  const samplesWhere = (seg: SegmentState, f: (p: Point) => boolean): number[] =>
    segmentSamples(ctx, seg, state.companies).flatMap((p, i) => (f(p) ? [i] : []));
  for (const side of SIDES) {
    const spent = spend(bats.filter((b) => b.side === side && b.role === 'creeping' && inAction(b)), ctx, dt, activeShare);
    if (!(sum(spent, (x) => x.guns) > 0) || allWidth <= 0) continue;
    const fires = firesOf(spent, allWidth, obsOf, ctx);
    const per100 = sum(spent, (x) => x.guns) * (100 / allWidth);
    for (const sec of active) {
      if (standsNow(sec)) for (const seg of state.segments) markSamples(seg, samplesWhere(seg, (p) => sectorAtY(sectors, p[1]) === sec && within(band(sec, p[1]), p[0])));
      const min = firing(sec);
      const fire: FireGroup = { key: `creeping:${side}:${sec.id}`, text: `Creeping barrage, ${sec.name}`, sectorId: sec.id, factors: { gunsPer100m: round(per100, 2), fired: round(roundsOver(fires, width(sec), min)) } };
      for (const c of field) {
        if (sectorAtY(sectors, c.y) !== sec || !within(band(sec, c.y), c.x)) continue;
        if (c.side === side) {
          const gapM = round(barrageXAt(barrageOf.get(sec.id)!, sec, ctx.lines, minute, c.y) - c.x);
          push(c, fires, min, ['artillery-fire', 'friendly-barrage', ...airCause(spent)], { key: `friendly:${c.id}`, text: `Own barrage falls on ${c.name}`, sectorId: sec.id, unitId: c.id, factors: { gapM } });
        } else if (c.posture !== 'in-dugout') push(c, fires, min, ['artillery-fire', ...airCause(spent)], fire);
        // Men down in their dugouts under the band take nothing from it, and cannot come up (the segment is covered).
      }
    }
  }

  // 2. Standing barrages on the enemy's segments ahead of the band, as far as the fire plan reaches.
  // A segment is a target while some of its trench lies ahead of an active band; it is fired on for the most minutes of
  // those sectors, and the barrage is on that stretch of it (the trench ahead of the band).
  const ahead = (p: Point): Sector | null => {
    const sec = sectorAtY(sectors, p[1]);
    if (!sec || !active.includes(sec)) return null;
    const b = band(sec, p[1]);
    return b !== null && p[0] > b[1] && p[0] <= planReachX(sec, ctx.lines, p[1]) ? sec : null;
  };
  for (const side of SIDES) {
    const targets = state.segments.filter((seg) => seg.holder !== side && !covered.has(seg.id) && seg.lengthM > 0 && segmentSamples(ctx, seg, state.companies).some((p) => ahead(p) !== null));
    const frontage = sum(targets, (x) => x.lengthM);
    const batteries = bats.filter((b) => b.side === side && (b.role === 'standing' || b.role === 'heavy') && inAction(b));
    if (targets.length === 0 || batteries.length === 0) continue;
    const minOf = new Map(targets.map((seg) => [seg.id, Math.max(...segmentSamples(ctx, seg, state.companies).map((p) => { const sec = ahead(p); return sec ? firing(sec) : 0; }))]));
    const share = sum(targets, (x) => x.lengthM * (minOf.get(x.id)! / dt)) / frontage;
    const spent = spend(batteries, ctx, dt, share);
    if (!(sum(spent, (x) => x.guns) > 0)) continue;
    const fires = firesOf(spent, frontage, obsOf, ctx);
    for (const seg of targets) markSamples(seg, samplesWhere(seg, (p) => { const sec = ahead(p); return sec !== null && standsNow(sec); }));
    const ids = new Set(targets.map((x) => x.id));
    const fire: FireGroup = { key: `standing:${side}`, text: 'Standing barrage', factors: { segments: targets.length, fired: round(roundsOver(fires, frontage, dt * share)) } };
    for (const c of field) if (c.side !== side && c.segmentId !== undefined && ids.has(c.segmentId)) push(c, fires, minOf.get(c.segmentId)!, ['artillery-fire', ...airCause(spent)], fire);
  }

  // 3. The machine-gun barrage: a zone mgBarrageDepthM deep beyond the creeping band, suppression only.
  for (const side of SIDES) {
    const spent = spend(bats.filter((b) => b.side === side && b.role === 'mg-barrage' && inAction(b)), ctx, dt, activeShare);
    if (!(sum(spent, (x) => x.guns) > 0) || allWidth <= 0) continue;
    const fires = firesOf(spent, allWidth, obsOf, ctx);
    const depth = v(fx.mgBarrageDepthM);
    for (const sec of active) {
      const min = firing(sec);
      const fire: FireGroup = { key: `mg-barrage:${side}:${sec.id}`, text: `Machine-gun barrage, ${sec.name}`, sectorId: sec.id, factors: { fired: round(roundsOver(fires, width(sec), min)) } };
      for (const c of field) {
        if (c.side === side || c.posture === 'in-dugout' || sectorAtY(sectors, c.y) !== sec) continue;
        const b = band(sec, c.y);
        if (b && c.x > b[1] && c.x <= b[1] + depth) push(c, fires, min, ['mg-fire'], fire, true);
      }
    }
  }

  // 4. Defensive fire on no man's land and on the side's lost segments, whenever enemies are there.
  for (const side of SIDES) {
    const batteries = bats.filter((b) => b.side === side && b.role === 'defensive' && inAction(b));
    if (batteries.length === 0) continue;
    const lost = state.segments.filter((x) => x.holder !== side && x.garrisonIds.some((id) => state.companies.find((c) => c.id === id)?.side === side));
    const near = v(fx.captureRadiusM);
    const targets = field.filter((c) => {
      if (c.side === side) return false;
      const nml = nmlAt(ctx, side, c.y);
      if (nml && c.x >= nml[0] && c.x <= nml[1]) return true;
      return lost.some((x) => c.y >= x.yMin - near && c.y <= x.yMax + near && distanceTo(segmentSamples(ctx, x, state.companies), at(c)) <= near);
    });
    const frontage = noMansLandWidth(ctx, side) + sum(lost, (x) => x.lengthM);
    if (targets.length === 0 || !(frontage > 0)) continue;
    const spent = spend(batteries, ctx, dt, 1);
    const guns = sum(spent, (x) => x.guns);
    if (!(guns > 0)) continue;
    const fires = firesOf(spent, frontage, obsOf, ctx);
    const back = recovered[SIDES.indexOf(side)]!;
    const lagging = targets.filter((c) => c.barrageLost && c.gapM !== null);
    const fire: FireGroup = {
      key: `defensive:${side}`,
      text: `${side === 'central' ? 'German' : 'Allied'} defensive barrage`,
      factors: {
        guns: round(guns, 1),
        inActionFrac: round(back, 3),
        fired: round(sum(spent, (x) => x.guns * v(ctx.tables.weapons[x.battery.weapon]!.rpm) * dt)),
        ...(lagging.length ? { gapM: round(Math.max(...lagging.map((c) => c.gapM!))) } : {}),
      },
    };
    const recoveredRef = back >= thr && recoveredEvent[side] !== undefined ? [recoveredEvent[side]!] : [];
    const causes: Cause[] = ['defensive-barrage', ...(back >= thr ? (['batteries-recovered'] as const) : []), ...airCause(spent)];
    for (const c of targets) {
      // A company that has lost its barrage: the fire refers to the event that said so.
      const lostRef = c.barrageLost && c.barrageLostEventId !== null ? [c.barrageLostEventId] : [];
      push(c, fires, dt, c.barrageLost ? [...causes, 'barrage-moved-on'] : causes, fire, false, [...recoveredRef, ...lostRef]);
    }
  }

  // 5. Off-map fire inside its window.
  for (const { e, overlap } of offMap) {
    if (overlap <= 0) continue;
    const fires: Fire[] = [{ weapon: e.weapon, per100: (e.guns * 100) / e.frontageM, obs: 1 }];
    const fire: FireGroup = {
      key: `off-map:${e.id}`,
      text: `Off-map fire (${e.id})`,
      factors: { guns: e.guns, fired: round(e.guns * v(e.weapon.rpm) * overlap) },
    };
    for (const c of field) if (c.side !== e.side && e.inside(at(c))) push(c, fires, overlap, ['off-map-fire'], fire);
  }

  // Batteries that fired their last round this step.
  bats.forEach((b, i) => {
    if (ammoBefore[i]! > 0 && b.ammoLeft <= 0)
      events.push({ minute, kind: 'ammunition-exhausted', text: `Battery ${b.id} (${b.guns} × ${b.weapon}) has fired its last round`, causes: ['ammunition-low'], factors: { guns: b.guns } });
  });

  // The segments a barrage is on now; those it was on last step and is not now, it has lifted off.
  out = emit({ ...out, batteries: bats, batteriesRecoveredEventId: recoveredEvent }, ...events);
  const segments: SegmentState[] = [];
  for (const seg of state.segments) {
    if (covered.has(seg.id)) segments.push({ ...seg, barrageLastOverMin: minute, barrageOn: onSamples.get(seg.id)! });
    else if (seg.barrageLastOverMin === from) {
      // It was under a barrage at the step's start; one that ended during the step was on it until its end.
      const ends = segmentSamples(ctx, seg, state.companies).flatMap((p) => {
        const sec = sectorAtY(sectors, p[1]);
        const b = sec && barrageOf.get(sec.id);
        const end = b ? endedAt(b) : null;
        return end === null ? [] : [end];
      });
      const lastOverMin = ends.length ? Math.max(from, ...ends) : from;
      const id = out.nextEventId;
      out = emit(out, { minute, kind: 'barrage-passed', segmentId: seg.id, text: `The barrage lifts off ${seg.id}`, causes: ['timetable'], factors: { lastOverMin } });
      segments.push({ ...seg, barrageLastOverMin: lastOverMin, barrageEventId: id, barrageOn: [] });
    } else segments.push(seg.barrageOn.length ? { ...seg, barrageOn: [] } : seg);
  }
  return { ...out, segments };
}

const within = (b: [number, number] | null, x: number): boolean => b !== null && x >= b[0] && x <= b[1];
const pctText = (x: number): string => `${Math.round(x * 100)}%`;

// ---- scheduled minutes ----------------------------------------------------------------------------------------

/** The minutes silenced batteries come back into action. A recovery moves nobody. */
export const batteryRecoveries = (state: SimState): Scheduled[] =>
  state.batteries.flatMap((b) => (b.suppressedUntilMin !== null && b.suppressedUntilMin > state.minute ? [{ minute: b.suppressedUntilMin, startsMovement: false }] : []));

/** The minutes off-map fire opens and stops. Fire moves nobody. */
export const offMapWindows = (_state: SimState, ctx: StepContext): Scheduled[] =>
  offMapFires(ctx).flatMap((e) => [{ minute: e.fromMin, startsMovement: false }, { minute: e.toMin, startsMovement: false }]);

/**
 * The minutes batteries that fire steadily are due to run out of rounds, so that a quiet step ends on the same grid
 * minute as fine steps would (`ammunition-exhausted` at the same minute). Creeping and machine-gun barrage batteries fire
 * their guns × rpm × the active sectors' share of the front each minute (exact while the barrages' phases hold, and
 * phase changes are scheduled); standing and heavy batteries at most guns × rpm (an early guess only shortens a quiet
 * step). Defensive fire comes only when enemies are in its zone, and is not forecast. Running out moves nobody.
 */
export function ammunitionRunsOut(state: SimState, ctx: StepContext): Scheduled[] {
  const s = ctx.scenario;
  const width = (x: Sector) => x.yMax - x.yMin;
  const allWidth = sum(s.sectors, width);
  const going = s.sectors.filter((x) => state.barrages.some((b) => b.sectorId === x.id && b.phase !== 'done'));
  const share = allWidth > 0 ? sum(going, width) / allWidth : 0;
  return state.batteries.flatMap((b) => {
    if (!inAction(b) || !Number.isFinite(b.ammoLeft)) return [];
    const rate = b.guns * v(ctx.tables.weapons[b.weapon]!.rpm) * (b.role === 'creeping' || b.role === 'mg-barrage' ? share : b.role === 'standing' || b.role === 'heavy' ? 1 : 0);
    return rate > 0 ? [{ minute: state.minute + b.ammoLeft / rate, startsMovement: false }] : [];
  });
}
