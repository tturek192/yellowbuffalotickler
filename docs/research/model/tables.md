# Model research: the weapon, cover, channel and effect tables

This note covers `tables/weapons-1917.yaml`, `tables/cover.yaml`, `tables/channels.yaml`, `tables/effects.yaml` and their
source registry `tables/sources.yaml`: the numbers the combat model of Plan 3 runs on (the plan's "The model, in one page"
shows where each enters a formula).

**Summary.** 25 weapons: the 19 the plan names; the 13-pdr, 6-inch gun, 12-inch gun, 12-inch howitzer and 15-inch
howitzer that the Vimy artillery also names; and the German light machine gun, the 08/15 (`mg08-15`), which the German
doctrine's companies fire as their light machine guns. Each weapon has three facts (rate of fire, longest range, shell
weight; small arms have no shell) and three calibrated coefficients (lethality, rangeScaleM, suppressPerRound). Of the 70
weapon facts, 53 cite a source and 17 are estimates with their reasoning, almost all of them sustained rates of fire for
which no source was found. The 20 cover factors, 16 channel values and 33 effects are estimates; all but six are calibrated coefficients
for Plan 4, and one (`crewPerLewis`) is sourced. The table below lists the sourced values.

**What is sourced and what is not.** A rate of fire, a range, a shell weight or an establishment is a fact: it cites a
source, or, where none was found, it is an estimate that says so. A lethality, a cover factor or a morale coefficient is a
model coefficient: it is always `{ value, estimate, calibrated: true }`, with order-of-magnitude reasoning. No coefficient
is presented as sourced. The British pieces' ranges and shell weights come mostly from English Wikipedia (tertiary),
whose infoboxes cite Hogg and Thurston, Farndale and Clarke; those books were not reachable (Open questions). The German
pieces come from the British General Staff's *Handbook of the German Army in War* (January 1917), a primary source.

## Sources

| id | Tier | Used for |
|---|---|---|
| `nicholson-1962` | official | The 18-pdr's sustained barrage rate at Vimy (p. 253); the Canadian Army's killed and total casualties (p. 535); runners at Hill 70 (p. 291); contact patrols (p. 155). |
| `boh-1917-1` | official | Buried cable, wireless and power buzzers at Arras (p. 193 and n.2); Allenby's 40 per cent of wire (p. 179); the German dug-outs "twenty to fifty feet down" (p. 316); gassed horses (p. 320); mud (p. 333); the Schwaben Tunnel's news (p. 325 n.1); the German artillery on the Arras front by calibre (p. 182 n.1). |
| `ss143-1917` | primary | *Instructions for the Training of Platoons for Offensive Action, 1917* (S.S. 143, February 1917), in the U.S. War Department's reprint: the platoon of 28 to 44 other ranks, the Lewis gun's Nos. 1 and 2 (p. 9). |
| `german-handbook-1917` | primary | British General Staff, *Handbook of the German Army in War, January 1917*: the MG 08 (p. 51) and machine-gun training (p. 52); the machine-gun company's 8 gunners a gun (p. 50); the FK 96 n.A. (pp. 63-64), the light field howitzer (pp. 64-65), the heavy field howitzer (pp. 68-69), the 21-cm mortar (pp. 69-70), the Minenwerfer (p. 74). |
| `german-handbook-1918` | primary | The April 1918 edition: the Minenwerfer table with rates of fire (p. 104, from *Die Minenwerfer*, S.S. 624). Later than Vimy; used only for the rates the 1917 edition does not give. |
| `lewis-1917` | primary | *Instruction on the Lewis Automatic Machine Gun*, 3rd edition, 1917: methods of fire (pp. 80-81). |
| `us-handbook-artillery-1920` | primary | U.S. Ordnance Department, *Handbook of Artillery* (1920): the British 60-pdr (pp. 189-192), 8-inch howitzers Mk VI-VIII (p. 267) and 3-inch Stokes mortar (p. 372), which the U.S. Army took over. |
| `wiki-*` (20 ids) | tertiary | English Wikipedia weapon articles at fixed revisions (`tables/sources.yaml` lists each id with its revision): rates, ranges and shell weights of the British pieces, the rifles and the machine guns, and leads for the German ones. |

