# Classic star scoring — approved 2026-10-26

Status: approved for implementation. Provisional targets remain labeled for playtesting.

## Agreed rules

- Classic only; each completed level earns 1 star and failed attempts earn 0.
- Stars use settled points from that level, including its bonus and the leftover-block deduction. Earlier banked levels do not affect its stars.
- Initial board: 72 blocks; normal supply: 12 + 3 × level rows, 12 blocks each. The bonus has a fixed row budget derived from the automatic pace. Add Row can pull from that supply without creating extra rows.
- The bonus runs for all 15 seconds, including after an empty board. All-clears retain their multiplier.
- Reference play is limited to two deliberate interactions per second. This is a simulation benchmark, not a proposed input cooldown for the game.
- Random boards remain. Calibrate without purchased boosts; boosts may still earn stars.
- Level multiplier: min(2, 1 + 0.05 × (level − 1)).
- Keep the leftover penalty at 20 per block, after score multipliers, with a zero floor for that level.

## Proposed point formula

Difficulty multipliers fitted to completed training runs: Easy ×1.00, Normal ×2.10, Hard ×3.55. They aim for approximately 25% and 50% higher reference scores than Easy, compensating for extra colors and pace. They are starting values, not a guarantee for every board or player. Normal was fitted on levels 1/5/10; Hard on levels 1/5.

`roundPoints = max(0, round(earnedClearPoints × difficultyMultiplier × levelMultiplier) − 20 × remainingBlocks)`

Apply rounding to aggregate earned points so repeated per-move rounding does not accumulate. Current scoring components remain additive and visible in the tally.

## Approved star spacing

- 1 star: complete the level.
- 3 stars: 90% of the completed expert-model training median, rounded upward to 50 points.
- 2 stars: 65% of the 3-star threshold, rounded upward to 50 points.
- A failed attempt earns zero stars even if its points exceed a threshold.

For unvalidated level/difficulty settings, the table below proposes reference targets of 1.25 × the Easy reference for Normal and 1.50 × for Hard. These are difficulty-reward targets, not measured mastery thresholds. They need playtest validation and are marked with a dagger.

## Draft levels 1–30

Each cell is **2 stars / 3 stars**. One star is completion. A dagger means the target is unvalidated.

| Level | Easy | Normal | Hard |
| ---: | ---: | ---: | ---: |
| 1 | 19,600 / 30,150 | 25,300 / 38,850 | 29,350 / 45,150 |
| 2 | 22,850 / 35,100 | 28,550 / 43,850 † | 34,200 / 52,600 † |
| 3 | 26,100 / 40,150 | 32,650 / 50,200 † | 39,150 / 60,200 † |
| 4 | 29,250 / 45,000 | 36,600 / 56,250 † | 43,900 / 67,500 † |
| 5 | 34,100 / 52,450 | 40,250 / 61,900 | 52,000 / 79,950 |
| 6 | 38,800 / 59,650 | 48,500 / 74,550 † | 58,150 / 89,450 † |
| 7 | 43,300 / 66,550 | 54,100 / 83,200 † | 64,950 / 99,850 † |
| 8 | 47,650 / 73,300 | 59,600 / 91,650 † | 71,500 / 109,950 † |
| 9 | 52,400 / 80,550 | 65,500 / 100,700 † | 78,600 / 120,850 † |
| 10 | 57,950 / 89,150 | 75,900 / 116,750 | 86,950 / 133,750 † |
| 11 | 64,000 / 98,400 | 79,950 / 123,000 † | 95,950 / 147,600 † |
| 12 | 71,050 / 109,300 | 88,850 / 136,650 † | 106,600 / 163,950 † |
| 13 | 78,750 / 121,150 | 98,450 / 151,450 † | 118,150 / 181,750 † |
| 14 | 84,800 / 130,400 | 105,950 / 163,000 † | 127,150 / 195,600 † |
| 15 | 91,550 / 140,800 | 114,400 / 176,000 † | 137,250 / 211,150 † |
| 16 | 99,750 / 153,400 | 124,650 / 191,750 † | 149,600 / 230,100 † |
| 17 | 109,300 / 168,150 | 136,600 / 210,150 † | 163,950 / 252,200 † |
| 18 | 117,300 / 180,400 | 146,550 / 225,450 † | 175,900 / 270,550 † |
| 19 | 128,150 / 197,150 | 160,200 / 246,450 † | 192,250 / 295,750 † |
| 20 | 135,300 / 208,100 | 169,100 / 260,100 † | 202,900 / 312,150 † |
| 21 | 141,350 / 217,450 | 176,700 / 271,800 † | 212,000 / 326,150 † |
| 22 | 147,050 / 226,200 | 183,800 / 282,750 † | 220,550 / 339,300 † |
| 23 | 150,600 / 231,650 | 188,250 / 289,600 † | 225,900 / 347,500 † |
| 24 | 156,500 / 240,750 | 195,650 / 300,950 † | 234,750 / 361,150 † |
| 25 | 159,850 / 245,900 | 199,800 / 307,350 † | 239,800 / 368,850 † |
| 26 | 165,900 / 255,200 | 207,350 / 319,000 † | 248,850 / 382,800 † |
| 27 | 169,800 / 261,200 | 212,250 / 326,500 † | 254,700 / 391,800 † |
| 28 | 173,750 / 267,250 | 217,200 / 334,100 † | 260,600 / 400,900 † |
| 29 | 179,600 / 276,250 | 224,450 / 345,300 † | 269,400 / 414,400 † |
| 30 | 183,400 / 282,150 | 229,300 / 352,700 † | 275,150 / 423,250 † |

