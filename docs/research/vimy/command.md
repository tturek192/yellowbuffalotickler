# Vimy research: command, communications, planned operations, the flanks and the end

This note covers `scenarios/vimy-1917/command.yaml`, the scenario's clock (`utcOffsetMin` in `scenario.yaml`) and the
changes Plan 3 made to two earlier files:

- which channels linked which headquarters on each side, and the artillery liaison;
- the written plan's contingent operations, and the improvised decisions kept out of the inputs;
- the off-map forces on the flanks: the XVII Corps' guns on the right, the 24th Division's attack across the Souchez;
- air control, and the share of artillery observation done from the air;
- the end conditions: the key ground and the lull;
- the deadlock's conditions, and the German gun line drawn for them (`geo/features.geojson`);
- the 85th and 46th Battalions' evening companies, no longer timetabled (`oob-canadian.yaml`, `historical.yaml`).

**Summary.** The scenario's clock is British time, GMT plus one hour: the army went onto Summer Time on 24 March 1917
(BOH p. 147 n.1). The Canadian Corps' written scheme (BOH appendices, App. 12) gives its communications level by
level: buried cable from brigades back, wireless at brigades, power buzzers and pigeons forward, contact aeroplanes
dropping messages at divisional headquarters. The battalions in the advance had no buried cable. The German forward
telephones were cut, and their reports went by runner and rocket. Three operations were planned in advance: the 10th
Brigade's attack on the Pimple, "on the night of Z/Z + 1" if the ridge had fallen (First Army Order No. 103), and the
occupation of Vimy and Willerval led by the British 5th Division (First Army's considerations of 28 March). No German
counter-attack plan was written in advance: the counter-attack divisions were told to be ready to relieve, not to
counter-attack (BOH p. 354). The evening attack of 9 April and the 10th Brigade's attack of 10 April on Hill 145 were
improvised, so they are targets, not inputs. The off-map forces are the XVII Corps' guns on Farbus Wood on 9 April and
the 24th Division's attack on the Bois en Hache on 12 April. The air was contested, and the share of artillery
observation done from the air is disputed, 0.75 to 0.86. The key ground is the crest's two heights, Hill 135 and Hill
145, and the Pimple. A run ends after a 48-hour lull.

**Everything here is a draft for the owner and the historian.** The divisional signal schemes, the brigade operation
orders and the German defence orders were not read (Open questions). The engine has no command model yet, so none of
this changes a run until Plan 3's command tasks read it.

## Sources

| id | Tier | Used for |
|---|---|---|
| `boh-1917-appendices` | official | Appendix 12, the Canadian Corps Scheme of Operations (undated): its communications (Section V, pp. 39-40) and aircraft (para. 11, p. 36) sections. Appendix 15, the First Army Artillery Plan (8 February): liaison (para. 6, p. 52) and the I Corps' counter-battery task after Zero (para. 7(f), p. 54). Appendix 25, 2nd Canadian Division Instructions No. 3 (24 March): signals (para. 17, pp. 88-89). Appendix 29, First Army's considerations of action after the attack (28 March, pp. 96-98). Appendix 42, First Army Order No. 103 (5 April, p. 136). Appendix 44, First Army Order No. 104 (9 April, pp. 144-146), issued during the battle. |
| `boh-1917-1` | official | The Army's Summer Time (p. 147 n.1); British time (p. 318 n.2); the communications (pp. 193, 310 and n.2); the counter-battery scheme and the flanks (pp. 312-314); the 9 April attack and the reports (pp. 318-342); the Northern Attack and the Bois en Hache (pp. 343-348); the German side (pp. 352-356); the XVII Corps' heavy artillery (p. 226) and the Canadian Corps' (p. 306 n.1). The German gun line: the Bois du Goulot, the casemates of Farbus Wood and the Bois de la Ville, the gun-pits (pp. 335-337). |
| `nicholson-1962` | official | The cable and subways (p. 250); the R.F.C. and the battery count (p. 251); German runners (p. 252); Zero at first light (p. 253); contact aeroplanes (p. 254); the reports of 9 April (pp. 254-258); the cavalry excluded from the scheme (p. 258); the 10th Brigade and the Pimple (pp. 261-263); the crest's two heights (p. 245); the German reserves (pp. 260, 267). The batteries overrun on the reverse slope and the field guns in the Bois de la Ville (p. 257). |
| `war-in-the-air-3` | official | New here: H. A. Jones, *The War in the Air*, vol. III (1931), the official air history. The air balance at Arras (p. 332), the squadrons with the First Army (pp. 332-333), the contact patrols of 9 April (p. 344), the artillery work that day (p. 345). Fetched by `scripts/fetch-sources.sh` (archive.org stream page). |
| `vimy-brief-2026` | secondary | The owner's brief, through the design spec (s. 13.10): "Air observers adjusted about 75% of counter-battery shoots". |
| `rca-ww1-history` | secondary | The Canadian Corps' heavy batteries by class ("nine 60 Pdr batteries", "two batteries of 6-inch Mark VII guns"), for the XVII Corps estimate. |
| `hayes-1920` | secondary | The 85th at Zero and its evening attack (pp. 49-53); German gun pits on the flat beyond Givenchy (p. 70). |
| `hussey-inman-1921` | secondary | The guns the British 13th Brigade took in the Bois du Goulot (p. 154). |

## The clock

`utcOffsetMin` is **60**, sourced. BOH p. 147 n.1, of March 1917: "Summer Time had come into use at midnight on the
24th." So on 9 April the army's clock was GMT plus one hour. The scenario's times are British time as the sources give
them; BOH converts German times to it ("2.30 a.m. (British time)", p. 318 n.2), and so does `historical.yaml`.

A check on the reading: Zero, 5:30, "had been set to coincide with first light" (Nicholson p. 253; BOH p. 321: "at the
first light of day"). By the NOAA sunrise equations at the frame origin (50.3794° N, 2.7736° E), civil dawn on 9 April
1917 is 04:35 UTC and sunrise 05:09 UTC: 05:35 and 06:09 on a GMT + 1 clock, 04:35 and 05:09 on GMT. On GMT, Zero
would have come 21 minutes after sunrise. On GMT + 1 it comes five minutes before civil dawn, which is first light.
Civil dusk on 9 April is 19:07 UTC, 20:07 on the scenario's clock (used below for the Pimple's "night of Z/Z + 1").

Nicholson does not say which clock he uses. His times fit BOH's: Zero at 5:30 in both, the 1st Division's Black Line
taken "by 6.5 a.m." (BOH p. 322) and reported "by 6:15" (Nicholson p. 254), the 10th Brigade's barrage on 10 April at 3
p.m. (BOH p. 342) and its battalions "in position" by 3:15 (Nicholson p. 261). They are taken to be the same British
time.

## Communications

A link names the sender's level and the receiver's. Reports go up and orders come down, so most pairs are entered both
ways. Some channels carry reports back only: pigeons, power buzzers and contact aeroplanes. The channels' delays and
failure rates are the model tables' (`tables/channels.yaml`, `docs/research/model/tables.md`), not repeated here.

| Side | From → to | Channels | Basis |
|---|---|---|---|
| allied | battalion → brigade | surface-line, runner, visual, power-buzzer | No buried cable: the corps' buried pairs "provides fully for Infantry Brigades to Divisions, Artillery Groups to Batteries, and Batteries to O.P.'s" (App. 12 p. 39), not battalions. Cable stored in the subways "to be run along the enemy's communication trenches after their capture" (BOH p. 310). Visual stations, and lamps by night (BOH p. 310). One power buzzer forward on each brigade frontage, working back to an amplifier at brigade (App. 12 pp. 39-40); on 9 April 16 buzzer messages, 8 received complete (BOH p. 310 n.2). Runners throughout. |
| allied | brigade → battalion | surface-line, runner, visual | As above, less the buzzer, which only sends back: an amplifier answers it by rocket (App. 12 p. 40). |
| allied | battalion → division | pigeon, contact-patrol | Pigeons homed to a loft for each division (App. 12 p. 40), and their messages went "by wire to Divisional Report Centre and thence to Brigade Report Centres" (App. 25 p. 89). Contact aeroplanes: messages "dropped at Advanced Divisional Headquarters" (App. 12 p. 36). |
| allied | battalion → corps | contact-patrol | A landing place west of Château de la Haie "to facilitate communication with Advanced Corps Headquarters" (App. 12 p. 36). |
| allied | brigade → division, division → brigade | buried-cable, wireless, runner | The buried pairs from brigades to divisions (App. 12 p. 39). "One trench set at each of the Brigades in the line", working back to two directing stations in touch with divisional headquarters (App. 12 p. 39). Despatch riders: motor cyclists and a troop of the Canadian Light Horse (App. 25 p. 89), entered as `runner`. |
| allied | division → corps, corps → division | buried-cable, wireless | The buried system along the whole corps front (App. 12 p. 39; BOH p. 310); the wireless control station at Mont-St-Éloi "in touch with the Corps Signals Exchange" (App. 12 p. 39). |
| allied | brigade ↔ group, group ↔ corps | surface-line, runner | The British 5th Division's 15th and 95th Brigades in corps reserve, bivouacked behind the front (`oob-canadian.md`). An estimate: no source read describes their links. |
| central | battalion → regiment | surface-line, runner, visual | "The destruction of most of the German telephone lines by shellfire meant that such reports had to be relayed by runner" (Nicholson p. 252); "messages by runner took so long" (BOH p. 318 n.2). Visual is an estimate: the rockets recorded were signals to the batteries (BOH pp. 320, 333 n.2), prearranged signals rather than messages, taken to be seen at the regiment too. Surface lines are entered because they existed; the engine cuts them by shelling. |
| central | regiment → battalion | surface-line, runner | As above, without the rockets. |
| central | regiment ↔ division | surface-line, runner | "all telephone cables leading forward, including one buried 6 ft. deep, had been broken" (a German field artillery regiment, BOH p. 333 n.2). Buried cable is not entered: one buried line is recorded, and it was broken. |
| central | division ↔ group, group ↔ army, division ↔ army | surface-line | An estimate: telephone behind the shelled zone. No source read describes the German rear links. The three counter-attack divisions stood directly under the army (`oob-german.yaml`), hence division ↔ army. |

**What a link cannot say.** The schema links levels, not companies: a company's report to its battalion has no level of
its own, so the battalion → brigade channels stand for the front too. A link holds for the whole run, but the Canadian
buried cable was pushed forward only "on the first night if possible" (App. 12 p. 39), and battalion headquarters
moved into captured German signal dug-outs "as soon as the situation permits" (App. 25 p. 88). The battalion levels'
channels are those of an advancing battalion all day.

**Liaison.** The First Army artillery plan put a heavy artillery group commander beside each attacking division's
commander: "He should live in the closest touch with the Divisional Commander on whose front he is working", and is
"responsible for the liaison work between the Heavy Artillery under his command and the Infantry" (App. 15 para. 6;
BOH p. 312: "a liaison much closer than usual between the heavy artillery headquarters and the infantry divisions").
Entered for 1cdn to 4cdn. Two things are not entered:

- **The machine-gun group commanders.** The corps scheme put them "at Battle Headquarters of their affiliated
  Brigades", connected to their batteries "by buried cable in the first phase" (App. 12 p. 34). These are machine-gun
  barrage groups, not artillery, and calls for fire go to the artillery.
- **Field artillery liaison at brigade or battalion.** Not found in the Vimy sources read. A brigade's "direct call on
  one battery through the Liaison Artillery Officer" is in the British 3rd Division's order for the Third Army (App. 41,
  para. 20), not the Canadian Corps'.

