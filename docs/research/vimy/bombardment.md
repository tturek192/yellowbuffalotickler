# Vimy research: the bombardment, the wire, the garrisons and the companies

This note covers `scenarios/vimy-1917/bombardment.yaml` and the Plan 3 fields added to three other files:

- the preliminary bombardment: when it began, and the rounds each artillery entry fired, by task;
- the German wire belts, and the stretch left unshelled on the 87th Battalion's front;
- each German garrison company's machine guns and dug-out depth (`oob-german.yaml`);
- each Canadian company's training (`oob-canadian.yaml`), and why its officers and Lewis guns are left to the doctrine;
- each artillery entry's ammunition for the battle, observation, position and traction (`fireplan.yaml`).

**Summary.** The bombardment ran from noon on 20 March to noon on 9 April 1917 in two phases. In the first, about half
the batteries fired; the second, from 2 April, was "the week of suffering". The Canadian Corps fired 1,135,700 rounds:
802,600 field and 333,100 heavy (BOH p. 316 n.1). Seventeen allocations share those rounds among twelve artillery
entries. The field guns' rounds come from BOH's table, read and checked against two printed totals. The heavy rounds
are BOH's heavy total split by estimate, because the table's heavy rows are illegible in the OCR. Four wire stretches
cover the German first position, the Zwischen-Stellung, Thélus Trench and the Second Line. One spared stretch lies on
the 87th's front. Every German garrison has 2.25 machine guns and a dug-out depth of 9.1 or 15.2 m. Every Canadian
company is `rehearsed`, and so is every company of the British 13th Brigade. Officers and Lewis guns are not entered:
no source gives a company-specific figure, so the doctrine defaults apply. The field
guns carry 1,300 rounds a gun into the battle. Every artillery entry has an observation method. Positions are given
for the Canadian Corps' guns and the German guns.

**Everything here is a draft for the owner and the historian.** The artillery orders behind these numbers were not
read: Canadian Corps Artillery Instruction No. 1, the divisional bombardment programmes and the counter-battery report.
The *Canadian Military History* articles on the subject were not read either (Open questions). Most values below are
estimates, each with its reasoning.

## Sources

| id | Tier | Used for |
|---|---|---|
| `boh-1917-1` | official | Falls, *Military Operations, France and Belgium, 1917*, vol. I: the bombardment's plan, phases and targets (pp. 312-314); the ammunition expenditure table (p. 315 n.2) and totals (p. 316 n.1); the dug-outs (pp. 310, 315, 316, 327, 353); the wire (pp. 305, 313, 314, 333, 336; the Hindenburg Line's belts, p. 92); the 87th's strong point (pp. 328-329); the guns' lines (pp. 306-307); gassed horses and blind batteries (p. 320); captured German guns (p. 335). |
| `boh-1917-appendices` | official | The same history's appendices volume, new here: Appendix 11 (the First Army plan, 31 January 1917: wire-cutting with the 106 fuze); Appendix 15 (the First Army Artillery Plan, 8 February 1917: counter-battery groups, the preliminary bombardment, barrages); Appendix 52 (First Army statistics: ammunition tonnage). |
| `nicholson-1962` | official | The start of the bombardment (p. 250); wire-cutting (p. 249); the forward dug-outs (pp. 246, 251); the spared trench and its cost (p. 259); the rehearsals (p. 250); the Lewis guns (p. 253 n.). |
| `rca-ww1-history` | secondary | The phase I totals (85,000 heavy, 190,600 field), the 125,900 counter-battery rounds of the last week, and the 12-inch and 15-inch rounds allotted to Thélus. Also the battery classes: heavy, medium, 60-pdr and 6-inch gun batteries. |
| `hussey-inman-1921` | secondary | The British 13th Brigade's rehearsals and the double belt of wire (p. 153). The 5th Division's artillery: its 1,300 rounds a gun and its forward positions (pp. 150, 153). The guns captured in the Bois du Goulot (p. 154). |
| `hayes-1920`, `mcevoy-finlay-1920` | secondary | The 85th's and 72nd's rehearsals (`hayes-1920` p. 46; `mcevoy-finlay-1920` p. 45). |
| `ss143-1917` | primary | S.S. 143, the platoon manual: an officer and a Lewis gun section in each platoon (p. 9), four platoons to the company (p. 22). The basis of the doctrine's company defaults; registered in `tables/sources.yaml`, not cited by the scenario. |
| `german-handbook-1917` | primary | The German regiment's three machine-gun companies of 6 guns (pp. 49-50). Registered in the scenario here; it was already in `tables/sources.yaml`. |

`.cache/sources/boh-1917-appendices.txt` is fetched by `scripts/fetch-sources.sh`; the entry was added here. The other
sources were cached by earlier tasks.

## The bombardment

### When

`from` is 1917-03-20T12:00. BOH's expenditure table has two columns of dates: "Noon 20th March" to "Noon 2nd April",
and "Noon 2nd April" to "Noon 9th April" (p. 315 n.2). Nicholson says the preparatory bombardment "began on 20 March"
(p. 250). In the first phase "only about half the batteries were allowed to come into action", to hide the
concentration. The second, "named by the Germans with good reason 'the week of suffering'", began on 2 April (BOH
p. 313). The schema has one start time, so the phases are recorded only in the rounds: the allocations add both phases
together.

