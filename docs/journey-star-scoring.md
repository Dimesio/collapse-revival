# Journey objectives and stars — draft 2026-10-28

Status: implemented with playtest values. Every objective and target below is a starting point for human playtesting, not a measured skill boundary. Gold-star targets are provisional and power the hard mode described in `FEATURES.md`.

## Rules

- Each stage has one objective (`dist/objectives.js`), shown in the Journey list, on the ready screen, beside the board during play, and in the round tally.
- ★ for completing the objective, including the mode's finish: finish the level and its bonus, last Countdown's two minutes, or clear every puzzle block. Continuous stages end as soon as the objective is met.
- ★★ and ★★★ for reaching the stage's round-point targets. Round points are the settled points for that round after the leftover-block penalty, as in Classic.
- A missed objective earns no stars and no coins, whatever the points. The stage stays active, so a puzzle can still be saved with Undo, and the tally offers a retry.
- The best stars and best round points are saved separately for each stage (Journey save version 2). Stages cleared before stars existed show none until replayed.
- Classic stages use Classic's own targets for their level and difficulty, so the Classic and Journey stars always agree. The same holds for gold.

## How it is calibrated

`npm run calibrate:journey` (in `tools/calibrate-journey.js`) reproduces every objective value, regular target and gold target. It runs a reference player (`tools/reference-player.js`) in nine play styles on each stage's fixed seed, 24 runs per style:

| Style | Play |
| --- | --- |
| casual | Clears any group of three, at about one action a second |
| steady | Clears any group of three, at about two actions a second |
| careful, guarded | Like steady, but tries each clear on a copy first; guarded starts defending earlier |
| brisk, planner | Like steady and careful, but also brings rows in whenever nothing is worth clearing |
| patient, builder, ambitious | Wait for groups of five or seven, and bring rows in early |
| planned (Strategy only) | Thinks every untimed move through with a beam search, then plays steadily |

### Objectives

Each style plays the stage to its end with no target in view. The objective is set at the value reached by a fixed share of all those runs, pooled across styles. Runs that fail the mode's finish count as never reaching it.

| World | 1 | 2 | 3 | 4 | 5 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Share of runs that meet the objective | 50% | 45% | 40% | 35% | 30% |

- Values round toward the easier side: points down to 1,000, blocks down to 10, leftover blocks up to 5. Group sizes are exact.
- Continuous has no finish, so its objective counts what a run clears in its first 90 seconds. Players who bring rows in finish in one to one and a half minutes; players who wait for the feeder take up to about four.
- Six stages keep a plain finish, because surviving them is the challenge: Corner by Corner, The Thoughtful Move, Last Two Minutes, Meet in the Middle, The Long Way Home and Just One More.
- The first version's streak goals (chain four or five quick clears) were met within seconds, because the streak counter stopped at five. The round's best streak now records the whole chain, and streak objectives accept up to 500 for future challenges. They are left out of the Journey: simulated players never hesitate, so they chain clears far longer than people do, and a fair streak target needs human playtesting.

### Regular stars

- **Timed and Strategy stages:** the expert is the style with the highest median round points among those that complete the objective in at least half their runs. Three stars are 90% of that median, and two stars are 65% of three stars, each rounded up to 50. This is Classic's approved spacing.
- **Puzzles:** an exhaustive search finds every clear order that completes the objective. Three stars are 90% of the best score, rounded up to 10. Two stars are halfway between the worst completing score and three stars. Corner by Corner has only one possible score, so clearing it earns all three stars. Free-play puzzles use the same rules without an objective; see `docs/puzzle-stars.md`.

### Gold stars (provisional)

Hard mode requires at least one modifier and adds 5% to the gold evaluation for two modifiers and 10% for three or more. The reference player never uses boosts or hints, so No boosts and No hints cost it nothing. A player can always take both, for 5% before choosing anything that changes play.

- **Timed and Strategy stages:** the calibration plays every style again with each mix of the modifiers that change play (Quicker rows and Taller start, where the mode offers them). Each mix's expert median is raised by that mix's bonus, counting the two free modifiers. The **reference** is the highest of these across the mixes. Three gold stars are the reference and two are 90% of it, rounded up to 50. So three gold stars stay demanding whichever modifiers a player picks.
- **Classic, including Journey Classic stages:** three gold stars are Classic's three-star target ÷ 0.9, which gives Classic's reference median, raised by 24%. Two gold stars are 90% of three. The 24% is the median lift from the best modifier mix across the 16 calibrated non-Classic stages (`CLASSIC_GOLD_LIFT` in `dist/classic-stars.js`).
- **Puzzles:** a perfect solver needs no boosts, hints or undo, so it can take three modifiers for free and earn the 10% bonus. Three gold stars are the best possible score plus 10%, and two are 95% of that, rounded up to 10. Three gold stars therefore need the best line and at least three modifiers. Each Journey puzzle's best line also fits its move limit, so Move limit never lowers the best score (checked in `test/journey-stars.test.js`).

Gold always starts above three regular stars. Separately, **Taller start often raises the score** for a capable player instead of lowering it, because it adds more blocks to clear. It was the best single choice on seven stages, where it raised the expert’s median by up to 30%. Gold targets already allow for this, because the reference is the best mix.

## Stage objectives and targets

