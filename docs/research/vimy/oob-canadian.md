# Vimy research: the Canadian Corps order of battle, to company

This note covers `scenarios/vimy-1917/oob-canadian.yaml`: the Canadian Corps on 9 April 1917 from the corps down to
every company, with each company's role, objective line, start position, start time and strength. Leaders (names,
ranks, drafted ratings) are in `leaders.md`; the `leaderId` of each formation points there. The query helpers that read
this structure (`formation`, `battalions`, `divisionOf`, ...) are in `packages/scenario/src/queries.ts`.

**Summary.** 1 corps, 4 Canadian divisions, 12 Canadian brigades, the British 13th Brigade (attached to the 2nd Canadian
Division), the British 15th and 95th Brigades (corps reserve, under a `5bdiv` group), 62 battalions, 248 companies:
156 attacking (assault, mop-up or support) and 92 in reserve. A sanity run (`npm run sim -- run
scenarios/vimy-1917/scenario.yaml --seed 1`) runs to completion at minute 768.

## Sources

| id | Tier | Used for |
|---|---|---|
| `nicholson-1962` | official | The spine: ch. VIII pp. 247-263 (the plan, each division's assaulting battalions right to left, the bounds and the reserve brigades); Appendix A pp. 539-542 (commanders' dates); Appendix B p. 545 (brigades' battalions, November 1918); pp. 225, 232 (the 85th and 116th; battalion strength); p. 252 note (the British 5th Division in corps reserve). |
| `hussey-inman-1921` | secondary | The British 13th Brigade's assembly, start time, battalion order and roles (pp. 149, 153-155); the 5th Division in corps reserve (p. 157); the 15th and 95th Brigades' battalions (pp. 158, 161). |
| `mcevoy-finlay-1920` | secondary | The 72nd Battalion's strength on the eve of the attack (p. 46), the basis of an estimate. |
| `hayes-1920` | secondary | The 85th Battalion: reserve role (p. 45), the evening attack by C and D Companies (pp. 51-53). |
| `holland-1918` | secondary | The 10th Battalion's two objectives (pp. 28-29). |
| `wikipedia-vimy-oob` | tertiary | A lead for the whole structure; the only source read for the 60th Battalion in the 9th Brigade and for the 9th, 15th and 95th Brigades in corps reserve (citing Turner 2005, p. 39, which was not read); the British battalions' full titles. |

Map 7 (Nicholson, facing p. 262) draws each assaulting battalion's arrow with its number. At the scan's resolution
(8.4 m a pixel) only the 2nd Division's labels are legible; they read 26th, 24th, 19th, 18th from north to south, as
entered. The other divisions' arrows were not readable.

## Structure

`cdn-corps` (Byng) → `1cdn` (Currie), `2cdn` (Burstall), `3cdn` (Lipsett), `4cdn` (Watson), and `5bdiv` (Stephens).

| Division | Brigade (leader) | Battalions | Source |
|---|---|---|---|
| `1cdn` | `1bde` (Griesbach), division reserve for the Blue and Brown | 1st, 2nd, 3rd, 4th | pp. 255-257; App. B p. 545 |
| | `2bde` (Loomis) | 5th, 7th, 10th (assault), 8th | p. 253; App. B p. 545 |
| | `3bde` (Tuxford) | 15th, 14th, 16th (assault), 13th | p. 253; App. B p. 545 |
| `2cdn` | `4bde` (Rennie) | 18th, 19th (assault), 21st (Red), 20th | pp. 254-255; App. B p. 545 |
| | `5bde` (A. H. Macdonell) | 24th, 26th (assault), 25th (Red), 22nd (mop-up) | pp. 254-255; App. B p. 545 |
| | `6bde` (Ketchen), division reserve for the Blue and Brown | 31st, 28th, 29th (Blue), 27th (Brown) | pp. 256-257 |
| | `13bde-brit` (Jones), attached | 1st Royal West Kent, 2nd KOSB (Blue, then Brown), 14th and 15th Royal Warwicks | p. 256; `hussey-inman-1921` pp. 149, 153-154 |
| `3cdn` | `7bde` (A. C. Macdonell) | RCR, PPCLI, 42nd (assault), 49th | pp. 254-256; App. B p. 545 |
| | `8bde` (Elmsley) | 1st, 2nd, 4th CMR (assault), 5th CMR | pp. 254-256; App. B p. 545 |
| | `9bde` (Hill), corps reserve | 43rd, 52nd, 58th, 60th, 116th | `wikipedia-vimy-oob`; App. B p. 545; p. 225 |
| `4cdn` | `10bde` (Hilliam) | 44th, 50th (standing by for the Pimple) | pp. 259, 261 |
| | `11bde` (Odlum) | 102nd, 87th (assault), 54th, 75th (through to the Red), 47th (attached from the 10th), 85th | p. 259 |
| | `12bde` (MacBrien) | 38th, 72nd, 73rd (assault), 78th (through to the Red), 46th (attached from the 10th) | pp. 259-261 |
| `5bdiv` (group) | `15bde-brit` (Turner), corps reserve | 16th Royal Warwicks, 1st Norfolk, 1st Bedford, 1st Cheshire | p. 252 note (the 5th Division "in corps reserve"); `hussey-inman-1921` pp. 157-158; `wikipedia-vimy-oob` |
| | `95bde-brit` (Gordon-Lennox), corps reserve | 1st Devon, 1st East Surrey, 1st DCLI, 12th Gloucester | p. 252 note; `hussey-inman-1921` pp. 157-158, 161; `wikipedia-vimy-oob` |

**Attached battalions sit under the brigade they fought with** (the 47th under the 11th Brigade, the 46th under the
12th, the 85th under the 11th; the British 13th Brigade under the 2nd Canadian Division), because the engine and the
queries read command from the tree.

**The British 5th Division is a `group`, not a `division`.** It was a division under Byng's command, in corps reserve
with two brigades (its 13th Brigade was with the 2nd Canadian Division). The scenario's test, as briefed, asks that the
corps' children of kind `division` be exactly the four Canadian divisions, so the 5th Division's remainder is entered as
a `group` led by its commander. Nothing else reads the kind.

## Roles, objectives and start times

**Roles** (`role`): `assault` (a company with its own objective line, in the leading wave of its bound), `support` (a
following company of the same battalion, or a supporting battalion, with the same objective line), `mopup` (the 22nd
Battalion's companies, which mopped up for the 25th), `reserve` (holds where it stands; never moves in the engine).

**The pattern by division** (each line an `objectiveLineId`; the engine moves each company to its line, never past it):

- **1st Division** (pp. 253, 255): each assaulting battalion's two forward companies (A, B) to the Black; its two rear
  companies (C, D) take the lead to the Red, "the original rear companies of the forward battalions taking the lead"
  (p. 255, at 6:45); that they crossed at Zero behind the forward companies is an estimate (p. 255 gives no start). The 10th Battalion's history confirms its "second and final objective" (holland
  p. 29). The 1st Brigade's 1st, 3rd and 4th Battalions take the Blue with A and B, and the Brown with C and D (see
  Conflicts).
