# Plan 4: What-ifs, Setup, Compare and Light Calibration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Deadlock 1916 something you can play with. Build:
- **A picture-only fix first:** companies report enemy lines taken or lost only when they can see them, and the Vimy model report is regenerated on that engine (Task 0).
- **What-if overlays:** forces, artillery and ammunition, weather and ground, leaders swapped in from elsewhere, doctrine, reserve distance.
- **Deadlock scoring:** breakthrough, surrender, collapse, stronghold.
- **The engine running in the browser.**
- **The setup screen and the compare screen.**
- **Side-by-side playback** with the "where did they split" finder.
- **Video export.**
- **A light calibration tool,** run once on Vimy.

**Architecture:**
- **What-ifs are overlays.** An overlay is a small YAML file of named operations applied on top of a historical scenario. The scenario's own files never change (base design §6). `applyOverlay` returns the changed scenario and a list of every change. The engine writes the overlay's id, title and changes into the run record (`RunOptions.whatIf`), so there is one writer for the CLI and the browser.
- **The browser gets a bundle.** It receives one JSON bundle per scenario (scenario, doctrines, tables, library, terrain and notes) written by the CLI. The engine runs in a pool of Web Workers (base design §2), so the browser can run batches. Playback still reads only run records.
- **New screens use a query parameter.** The setup, compare and play screens are views chosen by `?view=`, with no router library. Views change with `history.pushState` and app state, never a reload (a reload loses a batch held in memory). They use the period style from Plan 3 Task 20 (`ui/periodStyle.ts` `useMapStyle()` and the `.is-period` class in `main.tsx`), and the plain style is one switch away.
- **Calibration is light.** It is a bounded search over parameters already marked `calibrated: true`, scored against Vimy's targets by the base design's §7 criteria. It writes a report and only changes the tables or doctrine files when run with `--apply`.

**Tech Stack:** TypeScript (strict), npm workspaces, Zod 3, `yaml`, Vitest 5, Vite 8, React 18.3, Canvas 2D, Web Workers, MediaRecorder (WebM), Playwright 1.63.0, Node `worker_threads` (CLI).

**Spec:**
- The approved design: `docs/superpowers/specs/2026-11-21-deadlock-1916-design.md` (Goals 1–2, sequencing step 2).
- The base design: `docs/superpowers/specs/2026-11-20-wwi-battle-simulator-design.md` (§§ 6, 7, 8, 9.1–9.3).
- Pre-flight table and rulings: `.superpowers/sdd/2026-11-21-04-whatifs-setup-compare/preflight.md`. Row ids (P, S, D, X, SP) are cited where a ruling shaped a task.

**Depends on:** Plan 3 being complete (branch at `7c00eb5`). This plan uses these Plan 3 outputs by name:
- `runScenario(s: Scenario, models: Models, opts: RunOptions): RunRecord` with `Models = { doctrines: Record<string, Doctrine>; tables: Tables }` (`engine/src/run.ts`);
- the 0.4.8 record (`RunRecord.engineVersion: '0.4.8'`, `record.ts:6`; columnar snapshots, `units`, `summary`, `defaultsUsed`). There is no record version field: the record's version is ENGINE_VERSION;
- `runBatch(s, models, seeds): BatchSummary` (Batch v2), `extractRun(s, r): RunExtract`, `summarizeBatch(s, runs: RunExtract[]): BatchSummary` and `casualtyPass(t, s)` (`engine/src/batch.ts`), already used by `cli/src/workers.ts`;
- `@wwi/engine/reader`, which exports `explain`, `type Why`, `type WhyRef`, `CAUSE_TEXT` and `sunTimes`. `CAUSES` is exported only from `@wwi/engine` (`index.ts`); a task that needs it in the app adds it to `reader.ts` (`causes.ts` is pure);
- `loadTables` (returns `LoadedTables = Tables & { sources }`), `loadScenario` (loads only the doctrines its forces name), `parseScenario(yamlText, doctrineIds)` and `parseScenarioData(data, doctrineIds, locate?, tables?)` (`scenario/src/load.ts`, node-free), `checkReferences` (`scenario/src/references.ts`);
- the period style;
- the draft golden in `packages/engine/src/draft-scenario.test.ts` (`438acf06` at 0.4.8), with its version-history comment that every bump extends.

**Version order.** Task 0 → ENGINE_VERSION `0.4.9`. Task 1 → `0.4.10`. Task 3 → `0.5.0`. A later task that changes the record bumps the patch (`0.5.1`, …). Each bump re-pins the draft golden and adds its note line to the version-history comment in `draft-scenario.test.ts`, as Plan 3 did.

## Global Constraints

- **Earlier constraints still hold.** All of Plans 1–3's Global Constraints apply, in particular:
  - sourced data;
  - a deterministic engine;
  - model numbers kept as data;
  - causes on events;
  - conservation of men;
  - the speed budgets (restated below);
  - `status: draft`;
  - research honesty.
