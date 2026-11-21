# Deadlock 1916 — Design

Date: 2026-11-21
Status: approved by the owner on 2026-11-21
Working title: **Deadlock 1916** (the owner's name for now)
Extends: `docs/superpowers/specs/2026-11-20-wwi-battle-simulator-design.md` (the "base design"). Everything there still binds unless this document changes it, and the changes are listed in "Decisions this changes".

## Intent

Deadlock 1916 is a laboratory for the central puzzle of the Western Front: attacks could **break in** to the enemy's trenches but almost never **break through**. The owner, a historian, wants to use the simulator to ask questions like these:
- How would the deadlock have been broken, from different vantage points, concentrations or tactics?
- What level of manpower and artillery would have changed the course of history?
- How did supply, food, disease and morale shape what armies could do between and during battles?
- What would a general of 1916, with only the information and levers of his time, have achieved?

Two things make it worth playing:
- **It is engaging and flexible to play.** This is the owner's first priority.
- **Every answer says how credible it is,** from documented fact to impossible, and why.

Checking the model against real battles is useful and planned, but it serves the game, and the owner may drop it if it proves cumbersome. Deadlock 1916 is a personal tool, not a product for sale, and it makes no claims.

## Goals

1. **Score whether the deadlock broke.** Every run records which of these happened first, and when:
   1. **Breakthrough:** the attacker gets beyond the defender's artillery line before the defender's reserves arrive to seal the gap.
   2. **Surrender:** a sizeable part of the defending force surrenders.
   3. **Collapse:** fewer than 10% of the defending troops in the sector remain fit to fight.
   4. **Key stronghold taken:** the stronghold the scenario names (Hill 145, a fort, a ridge, a town).

   Each condition, and its threshold, is scenario data. A batch reports a distribution, for example "broken in 35% of 200 runs, mostly by breakthrough, on day 2", and the "why" traces show what held when it held.
2. **Find tipping points.** A sweep varies one variable across a range and runs each level many times. Examples of a variable: men, guns, shells per kilometre, a tactics profile, reserve distance, weather. The sweep reports where the outcome flips, with its uncertainty: "below 40 heavy guns per km the attack never broke through; above 60 it did in most runs".
3. **Any vantage point.** Either side can attack. Doctrine profiles cover the British, French and German armies for each year from 1915 to 1918, so tactics can be mixed and compared. One example: a British 1915 attack against a German 1917 defence in depth.
4. **An operational layer for the race.** Divisions are the units, and the step is hours to a day. It covers:
   - rail and roads;
   - reserves moving up;
   - guns and supplies moving forward across the devastated zone;
   - daily sustainment by division: ammunition, food, disease and sickness, fatigue, morale, replacements, and the evacuation and return of wounded.

   Scenarios run from days to a few weeks: long enough for the race between attacker and defender reserves.
5. **Play as a general of 1916.**
   - **The command.** The player commands one side at one level, for example corps. The engine's commanders run everyone else by doctrine and leader ratings, as the base design already specifies.
   - **Orders and information.** Orders travel down the chain over the channels of the day (cable, runners, pigeons, visual signals), with period delays and losses. The player sees only the headquarters picture: what reports have actually reached him, late and incomplete.
   - **Pausing.** The player may pause the clock to think.
   - **After the battle.** The full time-lapse of what really happened, and the post-conflict report.
   - **Replay.** A played game is saved as scenario + seed + the player's orders with their times. It replays exactly and can be compared with another general's game.
   - **Watching stays.** A player who gives no orders gets the base design's set-up-and-watch run.
6. **Credibility grades on everything.**
   - **Grading inputs.** Every input value carries one of six grades, mapped from what the data already records:

     | Grade | Meaning | Comes from |
     |---|---|---|
     | **factual** | documented | cited to a primary, official or scholarly source |
     | **probable** | inside documented bounds | inside a documented range, or a disputed value between its sources |
     | **possible** | reasoned, within documented limits | an estimate with reasoning, inside the limits table |
     | **unlikely (rare)** | beyond anything documented, but not ruled out | outside documented ranges, inside hard limits |
     | **unverified** | never documented either way | no source or limit covers it |
     | **untrue (impossible)** | breaks a hard limit | outside the limits table |

     A tertiary source caps a value at "probable".
   - **Grading results.** Each result is graded by distance from the tested envelope. A battle the model has been checked against reports how close it came. A custom run reports where its inputs and conditions left the tested envelope, because results beyond it are extrapolation.
   - **The post-conflict report** shows both, in plain language.
7. **Generated sectors, in a historical style.** The engine generates plausible stretches of front for a chosen nation, year and ground type, using the trench-geometry rules in the owner's research and the base design's terrain approach. Examples: a 1916 Artois chalk ridge, a 1917 Flanders clay plain with pillboxes.
   - **What gets generated:** terrain, trench systems, wire, dugouts, villages and woods, and a plausible order of battle.
   - **How they are graded:** everything generated is graded "possible" at best, never "factual".
   - **What they are for:** the lab tests on many fronts, not just the battles mapped by hand.
   - **Out of scope for now:** fully fictional worlds.

## Non-goals (for now)

- Fully fictional worlds and maps that don't follow the period's patterns.
- Modern technology. "A 1916 general with 2026 technology" was clarified as role-play with period levers, not anachronistic equipment.
- Squad-level simulation. The research's squad decision loop is a source of ideas, not a structure; companies still fight, per base Goal 4.
- Month-long attrition battles, Verdun's ten months for example. These come after the days-to-weeks lab works.
- A campaign meta-game chaining battles with state carried between them.
- Multiplayer, and opponents played by other people. The 3D view still comes later.

## Anti-goals (failure even if it technically works)

- **Pretend precision.** A result shown without its credibility grade, or an "untrue" input accepted silently. What-ifs and sweeps are never locked, even before any check battle passes; this is the owner's decision. The grade carries the warning instead.
- **Overfitting,** as in the base design. Every new army-and-year profile adds parameters, and they must be shared and checked on battles they were not tuned on.
- **A black box,** as in the base design. Operational summary rules must explain their results too.
- **Too slow to sweep.** A tipping-point sweep must finish in minutes, not hours.

## Decisions this changes in the base design

- **Orders during a battle.** The base design's non-goal "Giving orders during a battle" is reversed for the player-general (Goal 5). Engine-run commanders are unchanged.
- **Maps.** "Fictional maps and worlds" stays a non-goal, but historical-style generated sectors (Goal 7) are now in scope.
- **Scale and duration.** "Battalions to command, companies to fight" holds inside the battle layer. The operational layer adds divisions over days to weeks. The cross-battle campaign meta-game remains a non-goal.
- **Attackers.** The base design's Vimy-first engine assumes the Allies attack and the Germans defend, with objective lines along one attack bearing. That must be generalised: either side attacks, and front lines may bend (a salient). This was found by the research digest. Examples in the current code:
  - `counterBattery.side` is fixed to `'allied'`;
  - segments are derived per German garrison.
- **The research compendium is a source of leads, not history.** The base design's rule 13.14 applies to the owner's eight-report research compendium (shared 2026-11-21):
  - Its figures are design estimates, labelled by the compendium itself as "design estimates".
  - It cites almost no pages.
  - It has about 18 internal contradictions.

  Its numbers may enter only as calibrated estimates. Before any becomes a validation target it is checked against primary or scholarly sources.

## Constraints

- **The base design's constraints hold:**
  - sourced, editable text data;
  - a deterministic engine;
  - the engine runs in Node and in a Web Worker;
  - playback reads records only;
  - doctrine parameters are data;
  - the owner owns leader ratings and status.
- **Performance:**
  - one battle-layer run stays within Plan 3's budget (≤ 3 s, record ≤ 8 MB);
  - an operational scenario of three weeks runs in ≤ 10 s;
  - a sweep of 10 levels × 100 runs finishes in ≤ 15 min on one machine with workers.
- **A limits table.** Hard physical and logistical limits, each sourced:
  - guns and shells an army owned or could make and carry;
  - marching rates;
  - rail capacity;
  - ration needs.

  Grading "untrue" depends on it.
- **Plan 3 continues unchanged.** Its combat model is the battle layer of this design. Its Task 20 (the period map style chosen by the owner) is the look of Deadlock 1916.

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (chosen by the owner)** | **Two layers.** The company-level battle engine fights the attacked sector. An operational layer (divisions; hours to days) covers the whole front: rail, roads, reserves, artillery displacement and sustainment. Quieter sectors are resolved by summary rules calibrated against battle-engine runs. | Keeps the mechanisms that caused the deadlock visible and explainable, and stays fast enough to sweep. The cost is a seam between the layers that must be designed and validated; it is the longest road to the lab. |
| B | One engine, scaled up: the company model over a whole army front for weeks. | One model, no seam, most detail. But a run takes minutes, so sweeps take days, and it needs company-level orders of battle the sources mostly can't supply. |
| C | A division-level model first, built separately and calibrated on aggregate results across many battles. | Fast to build and run. But it loses the mechanisms, so its answers become "the numbers say so" (the black box anti-goal), and it duplicates and may drift from the battle engine's combat rules. |

## The design (approach A)

### Layers and the seam

- **Battle layer.** The Plan 3 engine (companies, 2-minute steps), generalised so either side attacks and fronts may bend.
- **Operational layer.** A new engine at division scale:
  - **Step:** an hour while anything moves or fights, a day when quiet.
  - **State per division:** strength, fatigue, morale, sickness, food, ammunition, position, and orders.
  - **The network:** rail lines, roads, depots, railheads and light railways. Each has a capacity, and the devastated zone degrades them.
  - **Movement:** reserves, guns and supplies move over that network.
- **The seam:**
  - **Down.** When an operational attack goes in on a sector the scenario has detailed (a battle-layer map exists), the battle layer fights it. Forces, supplies and plans go down.
  - **Up.** Ground, casualties, prisoners, guns, morale and the trench state come back up.
  - **Sectors without a battle-layer map** are resolved by summary rules. Their parameters are fitted to many battle-layer runs, and the fit is recorded with its error. Their results are graded "possible" at best, and they explain themselves through the same cause vocabulary.
- **One clock.** The operational clock drives. While a battle-layer fight runs, the operational layer advances in step with it.

### Doctrine across armies and years

- Doctrine files become one per army and year: `bef-1915` … `bef-1918`, `fr-1915` … `fr-1918`, `de-1915` … `de-1918`. The research's "tech tree" timeline (when each method, weapon and organisation arrived) is data.
- Each file follows the doctrine v2 format from Plan 3: every parameter has a description and is sourced or calibrated.
- A **tactics package** is a named override of doctrine parameters, such as "1917 British methods". It lets a run mix tactics with any army or year, and it is graded like any input.

### Playing the general

- **Running live.** The engine runs live in a Web Worker. The player's orders become order messages entered at the player's headquarters at a given minute. They travel through Plan 3's communications model exactly like engine-made orders.
- **What the player sees.** The headquarters picture is the HQ's known state from Plan 3, drawn on the period map. It shows positions as last reported, with the time of each report.
- **What the player can order.** Order types match what a general at that level could actually do:
  - attack an objective;
  - hold;
  - commit or move reserves;
  - change the fire plan or call for fire;
  - relieve a unit;
  - change the timetable.

  The order set per level and nation is data.
- **The game record.** A played game's record holds its orders. Replaying uses those orders in place of the player.

### Credibility

- Every scenario value carries its grade, derived as in Goal 6's table.
- Overlays (what-ifs, tactics packages, generated sectors) carry grades too. A value set outside the limits table is graded "untrue", and the player is told before the run.
- **The post-conflict report**, generated from the run record:
  - **Outcome:** which deadlock condition happened first, when, and why, from the "why" traces.
  - **Inputs:** grades counted and listed, worst first.
  - **Results:** each result's distance from the tested envelope.
  - **History, where it exists:** a historical comparison, factual against the record.

### Generated sectors

- A generator takes a nation, a year, a ground type and a front width. It builds a battle-layer map following the trench-geometry rules for that nation and year: layout, spacing, depth, wire, dugouts, strongpoints, communication trenches and villages.
- **Ground.** For now, modern elevation data of a real region chosen by type. Procedural relief can come later.
- **Order of battle.** It generates a plausible order of battle from the year's establishments.
- **Determinism and grading.** The generator is deterministic for a given seed. Everything it makes is graded "possible", and the generator's rules cite their sources.

### Sequencing (game first, checked as we go)

The owner's priority is engaging, flexible play; checking against history is useful but optional. This order is my call from that priority, and the owner can reorder it:
1. **Plan 3:** the combat model (in progress).
2. **Plan 4:** calibrate on Vimy (kept light), plus the setup and compare screens, plus what-if overlays.
3. **Credibility grades, the limits table and the post-conflict report.** They apply to everything after.
4. **Playing the general, as a corps commander** (the owner's choice: corps first, army later): live engine, headquarters picture, orders, replay.
5. **Either side attacks, bent fronts, and doctrine profiles across armies and years,** checked on **a sector of the German March 1918 offensive** (the owner accepted the recommendation).
6. **The operational layer and sustainment,** with the seam. Checked on **the same March 1918 sector's reserve race**, so one research effort serves both checks.
7. **A French battle: the Verdun counter-offensive of 24 October 1916,** with the French 1916 doctrine profile. This is my pick from the two the owner was offered, because it fits the battle layer best.
8. **Generated sectors.**
9. **Tipping-point sweeps** and their screen.
10. **Optional:** Messines as an untouched check battle, and playing at army level.

## Left to the builder

- **The operational step size,** the summary-rule form, and how its fit is measured.
- **The data format** for networks, sustainment and limits.
- **The order-set format,** and the headquarters picture's drawing.
- **Generator internals,** and which real region supplies relief for each ground type.
- **Performance tuning** within the budgets above.

## Settled with the owner (2026-11-21)

- **Check battles:** a sector of the March 1918 German offensive (either side attacking, and the reserve race), and the Verdun counter-offensive of 24 October 1916 (French).
- **The player-general:** corps first, army later.
- **What-ifs and sweeps are never locked.** Grades carry the warning. Checking against history serves the game and may be dropped.
- **Still the owner's to set as data:** which deadlock conditions apply by default, and their thresholds per scenario.

## Builder's calls (from the design review; the owner can override)

- **Sweeps and speed.** A sweep runs the operational layer, with summary rules standing in for the detailed fights. A single run may switch the detailed battle layer on, at a slower speed. The ≤ 10 s operational budget is for runs with summary rules; with detailed fights, each fight adds its battle-layer time.
- **Doctrine profiles.** A profile is a set of parameter values over a growing set of behaviours.
  - Examples of new behaviours: German 1918 infiltration around strongpoints, Eingreif counter-attacks, cloud gas, flamethrowers, massed tanks, and French methodical-battle methods.
  - They are built when a check battle or the game needs them, not for all twelve army-years in advance.
  - The tech-tree timeline is data saying which behaviours and weapons each army-year may use.
- **Grades for estimates, tuned values and results.**
  - An estimate with written reasoning is "possible", unless a documented limit or range says otherwise.
  - Tuned (calibrated) parameters are "possible", marked as tuned.
  - Results use the same six grades, set by how close a run's conditions are to those of the battles the model has been checked on: forces per km, guns per km, years and doctrine profiles, ground, and weather.
- **The research compendium.** The owner's compendium stays in the owner's Google Doc. It is not copied into the repository unless the owner asks, because it is his private document and the repository is pushed to GitHub. Its rules and dates may be used as drafts graded "possible", cited as the owner's compendium. They are checked against primary sources before anything is treated as factual.
- **Summary rules.** They are first fitted on the real battle maps available: Vimy, then March 1918, then Verdun. Once generated sectors exist, they are refitted and their results regraded.
- **Playing at corps level** uses the battle layer's headquarters pictures and channels from Plan 3. The operational layer gets its own reporting delays when army-level play arrives.
