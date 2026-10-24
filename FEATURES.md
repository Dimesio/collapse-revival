# Gameplay and reference fidelity

The goal is to preserve the familiar block-clearing feel while making rules easy to test and adjust before a Swift port. This prototype combines the core mode families across the Collapse series. It does not claim exact parity with every game in the linked pack.

## Playable modes

| Mode | Rule |
| --- | --- |
| Classic | Survive a finite supply of rising rows. New rows arrive over time, and the pace increases. |
| Strategy | Think without a timer. Successful removals advance the row supply. |
| Relapse | Clear stacks entering from both top and bottom before they meet. Each stack settles toward its own edge. |
| Puzzle | Clear a fixed board completely, with no incoming rows or time pressure. Includes 20 original puzzles. |
| Slider | The stack wraps one column sideways with each incoming row; direction changes every four rows. |
| Continuous | Survive rising rows without level breaks. |
| Countdown | Earn the highest score possible before a two-minute timer expires. |

Finite levels end with 15 seconds of cleanup on the remaining board. Difficulty and starting level controls allow repeatable comparisons without replaying the earliest levels.

## Shared mechanics

- A 12-column by 15-row playfield and groups of at least three matching blocks.
- Click or touch input, gravity after removals, and centerward compaction of empty columns.
- A visible incoming row and progress toward the next row or level.
- Area bombs clear a 3×3 area and can chain other specials; color bombs clear their color across the board.
- Stone and anchor blocks cannot join matching groups. Anchors hold their row during normal gravity and split a column's fall into segments.
- A Relapse gravity token clears its row and changes the next incoming side. The upper and lower stacks settle toward their respective edges.
- Larger-group rewards, timed combo multipliers, level transitions, and timed bonus play.
- Pause, sound controls, hints, puzzle undo, and best scores stored locally in the browser.

## Original journey and economy

The journey adds 25 original stages across five worlds with linear unlocks and coin rewards. First clears earn 25–65 coins; completed-stage replays earn eight coins. Stage seeds are fixed for repeatable attempts. Progress and inventory persist in the browser. The shop offers three boosts, implemented by the DOM-free engine's `usePowerup` command:

| Boost | Cost | Prototype behavior |
| --- | --- | --- |
| Pocket Blast | 12 coins | Triggers an area bomb around the engine's best available hint. |
| Color Sweep | 18 coins | Clears the most common visible color. |
| A Little Breather | 10 coins | Stops automatic feeder progress for 10 seconds during timed play. The Countdown clock keeps running. |

The arcade contains a three-reel game with a five-coin bet. It uses game coins only, with no payment or real-money value. Journey stages, unlock rules, rewards, prices, and arcade odds are original prototype choices, not recovered III values.

The journey interface and progression live in `dist/journey.js`, with styling in `dist/journey.css`; `dist/app.js` connects it to playable game sessions. Scores, sound/preferences, journey progress, inventory, and playtest notes stay in local browser storage. Notes can be exported as JSON with seed, row count, and game settings for reproduction.

## What the references confirm

[GameHouse's original Super Collapse! listing](https://www.gamehouse.com/games/super-collapse) confirms groups of three or more, falling blocks, accelerating rows from below, larger-group rewards, three difficulty settings, color bombs, black area bombs, and Clear-the-Board bonus rounds.

The [original Super Collapse! II instruction booklet](https://www.videogamemanual.com/gba/Super%20Collapse%21%20II%20%28USA%29.pdf) confirms the 12×15 grid, feeder preview/timer, four core modes, and starting block height/color count varying by level and difficulty. Its **Lines** counter means rows remaining to appear: level progress is based on surviving the row supply, rather than clearing complete horizontal lines.

The [II publisher announcement, reproduced by Inside Mac Games](https://www.insidemacgames.com/historical/news/story.php%3FArticleID%3D9439.html), describes Traditional, Puzzle, Relapse, and Strategy, with untimed Puzzle/Strategy play, separate mode scores, and starting-level selection.

[GameHouse's III listing](https://www.gamehouse.com/games/super-collapse-3) confirms Quest and Quick Play, seven challenge types, a shop, casino, and authored puzzles. The [original RealNetworks announcement](https://realnetworks.com/press/releases/2007/realnetworks-takes-award-winning-casual-game-beyond-desktop) names Classic, Relapse, Strategy, Puzzle, Slider, Continuous, and Countdown. Platform editions differ, so those listings do not establish every PC rule or level value.

## Approximations to playtest

Exact original scoring formulas, speed curves, level tables, initial layouts, bomb radii/spawn rates, bonus scheduling, and animation timing have not been recovered from original code or a complete manual. The prototype supplies its own tunable values. Its 20 puzzles are new content, not the original puzzle collection.

The anchor block and Relapse gravity token are prototype adaptations, not verified original features. Slider uses a simplified column-wrap rule. Bonus play is a cleanup phase at the end of finite levels rather than a recreation of the original separate full-board bonus stages. Difficulty currently selects three, four, or five colors; the original color progression still needs comparison.

Centerward column movement, bomb bridging, stone behavior, and the fine details of Slider and Relapse need direct comparison with the remembered edition. Treat the current implementation as a testable interpretation until that comparison is complete.

The next fidelity pass should compare starting boards, legal groups, gravity/column movement, feeder timing, manual row advance, special blocks, top-out, end-of-level cleanup, and bonus transitions. Record edition, mode, level, difficulty, and expected behavior for each discrepancy.

## Pack identity and remaining scope

The user's [Archive.org link](https://archive.org/details/super-collapse-super-pack-ab) names Super Collapse Super Pack. Its page and metadata were inaccessible during research. [Distributor descriptions](https://www.iplay.com/en/games/super-collapse-super-pack/) list seven games: Collapse!, Super Collapse! 3, and Puzzle Gallery 1–5. This identifies the likely bundle, but does not verify the exact archived installer or which edition the family played.

The journey recreates the idea of progressing through stages, earning coins, and buying boosts, but its five worlds and 25 stages are new content. It does not reproduce the original III campaign, world map, exact economy, trophy collection, hundreds of puzzle layouts, or full set of casino mini-games. Original copyrighted art, audio, and puzzle layouts are not copied. These differences must remain visible when discussing progress toward full-pack fidelity.
