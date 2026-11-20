# Vimy research: the weather, 8-12 April 1917

This note covers `scenarios/vimy-1917/weather.yaml`: eleven entries from the evening of 8 April to the morning of 12
April, in time order. Each entry is a change the sources describe: the precipitation (none, rain, sleet or snow), the
wind's direction where they give it, and the visibility once, on 12 April.

**Summary.** A fine, clear evening on the 8th; snow and sleet on a north-west wind just before Zero on the 9th, the wind
backing west and the sleet turning to snow during the morning; a sunny break about 11 a.m.; sleet again early in the
afternoon and snow flurries on a westerly wind to the end of the day; a clear night. The 11th "deteriorated rapidly";
the 12th opened with a westerly gale, sleet and snow, visibility ten to fifteen yards, and cleared at daybreak.

**Everything here is a draft for the owner and the historian.** No war diary or meteorological record was read: the
entries come from the two official histories' narratives, which describe the weather as it bore on the fighting. The
times are where the narratives put the change; temperatures are never given as figures, so `tempC` is left out.

## Sources

| id | Tier | Used for |
|---|---|---|
| `nicholson-1962` | official | The night of 8 April and the storm before dawn (p. 252); the wind at the attackers' backs (p. 253); the wind turning and the snow (p. 255); the break in the clouds (p. 256); the afternoon sleet and evening snow (p. 257); 11 and 12 April (pp. 262-263). |
| `boh-1917-1` | official | The evening and night of 8-9 April (p. 318); the squalls before Zero (p. 319); the wind backing from north-west to west (p. 321); sleet turning to snow (p. 323); the sunlight on the ridge (p. 334); the night of 9-10 April (p. 342); intermittent rain and snow after the capture (p. 352); 12 April hour by hour (pp. 344-346). |
| `hussey-inman-1921` | secondary | A lead only: the morning of the 9th "blustering, with drizzle, and a few flakes of snow" (p. 153). Not entered. |

## Values entered

`at` is the entry's time; `windFromDeg` is the direction the wind blew from (north-west 315, west 270).

| at | Value | Source | Page | Quote (≤ 25 words) | Tier |
|---|---|---|---|---|---|
| 1917-04-08T21:00 | none | `boh-1917-1` | 318 | "After a fine, sunny day, the early part of the night was clear, with bright moonlight" | official |
| 1917-04-09T05:00 | sleet | `nicholson-1962` | 252 | "Shortly before dawn ... a driving north-west wind swept the countryside with snow and sleet" | official |
| 1917-04-09T05:00 | wind 315 | `nicholson-1962` | 252 | "a driving north-west wind" | official |
| 1917-04-09T06:45 | snow | `boh-1917-1` | 323 | "the rain and sleet now turning to snow, together with the smoke barrage blowing across from Thelus" | official |
| 1917-04-09T06:45 | wind 270 | `boh-1917-1` | 321 | "the wind which, backing from north-west to west, blew the sleet into the faces of the enemy" | official |
| 1917-04-09T11:00 | none | `nicholson-1962` | 256 | "there was an unexpected break in the stormclouds and spring sunshine flooded the air" | official |
| 1917-04-09T13:00 | sleet | `nicholson-1962` | 257 | "Early in the afternoon the sleet began again" | official |
| 1917-04-09T18:00 | snow, wind 270 | `nicholson-1962` | 257 | "the day closed with intermittent snow flurries driven before a gusty westerly breeze" | official |
| 1917-04-10T00:00 | none | `boh-1917-1` | 342 | "the sky cleared and the moon, not long past the full, gave light" | official |
| 1917-04-11T12:00 | snow | estimate | Nicholson p. 262; BOH p. 352 | "On 11 April the weather deteriorated rapidly" | estimate |
| 1917-04-12T01:45 | sleet, wind 270 | `nicholson-1962` | 262 | "a strong westerly gale was raging, driving sleet and snow towards the enemy's positions" | official |
| 1917-04-12T04:30 | snow, wind 270 | `boh-1917-1` | 344 | "about 4.30 a.m. snow began to fall, driven by a strong westerly wind" | official |
| 1917-04-12T04:30 | visibility 11 m | `boh-1917-1` | 345 | "Darkness and snow limited visibility to ten or fifteen yards" | official |
| 1917-04-12T06:00 | none | `boh-1917-1` | 346 | "With daylight the storm ceased and the sun rose into a clear sky" | official |

**The times taken.** 05:00 for "shortly before dawn" (BOH p. 319: the squalls came "With the approach of dawn" in the
hour and a half before Zero). 06:45 is when the 1st Division resumed its advance (Nicholson p. 255), the moment both
sources tie to the snow and the turned wind. 11:00 for the break as the 1st and 2nd Divisions neared the Blue Line,
which the 1st Brigade reached by 11.15 (BOH p. 334). 13:00 for "Early in the afternoon". 18:00 for the close of the
day. 00:00 on the 10th for the clear night. 12:00 on the 11th, a day without detail. 01:45 on the 12th, when the 10th
Brigade moved off (BOH p. 344), "in the early hours". 06:00 on the 12th for daylight; Nicholson p. 263 says "The sky
cleared at daybreak", after the 44th was on the Pimple "by six o'clock".

**Precipitation, one value.** The schema takes one kind at a time. "Snow and sleet" before Zero is entered as sleet, the
word both sources keep for the wet squalls (BOH: "squalls of snow and sleet drenched the men"); the 12th's early "sleet
and snow" likewise, before BOH's 4.30 snow.

**Visibility.** Only one figure is given: ten to fifteen yards at the Pimple (BOH p. 345), entered as 11 m (12.5 yards).
On 9 April the sources describe it in words only: the storm "prolonging the darkness beyond zero hour" (Nicholson p.
253), the ground lit "only by the glare of the barrage" (BOH p. 321), "snow and sleet combined to blot out landmarks"
(BOH p. 325); it was "now light enough" at 6.45 to see the next objective (Nicholson p. 255).

## Conflicts

- **The wind during the morning of 9 April.** BOH: "backing from north-west to west" (p. 321), entered as west from
  06:45. Nicholson: "The wind had turned, driving snow across the front and carrying smoke southward from Thelus" (p.
  255); smoke drifting south from Thélus over the 1st Division implies a wind with a northerly part. Both agree the wind
  was at the attackers' backs; the working value is BOH's west.
- **Snow or drizzle before Zero.** The official histories have snow and sleet; Hussey and Inman (secondary) have "drizzle,
  and a few flakes of snow" (p. 153), on the 2nd Division's front.

## Open questions for the historian

- **War diaries and meteorological records.** The brief asks for war diaries; none was read; the Canadian war diaries
  held by Library and Archives Canada (`recherche-collection-search.bac-lac.gc.ca`) were not searched for the weather research. A First Army or Canadian Corps
  meteorological section return would give temperatures, wind speeds and times.
- **10 April.** Neither source describes the weather by day on the 10th, so there is no entry between the clear night
  of the 9th-10th and the 11th.
- **11 April.** Only "deteriorated rapidly"; the snow entered for it is an estimate.
