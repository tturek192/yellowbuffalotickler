# Final whole-branch review: Deadlock 1916 Sandbox (679e2b9..HEAD)

**Verdict: not ready to merge.** 1 Critical, 6 Important, 14 Minor.

The engine is small, readable and pure. Determinism and conservation hold: I re-ran a full computer-vs-computer battle twice and got identical JSON, with 0 conservation violations, and there is no `Math.random`. The Vimy app is untouched apart from the multi-page Vite input. The problems are in the game itself: one cheap nudge pattern wins every map, two Review Focus guarantees can be bypassed, and the nudge UI has two real-use defects.

## What I ran

- `npx vitest run --project sandbox`: 29/29 pass.
- `npx vitest run --project app packages/app/src/sandbox`: 8/8 pass.
- Scratch probes with tsx, outside the repo (no repo files changed):
  - perf with batteries;
  - pull-back on a pinned unit;
  - swapped defaults;
  - link-mutation sweep;
  - barrage-spam balance;
  - determinism and conservation.

## Review Focus checklist

| # | Item | Result |
|---|---|---|
| 1 | An empty or one-sided setup doesn't crash | **Pass.** `startLive` gives `nothing-to-fight` (run.ts:35). The result card shows it. |
| 2 | River or off-map units are refused at placement | **Partial.** Placement is refused (SetupEditor.tsx:80). But Go never validates, so the battle can start with such units: see I-2. |
| 3 | An old or corrupt link shows a notice, never a blank page | **Fail.** Some corrupt links crash the page: see I-1. |
| 4 | 40 a side steps in 2 ms or less | **Pass.** Measured with 30 battalions plus 10 batteries a side: ridge 1.10 ms average, open 0.47 ms. The repo test omits batteries (M-1). |
| 5 | Touch placement at 390 px | **Mostly pass.** Tap placement is e2e-tested with touch. Long-press is only tested with the mouse (M-2). |

## Critical

### C-1. Unlimited point barrages that never hit their own side make a two-round "barrage every trench" nudge a sure win on 3 of 4 maps

**Where:**
- orders.ts:27: every barrage order is honoured, with no cap and no cooldown.
- step.ts:53: a point barrage only shells `u.side !== p.side`, so it never hits its own side.
- step.ts:42 + step.ts:57-66: any shelling sets `shelteredUntil`, so any attacker who arrives during or just after it traps 80% of the garrison.
- Play.tsx:52-53: the human can issue barrages as fast as they can tap.

**Scenario:** default setup, computer vs computer, plus one human nudge pattern: at minutes 0 and 30, call a Barrage on each visible defender battalion (8 taps per round). Results over 20 seeds:

| Map | Baseline | 2 rounds | Every 10 min for 4 h |
|---|---|---|---|
| ridge | 1/20 | **20/20** | 20/20 |
| open | 12/20 | **20/20** | 20/20 |
| wooded-hill | 10/20 | **20/20** | 20/20 |
| river | 3/20 | 0/20 | 20/20 |

Almost every win is by surrender or collapse. This is the spec's "solved puzzle" anti-goal: one cheap recipe always wins, and the Vimy lesson (the barrage gap) turns into "barrage everything and walk in". Spamming defender barrages on attackers works the same way.

**Fix direction:** add settings-driven limits, for example:
- a battery-ammunition budget, or barrages tied to batteries in range;
- one point barrage per battery at a time;
- friendly fire inside the radius.

Then re-run the balance with a "spam" probe added to balance.test.ts. This changes outcomes, so bump `RULES_VERSION`.

## Important

### I-1. A corrupt but decodable share link blanks the page (Review Focus 3)

**Where:**
- setup.ts:26: the `try` block checks only `typeof p.m === 'string'` and `Array.isArray(p.u)`.
- setup.ts:32-37: the unit and line tuples are destructured outside the `try`.
- Nothing checks that `mapId` exists:
  - SetupEditor.tsx:15 (`mapById(s.mapId)!` then `.cells`);
  - SetupEditor.tsx:42 (`startBattle` throws `unknown map`).
- There is no error boundary (main.tsx:9).

