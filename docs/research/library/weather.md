# Library research: weather presets

This note covers `library/weather-presets.yaml`: five weather timelines a what-if can put in place of a scenario's own
weather (`{ op: weather, preset: <id> }`; overlays/README.md). Each is a list of entries `afterMin` minutes after the
battle's Zero (negative: before it), which the op turns into dated entries for the scenario it is applied to.

**Summary.** `dry-spring`, `wet-spring`, `snow-and-sleet`, `fog-at-dawn` and `heavy-rain`, each of 16 entries spanning
five days: from the evening before Zero (afterMin -720) to the evening of the fourth day after it (6510). Each resembles
a documented stretch of weather on the Western Front in 1917. After the last entry the weather stays as it was, so on a
longer battle (Vimy's runs to Zero + 13050) the fifth day's evening holds to the end.

**Every value is an estimate.** No source gives the weather of a battle that was not fought in it; each value's
reasoning in the YAML names the day it resembles and quotes what the source says of it. The histories describe weather
as it bore on the fighting, in words: they give no temperatures, no wind speeds, and visibility in figures only once
(the Pimple, 12 April 1917). Where a source is silent the estimate says so: every `tempC` and every `visibilityM` is the
builder's (the snow squalls' scaled from the one figure), and so is every `windFromDeg` but the three the sources give.

## Sources

| id | Tier | Used for |
|---|---|---|
| `boh-1917-1` | official | Falls, 1917 vol. I: fine weather in mid-March (p. 140); Easter Sunday and 9 April at Arras, squalls of rain, sleet and snow on a westerly (p. 202); 10 April, squalls out of the south-west (p. 245); visibility in snow at the Pimple on 12 April (p. 345); 28 April, "a mild, bright day" (p. 413). |
| `boh-1917-3` | official | Miles, 1917 vol. III (Cambrai): "dull and misty" from 10 November (p. 36); foggy weather stopping air reconnaissance (p. 48); 20 November "dull and misty, with a light wind from the south-west" (p. 49). |
| `bean-1933-iv` | official | Bean, *The A.I.F. in France 1917*: drizzle at Noreuil on 20 March (p. 181) and Lagnicourt on 26 March (p. 192); the rain from 4 p.m. on 31 July 1917 (p. 710) and in early August (pp. 721-722). |

