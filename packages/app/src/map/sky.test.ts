import { describe, expect, it } from 'vitest';
import { battleRecord, trenchAt } from '../battle-record';
import { darknessAt, precipitation, weatherAt } from './sky';

const vimy = { lat: 50.3794, lon: 2.7736, utcOffsetMin: 60, twilightMin: 35 };
const weather = [
  { minute: -30, precipitation: 'sleet' as const, windFromDeg: 315 },
  { minute: 75, precipitation: 'snow' as const, windFromDeg: 270 },
  { minute: 330, precipitation: 'none' as const },
  { minute: 4260, precipitation: 'snow' as const, visibilityM: 11 },
];
const r = battleRecord({ features: [trenchAt('f', 500)], snapshots: [{ minute: 0, companies: [] }], extra: { conditions: { sun: vimy, weather } } });

describe('weather and light', () => {
  it('the weather in force is the latest entry at or before the minute', () => {
    expect(weatherAt(r, 0)?.precipitation).toBe('sleet');
    expect(weatherAt(r, 100)?.precipitation).toBe('snow');
    expect(weatherAt(r, 400)?.precipitation).toBe('none');
    expect(weatherAt(r, 4300)?.visibilityM).toBe(11);
  });

  it('is day at noon, night at 22:00 and at Zero (05:30, before the twilight), and between at 06:00', () => {
    expect(darknessAt(r, 6.5 * 60)).toBe(0); // 12:00
    expect(darknessAt(r, 16.5 * 60)).toBe(1); // 22:00
    expect(darknessAt(r, 0)).toBe(1);
    const dawn = darknessAt(r, 30);
    expect(dawn).toBeGreaterThan(0);
    expect(dawn).toBeLessThan(1);
  });

  it('a record without conditions is always day with no weather', () => {
    const bare = battleRecord({ features: [], snapshots: [{ minute: 0, companies: [] }] });
    const { conditions: _c, ...old } = bare as typeof bare & { conditions?: unknown };
    expect(darknessAt(old as typeof bare, 1000)).toBe(0);
    expect(weatherAt(old as typeof bare, 1000)).toBeNull();
  });

  it('precipitation particles are deterministic, lighter for none, and blown with the wind', () => {
    const snow = precipitation('snow', 270, 800, 600, 1.5);
    expect(snow).toEqual(precipitation('snow', 270, 800, 600, 1.5));
    expect(precipitation('none', 270, 800, 600, 1.5)).toEqual([]);
    expect(snow.length).toBeGreaterThan(20);
    // A west wind carries the flakes east (to the right).
    expect(snow.every((p) => p.dx > 0)).toBe(true);
    expect(precipitation('snow', 270, 800, 600, 1.6)).not.toEqual(snow);
  });
});