**Scenarios:**
- `?s=` + base64url of `{"m":"ridgf","u":[]}` passes decode. Then `editedMap` throws a TypeError, React unmounts, and the page is blank.
- `{"m":"ridge","u":[1]}`: `decodeSetup` itself throws ("number 1 is not iterable") from `initial()` in Sandbox.tsx:9. The page is blank.
- A sweep over single-character mutations of a default ridge link: 4,541 gave the notice correctly, but 14 decoded to an unknown map and 2 threw. Each of those 16 is a blank page.

**Fix:**
- Wrap the whole decode in the `try`, and validate the tuple shapes.
- Reject an unknown `mapId` with the damaged-link notice.
- Optionally add an error boundary that falls back to the default setup with a notice.

### I-2. Go starts a battle with units in a river or off the map (Review Focus 2: "the battle never starts with them")

**Where:** SetupEditor.tsx:116 (`onGo` never calls `validateSetup`). There are three ways in that skip the placement check:
1. "Swap attacker" (swapEdges, SetupEditor.tsx:19-22).
2. Painting river under a placed unit (SetupEditor.tsx:70-73).
3. A shared link.

**Scenario:** the river map, then Load default setup, then Swap attacker. `validateSetup` now reports "a2 is standing in the river" (mirrored x = 5000 lands in river cell 50 at y = 1125). Go starts the battle anyway, and a2 wades at 10% speed.

**Fix:** gate Go on `validateSetup(setup, editedMap(setup))` and show the first problem.

### I-3. Pull back does nothing to a pinned battalion, its main use case

**Where:** orders.ts:31 sets `status = 'advancing'`. In the same step, step.ts:109 sees an advancing unit with `morale < pinAt` and re-pins it before movement runs (step.ts:116-121). A pinned unit always has morale below `pinAt + 0.1`, and usually below `pinAt`.

**Scenario:** a probe with a pinned attacker at morale 0.5, an `orderDelayMin` of 0 and a pull-back order. After 10 steps, x stays 4000 and the status stays `pinned`. The player sees the order arrive and nothing happen.

**Fix:** give pull-back its own status, or move with the falling-back movement, so the pin check doesn't apply. Or exempt units with a pull-back target from the pin check.

### I-4. A nudge can go to the wrong side when both sides are human

**Where:** NudgeBar.tsx:13 and NudgeBar.tsx:15.
- The side buttons do `onNudge(nudge ? {...nudge, side: s} : null)`. With no order picked, clicking "Defender" does nothing.
- The next order button then uses `nudge?.side ?? sides[0]`, which is the attacker.
- The side resets to the attacker after every sent order (Play.tsx:52 calls `setNudge(null)`).

**Scenario:** set both sides to You, then:
1. Tap Defender.
2. Tap Barrage.
3. Tap the attackers' line.

The order goes in as `side: 'attacker'`. Because of step.ts:53, it shells the player's own defenders and spares the attackers. Also, switching side midway through Send reserve keeps the other side's `unitId`. `applyDue` (orders.ts:26) doesn't check the unit's side, so the defender's order moves an attacker unit.

**Fix:**
- Keep the chosen side in its own state.
- Clear `unitId` on a side change.
- Check `u.side === o.side` in `applyDue`.

### I-5. Returning to a backgrounded tab fast-forwards the battle in one frozen frame

**Where:** Play.tsx:30. `now - last` is not clamped. requestAnimationFrame stops while the tab is hidden, so the first frame back adds the whole absence to `acc`.

**Scenario:** at 4×, the player switches away for 60 s (for example to paste the share link) and returns. 2,880 minutes are queued, so the `setLive` updater runs the battle to its end in one frame. The UI freezes for about 1 to 3 s and the player never sees the battle. It also skips any chance to nudge.

**Fix:** clamp `dt`, for example to 250 ms, or pause on `visibilitychange`.

### I-6. Rule numbers scattered outside settings.ts (Global Constraint: "No magic numbers anywhere else")

The anti-goal is "tweaking a rule means touching many files". Rule-bearing literals:

- **step.ts:**
  - trench radius 50 and cover 0.7 / 0.5 / 0.4 (:38-39);
  - shell cover factor 0.8 and suppression 0.3 (:42);
  - wire cut 0.1/min and 0.05/min (:47, :54);
  - point-barrage radius 150 (:53);
  - gap window 50 / 400 (:60);
  - battery reach 5000, spotter range 2000 and battery size 150 (:73, :78, :83);
  - suppression factor 0.7 and suppression gain 15 (:86-87);
  - suppression decay 0.8 (:97);
  - morale-loss multiplier 4, drift 0.01 and recovery 0.004 (:98-100);
  - destroyed-below 20 men (:103);
  - unpin margin 0.1 and quiet minutes 10 (:111);
  - fall-back 1000 m and speed 0.8 (:120);
  - terrain speeds 0.6 / 0.8 / 0.1 (:124);
  - slope 20 m and floor 0.5 (:129);
  - barrage hug 50 m (:131-132).
- **orders.ts:**
  - delay spread 0.5 + 1.5 (:14);
  - barrage 10 min (:27);
  - pull-back 500 m (:31);
  - AI sight 2000 (:40);
  - edge 200 / 300 (:54-55);
  - foe range 1500 and barrage cadence 30 (:60-61);
  - AI cadence 10 (step.ts:27).
- **deadlock.ts:**
  - SECTORS 4 (:5);
  - surrender 0.5 and collapse 0.1 (:41-42). These are the owner's ruled thresholds, and they aren't even in settings.
  - stronghold radius 300 (:44-45).
- **run.ts:**
  - quiet 120 (:47);
  - barrage start 100, stop past guns 500, fallback 4000 (:24).
- **drawSandbox.ts:47:** repeats the 150 m radius, so changing it in step.ts silently mis-draws barrages.

**Fix:** move them into `SETTINGS`, grouped, each with a one-line comment.

## Minor

- **M-1:** deadlock.test.ts:45-46. The 2 ms test uses battalions only, so it skips the battery spotting path (battery × target × observer × line-of-sight), which is the costliest one. A mixed probe passed (1.10 ms average), but the test doesn't guard it.
- **M-2:** e2e/sandbox.spec.ts:19. Long-press uses `page.mouse`, not touch. Review Focus 5's long-press is therefore not tested with touch. There is also no `-webkit-touch-callout: none` or `user-select: none` on the canvas for iOS.
- **M-3:** SetupEditor.tsx:62. The long-press timer leaks in two cases:
  - A second finger overwrites `press.current`, so the first timer still fires.
  - If the finger is released outside the canvas, there is no pointer capture and `pointerup` is lost, so the unit is removed anyway.

  Fix: `setPointerCapture`, and clear the timer on `pointercancel` and on a pointer move greater than about 10 px.
- **M-4:** SetupEditor.tsx:80. `p.startsWith(u.id)` matches other units' problems, so a new `a1` is refused because of an existing `a12 is standing in the river` from a link.
- **M-5:** SetupEditor.tsx:106. The message is placed at `x + 8` with no clamp, so near the right edge at 390 px it overflows and causes a horizontal page scroll.
- **M-6:** The spec says the painter "saves the result as a new map". The edits live only in the setup or link, and picking another map discards them (SetupEditor.tsx:91). The plan's "Load from link" button is also missing; only `?s=` is read at load.
- **M-7:** Units are not interpolated between minutes (plan Task 7). At ½× they visibly step. The ruling covers tracers and front shading only.
- **M-8:** setup.ts:42. A link with a *newer* `rulesVersion` (from a fresher deploy opened on a cached page), or with none, loads silently with no notice.
- **M-9:** Swap attacker mirrors units but not terrain or strongholds.
  - On the ridge, Hill 145 (x 5800) ends up behind the attacker's start line (4600).
  - Swapped defaults break 0/10 on river and on wooded-hill, and the stronghold never falls.
  - Consider mirroring strongholds, or warning that the swap changes the map's balance.
