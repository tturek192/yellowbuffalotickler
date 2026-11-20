# Plan 1: Foundation and Time-Lapse Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the backbone of the simulator: a sourced scenario format,
a deterministic engine that moves companies behind a timed creeping barrage
through objective lines, a run record, a batch runner and CLI, and an
animated time-lapse that plays any run. The plan ends with a draft
1st Canadian Division sector at Vimy that you can watch.

**Architecture:** An npm-workspaces TypeScript monorepo with four parts.
- `scenario`: the schema, the loader and validation.
- `engine`: pure and deterministic, with no DOM.
- `cli`: single runs and batches.
- `app`: a Vite and React time-lapse player. It draws on a Canvas 2D map
  from a self-contained run record.

The engine never touches the UI. Playback only reads run records and never
re-runs the simulation.

**Tech Stack:** Node ≥ 20, TypeScript (strict), Vitest, Zod, `yaml`, Vite,
React 18, Canvas 2D, Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-11-20-wwi-battle-simulator-design.md`

### Where this plan sits

The design is delivered as a series of plans. Each produces working software.

1. **This plan.** Foundation and time-lapse, with the barrage and movement
   only. No fire, casualties or morale yet.
2. **Vimy research and data.** Order of battle down to company for both
   sides; trenches, wire, craters and subways from trench maps and LiDAR;
   the fire plan; weather; historical results with citations. Ends with the
   owner's review.
3. **Combat model.** Direct and indirect fire, the compressed bombardment
   calculation, gap behind the barrage, dugouts, morale, officer losses,
   communications by channel, leaders, German reserves off the map, the
   command model.
4. **Calibration and comparison.** Tests against history, what-if changes,
   the setup and compare screens, running the engine in a Web Worker.
5. **Messines** as the check battle.
6. **Video export and polish.**

## Global Constraints

- TypeScript `strict: true` everywhere. Node ≥ 20.
- **Every historical value in a scenario or doctrine file is sourced.** It
  either cites a source id from the file's `sources` list or carries a
  non-empty `estimate` reason. Loading rejects anything else. (Spec Goal 7.)
- **The engine is deterministic.** The same scenario, seed and
  `ENGINE_VERSION` give a byte-identical run record. All randomness comes
  from `createRng(seed)`.
- **`packages/engine` imports nothing from the DOM, React, `node:fs` or
  the app.** It must run unchanged in Node and later in a Web Worker.
- **Doctrine parameters live in data files** (`doctrine/*.yaml`), never as
  constants in engine code. (Spec section 12.)
- **Playback reads run records only and never calls the engine.** (Spec
  section 9.2.)
- **The run record is self-contained.** It carries the map geometry needed
  to draw it.
- **Coordinates are local metres:** x points east (the Canadian attack
  direction), y points north. Times are whole minutes after Zero.
- **Map colours, from the approved mockups:**
  - Allied `#1f4e8c`, German `#c0392b`, paper `#efe6cf`;
  - barrage hatching `#c9a24a`;
  - objective lines Black `#1a1a1a`, Red `#b3261e`, Blue `#2c5fa8`, Brown
    `#7a4b23`.
- **Playback speeds** are 1, 10, 60 and 360 battle-minutes per real second
  (1 s = 1 min, 1 s = 10 min, 1 s = 1 h, 1 s = 6 h).
- **Scenario `status` stays `draft`** until the owner reviews it. The app
  shows "Draft — unverified data" for draft scenarios.

## Review Focus

1. **Scenario files with broken references** (an unknown company, line,
   sector or doctrine id). These must fail at load with a message naming
   each bad path, never as a crash or NaN inside the engine. Test in
   Task 2.
2. **A company whose y lies outside an objective line's extent.** Line
   lookups clamp to the nearest endpoint and never return NaN. Test in
   Task 3.
3. **A multi-day run (4 days at 2-minute steps).** The snapshot cadence must
   keep the record under 20 MB so the browser can load it. Test in Task 5.
4. **Seeking or changing speed at or past the end of a run.** The playhead
   clamps to the start and end of the run and reports that it has ended,
   without wrapping or throwing. Test in Task 8.
5. **A run record with one snapshot and no events** (a run that ended at
   once). Interpolation, markers and quiet-period detection still return
   valid results. Test in Task 8.

---

## File structure

```
package.json                      workspaces root, scripts: test, sim, app
tsconfig.base.json
vitest.workspace.ts
packages/
  scenario/src/
    sourced.ts                    Sourced<T> schema helpers, v()
    schema.ts                     ScenarioSchema, DoctrineSchema, types
    load.ts                       loadScenario(), loadDoctrine(), ScenarioError
    references.ts                 checkReferences()
    index.ts
  engine/src/
    rng.ts                        createRng()
    geometry.ts                   lineXAt(), sampleYs()
    types.ts                      CompanyState, BarrageState, SimState, SimEvent
    barrage.ts                    initBarrage(), advanceBarrage(), barrageXAt()
    companies.ts                  initCompanies(), moveCompanies()
    step.ts                       step()
    record.ts                     RunRecord, ENGINE_VERSION
    run.ts                        runScenario()
    batch.ts                      runBatch(), quantiles()
    index.ts
  cli/src/main.ts                 `sim run` and `sim batch`
  app/
    index.html, vite.config.ts
    src/playback/clock.ts         advancePlayhead()
    src/playback/interpolate.ts   frameAt()
    src/playback/quiet.ts         isQuiet()
    src/playback/markers.ts       timelineMarkers()
    src/map/projection.ts         fitView(), worldToScreen()
    src/map/draw.ts               drawFrame()
    src/ui/Playback.tsx           map canvas, controls, scrubber, event log
    src/main.tsx
    e2e/playback.spec.ts
scenarios/vimy-1917/1cdn-3bde-draft.yaml
doctrine/bef-1917.yaml
```

Tests sit next to their source as `*.test.ts`.

---

### Task 1: Workspace and the sourced scenario schema

**Files:**
- Create: `package.json`, `tsconfig.base.json`, `vitest.workspace.ts`, `.gitignore` (`node_modules`, `dist`, `runs/`)
- Create: `packages/scenario/package.json`, `packages/scenario/tsconfig.json`
- Create: `packages/scenario/src/sourced.ts`, `packages/scenario/src/schema.ts`, `packages/scenario/src/index.ts`
- Test: `packages/scenario/src/schema.test.ts`

**Interfaces:**
- Produces:
  - `Sourced<T>`. Either `{ value: T; source: string; page?: string; note?: string }` or `{ value: T; estimate: string }`, where `estimate` has a minimum length of 1.
  - `sourced<S extends z.ZodTypeAny>(inner: S)`, a Zod schema factory.
  - `v<T>(s: Sourced<T>): T`.
  - `type Point = [number, number]`.
  - `ScenarioSchema` and `type Scenario`, with these fields:
    - `id`, `title`, and `status: 'draft' | 'reviewed'`.
    - `sources: Record<string, { title: string; author?: string; year?: number; url?: string }>`.
    - `zeroHour: Sourced<string>`, as an ISO local datetime.
    - `timeLimitMinutes: number`.
    - `lines: Array<{ id; name; kind: 'trench' | 'objective'; side?: 'allied' | 'central'; color?: string; points: Point[] }>`. Points are estimates at the file level: the scenario has `geometrySource: Sourced<string>`.
    - `sectors: Array<{ id; name; yMin: number; yMax: number; startLineId: string; legs: Array<{ toLineId; liftM: Sourced<number>; liftMin: Sourced<number>; pauseMin: Sourced<number> }>; standOffM: Sourced<number> }>`.
    - `forces: Array<{ side: 'allied' | 'central'; doctrine: string; formations: Formation[] }>`. A `Formation` is `{ id; name; kind: 'corps' | 'division' | 'brigade' | 'battalion'; leader?: string; children?: Formation[]; companies?: Company[] }`.
    - `Company`: `{ id; name; strength: Sourced<number>; start: Point; sectorId; objectiveLineId; startAfterMin: Sourced<number>; role: 'assault' | 'mopup' | 'support' | 'reserve' | 'garrison' }`.
    - `historical: { objectives: Array<{ lineId; sectorId; earliest: Sourced<string>; latest: Sourced<string> }> }`.
  - `DoctrineSchema` and `type Doctrine`: `{ id; title; sources; followDistanceM: Sourced<number>; maxAdvanceMPerMin: Sourced<number>; startJitterMin: Sourced<number>; speedJitterFrac: Sourced<number> }`.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/scenario/src/schema.test.ts
it('accepts a value with a source', () => {
  expect(sourced(z.number()).safeParse({ value: 640, source: 'nicholson-1962', page: '246' }).success).toBe(true);
});
it('accepts a value with an estimate reason', () => {
  expect(sourced(z.number()).safeParse({ value: 150, estimate: 'brief: 600–800 per bn ÷ 4' }).success).toBe(true);
});
it('rejects a bare number', () => {
  expect(sourced(z.number()).safeParse(640).success).toBe(false);
});
it('rejects an empty estimate', () => {
  expect(sourced(z.number()).safeParse({ value: 1, estimate: '' }).success).toBe(false);
});
it('v() unwraps either form', () => {
  expect(v({ value: 3, source: 's' })).toBe(3);
  expect(v({ value: 4, estimate: 'e' })).toBe(4);
});
it('ScenarioSchema parses the minimal fixture and rejects an unsourced company strength', () => {
  expect(ScenarioSchema.safeParse(minimalScenario()).success).toBe(true);
  const bad = minimalScenario(); bad.forces[0].formations[0].companies![0].strength = 150 as any;
  const r = ScenarioSchema.safeParse(bad);
  expect(r.success).toBe(false);
  expect(JSON.stringify(r.error!.issues[0].path)).toContain('strength');
});
```

`minimalScenario()` is a test helper in `packages/scenario/src/test-fixtures.ts`. Later tasks reuse it. It describes:
- one sector `s1`, with y from 0 to 400;
- lines `gfront` (x=150) and `black` (x=1150), each with points at y=0 and y=400;
- one leg to `black`: lift 91 m every 3 min, pause 40 min, stand-off 180 m;
- one allied battalion with two companies, starting at y=100 and y=300 with x=0, aimed at `black`;
- a `bef-1917` doctrine id.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/scenario`
Expected: FAIL. The module is not found.

- [ ] **Step 3: Scaffold the workspace and implement `sourced.ts` and `schema.ts`**

- The root `package.json` has `"workspaces": ["packages/*"]` and these scripts:
  - `"test": "vitest run"`
  - `"sim": "tsx packages/cli/src/main.ts"`
  - `"app": "npm -w packages/app run dev"`
- Dev dependencies: `typescript`, `vitest`, `tsx`, `zod`, `yaml`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/scenario`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add package.json tsconfig.base.json vitest.workspace.ts .gitignore packages/scenario
git commit -m "feat(scenario): workspace and sourced scenario schema"
```

---

### Task 2: Loading scenarios and doctrine, with reference checks

**Files:**
- Create: `packages/scenario/src/load.ts`, `packages/scenario/src/references.ts`
- Test: `packages/scenario/src/load.test.ts`

**Interfaces:**
- Consumes: `ScenarioSchema`, `DoctrineSchema` (Task 1).
- Produces:
  - `class ScenarioError extends Error { problems: string[] }`.
  - `checkReferences(s: Scenario, doctrineIds: string[]): string[]`. It returns one message per problem, each prefixed with a dotted path, for example `forces[0].formations[0].companies[1].objectiveLineId: unknown line "blak"`.
  - `parseScenario(yamlText: string, doctrineIds: string[]): Scenario`. It throws `ScenarioError` covering both schema issues (with their paths) and reference problems.
  - `loadScenario(path: string, doctrineDir: string): { scenario: Scenario; doctrines: Record<string, Doctrine> }`. It loads every doctrine named in `forces[].doctrine` from `${doctrineDir}/${id}.yaml`.
- References checked:
  - a company's `sectorId` and `objectiveLineId`;
  - a sector's `startLineId` and each leg's `toLineId`;
  - every `source` id against `sources`;
  - every `forces[].doctrine` id;
  - `historical.objectives[].lineId` and `sectorId`;
  - duplicate ids across lines, sectors, formations and companies.

- [ ] **Step 1: Write the failing tests**

```ts
it('parses a valid scenario', () => {
  expect(parseScenario(toYaml(minimalScenario()), ['bef-1917']).id).toBe('fixture');
});
it('reports every broken reference with its path (Review Focus 1)', () => {
  const s = minimalScenario();
  s.forces[0].formations[0].companies![1].objectiveLineId = 'blak';
  s.sectors[0].legs[0].liftM = { value: 91, source: 'nope' };
  s.forces[0].doctrine = 'bef-1916';
  try { parseScenario(toYaml(s), ['bef-1917']); expect.unreachable(); }
  catch (e) {
    const p = (e as ScenarioError).problems;
    expect(p).toContainEqual(expect.stringContaining('companies[1].objectiveLineId: unknown line "blak"'));
    expect(p).toContainEqual(expect.stringContaining('legs[0].liftM.source: unknown source "nope"'));
    expect(p).toContainEqual(expect.stringContaining('forces[0].doctrine: unknown doctrine "bef-1916"'));
  }
});
it('reports duplicate ids', () => {
  const s = minimalScenario(); s.lines[1].id = 'gfront';
  expect(() => parseScenario(toYaml(s), ['bef-1917'])).toThrow(/duplicate id "gfront"/);
});
it('reports schema errors with their path, not a stack trace', () => {
  const s: any = minimalScenario(); delete s.zeroHour;
  expect(() => parseScenario(toYaml(s), ['bef-1917'])).toThrow(/zeroHour/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/scenario/src/load.test.ts`
Expected: FAIL. `parseScenario` is not defined.

- [ ] **Step 3: Implement `references.ts` and `load.ts`**

Use the `yaml` package's `parse`. Turn Zod issues into `path.join('.')` plus the message.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/scenario`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/scenario
git commit -m "feat(scenario): load scenarios and doctrine with reference checks"
```

---

### Task 3: Engine RNG and geometry

**Files:**
- Create: `packages/engine/package.json` (no dependencies besides `@wwi/scenario` for types), `packages/engine/tsconfig.json` (`lib: ["ES2022"]`, no DOM)
- Create: `packages/engine/src/rng.ts`, `packages/engine/src/geometry.ts`
- Test: `packages/engine/src/rng.test.ts`, `packages/engine/src/geometry.test.ts`

**Interfaces:**
- Produces:
  - `createRng(seed: number): () => number`. Mulberry32. Returns values in [0, 1).
  - `lineXAt(points: Point[], y: number): number`. Linear interpolation of x along a polyline sorted by y. Clamps to the first or last point outside the y extent.
  - `sampleYs(yMin: number, yMax: number, n = 9): number[]`.

- [ ] **Step 1: Write the failing tests**

```ts
it('same seed gives the same sequence; different seeds differ', () => {
  const a = createRng(42), b = createRng(42), c = createRng(43);
  const sa = [a(), a(), a()], sb = [b(), b(), b()];
  expect(sa).toEqual(sb); expect(c()).not.toBe(sa[0]);
  sa.forEach(x => { expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThan(1); });
});
it('interpolates x along a line', () => {
  expect(lineXAt([[100, 0], [300, 400]], 200)).toBe(200);
});
it('clamps outside the line extent instead of returning NaN (Review Focus 2)', () => {
  expect(lineXAt([[100, 0], [300, 400]], -50)).toBe(100);
  expect(lineXAt([[100, 0], [300, 400]], 900)).toBe(300);
  expect(lineXAt([[120, 50]], 999)).toBe(120);
});
it('sampleYs spans the sector inclusively', () => {
  expect(sampleYs(0, 400, 5)).toEqual([0, 100, 200, 300, 400]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/engine`
Expected: FAIL. The modules are missing.

- [ ] **Step 3: Implement `createRng` and the geometry functions**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/engine`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): seeded RNG and line geometry"
```

---

### Task 4: The creeping barrage timetable

**Files:**
- Create: `packages/engine/src/types.ts`, `packages/engine/src/barrage.ts`
- Test: `packages/engine/src/barrage.test.ts`

**Interfaces:**
- Consumes: `Scenario` sectors and lines (Task 1), `lineXAt` (Task 3).
- Produces:
  - `type SimEvent = { minute: number; kind: 'zero-hour' | 'barrage-pause' | 'barrage-resume' | 'barrage-done' | 'company-reached' | 'line-taken'; sectorId?: string; lineId?: string; unitId?: string; text: string; causes: string[] }`.
  - `type BarrageState = { sectorId: string; legIndex: number; phase: 'lifting' | 'pausing' | 'done'; phaseStartMin: number }`.
  - `initBarrage(sector): BarrageState`. Starts at leg 0, `lifting`, minute 0.
  - `advanceBarrage(b: BarrageState, sector, lines: Map<string, Point[]>, minute: number): { state: BarrageState; events: SimEvent[] }`.
  - `barrageXAt(b: BarrageState, sector, lines, minute: number, y: number): number`.

**The algorithm.** The signature doesn't fix this, so here it is. Leg `i` moves from line `from` to line `to`. Line `from` is the sector's `startLineId` when `i = 0`, otherwise leg `i-1`'s `toLineId`.

```
standFrom = (i === 0) ? 0 : standOffM
depthM    = lineXAt(to, yMid) - lineXAt(from, yMid)        // yMid = (yMin+yMax)/2
legMin    = ceil(depthM / liftM) * liftMin                  // duration of the lifting phase
lifting:  t = min(1, floor((minute - phaseStartMin) / liftMin) * liftM / depthM)
          x(y) = lerp(lineXAt(from,y) + standFrom, lineXAt(to,y) + standOffM, t)
pausing:  x(y) = lineXAt(to,y) + standOffM
```

The phase changes are:
- **`lifting` → `pausing`** when `minute - phaseStartMin >= legMin`. This emits `barrage-pause`.
- **`pausing` → the next leg's `lifting`** after `pauseMin`. This emits `barrage-resume`.
- **The last leg** ends after its pause, as `done`, emitting `barrage-done`. Once `done`, x stays where it was during the last pause.

- [ ] **Step 1: Write the failing tests**

These use `minimalScenario()`: depth 1000 m, lift 91 m per 3 min, pause 40, stand-off 180.

```ts
it('opens on the German front line at zero', () => {
  expect(barrageXAt(initBarrage(sec), sec, lines, 0, 200)).toBe(150);
});
it('lifts in 91 m steps every 3 minutes', () => {
  const b = initBarrage(sec);
  expect(barrageXAt(b, sec, lines, 2, 200)).toBe(150);
  expect(barrageXAt(b, sec, lines, 3, 200)).toBeCloseTo(150 + (91 / 1000) * (1000 + 180), 6);
});
it('pauses beyond the objective after ceil(1000/91)*3 = 33 minutes, emitting barrage-pause', () => {
  const r = advanceBarrage(initBarrage(sec), sec, lines, 33);
  expect(r.state.phase).toBe('pausing');
  expect(r.events.map(e => e.kind)).toEqual(['barrage-pause']);
  expect(barrageXAt(r.state, sec, lines, 40, 200)).toBe(1150 + 180);
});
it('finishes after the last pause', () => {
  let b = advanceBarrage(initBarrage(sec), sec, lines, 33).state;
  const r = advanceBarrage(b, sec, lines, 73);
  expect(r.state.phase).toBe('done');
  expect(r.events.map(e => e.kind)).toEqual(['barrage-done']);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/engine/src/barrage.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `types.ts` and `barrage.ts`, following the algorithm above**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/engine`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): creeping barrage timetable with lifts, pauses and stand-off"
```

---

### Task 5: Moving companies, the step loop and the run record

**Files:**
- Create: `packages/engine/src/companies.ts`, `packages/engine/src/step.ts`, `packages/engine/src/record.ts`, `packages/engine/src/run.ts`, `packages/engine/src/index.ts`
- Test: `packages/engine/src/run.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:
  - `type CompanyState = { id; side: 'allied' | 'central'; battalionId; sectorId; objectiveLineId; x; y; strength: number; status: 'waiting' | 'advancing' | 'consolidating'; startMin: number; speedMPerMin: number }`.
  - `initCompanies(s: Scenario, doctrines: Record<string, Doctrine>, rng): CompanyState[]`. Each company gets:
    - `startMin = v(startAfterMin) + rng() * startJitterMin`;
    - `speedMPerMin = maxAdvanceMPerMin * (1 + (rng() * 2 - 1) * speedJitterFrac)`.

    Companies are processed in the order they appear in the scenario file.
  - `moveCompanies(cs: CompanyState[], barrageX: (sectorId: string, y: number) => number, lines, doctrines, minute, stepMin): { companies: CompanyState[]; events: SimEvent[] }`. A company:
    - waits until `startMin`;
    - then aims for `min(objX(y), barrageX(sector, y) - followDistanceM)`, moving at most `speed × stepMin` toward it along +x (never backwards);
    - becomes `consolidating` within 1 m of `objX(y)`, emitting `company-reached`.
  - `step(state: SimState, ctx): SimState`. The order within a step is: barrages, then companies, then `line-taken` checks. A line is taken in a sector when every company in that sector assigned to that line is `consolidating`. The event is emitted once, with `causes: ['followed-barrage']`.
  - `ENGINE_VERSION = '0.1.0'`.
  - `type RunRecord`:
    - `{ engineVersion; scenarioId; scenarioTitle; scenarioStatus; seed; zeroHour: string; stepMin; endMinute };`
    - `geometry: { lines: Scenario['lines']; sectors: Array<{ id; yMin; yMax }> }`;
    - `snapshots: Array<{ minute; companies: Array<{ id; side; x; y; strength; status }>; barrages: Array<{ sectorId; points: Point[] }> }>`;
    - `events: SimEvent[]`;
    - `summary: { lineTaken: Array<{ lineId; sectorId; minute }> }`.
  - `runScenario(s: Scenario, doctrines, opts: { seed: number; stepMin?: number /*2*/; snapshotEvery?: number /*5*/; endMinute?: number; stopEarly?: boolean /*true*/ }): RunRecord`.
    - It emits `zero-hour` at minute 0.
    - It stops when every barrage is `done` and every company is `consolidating`, or at `endMinute ?? s.timeLimitMinutes`.
    - Snapshots are taken at minute 0, every `snapshotEvery` steps, and at the final minute.
    - Barrage points come from `sampleYs(sector.yMin, sector.yMax)`.
    - Numbers are rounded to 0.1 m, so the JSON stays stable and small.

- [ ] **Step 1: Write the failing tests**

```ts
const { scenario: s, doctrines: d } = fixtureWithDoctrine(); // minimalScenario + bef-1917 doctrine in test-fixtures
it('is deterministic: same seed gives an identical record', () => {
  expect(JSON.stringify(runScenario(s, d, { seed: 7 }))).toBe(JSON.stringify(runScenario(s, d, { seed: 7 })));
});
it('different seeds differ in company timing', () => {
  expect(JSON.stringify(runScenario(s, d, { seed: 7 }).snapshots)).not.toBe(JSON.stringify(runScenario(s, d, { seed: 8 }).snapshots));
});
it('companies never get closer to the barrage than followDistanceM before it pauses', () => {
  const r = runScenario(s, d, { seed: 1, snapshotEvery: 1 });
  for (const snap of r.snapshots) for (const c of snap.companies) {
    const b = snap.barrages[0].points;
    expect(c.x).toBeLessThanOrEqual(lineXAt(b.map(([x, y]) => [x, y]), c.y) - 70 + 0.1);
  }
});
it('takes the black line once, after the barrage pauses, and records it in the summary', () => {
  const r = runScenario(s, d, { seed: 1 });
  const taken = r.events.filter(e => e.kind === 'line-taken');
  expect(taken).toHaveLength(1);
  expect(taken[0].minute).toBeGreaterThanOrEqual(33);
  expect(r.summary.lineTaken).toEqual([{ lineId: 'black', sectorId: 's1', minute: taken[0].minute }]);
});
it('the record carries the geometry and starts with zero-hour', () => {
  const r = runScenario(s, d, { seed: 1 });
  expect(r.geometry.lines.map(l => l.id)).toEqual(['gfront', 'black']);
  expect(r.events[0].kind).toBe('zero-hour');
});
it('a 4-day run stays under 20 MB (Review Focus 3)', () => {
  const r = runScenario(withManyCompanies(s, 150), d, { seed: 1, endMinute: 5760, stopEarly: false } as any);
  expect(r.snapshots.length).toBe(5760 / (2 * 5) + 1);
  expect(JSON.stringify(r).length).toBeLessThan(20_000_000);
});
```

`stopEarly: false` forces a full-length run. `withManyCompanies(s, n)` is a test helper that clones the companies across the sector.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/engine/src/run.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `companies.ts`, `step.ts`, `record.ts`, `run.ts` and `index.ts`, following the interfaces above**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/engine`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine
git commit -m "feat(engine): company movement behind the barrage, step loop, run record"
```

---

### Task 6: Draft scenario for the 1st Canadian Division sector, and BEF 1917 doctrine

**Files:**
- Create: `scenarios/vimy-1917/1cdn-3bde-draft.yaml`, `doctrine/bef-1917.yaml`
- Test: `packages/scenario/src/fixture-files.test.ts`

**Interfaces:**
- Consumes: `loadScenario` (Task 2).
- Produces: the first real scenario file. The CLI and app tasks use it.

**Contents.** `status: draft`.
- **Sources:**
  - `vimy-brief-2026`: the owner's Vimy research brief (Nov 2026), which compiles Nicholson, Campbell, the RCA fire-plan essay and others.
  - `artillery-notes-4`: *Artillery Notes No. 4*, as quoted in the brief.
- **`geometrySource`:** an estimate, with the reason "Schematic straight-line approximation for engine testing; replaced by georeferenced trench maps in Plan 2".
- **Lines** (x in metres, each line drawn straight from y=0 to y=1200, all estimates):

  | Line | x | Kind | Side |
  |---|---|---|---|
  | `cdn-front` | 0 | trench | allied |
  | `ger-front` | 150 | trench | central |
  | `black` | 1150 | objective | |
  | `red` | 1800 | objective | |
  | `blue` | 2800 | objective | |
  | `brown` | 3600 | objective | |

- **Sector `1cdn-3bde`:** y from 0 to 1200, start line `ger-front`.
  - Legs: black → red → blue → brown.
  - `liftM` = 91, citing `artillery-notes-4` ("100 yards").
  - `liftMin` = 3 for the black and red legs (`artillery-notes-4`) and 5 for the blue and brown legs (`vimy-brief-2026`, "Vimy barrage map averages ~5 min per lift").
  - `pauseMin` = 40 / 150 / 96 / 0, citing `vimy-brief-2026`.
  - `standOffM` = 180, an estimate ("~200 yd protective barrage beyond objective; to verify against Corps Artillery Instruction No. 1").
- **`zeroHour`:** `1917-04-09T05:30`, citing `vimy-brief-2026`.
- **`timeLimitMinutes`:** 1440.
- **Forces:** allied, with doctrine `bef-1917`.
  - **1st Canadian Division** (leader "Maj-Gen Arthur Currie").
  - **3rd Brigade** (leader "Brig-Gen Tuxford"):
    - **16th Bn** at y = 200–500 and **14th Bn** at y = 700–1000. Each has companies A–D at x = 0.
    - A and B aim for `black`, start at 0, role `assault`.
    - C and D aim for `red`, start at 0, role `assault`.
  - **1st Brigade** (leader "Brig-Gen Griesbach"), **1st Bn**: companies A–D at x = −400, spread across the sector.
    - A and B aim for `blue`, C and D for `brown`.
    - `startAfterMin` = 245, citing `vimy-brief-2026` (the 1st Bn war diary: advance resumed 09:35).
  - Every company's `strength` is 150, an estimate ("brief: battalion effectives ~600–800 (researcher's estimate) ÷ 4; replaced in Plan 2").
- **Historical, sector `1cdn-3bde`, citing `vimy-brief-2026`:**
  - black: 06:15 to 06:25;
  - red: 07:00 to 07:30;
  - blue: 11:00 to 11:00;
  - brown: 14:00 to 14:00.

**`doctrine/bef-1917.yaml`.** Every value is an estimate with its reason:
- `followDistanceM` 70: "SS 135/SS 143 practice of keeping close to the barrage; to source in Plan 2".
- `maxAdvanceMPerMin` 50: "~3 km/h over cratered ground; calibrated in Plan 4".
- `startJitterMin` 2.
- `speedJitterFrac` 0.1.

- [ ] **Step 1: Write the failing test**

```ts
it('the Vimy draft scenario loads, is draft, and has the expected structure', () => {
  const { scenario: s, doctrines } = loadScenario('scenarios/vimy-1917/1cdn-3bde-draft.yaml', 'doctrine');
  expect(s.status).toBe('draft');
  expect(Object.keys(doctrines)).toEqual(['bef-1917']);
  expect(s.sectors[0].legs.map(l => v(l.pauseMin))).toEqual([40, 150, 96, 0]);
  expect(allCompanies(s)).toHaveLength(12);
  expect(s.historical.objectives.map(o => o.lineId)).toEqual(['black', 'red', 'blue', 'brown']);
});
it('a run of the draft scenario takes all four lines in order', () => {
  const { scenario: s, doctrines } = loadScenario('scenarios/vimy-1917/1cdn-3bde-draft.yaml', 'doctrine');
  const order = runScenario(s, doctrines, { seed: 1 }).summary.lineTaken.map(t => t.lineId);
  expect(order).toEqual(['black', 'red', 'blue', 'brown']);
});
```

`allCompanies(s)` is exported from `packages/scenario/src/index.ts`. It flattens the formation tree.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/scenario/src/fixture-files.test.ts`
Expected: FAIL. The file is not found.

