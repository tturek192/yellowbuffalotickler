# Deadlock 1916 Sandbox: design

Date: 2026-11-26. Status: draft for the owner's approval.

## Intent

The Vimy simulator (Plans 1–4) is historically rigorous, but the owner finds it too rigid to play: "may as well watch a video". The sandbox keeps what the project learned about why the Western Front deadlocked, and turns it into a simple, animated war-game map. Players set up a front, try a theory, nudge the battle while it runs, and see whether the deadlock breaks, how, and why. No historical accuracy is required, and the game must need little ongoing upkeep.

**Success:** a first-time visitor to oosp.fun can pick a map, change a setup and watch a battle play out within a minute or two. They can replay variations quickly and understand why each one went the way it did.

## Goals

- **Set up, then nudge.**
  - **Setup:** place battalion blocks, artillery batteries, wire and trench lines, and reserve positions, for either or both sides.
  - **During play:** pause at any time and issue a few orders, each arriving after a short delay. The orders are: send in a reserve, call a barrage on a spot, hold, and pull back.
- **Ready-made maps you can edit.** Four maps to start, each a simple terrain grid with heights, woods, villages, rivers and roads:
  - a ridge (Vimy-like);
  - open flat ground (Somme-like);
  - a river line;
  - a wooded hill.

  An in-game painter edits the terrain and saves the result as a new map.
- **Animated playback.** A battle covers a day or two of game time in about 2–5 minutes of real time. The player sets the speed, pauses, and steps.
- **Deadlock outcome.** These are the owner's four conditions, as already ruled:
  - **breakthrough:** the attacker gets past the defender's gun line before reserves seal the sector;
  - **surrender:** at least half the defender's men at Zero are captured;
  - **collapse:** the defender's whole force falls below 10% fit;
  - **stronghold:** a named stronghold is taken and held for 60 minutes.

  The result line names which condition broke and when, or says the deadlock held, with the closest margins.
- **"Why" lines.** Short plain-language causes for key moments, for example: "pinned: the barrage moved on and the machine guns were up first".
- **Save and share.** A setup, including any map edits, exports to a small file or a link and imports back in.
- **Opponent.** Either side can be left to the computer's default setup and simple behaviour: defenders hold and counter-attack lost ground, attackers advance behind their barrage.

## Non-goals

- Historical accuracy, sourced values, research notes and credibility grades all stay with the Vimy simulator, which remains in the repo untouched.
- No calibration against real battles.
- No multiplayer and no accounts.
- No 3D.
- No real-time control of every unit: nudges only.

## Anti-goals (failure even if it works)

- **Too complex to set up.** If a player needs to read a manual before their first battle, the game has failed.
- **Needs constant upkeep.** If adding a map or tweaking a rule means touching many files, research or data tables, the game has failed.
- **A solved puzzle.** If one setup always wins, the game has failed: the deadlock must be hard to break, but breakable in several ways.

## Constraints

- **Platform.** It runs entirely in the browser as a static site, deployable to oosp.fun the way the Vimy build was (copied into `PROJ-COUNTDOWN-FILES2/site/`), and works at phone width.
- **Codebase.** It lives in the existing repo (`tturek192/yellowbuffalotickler`) as new code. The Vimy engine and app keep working.
- **Speed.** A battle computes or animates smoothly on an ordinary laptop. The rules are cheap enough to run live, not precomputed.
- **Determinism.** A setup plus a seed gives the same battle, so a shared setup replays identically.

## Approaches

The owner chose **A**.

- **A. A new light game built on the existing app (chosen).**
  - **The engine:** a small fresh rules engine, a few hundred lines, written from the same principles: barrage gap, morale and pinning, delayed orders, reserves, and the four deadlock conditions.
  - **What it reuses:** the app's map drawing, period style, zoom, Web Workers and "why" presentation.
  - **Data:** maps and settings are small readable files.
  - **Why it was chosen:** it is simple to play and cheap to maintain, and it keeps the look and the lessons.
- **B. Simplify the current engine and feed it made-up maps.** This needs the least new code, but it stays heavy and rigid, with thousands of tuned values. It works against the request.
- **C. A standalone single-page game.** It is easiest to host, but it reuses little and would have to rebuild the map style and the "why" lines.

## Decided

- **Interaction model:** set up, then nudge (the owner's choice).
- **Maps:** ready-made and editable (the owner's choice).
- **Build approach:** A (the owner's choice).
- **Deadlock conditions:** the four above, with collapse measured across the whole force and the stronghold held for 60 minutes. These were the owner's earlier rulings.

## Builder's calls (proposals the owner may correct)

- **Sides:** the player sets up both sides, or one side against the computer's default. Nudges are allowed for either side.
- **Scale:** units are battalions of 400–1,000 men, each drawn as one block. Batteries are drawn as gun icons. Wire and trenches are drawn as lines.
- **Rules:** a handful of plain numbers in one settings file, such as machine-gun lethality, barrage speed, emerge time, order delay and reserve march speed. The player can adjust a few of them on an "Advanced" panel.
- **Where it goes:** a new package, `packages/sandbox`, for the rules. The sandbox page is a new entry in the app. On oosp.fun it replaces the Vimy simulator page at the same address.
- **Look:** the period map style from Plan 3 Task 20 is the default, and the plain style is a switch.

- **Who nudges:** one person may set up and nudge both sides in the same battle. "Computer vs computer" (just watch) is a supported mode, and it is also how balance tests run batches of battles.
- **Roles and Zero:** each map ships with a default attacker side and edge, and a switch swaps them. Zero is the moment the player presses Go. The surrender and collapse baselines are each side's men at Zero.
- **The Vimy simulator:** it stays in the repo and keeps working. On oosp.fun the sandbox takes over the page's address and the Vimy app is no longer deployed there. It can be republished at a sub-path later if wanted.
- **Reuse:** shared app modules (map drawing, playback, "why" panel) may be refactored to serve both, provided the Vimy app's tests still pass. The sandbox defines its own small battle-record format rather than adopting Vimy's.
- **Shared setups:** a share file or link carries the map, the setup, the seed, any Advanced-panel numbers, and a rules version. Old links replay under the rules version they were made with, or say plainly that they can't.

## Left to the builder

- the exact rules and numbers;
- the map file format and grid size;
- the painter's tools;
- the opponent's behaviour details;
- the share-link encoding;
- the test approach, and how much of the existing app code is reused or copied.
