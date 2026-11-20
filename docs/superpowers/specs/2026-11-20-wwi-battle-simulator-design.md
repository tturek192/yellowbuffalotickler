# WWI Battle Simulator — Design

Date: 2026-11-20
Status: draft for approval

## Intent

A sandbox for re-running World War I battles. You set a battle up on a real
map, with real units, leaders and conditions, then watch it play out as a
time-lapse. Each army fights the way its doctrine said it should in that
year. Run under historical conditions, the battle should come out close to
what really happened. You can then change one thing (half the attackers,
twice the defenders, more guns, other weather, a different commander) and
see how the result changes, and why.

The owner is a historian and is building this for themselves first. Later
it may be released as open source for military historians and wargamers.
Basing it on real history matters because the documented record supplies
the data. It also gives an objective test of whether the model is any good.

The mockups (setup, playback, compare) are on the design canvas:
https://claude.ai/artifact/CviEMDWHGhNyGwzKCZ1nZP

## Goals

1. **A historical replay that comes out right.** Under historical
   conditions, a run should match the record on three measures:
   - **Outcome:** who held what at the end, and which objective lines fell.
   - **Casualties:** each side's losses, in the right range.
   - **Duration:** a battle that took two days doesn't take seven.

   When a run misses on any of these, the simulator must be able to show
   why.
2. **What-if changes.** Change force size (add, remove or scale
   battalions), the amount of artillery and ammunition, weather and season,
   ground conditions, and which leader commands which formation. That
   includes moving a leader in from another sector. Re-run the battle and
   compare against the record and against other runs.
3. **Answers given as a range of outcomes.** Battles involve chance, so a
   what-if runs many times with different random seeds. The answer comes back
   as a distribution, for example "the Germans held Hill 145 in 35% of 200
   runs", not as one result.
4. **Battalions to command, companies to fight.** The user places and
   commands battalions. Inside the engine:
   - attacking battalions move and fight as company-sized waves;
   - defenders sit as company garrisons in specific stretches of trench
     and strongpoints.

   Brigades, divisions and corps are the chain of command above them. This
   was chosen by the owner after the Vimy research showed that the deciding
   events (an un-shelled 100-yard trench, a single machine-gun post, a
   dugout) are smaller than a battalion.
5. **An animated time-lapse of every battle (required in version 1).** Any
   run, historical or what-if, can be watched as an animated time-lapse on
   the map, with a multi-day battle played back in minutes. This is a core
   feature, not an extra. Version 1 isn't done without it. Details are in
   section 9.2.
6. **Visually appealing.** The map is styled like a period trench map, with
   readable unit markers. The engine and data are built so a 3D view of the
   terrain can be added later without reworking them. The 3D view will play
   the same time-lapse.
7. **Every number has a source.** Each historical value in a scenario
   (strengths, guns, timings, casualties) records where it came from, so the
   owner can check it and correct it.

## Non-goals (for now)

- Giving orders during a battle. You set it up and watch it.
- Individual soldiers, or physics for each bullet and shell.
- The 3D view. It comes later, on top of the same engine.
- Fictional maps and worlds.
- Multiplayer, AI opponents to play against, campaign meta-game.
- All ten battles in the first version. The first version is one battle
  working end to end, plus a second battle used to check the model.

## Anti-goals (failure even if it technically works)

- **Overfitting.** A model tuned until Vimy comes out right, which then gets
  the next battle wrong. That would mean the model memorized Vimy rather
  than capturing how WWI combat worked. Tuning parameters are shared across
  battles, and the check battle is never tuned against.
- **A black box.** A result nobody can explain. Every significant event
  must be traceable to its causes: this battalion stalled because the
  barrage moved on, uncut wire held it up, and machine guns in this trench
  were never shelled.
- **Unsourced or invented numbers presented as history.**
- **Too slow to run in batches.** If running a battle 200 times takes hours,
  what-if questions stop being usable.

## Constraints

- Real places on real terrain. The landscape has changed since 1917: there
  are craters, the Vimy memorial, and modern roads and buildings. Terrain
  therefore combines modern elevation data with the historical features
  (trenches, wire, woods, villages, roads, tunnels, craters) taken from
  period trench maps.
