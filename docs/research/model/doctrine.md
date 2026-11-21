# Model research: BEF and German doctrine of 1917 (doctrine v2)

This note covers `doctrine/bef-1917.yaml` and `doctrine/de-1917.yaml`: the behaviour parameters of each side (morale and
its thresholds, orders and marching, company defaults, the attack and the defence). Each file has its own source
registry; every parameter has a plain-language description.

**Summary.** Each doctrine has 18 common parameters, 2 for leaderless companies, 6 company defaults, 10 attack and 6
defence parameters: 42 in all, plus `companyWeapons`, the weapon ids its companies fire. Four of the 84 are sourced: the BEF's Lewis guns, grenades and company strength from SS 143, and
the German battalion's four companies from the British handbook of the German Army. The rest are estimates. Behaviour
coefficients (morale, thresholds, delays, ratios) are calibrated estimates for Plan 4; the counts and numerical choices
are plain estimates whose reasoning cites what the sources do say.

**The four values the engine reads today** (`attack.followDistanceM`, `maxAdvanceMPerMin`, `startJitterMin`,
`speedJitterFrac`) are unchanged in both files, so the Plan 1 golden record and `ENGINE_VERSION` 0.2.0 stand. Their
estimates now give their reasoning. Nothing in the research argued clearly for other values: SS 135, which would give the
distance behind the barrage, was not found.

**Doctrine sources reached and not reached.**

- *SS 143, Instructions for the Training of Platoons for Offensive Action* (February 1917) was found on archive.org in
  the U.S. War Department's reprint (`ss143-1917`).
- *SS 135, Instructions for the Training of Divisions for Offensive Action* (December 1916; amended January 1917) was not
  found on archive.org (title searches for "training of divisions", "offensive action", "S.S. 135").
- The German *Grundsätze für die Führung in der Abwehrschlacht im Stellungskriege* (1 March 1917 edition) was not found,
  in German or in translation (title searches for "Abwehrschlacht", "Stellungskrieg", "Grundsätze", "defensive battle",
  "position warfare", "principles of command"). Its content is taken from Nicholson's account of the December 1916
  booklet, *Principles for the Conduct of Operations in the Defensive Battle in Position Warfare* (pp. 239-240), BOH's
  chapters on the German side, and two later sources: the British General Staff's handbooks of the German Army (January
  1917 and April 1918) and the AEF's *Survey of German Tactics, 1918*.

## Sources

| id | Tier | Used for |
|---|---|---|
| `ss143-1917` | primary | The platoon and company (pp. 9, 22), ammunition and bombs (p. 10), moppers-up (p. 16), sections led by their N.C.O.s (p. 12), formations in two waves (Appendixes I and III, pp. 20-22). |
| `nicholson-1962` | official | The German defence of December 1916 (pp. 239-240), the Eingreif divisions in 1917 (p. 306); the Vimy rehearsals (p. 250) and barrage (p. 253); Passchendaele (p. 324). |
| `boh-1917-1` | official | The Eingreif division (p. 241); the dug-outs on Vimy Ridge and the expectation of immediate counter-attacks (p. 316); the 2nd Brigade at the first trench (p. 321); prisoners in the dug-outs (p. 325); Gegenstoss and Gegenangriff (p. 523 n.). |
| `german-handbook-1917` | primary | The battalion of four companies and a machine-gun company (p. 30); the company's war establishment and its subaltern commander (p. 39); three machine-gun companies to a regiment (p. 49), six guns each (p. 50); rounds carried by the soldier (p. 44) and on a machine gun's limber (p. 52). |
| `lewis-1917` | primary | The Lewis gun's magazine of 47 rounds (p. 18), for the rounds a Lewis gun section carries. |
| `german-handbook-1918` | primary | The Prussian War Ministry order of 12 March 1917: battalions of 750 other ranks, three light machine guns a company (p. 44); the issue complete by the end of 1917 (p. 55). |
| `survey-german-tactics-1918` | primary | Translations of German orders of 1918 (AEF G.H.Q.): the counter-attack company in each sector (p. 32), counter-attacks (p. 35), the rate of advance behind a barrage (p. 18). A year after Vimy: a lead for 1917 practice. |

The three archive.org texts new to this note are fetched by `scripts/fetch-sources.sh`.

## Values entered (sourced)

