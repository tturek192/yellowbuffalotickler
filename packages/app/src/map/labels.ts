export type Box = { x0: number; x1: number; y0: number; y1: number };

const hits = (a: Box, b: Box): boolean => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/** Lift `box` up by `rowStep` until it clears every placed box, using at most `rows` rows (0 = where it is). */
export function liftClear(box: Box, placed: readonly Box[], rowStep: number, rows: number): Box {
  let b = box;
  for (let r = 0; r < rows; r++) {
    b = { ...box, y0: box.y0 - r * rowStep, y1: box.y1 - r * rowStep };
    if (!placed.some((p) => hits(b, p))) return b;
  }
  return b;
}