All cells are provisional, including those without a dagger. These are heuristic-model scores, not human-tested skill boundaries.

## Levels above 30 — proposed extrapolation

Classic currently has no final level. Continue the same block-budget and level-factor rules. Estimate the Easy reference from the median earned points per offered block in training levels 26–30, then subtract a representative leftover penalty. Use the difficulty-reward ratios above for unvalidated settings. This extends the formula; it is not additional measured calibration.

Current fitted raw gross rate: 112.1397 points per offered block; representative leftovers: 31. Easy reference beyond 30: max(level-30 reference, round(112.1397 × blockBudget × levelMultiplier) − 20 × 31). Normal target: 1.25 × that reference; Hard target: 1.50 × it.

## Calibration evidence

5,400 final runs: 100 training seeds and 50 held-out seeds for each of 36 settings. Coverage: Easy levels 1–30; Normal and Hard levels 1, 5, 10. Policies were selected using training pilot seeds 0–19; no held-out tuning or per-seed oracle selection. Natural specials remained; purchased boosts were absent. Every completed run consumed its fixed block budget and full bonus duration.

| Setting | Training completions | Held-out completions | Held-out 3-star share among completions |
| --- | ---: | ---: | ---: |
| easy 1 | 100/100 | 50/50 | 82% |
| normal 1 | 98/100 | 50/50 | 74% |
| hard 1 | 74/100 | 41/50 | 59% |
| easy 5 | 100/100 | 50/50 | 78% |
| normal 5 | 97/100 | 50/50 | 82% |
| hard 5 | 40/100 | 30/50 | 87% |
| easy 10 | 100/100 | 50/50 | 82% |
| normal 10 | 95/100 | 45/50 | 84% |
| hard 10 | 12/100 | 8/50 | Not calibrated |

Easy held-out completion was 1,500/1,500. Hard level 10 completed only 8/50 held-out runs; its score distribution is too small and selective to establish fair star thresholds. Heuristic failure is not proof that human players cannot succeed. Slower 1.5-second versus 1.8-second feeder-floor sensitivity did not resolve the Hard model failures; no production pace change is recommended from this evidence alone.

## Mathematical ceiling

This is a deliberately optimistic upper bound, not an exact reachable maximum and not a star target. Let I be the regular row interval in milliseconds, R = 12 + 3 × level, K = ceil(5000/I + 5) − 1, and N = 72 + 12(R + K). Arrival exactly at bonus expiration is excluded. The board holds at most 180 blocks.

Define C(n) = floor(n/180) × 180 × 181 + (n mod 180) × ((n mod 180) + 1), and B = min(N, 180 + 12K). Then raw upper bound U = 16 × max over integer b from 0 to B of [C(N − b) + 2C(b)]. The bound grants maximum streak and all-clear rewards to every clear, perfect color arrangements, and no timing restrictions. Final ceiling = ceil(U × difficultyMultiplier × levelMultiplier).

| Level | Easy raw ceiling | Normal raw ceiling | Hard raw ceiling |
| ---: | ---: | ---: | ---: |
| 1 | 1,323,456 | 1,376,640 | 1,376,640 |
| 5 | 1,753,344 | 1,753,344 | 1,753,344 |
| 10 | 2,274,624 | 2,334,912 | 2,404,416 |
| 20 | 3,525,696 | 3,525,696 | 3,525,696 |
| 30 | 4,568,256 | 4,568,256 | 4,568,256 |

## Proposed implementation scope after approval

Apply these rules only to Classic, show stars and next-star targets in its round tally, and retain the best earned stars separately for each level and difficulty. Completing the level still advances to the next one. Preserve earned stars when thresholds are tuned later, and retain local score/seed/leftover/boost-use records for calibration. No external analytics is required.

The user approved the star spacing, provisional targets, local playtest collection, and saving best stars by level and difficulty. Progression remains completion-based.

## Files

- `classic-star-candidates.json`: measured candidate thresholds and validation coverage.
- `classic-star-proposal-table.json`: full draft including explicitly marked unvalidated targets.
- `classic-budget-and-bounds.json`: block budgets and mathematical bounds for 90 settings.
- `simulation/`: frozen scratch scripts, per-run data, methodology, and distributions.

Game source snapshot: `1d298e244c9be044986e23a6ec6b7cfb601f6b59`.