| Value | Source | Page | Quote (≤ 25 words) | Tier |
|---|---|---|---|---|
| bef-1917 companyDefaults.lewisGuns 4 | `ss143-1917` | 9, 22 | "1 section Lewis gunners — 1 N. C. O. and 8 O. R. (includes Nos. 1 and 2)"; a company of "4 Average Strength Platoons" | primary |
| bef-1917 companyDefaults.bombsPerMan 2 | `ss143-1917` | 10 | "carries at least 120 rounds S. A. A. and 2 or more bombs" | primary |
| bef-1917 companyDefaults.strength 158 | `ss143-1917` | 22 | "The Company, Taking 4 Average Strength Platoons of 36 O.R. and Coy. H.Q. 14" | primary |
| de-1917 companyDefaults.companiesPerBattalion 4 | `german-handbook-1917` | 30 | "Each battalion is divided into 4 companies and a machine gun company." | primary |
| de-1917 companyDefaults.battalionsPerDivision 9 | `german-handbook-1917` | 30 | "the great majority of German Divisions have now been organized on the 3-regiment basis, the three infantry regiments (9 battalions)" | primary |
| bef-1917 companyDefaults.roundsPerRifle 120 | `ss143-1917` | 10 | "every man (except bombers, signalers, scouts, runners, and Lewis gunners who carry 50 rounds) carries at least 120 rounds S. A. A." | primary |
| bef-1917 companyDefaults.roundsPerLightMg 1,410 | `ss143-1917`; `lewis-1917` | 10; 18 | "The Lewis gun section carries 30 drums"; "The magazine, which holds forty-seven rounds": 30 × 47 | primary |
| de-1917 companyDefaults.roundsPerRifle 150 | `german-handbook-1917` | 44 | rounds per man "Carried on the soldier ... 150"; 70 more in the company ammunition wagon | primary |
| de-1917 companyDefaults.roundsPerMg 8,000 | `german-handbook-1917` | 52 | "The amount now carried appears to be— 8,000 rounds per gun on the limbered gun wagons" | primary |

## The basis of the estimates

