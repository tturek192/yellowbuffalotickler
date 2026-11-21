# Plan 3: The Combat Model Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make battles fight. This plan turns the movement-only engine into the combat model of spec sections 4, 5, 12 and 13:
- the compressed preliminary bombardment;
- artillery and direct fire;
- casualties, suppression, morale and officer losses;
- the gap between infantry and barrage;
- dugouts and mopping up;
- communications by channel;
- a command model in which leaders decide what the written plan leaves open;
- off-map reserves;
- run end and the winner;
- the "why" trace.

The time-lapse shows all of it. The full Vimy scenario then runs to its end, and the plan closes with an honest first report against the historical record. There is no tuning: calibration is Plan 4.

**Architecture:**
- **Data first.** Tasks 1–4 define every new format and fill it:
  - weapon and effect tables (`tables/`);
  - doctrine v2, with a plain-language description on every parameter;
  - scenario v3 sections for the bombardment, defences, communications, planned operations, off-map forces, air and end conditions;
  - the researched Vimy values for all of these.
- **The engine.** Tasks 5–16 rebuild the engine's step as the spec's fixed pipeline: command, behaviour, artillery, direct fire, resolution, morale, movement, logging.
  - Each mechanism is its own module with its own tests.
  - Each mechanism is tested on small fixtures for direction and conservation ("more machine guns, more attacker losses"), never against remembered history.
- **The app.** Tasks 17–18 extend the time-lapse:
  - battalion markers at corps zoom and companies when zoomed in;
  - strength, morale and suppression on markers;
  - the moving front, captured ground and trench states;
  - reserves, weather and night;
  - running totals and the "why" panel.
- **The report.** Task 19 runs Vimy and writes the first model report.
- **The period style.** Task 20 dresses the time-lapse in the owner's chosen period map style.

**Tech Stack:**
- TypeScript (strict), npm workspaces, Zod 3, `yaml`, Vitest 5.
- Vite 8, React 18.3, Canvas 2D, Playwright 1.63.0.
- Node `worker_threads` for parallel batches, in the CLI only.

**Spec:** `docs/superpowers/specs/2026-11-20-wwi-battle-simulator-design.md`. The sections that bind this plan are 3, 4, 5, 8, 9.2, 12 and 13.

## Global Constraints

- **Plan 1's and Plan 2's Global Constraints still hold.** In particular:
  - TypeScript strict;
  - every historical value is sourced, an estimate or disputed;
  - the engine is deterministic and imports no DOM, React or `node:*`;
  - doctrine parameters live in data;
  - playback reads run records only;
  - coordinates are local metres, with x along the attack bearing and y to its left;
  - research honesty and the allowed research hosts;
  - the scenario keeps `status: draft`.
- **Every model number is data.**
  - Weapon, effect, cover, channel and march values live in `tables/*.yaml`. Behaviour parameters live in `doctrine/*.yaml`.
  - Every entry carries a `description` in plain language, and is either sourced or `{ value, estimate, calibrated: true }`.
  - Engine code holds no model constants, only unit conversions.
  - (Spec sections 5 and 12: "The rates and modifiers live in weapon and effect tables, which are data, not code"; "The owner edits doctrine parameters, not doctrine logic".)
- **No tuning in this plan.**
  - Calibrated parameters keep their documented starting values.
  - Nothing is adjusted to make Vimy come out right. Plan 4 calibrates, on shared parameters (spec, anti-goal "Overfitting").
  - Tests check direction, conservation and determinism, never that a historical number is matched.
