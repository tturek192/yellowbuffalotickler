import { v } from '@wwi/scenario';
import type { Doctrine, Point, Scenario } from '@wwi/scenario';
import { barrageXAt, initBarrage } from './barrage';
import { initCompanies, isHolding } from './companies';
import { sampleYs } from './geometry';
import { createRng } from './rng';
import { ENGINE_VERSION, round1 } from './record';
import type { RunRecord } from './record';
import { step } from './step';
import type { SimState, StepContext } from './step';

export type RunOptions = {
  seed: number;
  stepMin?: number;
  snapshotEvery?: number;
  endMinute?: number;
  stopEarly?: boolean;
};

function snapshot(state: SimState, ctx: StepContext): RunRecord['snapshots'][number] {
  return {
    minute: state.minute,
    companies: state.companies.map((c) => ({
      id: c.id,
      side: c.side,
      x: round1(c.x),
      y: round1(c.y),
      strength: c.strength,
      status: c.status,
    })),
    barrages: state.barrages.map((b) => {
      const sector = ctx.scenario.sectors.find((x) => x.id === b.sectorId)!;
      return {
        sectorId: b.sectorId,
        done: b.phase === 'done',
        points: sampleYs(sector.yMin, sector.yMax).map(
          (y) => [round1(barrageXAt(b, sector, ctx.lines, state.minute, y)), round1(y)] as Point,
        ),
      };
    }),
  };
}

export function runScenario(s: Scenario, doctrines: Record<string, Doctrine>, opts: RunOptions): RunRecord {
  const stepMin = opts.stepMin ?? 2;
  const snapshotEvery = opts.snapshotEvery ?? 5;
  const endMinute = opts.endMinute ?? s.timeLimitMinutes;
  const stopEarly = opts.stopEarly ?? true;
  const rng = createRng(opts.seed);
  const ctx: StepContext = { scenario: s, lines: new Map(s.lines.map((l) => [l.id, l.points])), doctrines };

  let state: SimState = {
    minute: 0,
    barrages: s.sectors.map(initBarrage),
    companies: initCompanies(s, doctrines, rng),
    taken: [],
    events: [],
  };
  const events: RunRecord['events'] = [
    { minute: 0, kind: 'zero-hour', text: 'Zero hour', causes: [] },
  ];
  const snapshots = [snapshot(state, ctx)];

  let n = 0;
  while (state.minute < endMinute) {
    const dt = Math.min(stepMin, endMinute - state.minute);
    state = step(state, ctx, dt);
    n++;
    events.push(...state.events);
    const finished =
      stopEarly &&
      state.barrages.every((b) => b.phase === 'done') &&
      state.companies.every((c) => isHolding(c) || c.status === 'consolidating');
    if (n % snapshotEvery === 0 || state.minute >= endMinute || finished) snapshots.push(snapshot(state, ctx));
    if (finished) break;
  }

  return {
    engineVersion: ENGINE_VERSION,
    scenarioId: s.id,
    scenarioTitle: s.title,
    scenarioStatus: s.status,
    seed: opts.seed,
    zeroHour: v(s.zeroHour),
    stepMin,
    endMinute: state.minute,
    geometry: {
      lines: s.lines,
      sectors: s.sectors.map((x) => ({ id: x.id, yMin: x.yMin, yMax: x.yMax })),
      features: s.features,
    },
    snapshots,
    events,
    summary: {
      lineTaken: events
        .filter((e) => e.kind === 'line-taken')
        .map((e) => ({ lineId: e.lineId!, sectorId: e.sectorId!, minute: e.minute })),
    },
  };
}
