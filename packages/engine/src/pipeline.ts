import { artilleryFire } from './artillery';
import { emergence, trackGaps } from './gap';
import { advanceBarrage, barrageXAt } from './barrage';
import { emit } from './causes';
import type { NewEvent } from './causes';
import { isHolding, moveCompanies } from './companies';
import type { CompanyState } from './companies';
import { directFire } from './fire';
import { morale } from './morale';
import { resolve } from './resolve';
import { takeLines } from './step';
import type { SimState, StepContext } from './step';
import type { Intent, Pending } from './types';

/**
 * One phase of a step. Phases run in the spec's fixed order; `pending` carries damage gathered by
 * `artillery` and `directFire` until `resolve` applies it all at once. A phase that has nothing to do
 * yet returns the state unchanged.
 */
export type Phase = (state: SimState, ctx: StepContext, dt: number, pending: Pending) => SimState;

const none: Phase = (state) => state;

/**
 * Each company picks its intent. Plan 2's model: attackers advance until they consolidate; everyone else holds. A
 * pinned company goes to ground and one falling back falls back (Task 9's morale states); one that has surrendered or
 * been destroyed does nothing.
 */
const behaviour: Phase = (state) => {
  const intentOf = (c: CompanyState): Intent => {
    if (c.status === 'pinned') return 'go-to-ground';
    if (c.status === 'falling-back') return 'fall-back';
    return isHolding(c) || c.status === 'consolidating' || c.status === 'surrendered' || c.status === 'destroyed' ? 'hold' : 'advance';
  };
  return { ...state, companies: state.companies.map((c) => (c.intent === intentOf(c) ? c : { ...c, intent: intentOf(c) })) };
};

/** Barrages advance along their timetables; then every artillery effect is gathered as pending damage (artillery.ts). */
const artillery: Phase = (state, ctx, dt, pending) => {
  const events: NewEvent[] = [];
  const barrages = state.barrages.map((b) => {
    const sector = ctx.scenario.sectors.find((x) => x.id === b.sectorId)!;
    const r = advanceBarrage(b, sector, ctx.lines, state.minute);
    events.push(...r.events);
    return r.state;
  });
  return artilleryFire(emit({ ...state, barrages }, ...events), ctx, dt, pending);
};

/**
 * Companies follow their sector's barrage toward their objective line; then each attacker's gap to the
 * barrage is taken, and garrisons come up out of their dugouts or are caught in them (artillery.ts).
 */
const movement: Phase = (state, ctx, dt) => {
  const barrageX = (sectorId: string, y: number): number => {
    const b = state.barrages.find((x) => x.sectorId === sectorId)!;
    const sector = ctx.scenario.sectors.find((x) => x.id === sectorId)!;
    return barrageXAt(b, sector, ctx.lines, state.minute, y);
  };
  const moved = moveCompanies(state.companies, barrageX, ctx.scenario.lines, ctx.doctrines, state.minute, dt);
  return emergence(trackGaps(emit({ ...state, companies: moved.companies }, ...moved.events), ctx, dt, state.companies), ctx);
};

/** Line-taken checks. */
const log: Phase = (state, ctx) => takeLines(state, ctx);

/** The nine phases of a step, in the spec's order (the model, "Step pipeline"). */
export const PHASES = [
  ['comms', none],
  ['command', none],
  ['behaviour', behaviour],
  ['artillery', artillery],
  ['directFire', directFire],
  ['resolve', resolve],
  ['morale', morale],
  ['movement', movement],
  ['log', log],
] as const satisfies ReadonlyArray<readonly [string, Phase]>;

export type PhaseName = (typeof PHASES)[number][0];

/**
 * Advance the state by dt minutes. Every phase sees the minute the step ends at, and the step's events
 * start empty.
 */
export function runPipeline(state: SimState, ctx: StepContext, dt: number): SimState {
  let s: SimState = { ...state, minute: state.minute + dt, events: [] };
  const pending: Pending = { damage: [] };
  for (const [name, phase] of PHASES) {
    ctx.onPhase?.(name);
    s = phase(s, ctx, dt, pending);
  }
  return s;
}
