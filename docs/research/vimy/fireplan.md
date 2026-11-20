# Vimy research: the fire plan, the artillery park and counter-battery

This note covers `scenarios/vimy-1917/fireplan.yaml`: the barrage sector of each attacking division on 9 April 1917
(lift distance, minutes per lift and the pause at each objective line), the artillery that supported the Canadian Corps
by weapon and role, the counter-battery state at Zero, the indirect machine-gun barrage, and the standing barrages and
later fire plans, which are notes for Plan 3.

**Summary.** Four sectors, twelve legs: the 1st and 2nd Divisions' to the Black, Red, Blue and Brown Lines, the 3rd and
4th Divisions' to the Black and Red. Every leg lifts 100 yards (91.44 m). The barrage now reaches every line at the
corps timetable's minute: Black Zero+35 (6:05), Red Zero+95 (7:05), Blue Zero+320 (10:50), Brown Zero+468 (1:18 p.m.),
with the timetable's pauses: 40 minutes on the Black Line, 150 on the Red, 96 on the Blue. A seed-1 run of the scenario has
the barrage pausing and resuming at exactly those minutes. The artillery park is 23 allied entries summing to 1,372
pieces, and 2 German entries. The counter-battery state at Zero is disputed, 83-86%.

**Everything here is a draft for the owner and the historian.** The corps and divisional artillery orders (Canadian
Corps Artillery Instruction No. 1, the divisional barrage maps), the Counter-Battery Staff Officer's report and the
*Canadian Military History* articles on the fire plan and counter-battery could not be read (Open questions). The
timetable comes from the two official histories, which were written from those orders.

## Sources

| id | Tier | Used for |
|---|---|---|
| `nicholson-1962` | official | The timetable: 35 minutes to the Black Line, a 40-minute pause, 20 minutes to the Red, a pause of two and a half hours, 96 minutes on the Blue, 1:18 p.m. on the Brown (pp. 247-248); the heavy and field totals (p. 248); 100-yard lifts and standing barrages (p. 249); 212 guns, 83% located (p. 251); 983 guns and mortars, one gun to 25 yards, 3 minutes on the front trench, 100 yards every 3 minutes, 150 barrage machine guns (p. 253); the ninety-minute halt and the right-to-left lifts (p. 257); the 10 and 12 April attacks (pp. 261-263). |
| `boh-1917-1` | official | Falls, *Military Operations, France and Belgium, 1917*, vol. I: the timetable in Zero-plus minutes (p. 304); the Canadian Corps' and I Corps' heavy artillery piece by piece (p. 306 and notes); the field artillery and the silent forward batteries (p. 307); 86% of 212 battery positions located (p. 314); the creeping and standing barrages, howitzer lifts and the machine-gun barrage (p. 319 and notes); the counter-battery fire at Zero (p. 320); the 9.35 resumption and 5-minute lifts (pp. 333-334); the ninety minutes and the Brown Line lifts (p. 336); the 10 April barrage (p. 342); the Pimple and Bois en Hache fire plans (pp. 344-347); the German guns (p. 353). |
| `rca-ww1-history` | secondary | The Royal Regiment of Canadian Artillery's heritage page "The First World War 1914-18" (rca-arc.org, fetched 2026-11-20), its Vimy section: the Corps heavy artillery by battery (eighteen heavy, twenty-six medium, nine 60-pdr and two 6-inch gun batteries) in eight siege and three counter-battery groups; twenty 13-pdrs and twenty-four 9.45-inch mortars; "silenced 83%". Unsigned and without notes; it reads as drawn from Nicholson's *The Gunners of Canada*, which was not read. |

`.cache/sources/rca-ww1-history.html` is fetched by `scripts/fetch-sources.sh` (new in this task); the others were
cached by Tasks 6 and 9. The owner's brief (`vimy-brief-2026`) was used only as a lead: its "85% of 175 located" was
looked for and not found.

## Leg values

### How a leg runs, and why liftMin is an average

The engine moves a sector's barrage from one line to the next in `ceil(depth / liftM)` lifts of `liftMin` minutes,
the depth measured along x at the sector's middle on the digitized lines, then holds it `standOffM` beyond the line for
`pauseMin` (`packages/engine/src/barrage.ts`). A leg has one pause.