The plan was set down in Appendix 15. Fire was concentrated on "important points such as trench junctions, m.g.
emplacements" rather than whole trench systems (para. 8(c)). Field guns kept destroyed works under fire against repair
(para. 8(b)). Gaps were cut in the wire with the 106 fuze (para. 8(h)). Approaches were harassed every night (para.
8(i)). BOH p. 313 repeats this: wire was to be destroyed outright only "in the case of the foremost lines of defence";
elsewhere lanes were cut. These four kinds of fire are the schema's four tasks: `wire`, `trench`, `harass` and
`battery`.

### Reading the ammunition table

BOH p. 315 n.2 prints, for the Canadian Corps, the rounds of each nature in each phase. The phase II column is split
into "Demolition" and "Counter-Battery". The rows run 18-pdr, 4.5-inch howitzer, 60-pdr, 6-inch gun, 6-inch howitzer,
8-inch, 9.2-inch, 12-inch and 15-inch howitzers, 2-inch trench mortar and 9.45-inch trench mortar. The OCR prints the
row labels and then 27 figures in a single run, without their rows. The figures are, in order:

> 155,000 · 492,000 · .. · 35,600 · 101,500 · 18,500 · 22,400 · 23,700 · 87,000 · 1,870 · 3,330 · 800 · 39,600 ·
> 11,900 · 102,000 · 7,000 · 9,270 } · 42,700 · 12,600 · 49 J · 649 · 8,190 · 5,910 · .. · 244 · 606 · ..

**The field rows read cleanly.** Read in threes (phase I, phase II demolition, phase II counter-battery), the first six
figures give:

- the 18-pdr: 155,000, 492,000 and none;
- the 4.5-inch howitzer: 35,600, 101,500 and 18,500.

Two printed totals check this reading:

- field, 155,000 + 492,000 + 35,600 + 101,500 + 18,500 = **802,600**, exactly BOH's "802,600 rounds of field
  ammunition" (p. 316 n.1);
- phase I, 155,000 + 35,600 = **190,600**, exactly `rca-ww1-history`'s "190,600 rounds of field ammunition" in the
  first phase.

**Why the 4.5-inch figures count as sourced.** They are entered as `source:` (BOH p. 315 n.2), not as estimates,
because the reading is checked twice: the field total and the phase I total each come out exact, and a misplaced
4.5-inch figure would break at least one of them. That is the same rule `historical.md` follows for BOH's casualty
tables: a row whose OCR reading a printed total confirms (the 13th Brigade's 381 against Nicholson's "approximately
380") is entered as sourced, while a row read without such a check (the 7th Brigade's interleaved row) is entered as an
estimate. The mortar rows and the heavy split below have no such check, so they are estimates. Only the
counter-battery column's attribution (18,500 to counter-battery, not demolition) rests on the column order alone; the
phase I check does not reach phase II's two columns, and the field total checks their sum only.

**The mortar rows are read by their pattern, an estimate.** The last six figures, 8,190 · 5,910 · .. · 244 · 606 · ..,
are two rows of three. Each has an empty counter-battery column, as mortars would. They are taken as the 2-inch mortars
(14,100) and the 9.45-inch mortars (850).

**The heavy rows cannot be read.** The fifteen figures between, 22,400 to 649, should fill seven rows (60-pdr to
15-inch). That is 21 cells, and the braces ("}", "J") show merged cells. They add to 364,868, against BOH's "333,100
rounds of heavy" (p. 316 n.1), so at least one figure is misread or misplaced. No assignment of them to rows fits both
BOH's total and `rca-ww1-history`'s phase I "over 85,000 rounds of heavy" without guessing.

So only totals are used for the heavies:

1. **Heavy rounds, 333,100**, from BOH p. 316 n.1.
2. **Counter-battery, 107,400.** `rca-ww1-history` gives "125,900 rounds in the week before 9 April". The same page's
   field figure matches this table exactly, so this is taken to be the table's counter-battery column. The 4.5-inch
   howitzers' 18,500 come off it, leaving 107,400 heavy rounds. (Four of the table's figures, 87,000 + 800 + 7,000 +
   12,600, do sum to 107,400, but their rows are not certain.)
3. **Demolition, 225,700**, the remainder.

The 225,700 demolition rounds are shared among the five howitzer entries by guns × each piece's sustained rate
(`tables/weapons-1917.yaml`, `rpm`). The weights are:

| Entry | Guns × rpm | Weight |
|---|---|---|
| `cdn-6in-how` | 104 × 1 | 104 |
| `cdn-8in-how` | 36 × 0.5 | 18 |
| `cdn-92in-how` | 36 × 0.5 | 18 |
| `cdn-12in-how` | 4 × 0.25 | 1 |
| `cdn-15in-how` | 3 × 0.2 | 0.6 |

The weights sum to 141.6. The 107,400 counter-battery rounds are shared between the 60-pdrs and the 6-inch guns by guns,
54 : 8. Howitzers in the counter-battery groups also fired counter-battery: each group had a 4.5-inch howitzer battery
and "one or more Heavy or Medium Howitzer batteries" (App. 15, para. 7(b)). Those rounds are not split out. The 12-inch
and 15-inch entries get 1,594 and 956 rounds. That is consistent with `rca-ww1-history`'s "180 12-inch and 270 15-inch
rounds" allotted to Thélus alone.

### The 18-pdr's tasks

The table gives the 18-pdr's rounds by phase, not by task, and no source read splits them. They are entered as an
estimate:

- **half on wire.** Both histories single out wire-cutting. Nicholson: "Particular attention was paid to cutting the
  German wire in the forward areas" (p. 249). BOH p. 313 says the foremost wire was to be destroyed outright.
- **a quarter on trenches.** Field guns kept destroyed works "under the fire of Field guns so as to prevent any work of
  repair" (App. 15, para. 8(b)).
- **a quarter on harassing fire**, by night on every approach (BOH p. 313). Communication trenches were "at frequent
  intervals raked with shrapnel" (p. 314).

The 647,000 rounds are shared between the creeping (320) and standing (112) 18-pdr entries by guns. The 48 silent
forward guns fired none: "these batteries remained silent and unseen by the enemy until they were required" (BOH
p. 307).

The howitzers' rounds are all `trench`. Some 4.5-inch and 6-inch rounds cut lanes in the rear wire with the 106 fuze
(BOH p. 313; App. 11, para. 2; App. 15, para. 8(h)), but no source read gives how many.

### Allocations

| Artillery | Task | Rounds | How |
|---|---|---|---|
| `cdn-18pdr-creeping` | wire / trench / harass | 239,630 / 119,815 / 119,815 | estimate: 647,000 × 320/432, then ½, ¼, ¼ |
| `cdn-18pdr-standing` | wire / trench / harass | 83,870 / 41,935 / 41,935 | estimate: 647,000 × 112/432, then ½, ¼, ¼ |
| `cdn-45in-how` | trench | 137,100 | sourced: 35,600 + 101,500 (BOH p. 315 n.2) |
| `cdn-45in-how` | battery | 18,500 | sourced (BOH p. 315 n.2) |
| `cdn-60pdr` | battery | 93,542 | estimate: 107,400 × 54/62 |
| `cdn-6in-gun` | battery | 13,858 | estimate: 107,400 × 8/62 |
| `cdn-6in-how` | trench | 165,768 | estimate: 225,700 × 104/141.6, rounded so the five sum to 225,700 |
| `cdn-8in-how` | trench | 28,691 | estimate: 225,700 × 18/141.6 |
| `cdn-92in-how` | trench | 28,691 | estimate: 225,700 × 18/141.6 |
| `cdn-12in-how` | trench | 1,594 | estimate: 225,700 × 1/141.6 |
| `cdn-15in-how` | trench | 956 | estimate: 225,700 × 0.6/141.6 |
| `cdn-medium-tm` | wire | 14,100 | estimate: the table's second-last row |
| `cdn-945in-tm` | trench | 850 | estimate: the table's last row |

Field 802,600 + heavy 333,100 + mortars 14,950: **1,150,650** rounds.

Some entries have no allocation:

- the silent forward 18-pdrs;
- the 13-pdrs and the barrage machine guns, which have no row in the table;
- the I Corps and First Army pieces. The table is the Canadian Corps'. The I Corps fired on Givenchy (BOH p. 313), but
  its rounds are not given.

## The wire

| Stretch | y | beltDepthM | Basis |
|---|---|---|---|
| `ger-first-position` | −4600…2552 | 13.7 (15 yards), estimate | "deep belts of wire" (BOH p. 305), no breadth given; 15 yards is the upper end of the Hindenburg Line's belts, built that winter (BOH p. 92) |
| `zwischen-stellung` | −4490…−2945 | 13.7, estimate | "dense entanglements both in front of and behind Thelus" (BOH p. 314), no breadth given |
| `thelus-trench` | −3072…−2446 | 13.7, estimate | "the strongly wired Thelus Trench" (BOH p. 333) |
| `ger-second-position` | −4245…−1920 | 36.6 (2 × 20 yards), estimate | two belts, "the first ... in places 20 yards broad" (BOH p. 336); the second's breadth taken as the first's |

Each stretch covers its whole feature, because the sources describe the wire along whole lines. The schema has one
belt per stretch, so the Second Line's two belts are summed. Its two belts "protected the line of concrete casemates
along the upper edges of Farbus Wood and the Bois de la Ville" (BOH p. 336). The 13th Brigade swung round to avoid "the
thick double belt of wire" running south-east from Count's Wood (`hussey-inman-1921` p. 153).

The Thélus Trench and Second Line stretches have no garrison company. The engine builds its trench segments only from
garrisons, so these belts have nothing to act on: a run lists each once in its `defaultsUsed`
(`bombardment.wire[thelus-trench] ← not applied (no garrison segment on the feature)`).

**What the wire did.** The 1st Division's assaulting companies carried 24 pairs of wire-cutters each, because "the
artillery fire would not have sufficiently reduced the wire on the right" (Nicholson p. 257). On the first position the
wire was mostly "torn remnants" (Nicholson p. 253). Uncut wire held up the attack in one place, the spared strong point
(below).

## The spared stretch

On Hill 145 a German strong point faced the 87th Battalion (Canadian Grenadier Guards), "commanding at 400 yards range
the exit of Tottenham Tunnel" (BOH p. 328). It was "destroyed early in the bombardment", but air photographs taken on
the 7th showed "that this fortification and its covering wire had been repaired" (BOH p. 328). Then "The heavy
artillery commander had desired to destroy it again", but "at the request of the infantry, who proposed to make use of
it when captured, it was allowed to remain" (BOH p. 328). Nicholson puts it as "a portion of German trench" left
"undestroyed by the heavy artillery at the request of the commanding officer" of the 87th (p. 259). Both histories say
the heavy artillery spared it.

