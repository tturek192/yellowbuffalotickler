import { describe, expect, it } from 'vitest';
import { markerLook, moraleAlpha, pulseRing, strengthRatio } from './unitMarkers';

describe('marker states', () => {
  it('maps each status to its look', () => {
    expect(markerLook('advancing')).toBe('solid');
    expect(markerLook('holding')).toBe('solid');
    expect(markerLook('consolidating')).toBe('solid');
    expect(markerLook('pinned')).toBe('hatched');
    expect(markerLook('falling-back')).toBe('falling-back');
    expect(markerLook('surrendered')).toBe('surrendered');
    expect(markerLook('destroyed')).toBe('destroyed');
  });
  it('fades the fill as morale falls, never to invisible', () => {
    expect(moraleAlpha(1)).toBe(1);
    expect(moraleAlpha(0)).toBeGreaterThan(0.4);
    expect(moraleAlpha(0.5)).toBeLessThan(1);
    expect(moraleAlpha(-3)).toBe(moraleAlpha(0));
    expect(moraleAlpha(9)).toBe(1);
  });
  it('measures strength as a fraction of the strength at Zero, clamped', () => {
    expect(strengthRatio(50, 200)).toBe(0.25);
    expect(strengthRatio(300, 200)).toBe(1);
    expect(strengthRatio(10, 0)).toBe(0);
  });
});

describe('suppression ring (a pure function of suppression and phase)', () => {
  it('is absent for an unsuppressed marker', () => {
    expect(pulseRing(0, 0.3)).toBeNull();
    expect(pulseRing(0.02, 0.3)).toBeNull();
  });
  it('grows from the marker out as the phase runs, fading as it goes', () => {
    const a = pulseRing(0.5, 0.1)!;
    const b = pulseRing(0.5, 0.9)!;
    expect(b.radius).toBeGreaterThan(a.radius);
    expect(b.alpha).toBeLessThan(a.alpha);
  });
  it('is stronger and wider for heavier suppression', () => {
    const light = pulseRing(0.2, 0.5)!;
    const heavy = pulseRing(0.8, 0.5)!;
    expect(heavy.alpha).toBeGreaterThan(light.alpha);
    expect(heavy.radius).toBeGreaterThan(light.radius);
  });
  it('is the same for the same inputs and repeats each cycle', () => {
    expect(pulseRing(0.6, 0.25)).toEqual(pulseRing(0.6, 0.25));
    expect(pulseRing(0.6, 1.25)).toEqual(pulseRing(0.6, 0.25));
  });
});
