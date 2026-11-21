import { v } from '@wwi/scenario';
import type { Feature, Point, Scenario } from '@wwi/scenario';
import { segmentSamples } from './artillery';
import { barrageXAt } from './barrage';
import { emit } from './causes';
import type { Cause, NewEvent } from './causes';
import { isHolding, leadFactor } from './companies';
import type { CompanyState } from './companies';
import { lineXAt } from './geometry';
import { speedFactor, wetness } from './ground';
import { featurePoints } from './segments';
import { onField } from './step';
import type { SimState, StepContext } from './step';
import { canMopUp } from './trenches';
import type { Intent, Order, OrderTarget, Pending } from './types';

/*
 * The behaviour and movement phases (the model, "Step pipeline", 3 and 8): what each company tries to do this step,
 * and how far it gets.
 *
 * Speed = the company's own speed × speedFactor (ground: rain mud, shell churn, the climb) × the NCO penalty
 * (leadFactor) × (1 − suppressionSpeedLoss × suppression) × (1 − fatigue), and inside a belt of wire in front of a
 * trench segment also × 1 − (1 − wireSpeedFactor) · (1 − wireCut). Fatigue rises by `fatiguePerKm` for each km moved
 * and `fatiguePerHourUnderFire` while fire comes in, and falls by `fatigueRecoveryPerHour` at rest; it slows fire too
 * (fire.ts).
 *
 * Every number is data: the doctrine's speeds, follow distance and fatigue rates, and the effects keys
 * suppressionSpeedLoss, fatiguePerHourUnderFire, wireSpeedFactor and captureRadiusM (with ground.ts's).
 */

const at = (c: Pick<CompanyState, 'x' | 'y'>): Point => [c.x, c.y];

// ---- behaviour ----------------------------------------------------------------------------------------------

type Targeted = Order & { target: OrderTarget };

/** The counter-attack order a company holds, if its latest order is one with a target. */
export const counterAttackOrder = (c: Pick<CompanyState, 'orders'>): Targeted | null => {
  const o = c.orders.at(-1);
  return o?.kind === 'counter-attack' && o.target !== undefined ? (o as Targeted) : null;
};

/** The attack order on a place (a feature or a segment, not a line) a company holds, if its latest order is one (Task 12). */
export const placeAttackOrder = (c: Pick<CompanyState, 'orders'>): Targeted | null => {
  const o = c.orders.at(-1);
  return o?.kind === 'attack' && o.target !== undefined && !('lineId' in o.target) ? (o as Targeted) : null;
};

/** The march order a reserve's company holds on the map (Task 13: from its entry point to its front), if its latest order is one. */
export const marchOrder = (c: Pick<CompanyState, 'orders'>): Targeted | null => {
  const o = c.orders.at(-1);
  return o?.kind === 'march' && o.target !== undefined ? (o as Targeted) : null;
};

/** The latest order of a company, if it is an attack or counter-attack with a target whose minute to go has come (Task 12). */
function dueOrder(c: CompanyState, minute: number): Targeted | null {
  const o = c.orders.at(-1);
  if (!o || (o.kind !== 'attack' && o.kind !== 'counter-attack') || o.target === undefined) return null;
  return (o.goAtMin ?? -Infinity) <= minute ? (o as Targeted) : null;
}

/**
 * A holding company on the field and up acting on its order (Task 12): a counter-attack sets it counter-attacking; an
 * attack on a line makes the line its objective (in the order's sector) and sets it advancing from now, the order done;
 * an attack on a place sets it advancing on that place (it has no objective line while it does).
 */
function takeUp(c: CompanyState, o: Targeted, minute: number): CompanyState {
  if (o.kind === 'counter-attack') return { ...c, status: 'counter-attacking' };
  if ('lineId' in o.target)
    return { ...c, status: 'advancing', objectiveLineId: o.target.lineId, sectorId: o.target.sectorId, startMin: minute, orders: c.orders.filter((x) => x !== o) };
  return { ...c, status: 'advancing', objectiveLineId: undefined, startMin: minute };
}

/**
 * The intent of a company this step:
 * - pinned: go to ground; falling back: fall back; counter-attacking: counter-attack; marching (off the map), or
 *   advancing on a march order (an arrived reserve on its way to its front, Task 13): march;
 * - holding, surrendered, destroyed or off the map: hold;
 * - consolidating at its objective: mop up if it can (dugouts near it in a segment its side holds, and bombs), else hold;
 * - waiting or advancing: advance (toward its objective line; a company with none holds), except that a `mopup`
 *   company with dugouts near it to clear stops to mop up.
 */
