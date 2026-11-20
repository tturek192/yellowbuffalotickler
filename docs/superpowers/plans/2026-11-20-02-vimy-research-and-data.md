# Plan 2: Vimy Research and Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Research and enter the full Vimy Ridge battle (9–12 April 1917) as a sourced scenario. It covers:
- both sides down to company;
- real terrain and trench geometry;
- the fire plan and the weather;
- the historical results the simulator will be tested against.

The scenario must still run in the Plan 1 engine and play in the time-lapse. The plan ends with a review document for the owner.

**Architecture:** The plan has three parts.
- **Format v2 (code).** The scenario format grows to include:
  - a source registry with source tiers;
  - values where sources disagree;
  - multi-file scenarios;
  - a geographic frame that projects GeoJSON longitude/latitude into the engine's local metres;
  - leaders, German garrisons, reserves, artillery, weather, and richer historical results.
- **Research (subagents with web access).** Each research task produces two things: a data file the loader validates, and a research-notes file citing every value. Tests check structure and cross-checks, never "the right answer" from memory.
- **Integration.** A command assembles the full scenario and writes the owner's review document.

**Tech Stack:** As in Plan 1 (TypeScript strict, Zod, `yaml`, Vitest, Vite and React, Canvas 2D, Playwright). Additions:
- IGN altimetry REST API, for elevation;
- `pdftotext` and `pdfimages` (poppler), for the official history;
- no new runtime libraries.

**Spec:** `docs/superpowers/specs/2026-11-20-wwi-battle-simulator-design.md`. Sections 6, 11, 12 and 13 are the requirements for this plan.

**Builds on:** Plan 1, `docs/superpowers/plans/2026-11-20-01-foundation-and-time-lapse.md`. Its packages, rulings and conventions still apply:
- `@wwi/scenario` exposes `loadScenario` only through `@wwi/scenario/node`;
- the engine is node- and DOM-free and deterministic;
- the app imports engine types only;
- `npm test` runs the typecheck and then vitest.

## Global Constraints

- **All of Plan 1's Global Constraints still hold.**
- **No invented history.** A historical value is entered in one of three ways:
  - **sourced:** it cites a source id, with a page or section when the source has one;
  - **estimate:** it carries a written reason saying how it was inferred;
  - **disputed:** sources disagree, so it carries a range and every source.

  A value that can't be found is either an `estimate` with its reasoning or left out where the schema allows. It is never filled in from memory as if it were sourced.
- **Source tiers.** Every source in the registry has a `tier`:
  - `primary`: war diaries, orders, fire plans, contemporary reports;
  - `official`: official histories, for example Nicholson 1962 and the Reichsarchiv;
  - `scholarly`: peer-reviewed or academic works, for example Sheldon, Cave, Godefroy, *Canadian Military History*;
  - `secondary`: reputable popular or reference works, for example Legion Magazine, the Canadian Encyclopedia;
  - `tertiary`: Wikipedia, forums, blogs.
- **Rule for `historical.*` values.** Every value under `historical.*` (the targets the simulator is tested against) must cite only `primary`, `official` or `scholarly` sources, or be an `estimate`. Loading rejects anything else. Lower tiers may be cited for non-target values, and as leads in research notes.
- **Research notes.** Every research task writes `docs/research/vimy/<topic>.md`. It contains:
  - a table of every value entered, with the value, the source id, the page or section, a quote of at most 25 words, and its tier;
  - a "Conflicts" section;
  - an "Open questions for the historian" section.

  Quotes stay short. No source text is copied beyond those quotes.
- **Network access.** These hosts are allowed for research:
  - `en.wikipedia.org`, `de.wikipedia.org`, `upload.wikimedia.org`, `commons.wikimedia.org`;
  - `publications.gc.ca`, `www.canada.ca`, `www.veterans.gc.ca`;
  - `recherche-collection-search.bac-lac.gc.ca`, `www.bac-lac.gc.ca`;
  - `www.cefresearch.ca`, `archive.org`, `scholars.wlu.ca`, `legionmagazine.com`, `rca-arc.org`, `www.gutenberg.org`;
  - `data.geopf.fr`, `www.westernfrontassociation.com`, `www.thecanadianencyclopedia.ca`, `www.journal.forces.gc.ca`.

  The Copernicus DEM bucket and package registries are also reachable. Any other host is unavailable. Don't work around that; record it as an open question.
- **Downloaded sources** go in `.cache/sources/`, which is gitignored and never committed. They are fetched by `scripts/fetch-sources.sh`, which can be re-run.
- **Geometry convention:**
  - GeoJSON in WGS84 `[lon, lat]` order;
  - projected to local metres by the scenario `frame`, with x along the attack bearing and y to its left (north for an eastward attack);
  - every digitized feature carries `source` and, because digitizing is approximate, an `estimate` note giving its method and expected accuracy.
- **Draft until reviewed.** The Vimy scenario keeps `status: draft`. Only the owner changes it.
- **Owner-owned ratings.** Leader ratings are drafted by the builder as `estimate`s, each with a written justification. They are the owner's to change, and the review document says so.

## Review Focus

1. **Swapped coordinates.** A feature typed as `[lat, lon]` instead of `[lon, lat]` lands hundreds of kilometres away. Loading must reject any projected point outside the scenario's declared extent, naming the file and feature id. (Task 2 test.)
2. **Broken multi-file scenarios.** A missing include file, or the same id defined in two files, must fail at load naming both files. It must not be silently merged with one copy winning. (Task 1 test.)
3. **Real traced lines that zig-zag back in y.** After projection, the engine still needs front and objective lines whose y strictly increases. Loading must name the line and the first offending vertex, so the digitizer knows what to simplify. (Task 2 test.)
4. **Real German garrisons in the scenario.** Static `garrison` companies must never move, never stop a run ending early, and draw in German colours. A full-scenario run must still end when the attack's barrages and companies are done. (Task 4 test.)
5. **The elevation service failing part-way through ~150k samples.** The fetcher must retry, resume from its cache, and never write a grid containing no-data holes. A failed fetch exits non-zero and writes nothing. (Task 5 test.)

---

## File structure

```
scripts/fetch-sources.sh                       downloads research sources into .cache/sources (gitignored)
scripts/fetch-dem.ts                           samples IGN RGE ALTI into a terrain grid
packages/scenario/src/
  sourced.ts            + Disputed<T>, disputed(), Cite
  sources.ts            SourceRegistry schema, tiers, historicalTierRule()
  frame.ts              Frame schema, projectLonLat(), unprojectXY()
  geo.ts                GeoJSON feature schema → lines + features, extent/monotone checks
  schema.ts             Scenario v2 (leaders, garrisons, reserves, artillery, weather, historical v2)
  include.ts            mergeScenarioParts() — pure merge with provenance
  load-node.ts          loadScenario(): includes + geo files + terrain via node:fs
  review.ts             buildReview(): pure → ReviewDoc (rows, estimates, disputes, questions)
packages/engine/src/companies.ts               garrisons hold; stop rule ignores them
packages/cli/src/main.ts                       + `sim review <scenario> --out <file.md>`
packages/cli/src/review-md.ts                  ReviewDoc → Markdown
packages/app/src/map/draw.ts                   + features, German markers, hillshade
packages/app/src/map/hillshade.ts              terrain grid → shaded ImageData
tools/georef/                                  GCP affine fit, pixel→lonlat, overlay check renderer
scenarios/vimy-1917/
  scenario.yaml                                frame, extent, include list, status: draft
  sources.yaml   leaders.yaml   oob-canadian.yaml   oob-german.yaml
  fireplan.yaml  weather.yaml   historical.yaml
  geo/lines.geojson  geo/features.geojson
  terrain/rge-alti-25m.json
docs/research/vimy/
  sources.md  oob-canadian.md  oob-german.md  geometry.md  fireplan.md  weather.md
  historical.md  leaders.md  leader-rubric.md  review.md (generated)
  overlays/*.png                               georeferencing checks
```

