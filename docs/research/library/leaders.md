# Library research: leaders and divisions of 1917 from other sectors

This note covers `library/leaders-1917.yaml` (17 leaders) and `library/formations-1917.yaml` (8 divisions, to company),
which a what-if draws on to swap a leader into a scenario (`swap-leader`) or to add a division as an off-map reserve
(`add-formation`; overlays/README.md, "The library"). What each rating means is in `docs/research/vimy/leader-rubric.md`.
Weather presets are in `weather.md`.

**Summary.** Five British and Dominion corps commanders (Haldane, Snow, Fergusson, Birdwood, Pulteney), six division
commanders (Lukin, McCracken, C. L. Nicholson, Harper, Braithwaite, W. Holmes), and six German commanders (Dieffenbach,
von Moser, the two Freiherren von Watter, Hildermann, Havenstein), all of whom fought elsewhere on the Western Front in
1917: the Arras front south of Vimy, Bullecourt, and Cambrai. Five British divisions of the Arras and Bullecourt fighting
(9th, 15th, 34th, 51st, 62nd) and three German divisions of Cambrai (54th, 107th, 9th Reserve), each with its brigades
or regiments, battalions and four companies a battalion. Every name and rank is sourced; every rating and every company
strength is an estimate.

**Everything here is a draft for the owner and the historian.** The ratings above all: they are the owner's to set. A 3
whose justification says no conduct was found is a placeholder midpoint, not a judgement.

## Sources

| id | Tier | Used for |
|---|---|---|
| `boh-1917-1` | official | Falls, *Military Operations, France and Belgium, 1917*, vol. I (1940): the British corps and divisions at Arras and Bullecourt and their commanders' conduct; the German Groups (p. 197) and von Moser's Lagnicourt counter-attack (pp. 376-377); the skeleton order of battle, each division with its commander and brigades (pp. 562-563); the index's form of each name and rank. The same work, under the same id, as the Vimy scenario's. |
| `boh-1917-3` | official | Miles, *Military Operations, France and Belgium, 1917*, vol. III, *The Battle of Cambrai* (1948): Pulteney and the III Corps; the German side at Cambrai from the German official account (p. 47 n.3): the Caudry and Arras Groups and the 54th, 9th Reserve and 107th Divisions (pp. 47-49, 99, 141-142). |
| `ewing-1921` | secondary | The 9th (Scottish) Division's battalions, with their dates of joining and leaving (Appendix I, p. 398). |
| `stewart-buchan-1926` | secondary | The 15th (Scottish) Division's battalions, transfers and amalgamations (Appendix A, pp. 286-287). |
| `shakespear-1921` | secondary | The 34th Division's battalions as raised (pp. 2-4), each named again at Arras (pp. 99-105); the amalgamation of the 24th and 27th Northumberland Fusiliers in June 1917 (p. 132). |
| `bewsher-1921` | secondary | The 51st (Highland) Division's 153rd Brigade at Arras (pp. 153, 164). |
| `wyrall-1924-62nd` | secondary | The 62nd (West Riding) Division's order of battle on arrival in France, January 1917 (Appendix I, pp. 239-240). |
| `aef-251-divisions` | primary | The German divisions' regiments in 1917: the 54th (p. 512), the 107th (p. 593), the 9th Reserve (p. 173). Compiled from Allied intelligence, not German records; the composition tables are illegible in the OCR text, so the regiments are read from the narrative. The same work as the Vimy scenario's. |
| `bean-1933-iv` (not registered) | official | Bean, *The A.I.F. in France 1917* (Official History of Australia, vol. IV), read for Holmes, Godley and Laffert. Not cited by a library value: its OCR is poor, and BOH gives Holmes's conduct (Open questions). Used in `weather.md`. |
| Becke, *Order of Battle of Divisions* parts 1, 2A, 2B, 3A, 3B and 4 (1935-1945) | official | Read for the divisions' battalions. Its tables are printed sideways and come out of the OCR as unreadable text, so no value cites it; registered nowhere (Open questions). |

