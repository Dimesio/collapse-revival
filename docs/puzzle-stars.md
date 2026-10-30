# Puzzle stars and hints — draft 2026-10-28

Status: implemented with playtest values. Regular puzzle targets follow directly from what the solver proves possible. Gold targets are provisional, like every other gold target.

## Rules

- ★ for clearing every block. A board left with blocks on it earns no stars.
- ★★ and ★★★ for points. A puzzle has no incoming rows or clock, so its points depend only on the order of moves: bigger groups score more, and the last group doubles for clearing the board.
- `tools/calibrate-puzzles.js` runs an exhaustive solver over every line that clears a puzzle and stores the best and worst totals as the puzzle's `points` (`npm run calibrate:puzzles -- --write`). The largest puzzles take a few minutes.
- ★★★ needs 90% of the best total, rounded up to 10. ★★ sits halfway between the worst total and the ★★★ target. When every line scores the same, any clear earns all three.
- Gold ★★★ needs the best line with the three challenges that cost a perfect solver nothing (No boosts, No hints, No undo), so the best total plus 10%. Gold ★★ needs 95% of that, rounded up to 10. These are the same rules the Journey's puzzle stages use.
- The Move limit challenge allows the stored solution's number of moves. Every puzzle's best line fits within it, and each harbor puzzle's stored solution is itself a best line.
- Best stars, best points and the best gold attempt are saved per puzzle name in this browser, apart from Journey stages that use the same boards.

## Hints

Each press of the hint goes one layer deeper for the same position, and a move starts over at the first layer:

1. **An idea.** The hint names what the next move does: holding back from a tempting dead end, emptying a column so the sides slide together, stacking separated blocks onto each other, dropping blocks level with their neighbors, letting blocks fall, or finishing the board.
2. **An area.** A frame around the group, one cell larger on every side, with the rest of the board dimmed.
3. **The move.** The group sparkles, as the single-step hint did before.

While the player follows the stored solution, the hint follows it. Off it, a search with a budget of 20,000 moves looks for another line. When none exists, the hint says so and suggests undo. On the largest boards the budget can run out early in a puzzle, about half a second after the press. The hint then admits it is off the known path, points at the biggest group, and suggests undo.

## Targets

| # | Puzzle | Set | Best | Worst | ★★ | ★★★ | Gold ★★ | Gold ★★★ | Move limit |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 01 | First Spark | Collection | 900 | 900 | 810 | 810 | 950 | 990 | 1 |
| 02 | Lanterns | Collection | 630 | 630 | 570 | 570 | 660 | 693 | 2 |
| 03 | Cornerstones | Collection | 350 | 350 | 320 | 320 | 370 | 385 | 2 |
| 04 | Mushroom | Collection | 2,300 | 700 | 1,390 | 2,070 | 2,410 | 2,530 | 3 |
| 05 | Picture Frame | Collection | 5,080 | 3,080 | 3,830 | 4,580 | 5,310 | 5,588 | 3 |
| 06 | Step Garden | Collection | 1,160 | 1,030 | 1,040 | 1,050 | 1,220 | 1,276 | 5 |
| 07 | Butterfly | Collection | 3,480 | 1,440 | 2,290 | 3,140 | 3,640 | 3,828 | 4 |
| 08 | Diamond Well | Collection | 11,800 | 3,860 | 7,240 | 10,620 | 12,340 | 12,980 | 5 |
| 09 | Hourglass | Collection | 3,030 | 1,460 | 2,100 | 2,730 | 3,170 | 3,333 | 6 |
| 10 | Four Windows | Collection | 6,600 | 1,300 | 3,620 | 5,940 | 6,900 | 7,260 | 12 |
| 11 | Ripple | Collection | 6,160 | 2,070 | 3,810 | 5,550 | 6,440 | 6,776 | 8 |
| 12 | Paper Crown | Collection | 5,820 | 2,940 | 4,090 | 5,240 | 6,090 | 6,402 | 6 |
| 13 | Crossroads | Collection | 5,000 | 1,680 | 3,090 | 4,500 | 5,230 | 5,500 | 8 |
| 14 | City Lights | Collection | 4,330 | 2,780 | 3,340 | 3,900 | 4,530 | 4,763 | 9 |
| 15 | Color Cascade | Collection | 8,130 | 6,660 | 6,990 | 7,320 | 8,500 | 8,943 | 9 |
| 16 | Secret Garden | Collection | 10,380 | 2,180 | 5,770 | 9,350 | 10,850 | 11,418 | 11 |
| 17 | Arcade Quilt | Collection | 8,990 | 3,310 | 5,710 | 8,100 | 9,400 | 9,889 | 13 |
| 18 | Homecoming | Collection | 8,730 | 3,600 | 5,730 | 7,860 | 9,130 | 9,603 | 13 |
| 19 | Stained Glass | Collection | 3,560 | 2,260 | 2,740 | 3,210 | 3,730 | 3,916 | 11 |
| 20 | Clockwork | Collection | 5,380 | 2,480 | 3,670 | 4,850 | 5,630 | 5,918 | 15 |
| 21 | Low Tide | Harbor | 510 | 510 | 460 | 460 | 540 | 561 | 3 |
| 22 | Sails Down | Harbor | 510 | 510 | 460 | 460 | 540 | 561 | 3 |
| 23 | Drawbridge | Harbor | 760 | 760 | 690 | 690 | 800 | 836 | 4 |
| 24 | Siren Song | Harbor | 1,410 | 960 | 1,120 | 1,270 | 1,480 | 1,551 | 3 |
| 25 | Lighthouse | Harbor | 1,120 | 1,010 | 1,010 | 1,010 | 1,180 | 1,232 | 7 |
| 26 | Harbor Lights | Harbor | 2,660 | 1,510 | 1,960 | 2,400 | 2,780 | 2,926 | 8 |

## The harbor lessons

| Puzzle | Lesson | What its solution teaches |
| --- | --- | --- |
| Low Tide | Joining up | Clearing the water lets the shells above drop onto the shells below; the gold sand then slides together. |
| Sails Down | Letting go | Clearing the mast drops its flags level with the hull's matching rows. |
| Drawbridge | Sliding together | Emptying the two middle columns brings the towers together, row by row. |
| Siren Song | Resisting the trap | The biggest group (10 gold) ends the puzzle at once. Clearing the mint first joins the coral, and saving the gold for last earns the most points. |
| Lighthouse | Falling and sliding | Two drops and two column slides before the final groups meet. |
| Harbor Lights | Everything at once | Eight moves that use every idea. Four of the five opening moves are dead ends. |

The harbor layouts were found by a seeded search over symmetric boards, kept only when the solver's best line taught the intended ideas, then checked by hand. Tests in `test/puzzle-hints.test.js` confirm each lesson's ideas along its stored solution.
