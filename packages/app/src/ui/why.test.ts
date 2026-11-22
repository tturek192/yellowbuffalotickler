import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAUSE_TEXT, explain } from '@wwi/engine/reader';
import type { SimEvent } from '@wwi/engine';
import { frameAt } from '../playback';
import { drawFrame } from '../map/draw';
import { worldToScreen, type View } from '../map/projection';
import { battleRecord, trenchAt } from '../battle-record';
import { recordingContext } from '../test-canvas';
import type { TestCompany } from '../test-record';
import { pickAt, whyRefFor, whyRows } from './why';
import { WhyPanel } from './WhyPanel';

const co = (id: string, side: TestCompany['side'], x: number, y: number, extra: Partial<TestCompany> = {}): TestCompany => ({ id, side, x, y, men: 100, status: 'holding', ...extra });

/** 16A is pinned at minute 20 by the machine guns g1 opened at minute 12; 16B, of the same battalion, reached a line at 30. */
function pinned() {
  const companies = [co('16bn-a', 'allied', 300, 200, { status: 'pinned', battalionId: '16bn' }), co('16bn-b', 'allied', 300, 600, { battalionId: '16bn' }), co('g1', 'central', 500, 200)];
  const events: Array<Partial<SimEvent> & Pick<SimEvent, 'kind' | 'minute'>> = [
    { kind: 'zero-hour', minute: 0 },
    { kind: 'fire-opened', minute: 12, unitId: 'g1', causes: ['mg-fire'], text: 'The machine guns of g1 open fire on 16th Bn, Company A' },
    { kind: 'company-pinned', minute: 20, unitId: '16bn-a', causes: ['mg-fire', 'officers-lost'], refs: [1], text: '16th Bn, Company A is pinned down' },
    { kind: 'company-reached', minute: 30, unitId: '16bn-b', causes: ['timetable'], refs: [1], text: '16th Bn, Company B reaches the Black Line' },
  ];
  return battleRecord({ features: [trenchAt('front', 500)], snapshots: [{ minute: 0, companies }, { minute: 40, companies }], events });
}

describe('the why panel', () => {
  it('clicking a pinned company opens its why chain', () => {
    const r = pinned();
    // Zoomed in to companies (1 km is 1000 px).
    const view: View = { scale: 1, tx: 0, ty: 800 };
    const { ctx } = recordingContext(1000, 800);
    const hits = drawFrame(ctx, view, r, frameAt(r, 25), { settled: true });
    const pick = pickAt(hits, worldToScreen(view, [300, 200]));
    expect(pick).toEqual({ kind: 'company', id: '16bn-a' });
    const ref = whyRefFor(r, pick!, 25);
    expect(ref).toEqual({ unitId: '16bn-a', minute: 25 });
    const html = renderToStaticMarkup(createElement(WhyPanel, { why: explain(r, ref!), title: '16th Bn, Company A', timeOf: (m: number) => `+${m}`, onSeek: () => {}, onClose: () => {} }));
    expect(html).toContain('16th Bn, Company A is pinned down');
    expect(html).toContain(CAUSE_TEXT['mg-fire']);
    expect(html).toContain(CAUSE_TEXT['officers-lost']);
    // The step before it: the machine guns opening fire, a button that jumps there.
    expect(html).toContain('The machine guns of g1 open fire');
    expect(html).toMatch(/<button[^>]*data-minute="12"/);
  });

  it('nothing under the pointer picks nothing; a battalion marker explains its latest company event at the playhead', () => {
    const r = pinned();
    expect(pickAt([], [10, 10])).toBeNull();
    expect(whyRefFor(r, { kind: 'battalion', id: '16bn' }, 25)).toEqual({ eventId: 2 });
    expect(whyRefFor(r, { kind: 'battalion', id: '16bn' }, 35)).toEqual({ eventId: 3 });
    expect(whyRefFor(r, { kind: 'battalion', id: '16bn' }, 5)).toBeNull();
    expect(whyRefFor(r, { kind: 'company', id: '16bn-b' }, 5)).toBeNull();
    expect(whyRefFor(r, { kind: 'event', id: 3 }, 0)).toEqual({ eventId: 3 });
  });

  it('battalion markers at corps zoom are hit too', () => {
    const r = pinned();
    const view: View = { scale: 0.1, tx: 50, ty: 100 };
    const { ctx } = recordingContext(200, 150);
    const hits = drawFrame(ctx, view, r, frameAt(r, 25), { settled: true });
    const bn = hits.find((h) => h.pick.kind === 'battalion' && h.pick.id === '16bn')!;
    expect(bn).toBeDefined();
    expect(pickAt(hits, [(bn.box.x0 + bn.box.x1) / 2, (bn.box.y0 + bn.box.y1) / 2])).toEqual({ kind: 'battalion', id: '16bn' });
  });

  it('rows: each step once, with its depth, and a note for a ref already shown above', () => {
    const r = pinned();
    // 3 refs 1; ask about an event whose refs include one already listed elsewhere in the chain.
    const withShared = { ...r, events: [...r.events, { id: 4, minute: 35, kind: 'company-fell-back', unitId: '16bn-a', text: 'falls back', causes: ['morale-broke'], refs: [1, 2] } as SimEvent] };
    const rows = whyRows(explain(withShared, { eventId: 4 }));
    expect(rows.map((x) => [x.event.id, x.depth])).toEqual([
      [4, 0],
      [1, 1],
      [2, 1],
    ]);
    // Event 2 refers to 1, already shown above it.
    expect(rows[2]!.seeAbove.map((e) => e.id)).toEqual([1]);
    const html = renderToStaticMarkup(createElement(WhyPanel, { why: explain(withShared, { eventId: 4 }), title: 'x', timeOf: String, onSeek: () => {}, onClose: () => {} }));
    expect(html).toContain('see above');
  });

  it('the app imports the engine at runtime only through @wwi/engine/reader', () => {
    const root = fileURLToPath(new URL('..', import.meta.url));
    const files = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : /\.tsx?$/.test(f) && !/\.test\.ts$/.test(f) ? [join(dir, f)] : []));
    const bad = files(root).flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/^import (?!type )[^;]* from '(@wwi\/engine[^']*)';$/gm)].filter((m) => m[1] !== '@wwi/engine/reader').map((m) => `${f}: ${m[1]}`),
    );
    expect(bad).toEqual([]);
  });
});
