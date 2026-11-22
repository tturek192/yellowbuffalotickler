# Vimy research: divisional insignia, and observation balloons

This note covers the `insignia` entries in `scenarios/vimy-1917/oob-canadian.yaml`: the sleeve patch of each Canadian
division and of the British 5th Division, which the period map style draws its battalion blocks in. It also records the
search for observation balloons' places, which would be features of kind `balloon` (none are entered).

**Summary.** The four Canadian divisions wore a rectangular patch on the upper sleeve: red for the 1st, dark blue for the
2nd, black for the 3rd and green for the 4th (Nicholson p. 155). The 3rd Division's patch was **black at Vimy**: French
grey replaced it in May 1917, a month after the battle (the 3rd Canadian Division's Wikipedia article, citing Law,
*Distinguishing Patches*). The often-quoted "French grey" is therefore entered as a conflict, not as the colour. The
British 5th Division wore no battle patches, so its 15th and 95th Brigades and the 13th Brigade (attached to the 2nd
Canadian Division) are entered with `colour: none` and drawn in the side's colour; `defaultsUsed` lists them. No German
insignia were researched: German battalions take the side's colour (dark blocks with a red edge on the period map), and
the engine lists each German division in `defaultsUsed`.

**The hex values are a drawing choice.** The sources give the colour by name; the hex code entered with each is the
shade the map draws, not a measured shade of a surviving patch. Each entry's note says so.

**Everything here is a draft for the owner and the historian.**

## Sources

| id | Tier | Used for |
|---|---|---|
| `nicholson-1962` | official | The patches: a rectangle on the upper sleeve, coloured by division, with a smaller brigade patch above it whose shape gave the battalion (p. 155). Balloons opposite the First Army in May 1917 (p. 277 and note), with no places. |
| `wikipedia-divisions` | tertiary | 3rd Canadian Division (revision 1382093049, section "First World War"): black replaced by French grey in May 1917, citing Law, *Distinguishing Patches* (2008) pp. 5-6, not read. 5th Infantry Division (United Kingdom) (revision 1374139614, section "Insignia"): no battle patches worn, citing Osprey MAA 182 p. 9, not read. 1st Canadian Division (revision 1383666147): the red patch first worn on the Somme, a lead only (its sentence is marked "citation needed"). |
| `boh-1917-1` | official | A lead for balloons: No. 1 Kite Balloon Squadron R.F.C. worked with the First Army (p. 311), with no places. |

## Values entered

| Formation | Value | Source | Page | Quote (≤ 25 words) | Tier |
|---|---|---|---|---|---|
| `1cdn` insignia colour | red (`#b3261e`) | `nicholson-1962` | 155 | "denoted the division by its colour-red for the 1st Division" | official |
| `2cdn` insignia colour | dark blue (`#24427a`) | `nicholson-1962` | 155 | "dark blue for the 2nd" | official |
| `3cdn` insignia colour | black (`#1f1f1f`) | `nicholson-1962` | 155 | "black (later changed to French grey) for the 3rd" | official |
| `4cdn` insignia colour | green (`#3f7a3a`) | `nicholson-1962` | 155 | "and green for the 4th" | official |
| `1cdn`-`4cdn` insignia shape | rectangle | `nicholson-1962` | 155 | "A rectangular patch, sewn on the upper sleeve, denoted the division" | official |
| `5bdiv` insignia colour | none | `wikipedia-divisions` | 5th Infantry Division (United Kingdom), Insignia | "no battle patches were worn on their tunics or helmets" | tertiary |
| `13bde-brit` insignia colour | none | `wikipedia-divisions` | 5th Infantry Division (United Kingdom), Insignia | "no battle patches were worn on their tunics or helmets" | tertiary |

The 3rd Division's change of colour comes from the same article that the note on `3cdn` cites: "In May 1917, the
commander of the 3rd Division published a routine order stating that ... French grey was to be worn instead"
(wikipedia-divisions, 3rd Canadian Division). Nicholson gives the change but not its date.

How the engine uses them (`packages/engine/src/insignia.ts`): a battalion takes the patch of the nearest formation up its
chain that has an `insignia`; `none` stops the search, so the 13th Brigade's battalions do not take the 2nd Canadian
Division's blue. A battalion with no colour is drawn in its side's colour, and the formation is listed in `defaultsUsed`
as `insignia: <formation> ← side colour (wore none | no insignia)`.

Brigade patches (green, red, blue by brigade order) and battalion shapes (circle, semi-circle, triangle, square by
battalion order) are in the same paragraph of Nicholson, but the map draws one block per battalion in its division's
colour, so they are not entered.

## Observation balloons

No source read places a balloon at Vimy. Nicholson mentions balloons opposite the First Army in May 1917 (p. 277, with
a note on what a balloon did) and the British official history No. 1 Kite Balloon Squadron's help to the First Army
(p. 311); neither gives a position, a section's number or the ground a balloon stood over. No `balloon` feature is
entered, so the period map draws no balloon.

## Conflicts

- **The 3rd Division's colour.** Nicholson (p. 155) gives "black (later changed to French grey)" without a date; the
  3rd Canadian Division's Wikipedia article, citing Law's *Distinguishing Patches*, puts the change in May 1917. Accounts
  of Vimy that give the 3rd Division French grey (the owner's reference board does) describe the later patch. Black is
  entered. On the map a black block is told from a German one by its edge: German blocks are edged in red.
- **French grey's shade.** Not needed for 9 April, so not settled.

## Open questions for the historian

- Is the 3rd Canadian Division's patch at Vimy black, as the date of the change to French grey (May 1917, from Law's
  *Distinguishing Patches*, which was not read) implies? A routine order or a dated photograph would settle it.
- Did any battalion of the British 13th Brigade still wear a patch of a former division in April 1917 (the 5th
  Division's article says New Army battalions briefly wore those)? The 14th and 15th Royal Warwicks are the candidates.
- Where did the Canadian Corps' and Gruppe Vimy's observation balloons stand on 9 April 1917? A kite balloon section's
  war diary or a corps artillery map would give their places; with one, `balloon` features can be entered.
- What shades of red, dark blue, black and green were the patches? The map's hex values are a drawing choice.
- Were German divisional or regimental distinctions visible enough at Vimy to be worth a colour on the map?