- WWI doctrine differs by army and by year. British in 1915 is not British
  in 1917, and Germany switched to defence in depth in 1916–17. Doctrine is
  data selected by army and year, not something hard-coded.
- The owner is a historian, not necessarily a programmer. Scenario data has
  to be readable and editable as text files.
- For now it runs on one person's machine. It should still be easy to
  release as open source later.

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | **Battalion-level combat model on a real map.** Each battalion has a strength, morale, fatigue, ammunition and a position. Every few minutes of battle time, the engine works out fire from rifles, machine guns and artillery, adjusted for terrain, weather, visibility, wire and cover. Doctrine decides what each unit does next. | Fast enough for hundreds of runs. Matches the level of detail in the surviving records (war diaries, artillery plans, casualty returns), so it can be calibrated. On screen you see battalions on a map, not individual soldiers. |
| B | Individual soldiers with physics, in a 3D game engine. | The most cinematic. But a battle has more than 100,000 men, so runs are too slow for batch what-ifs. No records exist at that level, so nothing could check it: it would look realistic without being accurate. |
| C | A, plus a 3D view on top. | Not a separate path. It is A with a later rendering layer, and the engine is built for it from day one. |

**Decision:** A now, with C as a later phase. Chosen by the owner.

## Decided by the owner

- The user sets the battle up and lets it run, with no orders during play.
- Armies follow the historical doctrine of their nation and year.
- The battle year can be selected. Real units and real leaders are used, and
  leaders and units can be swapped in from other parts of the front.
- Battalion-level resolution.
- A historical replay should come close to the record. Different weather or
  season can change the result. The model should behave like a physics
  simulator, but for soldiers and battlefields.
- Real maps. Fictional worlds come later.
- Cover all of the war's major factors: infantry, machine guns, artillery,
  gas, mines and tunnels, wire, aircraft spotting, and tanks where the year
  calls for them.
- A run counts as wrong if:
  - the wrong side wins,
  - casualties are significantly different from the record, or
  - the battle takes far longer or shorter than it did.
- The first what-ifs are force and resource changes: more or fewer troops,
  more or less artillery, a different way of operating.
- Time-lapse playback is fine. 3D would be nice later.
- The owner will add historical context and notes to scenarios.

## Proposed by me, accepted with approach A

- **Start with one battle: Vimy Ridge, 9–12 April 1917.** It is compact and
  very well documented (Canadian war diaries and the corps artillery plan),
  with clear objective lines (Black, Red, Blue, Brown).
- **A second battle to check the model, early on.** My call: **Messines,
  7–14 June 1917.** It is the same year and the same British doctrine, but a
  different army, different terrain and huge mines. Every tuning parameter
  stays exactly as set for Vimy. The owner can choose a different battle.

## The design

### 1. Architecture

```
scenario files (text, sourced)  ──►  engine (pure, deterministic)  ──►  run record
                                         ▲                                  │
              doctrine + weapon tables ──┘                                  ▼
                                                     UI: setup · playback · compare
                                                     batch runner · calibration report
```

- **Engine.** A self-contained simulation library. It takes a scenario and
  a random seed and produces a run record. It has no UI code. Given the
  same scenario, seed and engine version, it always produces the same
  result.
- **Run record.** The state of every unit at each snapshot, an event log
  where each entry is tagged with its causes, and summary metrics. Playback,
  comparison and the later 3D view all read from this record. None of them
  re-run the simulation.
- **Batch runner.** Runs one scenario across many seeds, in parallel. It
  works from the command line (for calibration) and from the UI (for
  what-ifs). It reports distributions.
- **Calibration report.** For each historical scenario, compares the batch
  distribution with the record on outcome, casualties and duration, and
  shows pass or fail against a tolerance.

### 2. Technology (my calls)

- TypeScript for everything, in one repository.
- The engine runs in Node for the command line and batches, and in a Web
  Worker in the browser.
