import type { CompanyStatus, RunRecord, Side, Snapshot } from '@wwi/engine';
import type { Posture } from '@wwi/scenario';

/** One company at one moment: its snapshot row, joined with what the record says about the unit. */
export type FrameCompany = {
  id: string;
  side: Side;
  battalionId: string;
  name: string;
  x: number;
  y: number;
  men: number;
  status: CompanyStatus;
  morale: number;
  suppression: number;
  posture: Posture;
};

export type Frame = {
  minute: number;
  companies: FrameCompany[];
  barrages: Snapshot['barrages'];
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const decoded = new WeakMap<Snapshot, FrameCompany[]>();
const unitsOf = new WeakMap<RunRecord, Map<string, RunRecord['units'][number]>>();

/** A snapshot's company rows as objects, read by column name (cached: a snapshot never changes). */
export function companiesOf(r: RunRecord, s: Snapshot): FrameCompany[] {
  const hit = decoded.get(s);
  if (hit) return hit;
  let units = unitsOf.get(r);
  if (!units) unitsOf.set(r, (units = new Map(r.units.map((u) => [u.id, u]))));
  const { columns, rows } = s.companies;
  const col = (name: string): number => (columns as readonly string[]).indexOf(name);
  const [id, x, y, men, status, morale, suppression, posture] = ['id', 'x', 'y', 'men', 'status', 'morale', 'suppression', 'posture'].map(col) as [
    number, number, number, number, number, number, number, number,
  ];
  // parseRunRecord guarantees id, x, y, men and status, and a unit for every row; the rest may be absent.
  const opt = <T>(row: readonly unknown[], i: number, fallback: T): T => (i >= 0 ? (row[i] as T) : fallback);
  const out = rows.map((row): FrameCompany => {
    const cid = row[id] as string;
    const u = units.get(cid)!;
    return {
      id: cid,
      side: u.side,
      battalionId: u.battalionId,
      name: u.name,
      x: row[x] as number,
      y: row[y] as number,
      men: row[men] as number,
      status: row[status] as CompanyStatus,
      morale: opt(row, morale, 1),
      suppression: opt(row, suppression, 0),
      posture: opt<Posture>(row, posture, 'moving'),
    };
  });
  decoded.set(s, out);
  return out;
}

/** Indices of the snapshots on either side of minute (equal when at/outside the ends). */
export function surrounding(r: RunRecord, minute: number): [Snapshot, Snapshot] {
  const s = r.snapshots;
  const first = s[0]!;
  const last = s[s.length - 1]!;
  if (minute <= first.minute) return [first, first];
  if (minute >= last.minute) return [last, last];
  let i = 0;
  while (s[i + 1]!.minute <= minute) i++;
  return [s[i]!, s[i + 1]!];
}

export function frameAt(r: RunRecord, minute: number): Frame {
  const [a, b] = surrounding(r, minute);
  const ac = companiesOf(r, a);
  if (a === b) return { minute, companies: ac, barrages: a.barrages };
  const t = (minute - a.minute) / (b.minute - a.minute);
  const next = new Map(companiesOf(r, b).map((c) => [c.id, c]));
  const companies = ac.map((c) => {
    const n = next.get(c.id);
    return n ? { ...c, x: lerp(c.x, n.x, t), y: lerp(c.y, n.y, t) } : c;
  });
  const nextBarrages = new Map(b.barrages.map((x) => [x.sectorId, x]));
  const barrages = a.barrages.map((br) => {
    const nb = nextBarrages.get(br.sectorId);
    if (!nb) return br;
    // A barrage that ends between snapshots is done from the minute its barrage-done event names.
    const endedAt = r.events.find((e) => e.kind === 'barrage-done' && e.sectorId === br.sectorId)?.minute ?? b.minute;
    const done = br.done || (nb.done && minute >= endedAt);
    const points =
      nb.points.length === br.points.length
        ? br.points.map((p, i): [number, number] => [lerp(p[0], nb.points[i]![0], t), lerp(p[1], nb.points[i]![1], t)])
        : br.points;
    return { sectorId: br.sectorId, done, points };
  });
  return { minute, companies, barrages };
}