function intentOf(c: CompanyState, state: SimState, ctx: StepContext): Intent {
  switch (c.status) {
    case 'pinned':
      return 'go-to-ground';
    case 'falling-back':
      return 'fall-back';
    case 'counter-attacking':
      return 'counter-attack';
    case 'marching':
      return 'march';
    case 'holding':
    case 'surrendered':
    case 'destroyed':
    case 'off-map':
      return 'hold';
    case 'consolidating':
      return canMopUp(state, ctx, c) ? 'mop-up' : 'hold';
    case 'waiting':
    case 'advancing':
      if (c.objectiveLineId === undefined) return placeAttackOrder(c) ? 'advance' : marchOrder(c) ? 'march' : 'hold';
      return c.role === 'mopup' && c.status === 'advancing' && canMopUp(state, ctx, c) ? 'mop-up' : 'advance';
  }
}

/**
 * The behaviour phase: each company picks its intent (`intentOf`). A holding company changes status only by
 * surrendering (the morale phase) or by being ordered forward (Task 12): one up on the field whose latest order is an
 * attack or a counter-attack with a target, once the order's minute to go has come, takes it up (`takeUp`).
 */
export function behaviour(state: SimState, ctx: StepContext): SimState {
  const companies = state.companies.map((cIn) => {
    // A counter-attack that got there last step is done: its order, kept for the fight for the trench, lapses now.
    const done = cIn.status === 'holding' && cIn.intent === 'counter-attack' ? counterAttackOrder(cIn) : null;
    const c0 = done ? { ...cIn, orders: cIn.orders.filter((x) => x !== done) } : cIn;
    const o = isHolding(c0) && onField(c0) && c0.posture !== 'in-dugout' ? dueOrder(c0, state.minute) : null;
    const c = o ? takeUp(c0, o, state.minute) : c0;
    const intent = intentOf(c, state, ctx);
    return c === cIn && c.intent === intent ? c : { ...c, intent };
  });
  return { ...state, companies };
}

/**
 * A company that cannot carry out its order (its target names no place it can find): it drops the order and holds, and
 * an `order-dropped` event says so (refs: the decision), so the order neither retries every step nor holds the run open.
 */
function dropOrder(c: CompanyState, order: Targeted | null, minute: number, events: NewEvent[]): CompanyState {
  const o = order ?? c.orders.at(-1);
  if (o)
    events.push({
      minute,
      kind: 'order-dropped',
      unitId: c.id,
      ...(c.sectorId ? { sectorId: c.sectorId } : {}),
      text: `${c.name} cannot find where its ${o.kind} order sends it, and holds`,
      ...(o.eventId !== undefined ? { refs: [o.eventId] } : {}),
    });
  return { ...c, status: 'holding', intent: 'hold', orders: o ? c.orders.filter((x) => x !== o) : c.orders };
}

// ---- where an advancing company may go ------------------------------------------------------------------------

/**
 * How far an advancing company may go this step (the target rule): `min(objX, barrageX − followDistanceM, legLineX)`,
 * where `legLineX` is the x of the line its sector's barrage is protecting now (the line of the leg it is lifting to
 * or standing beyond) when that is not the company's own objective line. So no company passes a line the barrage is
 * still standing beyond. With no barrage in its sector, only the objective; once the barrage is done, no leg line.
 */
export function targetX(c: CompanyState, state: SimState, ctx: StepContext): number {
  const line = ctx.lines.get(c.objectiveLineId ?? '');
  if (!line) throw new Error(`Company ${c.id}: unknown objective line "${c.objectiveLineId}"`);
  const objX = lineXAt(line, c.y);
  const b = state.barrages.find((x) => x.sectorId === c.sectorId);
  const sector = ctx.scenario.sectors.find((x) => x.id === c.sectorId);
  const attack = ctx.doctrines[c.doctrineId]!.attack;
  if (!b || !sector || !attack) return objX;
  let t = Math.min(objX, barrageXAt(b, sector, ctx.lines, state.minute, c.y) - v(attack.followDistanceM));
  if (b.phase !== 'done') {
    const legLine = sector.legs[b.legIndex]!.toLineId;
    if (legLine !== c.objectiveLineId) t = Math.min(t, lineXAt(ctx.lines.get(legLine)!, c.y));
  }
  return t;
}

