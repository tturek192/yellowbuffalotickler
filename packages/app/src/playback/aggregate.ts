import type { CompanyStatus, RunRecord, Side } from '@wwi/engine';
import { companiesOf, type FrameCompany } from './interpolate';

/** A battalion as the corps view draws it, summed from its companies in one frame. */
export type BattalionMarker = {
  id: string;
  side: Side;
  /** Compact text for the marker. */
  label: string;
  /** Centroid of the living companies (of every company that is on the map, when none is living). */
  x: number;
  y: number;
  /** Men still under arms: surrendered and destroyed companies add none. */
  men: number;
  /** The battalion's men at Zero (companies that have not yet come on to the map are not counted). */
  fullMen: number;
  /** Men-weighted averages. */
  morale: number;
  suppression: number;
  /** The status with the most starting men. */
  status: CompanyStatus;
  /** Companies on the map. */
  companies: number;
};

/** Tie order for the dominant status: the worst news first; every other status ranks equal, after these. */
const TIE_ORDER: readonly CompanyStatus[] = ['surrendered', 'destroyed', 'falling-back', 'pinned'];
const tieRank = (s: CompanyStatus): number => {
  const i = TIE_ORDER.indexOf(s);
  return i < 0 ? TIE_ORDER.length : i;
};

const mean = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/**
 * One marker per battalion that has a company on the map (off-map companies are not drawn).
 * Living means men > 0, so a destroyed company (0 men) and a surrendered one (its men are captured) drop out of the
 * centroid and the strength; a battalion left with none keeps its companies' last positions as its centroid.
 * A status votes with the men its companies started with, so a battalion with three companies surrendered and one
 * advancing shows the white flag; the largest body of starting men decides, ties by the order above.
 */
export function aggregateBattalions(rows: readonly FrameCompany[], record: RunRecord): BattalionMarker[] {
  const initial = new Map((record.snapshots[0] ? companiesOf(record, record.snapshots[0]) : []).map((c) => [c.id, c.men]));
  const byBattalion = new Map<string, FrameCompany[]>();
  for (const c of rows) {
    if (c.status === 'off-map') continue;
    const list = byBattalion.get(c.battalionId);
    if (list) list.push(c);
    else byBattalion.set(c.battalionId, [c]);
  }
  const out: BattalionMarker[] = [];
  for (const id of [...byBattalion.keys()].sort()) {
    const cs = byBattalion.get(id)!;
    const living = cs.filter((c) => c.men > 0);
    const at = living.length > 0 ? living : cs;
    const men = living.reduce((a, c) => a + c.men, 0);
    const weighted = (pick: (c: FrameCompany) => number): number => (men > 0 ? living.reduce((a, c) => a + pick(c) * c.men, 0) / men : mean(cs.map(pick)));
    const votes = new Map<CompanyStatus, number>();
    // Each company votes with the men it started with, so surrendered and destroyed companies still count.
    for (const c of cs) votes.set(c.status, (votes.get(c.status) ?? 0) + (initial.get(c.id) ?? c.men));
    const [status] = [...votes].sort((a, b) => b[1] - a[1] || tieRank(a[0]) - tieRank(b[0]))[0]!;
    out.push({
      id,
      side: cs[0]!.side,
      label: battalionLabel(id),
      x: mean(at.map((c) => c.x)),
      y: mean(at.map((c) => c.y)),
      men,
      fullMen: cs.reduce((a, c) => a + (initial.get(c.id) ?? c.men), 0),
      morale: weighted((c) => c.morale),
      suppression: weighted((c) => c.suppression),
      status,
      companies: cs.length,
    });
  }
  return out;
}

const capital = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * A compact marker text from a battalion id: '102bn' → '102', '12glosters' → '12 Glosters', 'bir14-iii' → 'III/BIR14',
 * and a made-up battalion '111id-bn5' → '111D B5'. Anything else: its first three characters, upper-cased.
 */
export function battalionLabel(id: string): string {
  const german = /^([a-z]+)(\d+)-([ivx]+)$/i.exec(id);
  if (german) return `${german[3]!.toUpperCase()}/${german[1]!.toUpperCase()}${german[2]}`;
  const madeUp = /^(\d+)(id|gd)-bn(\d+)$/i.exec(id);
  if (madeUp) return `${madeUp[1]}${madeUp[2]!.toLowerCase() === 'gd' ? 'G' : 'D'} B${madeUp[3]}`;
  const allied = /^(\d+)([a-z]+)$/i.exec(id);
  if (allied) return allied[2]!.toLowerCase() === 'bn' ? allied[1]! : `${allied[1]} ${capital(allied[2]!)}`;
  return id.slice(0, 3).toUpperCase();
}
