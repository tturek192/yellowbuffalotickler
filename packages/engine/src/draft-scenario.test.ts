import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadScenario } from '@wwi/scenario/node';
import { ENGINE_VERSION } from './record';
import { runScenario } from './run';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

const loadDraft = () =>
  loadScenario(resolve(repoRoot, 'scenarios/vimy-1917/1cdn-3bde-draft.yaml'), resolve(repoRoot, 'doctrine'));

/** 32-bit FNV-1a over the UTF-16 code units of a string, as 8 hex digits. */
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

describe('draft Vimy scenario run', () => {
  it('a run of the draft scenario takes all four lines in order', () => {
    const { scenario: s, doctrines } = loadDraft();
    const r = runScenario(s, doctrines, { seed: 1 });
    expect(r.summary.lineTaken.map((t) => t.lineId)).toEqual(['black', 'red', 'blue', 'brown']);
  });

  it('golden record: seed 1 of the draft scenario is byte-identical for this engine version', () => {
    const { scenario: s, doctrines } = loadDraft();
    const record = JSON.stringify(runScenario(s, doctrines, { seed: 1 }));
    // Change this pair only together: any change to the record's bytes (behaviour, rounding, field
    // order, format) needs an ENGINE_VERSION bump, and only then a new pinned hash.
    expect({ engineVersion: ENGINE_VERSION, hash: fnv1a(record) }).toEqual({ engineVersion: '0.2.0', hash: '7d4a90de' });
  });
});