- [ ] **Step 3: Write the two YAML files with the values above, and add `allCompanies`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run`
Expected: PASS (all packages).

- [ ] **Step 5: Commit**

```bash
git add scenarios doctrine packages/scenario
git commit -m "data: draft Vimy 1st Cdn Div / 3rd Bde sector and BEF 1917 doctrine"
```

---

### Task 7: Batch runner and CLI

**Files:**
- Create: `packages/engine/src/batch.ts`, `packages/cli/package.json`, `packages/cli/src/main.ts`
- Test: `packages/engine/src/batch.test.ts`, `packages/cli/src/main.test.ts`

**Interfaces:**
- Consumes: `runScenario` (Task 5), `loadScenario` (Task 2).
- Produces:
  - `quantiles(values: number[], qs: number[]): number[]`. Linear interpolation on sorted values. Returns `[]` for empty input.
  - `runBatch(s, doctrines, seeds: number[]): BatchSummary`.
    - `BatchSummary = { runs: number; lines: Array<{ lineId; sectorId; takenIn: number; p10: number | null; median: number | null; p90: number | null; historicalEarliest: number | null; historicalLatest: number | null }> }`.
    - All times are minutes after Zero. Historical values are converted from `zeroHour`.
  - CLI:
    - `npm run sim -- run <scenario.yaml> --seed <n> --out <file.json>` writes a `RunRecord`.
    - `npm run sim -- batch <scenario.yaml> --runs <n> [--seed-start <n>]` prints a table: line, sector, taken in X/N runs, p10, median and p90 as `HH:MM`, and historical as `HH:MM–HH:MM`.
    - Both commands accept `--doctrine-dir` (default `doctrine`).
    - On a `ScenarioError`, they print each problem on its own line and exit with code 2.

- [ ] **Step 1: Write the failing tests**

```ts
it('quantiles', () => {
  expect(quantiles([1, 2, 3, 4, 5], [0.1, 0.5, 0.9])).toEqual([1.4, 3, 4.6]);
  expect(quantiles([], [0.5])).toEqual([]);
});
it('runBatch summarises each line over the seeds, with historical minutes', () => {
  const { scenario: s, doctrines } = loadScenario('scenarios/vimy-1917/1cdn-3bde-draft.yaml', 'doctrine');
  const b = runBatch(s, doctrines, [1, 2, 3, 4, 5]);
  const black = b.lines.find(l => l.lineId === 'black')!;
  expect(b.runs).toBe(5); expect(black.takenIn).toBe(5);
  expect(black.historicalEarliest).toBe(45); expect(black.historicalLatest).toBe(55);
});
it('CLI exits 2 and lists problems for a broken scenario', async () => {
  const r = await runCli(['run', 'packages/cli/test/broken.yaml', '--seed', '1', '--out', '/tmp/x.json']);
  expect(r.code).toBe(2); expect(r.stderr).toMatch(/unknown line/);
});
```

`runCli` spawns `tsx packages/cli/src/main.ts` and captures the output. `packages/cli/test/broken.yaml` is the minimal fixture with a bad `objectiveLineId`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/engine/src/batch.test.ts packages/cli`
Expected: FAIL.

