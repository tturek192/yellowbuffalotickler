import type { CompanyStatus, RunRecord, Side, Snapshot } from '@wwi/engine';

/** A company as app tests write it; turned into a record's units and columnar snapshot rows. */
export type TestCompany = { id: string; side: Side; x: number; y: number; men: number; status: CompanyStatus; battalionId?: string; morale?: number; suppression?: number };

/** The record's `units` for these companies (deduplicated, first occurrence wins). */
export function unitsFor(...lists: TestCompany[][]): RunRecord['units'] {
  const seen = new Map<string, RunRecord['units'][number]>();
  for (const c of lists.flat()) if (!seen.has(c.id)) seen.set(c.id, { id: c.id, battalionId: c.battalionId ?? 'bn', name: c.id, side: c.side });
  return [...seen.values()];
}

/** A snapshot's columnar company table. */
export function companyTable(cs: TestCompany[]): Snapshot['companies'] {
  return {
    columns: ['id', 'x', 'y', 'men', 'status', 'morale', 'suppression', 'posture', 'killed', 'wounded', 'captured', 'gapM'],
    rows: cs.map((c) => [c.id, c.x, c.y, c.men, c.status, c.morale ?? 1, c.suppression ?? 0, 'moving', 0, 0, 0, null]),
  };
}
