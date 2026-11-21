import type { SimEvent } from './types';
import type { SimState } from './step';

/** The fixed vocabulary of reasons an event happened (spec section 8). Every event's `causes` come from it. */
export const CAUSES = [
  // The barrage and the timetable
  'timetable', 'followed-barrage', 'barrage-moved-on', 'gap-behind-barrage', 'friendly-barrage',
  // Wire and the bombardment
  'wire-uncut', 'wire-cut', 'spared-by-bombardment',
  // Fire
  'mg-fire', 'rifle-fire', 'mg-unobserved', 'artillery-fire', 'defensive-barrage', 'batteries-recovered', 'counter-battery', 'off-map-fire',
  // Dugouts and the fight for trenches
  'dugouts-uncleared', 'defenders-trapped', 'outnumbered',
  // Leadership and morale
  'officers-lost', 'led-by-ncos', 'morale-broke', 'suppressed', 'isolated',
  // Ground, weather and light
  'mud', 'poor-visibility', 'darkness', 'air-observation', 'uphill-counter-attack',
  // Command and communications
  'order-delay', 'lost-contact', 'leader-slow', 'leader-adapted', 'leader-cautious', 'leader-bold',
  // Plans, reserves and the rest
  'planned-operation', 'reserve-arrived', 'ammunition-low', 'tank-bogged', 'horses-gassed',
] as const;

export type Cause = (typeof CAUSES)[number];

/** An event as a phase writes it: the id is given on emission; refs and causes default to none. */
export type NewEvent = Omit<SimEvent, 'id' | 'refs' | 'causes'> & { refs?: number[]; causes?: Cause[] };

/**
 * Append events to the step's events, giving each the next sequential id of the run. Refs must name
 * events already emitted (lower ids); a ref to a later or unknown event is a bug and throws.
 */
export function emit(state: SimState, ...events: NewEvent[]): SimState {
  let id = state.nextEventId;
  const out = events.map((e): SimEvent => {
    const refs = e.refs ?? [];
    for (const r of refs) if (!(Number.isInteger(r) && r >= 0 && r < id)) throw new Error(`event ${id} (${e.kind}) refers to event ${r}, which is not earlier`);
    // Fields in one fixed order, so the record's bytes never depend on how a phase spelled the object.
    return {
      id: id++,
      minute: e.minute,
      kind: e.kind,
      ...(e.sectorId !== undefined ? { sectorId: e.sectorId } : {}),
      ...(e.lineId !== undefined ? { lineId: e.lineId } : {}),
      ...(e.unitId !== undefined ? { unitId: e.unitId } : {}),
      ...(e.segmentId !== undefined ? { segmentId: e.segmentId } : {}),
      text: e.text,
      causes: e.causes ?? [],
      refs,
      ...(e.factors !== undefined ? { factors: e.factors } : {}),
    };
  });
  return { ...state, events: [...state.events, ...out], nextEventId: id };
}
