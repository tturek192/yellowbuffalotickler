# Model tables

These files hold the numbers the combat model runs on: weapons, cover, communication channels and effect
rates. They are data, not code. Change a number here and the simulation changes; nothing in the engine
needs editing. (Behaviour parameters, such as how fast a unit advances or when it breaks, live in
`doctrine/*.yaml` instead.)

Every `tables/*.yaml` file is read and merged. A file may hold any of five sections: `sources`, `weapons`,
`cover`, `channels` and `effects`. Each entry may be defined in one file only; the loader names both files if
two define the same one.

## Every number is a `Param`

```yaml
captureRatio:
  value: 3
  estimate: why we think so          # or: source: <source id>, page: "12"
  description: Attackers to defenders needed to capture a segment.
  calibrated: true                   # only with an estimate
```

- `value` is the number.
- Exactly one of `source` (an id from the `sources` registry in `tables/sources.yaml`, with an optional `page`) or `estimate`
  (the reasoning, in words) says where it came from.
- `description` says in plain language what the number means. It is required, so you can read and edit
  the tables without the code.
- `calibrated: true` means the number is a model coefficient fitted to make the model behave well, not a
  fact looked up in a source. It is allowed only on an estimate, because a fitted number has no source.
  Calibrated numbers are adjusted together in a calibration pass, never one at a time to make a single
  battle come out right.

The research behind every number, with its sources, conflicts and open questions, is in
`docs/research/model/tables.md`.

## Sections

- `sources`: the registry every `source` id resolves in: title, author, year, url, tier and a note.
- `weapons`: one entry per weapon id (for example `18pdr`): `kind`, `rpm`, `maxRangeM`, `rangeScaleM`,
  `lethality`, `suppressPerRound` and, for guns, `shellKg`.
- `cover`: how much protection each posture (`moving`, `prone`, `in-trench`, `in-dugout`) gets on each
  kind of ground (`open`, `cratered`, `wood`, `village`, `trench`).
- `channels`: delay and failure rate of each way of passing a message (`buried-cable`, `surface-line`,
  `runner`, `visual`, `pigeon`, `power-buzzer`, `wireless`, `contact-patrol`).
- `effects`: every other rate and radius the model uses. All keys must be present.