- The app is a browser web app: setup, playback and compare.
- Scenario data lives as text files (YAML or JSON, the builder's choice)
  inside the repository.
- A later 3D view would use WebGL (three.js or deck.gl terrain) and read the
  same run record.

### 3. World model

- **Terrain grid.** Cells about 50 m across (the builder may tune the size).
  Each cell holds:
  - elevation, from a public DEM;
  - ground type and the cover it gives, such as chalk, clay, woods or
    built-up areas;
  - how passable it is, and how that worsens with rain and shelling;
  - line-of-sight data.

  Historical features sit on top: trenches (front, support and reserve),
  wire belts, dugouts, tunnels and subways, mine craters, roads and light
  rail.
- **Time.** A fixed step of about 2 minutes of battle time, tunable. Quiet
  periods can be fast-forwarded.
- **Weather and light.** A timeline of precipitation, wind, visibility and
  temperature. It feeds visibility and spotting, gas behaviour, mud and
  movement, and morale and fatigue. Day and night follow the real date and
  place.

### 4. Units and leaders

- **Battalion state:**
  - men by role (riflemen, Lewis guns, bombers);
  - attached machine guns and trench mortars;
  - ammunition and bombs;
  - morale and cohesion, suppression, fatigue;
  - training for this specific operation;
  - position and formation;
  - current orders.
- **Higher formations:** brigades, divisions, corps and army hold the plan,
  the reserves and the artillery. Above battalion level they don't fight.
- **Artillery:** batteries by calibre and type, each with an ammunition
  allocation and an observation method (forward observers, aircraft, map
  shooting). They fire fire plans: creeping barrages, standing barrages,
  counter-battery and wire-cutting.
- **Leaders:** a small set of attributes that affect behaviour:
  - planning quality;
  - how quickly orders get through and reaction time;
  - willingness to adapt the plan;
  - how much risk they accept;
  - effect on morale.

  Attributes come from a written rubric with a source and justification
  for each rating. The owner sets and owns these ratings.

### 5. Combat resolution, each step

1. **Command and control.** Orders and reports pass along the chain with
   realistic delays: runners, telephone where the lines survive, pigeons,
   visual signals. Losing contact is part of the model.
2. **Doctrine and behaviour.** Each unit picks its action from its orders,
   its army's doctrine for that year and its current state. Examples:
   British 1917 platoon tactics under SS 143, following the barrage and
   leapfrogging; German 1917 defence in depth with counter-attack
   divisions.
3. **Artillery fire.** Fire plans hit cells and the units in them. Effect
   depends on calibre, rate, accuracy, how well the target is observed, how
   deep the dugouts are, and whether the ground is soft. Shelling also cuts
   wire and churns the ground.
4. **Direct fire.** Rifle and machine-gun fire between units that can see
   each other. Effect depends on range, visibility, the target's posture,
   cover and suppression.
5. **Casualties and suppression.** Losses are applied, split into killed,
   wounded and captured. Suppression changes what units can do next.
6. **Morale.** Units with enough losses, isolation or suppression go to
   ground, fall back or surrender.
7. **Movement.** Shaped by terrain, mud, wire, gaps in the wire, and
   formation.
8. **Logging.** Significant events go into the log, tagged with their
   causes.

The rates and modifiers live in **weapon and effect tables**, which are data,
not code. Each table entry cites its source, or is marked as a calibrated
parameter. Calibrated parameters are few, shared across all battles, and
reported in the calibration report.

### 6. Scenario data (per battle)

- Map extent, terrain sources, and the historical features (from
  georeferenced trench maps).
- Order of battle for both sides down to battalion level, with strengths at
  zero hour.
- The plan:
  - objective lines and timetable;
  - barrage tables;
  - assignments of units to objectives;
  - the defender's dispositions and counter-attack plan.
- Artillery park and ammunition.
- Weather timeline.
- The historical result, used for validation:
  - objectives and when each fell;
  - casualties by side (by division where known);
  - prisoners;
  - duration.
- The owner's historical notes.
- A source on every value, or a flag marking it as an estimate.

What-if changes are saved as an overlay on a historical scenario ("Vimy,
but Germans ×2"), so the original data stays untouched.

### 7. Validation and calibration

- **Measures:** outcome (which objectives were held at the end), casualties
  by side, and duration (when each objective fell and when the battle
  ended).
- **Pass criteria (my proposed defaults; the owner can change them):**
  - the historical winner wins in most runs;
  - the historical casualty figure falls within the middle 80% of simulated
    runs, and the median is within ±25%;
  - the battle ends within ±1 day of its historical length, or ±30% for
    longer battles.
- **Process:**
  1. Calibrate the shared parameters on Vimy.
  2. Run Messines with no changes and report how it does.
  3. When the check battle fails, fix the model, not the Messines numbers.

### 8. Explanation ("why did this happen?")

- Every important event records the factors behind it, for example:
  barrage had moved on · wire uncut · MG nest unobserved · leader slow to
  react.
- The playback screen lets you click an event or a stalled unit and see
  that chain of causes.
- The compare screen points to where two runs first split apart. For
  example: "Run B: German MGs spotted the first wave at 05:38 because
  visibility was 900 m instead of 150 m."

### 9. UI (from the mockups)

1. **Setup:**
   - campaign and battle picker;
   - conditions (date, weather presets plus custom, ground);
   - commander list with swap;
   - order-of-battle tree with a battalion inspector;
   - force changes (scale, add or remove units, artillery amounts);
   - the trench-style map with layer toggles and unit markers you can drag
     into a new position.
2. **Playback, the animated time-lapse (required in version 1):**
   - **What moves on the map:**
     - Company and battalion markers move smoothly between snapshots. Each
       marker shows strength, and morale and suppression state.
     - Each side's front line is redrawn as it moves.
     - Captured ground fills in.
     - The creeping barrage is drawn as a moving band. The standing barrages
       and the machine-gun barrage zone are drawn too.
     - Shell bursts and fire are suggested, not literal. They are thinned
       out at high speeds.
     - Trenches change state as wire is cut, trenches are taken and craters
       are blown.
     - German reserve columns move in from the edge of the map.
     - Weather is overlaid on the map (snow, sleet, rain, mist), along with
       day and night.
   - **Controls:**
     - play and pause;
     - speeds from 1 second = 1 minute up to 1 second = 6 hours;
     - skip quiet periods automatically;
     - a timeline scrubber you can drag to any moment, with markers where
       objectives fall and key events happen;
     - step forward or back by event.
   - **Zoom:** the corps view shows battalions. Zooming in breaks them
     into companies, trench segments and strongpoints.
   - **Alongside the map:** a battle clock, the objectives tracker, running
     totals, and the event log. Clicking an event jumps the playback to
     that moment. Clicking an event or a stalled unit opens the "why" trace.
   - **Side by side:** two runs, or a run beside the historical timeline,
     played in sync.
   - **Built from the run record.** Playback reads the saved run record and
     never re-runs the simulation. That makes scrubbing instant, and any
     run from a batch can be watched again later.
   - **Export:** save a time-lapse as a video file to share. This can follow
     shortly after the in-app playback.
3. **Compare:**
   - the historical record beside the what-if runs (the batch distribution
     for each);
   - a chart of when each objective fell compared with the record;
   - the owner's notes.

### 10. Later

- 3D terrain view on top of the run record.
- More battles. A starting list for the owner to pick from: Vimy Ridge,
  Messines, Somme (1 July 1916), Passchendaele, Cambrai 1917, Hamel 1918,
  Amiens 1918, Neuve Chapelle 1915, Verdun (Fort Douaumont), Mons 1914.
  Smaller engagements are welcome too.
- A fully custom scenario editor, such as 300 divisions on the Seine.
- Fictional maps.
- Open-source release.

### 11. Who gathers the data (decided by the owner)

- **The builder researches and compiles Vimy Ridge from published sources.**
  The owner then reviews it as the historian.
- Sources to work from include:
  - the Canadian official history (Nicholson, *Canadian Expeditionary Force
    1914–1919*);
  - battalion and brigade war diaries (Library and Archives Canada);
  - the Canadian Corps artillery and barrage plans;
  - digitized trench maps (for example the McMaster University WWI trench
    map collection);
  - German regimental histories and the Reichsarchiv account, for Gruppe
    Vimy;
  - well-regarded secondary works on the battle.
- Every value cites its source. A value that has to be inferred is marked
  as an estimate, with its reasoning.
- Leader ratings are drafted by the builder, with a justification for
  each. The owner owns them and has the final say.
- Research comes first in the plan, and the data goes to the owner for
  review before calibration starts.
- The same process applies to Messines.

### 12. Decisions settled after the builder review (my calls; the owner can override)

- **Commanders make their own decisions after the written plan runs out.**
  - The scenario holds only what was *planned in advance*: objectives,
    timetable, barrage, reserves and counter-attack plans.
  - Everything improvised after that is decided by the engine. That
    includes the follow-up attacks on Hill 145 and the Pimple, and when
    German reserves are committed. The engine decides from doctrine, the
    situation and each leader's attributes.
  - Historical improvised decisions are **never scripted**. They are part
    of what the model is checked against.
  - Reason: if they were scripted, swapping a leader or changing force size
    couldn't change those decisions, and the what-ifs would mean little.
  - This makes a command model at division and corps level, for both sides,
    a core part of the engine.
- **The preliminary bombardment is included, but compressed.**
  - A run starts at zero hour.
  - Before that, a fast pre-battle calculation works out what the days of
    bombardment and counter-battery fire achieved: shells allocated by
    target, wire cut, dugouts and trenches damaged, enemy batteries knocked
    out, ground churned.
  - Its results feed the starting state.
  - Reason: "more guns" or "more shells" what-ifs then really change the
    battle, without simulating two weeks minute by minute.
- **How a run ends and who wins is set per scenario, as data.**
  - A run ends when one of these happens:
    1. the attacker holds its final objectives and no counter-attacks are
       pending;
    2. both sides have stopped attacking for a set lull;
    3. a time cap is reached (several times the historical length).
  - The winner is whoever holds the scenario's named key ground at the end.
    For Vimy that is the ridge crest, Hill 145 and the Pimple. Partial
    results are reported objective by objective.
- **Version 1 is done when Vimy passes, any run can be watched as an
  animated time-lapse, and Messines has an honest report.**
  - A failure at Messines is a result to report, not a blocker.
  - Any change to the model prompted by Messines is logged. After such a
    change, Messines no longer counts as untouched, and a third battle
    becomes the next true check.
- **The owner edits doctrine parameters, not doctrine logic.**
  - Behaviours are written in code.
  - Their parameters are data files, with a plain-language description of
    each. Examples: how closely infantry follow the barrage, wave spacing,
    how long before a counter-attack, how deep the defence is.
- **Disputed figures become target ranges.**
  - Where sources disagree, as they do over German losses at Vimy, the
    target is the documented range, with each source cited and the time
    window and area stated.
  - A run passes if the simulated median falls inside that range.

### 13. What the first Vimy research changed (owner-approved)

The owner's research brief on Vimy, covering doctrine, order of battle,
artillery, terrain and outcomes, sharpened the model. The engine must
include the following.

1. **Company-level resolution.** See Goal 4.
   - About 80 German company garrisons are placed by trench segment and
     strongpoint. Each has a paper strength and an actual strength (about
     150 men against 264 on paper).
   - Canadian battalions break down into their assault waves, mopping-up
     parties and supporting companies.
2. **The gap between the infantry and the barrage is the central
   variable.**
   - Each attacking company tracks how far it is behind the barrage.
   - While it stays close, defenders in dugouts stay suppressed.
   - If it falls behind, defenders come up and machine guns are manned
     again.
   - The barrage pace (100 yards in 3–5 minutes) and the pauses at each
     objective line come from the fire plan.
3. **Bombardment results are tracked trench by trench.**
   - The compressed bombardment calculation (section 12) produces, for each
     stretch of trench, how much of the wire was cut, damage to dugouts,
     damage to the trench, and the garrison's losses.
   - Any stretch can be marked "missed" or "spared". The 87th Battalion's
     front is the historical case.
4. **Dugouts and mopping up.**
   - Captured trench leaves behind dugout points that must be cleared.
   - If they are not cleared, they can attack later waves from behind.
5. **German reserves off the map, with march times.**
   - Reserve and Eingreif divisions start a set distance behind the front
     (24 km historically).
   - Getting to the battle takes an order delay plus marching time.
   - Historical targets:
     - local counterattacks within 1–3 hours;
     - the divisional counterattack ordered at about noon and launched at
       18:00;
     - the 111th Division at the third line on the evening of 9 April;
     - the 4th Guards Division on 11 April.
   - Reserve distance is a key what-if: 5 km, as German doctrine called for.
   - Counterattacks uphill onto the crest are penalized.
6. **German batteries recover over time.**
   - At Zero most German battery positions are suppressed (historically
     about 83% of them).
   - They recover over the following hours.
   - Their defensive fire is weak but never zero.
7. **Communications by channel.**
   - Channels: buried cable, surface line, runners, visual signals,
     pigeons, power buzzers, wireless, aircraft contact patrols.
   - Each channel has its own delay and failure rate.
   - Historically, reports from the front reached corps 40–120 minutes
     after the event.
   - Artillery liaison officers and emergency "LL" calls make calls for fire
     faster where buried cable exists.
8. **Officer losses.**
   - Leaders within each company and battalion can be lost.
   - Units trained under SS 143 keep going under NCOs with a smaller
     penalty than units trained the 1916 way.
9. **Flank forces off the map.**
   - I Corps and XVII Corps artillery fire along the German lines, and the
     24th Division attacks the Pimple on 12 April.
   - They are modelled as scheduled off-map fire and attacks, not as
     simulated units.
10. **Air control affects observation.**
    - Air superiority sets how well artillery can observe its fire. Air
      observers adjusted about 75% of counter-battery shoots.
    - It is a scenario setting, not a simulated air war.
11. **Smaller mechanics:**
    - tanks bogging down;
    - the indirect machine-gun barrage, a moving zone ahead of the infantry;
    - gas shells killing draught horses, so guns can't be withdrawn and are
      overrun;
    - ammunition left for repelling counterattacks after the assault.
12. **Mostly a timetable for the attacker on 9 April.**
    - Corps fixes the clock, and companies manoeuvre only within each
      phase.
    - Engine decision-making is needed mainly for:
      - German reserves and counterattacks;
      - Canadian units once the plan breaks down (4th Division, 9–10
        April);
      - follow-up operations.
    - The Pimple attack (10th Brigade) was a planned phase that was
      rescheduled. Its plan is scenario data, and the engine decides when
      it goes in.
13. **More detailed validation targets.**
    - The time each objective line fell, by division. For example, the
      Black Line about Zero plus 45–55 minutes, the Blue Line about 11:00,
      the Brown Line about 14:00.
    - Battalion losses where known. For example, the 87th and 102nd each
      lost over 300 men on 9 April.
    - German division losses: 79th Reserve Division 3,473 and 1st Bavarian
      Reserve Division 3,133, for 1–11 April.
    - Prisoners: 3,404 to about 4,000.
    - Guns captured: 54 or 63.
    - Because the German division figures include the bombardment
      period, the compressed bombardment calculation must also produce
      casualties, so like is compared with like.
14. **Treating the research brief.**
    - Its suggested terrain multipliers and battalion effective strengths
      are starting values for tuning, not historical record.
    - Before a figure is used as a historical value to test against, it is
      checked against primary or scholarly sources: Nicholson, the war
      diaries, Sheldon and Cave, Godefroy.
    - Known conflicts are kept as cited ranges:
      - the northern German division (16th or 14th Bavarian);
      - reserve distance ("two-hour march" or 24 km);
      - the length of the Goodman subway;
      - the 1st Division's depth of advance;
      - the length of the halt on the Blue Line;
      - counter-battery claims;
      - the time of the 85th Battalion's attack.

## Left to the builder

- Exact grid cell size, time step and performance tuning, within the goal
  of batch runs taking minutes, not hours.
- Data file format, internal engine structure, map rendering library.
- How the trench maps are georeferenced and digitized into features.
- Exact form of the rating rubric and the cause-tagging scheme, within the
  principles above.
