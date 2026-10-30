// Finds the best and worst points of the lines that clear each puzzle, the
// basis of its stars, with an exhaustive solver. Large puzzles take minutes.
// Usage: node tools/calibrate-puzzles.js [--puzzle 21,22] [--write]
// --write stores the results as each puzzle's `points` in dist/puzzles.js.
import { readFileSync, writeFileSync } from 'node:fs';
import { PUZZLES } from '../dist/puzzles.js';
import { puzzleTargets, puzzleGoldTargets } from '../dist/puzzle-stars.js';
import { solvePuzzle } from './reference-player.js';

const PUZZLES_FILE = new URL('../dist/puzzles.js', import.meta.url);

/** Solves one puzzle: its best and worst points, fewest moves, and a best line. */
export function calibratePuzzle(puzzleIndex) {
  const solved = solvePuzzle(puzzleIndex);
  if (!solved) return null;
  return { best: solved.maxPoints, worst: solved.minPoints, minMoves: solved.minMoves, bestLine: solved.bestLine, ...puzzleTargets(solved), gold: puzzleGoldTargets(solved) };
}

/** Rewrites the `points` line of each named puzzle in the puzzles file. */
export function writePoints(text, results) {
  let next = text;
  for (const [name, { best, worst }] of results) {
    const entry = new RegExp(`(\\n    name: "${name}",\\n)(    points: \\{[^\\n]*\\n)?`);
    if (!entry.test(next)) throw new Error(`${name} is not in the puzzles file.`);
    next = next.replace(entry, `$1    points: { best: ${best}, worst: ${worst} },\n`);
  }
  return next;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const at = process.argv.indexOf('--puzzle');
  const only = at > 0 ? process.argv[at + 1].split(',').map(value => Number(value) - 1) : null;
  const results = new Map();
  for (const [index, puzzle] of PUZZLES.entries()) {
    if (only && !only.includes(index)) continue;
    const started = Date.now();
    const result = calibratePuzzle(index);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (!result) { console.log(`${String(index + 1).padStart(2, '0')} ${puzzle.name}: no line clears this puzzle`); continue; }
    results.set(puzzle.name, result);
    const stored = puzzle.points && (puzzle.points.best !== result.best || puzzle.points.worst !== result.worst) ? ` · stored ${puzzle.points.best}/${puzzle.points.worst} differs` : '';
    console.log(`${String(index + 1).padStart(2, '0')} ${puzzle.name}: best ${result.best} · worst ${result.worst} · ★★ ${result.two} · ★★★ ${result.three} · gold ★★ ${result.gold.two} · ★★★ ${result.gold.three} · fewest moves ${result.minMoves} · best line ${result.bestLine.length} of ${puzzle.solution.length} allowed (${seconds}s)${stored}`);
  }
  if (process.argv.includes('--write')) {
    writeFileSync(PUZZLES_FILE, writePoints(readFileSync(PUZZLES_FILE, 'utf8'), results));
    console.log(`Stored points for ${results.size} puzzles.`);
  }
}