## Planned operations

| id | Formation | Target | Prerequisite | Not before | Plan |
|---|---|---|---|---|---|
| `10bde-pimple` | 10th Brigade (44th, 50th) | the-pimple | red-4cdn | 9 April 20:00 | First Army Order No. 103, 5 April (App. 42): "On the assumption that the attack on the Vimy Ridge reaches its objective on Z day", the Pimple and the Bois en Hache to be taken, "the attack to be carried out on the night of Z/Z + 1 days"; "Definite orders as to whether the attack is to take place or not will be issued from Army Headquarters on Z day". |
| `5bdiv-willerval` | British 5th Division (15th, 95th Brigades) | willerval | brown-1cdn | 12 April 18:00 (estimate) | First Army G.S. 529(a), 28 March (App. 29 para. 4), the methodical-withdrawal case: "When our heavy guns are brought up on the Vimy Ridge", "Canadian Corps — to attack the Pimple and occupy Vimy and Willerval"; "5th Division to be first employed in the advance east". |
| `5bdiv-vimy` | British 5th Division | vimy | brown-2cdn | — | The same appreciation, para. 6, the rapid-withdrawal case: if the enemy "withdrew without being able to hold the villages east of the ridge", the corps was "to seize Vimy and form a defensive flank facing north". |

**The Pimple.** The 10th Brigade was "originally destined to capture Hill 120" (BOH p. 343); the attack "was to have
followed within 24 hours of the 'Southern'" (p. 343), "provided the general situation on the afternoon of 9 April had
not required its employment elsewhere" (Nicholson p. 262). The prerequisite is the 4th Division's final objective,
`red-4cdn`, which takes in Hill 145's eastern slope: the Order's "reaches its objective on Z day". `notBefore` is the
start of the night of 9-10 April, 20:00, against a computed civil dusk of 20:07 (The clock). The operation's formation
is the 10th Brigade, whose battalions in the scenario are the 44th and 50th; its 46th and 47th sit under the 12th and
11th Brigades, with which they fought on 9 April (`oob-canadian.md`). On 12 April the attack was made by "the 44th,
50th and two companies of the 46th" (BOH p. 344).

