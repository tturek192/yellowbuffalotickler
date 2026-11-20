# Vimy research: the historical results

This note covers `scenarios/vimy-1917/historical.yaml`, the targets the simulator is tested against: when each of the
twelve division objective lines fell, casualties (the Corps, brigades, battalions, and two German divisions), prisoners,
captured guns, when the German reserves arrived, and when the battle ended. It also covers the replacement of the Plan 1
draft's estimates (`scenarios/vimy-1917/1cdn-3bde-draft.yaml`).

**Summary.** 12 objective windows; 18 casualty entries (3 Corps totals, 8 brigades, 1 division, 4 battalions, 2
German divisions); 2 prisoner counts; captured guns, mortars and machine guns for 9-14 April; 12 reserve arrivals; and
`endedAt`. Every value cites `nicholson-1962` or `boh-1917-1` (both official) or is an estimate with its reasoning;
`historicalTierRule` finds no problem. The owner's brief (`vimy-brief-2026`) was used only as a list of leads.

**Everything here is a draft for the owner and the historian.** The war diaries, the Canadian Corps Report on
Operations and the German sources behind these figures were not read; both official histories were written from them
(Nicholson's notes cite the diaries; BOH's German figures are "given by German authority", p. 341 n.1).

## Sources

| id | Tier | Used for |
|---|---|---|
| `nicholson-1962` | official | Line times (pp. 254-257, 261); the timetable's 1:18 p.m. (p. 248); Canadian casualties for 9-10 and 9-14 April (pp. 261, 265); battalion losses (pp. 255, 261, 263); prisoners (pp. 261, 265); guns, mortars and machine guns captured (p. 265); the 14th Bavarian battalion at the Pimple (p. 260); the Pimple (p. 263); the battle's end (p. 265). |
| `boh-1917-1` | official | The timetable in Zero-plus minutes (p. 304); line times (pp. 322-326, 334, 341-343); casualty tables by brigade (pp. 339 n.1, 342 n.1); the Corps' 7-14 April total (p. 342 n.1); the 50th Battalion (p. 343); German division losses and prisoners counted (p. 341 n.1); the German reserves (pp. 277, 338 n.1, 345 n.3, 354-356); 14 April (p. 351). |

Page numbers are the printed ones. In the BOH OCR text a page's number stands at its top; some are misread ("388" for
338, "380" for 330, "820" for 320) and were placed from their neighbours.

## Objective lines

A line's window brackets when it fell: `earliest` is the first time the sources allow, `latest` the time by which it is
reported taken. Where the narrative gives no earlier time the timetable's minute is the earliest, as the barrage did not
reach a line before then. Those earliest times (red-3cdn, blue-1cdn, blue-2cdn, brown-1cdn, brown-2cdn, and the draft's
blue and brown) are entered as **estimates**, lower bounds from the timetable, not reported capture times. black-3cdn's
"in the allotted time" and red-2cdn's "up to time" are reported captures, at the timetable minute, so they stay sourced.