- **2nd Division** (pp. 254-257): the assaulting battalions' four companies to the Black (A, B assault; C, D support);
  the 21st (4th Brigade) and the 25th (5th Brigade) pass through to the Red, with the 22nd's companies mopping up for
  the 25th; the 6th Brigade's 31st, 28th and 29th to the Blue, the 27th and one company of the 29th (D) to the Brown;
  the 13th Brigade's West Kents and KOSB take Thelus Trench (Blue) with their leading waves (A, B), and their rear
  waves (C, D) pass through to the final objective (Brown) (`hussey-inman-1921` p. 154); the 14th and 15th Royal
  Warwicks follow to the Brown as support.
- **3rd Division** (pp. 254-256): forward companies to the Black and rear companies to the Red, as in the 1st
  Division. Nicholson does not say how the 3rd Division's battalions passed the Black; the 2nd CMR was "still" the
  centre battalion at La Folie Farm on the Red (p. 256), so the same battalions went on, and the 1st Division's
  leapfrog of rear companies is assumed (an estimate).
- **4th Division** (pp. 259-261): the 102nd, 87th, 38th, 72nd and 73rd to the Black (A, B assault; C, D support); the
  54th through the 102nd, the 75th behind the 87th, and the 78th through the 38th to the Red; two companies of the 85th
  (C, D, `hayes-1920` p. 51) and two of the 46th (A, B; which two is not stated) attack the Black in the evening; the
  10th Brigade's 44th and 50th stand by (their Hill 145 attack was on 10 April, after the scenario's day).
- **Reserves:** each brigade's fourth battalion where Nicholson names only three as assaulting (8th, 13th, 20th, 2nd,
  49th, 5th CMR; for the 49th and 5th CMR p. 256 confirms "the reserve battalion from each brigade"); the 47th (its
  role on 9 April is not given; the 85th's history has two 85th companies attached to it on 10 April, p. 53); the
  85th's A and B; the 9th Brigade; the British 15th and 95th Brigades.

**Start times** (`startAfterMin`, minutes after Zero, 5:30 a.m.):

| Value | Who | Basis |
|---|---|---|
| 0 | every first-wave company | p. 253: the attack opened "Promptly at 5:30" (sourced) |
| 0 | 1st Division rear companies | estimate: p. 255 has them "taking the lead" to the Red at 6:45 (Zero + 75) but gives no start time; taken to cross at Zero behind the forward companies (p. 253), and the engine holds them behind the barrage |
| 0 | other following companies; the passing-through battalions (21st, 25th, 54th, 75th, 78th) and the 22nd | estimate: p. 253 names no interval between waves; p. 259 has the supporting 75th pinned in its assembly trenches by the opening fire, so the supporting battalions moved at Zero; the engine holds them behind the barrage |
| 120 | British 13th Brigade | `hussey-inman-1921` p. 153: "moved forward at 7.30 a.m." (sourced) |
| 120 | 1st and 6th Brigades | estimate: taken to move with the 13th Brigade, as the other reserve brigades of the same bound; p. 256 has them on the Red Line by 9:30 |
| 750 | the 85th's C and D Companies | `hayes-1920` p. 52: "zero hour having been fixed for six o'clock" (sourced) |
| 750 | the 46th's A and B Companies | estimate: p. 261, "as the 85th Battalion mounted its attack" |

## Start positions

Every `start` is a lon/lat pair, computed in the frame and converted with the frame's exact inverse
(`unprojectXY`), 6 decimals (about 0.1 m). All are estimates of the method below, which `oob-canadian.yaml`'s header
repeats. Every one lies west of `cdn-front` and inside `frame.extent` (both checked when generated; the test checks the
extent).

1. **Battalion frontages.** Each division's barrage sector (`fireplan.yaml`, y-ranges from Task 7's Map 7 arrows) is
   split equally among its first-wave battalions in Nicholson's right-to-left order (south to north): 1st Division
   278 m a battalion, 2nd 302 m, 3rd 200 m, 4th 378 m. Nicholson gives the right-to-left order for the 1st Division
   and the 12th Brigade; for the 11th Brigade (102nd right, 87th "left assaulting battalion"), the 3rd Division (the
   1st CMR "on the right of the divisional front", the 2nd CMR "centre", the RCR next to the 4th CMR, the 42nd on the
   left) and the 2nd Division (Map 7's labels) it is read from the text and map as cited.
2. **First-wave companies.** Two up, two back: A (right) and B (left) on the quarter and three-quarter points of the
   battalion's frontage, 25 m west of `cdn-front`; C behind A and D behind B, 125 m west. The forward companies in fact
   lay out in no man's land (p. 252: "the forward companies filed into no man's land"), but the scenario's start line
   is the Canadian front line.
3. **Passing-through battalions** (21st, 25th, 54th, 75th, 78th): behind the battalion(s) they passed through, 300 m
   (A, B) and 400 m (C, D) west of the front. The 22nd: four abreast across the 5th Brigade, 500 m west.
4. **Brigade reserve battalions:** four abreast across the brigade's assault frontage, 700-800 m west.
5. **Reserve brigades for the Blue and Brown.** The 1st Brigade across y −4400…−3340 (inside `blue-1cdn`'s y-span;
   1st, 3rd, 4th Battalions right to left), 1.5 km west of the front; the 2nd Bn 1.8-2.1 km west. At the Blue the 2nd
   Division's front widened (p. 256), so its sector is split equally among the five battalions attacking the Blue:
   the 6th Brigade's 31st, 28th, 29th (y −2980…−2254) and the 13th Brigade's West Kents and KOSB (−2254…−1770); the
   6th Brigade 1.5 km west of the front. The 13th Brigade "assembled during the night North of Neuville-St.-Vast"
   (`hussey-inman-1921` p. 153): x 200-600 m west of the village centre (features.geojson), at those y values.
6. **The 4th Division's evening attackers.** The 85th's C and D in the 87th's frontage, where the summit's west side
   lay, 25 m west of the front (they formed up "in the assembly trenches at the other end" of Tottenham Tunnel, `hayes-1920`
   p. 52); its A and B 700 m back (the Music Hall Line, p. 49). The 46th's A and B either side of the 38th/72nd
   boundary, 25 m west; C and D 800 m back.
7. **The 10th Brigade** (44th, 50th): standing by for the Pimple (p. 261), so opposite the Pimple's frontage (the-pimple
   feature at y 1762; p. 262: the attack's "thousand-yard frontage"), 600 m west of the front, y 1450-2250.
8. **Corps reserve.** The 9th Brigade: no position found; 3.5 km west of the front behind the 3rd Division (x −3500,
   y −1700…−640), an estimate. The British 15th and 95th Brigades were "bivouacked in the woods between Chateau D'Acq
   and St. Eloi" (`hussey-inman-1921` p. 157), which in the frame lie at x −6250 to −8850 (reading "St. Eloi" as
   Mont-St-Éloi, the village next to Acq; both villages' coordinates from `sources.md`'s control-point table), beyond
   the extent's west edge (−6000): they are held just inside it, at x −5900 and −5975, y −1900…−900 (see Open questions).

