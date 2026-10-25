# Gameplay and reference fidelity

The goal is to preserve the familiar block-clearing feel while making rules easy to test and adjust before a Swift port. This prototype combines the core mode families across the Collapse series. It does not claim exact parity with every game in the linked pack.

## Playable modes

| Mode | Rule |
| --- | --- |
| Classic | Survive a finite supply of rising rows. New rows arrive over time, and the pace increases. |
| Strategy | Think without a timer. Successful removals advance the row supply. |
| Relapse | Clear stacks entering from both top and bottom before they meet. Each stack settles toward its own edge and closes its empty columns inward independently of the opposite stack. |
| Puzzle | Clear a fixed board completely, with no incoming rows or time pressure. Includes 20 original puzzles. |
| Slider | The stack wraps one column sideways with each incoming row; direction changes every four rows. |
| Continuous | Survive rising rows without level breaks. |
| Countdown | Earn the highest score possible before a two-minute timer expires. |

Finite levels end with a 15-second double-points bonus round. Incoming rows keep arriving during the bonus, including in Strategy, and the feeder preview and progress bar show the next row. Rows can also be added manually. Difficulty and starting level controls allow repeatable comparisons without replaying the earliest levels.

The final ten seconds of Countdown mode and every timed bonus round show a large, translucent `10 → … → 3 → 2 → 1` in the center of the board. During those ten seconds, one incoming row arrives every two seconds, while the countdown continues in real seconds. The hint does not block input and hides on pause or completion. A freeze boost still stops automatic feeding, with the round clock continuing to run. Untimed and endless play keep their existing rules.

## Shared mechanics

- A 12-column by 15-row playfield and groups of at least three matching blocks.
- Click or touch input, gravity after removals, and centerward compaction of empty columns.
- A visible incoming row and progress toward the next row or level.
- Black area bombs clear a 5×5 area centered on the bomb; colored bombs clear ordinary blocks of their color across the board. Each color has its own colored-ring bomb, visible in the feeder preview as well as on the board.
- Specials activate only when tapped directly. Removing an ordinary group also removes bombs and gravity blocks touching that group up, down, left, or right, without triggering them. This is one-step adjacency: consumed specials do not pass the removal on to another special. Specials caught in a bomb's effect also disappear without activating.
- Stone and anchor blocks cannot join matching groups or be removed by touching ordinary clears; a bomb can remove them. Anchors hold their row during normal gravity and split a column's fall into segments.
- A Relapse gravity block moves every remaining block on its own side into the opposite stack. Blocks keep their columns and vertical order, then settle at the destination edge alongside the existing stack. It does not clear a row or change the scheduled feeder side.
- Natural bomb odds per generated block are 0.4% black and 0.4% colored, with the colored bomb's color selected from the active palette. Relapse adds 0.2% gravity blocks: total active-special odds are 0.8% normally or 1% in Relapse. Stone odds are 0.2% from level 3 and anchor odds are 0.15% from level 5. These rare rates are tunable playtest values, not recovered original odds.
- Larger-group rewards, timed combo multipliers, level transitions, and timed bonus play.
- Pause, sound controls, hints, puzzle undo, and best scores stored locally in the browser.

## Scoring and clear feedback

Every mode rewards larger clears using the existing curved point values, now shown as a base score and a group-size multiplier. For a clear of at least three blocks, the base is 20 points per removed block and the size multiplier is `(blocks + 1) / 4`. Special clears removing one or two blocks keep their previous 10- or 30-point award at ×1 size. A quick follow-up clear within 2.5 seconds adds 15% to the streak multiplier, up to ×1.6; timed bonus rounds add ×2. These factors are applied before the whole-board or Relapse-side reward.

| Clear | Base | Size multiplier | Points before other multipliers |
| --- | --- | --- | --- |
| 3 blocks | 60 | ×1 | 60 |
| 6 blocks | 120 | ×1.75 | 210 |
| 10 blocks | 200 | ×2.75 | 550 |

Emptying the whole board adds a ×2 clear multiplier in modes other than Relapse. In Relapse, emptying either the top or bottom side adds ×2; emptying both with the same action adds ×3. The reward applies to that move's points, including its size, streak, and bonus-round factors. Already-empty sides and gravity transfers do not earn a clear reward, and an action must actually remove blocks. Strategy checks the reward before its next row enters.

The score breakdown remains visible after each clear, with the points gained and the extra points earned by a board or side clear. A brief celebration also appears over the board. Hovering or using the keyboard to select a clear shows its score preview; groups of six or more rock gently, and groups of ten or more have stronger motion. Reduced-motion preferences keep the static highlight without rocking. The score rules and feedback thresholds are tunable playtest choices; they are not a verified reconstruction of the original scoring formula.

