# Collapse Revival

A playable browser prototype inspired by the family favorite Super Collapse!, built to settle the rules and playtest the feel before a native Swift version.

## Run locally

Use Node.js 22 or newer. There are no packages to install and no build step.

```sh
cd web
npm run dev
```

Open [localhost:4173](http://localhost:4173). Stop the server with `Ctrl+C`.

```sh
npm test
```

Tests use Node's built-in test runner and exercise game rules, puzzles, and journey progression independently of the browser.

## Publish

Every push to `main` on GitHub runs the checks and tests, then publishes `dist/` to GitHub Pages (`.github/workflows/pages.yml`). Nothing is built; the workflow only stamps the commit into `dist/sw.js` so each release replaces the offline copy.

On an iPhone, open the published link in Safari and choose **Share → Add to Home Screen**. The icon opens the game full screen and keeps it playable without a connection. Play from the icon rather than a Safari tab: the icon keeps its own saves, and Safari may clear a site's saves after about a week without a visit. The offline copy is skipped on `localhost`, so local edits show up on reload. Add any new file in `dist/` to the list in `dist/sw.js`; a test fails until you do.

## Play

Choose a mode and difficulty, then start a game. Classic and Relapse always begin at level 1, so a lost game starts over from there; the other modes can begin at a chosen starting level, kept for now as a playtesting aid. Click or tap connected groups of at least three matching blocks. Bigger groups earn more points. Blocks settle after each removal; keep rising stacks away from the danger edge.

Score previews and the last-clear breakdown show the group-size, quick-clear streak, and timed-bonus multipliers. Clearing the whole board doubles that move's points in every mode other than Relapse; in Relapse, clearing one side doubles them and clearing both sides at once triples them. Large groups rock and glow when selected, releasing a small halo-and-spark burst when cleared. These scoring rules are tunable playtest values.

Blocks near the danger edge shake in four steps: three, two, and one empty rows away, then strongest at contact. In Relapse, each column uses its actual gap between opposing stacks. Reduced-motion preferences replace shaking with static highlights and suppress the glow burst.

Big moments earn a short cheer over the board: “Nice!” for a big clear, “Oh snap!” for a huge one, “Clean sweep!” for an emptied board, “Phew!” after a close call, and “Past your best!” when the run passes your personal best. One cheer shows per clear, the most significant first. Big clears stay quiet for a few moves after a cheer, and phrases rotate so they rarely repeat. A new personal best also earns a ribbon and confetti on the round's result. Cheers follow the sound toggle and reduced-motion settings. See [Celebrations](docs/celebrations.md) for the thresholds and how they were measured.

Each finished round has an animated score tally. Earned points count up, then every block still on the board deducts 20 points, capped at that round's earnings. The final breakdown separates base points, group and streak bonuses, bonus-round ×2 points, and all-clear ×2/×3 rewards; it also shows the biggest clear and total blocks cleared. Earlier levels' banked points stay safe. Skip the count to see the result immediately; reduced-motion settings show it without animation. Personal bests save the final score after deductions.

Classic awards one star for completing a level and two or three for meeting its displayed net-score targets. It adds ×1 / ×2.10 / ×3.55 for Easy / Normal / Hard, plus 5% per level up to ×2; remaining blocks still cost 20 each afterward. Its bonus always lasts 15 seconds with a fixed row budget; Add row brings that supply forward. Best stars are saved by level and difficulty. Provisional goals are labeled “Playtest targets.” Records includes local results and an export for tuning; the last 500 finished attempts stay in this browser. See [Classic scoring](docs/classic-star-scoring.md) for the approved calibration and limits.

The prototype offers Classic, Strategy, Relapse, Puzzle, Slider, Continuous, and Countdown modes, plus 15-second double-points bonus rounds with continuing incoming rows. During the final ten seconds of Countdown and each bonus round, one row arrives every two seconds and a translucent countdown appears over the board; the round clock still runs in real seconds. Freeze boosts stop the feeder while the clock keeps running. Puzzle mode includes 26 original boards: the 20-puzzle collection and the harbor, six lessons that teach joining separated colors, letting blocks fall, sliding columns together, resisting a tempting dead end, and all of them at once. Rare black bombs clear a 5×5 area, and colored-ring bombs clear their color across the board. Tap a bomb or gravity block to activate it. Clearing touching ordinary cubes removes black bombs and gravity blocks quietly; color bombs are removed this way only when the cleared cubes match their color. Relapse gravity blocks move their entire side's stack to the opposite side. Stone blocks add obstacles. The interface includes pause, sound controls, hints, puzzle undo, and local best scores.

Open **The journey** for 25 original stages across five worlds. Each stage has its own objective, such as clearing a group of ten or finishing with few blocks left, shown before and during play. Meeting it earns ★ and unlocks the next stop; reaching the stage's round-point targets earns ★★ or ★★★, as in Classic. A missed objective earns nothing and can be retried at once. Completing stages earns game coins; revisiting completed stages earns eight coins. See [Journey stars](docs/journey-star-scoring.md) for the objectives, targets, and how they were calibrated. Spend coins on blast, color, or freeze boosts in the shop; boosts in your pocket then wait in a tray under the board in any game, one tap to use, and show as off in a run with No boosts. Or play the arcade's three reels for a five-coin bet. Coins have no real-money value. Journey progress, inventory, preferences, scores, and playtest notes are saved in this browser.

Every puzzle earns ★ for clearing the board and ★★ or ★★★ for its points, which depend only on the order of moves; see [Puzzle stars](docs/puzzle-stars.md). Puzzle hints come in layers: an idea, then a highlighted area, then the move itself. Off the known solution, the hint searches for another way through or says when the board can no longer be cleared.

Each week brings one **weekly challenge** for everyone: the same mode, level, board, objective and rules from Monday 00:00 UTC to the next, with boosts off so results compare fairly. The card under The journey opens **Challenges**, where you can play the weekly, paste a friend's code or link, make your own challenge, and see your results. A code such as `CR1-CLE3-G12-B-799A0678-4V` or a `#challenge=` link rebuilds the exact same game on any device; malformed or newer codes are rejected with a plain reason. Each exact challenge keeps its own best in this browser, apart from regular records, and **Copy your result** puts a summary with the code on the clipboard for comparing. See [Challenges](docs/challenges.md) for the format, the rotation and how its targets were measured.

Two stars on a Classic level (at a given difficulty), a puzzle, or a Journey stage open its **gold-star hard mode**. Choose at least one challenge first: Quicker rows, Taller start, No boosts or No hints, and for puzzles No undo or a move limit. Meeting the objective earns a gold ★; gold ★★ and ★★★ need the displayed gold points, which are round points plus 5% for two challenges or 10% for three or more. The ordinary score never changes, regular stars come only from ordinary runs, and the best gold result is saved with the challenges that earned it. Gold targets are provisional, and the picker warns about challenge mixes our test player never finished.

Keyboard controls: arrow keys select a block, `Enter` clears it, `Space` adds a row, `P` pauses, `H` shows a hint, and `U` undoes a puzzle move.

On a phone, the game opens on a home screen with the journey, the weekly challenge, every mode and a **Play** button. Playing fills the screen: a bar on top shows pause, progress, score and **Goals**, which opens the side panel's goals, stars and score breakdown as a sheet (pausing a running game until it closes). Hint, puzzle undo, boosts and **Add a row** sit under your thumb, and the pause card holds Restart, Sound, How to play and Home. Pressing a block shows its group; lifting clears the group under your finger, and sliding off the board cancels.

Tablets get the same two screens, larger. Held upright, one bar above the board holds pause, progress, score, **Goals**, **Hint** and **Add a row**, so the board fills the width. Held sideways, the board fills the height, with pause, score and Goals to its left and boosts, Hint and Add a row to its right. The round's result covers the screen. A tablet is a touch screen at least 560px tall, so a phone held sideways keeps the computer layout.

See [FEATURES.md](FEATURES.md) for mode rules, source references, and the parts that still need fidelity testing.

## Code layout

| File | Responsibility |
| --- | --- |
| `dist/engine.js` | Game state, seeded randomness, board rules, scoring, and mode transitions. |
| `dist/app.js` | Browser input, rendering, animation, sound, and persistence. |
| `dist/puzzles.js` | Original puzzle boards and sets, known solutions, and each puzzle's best and worst points. |
| `dist/puzzle-stars.js` | Puzzle star and gold targets from those points, and the move-limit wording. |
| `dist/puzzle-progress.js` | Saved best stars and best gold for each puzzle. |
| `dist/puzzle-hints.js` | Layered puzzle hints: the idea behind a move, the area to look at, and a bounded search off the known solution. |
| `dist/celebrations.js` | Which cheer a clear earns: big and huge clears, sweeps, close calls, and passing a personal best, with their priority and pacing. |
| `dist/challenges.js` | Challenge definitions as versioned data: validation, codes and links, the weekly rotation, judging a round, the copied result, and saved records. |
| `dist/challenge-panel.js` | The Challenges dialog: this week, enter a code, make your own, and your results. |
| `dist/journey.js` | Original campaign stages, progression, coins, inventory, shop, arcade, and saved journey state. |
| `dist/objectives.js` | Round objectives as plain data, their descriptions, and progress read from engine state. |
| `dist/modifiers.js` | Hard-mode modifiers, the modes each applies to, combination checks, and the gold-star bonus. |
| `dist/gold.js` | Gold-star rules: the unlock, gold points, gold stars, and which record is better. |
| `dist/gold-picker.js` | The hard-mode briefing and modifier choice, shared by Classic, puzzles, and the Journey. |
| `tools/reference-player.js` | A heuristic reference player, a Strategy planner, and an exhaustive puzzle solver for calibrating star targets. |
| `tools/calibrate-journey.js` | Reproduces the Journey objectives, star targets, and provisional gold targets (`npm run calibrate:journey`). |
| `tools/calibrate-puzzles.js` | Solves every puzzle for its best and worst points and can store them (`npm run calibrate:puzzles -- --write`). |
| `tools/calibrate-cheers.js` | Measures how often each cheer appears in simulated play (`npm run calibrate:cheers`). |
| `tools/calibrate-challenges.js` | Measures how often simulated players complete each weekly template and proposes targets (`npm run calibrate:challenges`). |
| `dist/journey.css` | Journey, shop, and arcade presentation. |
| `dist/puzzle.css` | Puzzle lesson text and the highlighted hint area. |
| `dist/celebrations.css` | Cheer words, confetti, and the personal-best ribbon. |
| `dist/challenges.css` | The weekly card, the Challenges dialog, and the challenge panel beside the board. |
| `dist/index.html` | Browser entry point. |
| `dist/manifest.webmanifest` | Home-screen name, icons, and full-screen launch. |
| `dist/sw.js` | The offline copy: every published file plus the fonts, replaced on each release. |
| `dist/phone.css` | The phone and tablet screens: home, the full-screen game, the Goals sheet and the pause card's tools. |
| `dist/tablet.css` | Tablet sizes for those screens, and the sideways layout with controls beside the board. |
| `test/` | Engine tests using Node's built-in runner. |

The engine is pure JavaScript with mutable state and deterministic seeded randomness. It does not depend on the DOM or browser timers: the interface supplies player actions and elapsed time. Keep rules in the engine and presentation in the interface so the same behavior can later be implemented and checked in Swift.

## Playtesting

Use **Leave a playtest note** to save feedback with the current mode, difficulty, level, score, seed, and row count. **Export notes** downloads a JSON file; notes are not sent automatically. Record what felt wrong: row speed, match readability, input response, bomb behavior, score rewards, or level transitions. Compare the reference and prototype under the same conditions before changing a rule. Preserve deterministic examples of bugs as engine tests.

This is a gameplay prototype, not a complete reproduction of the seven-game Super Pack. Its presentation, puzzles, journey, and economy are original adaptations. The original III campaign layouts, full puzzle collection, trophies, and multiple casino mini-games remain outside this version.
