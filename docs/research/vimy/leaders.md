# Vimy research: the allied leaders and their drafted ratings

This note covers the allied entries in `scenarios/vimy-1917/leaders.yaml` (Task 8; Task 9 adds the German leaders to the
same file) and the `leaderId` of every allied formation in `scenarios/vimy-1917/oob-canadian.yaml`. What each rating
means is in `leader-rubric.md`.

**The ratings are the owner's to change.** Every rating below is an `estimate` drafted by the builder, with its
justification. Where the sources read record no conduct for a rating, it is a placeholder 3 and the justification says
so.

## Who is recorded

- **Every corps, division and brigade commander** of the formations in `oob-canadian.yaml`: the Canadian Corps (Byng),
  the four Canadian divisions, the twelve Canadian brigades, the British 13th Brigade (attached to the 2nd Canadian
  Division) and the British 15th and 95th Brigades (corps reserve), and the British 5th Division's commander
  (Stephens), who leads the `5bdiv` group that holds the 15th and 95th Brigades. All have a sourced name and rank and
  drafted ratings.
- **First Army** (Horne): recorded as a leader, with no formation and no ratings; the scenario has no army formation.
- **Battalion commanding officers** where a source read names the officer in command on 9 April 1917: 24 of the 62
  battalions. Name and rank only; no ratings.

**How names are entered.** As the source gives them: Nicholson gives most commanders by initials (`F. O. W. Loomis`),
and the name is entered so. A first name appears only where a source gives it (`Julian Byng`, `Arthur Currie`,
`Henry Horne` in Nicholson; `Joseph B. Rogers`, `Thomas F. Elmitt`, `Patrick J. Daley` in their battalion lists). No
first name was added from memory. Ranks are those held at Vimy; Nicholson's Appendix A gives each officer's rank on
relinquishing the appointment, so a rank comes from the narrative where the two differ (Byng: "Gen." in Appendix A, p.
540, but a lieutenant-general at Vimy, p. 283).

**Dates of command.** A battalion commander is entered only where the source's dates cover 9 April 1917. Brigade and
division commanders' dates are from Nicholson's Appendix A (pp. 541-542), whose rule is that acting or temporary commanders are "not
shown unless they were subsequently confirmed in the appointments or held them for a period of thirty days or more"
(p. 539); so a short absence on 9 April would not show there.

## Values entered: names and ranks

