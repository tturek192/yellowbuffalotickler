import { describe, expect, it } from 'vitest';
import type { RunRecord } from '@wwi/engine';
import { battleRecord, trenchAt } from '../battle-record';
import type { TestCompany } from '../test-record';
import { recordingContext } from '../test-canvas';
import { MAP_COLORS } from './style';
import { readFileSync } from 'node:fs';
import { blockColour, blockOpen, clearOfMarkers, committedAt, deltaE, drawCompassRose, fillArea, MIN_BLOCK_DELTA_E, paperTexture, placeVignettes, territoryFills, vignettes } from './period';

const co = (id: string, side: TestCompany['side'], x: number, y: number, extra: Partial<TestCompany> = {}): TestCompany => ({ id, side, x, y, men: 100, status: 'holding', ...extra });

/** As front.test.ts: by minute 60 the German front trench (x 500) is lost and the Germans are back in the second (x 800). */
function recordWithLoss(extra: Partial<RunRecord> = {}): RunRecord {
  const allied = (x: number) => [co('1a', 'allied', x, 200), co('1b', 'allied', x, 600)];
  return battleRecord({
    features: [trenchAt('front', 500), trenchAt('second', 800), trenchAt('rear', 1200)],
    snapshots: [
      { minute: 0, companies: [...allied(300), co('g1', 'central', 500, 400), co('g2', 'central', 800, 400)], segments: [['central'], ['central'], ['central']] },
      { minute: 60, companies: [...allied(500), co('g1', 'central', 800, 300), co('g2', 'central', 800, 500)], segments: [['allied'], ['central'], ['central']] },
    ],
    extra,
  });
}

const recordWithNoTanksOrBalloons = (): RunRecord => recordWithLoss();

type Unit = RunRecord['units'][number];
const unit = (u: Partial<Unit>): Unit => ({ id: 'u', battalionId: 'bn', name: 'u', side: 'allied', ...u });

