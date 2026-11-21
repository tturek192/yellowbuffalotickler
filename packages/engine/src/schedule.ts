import { phaseEndMin } from './barrage';
import type { SimState, StepContext } from './step';

/**
 * A minute at which something is due to happen. `startsMovement` marks a change that sets a unit moving
 * (a company's start, later an order arriving, a reserve arriving, a sortie): a quiet step must end before
 * it, so the unit's first move is a fine step, exactly as if the whole run were stepped finely.
 */
export type Scheduled = { minute: number; startsMovement: boolean };

/** One subsystem's upcoming scheduled minutes (any order; minutes at or before now are ignored). */
export type ScheduleSource = (state: SimState, ctx: StepContext) => Scheduled[];

/**
 * Every subsystem with scheduled minutes registers here; a later task adds its entry (emergence, message
 * due times, operations, counter-attack delays, off-map windows, reserve arrivals) without touching run.ts.
 */
export const SCHEDULES: ReadonlyArray<readonly [name: string, source: ScheduleSource]> = [
  [
    'barrage-phases',
    (state, ctx) =>
      state.barrages.flatMap((b) => {
        const end = phaseEndMin(b, ctx.scenario.sectors.find((x) => x.id === b.sectorId)!, ctx.lines);
        // A phase change moves no unit by itself (advanceBarrage keeps the exact minute).
        return end === null ? [] : [{ minute: end, startsMovement: false }];
      }),
  ],
  [
    'company-starts',
    (state) => state.companies.filter((c) => c.status === 'waiting').map((c) => ({ minute: c.startMin, startsMovement: true })),
  ],
];

/**
 * A quiet step's length, at most `quietMin`, in whole steps of `stepMin`, cut so that:
 * - it ends at or after the first grid minute past an event that moves nobody (rounded up), and
 * - it ends on the last grid minute before anything that starts movement (rounded down, at least one step),
 *   so the step in which a unit starts moving is a `stepMin` step.
 * With this rule, a run's movement is the same whatever `quietMin` is.
 */
export function quietStep(state: SimState, ctx: StepContext, stepMin: number, quietMin: number): number {
  let dt = Math.max(stepMin, quietMin);
  for (const [, source] of SCHEDULES)
    for (const s of source(state, ctx)) {
      const ahead = s.minute - state.minute;
      if (ahead <= 0) continue;
      const steps = s.startsMovement ? Math.floor(ahead / stepMin) : Math.ceil(ahead / stepMin);
      dt = Math.min(dt, Math.max(stepMin, steps * stepMin));
    }
  return dt;
}