| Leader | Field | Value | Source | Page / section | Quote (≤ 25 words) | Tier |
|---|---|---|---|---|---|---|
| `horne` | name | Henry Horne | `nicholson-1962` | 247 | "sent General Sir Henry Home a copy of his 'Scheme of Operations'" (text layer's "Home"; index p. 602: "Horne, Gen. Sir H.") | official |
| `horne` | rank | General | `nicholson-1962` | 247 | same | official |
| `byng` | name | Julian Byng | `nicholson-1962` | 247 | "Sir Julian Byng sent General Sir Henry Home a copy of his 'Scheme of Operations'" | official |
| `byng` | rank | Lieutenant-General | `nicholson-1962` | 283 | "Lieut.-General Sir Julian Byng was taking over the British Third Army" | official |
| `currie` | name | Arthur Currie | `nicholson-1962` | 283 | "Lieut.-General Sir Arthur Currie"; Appendix A p. 541: "Maj.-Gen. A. W. Currie" (13 Sep. 15 - 8 Jun. 17) | official |
| `currie` | rank | Major-General | `nicholson-1962` | 253 | "the 1st Division, commanded by MajorGeneral Currie" | official |
| `burstall` | name | H. E. Burstall | `nicholson-1962` | Appendix A, p. 541 | "Maj.-Gen. Sir H. E. Burstall" (2nd Division, 15 Dec. 16 - 22 May 19) | official |
| `burstall` | rank | Major-General | `nicholson-1962` | 254 | "Major-General Burstall's 2nd Division" | official |
| `lipsett` | name | L. J. Lipsett | `nicholson-1962` | Appendix A, p. 542 | "Maj.-Gen. L. J. Lipsett" (3rd Division, 16 Jun. 16 - 12 Sep. 18) | official |
| `lipsett` | rank | Major-General | `nicholson-1962` | 254 | "Major-General Lipsett attacked on the right, opposite Bois de la Folie" | official |
| `watson` | name | D. Watson | `nicholson-1962` | Appendix A, p. 542 | "Maj.-Gen. Sir D. Watson" (4th Division, 25 Apr. 16 - 23 Jun. 19) | official |
| `watson` | rank | Major-General | `nicholson-1962` | 259 | "Major-General Watson hoped to overrun the forward slope position by surprise" | official |
| `stephens` | name | R. B. Stephens | `hussey-inman-1921` | 267 | 1917 column: "Maj.-Gen. R. B. Stephens" | secondary |
| `stephens` | rank | Major-General | `hussey-inman-1921` | 267 | same | secondary |
| `griesbach` | name | W. A. Griesbach | `nicholson-1962` | 255 | "the 1st Brigade (Brig.-Gen. W. A. Griesbach), brought forward from reserve" | official |
| `griesbach` | rank | Brigadier-General | `nicholson-1962` | 255 | same | official |
| `loomis` | name | F. O. W. Loomis | `nicholson-1962` | 253 | "the 2nd Brigade (Brig.-Gen. F. O. W. Loomis)" | official |
| `loomis` | rank | Brigadier-General | `nicholson-1962` | 253 | same | official |
| `tuxford` | name | G. S. Tuxford | `nicholson-1962` | 253 | "the 3rd Brigade (Brig.-Gen. G. S. Tuxford)" | official |
| `tuxford` | rank | Brigadier-General | `nicholson-1962` | 253 | same | official |
| `rennie` | name | R. Rennie | `nicholson-1962` | 254 | "the 4th Brigade (Brig.-Gen. R. Rennie)" | official |
| `rennie` | rank | Brigadier-General | `nicholson-1962` | 254 | same | official |
| `macdonell-ah` | name | A. H. Macdonell | `nicholson-1962` | 254 | "the 5th Brigade (Brig.-Gen. A. H. Macdonell)" | official |
| `macdonell-ah` | rank | Brigadier-General | `nicholson-1962` | 254 | same | official |
| `ketchen` | name | H. D. B. Ketchen | `nicholson-1962` | Appendix A, p. 542 | "H. D. B. Ketchen" (6th Infantry Brigade, 25 Jun. 15 - 20 Apr. 18) | official |
| `ketchen` | rank | Brigadier-General | `nicholson-1962` | 256 | "Brig.-Gen. Ketchen's 6th Brigade" | official |
| `macdonell-ac` | name | A. C. Macdonell | `nicholson-1962` | 254 | "the 7th Brigade (Brig.-Gen. A. C. Macdonell)" | official |
| `macdonell-ac` | rank | Brigadier-General | `nicholson-1962` | 254 | same | official |
| `elmsley` | name | J. H. Elmsley | `nicholson-1962` | 254 | "Brig.-Gen. J. H. Elmsley's 8th Brigade" | official |
| `elmsley` | rank | Brigadier-General | `nicholson-1962` | 254 | same | official |
| `hill-fw` | name | F. W. Hill | `nicholson-1962` | Appendix A, p. 542 | "Brig.-Gen. F. W. Hill" (9th Infantry Brigade, 7 Jan. 16 - 25 May 18) | official |
| `hill-fw` | rank | Brigadier-General | `nicholson-1962` | Appendix A, p. 542 | same | official |
| `hilliam` | name | E. Hilliam | `nicholson-1962` | 261 | "the 10th Brigade (Brig.-Gen. E. Hilliam)" | official |
| `hilliam` | rank | Brigadier-General | `nicholson-1962` | 261 | same | official |
| `odlum` | name | V. W. Odlum | `nicholson-1962` | 259 | "the 11th Brigade, commanded by Brig.-Gen. V. W. Odium" (text layer's "Odium") | official |
| `odlum` | rank | Brigadier-General | `nicholson-1962` | 259 | same | official |
| `macbrien` | name | J. H. MacBrien | `nicholson-1962` | 259 | "the 12th Brigade (Brig.-Gen. J. H. MacBrien)" | official |
| `macbrien` | rank | Brigadier-General | `nicholson-1962` | 259 | same | official |
| `jones-low` | name | L. O. W. Jones | `hussey-inman-1921` | 267 | 1917 column: "Brig.-Gen. L. O. W. Jones" (13th Infantry Brigade) | secondary |
| `jones-low` | rank | Brigadier-General | `hussey-inman-1921` | 267 | same | secondary |
| `turner-mn` | name | M. N. Turner | `hussey-inman-1921` | 267 | 1917 column: "Brig.-Gen. M. N. Turner" (15th Infantry Brigade) | secondary |
| `turner-mn` | rank | Brigadier-General | `hussey-inman-1921` | 267 | same | secondary |
| `gordon-lennox` | name | Lord E. Gordon-Lennox | `hussey-inman-1921` | 267 | 1917 column: "Brig.-Gen. Lord E. Gordon-Lennox" (95th Infantry Brigade); index: "Lord E. C." | secondary |
| `gordon-lennox` | rank | Brigadier-General | `hussey-inman-1921` | 267 | same | secondary |
| `co-3bn` | name | Joseph B. Rogers | `wikipedia-cef-battalions` | 3rd Battalion (Toronto Regiment), CEF, rev. 1375579158, list of commanding officers | list entry (paraphrased): Lt.-Col. Joseph B. Rogers, October 1916 to April 1919 | tertiary |
| `co-3bn` | rank | Lieutenant-Colonel | `wikipedia-cef-battalions` | 3rd Battalion (Toronto Regiment), CEF, rev. 1375579158, list of commanding officers | list entry (paraphrased): Lt.-Col. Joseph B. Rogers, October 1916 to April 1919 | tertiary |
| `co-5bn` | name | H. M. Dyer | `wikipedia-cef-battalions` | 5th Battalion (Western Cavalry), CEF, rev. 1356545002, list of commanding officers | list entry (paraphrased): Lt.-Col. H. M. Dyer, 11 January 1916 - 29 June 1917 | tertiary |
| `co-5bn` | rank | Lieutenant-Colonel | `wikipedia-cef-battalions` | 5th Battalion (Western Cavalry), CEF, rev. 1356545002, list of commanding officers | list entry (paraphrased): Lt.-Col. H. M. Dyer, 11 January 1916 - 29 June 1917 | tertiary |
| `co-8bn` | name | J. M. Prower | `wikipedia-cef-battalions` | 8th Battalion (90th Winnipeg Rifles), CEF, rev. 1386529871, list of commanding officers | list entry (paraphrased): Lt.-Col. J. M. Prower, 3 August 1916 - 20 April 1918 | tertiary |
| `co-8bn` | rank | Lieutenant-Colonel | `wikipedia-cef-battalions` | 8th Battalion (90th Winnipeg Rifles), CEF, rev. 1386529871, list of commanding officers | list entry (paraphrased): Lt.-Col. J. M. Prower, 3 August 1916 - 20 April 1918 | tertiary |
| `co-15bn` | name | C. E. Bent | `wikipedia-cef-battalions` | 15th Battalion (48th Highlanders of Canada), CEF, rev. 1328939893, list of commanding officers | list entry (paraphrased): Lt.-Col. C. E. Bent, 20 May 1916 - 29 December 1917 | tertiary |
| `co-15bn` | rank | Lieutenant-Colonel | `wikipedia-cef-battalions` | 15th Battalion (48th Highlanders of Canada), CEF, rev. 1328939893, list of commanding officers | list entry (paraphrased): Lt.-Col. C. E. Bent, 20 May 1916 - 29 December 1917 | tertiary |
| `co-18bn` | name | G. F. Morrison | `wikipedia-cef-battalions` | 18th Battalion (Western Ontario), CEF, rev. 1375579163, list of commanding officers | list entry (paraphrased): Lt.-Col. G. F. Morrison, 9 October 1916 - 19 April 1917 | tertiary |
| `co-18bn` | rank | Lieutenant-Colonel | `wikipedia-cef-battalions` | 18th Battalion (Western Ontario), CEF, rev. 1375579163, list of commanding officers | list entry (paraphrased): Lt.-Col. G. F. Morrison, 9 October 1916 - 19 April 1917 | tertiary |
| `co-21bn` | name | Thomas F. Elmitt | `wikipedia-cef-battalions` | 21st Battalion (Eastern Ontario), CEF, rev. 1386532405, list of commanding officers | list entry (paraphrased): Lt.-Col. Thomas F. Elmitt, 7 January 1917 - 1 July 1917 | tertiary |
| `co-21bn` | rank | Lieutenant-Colonel | `wikipedia-cef-battalions` | 21st Battalion (Eastern Ontario), CEF, rev. 1386532405, list of commanding officers | list entry (paraphrased): Lt.-Col. Thomas F. Elmitt, 7 January 1917 - 1 July 1917 | tertiary |
| `co-22bn` | name | T. L. Tremblay | `wikipedia-cef-battalions` | 22nd Battalion (French Canadian), CEF, rev. 1325400995, list of commanding officers | list entry (paraphrased): Lt.-Col. T. L. Tremblay, 15 February 1917 - 8 August 1918 | tertiary |
| `co-22bn` | rank | Lieutenant-Colonel | `wikipedia-cef-battalions` | 22nd Battalion (French Canadian), CEF, rev. 1325400995, list of commanding officers | list entry (paraphrased): Lt.-Col. T. L. Tremblay, 15 February 1917 - 8 August 1918 | tertiary |
| `co-24bn` | name | C. F. Ritchie | `wikipedia-cef-battalions` | 24th Battalion (Victoria Rifles), CEF, rev. 1386533139, list of commanding officers | list entry (paraphrased): Lt.-Col. C. F. Ritchie, 7 December 1916 - 14 April 1917 | tertiary |
| `co-24bn` | rank | Lieutenant-Colonel | `wikipedia-cef-battalions` | 24th Battalion (Victoria Rifles), CEF, rev. 1386533139, list of commanding officers | list entry (paraphrased): Lt.-Col. C. F. Ritchie, 7 December 1916 - 14 April 1917 | tertiary |
| `co-25bn` | name | D. S. Bauld | `wikipedia-cef-battalions` | 25th Battalion (Nova Scotia Rifles), CEF, rev. 1379968631, list of commanding officers | list entry (paraphrased): Lt.-Col. D. S. Bauld, 4 April 1917 - 9 July 1917 | tertiary |
| `co-25bn` | rank | Lieutenant-Colonel | `wikipedia-cef-battalions` | 25th Battalion (Nova Scotia Rifles), CEF, rev. 1379968631, list of commanding officers | list entry (paraphrased): Lt.-Col. D. S. Bauld, 4 April 1917 - 9 July 1917 | tertiary |
| `co-26bn` | name | A. E. G. McKenzie | `wikipedia-cef-battalions` | 26th Battalion (New Brunswick), CEF, rev. 1386535720, list of commanding officers | list entry (paraphrased): Lt.-Col. A. E. G. McKenzie, 29 May 1916 - 2 July 1917 | tertiary |
| `co-26bn` | rank | Lieutenant-Colonel | `wikipedia-cef-battalions` | 26th Battalion (New Brunswick), CEF, rev. 1386535720, list of commanding officers | list entry (paraphrased): Lt.-Col. A. E. G. McKenzie, 29 May 1916 - 2 July 1917 | tertiary |
| `co-27bn` | name | Patrick J. Daley | `wikipedia-cef-battalions` | 27th Battalion (City of Winnipeg), CEF, rev. 1379481661, list of commanding officers | list entry (paraphrased): Lt.-Col. Patrick J. Daley, 15 April 1916 - 4 April 1918 | tertiary |
| `co-27bn` | rank | Lieutenant-Colonel | `wikipedia-cef-battalions` | 27th Battalion (City of Winnipeg), CEF, rev. 1379481661, list of commanding officers | list entry (paraphrased): Lt.-Col. Patrick J. Daley, 15 April 1916 - 4 April 1918 | tertiary |
| `co-28bn` | name | A. Ross | `wikipedia-cef-battalions` | 28th Battalion (Northwest), CEF, rev. 1381494295, list of commanding officers | list entry (paraphrased): Lt.-Col. A. Ross, 17 September 1916 - 1 October 1918 | tertiary |
| `co-28bn` | rank | Lieutenant-Colonel | `wikipedia-cef-battalions` | 28th Battalion (Northwest), CEF, rev. 1381494295, list of commanding officers | list entry (paraphrased): Lt.-Col. A. Ross, 17 September 1916 - 1 October 1918 | tertiary |
| `co-29bn` | name | J. M. Ross | `wikipedia-cef-battalions` | 29th Battalion, (Vancouver), CEF, rev. 1375578992, list of commanding officers | list entry (paraphrased): Lt.-Col. J. M. Ross, 22 January 1917 - 23 July 1917 | tertiary |
| `co-29bn` | rank | Lieutenant-Colonel | `wikipedia-cef-battalions` | 29th Battalion, (Vancouver), CEF, rev. 1375578992, list of commanding officers | list entry (paraphrased): Lt.-Col. J. M. Ross, 22 January 1917 - 23 July 1917 | tertiary |
| `co-31bn` | name | A. H. Bell | `wikipedia-cef-battalions` | 31st Battalion (Alberta), CEF, rev. 1386348707, list of commanding officers | list entry (paraphrased): Lt.-Col. A. H. Bell, 29 May 1915 - 23 April 1918 | tertiary |
| `co-31bn` | rank | Lieutenant-Colonel | `wikipedia-cef-battalions` | 31st Battalion (Alberta), CEF, rev. 1386348707, list of commanding officers | list entry (paraphrased): Lt.-Col. A. H. Bell, 29 May 1915 - 23 April 1918 | tertiary |
| `co-46bn` | name | H. J. Dawson | `wikipedia-cef-battalions` | 46th Battalion (South Saskatchewan), CEF, rev. 1386714836, list of commanding officers | list entry (paraphrased): Lt.-Col. H. J. Dawson, 29 August 1916 - demobilization | tertiary |
| `co-46bn` | rank | Lieutenant-Colonel | `wikipedia-cef-battalions` | 46th Battalion (South Saskatchewan), CEF, rev. 1386714836, list of commanding officers | list entry (paraphrased): Lt.-Col. H. J. Dawson, 29 August 1916 - demobilization | tertiary |
| `co-49bn` | name | R. H. Palmer | `wikipedia-cef-battalions` | 49th Battalion (Edmonton Regiment), CEF, rev. 1345849028, list of commanding officers | list entry (paraphrased): Lt.-Col. R. H. Palmer, 14 February 1917 - 1 July 1918 | tertiary |
| `co-49bn` | rank | Lieutenant-Colonel | `wikipedia-cef-battalions` | 49th Battalion (Edmonton Regiment), CEF, rev. 1345849028, list of commanding officers | list entry (paraphrased): Lt.-Col. R. H. Palmer, 14 February 1917 - 1 July 1918 | tertiary |
| `co-52bn` | name | W. B. Evans | `wikipedia-cef-battalions` | 52nd Battalion (New Ontario), CEF, rev. 1379890539, list of commanding officers | list entry (paraphrased): Lt.-Col. W. B. Evans, 25 September 1916 - 11 July 1917 | tertiary |
| `co-52bn` | rank | Lieutenant-Colonel | `wikipedia-cef-battalions` | 52nd Battalion (New Ontario), CEF, rev. 1379890539, list of commanding officers | list entry (paraphrased): Lt.-Col. W. B. Evans, 25 September 1916 - 11 July 1917 | tertiary |
| `co-58bn` | name | H. J. Genet | `wikipedia-cef-battalions` | 58th Battalion, CEF, rev. 1386783789, list of commanding officers | list entry (paraphrased): Lt.-Col. H. J. Genet, 22 November 1915 - 11 January 1918 | tertiary |
| `co-58bn` | rank | Lieutenant-Colonel | `wikipedia-cef-battalions` | 58th Battalion, CEF, rev. 1386783789, list of commanding officers | list entry (paraphrased): Lt.-Col. H. J. Genet, 22 November 1915 - 11 January 1918 | tertiary |
| `co-72bn` | name | J. A. Clark | `wikipedia-cef-battalions` | 72nd Battalion (Seaforth Highlanders of Canada), CEF, rev. 1375428624, list of commanding officers | list entry (paraphrased): Lt.-Col. J. A. Clark, 25 April 1916 - 12 September 1918 | tertiary |
| `co-72bn` | rank | Lieutenant-Colonel | `wikipedia-cef-battalions` | 72nd Battalion (Seaforth Highlanders of Canada), CEF, rev. 1375428624, list of commanding officers | list entry (paraphrased): Lt.-Col. J. A. Clark, 25 April 1916 - 12 September 1918 | tertiary |
| `co-75bn` | name | C. B. Worsnop | `wikipedia-cef-battalions` | 75th Battalion (Mississauga), CEF, rev. 1381442040, list of commanding officers | list entry (paraphrased): Lt.-Col. C. B. Worsnop, 11 March 1917 - 16 April 1917 | tertiary |
| `co-75bn` | rank | Lieutenant-Colonel | `wikipedia-cef-battalions` | 75th Battalion (Mississauga), CEF, rev. 1381442040, list of commanding officers | list entry (paraphrased): Lt.-Col. C. B. Worsnop, 11 March 1917 - 16 April 1917 | tertiary |
| `co-78bn` | name | J. Kirkcaldy | `wikipedia-cef-battalions` | 78th Battalion (Winnipeg Grenadiers), CEF, rev. 1308898073, list of commanding officers | list entry (paraphrased): Lt.-Col. J. Kirkcaldy, 22 May 1916 - 15 November 1917 | tertiary |
| `co-78bn` | rank | Lieutenant-Colonel | `wikipedia-cef-battalions` | 78th Battalion (Winnipeg Grenadiers), CEF, rev. 1308898073, list of commanding officers | list entry (paraphrased): Lt.-Col. J. Kirkcaldy, 22 May 1916 - 15 November 1917 | tertiary |
| `co-116bn` | name | S. S. Sharpe | `wikipedia-cef-battalions` | 116th Battalion (Ontario County), CEF, rev. 1335680448, list of commanding officers | list entry (paraphrased): Lt.-Col. S. S. Sharpe, 23 July 1916 - 28 December 1917 | tertiary |
| `co-116bn` | rank | Lieutenant-Colonel | `wikipedia-cef-battalions` | 116th Battalion (Ontario County), CEF, rev. 1335680448, list of commanding officers | list entry (paraphrased): Lt.-Col. S. S. Sharpe, 23 July 1916 - 28 December 1917 | tertiary |
| `co-10bn` | name | D. M. Ormond | `holland-1918` | 28 | "Lieut.-Col. D. M. Ormond was now commanding the 10th Battalion" | secondary |
| `co-10bn` | rank | Lieutenant-Colonel | `holland-1918` | 28 | same | secondary |
| `co-85bn` | name | A. H. Borden | `hayes-1920` | 45 | "the Commanding Officer Lieut-Col. A. H. Borden" | secondary |
| `co-85bn` | rank | Lieutenant-Colonel | `hayes-1920` | 45 | same | secondary |
## Values entered: the drafted ratings

All 105 are `estimate`s (tier: none; builder's judgement on the cited conduct, under `leader-rubric.md`). Page numbers
without a source are Nicholson's.

| Leader | Rating | Value | Justification (as entered) |
|---|---|---|---|
| `byng` | planning | 5 | Nicholson p. 247: wrote the corps 'Scheme of Operations' (5 March); p. 250: a full-scale replica of the battle area laid out 'under General Byng's personal direction', rehearsed from platoon to division |
| `byng` | orderSpeed | 4 | pp. 257-258: 'shortly after two o'clock' ordered a squadron to push on to Willerval, and at 2:40 telephoned First Army to propose using cavalry, once the Brown Line 'seemed assured' |
| `byng` | adaptiveness | 3 | p. 258: sought to exploit beyond the plan the same afternoon; but p. 268 calls the corps timetable 'inflexible', and the cavalry had been left out of the scheme (p. 258) |
| `byng` | riskTolerance | 3 | p. 258: the attack was framed as a limited-objective, rigidly timed set-piece; the afternoon cavalry proposal was the one reach beyond it |
| `byng` | moraleEffect | 4 | p. 250: commanders 'at all levels freely briefed their subordinates' so that 'all ranks knew just where they would have to go'; no direct evidence of his personal effect on morale |
| `currie` | planning | 5 | p. 250: studied the French Verdun attack and lectured the corps on its lessons; p. 258: his division took all four objectives 'on schedule' |
| `currie` | orderSpeed | 4 | p. 255: when the Red Line's right 500 yards held out, the 1st Brigade was brought forward from reserve to take it as part of the next bound |
| `currie` | adaptiveness | 4 | p. 255: re-tasked the reserve brigade to the uncaptured right of the Red Line; p. 257: threw back the right flank to keep touch with the 51st Division |
| `currie` | riskTolerance | 3 | p. 247-248: kept to the corps timetable and its pauses; nothing in the sources read shows him reaching beyond it |
| `currie` | moraleEffect | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `burstall` | planning | 4 | p. 254: Black Line by 6:15; p. 255: Red by eight o'clock; p. 256: Blue, then p. 257 Brown, with the attached British 13th Brigade worked into the plan on the widening front |
| `burstall` | orderSpeed | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `burstall` | adaptiveness | 3 | p. 254: the eight attached tanks failed early and the attack went on without them; the plan had not relied on them (p. 248) |
| `burstall` | riskTolerance | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `burstall` | moraleEffect | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `lipsett` | planning | 4 | p. 254: 'in general the attack went like clockwork'; Black confirmed by 6:25 and the crest by 7:30 (p. 255) |
| `lipsett` | orderSpeed | 4 | p. 256: at about nine o'clock, on learning Hill 145 was still German, the 7th Brigade was set to form a defensive flank |
| `lipsett` | adaptiveness | 4 | p. 256: the defensive flank on the open left, from the Bois de la Folie back to the old front line |
| `lipsett` | riskTolerance | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `lipsett` | moraleEffect | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `watson` | planning | 3 | p. 259: assembly trenches dug well forward and subways driven to within 150 yards of the German line; but a German trench left unshelled at a battalion's request broke the 11th Brigade's left |
| `watson` | orderSpeed | 3 | p. 261: called the 10th Brigade forward at 6:00 p.m. on 9 April, after the morning's failure; Hill 145 fell the next afternoon |
| `watson` | adaptiveness | 4 | p. 261: committed the reserve brigade meant for the Pimple to Hill 145 instead, and (p. 262) put off the Pimple attack 48 hours to let it recover |
| `watson` | riskTolerance | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `watson` | moraleEffect | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `stephens` | planning | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `stephens` | orderSpeed | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `stephens` | adaptiveness | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `stephens` | riskTolerance | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `stephens` | moraleEffect | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `griesbach` | planning | 5 | p. 257: foreseeing uncut wire on the right, every forward company of two battalions carried 24 pairs of wire-cutters and rifle wire-breakers, and got through both belts 'without losing the barrage' |
| `griesbach` | orderSpeed | 4 | p. 257: at mid-afternoon threw back his right flank to keep touch with the 51st Division |
| `griesbach` | adaptiveness | 4 | p. 255-257: took on the Red Line's uncaptured right as well as the Blue and Brown bounds |
| `griesbach` | riskTolerance | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `griesbach` | moraleEffect | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `loomis` | planning | 4 | p. 254-255: Black by 6:15 and the Red's left half by shortly after seven, on the timetable; holland-1918 pp. 28-29: the 10th Battalion on its final objective soon after 9 a.m. |
| `loomis` | orderSpeed | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `loomis` | adaptiveness | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `loomis` | riskTolerance | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `loomis` | moraleEffect | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `tuxford` | planning | 4 | p. 254: heavy losses at the Zwolfer-Graben but the Black Line taken by 6:15; Red by shortly after seven (p. 255) |
| `tuxford` | orderSpeed | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `tuxford` | adaptiveness | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `tuxford` | riskTolerance | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `tuxford` | moraleEffect | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `rennie` | planning | 4 | p. 254-255: Black by 6:15; its supporting 21st Battalion through Les Tilleuls to the Red Line, on time |
| `rennie` | orderSpeed | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `rennie` | adaptiveness | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `rennie` | riskTolerance | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `rennie` | moraleEffect | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `macdonell-ah` | planning | 4 | p. 255: the 25th Battalion seized the Turko-Graben with mop-up parties of the 22nd, close to 400 prisoners |
| `macdonell-ah` | orderSpeed | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `macdonell-ah` | adaptiveness | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `macdonell-ah` | riskTolerance | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `macdonell-ah` | moraleEffect | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `ketchen` | planning | 4 | p. 256: Thelus cleared 'in precisely the same manner as it had been worked out on the practice fields' |
| `ketchen` | orderSpeed | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `ketchen` | adaptiveness | 3 | p. 257: the final attack wheeled half-left on its objectives as planned; no departure from plan recorded |
| `ketchen` | riskTolerance | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `ketchen` | moraleEffect | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `macdonell-ac` | planning | 4 | p. 255-256: on the crest by 7:30 against local counter-attacks in the orchards |
| `macdonell-ac` | orderSpeed | 4 | p. 256: formed the defensive flank toward Hill 145 when called on at about nine o'clock |
| `macdonell-ac` | adaptiveness | 4 | p. 256: the PPCLI took over part of the 42nd's front so the 42nd could extend to cover the new flank |
| `macdonell-ac` | riskTolerance | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `macdonell-ac` | moraleEffect | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `elmsley` | planning | 4 | p. 254-256: the first large haul of prisoners (150, by the 2nd CMR) and La Folie Farm overrun on time |
| `elmsley` | orderSpeed | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `elmsley` | adaptiveness | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `elmsley` | riskTolerance | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `elmsley` | moraleEffect | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `hill-fw` | planning | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `hill-fw` | orderSpeed | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `hill-fw` | adaptiveness | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `hill-fw` | riskTolerance | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `hill-fw` | moraleEffect | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `hilliam` | planning | 4 | p. 261: the 10 April attack down Hill 145's eastern slope 'was a brilliant success'; p. 263: the Pimple taken on 12 April by six o'clock |
| `hilliam` | orderSpeed | 4 | p. 261: called at 6:00 p.m. on 9 April, its two uncommitted battalions were in position on Hill 145 by 3:15 next afternoon |
| `hilliam` | adaptiveness | 4 | p. 261: switched from the planned Pimple attack to Hill 145 at a few hours' notice |
| `hilliam` | riskTolerance | 4 | p. 262-263: attacked the Pimple in a gale of sleet and snow, which helped surprise |
| `hilliam` | moraleEffect | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `odlum` | planning | 2 | p. 259: the left assaulting battalion's request to spare a German trench from the heavy artillery was allowed, and fire from it broke the brigade's left wing |
| `odlum` | orderSpeed | 3 | p. 260: the uncaptured trench was taken by bombing parties at one o'clock, and the summit's west side by the 85th's two companies before dark |
| `odlum` | adaptiveness | 4 | p. 260: committed its reserve, the 85th, to restore the attack; hayes-1920 p. 52: the barrage was called off at the last minute because the lines were too close |
| `odlum` | riskTolerance | 4 | hayes-1920 pp. 45, 51-52: sent two companies of a battalion new to battle against the strongpoint that had stopped the brigade, in the end without a barrage |
| `odlum` | moraleEffect | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `macbrien` | planning | 3 | p. 260-261: two mines blown under the German front at Zero eased the 73rd's attack, but the 78th lost its barrage and the brigade could not finish until Hill 145 fell |
| `macbrien` | orderSpeed | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `macbrien` | adaptiveness | 3 | p. 260: the 73rd consolidated the first trench as a firm left flank; the final objective waited on the neighbouring brigade |
| `macbrien` | riskTolerance | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `macbrien` | moraleEffect | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `jones-low` | planning | 4 | hussey-inman-1921 p. 153: a fortnight practising the attack over taped trenches, and a plan to take Thelus Trench frontally then swing south through the Goulot Wood, avoiding a double belt of wire |
| `jones-low` | orderSpeed | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `jones-low` | adaptiveness | 3 | p. 154-155: a defensive flank put out on the left against fire from the Bonval Wood |
| `jones-low` | riskTolerance | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `jones-low` | moraleEffect | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `turner-mn` | planning | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `turner-mn` | orderSpeed | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `turner-mn` | adaptiveness | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `turner-mn` | riskTolerance | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `turner-mn` | moraleEffect | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `gordon-lennox` | planning | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `gordon-lennox` | orderSpeed | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `gordon-lennox` | adaptiveness | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `gordon-lennox` | riskTolerance | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
| `gordon-lennox` | moraleEffect | 3 | no conduct at Vimy found in the sources read; the rubric midpoint until the owner rates it |
## Conflicts

- **Byng's rank.** Nicholson's Appendix A (p. 540) lists "Gen. Hon. Sir J. H. G. Byng", the rank on relinquishing the
  Corps on 8 June 1917; the narrative calls him "Lieut.-General Sir Julian Byng" when he left (p. 283), and
  `hussey-inman-1921` p. 151 "Lieut.-Gen. the Hon. Sir Julian Byng" at Vimy. Entered: Lieutenant-General.
- **The 11th Brigade's commander's name.** The Nicholson text layer reads "Odium" (pp. 259, Appendix A p. 542), an OCR
  slip for Odlum ("Odlum" in `wikipedia-vimy-oob`). Entered: V. W. Odlum, citing Nicholson.
- **The 87th Battalion's commanding officer.** Nicholson (p. 259) mentions "the commanding officer of the left
  assaulting battalion (the 87th)" without a name; the 87th's Wikipedia list (rev. 1386298168) has Lt.-Col. R. W.
  Frost to 6 April 1917 and Lt.-Col. J. V. P. O'Donahoe from 8 May 1917, so nobody for 9 April. None entered.
- **The 75th Battalion's commanding officer.** Its list (rev. 1381442040) gives Lt.-Col. C. B. Worsnop from 11 March to
  16 April 1917, a five-week appointment between Beckett's death in the 1 March raid and Harbottle; entered, but it
  may be an acting command.
- **The 18th and 24th Battalions** changed commanding officer within days of the battle (Morrison to 19 April,
  Ritchie to 14 April 1917, by their lists); the officers in command on 9 April are entered.
- **Watson and Odlum both answer for the 87th's spared trench** (p. 259: left unshelled "at the request of the
  commanding officer" of the 87th). Who approved the request is not stated; it is counted against the brigade's
  planning (Odlum 2) and noted in the division's (Watson 3).

## Open questions for the historian

- **Battalion commanding officers not found** for 26 Canadian battalions: the 1st, 2nd, 4th, 7th, 13th, 14th, 16th, 19th, 20th,
  38th, 42nd, 43rd, 44th, 47th, 50th, 54th, 60th, 73rd, 87th, 102nd, The RCR, the PPCLI, the 1st, 2nd, 4th and 5th
  CMR; and for all 12 British battalions. The Canadian battalions' Wikipedia articles (where they exist) have no dated list, and
  `www.cefresearch.ca` redirects to `cefresearch.ca`, a host this task may not reach. War diaries on `bac-lac.gc.ca`
  name them; reading them was beyond this task.
- **The British brigades' commanders' first names** (`L. O. W. Jones`, `M. N. Turner`, `Lord E. Gordon-Lennox`) and
  the 5th Division's (`R. B. Stephens`): initials only in `hussey-inman-1921`.
- **Ratings with no cited conduct** (Stephens, Hill, Turner, Gordon-Lennox, and most moraleEffect and riskTolerance
  ratings): the sources read give nothing to rate. Battalion and brigade war diaries, Cook's and Godefroy's studies,
  and memoirs would, and the owner may know them.
- **Brigade majors and staff**, who shaped much of the planning credited here to the commanders, are not recorded.