describe('the period map style (period.ts)', () => {
  it('territory fills follow the front: a lost segment moves the defender fill back', () => {
    expect(fillArea(recordWithLoss(), 60, 'central')).toBeLessThan(fillArea(recordWithLoss(), 0, 'central'));
  });

  it("and the attacker's fill grows as it takes ground; each side's fill runs from its front to the sheet's edge", () => {
    const r = recordWithLoss();
    expect(fillArea(r, 60, 'allied')).toBeGreaterThan(fillArea(r, 0, 'allied'));
    const fills = territoryFills(r, 0);
    const allied = fills.filter((f) => f.side === 'allied').flatMap((f) => f.polygon.map((p) => p[0]));
    const central = fills.filter((f) => f.side === 'central').flatMap((f) => f.polygon.map((p) => p[0]));
    expect(Math.max(...allied)).toBe(300);
    expect(Math.min(...central)).toBe(500);
    // The defender's wash reaches the eastern edge of what the map shows, the attacker's the western.
    expect(Math.max(...central)).toBeGreaterThanOrEqual(1200);
    expect(Math.min(...allied)).toBeLessThanOrEqual(300);
  });

  it('every vignette is anchored to a run or scenario thing; none are drawn without one', () => {
    expect(vignettes(recordWithNoTanksOrBalloons(), 30).filter((v) => v.kind === 'tank' || v.kind === 'balloon')).toEqual([]);
    expect(vignettes(recordWithNoTanksOrBalloons(), 30)).toEqual([]);
  });

  it('a tank is drawn where the record puts it, bogged once it bogs', () => {
    const r = recordWithLoss();
    r.snapshots[0]!.tanks = { columns: ['id', 'x', 'y', 'status'], rows: [['t1', 100, 400, 'moving']] };
    r.snapshots[1]!.tanks = { columns: ['id', 'x', 'y', 'status'], rows: [['t1', 300, 400, 'bogged']] };
    const at = (m: number) => vignettes(r, m).filter((v) => v.kind === 'tank');
    expect(at(0)).toMatchObject([{ kind: 'tank', x: 100, y: 400, bogged: false }]);
    expect(at(30)[0]!.x).toBe(200);
    expect(at(60)).toMatchObject([{ kind: 'tank', x: 300, y: 400, bogged: true }]);
  });

  it('a balloon only at a balloon feature; a gun at each battery position (one per place); an aircraft only while a contact patrol is in flight', () => {
    const cite = { value: 'x', source: 's' };
    const r = recordWithLoss({ contactPatrols: [{ fromId: 'bn', side: 'allied', sentMin: 20, dueMin: 40 }] });
    r.geometry.features.push({ id: 'b1', kind: 'balloon', geometry: { type: 'Point', coordinates: [-500, 400] }, cite } as never);
    r.geometry.batteries = [
      { id: 'a1', side: 'allied', weapon: '18pdr', count: 300, at: [-1000, 300] },
      { id: 'a2', side: 'allied', weapon: '4.5in-how', count: 100, at: [-1000, 300] },
      { id: 'g1', side: 'central', weapon: '77mm-fk', count: 20, at: [1500, 300] },
    ];
    const kinds = (m: number) => vignettes(r, m).map((v) => v.kind).sort();
    expect(kinds(10)).toEqual(['balloon', 'gun', 'gun']);
    expect(kinds(30)).toEqual(['aircraft', 'balloon', 'gun', 'gun']);
    expect(kinds(40)).toEqual(['balloon', 'gun', 'gun']);
    // The patrol flies over the battalion that sent it.
    const plane = vignettes(r, 30).find((v) => v.kind === 'aircraft')!;
    expect(plane.x).toBe(400);
    expect(vignettes(r, 10).find((v) => v.kind === 'gun' && v.side === 'allied')).toMatchObject({ x: -1000, y: 300, label: '18-pounders' });
  });

  it('battalion blocks use their division insignia colour, falling back to the side colour', () => {
    expect(blockColour(unit({ insignia: '#3f7a3a' }))).toBe('#3f7a3a');
    expect(blockColour(unit({ side: 'central' }))).toBe(MAP_COLORS.german);
    // An allied formation that wore no patch is drawn in a neutral khaki, never a patch colour (the 2nd Division's blue).
    expect(blockColour(unit({ side: 'allied' }))).toBe(MAP_COLORS.alliedUnpatched);
  });

  it('every pair of block colours in use is told apart: at least MIN_BLOCK_DELTA_E (CIE76) between them', () => {
    const yaml = readFileSync(new URL('../../../../scenarios/vimy-1917/oob-canadian.yaml', import.meta.url), 'utf8');
    const patches = [...yaml.matchAll(/colour: \{ value: "(#[0-9a-f]{6})"/g)].map((m) => m[1]!);
    expect(patches.length).toBe(4);
    const colours = [...patches, MAP_COLORS.alliedUnpatched, MAP_COLORS.german];
    const close: string[] = [];
    for (let i = 0; i < colours.length; i++)
      for (let j = i + 1; j < colours.length; j++) if (deltaE(colours[i]!, colours[j]!) < MIN_BLOCK_DELTA_E) close.push(`${colours[i]} ~ ${colours[j]}`);
    expect(close).toEqual([]);
    expect(MIN_BLOCK_DELTA_E).toBeGreaterThanOrEqual(20);
  });

  it('a block is open while waiting, marching, or an uncommitted reserve; filled in action and once committed', () => {
    expect(blockOpen('waiting', 'assault', false)).toBe(true);
    expect(blockOpen('marching', 'reserve', false)).toBe(true);
    expect(blockOpen('holding', 'reserve', false)).toBe(true);
    // A company that took its objective and holds it is in action, not in reserve.
    expect(blockOpen('holding', 'assault', true)).toBe(false);
    expect(blockOpen('holding', 'assault', false)).toBe(false);
    // A reserve that went forward and now holds a trench is committed.
    expect(blockOpen('holding', 'reserve', true)).toBe(false);
    expect(blockOpen('advancing', 'assault', true)).toBe(false);
    // A German garrison holding its trench is in action.
    expect(blockOpen('holding', 'garrison', false)).toBe(false);
  });

  it('a company is committed from the first snapshot it is in action (advancing, fighting, falling back, …)', () => {
    const r = battleRecord({
      features: [],
      snapshots: [
        { minute: 0, companies: [co('r', 'allied', 0, 0), co('a', 'allied', 0, 100, { status: 'waiting' })] },
        { minute: 30, companies: [co('r', 'allied', 0, 0), co('a', 'allied', 50, 100, { status: 'advancing' })] },
        { minute: 60, companies: [co('r', 'allied', 100, 0, { status: 'advancing' }), co('a', 'allied', 300, 100)] },
        { minute: 90, companies: [co('r', 'allied', 300, 0), co('a', 'allied', 300, 100)] },
      ],
    });
    expect(committedAt(r, 'r', 30)).toBe(false);
    expect(committedAt(r, 'r', 60)).toBe(true);
    expect(committedAt(r, 'r', 90)).toBe(true);
    expect(committedAt(r, 'a', 0)).toBe(false);
    expect(committedAt(r, 'a', 90)).toBe(true);
  });

  it('the wash runs on across a break in the front and out to the ends of the map, carrying the last edge', () => {
    const r = battleRecord({
      features: [trenchAt('rear', 1500, -500, 1300)],
      snapshots: [
        {
          minute: 0,
          // German companies at the two ends of the sector, nobody between (a break far wider than the bins bridged).
          companies: [co('g1', 'central', 500, 50), co('g2', 'central', 500, 750), co('a', 'allied', 200, 400)],
          segments: [['allied']],
        },
      ],
    });
    const central = territoryFills(r, 0).filter((f) => f.side === 'central');
    expect(central.length).toBe(1);
    const ys = central[0]!.polygon.map((p) => p[1]);
    expect(Math.min(...ys)).toBeLessThanOrEqual(-500);
    expect(Math.max(...ys)).toBeGreaterThanOrEqual(1300);
  });

  it('like vignettes close on the sheet are drawn as one, named with their number', () => {
    const view = { scale: 0.01, tx: 0, ty: 0 };
    const tanks = [0, 1, 2].map((i) => ({ kind: 'tank' as const, side: 'allied' as const, x: i * 100, y: 0, label: i === 0 ? 'tank, bogged' : 'tank', bogged: i === 0 }));
    const placed = placeVignettes(view, tanks);
    expect(placed).toHaveLength(1);
    expect(placed[0]).toMatchObject({ kind: 'tank', label: '3 tanks, 1 bogged', bogged: false });
    expect(placeVignettes({ scale: 1, tx: 0, ty: 0 }, tanks)).toHaveLength(3);
    const guns = placeVignettes(view, [
      { kind: 'gun', side: 'allied', x: 0, y: 0, label: '18-pounders' },
      { kind: 'gun', side: 'allied', x: 50, y: 0, label: '6-inch howitzers' },
    ]);
    expect(guns.map((g) => g.label)).toEqual(['18-pounders, 6-inch howitzers']);
  });

  it('a vignette under a marker is moved clear of it, keeping its true place as an anchor; one in the clear stays put', () => {
    const marker = { x0: 90, x1: 110, y0: 95, y1: 105 };
    const [moved, kept] = clearOfMarkers(
      [
        { kind: 'tank', at: [100, 100], label: 'tank', bogged: false },
        { kind: 'tank', at: [400, 100], label: 'tank', bogged: false },
      ],
      [marker],
      800,
    );
    expect(moved!.anchor).toEqual([100, 100]);
    expect(moved!.at).not.toEqual([100, 100]);
    expect(kept!.anchor).toBeUndefined();
    expect(kept!.at).toEqual([400, 100]);
  });

  it('the paper texture is made once and reused; the compass rose draws its N', () => {
    const a = paperTexture();
    expect(paperTexture()).toBe(a);
    const { ctx, calls } = recordingContext();
    drawCompassRose(ctx, 100, 100, 40);
    expect(calls.some((c) => c.name === 'fillText' && c.args[0] === 'N')).toBe(true);
  });
});
