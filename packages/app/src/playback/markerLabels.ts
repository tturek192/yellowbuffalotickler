import { abbreviateDivision, splitObjectiveName } from '../map/labels';

/** "Red Line, 1st Canadian Division taken" → "Red · 1st Cdn Div"; other text (Zero hour) is kept. */
export function shortMarkerLabel(text: string): string {
  const stripped = text.replace(/\s+taken$/, '');
  const { group, suffix } = splitObjectiveName(stripped);
  return suffix === null ? stripped : `${group.replace(/\s+Line$/, '')} · ${abbreviateDivision(suffix)}`;
}

export type MarkerSlot = { row: number; /** label's left edge relative to its tick, px */ offset: number; hidden: boolean };

/**
 * Give each marker (in time order) a label row and a horizontal offset so no two labels in a row touch and
 * none leaves [0, trackPx]. A label that fits in no row is hidden (its tick stays).
 * `widths[i]` is label i's width in px; `gap` the least space between neighbours in a row.
 */
export function layoutMarkers(ticks: readonly number[], widths: readonly number[], trackPx: number, rows: number, gap = 6): MarkerSlot[] {
  const ends: number[] = Array.from({ length: rows }, () => -Infinity);
  return ticks.map((tick, i) => {
    const w = widths[i]!;
    const x0 = Math.min(Math.max(tick - w / 2, 0), Math.max(trackPx - w, 0));
    if (w > trackPx) return { row: 0, offset: 0, hidden: true };
    for (let r = 0; r < rows; r++) {
      if (x0 >= ends[r]! + gap) {
        ends[r] = x0 + w;
        return { row: r, offset: x0 - tick, hidden: false };
      }
    }
    return { row: 0, offset: 0, hidden: true };
  });
}
