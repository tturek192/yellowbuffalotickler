import type { Doctrine, Point, Scenario } from '@wwi/scenario';
import { advanceBarrage, barrageXAt } from './barrage';
import type { BarrageState } from './barrage';
import { moveCompanies } from './companies';
import type { CompanyState } from './companies';
import type { SimEvent } from './types';

export type SimState = {
  minute: number;
  barrages: BarrageState[];
  companies: CompanyState[];
  /** "lineId|sectorId" keys of lines already taken. */
  taken: string[];
  /** Events emitted by the most recent step, in order. */
  events: SimEvent[];
};

export type StepContext = {
  scenario: Scenario;
  lines: Map<string, Point[]>;
  doctrines: Record<string, Doctrine>;
};

export function step(state: SimState, ctx: StepContext, dtMin: number): SimState {
  const minute = state.minute + dtMin;
  const events: SimEvent[] = [];

  const barrages = state.barrages.map((b) => {
    const sector = ctx.scenario.sectors.find((x) => x.id === b.sectorId)!;
    const r = advanceBarrage(b, sector, ctx.lines, minute);
    events.push(...r.events);
    return r.state;
  });

  const barrageX = (sectorId: string, y: number): number => {
    const b = barrages.find((x) => x.sectorId === sectorId)!;
    const sector = ctx.scenario.sectors.find((x) => x.id === sectorId)!;
    return barrageXAt(b, sector, ctx.lines, minute, y);
  };
  const moved = moveCompanies(state.companies, barrageX, ctx.scenario.lines, ctx.doctrines, minute, dtMin);
  events.push(...moved.events);

  const taken = [...state.taken];
  const groups = new Map<string, CompanyState[]>();
  for (const c of moved.companies) {
    const key = `${c.objectiveLineId}|${c.sectorId}`;
    groups.set(key, [...(groups.get(key) ?? []), c]);
  }
  for (const [key, cs] of groups) {
    if (taken.includes(key) || !cs.every((c) => c.status === 'consolidating')) continue;
    const [lineId, sectorId] = key.split('|') as [string, string];
    const line = ctx.scenario.lines.find((l) => l.id === lineId)!;
    taken.push(key);
    events.push({
      minute,
      kind: 'line-taken',
      sectorId,
      lineId,
      text: `${line.name} taken`,
      causes: ['followed-barrage'],
    });
  }
  return { minute, barrages, companies: moved.companies, taken, events };
}