| Parameter | Value (BEF / German) | Quote (≤ 25 words each) and basis | Source | Tier |
|---|---|---|---|---|
| companyDefaults.officers | 5 / 3 | BEF: "Headquarters — 1 officer and 4 O. R." in each platoon (`ss143-1917` p. 9), and the company commander; assumed, without a source, that the second-in-command was left out of the battle. German: 5 on establishment, but "a company by a subaltern" (`german-handbook-1917` p. 39) | ss143-1917; german-handbook-1917 | primary |
| de companyDefaults.machineGuns | 1.5 | "Every infantry regiment has three machine gun companies" (p. 49), one to a battalion, six guns each (p. 50), spread over four rifle companies | german-handbook-1917 | primary |
| de companyDefaults.lewisGuns | 1 | The 08/15s, fired as `mg08-15`: "The issue of the '08/'15 light machine gun began in March, 1917, on the scale of 3 to every infantry company" (p. 61); "By the end of 1917 every infantry company ... had received 3" (p. 55) | german-handbook-1918 | primary |
| companyDefaults.roundsPerMg (BEF) / roundsPerLightMg (German) | 8,000 / 4,000 | BEF: taken as the German figure, 8,000 a gun on its limber (`german-handbook-1917` p. 52); British companies carry no machine guns, so only a scenario that gives them Vickers guns reads it. German 08/15: half the heavy gun's limber load, its team carrying the belt boxes by hand, though a trench garrison kept boxes at the gun | german-handbook-1917 | primary |
| de companyDefaults.strength | 187 | "to reduce the strength of a battalion to 750 other ranks" (p. 44), a quarter each; the earlier establishment was 259 (`german-handbook-1917` p. 39) | german-handbook-1918 | primary |
| bef companyDefaults.battalionsPerDivision | 12 | Three brigades of four battalions, as every Canadian division in the scenario's order of battle has (the 3rd Division's 9th Brigade has five); no source read prints it. Only an off-map reserve division with no battalions entered reads it | oob-canadian.yaml | estimate |
| ncoPenalty.rehearsed | 0.1 / 0.1 | BEF: "Section commanders control and lead their sections" (`ss143-1917` p. 12); the Canadians "rehearsed repeatedly on this model from platoon to divisional level" (`nicholson-1962` p. 250). German: the group leader's right "within certain limits, to retire in any direction before strong enemy fire" (`nicholson-1962` p. 240) | as cited | primary / official |
| attack.trainingBonusRehearsed | 0.1 | "By the day of the attack all ranks knew just where they would have to go and what to do when they got there." | nicholson-1962 p. 250 | official |
| attack.waveSpacingM | 70 / 50 | BEF: SS 143's diagram of two waves, 50 to 100 yards apart (Appendix I, p. 20, read from the OCR). German: counter-attack troops "advance in waves" (`survey-german-tactics-1918` p. 35), no distance | as cited | primary |
| attack.mopUpRateMenPerMin | 3 / 3 | "Moppers-up should work in pairs under their own commander." They "guard the entrances to dugouts and side trenches" (`ss143-1917` p. 16) | ss143-1917 | primary |
| attack.followDistanceM | 70 / 0 | BEF, unchanged: the 2nd Brigade "rushed the sentries before the garrison could emerge" (`boh-1917-1` p. 321); "followed their barrage so closely that in most cases the Germans could not man their machine-guns" (`nicholson-1962` p. 324, Passchendaele) | as cited | official |
| attack.maxAdvanceMPerMin | 50 / 40 | Unchanged; faster than the barrage's 100 yards in three minutes (`nicholson-1962` p. 253). A German order of 1918: "Two hundred meters in four minutes, synchronized with the rolling barrage." (`survey-german-tactics-1918` p. 18) | as cited | official / primary |
| defence.emergeMin | 3 / 3 | "The attacking infantry could not hope to reach and block the entrances before the garrisons turned out unless tactical surprise were obtained" (p. 316); dug-outs "twenty to fifty feet down in the chalk" (p. 316) | boh-1917-1 | official |
| defence.trappedSurrenderFrac | 0.5 / 0.6 | German: "a like number of the enemy were captured shortly afterwards in the dug-outs" (p. 325) | boh-1917-1 | official |
| de defence.localCounterAttackDelayMin | 5 | The form-up and launch only (see below). "immediate counter-attacks would be launched to recover any ground lost" (`boh-1917-1` p. 316); "the Gegenstoss or immediate counter-attack frequently carried out in the course of the battle" (p. 523 n.); "Time should never be given to the latter to rest or install himself." (`survey-german-tactics-1918` p. 35); "one company remains as a counter-attack reserve" (p. 32) | as cited | official / primary |
| de defence.divisionalCounterAttackDelayMin | 30 | The form-up and launch only, after arrival (see below). The divisions were to strike "the enemy in the midst of his assault" (`nicholson-1962` p. 306); leading units of the counter-attack divisions assembled "close behind the Second Line" (`nicholson-1962` p. 240); in later 1917 "each echeloned back some two to four thousand yards in readiness" (p. 306); "the big rebound of the elastic system was the task of the counter-attack division or Eingreif division" (`boh-1917-1` p. 241) | as cited | official |
| de defence.counterAttackMinRatio | 0.75 | "their fresh troops hold a great advantage over the tired troops of the attacker" | survey-german-tactics-1918 p. 35 | primary |
| de defence.commitReserveWhenLostFrac | 0.25 | "Counter-attacks in the battle zone would be delivered by battalions billeted three or four miles to the rear in regimental reserve." | nicholson-1962 p. 239 | official |

The morale parameters (`baseMorale` 0.8, `goToGround` 0.5, `fallBack` 0.35, `surrender` 0.15, `pinSuppression` 0.7,
`lossShock` 1, and the drains and recovery) are the same for both sides and are reasoned together: with `lossShock` 1 a
company that loses a third of its men in a short time goes to ground, and one that loses half falls back, the order of
losses at which attacks of the period stalled. They are calibrated estimates with no source behind them; what the
bombardment did to the German garrisons at Vimy is the bombardment model's, not the doctrine's. `quietStepMin` is a
numerical choice. `marchKmPerHour` 4, `baseOrderDelayMin` 15, `deployMin` 30 and `reportEveryMin` 30 are estimates: no
marching rate or staff timing was found in the sources read.