- [ ] **Step 3: Implement `batch.ts` and `main.ts`, using `node:util` `parseArgs`**

- [ ] **Step 4: Run the tests and a manual batch**

Run: `npx vitest run && npm run sim -- batch scenarios/vimy-1917/1cdn-3bde-draft.yaml --runs 20`
Expected: the tests PASS, and the table shows four lines, each taken in 20/20 runs, with historical ranges.

- [ ] **Step 5: Commit**

```bash
git add packages/engine packages/cli
git commit -m "feat(cli): single runs and batch summaries against historical times"
```

---

### Task 8: Playback logic (clock, interpolation, quiet periods, markers)

**Files:**
- Create: `packages/app/package.json` (vite, react, react-dom, @vitejs/plugin-react), `packages/app/vite.config.ts`, `packages/app/index.html`
- Create: `packages/app/src/playback/clock.ts`, `interpolate.ts`, `quiet.ts`, `markers.ts`
- Test: `packages/app/src/playback/playback.test.ts`

**Interfaces:**
- Consumes: the `RunRecord` type (Task 5). Import it as a type only, from `@wwi/engine`.
- Produces:
  - `SPEEDS = [1, 10, 60, 360] as const`, in battle-minutes per real second.
  - `QUIET_SPEEDUP = 10`.
  - `advancePlayhead(minute: number, realDtSec: number, speed: number, quiet: boolean, endMinute: number): { minute: number; ended: boolean }`. It clamps to `[0, endMinute]`.
  - `seek(minute: number, endMinute: number): number`. It clamps.
  - `frameAt(r: RunRecord, minute: number): { minute; companies: Array<{ id; side; x; y; strength; status }>; barrages: Array<{ sectorId; points: Point[] }> }`.
    - Positions and barrage points are linearly interpolated between the snapshots on either side.
    - `status` comes from the earlier snapshot.
    - With one snapshot, it returns that snapshot.
  - `isQuiet(r: RunRecord, minute: number, windowMin = 20): boolean`. True when no event lies within `[minute − windowMin, minute + windowMin]` and no company moves more than 1 m between the snapshots on either side.
  - `timelineMarkers(r: RunRecord): Array<{ minute; label: string; kind: 'zero' | 'line-taken' }>`. Zero hour comes first; `line-taken` labels read "Black Line taken".
  - `formatClock(zeroHourIso: string, minute: number): string`. For example "Mon 9 Apr · 06:25".

