import { v } from '@wwi/scenario';
import type { Doctrine } from '@wwi/scenario';
import { distanceTo, segmentSamples } from './artillery';
import { barrageXAt } from './barrage';
import { emit } from './causes';
import type { Cause } from './causes';
import { isHolding } from './companies';
import type { CompanyState } from './companies';
import { targetX } from './movement';
import { barrageNear, segmentById } from './trenches';
import { round } from './record';
import type { Scheduled } from './schedule';
import { stochasticRound } from './stochastic';
import { onField } from './step';
import type { SimState, StepContext } from './step';
import type { SegmentState } from './types';

/*
 * The gap between the infantry and its barrage, and the dugouts (the model, "The gap"): each attacker's gap,
 * whether it has lost its barrage, and garrisons coming up out of their dugouts or caught in them. All of it runs
 * in the movement phase, after the companies have moved.
 */

// ---- the gap ------------------------------------------------------------------------------------------------

/**
 * The barrage's mean rate of advance in metres a minute: its current leg's lift over lift time while it lifts,
 * 0 while it stands. The barrage moves in jumps (91 m every 3 minutes at Vimy); this is the pace a company must keep.
 */
function barrageRate(b: SimState['barrages'][number], sector: StepContext['scenario']['sectors'][number]): number {
  if (b.phase !== 'lifting') return 0;
  const leg = sector.legs[b.legIndex]!;
  return v(leg.liftM) / v(leg.liftMin);
}

/**
 * Each attacking company's gap to its sector's barrage, `barrageX − x` (null once the barrage has ended, and for
 * holding companies), and whether it has lost the barrage:
 * - it is behind when it lags more than `followDistanceM × (gapMultiplier − 1)` behind the place the barrage lets
 *   it be (`targetX`: `barrageX − followDistanceM`, or its objective or the line the barrage protects if nearer);
 * - it is losing ground when it advanced less this step than the barrage's mean rate × dt. The mean rate, not the
 *   barrage's last jump, so that a company keeping pace on average is not flagged on the steps a lift falls in (its
 *   own movement is smooth while it is behind: nothing caps it);
 * - an advancing company that is behind and losing ground has lost its barrage (`barrage-lost`, cause
 *   `barrage-moved-on`, `factors.gapM`); it has it again once it is no longer behind.
 * `before` is the companies as they stood before this step's movement, in the same (ascending id) order.
 */
