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
    // defaultsUsed), and its headquarters stand behind their companies by the rear offsets of their level (each listed
    // in defaultsUsed; the draft has no frame to hold them in). Its companies' reports go up to the battalion, brigade
    // and division by runner, the way beyond runnerDelayCoversKm adding runnerMinPerKm; two reports from the 3rd Brigade
    // to the division (4 km back) are lost on the way and sent again (two message-lost events). Nothing in the draft
    // acts on what its headquarters know yet (Task 12), and no draw comes before a draw that changes the battle (the
    // draft has no fire, so its only other draws are the companies' start and speed, at setup): its companies, other
    // events and summary are unchanged. (Re-pinned within 0.3.5 by the pre-review fix that placed headquarters.)
    // 0.3.6 (Task 12): the command model. The draft's battle is unchanged (the same events, lines at the same minutes, the
    // same summary): it has no reserve-role battalion to commit to a stall, no operations, no German garrisons to
    // counter-attack and no off-map attacks; its companies' start jitter is scaled by their leaders' planning, which counts as 3 for the draft's
    // unrated leaders. The hash moves with the version and with defaultsUsed, which now lists the leaders the command
    // model and the timetable read as 3 (formations with no leader, leaders with no ratings).
    // 0.3.7 (Task 13): off-map reserves and the uphill counter-attack. The draft has no reserves, no terrain grid and no
    // German companies, so nothing marches, arrives or counter-attacks: removing the new (empty) snapshots[].reserves
    // tables and setting the version back gives 0.3.6's hash, e95e2f6f. Only the version and those tables move it.
    // 0.3.8 (Task 13 fix round 1): the defenders' picture of the attacker's lines, planned counter-attacks that re-target
    // and give up, and reserves spread along a frontage. The draft has no German companies and no reserves: with the
    // version set back to 0.3.7 its record hashes to 458e0fac, so only the version moves the hash.
    // 0.3.9 (Task 13 fix round 1 follow-up): reserve battalion headquarters move with their companies, and a division
    // reports its planned counter-attack gone in or given up. The draft has neither: with the version set back to 0.3.8
    // its record hashes to 2d202141, so only the version moves the hash.
    // 0.3.10 (Task 13 fix round 2): reserves sent to one front take distinct places, and every end of a planned
    // counter-attack is reported. The draft has neither: with the version set back to 0.3.9 its record hashes to
    // 037a5b1a, so only the version moves the hash.
    // 0.3.11 (Task 15): one rng stream per subsystem (rng.ts createStreams: companies, bombardment, comms, gap, casualties,
    // mop-up), each seeded from the run's seed and its name, so drawing more in one never moves another's draws. The draft's
    // companies draw their start jitter and speed from their own stream now: the Blue Line falls at 316 (318 before), the
    // other lines at the same minutes.
    // 0.3.12 (Task 15): contact counts only while one of the two companies can fire (step.ts inContact), men mopping up
    // keep the step fine, morale thresholds are scheduled, and an off-map attack is due just after its window opens. The
    // draft has no German companies: with the version set back to 0.3.11 its record hashes to f87da6f4, so only the
    // version moves the hash. (Vimy seed 1: the same events and summary, stepped quietly where nobody can fire.)
    // 0.3.13 (Task 15): the record's snapshots are keyframes every KEYFRAME_EVERY (24) snapshots and, between them, deltas
    // holding only the rows and barrages that changed (snapshots.ts; `expandSnapshots` gives them back in full). The
    // draft's battle is unchanged: expanded, its snapshots are those of 0.3.12.
    // 0.4.0 (Task 15): the run end (end.ts: objectives-held, lull, time-cap) with its run-ended event, the winner and key
    // ground in the summary, and each unit's formation path in the record. The draft's battle is unchanged up to its end: it
    // now ends objectives-held at 444, once the companies on the Brown Line (taken at 438) have stopped moving and nothing
    // is due, with no winner (it has no key ground; both listed in defaultsUsed with its lull, the time limit).
    // 0.4.1 (Task 15 fix round 1): a run does not end while news that could lead to a decision is on its way (end.ts
    // `newsInTransit`), key ground is held by the men on it, else the nearest trench, else the line it lies behind, and
    // the lull's default is recorded at setup. The draft's battle is unchanged; it now ends objectives-held at 618, once the
    // 1st Brigade's last report (lost once on the way, at 526) has reached the division.
    // 0.4.2 (Task 14): tanks (bogging, suppression), gas on the enemy's horses (guns then captured when overrun), and the
    // attackers' ammunition reserve. The draft has no tanks, no gas and no enemy: with the version set back to 0.4.1 its
    // record hashes to f4b5b276, so only the version moves the hash.
    expect({ engineVersion: ENGINE_VERSION, hash: hash(record) }).toEqual({ engineVersion: '0.4.2', hash: '7ed66c11' });
  });
});