---

### Task 1: Source tiers, disputed values and multi-file scenarios

**Files:**
- Modify: `packages/scenario/src/sourced.ts`, `packages/scenario/src/schema.ts`, `packages/scenario/src/references.ts`, `packages/scenario/src/load-node.ts`
- Create: `packages/scenario/src/sources.ts`, `packages/scenario/src/include.ts`
- Modify: `scenarios/vimy-1917/1cdn-3bde-draft.yaml`, `doctrine/bef-1917.yaml`, `packages/scenario/src/test-fixtures.ts` (add `tier` to every source)
- Test: `packages/scenario/src/sources.test.ts`, `packages/scenario/src/include.test.ts`

**Interfaces:**
- Produces:
  - `type Tier = 'primary' | 'official' | 'scholarly' | 'secondary' | 'tertiary'`.
  - `SourceSchema`: `{ title: string; author?: string; year?: number; url?: string; tier: Tier }`. `tier` is required.
  - `type Cite = { source: string; page?: string; note?: string }`.
  - `disputed<S>(inner: S)`, a schema for `{ value: T; range: [T, T]; sources: Cite[] /* ≥ 2 */; note: string }`. It holds `range[0] ≤ value ≤ range[1]` for numbers. For `LocalDateTime` it compares chronologically.
  - `sourcedOrDisputed<S>(inner)`, which accepts either form.
  - `v()` now unwraps all three forms (sourced, estimate, disputed) to `value`.
  - `historicalTierRule(s: Scenario): string[]`. One problem per citation under `historical.*` whose source tier is `secondary` or `tertiary`. Message format: `historical.casualties[0].total.sources[1]: source "wiki-vimy" is tertiary; historical targets need primary, official or scholarly sources`.
  - `mergeScenarioParts(parts: Array<{ file: string; data: unknown }>): { merged: unknown; problems: string[] }`. Merge rules:
    - top-level arrays are concatenated in include order;
    - maps (`sources`) are merged;
    - a key defined in two parts is a problem naming both files, for example `sources.nicholson-1962: defined in sources.yaml and fireplan.yaml`;
    - scalars may appear in only one part.
  - `loadScenario` accepts `include: string[]` (paths relative to the scenario file). A missing file is a problem: `include[2]: cannot read fireplan.yaml`.
  - `parseScenario` and `checkReferences` run `historicalTierRule`.

- [ ] **Step 1: Write the failing tests**

```ts
it('requires a tier on every source', () => {
  const s = minimalScenario(); delete (s.sources['vimy-brief-2026'] as any).tier;
  expect(() => parseScenario(toYaml(s), ['bef-1917'])).toThrow(/sources\.vimy-brief-2026\.tier/);
});
it('disputed values hold a range that contains the working value and ≥ 2 sources', () => {
  const D = disputed(z.number());
  expect(D.safeParse({ value: 4000, range: [3404, 6000], sources: [{ source: 'a' }, { source: 'b' }], note: 'prisoner counts differ' }).success).toBe(true);
  expect(D.safeParse({ value: 7000, range: [3404, 6000], sources: [{ source: 'a' }, { source: 'b' }], note: 'x' }).success).toBe(false);
  expect(D.safeParse({ value: 4000, range: [3404, 6000], sources: [{ source: 'a' }], note: 'x' }).success).toBe(false);
  expect(v({ value: 4000, range: [3404, 6000], sources: [{ source: 'a' }, { source: 'b' }], note: 'x' })).toBe(4000);
});
it('rejects historical targets that cite tertiary or secondary sources', () => {
  const s = minimalScenario();
  s.sources['wiki'] = { title: 'Wikipedia', tier: 'tertiary' };
  s.historical.objectives[0].earliest = { value: '1917-04-09T06:15', source: 'wiki' };
  expect(() => parseScenario(toYaml(s), ['bef-1917'])).toThrow(/historical\.objectives\[0\]\.earliest.*tertiary/);
});
it('merges included files and names both files on a duplicate key (Review Focus 2)', () => {
  const { problems } = mergeScenarioParts([
    { file: 'scenario.yaml', data: { sources: { a: { title: 'A', tier: 'official' } } } },
    { file: 'fireplan.yaml', data: { sources: { a: { title: 'A2', tier: 'official' } } } },
  ]);
  expect(problems).toEqual(['sources.a: defined in scenario.yaml and fireplan.yaml']);
});
it('loadScenario reports a missing include by index and name (Review Focus 2)', () => {
  // tmp dir with scenario.yaml including ['sources.yaml', 'missing.yaml']
  expect(() => loadScenario(tmpScenario(['sources.yaml', 'missing.yaml']), 'doctrine')).toThrow(/include\[1\]: cannot read missing\.yaml/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/scenario`
Expected: FAIL. `disputed`, `mergeScenarioParts` and tier validation don't exist yet.

- [ ] **Step 3: Implement the code, and add tiers to the existing data**