The weather values are estimates, so they cite no registered source (a citation would claim the value is the source's).
`bean-1933-iv` is therefore not in the library's registry; it is fetched by `scripts/fetch-sources.sh` with the others.
The Australian War Memorial's copy of Bean (`www.awm.gov.au`) was refused by this environment's network proxy; the
archive.org OCR text was read instead.

## The presets

| Preset | Resembles | What the source says (≤ 25 words a quote) |
|---|---|---|
| `dry-spring` | the advance to the Hindenburg Line, mid-March 1917; Arras, 28 April | BOH I p. 140: "It had been fine now for four days"; "an occasional foretaste of spring sunshine". p. 413: "The 28th April was a mild, bright day, though visibility was poor" |
| `wet-spring` | Noreuil, 20 March 1917; Lagnicourt, 26 March | Bean IV p. 181: "A cold rain was drizzling". p. 192: "The night was one of drizzling rain, and so dark". BOH I p. 140: "only two more really wet ones, the 26th and 29th" |
| `snow-and-sleet` | Arras and Vimy, 9-12 April 1917 | BOH I p. 202: "squalls of rain, sleet and snow, with a long and heavy snow-shower at night"; "the intervals between the showers were often bright and clear". p. 245: "violent squalls out of the south-west brought with them showers of snow or sleet" |
| `fog-at-dawn` | Cambrai, 10-20 November 1917 | BOH III p. 49: "broke dull and misty, with a light wind from the south-west". p. 48: "foggy weather made air reconnaissance out of the question" |
| `heavy-rain` | Ypres, 31 July-4 August 1917 | Bean IV p. 710: "At 4 o'clock rain, which all day had been threatening, began to fall steadily". pp. 721-722: "the rain continued to pour beyond all reasonable expectation" |

**The shape of each day.** Entries at dawn (Zero, 05:30 at Vimy), late morning (Zero + 330) and evening (Zero + 750),
and one on the evening before; the weather changes at those times and holds between them. The presets alternate their
days where the source describes a changeable spell (`wet-spring`: a wet day, then a day of showers; `snow-and-sleet`:
a day of westerly squalls with bright intervals, then a day of south-westerly squalls; `fog-at-dawn`: the dawn fog
thicker on alternate days), and repeat them where it describes a settled one (`dry-spring`, `heavy-rain`).

**Precipitation.** One kind at a time, as in the scenario schema: `none`, `rain`, `sleet` or `snow`. The snow preset
takes BOH's "squalls of rain, sleet and snow" as sleet at dawn and snow at night, its bright intervals as `none`.

**Wind.** The sources give a direction three times: "a high westerly wind" (BOH I p. 202), squalls "out of the
south-west" (p. 245), "a light wind from the south-west" (BOH III p. 49). Those presets take them (270, 225); the others
take a south-westerly or westerly as the builder's estimate, and say so.

**Visibility.** The one figure in the sources is BOH I p. 345, "ten or fifteen yards" in darkness and snow at the
Pimple; the snow preset's squalls in the half-light (200-300 m) and fog at dawn (100-150 m) are estimates from the
descriptions, not figures.

**Temperature.** No source read gives one. The builder's estimates: near freezing in the snow preset, cold dawns and
mild afternoons in the spring presets, a raw November in the fog preset, and summer warmth in the heavy-rain preset (it
resembles 31 July, not April).

## Values entered

### `dry-spring`

| afterMin | precipitation | wind from (°) | visibility (m) | temp (°C) |
|---|---|---|---|---|
| -720 | none | 240 | 10000 | 9 |
| 0 | none | 240 | 3000 | 3 |
| 330 | none | 230 | 12000 | 13 |
| 750 | none | 230 | 8000 | 8 |
| 1440 | none | 240 | 5000 | 3 |
| 1770 | none | 230 | 12000 | 13 |
| 2190 | none | 230 | 8000 | 8 |
| 2880 | none | 240 | 3000 | 3 |
| 3210 | none | 230 | 12000 | 13 |
| 3630 | none | 230 | 8000 | 8 |
| 4320 | none | 240 | 5000 | 3 |
| 4650 | none | 230 | 12000 | 13 |
| 5070 | none | 230 | 8000 | 8 |
| 5760 | none | 240 | 3000 | 3 |
| 6090 | none | 230 | 12000 | 13 |
| 6510 | none | 230 | 8000 | 8 |

### `wet-spring`

| afterMin | precipitation | wind from (°) | visibility (m) | temp (°C) |
|---|---|---|---|---|
| -720 | rain | 225 | 2000 | 7 |
| 0 | rain | 225 | 1500 | 5 |
| 330 | rain | 225 | 2000 | 9 |
| 750 | none | 240 | 6000 | 8 |
| 1440 | rain | 225 | 1200 | 5 |
| 1770 | none | 240 | 5000 | 10 |
| 2190 | rain | 225 | 1500 | 7 |
| 2880 | rain | 225 | 1500 | 5 |
| 3210 | rain | 225 | 2000 | 9 |
| 3630 | none | 240 | 6000 | 8 |
| 4320 | rain | 225 | 1200 | 5 |
| 4650 | none | 240 | 5000 | 10 |
| 5070 | rain | 225 | 1500 | 7 |
| 5760 | rain | 225 | 1500 | 5 |
| 6090 | rain | 225 | 2000 | 9 |
| 6510 | none | 240 | 6000 | 8 |

### `snow-and-sleet`

| afterMin | precipitation | wind from (°) | visibility (m) | temp (°C) |
|---|---|---|---|---|
| -720 | none | 270 | 8000 | 2 |
| 0 | sleet | 270 | 300 | 0 |
| 330 | none | 270 | 6000 | 4 |
| 750 | snow | 260 | 200 | 1 |
| 1440 | snow | 225 | 250 | -1 |
| 1770 | sleet | 225 | 800 | 3 |
| 2190 | none | 240 | 4000 | 1 |
| 2880 | sleet | 270 | 300 | 0 |
| 3210 | none | 270 | 6000 | 4 |
| 3630 | snow | 260 | 200 | 1 |
| 4320 | snow | 225 | 250 | -1 |
| 4650 | sleet | 225 | 800 | 3 |
| 5070 | none | 240 | 4000 | 1 |
| 5760 | sleet | 270 | 300 | 0 |
| 6090 | none | 270 | 6000 | 4 |
| 6510 | snow | 260 | 200 | 1 |

### `fog-at-dawn`

| afterMin | precipitation | wind from (°) | visibility (m) | temp (°C) |
|---|---|---|---|---|
| -720 | none | 225 | 2000 | 6 |
| 0 | none | 225 | 100 | 3 |
| 330 | none | 225 | 1500 | 7 |
| 750 | none | 225 | 600 | 5 |
| 1440 | none | 225 | 150 | 3 |
| 1770 | none | 225 | 1500 | 7 |
| 2190 | none | 225 | 600 | 5 |
| 2880 | none | 225 | 100 | 3 |
| 3210 | none | 225 | 1500 | 7 |
| 3630 | none | 225 | 600 | 5 |
| 4320 | none | 225 | 150 | 3 |
| 4650 | none | 225 | 1500 | 7 |
| 5070 | none | 225 | 600 | 5 |
| 5760 | none | 225 | 100 | 3 |
| 6090 | none | 225 | 1500 | 7 |
| 6510 | none | 225 | 600 | 5 |

### `heavy-rain`

| afterMin | precipitation | wind from (°) | visibility (m) | temp (°C) |
|---|---|---|---|---|
| -720 | none | 240 | 5000 | 15 |
| 0 | rain | 250 | 800 | 12 |
| 330 | rain | 250 | 1000 | 15 |
| 750 | rain | 250 | 800 | 13 |
| 1440 | rain | 250 | 800 | 12 |
| 1770 | rain | 250 | 1000 | 15 |
| 2190 | rain | 250 | 800 | 13 |
| 2880 | rain | 250 | 800 | 12 |
| 3210 | rain | 250 | 1000 | 15 |
| 3630 | rain | 250 | 800 | 13 |
| 4320 | rain | 250 | 800 | 12 |
| 4650 | rain | 250 | 1000 | 15 |
| 5070 | rain | 250 | 800 | 13 |
| 5760 | rain | 250 | 800 | 12 |
| 6090 | rain | 250 | 1000 | 15 |
| 6510 | rain | 250 | 800 | 13 |

## Conflicts

- **The season of `heavy-rain`.** It copies late July and August 1917, the only days the sources read describe as days
  of continuous heavy rain; its temperatures are summer ones. Applied to an April battle (Vimy), it is a summer storm in
  spring. A wet April spell would be `wet-spring`.
- **`snow-and-sleet` and Vimy's own weather.** The Vimy scenario's weather (`scenarios/vimy-1917/weather.yaml`) is
  sourced entry by entry from the same pages; this preset is a generic five-day version of the same kind of weather, for
  any battle. Applied to Vimy it replaces the sourced timeline with estimates.

## Open questions for the historian

- **Meteorological records.** The British meteorological section's daily returns for 1917 (temperature, wind speed and
  direction, visibility) and the German *Wetterdienst* reports would replace every estimate here with a figure. None was
  read; the presets rest on the official histories' descriptions alone.
- **A wet spring at Arras.** The sources read describe rain at Arras and Bullecourt in April and May 1917 only in
  passing; a day-by-day account (the Third Army's war diary, or the divisional histories' weather notes) would give
  `wet-spring` a day of its own front rather than the March days of the advance to the Hindenburg Line.
- **Fog at dawn in spring.** `fog-at-dawn` copies November at Cambrai. Whether dawn fog was common in Artois in April
  (as it was on 21 March 1918, outside 1917) is a question for the meteorological records.