- **What-ifs are never locked** (owner's decision, Deadlock design). Any overlay may be run at any time. Nothing in the app hides or blocks a what-if because the model hasn't been checked.
- **A what-if never edits the historical scenario's files, and marks what it changes honestly** (S2):
  - **`Sourced` and `Disputed` numbers** an overlay changes are replaced by `{ value, estimate: "what-if: <overlay title> — <op>" }`. The old value (with a Disputed value's `range` and `sources`) is kept in `Change.from`.
  - **Plain fields** (`forces[].doctrine`, `formation.leaderId`, `company.start`, and similar) are changed in place and recorded **only** in `whatIf.changes`.
  - **`groundCondition`** is `sourced(enum)`, and an overlay sets it as a what-if estimate.
  - **Added library items** keep their own sourcing. The add is recorded as a Change.
  - The record lists every change in `whatIf.changes`, so the playback, setup and compare screens can label it. The screens read `whatIf.changes`, not the value alone. (The full six-grade credibility system is the next plan. This plan only marks changed values honestly.)
- **Same seed, same result, everywhere.** The same bundle, overlay and seed give a byte-identical record in Node (CLI) and in a browser Web Worker. Per-company draws stay ordered as now, so an overlay that adds or removes formations shifts every later company's draws and its runs diverge from the base at once (D24, Task 9).
- **The engine at runtime in the app lives in the worker.** Only `packages/app/src/sim/**` may import `@wwi/engine` at runtime (the engine runs in a Web Worker, base design §2). The existing guard `packages/app/src/ui/why.test.ts:88-95` ("the app imports the engine at runtime only through @wwi/engine/reader") is amended in Task 5 to allow `src/sim/**`. Playback still reads records only. `@wwi/engine/reader` (Plan 3 Task 16) stays importable anywhere.
- **Browser storage is a convenience only.** Overlays being edited are kept in `localStorage`, wrapped in try/catch. The durable form of an overlay is a YAML file the user exports, or one saved under `overlays/` in the repository. The CLI reads overlays from files.
- **Calibration rules:**
  - it changes only parameters marked `calibrated: true`, with a `searchRange`;
  - it never changes sourced values;
  - it never changes per-scenario data;
  - it changes nothing without `--apply`;
  - it writes a report every time;
  - the number of parameters it fits is at most half the number of independent targets it scores against (anti-goal "Overfitting"). The independent targets are the `BatchSummary` rows with a non-null pass, with nested windows of the same side and formation counted once (SP6, Task 10).
- **The speed budgets, as `packages/engine/src/budget.test.ts` and `cli/src/workers.test.ts` hold them now** (D18):
  - a cold Vimy run (seed 1) ≤ 4500 ms of CPU;
  - warm, the best of 3 runs ≤ 3500 ms of CPU;
  - the record ≤ 8 MB;
  - a Vimy batch of 200 runs on 4 workers ≤ 5 min.
  - **The 3 s per-run target of Plan 3 is unmet and pending the owner's decision** (re-baseline the budget or trim the model). This plan does not decide it, and no task loosens the guards above.
  - **In the browser** the guard is the 200 × 4 ≤ 5 min batch, measured by hand in Task 5 and recorded in the ledger. The UI stays responsive throughout, with progress shown per run and a cancel button. What-if batches get no extra budget, though a stalled what-if runs to its `timeLimitMinutes` cap (about 3× history) (D25).
  - Task 0 and Task 3 re-run `budget.test.ts`, since each adds work to every step.

## Review Focus

1. **An overlay that breaks the scenario** (S3). Each case fails with an error naming the overlay op and its index, before any run starts, and never crashes mid-batch:
   - scaling a side's men to 0: `scale-men.factor` must be > 0 (schema);
   - removing every attacking company of a sector, or every company of a side: `checkOverlaid` fails;
   - a negative reserve distance: `reserve-distance.km` must be ≥ 0 (schema);
   - a weather entry outside the battle: `checkOverlaid` fails for an entry outside `[zeroHour, zeroHour + timeLimitMinutes]`;
   - a reference that no longer checks (`checkReferences` after applying): `checkOverlaid` fails.
   - (Task 1 tests, one per case.)
2. **An overlay written for an older version of the scenario.** Ids may have been renamed or removed since. An unknown formation, unit, leader, artillery, preset, library or doctrine id is **unresolved**, not an error. `applyOverlay` reports every op that no longer resolves, and nothing is silently skipped. The CLI exits 2 listing them unless `--drop-unresolved` is given, so no run starts. The app shows the list and offers to drop those ops. (Task 1 test; Task 6 UI test.)
3. **Node and browser disagree.** A seed-1 Vimy run with `overlays/vimy-germans-x2.yaml` gives the same hash from the CLI and from the Web Worker. (Task 5 e2e.)
4. **A 200-run batch in the browser.**
   - It must not freeze the page or run out of memory.
   - Workers return `RunExtract & { hash }`, not full records (no `snapshots` key crosses the boundary). A chosen run is re-run by its seed on demand.
   - Cancel stops all workers within a second.
   - (Task 5 e2e for the behaviour; a manual 200-run measurement recorded in the ledger.)
5. **Calibration overfitting or touching sourced data.** The tool refuses to fit more parameters than half the independent targets, refuses any parameter that isn't `calibrated: true` with a `searchRange`, and never writes without `--apply`. (Task 10 test.)

---

### Task 0: Picture-only fix for enemy lines, and the report baseline

**Why first** (pre-flight section A, SP8): `seesLines` drives every dropped German counter-attack, and Plan 3's rulings forbid calibrating any counter-attack parameter before it lands. Task 10 picks its parameters from the model report, and the historian's what-ifs (Germans ×2, reserves at 5 km, compare) all measure the German reaction. No other task owns `comms.ts`, and folding the fix into Task 1 would hide an outcome change in a schema commit.

**Files:**
- Modify:
  - `packages/engine/src/comms.ts` (`companyReports` → `seesLines`)
  - `packages/engine/src/record.ts` (ENGINE_VERSION `0.4.9`)
  - `packages/engine/src/draft-scenario.test.ts` (golden re-pinned, 0.4.9 note line)
  - `docs/research/vimy/model-report-1.md` (generated sections regenerated in place; one line added to the commentary block)
- Test:
  - `packages/engine/src/comms.test.ts`
  - `packages/engine/src/budget.test.ts` (re-run, unchanged)

**Interfaces:**
- **No new exports.** `companyReports(state, ctx)` keeps its signature.
- **What changes.** Today `seesLines(c)` (`comms.ts:1021`) keeps any enemy line taken or lost whose trace, at the company's `y` clamped to the sector, lies within `observerRangeM` (1500 m), with no sight or visibility test. After the fix, a company reports a line event only if it **sees some point of that line in the sector**, by the same test `enemySeen` uses:
  - the eyes are `eyesOf(state, ctx)` (`comms.ts:1102`), built once per `companyReports` call (the function already holds an `eyes` slot): within `range = min(observerRangeM, visibilityM(...))`, `visibility(r, visM) > 0`, and in `sightFrom(ctx.world, [c.x, c.y])`;
  - the points tested are the line's trace sampled every 25 m of `y` over the sector's `[yMin, yMax]`, worked out once per `lineId|sectorId` and cached as `samplesOf` caches a zone's points;
  - the company sees the line if `seesAny(eyes.of(c), pts)` (`comms.ts`), after the existing tests (`lineTakerOf(state, ctx, k) !== c.side`, `onField(c)`, the line and sector exist).
  - This is the same remedy as Plan 3's final fix 3, applied to the one reporting path it missed. Write no second sight test.
- **Version.** It changes outcomes, so ENGINE_VERSION goes to `0.4.9`.
- **The golden.** The draft has no enemy, so its record should move only by its version string. Re-pin the hash and add the line: `// 0.4.9 (Plan 4 Task 0): a company reports an enemy line taken or lost only when it sees some point of it in the sector, by the sight-line and visibility tests enemySeen uses (eyesOf). The draft has no enemy: only the version moves its record.` If the hash moves by more than the version string, stop and find out why.
- **The report.** `docs/research/vimy/model-report-1.md` is regenerated in place at 0.4.9. Its header today says *engine 0.4.5*, staler than Plan 3's rulings recorded (they name 0.4.7).

- [ ] **Step 1: Write the failing tests** (in `comms.test.ts`, a new block beside `describe('what a company sees of the enemy (final review fix)', …)`, reusing its fixture `fixtureFire`)

```ts
describe('what a company reports of enemy lines taken or lost (Plan 4 Task 0)', () => {
  /** The enemy lines an observer of the side that did not take it names in its report, the step a line is taken within 1.5 km of it. */
  // linesReported(f, observerId): string[] — initRun, put a `line-taken` for a line in the observer's sector in the step's events, run companyReports, read the observer's report
  it('reports a line taken within observerRangeM that it can see, in daylight and clear weather', () => {
    expect(linesReported(lineTakenFixture(), OBSERVER)).toEqual([LINE_KEY]);
  });
  it('does not report a line taken within 1.5 km with no line of sight to any point of it in the sector', () => {
    expect(linesReported(lineTakenFixture({ ridgeBetween: true }), OBSERVER)).toEqual([]);
  });
  it('does not report it in mist (the weather) or at night (nightVisibilityM)', () => {
    expect(linesReported(lineTakenFixture({ visibilityM: 300 }), OBSERVER)).toEqual([]);
    expect(linesReported(lineTakenFixture({ zeroHour: '1916-07-01T01:00' }), OBSERVER)).toEqual([]);
  });
  it('sees the line at some point in the sector even where the trace at its own y is hidden', () => {
    expect(linesReported(lineTakenFixture({ hiddenAtOwnY: true }), OBSERVER)).toEqual([LINE_KEY]);
  });
});
```

`lineTakenFixture(opts)` builds on `fixtureFire(opts)`: the observer is a company of the side that did not take the line, within 1.5 km of the line, and the ridge option lies between them (add an option to `fixtureFire` if `ridgeBetween` does not). Mist and night are set as the existing "sees nothing beyond the visibility" test sets them.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/engine/src/comms.test.ts`
Expected: FAIL (the ridge, mist and night cases report the line).

- [ ] **Step 3: Implement the fix in `seesLines`, bump ENGINE_VERSION to `0.4.9`, re-pin the draft golden with its note line**

- [ ] **Step 4: Run all tests, then the budget test on its own**

Run: `npm test`
Expected: PASS.

Run: `npx vitest run packages/engine/src/budget.test.ts`
Expected: PASS: cold ≤ 4500 ms, warm best of 3 ≤ 3500 ms, record ≤ 8 MB. Record the measured cold and warm numbers in the ledger. If it fails, the cache of samples per line and sector, or the single `eyesOf` per call, is missing: fix that, don't loosen the guard.

- [ ] **Step 5: Regenerate the model report's generated sections in place**

Run: `npm run sim -- report scenarios/vimy-1917/scenario.yaml --runs 200 --workers 4 --out docs/research/vimy/model-report-1.md`
Expected: the command keeps the hand-written block between `<!-- builder-commentary:start … -->` and `<!-- builder-commentary:end -->` and rewrites everything else. The header names engine 0.4.9. The wall time stays within 5 min (record it).

Then add **one** dated line at the top of the commentary block (directly under the start marker), and change nothing else in the block:

```md
_Stale (<today's date>, engine 0.4.9): this commentary was written against engine 0.4.5. Its seed-1 event numbers (#n) and counts refer to that run, not to the tables above. It is to be rewritten in Plan 4 Task 10 Step 0._
```

Check with `git diff docs/research/vimy/model-report-1.md` that the only change inside the block is that line.

- [ ] **Step 6: Commit**

```bash
git add packages/engine docs/research/vimy/model-report-1.md
git commit -m "fix(engine): companies report enemy lines only when they see them (0.4.9); model report regenerated"
```

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
  - `packages/scenario/src/schema.ts` (root `groundCondition`; `ReserveSchema.strengthFactor`; export `LeaderSchema` and `type Leader`) (P2, D11, S6)
  - `packages/scenario/src/tables.ts` (`EFFECT_KEYS` += `groundDry`, `groundNormal`, `groundWet`, `groundQuagmire`; `EFFECT_RANGES` `positive` for each) (P8)
  - `tables/effects.yaml` (the four ground factors, `calibrated: true`, each with a description)
  - `packages/scenario/src/test-fixtures.ts` (`minimalTables()` gains the four keys; `vimyScenario()` and `totalMen()` for scenario-package tests) (S1d)
  - `packages/scenario/src/load-node.ts` (`loadOverlay(path)`, wrapping `parseOverlay`)
  - `packages/engine/src/ground.ts` (the ground preset enters `wetness()`) (P8, D13)
  - `packages/engine/src/defaults.ts` (`withReserveCompanies` multiplies made-up strengths by the reserve's `strengthFactor`) (D11)
  - `packages/engine/src/run.ts` (`RunOptions.whatIf`, written into the record) (P4)
  - `packages/engine/src/record.ts` (`whatIf` block; ENGINE_VERSION `0.4.10`)
  - `packages/engine/src/draft-scenario.test.ts` (golden re-pinned, 0.4.10 note line)
  - `packages/cli/src/main.ts` (`--overlay <file>` and `--drop-unresolved` on `run`, `batch`, `review` and `report`; extend the command check at `main.ts:83` and `USAGE`)
  - `packages/cli/src/workers.ts` (`Files` and `Job` gain `overlayFile?` and `dropUnresolved?`; `load()` applies the overlay in each worker) (P30)
- Test:
  - `packages/scenario/src/overlay.test.ts`
  - `packages/engine/src/whatif.test.ts`
  - `packages/cli/src/main.test.ts`
  - `packages/cli/src/workers.test.ts`

**Interfaces:**
- **Produces: `Overlay`, `OverlaySchema`, `parseOverlay` and `loadOverlay`.**
  - `Overlay = { id: string; title: string; scenarioId: string; notes?: string; ops: OverlayOp[] }`, a strict schema `OverlaySchema`.
  - `parseOverlay(yamlText: string): Overlay` lives in `overlay.ts` and is node-free, like `parseScenario` in `load.ts` (the browser parses overlays in Tasks 5 and 6) (P3). It throws `ScenarioError` with each problem formatted `ops[0].km: …`, as `loadTables` formats paths in `load-node.ts`.
  - `loadOverlay(path: string): Overlay` in `load-node.ts` reads the file and calls `parseOverlay`.
- **`OverlayOp`** is a discriminated union on `op`:
  - **Forces and artillery:**
    - `ReserveSchema` gains `strengthFactor?: sourced(z.number().positive())`; `withReserveCompanies` (`defaults.ts`) multiplies the strength of every company it makes up for that reserve by it (absent means 1) (D11);
    - `{ op: 'scale-men'; side?: Side; formationId?: string; factor: number }`, `factor > 0` in the schema. It scales company strength under the side or the formation, rounding each company to a whole man with a minimum of 1 (X8). A side or formation that includes an off-map reserve with no companies (made up by the engine, `defaults.ts` `withReserveCompanies`) gets the reserve's `strengthFactor` set to the factor (multiplied into any existing one), recorded as a Change (D11);
    - `{ op: 'scale-guns'; side?: Side; artilleryId?: string; factor: number }`, `factor ≥ 0` (no guns is a fair question);
    - `{ op: 'scale-ammunition'; side?: Side; artilleryId?: string; factor: number }`, `factor ≥ 0`. It scales artillery `ammunition` and the bombardment allocations' rounds;
    - `{ op: 'remove-formation'; formationId: string }`. It also removes the dependents that name the formation or its sub-formations: `reserves[]` entries by `formationId`, `operations[]` entries by `formationId`, the `formationId` link of `artillery[]` entries, and `communications.liaison` entries. Each removal is a Change. `historical.casualties[]` targets stay, and the compare screen marks a target whose formation was removed "removed by what-if" rather than fail (S4);
    - `{ op: 'add-formation'; from: { libraryId: string } | { formationId: string; copyOf: string }; side: Side; underFormationId: string; entryPoint: [number, number]; distanceKm: number }` adds a division from the formation library (Task 2) or copies one already in the scenario, **as an off-map reserve** (P1). Its companies take role `reserve`, a `reserves[]` entry `{ formationId, side, distanceKm, entryPoint }` is written as a what-if estimate, and the engine's existing reserve march brings it in. `underFormationId` places it in the formation tree only. `distanceKm ≥ 0`. A division cannot be dropped straight into the attack in this plan.
  - **Conditions:**
    - `{ op: 'weather'; preset: string } | { op: 'weather'; timeline: Scenario['weather'] }`. A preset (Task 2) is relative: `WeatherPreset = Array<Omit<Scenario['weather'][number], 'at'> & { afterMin: number }>`. `applyOverlay` converts each entry to an absolute `at` from the scenario's `zeroHour` (P12);
    - `{ op: 'ground'; preset: 'dry' | 'normal' | 'wet' | 'quagmire' }` sets the new optional root field `groundCondition: sourced(z.enum(['dry', 'normal', 'wet', 'quagmire']))` (declared on the `z.strictObject` root, D28). The factor for each preset is data: the new `tables.effects` keys `groundDry`, `groundNormal`, `groundWet` and `groundQuagmire`, each `positive` in `EFFECT_RANGES`, `calibrated: true`, and with a description. The preset enters `wetness(w, minute)` (`ground.ts:155`): `wetness()` multiplies its result by the preset's factor and clamps it to [0, 1] (`groundNormal` is 1; absent `groundCondition` means normal). `speedFactor(w, p, wet, to?)` (`ground.ts:179`) keeps its signature (D13).
  - **Command:**
    - `{ op: 'swap-leader'; formationId: string; leaderId: string }` (leader from the scenario or the leader library; a library leader is added to `leaders` with its own sourcing);
    - `{ op: 'doctrine'; side: Side; doctrineId: string }`. It swaps the side's whole doctrine, weapons included (`companyWeapons`), until tactics packages arrive (Deadlock design, doctrine across armies). `overlays/README.md` says so (S5);
    - `{ op: 'reserve-distance'; formationId?: string; side?: Side; km: number }`, `km ≥ 0` in the schema.
  - **Placement:** `{ op: 'move'; unitId: string; by: [number, number] }` moves a company, or each company of a battalion, by a local offset `[dx, dy]` in metres (P6). Scenario coordinates are local after loading (the loader projects before parsing). The setup map writes this op (Task 7).
- **Produces: `applyOverlay(s: Scenario, o: Overlay, lib: Library, doctrineIds: string[]): { scenario: Scenario; changes: Change[]; unresolved: Array<{ index: number; op: OverlayOp; reason: string }> }`.**
  - It is pure, and never mutates `s`.
  - `Change = { index: number; path: string; from: unknown; to: unknown }`. `index` is the op's index, so the screens group changes by op (P5).
  - It marks values as the Global Constraint says: `Sourced`/`Disputed` numbers become `{ value, estimate: 'what-if: <title> — <op>' }`; plain fields change in place and appear only in `changes`; added library items keep their own sources (S2).
  - **Sources.** It merges into `s.sources` the entries of `lib.sources` that added leaders and formations cite, and lists each merge in `changes` (P1).
  - **Unresolved.** An op naming a formation, unit, leader, artillery, library item, preset or doctrine id that doesn't exist (`doctrineIds` lists the known doctrines, like `checkReferences`) goes in `unresolved`, with a reason naming the kind and id, e.g. `formation "gone"`. Its other ops still apply. The caller decides (S3, S5).
  - **After applying** it calls `checkOverlaid(scenario, doctrineIds): string[]` and throws `ScenarioError` if any problem is found, each naming the op and index that caused it where one can be named. `checkOverlaid` runs `checkReferences`, checks that each side keeps ≥ 1 company and each attacking sector ≥ 1 attacking company, and checks every weather entry lies inside `[zeroHour, zeroHour + timeLimitMinutes]` (S3).
- **The CLI.** `--overlay <file>` on `run`, `batch`, `review` and `report`. The CLI and `sim bundle` load every `doctrine/*.yaml`, so `doctrineIds` is complete (S5, D15). The CLI refuses to run while `unresolved` is non-empty and exits 2 listing them, unless `--drop-unresolved` is given. `sim batch --workers n` sends `overlayFile` and `dropUnresolved` in `Files`/`Job`, and each worker's `load()` applies the overlay (P30, D16).
- **Produces: the record's what-if block** (P4).
  - `RunOptions.whatIf?: { overlayId: string; title: string; changes: Change[] }`. `runScenario` writes it into the record as `RunRecord.whatIf`, absent when not given. The CLI and the worker never attach it themselves.
  - ENGINE_VERSION goes to `0.4.10`. The draft golden moves only by the version string (no overlay): re-pin it with the note line `// 0.4.10 (Plan 4 Task 1): an optional what-if block (whatIf), an optional groundCondition read by wetness(), and a reserve's strengthFactor on made-up companies. A run with no overlay is unchanged but for the version.`
- **Produces: `Library` and `emptyLibrary()`** in `packages/scenario/src/overlay.ts`.
  - `Library = { sources: Sources; leaders: Leader[]; formations: Formation[]; weatherPresets: Record<string, WeatherPreset> }`, with its schema `LibrarySchema` (P1, P12).
  - `LeaderSchema` and `type Leader` are exported from `schema.ts` for it (S6, D22).
  - `emptyLibrary()` returns an empty one. Task 2 fills the library from files through `loadLibrary`.
- **Test fixtures.** `scenario/src/test-fixtures.ts` gains `vimyScenario(): Scenario` (a node loader resolving `scenarios/vimy-1917/scenario.yaml` and `doctrine/` from `repoRoot`, cached) and `totalMen(s: Scenario, side: Side): number`. Scenario-package tests never import the engine's test helpers (S1d, D21).
- **`overlays/README.md`** is a short reference of the ops, one entry each, in plain language. It is the only owner-facing description of the ops; the Task 12 guide links to it (P10, X5).

- [ ] **Step 1: Write the failing tests**

`overlay.test.ts` (scenario package; `ov(ops)` builds an overlay titled `test`; `DOCS = ['bef-1917', 'de-1917']`):

```ts
it('scale-men 2 on the Germans doubles every central company and marks each change as a what-if', () => {
  const { scenario, changes } = applyOverlay(vimyScenario(), ov([{ op: 'scale-men', side: 'central', factor: 2 }]), emptyLibrary(), DOCS);
  expect(totalMen(scenario, 'central')).toBe(2 * totalMen(vimyScenario(), 'central'));
  expect(changes.length).toBeGreaterThan(0); expect(JSON.stringify(scenario)).toMatch(/what-if: test — scale-men/);
});
it('scale-men 0.1 keeps at least one man in every company (attackers-x0.1)', () => {
  const { scenario } = applyOverlay(vimyScenario(), ov([{ op: 'scale-men', side: 'allied', factor: 0.1 }]), emptyLibrary(), DOCS);
  expect(companiesOf(scenario, 'allied').every(c => c.strength.value >= 1)).toBe(true);
});
it('a Disputed value replaced by a what-if keeps its range and sources in Change.from', () => { /* reserve-distance on a disputed distanceKm */ });
it('a plain field (doctrine, leaderId, start) changes in place and is recorded only in changes', () => { /* doctrine op: forces[].doctrine is the new id, no estimate on it, one Change */ });
// One test per Review Focus 1 case:
it('rejects scale-men with factor 0 before any run, naming ops[0].factor', () => {
  expect(() => parseOverlay(ovYaml([{ op: 'scale-men', side: 'central', factor: 0 }]))).toThrow(/ops\[0\]\.factor/);
});
it('rejects a negative reserve distance, naming ops[0].km', () => {
  expect(() => parseOverlay(ovYaml([{ op: 'reserve-distance', km: -3 }]))).toThrow(/ops\[0\]\.km/);
});
it('fails when an overlay removes every attacking company of a sector, naming the op', () => {
  expect(() => applyOverlay(vimyScenario(), ov(removeEveryAttackingDivisionOf('sector-1cdn')), emptyLibrary(), DOCS)).toThrow(/ops\[\d+\].*attacking compan/);
});
it('fails when a weather timeline has an entry outside [zeroHour, zeroHour + timeLimitMinutes]', () => {
  expect(() => applyOverlay(vimyScenario(), ov([{ op: 'weather', timeline: weatherAfterTheLimit() }]), emptyLibrary(), DOCS)).toThrow(/ops\[0\].*weather/);
});
it('reports ops that no longer resolve instead of skipping them', () => {
  const r = applyOverlay(vimyScenario(), ov([{ op: 'swap-leader', formationId: 'gone', leaderId: 'byng' }]), emptyLibrary(), DOCS);
  expect(r.unresolved).toEqual([expect.objectContaining({ index: 0, reason: expect.stringMatching(/formation "gone"/) })]);
});
it('an unknown doctrine id is unresolved; a known one swaps the side', () => { /* doctrineId 'xx' → unresolved; 'de-1917' on allied → forces[].doctrine changed */ });
// One test per op:
it('scale-guns 0.5 halves every artillery count of the side; factor 0 leaves no guns and still applies', () => { /* … */ });
it('scale-ammunition scales artillery ammunition and the bombardment allocations\' rounds', () => { /* … */ });
it('remove-formation removes its reserve, operation, artillery link and liaison entries, each a Change; historical targets stay', () => { /* … */ });
it('add-formation copies a scenario division in as an off-map reserve with role reserve, and passes checkReferences', () => { /* … */ });
it('add-formation from the library merges the sources its items cite into s.sources, each merge a Change', () => { /* library fixture with one source */ });
it('a weather preset is converted from afterMin to at by zeroHour', () => { /* … */ });
it('ground sets groundCondition as a what-if estimate', () => { /* … */ });
it('reserve-distance sets distanceKm on the named reserve or every reserve of the side', () => { /* … */ });
it('move by [dx, dy] shifts a company, and each company of a battalion', () => { /* … */ });
it('never mutates the scenario it was given', () => {
  const s = vimyScenario(); const before = JSON.stringify(s); applyOverlay(s, ov([{ op: 'scale-guns', factor: 0.5 }]), emptyLibrary(), DOCS);
  expect(JSON.stringify(s)).toBe(before);
});
```

`whatif.test.ts` (engine; uses `vimy()`, `vimyDoctrines()` and `loadOverlay`):

```ts
it('Germans ×2 doubles the central men in the record at minute 0, made-up reserve companies included', () => {
  // men summed over the record's minute-0 snapshot, every central company (off-map reserves included), with and without the overlay
  expect(centralMenAtZero(withOverlay('overlays/vimy-germans-x2.yaml'))).toBe(2 * centralMenAtZero(base()));
});
it('runScenario writes RunOptions.whatIf into the record, and a run without it has no whatIf key', () => { /* … */ });
it('the ground preset quagmire makes wetness() at least as high as normal, clamped to 1', () => { /* … */ });
```

`main.test.ts`: `sim run … --overlay overlays/vimy-germans-x2.yaml` exits 0 and the record's `whatIf.changes` is non-empty; an overlay naming a missing formation exits 2 listing it; the same with `--drop-unresolved` exits 0 and the record's `whatIf.changes` has no change for the dropped op.

`workers.test.ts`: `sim batch` with an overlay on `--workers 2` gives the same summary as in-process (one worker).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/scenario/src/overlay.test.ts packages/engine/src/whatif.test.ts packages/cli/src/main.test.ts packages/cli/src/workers.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement** the overlay schema, `parseOverlay`, `applyOverlay`, `checkOverlaid`, `loadOverlay`, the schema and table additions, `wetness()` and `withReserveCompanies`, `RunOptions.whatIf`, the CLI flags and worker files, the three example overlays, and `overlays/README.md`. Bump ENGINE_VERSION to `0.4.10` and re-pin the draft golden with its note line.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages overlays tables
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
- Modify: `packages/scenario/src/load-node.ts` (`loadLibrary(dir: string): Library`)
- Test: `packages/scenario/src/library.test.ts`

**Interfaces** (all from Task 1: `Library`, `LibrarySchema`, `Leader`, `WeatherPreset`, `applyOverlay(s, o, lib, doctrineIds)`; `vimyScenario()` from `test-fixtures.ts`):
- **`loadLibrary(dir)`** reads every `*.yaml` in `dir`. Each file may carry a `sources:` map; `loadLibrary` merges them into `Library.sources` and fails on a duplicate id. Citations (`source: x`) in leaders and formations must resolve there, or loading fails naming the item.
- **Paths.** Tests resolve `library/` with `repoRoot` (`resolve(dirname(fileURLToPath(import.meta.url)), '../../..')`), since Vitest's cwd differs per project (S6).
- **Presets are relative** (`afterMin` from the battle's start), and every entry of every preset must fit inside Vimy's `timeLimitMinutes`, or applying it to Vimy fails (Task 1 `checkOverlaid`).

**Method:**
1. **Leaders from other sectors** (base design: "leaders and units can be swapped in from other parts of the front"). Enter 12–20 corps and division commanders of 1917 who fought elsewhere on the Western Front:
   - **British and Dominion:** for example the Australian Corps, II Anzac, XVIII Corps and Cambrai's III Corps.
   - **German:** for example Gruppe Arras's neighbours and Flanders commanders.

   Give each a sourced name and rank, and drafted ratings as estimates with justifications. Use the Plan 2 rubric `docs/research/vimy/leader-rubric.md`. The owner owns the ratings.
2. **Formations to add.** Six to ten complete divisions of 1917 with their battalions and companies, each sourced or estimated as in Plan 2 Task 8, for example a British division in Third Army reserve or a German Eingreif division. They can be dropped into Vimy with `add-formation`, which brings them in as an off-map reserve (Task 1).
3. **Weather presets:** `dry-spring`, `wet-spring`, `snow-and-sleet`, `fog-at-dawn`, `heavy-rain`.
   - Each is a weather timeline of entries with `afterMin` (minutes after the battle's start), with precipitation, wind, visibility and temperature.
   - Each value is an estimate whose reasoning cites a documented day it resembles.
4. **Notes.** All research rules apply, and notes follow the usual format.

- [ ] **Step 1: Write the failing test**

```ts
const LIB = resolve(repoRoot, 'library');
const DOCS = ['bef-1917', 'de-1917'];
it('the library loads, every leader has a sourced name and drafted ratings, and every preset spans at least 4 days', () => {
  const lib = loadLibrary(LIB);
  expect(lib.leaders.length).toBeGreaterThanOrEqual(12);
  for (const l of lib.leaders) { expect('source' in l.name).toBe(true); expect(l.ratings).toBeDefined(); }
  for (const p of Object.values(lib.weatherPresets)) expect(spanDays(p)).toBeGreaterThanOrEqual(4); // (max afterMin − min afterMin) / 1440
});
it('every source the library cites is in lib.sources', () => { /* … */ });
it('every preset applies to Vimy without error', () => {
  for (const id of Object.keys(loadLibrary(LIB).weatherPresets)) expect(() => applyOverlay(vimyScenario(), ov([{ op: 'weather', preset: id }]), loadLibrary(LIB), DOCS)).not.toThrow();
});
it('a library division dropped into Vimy with add-formation passes checkReferences', () => {
  const lib = loadLibrary(LIB);
  const s = applyOverlay(vimyScenario(), ov([{ op: 'add-formation', from: { libraryId: firstLibraryDivision(lib) }, side: 'allied', underFormationId: 'cdn-corps', entryPoint: VIMY_ALLIED_ENTRY, distanceKm: 5 }]), lib, DOCS).scenario;
  expect(checkReferences(s, DOCS)).toEqual([]);
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
  - `packages/scenario/src/schema.ts` (optional `deadlock` section, declared on the strict root) (P2, D28)
  - `scenarios/vimy-1917/command.yaml` (Vimy's conditions)
  - `scenarios/vimy-1917/geo/features.geojson` (the German artillery line)
  - `docs/research/vimy/command.md`
  - `packages/engine/src/types.ts` (`EVENT_KINDS` += `'deadlock-broken'`)
  - `packages/engine/src/causes.ts` and `packages/engine/src/cause-text.ts` (the deadlock causes, with text: `explain.test.ts` checks `CAUSE_TEXT`)
  - `packages/engine/src/step.ts` (`SimState` holds the first breaking and the running margins)
  - `packages/engine/src/pipeline.ts` (the check runs in the `log` phase, after `companyReports`, so it reads the step's final state)
  - `packages/engine/src/summary.ts`
  - `packages/engine/src/record.ts` (`RunRecord['summary']` type gains `deadlock`; ENGINE_VERSION `0.5.0`)
  - `packages/engine/src/batch.ts` (`RunExtract.deadlock`; `summarizeBatch` aggregates it into `BatchSummary.deadlock`) (P13)
  - `packages/engine/src/draft-scenario.test.ts` (golden re-pinned, 0.5.0 note line)
- Test:
  - `packages/engine/src/deadlock.test.ts`
  - `packages/engine/src/budget.test.ts` (re-run, unchanged)

**Interfaces:**
- **Produces: the scenario's `deadlock` section** (strict, optional):
  - `deadlock?: { attacker: Side; artilleryLine: { featureId: string } | { lineId: string }; surrenderFrac: Sourced<number>; collapseFrac: Sourced<number>; strongholds: Array<{ featureId: string }>; conditions?: By[] }`, where `By = 'breakthrough' | 'surrender' | 'collapse' | 'stronghold'`.
  - **Defaults** (each listed in `defaultsUsed` when used):
    - `conditions`: all four (SP2: which conditions apply is the owner's, as data);
    - `collapseFrac` 0.1 (owner: "fewer than 10% of enemy troops remaining");
    - `surrenderFrac` 0.5, as an estimate;
    - `strongholds` = `end.keyGround.map(k => ({ featureId: k.featureId }))` (D29).
  - **A scenario with no `deadlock` section** is scored from defaults only when `end.keyGround` exists and the attacker can be inferred (the side with attacking companies); otherwise `summary.deadlock` is `null`.
- **Produces: `scoreDeadlock(state, ctx): { broken: boolean; by?: By; minute?: number; sectorId?: string }`.** It runs each step in the `log` phase after `companyReports`. The first condition in `conditions` to hold is recorded with its minute, and the event `deadlock-broken` is emitted with causes and refs. The four conditions:
  - **breakthrough:** an attacking company is beyond the defender's artillery line in a sector before any defender reserve has arrived in that sector;
  - **surrender:** the defenders' captured men ≥ `surrenderFrac` of their men at Zero;
  - **collapse, per sector** (SP1, S8): in some sector, the defenders **on the map** in that sector, excluding `pinned`, `surrendered`, `falling-back`, `destroyed` and `off-map`, fall below `collapseFrac` of the defenders on the map in that sector at Zero. Both counts are taken at Zero and at each step; arriving reserves count once they are on the map. `scoreDeadlock` reports the sector;
  - **stronghold:** the attacker holds every stronghold feature.
- **Produces: summary and batch fields.**
  - `summary.deadlock: { broken: boolean; by?: By; minute?: number; sectorId?: string; margins: Margins } | null`, where `Margins = { breakthrough: { furthestBeyondM: number; sectorId: string | null }; surrender: { capturedFrac: number }; collapse: { minFitFrac: number; sectorId: string | null }; stronghold: { held: number; of: number } }`, computed from the same per-step checks (SP3: the why traces show what held when it held).
  - `RunExtract.deadlock` carries the run's `summary.deadlock`.
  - `BatchSummary.deadlock = { brokenShare: number; byShare: Record<By, number>; minute: Spread | null; margins: { breakthroughBeyondM: Spread; capturedFrac: Spread; minFitFrac: Spread; strongholdsHeld: Spread } } | null`, from `summarizeBatch`. `byShare` sums to `brokenShare`, and `minute` is null exactly when no run broke.
  - The `deadlock-broken` event has no `unitId` (and no `sectorId` for surrender), so Task 9's divergence finder matches it by kind; it shifts the event ids after it (P15).
- **Vimy data:**
  - **The artillery line** is a German battery-line LineString in `features.geojson`, **digitized from Map 7's gun positions and the research's battery list**, with its source and a digitizing note, spanning every sector's y-band. Do not derive it from the two German artillery points in `fireplan.yaml` (`ger-gruppe-vimy-heavy` [2010, −2554] and `ger-gruppe-vimy-field` [2819, −3794]), which cover about 1.2 km of y. Where no source gives a gun line, the stretch is marked an estimate (S9, D19).
  - **The stronghold** is `hill-145`, named explicitly.
- **Version.** ENGINE_VERSION goes to `0.5.0`. Re-pin the draft golden with the note line `// 0.5.0 (Plan 4 Task 3): deadlock scoring: summary.deadlock (with margins) and the deadlock-broken event. <what the draft's record shows>.`

- [ ] **Step 1: Write the failing tests**

```ts
it('records breakthrough when an attacker passes the artillery line before any reserve arrives, and not after one has', () => {
  expect(runBreak({ reserveArrivesFirst: false }).summary.deadlock).toMatchObject({ broken: true, by: 'breakthrough' });
  expect(runBreak({ reserveArrivesFirst: true }).summary.deadlock!.by).not.toBe('breakthrough');
});
it('records surrender when captured defenders reach surrenderFrac of their men at Zero', () => {
  expect(runSurrender().summary.deadlock).toMatchObject({ broken: true, by: 'surrender' });
});
it('records collapse per sector when fewer than collapseFrac of the on-map defenders in a sector remain fit, naming the sector', () => {
  expect(runCollapse().summary.deadlock).toMatchObject({ broken: true, by: 'collapse', sectorId: 's1' });
});
it('off-map reserves do not count toward collapse until they are on the map', () => { /* … */ });
it('records stronghold when the attacker holds every stronghold feature', () => {
  expect(runStronghold().summary.deadlock).toMatchObject({ broken: true, by: 'stronghold' });
});
it('only the listed conditions apply', () => {
  expect(runCollapse({ conditions: ['stronghold'] }).summary.deadlock!.by).not.toBe('collapse');
});
it('the defaults are listed in defaultsUsed', () => { /* conditions, collapseFrac, surrenderFrac, strongholds */ });
it('a scenario with no deadlock section is scored from defaults when end.keyGround and an attacker exist, else null', () => { /* … */ });
it('an unbroken run records its margins', () => {
  expect(runUnbroken().summary.deadlock).toMatchObject({ broken: false, margins: { stronghold: { of: expect.any(Number) } } });
});
it('the deadlock-broken event has causes and refs', () => {
  const e = runBreak({ reserveArrivesFirst: false }).events.find(x => x.kind === 'deadlock-broken')!;
  expect(e.causes.length).toBeGreaterThan(0); expect(e.refs.length).toBeGreaterThan(0);
});
it('the batch reports exactly the share of runs that broke the deadlock, by condition', () => {
  const seeds = [1, 2, 3]; const runs = seeds.map(seed => runScenario(vimy(), vimyDoctrines(), { seed }));
  const b = summarizeBatch(vimy(), runs.map(r => extractRun(vimy(), r)));
  expect(b.deadlock!.brokenShare).toBe(runs.filter(r => r.summary.deadlock?.broken).length / 3);
  expect(Object.values(b.deadlock!.byShare).reduce((a, x) => a + x, 0)).toBeCloseTo(b.deadlock!.brokenShare);
  expect(b.deadlock!.minute === null).toBe(runs.every(r => !r.summary.deadlock?.broken));
});
it("Vimy's artillery line covers every sector's y-band", () => {
  // the feature's y-extent covers [min sector.yMin, max sector.yMax]
});
```

(X1: the batch test asserts against the runs, not only that a share lies in [0, 1].)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/engine/src/deadlock.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the scoring, the schema section, the event kind and its causes and text, the Vimy data and its notes, and the batch fields.** Bump ENGINE_VERSION to `0.5.0` and re-pin the draft golden with its note line.

- [ ] **Step 4: Run all tests, then the budget test on its own**

Run: `npm test`
Expected: PASS.

Run: `npx vitest run packages/engine/src/budget.test.ts`
Expected: PASS: cold ≤ 4500 ms, warm best of 3 ≤ 3500 ms, record ≤ 8 MB. Record the numbers in the ledger.

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
  - `packages/cli/src/main.ts` (`sim bundle`; extend the command check and `USAGE`)
  - `packages/app/package.json` (`predev` keeps its existing `sample.json` line and adds the bundle lines; `prebuild` writes the bundles)
  - `packages/app/e2e/global-setup.ts` (writes the bundles as well as the runs: Playwright's `webServer` runs `npx vite`, so `predev` never runs for e2e) (P17, D17)
  - `.gitignore` (`packages/app/public/scenarios/`)
- Test:
  - `packages/cli/src/bundle.test.ts`
  - `packages/app/src/sim/bundle.test.ts`

**Interfaces:**
- **Produces: `sim bundle <scenario.yaml> --out <file.json> [--doctrine-dir doctrine] [--tables-dir tables] [--library-dir library]`** (P11). It writes `Bundle = { bundleVersion: 1; scenario: Scenario; models: Models; tableSources: Sources; library: Library; notes: string; createdFrom: string }`.
  - `scenario` is merged, projected and validated, with its terrain grid.
  - `models.doctrines` holds every `doctrine/*.yaml`, not only the ones the scenario's forces name, so a `doctrine` op can resolve (S5).
  - `models.tables` is written **without** `sources` (`TablesSchema` is `z.strictObject`; `loadTables` returns `Tables & { sources }`). The table sources go in `Bundle.tableSources` for the inspector (P16, D14).
  - `library` is `loadLibrary(--library-dir)`, defaulting to `library`, as `--tables-dir` defaults to `tables`.
  - `notes` is the scenario folder's `notes.md`, if it exists: the owner's historical notes (base design: "The owner will add historical context and notes"). `scenarios/vimy-1917/` has none, so Vimy's is `''`. Do not invent notes (P18).
- **Produces: `parseBundle(json: unknown): Bundle` in the app.** It validates with the scenario package's node-free schemas, and gives a clear error:
  - `scenario` with `parseScenarioData(b.scenario, Object.keys(b.models.doctrines), undefined, b.models.tables)`, so references and weapons are checked (S10);
  - `models.tables` with `TablesSchema`, each doctrine with `DoctrineSchema`, and `library` with `LibrarySchema`.
- **The app's build steps.** `predev`, `prebuild` and `e2e/global-setup.ts` write `public/scenarios/vimy-1917.json` and `public/scenarios/draft.json`, and `public/scenarios/index.json` lists them.

- [ ] **Step 1: Write the failing tests**

```ts
it('a bundle round-trips: parseBundle(sim bundle output) runs to the same record as the CLI', () => {
  const b = parseBundle(JSON.parse(readFileSync(bundleOf('scenarios/vimy-1917/scenario.yaml'), 'utf8')));
  expect(hash(runScenario(b.scenario, b.models, { seed: 1 }))).toBe(hash(runScenario(vimy(), vimyDoctrines(), { seed: 1 })));
});
it('models.tables has no sources key, and tableSources holds them', () => { /* … */ });
it('the bundle holds every doctrine in doctrine/', () => { /* … */ });
it('parseBundle rejects a bundle of another version with a clear message', () => {
  expect(() => parseBundle({ bundleVersion: 99 })).toThrow(/bundleVersion 99/);
});
```

`hash` is the engine's test helper (`engine/src/test-helpers.ts:95`); Task 5 moves its body to `hashRecord`. If the round-trip hash test fails, compare `JSON.stringify` of the two scenarios first to find a key-order difference (the loader projects after merging and before parsing, `load-node.ts:131`, so the order should be zod's both times).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/cli/src/bundle.test.ts packages/app/src/sim/bundle.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `sim bundle`, `parseBundle`, the build steps and the global-setup lines**

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
  - `packages/engine/src/hash.ts` (`hashRecord`, unless Task 4 created it)
- Modify:
  - `packages/engine/src/index.ts` and `packages/engine/src/reader.ts` (export `hashRecord`)
  - `packages/engine/src/test-helpers.ts` (`hash` re-exports `hashRecord`)
  - `packages/app/src/ui/why.test.ts` (the import guard at lines 88–95 allows `src/sim/**`) (S11d, D7)
  - `packages/app/e2e/global-setup.ts` (writes `cliHash` for Vimy seed 1 with `overlays/vimy-germans-x2.yaml`)
- Test:
  - `packages/app/src/sim/worker.test.ts`
  - `packages/app/e2e/batch.spec.ts`

**No new aggregation** (P13, D4, X2). `extractRun(s, r): RunExtract` and `summarizeBatch(s, runs: RunExtract[]): BatchSummary` already exist in `engine/src/batch.ts` and the CLI workers use them. The app uses the same two functions. There is no `summarizeRuns`.

**Interfaces:**
- **Produces: `hashRecord(text: string): string`** in `engine/src/hash.ts`: the FNV-1a of `engine/src/test-helpers.ts:95` (32-bit, over the UTF-16 code units, 8 hex digits), moved so the CLI and the app can use it. It is exported from `index.ts` and `reader.ts`, and `test-helpers.ts` `hash(r)` calls it (S11c, D6).
- **Produces: `RunSummary = RunExtract & { hash: string }`**, the per-seed result a worker returns (D5). `summarizeBatch` needs `RunExtract`: its casualties, prisoners and guns are windowed from snapshots and events, which `summary` alone does not hold.
- **Produces: `handle(job: Job): RunSummary | RunRecord`** in `sim/worker.ts`, a pure function the `onmessage` handler calls. A job is `{ kind: 'extract' | 'record'; bundle; overlay: Overlay | null; dropUnresolved?: boolean; seed; endMinute?: number }`. It applies the overlay (`applyOverlay(bundle.scenario, overlay, bundle.library, Object.keys(bundle.models.doctrines))`), passes `whatIf` through `RunOptions`, runs `runScenario`, and returns `{ ...extractRun(s, r), hash: hashRecord(JSON.stringify(r)) }` or the record.
- **Produces: `createPool(n: number): Pool`.**
  - `Pool.runBatch(bundle, overlay | null, seeds, onProgress: (done: number, of: number) => void): { promise: Promise<{ summary: BatchSummary; runs: RunSummary[] }>; cancel(): void }`. The pool calls `summarizeBatch(s, runs)` on the overlaid scenario. The runs reach the compare screen for `pickSeed` (P20).
  - `Pool.runOne(bundle, overlay | null, seed, opts?: { endMinute?: number }): Promise<RunRecord>` re-runs one seed in full, for playback and for the setup map's minute-0 record (`endMinute: 0`, Task 7) (P21).
- **Full records cross the worker boundary only through `runOne`.**
- **Defaults.** `n` defaults to `min(4, navigator.hardwareConcurrency - 1)`. Cancel terminates the workers and resolves within 1 s. Progress is reported per run (D25).

- [ ] **Step 1: Write the failing tests**

`worker.test.ts` (Node; Vitest has no Web `Worker` here, so the pure `handle` is tested) (S11b):

```ts
it('handle gives the same hash as runScenario for the same bundle, overlay and seed', () => {
  const r = handle({ kind: 'extract', bundle: vimyBundle(), overlay: germansX2(), seed: 1 }) as RunSummary;
  expect(r.hash).toBe(hashRecord(JSON.stringify(runScenario(overlaid(vimy(), germansX2()), vimyDoctrines(), { seed: 1, whatIf: whatIfOf(germansX2()) }))));
});
it('summaries from handle aggregate to the same BatchSummary as runBatch', () => {
  const runs = [1, 2, 3].map(seed => handle({ kind: 'extract', bundle: vimyBundle(), overlay: null, seed }) as RunSummary);
  expect(summarizeBatch(vimy(), runs)).toEqual(runBatch(vimy(), vimyDoctrines(), [1, 2, 3]));
});
it('an extract carries no snapshots key', () => { /* … */ });
```

`e2e/batch.spec.ts`:
- the page runs seed 1 of Vimy with `vimy-germans-x2.yaml` through `runOne`, posts `hashRecord(JSON.stringify(record))`, and it equals the `cliHash` global-setup wrote (Review Focus 3);
- start a 20-run Vimy batch, see progress advance, press Cancel, and within 1 s the progress stops and the page still responds to clicks;
- the replies of a short batch are `RunExtract`s with a `hash` and no `snapshots` key.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/app/src/sim/worker.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `hashRecord`, the worker, the pool and the guard amendment**

- [ ] **Step 4: Run all tests and the e2e**

Run: `npm test && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm -w packages/app run e2e`
Expected: PASS.

- [ ] **Step 5: Measure a 200-run browser batch by hand** (S12; out of CI, about 5 min)

Run a 200-run Vimy batch on 4 workers in Chromium (`npm -w packages/app run dev`, the batch button or a dev hook). Record the wall time and the peak JS heap (DevTools Memory or `performance.memory`) in the ledger.
Expected: ≤ 5 min, the page responsive throughout. If it is over, record it and say so in the task report; don't loosen the guard.

- [ ] **Step 6: Commit**

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
  - `packages/app/src/main.tsx` (`?view=setup|compare|play`; the default stays playback; views change with `history.pushState` and app state, never a reload) (P19)
  - `packages/app/src/styles.css`
- Test:
  - `packages/app/src/setup/overlayDraft.test.ts`
  - `packages/app/e2e/setup.spec.ts`

**Interfaces and behaviour (base design §9.1, mockups on the design canvas):**
- **The battle picker** comes from `public/scenarios/index.json`. A scenario with `status: draft` shows the draft banner.
- **Conditions:**
  - weather presets (`bundle.library.weatherPresets`, relative to the start), plus a custom timeline editor (a table of times and values);
  - the ground preset;
  - the start date shown, read-only, in this plan.
- **Commanders:** a list of every corps, division and brigade with its leader and ratings, and a swap button. The swap chooses from the scenario's leaders plus the library, and shows ratings side by side. Each swap writes a `swap-leader` op.
- **Forces:**
  - scale sliders for men, guns and ammunition per side, and per division when expanded;
  - reserve distance per reserve;
  - add a library division (as an off-map reserve: side, entry point and distance, Task 1 `add-formation`), or remove a formation;
  - doctrine per side, from every doctrine in the bundle. The control says the swap takes the whole doctrine, weapons included.
- **The overlay draft.** `overlayDraft.ts` turns screen edits into an `Overlay`.
  - The draft is kept in `localStorage`, read and written inside try/catch.
  - **Export** writes a YAML file. **Import** reads a YAML file with `parseOverlay` (node-free, Task 1) and shows any `unresolved` ops, with "drop these".
- **What-if labels count and list ops**, each with its number of changes, e.g. "Germans ×2: 412 values" (`Change.index` groups the changes by op) (P5).
- **Running.** A "Run N times" button starts a batch (Task 5), shows progress per run, and when it finishes changes the view to `?view=compare` with `history.pushState`, handing the batch (`{ summary, runs }`, the bundle and the overlay) over in app state. The compare view itself is Task 8. "Watch one" runs seed 1 with `runOne` and opens playback.
- **No lock.** No control is ever disabled because the model is unproven.
- **Changed values** carry a small "what-if" mark beside them, read from the overlay's changes.
- **Style.** Reuse `useMapStyle()` and `.is-period` (D30).

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
it('the label counts ops and gives each its number of changes', () => {
  expect(labelOf(germansX2Changes())).toMatch(/^1 op: Germans ×2: \d+ values$/);
});
// e2e setup.spec.ts: pick Vimy, set Germans ×2 and the wet-spring preset, swap a division commander; the what-if label names 3 ops;
// Run 10 times → the batch finishes and the URL becomes ?view=compare with the batch handed over (no reload). The compare column and label are checked in Task 8.
```

(P24: T6's e2e stops at the navigation; the column assertions are Task 8's.)

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
  - `packages/app/src/setup/moves.ts`
- Modify:
  - `packages/app/src/setup/SetupView.tsx`
  - `packages/app/src/map/draw.ts` (layer toggles)
- Test:
  - `packages/app/src/setup/moves.test.ts`
  - `packages/app/e2e/setup.spec.ts`

**Behaviour (base design §9.1):**
- **The order-of-battle tree** runs corps → division → brigade → battalion → company, with men and status.
- **The battalion inspector** shows each value with its source, estimate or dispute (table sources from `Bundle.tableSources`), plus a what-if mark where the overlay changed it (from the overlay's changes, since plain fields carry no estimate).
- **The map:**
  - it draws with `drawFrame(ctx, view, r: RunRecord, frame, opts)` (`draw.ts:462`), which needs a record. The setup map draws the minute-0 record from `Pool.runOne(bundle, overlay, 1, { endMinute: 0 })` (`runScenario` supports a run with no step). It re-runs after each dropped marker, debounced, and caches per overlay. Measure the time on Vimy (the bombardment runs in `initRun`) and record it in the ledger (P21);
  - layer toggles for trenches, wire, objectives, barrage sectors, features, units and terrain: `DrawOptions.layers?: Partial<Record<Layer, boolean>>`, where an absent key means on, so playback and export (Task 11) are unchanged (P25);
  - unit markers can be dragged to new start positions, writing `move` ops with an offset `by: [dx, dy]`.
- **`validateMove(s: Scenario, unitId: string, by: [number, number]): string | null`** in `setup/moves.ts` checks each moved company (a company, or each company of a battalion) (P6, S14). It rejects a move that:
  - takes a company across its own side's `trench` line (`lines[].side` is the company's side) in the side's attack direction (allied: +x; central: −x, as `lineXAt` reads it);
  - or leaves the extent.

  The marker snaps back and a message says why.

- [ ] **Step 1: Write the failing tests**

```ts
it('an allied drag behind its own front line is accepted; a drag into the enemy trench is refused with a reason', () => {
  expect(validateMove(vimyScenario(), '1bn-a', ALLIED_BACK)).toBeNull(); expect(validateMove(vimyScenario(), '1bn-a', ACROSS_ALLIED_FRONT)).toMatch(/front line/);
});
it('a central drag behind its own front line (toward +x) is accepted; one across it (toward −x) is refused', () => {
  expect(validateMove(vimyScenario(), GERMAN_COMPANY, CENTRAL_BACK)).toBeNull(); expect(validateMove(vimyScenario(), GERMAN_COMPANY, ACROSS_CENTRAL_FRONT)).toMatch(/front line/);
});
it('a battalion move is checked for each of its companies', () => { /* one company would cross → refused */ });
it('a move out of the extent is refused', () => { /* … */ });
// e2e: expand the 1st Canadian Division, open the 7th Battalion's inspector (a source is shown), drag its marker 200 m south (−y in the local frame), and the overlay gains a move op with by [0, −200]
```

`vimyScenario()` is the scenario package's fixture (Task 1); the app's test may import it from `@wwi/scenario`'s test fixtures.

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
- Modify (P26, D12, X3: one copy of the pass rules):
  - `packages/engine/src/batch.ts` (`summarizeBatch` computes `BatchLine.pass`, and `PrisonerRow.pass` / `GunsRow.pass` by `casualtyPass`)
  - `packages/cli/src/report-md.ts` (reads `.pass`; its own `linePass` and the prisoner and gun `casualtyPass` calls, `report-md.ts:221-271`, move into `summarizeBatch`)
- Test:
  - `packages/app/src/compare/results.test.ts`
  - `packages/engine/src/batch.test.ts`
  - `packages/cli/src/report-md.test.ts`
  - `packages/app/e2e/compare.spec.ts`

**Behaviour (base design §9.3; Deadlock design Goal 1):**
- **Columns.** The historical record is one column. Each batch (the base scenario and up to three what-ifs) is a column beside it.
- **The objective chart.** For each line, a bar from the historical earliest to latest, and the batch's p10–median–p90 for each column. It draws in the period style.
- **The results table:**
  - casualties by side and formation, prisoners, guns captured, duration and winner share, each against its target, with a pass or fail cell where a target exists (base design §7). The cells read `.pass` from the `BatchSummary`; `results.ts` never recomputes a rule;
  - a target whose formation a what-if removed shows "removed by what-if", not fail (S4);
  - deadlock broken (share, by which condition, and when); when unbroken, the margins' medians (SP3).
- **Notes and labels.**
  - The owner's notes panel shows the bundle's `notes`. When empty it says "No notes yet: add `notes.md` beside `scenario.yaml`" (P18).
  - Each what-if column lists its ops, each with its number of changes, grouped by `Change.index` (P5, P7).
- **Watching runs.** "Watch run…" picks a seed from a batch (median, best or worst on any row) with `pickSeed(runs, which, value)`, reading the batch's `runs: RunSummary[]` (P20), and opens playback using `runOne`.
- **"Where did it split from the base?"** Each what-if column has this link (SP4). It opens side-by-side (Task 9) for the base's median-seed run and the what-if's run **with the same seed**, using `runOne` twice, and shows `divergenceSpread` beside the single pair (SP5).
- **`results.ts`** holds pure functions from `BatchSummary`, its runs and targets to table rows.

- [ ] **Step 1: Write the failing tests**

```ts
// results.test.ts
it('a disputed casualty target passes when the median lies inside its range', () => {
  expect(rowFor(batchWithMedian(3300), disputedTarget([3000, 3600])).pass).toBe(true);
});
it('the median-run picker returns the seed whose value is the batch median', () => {
  expect(pickSeed(runs([[1, 10], [2, 30], [3, 20]]), 'median', r => r.v)).toBe(3);
});
it('a target whose formation was removed reads "removed by what-if"', () => { /* … */ });
// batch.test.ts
it('summarizeBatch sets BatchLine.pass, PrisonerRow.pass and GunsRow.pass by the report\'s rules', () => { /* casualtyPass for prisoners and guns; the line rule moved from report-md */ });
// report-md.test.ts
it('the report reads .pass and its numbers are unchanged', () => { /* the same pass/fail counts as before the move */ });
// e2e compare.spec.ts: open compare with the base batch and one what-if (Germans ×2 from setup); the what-if column's label names its ops;
// the objective chart shows a historical bar and two batch bands per line; Vimy's notes panel shows "No notes yet"; "Watch median run" opens playback
```

(S15: the fixture range is not a real pair of Vimy targets.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/app/src/compare/results.test.ts packages/engine/src/batch.test.ts packages/cli/src/report-md.test.ts`
Expected: FAIL.

- [ ] **Step 3: Move the pass rules into `summarizeBatch`, then implement the compare view**

- [ ] **Step 4: Run all tests and the e2e, and look at screenshots**

Run: `npm test && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm -w packages/app run e2e`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages
git commit -m "feat(app): compare screen: the record beside what-if batches, objective chart, results and deadlock table, notes"
```

---

### Task 9: Side-by-side playback and "where did they split?"

**Files:**
- Create:
  - `packages/engine/src/diverge.ts`
  - `packages/app/src/ui/SideBySide.tsx`
  - `packages/app/src/ui/offHistory.ts`
- Modify:
  - `packages/engine/src/reader.ts` (exports `firstDivergence`, `describeDivergence`, `divergenceSpread` and their types) (S16, D1)
  - `packages/app/src/ui/Playback.tsx` (the what-if label) (SP7)
  - `packages/app/src/ui/runRecord.ts` (`parseRunRecord` accepts `whatIf` and `summary.deadlock`) (SP7)
- Test:
  - `packages/engine/src/diverge.test.ts`
  - `packages/app/src/ui/offHistory.test.ts`
  - `packages/app/e2e/sidebyside.spec.ts`

**Interfaces (base design §8 and §9.2):**
- **Produces: `firstDivergence(a: RunRecord, b: RunRecord): Divergence | null`.**
  - Events are matched by `(kind, unitId, sectorId, lineId)` in order. An event with none of these (such as `deadlock-broken` for surrender or collapse) matches by kind (P15).
  - The first event present in one run and not the other, or more than `2 × record.stepMin` minutes apart in time, is the divergence (S16).
  - `Divergence = { minute: number; a: SimEvent | null; b: SimEvent | null; why: { a?: Why; b?: Why } }`, using `explain` from Plan 3 Task 16.
  - It reads events only. If the side-by-side view needs full snapshots, it uses the app's existing `expandDeltas` (`ui/runRecord.ts:232`), never a third copy of `expandSnapshots` (X7).
- **Produces: `describeDivergence(d: Divergence, b?: RunRecord): string`**, in plain language. Example: "Run B: the 4th Division's 87th Battalion was pinned at 05:44 because machine guns in a stretch the bombardment spared opened fire."
  - **Order of battle** (D24, as adopted). Per-company draws stay ordered as now: the `companies` RNG stream draws per company in order, so an overlay that adds or removes formations shifts every later company's start jitter and speed, and its runs diverge from the base at once. When `b.whatIf` has an `add-formation` or `remove-formation` change and the divergence is at the start, `describeDivergence` says so: "differs from the start: the what-if added or removed formations, which shifts every later company's random draws, so the runs split at once." Seeding each company's draws by its id is an **open question for the owner** (an engine change and a version bump); this plan does not do it.
- **Produces: `divergenceSpread(pairs: Array<[RunRecord, RunRecord]>): { minute: Spread; commonFirstKind?: string }`** over the N same-seed pairs of a base and a what-if batch (the seeds are shared) (SP5: the model is chaotic, so report spread, not single runs). `commonFirstKind` is the first diverging event's kind when most pairs share it.
- **Produces: `firstOffHistory(run: RunRecord, objectives: Scenario['historical']['objectives']): { minute: number; lineId: string; sectorId: string } | null`** in `app/src/ui/offHistory.ts` (P28, D23). Against history, side-by-side marks the **first line taken outside its historical window**. It lives in the app, because only `batch.ts` in the engine may read `historical.*` (`summary.test.ts:53-63`). Run-against-run uses `firstDivergence`.
- **Side-by-side playback.**
  - Two runs, or a run beside the historical timeline (historical line falls and events drawn as a ghost track), play in sync on one clock.
  - The divergence moment (`firstDivergence` for two runs, `firstOffHistory` against history) is marked on the timeline. Clicking it jumps both views there and opens both "why" chains (for history, the run's).
  - Opened from compare (Task 8), it also shows `divergenceSpread` for the two batches.
- **The playback what-if label** (SP7). When the record has `whatIf`, the playback header shows "What-if: <title>" and opens the change list grouped by op, each with its number of changes (P5).

- [ ] **Step 1: Write the failing tests**

```ts
it('two identical runs have no divergence', () => { expect(firstDivergence(rec(1), rec(1))).toBeNull(); });
it('runs that differ by a garrison MG finds the first differing event and explains both sides', () => {
  const d = firstDivergence(runWithMgs(2), runWithMgs(0))!;
  expect(d.minute).toBeGreaterThan(0); expect(describeDivergence(d)).toMatch(/machine gun|pinned/);
});
it('events more than 2 × stepMin apart diverge; events within it do not', () => { /* … */ });
it('an add-formation what-if diverging at the start is described as shifting the draws', () => {
  expect(describeDivergence(firstDivergence(base(1), withAddedDivision(1))!, withAddedDivision(1))).toMatch(/added or removed formations.*draws/);
});
it('divergenceSpread gives the spread of first-divergence minutes over same-seed pairs', () => { /* … */ });
// offHistory.test.ts
it('firstOffHistory returns the first line taken outside its historical window, or null', () => { /* … */ });
// e2e: open two Vimy runs side by side; both clocks show the same time while playing; the divergence marker jumps both views;
// a run opened with a what-if shows "What-if: <title>" in the playback header and its ops
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/engine/src/diverge.test.ts packages/app/src/ui/offHistory.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the divergence finder, the spread, the history mark, the playback label and the side-by-side view**

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
  - `packages/scenario/src/tables.ts` (`paramOf` gains `searchRange?: { min: number; max: number; reason: string }`; `paramOf` is `.strict()`, so it is declared there; `doctrine.ts` builds its params with the same `paramOf`) (D8)
  - `tables/*.yaml` and `doctrine/*.yaml` (`searchRange` on the chosen parameters)
  - `packages/cli/src/main.ts` (`sim calibrate`; extend the command check and `USAGE`)
  - `docs/research/vimy/model-report-1.md` (Step 0)
- Test: `packages/cli/src/calibrate.test.ts`

**Interfaces (base design §7, "calibrate the shared parameters on Vimy"; kept light):**
- **`searchRange`, not `range`** (D8). `Disputed<T>` already has `range: [T, T]` and readers test for it (`batch.ts` `targetOf`), so a Param with `range` would look Disputed. `searchRange` is allowed only with `calibrated: true`, needs `min < max`, and must lie inside the key's declared `Range` (`'fraction' | 'nonnegative' | 'positive'` in `EFFECT_RANGES` and the doctrine `*_RANGES`), checked at load.
- **Parameter paths** are those of `calibratedParams()` (`report-md.ts:158`), which the model report uses: `tables.<file>.<key>…` (e.g. `tables.weapons.vickers.rpm`) and `doctrine.<id>.<section>.<key>` (e.g. `doctrine.de-1917.defence.emergeMin`). `sim calibrate` reuses `calibratedParams()` to resolve them (S17b, D9).
- **The command:** `sim calibrate <scenario> --params <path,…> --runs <n> --trials <m> [--seed-base k] [--workers n] [--apply] --out <report.md>`.
- **The search.** A deterministic Latin-hypercube sample of `m` points within each parameter's `searchRange`. Each point is scored on `n` runs (seeds `k…k + n − 1`) against the scenario's targets.
  - **The score** is the number of failed targets, read from `BatchSummary` `.pass` (Task 8 moved the rules there; `calibrate.ts` never recomputes them), with ties broken by the sum of normalised distances to target.
  - **Spread** (SP5). The report gives each trial's p10–p90 per target.
  - **The best point** is declared only if its failed-target count beats the baseline's on a **fresh seed block** (seeds `k + n…k + 2n − 1`), run for both the best point and the baseline. Otherwise the report says "no improvement beyond noise".
- **Guards:**
  - every listed path must point to a `Param` with `calibrated: true` and a `searchRange`;
  - the number of parameters must be ≤ ⌊independent targets / 2⌋. **The independent targets** are the `BatchSummary` rows with a non-null pass, with nested windows of the same side and formation counted once (Vimy's corps 9–10, 9–14 and 7–14 April count as one) (SP6). Targets the model cannot move for structural reasons still count (the guard is about independence, not reachability);
  - otherwise it exits 2 and explains why.
- **`--apply`** rewrites only those parameters, in the file that owns each: `tables/*.yaml` or `doctrine/*.yaml`, through the `yaml` Document API so comments survive (S17c, D10). It keeps each one an estimate, whose text gains "calibrated on <scenario> (<date>, <runs>×<trials>): was <old>".
- **The report** lists:
  - each parameter, its old and new values, and its search range;
  - each target, before and after, with its spread;
  - the overfitting guard's numbers: the independent-target count and the merges;
  - the fresh-seed confirmation, or "no improvement beyond noise";
  - which targets still fail, and among them those it cannot move for structural reasons (the data carries under "Not in this plan", D26).

- [ ] **Step 0: Re-run the model report as the calibration baseline, and rewrite its commentary**

Run: `npm run sim -- report scenarios/vimy-1917/scenario.yaml --runs 200 --workers 4 --out docs/research/vimy/model-report-1.md`
Expected: the header names the engine current at this point (0.5.x, after Tasks 0, 1 and 3).

Then rewrite the hand-written commentary block from the new seed-1 run (`npm run sim -- run scenarios/vimy-1917/scenario.yaml --seed 1 --out <file>` and `sim why`), replacing Task 0's staleness line. The report's first picks for calibration come from this version. Commit it on its own:

```bash
git add docs/research/vimy/model-report-1.md
git commit -m "docs(research): Vimy model report at <version>, the calibration baseline; commentary rewritten"
```

- [ ] **Step 1: Write the failing tests** (S17d, X6: no Vimy runs in CI; the determinism and no-write tests use the draft, whose 4 line targets let the guard allow 2 parameters)

```ts
it('refuses a parameter that is not calibrated, naming it', () => {
  expect(cli(['calibrate', VIMY, '--params', 'tables.weapons.vickers.rpm'])).toMatchObject({ code: 2, stderr: expect.stringMatching(/tables\.weapons\.vickers\.rpm.*not calibrated/) });
});
it('refuses a calibrated parameter with no searchRange, naming it', () => { /* code 2, /searchRange/ */ });
it('refuses to fit more parameters than half the independent targets', () => {
  expect(cli(['calibrate', VIMY, '--params', tooManyParams()])).toMatchObject({ code: 2, stderr: expect.stringMatching(/at most \d+ parameters/) });
});
it('counts nested windows of the same side and formation once', () => { /* independentTargets on a fixture summary */ });
it('a searchRange outside its key\'s Range fails at load', () => { /* … */ });
it('without --apply, the tables and doctrine files are byte-identical after a run (draft)', () => {
  const before = readTablesAndDoctrine(); cli(['calibrate', DRAFT, '--params', twoDraftParams(), '--runs', '3', '--trials', '4', '--out', tmp()]); expect(readTablesAndDoctrine()).toEqual(before);
});
it('the same seeds and trials give the same proposal (draft)', () => { expect(proposal(DRAFT, 1)).toEqual(proposal(DRAFT, 1)); });
it('--apply rewrites a doctrine parameter in doctrine/*.yaml and keeps its comments', () => { /* on a temp copy */ });
```

(The Vimy refusal tests do no runs.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/cli/src/calibrate.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `sim calibrate`.** Add `searchRange` to the parameters Step 0's report names first for calibration, in `tables/*.yaml` or `doctrine/*.yaml`, each with its reasoning.

- [ ] **Step 4: Run it once on Vimy and commit the report** (without `--apply`; the owner decides whether to apply)

Run: `npm run sim -- calibrate scenarios/vimy-1917/scenario.yaml --params <Step 0's first picks, within the guard> --runs 50 --trials 24 --workers 4 --out docs/research/vimy/calibration-1.md`
Expected: it finishes within about 30 min on 4 workers (50 × 24 = 1200 Vimy runs, about 28 min at the report's rate before the sight tests and the deadlock check, plus the fresh-seed block). Record the real time in the report. If it overruns, use `--runs 40`; don't loosen the guard (S18). The report lists the proposal. The tables and doctrine files are unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages tables doctrine docs/research/vimy/calibration-1.md
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
- **The button.** "Save video…" records the map canvas with `MediaRecorder` (WebM, VP9 if supported, else VP8).
- **The export frame.** In the period style the clock and scale bar are DOM (`PeriodFrame.tsx`), not canvas, so `exportVideo.ts` draws the clock and totals onto the canvas itself, from the same `periodClock` and `totals` functions the DOM uses. It never screenshots DOM (S19).
- **What it records.** It plays from the current playhead to the end at the chosen speed (`clock.ts` `SPEEDS`, battle minutes per second), at 30 fps, then offers the file. The file is named `<scenario>-<overlay or base>-seed<k>.webm`, using `record.whatIf.overlayId` (P9).
- **A pure helper,** `framePlan(startMin, endMin, speed, fps): number[]`, gives the battle minutes to draw.
- **Frame timing** (X4). `MediaRecorder` stamps frames with wall time, so the frame list alone cannot make a slow machine's video smooth. The export uses `canvas.captureStream(0)` and calls `track.requestFrame()` after each `framePlan` frame is drawn, paced at 1/fps of wall time: the next draw waits for its slot. Timing holds while a draw takes under 33 ms; a machine that draws slower gives a video that stutters. The help text and the guide say so. Add no muxer dependency. A frame-exact WebCodecs route is a later option, not this plan.

- [ ] **Step 1: Write the failing tests**

```ts
it('frame plan covers the range at the chosen speed', () => { expect(framePlan(0, 60, 10, 30)).toHaveLength(Math.ceil((60 / 10) * 30) + 1); });
it('the export frame draws the clock and totals onto the canvas from periodClock and totals', () => { /* … */ });
// e2e: export a short slice (Zero to 05:40 at 1 s = 10 min); a .webm download of non-zero size is offered, named <scenario>-base-seed1.webm
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
  - the ops, **by a link to `overlays/README.md`**, never restating them (P10, X5);
  - exporting and importing overlays, and saving one under `overlays/` for the CLI;
  - reading the compare screen and the deadlock scores, including the margins of an unbroken deadlock;
  - watching the median run;
  - side-by-side playback: against another run (where they split, and the spread over a batch) and against the historical timeline (the first line taken outside its window); why adding or removing formations makes runs split at once;
  - saving a video, and that a slow machine's video may stutter;
  - what the "what-if" marks mean;
  - that what-ifs are never locked.
- **The e2e test** runs one whole flow: setup (Germans ×2) → run 10 → compare → watch median → side by side with the historical timeline → the first line taken outside its historical window is marked (`firstOffHistory`). Then side by side with the base run of the same seed → the divergence is shown (`firstDivergence`). Each check matches the mode it is in (P28).

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

- **Enemy lines** are reported only by companies that can see them (0.4.9), and the Vimy model report was regenerated on that engine before anything was built or calibrated on it.
- **What-ifs:**
  - overlays cover forces, guns, ammunition, weather, ground, leaders (with a library from other sectors), doctrine, reserve distance and moves;
  - they never edit the historical files;
  - they're marked in every record, by the engine (`whatIf`).
- **The deadlock is scored** on every run, by which condition broke it, where and when, with margins when it held, and batches report the shares.
- **The browser runs the engine in workers,** with the same results as the CLI. A 200-run Vimy batch was measured against the 5-minute budget, with progress and cancel.
- **Setup:** battle, conditions, commanders, forces, the order-of-battle tree, the inspector, and a map with draggable units. Overlays export and import.
- **Compare:** the record beside up to three what-ifs, the objective chart, the results and deadlock tables (one copy of the pass rules), the owner's notes, and the link to where a what-if split from the base.
- **Side-by-side playback** shows the first divergence, explained, and its spread over a batch; against history, the first line taken outside its window. Playback labels what-ifs.
- **Video export** works.
- **`sim calibrate`** exists with its guards, and its first Vimy report is committed. Applying it is the owner's choice.
- **Nothing is ever locked** for being unproven.

**Not in this plan:**
- credibility grades, the limits table and the post-conflict report (next plan);
- playing the general (the plan after that);
- either side attacking;
- the operational layer;
- generated sectors;
- sweeps;
- seeding each company's draws by its id, so that adding or removing formations doesn't shift other companies' draws (an open question for the owner, Task 9);
- dropping a library division straight into the attack (`add-formation` brings it in as a reserve);
- the 3 s per-run budget decision (the owner's);
- **the Plan 3 data and design carries** (D26). Several of the model report's leading misses come from these, and Task 10's report names them as targets calibration cannot move:
  - spreading the batteries (197 against 54 guns);
  - segments along the 4th Division's lines;
  - consolidation parties in passed trenches (Hill 145);
  - German telephone lines;
  - HQ positions;
  - bombardment saturation;
  - friendly fire, which is structurally zero;
  - firer refs on direct fire.
