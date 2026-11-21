import { winnerOf } from './end';
import { tallyCasualties } from './record';
import type { EndReason, RunRecord } from './record';
import type { SimState, StepContext } from './step';

/**
 * The run's summary (Task 15): the lines taken; casualties by period (the preliminary bombardment, before Zero, and the
 * battle), side and formation, rolled up along each company's formation path (so battalion, brigade and division totals
 * are there to set beside targets); prisoners by the side that took them; guns captured; when and why the run ended; and
 * who holds the key ground. It reads the run, never `historical.*` (the batch compares, batch.ts).
 */
export function summarize(state: SimState, ctx: StepContext, events: RunRecord['events'], endReason: EndReason): RunRecord['summary'] {
  const { winner, keyGround } = winnerOf(state, ctx);
  return {
    lineTaken: events.filter((e) => e.kind === 'line-taken').map((e) => ({ lineId: e.lineId!, sectorId: e.sectorId!, minute: e.minute })),
    casualties: {
      // Men lost before Zero are in each company's totals and counted here apart from the battle.
      bombardment: tallyCasualties(state.companies, (c) => ({ ...c.bombardment, captured: 0 })),
      battle: tallyCasualties(state.companies, (c) => ({
        killed: c.killed - c.bombardment.killed,
        wounded: c.wounded - c.bombardment.wounded,
        captured: c.captured,
      })),
    },
    // Men taken prisoner by each side: the other side's captured.
    prisoners: {
      allied: state.companies.filter((c) => c.side === 'central').reduce((a, c) => a + c.captured, 0),
      central: state.companies.filter((c) => c.side === 'allied').reduce((a, c) => a + c.captured, 0),
    },
    // Guns of batteries overrun by the enemy (Task 10).
    gunsCaptured: state.batteries.filter((b) => b.captured).reduce((a, b) => a + b.guns, 0),
    endedAt: state.minute,
    endReason,
    winner,
    keyGround,
  };
}
