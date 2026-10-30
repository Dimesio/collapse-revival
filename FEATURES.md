# Gameplay and reference fidelity

The goal is to preserve the familiar block-clearing feel while making rules easy to test and adjust before a Swift port. This prototype combines the core mode families across the Collapse series. It does not claim exact parity with every game in the linked pack.

## Playable modes

| Mode | Rule |
| --- | --- |
| Classic | Survive a finite supply of rising rows. New rows arrive over time, and the pace increases. A game always begins at level 1, so losing starts over. |
| Strategy | Think without a timer. Successful removals advance the row supply. |
| Relapse | Clear stacks entering from both top and bottom before they meet. Each stack settles toward its own edge and closes its empty columns inward independently of the opposite stack. A game always begins at level 1, so losing starts over. |
| Puzzle | Clear a fixed board completely, with no incoming rows or time pressure. Includes 26 original puzzles in two sets. |
| Slider | The stack wraps one column sideways with each incoming row; direction changes every four rows. |
| Continuous | Survive rising rows without level breaks. |
| Countdown | Earn the highest score possible before a two-minute timer expires. |

Finite levels end with a 15-second double-points bonus round. Incoming rows keep arriving during the bonus, including in Strategy, and the feeder preview and progress bar show the next row. Rows can also be added manually. Difficulty and starting level controls allow repeatable comparisons without replaying the earliest levels.

The final ten seconds of Countdown mode and every timed bonus round show a large, translucent `10 → … → 3 → 2 → 1` in the center of the board. During those ten seconds, one incoming row arrives every two seconds, while the countdown continues in real seconds. A quiet clock tick gradually accelerates from about once per second toward twice per second. Ticks follow the sound toggle and stop on pause or completion. The hint does not block input and hides on pause or completion. A freeze boost still stops automatic feeding, with the round clock and ticks continuing to run. Untimed and endless play keep their existing rules.

## Shared mechanics

- A 12-column by 15-row playfield and groups of at least three matching blocks.
- Click or touch input, gravity after removals, and centerward compaction of empty columns.
- A visible incoming row and progress toward the next row or level.
- During active rising-stack play, individual blocks shake at four danger levels: gaps of three, two, one, and zero rows to the top. Relapse uses each column's actual opposing-stack gap, falling back to the advancing board edge when that column has no opposite stack. Motion strengthens as the gap closes; contact is stronger than large-clear selection rocking. Warnings stop on pause or completion, and untimed Puzzle boards do not get danger motion. Reduced-motion preferences use static outlines.
- Black area bombs clear a 5×5 area centered on the bomb; colored bombs clear ordinary blocks of their color across the board. Each color has its own colored-ring bomb, visible in the feeder preview as well as on the board.
- Specials activate only when tapped directly. Removing ordinary cubes also quietly removes black bombs and gravity blocks touching those cubes up, down, left, or right. A touching color bomb is removed this way only when its color matches the removed cubes. This is one-step adjacency: consumed specials do not pass the removal on to another special. Specials caught directly in a black bomb's blast also disappear without activating.
- Stone blocks cannot join matching groups or be removed by touching ordinary clears; a black blast bomb can remove them. Stones fall into gaps with the stack. Row-pinned anchor blocks (`⊥`) are disabled in generated boards and incoming rows because they could force a loss while waiting for a rare blast bomb.
- A Relapse gravity block moves every remaining block on its own side into the opposite stack. Blocks keep their columns and vertical order, then settle at the destination edge alongside the existing stack. It does not clear a row or change the scheduled feeder side.
- Natural bomb odds per generated block are 0.4% black and 0.4% colored, with the colored bomb's color selected from the active palette. Relapse adds 0.2% gravity blocks: total active-special odds are 0.8% normally or 1% in Relapse. Stone odds are 0.2% from level 3; anchors do not spawn. These rare rates are tunable playtest values, not recovered original odds.
- Larger-group rewards, timed combo multipliers, level transitions, and timed bonus play.
- Pause, sound controls, hints, puzzle undo, and best scores stored locally in the browser.

## Scoring and clear feedback

Every mode rewards larger clears using the existing curved point values, now shown as a base score and a group-size multiplier. For a clear of at least three blocks, the base is 20 points per removed block and the size multiplier is `(blocks + 1) / 4`. Special clears removing one or two blocks keep their previous 10- or 30-point award at ×1 size. A quick follow-up clear within 2.5 seconds adds 15% to the streak multiplier, up to ×1.6 at five clears; the cabinet keeps counting a longer chain, and the round's best streak records its full length for streak objectives. Timed bonus rounds add ×2. These factors are applied before the whole-board or Relapse-side reward.

| Clear | Base | Size multiplier | Points before other multipliers |
| --- | --- | --- | --- |
| 3 blocks | 60 | ×1 | 60 |
| 6 blocks | 120 | ×1.75 | 210 |
| 10 blocks | 200 | ×2.75 | 550 |

