import { advanceBarrage, barrageXAt } from './barrage';
import { emit } from './causes';
import type { NewEvent } from './causes';
import { isHolding, moveCompanies } from './companies';
import type { CompanyState } from './companies';
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

/** Each company picks its intent. Plan 2's model: attackers advance until they consolidate; everyone else holds. */
const behaviour: Phase = (state) => {
  const intentOf = (c: CompanyState): Intent => (isHolding(c) || c.status === 'consolidating' ? 'hold' : 'advance');
  return { ...state, companies: state.companies.map((c) => (c.intent === intentOf(c) ? c : { ...c, intent: intentOf(c) })) };
};

/** Barrages advance along their timetables. */
const artillery: Phase = (state, ctx) => {
  const events: NewEvent[] = [];
  const barrages = state.barrages.map((b) => {
    const sector = ctx.scenario.sectors.find((x) => x.id === b.sectorId)!;
    const r = advanceBarrage(b, sector, ctx.lines, state.minute);
    events.push(...r.events);
    return r.state;
  });
  return emit({ ...state, barrages }, ...events);
};

/** Companies follow their sector's barrage toward their objective line. */
const movement: Phase = (state, ctx, dt) => {
  const barrageX = (sectorId: string, y: number): number => {
    const b = state.barrages.find((x) => x.sectorId === sectorId)!;
    const sector = ctx.scenario.sectors.find((x) => x.id === sectorId)!;
    return barrageXAt(b, sector, ctx.lines, state.minute, y);
  };
  const moved = moveCompanies(state.companies, barrageX, ctx.scenario.lines, ctx.doctrines, state.minute, dt);
  return emit({ ...state, companies: moved.companies }, ...moved.events);
};

/** Line-taken checks. */
const log: Phase = (state, ctx) => takeLines(state, ctx);

/** The nine phases of a step, in the spec's order (the model, "Step pipeline"). */
export const PHASES = [
  ['comms', none],
  ['command', none],
  ['behaviour', behaviour],
  ['artillery', artillery],
  ['directFire', none],
  ['resolve', none],
  ['morale', none],
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
