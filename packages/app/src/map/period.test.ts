import { describe, expect, it } from 'vitest';
import type { RunRecord } from '@wwi/engine';
import { battleRecord, trenchAt } from '../battle-record';
import type { TestCompany } from '../test-record';
import { recordingContext } from '../test-canvas';
import { MAP_COLORS } from './style';
import { blockColour, blockOpen, drawCompassRose, fillArea, paperTexture, territoryFills, vignettes } from './period';

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
    expect(blockColour(unit({ side: 'allied' }))).toBe(MAP_COLORS.allied);
  });

  it('a block is open while waiting or in reserve, filled in action', () => {
    expect(blockOpen('waiting', 'allied')).toBe(true);
    expect(blockOpen('holding', 'allied')).toBe(true);
    expect(blockOpen('marching', 'central')).toBe(true);
    expect(blockOpen('advancing', 'allied')).toBe(false);
    // A German garrison holding its trench is in action.
    expect(blockOpen('holding', 'central')).toBe(false);
  });

  it('the paper texture is made once and reused; the compass rose draws its N', () => {
    const a = paperTexture();
    expect(paperTexture()).toBe(a);
    const { ctx, calls } = recordingContext();
    drawCompassRose(ctx, 100, 100, 40);
    expect(calls.some((c) => c.name === 'fillText' && c.args[0] === 'N')).toBe(true);
  });
});