- [ ] **Step 1: Write the failing tests**

```ts
it('advances by speed × dt, ×10 when quiet', () => {
  expect(advancePlayhead(0, 1, 10, false, 1000)).toEqual({ minute: 10, ended: false });
  expect(advancePlayhead(0, 1, 10, true, 1000)).toEqual({ minute: 100, ended: false });
});
it('clamps at the end and reports ended; seek clamps both ways (Review Focus 4)', () => {
  expect(advancePlayhead(995, 1, 360, false, 1000)).toEqual({ minute: 1000, ended: true });
  expect(advancePlayhead(1000, 1, 1, false, 1000)).toEqual({ minute: 1000, ended: true });
  expect(seek(-5, 1000)).toBe(0); expect(seek(5000, 1000)).toBe(1000);
});
it('interpolates company positions between snapshots', () => {
  const r = recordWith([{ minute: 0, x: 0 }, { minute: 10, x: 100 }]);
  expect(frameAt(r, 5).companies[0].x).toBe(50);
});
it('handles a one-snapshot, no-event record (Review Focus 5)', () => {
  const r = recordWith([{ minute: 0, x: 0 }], []);
  expect(frameAt(r, 0).companies[0].x).toBe(0);
  expect(frameAt(r, 99).companies[0].x).toBe(0);
  expect(timelineMarkers(r)).toEqual([]);
  expect(isQuiet(r, 0)).toBe(true);
});
it('quiet only when nothing moves and no events nearby', () => {
  const r = recordWith([{ minute: 0, x: 0 }, { minute: 100, x: 0 }, { minute: 200, x: 500 }], [{ minute: 10, kind: 'zero-hour' }]);
  expect(isQuiet(r, 20)).toBe(false); expect(isQuiet(r, 60)).toBe(true); expect(isQuiet(r, 150)).toBe(false);
});
it('formats the battle clock', () => {
  expect(formatClock('1917-04-09T05:30', 55)).toBe('Mon 9 Apr · 06:25');
});
```