All are fetched by `scripts/fetch-sources.sh` into `.cache/sources/` (each item's archive.org full-text page). Page
numbers are the printed ones, read from the running heads in the OCR text; where the OCR misreads a head (BOH vol. I's
"284" for 234, Shakespear's "181" for 131), the neighbouring heads fix it.

**Hosts that could not be reached.** The Australian War Memorial (`www.awm.gov.au`, Bean's volumes and the AIF unit
diaries) and archive.org's storage hosts (`*.archive.org`, where an item's PDF is served) are refused by this
environment's network proxy; HathiTrust (`babel.hathitrust.org`) did not answer. So Becke's tables could not be read as
images, and no PDF was read. Nothing here rests on them.

**Not found on archive.org.** BOH 1917 vol. II (Messines and Third Ypres, Edmonds 1948): so II Anzac (Godley), XVIII
Corps (Maxse) and the German Flanders commanders (Sixt von Armin, Laffert) are not entered (Open questions).

## Who is recorded, and why these

The base design asks for leaders and units "swapped in from other parts of the front". These are the commanders the
two official histories read give conduct for, in 1917, outside the Vimy fight:

- **The Arras front south of Vimy** (Third Army, 9 April-May 1917): VI Corps (Haldane), VII Corps (Snow), XVII Corps
  (Fergusson; the corps next to the Canadian Corps), and four of their divisions' commanders. The 51st (Highland)
  Division was the Canadian Corps' right-hand neighbour on 9 April; it fought on its own front, not at Vimy.
- **Bullecourt** (Fifth Army, April-May 1917): I Anzac Corps (Birdwood), the 4th Australian Division (Holmes) and the
  62nd Division (Braithwaite); and opposite them Gruppe Quéant (von Moser).
- **Gruppe Arras** (IX Reserve Corps, Dieffenbach), the southern neighbour of the Vimy scenario's Gruppe Vimy.
- **Cambrai** (November 1917): III Corps (Pulteney); on the German side the Caudry Group (General Freiherr von Watter)
  and three of its divisions' commanders, and von Moser again, now commanding the Arras Group.

**Ids.** British and Dominion leaders' ids are surnames (`holmes-w` and `nicholson-cl`, as the Vimy scenario already
draws on Nicholson the historian and could gain other Holmeses); German ones start with `de-`, the two Watters
distinguished by command (`de-watter-xiii`, `de-watter-54`). No id is one the Vimy scenario uses.