**Objective lines that do not span a company's y** (the engine's `lineXAt` holds such a line flat beyond its end; Task
7 review): the 5th Battalion's A (y −4580; `black-1cdn` starts at −4499) and C (`red-1cdn` starts at −4580), the 1st
Battalion's C (−4312; `brown-1cdn` starts at −4245), the 25th's B and D and the 22nd's D (−1921, −1846; `red-2cdn`
ends at −1959), and the KOSB's D and the 14th and 15th Royal Warwicks' D (−1830; `brown-2cdn` ends at −1920). These
are the historical frontages (the 5th Battalion on the Corps' extreme right, the 26th/25th on the 2nd Division's left,
the 13th Brigade's left); the lines, not the companies, stop short.

## Strength

- **Effective strength (`strength`), Canadian battalions: 179 a company** (estimate). Nicholson p. 252 puts "Fifteen
  thousand Canadians, the first wave" in the assault, and p. 253 counts "the long line of twenty-one battalions"; the
  21 are exactly the first-wave battalions entered here (6 + 4 + 6 + 5). 15,000 ÷ 21 = 714 a battalion, 179 a company.
  The 15,000 probably includes attached machine-gunners, sappers and carrying parties, so this is high for the rifle
  companies. The same figure is used for every Canadian battalion, for want of others (Conflicts).
- **The 72nd Battalion: 100 a company** (estimate from a sourced total): "400 of all ranks was the total number
  assembled in the tunnel on that evening" (`mcevoy-finlay-1920` p. 46); 400 ÷ 4 = 100. The 400 includes battalion
  headquarters, so a company figure is a little lower in fact.
- **British battalions: 150 a company** (estimate): no figure for April 1917 was found. Nicholson p. 232 (note) has
  Currie reckoning about 1,000 a battalion of which "some 400 men in each unit would not be available for the fighting
  line" (1918, of Canadian battalions): 600 a battalion.
- **Paper strength (`paperStrength`): 250 a company** for every battalion (estimate): the same note's "approximately
  6000 men" for six battalions, about 1,000 a battalion. The figure includes battalion headquarters, so it overstates a
  rifle company's establishment. No establishment table was reachable.

## Values entered

### Battalions: membership, roles, objectives, start times

Company entries read `letter role → objective line, +startAfterMin`. Pages are Nicholson's unless another source is
named; the start-time sources are in the table above. "App. B p. 545" is Nicholson's list of the brigades' battalions
in November 1918, used where Nicholson's Vimy narrative does not name a battalion; it agrees with the narrative and
with `wikipedia-vimy-oob` for April 1917 except for the 12th Brigade (the 85th replaced the 73rd later in 1917, p. 225)
and the 9th (the 60th, below).

| Battalion | Name | Brigade | Companies | Membership | Role / objective | Quote (≤ 25 words) | Tier |
|---|---|---|---|---|---|---|---|
| `1bn` | 1st Battalion | `1bde` | A assault → blue-1cdn, +120 min; B assault → blue-1cdn, +120 min; C assault → brown-1cdn, +120 min; D assault → brown-1cdn, +120 min | p. 256 | pp. 256-257 | "On the extreme right the 1st Battalion ran into spirited resistance at the Zwischen-Stellung" | official |
| `2bn` | 2nd Battalion | `1bde` | A reserve; B reserve; C reserve; D reserve | App. B p. 545 | estimate | (not named at Vimy; brigade reserve assumed) | estimate |
| `3bn` | 3rd Battalion | `1bde` | A assault → blue-1cdn, +120 min; B assault → blue-1cdn, +120 min; C assault → brown-1cdn, +120 min; D assault → brown-1cdn, +120 min | p. 256 | pp. 256-257 | "Griesbach keeping his 3rd and 4th Battalions forward" | official |
| `4bn` | 4th Battalion | `1bde` | A assault → blue-1cdn, +120 min; B assault → blue-1cdn, +120 min; C assault → brown-1cdn, +120 min; D assault → brown-1cdn, +120 min | p. 256 | pp. 256-257 | "the 1st Brigade had deployed the 1st, 3rd and 4th Battalions" | official |
| `5bn` | 5th Battalion | `2bde` | A assault → black-1cdn, +0 min; B assault → black-1cdn, +0 min; C assault → red-1cdn, +0 min; D assault → red-1cdn, +0 min | p. 253 | pp. 253, 255 | "from right to left the 5th, 7th and 10th Battalions of the 2nd Brigade" | official |
| `7bn` | 7th Battalion | `2bde` | A assault → black-1cdn, +0 min; B assault → black-1cdn, +0 min; C assault → red-1cdn, +0 min; D assault → red-1cdn, +0 min | p. 253 | pp. 253, 255 | "the original rear companies of the forward battalions taking the lead" | official |
| `8bn` | 8th Battalion | `2bde` | A reserve; B reserve; C reserve; D reserve | App. B p. 545 | estimate | (not named at Vimy; brigade reserve assumed) | estimate |
| `10bn` | 10th Battalion | `2bde` | A assault → black-1cdn, +0 min; B assault → black-1cdn, +0 min; C assault → red-1cdn, +0 min; D assault → red-1cdn, +0 min | p. 253 | pp. 253, 255; holland-1918 pp. 28-29 | "Shortly after 9.0 a.m. the 10th Battalion reached its second and final objective" | official / secondary |
| `13bn` | 13th Battalion | `3bde` | A reserve; B reserve; C reserve; D reserve | App. B p. 545 | estimate | (not named at Vimy; brigade reserve assumed) | estimate |
| `14bn` | 14th Battalion | `3bde` | A assault → black-1cdn, +0 min; B assault → black-1cdn, +0 min; C assault → red-1cdn, +0 min; D assault → red-1cdn, +0 min | p. 253 | pp. 253, 255 | "the 15th, 14th and 16th Battalions of the 3rd Brigade" | official |
| `15bn` | 15th Battalion | `3bde` | A assault → black-1cdn, +0 min; B assault → black-1cdn, +0 min; C assault → red-1cdn, +0 min; D assault → red-1cdn, +0 min | p. 253 | pp. 253, 255 | "the 15th, 14th and 16th Battalions of the 3rd Brigade" | official |
| `16bn` | 16th Battalion | `3bde` | A assault → black-1cdn, +0 min; B assault → black-1cdn, +0 min; C assault → red-1cdn, +0 min; D assault → red-1cdn, +0 min | p. 253 | pp. 253-255 | "Private W. J. Milne, of the 16th Battalion" | official |
| `18bn` | 18th Battalion | `4bde` | A assault → black-2cdn, +0 min; B assault → black-2cdn, +0 min; C support → black-2cdn, +0 min; D support → black-2cdn, +0 min | p. 254 | p. 254 | "the 18th and 19th Battalions of the 4th Brigade" | official |
| `19bn` | 19th Battalion | `4bde` | A assault → black-2cdn, +0 min; B assault → black-2cdn, +0 min; C support → black-2cdn, +0 min; D support → black-2cdn, +0 min | p. 254 | p. 254 | "advancing on a 1400-yard front with four battalions forward" | official |
| `20bn` | 20th Battalion | `4bde` | A reserve; B reserve; C reserve; D reserve | App. B p. 545 | estimate | (not named at Vimy; brigade reserve assumed) | estimate |
| `21bn` | 21st Battalion | `4bde` | A assault → red-2cdn, +0 min; B assault → red-2cdn, +0 min; C support → red-2cdn, +0 min; D support → red-2cdn, +0 min | p. 255 | p. 255 | "the 21st Battalion to attack and pass through Les Tilleuls" | official |
| `22bn` | 22nd Battalion | `5bde` | A mop-up → red-2cdn, +0 min; B mop-up → red-2cdn, +0 min; C mop-up → red-2cdn, +0 min; D mop-up → red-2cdn, +0 min | p. 255 | p. 255 | "with the aid of mop-up parties from the 22nd Battalion took close to 400 prisoners" | official |
| `24bn` | 24th Battalion | `5bde` | A assault → black-2cdn, +0 min; B assault → black-2cdn, +0 min; C support → black-2cdn, +0 min; D support → black-2cdn, +0 min | p. 254 | p. 254 | "the 24th and 26th Battalions of the 5th Brigade" | official |
| `25bn` | 25th Battalion | `5bde` | A assault → red-2cdn, +0 min; B assault → red-2cdn, +0 min; C support → red-2cdn, +0 min; D support → red-2cdn, +0 min | p. 255 | p. 255 | "the 25th to occupy the Turko-Graben, which reached northward behind the road" | official |
| `26bn` | 26th Battalion | `5bde` | A assault → black-2cdn, +0 min; B assault → black-2cdn, +0 min; C support → black-2cdn, +0 min; D support → black-2cdn, +0 min | p. 254 | p. 254 | "the 24th and 26th Battalions of the 5th Brigade" | official |
| `27bn` | 27th Battalion | `6bde` | A assault → brown-2cdn, +120 min; B assault → brown-2cdn, +120 min; C assault → brown-2cdn, +120 min; D assault → brown-2cdn, +120 min | p. 257 | p. 257 | "the 6th Brigade employing the 27th Battalion and a company of the 29th" | official |
| `28bn` | 28th Battalion | `6bde` | A assault → blue-2cdn, +120 min; B assault → blue-2cdn, +120 min; C assault → blue-2cdn, +120 min; D assault → blue-2cdn, +120 min | p. 256 | p. 256 | "Ketchen's 6th Brigade, which attacked with the 31st, 28th and 29th Battalions" | official |
| `29bn` | 29th Battalion | `6bde` | A assault → blue-2cdn, +120 min; B assault → blue-2cdn, +120 min; C assault → blue-2cdn, +120 min; D assault → brown-2cdn, +120 min | p. 256 | pp. 256-257 | "the 29th Battalion overran Thelus Trench north of the village and took the south end of Hill 135" | official |
| `31bn` | 31st Battalion | `6bde` | A assault → blue-2cdn, +120 min; B assault → blue-2cdn, +120 min; C assault → blue-2cdn, +120 min; D assault → blue-2cdn, +120 min | p. 256 | p. 256 | "the 28th and 31st Battalions... cleared the ruins of Thelus" | official |
| `1rwk` | 1st Battalion, Royal West Kent Regiment | `13bde-brit` | A assault → blue-2cdn, +120 min; B assault → blue-2cdn, +120 min; C assault → brown-2cdn, +120 min; D assault → brown-2cdn, +120 min | hussey-inman-1921 p. 154 | hussey-inman-1921 pp. 153-154 | "The West Kents were on the right, and the K.O.S.B. on the left" | secondary |
| `2kosb` | 2nd Battalion, King's Own Scottish Borderers | `13bde-brit` | A assault → blue-2cdn, +120 min; B assault → blue-2cdn, +120 min; C assault → brown-2cdn, +120 min; D assault → brown-2cdn, +120 min | hussey-inman-1921 p. 154 | hussey-inman-1921 pp. 153-154 | "the rear waves then passed through and continued the advance" | secondary |
| `14rwarwick` | 14th Battalion, Royal Warwickshire Regiment | `13bde-brit` | A support → brown-2cdn, +120 min; B support → brown-2cdn, +120 min; C support → brown-2cdn, +120 min; D support → brown-2cdn, +120 min | hussey-inman-1921 p. 154 | hussey-inman-1921 p. 154 | "the 14th Warwicks in support" | secondary |
| `15rwarwick` | 15th Battalion, Royal Warwickshire Regiment | `13bde-brit` | A support → brown-2cdn, +120 min; B support → brown-2cdn, +120 min; C support → brown-2cdn, +120 min; D support → brown-2cdn, +120 min | hussey-inman-1921 p. 154 | hussey-inman-1921 p. 154 | "the 15th Warwicks following up in reserve" | secondary |
| `rcr` | The Royal Canadian Regiment | `7bde` | A assault → black-3cdn, +0 min; B assault → black-3cdn, +0 min; C assault → red-3cdn, +0 min; D assault → red-3cdn, +0 min | p. 254 | pp. 254-256 | "The Royal Canadian Regiment, P.P.C.L.I., and the -42nd Battalion" | official |
| `ppcli` | Princess Patricia's Canadian Light Infantry | `7bde` | A assault → black-3cdn, +0 min; B assault → black-3cdn, +0 min; C assault → red-3cdn, +0 min; D assault → red-3cdn, +0 min | p. 254 | pp. 254-256 | "The P.P.C.L.I. took over part of the front of the 42nd Battalion" | official |
| `42bn` | 42nd Battalion | `7bde` | A assault → black-3cdn, +0 min; B assault → black-3cdn, +0 min; C assault → red-3cdn, +0 min; D assault → red-3cdn, +0 min | p. 254 | pp. 254-256 | "which in turn extended to the left to cover the new flank" | official |
| `49bn` | 49th Battalion | `7bde` | A reserve; B reserve; C reserve; D reserve | App. B p. 545 | p. 256 | "carrying parties of the reserve battalion from each brigade brought forward tools and wire" | official |
| `1cmr` | 1st Battalion, Canadian Mounted Rifles | `8bde` | A assault → black-3cdn, +0 min; B assault → black-3cdn, +0 min; C assault → red-3cdn, +0 min; D assault → red-3cdn, +0 min | p. 254 | pp. 254-255 | "the infantry (1st C.M.R.) which they were supporting" | official |
| `2cmr` | 2nd Battalion, Canadian Mounted Rifles | `8bde` | A assault → black-3cdn, +0 min; B assault → black-3cdn, +0 min; C assault → red-3cdn, +0 min; D assault → red-3cdn, +0 min | p. 254 | pp. 254-256 | "the 8th Brigade's centre battalion, still the 2nd C.M.R., had found La Folie Farm a mass of rubble" | official |
| `4cmr` | 4th Battalion, Canadian Mounted Rifles | `8bde` | A assault → black-3cdn, +0 min; B assault → black-3cdn, +0 min; C assault → red-3cdn, +0 min; D assault → red-3cdn, +0 min | p. 254 | pp. 254-256 | "Elmsley's 8th Brigade (1st, 2nd and 4th Canadian Mounted Rifles)" | official |
| `5cmr` | 5th Battalion, Canadian Mounted Rifles | `8bde` | A reserve; B reserve; C reserve; D reserve | App. B p. 545 | p. 256 | "carrying parties of the reserve battalion from each brigade" | official |
| `43bn` | 43rd Battalion | `9bde` | A reserve; B reserve; C reserve; D reserve | App. B p. 545 | wikipedia-vimy-oob | "the 9th Canadian Brigade, 15th Brigade and 95th Brigade were kept in corps reserve" | official / tertiary |
| `52bn` | 52nd Battalion | `9bde` | A reserve; B reserve; C reserve; D reserve | App. B p. 545 | wikipedia-vimy-oob | "kept in corps reserve" | official / tertiary |
| `58bn` | 58th Battalion | `9bde` | A reserve; B reserve; C reserve; D reserve | App. B p. 545 | wikipedia-vimy-oob | "kept in corps reserve" | official / tertiary |
| `60bn` | 60th Battalion | `9bde` | A reserve; B reserve; C reserve; D reserve | wikipedia-vimy-oob; p. 225 | wikipedia-vimy-oob | "60th (Victoria rifles of Canada) Battalion" | tertiary |
| `116bn` | 116th Battalion | `9bde` | A reserve; B reserve; C reserve; D reserve | App. B p. 545; p. 225 | wikipedia-vimy-oob | "the 116th Battalion, raised in Ontario, were sent to France" | official / tertiary |
| `44bn` | 44th Battalion | `10bde` | A reserve; B reserve; C reserve; D reserve | p. 261 | p. 261 | "which had been standing by in readiness to assault the Pimple" | official |
| `50bn` | 50th Battalion | `10bde` | A reserve; B reserve; C reserve; D reserve | p. 261 | p. 261 | "the 44th Battalion on the right and the 50th on the left" | official |
| `54bn` | 54th Battalion | `11bde` | A assault → red-4cdn, +0 min; B assault → red-4cdn, +0 min; C support → red-4cdn, +0 min; D support → red-4cdn, +0 min | p. 259 | p. 259 | "the 102nd Battalion seizing its half of the forward slope and the 54th passing through" | official |
| `75bn` | 75th Battalion | `11bde` | A assault → red-4cdn, +0 min; B assault → red-4cdn, +0 min; C support → red-4cdn, +0 min; D support → red-4cdn, +0 min | p. 259 | p. 259 | "pinned the right of the supporting 75th Battalion to their assembly trenches" | official |
| `87bn` | 87th Battalion | `11bde` | A assault → black-4cdn, +0 min; B assault → black-4cdn, +0 min; C support → black-4cdn, +0 min; D support → black-4cdn, +0 min | p. 259 | p. 259 | "the left assaulting battalion (the 87th)" | official |
| `102bn` | 102nd Battalion | `11bde` | A assault → black-4cdn, +0 min; B assault → black-4cdn, +0 min; C support → black-4cdn, +0 min; D support → black-4cdn, +0 min | p. 259 | p. 259 | "the 102nd Battalion seizing its half of the forward slope" | official |
| `47bn` | 47th Battalion (attached from the 10th Brigade) | `11bde` | A reserve; B reserve; C reserve; D reserve | p. 259 | estimate (role); p. 259 (attachment) | "strengthened by the addition of a battalion of the 10th Brigade (respectively the .47th and 46th Battalions)" | official / estimate |
| `85bn` | 85th Battalion | `11bde` | A reserve; B reserve; C assault → black-4cdn, +750 min; D assault → black-4cdn, +750 min | p. 259 | p. 260; hayes-1920 pp. 51-53 | "The Commanding Officer selected "C" and "D" companies for the task" | official / secondary |
| `38bn` | 38th Battalion | `12bde` | A assault → black-4cdn, +0 min; B assault → black-4cdn, +0 min; C support → black-4cdn, +0 min; D support → black-4cdn, +0 min | p. 260 | p. 260 | "Three battalions made the assault-from right to left the 38th, 72nd and 73rd" | official |
| `72bn` | 72nd Battalion | `12bde` | A assault → black-4cdn, +0 min; B assault → black-4cdn, +0 min; C support → black-4cdn, +0 min; D support → black-4cdn, +0 min | p. 260 | pp. 260-261 | "the 72nd Battalion successfully bombing it from a flank when frontal assault failed" | official |
| `73bn` | 73rd Battalion | `12bde` | A assault → black-4cdn, +0 min; B assault → black-4cdn, +0 min; C support → black-4cdn, +0 min; D support → black-4cdn, +0 min | p. 260 | p. 260 | "here the 73rd consolidated to form a firm left flank" | official |
| `78bn` | 78th Battalion | `12bde` | A assault → red-4cdn, +0 min; B assault → red-4cdn, +0 min; C support → red-4cdn, +0 min; D support → red-4cdn, +0 min | p. 261 | p. 261 | "Passing through the 38th Battalion according to plan, the 78th Battalion" | official |
| `46bn` | 46th Battalion (attached from the 10th Brigade) | `12bde` | A assault → black-4cdn, +750 min; B assault → black-4cdn, +750 min; C reserve; D reserve | p. 259 | p. 261 | "two companies of the 46th, which was on loan from the 10th Brigade, came forward to capture a number of craters" | official |
| `16rwarwick` | 16th Battalion, Royal Warwickshire Regiment | `15bde-brit` | A reserve; B reserve; C reserve; D reserve | hussey-inman-1921 p. 158; wikipedia-vimy-oob | p. 252 note; hussey-inman-1921 p. 157 | "the 5th Division had been kept back in reserve, ready, on the 9th, to move at two hours' notice" | official / secondary / tertiary |
| `1norfolk` | 1st Battalion, Norfolk Regiment | `15bde-brit` | A reserve; B reserve; C reserve; D reserve | hussey-inman-1921 p. 158; wikipedia-vimy-oob | p. 252 note; hussey-inman-1921 p. 157 | "in the 15th Brigade, the Norfolks and Bedfords" | official / secondary / tertiary |
| `1bedford` | 1st Battalion, Bedfordshire Regiment | `15bde-brit` | A reserve; B reserve; C reserve; D reserve | hussey-inman-1921 p. 158; wikipedia-vimy-oob | p. 252 note; hussey-inman-1921 p. 157 | "in the 15th Brigade, the Norfolks and Bedfords" | official / secondary / tertiary |
| `1cheshire` | 1st Battalion, Cheshire Regiment | `15bde-brit` | A reserve; B reserve; C reserve; D reserve | wikipedia-vimy-oob | p. 252 note; hussey-inman-1921 p. 157 | "1st Battalion, Cheshire Regiment" | official / tertiary / secondary |
| `1devon` | 1st Battalion, Devonshire Regiment | `95bde-brit` | A reserve; B reserve; C reserve; D reserve | hussey-inman-1921 p. 158; wikipedia-vimy-oob | p. 252 note; hussey-inman-1921 p. 157 | "in the 95th Brigade, the Devons and D.C.L.I." | official / secondary / tertiary |
| `1esurrey` | 1st Battalion, East Surrey Regiment | `95bde-brit` | A reserve; B reserve; C reserve; D reserve | hussey-inman-1921 p. 161; wikipedia-vimy-oob | p. 252 note; hussey-inman-1921 p. 157 | "the East Surreys, on the right of the 95th Brigade" | official / secondary / tertiary |
| `1dcli` | 1st Battalion, Duke of Cornwall's Light Infantry | `95bde-brit` | A reserve; B reserve; C reserve; D reserve | hussey-inman-1921 p. 158; wikipedia-vimy-oob | p. 252 note; hussey-inman-1921 p. 157 | "in the 95th Brigade, the Devons and D.C.L.I." | official / secondary / tertiary |
| `12glosters` | 12th Battalion, Gloucestershire Regiment | `95bde-brit` | A reserve; B reserve; C reserve; D reserve | hussey-inman-1921 p. 161; wikipedia-vimy-oob | p. 252 note; hussey-inman-1921 p. 157 | "the machine-guns and rifles of the Gloucesters and East Surreys" | official / secondary / tertiary |
### Global values

| Value | Where | Source | Page | Quote (≤ 25 words) | Tier |
|---|---|---|---|---|---|
| `strength` 179 (Canadian companies) | 196 companies (49 battalions) | `nicholson-1962` | 252, 253 | "Fifteen thousand Canadians, the first wave"; "the long line of twenty-one battalions pushed forward in good order" | estimate |
| `strength` 100 (72nd Battalion) | `72bn-a`…`d` | `mcevoy-finlay-1920` (in the estimate text) | 46 | "400 of all ranks was the total number assembled in the tunnel on that evening" | estimate (400 ÷ 4, from a secondary source) |
| `strength` 150 (British companies) | 48 companies (12 battalions) | `nicholson-1962` | 232 note | "some 400 men in each unit would not be available for the fighting line" | estimate |
| `paperStrength` 250 | all 248 companies | `nicholson-1962` | 232 note | "of the six battalions' total strength of approximately 6000 men" | estimate |
| `startAfterMin` | see "Start times" | as cited there | | | official / secondary / estimate |
| `start` (lon/lat) | all 248 companies | method above, on Task 7's `cdn-front` and sectors; `hussey-inman-1921` pp. 153, 157 for the 13th, 15th and 95th Brigades | | "The Battalions assembled during the night North of Neuville-St.-Vast" (p. 153) | estimate |
| `sectorId`, `objectiveLineId` | 156 attacking companies | the division's barrage sector and line ids (Task 7) | | | — |

### Start positions in the frame

Each company's start as frame metres `x, y`, and in brackets how far west of `cdn-front` it lies (m). Columns are
companies A-D.

| Battalion | A | B | C | D |
|---|---|---|---|---|
| `1bn` | -2523, -4312 (1500) | -2574, -4135 (1500) | -2623, -4312 (1600) | -2674, -4135 (1600) |
| `2bn` | -2857, -4192 (1779) | -2857, -3978 (1841) | -2857, -3763 (1983) | -2857, -3547 (2104) |
| `3bn` | -2508, -3958 (1500) | -2382, -3782 (1500) | -2608, -3958 (1600) | -2481, -3782 (1600) |
| `4bn` | -2261, -3605 (1500) | -2268, -3428 (1500) | -2361, -3605 (1600) | -2368, -3428 (1600) |
| `5bn` | -963, -4580 (25) | -966, -4441 (25) | -1063, -4580 (125) | -1066, -4441 (125) |
| `7bn` | -1051, -4302 (25) | -1101, -4163 (25) | -1151, -4302 (125) | -1201, -4163 (125) |
| `8bn` | -1712, -4546 (800) | -1811, -4337 (800) | -1873, -4128 (800) | -1792, -3919 (800) |
| `10bn` | -1061, -4024 (25) | -997, -3885 (25) | -1161, -4024 (125) | -1097, -3885 (125) |
| `13bn` | -1627, -3711 (800) | -1551, -3502 (800) | -1493, -3293 (800) | -1476, -3084 (800) |
| `14bn` | -788, -3467 (25) | -720, -3328 (25) | -888, -3467 (125) | -820, -3328 (125) |
| `15bn` | -890, -3745 (25) | -786, -3606 (25) | -990, -3745 (125) | -886, -3606 (125) |
| `16bn` | -709, -3189 (25) | -626, -3050 (25) | -810, -3189 (125) | -726, -3050 (125) |
| `18bn` | -445, -2904 (25) | -426, -2753 (25) | -545, -2904 (125) | -526, -2753 (125) |
| `19bn` | -376, -2602 (25) | -355, -2451 (25) | -476, -2602 (125) | -456, -2451 (125) |
| `20bn` | -1220, -2904 (800) | -1201, -2753 (800) | -1151, -2602 (800) | -1131, -2451 (800) |
| `21bn` | -720, -2829 (300) | -641, -2526 (300) | -820, -2829 (400) | -741, -2526 (400) |
| `22bn` | -842, -2299 (500) | -894, -2148 (500) | -922, -1997 (500) | -897, -1846 (500) |
| `24bn` | -367, -2299 (25) | -419, -2148 (25) | -467, -2299 (125) | -519, -2148 (125) |
| `25bn` | -668, -2224 (300) | -703, -1921 (300) | -768, -2224 (400) | -803, -1921 (400) |
| `26bn` | -447, -1997 (25) | -422, -1846 (25) | -547, -1997 (125) | -522, -1846 (125) |
| `27bn` | -2070, -2889 (1650) | -2033, -2708 (1650) | -1991, -2526 (1650) | -1981, -2345 (1650) |
| `28bn` | -1871, -2677 (1500) | -1845, -2557 (1500) | -1921, -2678 (1550) | -1895, -2557 (1550) |
| `29bn` | -1828, -2435 (1500) | -1837, -2315 (1500) | -1878, -2435 (1550) | -1887, -2315 (1550) |
| `31bn` | -1920, -2920 (1500) | -1919, -2799 (1500) | -1970, -2920 (1550) | -1969, -2798 (1550) |
| `1rwk` | -1695, -2193 (1317) | -1695, -2073 (1276) | -1795, -2193 (1417) | -1795, -2073 (1376) |
| `2kosb` | -1695, -1951 (1289) | -1695, -1830 (1294) | -1795, -1952 (1389) | -1795, -1830 (1394) |
| `14rwarwick` | -1945, -2193 (1567) | -1945, -2072 (1526) | -1945, -1952 (1539) | -1945, -1830 (1544) |
| `15rwarwick` | -2095, -2194 (1717) | -2095, -2072 (1676) | -2095, -1952 (1689) | -2095, -1831 (1694) |
| `rcr` | -371, -1120 (25) | -386, -1020 (25) | -471, -1120 (125) | -486, -1020 (125) |
| `ppcli` | -396, -920 (25) | -392, -820 (25) | -496, -920 (125) | -492, -820 (125) |
| `42bn` | -443, -720 (25) | -645, -620 (25) | -543, -720 (125) | -745, -620 (125) |
| `49bn` | -1050, -1095 (700) | -1072, -945 (700) | -1065, -795 (700) | -1254, -645 (700) |
| `1cmr` | -428, -1720 (25) | -433, -1620 (25) | -528, -1720 (125) | -533, -1620 (125) |
| `2cmr` | -436, -1520 (25) | -399, -1420 (25) | -536, -1520 (125) | -499, -1420 (125) |
| `4cmr` | -381, -1320 (25) | -381, -1220 (25) | -481, -1320 (125) | -481, -1220 (125) |
| `5cmr` | -1101, -1695 (700) | -1116, -1545 (700) | -1059, -1395 (700) | -1059, -1245 (700) |
| `43bn` | -3500, -1673 (3097) | -3500, -1620 (3092) | -3500, -1567 (3086) | -3500, -1514 (3091) |
| `52bn` | -3500, -1462 (3103) | -3500, -1409 (3133) | -3500, -1356 (3146) | -3500, -1302 (3143) |
| `58bn` | -3500, -1249 (3140) | -3500, -1196 (3147) | -3500, -1143 (3154) | -3500, -1090 (3150) |
| `60bn` | -3500, -1038 (3142) | -3500, -985 (3134) | -3500, -932 (3129) | -3500, -878 (3131) |
| `116bn` | -3500, -825 (3133) | -3500, -772 (3135) | -3500, -719 (3081) | -3500, -666 (3002) |
| `44bn` | -1454, 1500 (600) | -1432, 1600 (600) | -1432, 1700 (600) | -1424, 1800 (600) |
| `50bn` | -1462, 1900 (600) | -1462, 2000 (600) | -1400, 2100 (600) | -1419, 2200 (600) |
| `54bn` | -997, -475 (300) | -1026, -286 (300) | -1096, -475 (400) | -1126, -287 (400) |
| `75bn` | -1169, -97 (300) | -1254, 92 (300) | -1269, -98 (400) | -1353, 91 (400) |
| `87bn` | -894, -98 (25) | -979, 91 (25) | -994, -98 (125) | -1079, 91 (125) |
| `102bn` | -722, -475 (25) | -751, -287 (25) | -821, -476 (125) | -851, -287 (125) |
| `47bn` | -1497, -476 (800) | -1526, -286 (800) | -1669, -97 (800) | -1753, 92 (800) |
| `85bn` | -1570, -97 (700) | -1653, 91 (700) | -978, 91 (25) | -895, -97 (25) |
| `38bn` | -1034, 281 (25) | -1076, 470 (25) | -1134, 281 (125) | -1176, 470 (125) |
| `72bn` | -1074, 658 (25) | -1008, 848 (25) | -1174, 658 (125) | -1108, 848 (125) |
| `73bn` | -905, 1036 (25) | -889, 1225 (25) | -1005, 1036 (125) | -989, 1225 (125) |
| `78bn` | -1309, 281 (300) | -1351, 470 (300) | -1409, 281 (400) | -1451, 470 (400) |
| `46bn` | -1093, 504 (25) | -1081, 624 (25) | -1868, 504 (800) | -1856, 624 (800) |
| `16rwarwick` | -5900, -1869 (5502) | -5900, -1806 (5491) | -5900, -1744 (5495) | -5900, -1681 (5498) |
| `1norfolk` | -5900, -1619 (5492) | -5900, -1556 (5485) | -5900, -1494 (5495) | -5900, -1431 (5519) |
| `1bedford` | -5900, -1369 (5547) | -5900, -1306 (5543) | -5900, -1244 (5541) | -5900, -1181 (5549) |
| `1cheshire` | -5900, -1119 (5554) | -5900, -1056 (5544) | -5900, -994 (5535) | -5900, -931 (5529) |
| `1devon` | -5975, -1869 (5577) | -5975, -1806 (5566) | -5975, -1744 (5570) | -5975, -1681 (5573) |
| `1esurrey` | -5975, -1619 (5567) | -5975, -1556 (5560) | -5975, -1494 (5570) | -5975, -1431 (5594) |
| `1dcli` | -5975, -1369 (5622) | -5975, -1306 (5618) | -5975, -1244 (5616) | -5975, -1181 (5624) |
| `12glosters` | -5975, -1119 (5629) | -5975, -1056 (5619) | -5975, -994 (5610) | -5975, -931 (5604) |
## Conflicts

- **The 1st Brigade at the Brown Line.** Nicholson p. 257 has "Brig.-Gen. Griesbach keeping his 3rd and 4th Battalions
  forward" for the final bound, but on the same page "each forward company of the 1st and 3rd Battalions" carried
  wire-cutters for the Brown Line's wire on the right. Entered: all three (1st, 3rd, 4th) take the Blue with A and B
  and the Brown with C and D.
- **The 85th Battalion's brigade.** Nicholson p. 259 puts the 85th "in reserve" with the 11th Brigade; the Wikipedia
  order of battle lists it under the 12th (its permanent brigade later in 1917, p. 225). Entered under the 11th, for
  whom it attacked on 9 April (p. 260).
- **The 9th Brigade's battalions.** Nicholson's App. B (November 1918) has the 43rd, 52nd, 58th and 116th; the
  Wikipedia order of battle adds the 60th. Nicholson p. 225 says the 116th was sent in February 1917 "to replace" the
  60th, which "eventually disappeared"; so both may have been there on 9 April. Entered: five battalions, the 60th
  citing the tertiary source only (Open questions).
- **Battalion strength.** The corps-wide average (714 a battalion from p. 252) is far above the one battalion figure
  found: the 72nd assembled 400 all ranks (`mcevoy-finlay-1920` p. 46). On 12 April two companies of the 46th
  numbered about 216 ("108 casualties—about half the strength of the two companies", p. 263), about 108 a company
  after three days' fighting. The average is kept for want of per-battalion figures.
- **Corps reserve.** `wikipedia-vimy-oob` (citing Turner) puts the 9th, 15th and 95th Brigades in corps reserve;
  Nicholson's p. 252 note has "the British 5th Division (in corps reserve)" (official); `hussey-inman-1921` p. 157 has the 5th Division "kept back in reserve, ready... to move at two hours' notice".
  Consistent; none gives the 9th Brigade's position, and only the tertiary source puts the 9th Brigade in corps reserve.
- **The 2nd Division's Blue frontage.** The 13th Brigade came in "because of the 2nd Division's widening front" (p.
  256), but the scenario's 2nd Division sector keeps its width; the Blue-line battalions share it (method 5), so the
  13th Brigade's companies stand within the sector rather than to its north.