Emptying the whole board adds a ×2 clear multiplier in modes other than Relapse. In Relapse, emptying either the top or bottom side adds ×2; emptying both with the same action adds ×3. The reward applies to that move's points, including its size, streak, and bonus-round factors. Already-empty sides and gravity transfers do not earn a clear reward, and an action must actually remove blocks. Strategy checks the reward before its next row enters.

The score breakdown remains visible after each clear, with the points gained and the extra points earned by a board or side clear. A brief celebration also appears over the board. Hovering or using the keyboard to select a clear shows its score preview; groups of six or more rock and glow, and groups of ten or more have stronger motion and glow. Clearing a glowing ordinary group releases a small outward halo-and-spark burst, sampled across at most ten tiles and removed within half a second. Danger shaking takes priority when a selected group is also near its limit. Reduced-motion preferences keep static highlights without rocking or bursts. The score rules and feedback thresholds are tunable playtest choices; they are not a verified reconstruction of the original scoring formula.

Every round ending (completion, timed finish, or game over) shows an animated tally: earned points count up, surviving blocks pulse as their penalty counts off, and the full breakdown appears. Each remaining board block costs 20 points, including specials and obstacles; the pending feeder is excluded. Deductions stop at zero for that round, preserving banked points from earlier levels. An additive ledger shows base points and extra points from group size, streaks, bonus-round ×2, and all-clear ×2/×3 rewards. It includes counts of each all-clear multiplier, bonus clears, the highest single clear, total blocks cleared, net round points, and accumulated score. The bonus rows explain points already earned and do not apply multipliers a second time.

Round statistics reset between levels. Settlement happens once, leaves the board intact, and is included in puzzle undo snapshots. Personal bests save settled scores rather than provisional scores during play. Journey completion checks its existing goals before settling its score. The tally can be skipped, follows the sound toggle, and immediately shows the complete result for reduced-motion preferences.

## Celebrations

Big moments earn a short cheer above the clear's points: big clears of 10 or more blocks and huge clears of 16 or more (20 and 30 in Strategy), clean sweeps of the board or a Relapse side, recoveries from a close call, and passing the personal best the run started with. A close call begins when a block reaches the top two rows, or two rows from the other stack in Relapse, and ends with four clear rows again. When events coincide, one cheer shows: sweep, then personal best, close call, huge clear, big clear. Big and huge clears stay quiet for four clears or six seconds after a cheer unless they outrank it, and phrases rotate so none repeats before the rest are heard. Puzzles have no cheers in play, because a puzzle's biggest group can be its trap; neither does a clear that ends a round. The first settled round of a run that beats the previous best shows a “New personal best!” ribbon on its tally, with a fanfare and confetti. Sounds follow the sound toggle; reduced motion keeps the words still and skips confetti. Thresholds come from simulated play (`tools/calibrate-cheers.js`, `docs/celebrations.md`) and are playtest values.

## Weekly and shared challenges

A challenge is a versioned, interface-free definition: mode, difficulty, level or puzzle, seed, objective and modifiers. The same definition always builds the same board and incoming rows. A short code (`CR1-CLE3-G12-B-799A0678-4V`) or a `#challenge=` link carries it, with a two-character typo check. Unsupported formats and invalid settings are rejected with a plain reason. A weekly challenge rotates every Monday 00:00 UTC through eight templates, one per mode plus a second Classic, and seeds each week from its ISO label. Every weekly turns boosts off so results compare fairly. Players can also make and share their own. A challenge plays like a Journey stage, ending once its objective is decided, and its results are saved per exact code, apart from regular scores and stars. **Copy your result** gives a plain summary with the code. Weekly targets were set so about 40% of simulated runs meet them (`tools/calibrate-challenges.js`, `docs/challenges.md`) and are playtest values. There are no accounts, online leaderboards or multiplayer yet; the definitions are meant to seed those later.

## Classic stars and progression

Classic applies difficulty ×1 / ×2.10 / ×3.55 and level `min(2, 1 + 0.05 × (level − 1))` to aggregate earned clear points, rounding once; its per-move credit is the difference between successive aggregate totals. The tally attributes the extra difficulty and level points separately. Only then does each remaining board block deduct 20 points, with a zero floor for that level.

Completion earns one star; meeting the two-/three-star target earns two/three. Failed attempts earn zero even when their score exceeds a target. Three-star targets are 90% of reference expert training medians; two-star targets are 65% of the three-star threshold, rounded upward to 50 points. Unvalidated settings use the approved provisional difficulty-reward targets and are visibly labeled. Levels above 30 extrapolate from the calibrated block budget. These are playtest targets, not verified human skill boundaries.