What it cost:

- "machine-gun fire cut down half the 87th's leading wave" (Nicholson p. 259);
- "the wire prevented all attempts to rush the strong point" (BOH p. 328);
- the right of the 75th Battalion, in support, "was unable to leave the assembly trenches" (BOH p. 329);
- the second trench's garrison had time to man its position, and the 11th Brigade's left broke down;
- the 54th, its flank open, had to withdraw (Nicholson pp. 259-260).

BOH sums it up: "Only at Hill 145, where a section of wire had escaped destruction and the garrison had been given an
opportunity to occupy the position" was the French experience of 1915 repeated (p. 329).

The stretch is entered on `ger-first-position`, y −192 to −3. That is the right (southern) half of the 87th's frontage
as `oob-canadian.yaml` lays it out: −192 to 186, the 4th Division's sector split equally among its five first-wave
battalions. The strong point pinned the right of the 75th, which followed the 87th, while "the left of the 87th ... had
gone forward" (BOH p. 329). So it stood before the 87th's right. The band's edges are an estimate. The reason is
sourced (Nicholson p. 259; BOH p. 328).

### Who spared it, and what that means for the data

**"The heavy artillery" is the Corps Heavy Artillery.** BOH's "heavy artillery commander" commanded the Canadian
Corps' 245 heavy pieces (BOH p. 306 n.1, under the Br.-General Heavy Artillery, p. 306). In the data these are the
entries whose weapon is of kind `heavy` in `tables/weapons-1917.yaml`:

- `cdn-60pdr`, `cdn-6in-gun`, `cdn-6in-how`, `cdn-8in-how`, `cdn-92in-how`, `cdn-12in-how` and `cdn-15in-how`;
- the I Corps and First Army heavy pieces, which have no allocation here.

It does **not** include:

- the 4.5-inch howitzers (`cdn-45in-how`, kind `howitzer`). They were divisional field artillery (BOH p. 307 counts them
  with the 18-pdrs) and are not said to have spared anything;
- the 18-pdrs and 13-pdrs (kind `field-gun`);
- the trench mortars (kind `mortar`), under the divisions.

So the historical sparing is heavy-only, and the entry says so: `onlyKinds: [heavy]` (BOH p. 328). A `spared` band
takes no rounds from the weapon kinds it names (every kind when it names none), so the 4.5-inch howitzers, the field
guns and the mortars still fire on the stretch, and the heavy pieces' rounds go to the rest of the front. The sources
do not say that the field guns or mortars fired on it; nor do they say that they did not.

**The wire is the problem with heavy-only.** The outcome the sources give is that the strong point's covering wire
survived: it "had been repaired" by the 7th, "the wire prevented all attempts to rush the strong point" (BOH p. 328),
and "a section of wire had escaped destruction" (p. 329). The 18-pdrs fired 323,500 wire rounds and the medium mortars
14,100 (Allocations). If those reached this stretch in the model, its wire would be cut, against the sourced outcome.
Whether the field guns cut wire there after 7 April is an open question (below). The entry follows the attribution
(heavy only), so in the model the 18-pdrs' and mortars' wire rounds do cut this stretch, against the sourced outcome;
sparing it from all fire would match the outcome instead (Conflicts).

**Timing.** The stretch was not spared for the whole bombardment: it was "destroyed early in the bombardment" and left
alone only after the 7 April photographs showed it repaired (BOH p. 328). The schema's band spares it from 20 March.
That is recorded under Conflicts.

## Garrisons

**Machine guns: 2.25 a company, an estimate.**

- "Every infantry regiment has three machine gun companies ... One of these companies is attached to each battalion"
  (`german-handbook-1917` p. 49).
- The company of 6 guns had been "adopted as the standard unit" in August 1916 (p. 49), with "48 machine gunners (8 per
  gun)" (p. 50).
- Each regiment has 8 companies in the line in the scenario: its front and support battalions. Its third battalion
  rested off the map.
- The regiment's 18 guns over its 8 companies is 2.25.

If the resting battalion's machine-gun company rested with it, the figure is 1.5, the doctrine default (Conflicts).
The division's machine-gun marksman detachment is not added. One was "normally attached to each Infantry Division"
(p. 49), 18 more guns, but none is identified at Vimy in the sources read. As a check, not a target: the Corps took 124
machine guns in six days (Nicholson p. 265), and 56 garrisons × 2.25 is 126. No German light machine guns (`lewisGuns`)
are entered, because no source read counts the 08/15s at Vimy. The doctrine default (1 a company) applies.

**Dug-out depth, an estimate in two values.** BOH gives the range: "no amount of metal or explosive from above could
destroy the main German dug-outs and tunnels twenty to fifty feet down in the chalk" (p. 316). That is 6.1 to 15.2 m.

- **9.1 m (30 feet)** for the first position, the Zwölfer-Graben, La Folie Farm and the Pimple. The first and second
  trenches' dug-outs were "about 120 yards apart" (BOH p. 315). They were the "deep mined dug-outs" of the front system,
  which the Germans meant to replace with concrete shelters as "man-traps", a programme that "hardly got beyond the
  paper stage" (p. 353). So the lower half of the range is used.
