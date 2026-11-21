/**
 * Round x to an integer without bias: floor(x), plus 1 with probability x − floor(x). Each call draws
 * exactly one number from rng, whatever x is, so the draw order never depends on the values.
 */
export function stochasticRound(x: number, rng: () => number): number {
  const lo = Math.floor(x);
  return rng() < x - lo ? lo + 1 : lo;
}