Tiers for the Plan 1 files:
- `vimy-brief-2026`: `secondary` (the owner's compiled brief);
- `artillery-notes-4`: `primary`.

The draft scenario's `historical` cites `vimy-brief-2026`, which the new rule rejects. Convert each of those values to an `estimate` whose reason quotes the brief's figure and says "to be replaced by a primary, official or scholarly citation in Task 10".

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS. This includes the Plan 1 draft scenario and the golden-record test. The golden hash must not change, because historical values don't enter the run record.

- [ ] **Step 5: Commit**

```bash
git add packages/scenario scenarios doctrine
git commit -m "feat(scenario): source tiers, disputed values, multi-file scenarios"
```

---

### Task 2: Geographic frame and GeoJSON geometry

**Files:**
- Create: `packages/scenario/src/frame.ts`, `packages/scenario/src/geo.ts`
- Modify: `packages/scenario/src/schema.ts`, `packages/scenario/src/load-node.ts`, `packages/scenario/src/index.ts`
- Test: `packages/scenario/src/frame.test.ts`, `packages/scenario/src/geo.test.ts`

**Interfaces:**
- Consumes: Task 1.
- Produces:
  - `FrameSchema`: `{ origin: { lon: number; lat: number }; bearingDeg: Sourced<number>; extent: { minX; maxX; minY; maxY } }`.
    - The extent is in local metres and holds every projected point.
    - `bearingDeg` is the attack direction (0 = north, 90 = east). It maps to +x.
  - `projectLonLat(frame, [lon, lat]): Point`:
    1. Project as a local equirectangular tangent plane at the origin:
       - `dx = (lon − lon0) · 111320 · cos(lat0°)`
       - `dy = (lat − lat0) · 110540`
    2. Rotate so that the bearing points along +x: `θ = (90 − bearing)°`, then `x = dx·cosθ + dy·sinθ` and `y = −dx·sinθ + dy·cosθ`.
  - `unprojectXY(frame, Point): [number, number]`, the exact inverse.
  - Scenario v2 gains:
    - `frame?: Frame`;
    - `geo?: string[]` (GeoJSON file paths, read by the node loader);
    - `features: Feature[]`, where `Feature = { id; kind: FeatureKind; side?: 'allied' | 'central'; name?: string; geometry: { type: 'Point'; coordinates: Point; radiusM?: number } | { type: 'LineString'; coordinates: Point[] } | { type: 'Polygon'; coordinates: Point[] }; cite: Sourced<string> }`, in local metres after loading.
  - `FeatureKind = 'trench' | 'communication-trench' | 'wire' | 'crater' | 'subway' | 'tunnel' | 'wood' | 'village' | 'road' | 'railway' | 'strongpoint' | 'battery'`.
  - `geoToScenarioParts(fc: GeoJSON.FeatureCollection, frame, file: string): { lines: Line[]; features: Feature[]; problems: string[] }`:
    - Each GeoJSON feature has `properties.id` and `properties.kind`.
    - Kinds `front-line` and `objective-line` become `lines`, carrying `name`, `side` and `color`. A `front-line` becomes a Plan 1 line of kind `trench`, and an `objective-line` becomes kind `objective`.
    - Every other kind becomes a `feature`.
    - Each feature's `properties` carry `source` + `page`, or `estimate`. These become `cite` (a `Sourced<string>`, whose value is the digitizing method).
  - Problems:
    - **Out of extent** (Review Focus 1): `geo/lines.geojson#black-1cdn: point 3 at (412833.2, -96120.0) is outside the scenario extent — are lon/lat swapped?`
    - **Not monotone** (Review Focus 3): `geo/lines.geojson#red-4cdn: y must strictly increase along the line; vertex 7 (y=2310.4) ≤ vertex 6 (y=2318.9) — simplify or reorder the trace`.
  - `checkReferences` also checks:
    - company `trenchFeatureId` (Task 3) refers to a feature of kind `trench` or `strongpoint`;
    - feature ids are unique.
  - Exported from the barrel: `projectLonLat`, `unprojectXY`, `FrameSchema`, `geoToScenarioParts`.

- [ ] **Step 1: Write the failing tests**

```ts
const frame = { origin: { lon: 2.7735, lat: 50.3796 }, bearingDeg: { value: 90, estimate: 'test' }, extent: { minX: -5000, maxX: 9000, minY: -6000, maxY: 6000 } };
it('projects east of the origin onto +x for an eastward attack, and round-trips', () => {
  const p = projectLonLat(frame, [2.7735 + 0.01, 50.3796]);
  expect(p[0]).toBeCloseTo(0.01 * 111320 * Math.cos(50.3796 * Math.PI / 180), 1);
  expect(p[1]).toBeCloseTo(0, 6);
  const back = unprojectXY(frame, p);
  expect(back[0]).toBeCloseTo(2.7835, 9); expect(back[1]).toBeCloseTo(50.3796, 9);
});
it('rotates by the bearing: with bearing 0 (northward attack), north maps to +x', () => {
  const p = projectLonLat({ ...frame, bearingDeg: { value: 0, estimate: 't' } }, [2.7735, 50.3796 + 0.01]);
  expect(p[0]).toBeCloseTo(1105.4, 1); expect(p[1]).toBeCloseTo(0, 6);
});
it('rejects swapped lon/lat with the file and feature named (Review Focus 1)', () => {
  const fc = featureCollection([line('black-1cdn', 'objective-line', [[50.37, 2.77], [50.38, 2.77]])]);
  expect(geoToScenarioParts(fc, frame, 'geo/lines.geojson').problems[0]).toMatch(/geo\/lines\.geojson#black-1cdn: point 0 .* outside the scenario extent — are lon\/lat swapped\?/);
});
it('names the first vertex where an engine line stops increasing in y (Review Focus 3)', () => {
  const fc = featureCollection([line('red-4cdn', 'objective-line', [[2.78, 50.37], [2.78, 50.38], [2.781, 50.3799]])]);
  expect(geoToScenarioParts(fc, frame, 'geo/lines.geojson').problems[0]).toMatch(/#red-4cdn: y must strictly increase along the line; vertex 2/);
});
it('turns a trench LineString into a feature with its citation', () => {
  const fc = featureCollection([{ ...line('ger-front-a', 'trench', [[2.77, 50.37], [2.771, 50.375]]), properties: { id: 'ger-front-a', kind: 'trench', side: 'central', source: 'nicholson-1962', page: 'Map 7' } }]);
  const r = geoToScenarioParts(fc, frame, 'f');
  expect(r.features[0]).toMatchObject({ id: 'ger-front-a', kind: 'trench', side: 'central', cite: { source: 'nicholson-1962', page: 'Map 7' } });
});
```

`featureCollection` and `line` are small builders, kept in the test file.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/scenario/src/frame.test.ts packages/scenario/src/geo.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `frame.ts` and `geo.ts`, extend the schema, and have `load-node.ts` read the `geo` files and merge their lines and features**

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/scenario
git commit -m "feat(scenario): geographic frame and GeoJSON lines/features with extent and monotone checks"
```

---

### Task 3: Leaders, German garrisons, reserves, artillery, weather and historical results

**Files:**
- Modify: `packages/scenario/src/schema.ts`, `packages/scenario/src/references.ts`, `packages/scenario/src/test-fixtures.ts`, `scenarios/vimy-1917/1cdn-3bde-draft.yaml`
- Test: `packages/scenario/src/schema-v2.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces. Scenario v2 additions, all values `Sourced` or `sourcedOrDisputed` unless noted:
  - **Leaders.** `leaders: Array<{ id; name: Sourced<string>; rank: Sourced<string>; ratings?: Record<'planning' | 'orderSpeed' | 'adaptiveness' | 'riskTolerance' | 'moraleEffect', Sourced<number /* integer 1–5 */>> }>`.
  - **Formations.**
    - `Formation.leaderId?: string` replaces `leader?: string`. Migrate the draft file to it, adding sourced leader records.
    - `Formation.kind` adds `'army' | 'group' | 'regiment'`. A "group" is a German *Gruppe*.
  - **Companies.**
    - `Company.role` adds `'garrison'`.
    - `Company.start: Point | { lonLat: [number, number] }`. `lonLat` requires a `frame`, and the node loader projects it.
    - `Company.paperStrength?: Sourced<number>`. `strength` is the effective strength at Zero.
    - `Company.trenchFeatureId?: string`.
    - For `garrison` and `reserve` roles, `sectorId`, `objectiveLineId` and `startAfterMin` are optional. For `assault`, `mopup` and `support` they stay required (a refinement with a path message).
  - **Reserves.** `reserves: Array<{ formationId; side; distanceKm: sourcedOrDisputed<number>; entryPoint: { lonLat: [number, number] } | Point; orderedAt?: sourcedOrDisputed<LocalDateTime>; note?: string }>`. Off-map, used by Plan 3. `historical.reserveArrivals` holds when they actually arrived.
  - **Artillery.** `artillery: Array<{ id; side; formationId?: string; weapon: string /* e.g. '18-pdr', '4.5-in howitzer', '9.2-in howitzer', 'Vickers MG' */; count: sourcedOrDisputed<number>; role: 'creeping' | 'standing' | 'heavy' | 'counter-battery' | 'trench-mortar' | 'mg-barrage' | 'defensive' }>`.
  - **Counter-battery.** `counterBattery?: { side: 'allied'; suppressedAtZeroFrac: sourcedOrDisputed<number /* 0–1 */>; note: string }`.
  - **Weather.** `weather: Array<{ at: LocalDateTime; precipitation: Sourced<'none' | 'rain' | 'sleet' | 'snow'>; windFromDeg?: Sourced<number>; visibilityM?: sourcedOrDisputed<number>; tempC?: Sourced<number> }>`, sorted by `at`.
  - **Historical results.** `historical` adds:
    - `casualties: Array<{ side; formationId?: string; window: { from: LocalDateTime; to: LocalDateTime }; total: sourcedOrDisputed<number>; killed?; wounded?; missing?; prisoners? }>`;
    - `prisonersTaken: Array<{ bySide; window; count: sourcedOrDisputed<number> }>`;
    - `gunsCaptured?: { window; field: sourcedOrDisputed<number>; trenchMortars?; machineGuns? }`;
    - `reserveArrivals: Array<{ formationId; at: sourcedOrDisputed<LocalDateTime>; where: string }>`;
    - `endedAt: sourcedOrDisputed<LocalDateTime>`.
  - **References.** `checkReferences` covers `leaderId`, `trenchFeatureId`, `reserves[].formationId`, `artillery[].formationId`, `historical.casualties[].formationId` and `historical.reserveArrivals[].formationId`.

- [ ] **Step 1: Write the failing tests**

```ts
it('garrison companies need no sector or objective; assault companies still do', () => {
  const s = minimalScenarioV2();
  s.forces.push(germanForce([{ id: 'rir262-1', name: '1./RIR 262', role: 'garrison', strength: est(150), paperStrength: est(264), start: [400, 100], trenchFeatureId: 'ger-front-a' }]));
  expect(() => parseScenario(toYaml(s), ['bef-1917', 'de-1917'])).not.toThrow();
  delete (s.forces[0].formations[0].companies![0] as any).objectiveLineId;
  expect(() => parseScenario(toYaml(s), ['bef-1917', 'de-1917'])).toThrow(/companies\[0\]\.objectiveLineId: required for role "assault"/);
});
it('checks leader, trench-feature and formation references', () => {
  const s = minimalScenarioV2(); s.forces[0].formations[0].leaderId = 'nobody';
  expect(() => parseScenario(toYaml(s), ['bef-1917'])).toThrow(/leaderId: unknown leader "nobody"/);
});
it('leader ratings are integers 1–5', () => {
  const s = minimalScenarioV2(); s.leaders[0].ratings = { planning: est(6), orderSpeed: est(3), adaptiveness: est(3), riskTolerance: est(3), moraleEffect: est(3) };
  expect(() => parseScenario(toYaml(s), ['bef-1917'])).toThrow(/leaders\[0\]\.ratings\.planning/);
});
it('weather must be in time order', () => {
  const s = minimalScenarioV2(); s.weather = [wx('1917-04-09T06:00'), wx('1917-04-09T05:00')];
  expect(() => parseScenario(toYaml(s), ['bef-1917'])).toThrow(/weather\[1\]\.at: must be after weather\[0\]\.at/);
});
it('the migrated Plan 1 draft scenario still loads and runs to the same golden record', () => {
  // draft-scenario.test.ts golden hash unchanged: leader records do not enter the run record
});
```

`minimalScenarioV2`, `germanForce`, `est` and `wx` are added to `test-fixtures.ts`. A German doctrine stub, `doctrine/de-1917.yaml`, is created with every value as an estimate: `followDistanceM` 0, `maxAdvanceMPerMin` 40, `startJitterMin` 0, `speedJitterFrac` 0. Its doctrine content belongs to Plan 3.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/scenario/src/schema-v2.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the schema additions and reference checks, and migrate the draft file to `leaderId` + `leaders`**

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS, with the golden hash unchanged.

- [ ] **Step 5: Commit**

```bash
git add packages/scenario scenarios doctrine
git commit -m "feat(scenario): leaders, garrisons, reserves, artillery, weather, richer historical results"
```

---

### Task 4: Engine and app support for the full scenario

**Files:**
- Modify: `packages/engine/src/companies.ts`, `packages/engine/src/run.ts`, `packages/engine/src/record.ts`
- Modify: `packages/app/src/map/draw.ts`, `packages/app/src/map/projection.ts`, `packages/app/src/ui/runRecord.ts`
- Test: `packages/engine/src/garrison.test.ts`, `packages/app/src/map/draw-features.test.ts`, `packages/app/e2e/playback.spec.ts`

**Interfaces:**
- Consumes: Task 3's `garrison` role and `features`.
- Produces:
  - **Engine.**
    - Companies with role `garrison` or `reserve` get `status: 'holding'` and never move. Add `'holding'` to `CompanyState['status']`.
    - The early-stop rule considers only companies that have an `objectiveLineId`.
    - The line-taken check ignores holding companies.
  - **Record.** `RunRecord.geometry.features: Feature[]` (local metres) is added.
    - Bump `ENGINE_VERSION` to `'0.2.0'`, because the record format changes.
    - Re-pin the golden hash in `draft-scenario.test.ts` with that bump, as its comment requires.
  - **App.** `drawFrame` draws features under the companies:
    - woods and villages: polygons, hatched;
    - trenches: crenellated strokes in the side's colour; communication trenches thinner;
    - wire: a fine `×` pattern;
    - craters: circles;
    - subways: dashed, semi-transparent;
    - batteries: small triangles.

    German companies use red markers outlined in `#8e2418`. Holding companies have no strength-bar animation.
  - `parseRunRecord` accepts and validates `geometry.features` (id, kind and geometry type).

- [ ] **Step 1: Write the failing tests**

```ts
it('garrisons hold, and do not block the early stop (Review Focus 4)', () => {
  const { scenario, doctrines } = fixtureWithGarrisons(); // fixtureWithDoctrine + 6 central garrison companies
  const r = runScenario(scenario, doctrines, { seed: 1 });
  const first = r.snapshots[0].companies.filter(c => c.side === 'central');
  const last = r.snapshots.at(-1)!.companies.filter(c => c.side === 'central');
  expect(last.map(c => [c.x, c.y, c.status])).toEqual(first.map(c => [c.x, c.y, 'holding']));
  expect(r.endMinute).toBeLessThan(scenario.timeLimitMinutes);
});
it('the record carries features in local metres', () => {
  const r = runScenario(fixtureWithFeatures().scenario, fixtureWithFeatures().doctrines, { seed: 1 });
  expect(r.geometry.features.map(f => f.kind)).toEqual(['trench', 'wood', 'crater']);
});
it('draws each feature kind without throwing on a stub context', () => {
  const calls = recordingContext(); drawFrame(calls.ctx, view, recordWithFeatures(), frame);
  expect(calls.count('stroke')).toBeGreaterThan(0); expect(calls.count('arc')).toBeGreaterThan(0);
});
```

Add one e2e assertion: with a record that includes German garrisons, the canvas's `aria-label` still updates on play.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/engine/src/garrison.test.ts packages/app/src/map`
Expected: FAIL.

- [ ] **Step 3: Implement the engine, record and app changes**

- [ ] **Step 4: Run all tests, including the e2e**

Run: `npm test && PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm -w packages/app run e2e`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/engine packages/app
git commit -m "feat: static German garrisons, map features in the record and the time-lapse"
```

---

### Task 5: Real terrain from IGN RGE ALTI

**Files:**
- Create: `scripts/fetch-dem.ts`, `packages/scenario/src/terrain.ts`, `packages/app/src/map/hillshade.ts`
- Modify: `packages/scenario/src/schema.ts` (`terrain?: string` path), `packages/scenario/src/load-node.ts`, `packages/engine/src/record.ts` (`geometry.terrain?`), `packages/app/src/map/draw.ts`
- Create (generated): `scenarios/vimy-1917/terrain/rge-alti-25m.json`
- Test: `packages/scenario/src/terrain.test.ts`, `scripts/fetch-dem.test.ts`, `packages/app/src/map/hillshade.test.ts`

**Interfaces:**
- Consumes: `projectLonLat` and `unprojectXY` (Task 2).
- Produces:
  - **The grid format.** `TerrainGrid = { source: Cite; method: string; cellM: number; originX: number; originY: number; cols: number; rows: number; elevDm: string /* base64 of little-endian Int16 elevations in decimetres, row-major from (originX, originY) going +x then +y */ }`.
    - `decodeTerrain(g): { at(x: number, y: number): number /* metres, bilinear, clamped */; min: number; max: number }`.
  - **The fetcher.** `fetchDem(frame, cellM, fetcher, cacheDir): Promise<TerrainGrid>`:
    - It samples cell centres across `frame.extent` by unprojecting each to lon/lat.
    - It calls `https://data.geopf.fr/altimetrie/1.0/calcul/alti/rest/elevation.json?lon=…&lat=…&resource=ign_rge_alti_wld&zonly=true`, in batches of up to 200 points, `|`-separated.
    - Each batch response is cached in `cacheDir`, keyed by a hash of its coordinates, so a re-run resumes.
    - A failed batch is retried 4 times with backoff (1, 2, 4, 8 s).
    - Any value ≤ −99999 (no data) or non-finite throws `DemError: N cells have no data (first at x=…, y=…)`.
    - It never writes a partial file. The script writes the JSON only when the whole grid is complete.
  - **The CLI script.** `npx tsx scripts/fetch-dem.ts scenarios/vimy-1917/scenario.yaml --cell 25 --out scenarios/vimy-1917/terrain/rge-alti-25m.json` exits non-zero on `DemError` or network failure.
  - **Recording the source.** Add `ign-rge-alti` to `sources.yaml` with tier `secondary` and the note: "modern 1 m–5 m elevation resampled to 25 m; post-war terrain, including the memorial park; not 1917 micro-relief".
  - **The record and app.**
    - `loadScenario` reads the `terrain` file and attaches it to the loaded scenario as `scenario.terrainGrid: TerrainGrid`.
    - `runScenario` copies it to `RunRecord.geometry.terrain` (record size stays under 20 MB; about 150k cells ≈ 400 KB base64).
    - `hillshade(grid, view, w, h, sunAzimuthDeg = 315, sunAltDeg = 45): ImageData`.
    - The app draws the hillshade, then 5 m contour lines at a low alpha over the paper, before the features.

- [ ] **Step 1: Write the failing tests**

```ts
it('round-trips a grid and interpolates bilinearly', () => {
  const g = encodeTerrain({ cellM: 25, originX: 0, originY: 0, cols: 2, rows: 2, elevM: [100, 110, 120, 130] });
  const t = decodeTerrain(g);
  expect(t.at(12.5, 12.5)).toBeCloseTo(115, 1); expect(t.min).toBe(100); expect(t.max).toBe(130);
});
it('fetchDem retries, resumes from cache, and refuses holes (Review Focus 5)', async () => {
  const fake = flakyFetcher({ failFirst: 2, noDataAt: [] });
  const g = await fetchDem(smallFrame, 500, fake, tmp());
  expect(g.cols * g.rows).toBe(expectedCells);
  expect(fake.calls).toBeGreaterThan(fake.batches);           // retried
  const again = flakyFetcher({ failFirst: 0, noDataAt: [] });
  await fetchDem(smallFrame, 500, again, sameTmp);
  expect(again.calls).toBe(0);                                // fully cached
  await expect(fetchDem(smallFrame, 500, flakyFetcher({ failFirst: 0, noDataAt: [3] }), tmp())).rejects.toThrow(/1 cells have no data/);
});
it('hillshade is brighter on slopes facing the sun', () => {
  const img = hillshade(rampFacingNorthWest(), view, 4, 4);
  expect(img.data[0]).toBeGreaterThan(hillshade(rampFacingSouthEast(), view, 4, 4).data[0]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/scenario/src/terrain.test.ts scripts packages/app/src/map/hillshade.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the code**

Add `scripts` to the root vitest projects, with its own `vitest.config.ts`.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Generate the real grid** (after Task 6 has set the frame, so in practice this step runs as the last step of Task 7)

Run: `npx tsx scripts/fetch-dem.ts scenarios/vimy-1917/scenario.yaml --cell 25 --out scenarios/vimy-1917/terrain/rge-alti-25m.json`
Expected:
- the command exits 0;
- the decoded maximum is within 140–150 m (Hill 145; the memorial area is about 145 m);
- the decoded minimum is within 40–75 m (the Douai Plain and the Souchez valley).

Record both values in `docs/research/vimy/geometry.md`.

- [ ] **Step 6: Commit**

```bash
git add scripts packages scenarios/vimy-1917/terrain docs/research/vimy/geometry.md
git commit -m "feat: real Vimy terrain from IGN RGE ALTI, with hillshade in the time-lapse"
```

---

### Task 6: Georeferencing tools, and fetching the sources

**Files:**
- Create: `scripts/fetch-sources.sh`, `.gitignore` entry `.cache/`
- Create: `tools/georef/fit.ts`, `tools/georef/overlay.ts`, `tools/georef/package.json` (`@wwi/georef`, private, node types), `tools/georef/vitest.config.ts`
- Create: `scenarios/vimy-1917/scenario.yaml` (frame, extent, `include` list, `status: draft`), `scenarios/vimy-1917/sources.yaml`
- Create: `docs/research/vimy/sources.md`
- Test: `tools/georef/fit.test.ts`

**Interfaces:**
- Produces:
  - **`scripts/fetch-sources.sh`.** Idempotent: it skips files that already exist. It downloads:
    - Nicholson, *Canadian Expeditionary Force 1914–1919* (1962), from `https://publications.gc.ca/collections/collection_2009/forces/DA3-4462E.pdf`. The archived-content page needs a cookie: first GET `https://publications.gc.ca/site/archivee-archived.html?url=<encoded pdf url>` with a cookie jar, then GET the PDF with that jar and a `Referer` to the same page.
    - Then `pdftotext` to `.cache/sources/nicholson-1962.txt`, and `pdfimages -png` for the Vimy chapter's map and sketch pages to `.cache/sources/nicholson-maps/`.
  - **Ground-control-point fit.** `fitAffine(gcps: Array<{ px: [number, number]; lonLat: [number, number] }>): { toLonLat(px): [number, number]; toPx(lonLat): [number, number]; rmsM: number; residualsM: number[] }`. A least-squares affine transform. It needs at least 4 points and throws with fewer. `rmsM` and the residuals are in metres, using the local metric at the points' centroid.
  - **Overlay check.** `renderOverlay(imagePath, fit, featureCollection, outPng)` draws digitized GeoJSON in magenta over the scanned map, as a visual check. It uses Playwright's Chromium canvas, with no new dependency.
  - **The scenario shell:**
    - `frame.origin` is the Vimy memorial, about lon 2.7735, lat 50.3796. Cite its coordinates in `sources.md`.
    - `bearingDeg` is the Canadian Corps' attack bearing, measured off Nicholson Map 7 as an estimate (about 80–100°).
    - `extent` covers the whole Canadian Corps front from the Souchez River to below Farbus Wood, from the Canadian assembly area to the German third position. Record the measured numbers.
    - `include` lists `sources.yaml`, `leaders.yaml`, `oob-canadian.yaml`, `oob-german.yaml`, `fireplan.yaml`, `weather.yaml` and `historical.yaml`. Later tasks create those files; until then, each starts as a valid empty stub.
  - **`sources.yaml`** starts with these entries, each with its tier:
    - `nicholson-1962` (official);
    - `ign-rge-alti` (secondary);
    - `vimy-brief-2026` (secondary);
    - `artillery-notes-4` (primary).

    Later tasks add their sources here, never in their own files (Task 1's duplicate-key rule enforces this).

- [ ] **Step 1: Write the failing test**

```ts
it('recovers a known affine transform from 4+ GCPs, with ~0 residual', () => {
  const truth = (px: [number, number]): [number, number] => [2.70 + px[0] * 1e-5, 50.40 - px[1] * 0.64e-5];
  const gcps = [[0, 0], [1000, 0], [0, 1000], [1000, 1000], [500, 300]].map(p => ({ px: p as [number, number], lonLat: truth(p as [number, number]) }));
  const f = fitAffine(gcps);
  expect(f.toLonLat([250, 750])[0]).toBeCloseTo(truth([250, 750])[0], 9);
  expect(f.rmsM).toBeLessThan(0.01);
});
it('refuses fewer than 4 GCPs', () => expect(() => fitAffine(gcps.slice(0, 3))).toThrow(/at least 4/));
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tools/georef`
Expected: FAIL.

- [ ] **Step 3: Implement the code, run `scripts/fetch-sources.sh`, and write the scenario shell and sources**

`bash scripts/fetch-sources.sh` must end with `.cache/sources/nicholson-1962.txt` larger than 1 MB.

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS, and `loadScenario('scenarios/vimy-1917/scenario.yaml', 'doctrine')` loads with its empty stubs.

- [ ] **Step 5: Commit**

```bash
git add scripts tools .gitignore scenarios/vimy-1917 docs/research/vimy/sources.md package.json package-lock.json
git commit -m "feat: georeferencing tools, source fetching, Vimy scenario shell"
```

---

### Task 7: Research — geometry (lines, trenches, terrain features)

**Files:**
- Create: `scenarios/vimy-1917/geo/lines.geojson`, `scenarios/vimy-1917/geo/features.geojson`, `scenarios/vimy-1917/fireplan.yaml` (sector skeletons)
- Create: `docs/research/vimy/geometry.md`, `docs/research/vimy/overlays/*.png`
- Modify: `scenarios/vimy-1917/scenario.yaml` (`geo` list), `scenarios/vimy-1917/sources.yaml`
- Test: `packages/scenario/src/vimy-geometry.test.ts`

**Method:**
1. **Pick the map.** Choose the clearest Vimy map image from `.cache/sources/nicholson-maps/` (Map 7, and Sketches 37–39 where useful). If Nicholson's map is illegible, use another reachable georeferenceable map, such as the Western Front Association's TrenchMapper sheet or a Wikimedia Commons trench map, and register it as a source.
2. **Georeference it.** Use at least 6 ground control points: village centres and fixed features with modern coordinates (Thélus, Farbus, Vimy, Givenchy-en-Gohelle, Souchez, Neuville-St-Vaast, the memorial). Record each one's coordinates and source in `geometry.md`.
3. **Digitize** by reading pixel coordinates off the image and converting them with `fit.toLonLat`:
   - the Canadian and German front lines;
   - the Black, Red, Blue and Brown objective lines, **one line per division sector** where they differ (id pattern `black-1cdn` … `brown-2cdn`);
   - the division boundaries, as sector y-ranges;
   - the German first-position trench segments, the Zwischen-Stellung, the second position and the third position;
   - the main communication trenches;
   - mine craters and crater groups;
   - the subways (Goodman, Grange, Lichfield and the others named in the sources);
   - woods (Bois de la Folie, Bois de Bonval, Farbus Wood);
   - villages;
   - Hill 145, the Pimple and Hill 135 as `strongpoint` points.
4. **Cite everything.** Every feature's properties carry `source` and `page`, plus an `estimate`. The estimate gives the method: "digitized from Map 7, affine fit rms N m".
5. **Render overlay checks** to `docs/research/vimy/overlays/` and look at them. Fix any feature more than about 100 m off its mapped position.
6. **Barrage-sector skeletons.** Write one barrage sector per attacking division into `fireplan.yaml`: ids `barrage-1cdn` … `barrage-4cdn`, y-ranges from the division boundaries, start line `ger-front`, and legs to that division's own objective lines.
   - Leg values are copied from the Plan 1 draft as estimates, with the reason "placeholder until Task 10".
   - Task 8's companies refer to these sectors, and Task 10 replaces the leg values with researched ones.
7. **Run Task 5, Step 5** to generate the terrain grid.

- [ ] **Step 1: Write the failing test**

```ts
const { scenario: s } = loadScenario('scenarios/vimy-1917/scenario.yaml', 'doctrine');
it('has one front line per side and the four objective lines for every attacking division', () => {
  const ids = s.lines.map(l => l.id);
  for (const d of ['1cdn', '2cdn', '3cdn', '4cdn']) expect(ids).toEqual(expect.arrayContaining([`black-${d}`, `red-${d}`]));
  for (const d of ['1cdn', '2cdn']) expect(ids).toEqual(expect.arrayContaining([`blue-${d}`, `brown-${d}`]));
});
it('places Hill 145 on the terrain high point within 150 m', () => {
  const hill = s.features.find(f => f.id === 'hill-145')!; const t = decodeTerrain(s.terrainGrid!);
  expect(t.at(...(hill.geometry.coordinates as [number, number]))).toBeGreaterThan(t.max - 5);
});
it('every feature is cited, and the georeference fit is recorded under 60 m rms', () => {
  for (const f of s.features) expect(f.cite).toBeDefined();
  expect(readFileSync('docs/research/vimy/geometry.md', 'utf8')).toMatch(/affine fit rms: \d+(\.\d+)? m/);
});
```

The 60 m rms limit is a quality bar on the fit; the test parses the recorded value.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/scenario/src/vimy-geometry.test.ts`
Expected: FAIL.

- [ ] **Step 3: Research and digitize, following the method above**

- [ ] **Step 4: Run all tests and look at every overlay PNG**

Run: `npm test`
Expected: PASS. Each overlay has been inspected, and corrections are noted in `geometry.md`.

- [ ] **Step 5: Commit**

```bash
git add scenarios/vimy-1917 docs/research/vimy
git commit -m "data(vimy): georeferenced lines, trenches, craters, subways, woods and villages; terrain grid"
```

---

### Task 8: Research — Canadian Corps order of battle to company, and the leaders

**Files:**
- Create: `scenarios/vimy-1917/oob-canadian.yaml`, `scenarios/vimy-1917/leaders.yaml`
- Create: `docs/research/vimy/oob-canadian.md`, `docs/research/vimy/leader-rubric.md`, `docs/research/vimy/leaders.md`
- Modify: `scenarios/vimy-1917/sources.yaml`
- Test: `packages/scenario/src/vimy-oob-canadian.test.ts`

**Method:**
1. **The command structure.** Use Nicholson ch. VIII (pp. 243–268) as the spine. It runs from First Army (Horne) through the Canadian Corps (Byng), the four divisions and their brigades, down to battalions. It includes the British 13th Brigade under the 2nd Canadian Division, and the corps reserve (9th Canadian Brigade, British 15th and 95th Brigades) as `reserve` companies.
2. **Battalions and companies.** Each battalion has companies A–D. Record:
   - its role (assault, mopup, support or reserve) and objective line, from the brigade's attack orders as described in Nicholson, in war diaries reachable through LAC or Canadiana, or in the cited scholarly works;
   - its start position (`lonLat`), within its brigade's assembly frontage taken from the Task 7 geometry;
   - `startAfterMin` from the plan, for example the leapfrog battalions.
3. **Strength.** Use a battalion's effective strength at Zero where a source gives one; otherwise an estimate with its method, for example establishment less a cited average shortfall. `paperStrength` is the establishment.
4. **Leaders.** Record every corps, division and brigade commander, plus battalion commanding officers where a source names them, each with rank and name sourced.
5. **Leader ratings.** Write `leader-rubric.md`: for each of the five ratings, what a 1, 3 and 5 look like in observable terms. Then draft ratings for the corps, division and brigade commanders as `estimate`s, each with a written justification grounded in cited conduct. These are the owner's to change.

- [ ] **Step 1: Write the failing test**

```ts
it('has the corps → 4 divisions → 12 Canadian brigades + British 13th Brigade structure', () => {
  const corps = formation(s, 'cdn-corps');
  expect(corps.children!.filter(c => c.kind === 'division').map(d => d.id)).toEqual(['1cdn', '2cdn', '3cdn', '4cdn']);
  expect(allFormations(s).filter(f => f.kind === 'brigade' && f.side === 'allied').length).toBeGreaterThanOrEqual(13);
});
it('every battalion has companies A–D with a sourced or estimated strength, inside the scenario extent', () => {
  for (const bn of battalions(s, 'allied')) {
    expect(bn.companies!.map(c => c.name.slice(-1))).toEqual(['A', 'B', 'C', 'D']);
    for (const c of bn.companies!) expect(inExtent(s, c.start)).toBe(true);
  }
});
it('every attacking company aims at a line in its own division sector', () => {
  for (const c of attackingCompanies(s)) expect(c.objectiveLineId!.endsWith(divisionOf(s, c))).toBe(true);
});
it('every formation down to brigade has a leader with a sourced name; corps-to-brigade leaders have drafted ratings', () => {
  for (const f of allFormations(s).filter(f => ['corps', 'division', 'brigade'].includes(f.kind) && f.side === 'allied')) {
    const l = leader(s, f.leaderId!); expect('source' in l.name).toBe(true); expect(l.ratings).toBeDefined();
  }
});
```

These are pure query helpers. Add them to `@wwi/scenario` as `queries.ts`, because Tasks 9 and 11 use them too:
- `formation(s, id)`
- `allFormations(s)`
- `formationIds(s, side)`
- `regimentsOf(s, divisionId)`
- `battalions(s, side)`
- `companiesOf(s, side)`
- `attackingCompanies(s)`
- `divisionOf(s, company)`, which returns its division id suffix, for example `'1cdn'`
- `leader(s, id)`
- `inExtent(s, start)`

`allFormations` returns each formation with its `side`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/scenario/src/vimy-oob-canadian.test.ts`
Expected: FAIL.

- [ ] **Step 3: Do the research and enter the data, with notes**

- [ ] **Step 4: Run all tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scenarios/vimy-1917 packages/scenario docs/research/vimy
git commit -m "data(vimy): Canadian Corps order of battle to company, leaders and drafted ratings"
```

---

### Task 9: Research — German order of battle, garrisons and reserves

**Files:**
- Create: `scenarios/vimy-1917/oob-german.yaml`, `docs/research/vimy/oob-german.md`
- Modify: `scenarios/vimy-1917/leaders.yaml`, `scenarios/vimy-1917/sources.yaml`
- Test: `packages/scenario/src/vimy-oob-german.test.ts`

**Method:**
1. **The command structure.** Sixth Army (Falkenhausen), then Gruppe Vimy (I Bavarian Reserve Corps, Fasbender) and Gruppe Souchez (VIII Reserve Corps, Wichura), then:
   - the 79th Reserve Division (RIR 261, 262, 263);
   - the 1st Bavarian Reserve Division (BRIR 1, 3, plus attached units);
   - the 16th Bavarian Division (BIR 11, 14, plus I/BRIR 21).

   Include the 9 April reinforcements (I/RIR 118, III/BRIR 34, I/IR 225). Sources:
   - Nicholson;
   - the German official history (Reichsarchiv, *Der Weltkrieg* vol. 12) if a scan is reachable on archive.org;
   - Sheldon, *The German Army in the Spring Offensives 1917*, and Sheldon and Cave, *Vimy Ridge*, as cited in reachable scholarly articles;
   - regimental histories on archive.org.
2. **The northern division.** It is disputed whether it was the 16th or the 14th Bavarian Division. Enter the working choice and record the dispute in the notes and the open questions.
3. **Garrisons.** Place each front-line company as a `garrison` with `trenchFeatureId` set to a Task 7 trench segment, following the regimental zones (about 1,000 m per regiment) and the doctrine of the day. Record `paperStrength` (264) and an actual strength. A source puts the average at about 150; label that as disputed or estimated as the sources warrant.
4. **Reserves** off the map: the 111th Division, the 4th Guards Infantry Division and any others found. Record each one's `distanceKm`, `entryPoint` and `orderedAt` where sourced. Arrival times go in `historical.reserveArrivals` (Task 10).

- [ ] **Step 1: Write the failing test**

```ts
it('has the two Gruppen and three front-line divisions with their regiments', () => {
  expect(formationIds(s, 'central')).toEqual(expect.arrayContaining(['gruppe-vimy', 'gruppe-souchez', '79rd', '1brd']));
  expect(regimentsOf(s, '79rd').map(r => r.id)).toEqual(['rir261', 'rir262', 'rir263']);
});
it('every front-line company is a garrison on a German trench feature, with paper and actual strength', () => {
  for (const c of companiesOf(s, 'central').filter(c => c.role === 'garrison')) {
    const f = s.features.find(x => x.id === c.trenchFeatureId)!;
    expect(f.side).toBe('central'); expect(c.paperStrength).toBeDefined();
    expect(v(c.strength)).toBeLessThanOrEqual(v(c.paperStrength!));
  }
});
it('lists off-map reserves with distance and entry point', () => {
  expect(s.reserves.filter(r => r.side === 'central').length).toBeGreaterThanOrEqual(2);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/scenario/src/vimy-oob-german.test.ts`
Expected: FAIL.

- [ ] **Step 3: Do the research and enter the data, with notes**

- [ ] **Step 4: Run all tests, including a full-scenario smoke run**

Run: `npm test && npm run sim -- run scenarios/vimy-1917/scenario.yaml --seed 1 --out runs/vimy-full.json`
Expected: PASS. The run ends with the German garrisons holding (Task 4).

- [ ] **Step 5: Commit**

```bash
git add scenarios/vimy-1917 docs/research/vimy
git commit -m "data(vimy): German order of battle to company, garrisons on trench segments, off-map reserves"
```

---

### Task 10: Research — fire plan, weather and historical results

**Files:**
- Modify: `scenarios/vimy-1917/fireplan.yaml`; Create: `scenarios/vimy-1917/weather.yaml`, `scenarios/vimy-1917/historical.yaml`
- Create: `docs/research/vimy/fireplan.md`, `docs/research/vimy/weather.md`, `docs/research/vimy/historical.md`
- Modify: `scenarios/vimy-1917/sources.yaml`
- Test: `packages/scenario/src/vimy-fireplan-historical.test.ts`

**Method:**
1. **Fire plan.**
   - A barrage `sector` for each attacking division, with legs to that division's objective lines. Record lift distance, minutes per lift and the pause at each line from the corps and division timetables (Nicholson; the RCA fire-plan essay on rca-arc.org; *Canadian Military History* articles on scholars.wlu.ca).
   - The artillery park by weapon and role, with counts.
   - The counter-battery state at Zero, as disputed: "83% of 212 guns" against "85% of 175 located".
   - The indirect machine-gun barrage.
   - The standing barrages, as notes for Plan 3.
2. **Weather.** The 9–12 April timeline (snow and sleet, a north-westerly wind on 9 April; snow and a westerly wind on 12 April), from Nicholson and war diaries.
3. **Historical results.** Under the tier rule:
   - when each objective line fell, for each division (with ranges);
   - casualties: corps total and by division where sourced, with killed, wounded and missing, plus battalion figures where sourced; German division losses with their windows (for example 1–11 April);
   - prisoners and captured guns (disputed values);
   - when the reserves arrived;
   - `endedAt`.

   The `vimy-brief-2026` figures are leads only. Every target must end up citing a primary, official or scholarly source, or be marked as an estimate.
4. **Replace the estimates.** Swap the Task 1 placeholder estimates in the old draft's `historical` section for real citations wherever this research supports them.

- [ ] **Step 1: Write the failing test**

```ts
it('every attacking division has a barrage sector whose legs end on its own objective lines', () => {
  for (const d of ['1cdn', '2cdn', '3cdn', '4cdn']) {
    const sec = s.sectors.find(x => x.id === `barrage-${d}`)!;
    for (const leg of sec.legs) expect(leg.toLineId.endsWith(d)).toBe(true);
  }
});
it('artillery counts by role sum to the park total recorded in the notes', () => {
  const total = s.artillery.filter(a => a.side === 'allied').reduce((n, a) => n + v(a.count), 0);
  expect(total).toBe(parkTotalFromNotes('docs/research/vimy/fireplan.md'));
});
it('historical targets exist for every division line and for corps casualties, all within the tier rule', () => {
  expect(s.historical.objectives.length).toBeGreaterThanOrEqual(12);
  expect(s.historical.casualties.some(c => c.side === 'allied' && !c.formationId)).toBe(true);
  expect(historicalTierRule(s)).toEqual([]);
});
it('weather covers 9–12 April in order', () => {
  expect(s.weather[0].at <= '1917-04-09T05:30').toBe(true); expect(s.weather.at(-1)!.at >= '1917-04-12T00:00').toBe(true);
});
```

`parkTotalFromNotes` parses a line of the form `Park total: N (source: …)` that `fireplan.md` must contain.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run packages/scenario/src/vimy-fireplan-historical.test.ts`
Expected: FAIL.

- [ ] **Step 3: Do the research and enter the data, with notes**

- [ ] **Step 4: Run all tests and a batch against history**

Run: `npm test && npm run sim -- batch scenarios/vimy-1917/scenario.yaml --runs 10`
Expected: PASS. The table shows every division's lines next to their historical ranges. Movement-only results will not match history; Plan 3 deals with that.

- [ ] **Step 5: Commit**

```bash
git add scenarios/vimy-1917 docs/research/vimy
git commit -m "data(vimy): fire plan per division, artillery park, weather timeline, sourced historical results"
```

---

### Task 11: The owner's review document

**Files:**
- Create: `packages/scenario/src/review.ts`, `packages/cli/src/review-md.ts`
- Modify: `packages/cli/src/main.ts` (adds `review`)
- Create (generated): `docs/research/vimy/review.md`
- Test: `packages/scenario/src/review.test.ts`, `packages/cli/src/review-md.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `buildReview(s: Scenario): ReviewDoc`:
    - `ReviewDoc = { scenarioTitle; status; counts: { values: number; sourced: number; estimates: number; disputed: number; byTier: Record<Tier, number> }; sections: ReviewSection[]; openQuestions: string[] }`;
    - `ReviewSection = { title: string; rows: Array<{ path: string; label: string; value: string; kind: 'sourced' | 'estimate' | 'disputed'; cite: string; note?: string }> }`.
  - Sections, in order:
    1. Historical targets
    2. Leaders and ratings (marked "owner to confirm")
    3. Canadian order of battle
    4. German order of battle and garrisons
    5. Reserves
    6. Fire plan and artillery
    7. Weather
    8. Geometry (one row per feature group, with fit rms)
    9. Doctrine parameters
  - Estimates sort before sourced rows within each section, so the owner sees the uncertain values first.
  - `openQuestions` collects the "Open questions for the historian" sections from every `docs/research/vimy/*.md` file. The CLI passes that text in; `buildReview` stays pure.
  - `npm run sim -- review scenarios/vimy-1917/scenario.yaml --notes docs/research/vimy --out docs/research/vimy/review.md` writes Markdown:
    - a summary block of counts;
    - one table per section;
    - the open questions, numbered;
    - a closing checklist: "When every row is confirmed or corrected, change `status: draft` to `status: reviewed` in scenario.yaml".

- [ ] **Step 1: Write the failing tests**

```ts
it('counts value kinds and tiers, and lists estimates first in each section', () => {
  const r = buildReview(fixtureWithMixedValues());
  expect(r.counts).toMatchObject({ sourced: 3, estimates: 2, disputed: 1 });
  expect(r.sections[0].rows.map(x => x.kind)).toEqual(['estimate', 'sourced', 'disputed']);
});
it('marks leader ratings as owner-owned', () => {
  expect(buildReview(fixtureWithLeaders()).sections.find(s => s.title === 'Leaders and ratings')!.rows.every(r => /owner to confirm/.test(r.note ?? ''))).toBe(true);
});
it('renders Markdown with the status checklist', () => {
  expect(reviewToMarkdown(buildReview(fixtureWithMixedValues()), ['Was the 14th or 16th Bavarian Division in the north?'])).toMatch(/1\. Was the 14th or 16th Bavarian Division in the north\?[\s\S]*change `status: draft` to `status: reviewed`/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/scenario/src/review.test.ts packages/cli/src/review-md.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the code and generate `docs/research/vimy/review.md`**

- [ ] **Step 4: Run all tests, the e2e, and play the full scenario**

Run:

```bash
npm test
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm -w packages/app run e2e
npm run sim -- run scenarios/vimy-1917/scenario.yaml --seed 1 --out packages/app/public/runs/vimy.json
```

Then take a 1280×800 screenshot of `/?run=vimy` at Zero and at 12:00, and look at both:
- terrain shading;
- the trench system with craters, woods and villages;
- every division sector advancing behind its own barrage;
- German garrisons holding in red.

- [ ] **Step 5: Commit**

```bash
git add packages docs/research/vimy/review.md
git commit -m "feat(cli): owner review document for a scenario; Vimy review generated"
```

---

## Done when

- `npm test` and the e2e pass.
- `npm run sim -- review scenarios/vimy-1917/scenario.yaml --notes docs/research/vimy --out docs/research/vimy/review.md` writes a review in which:
  - every value is sourced, estimated or disputed;
  - no historical target cites a secondary or tertiary source.
- `/?run=vimy` plays the whole Canadian Corps attack on real terrain with real trench geometry, and the German garrisons in place.
- `scenario.yaml` still says `status: draft`. The review document is handed to the owner.

**Not in this plan:** fire, casualties, morale, the bombardment calculation, gap behind the barrage, dugouts, communications, leader effects, reserve movement, the command model (all Plan 3); calibration and the setup and compare screens (Plan 4); Messines (Plan 5).