All are cached in `.cache/sources/` by `scripts/fetch-sources.sh` (archive.org full text through the item's stream page;
Wikipedia raw wikitext by revision). Wikipedia revisions fetched as leads but not cited: MG 08 (1384752550), BL 8-inch
howitzer Mk VI-VIII (1369516032), 10.5 cm Feldhaubitze 98/09 (1371485165), 21 cm Mörser 10 (1305354109), 7.58 cm
Minenwerfer (1311286259), 17 cm mittlerer Minenwerfer (1359862463), Minenwerfer (1360197179).

## Weapons

### What each number means

- `rpm` is the rate one weapon keeps up over a barrage, a bombardment or a firefight of some minutes, not its burst rate.
  For the 18-pdr, the one gun with a sourced barrage rate, it is half its rated limit; the other field pieces follow it,
  and the heavy pieces, which have no sourced rate, are estimates from their shell weight.
- `maxRangeM` is the longest range at which the weapon fires at all (the maximum range), not its effective range; the
  fall of effect with range is `rangeScaleM`'s.
- `shellKg` is the shell or bomb as fired. Yards and pounds are converted at 0.9144 m and 0.45359 kg.
- `kind`: `field-gun` for the 13-pdr, 18-pdr and 77-mm; `howitzer` for the field howitzers (4.5-inch, 10.5-cm);
  `heavy` for every medium and heavy piece from the 60-pdr and the 15-cm up, whose rounds count as heavy rounds against
  dugouts; `mortar` for the trench mortars and Minenwerfer.

### Values entered (facts)

