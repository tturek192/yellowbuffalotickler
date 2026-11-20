import { describe, expect, it } from 'vitest';
import { addMinutes, isLocalDateTime, LocalDateTimeSchema, minutesBetween, parseLocalDateTime } from './local-time';

describe('local date-times', () => {
  it('parses YYYY-MM-DDTHH:MM into a wall-clock Date read through its UTC fields', () => {
    const d = parseLocalDateTime('1917-04-09T05:30');
    expect([d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes()]).toEqual([1917, 3, 9, 5, 30]);
  });

  it.each(['1917-04-09T05:30Z', '1917-04-09T05:30:00', '1917-04-09 05:30', '9 April 1917', 'x1917-04-09T05:30', '1917-02-30T05:30', '1917-04-09T24:00', '1917-13-01T05:30'])(
    'rejects %s',
    (text) => {
      expect(isLocalDateTime(text)).toBe(false);
      expect(() => parseLocalDateTime(text)).toThrow(/YYYY-MM-DDTHH:MM/);
    },
  );

  it('counts whole minutes between two times, across midnight', () => {
    expect(minutesBetween('1917-04-09T05:30', '1917-04-09T06:15')).toBe(45);
    expect(minutesBetween('1917-04-09T23:30', '1917-04-10T01:00')).toBe(90);
    expect(minutesBetween('1917-04-09T06:15', '1917-04-09T05:30')).toBe(-45);
  });

  it('adds minutes to a time', () => {
    expect(addMinutes('1917-04-09T23:30', 90).toISOString()).toBe('1917-04-10T01:00:00.000Z');
  });

  it('the schema reports the expected format', () => {
    const r = LocalDateTimeSchema.safeParse('1917-04-09T05:30Z');
    expect(r.success).toBe(false);
    expect(r.error!.issues[0]!.message).toMatch(/YYYY-MM-DDTHH:MM/);
    expect(LocalDateTimeSchema.safeParse('1917-04-09T05:30').success).toBe(true);
  });
});
