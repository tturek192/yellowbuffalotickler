# Plan 4: What-ifs, Setup, Compare and Light Calibration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Deadlock 1916 something you can play with. Build:
- **What-if overlays:** forces, artillery and ammunition, weather and ground, leaders swapped in from elsewhere, doctrine, reserve distance.
- **Deadlock scoring:** breakthrough, surrender, collapse, stronghold.
- **The engine running in the browser.**
- **The setup screen and the compare screen.**
- **Side-by-side playback** with the "where did they split" finder.
- **Video export.**
- **A light calibration tool,** run once on Vimy.

**Architecture:**
- **What-ifs are overlays.** An overlay is a small YAML file of named operations applied on top of a historical scenario. The scenario's own files never change (base design §6). `applyOverlay` returns the changed scenario and a list of every change, and each changed value is marked as a what-if in the run record.
- **The browser gets a bundle.** It receives one JSON bundle per scenario (scenario, doctrines, tables, terrain and notes) written by the CLI. The engine runs in a pool of Web Workers (base design §2), so the browser can run batches. Playback still reads only run records.
- **New screens use a query parameter.** The setup, compare and play screens are views chosen by `?view=`, with no router library. They use the period style from Plan 3 Task 20, and the plain style is one switch away.
- **Calibration is light.** It is a bounded search over parameters already marked `calibrated: true`, scored against Vimy's targets by the base design's §7 criteria. It writes a report and only changes the tables when run with `--apply`.

**Tech Stack:** TypeScript (strict), npm workspaces, Zod 3, `yaml`, Vitest 5, Vite 8, React 18.3, Canvas 2D, Web Workers, MediaRecorder (WebM), Playwright 1.63.0, Node `worker_threads` (CLI).

**Spec:**
- The approved design: `docs/superpowers/specs/2026-11-21-deadlock-1916-design.md` (Goals 1–2, sequencing step 2).
- The base design: `docs/superpowers/specs/2026-11-20-wwi-battle-simulator-design.md` (§§ 6, 7, 8, 9.1–9.3).

**Depends on:** Plan 3 being complete. This plan uses these Plan 3 outputs by name:
- `runScenario(s, models, opts)` with `Models = { doctrines, tables }`;
- `RunRecord` v3 (columnar snapshots, `units`, `summary`, `defaultsUsed`);
- `runBatch` and `BatchSummary` v2;
- `explain`, `CAUSES` and `CAUSE_TEXT`, through `@wwi/engine/reader`;
- `loadTables` and `loadScenario`;
- the period style.

## Global Constraints

- **Earlier constraints still hold.** All of Plans 1–3's Global Constraints apply, in particular:
  - sourced data;
  - a deterministic engine;
  - model numbers kept as data;
  - causes on events;
  - conservation of men;
  - the speed budgets;
  - `status: draft`;
  - research honesty.