- **Improvised historical decisions are never scripted** (spec section 12).
  - The scenario holds only what was planned in advance.
  - Historical decision times (`reserves[].orderedAt`, `historical.reserveArrivals`, the 85th Battalion's evening attack) are validation targets. They are never inputs.
- **Every significant event carries causes** from the fixed vocabulary `CAUSES` (Task 5), plus `refs` to the earlier events that led to it (spec section 8).
- **Conservation.** For every company at every step:
  - `men + killed + wounded + captured = men at Zero (after the bombardment)`;
  - nothing goes negative;
  - nothing is NaN.
- **Determinism under combat.**
  - Units are processed in ascending `id` order.
  - Damage is gathered first, then applied all at once.
  - Every random draw comes from the run's `createRng(seed)`, in a fixed order.
  - Iteration order never depends on `Map` or `Set` insertion order.
- **ENGINE_VERSION and the golden hash change together.**
  - Task 5 sets 0.3.0. Every later task that changes engine output bumps the patch version (0.3.x) and re-pins `packages/engine/src/draft-scenario.test.ts` in the same commit.
- **Performance budget** (spec anti-goal "Too slow to run in batches"):
  - one full Vimy run (Zero to the end condition, at most 12 April 23:59) takes ≤ 3 s on this machine;
  - `sim batch --runs 200 --workers 4` takes ≤ 5 min;
  - a full Vimy run record is ≤ 8 MB of JSON.
- **The battalion is what the user sees and the company is what fights** (spec Goal 4 and 9.2). At corps zoom the time-lapse shows battalions; zooming in shows companies.

## The model, in one page

This section holds the decisions that span tasks. Each task implements its part and cites it.

**Step pipeline.** Each step of `dt` minutes runs these phases in order:
1. `comms`: deliver due messages and update each HQ's picture.
2. `command`: HQs decide, and send orders as messages.
3. `behaviour`: each company picks an intent.
4. `artillery`: barrages advance, and every artillery effect is gathered as pending damage.
5. `directFire`: rifle, Lewis gun and machine-gun fire, gathered as pending damage.
6. `resolve`: apply casualties (killed or wounded), suppression and officer losses, all at once.
7. `morale`: update morale and change state (pinned, falling back, surrendered).
8. `movement`: move units; capture trench segments; leave dugout points behind; march reserves.
9. `log`: line-taken checks, events with causes and refs.

The step is `stepMin` (2) while anything is in contact or a barrage is lifting. Otherwise it is `quietStepMin` (doctrine; 10).

**Fire.** For each firer F and target T, F's weapons give an expected hit count:

```
hits = Σ_w  n_w · rpm_w · dt · lethality_w · exp(−r / rangeScale_w) · [r ≤ maxRange_w]
            · cover[T.posture][ground at T] · min(1, T.men / densityRefMen)
            · visibility(r, weather, light) · observation(F) · (1 − F.suppression) · leadFactor(F)
```

- Casualties are `stochasticRound(min(hits, T.men))`, then split into killed and wounded by `killedFrac`.
- Each casualty is an officer with probability `officers / men × officerExposure`.
- Captured men come only from surrender or from being trapped in dugouts.
- Artillery works the same way, with `n_w` set to guns firing on a 100 m frontage, and with dugouts protecting in proportion to their depth.

**Suppression and morale.**
- **Suppression:** `s ← min(1, s + suppressPerRound · rounds / max(men, 1))`, then `s ← s · 2^(−dt / suppressionHalfLifeMin)`.
- **Morale at the start:** `m₀ = baseMorale + leaderMoraleStep · (moraleEffect − 3) + trainingBonus`.
- **Morale each step:** `m ← m − lossShock · (casualties / men) − suppressedDrain · s · dt/60 − isolationDrain · dt/60`, recovering by `recoveryPerHour · dt/60` (up to `m₀`) when no fire came in.
- **States:**
  - `m < goToGround` or `s > pinSuppression` means pinned;
  - `m < fallBack` means falling back;
  - `m < surrender` with an enemy within `closeRangeM` means surrendered: all men become captured.
- **Officers:** when `officers = 0`, speed and fire are multiplied by `1 − ncoPenalty[training]`. Training is `rehearsed` (SS 143) or `standard`, and the rehearsed penalty is the smaller.

**The gap** (spec 13.2).
- Each German trench segment records the minute the barrage band last covered it.
- Its garrison stays in its dugouts while the barrage is on it. It emerges `emergeMin` after the barrage lifts, and from then on it can fire.
- Each attacking company logs `gapM = barrageX − x`.
- If attackers reach a segment before its garrison emerges, the garrison is trapped:
  - a `trappedSurrenderFrac` share surrenders;
  - the rest become dugout points, which must be cleared.

**Bombardment** (spec 12 and 13.3). This is a pre-battle pass over trench segments. Each segment gets:

```
wireCut      = 1 − exp(−wireRounds · cutPerRound / (beltDepthM · segmentLengthM))
trenchDamage = 1 − exp(−trenchRounds · damagePerRound / segmentLengthM)
dugoutDamage = 1 − exp(−heavyRounds · dugoutPerRound / (segmentLengthM · dugoutDepthM))
garrisonLoss = men · lossRate · trenchDamage · (1 − dugoutDepthM / (dugoutDepthM + safeDepthM))
```

- Rounds are allocated in proportion to each segment's share of the allotted frontage. Spared segments get none.
- German batteries start the battle with `suppressedAtZeroFrac` of them silenced. They recover with `batteryRecoveryHalfLifeMin`.
- Bombardment losses are counted in the summary as their own period, so they can be compared with targets whose windows include the bombardment (spec 13.13).

**Command.**
- Each HQ (battalion, brigade, division, corps, Gruppe or army) knows only the reports that have reached it.
- Reports and orders travel as messages over channels. Each channel has a delay and a failure rate (tables), and the scenario says which channels each side has between which levels.
- Decisions are rules in code with doctrine parameters, adjusted by the HQ leader's ratings:
  - `orderSpeed` scales delays;
  - `adaptiveness` sets how soon the plan is changed;
  - `riskTolerance` sets the force ratio accepted for an attack;
  - `planning` scales how tightly units keep to the timetable;
  - `moraleEffect` sets subordinates' starting morale.
- Where a formation has no leader, its ratings count as 3.

**Run end and winner** (spec 12). A run ends at the first of:
1. the attacker holds every final objective line and no counter-attack is ordered or under way;
2. neither side has started an attack for `end.lullMin`;
3. `timeLimitMinutes` is reached.

The winner is the side holding `end.keyGround` at the end. Partial results are reported per objective.

## Review Focus

1. **Lopsided what-ifs.** Examples: zero artillery, attackers ×0.5, defenders ×2, reserves at 0 km, no machine guns.
   - The run must reach an end with conservation intact and no NaN or negative numbers.
   - It must not spin forever in a lull that never ends.
   - (Task 15 property test across those variants.)
2. **A scenario missing the new optional data.** The Plan 1 draft has no bombardment, communications, weather, terrain or end conditions.
   - It must still run, using documented defaults.
   - The record's `defaultsUsed` must list every default applied, so nothing silently changes.
   - (Task 5 test.)
3. **Determinism.** The same seed must give a byte-identical record, whether run alone or inside a batch on a worker thread. Iterating companies in a shuffled input order must not change the result. (Task 5 test; Task 15 worker test.)
4. **Runaway size and time.** A four-day Vimy run must stay within the 8 MB record and 3 s run budgets, measured on the real scenario rather than a fixture. (Task 15 test.)
5. **An event the user can't explain.**
   - Every event of kind `company-pinned`, `company-fell-back`, `company-surrendered`, `segment-lost`, `line-taken`, `counter-attack-ordered` or `reserve-arrived` must have at least one cause.
   - Every `ref` must point to an earlier event.
   - (Task 16 test over a full Vimy run.)

---

### Task 1: Formats for the model (tables, doctrine v2, scenario v3)

**Files:**
- Create:
  - `packages/scenario/src/tables.ts`
  - `packages/scenario/src/doctrine.ts` (moves `DoctrineSchema` out of `schema.ts`)
  - `tables/README.md`
- Modify:
  - `packages/scenario/src/schema.ts`
  - `packages/scenario/src/references.ts`
  - `packages/scenario/src/load-node.ts`
  - `packages/scenario/src/test-fixtures.ts`
  - `packages/scenario/src/index.ts`
  - `doctrine/bef-1917.yaml` and `doctrine/de-1917.yaml` (reshaped to v2, keeping today's values, which Task 2 replaces)
- Test:
  - `packages/scenario/src/tables.test.ts`
  - `packages/scenario/src/doctrine.test.ts`
  - `packages/scenario/src/schema-v3.test.ts`

**Interfaces:**
- **Produces: `Param`.**
  - `Param = Sourced<number> & { description: string; calibrated?: true }`.
  - `calibrated: true` is allowed only with an `estimate`.
  - Exported as the Zod `ParamSchema`.
- **Produces: `Tables`**, loaded by `loadTables(dir): Tables` from `@wwi/scenario/node`. It merges every `tables/*.yaml`.
  - `weapons: Record<WeaponId, { kind: 'small-arms' | 'lewis' | 'mg' | 'field-gun' | 'howitzer' | 'heavy' | 'mortar'; rpm: Param; maxRangeM: Param; rangeScaleM: Param; lethality: Param; suppressPerRound: Param; shellKg?: Param }>`
  - `cover: Record<Posture, Record<Ground, Param>>`, where:
    - `Posture = 'moving' | 'prone' | 'in-trench' | 'in-dugout'`;
    - `Ground = 'open' | 'cratered' | 'wood' | 'village' | 'trench'`.
  - `channels: Record<ChannelKind, { delayMin: Param; failPerHour: Param }>`, where `ChannelKind = 'buried-cable' | 'surface-line' | 'runner' | 'visual' | 'pigeon' | 'power-buzzer' | 'wireless' | 'contact-patrol'`.
  - `effects: Record<EffectKey, Param>`, with exactly these keys:
    - `killedFrac`, `officerExposure`, `densityRefMen`, `suppressionHalfLifeMin`;
    - `cutPerRound`, `damagePerRound`, `dugoutPerRound`, `safeDepthM`, `lossRate`;
    - `batteryRecoveryHalfLifeMin`;
    - `mudSpeedFactor`, `wireSpeedFactor`, `uphillPenaltyPer10m`;
    - `nightVisibilityM`, `twilightMin`;
    - `tankBogPerKm`, `horseLossPerGasRound`.
- **Produces: `Doctrine` v2.**
  - Common fields: `id`, `title` and `sources`.
  - `common: Record<CommonKey, Param>`:
    - `baseMorale`, `goToGround`, `fallBack`, `surrender`, `pinSuppression`;
    - `lossShock`, `suppressedDrain`, `isolationDrain`, `recoveryPerHour`;
    - `leaderMoraleStep`, `closeRangeM`, `quietStepMin`;
    - `baseOrderDelayMin`, `marchKmPerHour`, `deployMin`;
    - `reportEveryMin`, `fatiguePerKm`, `fatigueRecoveryPerHour`.
  - `ncoPenalty: { rehearsed: Param; standard: Param }`.
  - `companyDefaults: { officers: Param; lewisGuns: Param; machineGuns: Param; bombsPerMan: Param; strength: Param; companiesPerBattalion: Param }`.
  - Optional `attack: Record<AttackKey, Param>`:
    - `followDistanceM`, `maxAdvanceMPerMin`, `startJitterMin`, `speedJitterFrac`;
    - `waveSpacingM`, `mopUpRateMenPerMin`, `stallToleranceMin`, `minAttackRatio`;
    - `trainingBonusRehearsed`, `ammoReserveFrac`.
  - Optional `defence: Record<DefenceKey, Param>`:
    - `emergeMin`, `trappedSurrenderFrac`;
    - `localCounterAttackDelayMin`, `divisionalCounterAttackDelayMin`;
    - `counterAttackMinRatio`, `commitReserveWhenLostFrac`.
- **Produces: scenario v3.** Every new field is optional, so Plans 1 and 2 scenarios still load.
  - `utcOffsetMin?: Sourced<number>`.
  - On a company:
    - `officers?`, `lewisGuns?`, `machineGuns?` and `dugoutDepthM?`, each a `Sourced<number>`;
    - `training?: 'rehearsed' | 'standard'`.
  - On an artillery entry:
    - `ammunition?: Count` (rounds for the battle);
    - `observation?: 'forward-observer' | 'aircraft' | 'map'`;
    - `position?: PlacedPoint`;
    - `horseDrawn?: boolean`.
  - `bombardment?: { from: Sourced<LocalDateTime>; allocations: Array<{ artilleryId: string; task: 'wire' | 'trench' | 'battery' | 'harass'; rounds: Count }>; spared: Array<{ featureId: string; yMin: number; yMax: number; reason: Sourced<string> }>; wire: Array<{ featureId: string; yMin: number; yMax: number; beltDepthM: Sourced<number> }> }`.
  - `communications?: { links: Array<{ side: Side; from: FormationKind; to: FormationKind; channels: ChannelKind[] }>; liaison?: Array<{ side: Side; formationId: string; note: Sourced<string> }> }`.
  - `operations?: Array<{ id: string; side: Side; formationId: string; kind: 'attack' | 'counter-attack'; target: { lineId: string; sectorId: string } | { featureId: string }; prerequisite?: { lineId: string; sectorId: string }; notBefore?: LocalDateTime; plan: Sourced<string> }`. These are the written plan's contingent phases. The engine decides whether and when.
  - `offMap?: { fire: Array<{ id: string; side: Side; weapon: WeaponId; guns: Count; window: Window; target: { featureId: string } | { yMin: number; yMax: number; xMin: number; xMax: number }; cite: Sourced<string> }>; attacks: Array<{ id: string; side: Side; name: string; window: Window; targetFeatureId: string; suppressFrac: Sourced<number>; cite: Sourced<string> }> }`.
  - `air?: { superiority: Side | 'contested'; observedFrac: SourcedOrDisputed<number> }`.
  - `end?: { keyGround: Array<{ id: string; name: string; featureId: string }>; lullMin: Sourced<number> }`.
- **Produces: reference checks.**
  - Every `artilleryId`, weapon id, feature id, formation id, line or sector pair and channel kind in these sections must resolve.
  - Errors name the file and index, as Plan 2's loader already does.
- **Consumes:** `sourced`, `sourcedOrDisputed`, `Window`, `Count`, `PlacedPoint`, and the include, provenance and reference machinery from Plan 2.

- [ ] **Step 1: Write the failing tests**

```ts
// tables.test.ts
it('loads tables and rejects a calibrated entry without an estimate', () => {
  expect(() => ParamSchema.parse({ value: 1, source: 'x', description: 'd', calibrated: true })).toThrow(/calibrated.*estimate/);
});
it('rejects a table entry without a description', () => {
  expect(() => ParamSchema.parse({ value: 1, estimate: 'e' })).toThrow(/description/);
});
it('merges every tables/*.yaml and rejects the same weapon id in two files, naming both', () => {
  expect(() => loadTables(fixtureDir('tables-dup'))).toThrow(/18pdr.*a\.yaml.*b\.yaml/);
});
// doctrine.test.ts
it('a v2 doctrine needs every common key with a description', () => {
  const d = structuredClone(minimalDoctrineV2()); delete (d.common as any).baseMorale;
  expect(() => DoctrineSchema.parse(d)).toThrow(/common\.baseMorale/);
});
// schema-v3.test.ts
it('Plan 1 and Plan 2 scenarios still load unchanged', () => {
  expect(loadScenario('scenarios/vimy-1917/1cdn-3bde-draft.yaml').ok).toBe(true);
  expect(loadScenario('scenarios/vimy-1917/scenario.yaml').ok).toBe(true);
});
it('rejects an operation whose prerequisite line/sector pair does not exist', () => {
  const s = minimalScenarioV3({ operations: [opWithPrereq('nope', 'barrage-x')] });
  expect(checkReferences(s, minimalTables())).toContainEqual(expect.stringMatching(/operations\[0\]\.prerequisite.*nope/));
});
it('rejects a bombardment allocation naming unknown artillery', () => {
  expect(checkReferences(minimalScenarioV3({ bombardment: bombWith('ghost') }), minimalTables()))
    .toContainEqual(expect.stringMatching(/bombardment\.allocations\[0\]\.artilleryId.*ghost/));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/scenario/src/tables.test.ts packages/scenario/src/doctrine.test.ts packages/scenario/src/schema-v3.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the schemas, `loadTables`, the reference checks and the fixtures**
  - `checkReferences(s, tables?)` gains an optional `tables` argument; weapon ids are only checked when it is given.
  - Fixtures go in `test-fixtures.ts`: `minimalTables()`, `minimalDoctrineV2()`, `minimalScenarioV3(overrides)`, `opWithPrereq`, `bombWith`.
  - Reshape both doctrine files to v2:
    - move today's four values under `attack:`, and add `description`;
    - fill every other key with `{ value, estimate: "placeholder until Task 2", description }`.
  - `tables/README.md` explains the `Param` shape and what `calibrated` means, for the owner.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS.
- The engine still reads `followDistanceM` etc. Update `companies.ts` to read `d.attack!.followDistanceM`, with no behaviour change.
- The golden hash must not move.

- [ ] **Step 5: Commit**

```bash
git add packages/scenario packages/engine tables doctrine
git commit -m "feat(scenario): formats for weapon tables, doctrine v2 and scenario v3 model data"
```

---

### Task 2: Research — weapon and effect tables, and doctrine v2 values

**Files:**
- Create:
  - `tables/weapons-1917.yaml`
  - `tables/effects.yaml`
  - `tables/channels.yaml`
  - `docs/research/model/tables.md`
  - `docs/research/model/doctrine.md`
- Modify:
  - `doctrine/bef-1917.yaml`
  - `doctrine/de-1917.yaml`
- Test: `packages/scenario/src/tables-data.test.ts`

**Interfaces:**
- **Consumes:** Task 1's formats.
- **Produces:**
  - The weapon ids that later tasks and the Vimy artillery reference: `rifle`, `lewis`, `vickers`, `mg08`, `18pdr`, `4.5in-how`, `60pdr`, `6in-how`, `8in-how`, `9.2in-how`, `stokes-3in`, `2in-mortar`, `9.45in-mortar`, `77mm-fk`, `105mm-lfh`, `150mm-sfh`, `210mm-mrs`, `minenwerfer-light`, `minenwerfer-medium`.
  - If any of these is missing, Task 3's references fail.

**Method:**
1. **Facts get sources.** Rates of fire, maximum ranges, shell weights and establishments (Lewis guns per company under SS 143, MG companies per German regiment) are sourced from the allowed hosts.
   - Ordnance and manual sources on archive.org: *SS 143*, *SS 135*, the German *Grundsätze für die Führung in der Abwehrschlacht im Stellungskriege* (1 March 1917 edition), Hogg's or Bidwell and Graham's works if reachable, and Wikipedia for leads.
   - The tier rule doesn't apply here, because these aren't `historical.*` targets. Tiers must still be honest.
2. **Model coefficients are estimates.** `lethality`, `rangeScaleM`, `suppressPerRound`, `cover` factors, `lossShock` and the like are `calibrated: true` estimates with a starting value and its reasoning.
   - An order-of-magnitude reasoning is enough, e.g. "a machine gun firing 400 rpm at an exposed, moving company at 300 m should cause casualties in single figures per minute". Plan 4 tunes them.
3. **Doctrine values.**
   - **BEF (SS 143 and SS 135):** wave spacing, how far behind the barrage to follow, mopping-up practice.
   - **German (1917 defence in depth):** how quickly defenders emerge, local counter-attack timing ("immediately, before the enemy can consolidate"), and the Eingreif concept.
   - Where a source gives a range, the value is an estimate inside it, with the range in the estimate text.
4. **Notes** in `docs/research/model/*.md` follow Plan 2's format: a value table, Conflicts, and Open questions for the historian.

- [ ] **Step 1: Write the failing test**

```ts
it('every weapon the Vimy artillery names is in the tables', () => {
  const t = loadTables('tables');
  for (const a of vimy().artillery) expect(Object.keys(t.weapons)).toContain(a.weapon);
});
it('no placeholder remains in tables or doctrine', () => {
  expect(JSON.stringify([loadTables('tables'), loadDoctrine('doctrine/bef-1917.yaml'), loadDoctrine('doctrine/de-1917.yaml')])).not.toMatch(/placeholder until Task 2/);
});
it('every calibrated parameter is an estimate and every fact is sourced (no calibrated sourced values)', () => {
  for (const p of allParams(loadTables('tables'))) if (p.calibrated) expect('estimate' in p).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/scenario/src/tables-data.test.ts`
Expected: FAIL. `tables/weapons-1917.yaml` is missing, or Vimy names unknown weapons.

- [ ] **Step 3: Do the research and enter the data, with notes.**
  - If the Vimy artillery's `weapon` strings don't match these ids, rename them in `scenarios/vimy-1917/fireplan.yaml`. Values are not changed, and each rename is recorded in `docs/research/vimy/fireplan.md`.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tables doctrine docs/research/model scenarios/vimy-1917/fireplan.yaml docs/research/vimy/fireplan.md packages/scenario
git commit -m "data(model): weapon, effect and channel tables; BEF and German 1917 doctrine parameters"
```

---

### Task 3: Research — Vimy defences and the bombardment

**Files:**
- Create:
  - `scenarios/vimy-1917/bombardment.yaml` (included from `scenario.yaml`)
  - `docs/research/vimy/bombardment.md`
- Modify:
  - `scenarios/vimy-1917/oob-german.yaml` (per company: `machineGuns`, `dugoutDepthM`)
  - `scenarios/vimy-1917/oob-canadian.yaml` (per company: `officers`, `lewisGuns`, `training`)
  - `scenarios/vimy-1917/fireplan.yaml` (artillery `ammunition`, `observation`, `position`, `horseDrawn`)
  - `scenarios/vimy-1917/scenario.yaml`
  - `scenarios/vimy-1917/sources.yaml`
- Test: `packages/scenario/src/vimy-defences.test.ts`

**Method:**
1. **The bombardment.**
   - Its start (Phase I from 20 March, Phase II, "the week of suffering", from 2 April) and its rounds by task. Nicholson ch. VIII and BOH 1917 vol. I are cached; the RCA essay is on rca-arc.org.
   - Wire belts in front of the German positions, with their depth.
   - Spared stretches. The 87th Battalion's front is the historical case: the stretch left un-shelled to keep it for the attackers' use, and what that cost.
2. **German companies.**
   - Machine guns per company: from the regiment's MG companies spread over its front-line companies. Say so in the estimate.
   - Dugout depth (deep mined dugouts in the first position).
3. **Canadian companies.**
   - Officers per company (establishment, less those left out of battle).
   - Lewis guns per company (SS 143: four).
   - `training: rehearsed` for battalions that rehearsed on the taped course. Nicholson describes this; cite it.
4. **Artillery entries.** Ammunition for the battle, observation method, battery positions (Map 7 shows some, from Plan 2's Task 7), and whether horse-drawn.
5. Anything not found is an estimate with its reasoning, or left out where optional.
   - Leave nothing out that the model needs a default for: the engine falls back to doctrine `companyDefaults` and records that it did.
   - Every value is sourced, an estimate or disputed.

- [ ] **Step 1: Write the failing test**

```ts
it('the bombardment allocates rounds that exist in the artillery park, and every wire belt and spared stretch lies on a German trench', () => {
  const s = vimy();
  for (const a of s.bombardment!.allocations) expect(s.artillery.map(x => x.id)).toContain(a.artilleryId);
  for (const w of [...s.bombardment!.wire, ...s.bombardment!.spared]) expect(feature(s, w.featureId).side).toBe('central');
});
it("records the 87th Battalion's front as spared, with its reason sourced", () => {
  expect(vimy().bombardment!.spared.some(x => 'source' in x.reason)).toBe(true);
});
it('every German garrison has machine guns and dugout depth (sourced, estimated or disputed)', () => {
  for (const c of companiesOf(vimy(), 'central').filter(c => c.role === 'garrison')) {
    expect(c.machineGuns).toBeDefined(); expect(c.dugoutDepthM).toBeDefined();
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/scenario/src/vimy-defences.test.ts`
Expected: FAIL.

- [ ] **Step 3: Do the research and enter the data, with notes**

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scenarios/vimy-1917 docs/research/vimy packages/scenario
git commit -m "data(vimy): bombardment plan, wire, spared stretches, garrison machine guns and dugouts, battery details"
```

---

### Task 4: Research — Vimy command, communications, planned operations, flanks and end conditions

**Files:**
- Create:
  - `scenarios/vimy-1917/command.yaml` (included from `scenario.yaml`): `communications`, `operations`, `offMap`, `air`, `end`
  - `docs/research/vimy/command.md`
- Modify:
  - `scenarios/vimy-1917/oob-canadian.yaml`: the 85th Battalion's C and D Companies and the 46th's A and B lose `startAfterMin: 750` and become `role: reserve`. Their evening attack is improvised, so it is a target, not an input.
  - `scenarios/vimy-1917/historical.yaml`: it keeps the 85th's attack time as a target.
  - `scenarios/vimy-1917/scenario.yaml` (adds `utcOffsetMin`)
  - `scenarios/vimy-1917/sources.yaml`
- Test: `packages/scenario/src/vimy-command.test.ts`

**Method:**
1. **Communications.**
   - Buried cable forward to which level. Nicholson and BOH describe the buried cable system dug before the attack.
   - Runners, visual signals, pigeons, power buzzers and wireless where sourced.
   - Contact patrols by aircraft.
   - Artillery liaison officers.
   - The German side's links.
   - Report-to-corps delays in the record (40–120 min, spec 13.7) are targets. They go in `docs/research/vimy/command.md`, not into the inputs.
2. **Planned operations.** These are the written plan's contingent phases, never what was improvised:
   - the 10th Brigade's planned second phase against the Pimple and the east slope of Hill 145, which was rescheduled;
   - any planned exploitation.
   - **German:** the counter-attack plans of the front divisions and the Eingreif doctrine as written for this sector.
   - Each operation's `plan` cites the order or account that shows it was planned in advance.
3. **Off-map forces.**
   - The flank fire of I Corps and XVII Corps along the German lines.
   - The British 24th Division's attack south of the Souchez on 12 April, as a scheduled suppression of the Pimple's flank.
   - Both cited.
4. **Air control** in April 1917: the RFC's observation for the artillery despite "Bloody April". `observedFrac` is about 0.75 of counter-battery shoots (spec 13.10); find and cite that figure, or leave it disputed.
5. **End conditions.**
   - `keyGround` is the ridge crest, Hill 145 and the Pimple. Use the Plan 2 feature ids `hill-145` and `the-pimple`; for the crest, use a strongpoint or ridge feature added in `features.geojson` with its source.
   - `lullMin` is an estimate with its reasoning.
6. **`utcOffsetMin`.** Find out whether British Summer Time was in force on 9 April 1917 (it began on 8 April 1917, per the Summer Time Act's 1917 order), and which clock Nicholson's times use. This is a sourced or disputed value.

- [ ] **Step 1: Write the failing test**

```ts
it('no improvised attack is scripted: no company starts after Zero + 600 except through an operation', () => {
  for (const c of attackingCompanies(vimy())) expect(v(c.startAfterMin!)).toBeLessThan(600);
});
it('every operation cites a written plan and its target resolves', () => {
  for (const o of vimy().operations!) { expect('source' in o.plan || 'estimate' in o.plan).toBe(true); }
  expect(checkReferences(vimy(), loadTables('tables'))).toEqual([]);
});
it('key ground includes Hill 145 and the Pimple', () => {
  expect(vimy().end!.keyGround.map(k => k.featureId)).toEqual(expect.arrayContaining(['hill-145', 'the-pimple']));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/scenario/src/vimy-command.test.ts`
Expected: FAIL.

- [ ] **Step 3: Do the research and enter the data, with notes.**
  - Update the Plan 2 Task 8 test, which pinned the 85th's start: it now asserts the company is `reserve`. Record that in the notes.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scenarios/vimy-1917 docs/research/vimy packages/scenario
git commit -m "data(vimy): communications, planned operations, off-map flanks, air control, key ground; evening attack no longer scripted"
```

---

### Task 5: Engine v3 core (state, pipeline, causes, record)

**Files:**
- Create:
  - `packages/engine/src/causes.ts`
  - `packages/engine/src/pipeline.ts`
  - `packages/engine/src/stochastic.ts`
  - `packages/engine/src/defaults.ts`
- Modify:
  - `packages/engine/src/companies.ts`, `step.ts`, `run.ts`, `record.ts`, `types.ts`, `index.ts`
  - `packages/engine/src/draft-scenario.test.ts` (ENGINE_VERSION 0.3.0, golden re-pinned)
  - `packages/app/src/ui/runRecord.ts` and `packages/app/src/playback/interpolate.ts` (read the new record)
- Test:
  - `packages/engine/src/pipeline.test.ts`
  - `packages/engine/src/conservation.test.ts`
  - `packages/engine/src/defaults.test.ts`

**Interfaces:**
- **Produces: `CAUSES`.** A readonly tuple, exported with `type Cause = (typeof CAUSES)[number]`:
  - `timetable`, `followed-barrage`, `barrage-moved-on`, `gap-behind-barrage`, `friendly-barrage`;
  - `wire-uncut`, `wire-cut`, `spared-by-bombardment`;
  - `mg-fire`, `mg-unobserved`, `artillery-fire`, `defensive-barrage`, `batteries-recovered`, `counter-battery`, `off-map-fire`;
  - `dugouts-uncleared`, `defenders-trapped`;
  - `officers-lost`, `led-by-ncos`, `morale-broke`, `suppressed`, `isolated`;
  - `mud`, `poor-visibility`, `darkness`, `air-observation`, `uphill-counter-attack`;
  - `order-delay`, `lost-contact`, `leader-slow`, `leader-adapted`, `leader-cautious`, `leader-bold`;
  - `planned-operation`, `reserve-arrived`, `ammunition-low`, `tank-bogged`, `horses-gassed`.
- **Produces: `SimEvent` v3.**
  - It adds `id: number` (sequential within the run), `refs: number[]` (ids of earlier events), `causes: Cause[]` and `factors?: Record<string, number>`.
  - `kind` extends Plan 2's kinds with: `company-pinned`, `company-fell-back`, `company-surrendered`, `company-destroyed`, `garrison-emerged`, `defenders-trapped`, `segment-lost`, `segment-retaken`, `dugout-cleared`, `dugout-sortie`, `officers-lost`, `fire-opened`, `bombardment-result`, `message-lost`, `order-issued`, `counter-attack-ordered`, `operation-launched`, `reserve-ordered`, `reserve-arrived`, `run-ended`.
- **Produces: `CompanyState` v3.**
  - Plan 2's fields, plus: `men`, `killed`, `wounded`, `captured`, `morale`, `moraleStart`, `suppression`, `fatigue`, `officers`, `lewisGuns`, `machineGuns`, `bombs`, `ammo`, `posture: Posture`, `training`, `segmentId?: string`, `intent: Intent`, `orders: Order[]`.
  - It also adds `formationPath: string[]`: the ids from the battalion up to the top.
  - `strength` stays, as an alias of `men`, for the record.
  - `status` adds `pinned`, `falling-back`, `counter-attacking`, `surrendered`, `destroyed`, `marching` and `off-map`.
- **Produces: `SimState` v3.**
  - Plan 2's fields, plus: `segments: SegmentState[]`, `batteries: BatteryState[]`, `hqs: HqState[]`, `messages: Message[]`, `reserves: ReserveState[]`, `nextEventId: number`.
  - The types are declared here. Later tasks fill them.
- **Produces: `stochasticRound(x: number, rng: () => number): number`.** It returns `floor(x)`, plus 1 with probability `x − floor(x)`. Each call draws exactly one number.
- **Produces: `runPipeline(state, ctx, dt): SimState`.** It calls the nine phases in order. Each phase is a function `(state, ctx, dt, pending) => SimState` registered in `pipeline.ts`. A phase can be a no-op until its task lands.
- **Produces: `StepContext` v3.** It adds `tables`, `rng`, `terrain?: Terrain` and `defaultsUsed: Set<string>`.
- **Produces: `RunRecord` v3.**
  - `snapshots[].companies` becomes columnar: `{ columns: ['id','x','y','men','status','morale','suppression','posture'], rows: Array<[...]> }`. Numbers are rounded: x and y to 1 m, morale and suppression to 0.01.
  - Snapshots are taken every 10 battle-minutes while anything is in contact, otherwise every 60. The final state is always included.
  - `summary` adds a `casualties` block by side and by formation, with killed, wounded and captured, and a separate `bombardment` period.
  - `summary` also adds `prisoners`, `gunsCaptured`, `endedAt`, `endReason`, `winner` and `keyGround`. Task 15 fills these; Task 5 adds the shapes, with zeros.
  - The record adds `defaultsUsed: string[]`.
- **Produces: `resolveDefaults(s, doctrines, tables): { scenario: Scenario; used: string[] }`.** Every absent optional value the model needs is filled from doctrine `companyDefaults` or `tables.effects`, and listed as e.g. `"companies[42].officers ← bef-1917.companyDefaults.officers"`.

- [ ] **Step 1: Write the failing tests**

```ts
// pipeline.test.ts
it('runs the nine phases in the spec order every step', () => {
  const seen: string[] = []; const ctx = ctxWithPhaseSpy(seen);
  runPipeline(initialState(), ctx, 2);
  expect(seen).toEqual(['comms','command','behaviour','artillery','directFire','resolve','morale','movement','log']);
});
it('event ids are sequential and refs only point backwards', () => {
  const r = runScenario(...fixtureWithDoctrineV3(), { seed: 1 });
  r.events.forEach((e, i) => { expect(e.id).toBe(i); for (const ref of e.refs) expect(ref).toBeLessThan(e.id); });
});
it('shuffling the order of companies in the scenario file does not change the record', () => {
  const [s, d] = fixtureWithDoctrineV3();
  expect(hash(runScenario(shuffleCompanies(s, 7), d, { seed: 3 }))).toBe(hash(runScenario(s, d, { seed: 3 })));
});
// conservation.test.ts
it('men + killed + wounded + captured is constant for every company in every snapshot', () => {
  const r = runScenario(...fixtureWithDoctrineV3(), { seed: 5 });
  for (const id of companyIds(r)) expect(new Set(totalsOverTime(r, id))).toHaveLength(1);
});
// defaults.test.ts
it('the Plan 1 draft runs and lists every default it used', () => {
  const r = runScenario(draft(), doctrines(), { seed: 1 });
  expect(r.defaultsUsed).toEqual(expect.arrayContaining([expect.stringMatching(/officers ← bef-1917\.companyDefaults\.officers/)]));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/engine/src/pipeline.test.ts packages/engine/src/conservation.test.ts packages/engine/src/defaults.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the core.**
  - Shared engine test helpers go in `packages/engine/src/test-helpers.ts`, and later tasks add to them: `fixtureWithDoctrineV3()`, `draft()`, `doctrines()`, `vimy()`, `vimyDoctrines()` (loads through `@wwi/scenario/node` in tests only), `eventsOf`, `hash`, `shuffleCompanies`, `companyIds`, `totalsOverTime`.
  - The phases are no-ops except `behaviour` and `movement`, which carry Plan 2's barrage-following unchanged, and `log`, which carries the line-taken check.
  - `artillery` keeps advancing the barrages.
  - Set `ENGINE_VERSION = '0.3.0'` and re-pin the golden hash.
  - Update the app's `parseRunRecord` and interpolation for the columnar rows. The e2e must still pass.

- [ ] **Step 4: Run all tests and the e2e**

Run: `npm test && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm -w packages/app run e2e`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages
git commit -m "feat(engine): v3 core: phase pipeline, cause vocabulary with refs, conservation, defaults record, columnar run record"
```

---

### Task 6: Ground, sight and light

**Files:**
- Create:
  - `packages/engine/src/ground.ts`
  - `packages/engine/src/sight.ts`
  - `packages/engine/src/light.ts`
- Test:
  - `packages/engine/src/ground.test.ts`
  - `packages/engine/src/sight.test.ts`
  - `packages/engine/src/light.test.ts`

**Interfaces:**
- **Produces: `groundAt(world: World, p: Point): Ground`.**
  - `World` is built once per run by `buildWorld(s, tables)`.
  - The ground type comes from features: wood and village polygons and point radii; a trench is anything within 15 m of a trench line; craters are cratered ground. Elsewhere it is open.
  - The churn grid (below) turns open ground into cratered.
- **Produces: `speedFactor(world, p, weather): number`.**
  - Mud comes from precipitation over the past 24 h and from churn, using `tables.effects.mudSpeedFactor`.
  - The uphill penalty comes from the terrain slope, using `uphillPenaltyPer10m`.
- **Produces: `churn(world, p, rounds): void`.** It accumulates shelling into a 50 m grid, held in `SimState.churn`, a typed array serialised as a number array.
- **Produces: `lineOfSight(world, from: Point, to: Point, eyeM = 1.5): boolean`.**
  - It samples elevation every 25 m along the segment. Woods and villages block.
  - Results are cached per (from-cell, to-cell) of 50 m. The cache key is an integer, never a string.
- **Produces: `visibilityM(s, minuteAfterZero): number`.**
  - Weather `visibilityM` is interpolated, and capped by light: full by day; `nightVisibilityM` at night; linear through `twilightMin`.
- **Produces: `sunTimes(lat, lon, date, utcOffsetMin): { sunrise: number; sunset: number }`.**
  - Minutes after local midnight, using the NOAA solar-position approximation.
  - The frame origin's latitude and longitude, and `s.utcOffsetMin` (default 0, recorded in `defaultsUsed`).
- **Produces: `visibility(r: number, visM: number): number`.** It returns `clamp(1 − r / visM, 0, 1)`.

- [ ] **Step 1: Write the failing tests**

```ts
it('sunrise and sunset at Greenwich on the 2000 March equinox fall within 5 min of 06:04 and 18:14 UTC', () => {
  const t = sunTimes(51.4769, 0, '2000-03-20', 0);
  expect(Math.abs(t.sunrise - 364)).toBeLessThanOrEqual(5); expect(Math.abs(t.sunset - 1094)).toBeLessThanOrEqual(5);
});
it('a ridge between two points blocks sight; removing it restores sight', () => {
  expect(lineOfSight(worldWithRidge(10), [0, 0], [1000, 0])).toBe(false);
  expect(lineOfSight(worldWithRidge(0), [0, 0], [1000, 0])).toBe(true);
});
it('a wood polygon blocks sight and gives wood ground', () => {
  const w = worldWithWood(); expect(lineOfSight(w, [0, 0], [400, 0])).toBe(false); expect(groundAt(w, [200, 0])).toBe('wood');
});
it('rain over the previous day and heavy churn both slow movement, and combine', () => {
  const w = flatWorld(); const dry = speedFactor(w, [0, 0], noRain());
  churn(w, [0, 0], 5000);
  expect(speedFactor(w, [0, 0], rainAllDay())).toBeLessThan(speedFactor(w, [0, 0], noRain())); expect(speedFactor(w, [0, 0], noRain())).toBeLessThan(dry);
});
it('LOS over the Vimy grid is fast enough: 100k cached queries < 300 ms', () => { /* timed over the real grid */ });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/engine/src/ground.test.ts packages/engine/src/sight.test.ts packages/engine/src/light.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `ground.ts`, `sight.ts` and `light.ts`**

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS. Engine output is unchanged, so the golden stays.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): ground, mud and churn; cached line of sight; visibility, daylight and twilight"
```

---

### Task 7: The compressed bombardment

**Files:**
- Create:
  - `packages/engine/src/segments.ts`
  - `packages/engine/src/bombardment.ts`
- Modify:
  - `packages/engine/src/run.ts` (the bombardment runs before minute 0)
  - `packages/engine/src/record.ts`
- Test:
  - `packages/engine/src/segments.test.ts`
  - `packages/engine/src/bombardment.test.ts`

**Interfaces:**
- **Produces: `deriveSegments(s): SegmentState[]`.**
  - One segment per German garrison company: the stretch of its `trenchFeatureId` between the midpoints to its neighbouring garrisons on the same feature.
  - `SegmentState = { id; featureId; garrisonIds: string[]; yMin; yMax; lengthM; wireCut; wireBeltDepthM; trenchDamage; dugoutDamage; dugoutDepthM; spared: boolean; holder: Side; barrageLastOverMin: number | null; emerged: boolean; dugoutPoints: Array<{ point: Point; men: number }> }`.
- **Produces: `runBombardment(state, ctx): { state: SimState; events: SimEvent[]; losses: CasualtyCount }`.**
  - It applies the model's bombardment formulas and draws garrison losses through `stochasticRound`. Losses go into the summary's `bombardment` period.
  - It sets the batteries' suppression at Zero.
  - It emits one `bombardment-result` event per segment, with `factors: { wireCut, trenchDamage, dugoutDamage, losses }` and the causes `spared-by-bombardment` or `wire-uncut` where they apply.
- **Produces: `BatteryState = { id; side; weapon; guns; suppressedUntilMin: number | null; ammoLeft: number; position?: Point; horses: boolean }`.**
- **Consumes:** `Scenario.bombardment` (Task 1), `tables.effects` and `stochasticRound`.

- [ ] **Step 1: Write the failing tests**

```ts
it('segments tile each German trench feature without gaps or overlaps between its garrisons', () => {
  const segs = deriveSegments(threeGarrisonsOnOneTrench());
  expect(segs.map(x => [x.yMin, x.yMax])).toEqual([[-500, -150], [-150, 150], [150, 500]]);
});
it('more wire rounds cut more wire; a spared segment gets none', () => {
  const lo = wireCutOf(runBombardmentOn(fixtureBomb({ wireRounds: 1000 }))), hi = wireCutOf(runBombardmentOn(fixtureBomb({ wireRounds: 10000 })));
  expect(hi).toBeGreaterThan(lo); expect(wireCutOf(runBombardmentOn(fixtureBomb({ wireRounds: 10000, spared: true })))).toBe(0);
});
it('deeper dugouts lose fewer men to the same shelling', () => {
  expect(lossesAt(15)).toBeLessThan(lossesAt(3));
});
it('bombardment losses respect conservation and appear in the summary as their own period', () => {
  const r = runScenario(...fixtureBombarded(), { seed: 1 });
  expect(r.summary.casualties.bombardment.central.total).toBeGreaterThan(0);
});
it('a scenario with no bombardment runs and records the default', () => {
  expect(runScenario(draft(), doctrines(), { seed: 1 }).defaultsUsed).toContain('bombardment ← none (no preliminary bombardment)');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/engine/src/segments.test.ts packages/engine/src/bombardment.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `segments.ts` and `bombardment.ts`, and bump `ENGINE_VERSION` to 0.3.1 with the golden re-pinned**

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): trench segments and the compressed preliminary bombardment"
```

---

### Task 8: Artillery in battle, the gap and dugouts' emergence

**Files:**
- Create: `packages/engine/src/artillery.ts`
- Modify:
  - `packages/engine/src/barrage.ts` (band depth from the sector, `bandDepthM`, default 90 m recorded in `defaultsUsed`)
  - `packages/engine/src/pipeline.ts`
- Test:
  - `packages/engine/src/artillery.test.ts`
  - `packages/engine/src/gap.test.ts`

**Interfaces:**
- **Produces: the `artillery` phase**, which gathers pending damage from five sources:
  1. **The creeping barrage.** Every unit inside a sector's band takes fire from that sector's `creeping` artillery: guns on a 100 m frontage = guns × 100 / sector width.
     - Attackers inside the band take it too, with cause `friendly-barrage`.
     - Defenders in dugouts under the band take no casualties, but cannot emerge.
     - Each segment under the band sets `barrageLastOverMin`.
  2. **Standing barrages** on the rear trench features, from `standing` and `heavy` artillery, until the creeping barrage passes them.
  3. **The machine-gun barrage** (`mg-barrage` artillery): a zone `bandDepthM` to 400 m beyond the creeping band, which suppresses only.
  4. **German defensive fire.** Unsuppressed German batteries fire on no man's land, and on segments the Germans have lost, with cause `defensive-barrage`.
     - Battery suppression decays with `batteryRecoveryHalfLifeMin`. When enough batteries come back, the event `batteries-recovered` fires.
     - Fire is weak but never zero: at least the batteries not suppressed at Zero fire.
  5. **Off-map fire** (`offMap.fire`) inside its window, with cause `off-map-fire`.
- **Observation and ammunition.**
  - `observation(F)` for artillery is `tables` × (`air.observedFrac` when the observation is by aircraft) × the visibility factor.
  - Ammunition decrements `ammoLeft`. At zero the battery stops, with cause `ammunition-low`.
- **Produces: `emergence(segments, minute, doctrine)`.**
  - It sets `emerged = true` once `minute ≥ barrageLastOverMin + emergeMin` and no attacker is within `closeRangeM`, and emits `garrison-emerged` with refs to that segment's last barrage event.
  - If attackers reach the segment first, the garrison is trapped: `trappedSurrenderFrac` of its men become captured, the rest become `dugoutPoints`, and `defenders-trapped` fires with cause `followed-barrage`.
- **Produces: the gap.**
  - Each attacking company's step records `gapM = barrageX − x`.
  - Events about a company emerging into fire while its gap exceeds `followDistanceM × 2` carry cause `barrage-moved-on` and `factors.gapM`.

- [ ] **Step 1: Write the failing tests**

```ts
it('a company that keeps close to the barrage traps the garrison; one that lags lets it emerge and fight', () => {
  expect(eventsOf(runGap({ lagMin: 0 })).map(e => e.kind)).toContain('defenders-trapped');
  const lagging = eventsOf(runGap({ lagMin: 12 }));
  expect(lagging.map(e => e.kind)).toContain('garrison-emerged');
  expect(lagging.find(e => e.kind === 'garrison-emerged')!.refs.length).toBeGreaterThan(0);
});
it('a company inside its own barrage band takes casualties tagged friendly-barrage', () => {
  expect(eventsOf(runTooClose()).some(e => e.causes.includes('friendly-barrage'))).toBe(true);
});
it('German defensive fire rises as batteries recover, and never drops to zero while any battery is unsuppressed', () => {
  const f = defensiveFireByHour(runDefensive({ suppressedAtZeroFrac: 0.83 }));
  expect(f[0]).toBeGreaterThan(0); expect(f[3]).toBeGreaterThan(f[0]);
});
it('without air observation, artillery fire on unseen targets is less effective', () => {
  expect(lossesUnder({ observedFrac: 0.0 })).toBeLessThan(lossesUnder({ observedFrac: 0.75 }));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/engine/src/artillery.test.ts packages/engine/src/gap.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `artillery.ts`, emergence and the gap, and bump to 0.3.2 with the golden re-pinned**

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): creeping, standing, MG and defensive barrages; battery recovery; the gap and dugout emergence"
```

---

### Task 9: Direct fire, casualties, suppression, morale and officers

**Files:**
- Create:
  - `packages/engine/src/fire.ts`
  - `packages/engine/src/resolve.ts`
  - `packages/engine/src/morale.ts`
- Modify: `packages/engine/src/pipeline.ts`
- Test:
  - `packages/engine/src/fire.test.ts`
  - `packages/engine/src/morale.test.ts`
  - `packages/engine/src/officers.test.ts`

**Interfaces:**
- **Produces: the `directFire` phase.**
  - Each company that can fire (not in a dugout, not surrendered, not marching) picks targets: enemy companies within its weapons' `maxRangeM` and in sight, nearest first. It splits fire across at most 2.
  - Weapons are the company's riflemen (men − 2 × Lewis − 4 × MG crews), its Lewis guns and its machine guns.
  - It gathers pending damage with the model's fire formula.
  - It emits `fire-opened` the first time a garrison's machine guns fire, with causes `mg-fire`, plus `mg-unobserved` when that segment was spared or its trench damage is under 0.2.
  - Pairs are pruned with a uniform 250 m bucket grid, so no all-pairs loop.
- **Produces: the `resolve` phase.**
  - It applies all pending damage at once: casualties through `stochasticRound`, split by `killedFrac`.
  - It applies officer losses and suppression.
  - It emits `officers-lost` when a company's officers reach 0, with cause `officers-lost`.
  - Ammunition is decremented by rounds fired.
- **Produces: the `morale` phase.**
  - It applies the model's morale and state rules.
  - It emits `company-pinned`, `company-fell-back`, `company-surrendered` and `company-destroyed` (men = 0). Each carries the causes that drove it, among `mg-fire`, `artillery-fire`, `suppressed`, `isolated` and `officers-lost`, and `refs` to the fire events of the last 10 min.
  - Starting morale uses the leader of the company's battalion, or the nearest leader up `formationPath`: `moraleEffect`.

- [ ] **Step 1: Write the failing tests**

```ts
it('more machine guns in the garrison cause more attacker casualties (median over 50 seeds)', () => {
  expect(median(attackerLosses({ mgs: 4 }))).toBeGreaterThan(median(attackerLosses({ mgs: 1 })));
});
it('targets out of sight or beyond range take no direct fire', () => {
  expect(attackerLosses({ ridgeBetween: true, seeds: [1] })[0]).toBe(0);
});
it('prone and entrenched targets lose fewer men than men moving in the open', () => {
  expect(lossesByPosture('in-trench')).toBeLessThan(lossesByPosture('moving'));
});
it('heavy losses pin a company; further losses make it fall back; a broken garrison at close range surrenders', () => {
  const kinds = eventsOf(runCrush()).map(e => e.kind);
  expect(kinds).toEqual(expect.arrayContaining(['company-pinned', 'company-fell-back', 'company-surrendered']));
});
it('a rehearsed company loses less speed than a standard one when its officers fall', () => {
  expect(speedAfterOfficersLost('rehearsed')).toBeGreaterThan(speedAfterOfficersLost('standard'));
});
it('a better moraleEffect rating gives higher starting morale', () => {
  expect(startMorale({ moraleEffect: 5 })).toBeGreaterThan(startMorale({ moraleEffect: 1 }));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/engine/src/fire.test.ts packages/engine/src/morale.test.ts packages/engine/src/officers.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `fire.ts`, `resolve.ts` and `morale.ts`, and bump to 0.3.3 with the golden re-pinned**

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS. The conservation test from Task 5 now exercises real losses.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): direct fire with sight, range and cover; casualties, suppression, morale states and officer losses"
```

---

### Task 10: Movement and the fight for trenches

**Files:**
- Create:
  - `packages/engine/src/movement.ts` (replaces `moveCompanies` in `companies.ts`)
  - `packages/engine/src/trenches.ts`
- Modify:
  - `packages/engine/src/pipeline.ts`
  - `packages/engine/src/step.ts` (the line-taken rule)
- Test:
  - `packages/engine/src/movement.test.ts`
  - `packages/engine/src/trenches.test.ts`

**Interfaces:**
- **Produces: the `behaviour` and `movement` phases.**
  - **Intents:** `advance`, `hold`, `go-to-ground`, `fall-back`, `mop-up`, `counter-attack`, `march`.
  - **Speed:** the company's own speed × `speedFactor` × the NCO penalty × (1 − 0.5 × suppression).
  - **Uncut wire:** inside a segment with uncut wire, speed is also × `1 − (1 − wireSpeedFactor) · (1 − wireCut)`, so fully cut wire costs nothing and fully uncut wire slows to `wireSpeedFactor`. The company's posture stays `moving`.
- **Target rule (fixes the Plan 2 stand-off artefact).**
  - An advancing company moves toward `min(objX, barrageX − followDistanceM, legLineX)`.
  - `legLineX` is the x of the line the barrage is currently protecting, when that is not the company's own objective line.
  - So no company passes a line the barrage is still standing beyond.
- **Falling back** moves toward the company's start. **Pinned** companies don't move. **Holding** companies only change status by surrendering or being ordered to counter-attack.
- **Produces: `captureSegments(state)`.**
  - A segment changes holder when attackers within 50 m of it outnumber its emerged defenders by 3:1, or when the defenders are gone. It emits `segment-lost` or `segment-retaken`.
  - Captured guns count when a German battery `position` lies within 300 m of a lost segment and the battery's horses are gone (Task 14) or its `horseDrawn` is false.
- **Produces: mopping up.**
  - `mopup` companies, and companies whose intent is `mop-up`, clear `dugoutPoints` at `mopUpRateMenPerMin`, using bombs. Each clearance emits `dugout-cleared`; prisoners are added to `captured` of the dugout's garrison.
  - A dugout point not cleared for 20 min after the leading wave passes makes a `dugout-sortie`: its men become a small German company that fires at the attackers' rear, with cause `dugouts-uncleared`.
- **Produces: the line-taken rule.**
  - A line is taken in a sector when the attackers hold every segment within the sector's y-range whose feature lies within 150 m of the line, and every attacking company aimed at it is consolidating, pinned, destroyed or surrendered, with at least one consolidating.
  - The causes come from what happened: `followed-barrage`, `defenders-trapped`, `wire-cut`.
- **Fatigue** rises with movement (`fatiguePerKm`) and with time under fire, slowing movement and fire. It recovers at rest (`fatigueRecoveryPerHour`).

- [ ] **Step 1: Write the failing tests**

```ts
it('uncut wire slows the advance and holds the company in the open', () => {
  expect(timeToObjective({ wireCut: 0.1 })).toBeGreaterThan(timeToObjective({ wireCut: 0.95 }));
});
it('no company passes a line the barrage is still standing beyond (Plan 2 artefact: brown 44 m past blue)', () => {
  const r = runBrownCloseToBlue();
  expect(reachedMinute(r, 'brown')).toBeGreaterThanOrEqual(barrageResumeMinute(r, 'brown'));
});
it('trapped defenders left in dugouts sortie against later waves unless mopped up', () => {
  expect(eventsOf(runDugouts({ mopUp: false })).map(e => e.kind)).toContain('dugout-sortie');
  expect(eventsOf(runDugouts({ mopUp: true })).map(e => e.kind)).not.toContain('dugout-sortie');
});
it('a line is not taken while a defended segment on it still holds out', () => {
  expect(lineTakenMinute(runHoldout({ holdout: true }))).toBeNull();
});
it('German gun positions overrun after their horses are lost count as captured guns', () => {
  expect(runOverrun({ horsesLost: true }).summary.gunsCaptured).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/engine/src/movement.test.ts packages/engine/src/trenches.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `movement.ts` and `trenches.ts`, and bump to 0.3.4 with the golden re-pinned**

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine doctrine docs/research/model/doctrine.md
git commit -m "feat(engine): movement with mud, wire and fatigue; trench capture, mopping up and dugout sorties; barrage-safe line rule"
```

---

### Task 11: Communications

**Files:**
- Create: `packages/engine/src/comms.ts`
- Modify: `packages/engine/src/pipeline.ts`
- Test: `packages/engine/src/comms.test.ts`

**Interfaces:**
- **Produces: `Message`.**
  - `Message = { id: number; side: Side; kind: 'report' | 'order' | 'call-for-fire'; fromFormationId: string; toFormationId: string; sentMin: number; dueMin: number; channel: ChannelKind; payload: Report | Order; aboutEventId?: number }`.
- **Produces: `send(state, ctx, msg)`.**
  - Of the channels the scenario's `communications.links` gives for this level and side, it picks the fastest one not cut. A surface line is cut by shelling of its cell, or after a failure draw.
  - `dueMin = sentMin + delay`, where delay is `delayMin` × (0.5 + rng()) × the sender leader's `orderSpeed` factor `(6 − orderSpeed) / 3` for orders.
  - A failure is drawn per message as `1 − exp(−failPerHour · delay / 60)`. A lost message emits `message-lost` with cause `lost-contact`, and the sender retries by the next channel.
  - Without `communications`, every link is `runner` (recorded in `defaultsUsed`).
- **Produces: the `comms` phase.**
  - It delivers messages whose `dueMin ≤ minute`, in `(dueMin, id)` order, into the receiving `HqState.picture`.
  - `HqState = { formationId; side; kind: FormationKind; leaderId?: string; picture: { segments: Record<string, Side>; lines: Record<string, number | null>; units: Record<string, { status; men; atMin }> }; pending: Decision[] }`.
- **Produces: automatic reports.**
  - A company sends a report to its battalion whenever its status changes or it takes a segment.
  - Each HQ forwards a summary report up one level every `reportEveryMin` (doctrine `common`) or on a status change.
- **Produces: calls for fire.**
  - A `call-for-fire` to the artillery travels over buried cable, where the scenario's `liaison` covers that formation, with LL-call speed (`tables.channels.buried-cable.delayMin`). Otherwise it uses the normal chain.
  - On arrival, the nearest non-suppressed batteries of that side fire on the target segment for 10 min.

- [ ] **Step 1: Write the failing tests**

```ts
it('reports reach corps later than brigade, and buried cable beats runners', () => {
  const t = arrivalTimes(runReports({ links: 'runners' })), c = arrivalTimes(runReports({ links: 'buried-cable' }));
  expect(t.corps).toBeGreaterThan(t.brigade); expect(c.corps).toBeLessThan(t.corps);
});
it('a slow leader (orderSpeed 1) gets orders to the front later than a fast one (5)', () => {
  expect(orderArrival({ orderSpeed: 1 })).toBeGreaterThan(orderArrival({ orderSpeed: 5 }));
});
it('lost messages are logged with lost-contact and retried', () => {
  const ev = eventsOf(runReports({ links: 'runners', failPerHour: 5 }));
  expect(ev.some(e => e.kind === 'message-lost' && e.causes.includes('lost-contact'))).toBe(true);
});
it("an HQ's picture lags reality by the channel delay", () => {
  expect(pictureLagMin(runReports({ links: 'runners' }))).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/comms.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `comms.ts`, and bump to 0.3.5 with the golden re-pinned**

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine doctrine
git commit -m "feat(engine): communications by channel, HQ pictures, reports, orders and calls for fire"
```

---

### Task 12: The command model and leader effects

**Files:**
- Create:
  - `packages/engine/src/command.ts`
  - `packages/engine/src/leaders.ts`
- Modify: `packages/engine/src/pipeline.ts`
- Test:
  - `packages/engine/src/command.test.ts`
  - `packages/engine/src/leaders.test.ts`

**Interfaces:**
- **Produces: `leaderOf(s, formationId): Ratings`.** It returns the formation's leader's ratings, or all 3s.
- **Produces: the leader factors**, each tested and each multiplying a doctrine value:
  - `delayFactor(r) = (6 − r.orderSpeed) / 3`;
  - `adaptFactor(r) = (6 − r.adaptiveness) / 3`, which scales `stallToleranceMin`;
  - `riskRatio(r) = minAttackRatio · (6 − r.riskTolerance) / 3`;
  - `timetableJitter(r) = startJitterMin · (6 − r.planning) / 3`.
- **Produces: the `command` phase**, which decides only from each HQ's `picture`.
  1. **Attacker, while the plan runs.** The timetable runs itself: each company's `startAfterMin`, with `timetableJitter`.
  2. **Attacker stall.** If the picture shows a line not taken more than `stallToleranceMin · adaptFactor` after its timetable minute, the lowest HQ that has a reserve-role battalion within its formation commits it.
     - It does so only if its ratio of men to the defenders known to hold the line is at least `riskRatio`.
     - It orders that battalion's companies to attack the stalled line with a 10-minute standing barrage, called for through comms.
     - Event `order-issued`, with causes from `leader-adapted`, `leader-cautious` and `leader-bold`, and with refs to the reports that showed the stall.
  3. **Planned operations.** An operation launches when:
     - its prerequisite line has been taken in the picture of its formation's HQ;
     - `notBefore` has passed;
     - its force ratio meets `riskRatio`.

     It emits `operation-launched` with cause `planned-operation`. The operation's formation's reserve-role companies become attackers on the target.
  4. **Defender, local counter-attack.** When a battalion's picture shows one of its segments lost, its reserve-role or support companies counter-attack it after `localCounterAttackDelayMin · delayFactor`, if the ratio meets `counterAttackMinRatio`. Emits `counter-attack-ordered`.
  5. **Defender, divisional counter-attack and reserves.** When a division's picture shows lost segments of at least `commitReserveWhenLostFrac` of its front:
     - it orders its off-map reserves forward, with `reserve-ordered` (Task 13 marches them);
     - it plans a divisional counter-attack for when they arrive, after `divisionalCounterAttackDelayMin · delayFactor`.
  6. **Off-map attacks** (`offMap.attacks`) apply their `suppressFrac` to companies on `targetFeatureId` inside their window, with cause `off-map-fire`. They are scheduled because they are outside the simulated force (spec 13.9).
- **Consumes:** comms (Task 11), segments (Task 7), movement intents (Task 10) and `Scenario.operations`.

- [ ] **Step 1: Write the failing tests**

```ts
it('a stalled line brings the reserve battalion in; a more adaptive leader commits it sooner', () => {
  expect(commitMinute({ adaptiveness: 5 })).toBeLessThan(commitMinute({ adaptiveness: 1 }));
});
it('a cautious leader does not attack at a poor force ratio; a bold one does', () => {
  expect(attacked({ riskTolerance: 1, ratio: 1.2 })).toBe(false); expect(attacked({ riskTolerance: 5, ratio: 1.2 })).toBe(true);
});
it('decisions are made only on what has been reported: a lost runner delays the counter-attack', () => {
  expect(counterAttackMinute({ failPerHour: 0 })).toBeLessThan(counterAttackMinute({ failPerHour: 3, seed: 2 }));
});
it('a planned operation launches only after its prerequisite is known taken, never on a fixed clock', () => {
  const r = runOperation();
  expect(launchMinute(r)).toBeGreaterThan(prereqKnownMinute(r));
});
it('swapping a slow divisional commander for a fast one changes when the counter-attack goes in', () => {
  expect(counterAttackMinute({ divOrderSpeed: 5 })).toBeLessThan(counterAttackMinute({ divOrderSpeed: 1 }));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/engine/src/command.test.ts packages/engine/src/leaders.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `command.ts` and `leaders.ts`, and bump to 0.3.6 with the golden re-pinned**

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): command model for both sides with leader effects, planned operations and counter-attacks"
```

---

### Task 13: Reserves off the map

**Files:**
- Create: `packages/engine/src/reserves.ts`
- Modify: `packages/engine/src/pipeline.ts`
- Test: `packages/engine/src/reserves.test.ts`

**Interfaces:**
- **Produces: `ReserveState`.**
  - `ReserveState = { formationId; side; status: 'waiting' | 'ordered' | 'marching' | 'arrived'; orderedMin: number | null; arriveMin: number | null; entryPoint: Point }`.
- **Produces: the march.**
  - On `reserve-ordered`: `arriveMin = orderedMin + baseOrderDelayMin · delayFactor + distanceKm / (marchKmPerHour · speedFactor of the weather) · 60 + deployMin`.
  - On arrival, the formation's companies appear at `entryPoint` and emit `reserve-arrived` with cause `reserve-arrived`.
  - Formations with no companies get `companiesPerBattalion` companies per battalion, of `companyDefaults.strength` each, listed in `defaultsUsed`.
- **Produces: the uphill penalty.** A counter-attack moving up a slope takes `uphillPenaltyPer10m` per 10 m climbed, applied to speed and fire, with cause `uphill-counter-attack`.
- **Guard:** `reserves[].orderedAt` is never read by the engine. A test asserts that changing it does not change the record.

- [ ] **Step 1: Write the failing test**

```ts
it('a reserve 5 km back arrives earlier than one 24 km back (the spec what-if)', () => {
  expect(arrival({ distanceKm: 5 })).toBeLessThan(arrival({ distanceKm: 24 }));
});
it('scenario orderedAt values are validation targets only and never change a run', () => {
  expect(hash(runReserves({ orderedAt: '1917-04-09T08:00' }))).toBe(hash(runReserves({ orderedAt: '1917-04-09T20:00' })));
});
it('a counter-attack up the ridge is slower and weaker than the same attack on the flat', () => {
  expect(counterAttackLosses({ climbM: 40 })).toBeGreaterThan(counterAttackLosses({ climbM: 0 }));
});
it('a reserve formation with no companies arrives with default companies, recorded in defaultsUsed', () => {
  expect(runReserves({ noCompanies: true }).defaultsUsed.some(d => /companiesPerBattalion/.test(d))).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/reserves.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `reserves.ts`, and bump to 0.3.7 with the golden re-pinned**

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): off-map reserves with order delay and march, uphill counter-attack penalty"
```

---

### Task 14: Smaller mechanics (tanks, gassed horses, ammunition reserve)

**Files:**
- Create: `packages/engine/src/smaller.ts`
- Modify:
  - `packages/scenario/src/schema.ts` (an optional `tanks: Array<{ id; side; start: PlacedPoint; sectorId; objectiveLineId; cite: Sourced<string> }>`, and an artillery `task: 'gas'` in bombardment allocations)
  - `packages/engine/src/pipeline.ts`
- Test: `packages/engine/src/smaller.test.ts`

**Interfaces:**
- **Tanks** follow their sector's barrage. Each 100 m they bog with probability `tankBogPerKm / 10` × the mud factor. A bogged tank emits `tank-bogged` with cause `mud`. A moving tank suppresses garrisons within 100 m.
  - Vimy's eight tanks with the 2nd Division are entered in `scenarios/vimy-1917/command.yaml` with their sources: Nicholson mentions them.
- **Gas.** Bombardment allocations with `task: 'gas'` kill draught horses of German batteries within 1 km of the target at `horseLossPerGasRound`. A battery with no horses can't withdraw, and is captured when overrun (Task 10). Emits `horses-gassed`.
- **Ammunition reserve.** Attackers stop firing small arms beyond a doctrine reserve (`attack.ammoReserveFrac`) unless counter-attacked. When that reserve is reached, `ammunition-low` fires.

- [ ] **Step 1: Write the failing test**

```ts
it('tanks bog more in mud', () => { expect(bogRate({ rain: true })).toBeGreaterThan(bogRate({ rain: false })); });
it('gassed horses leave guns to be captured', () => {
  expect(gunsCaptured({ gas: true })).toBeGreaterThan(gunsCaptured({ gas: false }));
});
it('attackers keep an ammunition reserve until counter-attacked', () => {
  expect(firedWhileConsolidating({ counterAttack: false })).toBeLessThan(firedWhileConsolidating({ counterAttack: true }));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/engine/src/smaller.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `smaller.ts`, enter the Vimy tanks with their sources and notes, and bump to 0.3.8 with the golden re-pinned**

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages scenarios/vimy-1917 docs/research/vimy doctrine
git commit -m "feat(engine): tanks bogging, gassed draught horses and overrun guns, ammunition held for counter-attacks"
```

---

### Task 15: Run end, winner, summary and batch v2

**Files:**
- Create:
  - `packages/engine/src/end.ts`
  - `packages/engine/src/summary.ts`
  - `packages/cli/src/workers.ts`
- Modify:
  - `packages/engine/src/run.ts`
  - `packages/engine/src/batch.ts`
  - `packages/cli/src/main.ts` and `format.ts`
- Test:
  - `packages/engine/src/end.test.ts`
  - `packages/engine/src/summary.test.ts`
  - `packages/engine/src/whatif.test.ts`
  - `packages/engine/src/budget.test.ts`
  - `packages/cli/src/workers.test.ts`

**Interfaces:**
- **Produces: `endCheck(state, ctx): { ended: boolean; reason?: 'objectives-held' | 'lull' | 'time-cap' }`.**
  - It applies the model's end rules, with `end.lullMin` (default `timeLimitMinutes`, recorded in `defaultsUsed`).
  - It emits `run-ended`, with the reason in `factors`.
- **Produces: `summarize(state, ctx, events): RunRecord['summary']`.**
  - `casualties`, by `{ period: 'bombardment' | 'battle', side, formationId?: string }`, with killed, wounded, captured and total.
  - `prisoners` (by capturing side), `gunsCaptured`, `endedAt` (minutes), `endReason`, `winner` and `keyGround`.
  - Formation totals roll up along `formationPath`, so division and battalion figures are there to compare with targets.
- **Produces: `BatchSummary` v2.**
  - The Plan 2 line rows stay, and gain:
    - `casualties`: per target in `historical.casualties`, the batch p10, median and p90 for the same side, formation and window, beside the target or its range;
    - `prisoners`;
    - `gunsCaptured`;
    - `duration`;
    - `winner`: the share of runs each side won.
  - Each target row carries `pass: boolean | null` under spec section 7's criteria:
    - casualties: the target inside p10–p90 and the median within ±25%, or, for a disputed target, the median inside its range;
    - duration: within ±1 day;
    - winner: the historical winner in most runs.
  - This is reported only. Nothing tunes.
- **Produces: `sim batch --workers N`.**
  - It splits seeds across `worker_threads`. Each worker runs `runScenario`, and the results merge in seed order, so the output is identical for any N.
  - `--json` writes the summary as JSON.
- **Ends with `ENGINE_VERSION 0.4.0`** and the golden re-pinned.

- [ ] **Step 1: Write the failing tests**

```ts
// end.test.ts
it('a battle that stalls ends at the time cap with reason time-cap; one where the attacker holds everything ends objectives-held', () => {
  expect(runStalled().summary.endReason).toBe('time-cap'); expect(runEasy().summary.endReason).toBe('objectives-held');
});
it('the winner is whoever holds the key ground at the end', () => {
  expect(runEasy().summary.winner).toBe('allied');
});
// whatif.test.ts — the Review Focus property test
it.each(['no-artillery', 'attackers-x0.5', 'defenders-x2', 'reserves-at-0km', 'no-mgs'])('%s on Vimy ends, conserves men and has no NaN', (variant) => {
  const r = runScenario(applyVariant(vimy(), variant), vimyDoctrines(), { seed: 1 });
  expect(['objectives-held', 'lull', 'time-cap']).toContain(r.summary.endReason);
  expect(JSON.stringify(r)).not.toMatch(/NaN|null,"men"/); expect(conservationHolds(r)).toBe(true);
});
// budget.test.ts
it('a full Vimy run takes ≤ 3 s and its record is ≤ 8 MB', () => {
  const t0 = performance.now(); const r = runScenario(vimy(), vimyDoctrines(), { seed: 1 });
  expect(performance.now() - t0).toBeLessThanOrEqual(3000); expect(JSON.stringify(r).length).toBeLessThanOrEqual(8e6);
});
// workers.test.ts
it('a batch gives the same summary with 1 worker and with 4', async () => {
  expect(await batchWith(1)).toEqual(await batchWith(4));
});
it('a run inside a worker is byte-identical to the same seed run in-process', async () => {
  expect(await workerRunHash(7)).toBe(hash(runScenario(vimy(), vimyDoctrines(), { seed: 7 })));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/engine/src/end.test.ts packages/engine/src/summary.test.ts packages/engine/src/whatif.test.ts packages/engine/src/budget.test.ts packages/cli/src/workers.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the end check, the summary, batch v2 and the workers.**
  - If the budget test fails, profile and fix the hot path before anything else: LOS caching, pair pruning, quiet steps. Never loosen the budget.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages
git commit -m "feat(engine,cli): run end and winner, casualty and prisoner summary, batch v2 against targets, parallel workers"
```

---

### Task 16: Explanation, the "why" trace

**Files:**
- Create:
  - `packages/engine/src/explain.ts`
  - `packages/cli/src/why.ts`
- Modify:
  - `packages/engine/src/index.ts`
  - `packages/cli/src/main.ts`
- Test:
  - `packages/engine/src/explain.test.ts`
  - `packages/cli/src/why.test.ts`

**Interfaces:**
- **Produces: `explain(record: RunRecord, ref: { eventId: number } | { unitId: string; minute: number }): Why`.**
  - `Why = { event: SimEvent; causes: Array<{ cause: Cause; text: string }>; because: Why[] }`. It follows `refs` back to depth 6.
  - For a unit at a minute, it starts from that unit's latest event at or before that minute.
  - `text` comes from a plain-language table `CAUSE_TEXT: Record<Cause, string>`, e.g. `'barrage-moved-on': 'the barrage had moved on'`.
  - `explain` is pure. The app imports it at runtime, because it is a record reader rather than the engine. Its file imports only types and `CAUSE_TEXT`.
- **Produces: `sim why <record.json> (--event N | --unit ID --at HH:MM)`.** It prints the chain as an indented list.

- [ ] **Step 1: Write the failing tests**

```ts
it('every pinned, fallen-back, surrendered, segment-lost, line-taken, counter-attack-ordered and reserve-arrived event in a full Vimy run has a cause, and refs point backwards', () => {
  const r = runScenario(vimy(), vimyDoctrines(), { seed: 1 });
  for (const e of r.events.filter(e => EXPLAINED_KINDS.includes(e.kind))) { expect(e.causes.length).toBeGreaterThan(0); for (const x of e.refs) expect(x).toBeLessThan(e.id); }
});
it('a pinned company traces back to the machine guns that fired and why they were manned', () => {
  const w = explain(runGap({ lagMin: 12 }), { eventId: firstPinned() });
  expect(flattenCauses(w)).toEqual(expect.arrayContaining(['mg-fire', 'barrage-moved-on']));
});
it('every cause has plain-language text', () => { for (const c of CAUSES) expect(CAUSE_TEXT[c]).toMatch(/\w/); });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/engine/src/explain.test.ts packages/cli/src/why.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `explain.ts`, `CAUSE_TEXT` and `sim why`**

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages
git commit -m "feat(engine,cli): the why trace: cause chains with plain-language text, sim why"
```

---

### Task 17: Time-lapse I — battalions and companies, strength, morale, suppression, zoom

**Files:**
- Create:
  - `packages/app/src/map/zoom.ts`
  - `packages/app/src/playback/aggregate.ts`
- Modify:
  - `packages/app/src/playback/markers.ts`
  - `packages/app/src/map/draw.ts`
  - `packages/app/src/ui/MapCanvas.tsx`
  - `packages/app/src/ui/MapKey.tsx`
- Test:
  - `packages/app/src/playback/aggregate.test.ts`
  - `packages/app/src/map/zoom.test.ts`
  - `packages/app/e2e/playback.spec.ts`

**Interfaces:**
- **Produces: `aggregateBattalions(rows, record): BattalionMarker[]`.**
  - Per battalion: the centroid of its living companies, the sum of their men, the men-weighted average morale and suppression, and the dominant status.
  - The battalion id comes from the record. Task 5's record must carry a company → battalion map, `record.units: Array<{ id; battalionId; name; side }>`; add it there if Task 5 did not.
- **Produces: `zoom.ts`.**
  - Wheel and pinch zoom, drag to pan, and buttons for + and −. The minimum scale is fit-all; the maximum shows 200 m across 400 px.
  - The level-of-detail threshold: companies when 1 km is wider than 250 px, battalions otherwise (spec 9.2: "the corps view shows battalions. Zooming in breaks them into companies").
- **Marker design.** Strength is a bar under the marker. Morale is the fill:
  - solid when steady;
  - hatched when pinned;
  - an arrow back when falling back;
  - a white flag when surrendered;
  - greyed out when destroyed.

  Suppression is a pulsing ring. The key explains each.
- The Plan 2 deferred minors on the map key and timeline labels are folded in: measured label widths, and a draw-level test for the sideways-placement fix.

- [ ] **Step 1: Write the failing tests**

```ts
it('aggregates companies into battalion markers with summed men and men-weighted morale', () => {
  const b = aggregateBattalions(rows([['a', 'bn1', 100, 0.8], ['b', 'bn1', 50, 0.2]]), rec());
  expect(b[0]).toMatchObject({ id: 'bn1', men: 150 }); expect(b[0].morale).toBeCloseTo(0.6);
});
it('shows battalions at corps zoom and companies when zoomed in', () => {
  expect(detailAt(fitAll())).toBe('battalion'); expect(detailAt(zoomedTo(2000))).toBe('company');
});
// e2e: at load the Vimy map shows battalion markers (no company labels like "1A"); after zooming in, company labels appear
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/app/src/playback/aggregate.test.ts packages/app/src/map/zoom.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the aggregation, zoom and marker states**

- [ ] **Step 4: Run all tests and the e2e, and look at screenshots of Vimy at fit-all and zoomed in**

Run: `npm test && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm -w packages/app run e2e`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/app packages/engine
git commit -m "feat(app): battalion markers at corps zoom, companies when zoomed in; strength, morale and suppression on markers"
```

---

### Task 18: Time-lapse II — the battle on the map, totals and the "why" panel

**Files:**
- Create:
  - `packages/app/src/map/front.ts`
  - `packages/app/src/map/effects.ts`
  - `packages/app/src/map/sky.ts`
  - `packages/app/src/ui/Totals.tsx`
  - `packages/app/src/ui/WhyPanel.tsx`
- Modify:
  - `packages/app/src/map/draw.ts`
  - `packages/app/src/ui/Playback.tsx`
  - `packages/app/src/ui/EventLog.tsx`
  - `packages/engine/src/record.ts` (snapshot `segments: Array<[segmentIdIndex, holderSide, wireCut]>` and `reserves` columns, if Task 5 did not add them)
- Test:
  - `packages/app/src/map/front.test.ts`
  - `packages/app/src/map/effects.test.ts`
  - `packages/app/src/ui/why.test.ts`
  - `packages/app/e2e/playback.spec.ts`

**Interfaces and behaviour (spec 9.2):**
- **The front.** Each side's front line is redrawn from the segment holders and the companies' forward edge. Captured ground fills in with the captor's colour at 15% opacity.
- **Trenches change state.** Wire is drawn cut or uncut. A taken segment changes colour.
- **Barrages.**
  - Standing barrages and the machine-gun barrage zone are drawn in their own hatching.
  - The creeping barrage hatching is made clearly visible: the Plan 2 minor, where it was faint by noon.
- **Fire.** Shell bursts and machine-gun fire are suggested by small marks drawn from the step's fire events. They are thinned at high speeds by a deterministic sampler (the same frame always shows the same marks).
- **Reserves.** Columns are drawn as a moving arrow from the map edge while marching.
- **Weather and light.** Snow, sleet and rain are a light particle overlay; night is a darkening, using `sunTimes` (Task 6, reimplemented in the app or shared through a pure `@wwi/engine` export that the app may import at runtime).
- **Totals.** `Totals.tsx` shows running casualties by side, prisoners and guns captured. These are cumulative from events up to the playhead.
- **The "why" panel.** `WhyPanel.tsx` opens on clicking an event or a unit, and renders `explain(...)` (Task 16) as a readable chain. Clicking a step in the chain jumps the playhead to that event.
- **Not in this plan:** side-by-side playback, and the compare screen (Plan 4).

- [ ] **Step 1: Write the failing tests**

```ts
it('the front follows segment holders: a lost segment moves the German front line back', () => {
  expect(frontAt(recordWithLoss(), 60)).not.toEqual(frontAt(recordWithLoss(), 0));
});
it('the burst sampler is deterministic and thins with speed', () => {
  expect(bursts(ev, 1, frame)).toEqual(bursts(ev, 1, frame)); expect(bursts(ev, 360, frame).length).toBeLessThan(bursts(ev, 1, frame).length);
});
it('clicking a pinned company opens its why chain', () => { /* component test */ });
// e2e: totals rise during the Vimy run; clicking an event opens the why panel with at least one cause line
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/app/src/map/front.test.ts packages/app/src/map/effects.test.ts packages/app/src/ui/why.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the layers, the totals and the "why" panel**

- [ ] **Step 4: Run all tests and the e2e, and look at screenshots at Zero, 07:00, 12:00, the evening of 9 April and 12 April, at 1280 px and 390 px**

Run: `npm test && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm -w packages/app run e2e`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages
git commit -m "feat(app): the moving front, captured ground, trench states, barrages, bursts, reserves, weather and night; totals and the why panel"
```

---

### Task 19: The first Vimy model report

**Files:**
- Create:
  - `docs/research/vimy/model-report-1.md`, generated by the CLI and then annotated
  - `packages/cli/src/report-md.ts`
- Modify: `packages/cli/src/main.ts` (adds `sim report`)
- Test: `packages/cli/src/report-md.test.ts`

**Interfaces:**
- **Produces: `sim report <scenario> --runs 200 --workers 4 --out <md>`.** It writes:
  - batch v2 as tables: lines, casualties, prisoners, guns, duration and winner against the targets, with pass or fail;
  - the 10 most frequent causes on the 50 most consequential events;
  - the defaults used;
  - the parameters marked `calibrated` with their starting values;
  - an "Explain one run" section for seed 1: the `why` chains of the first stalled company and of every line that fell outside its historical window.
- **The builder's commentary.** Under "Reading this report", for each failing target:
  - which mechanism most likely drives the miss, citing the `why` traces;
  - which calibrated parameters Plan 4 should look at first.

  No parameter is changed in this plan.

- [ ] **Step 1: Write the failing test**

```ts
it('the report lists every historical target with a pass/fail cell and names the calibrated parameters', () => {
  const md = reportToMarkdown(fakeBatch(), fakeRun(), minimalTables());
  expect(md).toMatch(/\| Target \|.*\| Pass \|/); expect(md).toMatch(/## Calibrated parameters/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/cli/src/report-md.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `sim report`, run it on Vimy, and write the commentary**

Run: `npm run sim -- report scenarios/vimy-1917/scenario.yaml --runs 200 --workers 4 --out docs/research/vimy/model-report-1.md`
Expected: it finishes within the 5-minute budget. Record the wall time in the report.

- [ ] **Step 4: Run all tests and the e2e; play `/?run=vimy` from a fresh seed-1 run, and look at it**

Run:

```bash
npm test
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm -w packages/app run e2e
npm run sim -- run scenarios/vimy-1917/scenario.yaml --seed 1 --out packages/app/public/runs/vimy.json
```

Expected: PASS. The run plays to its end with combat visible.

- [ ] **Step 5: Commit**

```bash
git add packages docs/research/vimy/model-report-1.md
git commit -m "feat(cli): model report against the historical record; first Vimy combat-model report"
```

---

### Task 20: The period map style (owner's choice: Clegg-style frame with pictorial territory fills and vignettes)

The owner chose mockup A from https://claude.ai/artifact/9x2q5EpSQb3j9AXDT1i54i, with B's territory fills and vignettes. Board `Main.dc.html` there is the visual reference.

**Files:**
- Create:
  - `packages/app/src/map/period.ts` (territory fills, vignettes, compass rose)
  - `packages/app/src/ui/PeriodFrame.tsx` (border, title cartouche, Explanatory Notes panel)
  - `packages/app/src/ui/periodStyle.ts` (style switch, persisted per viewer)
  - `docs/research/vimy/insignia.md`
- Modify:
  - `packages/scenario/src/schema.ts` (formations gain optional `insignia?: { colour: Sourced<string>; shape?: 'rectangle' | 'circle' | 'diamond' | 'triangle' | 'semicircle' }`)
  - `scenarios/vimy-1917/oob-canadian.yaml`
  - `packages/engine/src/record.ts` (`record.units` carries each battalion's division insignia colour, if it has one)
  - `packages/app/src/map/draw.ts`, `ui/Playback.tsx`, `ui/MapKey.tsx`, `ui/Timeline.tsx`
- Test:
  - `packages/app/src/map/period.test.ts`
  - `packages/scenario/src/vimy-insignia.test.ts`
  - `packages/app/e2e/playback.spec.ts`

**What it looks like** (the reference board):
- **The frame.** The map sits inside the frame; the frame never covers the map.
  - Parchment ground with a paper texture, a dark outer border, a red double rule and corner ornaments.
  - A title cartouche with the battle, the date and a scale bar.
  - An "Explanatory Notes" panel in place of the map key.
  - Period lettering throughout (IM Fell English and IM Fell English SC, which are freely licensed Google Fonts, plus EB Garamond).
- **The clock and controls.** The clock is lettered in period style ("Monday, 9th April · 7.0 a.m."), with a red play button, the speeds, and a ribbon timeline whose milestone ticks are labelled in italics.
- **Battalion blocks at corps zoom.**
  - Each is a small rectangle in its division's insignia colour: filled when in action, open when waiting or in reserve.
  - German battalions are dark blocks with a red edge.
  - Morale and suppression states (Task 17) draw on the block.
  - Zoomed in, companies keep Task 17's markers in the same colours.
- **Territory fills.** Each side's held ground is a pastel wash: tan for the attacker, green for the defender. It is bounded by the moving front from Task 18, so it changes as ground is taken.
- **The compass rose** replaces the north arrow.
- **Vignettes.** Small ink drawings, each tied to something real in the run or the scenario, never decoration alone:
  - a contact-patrol aircraft drawn when a `contact-patrol` channel message is in flight (Task 11);
  - a tank at each tank's position (Task 14), drawn bogged when it bogs;
  - a field gun at each battery `position` (Task 3);
  - an observation balloon at each feature of a new kind `balloon`, which is added only where a source places one.
  - All artwork is original; nothing is copied from the reference maps the owner showed.
- **The plain trench-map style stays available.** A "Period style" switch in the header changes between the two. The choice is remembered per viewer, in browser storage, inside a try/catch.

**Method for insignia:** research the 1917 divisional patch colours (and shapes, if a source gives them) of the four Canadian divisions and the British 5th Division, from the allowed hosts. Enter them as sourced, or as estimates with their reasoning. Notes follow the usual format. Formations without an insignia fall back to the side's colour, recorded in `defaultsUsed`.

- [ ] **Step 1: Write the failing tests**

```ts
it('territory fills follow the front: a lost segment moves the defender fill back', () => {
  expect(fillArea(recordWithLoss(), 60, 'central')).toBeLessThan(fillArea(recordWithLoss(), 0, 'central'));
});
it('every vignette is anchored to a run or scenario thing; none are drawn without one', () => {
  expect(vignettes(recordWithNoTanksOrBalloons(), 30).filter(v => v.kind === 'tank' || v.kind === 'balloon')).toEqual([]);
});
it('battalion blocks use their division insignia colour, falling back to the side colour', () => {
  expect(blockColour(unit({ insignia: '#3f7a3a' }))).toBe('#3f7a3a'); expect(blockColour(unit({ side: 'central' }))).toBe(MAP_COLORS.german);
});
it('every Canadian division has a sourced or estimated insignia colour', () => {
  for (const d of ['1cdn', '2cdn', '3cdn', '4cdn']) expect(formation(vimy(), d).insignia).toBeDefined();
});
// e2e: the period style shows the Explanatory Notes panel and the cartouche; switching to the plain style hides them; the choice survives a reload
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/app/src/map/period.test.ts packages/scenario/src/vimy-insignia.test.ts`
Expected: FAIL.

- [ ] **Step 3: Do the insignia research, then build the frame, blocks, fills, vignettes and switch.** Bump ENGINE_VERSION's patch if the record changes, and re-pin the golden.

- [ ] **Step 4: Run all tests and the e2e, and look at screenshots in both styles at 1280 px and 390 px.**
  - At 390 px, the frame collapses: a thin border, the cartouche above the map, and the Notes panel below it.
  - No text may overlap.

Run: `npm test && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm -w packages/app run e2e`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages scenarios/vimy-1917 docs/research/vimy
git commit -m "feat(app): period map style: Clegg frame, insignia blocks, territory fills and event vignettes"
```

---

## Done when

- `npm test` and the e2e pass, and the budgets hold: one Vimy run ≤ 3 s, a record ≤ 8 MB, 200 runs with 4 workers ≤ 5 min.
- Vimy runs to an end decided by its end conditions, with:
  - a winner;
  - casualties by side and formation, including the bombardment period;
  - prisoners;
  - guns captured.
- Every significant event can be explained by `sim why` and by the app's "why" panel.
- The time-lapse shows:
  - battalions at corps zoom and companies zoomed in;
  - strength, morale and suppression;
  - the moving front and captured ground;
  - barrages, bursts, reserves, weather and night;
  - running totals;
  - the period map style chosen by the owner (Task 20), with the plain trench-map style one switch away.
- `docs/research/vimy/model-report-1.md` reports the uncalibrated model against the record honestly, with pass or fail per target.
- No calibrated parameter has moved from its documented starting value.
- `scenario.yaml` still says `status: draft`.

### Task 21: Data-oriented hot phases (the 3 s budget)

Added during execution, as a provisional ruling flagged to the owner. Task 15 reached about 5 s of CPU for Vimy seed 1. That run now lasts 3.5 days with the comms and command model included, and its profile is flat: no function takes more than about 4%. Once Task 15 measured the routes available, a copy-free state was worth at most about 0.4 s, so the rest of the gap needs this task.

**Files:**
- Modify: the hot phases `fire.ts`, `movement.ts`, `command.ts`, `comms.ts`, `artillery.ts`, `morale.ts`, `resolve.ts` and `record.ts`, plus `step.ts`.
- Test: `packages/engine/src/budget.test.ts`

**Interfaces:**
- **Unchanged:** every phase signature and the record format.
- **Produces:** per-step typed-array views of companies (positions, men, status, suppression) that the hot phases read and write. Each phase converts to the existing `SimState` records once, at the phase boundary.

- [ ] **Step 1: Restore the budget.** In `budget.test.ts`, put back 3000 ms of CPU per Vimy seed 1 run, including `JSON.stringify`, and a limit of 8 MB. Add a batch check of ≤ 5 min for 200 runs × 4 workers, either measured or projected from 20 runs. Run the test and confirm it fails.
- [ ] **Step 2: Rewrite one phase at a time.** Profile, then rewrite the hottest phase over the typed views. Each commit must leave the record byte-identical for seeds 1–3; check this against the hashes taken before the change.
- [ ] **Step 3: Verify.** Run `npm test` (it must be fully green, including the budget) and the e2e.
- [ ] **Step 4: Commit.** Use `perf(engine): …` with "record byte-identical" in each commit message.

Never change the model to meet the budget: no fewer busy steps, and no cut-offs that change outcomes.

---

**Not in this plan:**
- calibration against Vimy, the setup and compare screens, what-if overlays and video export (Plan 4);
- Messines (Plan 5);
- the 3D view (later).
