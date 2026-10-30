# Weekly and shared challenges

A challenge is one round with fixed settings: a mode, difficulty, level or puzzle, board seed, objective, and rules. The same challenge builds the same starting board and the same incoming rows on any device, so players can compare results without accounts or a server. The rules live in `dist/challenges.js`, which never touches the page. The dialog is in `dist/challenge-panel.js`, and `dist/app.js` plays and records challenges.

## A challenge definition

```js
{ version: 1, mode: 'classic', difficulty: 'easy', level: 3, puzzleIndex: 0, seed: 2040137336,
  objective: { type: 'group', target: 12 }, modifiers: ['noBoosts'] }
```

`validateChallenge` checks a definition and returns its canonical form. Its checks:

- **Version:** must be 1.
- **Mode:** any of the seven.
- **Difficulty:** easy, normal or hard.
- **Level:** 1 to 30.
- **Puzzle:** must exist.
- **Seed:** a whole number from 0 to 2³²−1.
- **Objective:** must suit the mode (`objectives.js`).
- **Modifiers:** each must apply to the mode (`modifiers.js`).

A puzzle's board is authored, so its seed, difficulty and level are fixed at 0, easy and 1. Two codes for the same puzzle setup are then the same challenge. `challengeConfig` turns a definition into `createGame` options.

Definitions are plain data and independent of the interface. That makes them a ready starting point for a later multiplayer match: two players building a game from one definition see identical boards and rules.

## Codes and links

`encodeChallenge` writes a short code that reads left to right:

```text
CR1-CLE3-G12-B-799A0678-4V
│   │    │   │ │        └ typo check
│   │    │   │ └ board seed, 8 hex digits
│   │    │   └ rules: B no boosts (0 for none)
│   │    └ objective: G12, a group of 12 or more
│   └ setup: CL Classic, E easy, level 3 (PZ25 for puzzle 25)
└ format 1
```

**Code letters:**

- **Modes:**
  - CL Classic
  - ST Strategy
  - PZ Puzzle
  - RL Relapse
  - CN Continuous
  - CD Countdown
  - SL Slider
- **Objectives:**
  - F finish
  - S score
  - G group
  - B blocks
  - A all-clear
  - L fewest blocks left
  - C chain (streak)
- **Rules:**
  - Q quicker rows
  - T taller start
  - B no boosts
  - H no hints
  - U no undo
  - M move limit

A link adds the code to the page address as `#challenge=CR1-…`. The fragment never reaches a server, so links work on any static host. Opening a link shows the challenge, ready to play. The address is then tidied so a reload doesn't reopen it.

`decodeChallenge` accepts a code or a whole link, in any case and with stray spaces. It rejects bad input with a plain reason:

| Problem | Message |
| --- | --- |
| Nothing pasted | Paste a challenge code or link first. |
| Not a code | That doesn’t look like a challenge code. Codes start with CR1-. |
| Newer format | This code comes from a newer version of the game (format 2). Refresh the page to update, then try again. |
| Older or unknown format | Format 0 codes are not supported. This game reads format 1. |
| Missing parts | That code looks incomplete. Check that you copied all of it. |
| Typo check fails | That code doesn’t add up. Check it for a typo. |
| A setting is out of range | The setting's own reason, such as “Levels run from 1 to 30.” or “No undo is not available in this mode.” |

The typo check is a two-character hash of the rest of the code. It catches nearly all single-character slips before the settings are read.

## The weekly challenge

Each week runs from Monday 00:00 UTC to the next Monday and carries its ISO week label, such as 2026-W44. A week's challenge comes from:

- **Template:** the next one in a fixed rotation.
- **Seed:** derived from the week label.
- **Puzzle:** puzzle weeks also step through a list of puzzles.

Everyone sees the same challenge for the whole week, wherever they are. The dialog shows the week's dates, the time left and the rules. It also shows when the next challenge arrives, in the player's own time.

Every weekly turns boosts off. Boosts come from each player's own Journey pocket, so a full pocket would otherwise make results unequal. Hints and Undo stay available to everyone, so they don't affect fairness.

Rotation version 1 starts the week of Monday 26 October 2026. Each target was set so roughly 40% of simulated runs meet it. The simulation uses the Journey's nine play styles on eight weeks' boards (72 runs per template), via `npm run calibrate:challenges`:

| Week | Template | Setup | Objective | Rules | Simulated runs completing it |
| --- | --- | --- | --- | --- | --- |
| 1 | Gather Round | Classic · Easy · Level 3 | Clear a group of 12 or more, then finish the level | No boosts | 43% |
| 2 | Quick Brew | Countdown · Easy · Level 4 | Earn 40,000 points, then last the full two minutes | No boosts | 40% |
| 3 | Neat and Tidy | Strategy · Easy · Level 3 | Finish the level with 15 or fewer blocks left | No boosts | 40% |
| 4 | Shifting Sands | Slider · Normal · Level 2 | Clear a group of 10 or more, then finish the level | Quicker rows, No boosts | 47% |
| 5 | Measured Steps | A rotating puzzle | Clear every block | Move limit, No boosts | Each puzzle solvable within its limit |
| 6 | Both Tides | Relapse · Easy · Level 5 | Empty a whole side, then finish the level | No boosts | 61% |
| 7 | The Long Run | Continuous · Hard · Level 3 | Clear 380 blocks | No boosts | 43% |
| 8 | Tall Order | Classic · Hard · Level 3 | Finish the level and bonus round | Taller start, No boosts | 54% |

Puzzle weeks visit these puzzles in turn:

- Four Windows
- Sails Down
- City Lights
- Lighthouse
- Arcade Quilt
- Drawbridge
- Clockwork
- Harbor Lights
- Secret Garden
- Homecoming

Each one's move limit is its known solution's length, which the tests replay. The simulated players are benchmarks, not people, and these targets are playtest values. Both Tides and Tall Order are the gentler weeks.

**Changing the rotation:** never edit a template that has already run. Players' results and shared codes for past weeks would no longer match their week. Instead, start a new rotation version from a future week. Puzzles must only ever be appended to `dist/puzzles.js`, because codes name puzzles by number.

## Playing and records

A challenge starts at a ready card showing its objective, setup, rules and your best. It then plays like a Journey stage:

- **Progress:** the objective and its progress show beside the board, and the cabinet says CHALLENGE.
- **Ending:** the round ends as soon as the objective is decided. Continuous ends at its goal; other modes end when the level, round or puzzle does.
- **Result:** the round tally says whether you made it, without Classic stars. It offers Copy your result, Try again and Back to challenges.
- **Undo:** a missed puzzle can be undone and finished, as in the Journey.
- **Cheers:** “Past your best!” compares against your completed best for this exact challenge.
- **Ribbon:** a better completed result shows a “New challenge best!” ribbon.

**What is saved:** results are kept in this browser under `collapse:challenges`, keyed by code. Any change to the seed, objective or a rule makes a different record. Each record holds:

- the attempts, counted when play begins
- the completions, counted once per run however often Undo reopens it
- the best result, where a completion beats any miss and then more points win

The 60 most recently played challenges are kept. A challenge never changes these regular records:

- mode high scores
- Classic stars
- puzzle stars
- the Journey

**Copy your result** puts a plain summary on the clipboard. If the browser blocks copying, the text is shown ready to copy:

```text
Collapse Revival · Weekly challenge 2026-W44 · Gather Round
Classic · Easy · Level 3 · No boosts
Goal: Clear a group of 12 or more, then finish the level
✓ Complete · 41,250 points · biggest group 18
Same board, same rules: CR1-CLE3-G12-B-799A0678-4V
https://…/#challenge=CR1-CLE3-G12-B-799A0678-4V
```

The stat after the points matches the objective:

- biggest group
- blocks cleared
- sides emptied
- best streak
- blocks left
- moves, for a puzzle

Boosts used are listed when there were any.

## The dialog

The weekly card under The journey shows this week's challenge, its time left, and your best. On a phone it shows the name and time left. It opens **Challenges**, which has four views:

- **This week:** the weekly's dates, rules, your best, and buttons to play it or copy its link.
- **Enter a code:** paste a code or link. A valid one shows the same card; an earlier weekly is recognized by name.
- **Make your own:**
  - **Settings:** choose a mode, difficulty and level (or a puzzle), an objective and target, and rules.
  - **Board:** shuffle the board seed.
  - **Output:** the code updates as you go. Invalid settings show the reason, and No boosts starts switched on.
- **Your results:** recent challenges with your best, ready to play again or share.

## Tests

`test/challenges.test.js` checks the following:

- **Codes:** a code and a link reproduce the same definition and identical starting conditions over time. Every weekly template and unusual combinations are covered.
- **Weeks:** the weekly holds from Monday 00:00 UTC to Sunday 23:59:59.999. ISO week labels are right across year boundaries, and the rotation repeats with a new board every week.
- **Rejections:** every malformed, unsupported or out-of-range code is rejected with its reason.
- **Judging:** objectives and settled points.
- **Records:** separate records per exact configuration, completion counting under Undo, reloads, corrupt saves, and the 60-record limit.
- **Copied text:** the result summary and the dialog's wording.
- **Weekly puzzles:** each is solvable within its move limit.
- **Simulated play:** each stack-mode weekly is completed by 15% to 85% of simulated runs over four weeks.