`recordWith(points, events?)` is a test helper that builds a minimal `RunRecord` with one company. When `events` is left out, it defaults to a zero-hour event.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/app`
Expected: FAIL.

- [ ] **Step 3: Implement the four modules**

For `formatClock`, use plain date arithmetic on the parsed local fields. Don't depend on the time zone.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/app`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/app
git commit -m "feat(app): playback clock, interpolation, quiet-period skipping, markers"
```

---

### Task 9: The time-lapse player (map and controls)

**Files:**
- Create: `packages/app/src/map/projection.ts`, `packages/app/src/map/draw.ts`, `packages/app/src/ui/Playback.tsx`, `packages/app/src/main.tsx`
- Create: `packages/app/e2e/playback.spec.ts`, `packages/app/playwright.config.ts`
- Test: `packages/app/src/map/projection.test.ts`

**Interfaces:**
- Consumes: Task 8's functions, and `RunRecord`.
- Produces:
  - `fitView(bounds: { minX; maxX; minY; maxY }, w: number, h: number, pad = 24): View`.
  - `worldToScreen(view: View, p: Point): [number, number]`. y is flipped, so north points up.
  - `drawFrame(ctx: CanvasRenderingContext2D, view: View, r: RunRecord, frame)`. It draws, in this order:
    1. paper background;
    2. trench lines, coloured by side, with a crenellated stroke;
    3. objective lines, dashed, coloured by their line colour, and labelled;
    4. the barrage band: the polygon between each barrage polyline and the same polyline shifted 90 m east, filled with diagonal `#c9a24a` hatching;
    5. company markers: 26×16 rectangles in the side's colour with a short id label, and a strength bar underneath. A consolidating company gets a white outline.
  - `<Playback record={RunRecord} />`, which renders:
    - the canvas, which resizes with its container;
    - a clock overlay showing `formatClock` and "N h M min after zero hour";
    - a draft banner when `scenarioStatus === 'draft'`: "Draft — unverified data";
    - Play/Pause, and Back and Forward buttons that step to the previous or next event;
    - speed buttons labelled "1 s = 1 min", "1 s = 10 min", "1 s = 1 h", "1 s = 6 h";
    - a "Skip quiet periods" toggle, on by default;
    - a scrubber (`<input type="range">`) with the timeline markers drawn above it;
    - an event log. Clicking an entry seeks to that event's minute.
  - The animation uses `requestAnimationFrame`. It advances with `advancePlayhead` and stops when `ended`.
  - `main.tsx` loads a record from a `?run=` query (fetched from `/runs/<name>.json`, served from `packages/app/public/runs`), or from a "Load run…" file picker.
  - Accessibility:
    - real `<button>`s;
    - icon-only buttons get `aria-label` ("Play", "Pause", "Previous event", "Next event");
    - the scrubber's `aria-label` is "Battle time";
    - the canvas is `role="img"`, with an `aria-label` that describes the scenario and the time.

