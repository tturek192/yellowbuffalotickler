import { describe, expect, it } from 'vitest';
import { abbreviateDivision, divisionTags, liftClear, nudgeClear, objectiveLabelGroups, placeClear, splitObjectiveName, trenchLabel } from './labels';

describe('liftClear', () => {
  const box = { x0: 0, x1: 50, y0: 90, y1: 100 };
  it('keeps a label on its own row when nothing is in the way', () => {
    expect(liftClear(box, [{ x0: 60, x1: 90, y0: 90, y1: 100 }], 12, 3)).toEqual(box);
  });
  it('lifts a label a row at a time until it clears the labels already placed', () => {
    const placed = [{ x0: 40, x1: 90, y0: 90, y1: 100 }, { x0: 0, x1: 20, y0: 78, y1: 88 }];
    expect(liftClear(box, placed, 12, 3)).toEqual({ x0: 0, x1: 50, y0: 66, y1: 76 });
  });
  it('gives up at the top row', () => {
    const wall = [0, 1, 2].map((r) => ({ x0: 0, x1: 50, y0: 90 - 12 * r, y1: 100 - 12 * r }));
    expect(liftClear(box, wall, 12, 3)).toEqual({ x0: 0, x1: 50, y0: 66, y1: 76 });
  });
});

describe('label text', () => {
  it('drops the qualifier from trench names', () => {
    expect(trenchLabel('Canadian front line, last light 8 April')).toBe('Canadian front line');
    expect(trenchLabel('German front line')).toBe('German front line');
  });
  it('abbreviates division names with the fixed table', () => {
    expect(abbreviateDivision('1st Canadian Division')).toBe('1st Cdn Div');
    expect(abbreviateDivision('5th British Brigade')).toBe('5th Br Bde');
  });
  it('splits at the first comma only', () => {
    expect(splitObjectiveName('Red Line, 4th Canadian Division')).toEqual({ group: 'Red Line', suffix: '4th Canadian Division' });
    expect(splitObjectiveName('Black Line')).toEqual({ group: 'Black Line', suffix: null });
    expect(splitObjectiveName('A, B, C')).toEqual({ group: 'A', suffix: 'B, C' });
  });
});

describe('objectiveLabelGroups', () => {
  const l = (name: string, ys: number[]) => ({ name, points: ys.map((y) => [0, y] as [number, number]) });
  it('labels each group once, from its northernmost line', () => {
    const lines = [l('Red Line, 1st Canadian Division', [0, 10]), l('Red Line, 2nd Canadian Division', [20, 40]), l('Black Line, 1st Canadian Division', [5, 8])];
    const g = objectiveLabelGroups(lines);
    expect(g.map((x) => x.text)).toEqual(['Red Line', 'Black Line']);
    expect(g[0]!.anchor).toBe(lines[1]);
  });
  it('treats a comma-less name as its own group', () => {
    expect(objectiveLabelGroups([l('Objective A', [0, 1]), l('Objective B', [0, 2])]).map((x) => x.text)).toEqual(['Objective A', 'Objective B']);
  });
});

describe('divisionTags', () => {
  const l = (name: string, ys: number[]) => ({ name, points: ys.map((y) => [0, y] as [number, number]) });
  it('gives one tag per distinct suffix at the middle of its lines, none for comma-less names', () => {
    const tags = divisionTags([l('Red Line, 1st Canadian Division', [0, 10]), l('Black Line, 1st Canadian Division', [30, 40]), l('Green Line', [100, 200])]);
    expect(tags).toEqual([{ text: '1st Cdn Div', y: 20 }]);
  });
});

describe('nudgeClear', () => {
  const box = { x0: 0, x1: 50, y0: 90, y1: 100 };
  it('stays put when clear and otherwise moves the smallest distance, either way', () => {
    expect(nudgeClear(box, [], 12, 3)).toEqual(box);
    expect(nudgeClear(box, [box], 12, 3)).toEqual({ ...box, y0: 102, y1: 112 });
    expect(nudgeClear(box, [box, { ...box, y0: 102, y1: 112 }], 12, 3)).toEqual({ ...box, y0: 78, y1: 88 });
  });
});

describe('placeClear', () => {
  const box = { x0: 100, x1: 150, y0: 90, y1: 100 };
  const wall = [0, 1].map((r) => ({ x0: 90, x1: 160, y0: 90 - 12 * r, y1: 100 - 12 * r }));
  it('lifts first when lifting is enough', () => {
    expect(placeClear(box, [wall[0]!], 12, 3, 20, 4, 0, 400)).toEqual({ ...box, y0: 78, y1: 88 });
  });
  it('slides sideways, nearest first, when that is shorter than lifting past the wall', () => {
    expect(placeClear(box, wall, 12, 2, 20, 4, 0, 400)).toEqual({ x0: 160, x1: 210, y0: 90, y1: 100 });
    expect(placeClear(box, wall, 80, 2, 20, 4, 0, 400)).toEqual({ x0: 160, x1: 210, y0: 90, y1: 100 });
    expect(placeClear(box, [...wall, { x0: 160, x1: 240, y0: 90, y1: 100 }], 12, 3, 20, 6, 0, 400)).toEqual({ ...box, y0: 66, y1: 76 });
  });
  it('stays inside the sheet', () => {
    const b = placeClear(box, wall, 12, 2, 20, 4, 90, 200);
    expect(b.x0).toBeGreaterThanOrEqual(90);
    expect(b.x1).toBeLessThanOrEqual(200);
  });
});
