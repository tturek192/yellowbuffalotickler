# What-if overlays

An overlay is a short YAML file of changes to a scenario: "what if the Germans had twice the men?", "what if it had
rained for a week?". The simulator applies it to a copy of the scenario and runs that. The scenario's own files are never
touched, and every run record made with an overlay lists each value it changed (`whatIf.changes`), so playback, setup and
compare can label them.

```sh
npm run sim -- run scenarios/vimy-1917/scenario.yaml --seed 1 --out /tmp/x.json --overlay overlays/vimy-germans-x2.yaml
npm run sim -- batch scenarios/vimy-1917/scenario.yaml --runs 8 --workers 4 --overlay overlays/vimy-germans-x2.yaml
```

`--overlay` works with `run`, `batch`, `review` and `report`.

## The file

```yaml
id: vimy-germans-x2        # a short id for the overlay
title: Germans ×2          # how the screens and the record name it
scenarioId: vimy-1917      # the scenario it was written for: applied to another, it fails (exit 2)
notes: optional free text
ops:                       # the changes, applied in order
  - op: scale-men
    side: central
    factor: 2
```

`side` is `allied` or `central`. Ids (formations, companies, artillery, leaders, reserves) are the scenario's.

## How changed values are marked

- A sourced or disputed number an op changes becomes an estimate reading `what-if: <title> — <op>`. Its old value, with
  a disputed value's range and sources, is kept in the record's list of changes.
- A plain field (a force's doctrine, a formation's leader, a company's start) changes in place and is listed only in the
  changes.
- A weather timeline written in the overlay is a what-if too: each of its values becomes such an estimate, whatever
  source the overlay gives. A leader, formation or weather preset taken from the library keeps its own sources.

## The ops

**scale-men** `side?`, `formationId?`, `factor` (more than 0). Multiplies the men of every company of the side, or under
the formation (every company if neither is given), to a whole man and never below one. An off-map reserve the engine
makes companies up for (one listed with none) gets the factor as its `strengthFactor`, so those companies are scaled too.

**scale-guns** `side?`, `artilleryId?`, `factor` (0 or more). Multiplies the gun count of each artillery entry of the
side, or the one named, rounded to the nearest whole gun (a single gun halved stays one). 0 leaves no guns.

**scale-ammunition** `side?`, `artilleryId?`, `factor` (0 or more). Multiplies the artillery's rounds for the battle,
and the rounds those guns fire in the preliminary bombardment.

**remove-formation** `formationId`. Takes the formation, and everything under it, out of the battle, with what names
it: its off-map reserve entry, its planned operations, its liaison entries, and the artillery's link to it (the guns
stay). Historical casualty targets stay, marked "removed by what-if" on the compare screen.

**add-formation** `from`, `side`, `underFormationId`, `entryPoint` `[x, y]`, `distanceKm` (0 or more). Adds a division
as an off-map reserve that marches in like any other: from the formation library (`from: { libraryId: … }`) or as a copy
of one already in the scenario (`from: { formationId: <new id>, copyOf: <id> }`; the copy's units get ids starting with
the new id). Its companies are reserves. `underFormationId` only places it in the order of battle. A division cannot be
dropped straight into the attack.

**weather** `preset` or `timeline`. Replaces the scenario's weather: with a preset from the library, given in minutes
after Zero and placed by the scenario's Zero hour, or with a timeline of entries like the scenario's own. Every entry must
fall within the battle: from a day before Zero to the scenario's time limit.

**ground** `preset`: `dry`, `normal`, `wet` or `quagmire`. How wet the past day's weather leaves the ground: dry halves
it, wet doubles it, a quagmire quadruples it (capped at sodden). The factors are model numbers in
`tables/effects.yaml` (`groundDry` … `groundQuagmire`). A quagmire cannot wet a day that was dry.

**swap-leader** `formationId`, `leaderId`. Puts another leader in command of the formation: one of the scenario's, or
one from the leader library (added with its own sources).

**doctrine** `side`, `doctrineId`. Gives the side another doctrine (a file in `doctrine/`). It swaps the whole doctrine,
the side's company weapons included, until tactics packages arrive to swap tactics alone.

**reserve-distance** `formationId?`, `side?`, `km` (0 or more). Sets how far off the named off-map reserve stands, or
every reserve of the side (every reserve if neither is given).

**move** `unitId`, `by` `[dx, dy]`. Moves a company, or each company of a battalion, by that many metres along the
scenario map's x and y axes (its local frame). The setup screen's map writes this op.

## The library

`add-formation` with a `libraryId`, `swap-leader` with a leader the scenario lacks, and `weather` with a `preset` draw on
the library in `library/` (`--library-dir <dir>` reads another): leaders and divisions of 1917 from other sectors of the
Western Front, and five weather presets (`dry-spring`, `wet-spring`, `snow-and-sleet`, `fog-at-dawn`, `heavy-rain`).
Its research notes are in `docs/research/library/`. British and Dominion ids are plain (`lukin`, `bef-9div`), German
ones start with `de-` (`de-moser`, `de-54div`). `overlays/vimy-9th-division.yaml` adds one library division and swaps
in one library leader:

```sh
npm run sim -- run scenarios/vimy-1917/scenario.yaml --seed 1 --out /tmp/x.json --overlay overlays/vimy-9th-division.yaml
```

## When an overlay does not fit the scenario

- **A broken overlay fails before any run**, naming the op and its index: a `factor` or `km` out of range is rejected
  as the file is read; an overlay that leaves a side with no companies, a sector with no attacking companies, a weather
  entry outside the battle, or a reference that no longer checks is rejected as it is applied.
- **An op that no longer resolves** (a formation, unit, leader, artillery, library item, preset or doctrine renamed or
  removed since the overlay was written) is reported, never silently skipped. The command line stops with exit code 2
  and lists them; `--drop-unresolved` runs without them.
