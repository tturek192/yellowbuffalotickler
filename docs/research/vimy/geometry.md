# Vimy research: geometry (lines, trenches, terrain features)

This note covers `scenarios/vimy-1917/geo/lines.geojson`, `scenarios/vimy-1917/geo/features.geojson`, the barrage-sector
skeletons in `scenarios/vimy-1917/fireplan.yaml`, the widened frame extent, and the terrain grid
`scenarios/vimy-1917/terrain/rge-alti-25m.json`. Everything is digitized from Nicholson's Map 7 ("Vimy Ridge, 9-12 April
1917", facing p. 262), the only legible Vimy map among the reachable sources (sources.md). Sketches 37-39 were not used:
Sketch 39 is at corps scale and shows nothing of the ridge that Map 7 does not.

**Summary.** affine fit rms: 42.4 m (8 ground control points at road and railway junctions; Task 6's 17 village centres
gave 134 m). An independent check against about 2,900 points on the map's roads and railways gives 35 m rms.

## Georeferencing Map 7

### Method

Task 6 fitted Map 7 to village centres, which carry 100-250 m of error each because a commune's coordinates mark its modern
centre, not the 1917 block. This fit uses sharp points instead: road and railway junctions that exist both on Map 7 and in
IGN's BD TOPO V3 (`ign-bdtopo`, fetched 2026-11-20 through the Géoplateforme WFS, `data.geopf.fr/wfs/ows`, layers
`BDTOPO_V3:troncon_de_route` and `BDTOPO_V3:troncon_de_voie_ferree`, bounding box 2.62-2.93° E, 50.30-50.425° N;
cached in `.cache/sources/bdtopo/`, not committed).

1. **Choosing the junctions.** The modern road and railway network was drawn over Map 7 with the village fit, and every
   modern crossing of two numbered roads or a road and a railway was tried. A junction was kept only if both of its arms
   are straight on both the map and the modern network for at least 150 m, cross at more than 40°, and are clearly the
   same road (by course and by the villages they join).