| # | Stage | Mode | Objective | ★★ / ★★★ | Gold ★★ / ★★★ | Expert, completion |
| ---: | --- | --- | --- | ---: | ---: | --- |
| 1 | A Familiar Spark | Classic E1 | Group of 12 | 19,600 / 30,150 | 37,400 / 41,550 | Classic |
| 2 | Room to Think | Strategy E1 | 20 or fewer blocks left | 21,650 / 33,250 | 47,050 / 52,250 | patient, 67% |
| 3 | Corner by Corner | Puzzle | Clear every block | 320 / 320 | 370 / 385 | Solver |
| 4 | A Gentle Rhythm | Continuous E1 | Clear 590 blocks | 34,000 / 52,300 | 65,000 / 72,200 | builder, 100% |
| 5 | Two-Minute Tea | Countdown E1 | Earn 33,000 points | 54,050 / 83,100 | 102,100 / 113,450 | builder, 100% |
| 6 | Side Street | Slider E1 | Group of 15 | 23,750 / 36,500 | 40,100 / 44,600 | builder, 58% |
| 7 | From Both Shores | Relapse E1 | 25 or fewer blocks left | 12,450 / 19,100 | 26,650 / 29,600 | careful, 100% |
| 8 | Paper Wings | Puzzle | Group of 10 | 2,540 / 3,140 | 3,640 / 3,828 | Solver |
| 9 | One Step Ahead | Strategy E2 | Group of 28 | 24,900 / 38,250 | 54,200 / 60,200 | builder, 100% |
| 10 | Lantern Light | Classic E3 | Group of 15 | 26,100 / 40,150 | 49,850 / 55,350 | Classic |
| 11 | Ripples in Glass | Puzzle | Group of 12 | 4,050 / 5,550 | 6,440 / 6,776 | Solver |
| 12 | Winding Path | Slider N2 | Group of 8 | 13,750 / 21,150 | 24,500 / 27,250 | builder, 100% |
| 13 | A Passing Shower | Countdown N2 | Clear 780 blocks | 49,150 / 75,550 | 96,150 / 106,800 | ambitious, 100% |
| 14 | Growing Season | Continuous N3 | Clear 550 blocks | 22,550 / 34,650 | 38,100 / 42,350 | ambitious, 100% |
| 15 | Roots and Branches | Relapse N2 | Group of 8 | 10,800 / 16,550 | 23,550 / 26,150 | ambitious, 100% |
| 16 | The Thoughtful Move | Strategy N4 | Finish | 18,600 / 28,600 | 38,050 / 42,250 | planned, 100% |
| 17 | Secret Garden | Puzzle | Group of 15 | 6,190 / 9,350 | 10,850 / 11,418 | Solver |
| 18 | Neon Nostalgia | Classic N4 | 50 or fewer blocks left | 36,600 / 56,250 † | 69,750 / 77,500 | Classic |
| 19 | A Moving Picture | Slider H3 | Group of 11 | 12,550 / 19,250 | 22,350 / 24,850 | ambitious, 100% |
| 20 | Last Two Minutes | Countdown N11 | Finish | 23,300 / 35,800 | 50,400 / 56,000 | planner, 58% |
| 21 | Stained-Glass Sky | Puzzle | Group of 10 | 2,950 / 3,210 | 3,730 / 3,916 | Solver |
| 22 | Meet in the Middle | Relapse N14 | Finish | 34,100 / 52,400 | 62,500 / 69,450 | ambitious, 79% |
| 23 | A Lasting Glow | Continuous H4 | Clear 420 blocks | 12,500 / 19,200 | 20,200 / 22,400 | ambitious, 79% |
| 24 | The Long Way Home | Strategy H3 | Finish | 10,950 / 16,800 | 17,650 / 19,600 | planned, 100% |
| 25 | Just One More | Classic N15 | Finish | 114,400 / 176,000 † | 218,250 / 242,500 | Classic |

† Classic's own provisional targets.

## Retuned final stages

The first calibration found four stages that were effectively unwinnable. Hard difficulty (five colours) is the cliff: no setting of it let the reference player reliably survive Countdown, Relapse or Classic. High Normal levels give the speed without the five-colour wall. The new settings are hard but winnable: careful play finishes most runs, and simple play finishes few.

| # | Stage | Before | Finished before | After | Finished now |
| ---: | --- | --- | --- | --- | --- |
| 20 | Last Two Minutes | Countdown Hard 3 | 0% | Countdown Normal 11 | 83% at best; steady 33% |
| 22 | Meet in the Middle | Relapse Hard 4 | 0% | Relapse Normal 14 | 88% at best; steady 25% |
| 24 | The Long Way Home | Strategy Hard 5 | No plan found at a search width of 600 | Strategy Hard 3 | Planned play 100%; every unplanned style 0% |
| 25 | Just One More | Classic Hard 6 | 4–8% | Classic Normal 15 | 88% at best; steady 46% |

Hard 1 was no better: Countdown 0%, Relapse 13% at best and Classic 29% at best.

## Modifier mixes the reference player could not finish

The hard-mode picker warns when a player chooses one of these mixes (`unfinished` in each stage's data). It still offers them, because the reference player is not proof that a mix is impossible:

- From Both Shores: Quicker rows + Taller start
- A Moving Picture: Taller start, alone or with Quicker rows
- The Long Way Home: Taller start (no plan exists)
- Just One More: Quicker rows, alone or with Taller start

## Known limits

- The reference player is a heuristic model. It acts faster than most people and never hesitates, and Hard targets in particular may be steep. Human results are needed before any value is treated as validated.
- The objective shares and the 90-second Continuous window are design choices, not measurements. Changing them in `tools/calibrate-journey.js` and rerunning the tool resets every objective consistently.
- Countdown rewards adding rows. Styles that never add rows score about 14,000 points in Two-Minute Tea, so its 33,000-point objective asks players to learn the Add a row button.
- Room to Think (15 → 20 blocks left) and Winding Path (group of 10 → 8) are a little easier than in the first version. The population rule found the old values harder than intended for their worlds.
