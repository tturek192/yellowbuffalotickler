import { describe, expect, it } from 'vitest';
import { fitAffine } from './fit';

const truth = (px: [number, number]): [number, number] => [2.70 + px[0] * 1e-5, 50.40 - px[1] * 0.64e-5];
const gcps = [[0, 0], [1000, 0], [0, 1000], [1000, 1000], [500, 300]].map((p) => ({
  px: p as [number, number],
  lonLat: truth(p as [number, number]),
}));

describe('fitAffine', () => {
  it('recovers a known affine transform from 4+ GCPs, with ~0 residual', () => {
    const f = fitAffine(gcps);
    expect(f.toLonLat([250, 750])[0]).toBeCloseTo(truth([250, 750])[0], 9);
    expect(f.toLonLat([250, 750])[1]).toBeCloseTo(truth([250, 750])[1], 9);
    expect(f.rmsM).toBeLessThan(0.01);
    expect(f.residualsM).toHaveLength(5);
  });

  it('refuses fewer than 4 GCPs', () => expect(() => fitAffine(gcps.slice(0, 3))).toThrow(/at least 4/));

  it('refuses collinear GCPs', () => {
    const line = [0, 1, 2, 3].map((i) => ({ px: [i * 100, i * 100] as [number, number], lonLat: truth([i * 100, i * 100]) }));
    expect(() => fitAffine(line)).toThrow(/collinear/);
  });

  it('inverts: toPx(toLonLat(p)) is p, for a rotated and sheared map', () => {
    const rot = (px: [number, number]): [number, number] => [2.75 + px[0] * 0.9e-5 + px[1] * 0.2e-5, 50.38 + px[0] * 0.15e-5 - px[1] * 0.6e-5];
    const f = fitAffine([[10, 20], [2400, 40], [30, 1400], [2500, 1300]].map((p) => ({ px: p as [number, number], lonLat: rot(p as [number, number]) })));
    const back = f.toPx(f.toLonLat([1234, 567]));
    expect(back[0]).toBeCloseTo(1234, 6);
    expect(back[1]).toBeCloseTo(567, 6);
  });

  it('reports residuals in metres at the centroid: a GCP 0.0001° of latitude off shows about 11 m', () => {
    // Five points; one is displaced north by 1e-4° (about 11 m). The least-squares fit spreads that error,
    // so the displaced point keeps the largest residual, and the rms is a few metres.
    const off = gcps.map((g, i) => (i === 4 ? { ...g, lonLat: [g.lonLat[0], g.lonLat[1] + 1e-4] as [number, number] } : g));
    const f = fitAffine(off);
    const worst = Math.max(...f.residualsM);
    expect(f.residualsM.indexOf(worst)).toBe(4);
    expect(worst).toBeGreaterThan(5);
    expect(worst).toBeLessThan(11.1);
    expect(f.rmsM).toBeGreaterThan(1);
    expect(f.rmsM).toBeLessThan(11.1);
  });
});
