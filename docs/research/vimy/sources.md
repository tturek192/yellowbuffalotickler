# Vimy research: sources, and the scenario frame

This note covers the source registry (`scenarios/vimy-1917/sources.yaml`), how the sources are fetched,
and how the scenario frame in `scenarios/vimy-1917/scenario.yaml` was measured. Later research notes in
this folder cite the sources registered here.

## Fetching the sources

`bash scripts/fetch-sources.sh` downloads into `.cache/sources/`, which is gitignored and never committed.
The script is idempotent: it skips any file that already exists.

| File | What it is |
|---|---|
| `.cache/sources/nicholson-1962.pdf` | Nicholson 1962, the whole volume (676 PDF pages, about 33 MB). |
| `.cache/sources/nicholson-1962.txt` | `pdftotext -layout` of the PDF (about 2.1 MB). Book page numbers appear in the running heads. |
| `.cache/sources/nicholson-maps/map-7-vimy-ridge.png` | **Map 7, "Vimy Ridge, 9-12 April 1917"**: colour fold-out, PDF page 293, facing book p. 262. 2550 × 1423 px. |
| `.cache/sources/nicholson-maps/sketch-37-balkan-front-1916.png` | **Sketch 37, "The Balkan Front 1916"**: PDF page 263, book p. 235. A 1-bit stencil, so it is extracted white on black. |
| `.cache/sources/nicholson-maps/sketch-38-nivelle-plan.png` | **Sketch 38, "Nivelle's Plan and the German Withdrawal, Spring 1917"**: PDF page 265, book p. 237. |
| `.cache/sources/nicholson-maps/sketch-39-battles-of-scarpe.png` | **Sketch 39, "The Battles of the Scarpe, April-May 1917"**: PDF page 295, book p. 264. |

Chapter VIII, "The Battle of Vimy Ridge, 9-14 April 1917", runs over book pp. 233-268 (PDF pages 261-299) and
opens "(See Map 7 and Sketches 37-39)". Each file above was identified by reading its title off the image,
and its page matches the volume's list of maps and sketches. PDF pages 287-288 in the chapter carry only
photographs and are not extracted. For the Vimy fighting itself only Map 7 is useful: Sketch 37 is the Balkans,
Sketch 38 the Western Front at army scale, and Sketch 39 the Arras front at corps scale.

publications.gc.ca serves this PDF only after its "archived content" interstitial page has set a cookie.
The script first requests that page with a cookie jar, then the PDF with the jar and a `Referer` to the page.

## Source registry

