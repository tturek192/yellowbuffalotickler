import { describe, expect, it } from 'vitest';
import { fixtureWithDoctrine, wx } from '@wwi/scenario/test-fixtures';
import { initRun, runScenario } from './run';
import { resolve } from './resolve';
import { fixtureFire, models } from './test-helpers';
import type { Cause } from './causes';
import type { FireGroup, Pending, PendingDamage } from './types';
import * as reader from './reader';
import { sunTimes } from './light';

const { scenario: s, doctrines } = fixtureWithDoctrine();
const d = models(doctrines);

describe('the record carries what playback needs for weather, light and barrage zones (Task 18)', () => {
  it('weather by minute after Zero, in time order, with the sun\'s place and clock', () => {
    const w = structuredClone(s);
    w.zeroHour = { value: '1917-04-09T05:30', estimate: 't' };
    w.utcOffsetMin = { value: 60, estimate: 't' };
    w.frame = { origin: { lon: 2.77, lat: 50.37 }, bearingDeg: { value: 75, estimate: 't' }, extent: { minX: -2000, maxX: 3000, minY: -1000, maxY: 1500 } };
    w.weather = [
      { ...wx('1917-04-09T05:00'), precipitation: { value: 'sleet', estimate: 't' }, windFromDeg: { value: 315, estimate: 't' } },
      { ...wx('1917-04-09T06:45'), precipitation: { value: 'snow', estimate: 't' }, visibilityM: { value: 11, estimate: 't' } },
    ];
    const r = runScenario(w, d, { seed: 1 });
    expect(r.conditions!.sun).toEqual({ lat: 50.37, lon: 2.77, utcOffsetMin: 60, twilightMin: expect.any(Number) });
    expect(r.conditions!.weather).toEqual([
      { minute: -30, precipitation: 'sleet', windFromDeg: 315 },
      { minute: 75, precipitation: 'snow', visibilityM: 11 },
    ]);
  });

  it('a scenario with no frame, offset or weather records the defaults the light model uses, and no weather', () => {
    const r = runScenario(s, d, { seed: 1 });
    expect(r.conditions!.sun).toMatchObject({ lat: 0, lon: 0, utcOffsetMin: 0 });
    expect(r.conditions!.weather).toEqual([]);
  });

  it('the barrage band and machine-gun zone depths come from the tables', () => {
    const r = runScenario(s, d, { seed: 1 });
    expect(r.geometry.barrageDepthM).toEqual({ band: expect.any(Number), mg: expect.any(Number) });
    expect(r.geometry.barrageDepthM!.band).toBeGreaterThan(0);
  });

  it('sunTimes is a reader export the app may use at runtime', () => {
    expect(reader.sunTimes).toBe(sunTimes);
  });
});

describe('fire events say whose men they hit (Task 18 fix round)', () => {
  /** The fire fixture with c1 and c2 (allied) and k1 and k2 (German) all on the field. */
  function field() {
    const { state, ctx } = initRun(...fixtureFire({}), { seed: 1 });
    return { state: { ...state, minute: 10, companies: state.companies.map((c) => ({ ...c, men: 100, status: 'holding' as const })) }, ctx };
  }
  const hit = (targetId: string, fire: FireGroup, causes: Cause[]): PendingDamage => ({ targetId, source: 'artillery', hits: 30, rounds: 10, suppressPerRound: 0, causes, refs: [], fire });

  it('an allied defensive barrage falls on Germans and a German off-map fire on the allies: losses by the targets\' sides', () => {
    const { state, ctx } = field();
    const defensive: FireGroup = { key: 'defensive:allied', text: 'Allied defensive barrage', factors: {} };
    const offMap: FireGroup = { key: 'off-map:german', text: 'Off-map fire (german-heavies)', factors: {} };
    const mixed: FireGroup = { key: 'creeping:allied:s1', text: 'Creeping barrage', factors: {} };
    const pending: Pending = {
      damage: [
        hit('k1', defensive, ['artillery-fire', 'defensive-barrage']),
        hit('k2', defensive, ['artillery-fire', 'defensive-barrage']),
        hit('c1', offMap, ['off-map-fire']),
        hit('c2', offMap, ['off-map-fire']),
        hit('c1', mixed, ['artillery-fire']),
        hit('k1', mixed, ['artillery-fire']),
      ],
    };
    const out = resolve(state, ctx, 2, pending);
    const ev = (text: string) => out.events.find((e) => e.kind === 'shelled' && e.text.startsWith(text))!;
    const sum = (l: { killed: number; wounded: number } | undefined) => (l ? l.killed + l.wounded : 0);
    const d = ev('Allied defensive barrage');
    expect(Object.keys(d.losses!)).toEqual(['central']);
    expect(sum(d.losses!.central)).toBe(d.factors!.hit);
    const o = ev('Off-map fire');
    expect(Object.keys(o.losses!)).toEqual(['allied']);
    expect(sum(o.losses!.allied)).toBe(o.factors!.hit);
    // Fire on both sides at once (own troops under their own barrage): each side's share, adding up to the whole.
    const m = ev('Creeping barrage');
    expect(Object.keys(m.losses!)).toEqual(['allied', 'central']);
    expect(sum(m.losses!.allied) + sum(m.losses!.central)).toBe(m.factors!.hit);
    expect(m.losses!.allied!.killed + m.losses!.central!.killed).toBe(m.factors!.killed);
  });

  it('every fire event of a Vimy-like run lists the sides it hit, adding up to its hit count', () => {
    const r = runScenario(...fixtureFire({ mgs: 4 }), { seed: 3, endMinute: 40 });
    const fire = r.events.filter((e) => e.kind === 'shelled' || e.kind === 'direct-fire');
    expect(fire.length).toBeGreaterThan(0);
    for (const e of fire) {
      const l = e.losses!;
      expect(Object.values(l).reduce((a, x) => a + x!.killed + x!.wounded, 0)).toBe(e.factors!.hit);
    }
  });

  it('each sector records how far its fire plan reaches', () => {
    const r = runScenario(s, d, { seed: 1 });
    for (const sec of r.geometry.sectors) {
      expect(sec.reach!.length).toBeGreaterThan(1);
      for (const [, y] of sec.reach!) expect(y >= sec.yMin && y <= sec.yMax).toBe(true);
    }
  });
});