**The counter-attack delays count only the form-up and launch.** The engine counts the rest separately: the report's
journey to the headquarters is the channels' (`tables/channels.yaml`), the march of the reserves is `marchKmPerHour` and
`deployMin`, and the approach to the lost trench is simulated movement. So `localCounterAttackDelayMin` runs from when
the battalion's picture shows a segment lost to when its counter-attack company goes in: 5 minutes for the German
Gegenstoss by a company lying close behind with its task known, 10 for the British. `divisionalCounterAttackDelayMin`
runs from when the reserves have arrived and deployed to when they attack: 30 minutes for the Eingreif division, which
was to go in from the march, 60 for a British counter-attack that waited for a barrage. The deliberate Gegenangriff,
prepared over days (BOH p. 523 n.), is not modelled by these delays. (Earlier drafts had 20 and 180 minutes, which
counted the approach and the march twice.)

**Which weapon a company fires is the doctrine's.** A company's counts keep the scenario's names (`lewisGuns`,
`machineGuns`); `companyWeapons` in each doctrine names the weapon each count fires: `rifle`, `lewis` and `vickers` for
the BEF, `rifle`, `mg08-15` and `mg08` for the Germans. A German company's light machine guns are 08/15s, never Lewis
guns, and cite the German handbook.

**German figures taken from the British.** No German source was found for `bombsPerMan`, `mopUpRateMenPerMin`,
`trainingBonusRehearsed` and `ammoReserveFrac`; de-1917 takes the British figure for each and says why.

**Where the reserves of a battle stood is the scenario's, not the doctrine's.** At Vimy the German counter-attack
divisions were "from twelve to twenty-four hours' march" away (`boh-1917-1` p. 241); that is Vimy data, for the
scenario's off-map reserves, whose march the engine simulates; the doctrine's `divisionalCounterAttackDelayMin` starts
only once they have arrived.

## Conflicts

- **The German manual's date and title.** The brief names the *Grundsätze für die Führung in der Abwehrschlacht im
  Stellungskriege* of 1 March 1917; Nicholson describes a booklet issued in December 1916, *Principles for the Conduct of
  Operations in the Defensive Battle in Position Warfare* (p. 239), the same manual's first edition. BOH speaks of
  "Ludendorff's manuals issued at the end of 1916" (p. 241). The 1 March edition was not read; whatever it changed is
  not in these values.
- **Elastic or rigid.** Nicholson describes the doctrine as elastic, the front line yielding "at some points" (p. 240),
  but Lossberg's memorandum of January 1917 "emphasized the need for a steadfast resistance in every outpost" (p. 240),
  and BOH says the system "was not fully grasped at the time by many of the German commanders", as the Sixth Army's
  handling of its reserves at Arras showed (preface, p. xi). The doctrine file holds the system as written; the Vimy
  scenario's reserves hold what was done.
- **Company strength: example or establishment.** The BEF default (158) is SS 143's "average strength" example, the
  German (187) the March 1917 order's battalion of 750 over four companies; the German war establishment was 259. The
  scenario gives the strength of every company on the map; the defaults make up the off-map reserves that have no
  companies entered (the Vimy German resting battalions and reserve divisions), so their strength is the German default's.
- **A 1918 source for 1917 practice.** The AEF's survey translates German orders of 1918; its counter-attack principles
  match what BOH and Nicholson say of 1917, but its timings and formations may not.

## Open questions for the historian

- **SS 135.** *Instructions for the Training of Divisions for Offensive Action* (December 1916) would give the distance
  the leading wave kept behind the barrage, the distances between waves and the mopping-up arrangements of the Canadian
  attack; it was not found on archive.org. The distance behind the barrage (`followDistanceM` 70 m) is the one the
  engine uses today.
- **The Grundsätze, 1 March 1917 edition.** Not found on archive.org in German or English. It would give the intended
  timing of the Gegenstoss and the Gegenangriff, the Eingreif divisions' distance behind the line, and how long a
  garrison was expected to take to man its trench after the barrage lifted.
- **SS 143's wave distances.** The 50 to 100 yards between waves are read from the OCR of Appendix I's diagram, whose
  figures are garbled in both scans read; the page image should be checked.
- **German light machine guns in April 1917.** The order of 12 March 1917 gave each company three; how many the Vimy
  garrisons had by 9 April is not known (taken as one).
- **German company officers at Vimy.** The establishment was five; the handbook says companies were commanded by
  subalterns. The number actually present (taken as three) is not known.
- **The morale scale.** The morale thresholds have no source. A study of when attacks of 1917 went to ground or broke,
  by the losses suffered, would anchor them.
