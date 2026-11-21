import { minutesBetween, ScenarioError, v } from '@wwi/scenario';
import type { Doctrine, Point, Scenario, Weapon } from '@wwi/scenario';
import { bandAt, barrageXAt, planReachX } from './barrage';
import { emit } from './causes';
import type { Cause, NewEvent } from './causes';
import { isHolding } from './companies';
import type { CompanyState } from './companies';
import { lineXAt } from './geometry';
import { distToSegment, groundAt, inPolygon } from './ground';
import { visibilityM } from './light';
import { round } from './record';
import type { Scheduled } from './schedule';
import { featurePieces, featurePoints, pointRadiusM } from './segments';
import { stochasticRound } from './stochastic';
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
 * 5. off-map fire inside its window (`off-map-fire`), which also keeps silenced batteries in its target silent.
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

const distanceTo = (pts: readonly Point[], p: Point): number => {
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

/** A company's cover from shells: the cover table for its posture and ground; men in dugouts by the dugouts' depth too. */
function shellCover(c: CompanyState, ctx: StepContext, segs: ReadonlyMap<string, SegmentState>): number {
  const cover = v(ctx.tables.cover[c.posture][groundAt(ctx.world, at(c))]);
  if (c.posture !== 'in-dugout') return cover;
  const d = c.segmentId === undefined ? 0 : (segs.get(c.segmentId)?.dugoutDepthM ?? 0);
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

/** Spent guns as fires on 100 m of `frontageM`, one per weapon and observation (in battery order). */
function firesOf(spent: Spent[], frontageM: number, obsOf: (o: Observation) => number, ctx: StepContext): Fire[] {
  const by = new Map<string, Fire>();
  for (const { battery: b, guns } of spent) {
    if (!(guns > 0)) continue;
    const key = `${b.weapon}|${b.observation}`;
    const f = by.get(key) ?? { weapon: ctx.tables.weapons[b.weapon]!, per100: 0, obs: obsOf(b.observation) };
    f.per100 += (guns * 100) / frontageM;
    by.set(key, f);
  }
  return [...by.values()];
}

const inAction = (b: BatteryState): boolean => b.suppressedUntilMin === null && b.ammoLeft > 0;
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
  const active = sectors.filter((x) => barrageOf.get(x.id) && barrageOf.get(x.id)!.phase !== 'done');
  const width = (x: Sector) => x.yMax - x.yMin;
  const allWidth = sum(s.sectors, width);
  const activeShare = allWidth > 0 ? sum(active, width) / allWidth : 0;
  const band = (x: Sector, y: number) => bandAt(barrageOf.get(x.id)!, x, ctx.lines, minute, y, v(fx.barrageBandDepthM));
  const visM = visibilityM(s, ctx.tables, minute);
  if (s.air === undefined && bats.some((b) => b.observation === 'aircraft')) ctx.defaultsUsed.add('air ← none (fire observed by aircraft is unobserved: observedFrac 0)');
  const observedFrac = s.air ? v(s.air.observedFrac) : 0;
  const obsOf = (o: Observation) => observationFactor(o, ctx, visM, observedFrac);
  const airCause = (spent: Spent[]): Cause[] => (spent.some((x) => x.guns > 0 && x.battery.observation === 'aircraft') ? ['air-observation'] : []);
  const push = (c: CompanyState, fires: Fire[], min: number, causes: Cause[], fire: FireGroup, suppressOnly = false): void => {
    const r = fireOn(c, fires, min, ctx, segs, suppressOnly);
    if (r.hits <= 0 && r.rounds <= 0) return;
    pending.damage.push({ targetId: c.id, source: 'artillery', hits: r.hits, rounds: r.rounds, suppressPerRound: r.suppressPerRound, causes, refs: [], fire });
  };

  // Off-map fire on battery positions keeps the silenced guns there silent while it lasts: their recovery waits.
  const offMap = offMapFires(ctx).map((e) => ({ e, overlap: Math.min(minute, e.toMin) - Math.max(from, e.fromMin) }));
  const held = new Map<string, number>();
  for (const { e, overlap } of offMap) {
    if (overlap <= 0) continue;
    for (const b of bats)
      if (b.side !== e.side && b.position && b.suppressedUntilMin !== null && b.suppressedUntilMin > from && e.inside(b.position)) {
        b.suppressedUntilMin += overlap;
        held.set(e.id, (held.get(e.id) ?? 0) + b.guns);
      }
  }

  // Batteries whose silence has run out fire again; "batteries recovered" once a side has the share of its guns back.
  const thr = v(fx.batteriesRecoveredFrac);
  const shareOf = (side: Side) => {
    const all = gunsIn(bats, side);
    return all > 0 ? gunsIn(bats, side, (b) => b.suppressedUntilMin === null) / all : 1;
  };
  const before = SIDES.map(shareOf);
  for (const b of bats) if (b.suppressedUntilMin !== null && b.suppressedUntilMin <= minute) b.suppressedUntilMin = null;
  const recovered = SIDES.map(shareOf);
  SIDES.forEach((side, i) => {
    if (before[i]! < thr && recovered[i]! >= thr)
      events.push({
        minute,
        kind: 'batteries-recovered',
        text: `${pctText(recovered[i]!)} of the ${side === 'central' ? 'German' : 'Allied'} guns are back in action`,
        causes: ['batteries-recovered'],
        factors: { inActionFrac: round(recovered[i]!, 3), guns: gunsIn(bats, side, (b) => b.suppressedUntilMin === null) },
      });
  });

  // 1. The creeping barrage. A sector's creeping artillery is its side's creeping batteries shared among the
  // sectors by width (the artillery entries name no sector), so guns on 100 m = guns × 100 / all sectors' width.
  const covered = new Set<string>();
  for (const side of SIDES) {
    const spent = spend(bats.filter((b) => b.side === side && b.role === 'creeping' && inAction(b)), ctx, dt, activeShare);
    if (!(sum(spent, (x) => x.guns) > 0) || allWidth <= 0) continue;
    const fires = firesOf(spent, allWidth, obsOf, ctx);
    const per100 = sum(spent, (x) => x.guns) * (100 / allWidth);
    for (const sec of active) {
      for (const seg of state.segments)
        if (segmentSamples(ctx, seg, state.companies).some((p) => sectorAtY(sectors, p[1]) === sec && within(band(sec, p[1]), p[0]))) covered.add(seg.id);
      const fire: FireGroup = { key: `creeping:${side}:${sec.id}`, text: `Creeping barrage, ${sec.name}`, sectorId: sec.id, factors: { gunsPer100m: round(per100, 2), fired: round(roundsOver(fires, width(sec), dt)) } };
      for (const c of field) {
        if (sectorAtY(sectors, c.y) !== sec || !within(band(sec, c.y), c.x)) continue;
        if (c.side === side) {
          const gapM = round(barrageXAt(barrageOf.get(sec.id)!, sec, ctx.lines, minute, c.y) - c.x);
          push(c, fires, dt, ['artillery-fire', 'friendly-barrage', ...airCause(spent)], { key: `friendly:${c.id}`, text: `Own barrage falls on ${c.name}`, sectorId: sec.id, unitId: c.id, factors: { gapM } });
        } else if (c.posture !== 'in-dugout') push(c, fires, dt, ['artillery-fire', ...airCause(spent)], fire);
        // Men down in their dugouts under the band take nothing from it, and cannot come up (the segment is covered).
      }
    }
  }

  // 2. Standing barrages on the enemy's segments ahead of the band, as far as the fire plan reaches.
  for (const side of SIDES) {
    const targets = state.segments.filter(
      (seg) =>
        seg.holder !== side &&
        !covered.has(seg.id) &&
        seg.lengthM > 0 &&
        segmentSamples(ctx, seg, state.companies).some((p) => {
          const sec = sectorAtY(sectors, p[1]);
          if (!sec || !active.includes(sec)) return false;
          const b = band(sec, p[1]);
          return b !== null && p[0] > b[1] && p[0] <= planReachX(sec, ctx.lines, p[1]);
        }),
    );
    const frontage = sum(targets, (x) => x.lengthM);
    const batteries = bats.filter((b) => b.side === side && (b.role === 'standing' || b.role === 'heavy') && inAction(b));
    if (targets.length === 0 || batteries.length === 0) continue;
    const spent = spend(batteries, ctx, dt, 1);
    if (!(sum(spent, (x) => x.guns) > 0)) continue;
    const fires = firesOf(spent, frontage, obsOf, ctx);
    for (const seg of targets) covered.add(seg.id);
    const ids = new Set(targets.map((x) => x.id));
    const fire: FireGroup = { key: `standing:${side}`, text: 'Standing barrage', factors: { segments: targets.length, fired: round(roundsOver(fires, frontage, dt)) } };
    for (const c of field) if (c.side !== side && c.segmentId !== undefined && ids.has(c.segmentId)) push(c, fires, dt, ['artillery-fire', ...airCause(spent)], fire);
  }

  // 3. The machine-gun barrage: a zone mgBarrageDepthM deep beyond the creeping band, suppression only.
  for (const side of SIDES) {
    const spent = spend(bats.filter((b) => b.side === side && b.role === 'mg-barrage' && inAction(b)), ctx, dt, activeShare);
    if (!(sum(spent, (x) => x.guns) > 0) || allWidth <= 0) continue;
    const fires = firesOf(spent, allWidth, obsOf, ctx);
    const depth = v(fx.mgBarrageDepthM);
    for (const sec of active) {
      const fire: FireGroup = { key: `mg-barrage:${side}:${sec.id}`, text: `Machine-gun barrage, ${sec.name}`, sectorId: sec.id, factors: { fired: round(roundsOver(fires, width(sec), dt)) } };
      for (const c of field) {
        if (c.side === side || c.posture === 'in-dugout' || sectorAtY(sectors, c.y) !== sec) continue;
        const b = band(sec, c.y);
        if (b && c.x > b[1] && c.x <= b[1] + depth) push(c, fires, dt, ['mg-fire'], fire, true);
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
      const nml = noMansLandAt(s.lines, side, c.y);
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
    const causes: Cause[] = ['defensive-barrage', ...(back >= thr ? (['batteries-recovered'] as const) : []), ...airCause(spent)];
    for (const c of targets) push(c, fires, dt, c.barrageLost ? [...causes, 'barrage-moved-on'] : causes, fire);
  }

  // 5. Off-map fire inside its window.
  for (const { e, overlap } of offMap) {
    if (overlap <= 0) continue;
    const fires: Fire[] = [{ weapon: e.weapon, per100: (e.guns * 100) / e.frontageM, obs: 1 }];
    const fire: FireGroup = {
      key: `off-map:${e.id}`,
      text: `Off-map fire (${e.id})`,
      factors: { guns: e.guns, fired: round(e.guns * v(e.weapon.rpm) * overlap), ...(held.has(e.id) ? { gunsHeldSilent: held.get(e.id)! } : {}) },
    };
    for (const c of field) if (c.side !== e.side && e.inside(at(c))) push(c, fires, overlap, ['off-map-fire'], fire);
  }

  // Batteries that fired their last round this step.
  bats.forEach((b, i) => {
    if (ammoBefore[i]! > 0 && b.ammoLeft <= 0)
      events.push({ minute, kind: 'ammunition-exhausted', text: `Battery ${b.id} (${b.guns} × ${b.weapon}) has fired its last round`, causes: ['ammunition-low'], factors: { guns: b.guns } });
  });

  // The segments a barrage is on now; those it was on last step and is not now, it has lifted off.
  let out = emit({ ...state, batteries: bats }, ...events);
  const segments: SegmentState[] = [];
  for (const seg of state.segments) {
    if (covered.has(seg.id)) segments.push({ ...seg, barrageLastOverMin: minute });
    else if (seg.barrageLastOverMin === from) {
      const id = out.nextEventId;
      out = emit(out, { minute, kind: 'barrage-passed', segmentId: seg.id, text: `The barrage lifts off ${seg.id}`, causes: ['timetable'], factors: { lastOverMin: from } });
      segments.push({ ...seg, barrageEventId: id });
    } else segments.push(seg);
  }
  return { ...out, segments };
}

const within = (b: [number, number] | null, x: number): boolean => b !== null && x >= b[0] && x <= b[1];
const pctText = (x: number): string => `${Math.round(x * 100)}%`;

// ---- the gap ------------------------------------------------------------------------------------------------

/**
 * Each attacking company's gap to its sector's barrage, `barrageX − x` (null once the barrage has ended, and for
 * holding companies). An advancing company has lost its barrage when it lags more than
 * `followDistanceM × (gapMultiplier − 1)` behind the place the barrage lets it be (`barrageX − followDistanceM`, or
 * its objective if nearer), that is, more than `gapMultiplier × followDistanceM` behind the barrage, and is not
 * closing up (its gap is no smaller than at its last step); it has it again once it is back within that. Entering the state emits `barrage-lost`.
 */
export function trackGaps(state: SimState, ctx: StepContext): SimState {
  const events: NewEvent[] = [];
  const mult = v(ctx.tables.effects.gapMultiplier);
  const companies = state.companies.map((c): CompanyState => {
    const b = isHolding(c) ? undefined : state.barrages.find((x) => x.sectorId === c.sectorId);
    const sec = b && ctx.scenario.sectors.find((x) => x.id === c.sectorId);
    if (!b || !sec || b.phase === 'done') return c.gapM === null && !c.barrageLost ? c : { ...c, gapM: null, barrageLost: false };
    const bx = barrageXAt(b, sec, ctx.lines, state.minute, c.y);
    const gapM = bx - c.x;
    let lost = false;
    if (c.status === 'advancing') {
      const d = ctx.doctrines[c.doctrineId]!;
      const follow = v(d.attack!.followDistanceM);
      const line = ctx.scenario.lines.find((l) => l.id === c.objectiveLineId);
      const target = Math.min(line ? lineXAt(line.points, c.y) : Infinity, bx - follow);
      const behind = target - c.x > follow * (mult - 1);
      // No gap taken yet (its first step): nothing shows it falling behind.
      const closing = c.gapM === null || gapM < c.gapM;
      lost = behind && (c.barrageLost || !closing);
      if (lost && !c.barrageLost)
        events.push({
          minute: state.minute,
          kind: 'barrage-lost',
          sectorId: c.sectorId,
          unitId: c.id,
          text: `${c.name} has lost its barrage: ${Math.round(gapM)} m behind it`,
          causes: ['barrage-moved-on'],
          factors: { gapM: round(gapM), followDistanceM: follow },
        });
    }
    return { ...c, gapM, barrageLost: lost };
  });
  return emit({ ...state, companies }, ...events);
}

// ---- dugouts: emergence and trapping ------------------------------------------------------------------------

type Garrison = { seg: SegmentState; companies: CompanyState[]; doctrine: Doctrine };

function garrisonOf(state: SimState, ctx: StepContext, seg: SegmentState): Garrison | null {
  const companies = state.companies.filter((c) => c.segmentId === seg.id && c.side === seg.holder && onField(c));
  if (companies.length === 0) return null;
  const doctrine = ctx.doctrines[companies[0]!.doctrineId]!;
  if (!doctrine.defence) throw new Error(`Doctrine "${doctrine.id}" has no defence block, but company ${companies[0]!.id} garrisons ${seg.id}`);
  return { seg, companies, doctrine };
}

/**
 * The minute a segment's garrison is up: `emergeMin` after the barrage was last on it (Zero, if none has been
 * since the bombardment), slower in proportion to its trench damage (blocked exits): × (1 + blockedExitFactor ×
 * trenchDamage).
 */
export function emergeAtMin(seg: SegmentState, doctrine: Doctrine, ctx: StepContext): number {
  const block = 1 + v(ctx.tables.effects.blockedExitFactor) * seg.trenchDamage;
  return (seg.barrageLastOverMin ?? 0) + v(doctrine.defence!.emergeMin) * block;
}

/**
 * Garrisons coming up, or caught below (the model, "The gap"), segment by segment in order, after movement:
 * - attackers within the garrison's `closeRangeM` of the segment before it is up trap it: `trappedSurrenderFrac`
 *   of each garrison company's men (rounded without bias, in ascending id order) surrender, the rest stay below
 *   as the segment's dugout points (`defenders-trapped`, cause `followed-barrage`);
 * - otherwise, with no barrage on it now and its emergence minute (`emergeAtMin`) reached, it is up: its
 *   companies man the trench (`garrison-emerged`, refs to its last barrage event). The cause is the gap
 *   (`gap-behind-barrage`), and `barrage-moved-on` with `factors.gapM` when the nearest attacker is more than
 *   `gapMultiplier × followDistanceM` behind its barrage.
 */
export function emergence(state: SimState, ctx: StepContext): SimState {
  let out = state;
  const mult = v(ctx.tables.effects.gapMultiplier);
  for (const seg0 of state.segments) {
    const seg = out.segments.find((x) => x.id === seg0.id)!;
    if (seg.emerged || seg.trapped) continue;
    const g = garrisonOf(out, ctx, seg);
    if (!g) continue;
    const pts = segmentSamples(ctx, seg, out.companies);
    const attackers = out.companies
      .filter((c) => c.side !== seg.holder && onField(c) && !isHolding(c) && c.status !== 'waiting')
      .map((c) => ({ c, d: distanceTo(pts, at(c)) }))
      .sort((a, b) => a.d - b.d || (a.c.id < b.c.id ? -1 : 1));
    const nearest = attackers[0];
    const refs = seg.barrageEventId === null ? [] : [seg.barrageEventId];
    const names = g.companies.map((c) => c.name).join(', ');
    if (nearest && nearest.d <= v(g.doctrine.common.closeRangeM)) {
      const frac = v(g.doctrine.defence!.trappedSurrenderFrac);
      let captured = 0;
      let below = 0;
      const points: SegmentState['dugoutPoints'] = [];
      const trapped = new Map<string, CompanyState>();
      for (const c of g.companies) {
        const n = Math.min(c.men, stochasticRound(c.men * frac, ctx.rng));
        captured += n;
        below += c.men - n;
        if (c.men - n > 0) points.push({ companyId: c.id, point: at(c), men: c.men - n });
        trapped.set(c.id, { ...c, men: c.men - n, captured: c.captured + n });
      }
      out = emit(
        {
          ...out,
          companies: out.companies.map((c) => trapped.get(c.id) ?? c),
          segments: out.segments.map((x) => (x.id === seg.id ? { ...x, trapped: true, dugoutPoints: [...x.dugoutPoints, ...points] } : x)),
        },
        {
          minute: out.minute,
          kind: 'defenders-trapped',
          segmentId: seg.id,
          unitId: nearest.c.id,
          ...(nearest.c.sectorId ? { sectorId: nearest.c.sectorId } : {}),
          text: `${nearest.c.name} reaches ${seg.id} before its garrison (${names}) is up: ${captured} surrender, ${below} are left in the dugouts`,
          causes: ['followed-barrage'],
          refs,
          factors: { captured, inDugouts: below, ...(nearest.c.gapM !== null ? { gapM: round(nearest.c.gapM) } : {}) },
        },
      );
      continue;
    }
    if (seg.barrageLastOverMin === out.minute || out.minute < emergeAtMin(seg, g.doctrine, ctx)) continue;
    const ids = new Set(g.companies.map((c) => c.id));
    const follow = nearest && ctx.doctrines[nearest.c.doctrineId]!.attack ? v(ctx.doctrines[nearest.c.doctrineId]!.attack!.followDistanceM) : 0;
    const movedOn = nearest !== undefined && nearest.c.gapM !== null && nearest.c.gapM > follow * mult;
    const causes: Cause[] = [...(seg.barrageLastOverMin !== null ? (['gap-behind-barrage'] as const) : []), ...(movedOn ? (['barrage-moved-on'] as const) : [])];
    out = emit(
      {
        ...out,
        companies: out.companies.map((c) => (ids.has(c.id) ? { ...c, posture: 'in-trench' as const } : c)),
        segments: out.segments.map((x) => (x.id === seg.id ? { ...x, emerged: true } : x)),
      },
      {
        minute: out.minute,
        kind: 'garrison-emerged',
        segmentId: seg.id,
        text: `The garrison of ${seg.id} (${names}) is up and manning the trench${nearest ? `; nearest attacker ${nearest.c.name}, ${Math.round(nearest.d)} m off` : ''}`,
        causes,
        refs,
        factors: {
          ...(nearest ? { attackerM: round(nearest.d) } : {}),
          ...(movedOn ? { gapM: round(nearest.c.gapM!) } : {}),
          trenchDamage: round(seg.trenchDamage, 3),
        },
      },
    );
  }
  return out;
}

// ---- scheduled minutes ----------------------------------------------------------------------------------------

/** The minutes silenced batteries come back into action. A recovery moves nobody. */
export const batteryRecoveries = (state: SimState): Scheduled[] =>
  state.batteries.flatMap((b) => (b.suppressedUntilMin !== null && b.suppressedUntilMin > state.minute ? [{ minute: b.suppressedUntilMin, startsMovement: false }] : []));

/** The minutes garrisons are due up (none while a barrage is on them). An emergence moves nobody. */
export function garrisonEmergences(state: SimState, ctx: StepContext): Scheduled[] {
  return state.segments.flatMap((seg) => {
    if (seg.emerged || seg.trapped || seg.barrageLastOverMin === state.minute) return [];
    const g = garrisonOf(state, ctx, seg);
    return g ? [{ minute: emergeAtMin(seg, g.doctrine, ctx), startsMovement: false }] : [];
  });
}

/** The minutes off-map fire opens and stops. Fire moves nobody. */
export const offMapWindows = (_state: SimState, ctx: StepContext): Scheduled[] =>
  offMapFires(ctx).flatMap((e) => [{ minute: e.fromMin, startsMovement: false }, { minute: e.toMin, startsMovement: false }]);
