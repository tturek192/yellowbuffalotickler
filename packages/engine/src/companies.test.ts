import { describe, expect, it } from 'vitest';
import { fixtureWithDoctrine } from '@wwi/scenario/test-fixtures';
import { initCompanies } from './companies';

describe('initCompanies', () => {
  it('names the doctrine and the company when an attacking company has no attack block', () => {
    const { scenario, doctrines } = fixtureWithDoctrine();
    delete doctrines['bef-1917']!.attack;
    expect(() => initCompanies(scenario, doctrines, () => 0.5)).toThrow(/Doctrine "bef-1917" has no attack block, but company c1 attacks/);
  });
});
