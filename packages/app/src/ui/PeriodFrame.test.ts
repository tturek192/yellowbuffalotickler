import { describe, expect, it } from 'vitest';
import type { RunRecord } from '@wwi/engine';
import { MAP_COLORS } from '../map/style';
import { notesFor, titleParts } from './PeriodFrame';

/** The 2nd Canadian Division with the attached British 13th Brigade (no patch), and the British 5th Division (no patch). */
function record(): RunRecord {
  return {
    scenarioTitle: 'Vimy Ridge, 9-12 April 1917: Canadian Corps (draft)',
    geometry: { lines: [] },
    divisions: [
      { id: '2cdn', name: '2nd Canadian Division', side: 'allied', insignia: '#24427a' },
      { id: '13bde-brit', name: 'British 13th Infantry Brigade (attached)', side: 'allied', noPatch: true },
      { id: '5bdiv', name: 'British 5th Division (corps reserve: 15th and 95th Brigades)', side: 'allied', noPatch: true },
      { id: '79rd', name: '79th Reserve Division', side: 'central' },
    ],
    units: [
      { id: '18bn-a', battalionId: '18bn', name: 'a', side: 'allied', formationPath: ['18bn', '4bde', '2cdn', 'cdn-corps'], insignia: '#24427a' },
      { id: '1rwk-a', battalionId: '1rwk', name: 'b', side: 'allied', formationPath: ['1rwk', '13bde-brit', '2cdn', 'cdn-corps'] },
      { id: '1norfolk-a', battalionId: '1norfolk', name: 'c', side: 'allied', formationPath: ['1norfolk', '15bde-brit', '5bdiv', 'cdn-corps'] },
      { id: 'rir261-1', battalionId: 'rir261-i', name: 'd', side: 'central', formationPath: ['rir261-i', 'rir261', '79rd'] },
    ],
  } as unknown as RunRecord;
}

describe('the Explanatory Notes (notesFor)', () => {
  it('names the formations without a patch on one row of their own, in khaki, and never under the division they fought with', () => {
    const n = notesFor(record());
    expect(n.allied.map((s) => s.name)).toEqual(['2nd Canadian Division', 'British 13th Infantry Brigade and British 5th Division (no patch)']);
    expect(n.allied[1]!.fill).toBe(MAP_COLORS.alliedUnpatched);
    expect(n.allied[0]!.fill).toBe('#24427a');
    expect(n.german.map((s) => s.name)).toEqual(['79th Reserve Division']);
    expect(n.patches).toEqual([{ label: '2nd', fill: '#24427a' }]);
  });

  it('reads the place and the force from the title, without the draft mark', () => {
    expect(titleParts('Vimy Ridge, 9-12 April 1917: Canadian Corps (draft)')).toEqual({ place: 'Vimy Ridge', force: 'Canadian Corps' });
  });
});