- **15.2 m (50 feet)** where the sources name something deeper:
  - Hill 145, where "there were deep mine workings which secured the garrison from artillery fire" (BOH p. 327;
    Nicholson p. 259);
  - the Zwischen-Stellung at Les Tilleuls, with "the deep underground shelters of Thelus, Les Tilleuls and Givenchy"
    (BOH p. 310) and the Felsenkeller cave, where two battalion headquarters surrendered (p. 324).

## Companies

- **Officers and Lewis guns: not entered.** No source read gives a figure for any Canadian company on 9 April. The
  only basis is S.S. 143's company in the attack: an officer at the head of each platoon ("Headquarters — 1 officer and
  4 O. R.", p. 9), a Lewis gun section in each (p. 9), four platoons and a company commander (Appendix III, p. 22). That
  is the doctrine's `companyDefaults` (`bef-1917`: 5 officers, 4 Lewis guns), with the same reasoning. Copying it onto
  248 companies would add nothing and would not follow a change to the default, so the fields are left out. The engine
  applies the default and lists it in `defaultsUsed`. Nicholson notes the "liberal" supply of Lewis guns (p. 253 n.),
  which fits four a company. A value goes on a company only where a source gives that company's own figure; none was
  found. The CEF company's war establishment of officers was not read: the figure is not given here, and whether the
  second-in-command was left out of battle is the doctrine's assumption (Open questions).
- **Training: `rehearsed`** for every Canadian company:
  - "While units and formations were in reserve they rehearsed repeatedly on this model from platoon to divisional
    level" (Nicholson p. 250);
  - the 3rd and 4th Divisions had rehearsed since January, the 1st and 2nd for "a clear four weeks" (BOH p. 305);
  - battalion histories confirm it for the 85th, a reserve battalion ("the German lines were all taped out to scale",
    `hayes-1920` p. 46), and the 72nd (`mcevoy-finlay-1920` p. 45).

  The British 13th Brigade is also `rehearsed`. BOH says it "was not quite so fortunate" in time (p. 305), but its
  history has it "strenuously practising the attack over taped trenches" for a fortnight (`hussey-inman-1921` p. 153).
  The British 15th and 95th Brigades, in corps reserve, have no `training` and take the doctrine's.

## Artillery

| Field | Entries | Value | Basis |
|---|---|---|---|
| `ammunition` | the field guns: `cdn-18pdr-creeping` 416,000; `-standing` 145,600; `-forward` 62,400; `cdn-45in-how` 179,400; `cdn-13pdr` 26,000 | guns × 1,300 rounds, estimate | the 5th Division's artillery, attached to the 2nd Canadian Division, brought up "the vast quantity of ammunition required (1300 rounds per gun)" (`hussey-inman-1921` p. 150), the one per-gun figure found |
| `observation` | creeping, standing, field howitzers, heavy howitzers, barrage machine guns, I Corps field and howitzers, First Army pieces | `map` | barrages by timetable and barrage map (BOH p. 319 n.1; App. 15, para. 9: maps of the barrages issued down to company commanders); the howitzers lifted by the timetable (p. 319 n.1) |
| | `cdn-60pdr`, `cdn-6in-gun`, `i-corps-60pdr` | `aircraft` | No. 16 Squadron for "counter-battery work with the artillery" (BOH p. 311); neutralizing fire "controlled by air and ground observers" (App. 15, para. 7(f)) |
| | the two mortar entries | `forward-observer` | in the front trenches (BOH p. 314) |
| | the two German entries | `map` | "Most of the observation posts having been destroyed and the telephone cables cut, the batteries were also blind" (BOH p. 320) |
| `position` | Canadian field entries | (−2690, −1665), estimate | 2,500 yards behind `cdn-front` at the corps front's middle: BOH p. 307, "a maximum distance of 6,500 yards from the guns" for the 1st and 2nd Divisions' deepest objective, 4,000 yards |
| | Canadian heavy entries | (−3604, −1665), estimate | 1,000 yards farther back: the field line was "from 500 to 1,500 yards in front of the heavy batteries" (BOH p. 307); the heavies "in a thick cluster near Berthonval Farm, and near Carency" (p. 306) |
| | `cdn-18pdr-forward` | (−1495, −2217), the village of Neuville-St-Vaast | "dug in by night from 500 to 1,500 yards behind the front line, about Neuville St. Vaast" (BOH p. 307) |
| | `ger-gruppe-vimy-field` | (2819, −3794), estimate | between the Farbus Wood and Bois de la Ville centroids: the "concrete casemates along the upper edges of Farbus Wood and the Bois de la Ville" (BOH p. 336; p. 305) |
| | `ger-gruppe-vimy-heavy` | (2010, −2554), estimate | the Bois du Goulot centroid: two 8-inch (21-cm) and three 5.9-inch (15-cm) howitzers taken there (`hussey-inman-1921` p. 154; BOH p. 335) |
| `horseDrawn` | Canadian and I Corps field entries | true, estimate | horse-drawn field batteries: the 13-pdrs were the horse artillery (RCHA, RHA; `rca-ww1-history`); 50,000 horses in the Corps area (Nicholson p. 249) |
| | the German entries | true | "many of the horses of the German gun-teams and ammunition columns were affected by the gas" (BOH p. 320) |

Some fields are left out:

- **Ammunition for the heavy pieces, mortars, machine guns and German guns.** No per-gun stock was found. The
  tonnages are not split by nature or by corps:
  - BOH p. 307: "the bulk allotment for the Canadian and I. Corps being 42,609, and the daily allotment 2,465 tons"
    (Nicholson p. 249: "more than 42,500 tons in 'bulk', in addition to a daily quota of nearly 2500 tons");
  - App. 52: "40,300 tons" in front of the First Army's railheads on the day of attack, and 7,200 tons fired in the 24
    hours to noon on 9 April.

  The German shortage is recorded only in words (BOH pp. 320, 354).
- **Positions for the I Corps.** Its heavies were "on the northern slope of the Souchez valley, in and about the Bois de
  Bouvigny and de Noulette" and near Bully-Grenay (BOH p. 306), north of the frame's extent.
- **Positions for the First Army pieces, the mortars and the barrage machine guns.** None is given. A mortar entry is
  spread along the whole front, which one point cannot represent.
- **Traction for the heavy pieces.** No source read says whether they were horse- or tractor-drawn.

Every position is one point for an entry of up to 320 guns. The engine reads ranges and captures from that point.

**The consequence for the German guns.** Both German entries, all 197 pieces of the 79th Reserve and 1st Bavarian
Reserve Divisions (89 heavy, 108 field; BOH p. 353), stand at two points 1.5 km apart on the eastern slope: the field
guns by Farbus Wood and the Bois de la Ville, the heavies in the Bois du Goulot. The 79th Reserve Division held the
northern half of the front, opposite Hill 145, so its guns are placed some 3-4 km south of the front they covered. Under
the plan's capture rule (a battery is captured when a segment within 300 m of it is lost), taking the Second Line by
Farbus Wood would capture all 108 field guns at once, and the Bois du Goulot all 89 heavies: 197 pieces, against the
historical 54 guns of every calibre taken in six days (Nicholson p. 265; `historical.yaml`). Until the guns are placed
by battery or group (Open questions), a run's captured-guns count should not be compared with that target.

## Values entered

