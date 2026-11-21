import { artilleryFire } from './artillery';
import { emergence, trackGaps } from './gap';
import { advanceBarrage } from './barrage';
import { commandPhase } from './command';
import { commsPhase, companyReports } from './comms';
import { emit } from './causes';
import type { NewEvent } from './causes';
import { directFire } from './fire';
import { morale } from './morale';
import { behaviour, moveCompanies } from './movement';
import { marchReserves } from './reserves';
import { resolve } from './resolve';
import { takeLines } from './step';
import type { SimState, StepContext } from './step';
import { moveTanks, tankFire } from './smaller';
import { captureSegments, mopUp, sorties } from './trenches';
import type { Pending } from './types';

/**
 * One phase of a step. Phases run in the spec's fixed order; `pending` carries damage gathered by
 * `artillery` and `directFire` until `resolve` applies it all at once. A phase that has nothing to do
 * yet returns the state unchanged.
 */
export type Phase = (state: SimState, ctx: StepContext, dt: number, pending: Pending) => SimState;

/** Each company picks its intent (movement.ts). */
const behaviourPhase: Phase = (state, ctx) => behaviour(state, ctx);

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
 * Companies move (movement.ts), and tanks (smaller.ts); then each attacker's gap to the barrage is taken, and garrisons
 * come up out of their dugouts or are caught in them (gap.ts); then segments change hands and guns are overrun, the
 * dugouts are mopped up, and men left in them too long come up (trenches.ts); then the reserves off the map march, and
 * those due arrive (reserves.ts).
 */
const movement: Phase = (state, ctx, dt, pending) => {
  const moved = moveTanks(moveCompanies(state, ctx, dt, pending), ctx, dt);
  const gaps = emergence(trackGaps(moved, ctx, dt, state.companies), ctx);
  return marchReserves(sorties(mopUp(captureSegments(gaps, ctx), ctx, dt), ctx), ctx);
};

/** Rifle and machine-gun fire (fire.ts), then the machine guns of moving tanks, which only suppress (smaller.ts). */
const directFirePhase: Phase = (state, ctx, dt, pending) => tankFire(directFire(state, ctx, dt, pending), ctx, dt, pending);

/** Headquarters decide from their pictures and send their orders; off-map attacks apply (command.ts). */
const command: Phase = (state, ctx, dt) => commandPhase(state, ctx, dt);

/** Deliver the messages due and update each HQ's picture (comms.ts). */
const comms: Phase = (state, ctx) => commsPhase(state, ctx);

/** Line-taken checks; then companies report what changed, and pinned companies call for fire (comms.ts). */
const log: Phase = (state, ctx) => companyReports(takeLines(state, ctx), ctx);

/** The nine phases of a step, in the spec's order (the model, "Step pipeline"). */
export const PHASES = [
  ['comms', comms],
  ['command', command],
  ['behaviour', behaviourPhase],
  ['artillery', artillery],
  ['directFire', directFirePhase],
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
