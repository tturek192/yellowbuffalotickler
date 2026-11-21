import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { CAUSES } from './causes';
import { CAUSE_TEXT } from './cause-text';
import { explain } from './explain';
import type { Why } from './explain';
import type { RunRecord } from './record';
import { runScenario } from './run';
import { vimy, vimyDoctrines } from './test-helpers';

/** The event kinds the engine emits for: pinned, fell back, surrendered, segment lost, line taken, counter-attack ordered, reserve arrived. */
const EXPLAINED_KINDS = ['company-pinned', 'company-fell-back', 'company-surrendered', 'segment-lost', 'line-taken', 'counter-attack-ordered', 'reserve-arrived'];

const flattenCauses = (w: Why): string[] => [...w.causes.map((c) => c.cause), ...w.because.flatMap(flattenCauses)];
const depthOf = (w: Why): number => (w.because.length === 0 ? 0 : 1 + Math.max(...w.because.map(depthOf)));
const idsOf = (w: Why): number[] => [w.event.id, ...w.because.flatMap(idsOf)];

describe('explain', () => {
  let r: RunRecord;
  beforeAll(() => {
    r = runScenario(vimy(), vimyDoctrines(), { seed: 1 });
  }, 60_000);

  it('every pinned, fallen-back, surrendered, segment-lost, line-taken, counter-attack-ordered and reserve-arrived event in a full Vimy run has a cause, and refs point backwards', () => {
    const explained = r.events.filter((e) => EXPLAINED_KINDS.includes(e.kind));
    expect(explained.length).toBeGreaterThan(0);
    for (const e of explained) {
      expect(e.causes.length, `${e.kind} #${e.id}`).toBeGreaterThan(0);
      for (const x of e.refs) expect(x).toBeLessThan(e.id);
    }
  });

  it('a pinned company traces back to the machine guns that fired and why they were manned', () => {
    const traced = r.events.filter((e) => e.kind === 'company-pinned').map((e) => flattenCauses(explain(r, { eventId: e.id })));
    expect(traced.some((c) => c.includes('mg-fire') && c.includes('barrage-moved-on'))).toBe(true);
  });

  it('every cause has plain-language text', () => {
    for (const c of CAUSES) expect(CAUSE_TEXT[c]).toMatch(/\w/);
  });

  it('follows refs to at most 6 levels and visits each event once', () => {
    for (const e of r.events) {
      const w = explain(r, { eventId: e.id });
      expect(depthOf(w)).toBeLessThanOrEqual(6);
      const ids = idsOf(w);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('a unit at a minute starts from its latest event at or before that minute', () => {
    const e = r.events.find((x) => x.kind === 'company-pinned')!;
    expect(explain(r, { unitId: e.unitId!, minute: e.minute }).event.minute).toBeLessThanOrEqual(e.minute);
    const latest = r.events.filter((x) => x.unitId === e.unitId && x.minute <= e.minute).at(-1)!;
    expect(explain(r, { unitId: e.unitId!, minute: e.minute }).event.id).toBe(latest.id);
  });

  it('throws on an unknown event or a unit with no event yet', () => {
    expect(() => explain(r, { eventId: 99999 })).toThrow(/no event/);
    expect(() => explain(r, { unitId: 'nobody', minute: 10 })).toThrow(/no event/);
  });

  it('the reader files import no engine runtime: explain.ts only CAUSE_TEXT, cause-text.ts nothing', () => {
    const imports = (f: string) => [...readFileSync(new URL(f, import.meta.url), 'utf8').matchAll(/^import (?!type )(.*) from '(.*)';$/gm)].map((m) => m[2]);
    expect(imports('./explain.ts')).toEqual(['./cause-text']);
    expect(imports('./cause-text.ts')).toEqual([]);
  });
});
