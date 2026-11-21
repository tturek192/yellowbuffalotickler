import { describe, expect, it } from 'vitest';
import { ENGINE_VERSION } from './record';
import { runScenario } from './run';
import { doctrines, draft, hash } from './test-helpers';

describe('draft Vimy scenario run', () => {
  it('a run of the draft scenario takes all four lines in order', () => {
    const r = runScenario(draft(), doctrines(), { seed: 1 });
    expect(r.summary.lineTaken.map((t) => t.lineId)).toEqual(['black', 'red', 'blue', 'brown']);
  });

  it('golden record: seed 1 of the draft scenario is byte-identical for this engine version', () => {
    const record = JSON.stringify(runScenario(draft(), doctrines(), { seed: 1 }));
    // Change this pair only together: any change to the record's bytes (behaviour, rounding, field
    // order, format) needs an ENGINE_VERSION bump, and only then a new pinned hash.
    expect({ engineVersion: ENGINE_VERSION, hash: hash(record) }).toEqual({ engineVersion: '0.3.0', hash: '63901945' });
  });
});