The real barrage had more structure than that. It opened on the German front trench for three minutes, then lifted 100
yards every three minutes (Nicholson p. 253; BOH p. 319), and it stood on intermediate trenches: the 38th Battalion
went on "after a pause of seventeen minutes" on the first trench (BOH p. 329); on the 2nd Division's front it paused 3
minutes on the Zwischen-Stellung at 9.55 and then crept "lifting 100 yards every five minutes" (BOH p. 334); and the
final barrage lifted "in successive lifts from right to left" (Nicholson p. 257). What the sources give exactly is the
timetable: when the barrage was to reach each line, and how long it paused there.

So each leg keeps the timetable's lift distance (100 yards) and pause, and its `liftMin` is the leg's timetable time
divided by the leg's lifts. The barrage then reaches each line at the timetable's minute. `liftMin` is an estimate, an
average over the leg; the guns' own rate is in each estimate's text. If the lines are re-digitized, the depths change
and `liftMin` should be recomputed the same way (depths from the frame's lines at `(yMin + yMax) / 2`).

### The timetable

| Line | Reached (timetable) | Source | Pause | Source |
|---|---|---|---|---|
| Black | Zero+35, 6:05 | Nicholson p. 247 ("allowed 35 minutes"); BOH p. 304 | 40 min | Nicholson p. 247; BOH pp. 304, 322 |
| Red | Zero+95, 7:05 | Nicholson pp. 247-248 ("A further period of twenty minutes", "by 7:05"); BOH p. 304 ("Zero plus 95 minutes") | 150 min (1st and 2nd Divisions); final for the 3rd and 4th | Nicholson p. 248; BOH p. 333 (resumed 9.35) |
| Blue | Zero+320, 10:50 | BOH p. 304 ("Zero plus 5 hours, 20 minutes") | 96 min | Nicholson p. 248 (90 in p. 257 and BOH p. 336: Conflicts) |
| Brown | Zero+468, 13:18 | Nicholson p. 248 ("by 1:18 p.m."); BOH p. 304 ("Zero plus 7 hours, 48 minutes") | final | — |

### The legs

Depths are ger-front (or the previous line) to the leg's line at the sector's middle, measured on the scenario's lines.

| Sector | Leg | Depth (m) | Lifts | Leg time (min) | liftMin | pauseMin |
|---|---|---|---|---|---|---|
| barrage-1cdn | black-1cdn | 567 | 7 | 35 | 5 | 40 |
| | red-1cdn | 539 | 6 | 20 | 3.333 | 150 |
| | blue-1cdn | 1,158 | 13 | 75 | 5.769 | 96 |
| | brown-1cdn | 1,230 | 14 | 52 | 3.714 | 0 |
| barrage-2cdn | black-2cdn | 404 | 5 | 35 | 7 | 40 |
| | red-2cdn | 555 | 7 | 20 | 2.857 | 150 |
| | blue-2cdn | 1,305 | 15 | 75 | 5 | 96 |
| | brown-2cdn | 179 | 2 | 52 | 26 | 0 |
| barrage-3cdn | black-3cdn | 437 | 5 | 35 | 7 | 40 |
| | red-3cdn | 437 | 5 | 20 | 4 | 0 |
| barrage-4cdn | black-4cdn | 517 | 6 | 35 | 5.833 | 40 |
| | red-4cdn | 343 | 4 | 20 | 5 | 0 |

Checks against the sources: the Blue leg's 5.0-5.8 minutes a lift is BOH's "every five minutes" (p. 334); the 1st
Division's Brown leg, 3.7, is BOH's half an hour for 800 yards (3.75, p. 336). The Black leg's 5-7 minutes is well
above the guns' 3 minutes because the leg starts at the German front trench, where the barrage opened, and the timetable
allowed 35 minutes to the Black Line all along the front, whatever its depth. The 2nd Division's Brown leg, 26 minutes a
lift over 179 m, is the right-to-left wheel: its left, where the distance "tapered off to nothing" (Nicholson p. 257),
waited for the right.

`pauseMin` 0 on a final line ends the barrage on arrival, as in the Plan 1 draft. `standOffM` stays 180 m (about 200
yards): no source read gives the protective barrage's distance beyond a line (Open questions).

**The 4th Division's later attacks are not in its sector.** The sector holds the 9 April timetable only. The 85th
Battalion's C and D Companies and the 46th's two companies attacked at Zero+750 on 9 April (Task 8, from `hayes-1920`)
with no artillery: the brigadier cancelled the ten-minute bombardment and the word did not reach them (BOH p. 341). On
10 April the 44th and 50th attacked the Hangstellung behind "a repetition" of the 9 April barrage, opened at 3 p.m.
(BOH p. 342). A sector has one timetable starting at Zero, so both are notes for Plan 3.

**Frontage.** Task 7's four sectors span 5,970 m against Nicholson's "front of 7000 yards" (6,400 m, p. 245). It bears
on one value: one creeping gun to 25 yards is 280 guns on 7,000 yards, 261 on 5,970 m. The barrage legs do not depend
on it (the engine spreads a sector's barrage over its y-range).

## The artillery park

Park total: 1372 (source: a sum of sourced parts; no source prints this figure — nicholson-1962 p. 253's 983 guns and mortars of the Canadian Corps, whose make-up here includes the 76-mortar remainder, an estimate, and its 150 barrage machine guns, plus boh-1917-1 pp. 306-307's 234 I Corps pieces and 5 First Army pieces, taken to be outside the 983)

| id | Weapon | Role | Count | How | Source |
|---|---|---|---|---|---|
| cdn-18pdr-creeping | 18-pdr | creeping | 320 (280-320) | disputed | BOH p. 319 n.1 (two-thirds of 480); Nicholson p. 253 (one gun to 25 yards × 7,000 yards) |
| cdn-18pdr-standing | 18-pdr | standing | 112 | estimate | 480 − 320 − 48 (BOH p. 319 n.1: the other third, less the silent forward batteries) |
| cdn-18pdr-forward | 18-pdr | creeping | 48 | estimate | nine batteries (BOH p. 307) × 5.3 guns (480 guns over 90 batteries, taking three 18-pdr batteries to each of the 30 brigades); with 6-gun batteries it would be 54, and 106 standing |
| cdn-45in-how | 4.5-in howitzer | standing | 138 | sourced | BOH p. 307; Nicholson p. 248 |
| cdn-13pdr | 13-pdr | standing | 20 | sourced (role estimate) | `rca-ww1-history` |
| cdn-60pdr | 60-pdr | counter-battery | 54 | sourced (role estimate) | BOH p. 306 n.1; `rca-ww1-history` (nine batteries) |
| cdn-6in-gun | 6-in gun | counter-battery | 8 | sourced (role estimate) | BOH p. 306 n.1; `rca-ww1-history` (two batteries) |
| cdn-6in-how | 6-in howitzer | heavy | 104 | sourced | BOH p. 306 n.1 |
| cdn-8in-how | 8-in howitzer | heavy | 36 | sourced | BOH p. 306 n.1 |
| cdn-92in-how | 9.2-in howitzer | heavy | 36 | sourced | BOH p. 306 n.1 |
| cdn-12in-how | 12-in howitzer | heavy | 4 | sourced | BOH p. 306 n.1 |
| cdn-15in-how | 15-in howitzer | heavy | 3 | sourced | BOH p. 306 n.1 |
| cdn-945in-tm | 9.45-in trench mortar | trench-mortar | 24 | sourced | `rca-ww1-history` |
| cdn-medium-tm | medium trench mortar | trench-mortar | 76 | estimate | 983 − 245 − 618 − 20 − 24 (Nicholson pp. 248, 253; `rca-ww1-history`) |
| cdn-mg-barrage | Vickers MG | mg-barrage | 150 | sourced | Nicholson p. 253; BOH p. 319 |
| i-corps-60pdr | 60-pdr | counter-battery | 60 | sourced (role estimate) | BOH p. 306 n.2 |
| i-corps-6in-how | 6-in howitzer | heavy | 48 | sourced | BOH p. 306 n.2 (40 + 8, as the OCR reads) |
| i-corps-8in-how | 8-in howitzer | heavy | 4 | sourced | BOH p. 306 n.2 |
| i-corps-92in-how | 9.2-in howitzer | heavy | 20 | sourced | BOH p. 306 n.2 |
| i-corps-18pdr | 18-pdr | standing | 66 | sourced (role estimate) | BOH p. 307 |
| i-corps-45in-how | 4.5-in howitzer | standing | 36 | sourced (role estimate) | BOH p. 307 |
| army-12in-how | 12-in howitzer | heavy | 4 | sourced | BOH p. 306 |
| army-12in-gun | 12-in gun | heavy | 1 | sourced | BOH p. 306 |
| ger-gruppe-vimy-heavy | heavy guns and howitzers | defensive | 89 | sourced | BOH p. 353 (79th Reserve and 1st Bavarian Reserve Divisions) |
| ger-gruppe-vimy-field | field guns and howitzers | defensive | 108 | sourced | BOH p. 353 |

By role (allied): creeping 368, standing 372, heavy 260, counter-battery 122, trench-mortar 100, mg-barrage 150; 1,372.
The Canadian Corps' pieces sum to Nicholson's 983 guns and mortars (245 heavy + 618 field + 20 13-pdr + 100 mortars);
with its 150 barrage machine guns it is 1,133.

**Roles.** The 18-pdr split is BOH's: two-thirds fired the creeping barrage, the remaining third (less the silent
forward batteries) "formed standing barrages on important sections of trench beyond the creeping barrage", the 4.5-inch
howitzers fired on strong points ahead of the creeper (p. 319 n.1). The nine forward 18-pdr batteries "take over the
creeping barrage for the final stage" (p. 307), so they are `creeping`. The heavy pieces are not split by task in the
sources read: the Canadian Corps had eight siege and three counter-battery groups (`rca-ww1-history`; BOH p. 306 n.1
lists nine groups, Nicholson p. 248 eleven: Conflicts), and the I Corps two bombardment and three counter-battery groups
(BOH p. 306 n.2). The long guns, the 60-pdrs and 6-inch guns, are taken as the counter-battery pieces and the howitzers
as `heavy`; that is an inference, and some howitzers certainly fired counter-battery (BOH p. 306 n.2 gives each I Corps
counter-battery group a 4.5-inch battery). The I Corps field guns' and the 13-pdrs' roles are not given; `standing`.

**What is not in the park.** The infantry's Stokes mortars (BOH p. 314 names them without a count); the 130 machine guns
with the assaulting brigades and the others of the Corps' 358 (Nicholson p. 253 n.; BOH p. 314 n.3); the Lewis guns;
the 30-cm naval guns before Hénin-Liétard and the 16th Bavarian Division's guns (BOH p. 353); the Third Army's XVII
Corps guns that fired on the right flank (BOH p. 313). Per-division allotments of the field artillery are not entered:
the sources give only the ten field brigades of the 1st and 2nd Divisions (BOH p. 318) and the V and XI Brigades R.F.A.
acting as the 4th Division's artillery (BOH p. 307 n.1).

## Counter-battery at Zero

`counterBattery.suppressedAtZeroFrac` is disputed, working value 0.83, range 0.83-0.86:

- Nicholson p. 251: "Of an estimated 212 guns opposite the Canadian Corps, 83 per cent were located by various means".
- BOH p. 314: "86 per cent. of the 212 active German battery positions on and behind the ridge had been correctly located".
- `rca-ww1-history`: the counter-battery fire "silenced 83% of the German guns".

Located is taken as suppressed at Zero: at Zero "all the German battery positions and ammunition dumps were bombarded
with high explosive and gas shell", gassed horses kept the batteries from moving or bringing up ammunition, and the
response to the S.O.S. rockets was "very feeble" (BOH p. 320); the counter-barrage fell "well behind the attacking
troops" (Nicholson p. 253). How fast the German guns recovered is Plan 3's to calibrate; BOH p. 333 n.2 says the German
barrage in the 1st Division's sector, "never heavy", ceased entirely only about 8.30 a.m.

## The machine-gun barrage

150 Vickers guns in 8-gun batteries kept up continuous fire 400 yards ahead of the infantry, "half of each group
covering the advance of the other half during the pauses at each objective" (BOH p. 319; Nicholson p. 253). The barrage
was organized by the Canadian Corps; 130 more guns stayed with the assaulting brigades under divisional control (BOH p.
319 n.2). During the 90-minute halt on the Blue Line the barrage batteries moved forward to a line along the
Roclincourt-Thélus road and the western slope of Hill 135 (BOH p. 336). Entered as `cdn-mg-barrage`, 150.

## Standing barrages and other fire (notes for Plan 3)

- **Standing barrages** by the other third of the 18-pdrs on "important sections of trench beyond the creeping barrage"
  (BOH p. 319 n.1); Nicholson p. 249: "a series of standing barrages would be established on known defensive systems by
  18-pounders and medium and heavy howitzers".
- **Howitzer lifts.** The 4.5-inch howitzers fired on selected strong points and lifted when the creeper came within 150
  yards; the heavy and medium howitzers lifted when it came within 300 yards (BOH p. 319 n.1).
- **Rates of fire.** Three rounds a gun a minute for the first three minutes, then two (Nicholson p. 253; BOH p. 319).
- **Smoke.** Stokes mortars laid smoke in front of Thélus and Hill 135 (Nicholson p. 253; BOH p. 320), and beyond the
  12th Brigade's left to blind the Pimple, which "completely blotted out the spur" until it cleared (BOH p. 329).
- **Gas.** The Special Brigade's 2,000 projectors did not fire on 9 April: the wind was too high (BOH p. 310).
- **The spared trench.** A German trench opposite the 87th Battalion was left unbombarded at the battalion's request
  (Nicholson p. 259; BOH p. 328): the "spared" stretch of the design spec.
- **The Brown Line barrage** was fired by the advanced batteries alone, the rear ones being out of range, lifting by
  sections from right to left and allowing the right battalion half an hour for 800 yards (BOH p. 336).
- **10 April, the Hangstellung.** The 9 April barrage on the Hangstellung "was repeated", opening at 3 p.m.; the 44th and
  50th entered the trench as it lifted (BOH p. 342; Nicholson p. 261: in position by 3:15).
- **12 April, the Pimple.** Heavy and medium howitzers of No. 4 (Double) Heavy Artillery Group and five I Corps siege
  batteries shelled communication trenches and rear lines in the night, intensified at 4.50 a.m.; 42 gas drums were
  fired into Givenchy from Livens projectors at 1 a.m.; at 5 a.m. 96 18-pdrs (72 of the Reserve Divisional Artillery,
  24 of the 24th Division) opened on 1,000 yards of front and crept in "lifts of one hundred yards every four minutes",
  while the infantry managed about 100 yards in fifteen (BOH pp. 344-345 and notes; Nicholson p. 263: "nearly a hundred
  field guns"). The 24th Division's Bois en Hache attack had 2 heavy-howitzer, 5 6-inch-howitzer and one 60-pdr
  batteries, 46 18-pdrs and 18 4.5-inch howitzers; the barrage opened at 5 a.m. and lifted at 5.10 (BOH pp. 347-348).

## Values entered

| Value | Source | Page | Quote (≤ 25 words) | Tier |
|---|---|---|---|---|
| liftM 91.44 (all legs) | `nicholson-1962` | 253 | "then lifted 100 yards every three minutes, slowing their rate of fire to two rounds per minute" | official |
| liftM, Blue legs | `boh-1917-1` | 334 | "Three minutes later it began to creep forward, lifting 100 yards every five minutes" | official |
| Black leg time, 35 min (liftMin estimates) | `nicholson-1962` | 247 | "They were allowed 35 minutes to gain the Black Line" | official |
| pauseMin 40, Black | `nicholson-1962` | 247 | "There would then be a 40-minute pause to allow the troops to re-form" | official |
| Red leg time, 20 min | `nicholson-1962` | 247 | "A further period of twenty minutes was allowed for reaching the Red Line" | official |
| Red at Zero+95 | `boh-1917-1` | 304 | "Both 3rd and 4th would now, at Zero plus 95 minutes according to the time-table, have reached their final objectives" | official |
| pauseMin 150, Red | `nicholson-1962` | 248 | "After a pause of two and a half hours on the Red Line they would advance some 1200 yards" | official |
| Blue leg start 9.35 | `boh-1917-1` | 333 | "On the stroke of 9.35 a.m., when the forward creep of the barrage was resumed" | official |
| Blue at Zero+320 | `boh-1917-1` | 304 | "was to be concluded at Zero plus 5 hours, 20 minutes" | official |
| pauseMin 96, Blue | `nicholson-1962` | 248 | "Finally, after a further halt of 96 minutes, the same brigades would carry the advance" | official |
| Brown at Zero+468 | `nicholson-1962` | 248 | "the whole of the eastern escarpment would be in Canadian hands by 1:18 p.m." | official |
| Brown leg, right battalion | `boh-1917-1` | 336 | "allowing half an hour for the right battalion to reach the first belt, an advance of 800 yards" | official |
| brown-2cdn liftMin (right-to-left) | `nicholson-1962` | 257 | "By firing their barrages in successive lifts from right to left" | official |
| pauseMin 0, final lines; standOffM 180 | estimate | — | (no source read gives them) | estimate |
| cdn-18pdr-creeping 320 | `boh-1917-1` | 319 n.1 | "The creeping barrage was fired by two-thirds of the 18-pdr. batteries, about one gun to 25 yards of frontage" | official |
| cdn-18pdr-creeping range 280 | `nicholson-1962` | 253 | "The main field artillery barrage was provided by one gun to every 25 yards of front" | official |
| cdn-18pdr-standing 112 | `boh-1917-1` | 319 n.1 | "The remaining third (less the silent forward batteries) formed standing barrages" | estimate |
| cdn-18pdr-forward 48 | `boh-1917-1` | 307 | "nine 18-pdr. and two 4.5-inch howitzer batteries were dug in by night" | estimate |
| 480 18-pdrs, 138 4.5-in | `boh-1917-1` | 307 | "It consisted of 30 brigades, containing 480 18-pdrs. and 138 4.5-inch howitzers" | official |
| cdn heavies by piece | `boh-1917-1` | 306 n.1 | "54 60-pdrs., 104 6-inch howitzers, 8 6-inch guns, 36 8-inch howitzers, 36 9.2-inch howitzers" | official |
| 245 heavies | `nicholson-1962` | 248 | "In all, 245 heavy guns and howitzers were concentrated for the operation" | official |
| cdn-13pdr 20; cdn-945in-tm 24 | `rca-ww1-history` | paragraphs on Vimy Ridge | "twenty 13 Pdrs (A & B Batteries RCHA with C and K Batteries RHA) ... twenty-four 9.45-inch trench mortars" | secondary |
| siege and CB groups | `rca-ww1-history` | paragraphs on Vimy Ridge | "which formed into eight Siege Groups and three Counter Battery Groups" | secondary |
| 983 guns and mortars (cdn-medium-tm 76) | `nicholson-1962` | 253 | "the thunderous roar of the 983 guns and mortars supporting the Canadians" | official / estimate |
| cdn-mg-barrage 150 | `nicholson-1962` | 253 | "the continuous fire of 150 machine-guns, creating a bullet-swept zone 400 yards ahead" | official |
| I Corps heavies by piece | `boh-1917-1` | 306 n.2 | "comprising 60 60-pdrs., 40 6-inch howitzers, 8 6-inch howitzers, 4 8-inch howitzers, and 20 9.2-inch howitzers" | official |
| I Corps field | `boh-1917-1` | 307 | "To these 618 pieces must be added 102 (66 18-pdrs. and 36 4.5-inch howitzers) of the I. Corps" | official |
| army-12in-how 4, army-12in-gun 1 | `boh-1917-1` | 306 | "Four 12-inch howitzers ... and a single 12-inch gun, were at the disposal of the Army" | official |
| German guns 89 heavy, 108 field | `boh-1917-1` | 353 | "disposed of 89 heavy and 108 field guns and howitzers" | official |
| counterBattery 0.83 | `nicholson-1962` | 251 | "Of an estimated 212 guns opposite the Canadian Corps, 83 per cent were located" | official |
| counterBattery 0.86 | `boh-1917-1` | 314 | "86 per cent. of the 212 active German battery positions on and behind the ridge had been correctly located" | official |
| counterBattery 0.83 | `rca-ww1-history` | paragraphs on Vimy Ridge | "The counter battery fire – 125,900 rounds in the week before 9 April – silenced 83% of the German guns" | secondary |

## Conflicts

- **The Blue Line halt: 96 or 90 minutes.** Nicholson's plan gives "a further halt of 96 minutes" (p. 248, from the
  Corps Report on Operations); his narrative says "After a halt of ninety minutes" (p. 257), and BOH "Ninety minutes had
  been allowed in the artillery time-table" (p. 336). Both fit the timetable's 10:50 on the Blue and 1:18 on the Brown
  (the Brown leg is 52 or 58 minutes). The working value is 96, the plan's figure; `pauseMin` is a single sourced value
  in the schema, so the 90 is in its note. (This is the spec's "length of the halt on the Blue Line" conflict.)
- **How many creeping guns: 320 or 280.** BOH's "two-thirds of the 18-pdr. batteries" is 320 of 480; its own "about one
  gun to 25 yards" and Nicholson's "one gun to every 25 yards of front" give 280 on 7,000 yards, 261 on Task 7's 5,970 m.
  Entered as disputed, working value 320, with the standing 18-pdrs as the remainder.
- **Black to Red, 400 or 700 yards.** BOH's plan has the 1st and 2nd Divisions make "a further advance of 400 yards"
  (p. 304) but its narrative puts the intermediate line "Seven hundred yards ahead" (p. 322), as Nicholson does (p. 255);
  the digitized lines are 539-555 m apart (Task 7's geometry.md already notes the 700). The leg uses the map.
- **Heavy groups: nine or eleven.** BOH lists nine heavy artillery groups with the Canadian Corps, two of them Canadian
  (p. 306 n.1); Nicholson has the 1st and 2nd Canadian Heavy Artillery Groups "in addition" to "nine British heavy
  groups" (p. 248); `rca-ww1-history` has eight siege and three counter-battery groups, eleven. The piece counts agree
  (245), so only the group structure is in doubt.
- **Counter-battery: guns or battery positions; located or silenced.** Nicholson: 83% of 212 guns located (p. 251); BOH:
  86% of 212 battery positions located (p. 314); `rca-ww1-history`: 83% silenced. Entered as disputed, 0.83-0.86.
- **The I Corps' "8 6-inch howitzers".** BOH p. 306 n.2 lists "40 6-inch howitzers, 8 6-inch howitzers"; the second is
  probably 6-inch guns (the Canadian Corps' list has "8 6-inch guns"). Entered together as 48 howitzers; the role would
  change if they were guns.

## Open questions for the historian

- **The divisional barrage maps and Canadian Corps Artillery Instruction No. 1** (35 pages, `rca-ww1-history`) would give
  each division's real lifts, the standing times on intermediate trenches and the protective barrage's distance and
  duration beyond each final objective (`standOffM`, the final `pauseMin`). None was found on the allowed hosts.
- **"85% of 175 located".** The plan's counter-battery dispute pairs Nicholson's 83% of 212 with "85% of 175 located",
  a figure from the owner's brief. No source read gives it. Candidates: McNaughton's "Counter Battery Work" (*Canadian
  Defence Quarterly*, 1926; Nicholson n.54), the C.B.S.O. report Nicholson cites (n.63), or Hogan (below).
- **Canadian Military History, on scholars.wlu.ca.** The issue pages load, and three relevant articles were identified:
  B. Hogan, "Operational Research and Counter-Battery Fires in the Canadian Corps, 1917-18" (CMH 32:2, 2023); A.
  Dieterich, "The German 79th Reserve Infantry Division in the Battle of Vimy Ridge, April 1917" (CMH 15:1, 2006); H.
  Herwig, "'The Battle-Fortune of Marshal Hindenburg is not Bound up with the Possession of a Hill': The Germans and
  Vimy Ridge, April 1917" (CMH 25:2, 2016). Their PDFs (`cgi/viewcontent.cgi`) and the site search return the
  Cloudflare challenge (HTTP 403, checked 2026-11-20 18:40 UTC), so they were not read and not worked around.
- **The RCA fire-plan essay** named in the owner's brief was not found on rca-arc.org (site search for "vimy", the
  Brooks essay pages, the heritage history page). The heritage page used here is a different, shorter text.
- **The heavy pieces by task.** Which pieces were in the counter-battery groups; the roles here are inferred from the
  weapon type.
- **Nicholson's 983.** What it counts: whether it includes the 13-pdrs, which mortars, and whether the I Corps pieces
  are outside it (they are taken to be). The medium-mortar count, 76, is the remainder and would change with it.
- **Battery size.** The silent forward batteries' guns (48) assume three 18-pdr batteries in each of the 30 field
  brigades.
