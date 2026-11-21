/** Mulberry32 seeded PRNG. Returns a function yielding floats in [0, 1). */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The subsystems that draw random numbers, each from its own stream (Task 11 carry): drawing more or fewer numbers in
 * one never moves the draws of another, so a change to communications leaves the casualties' draws where they were.
 * - `companies`: each company's start jitter and speed, at setup;
 * - `bombardment`: batteries silenced at Zero and the garrisons' losses before it;
 * - `comms`: each message's delay and whether it is lost;
 * - `gap`: the share of a trapped garrison that surrenders;
 * - `casualties`: casualties, the killed among them and officers lost (resolve);
 * - `mop-up`: men cleared from dugouts;
 * - `tanks`: whether a tank bogs at each 100 m it drives (Task 14);
 * - `gas`: the guns whose horses the bombardment's gas takes (Task 14).
 */
export const RNG_STREAMS = ['companies', 'bombardment', 'comms', 'gap', 'casualties', 'mop-up', 'tanks', 'gas'] as const;
export type RngStream = (typeof RNG_STREAMS)[number];
export type Streams = Record<RngStream, () => number>;

/** FNV-1a over the name's UTF-16 code units: a fixed 32-bit number for each stream name. */
function nameHash(name: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 0x01000193) >>> 0;
  return h >>> 0;
}

/** A 32-bit mix of the run's seed and a stream's name (murmur3's finaliser), the stream's own seed. */
function streamSeed(seed: number, name: string): number {
  let h = (seed >>> 0) ^ nameHash(name);
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** The run's streams, one per subsystem, each a Mulberry32 seeded from the run's seed and the subsystem's name. */
export function createStreams(seed: number): Streams {
  return Object.fromEntries(RNG_STREAMS.map((k) => [k, createRng(streamSeed(seed, k))])) as Streams;
}
