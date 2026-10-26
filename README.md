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

## Play

Choose a mode, difficulty, and starting level, then start a game. Click or tap connected groups of at least three matching blocks. Bigger groups earn more points. Blocks settle after each removal; keep rising stacks away from the danger edge.

Score previews and the last-clear breakdown show the group-size, quick-clear streak, and timed-bonus multipliers. Clearing the whole board doubles that move's points in every mode other than Relapse; in Relapse, clearing one side doubles them and clearing both sides at once triples them. Large groups rock and glow when selected, releasing a small halo-and-spark burst when cleared. These scoring rules are tunable playtest values.

Blocks near the danger edge shake in four steps: three, two, and one empty rows away, then strongest at contact. In Relapse, each column uses its actual gap between opposing stacks. Reduced-motion preferences replace shaking with static highlights and suppress the glow burst.

Each finished round has an animated score tally. Earned points count up, then every block still on the board deducts 20 points, capped at that round's earnings. The final breakdown separates base points, group and streak bonuses, bonus-round ×2 points, and all-clear ×2/×3 rewards; it also shows the biggest clear and total blocks cleared. Earlier levels' banked points stay safe. Skip the count to see the result immediately; reduced-motion settings show it without animation. Personal bests save the final score after deductions.

Classic awards one star for completing a level and two or three for meeting its displayed net-score targets. It adds ×1 / ×2.10 / ×3.55 for Easy / Normal / Hard, plus 5% per level up to ×2; remaining blocks still cost 20 each afterward. Its bonus always lasts 15 seconds with a fixed row budget; Add row brings that supply forward. Best stars are saved by level and difficulty. Provisional goals are labeled “Playtest targets.” Records includes local results and an export for tuning; the last 500 finished attempts stay in this browser. See [Classic scoring](docs/classic-star-scoring.md) for the approved calibration and limits.

The prototype offers Classic, Strategy, Relapse, Puzzle, Slider, Continuous, and Countdown modes, plus 15-second double-points bonus rounds with continuing incoming rows. During the final ten seconds of Countdown and each bonus round, one row arrives every two seconds and a translucent countdown appears over the board; the round clock still runs in real seconds. Freeze boosts stop the feeder while the clock keeps running. Puzzle mode includes 20 original boards. Rare black bombs clear a 5×5 area, and colored-ring bombs clear their color across the board. Tap a bomb or gravity block to activate it. Clearing touching ordinary cubes removes black bombs and gravity blocks quietly; color bombs are removed this way only when the cleared cubes match their color. Relapse gravity blocks move their entire side's stack to the opposite side. Stone blocks add obstacles. The interface includes pause, sound controls, hints, puzzle undo, and local best scores.

Open **The journey** for 25 original stages across five worlds. Completing stages unlocks the next stop and earns game coins; revisiting completed stages earns eight coins. Spend coins on blast, color, or freeze boosts in the shop, or play the arcade's three reels for a five-coin bet. Coins have no real-money value. Journey progress, inventory, preferences, scores, and playtest notes are saved in this browser.

Keyboard controls: arrow keys select a block, `Enter` clears it, `Space` adds a row, `P` pauses, `H` shows a hint, and `U` undoes a puzzle move.

See [FEATURES.md](FEATURES.md) for mode rules, source references, and the parts that still need fidelity testing.

## Code layout

| File | Responsibility |
| --- | --- |
| `dist/engine.js` | Game state, seeded randomness, board rules, scoring, and mode transitions. |
| `dist/app.js` | Browser input, rendering, animation, sound, and persistence. |
| `dist/puzzles.js` | Original puzzle boards and known solutions. |
| `dist/journey.js` | Original campaign stages, progression, coins, inventory, shop, arcade, and saved journey state. |
| `dist/journey.css` | Journey, shop, and arcade presentation. |
| `dist/index.html` | Browser entry point. |
| `test/` | Engine tests using Node's built-in runner. |

The engine is pure JavaScript with mutable state and deterministic seeded randomness. It does not depend on the DOM or browser timers: the interface supplies player actions and elapsed time. Keep rules in the engine and presentation in the interface so the same behavior can later be implemented and checked in Swift.

## Playtesting

Use **Leave a playtest note** to save feedback with the current mode, difficulty, level, score, seed, and row count. **Export notes** downloads a JSON file; notes are not sent automatically. Record what felt wrong: row speed, match readability, input response, bomb behavior, score rewards, or level transitions. Compare the reference and prototype under the same conditions before changing a rule. Preserve deterministic examples of bugs as engine tests.

This is a gameplay prototype, not a complete reproduction of the seven-game Super Pack. Its presentation, puzzles, journey, and economy are original adaptations. The original III campaign layouts, full puzzle collection, trophies, and multiple casino mini-games remain outside this version.