| Line | Earliest | Latest | Sources and reasoning |
|---|---|---|---|
| black-1cdn | 06:05 | 06:15 | BOH p. 322: in possession of the Zwölfer-Graben "by 6.5 a.m."; Nicholson p. 254: reported "by 6:15" |
| black-2cdn | 06:05 | 06:15 | BOH p. 323: the third trench "By 6.5 a.m."; Nicholson p. 254 |
| black-3cdn | 06:05 | 06:25 | BOH p. 325: "in the allotted time" (Zero+35, p. 304); Nicholson p. 255: confirmed "by 6:25" |
| black-4cdn | 18:45 | 04:15 on 10 April | BOH p. 341: the 85th's two companies "started off ... at 6.45 p.m." and took the trench and road short of the summit; BOH p. 342: the third trench beyond the summit found empty and occupied at 4.15 a.m. |
| red-1cdn | 07:05 | 08:00 | BOH p. 323: "Shortly after 7 a.m.", less 500 yards taken by the 1st Battalion from 7.40; Nicholson p. 255: "By eight o'clock" |
| red-2cdn | 07:05 | 08:00 | BOH p. 324: "up to time" (Zero+95); Nicholson p. 255 |
| red-3cdn | 07:05 | 07:30 | BOH p. 304: Zero+95; Nicholson p. 255 and BOH p. 326: "7:30" |
| red-4cdn | 15:00-15:15 on 10 April (disputed) | 16:00 on 10 April (estimate) | BOH p. 342: barrage at 3 p.m.; Nicholson p. 261: in position by 3:15; BOH p. 343: cleared "Within thirty minutes"; the 12th Brigade's last objective "at mid-afternoon" (Nicholson p. 261) |
| blue-1cdn | 10:50 | 11:15 | BOH p. 304: Zero+5 h 20 min; BOH p. 334: "By 11.15 a.m."; Nicholson p. 256: "shortly after eleven o'clock" |
| blue-2cdn | 10:50 | 11:30 (estimate) | BOH p. 304; Nicholson p. 256: the 2nd Division "a little later" than the 1st |
| brown-1cdn | 13:18 | 14:40 | Nicholson p. 248: "by 1:18 p.m."; Nicholson p. 257: "at 2:40, as soon as the capture of the Brown Line seemed assured" |
| brown-2cdn | 13:18 | 14:40 | as brown-1cdn |

The spec's leads ("the Black Line about Zero plus 45-55 minutes, the Blue Line about 11:00, the Brown Line about 14:00")
fit these windows except the Black Line, which the official histories put at 35-55 minutes (6:05-6:25).

**The 4th Division's lines.** BOH's plan has the first onset carry "the three successive trenches which formed the German
first system", placing the 4th Division "in possession of Hill 145", and its second the Hangstellung on the eastern
slope (p. 304). On the 11th Brigade's front the 102nd held its half at once; the 87th's front was held up all day; at 1
p.m. bombers took the front trench (BOH pp. 340-341); at 6.45 p.m. the 85th took the second trench and the near-side
road (p. 341); at 4.15 a.m. on the 10th the 85th and 75th occupied the third trench beyond the summit (p. 342). On the
12th Brigade's front the 73rd took its trench "within seven minutes" (p. 330) but the 72nd and 78th held only parts of
the second and third trenches, and "Night fell with the main objectives still untaken" (Nicholson p. 261). So black-4cdn
fell between 18:45 on the 9th and 04:15 on the 10th, and red-4cdn, the Hangstellung, on the afternoon of the 10th.

**The Pimple, 12 April**, is the feature `the-pimple`, not an objective line, so it has no `objectives` entry (the
schema has no other place for a line-less capture). Its capture is recorded in `historical.yaml`'s header comment, in
the 46th Battalion's casualties and as the lower bound of `endedAt`: the 10th Brigade attacked at 5 a.m.; the 50th
reached its objective "about 5.45 a.m." and the 44th the Pimple "By 6 a.m." (BOH p. 346); the 46th reported the left
flank secure "in another two hours" (Nicholson p. 263).

## Casualties