**Vimy and Willerval.** These are the only exploitation found in a plan written before the battle. The appreciation has
two cases, and each operation models one:

- **Willerval: para. 4, the methodical withdrawal.** The occupation was to follow "When our heavy guns are brought up
  on the Vimy Ridge". Willerval appears only in this case, so `5bdiv-willerval` carries a `notBefore` for the heavy
  guns: **12 April 18:00, an estimate and a conservative one.** On the night of the 9th "None of the artillery was able
  to get further forward than the original British front trenches" (BOH p. 338); the roads needed "some days" to be
  "passable for heavy traffic" (BOH p. 349; Nicholson p. 263: "several days"). Three days from the evening of the 9th is
  the earliest reading of "some days": late enough that the 5th Division cannot be launched on Willerval on the
  afternoon of 9 April as a "planned" phase, but not a known date. On 14 April the Canadians were still firing captured
  German guns, "unable to get their own artillery forward" (Nicholson pp. 264-265), so the heavy guns may have been
  later still (Open questions). Historically Willerval was occupied by nightfall on 13 April, after the German
  withdrawal (BOH p. 350); that is a target, not this estimate's basis.
- **Vimy: para. 6, the rapid withdrawal.** If the enemy "withdrew without being able to hold the villages east of the
  ridge (Vimy — Willerval — Bailleul)", the corps was "to seize Vimy and form a defensive flank facing north" with no
  wait for the guns. That condition, the villages not held, is what the engine's force-ratio test measures, so
  `5bdiv-vimy` has no `notBefore`. Para. 4's Vimy (after the guns) is not entered separately.

The cavalry's role is not entered: the First Army's order
placing the 1st Cavalry Division under it was cancelled on 5 April (Nicholson p. 258), and "neither the First Army
artillery plan nor the Canadian Corps scheme made any allowance" for exploitation (BOH p. 333).

### What is not an operation

These were decided during the battle, so they are not inputs. They are what the engine's command model is checked
against (Targets).

- **The evening attack on Hill 145, 9 April.** "At 3.15 p.m. the divisional commander, hoping to force the Germans back
  from the near side of the hill before dark, sent forward ... two companies of the 85th" (BOH p. 341). Its brigadier
  changed the plan at the last minute, too late to reach the companies, which "started off across No Man's Land at 6.45
  p.m."; "two companies of the 46th Battalion, attached to the 12th Brigade, advanced on their left" (p. 341). Until
  Plan 3 this attack was scripted: the 85th's C and D and the 46th's A and B started at Zero + 750 (Changes to earlier
  data).
- **The 46th and 47th lent to the 12th and 11th Brigades** "shortly after midday" (BOH p. 341).
- **The 10th Brigade on Hill 145, 10 April.** "at 6:00 p.m. on 9 April General Watson called upon the 10th Brigade"
  to take the 11th Brigade's final objective (Nicholson p. 261); the barrage "opened at 3 p.m." on 10 April (BOH p.
  342). The plan foresaw that the brigade might be needed "elsewhere" (Nicholson p. 262) but named no task, so the
  engine's stall rule, which commits a reserve battalion to a stalled line, is what should produce it.
- **The Northern Attack's postponement.** "postponed for 48 hours" (BOH p. 343), to 5 a.m. on 12 April. The engine
  decides when `10bde-pimple` goes in.
- **The cavalry and the Willerval patrols.** Byng "had telephoned the First Army" at 2:40 p.m. asking for cavalry
  (Nicholson pp. 257-258); First Army Order No. 104 (9 April, App. 44) told the corps to "push out patrols towards
  Willerval and Vimy". Both were issued during the battle.
- **Every German counter-attack.** The 79th Reserve Division's order "At 11 a.m. on the 9th ... for an immediate
  counter-attack to recapture Hill 135" (BOH p. 354); the I./225th ordered to "recapture" Willerval after the cavalry
  patrols (p. 338 n.1); the I./14th Bavarian ordered at 6 p.m. to retake Hill 145's northern slope (p. 355); the Sixth
  Army's counter-attack through Farbus on 10 April, forbidden by Rupprecht (p. 355). Their times are in
  `historical.yaml` (`reserveArrivals`).

### The German side

No German operation is entered, because none was planned in advance. When the five counter-attack divisions were put at
von Falkenhausen's disposal on 3 April, "he informed them that they were to be 'ready to relieve the front divisions
during the course of a long-drawn-out defensive battle', and made no mention of the possibility of a counter-attack"
(BOH p. 354). He planned to bring them forward "in relief" "on the evening of the second day of the battle" (Nicholson
p. 267). The Sixth Army ignored "the requirement of Ludendorff's new doctrine to assemble its counter-attack divisions
close behind the Second Line" (Nicholson p. 267), and the front divisions' reconstruction on that doctrine "hardly got
beyond the paper stage" (BOH p. 353). The German side's counter-attacks come from the doctrine (`doctrine/de-1917.yaml`,
local and divisional counter-attack delays and ratios) and its off-map reserves (`oob-german.yaml`), not from a written
plan. The 16th Bavarian Division's planned gas attack on the 4th Division's front was postponed before the battle for
want of a favourable wind (Nicholson p. 259; BOH p. 311 n.2), so it is not an operation of the battle either.

## Off-map forces

**XVII Corps, on the right.** "Close co-operation was maintained with the artillery of the XVII. Corps, Third Army, on
the right ... for dealing with trench systems, woods, villages, and battery positions on the Canadian flanks" (BOH p.
313). Entered as fire on Farbus Wood, where the scenario's German field guns stand (`fireplan.yaml`), from Zero to the
plan's 1:18 p.m. on the Brown Line, when the Canadians reached the wood (Nicholson p. 248). The gun count is an
estimate. The XVII Corps' heavy artillery included "ten 60-pdr., and two 6-inch gun batteries" (BOH p. 226). At the
Canadian Corps' sizes (54 60-pdrs, BOH p. 306 n.1, in "nine 60 Pdr batteries", `rca-ww1-history`: six a battery; 8
6-inch guns in two batteries: four), that is 68 long guns. One-third of them, the share of its left division of three
(BOH p. 226: the 9th, 34th and 51st), is **23**, entered as 60-pdrs. That is an upper-end guess: the guns behind the 51st
Division served its own attack, and how many turned on Farbus Wood is not known. App. 29 para. 1 supports the target,
the XVII Corps "with its left on Farbus Wood".

