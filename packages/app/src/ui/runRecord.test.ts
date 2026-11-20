import { describe, expect, it } from 'vitest';
import { parseRunRecord } from './runRecord';

const good = () => ({
  scenarioTitle: 't',
  scenarioStatus: 'draft',
  zeroHour: '1917-04-09T05:30',
  endMinute: 10,
  geometry: { lines: [], sectors: [] },
  snapshots: [{ minute: 0, companies: [], barrages: [] }],
  events: [{ minute: 0, kind: 'zero-hour', text: 'Zero hour', causes: [] }],
});

describe('parseRunRecord', () => {
  it('accepts a well-formed record', () => {
    expect(parseRunRecord(good()).zeroHour).toBe('1917-04-09T05:30');
  });

  it.each([
    ['not an object', () => 42, /not a run record/],
    ['a bad zero hour', () => ({ ...good(), zeroHour: '9 April 1917' }), /zeroHour/],
    ['a zero hour with a zone', () => ({ ...good(), zeroHour: '1917-04-09T05:30Z' }), /zeroHour/],
    ['no geometry lines', () => ({ ...good(), geometry: { sectors: [] } }), /geometry\.lines/],
    ['no geometry sectors', () => ({ ...good(), geometry: { lines: [] } }), /geometry\.sectors/],
    ['empty snapshots', () => ({ ...good(), snapshots: [] }), /snapshots/],
    ['a malformed snapshot', () => ({ ...good(), snapshots: [{ minute: 0 }] }), /snapshots\[0\]/],
    ['events not an array', () => ({ ...good(), events: {} }), /events/],
    ['a malformed event', () => ({ ...good(), events: [{ minute: 'x', text: 'a' }] }), /events\[0\]/],
    ['a negative end', () => ({ ...good(), endMinute: -1 }), /endMinute/],
  ])('rejects %s', (_, make, message) => {
    expect(() => parseRunRecord(make())).toThrow(message);
  });
});
