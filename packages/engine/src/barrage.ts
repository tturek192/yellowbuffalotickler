import type { Point, Scenario } from '@wwi/scenario';
import { lineXAt } from './geometry';
import type { NewEvent } from './causes';

type Sector = Scenario['sectors'][number];
type Lines = Map<string, Point[]>;

export type BarrageState = {
  sectorId: string;
  legIndex: number;
  phase: 'lifting' | 'pausing' | 'done';
  phaseStartMin: number;
};

export function initBarrage(sector: Sector): BarrageState {
  return { sectorId: sector.id, legIndex: 0, phase: 'lifting', phaseStartMin: 0 };
}

function linePoints(lines: Lines, id: string): Point[] {
  const pts = lines.get(id);
  if (!pts) throw new Error(`Unknown line "${id}"`);
  return pts;
}

type LegGeometry = { leg: Sector['legs'][number]; from: Point[]; to: Point[]; toId: string; depthM: number; legMin: number; liftM: number; liftMin: number };
/** Each sector's legs worked out once per lines map (looked up only). */
const legCache = new WeakMap<Lines, WeakMap<Sector, LegGeometry[]>>();

function legGeometry(sector: Sector, lines: Lines, legIndex: number): LegGeometry {
  let bySector = legCache.get(lines);
  if (!bySector) legCache.set(lines, (bySector = new WeakMap()));
  let legs = bySector.get(sector);
  if (!legs) bySector.set(sector, (legs = []));
  return (legs[legIndex] ??= workLeg(sector, lines, legIndex));
}

function workLeg(sector: Sector, lines: Lines, legIndex: number): LegGeometry {
  const leg = sector.legs[legIndex];
  if (!leg) throw new RangeError(`Sector ${sector.id} has no leg ${legIndex}`);
  const fromId = legIndex === 0 ? sector.startLineId : sector.legs[legIndex - 1]!.toLineId;
  const from = linePoints(lines, fromId);
  const to = linePoints(lines, leg.toLineId);
  const yMid = (sector.yMin + sector.yMax) / 2;
  const liftM = leg.liftM.value;
  const liftMin = leg.liftMin.value;
  const depthM = lineXAt(to, yMid) - lineXAt(from, yMid);
  const legMin = Math.ceil(depthM / liftM) * liftMin;
  return { leg, from, to, toId: leg.toLineId, depthM, legMin, liftM, liftMin };
}

export function advanceBarrage(
  b: BarrageState,
  sector: Sector,
  lines: Lines,
  minute: number,
): { state: BarrageState; events: NewEvent[] } {
  const events: NewEvent[] = [];
  let state = b;
  for (;;) {
    if (state.phase === 'done') break;
    const g = legGeometry(sector, lines, state.legIndex);
    if (state.phase === 'lifting') {
      const end = state.phaseStartMin + g.legMin;
      if (minute < end) break;
      events.push({
        minute: end,
        kind: 'barrage-pause',
        sectorId: sector.id,
        lineId: g.toId,
        text: 'Barrage pauses beyond objective line',
        causes: [],
      });
      state = { ...state, phase: 'pausing', phaseStartMin: end };
    } else {
      const end = state.phaseStartMin + g.leg.pauseMin.value;
      if (minute < end) break;
      if (state.legIndex + 1 >= sector.legs.length) {
        events.push({
          minute: end,
          kind: 'barrage-done',
          sectorId: sector.id,
          lineId: g.toId,
          text: 'Barrage ends',
          causes: [],
        });
        state = { ...state, phase: 'done', phaseStartMin: end };
      } else {
        events.push({
          minute: end,
          kind: 'barrage-resume',
          sectorId: sector.id,
          lineId: sector.legs[state.legIndex + 1]!.toLineId,
          text: 'Barrage resumes and lifts to the next line',
          causes: [],
        });
        state = { ...state, legIndex: state.legIndex + 1, phase: 'lifting', phaseStartMin: end };
      }
    }
  }
  return { state, events };
}

/** The minute the barrage's current phase ends (it lifts, pauses, resumes or finishes then); null once done. */
export function phaseEndMin(b: BarrageState, sector: Sector, lines: Lines): number | null {
  if (b.phase === 'done') return null;
  const g = legGeometry(sector, lines, b.legIndex);
  return b.phaseStartMin + (b.phase === 'lifting' ? g.legMin : g.leg.pauseMin.value);
}

export function barrageXAt(b: BarrageState, sector: Sector, lines: Lines, minute: number, y: number): number {
  const g = legGeometry(sector, lines, b.legIndex);
  const standOff = sector.standOffM.value;
  const toX = lineXAt(g.to, y) + standOff;
  if (b.phase !== 'lifting') return toX;
  const standFrom = b.legIndex === 0 ? 0 : standOff;
  const fromX = lineXAt(g.from, y) + standFrom;
  const t =
    g.depthM <= 0
      ? 1
      : Math.min(1, Math.max(0, (Math.floor((minute - b.phaseStartMin) / g.liftMin) * g.liftM) / g.depthM));
  return fromX + (toX - fromX) * t;
}

/**
 * The creeping barrage's band at y: the zone its shells fall in at that minute, `depthM` deep (tables
 * `barrageBandDepthM`) and centred on the barrage line, as [near edge, far edge]; null once the barrage has ended.
 */
export function bandAt(b: BarrageState, sector: Sector, lines: Lines, minute: number, y: number, depthM: number): [number, number] | null {
  if (b.phase === 'done') return null;
  const x = barrageXAt(b, sector, lines, minute, y);
  return [x - depthM / 2, x + depthM / 2];
}

/** The farthest the sector's fire plan reaches at y: its last objective line plus the stand-off. */
export function planReachX(sector: Sector, lines: Lines, y: number): number {
  return lineXAt(linePoints(lines, sector.legs[sector.legs.length - 1]!.toLineId), y) + sector.standOffM.value;
}

/**
 * The minute the sector's timetable has its barrage arrive beyond a line (the end of the lift of the leg to it): when the
 * attackers following it are due there (Task 12, the stall rule). Null when no leg of the sector goes to the line.
 */
export function lineTimetableMin(sector: Sector, lines: Lines, lineId: string): number | null {
  let t = 0;
  for (let i = 0; i < sector.legs.length; i++) {
    const g = legGeometry(sector, lines, i);
    t += g.legMin;
    if (g.toId === lineId) return t;
    t += g.leg.pauseMin.value;
  }
  return null;
}