**I Corps, on the left: not entered here.** The I Corps' 132 heavies and 102 field pieces that supported the Canadians
are already in the artillery park (`fireplan.yaml`: `i-corps-*`, BOH pp. 306-307), without positions. Entering their
fire again here would count it twice. App. 15 para. 7(f) gives their task after Zero: "the fullest possible use must be
made by the I Corps of the Divisional Artillery ... for neutralizing the hostile artillery" (Conflicts).

**The 24th Division's attack on the Bois en Hache, 12 April.** The Bois en Hache lies north of the Souchez, across the
valley from the Pimple (Nicholson p. 245: "the Bois en Hache across the Souchez"; BOH pp. 287-288: the two attacks "on either
side of the Souchez river"). The 73rd Brigade's assault, "simultaneous with that against the Pimple and Bois de
Givenchy spurs" (BOH p. 347), with a barrage at 5 a.m. (p. 347). Entered as an off-map attack on the Pimple's garrison,
05:00 to 08:00, the hour the 46th "could report the left flank secure" (Nicholson p. 263). `suppressFrac` is the
builder's **0.25**: the attack drew fire that would otherwise have met the 10th Brigade (the Leinster "were enfiladed by
machine-gun fire from south of the Souchez stream", BOH p. 348). No source measures it; it is for Plan 4 to calibrate.
The window is the day the attack was made, 12 April: the historical postponed date, after the Northern Attack was
"postponed for 48 hours" (BOH p. 343). The Order (App. 42) planned it for the same night as the Pimple's, the night of
Z/Z + 1. It is kept at 12 April by ruling, because spec 13.9 names "the 24th Division attacks the Pimple on 12 April"
and makes off-map forces scheduled, not decided; a scheduled attack cannot follow the engine's choice of time for
`10bde-pimple` (Conflicts; Open questions).

## Tanks

Added with the smaller mechanics (Plan 3 Task 14). "The plan of operations called for eight tanks to support the 2nd
Division's assault on Thelus and its subsequent objectives" (Nicholson p. 248); they were No. 12 Company of D Battalion,
four to support the 6th Canadian Brigade on Thelus, "two passing round either end of the village", and the other
section the British 13th Brigade, two of them along the intermediate line to Count's Wood (BOH p. 335 n.1). "No great
reliance could, however, be based upon their help owing to the dreadful condition of the ground" (BOH pp. 310-311).

Entered in `command.yaml` as eight tanks, `tank-6bde-1` to `-4` and `tank-13bde-1` to `-4`, all in the 2nd Division's
barrage sector (`barrage-2cdn`) making for its Blue Line (`blue-2cdn`), the Thelus and Hill 135 phase they were for
(BOH p. 335). The engine has them follow the sector's creeping barrage from Zero at no more than its pace.

- **Start points are estimates.** No source read gives them. Each stands on the Canadian front line (`cdn-front`), the
  6th Brigade's four spread across that brigade's frontage (y -2800, -2650, -2500, -2350; its companies lie between y
  -2920 and -2315 in `oob-canadian.yaml`) and the 13th Brigade's four across its own (y -2150, -2050, -1950, -1850;
  -2193 to -1830). Where the tanks really started (behind the front line, or in the assembly area) is an open question.
- **Their fate is a target, not an input.** The tanks "could not negotiate the heavily shelled ground and none got
  beyond the German support trenches" (Nicholson p. 248); they "had been unable to negotiate the gripless mud and the
  deep shell craters and were left behind early in the battle" (p. 254); "none of which succeeded in crossing No Man's
  Land" (BOH p. 335). Whether they bog, and where, comes from the model's `tankBogPerKm` and `tankBogMudFactor`
  (tables/effects.yaml), never from these.

## Air control

`superiority` is **contested**. "The Flying Corps was superior to the German air service along the active front
numerically, but inferior technically" (war-in-the-air-3 p. 332). Nicholson p. 251: the enemy, "Although outnumbered
on the Vimy-Arras front", "had the advantage in both speed and fire-power", but "Despite heavy losses the R.F.C.
continued its reconnaissance programme".

`observedFrac` is **disputed: 0.75, range 0.75 to 0.86.** The design spec's 0.75 of counter-battery shoots adjusted from
the air (s. 13.10) comes from the owner's brief, which does not name its source; it was not found in the sources read.
What the official histories give is the share of German batteries located by all means, the aircraft among them: "83
per cent were located by various means, including aerial observation" (Nicholson p. 251), and 86 per cent of 212
"correctly located" (BOH p. 314). On 9 April "The greater part of the air work for the artillery ... was concerned with
the locations of active enemy batteries" (war-in-the-air-3 p. 345), and the neutralizing fire after Zero was to be
"controlled by air and ground observers" (App. 15 para. 7(f)). The range runs from the brief's figure to BOH's located
share, and its two ends are not like for like: 0.75 is a share of counter-battery shoots adjusted from the air, 0.83 and
0.86 are shares of batteries located by every means, sound ranging and flash spotting among them. The upper end is
context for the brief's figure, not a second measurement of it. Snow limited the air on 9 April ("visibility was low", war-in-the-air-3 p. 344); the engine's visibility factor,
not this fraction, carries the weather.

## End conditions

**Key ground.** The spec names "the ridge crest, Hill 145 and the Pimple" (s. 12). Nicholson p. 245: "The crest of the
Ridge was formed by two heights, Hill 135 (measured in metres), immediately north of the village of Thelus, and Hill
145". The crest is entered as its two heights, the Plan 2 strongpoints `hill-135` and `hill-145`, with `the-pimple`.
No crest line is added to `features.geojson`: the feature kinds have no ridge, and a crest drawn as a trench or
strongpoint would be a new digitized feature standing for ground the two hills already define (Open questions).

**Lull.** **2880 minutes**, an estimate. The longest pause between attacks in the battle was from the 10th Brigade's
attack on Hill 145 (3 p.m. on 10 April, BOH p. 342) to the Pimple (5 a.m. on 12 April, BOH p. 345): about 38 hours,
because the Northern Attack was "postponed for 48 hours" (BOH p. 343). A shorter lull would end a run that follows the
historical course before the Pimple. 48 hours is the postponement itself.

