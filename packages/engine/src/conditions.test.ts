import { describe, expect, it } from 'vitest';
import { fixtureWithDoctrine, wx } from '@wwi/scenario/test-fixtures';
import { runScenario } from './run';
import { models } from './test-helpers';
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