Classic bonus rounds run for all 15 seconds, including after an all-clear. Their row budget is `ceil(5000 / rowInterval + 5) − 1`; a row arriving exactly at expiry is excluded. Manual feeding consumes that same budget, and automatic feeding stops when it is exhausted. Freeze still pauses the feeder while the clock continues. Other modes retain their existing bonus behavior.

Best stars and net scores are stored separately by level and difficulty; lower results and later threshold revisions do not remove earned stars. Completing the level still advances normally, and boosts do not disqualify stars. The last 500 finished Classic attempts store seed, scoring version, score, leftovers, moves, bonus supply, and boost use locally. Records offers JSON export; nothing is transmitted automatically. Calibration used 5,400 reference runs with a two-interactions-per-second benchmark, which is not an input restriction in the game. Full provenance and limitations are in `docs/classic-star-scoring.md`.

## Gold-star hard mode

Two regular stars on a Classic level and difficulty, or on a Journey stage, open its hard mode. The picker shows the objective, the gold targets, and the best gold result, and requires at least one modifier. Classic levels open it from the star panel beside the board; Journey stages from a **Go for gold** button in the stage list.

| Modifier | Modes | Enforcement |
| --- | --- | --- |
| Quicker rows | Feeder modes | Every row interval, including the bonus supply, is 20% shorter. |
| Taller start | Every mode except Puzzle | Two extra starting rows, or one more on each side in Relapse. |
| No boosts | All | The engine refuses shop boosts. |
| No hints | All | The hint button and `H` are off. |
| No undo | Puzzle | Moves are not kept for undo, and the tally offers no undo. |
| Move limit | Puzzle | The board must be cleared within the stored solution's move count. Every puzzle's best-scoring line fits its limit, so neither the objective nor the best score is lost. |

A gold ★ needs the objective and the mode's finish, as in an ordinary run. Gold ★★ and ★★★ judge gold points: settled round points plus 5% for two modifiers or 10% for three or more. The bonus never changes the score, high scores, or regular stars, and regular stars are earned only in ordinary runs. A finished gold run pays the replay reward on Journey stages. Each level's best gold stars, gold points, and modifiers are saved as one record that only a better result replaces: more gold stars, then more gold points. Classic gold runs also join the local playtest log with their modifiers and gold result.

Gold targets are provisional. Timed stages measure the reference player with each mix of the modifiers that change play; puzzle targets assume the best line with the three challenges that cost a perfect solver nothing. On four stages the reference player never finished some mixes, and the picker warns about them instead of hiding them. A Classic or puzzle gold run covers one level or puzzle: its result offers another try, a new choice of challenges, or a return to regular play.

## Puzzle sets, stars, and hints

Puzzles come in two sets: the original 20-puzzle collection and the harbor, six lessons in order. Low Tide teaches joining separated colors, Sails Down letting blocks fall into line, Drawbridge sliding columns together, and Siren Song resisting a big group that strands the rest. Lighthouse combines falling and sliding, and Harbor Lights uses every idea, with traps on four of its five opening moves. Each harbor puzzle shows its lesson before play. Its stored solution is a best-scoring line, and its layout starts settled and centered so the first move never shifts the board.

Every free-play puzzle earns ★ for clearing the board. Points depend only on the order of moves, so ★★ and ★★★ use targets from the best and worst lines an exhaustive solver finds (`tools/calibrate-puzzles.js`); see `docs/puzzle-stars.md`. Two stars open the puzzle's gold hard mode. Records are saved per puzzle name, apart from Journey stages that use the same boards.

Hints come in three layers for the same position: an idea, a highlighted area that dims the rest of the board, and finally the suggested move. The idea names what the move does: holding back from a tempting dead end, emptying a column so the sides slide together, stacking separated blocks onto each other, dropping blocks level with their neighbors, or simply letting blocks fall. On the stored solution the hint follows it. Off it, a bounded search finds another line or proves there is none, in which case the hint suggests undo. If the search runs out of budget on a large board, the hint says so and points at the biggest group. The No hints challenge turns off every layer.

## Original journey and economy

The journey adds 25 original stages across five worlds with linear unlocks and coin rewards. First clears earn 25–65 coins; completed-stage replays earn eight coins. Stage seeds are fixed for repeatable attempts. Each stage has a mode-appropriate objective (a group size, blocks cleared, a points goal, or few blocks left at the end) that must be met along with the mode's usual finish; Continuous stages end when their objective is met. Objective values are set from a population of simulated play styles so that about half of their runs meet a World 1 objective, falling to under a third by World 5. Completing the objective earns one star; settled round points earn two or three against stage targets, and Classic stages share Classic's targets. Each stage also has provisional gold-star targets for its hard mode. A missed objective awards no stars or coins and keeps the stage available to retry; Undo can still rescue a missed puzzle. Best stars and points are saved per stage. Targets come from a reproducible reference player and puzzle solver and are playtest values; see `docs/journey-star-scoring.md`. Progress and inventory persist in the browser. The shop offers three boosts, implemented by the DOM-free engine's `usePowerup` command:

| Boost | Cost | Prototype behavior |
| --- | --- | --- |
| Pocket Blast | 12 coins | Triggers an area bomb around the engine's best available hint. |
| Color Sweep | 18 coins | Clears the most common visible color. |
| A Little Breather | 10 coins | Stops automatic feeder progress for 10 seconds during timed play, including bonus rounds. Round clocks keep running. |

Boosts in the pocket appear in a tray under the board in every game, with their counts, one tap to use. A boost that can't be used right now is greyed out with the reason (the game hasn't started, No boosts is on, or Freeze outside timed play); one that finds no target stays in the pocket. The shop's own Use button still works.

The arcade contains a three-reel game with a five-coin bet. It uses game coins only, with no payment or real-money value. Journey stages, unlock rules, rewards, prices, and arcade odds are original prototype choices, not recovered III values.

The journey interface and progression live in `dist/journey.js`, with styling in `dist/journey.css`; `dist/app.js` connects it to playable game sessions. Scores, sound/preferences, journey progress, inventory, and playtest notes stay in local browser storage. Notes can be exported as JSON with seed, row count, and game settings for reproduction.

## What the references confirm

[GameHouse's original Super Collapse! listing](https://www.gamehouse.com/games/super-collapse) confirms groups of three or more, falling blocks, accelerating rows from below, larger-group rewards, three difficulty settings, color bombs, black area bombs, and Clear-the-Board bonus rounds.

The [original Super Collapse! II instruction booklet](https://www.videogamemanual.com/gba/Super%20Collapse%21%20II%20%28USA%29.pdf) confirms the 12×15 grid, feeder preview/timer, four core modes, and starting block height/color count varying by level and difficulty. Its **Lines** counter means rows remaining to appear: level progress is based on surviving the row supply, rather than clearing complete horizontal lines.

The [II publisher announcement, reproduced by Inside Mac Games](https://www.insidemacgames.com/historical/news/story.php%3FArticleID%3D9439.html), describes Traditional, Puzzle, Relapse, and Strategy, with untimed Puzzle/Strategy play, separate mode scores, and starting-level selection.

[GameHouse's III listing](https://www.gamehouse.com/games/super-collapse-3) confirms Quest and Quick Play, seven challenge types, a shop, casino, and authored puzzles. The [original RealNetworks announcement](https://realnetworks.com/press/releases/2007/realnetworks-takes-award-winning-casual-game-beyond-desktop) names Classic, Relapse, Strategy, Puzzle, Slider, Continuous, and Countdown. Platform editions differ, so those listings do not establish every PC rule or level value.

## Approximations to playtest

Exact original scoring formulas, speed curves, level tables, initial layouts, bomb radii/spawn rates, bonus scheduling, and animation timing have not been recovered from original code or a complete manual. The prototype supplies its own tunable values. Its 26 puzzles are new content, not the original puzzle collection.

The gravity block's side transfer and quiet removal of touching specials follow the family's playtest recollection. Exact transfer ordering, blast size, and special rates still need comparison with the remembered edition. The experimental anchor block is disabled after playtesting exposed its unfair upward pressure. Slider uses a simplified column-wrap rule. Bonus play continues on the current board with incoming rows and double points at the end of finite levels rather than recreating the original separate full-board bonus stages. The final-ten-second pace of one row every two seconds is a family playtest adjustment. Difficulty currently selects three, four, or five colors; the original color progression still needs comparison.

Centerward column movement, stone behavior, and the fine details of Slider and Relapse need direct comparison with the remembered edition. Specials do not bridge otherwise separate ordinary groups. Treat the current implementation as a testable interpretation until that comparison is complete.

The next fidelity pass should compare starting boards, legal groups, gravity/column movement, feeder timing, manual row advance, special blocks, top-out, and bonus transitions. Record edition, mode, level, difficulty, and expected behavior for each discrepancy.

## Pack identity and remaining scope

The user's [Archive.org link](https://archive.org/details/super-collapse-super-pack-ab) names Super Collapse Super Pack. Its page and metadata were inaccessible during research. [Distributor descriptions](https://www.iplay.com/en/games/super-collapse-super-pack/) list seven games: Collapse!, Super Collapse! 3, and Puzzle Gallery 1–5. This identifies the likely bundle, but does not verify the exact archived installer or which edition the family played.

The journey recreates the idea of progressing through stages, earning coins, and buying boosts, but its five worlds and 25 stages are new content. It does not reproduce the original III campaign, world map, exact economy, trophy collection, hundreds of puzzle layouts, or full set of casino mini-games. Original copyrighted art, audio, and puzzle layouts are not copied. These differences must remain visible when discussing progress toward full-pack fidelity.