2. **The map pixel.** Map 7 draws main roads as two thin parallel lines (about 7 px apart) and railways as one line.
   The centre of each arm was measured every pixel along it, on profiles across it (sub-pixel peak positions of the ink
   in the red channel, where the map's red overprint vanishes), a straight line was fitted to each arm with outlier
   rejection, and the pixel is the intersection of the two fitted lines (typically 0.2-1.5 px standard deviation of the
   arm fits).
3. **The coordinates.** The modern junction is the BD TOPO vertex shared by the two centrelines, except at La Chaudière
   (the centre of the modern roundabout) and at Maroeuil, where the GCP is the intersection of the straight railway on
   either side of the bend (the corner of the two tangents, measured the same way on the map and in BD TOPO).
4. The fit is `fitAffine` (`tools/georef/fit.ts`); the residuals below are its output.

| GCP | What it is | Map 7 pixel (x, y) | lon, lat (BD TOPO) | Residual (m) |
|---|---|---|---|---|
| La Chaudière | Lens road (N17/D917) × Givenchy-Vimy road (D51) | 1682.3, 461.7 | 2.801255, 50.379886 | 56.8 |
| Farbus station | Arras-Lens railway × Farbus-Willerval road (D50) | 1937.1, 794.0 | 2.831987, 50.355863 | 19.2 |
| Bailleul bridge | Arras-Lens railway × Arras-Gavrelle road (D919) | 2002.5, 1068.4 | 2.841072, 50.335401 | 53.9 |
| Les Tilleuls | Lens road (D917) × Neuville-Thélus road (D49) | 1575.4, 793.0 | 2.789628, 50.355658 | 34.1 |
| Neuville SW | Béthune road (D937) × D55, south-west of Neuville-St-Vaast | 1233.9, 848.2 | 2.749329, 50.350969 | 35.4 |
| Thélus hairpin | D49 × D50 at the bend south-east of Thélus | 1834.2, 883.6 | 2.819735, 50.349220 | 37.7 |
| Villers-au-Bois | D58 × the old road west of Villers-au-Bois | 498.0, 643.5 | 2.661909, 50.365040 | 30.4 |
| Maroeuil bend | Arras-St-Pol railway, corner of the tangents at Maroeuil | 820.0, 1237.1 | 2.699745, 50.320721 | 55.6 |

### Quality

- **affine fit rms: 42.4 m.** Scale 8.4 m per pixel; the map is drawn north-up.
- **Independent check.** The perpendicular offset between Map 7's road and railway centrelines (measured as above) and
  the modern BD TOPO centrelines, along the Arras-Lens and Arras-St-Pol railways and the D917, D937, D341, D51, D919,
  D950 and D50 roads (2,885 points sampled along them, not the GCPs themselves): rms 35 m, median 21 m, 90th percentile 63 m.
- **Leave-one-out.** Dropping one GCP and predicting it from the other seven gives 25-115 m for seven of them, and
  176 m for the Maroeuil bend at the south-west edge of the map, where the fit then extrapolates. The battlefield
  (the area between Neuville-St-Vaast, Givenchy, Vimy and Farbus) is inside the GCPs.
- **Points not used.** Village centres (100-250 m each); the memorial (Map 7 marks Hill 145 only by a label);
  crater groups (Map 7 shows none, below). The other candidate junctions failed step 1, mostly where the modern A26 motorway
  or later realignments have changed the roads.
- **Terrain check.** The IGN grid's 80, 100, 120 and 140 m contours, drawn over Map 7 with this fit
  (`overlays/map7-vs-ign-contours.png`), follow the map's own layer tints ("Contours indicated by layer tints: 80, 100,
  120, 140 metres") along the ridge's eastern escarpment to within about 100 m.

## The frame extent

`frame.extent.minX` moves from −2000 to **−6000** m (the owner's ruling): Map 7 marks the Canadian field and medium
batteries west of Carency, Souchez and Mont-St-Éloi with red dots ("Divisional artillery batteries", "Medium batteries"
in the legend). The red dots were found by colour (small round components), projected into the frame, and the
westernmost of the main battery belt lies at x −5966 m (Map 7 pixel 714, 463, west of Carency); minX −6000 holds it.
Five isolated dots lie farther west (x −6924 to −9103, around Villers-au-Bois and Mont-St-Éloi) and stay outside (open
question below). The other bounds are unchanged. The extent is now 13.7 km by 8.2 km.

## Terrain grid

`NODE_USE_ENV_PROXY=1 npx tsx scripts/fetch-dem.ts scenarios/vimy-1917/scenario.yaml --cell 25 --out
scenarios/vimy-1917/terrain/rge-alti-25m.json` sampled 179,744 points in 899 requests (2026-11-20) into a
548 × 328 grid of 25 m cells; the fetch completed and wrote the grid. Decoded: **max 172.8 m, min 21.3 m**.

Both lie outside the range expected for the original extent (max 140-150 m, min 40-75 m), so they were investigated:

- **Max 172.8 m** is at frame (−3163, 3188), lon 2.7189, lat 50.3998: the Lorette spur (Notre-Dame-de-Lorette),
  which the widened west bound now takes in at the north-west corner. A direct check of the elevation service there gives
  164-171 m, and English Wikipedia's "Ablain-Saint-Nazaire" (rev. 1386376319) gives the commune's maximum as 188 m.
  East of x −2000 (the old extent) the maximum is **149.8 m** at frame (38, 12), 40 m from the memorial: Hill 145.
- **Min 21.3 m** is at frame (5213, 2938), lon 2.8338, lat 50.4173, north of Avion in the Lens plain, at the north-east
  corner. English Wikipedia gives Avion's minimum as 27 m (rev. 1381789274) and Méricourt's as 31 m (rev. 1381870145).
  West of x 3000 the minimum is 28.6 m. The original expectation did not allow for the Lens plain.

So the grid is consistent with the ground; no hole or bad batch. The Hill 145 test uses the maximum east of x −2000.

## Digitizing

All digitizing is in Map 7 pixels converted with the fit, except the two front lines, which were traced on a copy of Map 7
resampled into the frame with the same fit (`frame.unprojectXY`, then the fit's pixel), using a least-cost path through
pixels of the line's colour inside a corridor around hand-placed waypoints. Bands (the objective lines) were followed by
their centrelines, read off gridded crops. Every feature carries `source: nicholson-1962`, a `page`, and an `estimate`
(also its `method`, which the loader keeps as the citation's value) stating "digitized from Map 7, affine fit rms 42 m"
and its expected accuracy.

### How Map 7 draws things

| Thing | On Map 7 |
|---|---|
| Canadian front line | thick red line; German front line: thick dark blue line. South of the Corps the pair is labelled "FRONT LINES LAST LIGHT 8 APR". |
| Black Line | broad grey band; its southern end is labelled "BLACK LINE" and, along it, "ZWÖLFER GRABEN" (p. 254 confirms). |
| Red Line | broad pink band, labelled "RED LINE" at its southern end. |
| Blue Line | broad grey band south of Thélus, labelled "BLUE LINE". |
| Brown Line | faint band ending at the "BROWN LINE" label by Farbus Wood. |
| German Third Line | blue dotted line labelled "GERMAN LINE MORNING 13 APR", in front of Méricourt and Arleux. |
| Subways | faint double outlines (legend "Subways"). |
| Woods | green hatching; villages: grey hatched blocks. |

### Lines (`lines.geojson`)

Lines must have strictly ascending y after projection. Traces were simplified (Ramer-Douglas-Peucker, 12 m for the fronts,
6 m for objectives) and any vertex that doubled back in y was dropped: **two vertices of `cdn-front`**: one at frame
(−568, −688), where the red line runs east-west for 80 m south-east of Hill 145, and one at its northern tip (−960, 2552).
None elsewhere.

| id | y range (m) | Vertices | Accuracy | Notes |
|---|---|---|---|---|
| cdn-front | −4600…2568 | 67 | ±60 m | |
| ger-front | −4600…2552 | 64 | ±60 m | |
| black-1cdn | −4499…−2858 | 6 | ±60 m | the Zwölfer-Graben band |
| black-2cdn | −3389…−1730 | 4 | ±60 m | |
| black-3cdn | −2154…−316 | 6 | ±60 m | |
| black-4cdn | −765…1326 | 9 | ±80 m | north of y ≈ 785 an estimate (below) |
| red-1cdn | −4579…−2995 | 7 | ±60 m | pink band on the Zwischen-Stellung |
| red-2cdn | −3319…−1959 | 6 | ±80 m | east of the Lens road, through Les Tilleuls |
| red-3cdn | −1939…−453 | 6 | ±80 m | west edge of the Bois de la Folie |
| red-4cdn | −637…1293 | 8 | ±100 m | north of y ≈ 785 an estimate (below) |
| blue-1cdn | −4401…−3339 | 5 | ±60 m | grey band |
| blue-2cdn | −3541…−1770 | 10 | ±120 m | band legible south of Thélus only; north an estimate (below) |
| brown-1cdn | −4245…−3259 | 4 | ±100 m | |
| brown-2cdn | −3515…−1890 | 7 | ±150 m | an estimate (below) |

**Estimates inside the lines.** (1) The 12th Brigade (4th Division, north flank) was "to seize its sector of the German
front-line position" (p. 259); Map 7 draws neither band there. North of the band ends (Map 7 pixel y 385), black-4cdn
runs 250 m beyond the German front and red-4cdn just beyond it. (2) North of Thélus the Blue band is not legible; blue-2cdn
is placed east of Thélus, Hill 135, Count's Wood (Bois du Goulot) and the Bois de Bonval, which p. 247 says the Blue Line
included. (3) The Brown band is legible only at Farbus Wood; brown-2cdn follows the eastern edge of the ridge woods to the
southern Bois de Bonval (p. 247), kept at least 44 m east of blue-2cdn.

**Checks against the text.** In every sector the lines are ordered cdn-front < ger-front < black < red < blue < brown at
25 sample y values (the closest pair: red-4cdn 9 m beyond black-4cdn at the north end, where both close on the front).
Black lies 562-782 m beyond the Canadian front at each sector's middle (p. 247: "an average distance of 750 yards",
686 m). In the 1st Division the Blue Line is 1,159 m beyond the Red (p. 248: "some 1200 yards", 1,097 m) and the Brown
3,709 m beyond the Canadian front (p. 248: "4000 yards", 3,658 m).

### Division boundaries (sector y-ranges)

Map 7 draws no boundary lines; it draws each assaulting battalion's arrow, labelled. Each boundary is placed midway
between the outermost arrows of the two neighbouring divisions, where they cross the German front, and rounded to 10 m:

| Sector | yMin | yMax | Frontage | Text |
|---|---|---|---|---|
| barrage-1cdn | −4650 | −2980 | 1,670 m | "a frontage of more than a mile" (p. 253) |
| barrage-2cdn | −2980 | −1770 | 1,210 m | "a 1400-yard front" (p. 254), 1,280 m |
| barrage-3cdn | −1770 | −570 | 1,200 m | — |
| barrage-4cdn | −570 | 1320 | 1,890 m | — |

The four together span 5,970 m; Nicholson gives the Corps "a front of 7000 yards" (6,400 m, p. 245; see Conflicts).
The leg values in `fireplan.yaml` were the Plan 1 draft's, entered as estimates "placeholder until Task 10"; Task 10
replaced them with the corps timetable (fireplan.md, "Leg values").

### Features (`features.geojson`, 39)

| Kind | Features | Accuracy |
|---|---|---|
| trench | ger-first-position (the front trace), zwolfer-graben, zwischen-stellung (south of Les Tilleuls only), ger-second-position (traced as the Brown Line, which "covered the German Second Line", p. 247), ger-third-position | ±60-150 m |
| communication-trench | turko-graben, thelus-trench | ±100-120 m |
| subway | subway-1 … subway-12 (unnamed on Map 7; below) | ±60 m |
| wood | Bois de la Folie, Bois de Bonval, Bois du Goulot (Count's Wood), Farbus Wood, Bois de la Ville, Bois de Givenchy, Bois en Hache | ±100 m |
| village | 14 within the extent, centres of the hatched blocks, with a radius | ±100 m |
| strongpoint | hill-145, hill-135, the-pimple, la-folie-farm | below |

**Hills.** Map 7 marks the hills only with labels. Each hill is the highest `ign-rge-alti` cell within 300-450 m of its
label (the label sits beside the summit): Hill 145 at 149.8 m (40 m from the memorial), Hill 135 at 139.7 m, The Pimple at
122.2 m (Nicholson: "an independent height of 120 metres", p. 245). The grid is the modern surface.

**Subways (re-traced in fix round 1).** The first digitizing placed seven subways by hand at constant pixel rows, and
the task review found four of them 200-460 m off their outlines, two ending in no man's land or beyond the German front.
They were re-traced: each is the centreline of a grey double outline (the legend's "Subways" symbol), read at 7-8× zoom
on gridded crops, so every vertex is within about 2 px (20 m) of the outline, plus the fit's error. Map 7 draws **12**
outlines, all ending at or just short of the red Canadian front line (p. 250: "leading to the Canadian front line"):
five in the 4th Division's sector (p. 259 says six were tunnelled there), three in the 3rd, two in the 2nd and two in the
1st. After projection every subway's easternmost vertex lies 12-163 m west of `cdn-front` and 211-851 m west of
`ger-front`. subway-1 is a short isolated outline that stops about 85 m short of the front on the map. Nicholson's
total is "eleven subways" (p. 250); the map's twelfth may be a branch or a cave entrance, and none is named.

**Mine craters.** Map 7 marks no craters; the green rings near Hill 145 and north of La Folie Farm are, in the map's
symbology, orchards (p. 256 mentions "the orchards to the north"). No crater was entered (open question).

## Overlay checks

Each overlay (`overlays/`) draws the digitized features in magenta over Map 7 with the fit (`renderOverlay`,
`tools/georef/overlay.ts`), cropped to the area concerned and reduced to 128 colours. Each was looked at.

| Overlay | What it checks | Corrections made |
|---|---|---|
| `map7-gcps.png` | each GCP's modern coordinates land on its map junction | none needed (all within the dot) |
| `map7-front-lines.png` | both fronts lie on the red and dark-blue lines | the first German trace cut across the Pimple's hatching for 500 m; re-traced with a corridor |
| `map7-objective-lines.png` | the objective lines lie on their bands | blue-2cdn and brown-2cdn crossed north of Thélus; brown moved up to 130 m east, blue 40 m west |
| `map7-trenches-subways.png` | trenches and subways on their map lines | the Third Line was first read from row medians of blue pixels and ran up to 170 m inside the dotted line; re-traced from the detected dots. The subways were re-traced in fix round 1 (below) |
| `map7-subways-detail.png` | each subway on its grey double outline, at 4-5× (thin magenta; green is cdn-front) | added in fix round 1; every subway lies on its outline to within about 2 px (20 m) |
| `map7-woods-villages-strongpoints.png` | woods, villages, hills | Bois de la Folie outline was up to 170 m north-east of the hatching (redrawn); Écurie's point was 850 m off its block (corrected, then outside the extent) |
| `map7-vs-ign-contours.png` | the fit against the map's layer tints | none |

## Values entered

| Value | Source | Page / section | Quote (≤ 25 words) | Tier |
|---|---|---|---|---|
| Map 7 georeference: affine fit rms 42.4 m, 8 GCPs | `ign-bdtopo` (coordinates), `nicholson-1962` (pixels) | Map 7 | (measurement; above) | secondary / official |
| `frame.extent.minX` −6000 | `nicholson-1962` | Map 7 legend | "Divisional artillery batteries" | estimate |
| `terrain`: rge-alti-25m.json, 548 × 328 × 25 m | `ign-rge-alti` | — | — | secondary |
| cdn-front, ger-front | `nicholson-1962` | Map 7 | "FRONT LINES LAST LIGHT 8 APR" | official (digitized: estimate) |
| black-* | `nicholson-1962` | Map 7; p. 247 | "the Black Line, at an average distance of 750 yards from the Canadian front trenches" | official (digitized) |
| black-1cdn / zwolfer-graben | `nicholson-1962` | p. 254 | "the Zwolfer-Graben, which marked the southern end of the Black Line objective in the Canadian sector" | official |
| red-1cdn | `nicholson-1962` | p. 247 | "The Red Line ran north along the ZwischenStellung on the Canadian right" | official |
| red-3cdn, red-4cdn | `nicholson-1962` | p. 247 | "turning north-westward beyond the crest of the Ridge to include La Folie Farm and Hill 145" | official |
| red-2cdn | `nicholson-1962` | p. 255 | "the Red Line ran just east of the Lens road and included the battered hamlets of Les Tilleuls" | official |
| blue-1cdn, blue-2cdn | `nicholson-1962` | p. 247 | "the Blue Line, which included Thelus, Hill 135 and the woods (Bois de Bonval and Count's Wood) overlooking the village of Vimy" | official |
| brown-1cdn, brown-2cdn, ger-second-position | `nicholson-1962` | p. 247 | "the Brown Line, covered the German Second Line, running through Farbus Wood, the Bois de la Ville" | official |
| 4th Division north flank (black/red-4cdn estimate) | `nicholson-1962` | p. 259 | "was to seize its sector of the German front-line position and cover the northern flank" | estimate |
| zwischen-stellung | `nicholson-1962` | p. 246 | "a single-trench Intermediate Line (Zwischen-Stellung) reached southward from the village of Vimy through the western edge of Thelus" | official |
| ger-third-position | `nicholson-1962` | Map 7; p. 246 | "the Third Line snaked its way southward from Lens over the plain, passing in front of the villages of Mericourt and Oppy" | official |
| turko-graben | `nicholson-1962` | p. 255 | "the Turko-Graben, which reached northward behind the road" | official |
| thelus-trench | `nicholson-1962` | p. 256 | "overran Thelus Trench north of the village" | official |
| subway-1…12 | `nicholson-1962` | Map 7; p. 250 | "eleven subways of a total length of almost four miles, leading to the Canadian front line" | official |
| hill-145, hill-135 | `nicholson-1962` + `ign-rge-alti` | p. 245 | "Hill 135 (measured in metres), immediately north of the village of Thelus, and Hill 145, two miles farther north-west" | estimate |
| the-pimple | `nicholson-1962` + `ign-rge-alti` | p. 245 | "an independent height of 120 metres at the north end of the Ridge, known as \"The Pimple\"" | estimate |
| la-folie-farm | `nicholson-1962` | Map 7; p. 246 | "La Folie Farm (midway between Hills 135 and 145)" | official |
| woods, villages | `nicholson-1962` | Map 7 | (map labels) | official (digitized) |
| sector y-ranges | `nicholson-1962` | Map 7; p. 254 | "advancing on a 1400-yard front with four battalions forward" | estimate |
| sector leg values | see fireplan.md (Task 10) | — | — | — |

## Conflicts

- **Corps frontage.** The four sectors span 5,970 m at the German front; Nicholson gives "a front of 7000 yards"
  (6,400 m, p. 245). The arrows on Map 7 may not reach the Corps boundaries, and the boundaries were placed at the German
  front, where the line is shortest. The sectors use the map.
- **The 2nd Division's frontage** is 1,210 m on the map against "a 1400-yard front" (1,280 m, p. 254).
- **Black to Red, 1st Division.** 540 m on the map at the sector's middle; p. 255 says the Intermediate Line "lay 700 yards
  ahead" (640 m). Within the bands' width (about 130 m).
- **Zwischen-Stellung north of Les Tilleuls.** Map 7 prints "ZWISCHEN STELLUNG" along the grey Black-line band near La
  Folie Farm, while p. 247 puts the Red Line on the Zwischen-Stellung "on the Canadian right" only. Only the trench south
  of Les Tilleuls, where the map draws it as a separate thin line, was entered.
- **Village GCPs vs the new fit.** Task 6's village centres differ from this fit by up to about 300 m (their own error,
  above); the frame's bearing (75°) was measured with the village fit and is unaffected at that accuracy.

## Open questions for the historian

- **Subway names.** Map 7 draws twelve subway outlines in the Canadian lines without names, and Chapter VIII names none
  (only Zivy Cave). Goodman, Grange, Lichfield and the others need a trench map or a tunnelling-company history to tie
  names to outlines. Nicholson counts eleven subways (p. 250) and six in the 4th Division's sector (p. 259); the map shows
  twelve and five.
- **Mine craters.** Map 7 shows none, and no source in this task gives crater coordinates that can be tied to a named
  crater. The crater groups in no man's land (from trench maps, or the memorial park's preserved craters) are missing.
  The searches tried (all 2026-11-20, UTC):
  - Map 7's legend and symbology: no crater symbol; the green rings are orchards (above).
  - `en.wikipedia.org` search API, query "Vimy crater" (16:54): titles Battle of Vimy Ridge, Canadian National Vimy
    Memorial, Vimy, German attack on Vimy Ridge, Tunnelling companies of the Royal Engineers, Thélus, 172nd and 176th
    Tunnelling Company. Not read: the next queries ("Vimy mine crater coordinates", "Broadmarsh crater", "Grange subway
    Vimy", the same on `de.wikipedia.org`, and a 3 km geosearch around the memorial) were refused with HTTP 429 (rate
    limit), and retries with backoff over about two minutes were refused too. Articles "Lichfield Crater" and "Zivy
    Crater" do not exist on en.wikipedia.org (16:58, `prop=coordinates`).
  - `commons.wikimedia.org` geosearch, files within 2.5 km of the memorial (281 files): no title containing crater,
    krater, cratère or entonnoir.
  - IGN BD TOPO V3 WFS (`data.geopf.fr`), bounding box 2.70-2.86° E, 50.33-50.41° N: `detail_orographique` (30 objects:
    valleys, summits, ridges, a slope, a spoil heap; no crater), `ligne_orographique` (banks, levees, quarries),
    `zone_d_activite_ou_d_interet` (no crater), `toponymie` (584 names) and `cimetiere` (38).
  - **One lead.** BD TOPO's `cimetiere` layer has two Commonwealth war cemeteries, both named "Lichfield Crater":
    `CIMETIER0000000310100058` centred at 2.776652° E, 50.359575° N (frame −358, −2173) and `CIMETIER0000000219989140` at
    2.778135° E, 50.354721° N (frame −395, −2718). Both lie on the Canadian front line as digitized, in the 2nd Division's
    sector: the first 27 m east of `cdn-front`, the second 8 m west of it (within the fit's error). But BD TOPO gives both the same name,
    so which crater each is cannot be settled from the allowed hosts; neither was entered. Should they be entered as
    unnamed crater features?
- **The 12th Brigade's objectives** north of the Black and Red bands are estimates (above). Is there a trench map or order
  giving them?
- **Blue and Brown north of Thélus** are estimates from the text. A barrage map or trench map would fix them.
- **Division boundaries** are from the battalion arrows; the Corps' boundary orders would be better.
- **Five red dots west of x −6000** (around Villers-au-Bois and Mont-St-Éloi): are they batteries, and should the extent
  reach them in Task 9/10?
- **Trench maps** (1:10,000 or 1:20,000) remain the way to sharpen the trench geometry; none was reachable from the
  allowed hosts in this task.
