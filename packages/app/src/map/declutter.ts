export type Screen = [number, number];

/**
 * Spread markers that would overlap (closer than `width` across and `pitch` down) apart vertically so
 * stacked companies stay legible. Within each column of horizontally-overlapping markers the top-to-bottom
 * order is kept and the total squared movement is minimised (isotonic regression, pool-adjacent-violators),
 * so a stack opens symmetrically about its centre. x never changes, and no marker moves more than `maxShift`
 * pixels from its true y: when that is not enough room, markers overlap rather than leave their position.
 */
export function declutter(points: Screen[], width: number, pitch: number, maxShift: number): Screen[] {
  const out = points.map(([x, y]): Screen => [x, y]);
  for (const column of columns(points, width)) {
    const order = [...column].sort((a, b) => points[a]![1] - points[b]![1] || a - b);
    // y'_k − k·pitch must be non-decreasing; pool adjacent blocks that violate it, each at its mean.
    const blocks: Array<{ sum: number; n: number }> = [];
    order.forEach((idx, k) => {
      blocks.push({ sum: points[idx]![1] - k * pitch, n: 1 });
      while (blocks.length > 1 && blocks[blocks.length - 2]!.sum / blocks[blocks.length - 2]!.n > blocks[blocks.length - 1]!.sum / blocks[blocks.length - 1]!.n) {
        const last = blocks.pop()!;
        blocks[blocks.length - 1]!.sum += last.sum;
        blocks[blocks.length - 1]!.n += last.n;
      }
    });
    let k = 0;
    for (const b of blocks) {
      for (let t = 0; t < b.n; t++, k++) {
        const idx = order[k]!;
        const y = points[idx]![1];
        out[idx]![1] = Math.min(y + maxShift, Math.max(y - maxShift, b.sum / b.n + k * pitch));
      }
    }
  }
  return out;
}

/** Groups of indices connected by horizontal overlap (|dx| < width). */
function columns(points: Screen[], width: number): number[][] {
  const parent = points.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  const byX = points.map((_, i) => i).sort((a, b) => points[a]![0] - points[b]![0]);
  for (let s = 1; s < byX.length; s++) {
    if (points[byX[s]!]![0] - points[byX[s - 1]!]![0] < width) parent[find(byX[s]!)] = find(byX[s - 1]!);
  }
  const groups = new Map<number, number[]>();
  points.forEach((_, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), i]);
  });
  return [...groups.values()];
}
