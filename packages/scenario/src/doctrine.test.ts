import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { DoctrineSchema } from './doctrine';
import { parseDoctrine } from './load';
import { minimalDoctrineV2 } from './test-fixtures';

const repoRoot = resolve(__dirname, '../../..');

describe('doctrine v2', () => {
  it('accepts a full doctrine', () => {
    expect(DoctrineSchema.parse(minimalDoctrineV2()).id).toBe('bef-1917');
  });
  it('a v2 doctrine needs every common key with a description', () => {
    const d = structuredClone(minimalDoctrineV2());
    delete (d.common as any).baseMorale;
    expect(() => DoctrineSchema.parse(d)).toThrow(/common\.baseMorale/);
    const e = structuredClone(minimalDoctrineV2());
    delete (e.common.baseMorale as any).description;
    expect(() => DoctrineSchema.parse(e)).toThrow(/description/);
  });
  it('attack and defence are optional but complete when present', () => {
    const d = structuredClone(minimalDoctrineV2()) as any;
    delete d.attack;
    delete d.defence;
    expect(DoctrineSchema.parse(d).attack).toBeUndefined();
    d.attack = { followDistanceM: d.common.baseMorale };
    expect(() => DoctrineSchema.parse(d)).toThrow(/attack\.ammoReserveFrac/);
  });
  it('rejects the Plan 1/2 flat shape', () => {
    const d: any = minimalDoctrineV2();
    d.followDistanceM = d.attack.followDistanceM;
    expect(() => DoctrineSchema.parse(d)).toThrow(/followDistanceM/);
  });
  it('names the weapon each company count fires, and rejects a doctrine without them', () => {
    expect(DoctrineSchema.parse(minimalDoctrineV2()).companyWeapons).toEqual({ rifle: 'rifle', lightMg: 'lewis', mg: 'vickers' });
    const d = structuredClone(minimalDoctrineV2()) as any;
    delete d.companyWeapons.lightMg;
    expect(() => DoctrineSchema.parse(d)).toThrow(/companyWeapons\.lightMg|lightMg/);
  });
  it.each(['bef-1917', 'de-1917'])('the repository doctrine %s loads and keeps its attack values', (id) => {
    const d = parseDoctrine(readFileSync(resolve(repoRoot, `doctrine/${id}.yaml`), 'utf8'));
    expect(d.attack!.followDistanceM.value).toBe(id === 'bef-1917' ? 70 : 0);
  });
});
