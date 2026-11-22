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
  // Dugouts and the fight for trenches; ground-lost: trench its side held was taken from it (Task 12: why a counter-attack
  // was ordered, why a taken line was lost)
  'dugouts-uncleared', 'defenders-trapped', 'outnumbered', 'ground-lost',
  // A trench taken back by a counter-attack its headquarters ordered (Task 12); a trench taken back that nobody held, its
  // takers having moved on (Task 12)
  'counter-attack', 'left-unheld',
  // A planned counter-attack given up: all the lost ground it could retake lies behind a line the enemy holds (Task 13)
  'out-of-reach',
  // A planned counter-attack given up because the ground it was to retake is all held again, or because none of the troops
  // it would send is free to go (pinned, or already sent elsewhere) when they are there (Task 13)
  'ground-regained', 'no-troops',
  // Leadership and morale
  'officers-lost', 'led-by-ncos', 'morale-broke', 'suppressed', 'isolated',
  // No fire came in long enough for morale to recover (a company that fell back rallies, Task 10)
  'morale-recovered',
  // Ground, weather and light
  'mud', 'poor-visibility', 'darkness', 'air-observation', 'uphill-counter-attack',
  // Command and communications
  'order-delay', 'lost-contact', 'leader-slow', 'leader-adapted', 'leader-cautious', 'leader-bold',
  // Plans, reserves and the rest
  'planned-operation', 'reserve-arrived', 'ammunition-low', 'tank-bogged', 'horses-gassed',
  // The machine guns of a tank moving close by (Task 14)
  'tank-fire',
  // Enemy infantry seen close to a battery, which withdraws (Task 14 fix round); a mine blown under the trench (Task 14 fix round)
  'enemy-near', 'mine',
  // Why the deadlock counts as broken (Plan 4 Task 3, deadlock.ts): one cause for each condition
  'beyond-the-guns', 'mass-surrender', 'defence-collapsed', 'stronghold-held',
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
      ...(e.losses !== undefined ? { losses: e.losses } : {}),
      ...(e.at !== undefined ? { at: e.at } : {}),
    };
  });
  return { ...state, events: [...state.events, ...out], nextEventId: id };
}