// ---- wire ---------------------------------------------------------------------------------------------------

type Belt = { x0: number; x1: number; factor: number };

const featureCache = new WeakMap<Scenario, Map<string, Feature>>();
function featureOf(ctx: StepContext, id: string): Feature | undefined {
  let m = featureCache.get(ctx.scenario);
  if (!m) featureCache.set(ctx.scenario, (m = new Map(ctx.scenario.features.map((f) => [f.id, f]))));
  return m.get(id);
}

/** The x of a trench feature at y: the nearest crossing to the attackers (lowest x); a point feature's own x; null if it does not reach y. */
function trenchXAt(f: Feature, y: number): number | null {
  if (f.geometry.type === 'Point') return f.geometry.coordinates[0];
  if (f.geometry.type !== 'LineString') return null;
  const pts = featurePoints(f);
  let best: number | null = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const ax = pts[i]![0];
    const ay = pts[i]![1];
    const bx = pts[i + 1]![0];
    const by = pts[i + 1]![1];
    if (y < Math.min(ay, by) || y > Math.max(ay, by)) continue;
    const x = ay === by ? Math.min(ax, bx) : ax + ((y - ay) / (by - ay)) * (bx - ax);
    best = best === null ? x : Math.min(best, x);
  }
  return best;
}

/**
 * The wire belts across a company's way at y: in front of each segment with wire whose y range holds y, from its
 * trench back `wireBeltDepthM` toward the attackers, slowing to `1 − (1 − wireSpeedFactor) · (1 − wireCut)`.
 */
function beltsAt(state: SimState, ctx: StepContext, y: number): Belt[] {
  const wsf = v(ctx.tables.effects.wireSpeedFactor);
  const out: Belt[] = [];
  for (const seg of state.segments) {
    if (!(seg.wireBeltDepthM > 0) || y < seg.yMin || y > seg.yMax) continue;
    const f = featureOf(ctx, seg.featureId);
    const x = f ? trenchXAt(f, y) : null;
    if (x === null) continue;
    out.push({ x0: x - seg.wireBeltDepthM, x1: x, factor: 1 - (1 - wsf) * (1 - seg.wireCut) });
  }
  return out;
}

/**
 * Where a company moving toward larger x from x0 at `speed` m/min gets in `dt` minutes, stopping at `target`, slowed
 * inside each belt by its factor (the slowest where belts overlap). Exact, whatever the step: the time spent in each
 * belt is its depth over the slowed speed.
 */
export function advanceThrough(x0: number, target: number, speed: number, dt: number, belts: readonly Belt[]): number {
  if (!(speed > 0) || !(target > x0) || !(dt > 0)) return x0;
  let x = x0;
  let t = dt;
  while (t > 0 && x < target) {
    let f = 1;
    let next = target;
    for (const b of belts) {
      if (x >= b.x0 && x < b.x1) {
        f = Math.min(f, b.factor);
        next = Math.min(next, b.x1);
      } else if (b.x0 > x) next = Math.min(next, b.x0);
    }
    const s = speed * f;
    if (!(s > 0)) break;
    const need = (next - x) / s;
    if (need >= t) {
      x += s * t;
      t = 0;
    } else {
      x = next;
      t -= need;
    }
  }
  return Math.min(x, target);
}

// ---- movement -----------------------------------------------------------------------------------------------

/** A company's speed before the ground: its own × the NCO penalty × the suppression and fatigue terms. */
function ownSpeed(c: CompanyState, ctx: StepContext): number {
  const loss = v(ctx.tables.effects.suppressionSpeedLoss);
  return c.speedMPerMin * leadFactor(c, ctx.doctrines[c.doctrineId]!) * Math.max(0, 1 - loss * c.suppression) * Math.max(0, 1 - c.fatigue);
}

/** Move `c` straight toward `to` at `speed` (after the ground at its place and the climb) for dt minutes; the distance moved. */
function toward(c: CompanyState, to: Point, speed: number, dt: number, wet: number, ctx: StepContext): { p: Point; moved: number; arrived: boolean } {
  const d = Math.hypot(to[0] - c.x, to[1] - c.y);
  if (d === 0) return { p: at(c), moved: 0, arrived: true };
  const ux = (to[0] - c.x) / d;
  const uy = (to[1] - c.y) / d;
  const ahead = Math.min(d, speed * dt);
  const s = speed * speedFactor(ctx.world, at(c), wet, [c.x + ux * ahead, c.y + uy * ahead]);
  const step = Math.min(d, s * dt);
  return { p: step >= d ? to : [c.x + ux * step, c.y + uy * step], moved: step, arrived: step >= d };
}