- **What-ifs are never locked** (owner's decision, Deadlock design). Any overlay may be run at any time. Nothing in the app hides or blocks a what-if because the model hasn't been checked.
- **A what-if never edits the historical scenario's files.** Every value an overlay changes is replaced by `{ value, estimate: "what-if: <overlay title> — <op>" }`. The record lists every change in `whatIf.changes`, so the playback and compare screens can label it. (The full six-grade credibility system is the next plan. This plan only marks changed values honestly.)
- **Same seed, same result, everywhere.** The same bundle, overlay and seed give a byte-identical record in Node (CLI) and in a browser Web Worker.
- **The worker is the only runtime engine code in the app.** Only `packages/app/src/sim/` may import `@wwi/engine` at runtime (the engine runs in a Web Worker, base design §2). Playback still reads records only. `@wwi/engine/reader` (Plan 3 Task 16) stays importable anywhere.
- **Browser storage is a convenience only.** Overlays being edited are kept in `localStorage`, wrapped in try/catch. The durable form of an overlay is a YAML file the user exports, or one saved under `overlays/` in the repository. The CLI reads overlays from files.
- **Calibration rules:**
  - it changes only parameters marked `calibrated: true`;
  - it never changes sourced values;
  - it never changes per-scenario data;
  - it changes nothing without `--apply`;
  - it writes a report every time;
  - the number of parameters it fits is at most half the number of independent targets it scores against (anti-goal "Overfitting").
- **Plan 3's speed budgets hold in the browser too.** A Vimy batch of 200 runs on 4 workers finishes within 5 min. The UI stays responsive throughout, with progress shown and a cancel button.

## Review Focus

1. **An overlay that breaks the scenario.** Examples: scaling a side to 0, removing every attacking company, a negative reserve distance, a weather entry outside the battle, an unknown formation id. Loading or applying it fails with an error naming the overlay op and its index, before any run starts. It never crashes mid-batch. (Task 1 test.)
2. **An overlay written for an older version of the scenario.** Ids may have been renamed or removed since. `applyOverlay` reports every op that no longer resolves, and nothing is silently skipped. The app shows the list and offers to drop those ops. (Task 1 test; Task 6 UI test.)
3. **Node and browser disagree.** A seed-1 Vimy run with an overlay gives the same hash from the CLI and from the Web Worker. (Task 5 test.)
4. **A 200-run batch in the browser.**
   - It must not freeze the page or run out of memory.
   - Workers return summaries, not full records. A chosen run is re-run by its seed on demand.
   - Cancel stops all workers within a second.
   - (Task 5 test.)
5. **Calibration overfitting or touching sourced data.** The tool refuses to fit more parameters than half the targets, refuses any parameter that isn't `calibrated: true`, and never writes without `--apply`. (Task 10 test.)

---

### Task 1: What-if overlays (format and apply)

**Files:**
- Create:
  - `packages/scenario/src/overlay.ts`
  - `overlays/README.md`
  - `overlays/vimy-germans-x2.yaml`
  - `overlays/vimy-half-guns.yaml`
  - `overlays/vimy-reserves-5km.yaml`
- Modify:
  - `packages/scenario/src/index.ts`
  - `packages/scenario/src/load-node.ts` (`loadOverlay(path)`)
  - `packages/cli/src/main.ts` (`--overlay <file>` on `run`, `batch` and `review`)
  - `packages/engine/src/record.ts` (`whatIf` block)
- Test:
  - `packages/scenario/src/overlay.test.ts`
  - `packages/cli/src/main.test.ts`

**Interfaces:**
- **Produces: `Overlay`.**
  - Its shape is `{ id: string; title: string; scenarioId: string; notes?: string; ops: OverlayOp[] }`, a strict schema `OverlaySchema`.
  - `OverlayOp` is a discriminated union on `op`. Every scale op multiplies and rounds, and values are clamped to ≥ 0.
    - **Forces and artillery:**
      - `{ op: 'scale-men'; side?: Side; formationId?: string; factor: number }` scales company strength under the side or the formation;
      - `{ op: 'scale-guns'; side?: Side; artilleryId?: string; factor: number }`;
      - `{ op: 'scale-ammunition'; side?: Side; artilleryId?: string; factor: number }` scales artillery `ammunition` and the bombardment allocations' rounds;
      - `{ op: 'remove-formation'; formationId: string }`;
      - `{ op: 'add-formation'; from: { libraryId: string } | { formationId: string; copyOf: string }; underFormationId: string; startOffsetM?: [number, number] }` adds a formation from the formation library (Task 2) or copies one already in the scenario.
    - **Conditions:**
      - `{ op: 'weather'; preset: string } | { op: 'weather'; timeline: Scenario['weather'] }` (presets in Task 2);
      - `{ op: 'ground'; preset: 'dry' | 'normal' | 'wet' | 'quagmire' }`, which sets a new optional scenario field `groundCondition`. The engine's `speedFactor` (Plan 3 Task 6) reads it as extra mud. The factor for each preset is data: new `tables.effects` keys `groundDry`, `groundNormal`, `groundWet` and `groundQuagmire`, each a calibrated estimate with a description.
    - **Command:**
      - `{ op: 'swap-leader'; formationId: string; leaderId: string }` (leader from the scenario or the leader library);
      - `{ op: 'doctrine'; side: Side; doctrineId: string }`;
      - `{ op: 'reserve-distance'; formationId?: string; side?: Side; km: number }`.
    - **Placement:** `{ op: 'move'; unitId: string; to: [number, number] }` moves a company or a battalion's companies by a local offset. The setup map writes this op (Task 7).
- **Produces: `applyOverlay(s: Scenario, o: Overlay, lib: Library): { scenario: Scenario; changes: Change[]; unresolved: Array<{ index: number; op: OverlayOp; reason: string }> }`.**
  - It is pure.
  - `Change = { index: number; path: string; from: unknown; to: unknown }`.
  - Every value it changes becomes `{ value, estimate: 'what-if: <title> — <op>' }`.
  - `unresolved` lists ops whose ids don't exist; the caller decides what to do with them.
  - The CLI refuses to run while `unresolved` is non-empty, unless `--drop-unresolved` is given.
- **Produces: the record's what-if block.** `RunRecord.whatIf?: { overlayId; title; changes: Change[] }` (additive), with an ENGINE_VERSION patch bump and the golden re-pinned.
- **Produces: `Library` and `emptyLibrary()`.**
  - `Library = { leaders: Leader[]; formations: Formation[]; weatherPresets: Record<string, Scenario['weather']> }`, with its schema `LibrarySchema`, in `packages/scenario/src/overlay.ts`.
  - `emptyLibrary()` returns an empty one.
  - Task 2 fills the library from files through `loadLibrary`.

- [ ] **Step 1: Write the failing tests**

```ts
it('scale-men 2 on the Germans doubles every central company and marks each change as a what-if', () => {
  const { scenario, changes } = applyOverlay(vimy(), ov([{ op: 'scale-men', side: 'central', factor: 2 }]), emptyLib());
  expect(totalMen(scenario, 'central')).toBe(2 * totalMen(vimy(), 'central'));
  expect(changes.length).toBeGreaterThan(0); expect(JSON.stringify(scenario)).toMatch(/what-if: test — scale-men/);
});
it('rejects a broken overlay before any run, naming the op', () => {
  expect(() => OverlaySchema.parse(ovRaw([{ op: 'reserve-distance', km: -3 }]))).toThrow(/ops\[0\]\.km/);
});
it('reports ops that no longer resolve instead of skipping them', () => {
  const r = applyOverlay(vimy(), ov([{ op: 'swap-leader', formationId: 'gone', leaderId: 'byng' }]), emptyLib());
  expect(r.unresolved).toEqual([expect.objectContaining({ index: 0, reason: expect.stringMatching(/formation "gone"/) })]);
});
it('never mutates the scenario it was given', () => {
  const s = vimy(); const before = JSON.stringify(s); applyOverlay(s, ov([{ op: 'scale-guns', factor: 0.5 }]), emptyLib());
  expect(JSON.stringify(s)).toBe(before);
});
// main.test.ts: `sim run … --overlay overlays/vimy-germans-x2.yaml` exits 0 and the record's whatIf.changes is non-empty; an overlay naming a missing formation exits 2 listing it
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/scenario/src/overlay.test.ts packages/cli/src/main.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the overlay schema, `applyOverlay`, `loadOverlay`, the CLI flag, the record block and the three example overlays.** `overlays/README.md` explains each op to the owner, in plain language.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages overlays
git commit -m "feat(scenario): what-if overlays: forces, guns, ammunition, weather, ground, leaders, doctrine, reserves, moves"
```

---

### Task 2: Research — the leader and formation library, weather presets

**Files:**
- Create:
  - `library/leaders-1917.yaml`
  - `library/formations-1917.yaml`
  - `library/weather-presets.yaml`
  - `docs/research/library/leaders.md`
  - `docs/research/library/weather.md`
- Modify: `packages/scenario/src/load-node.ts` (`loadLibrary(dir): Library`)
- Test: `packages/scenario/src/library.test.ts`

**Method:**
1. **Leaders from other sectors** (base design: "leaders and units can be swapped in from other parts of the front"). Enter 12–20 corps and division commanders of 1917 who fought elsewhere on the Western Front:
   - **British and Dominion:** for example the Australian Corps, II Anzac, XVIII Corps and Cambrai's III Corps.
   - **German:** for example Gruppe Arras's neighbours and Flanders commanders.

   Give each a sourced name and rank, and drafted ratings as estimates with justifications. Use the Plan 2 rubric `docs/research/vimy/leader-rubric.md`. The owner owns the ratings.
2. **Formations to add.** Six to ten complete divisions of 1917 with their battalions and companies, each sourced or estimated as in Plan 2 Task 8, for example a British division in Third Army reserve or a German Eingreif division. They can be dropped into Vimy with `add-formation`.
3. **Weather presets:** `dry-spring`, `wet-spring`, `snow-and-sleet`, `fog-at-dawn`, `heavy-rain`.
   - Each is a weather timeline, relative to the battle's start, with precipitation, wind, visibility and temperature.
   - Each value is an estimate whose reasoning cites a documented day it resembles.
4. **Notes.** All research rules apply, and notes follow the usual format.

- [ ] **Step 1: Write the failing test**

```ts
it('the library loads, every leader has a sourced name and drafted ratings, and every preset spans at least 4 days', () => {
  const lib = loadLibrary('library');
  expect(lib.leaders.length).toBeGreaterThanOrEqual(12);
  for (const l of lib.leaders) { expect('source' in l.name).toBe(true); expect(l.ratings).toBeDefined(); }
  for (const p of Object.values(lib.weatherPresets)) expect(spanDays(p)).toBeGreaterThanOrEqual(4);
});
it('a library division dropped into Vimy with add-formation passes checkReferences', () => {
  const s = applyOverlay(vimy(), ov([{ op: 'add-formation', from: { libraryId: firstLibraryDivision() }, underFormationId: 'cdn-corps' }]), loadLibrary('library')).scenario;
  expect(checkReferences(s, ['bef-1917', 'de-1917'])).toEqual([]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/scenario/src/library.test.ts`
Expected: FAIL.

- [ ] **Step 3: Do the research and enter the data, with notes**

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add library docs/research/library packages/scenario
git commit -m "data(library): leaders and divisions from other sectors of 1917; weather presets"
```

---

### Task 3: Deadlock scoring

**Files:**
- Create: `packages/engine/src/deadlock.ts`
- Modify:
  - `packages/scenario/src/schema.ts` (optional `deadlock` section)
  - `scenarios/vimy-1917/command.yaml` (Vimy's conditions)
  - `docs/research/vimy/command.md`
  - `packages/engine/src/summary.ts`
  - `packages/engine/src/batch.ts`
- Test: `packages/engine/src/deadlock.test.ts`

**Interfaces:**
- **Produces: the scenario's `deadlock` section** (strict, optional):
  - `deadlock?: { attacker: Side; artilleryLine: { featureId: string } | { lineId: string }; surrenderFrac: Sourced<number>; collapseFrac: Sourced<number>; strongholds: Array<{ featureId: string }> }`.
  - **Defaults** (listed in `defaultsUsed`):
    - `collapseFrac` 0.1 (owner: "fewer than 10% of enemy troops remaining");
    - `surrenderFrac` 0.5, as an estimate;
    - `strongholds` = `end.keyGround`.
- **Produces: `scoreDeadlock(state, ctx): { broken: boolean; by?: 'breakthrough' | 'surrender' | 'collapse' | 'stronghold'; minute?: number }`.** It is checked each step. The first condition to hold is recorded with its minute, and the event `deadlock-broken` is emitted with causes and refs. The four conditions:
  - **breakthrough:** an attacking company is beyond the defender's artillery line in any sector before any defender reserve has arrived in that sector;
  - **surrender:** the defenders' captured men ≥ `surrenderFrac` of their men at Zero;
  - **collapse:** the defenders' fit men (men not pinned, surrendered or falling back) < `collapseFrac` of their men at Zero;
  - **stronghold:** the attacker holds every stronghold feature.
- **Produces: summary and batch fields.**
  - `summary.deadlock` holds the score above.
  - `BatchSummary.deadlock = { brokenShare: number; byShare: Record<By, number>; minute: { p10; median; p90 } | null }`.
- **Vimy data:**
  - **The artillery line** is a German battery-line feature: a LineString through the German battery positions entered in Plan 3 Task 3, plus any gun line Map 7 shows. It is added to features.geojson with its source and a digitizing note.
  - **The stronghold** is `hill-145`.
- **Version.** Bump ENGINE_VERSION's minor version (0.5.0) and re-pin the golden.

- [ ] **Step 1: Write the failing tests**

```ts
it('records breakthrough when an attacker passes the artillery line before any reserve arrives, and not after one has', () => {
  expect(runBreak({ reserveArrivesFirst: false }).summary.deadlock).toMatchObject({ broken: true, by: 'breakthrough' });
  expect(runBreak({ reserveArrivesFirst: true }).summary.deadlock.by).not.toBe('breakthrough');
});
it('records collapse when fewer than collapseFrac of the defenders remain fit', () => {
  expect(runCollapse().summary.deadlock).toMatchObject({ broken: true, by: 'collapse' });
});
it('the deadlock-broken event has causes and refs', () => {
  const e = runBreak({ reserveArrivesFirst: false }).events.find(x => x.kind === 'deadlock-broken')!;
  expect(e.causes.length).toBeGreaterThan(0); expect(e.refs.length).toBeGreaterThan(0);
});
it('the batch reports the share of runs that broke the deadlock, by condition', () => {
  const b = runBatch(vimy(), vimyDoctrines(), [1, 2, 3]);
  expect(b.deadlock.brokenShare).toBeGreaterThanOrEqual(0); expect(b.deadlock.brokenShare).toBeLessThanOrEqual(1);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/engine/src/deadlock.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the scoring, the schema section, the Vimy data and its notes, and the batch fields**

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages scenarios/vimy-1917 docs/research/vimy
git commit -m "feat(engine): deadlock scoring: breakthrough, surrender, collapse, stronghold; Vimy's conditions"
```

---

### Task 4: Scenario bundles for the browser

**Files:**
- Create:
  - `packages/cli/src/bundle.ts`
  - `packages/app/src/sim/bundle.ts`
- Modify:
  - `packages/cli/src/main.ts` (`sim bundle`)
  - `packages/app/package.json` (`predev` and `prebuild` write bundles)
  - `.gitignore` (`packages/app/public/scenarios/`)
- Test:
  - `packages/cli/src/bundle.test.ts`
  - `packages/app/src/sim/bundle.test.ts`

**Interfaces:**
- **Produces: `sim bundle <scenario.yaml> --out <file.json>`.** It writes `Bundle = { bundleVersion: 1; scenario: Scenario; models: Models; library: Library; notes: string; createdFrom: string }`.
  - `scenario` is merged, projected and validated, with its terrain grid.
  - `notes` is the scenario folder's `notes.md`, if it exists: the owner's historical notes (base design: "The owner will add historical context and notes").
- **Produces: `parseBundle(json: unknown): Bundle` in the app.** It validates with the scenario package's schemas, which are node-free, and gives a clear error.
- **The app's build steps.** `predev` and `prebuild` write `public/scenarios/vimy-1917.json` and `public/scenarios/draft.json`, and `public/scenarios/index.json` lists them.

- [ ] **Step 1: Write the failing tests**

```ts
it('a bundle round-trips: parseBundle(sim bundle output) runs to the same record as the CLI', () => {
  const b = parseBundle(JSON.parse(readFileSync(bundleOf('scenarios/vimy-1917/scenario.yaml'), 'utf8')));
  expect(hash(runScenario(b.scenario, b.models, { seed: 1 }))).toBe(hash(runScenario(vimy(), vimyDoctrines(), { seed: 1 })));
});
it('parseBundle rejects a bundle of another version with a clear message', () => {
  expect(() => parseBundle({ bundleVersion: 99 })).toThrow(/bundleVersion 99/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/cli/src/bundle.test.ts packages/app/src/sim/bundle.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `sim bundle`, `parseBundle` and the build steps**

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages .gitignore
git commit -m "feat(cli,app): scenario bundles for the browser, with the owner's notes"
```

---

### Task 5: The engine in Web Workers, and browser batches

**Files:**
- Create:
  - `packages/app/src/sim/worker.ts`
  - `packages/app/src/sim/pool.ts`
  - `packages/app/src/sim/batch.ts`
- Modify: `packages/engine/src/batch.ts` (factor out `summarizeRuns(runs: RunSummary[], s): BatchSummary`, so the CLI and the app share the aggregation)
- Test:
  - `packages/app/src/sim/pool.test.ts`
  - `packages/app/e2e/batch.spec.ts`

**Interfaces:**
- **Produces: `RunSummary`.** It is `Pick<RunRecord, 'seed' | 'summary' | 'endMinute'> & { hash: string }`, the per-seed result a worker returns.
- **Produces: `createPool(n: number): Pool`.**
  - `Pool.runBatch(bundle, overlay | null, seeds, onProgress): { promise: Promise<BatchSummary>; cancel(): void }`.
  - `Pool.runOne(bundle, overlay | null, seed): Promise<RunRecord>` re-runs one seed in full for playback.
- **What each worker does.** It applies the overlay (`applyOverlay`), runs the engine and returns a `RunSummary`. Full records cross the worker boundary only through `runOne`.
- **Defaults.** `n` defaults to `min(4, navigator.hardwareConcurrency - 1)`. Cancel terminates the workers and resolves within 1 s.

- [ ] **Step 1: Write the failing tests**

```ts
it('a worker run gives the same hash as the CLI for the same bundle, overlay and seed', async () => {
  expect((await pool.runOne(vimyBundle(), germansX2(), 1)).hash).toBe(cliHash('vimy', 'overlays/vimy-germans-x2.yaml', 1));
});
it('summaries from the pool aggregate to the same BatchSummary as runBatch', async () => {
  expect(await pool.runBatch(vimyBundle(), null, [1, 2, 3], () => {}).promise).toEqual(runBatch(vimy(), vimyDoctrines(), [1, 2, 3]));
});
// e2e batch.spec.ts: start a 20-run Vimy batch, see progress advance, press Cancel, and within 1 s the progress stops and the page still responds to clicks
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/app/src/sim/pool.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the worker, the pool and the shared aggregation**

- [ ] **Step 4: Run all tests and the e2e**

Run: `npm test && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm -w packages/app run e2e`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages
git commit -m "feat(app): engine in Web Workers; browser batches with progress and cancel"
```

---

### Task 6: The setup screen I — battle, conditions, commanders, forces

**Files:**
- Create:
  - `packages/app/src/setup/SetupView.tsx`
  - `packages/app/src/setup/Conditions.tsx`
  - `packages/app/src/setup/Commanders.tsx`
  - `packages/app/src/setup/Forces.tsx`
  - `packages/app/src/setup/overlayDraft.ts`
- Modify:
  - `packages/app/src/main.tsx` (`?view=setup|compare|play`; the default stays playback)
  - `packages/app/src/styles.css`
- Test:
  - `packages/app/src/setup/overlayDraft.test.ts`
  - `packages/app/e2e/setup.spec.ts`

**Interfaces and behaviour (base design §9.1, mockups on the design canvas):**
- **The battle picker** comes from `public/scenarios/index.json`. A scenario with `status: draft` shows the draft banner.
- **Conditions:**
  - weather presets, plus a custom timeline editor (a table of times and values);
  - the ground preset;
  - the start date shown, read-only, in this plan.
- **Commanders:** a list of every corps, division and brigade with its leader and ratings, and a swap button. The swap chooses from the scenario's leaders plus the library, and shows ratings side by side. Each swap writes a `swap-leader` op.
- **Forces:**
  - scale sliders for men, guns and ammunition per side, and per division when expanded;
  - reserve distance per reserve;
  - add a library division, or remove a formation;
  - doctrine per side.
- **The overlay draft.** `overlayDraft.ts` turns screen edits into an `Overlay`.
  - The draft is kept in `localStorage`, read and written inside try/catch.
  - **Export** writes a YAML file. **Import** reads a YAML file and shows any `unresolved` ops, with "drop these".
- **Running.** A "Run N times" button starts a batch (Task 5) and opens the compare view (Task 8) when it finishes. "Watch one" runs seed 1 and opens playback.
- **No lock.** No control is ever disabled because the model is unproven.
- **Changed values** carry a small "what-if" mark beside them.

- [ ] **Step 1: Write the failing tests**

```ts
it('screen edits become the minimal overlay: a slider back at 1.0 removes its op', () => {
  const d = draft(); d.setScale('central', 'men', 2); d.setScale('central', 'men', 1);
  expect(d.overlay().ops).toEqual([]);
});
it('an imported overlay with unresolved ops lists them and can drop them', () => {
  const d = draft(); d.importYaml(yamlWithMissingFormation());
  expect(d.unresolved()).toHaveLength(1); d.dropUnresolved(); expect(d.unresolved()).toHaveLength(0);
});
// e2e setup.spec.ts: pick Vimy, set Germans ×2 and the wet-spring preset, swap a division commander, Run 10 times → the compare view opens with 10 runs and a what-if label naming the 3 changes
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/app/src/setup/overlayDraft.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the views and the overlay draft**

- [ ] **Step 4: Run all tests and the e2e, and look at screenshots in the period and plain styles at 1280 px and 390 px**

Run: `npm test && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm -w packages/app run e2e`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/app
git commit -m "feat(app): setup screen: battle, weather and ground, commanders with swap, forces, overlay export and import"
```

---

### Task 7: The setup screen II — the order-of-battle tree and the map

**Files:**
- Create:
  - `packages/app/src/setup/OobTree.tsx`
  - `packages/app/src/setup/Inspector.tsx`
  - `packages/app/src/setup/SetupMap.tsx`
- Modify:
  - `packages/app/src/setup/SetupView.tsx`
  - `packages/app/src/map/draw.ts` (layer toggles)
- Test:
  - `packages/app/src/setup/moves.test.ts`
  - `packages/app/e2e/setup.spec.ts`

**Behaviour (base design §9.1):**
- **The order-of-battle tree** runs corps → division → brigade → battalion → company, with men and status.
- **The battalion inspector** shows each value with its source, estimate or dispute, plus a what-if mark where an overlay changed it.
- **The map:**
  - layer toggles for trenches, wire, objectives, barrage sectors, features, units and terrain;
  - unit markers can be dragged to new start positions, writing `move` ops.
- **`validateMove(s, unitId, to): string | null`** rejects a move that crosses the unit's own front line toward the enemy, or leaves the extent. The marker snaps back and a message says why.

- [ ] **Step 1: Write the failing tests**

```ts
it('a drag behind the own front line is accepted; a drag into the enemy trench is refused with a reason', () => {
  expect(validateMove(vimy(), '1bn-a', ownSidePoint())).toBeNull(); expect(validateMove(vimy(), '1bn-a', germanTrenchPoint())).toMatch(/front line/);
});
// e2e: expand the 1st Canadian Division, open the 7th Battalion's inspector (a source is shown), drag its marker 200 m south, and the overlay gains a move op
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/app/src/setup/moves.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the tree, the inspector, the map with toggles, and the moves**

- [ ] **Step 4: Run all tests and the e2e, and look at screenshots**

Run: `npm test && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm -w packages/app run e2e`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/app
git commit -m "feat(app): setup order-of-battle tree, battalion inspector with sources, map with layers and draggable units"
```

---

### Task 8: The compare screen

**Files:**
- Create:
  - `packages/app/src/compare/CompareView.tsx`
  - `packages/app/src/compare/ObjectiveChart.tsx`
  - `packages/app/src/compare/ResultsTable.tsx`
  - `packages/app/src/compare/Notes.tsx`
  - `packages/app/src/compare/results.ts`
- Test:
  - `packages/app/src/compare/results.test.ts`
  - `packages/app/e2e/compare.spec.ts`

**Behaviour (base design §9.3; Deadlock design Goal 1):**
- **Columns.** The historical record is one column. Each batch (the base scenario and up to three what-ifs) is a column beside it.
- **The objective chart.** For each line, a bar from the historical earliest to latest, and the batch's p10–median–p90 for each column. It draws in the period style.
- **The results table:**
  - casualties by side and formation, prisoners, guns captured, duration and winner share, each against its target, with a pass or fail cell where a target exists (base design §7);
  - deadlock broken (share, by which condition, and when).
- **Notes and labels.** The owner's notes panel shows the bundle's `notes`. Each what-if column lists its changes (`whatIf.changes`).
- **Watching runs.** "Watch run…" picks a seed from a batch (median, best or worst on any row) and opens playback, using `runOne`.
- **`results.ts`** holds pure functions from `BatchSummary` and targets to table rows, including the pass rules.

- [ ] **Step 1: Write the failing tests**

```ts
it('a disputed casualty target passes when the median lies inside its range', () => {
  expect(rowFor(batchWithMedian(3300), disputedTarget([3133, 3473])).pass).toBe(true);
});
it('the median-run picker returns the seed whose value is the batch median', () => {
  expect(pickSeed(summaries([[1, 10], [2, 30], [3, 20]]), 'median', r => r.v)).toBe(3);
});
// e2e: open compare with the base batch and one what-if; the objective chart shows a historical bar and two batch bands per line; "Watch median run" opens playback
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/app/src/compare/results.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the compare view**

- [ ] **Step 4: Run all tests and the e2e, and look at screenshots**

Run: `npm test && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm -w packages/app run e2e`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/app
git commit -m "feat(app): compare screen: the record beside what-if batches, objective chart, results and deadlock table, notes"
```

---

### Task 9: Side-by-side playback and "where did they split?"

**Files:**
- Create:
  - `packages/engine/src/diverge.ts` (exported through `@wwi/engine/reader`)
  - `packages/app/src/ui/SideBySide.tsx`
- Modify: `packages/app/src/ui/Playback.tsx`
- Test:
  - `packages/engine/src/diverge.test.ts`
  - `packages/app/e2e/sidebyside.spec.ts`

**Interfaces (base design §8 and §9.2):**
- **Produces: `firstDivergence(a: RunRecord, b: RunRecord): Divergence | null`.**
  - Events are matched by `(kind, unitId, sectorId, lineId)` in order.
  - The first event present in one run and not the other, or more than 2 steps apart in time, is the divergence.
  - `Divergence = { minute: number; a: SimEvent | null; b: SimEvent | null; why: { a?: Why; b?: Why } }`, using `explain` from Plan 3 Task 16.
- **Produces: `describeDivergence(d): string`**, in plain language. Example: "Run B: the 4th Division's 87th Battalion was pinned at 05:44 because machine guns in a stretch the bombardment spared opened fire."
- **Side-by-side playback.**
  - Two runs, or a run beside the historical timeline (historical line falls and events drawn as a ghost track), play in sync on one clock.
  - The divergence moment is marked on the timeline. Clicking it jumps both views there and opens both "why" chains.

- [ ] **Step 1: Write the failing tests**

```ts
it('two identical runs have no divergence', () => { expect(firstDivergence(rec(1), rec(1))).toBeNull(); });
it('runs that differ by a garrison MG finds the first differing event and explains both sides', () => {
  const d = firstDivergence(runWithMgs(2), runWithMgs(0))!;
  expect(d.minute).toBeGreaterThan(0); expect(describeDivergence(d)).toMatch(/machine gun|pinned/);
});
// e2e: open two Vimy runs side by side; both clocks show the same time while playing; the divergence marker jumps both views
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/engine/src/diverge.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the divergence finder and the side-by-side view**

- [ ] **Step 4: Run all tests and the e2e**

Run: `npm test && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm -w packages/app run e2e`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages
git commit -m "feat: side-by-side playback against another run or the historical timeline; where two runs first split"
```

---

### Task 10: The light calibration tool

**Files:**
- Create:
  - `packages/cli/src/calibrate.ts`
  - `packages/cli/src/calibrate-md.ts`
- Modify:
  - `packages/scenario/src/tables.ts` (`Param` gains an optional `range?: [number, number]`, the bounds a calibration may search; required for any parameter offered to calibration)
  - `packages/cli/src/main.ts` (`sim calibrate`)
- Test: `packages/cli/src/calibrate.test.ts`

**Interfaces (base design §7, "calibrate the shared parameters on Vimy"; kept light):**
- **The command:** `sim calibrate <scenario> --params <path,…> --runs <n> --trials <m> [--seed-base k] [--apply] --out <report.md>`.
- **The search.** A deterministic Latin-hypercube sample of `m` points within each parameter's `range`. Each point is scored on `n` runs against the scenario's targets.
  - **The score** is the number of failed targets under §7's criteria, with ties broken by the sum of normalised distances to target.
  - **The best point** is reported against the starting values.
- **Guards:**
  - every listed path must point to a `Param` with `calibrated: true` and a `range`;
  - the number of parameters must be ≤ ⌊targets / 2⌋;
  - otherwise it exits 2 and explains why.
- **`--apply`** rewrites only those parameters in `tables/*.yaml`. It keeps each one an estimate, whose text gains "calibrated on <scenario> (<date>, <runs>×<trials>): was <old>".
- **The report** lists:
  - each parameter, its old and new values, and its range;
  - each target, before and after;
  - the overfitting guard's numbers;
  - which targets still fail.

- [ ] **Step 1: Write the failing tests**

```ts
it('refuses a parameter that is not calibrated, naming it', () => {
  expect(cli(['calibrate', VIMY, '--params', 'weapons.vickers.rpm'])).toMatchObject({ code: 2, stderr: expect.stringMatching(/weapons\.vickers\.rpm.*not calibrated/) });
});
it('refuses to fit more parameters than half the targets', () => {
  expect(cli(['calibrate', VIMY, '--params', tooManyParams()])).toMatchObject({ code: 2, stderr: expect.stringMatching(/at most \d+ parameters/) });
});
it('without --apply, the tables are byte-identical after a run', () => {
  const before = readTables(); cli(['calibrate', VIMY, '--params', twoParams(), '--runs', '3', '--trials', '4', '--out', tmp()]); expect(readTables()).toEqual(before);
});
it('the same seeds and trials give the same proposal', () => { expect(proposal(1)).toEqual(proposal(1)); });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/cli/src/calibrate.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `sim calibrate`.** Add `range` to the parameters Plan 3 Task 19's report named first for calibration, each range with its reasoning.

- [ ] **Step 4: Run it once on Vimy and commit the report** (without `--apply`; the owner decides whether to apply)

Run: `npm run sim -- calibrate scenarios/vimy-1917/scenario.yaml --params <the report's first picks, within the guard> --runs 50 --trials 24 --out docs/research/vimy/calibration-1.md`
Expected: it finishes within 30 min on 4 workers. The report lists the proposal. The tables are unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages tables docs/research/vimy/calibration-1.md
git commit -m "feat(cli): light calibration on shared parameters with overfitting guard; first Vimy calibration report"
```

---

### Task 11: Video export of the time-lapse

**Files:**
- Create: `packages/app/src/ui/exportVideo.ts`
- Modify: `packages/app/src/ui/Playback.tsx`
- Test:
  - `packages/app/src/ui/exportVideo.test.ts`
  - `packages/app/e2e/export.spec.ts`

**Behaviour (base design §9.2, "Export: save a time-lapse as a video file"):**
- **The button.** "Save video…" records the map canvas, with the clock and totals drawn into an export frame, using `canvas.captureStream` and `MediaRecorder` (WebM, VP9 if supported, else VP8).
- **What it records.** It plays from the current playhead to the end at the chosen speed, at 30 fps, then offers the file. The file is named `<scenario>-<overlay or base>-seed<k>.webm`.
- **A pure helper,** `framePlan(startMin, endMin, speed, fps): number[]`, gives the battle minutes to draw. Recording is driven by it, not by wall time, so a slow machine still produces a smooth video.

- [ ] **Step 1: Write the failing tests**

```ts
it('frame plan covers the range at the chosen speed', () => { expect(framePlan(0, 60, 10, 30)).toHaveLength(Math.ceil((60 / 10) * 30) + 1); });
// e2e: export a short slice (Zero to 05:40 at 1 s = 10 min); a .webm download of non-zero size is offered
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/app/src/ui/exportVideo.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the export**

- [ ] **Step 4: Run all tests and the e2e**

Run: `npm test && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm -w packages/app run e2e`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/app
git commit -m "feat(app): save a time-lapse as a WebM video"
```

---

### Task 12: The owner's guide and an end-to-end what-if

**Files:**
- Create:
  - `docs/guide/what-ifs.md`
  - `packages/app/e2e/whatif-flow.spec.ts`
- Modify: `README.md` (how to open the app and the setup view)

**Behaviour:**
- **The guide** is plain language, for a historian. It covers:
  - making a what-if in the setup screen;
  - exporting and importing overlays, and saving one under `overlays/` for the CLI;
  - reading the compare screen and the deadlock scores;
  - watching the median run;
  - side-by-side playback;
  - saving a video;
  - what the "what-if" marks mean;
  - that what-ifs are never locked.
- **The e2e test** runs one whole flow: setup (Germans ×2) → run 10 → compare → watch median → side by side with the historical timeline → divergence shown.

- [ ] **Step 1: Write the e2e as above, and run it to see it fail where anything is missing**

Run: `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm -w packages/app run e2e -- whatif-flow.spec.ts`
Expected: FAIL until the flow is complete, then PASS.

- [ ] **Step 2: Write the guide and update the README**

- [ ] **Step 3: Run all tests and the e2e**

Run: `npm test && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm -w packages/app run e2e`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add docs/guide README.md packages/app/e2e
git commit -m "docs: the owner's guide to what-ifs; end-to-end what-if flow test"
```

---

## Done when

- **What-ifs:**
  - overlays cover forces, guns, ammunition, weather, ground, leaders (with a library from other sectors), doctrine, reserve distance and moves;
  - they never edit the historical files;
  - they're marked in every record.
- **The deadlock is scored** on every run, by which condition broke it and when, and batches report the shares.
- **The browser runs the engine in workers,** with the same results as the CLI. A 200-run Vimy batch fits the budget, with progress and cancel.
- **Setup:** battle, conditions, commanders, forces, the order-of-battle tree, the inspector, and a map with draggable units. Overlays export and import.
- **Compare:** the record beside up to three what-ifs, the objective chart, the results and deadlock tables, and the owner's notes.
- **Side-by-side playback** shows the first divergence, explained.
- **Video export** works.
- **`sim calibrate`** exists with its guards, and its first Vimy report is committed. Applying it is the owner's choice.
- **Nothing is ever locked** for being unproven.

**Not in this plan:**
- credibility grades, the limits table and the post-conflict report (next plan);
- playing the general (the plan after that);
- either side attacking;
- the operational layer;
- generated sectors;
- sweeps.