- **M-10:** Cross-browser determinism. `Math.hypot` and `Math.exp` are not required to be correctly rounded, so a shared link can diverge between engines through threshold comparisons. This is acceptable for v1, but worth a note, or a hand-rolled `sqrt(dx*dx+dy*dy)`.
- **M-11:** `decodeSetup` accepts duplicate unit ids. step.ts:36-37 keys hits by id, so two units with the same id each take the sum of both units' losses.
- **M-12:** deadlock.ts:16. With no defender batteries, there is no gun line, so breakthrough can never happen and the result says "no enemy guns to reach". This is acceptable, but the setup screen gives no hint.
- **M-13:** defaults.ts:8-9,14,31. These are per-map tables keyed by id, plus `mapId === 'river'` and `'open'` special cases. Adding a map means touching make-maps.mjs, map.ts imports and defaults.ts. That is mild upkeep friction.
- **M-14:** packages/app/package.json `build:sandbox` overwrites `dist/` without the Vimy `prebuild` data, and copies all of `dist/assets` (Vimy chunks included) into dist-sandbox. It is harmless, but it is 1.7 MB where the sandbox needs less. After a paused Step reaches the end, "Replay same seed" (Play.tsx:76) also leaves `paused` true, so the replay doesn't start until Resume.

## Rulings weighed

All the `Ruling:` lines are reasonable as written. Two rulings interact with findings:

- The balance ruling ("ridge breaks only 1/20") is where C-1 shows: the ridge goes to 20/20 with two rounds of barrages.
- The "no CompressionStream" ruling is fine. I-1 is about validating the decoded data, not the encoding.

## Rulings made while building (from the execution ledger)

- Task 2: Ruling: added settings key wireBeltM (100 m) — the wire test needs a belt depth; plan listed none — cost: one more number.
- Task 2: Ruling: rng is a plain numeric state (rngNext) with no fork() — one stream suffices for a small engine and keeps Battle plain data — cost: adding draws reorders later ones.
- Task 2: Ruling: pinned units get up only after 10 quiet minutes (pinnedAt) — without it a pinned unit with full morale rose at once — cost: none.
- Task 3: Ruling: line of sight moved to sight.ts (step and orders both need it; avoids a circular import); step re-exports losClear — cost: none.
- Task 3: Ruling: the computer decides every 10 minutes, and pull-back = march 500 m to the rear — cost: none.
- Task 4: Ruling: default setups are code (defaults.ts), not JSON files — one function lays out every map from a few numbers, easier to change — cost: none.
- Task 4: Ruling: the gap trap uses the battalion front (|dx| ≤ 50 m, |dy| ≤ 400 m) not 50 m between centres — attackers and defenders sit on different rows — cost: none; plan's 50/200 test kept.
- Task 4: Ruling: balance tuning — barrageSpeed 30 (keeps infantry up with it), surrenderTrappedFrac 0.8, sealDistanceM 750, barrage cuts wire 0.1/min, preliminary wire cut 0.6 (ridge 0.85), open map gets a second wire belt, rivers crossable at 10% speed, orders take 0.5–2× the delay (seeded), defender reserves start 4 km back. RULES_VERSION stays 1 (no players yet) — cost: ridge breaks only 1/20 with computer vs computer.
- Task 5: Ruling: share links are compact JSON as base64url, no CompressionStream — a default setup fits in ~1.5k chars and decoding stays synchronous — cost: very large custom setups make long links.
- Task 6: Ruling: the sandbox map always fits the screen width (no zoom) — a 9×6 km map reads at phone width and keeps the editor simple — cost: small units at 390 px.
- Task 6: Ruling: test hooks are data attributes on the canvas (data-units, data-river), not globals — cost: none.
- Task 6: Ruling: drawSandbox tests were written before the code but not run red first (TDD lapse, the e2e was run red) — cost: none found.
- Task 7: Ruling: the runner's end logic moved into startLive/advance in the sandbox package so the page and runToEnd share it — cost: none.
- Task 7: Ruling: the e2e replays the same seed twice without nudges and compares (a nudged first run may differ by design) — cost: none.
- Task 7: Ruling: no tracer marks or front shading in v1 — units, barrages, wire and status marks already show the fight; keeps drawing simple — cost: less visual flourish than the plan named.
- Final: Ruling: the map is capped at 1.3 × window height wide on desktop (the battle screenshot needed scrolling) — cost: none.