- [ ] **Step 1: Write the failing unit test and the e2e test**

```ts
// projection.test.ts
it('fits bounds and flips y so north is up', () => {
  const v = fitView({ minX: 0, maxX: 1000, minY: 0, maxY: 500 }, 1048, 548, 24);
  expect(worldToScreen(v, [0, 500])).toEqual([24, 24]);
  expect(worldToScreen(v, [1000, 0])).toEqual([1024, 524]);
});
```

```ts
// e2e/playback.spec.ts — globalSetup runs `npm run sim -- run scenarios/vimy-1917/1cdn-3bde-draft.yaml --seed 1 --out packages/app/public/runs/sample.json`
test('plays, scrubs and jumps from the event log', async ({ page }) => {
  await page.goto('/?run=sample');
  await expect(page.getByText('Draft — unverified data')).toBeVisible();
  const clock = page.getByTestId('battle-clock');
  await expect(clock).toHaveText('Mon 9 Apr · 05:30');
  await page.getByRole('button', { name: '1 s = 1 h' }).click();
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(clock).not.toHaveText('Mon 9 Apr · 05:30', { timeout: 3000 });
  await page.getByRole('button', { name: 'Pause' }).click();
  await page.getByRole('listitem').filter({ hasText: 'Black Line taken' }).click();
  await expect(clock).toHaveText(/Mon 9 Apr · 06:\d\d/);
  await page.getByLabel('Battle time').fill('0');
  await expect(clock).toHaveText('Mon 9 Apr · 05:30');
  await page.screenshot({ path: 'packages/app/e2e/out/playback.png' });
});
```