/** The place an order's target names, nearest to the company. */
function targetPoint(c: CompanyState, target: OrderTarget, state: SimState, ctx: StepContext): Point | null {
  if ('point' in target) return target.point;
  if ('segmentId' in target) {
    const seg = state.segments.find((s) => s.id === target.segmentId);
    if (!seg) return null;
    const pts = segmentSamples(ctx, seg, state.companies);
    let best: Point | null = null;
    for (const p of pts) if (!best || Math.hypot(p[0] - c.x, p[1] - c.y) < Math.hypot(best[0] - c.x, best[1] - c.y)) best = p;
    return best;
  }
  if ('featureId' in target) {
    const f = featureOf(ctx, target.featureId);
    if (!f) return null;
    const pts = featurePoints(f);
    let best: Point | null = null;
    for (const p of pts) if (!best || Math.hypot(p[0] - c.x, p[1] - c.y) < Math.hypot(best[0] - c.x, best[1] - c.y)) best = p;
    return best;
  }
  const line = ctx.lines.get(target.lineId);
  return line ? [lineXAt(line, c.y), c.y] : null;
}

/**
 * The movement phase's moves, company by company in ascending id order (the state's order):
 * - advance: a company that has started moves toward `targetX` along x at its speed, through any wire; at its
 *   objective (within 1 m) it consolidates (`company-reached`, cause `followed-barrage`, or `barrage-moved-on` if it had
 *   lost its barrage); otherwise it is advancing, in the open (posture moving, wire or not);
 * - fall back: toward its start point, uncapped by the barrage and without wire; back there it is in its trench;
 * - counter-attack: toward its order's target; within `captureRadiusM` of it, it holds there, in the trench;
 * - march (an arrived reserve on the map, Task 13): toward its order's segment at marchKmPerHour; within
 *   `captureRadiusM` of it, it holds there, in the trench;
 * - go to ground (pinned), mop up, hold and march off the map: no move.
 * Then fatigue (on the field, not in dugouts): + fatiguePerKm per km moved, + fatiguePerHourUnderFire × dt/60 when fire
 * came in this step; at rest with no fire, − fatigueRecoveryPerHour × dt/60; held to 0–1.
 */
