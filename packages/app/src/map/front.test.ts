import { describe, expect, it } from 'vitest';
import { battleRecord, trenchAt } from '../battle-record';
import type { TestCompany } from '../test-record';
import { FRONT_BIN_M, FRONT_BREAK_M, frontAt } from './front';

const co = (id: string, side: TestCompany['side'], x: number, y: number, extra: Partial<TestCompany> = {}): TestCompany => ({ id, side, x, y, men: 100, status: 'holding', ...extra });

/**
 * Two German trenches (x 500 and 800, y 0–800). At Zero the Canadians stand at x 300 and the German front trench is
 * held; by minute 60 the front trench is lost, the Canadians are in it and the Germans are back in the second.
 */
function recordWithLoss() {
  const allied = (x: number) => [co('1a', 'allied', x, 200), co('1b', 'allied', x, 600)];
  return battleRecord({
    features: [trenchAt('front', 500), trenchAt('second', 800)],
    snapshots: [
      { minute: 0, companies: [...allied(300), co('g1', 'central', 500, 400), co('g2', 'central', 800, 400)], segments: [['central'], ['central']] },
      { minute: 60, companies: [...allied(500), co('g1', 'central', 800, 300), co('g2', 'central', 800, 500)], segments: [['allied'], ['central']] },
    ],
  });
}

/** The x of a front polyline at a y (its point in the bin holding y). */
const xAt = (line: Array<[number, number]>[], y: number): number | undefined => line.flat().find((p) => Math.abs(p[1] - y) <= FRONT_BIN_M / 2)?.[0];

describe('the front (frontAt)', () => {
  it('the front follows segment holders: a lost segment moves the German front line back', () => {
    expect(frontAt(recordWithLoss(), 60)).not.toEqual(frontAt(recordWithLoss(), 0));
    const r = recordWithLoss();
    expect(xAt(frontAt(r, 0).central, 400)).toBe(500);
    expect(xAt(frontAt(r, 60).central, 400)).toBe(800);
  });

  it('the allied front is its forward edge: held segments and living companies on the map', () => {
    const r = recordWithLoss();
    expect(xAt(frontAt(r, 0).allied, 200)).toBe(300);
    expect(xAt(frontAt(r, 60).allied, 400)).toBe(500);
  });

  it('dead, surrendered and off-map companies do not hold the front', () => {
    const r = battleRecord({
      features: [trenchAt('front', 500)],
      snapshots: [
        { minute: 0, companies: [co('1a', 'allied', 300, 400), co('1b', 'allied', 450, 400, { status: 'surrendered', men: 0 }), co('1c', 'allied', 460, 400, { status: 'off-map' }), co('1d', 'allied', 470, 400, { status: 'destroyed', men: 0 })] },
      ],
    });
    expect(xAt(frontAt(r, 0).allied, 400)).toBe(300);
  });

  it('captured ground: between the captor\'s front at Zero and its current front, only where it moved forward', () => {
    const r = recordWithLoss();
    expect(frontAt(r, 0).captured).toEqual([]);
    const cap = frontAt(r, 60).captured;
    expect(cap.length).toBeGreaterThan(0);
    expect(cap.every((c) => c.side === 'allied')).toBe(true);
    const xs = cap.flatMap((c) => c.polygon.map((p) => p[0]));
    // From the Canadians' forward edge at Zero (300) to their new one in the German front trench (500).
    expect(Math.min(...xs)).toBe(300);
    expect(Math.max(...xs)).toBe(500);
  });

  it('a deep advance fills the ground from the old allied front to the new one, and a retreat fills none', () => {
    const r = battleRecord({
      features: [trenchAt('front', 500), trenchAt('second', 800)],
      snapshots: [
        { minute: 0, companies: [co('1a', 'allied', 300, 400), co('g', 'central', 900, 400)], segments: [['central'], ['central']] },
        { minute: 30, companies: [co('1a', 'allied', 850, 400), co('g', 'central', 900, 400)], segments: [['allied'], ['allied']] },
      ],
    });
    const xs = frontAt(r, 30).captured.flatMap((c) => c.polygon.map((p) => p[0]));
    expect(Math.min(...xs)).toBe(300);
    expect(Math.max(...xs)).toBe(850);
    expect(frontAt(r, 30).captured.every((c) => c.side === 'allied')).toBe(true);
  });

  it('one bin held only from far behind makes no spike in the line; a column on the march holds no front', () => {
    const ys = [50, 150, 250, 450, 550, 650, 750];
    const r = battleRecord({
      features: [],
      snapshots: [
        {
          minute: 0,
          companies: [
            ...ys.map((y, i) => co(`g${i}`, 'central', 500, y)),
            co('far', 'central', 3000, 350),
            co('col', 'allied', 900, 450, { status: 'marching' }),
            co('1a', 'allied', 300, 450),
          ],
        },
      ],
    });
    expect(xAt(frontAt(r, 0).central, 350)).toBe(500);
    expect(xAt(frontAt(r, 0).allied, 450)).toBe(300);
  });

  it('a deep gap breaks the line: no piece runs further than FRONT_BREAK_M between neighbouring bins', () => {
    // Germans hold the ridge (x 500) to the north and south; in the middle 300 m only a reserve far back (x 4000) is left.
    const r = battleRecord({
      features: [],
      snapshots: [
        {
          minute: 0,
          companies: [co('n1', 'central', 500, 50), co('n2', 'central', 500, 100), co('s1', 'central', 500, 750), co('s2', 'central', 500, 790), co('far', 'central', 4000, 400)],
        },
      ],
    });
    const pieces = frontAt(r, 0).central;
    expect(pieces.length).toBeGreaterThan(1);
    for (const p of pieces) for (let i = 1; i < p.length; i++) expect(Math.abs(p[i]![0] - p[i - 1]![0])).toBeLessThanOrEqual(FRONT_BREAK_M);
    // The reserve's stretch is still drawn, as its own piece.
    expect(pieces.some((p) => p.every(([x]) => x === 4000))).toBe(true);
  });

  it('is pure and cached by minute: the same minute gives the same front object', () => {
    const r = recordWithLoss();
    expect(frontAt(r, 30.2)).toBe(frontAt(r, 30.7));
  });

  it('a record without segments still has a front from its companies', () => {
    const r = recordWithLoss();
    const bare = { ...r, geometry: { ...r.geometry, segments: undefined } } as unknown as typeof r;
    expect(xAt(frontAt(bare, 0).central, 400)).toBe(500);
  });
});
