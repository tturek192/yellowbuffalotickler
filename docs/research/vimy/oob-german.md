# Vimy research: the German order of battle, garrisons and reserves

This note covers `scenarios/vimy-1917/oob-german.yaml`: the German Sixth Army's forces opposite the Canadian Corps on 9
April 1917, from the army down to every front-line company, each company placed as a `garrison` on a mapped German trench
or strongpoint, and the battalions and divisions that were off the map as `reserves`. It also covers the German entries in
`scenarios/vimy-1917/leaders.yaml` (section "Leaders" below). The rubric for the ratings is `leader-rubric.md`.

**Summary.** 1 army, 2 Gruppen, 3 front-line divisions (79th Reserve, 1st Bavarian Reserve, 16th Bavarian) and 3 reserve
divisions (4th Guard, 111th, 17th); 8 regiments; 27 battalions (22 of the 8 regiments, 5 attached on 9 April); 56 garrison
companies (two battalions of each of the 7 regiments with ground on the map); 16 off-map `reserves` entries (8 resting
battalions, 5 attached battalions, 3 divisions). A smoke run (`npm run sim -- run scenarios/vimy-1917/scenario.yaml --seed 1
--out runs/vimy-full.json`) runs to minute 768 with all 56 garrisons holding.

**Everything here is a draft for the owner and the historian.** The German side is less well sourced than the Canadian:
the German official history (Reichsarchiv, *Der Weltkrieg* vol. 12), the Reichsarchiv monograph *Die Osterschlacht bei
Arras 1917*, the German regimental histories and the scholarly articles on the German side at Vimy were all unreachable
(Open questions). The main sources are the British official history's notes on the German side, which were written from
those German works, and the American Expeditionary Forces' division histories.

## Sources

| id | Tier | Used for |
|---|---|---|
| `boh-1917-1` | official | The spine. Falls, *Military Operations, France and Belgium, 1917*, vol. I (1940): Group Vimy and its divisions (p. 197); the Canadian Corps' intelligence on the German garrison (p. 317 and notes); the regiments' fronts and the 9 April counter-attacks, from German sources (pp. 352-356); the fate of the 1st Bavarian Reserve Division (pp. 276-277); the 4th Guard Division (p. 345 n.3); German losses (p. 341 n.1). Its notes on the German side cite "Die Osterschlacht" and the histories of the 261st and 262nd Reserve and the Bavarian 1st, 2nd Reserve, 11th, 14th and 21st Regiments (p. 352 n.2). |
| `nicholson-1962` | official | The three divisions and their sectors (p. 246); "only five regiments", company strength, the regiments' battalion arrangement and the reserve divisions' distance (p. 247); the 263rd at Les Tilleuls and the tunnel (p. 254); the 3rd Bavarian Reserve Regiment's staff (p. 257); the Lille battalions (p. 258 n.); the Hangstellung and the 16th Bavarian Division's planned attack (p. 259); Falkenhausen and the reserves (pp. 260, 267-268); the 5th Guard Grenadiers (p. 262). |
| `aef-251-divisions` | primary | *Histories of Two Hundred and Fifty-One Divisions of the German Army* (AEF G-2, 1920; cited by Nicholson p. 247 n.45): the 79th Reserve (p. 538), 1st Bavarian Reserve (p. 43) and 16th Bavarian (p. 273) Divisions; the 16th Bavarian's three regiments in 1917 (p. 273); the 17th (p. 277), 4th Guard (p. 89), 80th Reserve (p. 541), 49th Reserve (p. 486) and 25th (p. 352) Divisions. Compiled from Allied intelligence, not German records. |
| `vimy-brief-2026` | secondary | The paper strength of a company, 264, as quoted in the design spec (s. 13). |
| `ign-bdtopo-habitation` | secondary | Village positions for the reserves: Bois-Bernard, Neuvireuil, Lens, Liévin, Méricourt, Douai, Lille (the mean of each modern built-up outline's vertices). |
| `wikipedia-vimy-oob` | tertiary | A lead for the whole structure; the identity of the two battalions attached to the 79th Reserve Division (citing Sheldon pp. 291, 308) and the 14th Bavarian's battalion roles (citing Sheldon p. 316); Gruppe Souchez as the VIII Reserve Corps (citing Godefroy pp. 228-229); the 79th Reserve Division's commander's rank. Sheldon and Godefroy were not read. |
| `wikipedia-de-german-army` | tertiary | Commanders' names, ranks and dates (citing Wegner, *Stellenbesetzung der Deutschen Heere*, not read); Fasbender's withdrawal proposal; the 1st Bavarian Reserve Division's 1917 sector. Revisions: 79. Reserve-Division 238811839; 1. Kgl. Bay. Reserve-Division 261023829; 16. Kgl. Bay. Infanterie-Division 184527473; Georg Wichura 246262387; Karl von Fasbender 262475847; Ludwig von Falkenhausen 257541434. |
| `wikipedia-en-places` | tertiary | Tournai's coordinates (en.wikipedia "Tournai", rev. 1384058402: 50°36′20″N 3°23′17″E). |

All are fetched by `scripts/fetch-sources.sh` into `.cache/sources/` (`boh-1917-1.txt`, `aef-251-divisions-1920.txt`,
`wikipedia-de/`, `wikipedia/1384058402.wiki`, `bdtopo/zone_d_habitation-villages.json`). Page numbers are the printed
ones; the BOH OCR misreads some page heads (388 for 338, 820 for 320), which were checked against their neighbours.

## Structure

| Formation | id | Leader | Under it | Source |
|---|---|---|---|---|
| Sixth Army | `sixth-army` (army) | `falkenhausen` | the two Gruppen; the three reserve divisions | Nicholson p. 246; BOH p. 198 |
| Gruppe Vimy (I Bavarian Reserve Corps) | `gruppe-vimy` (group) | `fasbender` | `79rd`, `1brd` | BOH pp. 197, 353 |
| 79th Reserve Division | `79rd` | `bacmeister` | `rir261`, `rir262`, `rir263` (north to south); attached `ir118-i`, `rir34-iii` | BOH pp. 317 n.3, 353, 354; Nicholson pp. 246, 254; `aef-251-divisions` p. 538 |
| 1st Bavarian Reserve Division | `1brd` | `pechmann` | `brir3`, `brir1` (north to south); attached `rir225-i`, `bir6-iii`, `bir21-iii` | BOH pp. 276-277, 353-355; Nicholson pp. 246, 257, 258 n.; `aef-251-divisions` p. 43 |
| Gruppe Souchez (VIII Reserve Corps) | `gruppe-souchez` (group) | `wichura` | `16bd` | BOH p. 355; `wikipedia-vimy-oob`; `wikipedia-de-german-army` |
| 16th Bavarian Infantry Division | `16bd` | `moehl` | `bir11`, `bir14`, `brir21` | Nicholson p. 246; BOH pp. 317 n.2, 345 n.3, 353, 355; `aef-251-divisions` p. 273 |
| 4th Guard Division | `4gd` | — | (off the map) | BOH pp. 345 n.3, 356; `aef-251-divisions` p. 89 |
| 111th Division | `111id` | — | (off the map) | BOH p. 356 and n.1 |
| 17th Division | `17id` | — | (off the map) | BOH pp. 277, 356; `aef-251-divisions` p. 277 |

Every regiment has battalions `<regiment>-i`, `-ii`, `-iii` (named `I./RIR 261` and so on) and companies numbered
through the regiment, `rir261-1` to `rir261-12` (named `1./RIR 261`), 1-4 in the I Battalion, 5-8 in the II, 9-12 in
the III. The German companies were numbered through the regiment (`aef-251-divisions` p. 277: "the 7th Company of 90th
Fusiliers"); that 1-4 belong to the I Battalion and so on is the usual scheme, taken as a convention.

**What is not entered, and why.**

- **The 14th Bavarian Division**, the third division of Group Vimy (BOH p. 197), held north of the Scarpe, from St.
  Laurent to opposite Roclincourt (pp. 276, 353), south of the map, against the British Third Army.
- **The 2nd Bavarian Reserve Regiment**, the 1st Bavarian Reserve Division's left, faced the British 51st Division south
  of the map (BOH p. 276).
- **The 16th Bavarian Division's BRIR 21** is entered with only its resting battalion (I./BRIR 21, BOH p. 355). Its other
  two battalions are taken to have held the line north of the Souchez, off the map (see Garrisons, the 16th Bavarian).
- **Gruppe Souchez's 80th Reserve and 56th Divisions**, which held from the Bois en Hache to Loos (BOH p. 356), north of
  the map. Six battalions assembled in front of the Avion Switch on 9 April by the corps' order, three of them the 16th
  Bavarian Division's resting battalions (entered) and three from the 80th Reserve and 56th Divisions (not identified, not
  entered; BOH p. 355).
- **Brigades.** The German divisions' infantry brigade headquarters (79th Reserve Infantry Brigade, and so on) are left
  out: no source read gives their part in the battle, and `wikipedia-vimy-oob` names "Major-General Lamprecht" for two
  different divisions' brigades, which suggests an error. Regiments sit directly under their divisions.
- **Artillery, machine-gun and pioneer units** are Task 11's (the fire plan) or out of scope. BOH p. 353: the two
  divisions of Group Vimy opposite the Canadians "disposed of 89 heavy and 108 field guns and howitzers".

**Attached battalions sit under the division they were given to**, as battalions with no regiment of their own, so that
`regimentsOf('79rd')` is the division's own three regiments.

## The northern division: the 16th or the 14th Bavarian

**Working choice: the 16th Bavarian Infantry Division**, in Gruppe Souchez. The evidence:

- Nicholson p. 246: "the 16th Bavarian Infantry Division opposite Souchez", note 44, which cites "G.O.H., XII, Appx. 8
  (map)", the Reichsarchiv's own map of the dispositions, so the working choice rests on the German official history's map
  as Nicholson read it (the map itself was not seen). Nicholson's note 45, on p. 247, cites the AEF histories for the
  divisions' records;
- `aef-251-divisions` p. 273: on 12 February 1917 the 16th Bavarian "replaced the 6th Bavarian Reserve Division south of
  Lens, opposite Souchez" and was forced back off the ridge on 9 April;
- BOH p. 317 n.2: the five regiments facing the Canadian Corps were the 3rd Bavarian Reserve, 261st, 262nd and 263rd
  Reserve, and 11th Bavarian; the 11th Bavarian is a 16th Bavarian Division regiment (`aef-251-divisions` p. 273);
- BOH p. 353: "part of the left regiment of the 16th Bavarian faced the remainder of the 4th Canadian Division".

**The 14th Bavarian Division** was also in Group Vimy, but at the other end of it: "placed in line immediately north of
the Scarpe" (BOH p. 353), "from St. Laurent to opposite Roclincourt" (p. 276), facing the British 9th and 34th Divisions.
The design spec records "the northern German division (16th or 14th Bavarian)" as a known conflict from the owner's brief;
the brief's own source for "14th" was not seen. The likely origin is the 14th Bavarian *Infantry Regiment*, a regiment of
the 16th Bavarian Division, whose I Battalion made the failed night counter-attack on Hill 145 (BOH p. 355). Recorded in
Conflicts and Open questions.

## Garrisons

### Regimental zones

Each regiment's ground is a band of `y` on the German first position (`ger-front`, the same trace as the
`ger-first-position` feature), south to north. Three anchors come from the sources; the rest is equal division, about
1,034 m a regiment, in line with the brief's "about 1,000 m per regiment".