| id | Tier | What it is | Notes |
|---|---|---|---|
| `nicholson-1962` | official | G. W. L. Nicholson, *Canadian Expeditionary Force 1914-1919* (Ottawa: Queen's Printer, 1962). The Canadian official history. | Chapter VIII, Map 7 and Sketches 37-39. Book page numbers are cited (the running heads in the text file), not PDF pages. |
| `ign-rge-alti` | secondary | IGN RGE ALTI elevation model, sampled through the Géoplateforme altimetry service (`data.geopf.fr`, resource `ign_rge_alti_wld`). | Modern 1 m–5 m elevation resampled to 25 m; post-war terrain, including the memorial park; not 1917 micro-relief. Shell holes, mine craters and trenches have been filled or landscaped since. |
| `vimy-brief-2026` | secondary | The owner's Vimy research brief, compiling Nicholson, Campbell, the RCA fire-plan essay and others. | A compilation, so never a historical target's only source. Carried over from the Plan 1 draft. |
| `artillery-notes-4` | primary | Artillery Notes No. 4, as quoted in the brief. | Carried over from the Plan 1 draft. Known only through the brief's quotations. |

Sources used only in this note, and not registered because no scenario value cites them:

| Source | Tier | Used for |
|---|---|---|
| English Wikipedia, "Canadian National Vimy Memorial", revision 1377286572 (coordinates via the MediaWiki API, `prop=coordinates`) | tertiary | The frame origin (a non-target value). |
| English Wikipedia, the articles of 17 communes (listed under "Georeferencing Map 7"), coordinates via the same API | tertiary | Ground control points for georeferencing Map 7, which only supports estimates. |

## Values entered

| Value | Where | Source | Page / section | Quote (≤ 25 words) | Tier |
|---|---|---|---|---|---|
| `zeroHour` = 1917-04-09T05:30 | `scenario.yaml` | `nicholson-1962` | p. 253 | "Promptly at 5:30 on the morning of Easter Monday, 9 April, the attack on Vimy Ridge opened" | official |
| `frame.origin` = lon 2.7736, lat 50.3794 | `scenario.yaml` | Wikipedia, "Canadian National Vimy Memorial" (rev. 1377286572) | infobox coordinates | 50.3794° N, 2.7736° E | tertiary |
| `frame.bearingDeg` = 75° | `scenario.yaml` | estimate, measured off Map 7 (`nicholson-1962`) | Map 7, facing p. 262 | (measurement; see below) | estimate |
| `frame.extent` = x −2000…7700, y −5000…3200 m | `scenario.yaml` | estimate, measured off Map 7 (`nicholson-1962`), with Nicholson's text for what the bounds are | Map 7; pp. 244, 246, 262, 263 | "passing in front of the villages of Mericourt and Oppy" (p. 246, the German Third Line) | estimate |
| `ign-rge-alti` note | `sources.yaml` | the owner's ruling for this task | — | — | — |

The frame origin is not a historical target: it only anchors the local metric grid. Its accuracy matters
only for consistency, and an IGN spot height at that point is 148.1 m, the crest of Hill 145, where the
memorial stands. The frame keeps the origin at the four decimals Wikipedia gives (about ±5 m).

## Georeferencing Map 7

Map 7 has no graticule, so it was fitted with `fitAffine` (`tools/georef/fit.ts`) to 17 ground control points.
Each point pairs the centre of a village's built-up block, as drawn on Map 7 and read by eye off gridded crops of
the 2550 px scan, with the commune's coordinates on English Wikipedia. A commune's coordinates mark its modern
centre, not the 1917 block, so each point carries an error of 100-250 m.

| GCP | Map 7 pixel (x, y) | lon, lat (Wikipedia) | Residual (m) |
|---|---|---|---|
| Souchez | 1198, 316 | 2.7436, 50.3914 | 75 |
| Givenchy-en-Gohelle | 1438, 316 | 2.7731, 50.3936 | 131 |
| Vimy | 1745, 579 | 2.8114, 50.3733 | 133 |
| Thélus | 1664, 816 | 2.8014, 50.3556 | 97 |
| Farbus | 1860, 764 | 2.8250, 50.3578 | 179 |
| Willerval | 2038, 784 | 2.8453, 50.3578 | 37 |
| Neuville-Saint-Vaast | 1339, 773 | 2.7589, 50.3561 | 260 |
| Carency | 857, 467 | 2.7050, 50.3792 | 121 |
| Ablain-Saint-Nazaire | 974, 300 | 2.7133, 50.3928 | 255 |
| Villers-au-Bois | 587, 528 | 2.6722, 50.3739 | 78 |
| Mont-Saint-Éloi | 754.5, 847 | 2.6939, 50.3519 | 179 |
| Acq | 455.5, 869.5 | 2.6575, 50.3483 | 30 |
| Marœuil | 862, 1190.5 | 2.7064, 50.3247 | 35 |
| Arleux-en-Gohelle | 2262, 714 | 2.8719, 50.3636 | 49 |
| Bailleul-Sir-Berthoult | 2091, 1044 | 2.8511, 50.3392 | 128 |
| Gavrelle | 2382, 1156.5 | 2.8869, 50.3300 | 48 |
| Méricourt | 2239, 214.5 | 2.8667, 50.4031 | 111 |

The fit's rms residual is **134 m**. Its scale is 8.45 m per pixel in both directions, which agrees within about 1%
with the map's own 2-mile scale bar (8.56 m per pixel), and the image's "up" points to 358°, so the map is drawn
north-up. The fit is good enough for the frame, and for nothing finer: trench lines need the trench maps, with
GCPs at trench junctions and road crossings.

A magenta overlay of these GCPs and of the frame's extent rectangle (`renderOverlay`, `tools/georef/overlay.ts`) was
checked by eye: every GCP sits on its village block, the memorial lands on the "HILL 145" label, and the rectangle
holds the whole Canadian front. The overlay image is not committed: it reproduces the map.

## Measuring the attack bearing

Map 7 draws the 9 April attacks as red arrows ("Canadian attacks, 9 Apr" in the legend). In four windows of the
scan, one per division, the red arrow pixels were isolated by colour, and a sweep of line angles found the angle
at which they project into the sharpest set of parallel lines. That angle converts to a true bearing through the
fit (image right is 88.4°):

| Division (window, Map 7 px) | Arrow angle above image horizontal | True bearing |
|---|---|---|
| 4th Canadian Division (x 1380-1530, y 395-560) | 26.6° | 62° |
| 3rd Canadian Division (x 1470-1660, y 560-715) | 14.5° | 74° |
| 2nd Canadian Division (x 1490-1850, y 715-840) | 0.9° | 87° |
| 1st Canadian Division (x 1490-1900, y 820-1010) | 13.2° | 75° |

The mean is 74.6°, entered as **75°**. The arrows fan over 62-87°, because the divisions attacked a ridge whose
crest runs north-west to south-east, so a single bearing is only a compromise. The opposing front lines on the map
run from Souchez to the Arras road at about 165°/345°, and the perpendicular to them is 75° too. With x along 75°,
the frame's y axis runs along the front (345°), which keeps traced front and objective lines close to monotone in y.

## Measuring the extent

The extent was measured by projecting points read off the georeferenced Map 7 into the frame (origin above,
bearing 75°), then rounding each bound outward to the next 100 m, which leaves a margin of 135-200 m:

| Bound | What sets it | Map 7 point (px) | Frame coordinate | Bound |
|---|---|---|---|---|
| North (max y) | The Souchez River north of the Pimple, which the 4th Canadian Division's 10th Brigade attacked on 12 April (pp. 244, 262) | 1330, 150 | y 3014 | maxY 3200 |
| South (min y) | Below Farbus Wood, at the southern end of the Brown Line | 1950, 960 | y −4865 | minY −5000 |
| West (min x) | The Canadian assembly area: behind the 1st Division's front and Neuville-St Vaast, and Zouave Valley | 1350, 1030 | x −1840 | minX −2000 |
| East (max x) | The German Third Line ("German line morning 13 Apr" on the map), the Oppy-Méricourt line (pp. 246, 263) | 2370, 515 | x 7545 | maxX 7700 |

The other points checked lie inside: the Pimple (x 542, y 2121), the southern end of the Canadian front (x −771,
y −4524), Zouave Valley (x −1558, y 1316), and the Third Line in front of Méricourt (x 6460, y 542) and Arleux
(x 5749, y −3376). The extent is 9.7 km by 8.2 km; at a 25 m cell the terrain grid is 388 × 328 = 127,264
samples. The georeferencing error (rms 134 m) is within the margins.

IGN spot heights at some of these points, as a check that they lie where the map says: the memorial 148.1 m (the
crest of Hill 145), the Souchez River north of the Pimple 66.5-78.5 m (the valley floor), Neuville-St Vaast
105.2 m, below Farbus Wood 88.3 m (the plain east of the ridge).

## Conflicts

- **Attack bearing.** The plan expected a bearing of about 80-100°, and Nicholson writes that "the opposing front
  lines ran almost due north and south" (p. 246), which suggests 90°. Map 7, georeferenced, shows the front lines at
  about 165°/345° and the attack arrows averaging 75°. The scenario uses the map's 75°, as an estimate; Nicholson's
  "almost" covers a 15° difference.

## Open questions for the historian

- Is a single attack bearing of 75° acceptable for the whole corps, given that the 4th Division attacked at about
  62° and the 2nd at about 87°? If the engine later needs per-division axes, the sectors could carry their own.
- The extent stops at the German Third Line (Oppy-Méricourt). Should it reach the partly built Drocourt-Quéant Line
  (Nicholson's "fourth position", p. 246) if later scenarios cover the advance after 12 April?
- Map 7 covers the whole corps front at a small scale and says "Only principal features and those mentioned in the
  text are shown". Which period trench maps of the ridge can be had from the allowed hosts, to georeference for the
  trench lines? None has been searched for yet.