| Value | Source | Page | Quote (≤ 25 words) or infobox | Tier |
|---|---|---|---|---|
| 18pdr rpm 2 | `nicholson-1962` | 253 | "then lifted 100 yards every three minutes, slowing their rate of fire to two rounds per minute" | official |
| 18pdr maxRangeM 5966 (6,525 yd) | `wiki-qf-18pdr` | infobox | range 6,525 yd Mk I & II; 7,800 yd with trail dug in | tertiary |
| 18pdr shellKg 8.4 (18.5 lb) | `wiki-qf-18pdr` | infobox | 18.5 lb projectile | tertiary |
| 13pdr maxRangeM 5395, shellKg 5.7 | `wiki-qf-13pdr` | infobox | max range 5,900 yd; 12.5 lb shrapnel, later HE | tertiary |
| 4.5in-how maxRangeM 6218, shellKg 15.9 | `wiki-qf-45in-how` | infobox | max range 6,800 yd; HE shell 35 lb | tertiary |
| 60pdr maxRangeM 9418, shellKg 27.2 | `wiki-bl-60pdr` | infobox, text | "the early 60 lb (27.3 kg) 2 c.r.h. shell 10,300 yd" | tertiary |
| 6in-gun maxRangeM 10973, shellKg 45.4 | `wiki-bl-6in-mk7` | infobox | field carriage, 12,000 yd (Farndale); 100 lb | tertiary |
| 6in-how maxRangeM 8687, shellKg 45.4 | `wiki-bl-6in-26cwt` | infobox | WWI 100 lb shell: 9,500 yd | tertiary |
| 8in-how maxRangeM 9839 | `us-handbook-artillery-1920` | 267 | "has a muzzle velocity of 1,300 feet per second and a maximum range of 10,760 yards" | primary |
| 8in-how shellKg 90.7 | `wiki-bl-8in-mk1-5` | infobox | HE 200 lb | tertiary |
| 9.2in-how maxRangeM 9199, shellKg 131.5 | `wiki-bl-92in-how` | infobox | 10,060 yd (Mk I); HE 290 lb | tertiary |
| 12in-how maxRangeM 10378, shellKg 340.2 | `wiki-bl-12in-how` | infobox | Mk II 11,350 yd; 750 lb | tertiary |
| 12in-gun maxRangeM 29901, shellKg 385.6 | `wiki-bl-12in-railway` | infobox | 32,700 yd; HE 850 lb | tertiary |
| 15in-how maxRangeM 9876, shellKg 657.7 | `wiki-bl-15in-how` | infobox | 10,800 yd; HE 1,450 lb | tertiary |
| stokes-3in rpm 6 | `wiki-stokes` | infobox | 25 rpm (maximum), 6–8 rpm (sustained) | tertiary |
| stokes-3in maxRangeM 686 | `us-handbook-artillery-1920` | 372 | "With cartridge and three rings, the range reaches a maximum of 750 yards at 40° elevation." | primary |
| stokes-3in shellKg 4.8 | `wiki-stokes` | infobox | HE 10 lb 11 oz | tertiary |
| 2in-mortar rpm 2, maxRangeM 521, shellKg 23.1 | `wiki-2in-mortar` | infobox | 2-3 per minute; 570 yd max; HE 51 lb | tertiary |
| 9.45in-mortar rpm 0.167, maxRangeM 2195, shellKg 68.9 | `wiki-945in-mortar` | infobox | 1 round every 6 minutes; 660–2,400 yd; HE 152 lb | tertiary |
| lewis rpm 250 | `lewis-1917` | 81 | "250 rounds per minute is all that is required at most" | primary |
| lewis maxRangeM 3200 | `wiki-lewis-gun` | infobox | max range 3,500 yd; range 880 yd | tertiary |
| vickers rpm 450, maxRangeM 4115 | `wiki-vickers` | infobox | 450–500 rounds/min; 4,500 yd indirect fire | tertiary |
| mg08 rpm 400 | `german-handbook-1917` | 51 | "Rate of fire .. 400-500 rounds per minute." | primary |
| mg08 (sustained fire in training) | `german-handbook-1917` | 52 | "Sustained fire at the rate of 500 rounds per minute" | primary |
| mg08 maxRangeM 4023 | `german-handbook-1917` | 51 | "Extreme range (at 32° elevation) .. 4,400 yards." | primary |
| mg08-15 maxRangeM 4023 | `german-handbook-1918` | 61 | "The ballistics are similar to those of the '08 pattern machine gun, but the light machine gun is not so accurate." (with the MG 08's 4,400 yards) | primary |
| rifle maxRangeM 2743 | `wiki-lee-enfield` | infobox | max range 3,000 yd | tertiary |
| 77mm-fk maxRangeM 8400 | `german-handbook-1917` | 63 | "Maximum range with percussion fuze .. 9,186 yards." | primary |
| 77mm-fk shellKg 6.8 | `german-handbook-1917` | 64 | "The long shell weighs 14.6 lbs., the other projectiles 15 lbs." | primary |
| 105mm-lfh maxRangeM 7000 | `german-handbook-1917` | 64 | "With No. 8 charge .. 7,655 yards" | primary |
| 105mm-lfh shellKg 15.6 | `german-handbook-1917` | 65 | "The above shells weigh 34.5 lbs. each." | primary |
| 150mm-sfh maxRangeM 8500 | `german-handbook-1917` | 68 | "Maximum range with full charge" 6,616, 8,147 and 9,296 yards for the three patterns | primary |
| 150mm-sfh shellKg 41.7 | `german-handbook-1917` | 69 | "All three patterns of H.E. shell weigh about [9]2 lbs." | primary |
| 210mm-mrs maxRangeM 9100 | `german-handbook-1917` | 69 | latest pattern 10,280 (9,952) yards, the bracket for the 1914 shell | primary |
| 210mm-mrs shellKg 83.5 | `german-handbook-1917` | 70 | "the 1914 and 1914 A patterns about 184 lbs." | primary |
| minenwerfer-light maxRangeM 1050, shellKg 4.5 | `german-handbook-1917` | 74 | table: 7.6-cm light Minenwerfer, 10 lb projectile, 175-1,148 yards | primary |
| minenwerfer-medium maxRangeM 920, shellKg 49.4 | `german-handbook-1917` | 74 | table: 17-cm medium Minenwerfer, 109 lb projectile, 116-1,006 yards | primary |
| minenwerfer-medium rpm 0.5 | `german-handbook-1918` | 104 | "Rate of fire—30-35 rounds per hour (H.E.)." | primary |
| effects.crewPerLewis 2 | `ss143-1917` | 9 | "1 section Lewis gunners — 1 N. C. O. and 8 O. R. (includes Nos. 1 and 2)" | primary |

Where a source gives a range of values (400-500, 6-8, 2-3), the table takes the lower end and says so in the entry's
note: a weapon in action changes belts and magazines, relays and looks for targets.

### Rates of fire that are estimates

| Weapon | rpm | Reasoning |
|---|---|---|
| rifle | 5 | Rapid fire was 20-30 aimed shots a minute for the SMLE (`wiki-lee-enfield`) and 15 for the Gewehr 98 (`wiki-gewehr-98`), for a minute or so; men moving, loading under fire or looking for a target fire far less. A third of the slower rapid rate. |
| 13pdr, 4.5in-how, 77mm-fk, 105mm-lfh | 2 | As the 18-pdr: its sustained barrage rate (2, Nicholson p. 253) was half its limit (4 from January 1917, `wiki-qf-18pdr` after Farndale). The 4.5-inch's 4 (`wiki-qf-45in-how`) halved; the FK 96's 10 (`wiki-fk-96`) is a burst rate. |
| 60pdr, 6in-gun, 6in-how, 150mm-sfh | 1 | Separate-loading pieces with 60-100 lb shells; half the field guns' rate. The 6-inch howitzer's maximum is 2 (`wiki-bl-6in-26cwt`) and the sFH 13's 3 (`wiki-sfh-13`). |
| 8in-how, 9.2in-how, 210mm-mrs | 0.5 | Shells of 184-290 lb: one round in two minutes. |
| 12in-how | 0.25 | A 750 lb shell: one round in four minutes. |
| 12in-gun, 15in-how | 0.2 | 850-1,450 lb shells: one round in five minutes. |
| mg08-15 | 250 | No rate found. "Belts containing either 100 or 250 rounds are used" (`german-handbook-1918` p. 61); one gunner on a bipod. Taken as the Lewis gun's practical 250 (`lewis-1917` p. 81), the same class of weapon; the 08/15 cites the German handbook, never the Lewis manual. |
| minenwerfer-light | 4 | "up to 20 rounds a minute for short periods" (`german-handbook-1918` p. 104); sustained a fifth, a little under the Stokes's 6. |

## Coefficients

Every weapon's `lethality`, `rangeScaleM` and `suppressPerRound` is a calibrated estimate. They are set so the model's
fire formula gives casualties of the right order, and Plan 4 calibrates them together. The checks:

- **Machine guns.** The plan's own check: a gun firing about 400 rounds a minute at an exposed company moving in the open
  at 300 m should cause casualties in single figures a minute. With lethality 0.012 and rangeScaleM 1,000 m:
  400 × 0.012 × exp(−0.3) = 3.6 a minute. The Vickers and the MG 08 share the coefficients.
- **Rifles.** Lethality 0.03 and rangeScaleM 400 m: a rifleman at 5 rounds a minute hits 0.07 men a minute at 300 m, so
  a machine gun is worth about 50 rifles there. That ratio is the builder's order of magnitude, not a figure from a source
  read.
- **Lewis guns.** Lethality 0.01 and rangeScaleM 500 m: 1.4 men a minute at 300 m, a little under half a tripod gun.
- **The 08/15.** The MG 08's ballistics but "not so accurate" (`german-handbook-1918` p. 61): lethality 0.01, under the
  MG 08's 0.012, and rangeScaleM 600 m, between the Lewis gun's and the MG 08's; 1.5 men a minute at 300 m. Its own
  coefficients, so Plan 4 can calibrate the two sides' light guns apart.
- **Shells.** Lethality = 0.5 × √(shellKg / 8.4). The 18-pdr's 0.5 means one shrapnel or HE burst among a platoon in the
  open hits about one man in two rounds; heavier shells scale with the square root of their weight, because a burst's
  lethal area grows more slowly than its weight. So the 4.5-inch is 0.69, the 6-inch 1.2, the 9.2-inch 2.0, the 15-inch
  4.4, the Stokes 0.38. On the Vimy barrage's one 18-pdr to 25 yards (4.4 guns to 100 m) at 2 rounds a minute, men caught
  standing in the open under the band would lose about 3 a minute per 100 m (4.4 × 2 × 0.5 × exp(−3,000/11,900)); men in trenches or dugouts far fewer
  (Cover).
- **rangeScaleM for shells** is twice the maximum range: an observed or registered gun keeps most of its accuracy across
  its range, about 60 per cent at the longest.
- **suppressPerRound.** Small arms: rifle 0.05, Lewis 0.08, machine gun 0.1 (a gun's 400 rounds a minute on a 100-man
  company add 0.4 a minute, so it pins the company inside two minutes). Shells: 6 × lethality, so 9 18-pdr rounds a minute
  on 100 m pin a company in two or three minutes, and one 15-inch shell adds 0.26 to a company of 100.

## Cover

`cover[posture][ground]` is the share of fire that still hurts a man (1 is none saved). All 20 are calibrated estimates:

| Posture | open | cratered | wood | village | trench |
|---|---|---|---|---|---|
| moving | 1.0 | 0.8 | 0.6 | 0.6 | 0.5 |
| prone | 0.4 | 0.25 | 0.3 | 0.25 | 0.2 |
| in-trench | 0.2 | 0.2 | 0.15 | 0.15 | 0.15 |
| in-dugout | 0.02 | 0.02 | 0.02 | 0.02 | 0.02 |

The reasoning is in each entry: a prone man presents about a third of an upright man's target; a shell hole or rubble
does better; a man in a fire trench shows head and shoulders only while firing. A man in a dugout is out of reach of
direct fire; what heavy shells do to dugouts is the bombardment model's, by dugout depth (`dugoutPerRound`, `safeDepthM`).

## Channels

All 16 values are calibrated estimates; the scenario says which channels link which headquarters.

| Channel | delayMin | failPerHour | Basis |
|---|---|---|---|
| buried-cable | 5 | 0.02 | "proof against direct hits by all calibres up to 5.9-inch howitzers" (`boh-1917-1` p. 193) |
| surface-line | 5 | 0.3 | cut by any shelling; cable was reliable only "provided that the cable could be protected from artillery fire and from traffic" (p. 193) |
| runner | 30 | 0.1 | 1-2 km between headquarters; the Schwaben Tunnel's news took an hour (`boh-1917-1` p. 325 n.1); runners killed (`nicholson-1962` p. 291) |
| visual | 10 | 0.3 | needs line of sight; smoke, mist and snow |
| pigeon | 40 | 0.1 | flies to a loft well behind, then telephoned on |
| power-buzzer | 8 | 0.2 | new and few: three to a division forecast for Arras (`boh-1917-1` p. 193 n.2) |
| wireless | 10 | 0.3 | "Valuable as was on occasion the modern field wireless-telegraphy apparatus ... cables more reliable" (p. 193) |
| contact-patrol | 20 | 0.2 | flares and panels seen from the air, message dropped at headquarters (`nicholson-1962` p. 155); needs flying weather |

## Effects

The 50 effects are estimates except `crewPerLewis`, which is sourced; 37 are calibrated coefficients, and `twilightMin`,
`lineFeatureMatchM`, `gapMultiplier`, `crewPerMg`, `trenchProximityM`, `wireUncutBelow`, `batteriesRecoveredFrac`,
`mgUnobservedBelow`, `fireRefsMin` and the village, wood and crater radii are plain estimates (a calculation, a tolerance, an explanation threshold, a count or a
map default, not fitted). The reasoning is in each entry; the ones with sources behind them:

| Key | Value | Basis |
|---|---|---|
| killedFrac | 0.25 | 51,748 Canadians "killed in action or died of their wounds" among 232,494 casualties "of all categories" (`nicholson-1962` p. 535): 22 per cent of a total that includes the sick and injured, so a little higher among battle casualties. Deliberately not taken from the Vimy casualty returns, which are validation targets. |
| densityRefMen | 30 | a platoon: SS 143's "minimum strength ... of 28 O. R. and a maximum of 44 O. R." (`ss143-1917` p. 9) |
| cutPerRound | 20 | one round per metre of front cuts 63 per cent of a 20 m belt; Allenby's planners expected 40 per cent cut by a short bombardment (`boh-1917-1` p. 179) |
| dugoutPerRound | 10 | low on purpose: "no amount of metal or explosive from above could destroy the main German dug-outs and tunnels twenty to fifty feet down in the chalk" (`boh-1917-1` p. 316) |
| safeDepthM | 3 | a 6-15 m chalk dugout (p. 316) leaves a third to a sixth of its garrison exposed |
| batteryRecoveryHalfLifeMin | 120 | gassed horses kept the German batteries from moving or bringing up ammunition (`boh-1917-1` p. 320) |
| mudSpeedFactor | 0.6 | "the heavy mud slackened their pace" (`boh-1917-1` p. 333) |
| churnAreaPerShellM2 | 30 | a field-gun or howitzer crater a few metres across (3-8 m) plus its lip (estimate; no source) |
| crateredShare | 0.5 | half a 50 m cell holed: no unbroken line across it (judgement; no source) |
| twilightMin | 35 | civil twilight at 50.4° N in early April, about 34 minutes (calculated) |
| barrageBandDepthM | 90 | one lift: the barrage "lifted 100 yards every three minutes" (`nicholson-1962` p. 253) |
| mgBarrageDepthM | 400 | the plan's figure; Nicholson's "bullet-swept zone 400 yards ahead" (p. 253) gives where it lay, not its depth |
| sortieDelayMin | 30 | Germans "emerging from dug-outs which had been passed over" during the consolidation (`boh-1917-1` p. 333) |
| crewPerLewis | 2 | sourced: the Nos. 1 and 2 (`ss143-1917` p. 9) |
| crewPerMg | 4 | firer, loader and two carriers; the German company had "48 machine gunners (8 per gun)" with reliefs and carriers (`german-handbook-1917` p. 50) |

Four keys came with the artillery of the battle, all by judgement, with no source behind them:
`unobservedFireFactor` 0.3 (fire meant to be observed, when nobody sees it fall), `observerRangeM` 1,500 m (how far an
observer must see to watch the fall of shot), `blockedExitFactor` 1 (a wholly wrecked trench doubles the time its
garrison takes to come up) and `batteriesRecoveredFrac` 0.5 (an explanation threshold: half a side's guns back in
action).

Three came with direct fire and morale, again by judgement: `isolationRadiusM` 300 m (a company with no other company of
its side that close, while the enemy is, counts as isolated and loses morale by the doctrine's `isolationDrain`; a
company holds about 200 m of front), `mgUnobservedBelow` 0.2 (an explanation threshold: a garrison's machine guns opening
fire from a segment the bombardment spared, or wrecked less than a fifth of, carry the cause `mg-unobserved`) and
`fireRefsMin` 10 (an explanation window: a company's morale events refer to the fire of the last 10 minutes on it).

Three came with movement and the fight for trenches, all calibrated judgements with no source for the number:
`suppressionSpeedLoss` 0.5 (the plan's starting value: a fully suppressed company that is not pinned keeps half its
pace, moving in rushes from cover to cover), `fatiguePerHourUnderFire` 0.1 (an hour under fire tires men like 5 km of
advance with a full load, beside the doctrine's `fatiguePerKm` 0.02) and `bombsPerManCleared` 0.5 (moppers-up bomb a
dugout's entrances and call its men up, SS 143's "guard the entrances to dugouts" (`ss143-1917` p. 16): some 10 to 20
bombs for a party of 20 to 40). Fatigue, on the doctrine's 0 to 1 scale, multiplies a company's speed and its fire by
1 − fatigue; it needs no number of its own.

Two came with communications, both calibrated judgements with no source for the number: `runnerMinPerKm` 15 (a man on
foot through trenches and shell holes at about 4 km an hour; added to the runner's `delayMin` for the distance between
sender and receiver as placed on the map, the owner's compendium having runners' times grow with distance) and
`callForFireGuns` 6 (a call for fire is taken to be answered by one battery of six guns, for both sides: the British
field battery as commonly given, not checked against a source read here). `callForFireMin` 10 now says what the engine does with it: the minutes the
guns answering a call keep firing on its target (its journey to the guns is the channels' delay).

**Changed from the plan's starting values** (the pre-flight ruling seeded the 16 later keys with the plan's numbers for
review here): `gasHorseRadiusM` 1,000 → 200 m (a gas shell's cloud spreads a couple of hundred metres, not a kilometre),
`sortieDelayMin` 20 → 30 (BOH p. 333), `killedFrac` 0.3 → 0.25, `dugoutPerRound` 30 → 10 and `safeDepthM` 5 → 3 (BOH
p. 316). The others keep their starting values with reasoning added. Nothing was set to make Vimy come out right.

## Conflicts

- **The 18-pdr's rate: 2 or 4 a minute.** Nicholson gives the Vimy barrage's rate, three rounds a minute for three
  minutes and then two (p. 253; BOH p. 319 agrees). `wiki-qf-18pdr`, after Farndale, gives a limit of 4 a minute from
  January 1917. The table takes 2, the rate actually fired over a long barrage; 4 is the gun's ceiling.
- **The 60-pdr's range.** `wiki-bl-60pdr`: 10,300 yards with the 2 c.r.h. shell on the Mk I carriage, 12,300 with the
  8 c.r.h. shell adopted in 1917. `us-handbook-artillery-1920` (pp. 189-192): 12,280 yards for the Mk I gun on the Mk II
  carriage, which came later. The table takes 10,300, the April 1917 equipment as far as the sources show.
- **The 8-inch howitzer's range.** The U.S. handbook gives 10,760 yards for the Mk VI and 12,280 for the Mk VII (p.
  267); the Mk VI-VIII article (rev. 1369516032, a lead) gives 10,400 and 12,400; the converted Mk I-V reached 10,500
  (`wiki-bl-8in-mk1-5`). Which marks were at Vimy is not known; 10,760 is taken.
- **The Stokes mortar.** 750 yards (U.S. handbook p. 372) or 800 (`wiki-stokes`); the bomb 10 lb 11 oz (`wiki-stokes`)
  or "approximately 11" lb (U.S. handbook, OCR unclear). The handbook's range and Wikipedia's weight are taken.
- **The medium Minenwerfer.** The 1917 handbook gives 116-1,006 yards (p. 74); the 1918 handbook 164-984 for the old
  pattern and 328-1,208 for the 1916 pattern, at 30-35 and 80-85 rounds an hour (p. 104); the Wikipedia article (a lead)
  gives 1,600 m and 20 rounds a minute, which is far from both handbooks. The 1917 range and the old pattern's rate are
  taken.
- **The light Minenwerfer's range.** 1,148 yards (1917 handbook p. 74) or about 1,094 (1918 handbook p. 104).
- **The 15-inch howitzer's shell.** 1,450 lb (Clarke) or 1,400 (Hogg and Thurston), both as quoted by `wiki-bl-15in-how`.
- **The heavy field howitzer's pattern.** The 1917 handbook gives three patterns of 15-cm howitzer, ranging 6,616,
  8,147 and 9,296 yards (p. 68). The 1913 pattern's range is taken; if most guns at Vimy were the 1902 pattern, it is
  8,147.

## Open questions for the historian

- **Hogg and Thurston, Farndale, Clarke.** Most British ranges and shell weights come from Wikipedia, which cites Hogg
  and Thurston's *British Artillery Weapons and Ammunition 1914-1918*, Farndale's *History of the Royal Regiment of
  Artillery: Western Front 1914-18* and Clarke's *British Artillery 1914-19*. None was found on the allowed hosts; the
  official handbooks of each piece (the "Handbook of the B.L. 9.2-inch howitzer" and the like) would replace them.
- **Sustained rates of fire of the heavy pieces.** No rate was found for the 60-pdr, the 6-inch gun and howitzer, the
  8-inch, 9.2-inch, 12-inch and 15-inch pieces, or the German field and heavy guns. The General Staff's *Artillery in
  Offensive Operations* (quoted by Farndale for the 18-pdr's limit) would give them; it was not found.
- **Which 12-inch gun.** BOH's "single 12-inch gun" at the First Army's disposal (p. 306) is taken to be a railway gun,
  the Mk IX's 32,700 yards. If it was another mounting the range changes.
- **The 2-inch and the 6-inch Newton mortar.** The Canadian Corps' medium mortars are taken as 2-inch, as BOH's
  ammunition table names them (p. 315 n.2). The 6-inch Newton mortar was coming into service in 1917; whether any fired
  at Vimy is not known.
- **The 8-inch howitzers' marks** at Vimy (Mk I-V conversions or Mk VI-VIII), which changes the range.
- **One rifle for both sides.** The SMLE and the Gewehr 98 share the `rifle` id; their ranges differ (3,000 yards and
  3,735 m) but their effect in the model is the same.
- **The 08/15's practical rate.** No source read gives it; it is taken as the Lewis gun's 250 rounds a minute. A German
  training manual for the light machine gun would give it.
