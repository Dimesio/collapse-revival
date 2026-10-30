# Celebrations

Big moments in play earn a short cheer over the board, and a new personal best earns a ribbon on the round's result. The rules live in `dist/celebrations.js`; the page draws them and plays their sounds. Every threshold here is a first playtest value.

## What earns a cheer

| Cheer | When | Phrases |
| --- | --- | --- |
| Clean sweep | A clear empties the board, or one side in Relapse. The banner over the board leads with the phrase, and confetti falls. | Clean sweep! · Spotless! · Not a block left! · Swept clean! |
| Double sweep | One Relapse clear empties both sides. | Double sweep! · Both sides, spotless! · Clean sweep, twice over! |
| Past your best | The run's score passes your best for that mode and difficulty, as it stood when the run began. Once a run. | Past your best! · Beyond your best! · Record pace! |
| Close call | A block reached the top two rows (in Relapse, two rows from the other stack), and your clears bring back four clear rows. | Phew! · Close call! · Saved it! · Back from the brink! |
| Huge clear | 16 or more blocks in one clear, bombs included. Strategy needs 30. | Oh snap! · Whoa! · Monster clear! · Unreal! |
| Big clear | 10 or more blocks. Strategy needs 20, because its full, untimed board makes big groups ordinary. | Nice! · Big time! · Look at that! · Lovely! · Now we’re talking! |

When a round settles, the first one in a run whose total beats your best from before the run shows **New personal best!** on its tally, with the new total and the old one. The ribbon appears when the count finishes, with a fanfare and confetti over the card. A first game in a mode has no best to beat, so it gets no ribbon.

## Keeping cheers special

- **One cheer per clear.** When events coincide, the most significant wins: sweep, then personal best, close call, huge clear, big clear. A sweep that also passes your best says so in its banner.
- **Big and huge clears wait their turn.** After a cheer, a big or huge clear stays quiet for four clears or six seconds of play unless it outranks that cheer, so a huge clear can still follow a big one. Sweeps, bests and close calls always show.
- **Phrases rotate.** Each phrase is heard before any repeats, and never twice running.
- **Puzzles celebrate on their result.** A puzzle's biggest group can be its trap, so puzzles have no cheers in play. Neither does a clear that ends a round, since the tally takes over. Journey boosts never cheer, and a boost that calms a crowded board ends the close call quietly.
- **The board stays playable.** A cheer sits just above its clear's points, stays inside the board, and fades within 1.7 seconds. The next clear's points never cut it short. Cheers and confetti never take clicks or taps.

## Sound and motion

Each cheer has a short phrase of notes just after the clear's own sound. A close call sighs and lifts, and a personal best sparkles. The sound toggle silences all of them. With reduced motion, words appear and disappear without popping or floating, and confetti is skipped. The tally then shows its result and ribbon at once.

## Calibration

`npm run calibrate:cheers` plays every timed mode with five simulated play styles, on each difficulty, and counts the cheers each clear earns and how many actually show. `--big` and `--huge` try other thresholds; `--mode` picks modes. With the current rules and four runs per style (60 runs per mode):

| Mode | Clear size: median · 97th · 99th percentile | Shown per 100 clears: big · huge · close call · sweep | Runs with a close call |
| --- | --- | --- | --- |
| Classic | 4 · 11 · 16 | 1.87 · 0.88 · 0.26 · 0.15 | 17% |
| Strategy | 6 · 26 · 34 | 2.30 · 1.29 · 0.93 · 0 | 20% |
| Continuous | 4 · 11 · 15 | 2.08 · 0.68 · 0.20 · 0.21 | 25% |
| Countdown | 4 · 11 · 16 | 2.11 · 0.82 · 0.20 · 0.15 | 17% |
| Relapse | 3 · 12 · 20 | 1.68 · 1.31 · 0.28 · 0.56 | 13% |
| Slider | 4 · 12 · 16 | 2.19 · 1.01 · 0.24 · 0.20 | 15% |

That is about one cheer for every 30 clears: two to four in a Classic level or a Countdown round. Without the quiet period, big clears would cheer roughly 60% more often. The simulated players are benchmarks, not people. Players who build big groups on purpose will hear more cheers, so tune the thresholds with human playtests.