**How names are entered.** As the source gives them, as in the Vimy notes: initials where the history gives initials,
a forename only where it prints one ("Charles Fergusson", "William Birdwood" from BOH's index and text). The German
commanders appear in the British histories by surname and title only, so that is what is entered ("Freiherr von
Watter", "Hildermann"); no forename was added from memory. Ranks are the ones the history gives at the time.

## Values entered: names and ranks

| Leader | Field | Value | Source | Page | Quote (≤ 25 words) | Tier |
|---|---|---|---|---|---|---|
| `haldane` | name, rank | J. A. L. Haldane, Lieutenant-General | `boh-1917-1` | 214 | "The task of the VI. Corps (Lieut.-General J. A. L. Haldane, headquarters, Noyelle Vion" | official |
| `snow` | name, rank | T. D'O. Snow, Lieutenant-General | `boh-1917-1` | 150 | "Lieut.-General Sir T. D'O. Snow, commanding the VII. Corps" | official |
| `fergusson` | name, rank | Charles Fergusson, Lieutenant-General | `boh-1917-1` | 225 | "The XVII. Corps (Lieut.-General Sir Charles Fergusson, Bt., headquarters, Aubigny" | official |
| `birdwood` | name, rank | William Birdwood, Lieutenant-General | `boh-1917-1` | 363; index | "Lieut.-General Birdwood, commanding the I. Anzac Corps"; index: "Birdwood, Lieut.-Gen. Sir William (I. Anzac Corps)" | official |
| `pulteney` | name, rank | W. P. Pulteney, Lieutenant-General | `boh-1917-3` | 21 n.1 | "G.O.C., Lieut.-Gen. Sir W. P. Pulteney" | official |
| `lukin` | name, rank | H. T. Lukin, Major-General | `boh-1917-1` | 227; 562 | "The frontage of the 9th Division (Major-General H. T. Lukin, headquarters, Etrun)" | official |
| `mccracken` | name, rank | F. W. N. McCracken, Major-General | `boh-1917-1` | 222; 562 | "The 15th Division (Major-General F. W. N. McCracken, headquarters, Duisans)" | official |
| `nicholson-cl` | name, rank | C. L. Nicholson, Major-General | `boh-1917-1` | 231; 562 | "The 34th Division (Major-General C. L. Nicholson, headquarters on the Lille road east of Maroeuil)" | official |
| `harper` | name, rank | G. M. Harper, Major-General | `boh-1917-1` | 234; 563 | "the 51st Division (Major-General G. M. Harper, headquarters, Maroeuil)" | official |
| `braithwaite` | name, rank | W. P. Braithwaite, Major-General | `boh-1917-1` | 463; 563 | "the 62nd Division (Major-General W. P. Braithwaite) attacked with all three brigades in line" | official |
| `holmes-w` | name, rank | W. Holmes, Major-General | `boh-1917-1` | 361; 563 | "Major-General W. Holmes, decided to attack with two brigades" | official |
| `de-dieffenbach` | name, rank | Dieffenbach, Lieutenant-General | `boh-1917-1` | 197 | "the Arras Group, which had the staff of the IX. Reserve Corps (Lieut.-General Dieffenbach)" | official |
| `de-moser` | name, rank | von Moser, Lieutenant-General | `boh-1917-3` | 49 | "The 'Arras Group' (Lieut.-General von Moser, XIV Reserve Corps)" | official |
| `de-watter-xiii` | name, rank | Freiherr von Watter, General | `boh-1917-3` | 47 | "the 'Caudry Group' (XIII. Corps) commanded by General Freiherr von Watter" | official |
| `de-watter-54` | name, rank | Freiherr von Watter, Lieutenant-General | `boh-1917-3` | 47 | "the 54th Division, commanded by another Freiherr von Watter, Lieut.-General" | official |
| `de-hildermann` | name, rank | Hildermann, Lieutenant-General | `boh-1917-3` | 48 | "the 9th Reserve Division (Lieutenant-General Hildermann)" | official |
| `de-havenstein` | name, rank | Havenstein, Major-General | `boh-1917-3` | 48 | "The 107th Division (Major-General Havenstein), brought from Russia" | official |

## The drafted ratings

Each is an `estimate` on `leader-rubric.md`; the justification in `leaders-1917.yaml` cites the conduct and page. The
rubric's rule of evidence is kept: the conduct is from the battle the leader is known for in 1917 (Arras, Bullecourt or
Cambrai), a result alone supports a 4 at most, and where nothing is found the rating is a placeholder 3. "(p)" marks a
placeholder.

| Leader | planning | orderSpeed | adaptiveness | riskTolerance | moraleEffect | Conduct cited |
|---|---|---|---|---|---|---|
| `haldane` | 3 (p) | 3 | 4 | 3 | 3 (p) | headquarters ordered forward; turn the defences from the 15th Division's gap; unaware of the 63rd Brigade on Orange Hill; postponed to the 14th (BOH I pp. 248, 253, 286) |
| `snow` | 4 | 3 | 4 | 2 | 3 (p) | no frontal attack on the uncut wire, proved right; Brown Line drawn back; no renewed attack before preparation; read the Cambrai counter-attack (BOH I pp. 204, 212-213, 281; III p. 165) |
| `fergusson` | 4 | 3 | 4 | 2 | 3 (p) | weighed the open flank; asked for reconnaissance time; cavalry rather than unsupported infantry at Fampoux; protested the 3 May plan (BOH I pp. 226, 256, 282, 394, 441) |
| `birdwood` | 4 | 3 | 2 | 4 | 4 | doubted the tank scheme, overruled; refused the barrage on false reports; pushed the outpost line; shielded his divisions (BOH I pp. 146, 167, 363, 368, 461, 475) |
| `pulteney` | 3 (p) | 2 | 2 | 2 | 3 (p) | defensive line proposed on the first evening; did not value the canal crossings; no warning order before the counter-stroke (BOH III pp. 107, 165, 170) |
| `lukin` | 4 | 4 | 4 | 4 | 3 (p) | knew the ground; high-explosive barrage, orders not sent up for fear of a veto; smoke on the open flank at once (BOH I pp. 227-228) |
| `mccracken` | 4 | 4 | 4 | 4 | 3 (p) | barrage brought back at 11.30; his reserve brigade could have taken Monchy that night; renewed attack at noon (BOH I pp. 223, 225, 268, 390) |
| `nicholson-cl` | 4 | 3 | 3 | 3 | 4 | special barrage arrangements; great-coats; relief of exhausted troops on medical advice (BOH I pp. 202, 233, 269, 293, 414) |
| `harper` | 2 | 2 | 3 | 3 (p) | 3 (p) | his own scheme against the corps commander's, the final advance broke down; headquarters a morning behind its brigade (BOH I pp. 234-235, 255, 396) |
| `braithwaite` | 4 | 3 (p) | 3 (p) | 4 | 3 (p) | constant rehearsal; leave to push forward in the German retreat (BOH I pp. 95-96, 463) |
| `holmes-w` | 3 | 5 | 4 | 3 | 3 (p) | the instant decision, without reference to higher authority, to call off the assault when the tanks were late (BOH I pp. 361-362) |
| `de-dieffenbach` | 3 (p) | 3 (p) | 3 (p) | 3 (p) | 3 (p) | named only (BOH I p. 197) |
| `de-moser` | 2 | 4 | 4 | 5 | 3 (p) | the Lagnicourt counter-stroke, conceived on the 13th, a hasty improvisation; wanted to attack sooner; the Cambrai warning order and counter-attack division (BOH I pp. 376-377, 477 n.; III pp. 49, 138 n., 141) |
| `de-watter-xiii` | 3 (p) | 4 | 3 (p) | 3 (p) | 3 (p) | the midnight warning of tanks, 19/20 November (BOH III p. 49) |
| `de-watter-54` | 4 | 3 (p) | 3 (p) | 3 (p) | 3 (p) | the division's readiness from noon on the 18th, not tied to him by name (BOH III p. 48) |
| `de-hildermann` | 3 (p) | 3 (p) | 3 (p) | 3 (p) | 3 (p) | named only (BOH III p. 48) |
| `de-havenstein` | 3 (p) | 3 (p) | 3 (p) | 3 (p) | 3 (p) | uncertain whether the British held Fontaine; too little to rate (BOH III p. 142) |

The ratings were drafted against the same rubric as the Vimy leaders, so a library leader swapped into Vimy can be
compared with the one he replaces. Most of the conduct the British history records of its own commanders is of
decisions that went wrong or were overruled, and of the German commanders it records little: so more British ratings
than German depart from 3, and the German ones should be read as unknowns, not as average commanders.

## The divisions

Each is a `division` whose `leaderId` is a library leader; under it its three brigades (British) or regiments
(German), four battalions a brigade or three a regiment, and four companies a battalion. Battalion names are as the
source prints them. Pioneer battalions, machine-gun companies, trench-mortar batteries and the artillery are not
entered: `add-formation` brings infantry companies in as reserves, and the scenario's guns are its own.

| Division (id) | Leader | Brigades or regiments, battalions | Where, 1917 | Sources |
|---|---|---|---|---|
| 9th (Scottish) (`bef-9div`) | `lukin` | 26th (Highland): 8/Black Watch, 7/Seaforth, 5/Camerons, 10/Argyll & Sutherland; 27th (Lowland): 11/ and 12/Royal Scots, 6/K.O.S.B., 9/Scottish Rifles; South African: 1st-4th South African Infantry | XVII Corps, Arras, 9 April | BOH I pp. 227-228, 562; `ewing-1921` p. 398 |
| 15th (Scottish) (`bef-15div`) | `mccracken` | 44th (Highland): 9/Black Watch, 8/Seaforth, 8/10th Gordons, 7/Camerons; 45th: 13/Royal Scots, 6/7th Royal Scots Fusiliers, 6/Camerons, 11/Argyll & Sutherland; 46th: 7/8th K.O.S.B., 10/Scottish Rifles, 10/11th H.L.I., 12/H.L.I. | VI Corps, Arras | BOH I pp. 222, 562; `stewart-buchan-1926` pp. 286-287 |
| 34th (`bef-34div`) | `nicholson-cl` | 101st: 15/ and 16/Royal Scots, 10/Lincolnshire, 11/Suffolk; 102nd (Tyneside Scottish): 20th-23rd Northumberland Fusiliers; 103rd (Tyneside Irish): 24th-27th Northumberland Fusiliers | XVII Corps, Arras | BOH I pp. 231-233, 562; `shakespear-1921` pp. 2-4, 99-105, 132 |
| 51st (Highland) (`bef-51div`) | `harper` | 152nd: 5/ and 6/Seaforth, 6/Gordons, 8/Argyll & Sutherland; 153rd: 6/ and 7/Black Watch, 5/ and 7/Gordons; 154th: 9/Royal Scots, 4/Seaforth, 4/Gordons, 7/Argyll & Sutherland | XVII Corps, Arras; the Canadian Corps' right on 9 April | BOH I pp. 234-235, 563; `bewsher-1921` pp. 153, 164 |
| 62nd (2nd West Riding) (`bef-62div`) | `braithwaite` | 185th: 2/5th-2/8th West Yorkshire; 186th: 2/4th-2/7th West Riding (Duke of Wellington's); 187th: 2/4th and 2/5th K.O.Y.L.I., 2/4th and 2/5th York & Lancaster | V Corps, Bullecourt, 3 May | BOH I pp. 463-464, 563; `wyrall-1924-62nd` pp. 239-240 |
| 54th (`de-54div`) | `de-watter-54` | RIR 27, IR 84, RIR 90 | the Caudry Group, Cambrai (Havrincourt-Flesquières), 20 November | `aef-251-divisions` p. 512; BOH III pp. 47-48 |
| 107th (`de-107div`) | `de-havenstein` | RIR 52, RIR 227, RIR 232 | from Russia to Cambrai, 19-22 November | `aef-251-divisions` p. 593; BOH III pp. 48, 118-119 |
| 9th Reserve (`de-9rd`) | `de-hildermann` | RIR 6, RIR 19, IR 395 | the Caudry Group, Cambrai; Arras in May, Ypres in September | `aef-251-divisions` p. 173; BOH III pp. 48, 99 |

| Division | Membership | Source | Page | Quote (≤ 25 words) | Tier |
|---|---|---|---|---|---|
| 9th | 10/Argyll & Sutherland in the 26th Brigade | `ewing-1921` | 398 | "10th Bn. Princess Louise's (Argyll and Sutherland) Highlanders. From 27th Bde. 3/5/16. Transferred to 32nd Div. 15/2/18." | secondary |
| 9th | 9/Scottish Rifles and 6/K.O.S.B. in the 27th Brigade | `ewing-1921` | 398 | "6th Bn. King's Own Scottish Borderers. From 28th Bde. 6/5/16. 9th Bn. The Scottish Rifles (Cameronians). From 28th Bde. 6/5/16." | secondary |
| 9th | South African Brigade in the division | `boh-1917-1` | 228, 562 | "On the front of the South African Brigade (Br.-General F. S. Dawson) the 3rd and 4th South African Infantry" | official |
| 15th | 8/10th Gordons, 6/7th R.S.F., 7/8th K.O.S.B., 10/11th H.L.I. as merged in May 1916 | `stewart-buchan-1926` | 286-287 | "Amalgamated with 8th Battalion from 9th Division, and became 8/10th Battalion, 13/5/16." | secondary |
| 34th | the twelve battalions as raised | `shakespear-1921` | 2-4 | "102nd Brigade (The Tyneside Scottish Brigade)" | secondary |
| 34th | the 10/Lincolnshire at Arras | `boh-1917-1` | 231-233 | "10/Lincolnshire" (named twice in the 34th Division's attack) | official |
| 34th | the 24th and 27th Northumberland Fusiliers amalgamated after Arras | `shakespear-1921` | 132 | "The 24th and 27th Northumberland Fusiliers were amalgamated into one battalion, known as 24th/27th" | secondary |
| 51st | the 152nd's and 154th's battalions on 9 April | `boh-1917-1` | 234-235 | "On the front of the 154th Brigade (Br.-General J. G. H. Hamilton) the 9/Royal Scots and 4/Seaforth Highlanders" | official |
| 51st | the 153rd's battalions | `bewsher-1921` | 153, 164 | "The main attack was delivered by the 153rd Brigade, the 7th Black Watch being on the right, the 7th Gordon Highlanders on the left." | secondary |
| 62nd | the twelve battalions, January 1917 | `wyrall-1924-62nd` | 239-240 | "ORDER OF BATTLE OF THE 62ND (W.R.) DIVISION ON ARRIVAL IN FRANCE In January, 1917." | secondary |
| 54th | its three regiments | `aef-251-divisions` | 512 | "Two of these regiments, the 84th (18th Division) and the 90th Reserve (18th Reserve Division)" | primary |
| 54th | one battalion of each regiment in the line | `boh-1917-3` | 47 | "with one battalion of each of its three regiments in the line, one in support and one in reserve" | official |
| 107th | its three regiments | `aef-251-divisions` | 593 | "with regiments transferred from the 49th Reserve Division (227th Reserve Regiment), from the 50th Reserve Division (232d Reserve Regiment)" | primary |
| 9th Reserve | its three regiments' companies in 1917 | `aef-251-divisions` | 173 | "The 11th Company of the 6th Reserve Infantry was reduced to 20 men" | primary |

**Structure below the battalion.** Four companies a battalion, A-D for the British (as in the Vimy scenario, standing
for whatever the battalion called them), and the German companies numbered through the regiment, 1-4 in the I
Battalion, 5-8 in the II, 9-12 in the III, the convention of the Vimy scenario's German order of battle
(`docs/research/vimy/oob-german.md`, Structure). The 9th Reserve Division's "11th Company of the 6th Reserve
Infantry" and "3d Company of the 395th Infantry" (`aef-251-divisions` p. 173) fit it.

## Strength

Every company's `strength` is an estimate; no source read gives a 1917 company figure for any of these units.

- **British: 150 a company**, the Vimy scenario's figure for its British battalions (`docs/research/vimy/oob-canadian.md`,
  Strength): about 600 of a battalion in the fighting line (Nicholson 1962, p. 232 n., of 1918), a quarter each.
- **The 10/Argyll & Sutherland Highlanders (9th Division): 120 a company**, a fifth below the rest, because BOH I p. 228
  says it "was weak originally" on 9 April. How weak is not said; the fifth is the builder's.
- **German, the 54th and 9th Reserve Divisions: 125 a company**, the Vimy scenario's figure for companies in the line
  (`docs/research/vimy/oob-german.md`, Strength: at most 125, BOH I p. 317; the range 75-150).
- **German, the 107th Division: 150 a company**, the Vimy scenario's figure for battalions at rest: the division came
  "brought from Russia" (BOH III p. 48), out of the line in the west.
- No `paperStrength`, `officers` or `lewisGuns` is entered, so the doctrine's company defaults apply (as for the Vimy
  scenario's companies), and the engine lists them in `defaultsUsed`.

## Conflicts

- **Von Moser's rank.** BOH I calls him "General von Moser" (p. 376) and indexes him "Gen. v."; BOH III calls him
  "Lieut.-General von Moser" (pp. 49, 141). Entered: Lieutenant-General, from the later and more specific volume; the
  British histories may render *General der Infanterie* and *Generalleutnant* loosely.
- **Dieffenbach's rank.** BOH I's text has "Lieut.-General Dieffenbach" (p. 197), its index "Gen.". Entered: the text's.
- **Laffert.** Bean IV (p. 647) has "General von Laffert, commanding the Fourth German Army", where other accounts make
  him the commander of the Wytschaete Group under the Fourth Army; the OCR is poor and the passage is not clear. Not
  entered (Open questions).
- **The 51st Division's battalions' names.** BOH I and Bewsher write "5/Seaforth" and "5th Seaforth Highlanders" at
  Arras; BOH III writes the same battalions "1/4th Gordon Highlanders" at Cambrai (p. 109), the Territorial first-line
  form. Entered as the Arras sources print them.

## Open questions for the historian

- **The ratings.** All are the builder's drafts against the Vimy rubric, from the British official histories alone. The
  German commanders' conduct needs the German official history (*Der Weltkrieg* vols. 12-13) and the corps and
  regimental histories BOH cites (von Moser's *Feldzugsaufzeichnungen*; the *Tankschlacht* monograph), none of which
  was reached. Most German ratings are placeholders for that reason.
- **Becke's order-of-battle tables.** *Order of Battle of Divisions* (parts 1-4, on archive.org) would confirm each
  battalion's brigade and dates in April 1917 and give every G.O.C.'s dates of command, but its tables are printed
  sideways and the OCR text is unreadable; the PDF is on a storage host this environment cannot reach. The battalion
  lists here rest on the divisional histories and BOH; Becke would settle the 34th Division's 22nd, 24th and 26th
  Northumberland Fusiliers (named at Arras by Shakespear, not by BOH) and the 62nd's order of battle after January.
- **Flanders and Messines.** BOH 1917 vol. II (Messines, Third Ypres) was not found on archive.org, and Bean's volumes
  on the Australian War Memorial's site were refused. II Anzac (Godley), XVIII Corps (Maxse), the 3rd Australian and New Zealand
  Divisions at Messines, and the German Flanders commanders (Sixt von Armin; Laffert, whose command Bean's OCR text garbles) should be
  entered from them. The 4th Australian Division is a library leader (Holmes) without a library division for the same
  reason: Bean IV's OCR text gives its battalions too poorly to cite.
- **Company strengths.** The battalions' war diaries (the National Archives, WO 95; the Bundesarchiv for the German
  regiments) would give each battalion's strength before its battle; every figure here is an average.
- **Forenames of the German commanders.** The British histories give surnames and titles only; a German source
  (Wegner, *Stellenbesetzung der Deutschen Heere*) would give them, and tell the two Freiherren von Watter apart.