**Time cap.** `timeLimitMinutes` is **13,050** (`scenario.yaml`), a simulation setting. Spec 12 wants "several times the
historical length". The battle ran from Zero, 05:30 on 9 April, to the ridge all taken about 08:00 on 12 April
(`historical.endedAt`'s working value, Nicholson p. 263): 4,350 minutes. Three times that is 13,050, to about 11:00 on
18 April. Until Plan 3 the cap was 1,440, one day, which left the lull, the 12 April off-map attack and the historical
end unreachable. Most runs should end sooner, on their objectives or on the lull. Plan 3's performance budget speaks of
a run ending "at most 12 April 23:59"; a run that stalls to the cap is longer than that (Conflicts).

## Deadlock

The deadlock section of `command.yaml` says when a run counts the deadlock as broken (the Deadlock design, Goal 1). It
is a definition, not a historical value, and nothing in the battle reads it. The first of four conditions to hold is
recorded, with its minute:

- **breakthrough:** a Canadian or British company stands beyond the German artillery line in a sector before any
  German off-map reserve has come into that sector;
- **surrender:** the German men taken prisoner reach `surrenderFrac` of the German men on the map, and of the reserves
  once they come on to it;
- **collapse:** in some sector, the German men fit to fight fall below `collapseFrac` of those there at Zero;
- **stronghold:** the Canadians hold every stronghold.

**Which conditions apply** is left to the default, all four; the scenario does not list them, and `defaultsUsed`
records the default. Which apply is the owner's to set.

**The thresholds.** `collapseFrac` is **0.1**, the owner's "fewer than 10% of the defending troops in the sector remain
fit to fight" (Deadlock design, Goal 1.3). `surrenderFrac` is **0.5**, an estimate: the design asks for "a sizeable
part of the defending force", and no source sets a number. Both are definitions for the owner.

**The stronghold** is **Hill 145**, named explicitly. Left to the default, the strongholds would be the three pieces
of `end.keyGround`: Hill 135, Hill 145 and the Pimple. The Pimple was taken only on 12 April.

**The artillery line.** `ger-gun-line` in `geo/features.geojson` is a German gun line drawn south to north through the
gun positions the sources place. It spans every sector's y-band, from y −4700 to 1500. **Map 7 does not mark German
batteries.** Its artillery symbols (divisional, medium and heavy batteries, super-heavy guns) are Canadian only, so the
line is drawn from the woods Map 7 does show (digitized, ±100 m) and from the text. The two German artillery entries in
`fireplan.yaml` are not used: they are two points standing for 197 pieces, about 1.2 km of y apart (bombardment.md,
Artillery). Stretch by stretch, south to north:

| Stretch | Points (x, y) | Basis | Kind |
|---|---|---|---|
| South of Farbus Wood | (2700, −4700) to (2691, −4219) | continued due south from the wood's south-west corner, so that the line reaches the 1st Division's southern edge | estimate |
| Farbus Wood and the Bois de la Ville | (2691, −4219) to (2815, −3467), along the woods' western (upper) edges | "the line of concrete casemates along the upper edges of Farbus Wood and the Bois de la Ville" (BOH p. 336); the gun-pits "followed the southeastern lie of the ridge" (p. 336); field guns "firing point-blank" in the Bois de la Ville (Nicholson p. 257) | sourced |
| The Bois de la Ville to the Bois du Goulot | (2815, −3467) to (2181, −2893) | a straight line between the two sourced stretches, about 250 m west of Farbus village. Nicholson p. 257 has the 1st Brigade overrunning "the German batteries" on the reverse slope above Farbus Wood, but places none between the woods | estimate |
| The Bois du Goulot | (2181, −2893) to (1769, −2230), along the wood's western (upper) edge | "the line of guns in the Bois du Goulot" (BOH p. 335); a gun-detachment "in one of the pits along the upper edge of the wood" (BOH p. 337); two 8-inch howitzers and three 5.9s, four 77s and a 90-mm gun taken there (`hussey-inman-1921` p. 154). Two 21-cm howitzers were also taken at the quarries "at the lower end" of the Bois de Bonval, just north (BOH p. 335) | sourced |
| The eastern foot of the ridge | (1769, −2230) to (1900, −500), by Petit Vimy and La Chaudière | no source read places German guns in front of the 3rd Division | estimate |
| East of Givenchy | (1900, −500) to (1800, 250), then north to (1800, 1500) | the 85th Battalion later occupied "the same old German gun pits" on "the flat beyond Givenchy near the Lens-Arras Road" (`hayes-1920` p. 70). Where on the flat they were is not given, so the line's place there is an estimate; north of Givenchy it is continued to cover the 4th Division's band | estimate (located by a source) |

**What this means for a run.** The sourced stretches lie just west of the Brown Line (`brown-1cdn`, `brown-2cdn`). A
run in which the 1st and 2nd Divisions take their final objectives on 9 April, as they did, puts companies beyond the
gun line there before any German reserve arrives. That is a breakthrough by this definition, and in the history the
guns were indeed overrun (Nicholson p. 257; BOH p. 337). In the 3rd and 4th Divisions' sectors the line stands 1.5 to
2 km beyond the final objectives, so a breakthrough there needs an advance the plan never ordered.

## Targets for the command model

These are what the engine's communications and command model are checked against. None is an input.

**Reports reaching higher headquarters** (spec 13.7: 40 to 120 minutes from the event to corps):

| Event | When it happened | When it was known, and where | Source |
|---|---|---|---|
| 1st and 2nd Divisions on the Black Line | 6:05 (BOH pp. 322-323) | "reported at the Black Line by 6:15" | Nicholson p. 254 |
| First objective reached, except the extreme left | by 6:05 | reported from the air "Between 6.0 and 6.30 a.m." | war-in-the-air-3 p. 344 |
| The 4th Division held short of Hill 145 | about 7:00 (BOH p. 329) | "At about nine o'clock" learned by the 3rd Division, which formed a defensive flank | Nicholson p. 256 |
| The 4th Division held short of Hill 145 | about 7:00 | "about noon it was definitely learned" in the 85th, in reserve | hayes-1920 p. 51 |
| The 11th Brigade's forward flanks | all day | "impossible to obtain information as to the whereabouts of the advanced flanks of the 11th Brigade" | BOH p. 340 |
| The Brown Line | 1:18 p.m. by the plan | its capture "seemed assured" when Byng telephoned the First Army at 2:40 | Nicholson p. 257 |
| The 85th's evening attack | started 6:45 p.m. | the report sent to battalion headquarters "less than an hour from the start of the attack" | hayes-1920 p. 53 |
| A German company sees the assembly | 2:30 a.m. | "messages by runner took so long to deliver that the information did not reach the German batteries until too late" | BOH p. 318 n.2 |
| The German infantry on the ridge | from 5:30 | at 8:30 a German field artillery regiment: "Nothing was yet known of the situation of the infantry on the ridge" | BOH p. 333 n.2 |
| The Canadian Light Horse at Willerval | 4:20 p.m. | reported as "a strong force of English cavalry", and a battalion ordered to recapture the village | BOH p. 338 n.1 |

**Decisions made during the battle**, with their times (What is not an operation): the 85th's two companies sent
forward at 3.15 p.m. and attacking at 6.45 p.m. on 9 April; the 46th and 47th lent shortly after midday; Watson's call
on the 10th Brigade at 6 p.m. and its attack at 3 p.m. on 10 April; the Pimple postponed 48 hours, to 5 a.m. on 12 April;
the German counter-attack orders at 11 a.m. and 6 p.m. on 9 April. The lines' capture times and the German reserves'
arrivals are in `historical.yaml`.

## Changes to earlier data

- **The evening attackers are no longer timetabled.** The 85th's C and D (`startAfterMin` 750, `hayes-1920` p. 52) and
  the 46th's A and B (750, an estimate) were assault companies aimed at `black-4cdn`. They are now `reserve` companies,
  with no sector, objective or start time, so the Plan 2 movement-only engine leaves them holding. They now stand
  where they were at Zero rather than where they formed up for the attack: the 85th's C and D 100 m in front of its A
  and B in the Music Hall Line (600 m west of the front; the battalion was "back in the Music Hall Line" until the
  afternoon, `hayes-1920` p. 51), the 46th's A and B 100 m in front of its C and D (700 m west; the battalion was in
  reserve with the 10th Brigade until "shortly after midday", BOH p. 341). Both are estimates, in `oob-canadian.md`.
