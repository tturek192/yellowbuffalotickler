import { describe, expect, it } from 'vitest';
import { runScenario } from './run';
import type { RunOptions } from './run';
import type { RunRecord } from './record';
import { companyIds, eventsOf, fixtureArtillery, fixtureBomb, ofKind, rowsOf, totalsOverTime, withQuietStep, withRearTrench } from './test-helpers';
import type { ArtilleryOpts } from './test-helpers';

const runGap = (o: ArtilleryOpts, opts: Partial<RunOptions> = {}): RunRecord => runScenario(...fixtureArtillery(o), { seed: 1, ...opts });

describe('the gap and the dugouts', () => {
  it('a company that keeps close to the barrage traps the garrison; one that lags lets it emerge and fight', () => {
    expect(eventsOf(runGap({ lagMin: 0 })).map((e) => e.kind)).toContain('defenders-trapped');
    const lagging = eventsOf(runGap({ lagMin: 12 }));
    expect(lagging.map((e) => e.kind)).toContain('garrison-emerged');
    expect(lagging.find((e) => e.kind === 'garrison-emerged')!.refs.length).toBeGreaterThan(0);
  });

  it("an emerged garrison's refs point to the barrage lifting off its segment", () => {
    const r = runGap({ lagMin: 12 });
    for (const e of ofKind(r, 'garrison-emerged')) {
      const ref = r.events[e.refs[0]!]!;
      expect(ref.kind).toBe('barrage-passed');
      expect(ref.segmentId).toBe(e.segmentId);
      expect(ref.minute).toBeLessThanOrEqual(e.minute);
    }
  });

  it('trapping: trappedSurrenderFrac of the garrison is captured, the rest left below as dugout points, men conserved', () => {
    const r = runGap({ lagMin: 0 });
    const trapped = ofKind(r, 'defenders-trapped');
    expect(trapped.map((e) => e.segmentId).sort()).toEqual(['ger-front-a:001', 'ger-front-a:002']);
    for (const e of trapped) {
      expect(e.causes).toContain('followed-barrage');
      expect(e.factors!.captured + e.factors!.inDugouts).toBe(120);
      expect(e.factors!.captured).toBeGreaterThan(40);
      expect(e.factors!.captured).toBeLessThan(80);
    }
    const k1 = rowsOf(r, 'k1').at(-1)!;
    expect(k1.posture).toBe('in-dugout');
    expect((k1.captured as number) + (k1.men as number)).toBe(120);
    expect(r.summary.prisoners.allied).toBe(trapped.reduce((a, e) => a + e.factors!.captured, 0));
    for (const id of companyIds(r)) expect(new Set(totalsOverTime(r, id))).toHaveLength(1);
    // A trapped garrison never comes up.
    expect(ofKind(r, 'garrison-emerged')).toHaveLength(0);
  });

  it('records each attacking company’s gap to its barrage, and none for garrisons', () => {
    const r = runGap({ lagMin: 0 });
    const c1 = rowsOf(r, 'c1');
    expect(c1.some((x) => typeof x.gapM === 'number' && (x.gapM as number) >= 70)).toBe(true);
    expect(rowsOf(r, 'k1').every((x) => x.gapM === null)).toBe(true);
    expect(r.snapshots[0]!.companies.columns).toContain('gapM');
  });

  it('a company that keeps up never loses its barrage; one that falls behind does, with cause barrage-moved-on and its gap', () => {
    expect(ofKind(runGap({ lagMin: 0 }), 'barrage-lost')).toHaveLength(0);
    // Slower than the barrage (30 m a minute on average) and far back: it falls ever further behind.
    const r = runGap({ startX: -400, speedMPerMin: 20 });
    const lost = ofKind(r, 'barrage-lost');
    expect(lost.map((e) => e.unitId).sort()).toEqual(['c1', 'c2']);
    for (const e of lost) {
      expect(e.causes).toEqual(['barrage-moved-on']);
      expect(e.factors!.gapM).toBeGreaterThan(2 * 70);
    }
    // The garrison it was meant to catch comes up into its path, and the event says why.
    const up = ofKind(r, 'garrison-emerged');
    expect(up.length).toBeGreaterThan(0);
    for (const e of up) {
      expect(e.causes).toEqual(expect.arrayContaining(['gap-behind-barrage', 'barrage-moved-on']));
      expect(e.factors!.gapM).toBeGreaterThan(2 * 70);
    }
  });

  it('a company still closing up on the barrage at Zero has not lost it', () => {
    // 400 m back but quicker than the barrage: it catches up.
    expect(ofKind(runGap({ startX: -400, speedMPerMin: 60 }), 'barrage-lost')).toHaveLength(0);
  });

  it('a wrecked trench (blocked exits) slows its garrison coming up', () => {
    const emergedAt = (trenchRounds?: number) => {
      // The bombarded fixture, with the attackers 30 minutes late so that the garrisons come up.
      const [s] = fixtureBomb(trenchRounds ? { trenchRounds } : {});
      for (const c of s.forces[0]!.formations[0]!.companies!) c.startAfterMin = { value: 30, estimate: 'test' };
      const r = runScenario(s, fixtureArtillery()[1], { seed: 1 });
      return Math.min(...ofKind(r, 'garrison-emerged').map((e) => e.minute));
    };
    expect(emergedAt(2000)).toBeGreaterThan(emergedAt(undefined));
  });

  it('a garrison due up in a quiet stretch comes up at the same minute however long the quiet step', () => {
    // A rear garrison outside every barrage, due up at minute 41, while the barrage stands beyond the Black Line
    // (minutes 33 to 73) and the attackers have consolidated.
    const f = withRearTrench(fixtureArtillery({ emergeMin: 41 }), 150, 'k3');
    const flank = f[0].features.find((x) => x.id === 'ger-rear-k3')!;
    flank.geometry = { type: 'LineString', coordinates: [[150, 600], [150, 800]] };
    f[0].forces[1]!.formations[0]!.companies!.find((c) => c.id === 'k3')!.start = [150, 700];
    const at = (q: number) => ofKind(runScenario(f[0], withQuietStep(f[1], q), { seed: 1 }), 'garrison-emerged').map((e) => [e.minute, e.segmentId]);
    expect(at(10)).toEqual(at(2));
    expect(at(10)).toEqual([[42, 'ger-rear-k3:001']]);
  });
});
