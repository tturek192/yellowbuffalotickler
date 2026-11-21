import { describe, it, expect } from 'vitest';
import { createRng, createStreams, RNG_STREAMS } from './rng';
import { initRun } from './run';
import { fixtureComms } from './test-helpers';

describe('createRng', () => {
  it('same seed gives the same sequence; different seeds differ', () => {
    const a = createRng(42), b = createRng(42), c = createRng(43);
    const sa = [a(), a(), a()], sb = [b(), b(), b()];
    expect(sa).toEqual(sb);
    expect(c()).not.toBe(sa[0]);
    sa.forEach(x => {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    });
  });
});

describe('rng streams (one per subsystem)', () => {
  it('each subsystem draws from its own stream, derived from the seed: same seed same streams, streams differ', () => {
    const a = createStreams(7);
    const b = createStreams(7);
    for (const k of RNG_STREAMS) expect([a[k](), a[k]()]).toEqual([b[k](), b[k]()]);
    const firsts = RNG_STREAMS.map((k) => createStreams(7)[k]());
    expect(new Set(firsts).size).toBe(RNG_STREAMS.length);
    expect(createStreams(8).casualties()).not.toBe(createStreams(7).casualties());
  });

  it('drawing more from one stream leaves every other stream as it was', () => {
    const a = createStreams(3);
    const b = createStreams(3);
    for (let i = 0; i < 50; i++) a.comms();
    for (const k of RNG_STREAMS) if (k !== 'comms') expect(a[k]()).toBe(b[k]());
  });

  it("a run's context holds one stream per subsystem and no shared one", () => {
    const [s, m] = fixtureComms();
    const { ctx } = initRun(s, m, { seed: 5 });
    expect(Object.keys(ctx.rngs).sort()).toEqual([...RNG_STREAMS].sort());
    expect('rng' in ctx).toBe(false);
  });
});