| Who | Window | Total | Killed | Wounded | Missing | Source |
|---|---|---|---|---|---|---|
| Canadian Corps (Canadians) | 9-10 Apr | 7,707 | 2,967 fatal | — | — | Nicholson p. 261 |
| Canadian Corps (Canadians) | 9-14 Apr | 10,602 | 3,598 fatal | — | — | Nicholson p. 265 |
| Canadian Corps | 7-14 Apr | 11,297 | — | — | — | BOH p. 342 n.1 |
| 1st Brigade (`1bde`) | 9 Apr | 465 | 89 | 300 | 76 | BOH p. 339 n.1 |
| 2nd Brigade (`2bde`) | 9 Apr | 1,109 | 279 | 790 | 40 | BOH p. 339 n.1 |
| 4th Brigade (`4bde`) | 9 Apr | 750 | 147 | 526 | 77 | BOH p. 339 n.1 |
| 5th Brigade (`5bde`) | 9 Apr | 755 | 120 | 384 | 251 | BOH p. 339 n.1 |
| 6th Brigade (`6bde`) | 9-10 Apr | 527 | 90 | 437 | — | BOH p. 339 n.1 (about 133 on the 10th) |
| 13th British Brigade (`13bde-brit`) | 9 Apr | 381 | 41 | 323 | 17 | BOH p. 339 n.1; Nicholson p. 261 "approximately 380" |
| 7th Brigade (`7bde`) | 9 Apr | 965 | 192 | 606 | 167 | estimate: the builder's reading of BOH p. 342 n.1's broken OCR (below) |
| 12th Brigade (`12bde`) | 9 Apr | 1,344 | 317 | 891 | 136 | BOH p. 342 n.1 |
| 2nd Division (`2cdn`) | 9-10 Apr | 2,413 | — | — | — | estimate: the 4th, 5th, 6th and 13th Brigades added |
| 21st Battalion (`21bn`) | 9 Apr, to the Red Line | 215 | — | — | — | Nicholson p. 255 |
| 25th Battalion (`25bn`) | 9 Apr | 250 (more than) | — | — | — | Nicholson p. 255 |
| 50th Battalion (`50bn`) | 10 Apr | 229 (229-240) | — | — | — | BOH p. 343; Nicholson p. 261 (disputed) |
| 46th Battalion (`46bn`) | 12 Apr | 108 | — | — | — | Nicholson p. 263 |
| 79th Reserve Division (`79rd`) | 1-11 Apr | 3,473 | — | — | — | BOH p. 341 n.1 (80 officers, 3,393 other ranks) |
| 1st Bavarian Reserve Division (`1brd`) | 1-11 Apr | 3,133 | — | — | — | BOH p. 341 n.1 (112 officers, 3,021 other ranks) |

**Reading BOH's tables.** The two tables (pp. 339 n.1 and 342 n.1) give, for each brigade, officers and other ranks
killed, wounded and missing, "approximately". The OCR prints each row's numbers in sequence, with ". ." for a blank;
read as officers (killed, wounded, missing) then other ranks (killed, wounded, missing), the 13th British Brigade's row
adds to 381, which Nicholson gives as "approximately 380" (p. 261): that confirms the order. Entered totals add officers
and other ranks. Rows not entered: the 3rd Brigade (only "993" survives for its other ranks), and the 8th and 11th
Brigades, whose numbers on p. 342 cannot be assigned to rows with confidence. The 7th Brigade's row comes out of the OCR
as `Killed 11 181 - . Wounded 30 576 Missing 167`, the column headings interleaved with the numbers, unlike every other
row. It is read as officers 11 killed, 30 wounded, none missing ("- ."), and other ranks 181 killed, 576 wounded, 167
missing, the officers-then-other-ranks order that the 13th Brigade's row checks (381 against Nicholson's "approximately
380"). That reading is the builder's, not a printed figure, so all four values (965, 192, 606, 167) are entered as
**estimates** whose text gives the token sequence, the reading and the cross-check. BOH p. 346 n.2's table for the 44th, 50th and 46th Battalions on 12 April is unreadable.

The German figures include the bombardment from 1 April and exclude the attached battalions of other divisions; "Nor,
of course, do they include the casualties of the first stage of the bombardment" (BOH p. 341 n.1). The spec notes that
the engine must produce bombardment casualties to compare like with like.

## Prisoners and captured weapons

| Value | Window | Source | Note |
|---|---|---|---|
| 3,404 (3,400-3,404, disputed) | 9 April, to midnight | BOH p. 341 n.1 (62 officers, 3,342 other ranks); Nicholson p. 261 ("about 3400") | the same count; "more were still coming in" |
| 4,000 (more than) | 9-14 April | Nicholson p. 265 | a lower bound |
| 54 guns, 104 trench mortars, 124 machine guns | 9-14 April | Nicholson p. 265 | BOH p. 337 n.1: 31 pieces taken by the 1st and 2nd Divisions on 9 April |

The spec's leads, "3,404 to about 4,000" prisoners and "54 or 63" guns, are a difference of window for the prisoners
(9 April against 9-14 April), so both are entered with their windows. No source read gives 63 guns (Open questions), so
the guns are a single sourced value, not a disputed one.

