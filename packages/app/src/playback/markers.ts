import type { RunRecord } from '@wwi/engine';

export type Marker = { minute: number; label: string; kind: 'zero' | 'line-taken' };

export function timelineMarkers(r: RunRecord): Marker[] {
  const out: Marker[] = [];
  for (const e of r.events) {
    if (e.kind === 'zero-hour') out.push({ minute: e.minute, label: 'Zero hour', kind: 'zero' });
    else if (e.kind === 'line-taken') out.push({ minute: e.minute, label: e.text, kind: 'line-taken' });
  }
  return out.sort((a, b) => a.minute - b.minute || (a.kind === 'zero' ? -1 : 1) - (b.kind === 'zero' ? -1 : 1));
}
