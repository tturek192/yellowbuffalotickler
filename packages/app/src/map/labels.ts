export type Box = { x0: number; x1: number; y0: number; y1: number };

export const overlaps = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Lift `box` up by `rowStep` until it clears every placed box, using at most `rows` rows (0 = where it is). */
export function liftClear(box: Box, placed: readonly Box[], rowStep: number, rows: number): Box {
  let b = box;
  for (let r = 0; r < rows; r++) {
    b = { ...box, y0: box.y0 - r * rowStep, y1: box.y1 - r * rowStep };
    if (!placed.some((p) => overlaps(b, p))) return b;
  }
  return b;
}

/** "Canadian front line, last light 8 April" → "Canadian front line": the drawn trench label drops the qualifier. */
export function trenchLabel(name: string): string {
  return name.split(',')[0]!.trim();
}

const ABBREVIATIONS: Record<string, string> = { Canadian: 'Cdn', Division: 'Div', Brigade: 'Bde', British: 'Br' };

/** "1st Canadian Division" → "1st Cdn Div". */
export function abbreviateDivision(suffix: string): string {
  return suffix.split(/\s+/).map((w) => ABBREVIATIONS[w] ?? w).join(' ');
}

/** Split an objective line's name at its first comma: "Red Line, 4th Canadian Division" → Red Line / 4th Canadian Division. */
export function splitObjectiveName(name: string): { group: string; suffix: string | null } {
  const i = name.indexOf(',');
  if (i < 0) return { group: name.trim(), suffix: null };
  const suffix = name.slice(i + 1).trim();
  return { group: name.slice(0, i).trim(), suffix: suffix === '' ? null : suffix };
}

type LabelLine = { name: string; points: readonly (readonly [number, number])[] };

const topY = (l: LabelLine): number => Math.max(...l.points.map((p) => p[1]));

/** One label per objective-line group: the group's short name and the line (its northernmost) the label hangs from. */
export function objectiveLabelGroups<T extends LabelLine>(lines: readonly T[]): { text: string; anchor: T }[] {
  const groups = new Map<string, T>();
  for (const l of lines) {
    const { group } = splitObjectiveName(l.name);
    const best = groups.get(group);
    if (!best || topY(l) > topY(best)) groups.set(group, l);
  }
  return [...groups].map(([text, anchor]) => ({ text, anchor }));
}

/** One sector tag per distinct division suffix: the abbreviated text and the world y of the middle of its lines. */
export function divisionTags(lines: readonly LabelLine[]): { text: string; y: number }[] {
  const ys = new Map<string, number[]>();
  for (const l of lines) {
    const { suffix } = splitObjectiveName(l.name);
    if (suffix === null) continue;
    const a = ys.get(suffix) ?? [];
    a.push(...l.points.map((p) => p[1]));
    ys.set(suffix, a);
  }
  return [...ys].map(([suffix, v]) => ({ text: abbreviateDivision(suffix), y: (Math.min(...v) + Math.max(...v)) / 2 }));
}

/** Move `box` up and down by growing multiples of `step` (0, +1, -1, +2, -2 …, at most `tries` each way) to the first spot clear of `placed`; the original if none is. */
export function nudgeClear(box: Box, placed: readonly Box[], step: number, tries: number): Box {
  for (let k = 0; k <= tries; k++) {
    for (const sign of k === 0 ? [0] : [1, -1]) {
      const d = sign * k * step;
      const b = { ...box, y0: box.y0 + d, y1: box.y1 + d };
      if (!placed.some((p) => overlaps(b, p))) return b;
    }
  }
  return box;
}

/**
 * Place `box` clear of `placed` at the nearest free spot: lifted up to `rows` rows of `rowStep` and/or slid
 * sideways up to `cols` steps of `colStep` either way (kept within [minX, maxX] and below minY); cost is the pixels moved, so a lift
 * beats a slide that is longer than it. Gives up with the plain lifted box when nothing is clear.
 */
export function placeClear(box: Box, placed: readonly Box[], rowStep: number, rows: number, colStep: number, cols: number, minX: number, maxX: number, minY = -Infinity): Box {
  let best: Box | null = null;
  let bestCost = Infinity;
  for (let r = 0; r < rows; r++) {
    for (let k = 0; k <= cols; k++) {
      for (const sign of k === 0 ? [0] : [1, -1]) {
        const dx = sign * k * colStep;
        const cost = r * rowStep + Math.abs(dx);
        if (cost >= bestCost) continue;
        const b = { x0: box.x0 + dx, x1: box.x1 + dx, y0: box.y0 - r * rowStep, y1: box.y1 - r * rowStep };
        if (b.x0 < minX || b.x1 > maxX || b.y0 < minY || placed.some((p) => overlaps(b, p))) continue;
        best = b;
        bestCost = cost;
      }
    }
  }
  return best ?? liftClear(box, placed, rowStep, rows);
}