## Reserve arrivals

Formation ids are `oob-german.yaml`'s. BOH converts German times to British (p. 318 n.2: "2.30 a.m. (British time)").

| Formation | Arrived | Where | How |
|---|---|---|---|
| `rir262-iii`, `ir118-i`, `rir34-iii` | 20:00, 9 Apr | La Chaudière, for the Hill 135 counter-attack; used to fill gaps | estimate: BOH p. 355 "already dark"; p. 354 "after nightfall" |
| `rir225-i` | 16:30, 9 Apr | Arleux, then towards Willerval | estimate: BOH p. 338 n.1 "newly arrived in Arleux" when ordered to retake Willerval, after the 4.20 p.m. cavalry patrols |
| `bir6-iii`, `bir21-iii` | 20:00, 9 Apr | behind the 1st Bavarian Reserve Division | estimate: BOH p. 277 "After dusk" (III./21st); p. 355 |
| `bir11-iii` | 17:00, 9 Apr | southern Givenchy | estimate: BOH p. 355 "in position by late afternoon" |
| `brir21-i` | 17:00, 9 Apr | behind the Bois de l'Hirondelle | estimate: BOH p. 355 |
| `bir14-i` | 00:00, 10 Apr | the Pimple | Nicholson p. 260 "It was midnight before the troops reached the Pimple"; BOH p. 355 |
| `111id`, `17id` | 06:00, 10 Apr | the 79th Reserve and 1st Bavarian Reserve Divisions' lines | estimate: BOH p. 356 "Early on the 10th" |
| `4gd` | 18:00, 10 Apr (06:00-18:00, disputed) | Givenchy and the Souchez valley | BOH p. 356 "Early on the 10th" (its 5th Guard Grenadiers); BOH p. 345 n.3 "on the evening of 10th April" |

**Dark on 9 April.** Computed with the NOAA solar-position formulas for 50.38° N, 2.77° E on 9 April 1917: sunset
18:32 GMT, end of civil twilight 19:06 GMT. British Summer Time (GMT+1) is taken to be in force, which fits the
timetable: Zero, 5:30, "set to coincide with first light" (Nicholson p. 253), is civil dawn (04:35 GMT, 05:35 BST).
So sunset about 19:30 and dark about 20:00 British time.

The spec's leads: "local counterattacks within 1-3 hours" (none arrived so soon: the earliest, `rir225-i`, about 11
hours after Zero); "the divisional counterattack ordered at about noon and launched at 18:00" (BOH p. 354: ordered at
11 a.m. for 3 p.m., in position only after nightfall); "the 111th Division at the third line on the evening of 9 April"
(BOH p. 356 n.1 gives no time: it "happened to be passing through the area on its way north"); "the 4th Guards Division on 11 April" (BOH puts
it on the 10th).

## The end of the battle

`endedAt` is disputed: working value 08:00 on 12 April, range to 18:00 on 14 April. The 18:00 is a chosen hour for
BOH's "By evening" (p. 351), which gives no time, and the same hour taken for "evening" in the 4th Guard Division's
arrival. The scenario covers 9-12 April, and
the ridge was wholly in Canadian hands when the 46th reported the left flank secure about 8 a.m. on the 12th (Nicholson
p. 263). The official battle ran to 14 April: "With the completion of this limited exploitation the Battle of Vimy
Ridge ended" (Nicholson p. 265), the outpost line running east of Bailleul to the Bois de l'Hirondelle "By evening" on
the 14th (BOH p. 351).

## The Plan 1 draft's estimates (Step 4)

`1cdn-3bde-draft.yaml` is a schematic of the 1st Division's 3rd Brigade sector with four lines, `black`, `red`, `blue`
and `brown`. Its eight `historical` values were estimates from the owner's brief, "to be replaced by a primary, official
or scholarly citation in Task 10". They now cite the same sources as the 1st Division's lines above, and the draft's
own source list gains `nicholson-1962` and `boh-1917-1`. Six now cite them; the blue and brown earliest times, which are
the timetable's minutes, stay estimates and say so:

| Line | Was (estimate) | Now | Source |
|---|---|---|---|
| black | 06:15-06:25 | 06:05-06:15 | BOH p. 322; Nicholson p. 254 |
| red | 07:00-07:30 | 07:05-08:00 | BOH p. 323; Nicholson p. 255 |
| blue | 11:00-11:00 | 10:50-11:15 | BOH p. 304 (earliest: timetable lower bound, an estimate); BOH p. 334 |
| brown | 14:00-14:00 | 13:18-14:40 | Nicholson p. 248 (earliest: timetable lower bound, an estimate); p. 257 |

The 3rd Brigade itself stopped at the Red Line (the 1st Brigade went on to the Blue and Brown); the draft's lines are
the division's, so the division's times are used.

## Values entered

| Value | Source | Page | Quote (≤ 25 words) | Tier |
|---|---|---|---|---|
| black-1cdn earliest 06:05 | `boh-1917-1` | 322 | "by 6.5 a.m. half an hour after the start, the 1st Canadian Division was in possession of the Zwölfer-Graben" | official |
| black-1/2cdn latest 06:15 | `nicholson-1962` | 254 | "Both the 1st and 2nd Divisions were reported at the Black Line by 6:15" | official |
| black-2cdn earliest 06:05 | `boh-1917-1` | 323 | "By 6.5 a.m. the four battalions, after a steady uphill advance, had reached the line of the third trench" | official |
| black-3cdn earliest 06:05 | `boh-1917-1` | 325 | "reached the third trench in the allotted time" | official |
| black-3cdn latest 06:25 | `nicholson-1962` | 255 | "by 6:25 the capture of the Black Line by both brigades had been confirmed" | official |
| black-4cdn earliest 18:45 | `boh-1917-1` | 341 | "Despite the absence of artillery fire, they started off across No Man's Land at 6.45 p.m." | official |
| black-4cdn latest 04:15 | `boh-1917-1` | 342 | "At 4.15 a.m. on the 10th patrols were sent forward towards the German third trench beyond the summit, and found it empty" | official |
| red-1cdn earliest 07:05 | `boh-1917-1` | 323 | "Shortly after 7 a.m. the division had taken its second objective, the intermediate line" | official |
| red-1/2cdn latest 08:00 | `nicholson-1962` | 255 | "By eight o'clock the 1st and 2nd Divisions were reported on the Red Line" | official |
| red-2cdn earliest 07:05 | `boh-1917-1` | 324 | "Both brigades had reached their objectives up to time" | official |
| red-3cdn earliest 07:05 | estimate (timetable lower bound) | BOH p. 304 | "at Zero plus 95 minutes according to the time-table, have reached their final objectives" | estimate |
| red-3cdn latest 07:30 | `nicholson-1962` | 255 | "the 3rd Division had reached the crest at 7:30 and occupied the western edge of the Bois de la Folie" | official |
| red-4cdn earliest 15:00 | `boh-1917-1` | 342 | "The barrage ... opened at 3 p.m. on the Hangstellung" | official |
| red-4cdn earliest 15:15 | `nicholson-1962` | 261 | "By 3:15 next afternoon Brig.-Gen. Hilliam's two uncommitted battalions were in position on Hill 145" | official |
| red-4cdn latest 16:00 | estimate | BOH p. 343; Nicholson p. 261 | "Within thirty minutes the brilliant action of the two battalions had cleared all the dug-outs" | estimate |
| blue-1/2cdn earliest 10:50 | estimate (timetable lower bound) | BOH p. 304 | "was to be concluded at Zero plus 5 hours, 20 minutes" | estimate |
| blue-1cdn latest 11:15 | `boh-1917-1` | 334 | "By 11.15 a.m. the brigade had reached the Roclincourt—Vimy track" | official |
| blue-2cdn latest 11:30 | estimate | Nicholson p. 256 | "Capture of the Blue Line was reported by the 1st Division shortly after eleven o'clock, and a little later by the 2nd" | estimate |
| brown earliest 13:18 | estimate (timetable lower bound) | Nicholson p. 248 | "the whole of the eastern escarpment would be in Canadian hands by 1:18 p.m." | estimate |
| brown latest 14:40 | `nicholson-1962` | 257 | "at 2:40, as soon as the capture of the Brown Line seemed assured, General Byng had telephoned the First Army" | official |
| Corps 7,707 / 2,967 | `nicholson-1962` | 261 | "Canadian casualties in the two days' fighting totalled 7707, of which 2967 were fatal" | official |
| Corps 10,602 / 3,598 | `nicholson-1962` | 265 | "Canadian casualties (for the period 9-14 April) of 10,602 all ranks—3598 of them fatal" | official |
| Corps 11,297 | `boh-1917-1` | 342 n.1 | "The total casualties of Canadian Corps during the period 7th-14th April 1917 were 11,297" | official |
| brigade casualties | `boh-1917-1` | 339 n.1 | "The casualties of the 1st and 2nd Canadian Divisions were approximately as follows" | official |
| 12th Brigade casualties; 7th Brigade (estimate) | `boh-1917-1` | 342 n.1 | "The casualties of the four brigades of the 3rd and 4th Canadian Divisions which took part in the original attack" | official |
| 6th Brigade window | `boh-1917-1` | 339 n.1 | "The losses of the 6th Canadian Brigade above include about 133 casualties suffered next day" | official |
| 13th Brigade 381 | `nicholson-1962` | 261 | "To these must be added the 13th British Brigade's losses on Easter Monday—approximately 380" | official |
| 2cdn 2,413 | estimate | BOH p. 339 n.1 | (sum of four brigades) | estimate |
| 21bn 215 | `nicholson-1962` | 255 | "At that stage of the advance its own casualties numbered 215" | official |
| 25bn 250 | `nicholson-1962` | 255 | "Its casualty list of more than 250 testified to the strength of the opposition" | official |
| 50bn 229 | `boh-1917-1` | 343 | "the Calgary Battalion having lost no fewer than 11 officers and 218 rank and file" | official |
| 50bn 240 | `nicholson-1962` | 261 | "though the 50th Battalion suffered almost 240 casualties" | official |
| 46bn 108 | `nicholson-1962` | 263 | "suffered 108 casualties—about half the strength of the two companies involved in the attack" | official |
| 79rd 3,473; 1brd 3,133 | `boh-1917-1` | 341 n.1 | "The losses of the 79th Reserve Division are given by German authority as 80 officers and 3,393 other ranks" | official |
| prisoners 3,404 | `boh-1917-1` | 341 n.1 | "counted up to midnight was 62 officers and 3,342 other ranks, but at that hour more were still coming in" | official |
| prisoners 3,400 | `nicholson-1962` | 261 | "Up to midnight on 9-10 April, about 3400 German prisoners had been counted" | official |
| prisoners 4,000 | `nicholson-1962` | 265 | "capturing more than 4000 prisoners" | official |
| guns 54, mortars 104, MGs 124 | `nicholson-1962` | 265 | "In six days the Canadian Corps had advanced some 4500 yards and seized 54 guns, 104 trench mortars and 124 machine-guns" | official |
| reserve arrivals (estimates) | estimate | BOH pp. 277, 338 n.1, 354-356 | "It was snowing and already dark when the troops for the northern part of the operation reached La Chaudiere" | estimate |
| bir14-i 00:00, 10 Apr | `nicholson-1962` | 260 | "It was midnight before the troops reached the Pimple, whence the attack was to be launched" | official |
| 4gd early 10 Apr | `boh-1917-1` | 356 | "Early on the 10th the first regiments of the counter-attack divisions arrived in the battle zone" | official |
| 4gd evening 10 Apr | `boh-1917-1` | 345 n.3 | "The 4th Guard Division began to arrive in the battle zone from Tournai ... on the evening of 10th April" | official |
| endedAt 08:00, 12 Apr | `nicholson-1962` | 263 | "in another two hours the 46th could report the left flank secure" | official |
| endedAt 14 Apr | `nicholson-1962` | 265 | "With the completion of this limited exploitation the Battle of Vimy Ridge ended" | official |
| endedAt 14 Apr evening (18:00 taken for "evening") | `boh-1917-1` | 351 | "By evening the nine-mile outpost line of the XIII., Canadian, and I. Corps ran from a point" | official |