| Value | Source | Page | Quote (≤ 25 words) | Tier |
|---|---|---|---|---|
| bombardment.from 1917-03-20T12:00 | `boh-1917-1` | 315 n.2 | "The expenditure of ammunition during the two phases of the bombardment was" | official |
| two phases, half the batteries | `boh-1917-1` | 313 | "during its duration of thirteen days only about half the batteries were allowed to come into action" | official |
| start of the bombardment | `nicholson-1962` | 250 | "The preparatory bombardment began on 20 March" | official |
| heavy and field totals | `boh-1917-1` | 316 n.1 | "333,100 rounds of heavy and 802,600 rounds of field ammunition were fired, a total of 1,135,700" | official |
| phase I field check | `rca-ww1-history` | paragraphs on Vimy Ridge | "During the first phase, over 85,000 rounds of heavy and 190,600 rounds of field ammunition were fired." | secondary |
| counter-battery rounds | `rca-ww1-history` | paragraphs on Vimy Ridge | "The counter battery fire – 125,900 rounds in the week before 9 April – silenced 83% of the German guns." | secondary |
| 12-inch and 15-inch check | `rca-ww1-history` | paragraphs on Vimy Ridge | "180 12-inch and 270 15-inch rounds were allotted for this task" | secondary |
| 18-pdr wire share | `nicholson-1962` | 249 | "Particular attention was paid to cutting the German wire in the forward areas" | estimate |
| 18-pdr trench share | `boh-1917-appendices` | App. 15, para. 8(b) | "kept under the fire of Field guns so as to prevent any work of repair being carried out" | estimate |
| 18-pdr harass share | `boh-1917-1` | 314 | "these were at frequent intervals raked with shrapnel" | estimate |
| forward 18-pdrs silent | `boh-1917-1` | 307 | "these batteries remained silent and unseen by the enemy until they were required" | official |
| 4.5-inch in counter-battery | `boh-1917-appendices` | App. 15, para. 7(b) | "one or more Heavy or Medium Howitzer batteries in addition to the 60-pdr." (each group's 4.5-inch battery is in the same sentence) | official |
| mortars' tasks | `boh-1917-1` | 314 | "The task of the heavy mortars was demolition, that of the medium and the Stokes principally wire-cutting" | official |
| wire, foremost lines only | `boh-1917-1` | 313 | "the total destruction of wire entanglements was out of the question except in the case of the foremost lines of defence" | official |
| wire, first position | `boh-1917-1` | 305 | "In addition to the trench lines, protected by deep belts of wire" | estimate |
| wire, belt depth basis | `boh-1917-1` | 92 | "generally in three belts, each ten to fifteen yards in depth and five yards or more apart" | estimate |
| wire, Zwischen-Stellung | `boh-1917-1` | 314 | "the cuttings of lanes in dense entanglements both in front of and behind Thelus" | estimate |
| wire, Thélus Trench | `boh-1917-1` | 333 | "the strongly wired Thelus Trench, the intermediate line" | estimate |
| wire, Second Line | `boh-1917-1` | 336 | "The first belt of wire, in places 20 yards broad ... followed the crest, while the second lay 200 yards down the slope" | estimate |
| wire, Second Line | `hussey-inman-1921` | 153 | "thus avoiding an advance through the thick double belt of wire, which ran from Count's Wood in a South-East direction" | secondary |
| spared stretch, reason | `nicholson-1962` | 259 | "A portion of German trench had been left undestroyed by the heavy artillery at the request of the commanding officer" | official |
| spared stretch, cost | `nicholson-1962` | 259 | "From this position machine-gun fire cut down half the 87th's leading wave" | official |
| spared stretch, why | `boh-1917-1` | 328 | "at the request of the infantry, who proposed to make use of it when captured, it was allowed to remain" | official |
| spared stretch, by whom | `boh-1917-1` | 328 | "The heavy artillery commander had desired to destroy it again" | official |
| spared stretch, weapon kinds (`onlyKinds: [heavy]`) | `boh-1917-1` | 328 | "The heavy artillery commander had desired to destroy it again" | official |
| spared stretch, wire repaired | `boh-1917-1` | 328 | "this fortification and its covering wire had been repaired" | official |
| spared stretch, wire held | `boh-1917-1` | 328 | "the wire prevented all attempts to rush the strong point" | official |
| spared stretch, wire | `boh-1917-1` | 329 | "Only at Hill 145, where a section of wire had escaped destruction" | official |
| spared stretch, y band | `boh-1917-1` | 329 | "of the 75th (Central Ontario) Battalion in support was unable to leave the assembly trenches" | estimate |
| machineGuns 2.25 | `german-handbook-1917` | 49 | "Every infantry regiment has three machine gun companies, numbered 1st, 2nd and 3rd. One of these companies is attached to each battalion" | estimate |
| machineGuns 2.25 | `german-handbook-1917` | 49 | "the machine gun company of 6 guns was adopted as the standard unit" | estimate |
| dugoutDepthM range | `boh-1917-1` | 316 | "the main German dug-outs and tunnels twenty to fifty feet down in the chalk" | estimate |
| dugoutDepthM 9.1 | `boh-1917-1` | 315 | "The garrisons of the deep dug-outs, situated about 120 yards apart in the first and second trenches" | estimate |
| dugoutDepthM 9.1 | `boh-1917-1` | 353 | "concrete shelters in the front system to replace deep mined dug-outs, which were now considered to be man-traps" | estimate |
| dugoutDepthM 15.2, Hill 145 | `boh-1917-1` | 327 | "near the front line there were deep mine workings which secured the garrison from artillery fire" | estimate |
| dugoutDepthM 15.2, Les Tilleuls | `boh-1917-1` | 310 | "the deep underground shelters of Thelus, Les Tilleuls and Givenchy" | estimate |
| training rehearsed | `nicholson-1962` | 250 | "While units and formations were in reserve they rehearsed repeatedly on this model from platoon to divisional level" | official |
| training rehearsed | `boh-1917-1` | 305 | "Ever since January, the 3rd and 4th Canadian Divisions had been able to rehearse their parts" | official |
| training rehearsed (85th) | `hayes-1920` | 46 | "Back at Chateau de la Haie the German lines were all taped out to scale" | secondary |
| training rehearsed (72nd) | `mcevoy-finlay-1920` | 45 | "the rest period was spent in practising the forthcoming attack" | secondary |
| training rehearsed (13th Brigade) | `hussey-inman-1921` | 153 | "For the past fortnight the 13th Brigade had been strenuously practising the attack over taped trenches" | secondary |
| ammunition, bulk allotment (not entered) | `boh-1917-1` | 307 | "the bulk allotment for the Canadian and I. Corps being 42,609, and the daily allotment 2,465 tons" | official |
| field ammunition 1,300 a gun | `hussey-inman-1921` | 150 | "the vast quantity of ammunition required (1300 rounds per gun)" | estimate |
| forward batteries | `hussey-inman-1921` | 153 | "whose positions were so close up that they could not with safety fire before" | secondary |
| field position | `boh-1917-1` | 307 | "that is, a maximum distance of 6,500 yards from the guns" | estimate |
| heavy position | `boh-1917-1` | 307 | "The line of the field artillery was from 500 to 1,500 yards in front of the heavy batteries" | estimate |
| forward position | `boh-1917-1` | 307 | "dug in by night from 500 to 1,500 yards behind the front line, about Neuville St. Vaast" | official |
| German field position | `boh-1917-1` | 336 | "the line of concrete casemates along the upper edges of Farbus Wood and the Bois de la Ville" | estimate |
| German heavy position | `hussey-inman-1921` | 154 | "the K.O.S.B. capturing two 8-inch howitzers, and the West Kents three 5'9's" | estimate |
| German observation map | `boh-1917-1` | 320 | "Most of the observation posts having been destroyed and the telephone cables cut, the batteries were also blind" | official |
| German horseDrawn | `boh-1917-1` | 320 | "many of the horses of the German gun-teams and ammunition columns were affected by the gas" | official |
| counter-battery observation | `boh-1917-1` | 311 | "for reconnaissance within 4,000 yards of the front line, and for counter-battery work with the artillery" | official |

## Conflicts

- **Machine guns in the line: 2.25 or 1.5 a company.** The handbook attaches one machine-gun company to each battalion
  (`german-handbook-1917` p. 49). If each company stayed with its battalion, the resting battalion's 6 guns were off the
  map, which gives 1.5 a company. If the regiment's three companies held the line, it gives 2.25. The working value,
  2.25, follows the method chosen for this data: the regiment's machine-gun companies spread over its companies in the
  line. Nicholson's 124 machine guns captured in six days (p. 265) is closer to 126 than to 84, but it includes guns
  taken from reserves and on 10-12 April.
- **When the first phase began: 20 March, or 3-4 weeks before Zero.** BOH and Nicholson say 20 March (BOH p. 313;
  Nicholson p. 250). The First Army plan of 31 January intended "to commence destruction and wire-cutting 3 or 4 weeks
  before Z day, and to limit the bombardment proper to 48 hours" (App. 11, para. 6). The table's dates are used.
- **The heavy rows of BOH's table** do not sum to BOH's own heavy total in the OCR (364,868 against 333,100; "Reading
  the ammunition table"). Only the totals are used.
- **The total of all rounds.** BOH's 1,135,700 has no mortar rounds; the table's mortar rows add 14,950. Nicholson has
  "More than a million rounds of heavy and field ammunition" (p. 251); BOH p. 315 has "nearly a million shells". These
  agree in size.
- **The 87th's frontage.** BOH gives the 102nd and 87th "each ... a frontage of 500 yards" (p. 328), 457 m. The scenario
  has 378 m, the 4th Division's sector split equally among five battalions (`oob-canadian.md`). The spared band follows
  the scenario's frontage.

- **The spared stretch: heavy-only, or all fire.** Both sources say the heavy artillery spared it (Nicholson p. 259;
  BOH p. 328: "The heavy artillery commander had desired to destroy it again"). Its covering wire survived and stopped
  the attack (BOH pp. 328-329). The field guns and medium mortars cut wire elsewhere, and no source says whether they
  fired on this stretch. The data spares it from the heavies only (`onlyKinds: [heavy]`, the attribution), which lets
  the 18-pdrs' and mortars' wire rounds cut it in the model, against the outcome (the wire held); sparing it from all
  fire would match the outcome instead. The two readings cannot both be kept until the field guns' fire there is known.
- **The spared stretch: from when.** It was "destroyed early in the bombardment" and left alone only after the
  photographs of 7 April showed it repaired (BOH p. 328). The schema's band spares it for the whole bombardment, from
  20 March, so the model's strong point takes no early damage either.

## Open questions for the historian

- **BOH's ammunition table (vol. I, p. 315 n.2), row by row.** The OCR loses the heavy rows (Reading the ammunition
  table). A clean scan or the printed page would give each heavy piece's rounds by phase and by demolition or
  counter-battery, in place of the estimates here. The archive.org page images are served from a host outside the
  allowed list (checked 2026-11-21), so they were not read.
- **How the field guns' bombardment rounds divided** between wire-cutting, keeping demolished works under fire and
  night harassing fire. The split entered, half, a quarter and a quarter, is a guess. The divisional artillery
  programmes or Canadian Corps Artillery Instruction No. 1 would settle it.
- **How many of the howitzers' rounds cut wire** with the 106 fuze (App. 15, para. 8(h)). None is entered as wire.
- **The breadth of the wire** in front of the first position and the Zwischen-Stellung. 15 yards is borrowed from the
  Hindenburg Line. The second belt in front of the Second Line is taken as broad as the first.
- **The spared stretch's extent.** How long was the stretch of trench opposite the 87th left unbombarded, and where did
  it lie in the 87th's frontage? The band entered is the right half of the frontage. The 87th's war diary or a trench
  map of Hill 145 would place it. Was any other stretch spared for the same reason?
- **Did the field guns fire on the spared stretch, or cut its wire, after 7 April?** The heavy artillery left it alone
  (BOH p. 328; Nicholson p. 259), and its covering wire survived and stopped the 87th (BOH pp. 328-329). Were the 18-pdrs
  and the medium mortars also told to leave it, or did their wire-cutting simply fail there? The answer decides whether
  the stretch is spared from the heavies only or from all fire (Conflicts).
- **German machine guns at Vimy.** Was the resting battalions' machine-gun company in the line, as entered, or with its
  battalion? Did the 79th Reserve, 1st Bavarian Reserve and 16th Bavarian Divisions have a machine-gun marksman
  detachment on the ridge? How many 08/15 light machine guns had reached the companies by 9 April? The regimental
  histories BOH cites (p. 352 n.2), or Dieterich's article in *Canadian Military History* 15:1, would answer it.
  scholars.wlu.ca served a Cloudflare challenge in earlier checks, so the article was not read.
- **Dug-out depths by position.** The 30 and 50 feet entered are points within BOH's "twenty to fifty feet". German
  engineer records or post-battle surveys of the captured dug-outs would give real depths.
- **Officers in action.** What was the CEF infantry company's war establishment of officers in 1917, and how many
  officers did a Canadian company take into the attack on 9 April? Was the second-in-command left out of battle? How
  many Lewis guns did each battalion actually have? Company-specific figures would replace the doctrine defaults.
- **Ammunition for the battle.** The heavy batteries', the mortars' and the German batteries' stocks on 9 April. The
  1,300 rounds a gun is the 5th Division's artillery, applied to every field gun.
- **Battery positions.** Map 7 marks divisional, medium and heavy batteries and super-heavy guns with separate symbols.
  A census of them, by class, would place each artillery entry better than the one point from BOH's distances. The
  symbols are too small and too close to the map's red lettering for the colour-component method used for the frame's
  extent. Also: where were the German batteries of Group Vimy, battery by battery or by group, beyond the casemates in
  the eastern woods? As entered, the 197 German pieces stand at two points, so a run that takes Farbus Wood and the Bois
  du Goulot captures all of them at once, against the 54 guns actually taken in six days (Artillery).
- **Traction of the heavy pieces.** Which heavy and siege batteries were horse-drawn and which tractor-drawn?
