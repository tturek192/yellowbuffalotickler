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
    // 0.3.1 (Task 7): the record gains geometry.segments and snapshots[].segments (both empty for the draft,
    // which has no German garrison), and defaultsUsed lists the absent bombardment and clock offset; the
    // draft's companies, events and summary are unchanged.
    // 0.3.2 (Task 8): snapshot company rows gain a gapM column (each attacker's gap to its barrage). The draft has no
    // artillery, garrisons or off-map fire, so no shell falls and nobody is trapped: its companies, events, summary
    // and defaults are unchanged, and only the version and the new column move the hash.
    // 0.3.3 (Task 9): direct fire, the full resolve (officers, ammunition) and morale. The draft has no German
    // companies, so nobody fires and its companies, events and summary are unchanged; starting morale now comes from the
    // leaders' moraleEffect, and its two leaders without ratings count as 3 (morale stays 0.8), listed in defaultsUsed.
    // 0.3.4 (Task 10): movement with fatigue, the barrage-safe target rule and the new line-taken rule. Fatigue
    // (fatiguePerKm) slows the two companies that walk on to the Blue Line, which they reach 2 minutes later (Blue taken
    // at 318, not 316; the other lines' minutes are unchanged); each line-taken now refers to all its arrivals (not only
    // that step's) and carries factors (companies, consolidating, segments). The draft has no garrisons, wire or German
    // guns, so no segment, dugout or capture changes anything.
    // 0.3.5 (Task 11): communications. The draft has no communications section, so every link is a runner (listed in
    // defaultsUsed); its companies' reports go up to the battalion, brigade and division by runner, and one of them is
    // lost on the way and sent again (one message-lost event, referring to the event the report was about). Nothing
    // in the draft acts on what its headquarters know yet (Task 12), and no draw comes before a draw that changes the
    // battle (the draft has no fire, so its only other draws are the companies' start and speed, at setup): its
    // companies, other events and summary are unchanged.
    expect({ engineVersion: ENGINE_VERSION, hash: hash(record) }).toEqual({ engineVersion: '0.3.5', hash: '23c46997' });
  });
});