In `playwright.config.ts`:
- start `vite --port 5179` with `webServer`;
- set `launchOptions.executablePath` to `process.env.PW_CHROMIUM_PATH` when it is set;
- pass `--trace off` in the npm script.

In this cloud container, set `PW_CHROMIUM_PATH=/opt/pw-browsers/chromium`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/app/src/map && npm -w packages/app run e2e`
Expected: FAIL.

- [ ] **Step 3: Implement `projection.ts`, `draw.ts`, `Playback.tsx` and `main.tsx`, following the interfaces above**

- [ ] **Step 4: Run all tests, then look at the screenshot**

Run: `npx vitest run && npm -w packages/app run e2e`
Expected: everything PASSES. Then open `packages/app/e2e/out/playback.png` and check:
- the paper map;
- the blue and red trenches;
- the four dashed objective lines;
- the hatched barrage band;
- the company markers;
- the clock, the draft banner, the controls and the event log.

- [ ] **Step 5: Commit**

```bash
git add packages/app
git commit -m "feat(app): animated time-lapse player with speeds, quiet skip, scrubber, event log"
```

---

## Done when

- `npx vitest run` and `npm -w packages/app run e2e` pass.
- `npm run sim -- batch scenarios/vimy-1917/1cdn-3bde-draft.yaml --runs 20` prints the line times next to the historical ranges.
- `npm run app`, then opening `/?run=sample`, plays the draft Vimy sector as a time-lapse: the barrage creeps, companies follow it, objective lines fall in order, and the clock, speeds, quiet-period skipping, scrubber and event log all work.

**Not in this plan (comes later):**
- Engine: fire, casualties, morale, German units, the bombardment calculation, real terrain.
- Playback: zooming between battalions and companies, side-by-side runs, weather and day/night overlays, German reserve columns, trench-state changes, the "why" trace. These all need Plan 2 or 3 data and land with them.
- Everything else: calibration, what-ifs, setup and compare screens, Web Worker runs, video export, 3D. Each belongs to a later plan in the series above.
