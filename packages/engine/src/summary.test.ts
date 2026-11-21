import { describe, expect, it } from 'vitest';
import { est } from '@wwi/scenario/test-fixtures';
import { runScenario } from './run';
import { fixtureCrush, fixtureWithDoctrineV3, snapshotsOf } from './test-helpers';

describe('the run summary (Task 15)', () => {
  it('casualties by period, side and formation, each formation the sum of the companies under it', () => {
    const r = runScenario(...fixtureCrush(), { seed: 2, endMinute: 90 });
    const last = snapshotsOf(r).at(-1)!.companies;
    const col = (n: string) => last.columns.indexOf(n as never);
    for (const side of ['allied', 'central'] as const) {
      const b = r.summary.casualties.battle[side];
      const p = r.summary.casualties.bombardment[side];
      const units = r.units.filter((u) => u.side === side);
      const lost = units.reduce((a, u) => {
        const row = last.rows.find((x) => x[0] === u.id)!;
        return a + (row[col('killed')] as number) + (row[col('wounded')] as number) + (row[col('captured')] as number);
      }, 0);
      expect(b.total + p.total).toBe(lost);
      expect(b.total).toBe(b.killed + b.wounded + b.captured);
      for (const [fid, t] of Object.entries(b.formations)) {
        const under = units.filter((u) => u.formationPath!.includes(fid)).map((u) => u.id);
        const sum = under.reduce((a, id) => {
          const row = last.rows.find((x) => x[0] === id)!;
          return a + (row[col('killed')] as number) + (row[col('wounded')] as number) + (row[col('captured')] as number);
        }, 0);
        expect(t.total + (p.formations[fid]?.total ?? 0)).toBe(sum);
      }
    }
    expect(r.summary.casualties.battle.allied.total + r.summary.casualties.battle.central.total).toBeGreaterThan(0);
  });

  it('prisoners are the other side\'s captured; the end, its reason and the winner are set', () => {
    const r = runScenario(...fixtureWithDoctrineV3(), { seed: 1 });
    expect(r.summary.prisoners.allied).toBe(r.summary.casualties.battle.central.captured);
    expect(r.summary.prisoners.central).toBe(r.summary.casualties.battle.allied.captured);
    expect(r.summary.endedAt).toBe(r.endMinute);
    expect(['objectives-held', 'lull', 'time-cap']).toContain(r.summary.endReason);
  });

  it('nothing in the run reads historical targets: a run is the same whatever they say', () => {
    const [a, m] = fixtureWithDoctrineV3();
    const [b] = fixtureWithDoctrineV3();
    b.historical.casualties = [{ side: 'allied', window: { from: '1916-07-01T07:30', to: '1916-07-01T23:59' }, total: est(9999) }];
    b.historical.prisonersTaken = [{ bySide: 'allied', window: { from: '1916-07-01T07:30', to: '1916-07-01T23:59' }, count: est(77) }];
    b.historical.gunsCaptured = { window: { from: '1916-07-01T07:30', to: '1916-07-01T23:59' }, field: est(3) };
    b.historical.winner = { value: 'central', estimate: 'test' } as never;
    expect(JSON.stringify(runScenario(b, m, { seed: 4 }))).toBe(JSON.stringify(runScenario(a, m, { seed: 4 })));
  });
});

describe('historical targets are read by the batch only (Task 15)', () => {
  it('no engine source but batch.ts reads historical.*', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { dirname } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const dir = dirname(fileURLToPath(import.meta.url));
    const readers = readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'test-helpers.ts')
      .filter((f) => /\.historical\b/.test(readFileSync(`${dir}/${f}`, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')));
    expect(readers).toEqual(['batch.ts']);
  });
});
