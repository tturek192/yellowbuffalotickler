import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as engine from './index';
import { CAUSES, emit } from './causes';
import { inContact } from './step';
import { PHASES, runPipeline } from './pipeline';
import { runScenario } from './run';
import { stochasticRound } from './stochastic';
import { createRng } from './rng';
import { ctxWithPhaseSpy, doctrines, draft, fixtureWithDoctrineV3, hash, initialState, shuffleCompanies } from './test-helpers';
import { initRun } from './run';

describe('the step pipeline', () => {
  it('runs the nine phases in the spec order every step', () => {
    const seen: string[] = []; const ctx = ctxWithPhaseSpy(seen);
    runPipeline(initialState(), ctx, 2);
    expect(seen).toEqual(['comms','command','behaviour','artillery','directFire','resolve','morale','movement','log']);
  });
  it('registers exactly the nine phases', () => {
    expect(PHASES.map(([name]) => name)).toEqual(['comms', 'command', 'behaviour', 'artillery', 'directFire', 'resolve', 'morale', 'movement', 'log']);
  });
  it('event ids are sequential and refs only point backwards', () => {
    const r = runScenario(...fixtureWithDoctrineV3(), { seed: 1 });
    r.events.forEach((e, i) => { expect(e.id).toBe(i); for (const ref of e.refs) expect(ref).toBeLessThan(e.id); });
  });
  it('a line-taken event refers back to the arrival that completed it', () => {
    const r = runScenario(...fixtureWithDoctrineV3(), { seed: 1 });
    const taken = r.events.find((e) => e.kind === 'line-taken')!;
    expect(taken.refs.length).toBeGreaterThan(0);
    for (const ref of taken.refs) expect(r.events[ref]!.kind).toBe('company-reached');
  });
  it('every cause in the record is in the vocabulary', () => {
    const r = runScenario(...fixtureWithDoctrineV3(), { seed: 1 });
    for (const e of r.events) for (const c of e.causes) expect(CAUSES).toContain(c);
  });
  it('shuffling the order of companies in the scenario file does not change the record', () => {
    const [s, d] = fixtureWithDoctrineV3();
    expect(hash(runScenario(shuffleCompanies(s, 7), d, { seed: 3 }))).toBe(hash(runScenario(s, d, { seed: 3 })));
  });
  it('the shuffle really reorders the file, and on the draft too the record does not change', () => {
    const [s] = fixtureWithDoctrineV3();
    const shuffled = shuffleCompanies(s, 7);
    expect(JSON.stringify(shuffled)).not.toBe(JSON.stringify(s));
    expect(shuffled.forces.map((f) => f.side)).toEqual(['central', 'allied']);
    const dr = draft();
    const drShuffled = shuffleCompanies(dr, 7);
    expect(JSON.stringify(drShuffled)).not.toBe(JSON.stringify(dr));
    expect(hash(runScenario(drShuffled, doctrines(), { seed: 3 }))).toBe(hash(runScenario(dr, doctrines(), { seed: 3 })));
  });
});

describe('events and contact', () => {
  it('emit numbers events in sequence and refuses a ref to an event not yet emitted', () => {
    const s = emit(initialState(), { minute: 1, kind: 'barrage-pause', text: 'a' }, { minute: 1, kind: 'barrage-done', text: 'b', refs: [1] });
    expect(s.events.map((e) => [e.id, e.refs])).toEqual([[0, []], [1, []], [2, [1]]]);
    expect(s.nextEventId).toBe(3);
    expect(() => emit(s, { minute: 1, kind: 'line-taken', text: 'c', refs: [3] })).toThrow(/refers to event 3/);
  });
  it('contact: an attacking company within closeRangeM of an enemy company, and only then', () => {
    const { state, ctx } = initRun(...fixtureWithDoctrineV3(), { seed: 1 });
    const at = (x: number) => ({ ...state, companies: state.companies.map((c) => (c.id === 'c1' ? { ...c, x } : c)) });
    // c1 attacks at y 100; garrison k1 holds (150, 100); closeRangeM is 50.
    expect(inContact(at(0), ctx)).toBe(false);
    expect(inContact(at(100), ctx)).toBe(true);
    expect(inContact(at(201), ctx)).toBe(false);
  });
});

describe('stochasticRound', () => {
  it('returns floor(x) or floor(x) + 1, drawing exactly one number per call', () => {
    let draws = 0;
    const rng = () => (draws++, 0.5);
    expect(stochasticRound(2.25, rng)).toBe(2);
    expect(stochasticRound(2.75, rng)).toBe(3);
    expect(stochasticRound(4, rng)).toBe(4);
    expect(draws).toBe(3);
  });
  it('is unbiased: the mean of many draws is x', () => {
    const rng = createRng(11);
    let sum = 0;
    for (let i = 0; i < 20000; i++) sum += stochasticRound(0.3, rng);
    expect(sum / 20000).toBeCloseTo(0.3, 2);
  });
});

describe('the engine package', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  it('does not export its test helpers', () => {
    expect(Object.keys(engine)).not.toContain('fixtureWithDoctrineV3');
    expect(readFileSync(`${here}/index.ts`, 'utf8')).not.toMatch(/test-helpers/);
  });
  it('imports nothing from node:* or @wwi/scenario/node outside tests and test helpers, in any directory', () => {
    const sources = (readdirSync(here, { recursive: true }) as string[])
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && !f.endsWith('test-helpers.ts'));
    expect(sources).toContain('run.ts');
    // Any quoted module specifier: `from '…'`, a bare `import '…'` and a dynamic `import('…')` alike.
    for (const f of sources) expect(readFileSync(join(here, f), 'utf8'), f).not.toMatch(/['"](node:|@wwi\/scenario\/node)/);
  });
});