1. **The 79th Reserve Division's south boundary is the Neuville-Thélus road**, y −2726: BOH p. 353, the three regiments
   held "from the cross-roads on Hill 145 to the Thelus—Neuville road". The road is the modern D49 (Task 7's ground control
   point "Les Tilleuls" is on it); y −2726 is where its BD TOPO centreline (`ign-bdtopo`) crosses `ger-first-position`.
2. **Its north boundary is half-way along the 4th Canadian Division's sector**, y 375 (the middle of `barrage-4cdn`, y
   −570 to 1320, in `fireplan.yaml`): BOH p. 353, its three regiments "faced the 2nd, 3rd, and half the 4th Canadian
   Divisions", and "part of the left regiment of the 16th Bavarian faced the remainder". The "cross-roads on Hill 145"
   could not be placed on the map, so the boundary comes from the division frontages. Hill 145's summit (y 12) falls in
   RIR 261's zone, as Godefroy (via `wikipedia-vimy-oob`) has it.
3. **The 79th Reserve Division's three regiments split its front equally**, 1,034 m each. Checked against BOH p. 317 n.3
   (the 3rd Canadian Division, y −1770 to −570, faced "the left of the 263rd Reserve Regiment and the whole of the 262nd
   Reserve"): RIR 263's zone runs 78 m into the 3rd Division's sector and RIR 262's lies inside it, but RIR 261's
   reaches 89 m into it too, within the error of the boundaries.
4. **The others take the same width**: BRIR 3 and BRIR 1 south of the road, BIR 11 north of y 375; BIR 14 from there to
   the end of the mapped first position at the Souchez (y 2552), 1,143 m. BOH p. 345 n.3: on 10 April the 11th and 14th
   Bavarian Regiments held from Hill 145 "to the railway (exclusive) in the Souchez valley", so BIR 14 lay north of BIR 11
   up to the Souchez. BRIR 21, the third regiment, is taken to have held north of the Souchez (the 16th Bavarian
   Division's front ran to the Bois en Hache, where Gruppe Souchez's other divisions began, BOH p. 356).

| Regiment | Zone, y (m) | Width (m) | Faces | Anchor |
|---|---|---|---|---|
| BRIR 1 | −4793 to −3760 | 1,033 | 1st Cdn Div's right (to y −4650), then the British 51st Division | equal width south of BRIR 3 |
| BRIR 3 | −3760 to −2726 | 1,034 | 1st Cdn Div; 250 m of the 2nd | the D49 road (BOH p. 353) |
| RIR 263 | −2726 to −1692 | 1,034 | 2nd Cdn Div; the 3rd's right | the D49 road; equal split |
| RIR 262 | −1692 to −659 | 1,033 | 3rd Cdn Div | equal split |
| RIR 261 | −659 to 375 | 1,034 | 4th Cdn Div's right (11th Brigade) | half the 4th Division (BOH p. 353) |
| BIR 11 | 375 to 1409 | 1,034 | 4th Cdn Div's left (12th Brigade) | equal width |
| BIR 14 | 1409 to 2552 | 1,143 | the Pimple; north of the Canadian sector on 9 April | to the end of the mapped trench (BOH p. 345 n.3) |

### The doctrine of the day, and where each battalion stands

The Vimy defences were still built "in accordance with the old doctrine of a rigid defence" (Nicholson p. 246), and
the infantry "had received orders to hold the forward zone at all costs ... held in such strength that when it was
overrun each division lost about one-third of its infantry" (BOH p. 241). The Canadian Corps' intelligence ("This intelligence was substantially
correct", BOH p. 317 n.3) was that "in each case one battalion formed the
garrison of the first and second trenches, and that a second battalion was either in support in the third trench or in
immediate reserve" (BOH p. 317), and the third battalion rested "in villages five or six miles in rear" (same page).
Nicholson p. 247 says the same: a second battalion "in the Third Line, or immediately to the rear as close support"; "the
third battalions were billeted in rear villages about two hours' march from the battlefield".

So each regiment has:

- **a front battalion**, its four companies at the quarter points of the zone (y0 + (k + ½)·W/4) on
  `ger-first-position`. The second trench, 100-200 m behind, is not mapped, so the first is the nearest mapped trench;
- **a support battalion**, each company on the nearest mapped trench or strongpoint *inside the regiment's zone* to a point
  550 m behind the first position at its quarter point (the forward zone was "five to seven hundred yards deep",
  Nicholson p. 246, 457-640 m). Companies that land on the same strongpoint are spread 40 m apart in `y` around it. In the
  south this puts them on the Zwölfer-Graben ("the southern end of the Black Line", Nicholson p. 254) and one on the
  Zwischen-Stellung; in the north on La Folie Farm (RIR 262), Hill 145 (RIR 261, where "a system of deep dug-outs (the
  Hangstellung) housed the reserve companies", Nicholson p. 259) and the Pimple (BIR 14). Where the zone has no mapped
  trench behind the front (RIR 263, BIR 11, parts of others), the support company goes back to the first position, so it
  stands within 20-60 m of a front company;
- **a resting battalion**, off the map (Reserves).

**Which battalion was which** is known for four: I./263 was the front battalion (BOH p. 325 n.1, its headquarters at the
Schwaben Tunnel; it had relieved the front between 1 and 2 a.m., p. 314 n.1); III./11 Bavarian, I./14 Bavarian and I./21
Bavarian Reserve were the 16th Bavarian Division's resting battalions (BOH p. 355); II./14 Bavarian was "kept in reserve"
(`wikipedia-vimy-oob`, citing Sheldon p. 316), taken as BIR 14's support battalion, which leaves III./14 as its front.
Everywhere else I front, II support, III resting is a convention.

The ruling for Task 9 is followed: no Task 7 feature was split or edited; companies reference the existing features and
are placed along them by their own `start`. Turko-Graben and Thélus Trench are communication trenches, which a garrison
may not reference (`references.ts`), so none uses them.

### Strength

Every garrison company has `strength` 125 and `paperStrength` 264.

- **Paper strength 264** cites the owner's brief (`vimy-brief-2026`) through the design spec (s. 13: "about 150 men
  against 264 on paper"). The brief's own source was not seen; Open questions.
- **Actual strength 125 is an estimate.** BOH p. 317 (the Canadian Corps' intelligence before the battle): "Two-thirds of
  the front-line regiments, at most 5,000 men, might therefore be expected to meet the assault"; two battalions of each of
  five regiments is 40 companies, so at most 125 all ranks a company. The same page: "many of their companies had been
  reduced to a rifle strength of seventy or eighty", and Nicholson p. 247: "many of their rifle companies were left with
  only about 75 men each". The resting battalions' "3,000 men" (BOH p. 317) is 150 a company, the owner's brief's figure.
  The schema allows a company strength only to be sourced or an estimate, not disputed, so the range 75-150 is recorded
  here (Conflicts) and the working value is the forward companies' upper bound.

### Company positions

Local metres in the scenario frame (x along the attack bearing, y to its left); the YAML holds the lon/lat. "Placed from"
is the point the rule above starts from; "snap" its distance to where the company stands.

| Company | Battalion role | Feature | Local x, y (m) | lon, lat | Placed from (x, y) | Snap (m) |
|---|---|---|---|---|---|---|
| `rir261-1` (1./RIR 261) | front | `ger-first-position` | -394, -529 | 2.770163, 50.373850 | -394, -529 | 0 |
| `rir261-2` (2./RIR 261) | front | `ger-first-position` | -522, -271 | 2.767485, 50.375809 | -522, -271 | 0 |
| `rir261-3` (3./RIR 261) | front | `ger-first-position` | -598, -13 | 2.765507, 50.377889 | -598, -13 | 0 |
| `rir261-4` (4./RIR 261) | front | `ger-first-position` | -733, 246 | 2.762727, 50.379831 | -733, 246 | 0 |
| `rir261-5` (5./RIR 261) | support | `ger-first-position` | -308, -657 | 2.771799, 50.372933 | 156, -529 | 481 |
| `rir261-6` (6./RIR 261) | support | `hill-145` | 38, -28 | 2.774211, 50.379247 | 28, -271 | 284 |
| `rir261-7` (7./RIR 261) | support | `hill-145` | 38, 12 | 2.774065, 50.379597 | -48, -13 | 89 |
| `rir261-8` (8./RIR 261) | support | `hill-145` | 38, 52 | 2.773919, 50.379947 | -183, 246 | 321 |
| `rir262-1` (1./RIR 262) | front | `ger-first-position` | -230, -1563 | 2.776167, 50.365202 | -230, -1563 | 0 |
| `rir262-2` (2./RIR 262) | front | `ger-first-position` | -212, -1305 | 2.775470, 50.367502 | -212, -1305 | 0 |
| `rir262-3` (3./RIR 262) | front | `ger-first-position` | -226, -1046 | 2.774341, 50.369728 | -226, -1046 | 0 |
| `rir262-4` (4./RIR 262) | front | `ger-first-position` | -262, -788 | 2.772908, 50.371902 | -262, -788 | 0 |
| `rir262-5` (5./RIR 262) | support | `la-folie-farm` | 469, -1414 | 2.785139, 50.368144 | 320, -1563 | 241 |
| `rir262-6` (6./RIR 262) | support | `la-folie-farm` | 469, -1374 | 2.784993, 50.368494 | 338, -1305 | 148 |
| `rir262-7` (7./RIR 262) | support | `la-folie-farm` | 469, -1334 | 2.784847, 50.368844 | 324, -1046 | 358 |
| `rir262-8` (8./RIR 262) | support | `ger-first-position` | -248, -812 | 2.773186, 50.371724 | 288, -788 | 537 |
| `rir263-1` (1./RIR 263) | front | `ger-first-position` | -211, -2597 | 2.780194, 50.356214 | -211, -2597 | 0 |
| `rir263-2` (2./RIR 263) | front | `ger-first-position` | -179, -2338 | 2.779693, 50.358548 | -179, -2338 | 0 |
| `rir263-3` (3./RIR 263) | front | `ger-first-position` | -272, -2080 | 2.777482, 50.360588 | -272, -2080 | 0 |
| `rir263-4` (4./RIR 263) | front | `ger-first-position` | -251, -1822 | 2.776831, 50.362896 | -251, -1822 | 0 |
| `rir263-5` (5./RIR 263) | support | `ger-first-position` | -179, -2467 | 2.780162, 50.357423 | 339, -2597 | 534 |
| `rir263-6` (6./RIR 263) | support | `ger-first-position` | -156, -2376 | 2.780140, 50.358273 | 371, -2338 | 529 |
| `rir263-7` (7./RIR 263) | support | `ger-first-position` | -170, -2352 | 2.779858, 50.358446 | 278, -2080 | 525 |
| `rir263-8` (8./RIR 263) | support | `ger-first-position` | -240, -1746 | 2.776700, 50.363583 | 299, -1822 | 545 |
| `brir3-1` (1./BRIR 3) | front | `ger-first-position` | -632, -3630 | 2.778237, 50.346196 | -632, -3630 | 0 |
| `brir3-2` (2./BRIR 3) | front | `ger-first-position` | -513, -3372 | 2.778912, 50.348733 | -513, -3372 | 0 |
| `brir3-3` (3./BRIR 3) | front | `ger-first-position` | -414, -3114 | 2.779315, 50.351222 | -414, -3114 | 0 |
| `brir3-4` (4./BRIR 3) | front | `ger-first-position` | -212, -2855 | 2.781129, 50.353955 | -212, -2855 | 0 |
| `brir3-5` (5./BRIR 3) | support | `zwolfer-graben` | -35, -3656 | 2.786454, 50.347368 | -82, -3630 | 54 |
| `brir3-6` (6./BRIR 3) | support | `zwolfer-graben` | 82, -3381 | 2.787041, 50.350050 | 37, -3372 | 46 |
| `brir3-7` (7./BRIR 3) | support | `zwolfer-graben` | 126, -3144 | 2.786779, 50.352218 | 136, -3114 | 32 |
| `brir3-8` (8./BRIR 3) | support | `zwischen-stellung` | 525, -2945 | 2.791480, 50.354895 | 338, -2855 | 207 |
| `brir1-1` (1./BRIR 1) | front | `ger-first-position` | -728, -4600 | 2.780465, 50.337500 | -728, -4664 | 64 |
| `brir1-2` (2./BRIR 1) | front | `ger-first-position` | -792, -4406 | 2.778886, 50.339047 | -792, -4406 | 0 |
| `brir1-3` (3./BRIR 1) | front | `ger-first-position` | -872, -4147 | 2.776860, 50.341119 | -872, -4147 | 0 |
| `brir1-4` (4./BRIR 1) | front | `ger-first-position` | -716, -3889 | 2.778031, 50.343741 | -716, -3889 | 0 |
| `brir1-5` (5./BRIR 1) | support | `zwolfer-graben` | -249, -4499 | 2.786614, 50.339505 | -178, -4664 | 180 |
| `brir1-6` (6./BRIR 1) | support | `zwolfer-graben` | -269, -4412 | 2.786030, 50.340221 | -242, -4406 | 27 |
| `brir1-7` (7./BRIR 1) | support | `zwolfer-graben` | -274, -4152 | 2.785005, 50.342475 | -322, -4147 | 48 |
| `brir1-8` (8./BRIR 1) | support | `zwolfer-graben` | -161, -3892 | 2.785599, 50.345016 | -166, -3889 | 6 |
| `bir11-1` (1./BIR 11) | front | `ger-first-position` | -821, 504 | 2.760592, 50.381884 | -821, 504 | 0 |
| `bir11-2` (2./BIR 11) | front | `ger-first-position` | -858, 763 | 2.759140, 50.384054 | -858, 763 | 0 |
| `bir11-3` (3./BIR 11) | front | `ger-first-position` | -725, 1021 | 2.760014, 50.386625 | -725, 1021 | 0 |
| `bir11-4` (4./BIR 11) | front | `ger-first-position` | -719, 1279 | 2.759147, 50.388896 | -719, 1279 | 0 |
| `bir11-5` (5./BIR 11) | support | `ger-first-position` | -808, 388 | 2.761191, 50.380899 | -271, 504 | 550 |
| `bir11-6` (6./BIR 11) | support | `ger-first-position` | -748, 956 | 2.759937, 50.386002 | -308, 763 | 480 |
| `bir11-7` (7./BIR 11) | support | `ger-first-position` | -684, 1136 | 2.760151, 50.387725 | -175, 1021 | 522 |
| `bir11-8` (8./BIR 11) | support | `ger-first-position` | -688, 1151 | 2.760043, 50.387851 | -169, 1279 | 534 |
| `bir14-9` (9./BIR 14) | front | `ger-first-position` | -741, 1552 | 2.757857, 50.391223 | -741, 1552 | 0 |
| `bir14-10` (10./BIR 14) | front | `ger-first-position` | -655, 1837 | 2.757985, 50.393922 | -655, 1837 | 0 |
| `bir14-11` (11./BIR 14) | front | `ger-first-position` | -564, 2123 | 2.758190, 50.396634 | -564, 2123 | 0 |
| `bir14-12` (12./BIR 14) | front | `ger-first-position` | -637, 2409 | 2.756155, 50.398961 | -637, 2409 | 0 |
| `bir14-5` (5./BIR 14) | support | `the-pimple` | -662, 1762 | 2.758160, 50.393250 | -191, 1552 | 516 |
| `bir14-6` (6./BIR 14) | support | `ger-first-position` | -590, 1992 | 2.758316, 50.395423 | -105, 1837 | 508 |
| `bir14-7` (7./BIR 14) | support | `ger-first-position` | -561, 2161 | 2.758089, 50.396968 | -14, 2123 | 549 |
| `bir14-8` (8./BIR 14) | support | `ger-first-position` | -568, 2344 | 2.757325, 50.398553 | -87, 2409 | 486 |

## Reserves

`reserves` entries need a `formationId`, so each reserve is a formation in the tree with no companies (the resting
battalions under their regiments, the attached battalions under their divisions, the reserve divisions under the Sixth
Army). `distanceKm` is the straight line from where the reserve lay on the morning of 9 April to the sector it went to
(the centre of the regiment's zone on the first position; for a division, the middle of the mapped sector it relieved).
`entryPoint` is where that line crosses the edge of the frame's extent; where the start is unknown, the reserve is taken
to lie due east (along +x) of its sector and enters at the east edge (x 7700). `orderedAt` is the time a reserve was ordered forward. No source
gives one outright: three reserves carry an estimate taken from the counter-attack order they moved up for (below), the
rest have none. Arrival times belong to `historical.reserveArrivals` (Task 10); the ones found are listed under "For Task
10" below.

| Reserve | From | distanceKm | entryPoint (local x, y) | orderedAt | Sources |
|---|---|---|---|---|---|
| `rir261-iii` | billet not found | 8.9 (est.) | 7700, −142 | — | BOH p. 317 ("five or six miles in rear"); Nicholson p. 247 |
| `rir262-iii` | Bois-Bernard (x 9498, y −2377) | 9.8 (est.) | 7700, −2155 | 11:00 (est.: the 79th RD's counter-attack order) | BOH p. 317 n.3 (billets), p. 354; `ign-bdtopo-habitation` |
| `rir263-iii` | Neuvireuil (x 8645, y −5524) | 9.5 (est.) | 7240, −5000 | — | BOH p. 317 n.3; `ign-bdtopo-habitation` |
| `brir3-iii` | billet not found | 8.9 (est.) | 7700, −3243 | — | BOH p. 317 |
| `brir1-iii` | billet not found | 8.9 (est.) | 7700, −4276 | — | BOH p. 317 |
| `bir11-iii` | billet not found | 8.9 (est.) | 7700, 892 | — | BOH pp. 317, 355 |
| `bir14-i` | billet not found | 8.9 (est.) | 7700, 1980 | — (ordered up by Group Souchez, time not given; its 6 p.m. order was a counter-attack) | BOH pp. 317, 355; Nicholson p. 260 |
| `brir21-i` | billet not found | 8.9 (est.) | 7700, 1980 | — | BOH pp. 317, 355 |
| `ir118-i` | "east of Lens" (Lens x 5108, y 4970) | 6.3 (est., a lower bound) | 4065, 3200 | 11:00 (est.) | BOH pp. 354-355; `wikipedia-vimy-oob`; `aef-251-divisions` p. 352 |
| `rir34-iii` | "east of Lens" | 6.3 (est., a lower bound) | 4065, 3200 | 11:00 (est.) | BOH pp. 354-355; `wikipedia-vimy-oob`; `aef-251-divisions` p. 541 |
| `rir225-i` | the Lille area (Lille x 25948, y 22166) | 36.7 (est.) | 6191, 3200 | — | BOH pp. 338 n.1, 354; `aef-251-divisions` p. 486 |
| `bir6-iii` | the Lille area | 36.7 (est.) | 6191, 3200 | — | BOH p. 354 |
| `bir21-iii` | the Lille area ("in line west of Lille") | 36.7 (est.) | 6191, 3200 | — | BOH pp. 277, 354 |
| `4gd` | Tournai (x 48603, y 12858) | 50.7, disputed 16.1-50.7 | 6971, 3200 | — | BOH pp. 345 n.3, 354; Nicholson p. 247; `aef-251-divisions` p. 89; `wikipedia-en-places` |
| `17id` | south-west of Douai (Douai x 22168, y −5384) | 22.9 (est.) | 7700, −4355 | — | `aef-251-divisions` p. 277; BOH p. 317 |
| `111id` | not found | 24 (est.) | 7700, −1175 | — | BOH pp. 354, 356 n.1 |

**The resting battalions.** BOH p. 317: "the five reserve battalions resting in villages five or six miles in rear",
"these German battalions might take two hours to reach the battle zone". Only the 262nd's and 263rd's billets are named
(Bois-Bernard and Neuvireuil, p. 317 n.3); which held which is assumed from their positions (Bois-Bernard is north of
Neuvireuil, as RIR 262's zone is north of RIR 263's). Their straight lines, 9.8 and 9.5 km, are a little over BOH's six
miles (9.7 km). The others take 8.9 km (5.5 miles). The 16th Bavarian Division's resting battalions are given the same
distance; BOH p. 355 has them assembling "between Lievin and Mericourt, in front of the Avion Switch" on 9 April "by order
of the corps further north, Group Souchez", inside the map's north-east, but not where they came from or when they were
ordered. I./14 Bavarian then "halted some two miles in rear, behind the Bois de l'Hirondelle"; its 6 p.m. order "to
re-establish the line on the northern slope of Hill 145" (p. 355) came after it had moved up, so it is a counter-attack
order, not its `orderedAt`, which is left out. I./BRIR 21's entry point is taken from BIR 14's sector, the nearest
mapped one.

**The battalions attached on 9 April** (BOH p. 354: "Two battalions were placed at the disposal of the 79th Reserve
Division, and three at that of the 1st Bavarian Reserve"):

- to the 79th Reserve Division, two battalions "from the 56th and 80th Reserve Divisions respectively, which moved up
  from east of Lens" (p. 354), with one of the 262nd's, for the counter-attack the 79th Reserve Division ordered at 11
  a.m. for 3 p.m. (taken as their `orderedAt`, an estimate: when they were set moving is not given); "it was after nightfall before the troops were in position" (p. 354), at La Chaudière (p. 355). BOH
  does not name them. `wikipedia-vimy-oob` (citing Sheldon pp. 308, 291) has I./118th Reserve (56th Division) and
  III./34th Bavarian Reserve (80th Division). Entered as **I./IR 118** and **III./RIR 34**: the 56th Division's regiment
  was the 118th *Infantry* Regiment (`aef-251-divisions` p. 352), and the 80th Reserve Division's was the *Prussian* 34th
  Reserve ("34 Res.", p. 541); no Bavarian 34th Reserve Regiment appears in the AEF histories (Conflicts). Their
  distance is Lens to La Chaudière, 6.3 km, a lower bound since they started "east of Lens";
- to the 1st Bavarian Reserve Division, "I./225th Reserve, III./6th Bavarian, and III./21st Bavarian, all of which had
  been moved by train and lorry from the Lille area, where they had been in reserve" (pp. 354-355; the second name as the
  OCR reads, "III ./ 6th Bavarian"). Nicholson p. 258 n.: "three reserve battalions rushed in from Lille". I./RIR 225 was
  of the 49th Reserve Division, in line east of Armentières (`aef-251-divisions` p. 486); III./BIR 21 of the 5th Bavarian
  Division, "in line west of Lille" (BOH p. 277). Distance: Lille to BRIR 3's sector, 36.7 km.

**The reserve divisions.** "In addition to the new divisions placed in line astride the Scarpe, Crown Prince Rupprecht
put five reserve divisions at the disposal of the Sixth Army" (BOH p. 199); "at dawn on the 9th April ... they were still
fifteen to twenty miles from the battlefield" (p. 354). Three relieved the Vimy divisions on 10-12 April (p. 356) and are
entered:

- **4th Guard Division** (`4gd`): "began to arrive in the battle zone from Tournai to relieve the 16th Bavarian Division
  on the evening of 10th April" (BOH p. 345 n.3); `aef-251-divisions` p. 89: "three weeks' rest in the region of Tournai",
  then "sent by stages to the south of Lens". Tournai is 50.7 km from the 16th Bavarian's sector in a straight line, well
  beyond the general figures (Nicholson p. 247: 10-25 miles; BOH p. 354: 15-20 miles), so `distanceKm` is disputed, 16.1
  to 50.7 km, with the division's own place as the working value;
- **17th Division** (`17id`): rested "southwest of Douai (end of March and beginning of April)" (`aef-251-divisions` p.
  277); BOH p. 317: "at least two divisions in Sixth Army reserve near Douai, twelve to fifteen miles away" (19.3-24.1 km).
  Douai to the 1st Bavarian Reserve Division's sector is 22.9 km, inside that;
- **111th Division** (`111id`): "not a counter-attack division, but ... happened to be passing through the area on its
  way north" (BOH p. 356 n.1); no source read places it on 9 April. 24 km (15 miles, the near end of p. 354's range) is a
  placeholder.

The other two counter-attack divisions are not identified in the sources read. The 18th Division was "the
counter-attack division in that sector", the 14th Bavarian Division's at the Scarpe (BOH p. 276), against the Third Army; the 3rd Bavarian Division was O.H.L.
reserve (p. 277). Neither is entered.

**For Task 10** (arrival times found while reading; not entered here): the 79th Reserve Division's counter-attack
battalions at La Chaudière after dark on 9 April (BOH p. 355); III./21 Bavarian on BRIR 1's right "after dusk" (p.
277); I./RIR 225 "newly arrived in Arleux" (p. 338 n.1); I./14 Bavarian at the Pimple at midnight (p. 355; Nicholson
p. 260); the first regiments of the counter-attack divisions "early on the 10th" (p. 356); the 4th Guard Division "on the
evening of 10th April" (p. 345 n.3); the reserve divisions in position "by the morning of the 12th" (p. 356). BOH p.
243, of the whole Arras front: "The third battalions ... arrived individually, to form the nucleus of the defence that
evening and next morning".

## Leaders

German leaders are in `leaders.yaml` after the allied ones: the army commander, the two Gruppe commanders and the three
front-line division commanders, each with drafted ratings. No regimental or battalion commander is named in the sources
read except as an office ("the commander of the 262nd Reserve Regiment", BOH p. 355; "the commander of the 3rd Bavarian
Reserve Regiment", Nicholson p. 257), so none is entered. The reserve divisions' commanders are not entered.

**Names and ranks.** BOH and Nicholson name only Falkenhausen ("Colonel-General Freiherr von Falkenhausen", BOH p. 198)
and Fasbender ("General Ritter von Fasbender", BOH p. 197). The forenames and the other four come from German Wikipedia,
which cites Wegner's *Stellenbesetzung* (not read): tertiary, so open to correction.

| Leader | Name | Rank | Source |
|---|---|---|---|
| `falkenhausen` | Ludwig von Falkenhausen | Colonel-General (Generaloberst) | name `wikipedia-de-german-army` (Ludwig von Falkenhausen, rev. 257541434); rank BOH p. 198 |
| `fasbender` | Karl Ritter von Fasbender | General of Infantry | `wikipedia-de-german-army` (Karl von Fasbender, rev. 262475847); BOH p. 197 "General" |
| `wichura` | Georg Wichura | General of Infantry (from 22 March 1917) | `wikipedia-de-german-army` (Georg Wichura, rev. 246262387) |
| `bacmeister` | Ernst von Bacmeister | Lieutenant-General | name `wikipedia-de-german-army` (79. Reserve-Division, rev. 238811839); rank `wikipedia-vimy-oob` |
| `pechmann` | Friedrich von Pechmann | Major-General | `wikipedia-de-german-army` (1. Kgl. Bay. Reserve-Division, rev. 261023829) |
| `moehl` | Arnold Ritter von Möhl | Major-General | `wikipedia-de-german-army` (16. Kgl. Bay. Infanterie-Division, rev. 184527473) |

**The drafted ratings are the owner's to change.** Each is an `estimate` on `leader-rubric.md`, justified in
`leaders.yaml` from the conduct cited. A 3 whose justification says no conduct was found is a placeholder.

| Leader | planning | orderSpeed | adaptiveness | riskTolerance | moraleEffect | Conduct cited |
|---|---|---|---|---|---|---|
| `falkenhausen` | 1 | 2 | 2 | 3 | 3 (placeholder) | misjudged the attack and kept the reserves back (Nicholson pp. 260, 267-268; BOH pp. 241, 353-354); planned a counter-attack through Farbus on 10 April, forbidden by Rupprecht (BOH p. 355) |
| `fasbender` | 2 | 3 (placeholder) | 4 | 3 (placeholder) | 3 (placeholder) | the defence programme on paper only (BOH p. 353); the withdrawal proposal (tertiary only) |
| `wichura` | 3 (placeholder) | 4 | 4 | 3 (placeholder) | 3 (placeholder) | six battalions assembled in front of the Avion Switch by late afternoon on 9 April (BOH p. 355) |
| `bacmeister` | 3 | 2 | 3 | 4 | 3 (placeholder) | the 11 a.m. counter-attack order, in position only after nightfall (BOH pp. 354-355) |
| `pechmann` | 3 (placeholder) | 3 (placeholder) | 3 (placeholder) | 3 (placeholder) | 3 (placeholder) | nothing attributable to him found |
| `moehl` | 3 | 2 | 3 | 4 | 3 (placeholder) | the postponed gas attack (Nicholson p. 259; BOH p. 311 n.2); the 6 p.m. counter-attack (p. 355; Nicholson p. 260) |

## Values entered

Quotes are at most 25 words. "est." marks a value entered as an `estimate`.

### Structure and dispositions

| Value | Source | Page | Quote | Tier |
|---|---|---|---|---|
| Sixth Army, Falkenhausen | `nicholson-1962` | 246 | "the front from north of Cambrai to north of Lille was the responsibility of General von Falkenhausen's Sixth Army" | official |
| The three divisions and their sectors (n.44: G.O.H. XII, Appx. 8, map) | `nicholson-1962` | 246 | "the 1st Bavarian Reserve Division, holding Thelus and Bailleul, the 79th Reserve Division, responsible for the Vimy sector, and the 16th Bavarian Infantry Division opposite Souchez" | official |
| Group Vimy | `boh-1917-1` | 197 | "These two, together with 79th Reserve Division, formed the Vimy Group, under the headquarters of the I. Bavarian Reserve Corps (General Ritter von Fasbender)" | official |
| Group Souchez | `boh-1917-1` | 355 | "by order of the corps further north, Group Souchez, six battalions had assembled between Lievin and Mericourt" | official |
| Gruppe Souchez = VIII Reserve Corps | `wikipedia-vimy-oob` | German side, citing Godefroy pp. 228-229 | "Gruppe Souchez, under the VIII Reserve Corps commander, General Georg Karl Wichura" | tertiary |
| 79th RD: RIR 261, 262, 263 | `aef-251-divisions` | 538 | "261st and 262d Reserve Regiments ... 263d Reserve Regiment: 4th Corps District" | primary |
| 79th RD on the Vimy front | `aef-251-divisions` | 538 | "At the end of February it appeared in the Lens sector and on March 3 on the Vimy front" | primary |
| 79th RD's front | `boh-1917-1` | 353 | "The three regiments of the 79th, from the cross-roads on Hill 145 to the Thelus—Neuville road, faced the 2nd, 3rd, and half the 4th Canadian Divisions" | official |
| 16th Bav's left regiment north of it | `boh-1917-1` | 353 | "On their right part of the left regiment of the 16th Bavarian faced the remainder of the 4th Canadian Division" | official |
| 1st BRD's right and centre south of it | `boh-1917-1` | 353 | "on their left the right regiment and part of the centre of the 1st Bavarian Reserve Division opposed the 1st Canadian Division" | official |
| 1st BRD's front; BRIR 2 on the left | `boh-1917-1` | 276 | "in line from east of Roclincourt to the Neuville St. Vaast—Thelus road ... The 2nd Bavarian Reserve Regiment, on the left" | official |
| BRIR 1 in the centre (by elimination) and its remnant | `boh-1917-1` | 277 | "The 1st Bavarian Reserve Regiment suffered very heavily indeed" | official |
| BRIR 3 opposite the Canadians | `boh-1917-1` | 317 n.2 | "3rd Bavarian Reserve, 261st Reserve, 262nd Reserve, 263rd Reserve, 11th Bavarian" | official |
| BRIR 3's commander taken | `nicholson-1962` | 257 | "Among the 250 captured were the commander of the 3rd Bavarian Reserve Regiment and his staff" | official |
| 263 on the left of the 3rd Cdn Div's front; 262 the whole | `boh-1917-1` | 317 n.3 | "faced by the left of the 263rd Reserve Regiment and the whole of the 262nd Reserve" | official |
| 263 in front of Thélus; relief before zero | `boh-1917-1` | 314 n.1 | "The 263rd Reserve Regiment, in front of Thelus, relieved its front-line battalion between 1 a.m. and 2 a.m." | official |
| I./263 the front battalion | `boh-1917-1` | 325 n.1 | "no news reached the battalion headquarters (I./263rd Reserve) in the other end of the tunnel" | official |
| 263's men taken by the 2nd CMR | `nicholson-1962` | 254 | "captured 150 surprised Saxons of a battalion of the 263rd Reserve Regiment (79th Reserve Division)" | official |
| 262 holding the Bois de la Folie | `boh-1917-1` | 355 | "the commander of the 262nd Reserve Regiment, holding the Bois de la Folie" | official |
| BIR 11 in line from 31 March | `boh-1917-1` | 317 n.2 | "The last-named regiment, whose left faced the left battalion front of the Canadian Corps, had come into line on the 31st March" | official |
| 16th Bav: BIR 11, BIR 14, BRIR 21 | `aef-251-divisions` | 273 | "the 6th Bavarian Division furnished the 11th Bavarian Infantry Regiment; the 5th Bavarian Division the 14th ... the 6th Bavarian Reserve Division the 21st" | primary |
| 16th Bav opposite Souchez | `aef-251-divisions` | 273 | "the 16th Bavarian Division replaced the 6th Bavarian Reserve Division south of Lens, opposite Souchez" | primary |
| BIR 11 and BIR 14 to the Souchez valley (10 April) | `boh-1917-1` | 345 n.3 | "relieve the exhausted 11th and 14th Bavarian Regiments in position there ... continuing the line to the railway (exclusive) in the Souchez valley" | official |
| Resting battalions of the 16th Bav | `boh-1917-1` | 355 | "Three of these were the resting battalions of the 16th Bavarian Division; one of them, the III./11th Bavarian" | official |
| I./14 and I./21 Res | `boh-1917-1` | 355 | "while the I./14th Bavarian and I./21st Bavarian Reserve halted some two miles in rear, behind the Bois de l'Hirondelle" | official |
| II./14 kept in reserve | `wikipedia-vimy-oob` | 16th Bavarian, citing Sheldon p. 316 | "1st Battalion used as battle reinforcements, 2nd Battalion kept in reserve" | tertiary |
| Five regiments on the ridge | `nicholson-1962` | 247 | "These divisions had among them only five regiments on the Ridge" | official |
| Regimental zones (table above) | est. | — | from BOH p. 353 and the frame (Garrisons) | estimate |

### Garrisons and strength

| Value | Source | Page | Quote | Tier |
|---|---|---|---|---|
| Front battalion in the first and second trenches | `boh-1917-1` | 317 | "in each case one battalion formed the garrison of the first and second trenches" | official |
| Support battalion in the third trench | `boh-1917-1` | 317 | "a second battalion was either in support in the third trench or in immediate reserve" | official |
| The same arrangement | `nicholson-1962` | 247 | "had a second battalion in the Third Line, or immediately to the rear as close support" | official |
| The forward zone's depth (550 m used) | `nicholson-1962` | 246 | "The advanced field works, five to seven hundred yards deep, consisted of three lines of trench" | official |
| The forward zone held in strength | `boh-1917-1` | 241 | "the infantry had received orders to hold the forward zone at all costs, instead of regarding it as a true outpost system" | official |
| The Hangstellung on Hill 145 | `nicholson-1962` | 259 | "on the reverse slope a system of deep dug-outs (the Hangstellung) housed the reserve companies" | official |
| `paperStrength` 264 | `vimy-brief-2026` | via the design spec, s. 13 | "about 150 men against 264 on paper" | secondary |
| `strength` 125 | est. | BOH p. 317 | "Two-thirds of the front-line regiments, at most 5,000 men, might therefore be expected to meet the assault" | estimate |
| Rifle strength 70-80 | `boh-1917-1` | 317 | "many of their companies had been reduced to a rifle strength of seventy or eighty" | official |
| About 75 a company | `nicholson-1962` | 247 | "many of their rifle companies were left with only about 75 men each" | official |
| Company positions (table above) | est. | — | the rule under Garrisons, on Task 7's features | estimate |

### Reserves

| Value | Source | Page | Quote | Tier |
|---|---|---|---|---|
| Resting battalions 5-6 miles back | `boh-1917-1` | 317 | "the five reserve battalions resting in villages five or six miles in rear, provided a reinforcement of 3,000 men" | official |
| Two hours' march | `nicholson-1962` | 247 | "the third battalions were billeted in rear villages about two hours' march from the battlefield" | official |
| 262's and 263's billets | `boh-1917-1` | 317 n.3 | "each of which had two battalions on the ridge and the third in rest billets at Bois Bernard and Neuvireuil" | official |
| The 79th RD's counter-attack, 11 a.m. (`orderedAt` est. for three reserves) | `boh-1917-1` | 354 | "At 11 a.m. on the 9th the commander of the 79th Reserve Division issued orders for an immediate counter-attack to recapture Hill 135" | official |
| Its battalions | `boh-1917-1` | 354 | "one of the 262nd Reserve Regiment, in the sector concerned, and two from the 56th and 80th Reserve Divisions respectively, which moved up from east of Lens" | official |
| Their names | `wikipedia-vimy-oob` | 79th Reserve Division, citing Sheldon pp. 291, 308 | "118th Reserve Infantry Regiment ... 34th Bavarian Reserve Infantry Regiment ... Battle reinforcement, sent on 9 April" | tertiary |
| The 56th Division's IR 118 | `aef-251-divisions` | 352 | "In March it ceded the 118th Infantry Regiment to the 56th Division, a new formation" | primary |
| The 80th RD's RIR 34 | `aef-251-divisions` | 541 | composition table: "34 Res." | primary |
| The three Lille battalions | `boh-1917-1` | 354-355 | "I./225th Reserve, III./6th Bavarian, and III./21st Bavarian, all of which had been moved by train and lorry from the Lille area" | official |
| The same | `nicholson-1962` | 258 n. | "troops of three reserve battalions rushed in from Lille to reinforce the 1st Bavarian Reserve Division" | official |
| RIR 225 in the 49th RD | `aef-251-divisions` | 486 | "In January, 1917, the 49th Reserve Division rejoined the 225th Reserve Infantry Regiment" | primary |
| III./21 Bavarian of the 5th Bav Div | `boh-1917-1` | 277 | "This belonged to the 5th Bavarian Division, in line west of Lille" | official |
| I./14 ordered up by Group Souchez (no `orderedAt`) | `boh-1917-1` | 355 | "by order of the corps further north, Group Souchez, six battalions had assembled between Lievin and Mericourt" | official |
| I./14's counter-attack at 6 p.m. (in the note, not `orderedAt`) | `boh-1917-1` | 355 | "At 6 p.m. the I./14th Bavarian was ordered to re-establish the line on the northern slope of Hill 145" | official |
| The same | `nicholson-1962` | 260 | "At 6:00 p.m. a reserve battalion of the 16th Bavarian Infantry Division was ordered to regain the northern slope of Hill 145" | official |
| Five reserve divisions | `boh-1917-1` | 199 | "Crown Prince Rupprecht put five reserve divisions at the disposal of the Sixth Army" | official |
| 15-20 miles at dawn | `boh-1917-1` | 354 | "At dawn on the 9th April, when they were still fifteen to twenty miles from the battlefield, their orders remained unchanged" | official |
| 10-25 miles | `nicholson-1962` | 247 | "General von Falkenhausen's five reserve divisions were from ten to twenty-five miles behind the front" | official |
| Two near Douai, 12-15 miles | `boh-1917-1` | 317 | "there were known to be at least two divisions in Sixth Army reserve near Douai, twelve to fifteen miles away" | official |
| 4th Guard from Tournai | `boh-1917-1` | 345 n.3 | "The 4th Guard Division began to arrive in the battle zone from Tournai to relieve the 16th Bavarian Division on the evening of 10th April" | official |
| 4th Guard near Tournai | `aef-251-divisions` | 89 | "After three weeks' rest in the region of Tournai it was sent by stages to the south of Lens" | primary |
| 17th near Douai | `aef-251-divisions` | 277 | "It rested southwest of Douai (end of March and beginning of April)" | primary |
| 17th a counter-attack division | `boh-1917-1` | 277 | "relieved by the 89th Grenadiers, 17th Division, another of the counter-attack divisions" | official |
| The three divisions' relief | `boh-1917-1` | 356 | "The 5th Guard Grenadier Regiment (4th Guard Division) entered the line of the 16th Bavarian Division, the 73rd and 164th Regiments (111th Division)" | official |
| 111th not a counter-attack division | `boh-1917-1` | 356 n.1 | "The 111th was not a counter-attack division, but to the good fortune of the Germans happened to be passing through the area" | official |
| Village positions | `ign-bdtopo-habitation` | zone_d_habitation, fetched 2026-11-20 | (data) | secondary |
| Tournai | `wikipedia-en-places` | Tournai, rev. 1384058402 | "{{coord\|50\|36\|20\|N\|03\|23\|17\|E}}" | tertiary |

The leaders' names, ranks and ratings, with their quotes, are in `leaders.yaml` and the Leaders section above.

## Conflicts

- **The northern division: 16th or 14th Bavarian.** See above. Entered: the 16th (Nicholson p. 246 and its n.44, the
  Reichsarchiv map; BOH pp. 317 n.2, 353;
  `aef-251-divisions` p. 273). The 14th Bavarian Division was at the Scarpe (BOH pp. 276, 353).
- **How many regiments faced the Canadians.** Nicholson p. 247 and BOH p. 317 (the Corps' intelligence) say five; BOH p.
  353 (from German sources) adds "part of the centre" regiment of the 1st Bavarian Reserve Division (BRIR 1). Entered:
  BRIR 1 as well, partly facing the 1st Canadian Division. BIR 14 is entered too, on the Pimple, north of the Canadian
  sector on 9 April but attacked by the 10th Brigade on 12 April.
- **Where BIR 11 began.** BOH p. 353 has "half the 4th Canadian Division" facing the 79th Reserve Division and "the
  remainder" facing part of BIR 11; BOH p. 317 n.2 has BIR 11's "left faced the left battalion front of the Canadian
  Corps", only the 73rd Battalion's. Entered: the first (boundary at y 375), the account written from German records; the
  second would put the boundary near y 1000 and widen RIR 261.
- **Company strength.** 75 (Nicholson p. 247, rifle strength), 70-80 (BOH p. 317, rifle strength), at most 125 all ranks
  (BOH p. 317, 5,000 men in 40 forward companies), 150 (BOH p. 317's resting battalions, 3,000 in 20 companies; the
  owner's brief). Entered: 125.
- **The two battalions attached to the 79th Reserve Division.** BOH p. 354: from the 56th and 80th Reserve Divisions,
  unnamed. `wikipedia-vimy-oob` (Sheldon): I./118th Reserve and III./34th Bavarian Reserve; the task brief: I/RIR 118 and
  III/BRIR 34. The AEF histories put the 118th *Infantry* Regiment in the 56th Division (p. 352; the 118th Reserve was the
  25th Reserve Division's, p. 482) and the Prussian 34th Reserve in the 80th Reserve Division (p. 541). Entered: I./IR
  118 and III./RIR 34. Sheldon would settle it.
- **I./225.** The task brief and `wikipedia-vimy-oob` have "I/IR 225" ("225th Infantry Regiment", 17th Division); BOH pp.
  338 n.1 and 354 have "I./225th Reserve", and the AEF histories put the 225th Reserve in the 49th Reserve Division, near
  Lille (p. 486), which fits BOH's "from the Lille area". Entered: I./RIR 225.
- **III./6 Bavarian.** BOH p. 354's OCR reads "III ./ 6th Bavarian"; no other source read names this battalion.
- **The resting battalions' distance.** BOH p. 317 (the Corps' intelligence): "five or six miles"; BOH p. 243 (the
  whole Arras front, after the battle): "three to six miles"; Nicholson p. 247: "about two hours' march". Entered: 5.5
  miles where no billet is named.
- **The reserve divisions' distance.** Nicholson p. 247: 10-25 miles; BOH p. 354: 15-20 miles at dawn on 9 April; BOH p.
  317: two near Douai at 12-15 miles; BOH p. 241: "from twelve to twenty-four hours' march from the battlefield"; the
  4th Guard Division at Tournai, about 50 km (BOH p. 345 n.3). The design spec has "24 km historically" and records
  "two-hour march or 24 km" as a known conflict: the two-hour march is the resting battalions' (Nicholson p. 247), the 24
  km the reserve divisions' (BOH p. 354's 15 miles); both are kept, for different reserves.
- **The divisions in line after the withdrawal.** BOH p. 356: 4th Guard, 111th and 17th Divisions from Méricourt to
  Gavrelle by 12 April; Nicholson p. 262 n.: "the 16th Bavarian Infantry Division with two battalions from the 4th
  Infantry Division in the line, the 111th Infantry Division and the 17th". "4th Infantry" is probably the 4th Guard.
- **The 75th Regiment's division.** BOH pp. 276-277: BRIR 2, forced back to the outskirts of Bailleul on the morning of
  10 April, "was relieved that night by the 75th Regiment of the 18th Division"; BRIR 1's remnant was relieved on the
  evening of the 10th by "the 89th Grenadiers, 17th Division". BOH p. 356 has "the 89th Grenadier and 75th Regiments (17th
  Division)" entering the 1st Bavarian Reserve Division's line. So BOH gives the 75th to the 18th Division on p. 277 and
  to the 17th on p. 356. Not entered (Task 10 may need it).
- **Fasbender's withdrawal.** German Wikipedia credits Fasbender with proposing the withdrawal from the ridge; BOH p. 355
  credits Rupprecht, "after consultation with ... Colonel von Lossberg". Noted in his adaptiveness rating.
- **Bacmeister's rank.** `wikipedia-vimy-oob`: Lieutenant-General; German Wikipedia's list: General der Infanterie (the
  rank at the end of his command, presumably). Entered: Lieutenant-General.

## Open questions for the historian

- **The tier of `aef-251-divisions`.** It is registered as `primary`, but it is a 1919-20 compilation made from Allied
  intelligence, not German records. Should it be tier `official` (or lower) rather than `primary`? The registry is unchanged.
- **The northern division: the 16th or the 14th Bavarian Division?** Entered: the 16th Bavarian Infantry Division in
  Gruppe Souchez (Nicholson p. 246, citing the Reichsarchiv map, G.O.H. XII, Appx. 8, in n.44; BOH pp. 317 n.2, 353, 355;
  `aef-251-divisions` p. 273). The owner's brief has the 14th Bavarian, which BOH puts at the other end of Group Vimy,
  north of the Scarpe (pp. 276, 353); the brief's source for it was not seen. Does any primary source put the 14th
  Bavarian Division opposite Souchez or the Pimple on 9 April, or is the "14th" the 14th Bavarian *Infantry Regiment* of
  the 16th Bavarian Division? Appendix 8 of *Der Weltkrieg* vol. 12 would settle it.

- **The German official history and monograph.** Reichsarchiv, *Der Weltkrieg 1914 bis 1918*, vol. 12, and *Die
  Osterschlacht bei Arras 1917* (Schlachten des Weltkrieges vol. 28) are not on archive.org (searched 2026-11-20: only
  *Der Weltkrieg* vols. 2-3 and *Schlachten des Weltkrieges* vols. 2, 3, 18, 32, 33 are there). They would give every
  regiment's sector, battalion roles, company strengths and the counter-attack orders' times.
- **The German regimental histories** (RIR 261, 262, 263; BRIR 1, 2, 3; BIR 11, 14; BRIR 21) were not found on
  archive.org. BOH p. 352 n.2 used those of the 261st, 262nd, Bavarian 1st, 2nd Reserve, 11th, 14th and 21st; Nicholson p.
  254 n.75 that of the 263rd.
- **The scholarly articles.** *Canadian Military History* has "The German 79th Reserve Infantry Division in the Battle of
  Vimy Ridge, April 1917" (A. Dieterich, vol. 15 iss. 1, 2006, scholars.wlu.ca/cmh/vol15/iss1/7) and "'The
  Battle-Fortune of Marshal Hindenburg is not Bound up with the Possession of a Hill': The Germans and Vimy Ridge"
  (H. Herwig, vol. 25 iss. 2, 2016, scholars.wlu.ca/cmh/vol25/iss2/16). Their landing pages were reached, but the PDFs sit
  behind a bot challenge on scholars.wlu.ca and could not be fetched. Dieterich commanded the 79th Reserve Infantry
  Brigade (`wikipedia-vimy-oob`); his account is the best source for the 79th's dispositions. Sheldon, *The German Army
  at Vimy Ridge* / *The German Army in the Spring Offensives 1917*, and Godefroy's chapter in *Vimy Ridge: A Canadian
  Reassessment* (2007) were not reachable.
- **Regimental boundaries and company sectors.** The zones are built from three anchors and equal widths; German or
  British trench maps (with the "cross-roads on Hill 145") would fix them.
- **The second and third trenches.** The map has only the first trench and, in the south, the Zwölfer-Graben and the
  Zwischen-Stellung; most support companies stand on the first position for want of the third trench. Digitizing the
  forward zone's second and third trenches (Task 7's ruling kept its features unchanged) would let them stand where they
  were.
- **Which battalion was in front, in support and resting** in each regiment on 9 April, except the four sourced.
- **Company strength at Zero**, by regiment, and the source of the brief's 264 and 150.
- **The billets of the resting battalions** other than the 262nd's and 263rd's, and which of those two held which village.
- **BIR 14 and BRIR 21 on 9 April.** Whether BIR 14 held the Pimple (as entered) and BRIR 21 the line north of the
  Souchez, or the other way round.
- **The two other counter-attack divisions** of the five, and where all five lay on the morning of 9 April; when each was
  ordered forward.
- **The 111th Division's position on 9 April.**
- **Times.** BOH gives the German times (11 a.m., 6 p.m.) without saying whether it converted them; they are entered as
  given, and the scenario's clock is British (BOH p. 318 n.2 marks one German report "(British time)").
- **The German brigade commanders** (79th Reserve Infantry Brigade: Dieterich, per `wikipedia-vimy-oob`), and whether a
  brigade level belongs in the tree.
