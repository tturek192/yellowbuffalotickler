import { describe, expect, it } from 'vitest';
import { layoutMarkers, shortMarkerLabel } from './markerLabels';

describe('shortMarkerLabel', () => {
  it('shortens line and division and drops "taken"', () => {
    expect(shortMarkerLabel('Red Line, 1st Canadian Division taken')).toBe('Red · 1st Cdn Div');
    expect(shortMarkerLabel('Black Line, 4th Canadian Division taken')).toBe('Black · 4th Cdn Div');
  });
  it('handles a comma-less line and leaves other text alone', () => {
    expect(shortMarkerLabel('German front line taken')).toBe('German front line');
    expect(shortMarkerLabel('Zero hour')).toBe('Zero hour');
  });
});

describe('layoutMarkers', () => {
  it('keeps the first on row 0 and stacks a neighbour that would touch', () => {
    const s = layoutMarkers([100, 110], [80, 80], 400, 3);
    expect(s.map((x) => x.row)).toEqual([0, 1]);
    expect(s[0]!.offset).toBe(-40);
  });
  it('reuses a row once there is room', () => {
    expect(layoutMarkers([100, 300], [80, 80], 400, 3).map((x) => x.row)).toEqual([0, 0]);
  });
  it('hides a label that fits in no row, and never leaves the track', () => {
    const s = layoutMarkers([10, 12, 14, 16], [60, 60, 60, 60], 300, 3);
    expect(s.map((x) => x.hidden)).toEqual([false, false, false, true]);
    expect(s[0]!.offset).toBe(-10);
    expect(layoutMarkers([295], [60], 300, 1)[0]!.offset).toBe(-55);
  });
  it('hides a label wider than the track', () => {
    expect(layoutMarkers([50], [500], 300, 3)[0]!.hidden).toBe(true);
  });
});