- **The evening attack's time stays a target.** `historical.yaml` keeps 18:45 as the earliest the 4th Division's Black
  Line can fall: the 85th "started off across No Man's Land at 6.45 p.m." (BOH p. 341). A header comment there says why.
- **The Plan 2 test that pinned the 85th's start.** No Plan 2 test pinned it: `vimy-oob-canadian.test.ts` checks that
  every attacking company aims at a line in its own division, which no longer touches these companies. The new
  `vimy-command.test.ts` asserts that the four companies are `reserve` with no start time, and that no attacking company
  starts after Zero + 600.
- **The 10th Brigade's battalions.** The 44th, 46th, 47th and 50th are all reserve companies now; the test checks it.

## Values entered

| Value | Where | Source | Page / section | Quote (≤ 25 words) | Tier |
|---|---|---|---|---|---|
| `tanks` eight, 2nd Division | `command.yaml` | `nicholson-1962` | 248 | "The plan of operations called for eight tanks to support the 2nd Division's assault on Thelus" | official |
| `tanks` four with the 6th Brigade, four with the 13th | `command.yaml` | `boh-1917-1` | 335 n.1 | "four were to have supported the 6th Canadian Brigade in the attack on Thelus" | official |
| (target) the tanks' fate | — | `nicholson-1962` | 254 | "unable to negotiate the gripless mud and the deep shell craters and were left behind early" | official |
| `tanks[].start` | `command.yaml` | estimate | — | on the Canadian front line across each brigade's frontage | — |
| `utcOffsetMin` 60 | `scenario.yaml` | `boh-1917-1` | 147 n.1 | "Summer Time had come into use at midnight on the 24th." | official |
| (check) British time | `scenario.yaml` | `boh-1917-1` | 318 n.2 | "reported at 2.30 a.m. (British time) that the assembly trenches were filling up" | official |
| (check) Zero at first light | `scenario.yaml` | `nicholson-1962` | 253 | "zero hour, which had been set to coincide with first light" | official |
| links: no buried cable below brigade | `command.yaml` | `boh-1917-appendices` | App. 12, p. 39 | "provides fully for Infantry Brigades to Divisions, Artillery Groups to Batteries, and Batteries to O.P.'s" | official |
| links: cable forward on the surface | `command.yaml` | `boh-1917-1` | 310 | "cable was stored in the subways to be run along the enemy's communication trenches after their capture" | official |
| links: visual | `command.yaml` | `boh-1917-1` | 310 | "Many of the forward artillery observers were able to use visual signalling direct to their batteries." | official |
| links: power buzzer | `command.yaml` | `boh-1917-appendices` | App. 12, p. 39 | "One Power Buzzer will go forward on each Brigade frontage with Infantry" | official |
| links: power buzzer on the day | `command.yaml` | `boh-1917-1` | 310 n.2 | "Sixteen messages were sent on the day of the assault, of which 8 were received complete and 6 incomplete." | official |
| links: pigeons | `command.yaml` | `boh-1917-appendices` | App. 25, p. 89 | "the messages will be transmitted by wire to Divisional Report Centre and thence to Brigade Report Centres" | official |
| links: pigeons on the day | `command.yaml` | `boh-1917-1` | 310 n.2 | "Owing to the excellence of alternative means of communication only 12 pigeons were flown on that day." | official |
| links: contact aeroplanes | `command.yaml` | `boh-1917-appendices` | App. 12, p. 36 | "Messages will be dropped at Advanced Divisional Headquarters" | official |
| links: contact aeroplanes on the day | `command.yaml` | `war-in-the-air-3` | 344 | "call for flares a few minutes after the time allowed for the capture of each line" | official |
| links: wireless at brigades | `command.yaml` | `boh-1917-appendices` | App. 12, p. 39 | "It is proposed to put one trench set at each of the Brigades in the line" | official |
| links: the buried system | `command.yaml` | `nicholson-1962` | 250 | "twenty-one miles of cable, burying it seven feet deep to withstand enemy shelling, and sixtysix miles of unburied wire" | official |
| links: German runners | `command.yaml` | `nicholson-1962` | 252 | "The destruction of most of the German telephone lines by shellfire meant that such reports had to be relayed by runner" | official |
| links: German rockets | `command.yaml` | `boh-1917-1` | 320 | "there was only a very feeble response to the rocket signals from the front line" | official |
| links: German cables broken | `command.yaml` | `boh-1917-1` | 333 n.2 | "all telephone cables leading forward, including one buried 6 ft. deep, had been broken" | official |
| links: the 5th Division's, the German rear | `command.yaml` | estimate | — | (no source read describes them) | estimate |
| `liaison` 1cdn-4cdn | `command.yaml` | `boh-1917-appendices` | App. 15, para. 6 | "He should live in the closest touch with the Divisional Commander on whose front he is working" | official |
| `liaison` (support) | `command.yaml` | `boh-1917-1` | 312 | "a liaison much closer than usual between the heavy artillery headquarters and the infantry divisions" | official |
| `10bde-pimple` plan | `command.yaml` | `boh-1917-appendices` | App. 42, paras. 1, 4 | "the attack to be carried out on the night of Z/Z + 1 days" | official |
| `10bde-pimple` prerequisite | `command.yaml` | `boh-1917-appendices` | App. 42 | "On the assumption that the attack on the Vimy Ridge reaches its objective on Z day" | official |
| `10bde-pimple` formation | `command.yaml` | `boh-1917-1` | 343 | "the 10th Canadian Brigade, originally destined to capture Hill 120" | official |
| `10bde-pimple` notBefore 20:00 | `command.yaml` | estimate | The clock | (civil dusk 20:07 by the NOAA equations) | estimate |
| `5bdiv-willerval` plan | `command.yaml` | `boh-1917-appendices` | App. 29, para. 4 | "When our heavy guns are brought up on the Vimy Ridge" | official |
| `5bdiv-willerval` notBefore 12 April 18:00 | `command.yaml` | estimate (`boh-1917-1` p. 349) | 349 | "some days would be needed to make them passable for heavy traffic" | estimate |
| `5bdiv-vimy` plan | `command.yaml` | `boh-1917-appendices` | App. 29, para. 6 | "to seize Vimy and form a defensive flank facing north" | official |
| `timeLimitMinutes` 13,050 | `scenario.yaml` | estimate (spec 12) | — | "several times the historical length" | estimate |
| `5bdiv-*` formation | `command.yaml` | `boh-1917-appendices` | App. 29, para. 4 | "5th Division to be first employed in the advance east" | official |
| `xvii-corps-right-flank` cite | `command.yaml` | `boh-1917-1` | 313 | "for dealing with trench systems, woods, villages, and battery positions on the Canadian flanks" | official |
| `xvii-corps-right-flank` guns 23 | `command.yaml` | estimate (`boh-1917-1` p. 226) | 226 | "ten 60-pdr., and two 6-inch gun batteries" | estimate |
| `xvii-corps-right-flank` window end 13:18 | `command.yaml` | `nicholson-1962` | 248 | "the whole of the eastern escarpment would be in Canadian hands by 1:18 p.m." | official |
| `24div-bois-en-hache` cite | `command.yaml` | `boh-1917-1` | 347 | "The assault, simultaneous with that against the Pimple and Bois de Givenchy spurs, was to be delivered by two battalions of the 73rd Brigade" | official |
| `24div-bois-en-hache` suppressFrac 0.25 | `command.yaml` | estimate (`boh-1917-1` p. 348) | 348 | "enfiladed by machine-gun fire from south of the Souchez stream" | estimate |
| `air.superiority` contested | `command.yaml` | `war-in-the-air-3` | 332 | "superior to the German air service along the active front numerically, but inferior technically" | official |
| `air.observedFrac` 0.75 | `command.yaml` | `vimy-brief-2026` | via the design spec, s. 13.10 | "Air observers adjusted about 75% of counter-battery shoots" | secondary |
| `air.observedFrac` range | `command.yaml` | `nicholson-1962` | 251 | "83 per cent were located by various means, including aerial observation" | official |
| `air.observedFrac` range 0.86 | `command.yaml` | `boh-1917-1` | 314 | "86 per cent. of the 212 active German battery positions on and behind the ridge had been correctly located" | official |
| `end.keyGround` crest | `command.yaml` | `nicholson-1962` | 245 | "The crest of the Ridge was formed by two heights, Hill 135 (measured in metres), immediately north of the village of Thelus, and Hill 145" | official |
| `end.lullMin` 2880 | `command.yaml` | estimate (`boh-1917-1` p. 343) | 343 | "the northern attack was postponed for 48 hours" | estimate |
| 85th C, D and 46th A, B reserve | `oob-canadian.yaml` | `boh-1917-1` | 341 | "hoping to force the Germans back from the near side of the hill before dark, sent forward ... two companies of the 85th" | official |
| black-4cdn earliest 18:45 kept | `historical.yaml` | `boh-1917-1` | 341 | "Despite the absence of artillery fire, they started off across No Man's Land at 6.45 p.m." | official |
| `deadlock.collapseFrac` 0.1 | `command.yaml` | estimate (the owner) | Deadlock design, Goal 1.3 | "fewer than 10% of the defending troops in the sector remain fit to fight" | estimate |
| `deadlock.surrenderFrac` 0.5 | `command.yaml` | estimate | Deadlock design, Goal 1.2 | "a sizeable part of the defending force surrenders" | estimate |
| `ger-gun-line`, Farbus Wood and the Bois de la Ville | `geo/features.geojson` | `boh-1917-1` | 336 | "the line of concrete casemates along the upper edges of Farbus Wood and the Bois de la Ville" | official |
| `ger-gun-line`, the Bois de la Ville | `geo/features.geojson` | `nicholson-1962` | 257 | "resisted by the enemy in the Bois de la Ville both with machine-guns and with field guns firing point-blank" | official |
| `ger-gun-line`, the Bois du Goulot | `geo/features.geojson` | `boh-1917-1` | 335 | "capturing from the north flank the line of guns in the Bois du Goulot" | official |
| `ger-gun-line`, the Bois du Goulot's upper edge | `geo/features.geojson` | `boh-1917-1` | 337 | "a gun-detachment in one of the pits along the upper edge of the wood fired point-blank" | official |
| `ger-gun-line`, the Bois du Goulot's guns | `geo/features.geojson` | `hussey-inman-1921` | 154 | "down through Goulot Wood, the K.O.S.B. capturing two 8-inch howitzers" | secondary |
| `ger-gun-line`, east of Givenchy | `geo/features.geojson` | `hayes-1920` | 70 | "the flat beyond Givenchy near the Lens-Arras Road; the same old German gun pits" | secondary |