## Original journey and economy

The journey adds 25 original stages across five worlds with linear unlocks and coin rewards. First clears earn 25–65 coins; completed-stage replays earn eight coins. Stage seeds are fixed for repeatable attempts. Progress and inventory persist in the browser. The shop offers three boosts, implemented by the DOM-free engine's `usePowerup` command:

| Boost | Cost | Prototype behavior |
| --- | --- | --- |
| Pocket Blast | 12 coins | Triggers an area bomb around the engine's best available hint. |
| Color Sweep | 18 coins | Clears the most common visible color. |
| A Little Breather | 10 coins | Stops automatic feeder progress for 10 seconds during timed play, including bonus rounds. Round clocks keep running. |

The arcade contains a three-reel game with a five-coin bet. It uses game coins only, with no payment or real-money value. Journey stages, unlock rules, rewards, prices, and arcade odds are original prototype choices, not recovered III values.

The journey interface and progression live in `dist/journey.js`, with styling in `dist/journey.css`; `dist/app.js` connects it to playable game sessions. Scores, sound/preferences, journey progress, inventory, and playtest notes stay in local browser storage. Notes can be exported as JSON with seed, row count, and game settings for reproduction.

## What the references confirm

[GameHouse's original Super Collapse! listing](https://www.gamehouse.com/games/super-collapse) confirms groups of three or more, falling blocks, accelerating rows from below, larger-group rewards, three difficulty settings, color bombs, black area bombs, and Clear-the-Board bonus rounds.

The [original Super Collapse! II instruction booklet](https://www.videogamemanual.com/gba/Super%20Collapse%21%20II%20%28USA%29.pdf) confirms the 12×15 grid, feeder preview/timer, four core modes, and starting block height/color count varying by level and difficulty. Its **Lines** counter means rows remaining to appear: level progress is based on surviving the row supply, rather than clearing complete horizontal lines.

The [II publisher announcement, reproduced by Inside Mac Games](https://www.insidemacgames.com/historical/news/story.php%3FArticleID%3D9439.html), describes Traditional, Puzzle, Relapse, and Strategy, with untimed Puzzle/Strategy play, separate mode scores, and starting-level selection.

[GameHouse's III listing](https://www.gamehouse.com/games/super-collapse-3) confirms Quest and Quick Play, seven challenge types, a shop, casino, and authored puzzles. The [original RealNetworks announcement](https://realnetworks.com/press/releases/2007/realnetworks-takes-award-winning-casual-game-beyond-desktop) names Classic, Relapse, Strategy, Puzzle, Slider, Continuous, and Countdown. Platform editions differ, so those listings do not establish every PC rule or level value.

## Approximations to playtest

Exact original scoring formulas, speed curves, level tables, initial layouts, bomb radii/spawn rates, bonus scheduling, and animation timing have not been recovered from original code or a complete manual. The prototype supplies its own tunable values. Its 20 puzzles are new content, not the original puzzle collection.

The gravity block's side transfer and quiet removal of touching specials follow the family's playtest recollection. Exact transfer ordering, blast size, and special rates still need comparison with the remembered edition. The anchor block remains a prototype adaptation. Slider uses a simplified column-wrap rule. Bonus play continues on the current board with incoming rows and double points at the end of finite levels rather than recreating the original separate full-board bonus stages. The final-ten-second pace of one row every two seconds is a family playtest adjustment. Difficulty currently selects three, four, or five colors; the original color progression still needs comparison.

Centerward column movement, stone behavior, and the fine details of Slider and Relapse need direct comparison with the remembered edition. Specials do not bridge otherwise separate ordinary groups. Treat the current implementation as a testable interpretation until that comparison is complete.

The next fidelity pass should compare starting boards, legal groups, gravity/column movement, feeder timing, manual row advance, special blocks, top-out, and bonus transitions. Record edition, mode, level, difficulty, and expected behavior for each discrepancy.

## Pack identity and remaining scope

The user's [Archive.org link](https://archive.org/details/super-collapse-super-pack-ab) names Super Collapse Super Pack. Its page and metadata were inaccessible during research. [Distributor descriptions](https://www.iplay.com/en/games/super-collapse-super-pack/) list seven games: Collapse!, Super Collapse! 3, and Puzzle Gallery 1–5. This identifies the likely bundle, but does not verify the exact archived installer or which edition the family played.

The journey recreates the idea of progressing through stages, earning coins, and buying boosts, but its five worlds and 25 stages are new content. It does not reproduce the original III campaign, world map, exact economy, trophy collection, hundreds of puzzle layouts, or full set of casino mini-games. Original copyrighted art, audio, and puzzle layouts are not copied. These differences must remain visible when discussing progress toward full-pack fidelity.
