import type { RunRecord } from '@wwi/engine';

type Snapshot = RunRecord['snapshots'][number];
export type Frame = {
  minute: number;
  companies: Snapshot['companies'];
  barrages: Snapshot['barrages'];
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

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
  if (a === b) return { minute, companies: a.companies, barrages: a.barrages };
  const t = (minute - a.minute) / (b.minute - a.minute);
  const next = new Map(b.companies.map((c) => [c.id, c]));
  const companies = a.companies.map((c) => {
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