export function trackGaps(state: SimState, ctx: StepContext, dt: number, before: readonly CompanyState[]): SimState {
  let out = state;
  const mult = v(ctx.tables.effects.gapMultiplier);
  const companies: CompanyState[] = [];
  state.companies.forEach((c, i) => {
    const b = isHolding(c) ? undefined : state.barrages.find((x) => x.sectorId === c.sectorId);
    const sec = b && ctx.scenario.sectors.find((x) => x.id === c.sectorId);
    if (!b || !sec || b.phase === 'done') {
      companies.push(c.gapM === null && !c.barrageLost ? c : { ...c, gapM: null, barrageLost: false });
      return;
    }
    const bx = barrageXAt(b, sec, ctx.lines, state.minute, c.y);
    const gapM = bx - c.x;
    let lost = false;
    let lostEvent = c.barrageLostEventId;
    if (c.status === 'advancing') {
      const follow = v(ctx.doctrines[c.doctrineId]!.attack!.followDistanceM);
      // Where the barrage lets it be: the movement phase's target rule (its objective, the barrage, the line the barrage protects).
      const target = c.objectiveLineId === undefined ? bx - follow : targetX(c, state, ctx);
      const behind = target - c.x > follow * (mult - 1);
      const prev = before[i];
      if (prev?.id !== c.id) throw new Error(`trackGaps: companies out of order at ${c.id}`);
      const losing = c.x - prev.x < barrageRate(b, sec) * dt;
      lost = behind && (c.barrageLost || losing);
      if (lost && !c.barrageLost) {
        lostEvent = out.nextEventId;
        out = emit(out, {
          minute: state.minute,
          kind: 'barrage-lost',
          sectorId: c.sectorId,
          unitId: c.id,
          text: `${c.name} has lost its barrage: ${Math.round(gapM)} m behind it`,
          causes: ['barrage-moved-on'],
          factors: { gapM: round(gapM), followDistanceM: follow, advancedM: round(c.x - prev.x), barrageMPerMin: round(barrageRate(b, sec), 1) },
        });
      }
    }
    companies.push({ ...c, gapM, barrageLost: lost, barrageLostEventId: lost ? lostEvent : null });
  });
  return { ...out, companies };
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

const at = (c: Pick<CompanyState, 'x' | 'y'>): [number, number] => [c.x, c.y];

/**
 * Garrisons coming up, or caught below (the model, "The gap"), segment by segment in order, after movement. The
 * garrison cannot come up while a barrage is anywhere on its segment, and the attackers cannot enter the trench where
 * their own barrage is falling (`barrageNear`: on the trench within `closeRangeM` of them; the rest of a long segment may
 * still be under it).
 * - With the barrage off the trench near them (lifted, or none on it since Zero), attackers within the garrison's
 *   `closeRangeM` of the segment before it is up trap it: `trappedSurrenderFrac` of each garrison company's men (rounded without bias, in
 *   ascending id order) surrender, the rest stay below as the segment's dugout points (`defenders-trapped`, cause
 *   `followed-barrage`);
 * - otherwise, once its emergence minute (`emergeAtMin`) is reached, it is up: its companies man the trench
 *   (`garrison-emerged`, refs to its last barrage event). The cause is the gap (`gap-behind-barrage`), or the fire
 *   plan (`timetable`) when no barrage was ever on it; and `barrage-moved-on` with `factors.gapM` (and a ref to its
 *   `barrage-lost`) when the nearest attacker is more than `gapMultiplier × followDistanceM` behind its barrage.
 */
export function emergence(state: SimState, ctx: StepContext): SimState {
  let out = state;
  const mult = v(ctx.tables.effects.gapMultiplier);
  for (const seg0 of state.segments) {
    const seg = segmentById(out.segments, seg0.id)!;
    if (seg.emerged || seg.trapped) continue;
    const under = seg.barrageLastOverMin === out.minute;
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
    const closeM = v(g.doctrine.common.closeRangeM);
    const close = attackers.filter((x) => x.d <= closeM).map((x) => at(x.c));
    // Attackers cannot enter the trench where their own barrage is falling: only the trench near them must be clear.
    if (nearest && nearest.d <= closeM && !barrageNear(seg, ctx, out.companies, out.minute, close, closeM)) {
      const frac = v(g.doctrine.defence!.trappedSurrenderFrac);
      let captured = 0;
      let below = 0;
      const points: SegmentState['dugoutPoints'] = [];
      const trapped: CompanyState[] = [];
      const eventId = out.nextEventId;
      for (const c of g.companies) {
        const n = Math.min(c.men, stochasticRound(c.men * frac, ctx.rngs.gap));
        captured += n;
        below += c.men - n;
        if (c.men - n > 0) points.push({ companyId: c.id, point: at(c), men: c.men - n, leftMin: out.minute, unguardedMin: out.minute, eventId, cleared: 0 });
        trapped.push({ ...c, men: c.men - n, captured: c.captured + n, takenPrisoner: { eventId, minute: out.minute } });
      }
      out = emit(
        {
          ...out,
          companies: out.companies.map((c) => trapped.find((x) => x.id === c.id) ?? c),
          segments: out.segments.map((x) => (x.id === seg.id ? { ...x, trapped: true, trappedEventId: eventId, dugoutPoints: [...x.dugoutPoints, ...points] } : x)),
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
    // The garrison cannot come up while a barrage is anywhere on its segment.
    if (under || out.minute < emergeAtMin(seg, g.doctrine, ctx)) continue;
    const ids = g.companies.map((c) => c.id);
    const attack = nearest && ctx.doctrines[nearest.c.doctrineId]!.attack;
    const follow = attack ? v(attack.followDistanceM) : 0;
    const movedOn = nearest !== undefined && nearest.c.gapM !== null && nearest.c.gapM > follow * mult;
    const causes: Cause[] = [seg.barrageLastOverMin !== null ? 'gap-behind-barrage' : 'timetable', ...(movedOn ? (['barrage-moved-on'] as const) : [])];
    const lostRef = movedOn && nearest.c.barrageLostEventId !== null ? [nearest.c.barrageLostEventId] : [];
    out = emit(
      {
        ...out,
        companies: out.companies.map((c) => (ids.includes(c.id) ? { ...c, posture: 'in-trench' as const } : c)),
        segments: out.segments.map((x) => (x.id === seg.id ? { ...x, emerged: true } : x)),
      },
      {
        minute: out.minute,
        kind: 'garrison-emerged',
        segmentId: seg.id,
        text: `The garrison of ${seg.id} (${names}) is up and manning the trench${nearest ? `; nearest attacker ${nearest.c.name}, ${Math.round(nearest.d)} m off` : ''}`,
        causes,
        refs: [...refs, ...lostRef].sort((a, b) => a - b),
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

/** The minutes garrisons are due up (none while a barrage is on them). An emergence moves nobody. */
export function garrisonEmergences(state: SimState, ctx: StepContext): Scheduled[] {
  return state.segments.flatMap((seg) => {
    if (seg.emerged || seg.trapped || seg.barrageLastOverMin === state.minute) return [];
    const g = garrisonOf(state, ctx, seg);
    return g ? [{ minute: emergeAtMin(seg, g.doctrine, ctx), startsMovement: false }] : [];
  });
}