## Conflicts

- **How far the tanks got.** Nicholson p. 248: "none got beyond the German support trenches"; BOH p. 335: "none of which
  succeeded in crossing No Man's Land". Both are kept as the validation target's range: no tank past the German support
  trenches, and perhaps none past the German front line.

- **The time of the 85th's attack** (spec 13.14). The 85th's history: "zero hour having been fixed for six o'clock"
  (`hayes-1920` p. 52). BOH: the companies "started off across No Man's Land at 6.45 p.m." (p. 341). Nicholson: "Late
  that afternoon" and "Before dark" (pp. 260-261). Until Plan 3 the scenario timed the attack by Hayes's six o'clock; the
  target is BOH's 18:45, because a historical target may cite only official, primary or scholarly sources. Hayes's
  zero may have been the time first set, before the brigadier's change of plan (BOH p. 341).
- **When the BEF's Summer Time began.** The brief that set this research says British Summer Time began on 8 April
  1917, under the Summer Time Act's 1917 order. BOH p. 147 n.1 puts the army's change at midnight on 24 March. The
  English Wikipedia articles read (British Summer Time, revision 1385748423; Time in the United Kingdom, revision
  1383361517) give the 1916 dates but not 1917's. Either date puts 9 April on GMT + 1, so the value is not affected.