## Conflicts

- **The 85th Battalion's attack, 6 p.m. or 6.45 p.m.** Hayes (`hayes-1920`, secondary) fixes it at six o'clock (p. 52),
  the Zero+750 Task 8 gave the two companies' start; BOH says they "started off ... at 6.45 p.m." (p. 341). The
  historical target, which may cite only official or better, uses BOH; the companies' start stays Task 8's, from Hayes.
  (This is the spec's "time of the 85th Battalion's attack" conflict.)
- **The 10 April attack: barrage at 3 p.m., or in position by 3:15.** BOH p. 342 and Nicholson p. 261; red-4cdn's earliest
  is disputed between them.
- **The 4th Guard Division: early or evening on the 10th.** BOH p. 356 and p. 345 n.3; entered as disputed.
- **The 17th Division's 75th Regiment.** BOH p. 356 has it entering the 1st Bavarian Reserve Division's line early on
  the 10th; BOH p. 277 has "the 75th Regiment of the 18th Division" relieving the 2nd Bavarian Reserve Regiment that
  night (Task 9's oob-german.md notes the division).
- **Corps casualties: 10,602 or 11,297.** Nicholson's 10,602 is 9-14 April, BOH's 11,297 is 7-14 April; the difference
  (695) may be the two days before the battle, or a different count. Both are entered with their windows.
- **The 13th British Brigade: 381 or 287.** BOH p. 339 n.1 gives 381 and Nicholson "approximately 380"; Hussey and Inman
  (secondary) give "7 Officers and 280 other ranks" (p. 155). The official figure is entered.
- **The 50th Battalion: 229 or almost 240.** BOH p. 343 and Nicholson p. 261; disputed.

## Open questions for the historian

- **`gunsCaptured.field` holds guns of all calibres.** The schema has no other slot, so the field-gun count entered holds
  the guns of every calibre the sources give (heavy and field together); it is not a count of field guns only.
- **Captured guns, "54 or 63".** The spec's lead gives 63 as an alternative; no source read gives it. Possibly Duguid,
  "Canada on Vimy Ridge" (*Canada Year Book*, 1936), which Nicholson cites (n.67, n.85), or the Canadian Corps Report on
  Operations.
- **BOH's casualty tables.** The 3rd, 8th and 11th Brigades' rows (pp. 339 n.1, 342 n.1), the 7th Brigade's row (entered
  as estimates from the builder's reading of the OCR; a page-image check would make them sourced), and the 12 April
  battalion table (p. 346 n.2) need checking against the printed page or a page image. archive.org's
  page images are served from storage hosts outside the allowed list.
- **black-4cdn's latest bound** (04:15 on 10 April) is the 11th Brigade's third trench beyond the summit (BOH p. 342).
  The 12th Brigade, in the same sector, held only parts of its second and third trenches on the 9th, "improved their
  positions next morning" and moved up after the Hangstellung fell (Nicholson p. 261; BOH p. 343), so the window may
  close too early for the sector's northern half.
- **Division totals.** Only the 2nd Division's can be added up (an estimate); the 1st's lacks the 3rd Brigade, the 3rd's
  the 8th, the 4th's the 11th and the 10th Brigade's 10 and 12 April losses.
- **Battalion losses.** The spec's lead that the 87th and 102nd "each lost over 300 men on 9 April" is not in either
  official history; the battalions' war diaries or histories would settle it.
- **German losses** for the 16th Bavarian Division and the attached battalions, and German figures by day, are not in
  the sources read; the scholarly German-side articles in *Canadian Military History* (Dieterich 2006; Herwig 2016) are
  behind scholars.wlu.ca's Cloudflare challenge (fireplan.md, Open questions); Sheldon's *The German Army at Vimy Ridge* was
  not read.
- **Reserve arrival times** are estimates from "late afternoon", "after dusk" and "early on the 10th". The German
  regimental histories and *Die Osterschlacht bei Arras 1917*, which BOH used (p. 352 n.2), give the hours.