export function moveCompanies(state: SimState, ctx: StepContext, dt: number, pending: Pending): SimState {
  const fx = ctx.tables.effects;
  const wet = wetness(ctx.world, state.minute);
  const underFire = v(fx.fatiguePerHourUnderFire);
  const captureR = v(fx.captureRadiusM);
  const events: NewEvent[] = [];

  const companies = state.companies.map((c): CompanyState => {
    if (!onField(c) || c.posture === 'in-dugout') return c;
    let next: CompanyState = c;
    let moved = 0;
    if (c.intent === 'advance' && c.status !== 'consolidating' && state.minute >= c.startMin && c.objectiveLineId !== undefined) {
      const objX = lineXAt(ctx.lines.get(c.objectiveLineId)!, c.y);
      const target = targetX(c, state, ctx);
      const own = ownSpeed(c, ctx);
      const speed = own * speedFactor(ctx.world, at(c), wet, [Math.min(Math.max(target, c.x), c.x + own * dt), c.y]);
      const x = Math.max(c.x, advanceThrough(c.x, target, speed, dt, beltsAt(state, ctx, c.y)));
      moved = x - c.x;
      if (objX - x <= 1) {
        const line = ctx.scenario.lines.find((l) => l.id === c.objectiveLineId)!;
        const causes: Cause[] = [c.barrageLost ? 'barrage-moved-on' : 'followed-barrage'];
        const eventId = state.nextEventId + events.length;
        events.push({
          minute: state.minute,
          kind: 'company-reached',
          sectorId: c.sectorId,
          lineId: line.id,
          unitId: c.id,
          text: `${c.name} reaches ${line.name}`,
          causes,
          ...(c.barrageLost && c.barrageLostEventId !== null ? { refs: [c.barrageLostEventId] } : {}),
        });
        next = { ...c, x, status: 'consolidating', posture: 'in-trench', reached: { eventId, causes } };
      } else next = { ...c, x, status: 'advancing', posture: 'moving' };
    } else if (c.intent === 'advance' && c.status !== 'consolidating' && state.minute >= c.startMin && c.objectiveLineId === undefined) {
      // An attack on a place (Task 12): straight at it; within captureRadiusM of it, it consolidates there.
      const order = placeAttackOrder(c);
      const to = order && targetPoint(c, order.target, state, ctx);
      if (!order || !to) next = dropOrder(c, order, state.minute, events);
      else {
        const r = toward(c, to, ownSpeed(c, ctx), dt, wet, ctx);
        moved = r.moved;
        if (Math.hypot(to[0] - r.p[0], to[1] - r.p[1]) <= captureR) {
          const causes: Cause[] = [c.barrageLost ? 'barrage-moved-on' : 'followed-barrage'];
          const eventId = state.nextEventId + events.length;
          const name = 'featureId' in order.target ? order.target.featureId : 'segmentId' in order.target ? order.target.segmentId : '';
          events.push({ minute: state.minute, kind: 'company-reached', ...(c.sectorId ? { sectorId: c.sectorId } : {}), unitId: c.id, text: `${c.name} reaches ${name}`, causes });
          next = { ...c, x: r.p[0], y: r.p[1], status: 'consolidating', posture: 'in-trench', reached: { eventId, causes }, orders: c.orders.filter((o) => o !== order) };
        } else next = { ...c, x: r.p[0], y: r.p[1], status: 'advancing', posture: 'moving' };
      }
    } else if (c.intent === 'march' && c.status === 'advancing') {
      // An arrived reserve walking on to its front (Task 13): at its doctrine's marchKmPerHour, slowed by the ground; at
      // the segment (within captureRadiusM) it holds there, in the trench, its order done.
      const order = marchOrder(c);
      const to = order && targetPoint(c, order.target, state, ctx);
      if (!order || !to) next = dropOrder(c, order, state.minute, events);
      else {
        const r = toward(c, to, (v(ctx.doctrines[c.doctrineId]!.common.marchKmPerHour) * 1000) / 60, dt, wet, ctx);
        moved = r.moved;
        next =
          Math.hypot(to[0] - r.p[0], to[1] - r.p[1]) <= captureR
            ? { ...c, x: r.p[0], y: r.p[1], status: 'holding', intent: 'hold', posture: 'in-trench', orders: c.orders.filter((o) => o !== order) }
            : { ...c, x: r.p[0], y: r.p[1], posture: 'moving' };
      }
    } else if (c.intent === 'fall-back') {
      const r = toward(c, [c.startX, c.startY], ownSpeed(c, ctx), dt, wet, ctx);
      moved = r.moved;
      next = moved === 0 && c.posture === (r.arrived ? 'in-trench' : 'moving') ? c : { ...c, x: r.p[0], y: r.p[1], posture: r.arrived ? 'in-trench' : 'moving' };
    } else if (c.intent === 'counter-attack') {
      const order = counterAttackOrder(c);
      const to = order && targetPoint(c, order.target, state, ctx);
      if (!order || !to) next = dropOrder(c, order, state.minute, events);
      else {
        const r = toward(c, to, ownSpeed(c, ctx), dt, wet, ctx);
        moved = r.moved;
        const there = Math.hypot(to[0] - r.p[0], to[1] - r.p[1]) <= captureR;
        // There it holds; its intent stays `counter-attack` and it keeps its order until the next behaviour phase, so the
        // fight for the trench this step knows it came on an order and can cite it (trenches.ts: an ordered counter-attack
        // may retake a segment in the rear, cause `counter-attack`).
        next = there
          ? { ...c, x: r.p[0], y: r.p[1], status: 'holding', intent: 'counter-attack', posture: 'in-trench' }
          : { ...c, x: r.p[0], y: r.p[1], posture: 'moving' };
      }
    }

    // Fatigue.
    const k = ctx.doctrines[c.doctrineId]!.common;
    const fired = pending.applied?.has(c.id) ?? false;
    let f = c.fatigue + (v(k.fatiguePerKm) * moved) / 1000 + (fired ? (underFire * dt) / 60 : 0);
    if (moved === 0 && !fired) f -= (v(k.fatigueRecoveryPerHour) * dt) / 60;
    f = Math.min(1, Math.max(0, f));
    return f === next.fatigue ? next : { ...next, fatigue: f };
  });
  return emit({ ...state, companies }, ...events);
}