- **The Pimple's planned date.** The Order put the attack on the night of 9-10 April (App. 42), BOH "within 24 hours"
  (p. 343); it was made on 12 April. The operation carries the plan; the off-map attack on the Bois en Hache carries
  the day it was made, because a scheduled attack cannot follow the operation's timing. If the engine sends
  `10bde-pimple` in on the night of 9-10 April, the 24th Division's attack still comes on 12 April. **A known
  compromise, kept by ruling:** the 12 April window is an input that took its date from an improvised decision, the
  48-hour postponement (BOH p. 343), which is itself listed above as not an operation. The spec names the 12 April
  attack and makes off-map forces scheduled (s. 13.9). The alternative, the Order's planned night (9 April 20:00 to
  10 April 05:30), would keep every scheduled input a planned time, but fits the engine no better.
- **The time cap and the performance budget.** Plan 3's budget expects a full Vimy run to end "at most 12 April 23:59";
  the cap is now 13,050 minutes, to 18 April, three times the historical length as spec 12 asks. A run that stalls
  until the cap runs longer than the budget's horizon.
- **The 46th and 47th: planned attachment or midday decision.** Nicholson p. 259 presents the attachment as the plan:
  "Each brigade was strengthened by the addition of a battalion of the 10th Brigade (respectively the 47th and 46th
  Battalions)". BOH p. 341 has them "placed at the disposal" of the 12th and 11th Brigades "shortly after midday". The
  order of battle follows Nicholson and has them under those brigades from Zero; the midday decision is listed above as
  improvised on BOH's account.
- **The German battalions' visual channel.** The rockets recorded were signals to the batteries (BOH p. 320), not a
  report path to the regiment. `visual` on the battalion → regiment link is an estimate that they were seen there too.
- **The 10th Brigade's second phase.** The brief for this research called the 10th Brigade's planned phase "the Pimple
  and the east slope of Hill 145, rescheduled to 10 April". The sources' written plan has only the Pimple; the east
  slope was the 11th Brigade's objective, given to the 10th Brigade at 6 p.m. on 9 April (Nicholson p. 261; BOH p.
  342). So the operation is the Pimple's, and the attack of 10 April is a target.
- **North or south of the Souchez.** The brief described the 24th Division's attack as south of the Souchez. The Bois
  en Hache is north of it, on the Lorette spur (Nicholson p. 245; BOH pp. 287-288, 347). The Pimple is south of it.
- **The I Corps guns, on-map or off-map.** The spec (s. 13.9) has the I Corps' artillery as scheduled off-map fire;
  Plan 3's bombardment research put the I Corps pieces that supported the Canadians in the artillery park, without
  positions (`fireplan.yaml`, BOH pp. 306-307). Kept there and not repeated here, so they are counted once.
- **An appreciation or a plan.** First Army's considerations of 28 March are an appreciation of "probable action", and
  the corps scheme treated Vimy as "a limited objective" (Nicholson p. 258). The Vimy and Willerval operations come from
  the appreciation, not the corps' orders.
- **The 4th Division's attack in the planning document.** The appreciation expected the 4th Division "south of
  Givenchy, with probably one fresh brigade" on the evening of the battle (App. 29 para. 1): the 10th Brigade, fresh
  for the Pimple. Consistent with the Order.

## Open questions for the historian

- **The German gun line.** Where did the field and heavy batteries of the 79th Reserve and 1st Bavarian Reserve
  Divisions stand on 9 April, battery by battery or by group? The deadlock's artillery line is sourced only through
  Farbus Wood, the Bois de la Ville and the Bois du Goulot; in front of the 3rd and 4th Divisions it is an estimate
  along the ridge's eastern foot and on the flat east of Givenchy. The German regimental histories of the field
  artillery, or the Canadian Corps' counter-battery maps of located positions, would say.
- **The deadlock thresholds (for the owner).** Is half the German force taken prisoner the right reading of "a sizeable
  part"? Should the stronghold be Hill 145 alone, or the crest's two heights and the Pimple (`end.keyGround`)?
- **Where the tanks started.** Where did No. 12 Company, D Battalion, lie up and start from on 9 April: on the
  Canadian front line, as entered, or farther back? When were they to start, and by which routes? D Battalion's war
  diary or Watson's *A Company of Tanks* would say.
- **The divisions' signal schemes.** The corps scheme says each division worked out its own visual system, and the 1st,
  3rd and 4th Divisions' instructions were not read (only the 2nd's, in BOH's appendices). Did battalion headquarters
  reach the buried cable during 9 April, and how fast did reports from battalions reach brigade?
- **Field artillery liaison.** Did the Canadian brigades and battalions have artillery liaison officers at Vimy, and
  did a brigade have a direct call on its supporting batteries, as the British 3rd Division's brigades had?
- **The German links.** How did the 79th Reserve and 1st Bavarian Reserve Divisions' regiments report to their
  divisions, and the divisions to Gruppe Vimy, on 9 April? Was there buried cable below division?
- **The German defence orders.** Did Gruppe Vimy or its divisions issue standing counter-attack orders for the
  regiments' support and resting battalions (the Gegenstoss of the 1916 defensive principles)? If so, they are
  planned operations that this note does not have.
- **The 75 per cent.** What is the source of the brief's "about 75% of counter-battery shoots" adjusted from the air?
  The Canadian Corps' counter-battery records, or an article in *Canadian Military History* (`scholars.wlu.ca`, which
  serves a challenge page, so it was not read)?
- **The XVII Corps' guns on the flank.** How many XVII Corps guns fired on the Canadian right on 9 April, and on what?
- **The I Corps' artillery after Zero.** Which I Corps batteries neutralized the hostile artillery north of the
  Canadian front after Zero, and should they stand off the map rather than in the Canadian artillery park?
- **The crest as key ground.** Is holding Hill 135 and Hill 145 a fair test of holding the crest, or should a crest line
  (for example along La Folie Farm between them) be digitized?
- **The 5th Division's role.** Were the British 15th and 95th Brigades ever ordered to prepare for Vimy and Willerval
  before the battle, beyond First Army's appreciation?
- **When the heavy guns were up on the ridge.** When did the first Canadian Corps heavy batteries come into action on or
  beyond the crest? The appreciation made the occupation of Willerval wait for them; the scenario takes the evening of
  12 April, the earliest reading of BOH's "some days", but the Canadians were still using captured guns on 14 April.
- **The 24th Division's date (for the owner).** The Bois en Hache attack is scheduled on 12 April, the date it was made
  after the postponement, though the plan had it on the night of 9-10 April with the Pimple. Should a scheduled flank
  attack keep the historical date, take the planned one, or be tied to the Pimple operation when the model allows it?
