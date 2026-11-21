import { ammunitionRunsOut, batteryRecoveries, offMapWindows } from './artillery';
import { counterAttackRetries, offMapAttackWindows, operationStarts, orderStarts, stallChecks } from './command';
import { fireMissionEnds, messageDueTimes } from './comms';
import { garrisonEmergences } from './gap';
import { phaseEndMin } from './barrage';
import { dugoutSorties } from './trenches';
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
  // Task 8: silenced batteries coming back, garrisons coming up, off-map fire opening and stopping; none moves anyone.
  ['battery-recovery', batteryRecoveries],
  ['garrison-emergence', garrisonEmergences],
  ['off-map-fire', offMapWindows],
  // Task 10: men left in dugouts coming up behind the attackers; they fire from their trench and move nobody.
  ['dugout-sorties', dugoutSorties],
  // Task 10 fix round: batteries running out of rounds, so a quiet step ends when fine steps would see it; moves nobody.
  ['ammunition-runs-out', ammunitionRunsOut],
  // Task 11: messages arriving and headquarters' routine summaries (only an order reaching its formation may set anyone
  // moving), and fire on call stopping (moves nobody).
  ['messages', messageDueTimes],
  ['fire-missions', fireMissionEnds],
  // Task 12: lines due to count as stalled and operations' notBefore (decisions, which move nobody: their orders do, on
  // arrival); counter-attacks formed up and going in (they set companies moving); off-map attacks opening (their first
  // step a fine one) and closing.
  ['stall-checks', stallChecks],
  ['operation-starts', operationStarts],
  ['order-starts', orderStarts],
  ['off-map-attacks', offMapAttackWindows],
  // Task 12 fix round: a failed local counter-attack may be ordered again (a decision, which moves nobody).
  ['counter-attack-retries', counterAttackRetries],
];

/**
 * A quiet step's length, at most `quietMin`, in whole steps of `stepMin`, cut so that:
 * - it ends at or after the first grid minute past an event that moves nobody (rounded up), and
 * - it ends on the last grid minute strictly before anything that starts movement (at least one step), so the step in
 *   which a unit starts moving (the first whose end is at or after its minute) is a `stepMin` step.
 * With this rule, a run's movement is the same whatever `quietMin` is.
 */
export function quietStep(state: SimState, ctx: StepContext, stepMin: number, quietMin: number): number {
  let dt = Math.max(stepMin, quietMin);
  for (const [, source] of SCHEDULES)
    for (const s of source(state, ctx)) {
      const ahead = s.minute - state.minute;
      if (ahead <= 0) continue;
      // Movement: the last grid minute strictly before it (a start falling exactly on the grid still gets its fine step).
      const steps = s.startsMovement ? Math.ceil(ahead / stepMin) - 1 : Math.ceil(ahead / stepMin);
      dt = Math.min(dt, Math.max(stepMin, steps * stepMin));
    }
  return dt;
}