## Open questions for the historian

- **Battalion frontages and company dispositions.** Map 7's arrows give each assaulting battalion's axis, but are
  legible only for the 2nd Division at the scan reachable. Brigade operation orders (in the war diaries on
  `recherche-collection-search.bac-lac.gc.ca`) would give each battalion's frontage, its waves and which companies led.
  Battalion company letters (A-D) are taken in each battalion's own order; where a battalion numbered its companies,
  the order of the letters is the builder's.
- **Effective strengths at Zero**, battalion by battalion (war diaries' "strength going in"), especially for the
  battalions whose histories are on archive.org but were not read for this (for example the 20th, 25th, 102nd, 4th).
- **The 9th Brigade's position on 9 April**, and whether the 60th Battalion was still with it.
- **The British 15th and 95th Brigades' bivouacs** lie 0.3-2.9 km west of the frame's extent. Should they be off-map
  `reserves` entries (with `distanceKm` and an `entryPoint`) instead of companies held at the extent's edge, or should
  the extent grow (with the terrain grid)?
- **The 47th Battalion's task on 9 April** (attached to the 11th Brigade, p. 259): not found.
- **Which two companies of the 46th** attacked the craters on the evening of 9 April (p. 261), and where.
- **The 1st and 6th Brigades' assembly areas and start times**; only the British 13th Brigade's are sourced.
- **The 10th Brigade's position on 9 April** while standing by for the Pimple (Zouave Valley?).
