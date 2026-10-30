import test from 'node:test';
import assert from 'node:assert/strict';
import { PUZZLES } from '../dist/puzzles.js';
import { clearAt, createGame, finalizeRound } from '../dist/engine.js';
import { goldResult } from '../dist/gold.js';
import { puzzleTargets, puzzleGoldTargets, puzzleStarTargets, puzzleStarGoldTargets, puzzleStars, moveLimitText } from '../dist/puzzle-stars.js';
import { createPuzzleProgress } from '../dist/puzzle-progress.js';
import { calibratePuzzle, writePoints } from '../tools/calibrate-puzzles.js';

function memory() {
  const values = new Map();
  return { get: (key, fallback) => values.has(key) ? structuredClone(values.get(key)) : fallback, set: (key, value) => values.set(key, structuredClone(value)) };
}

/** Plays a line from the start and settles the round. */
function play(puzzleIndex, line, modifiers = []) {
  const state = createGame({ mode: 'puzzle', puzzleIndex, seed: 3, modifiers });
  state.status = 'playing';
  for (const move of line) assert.equal(clearAt(state, move.col, move.row).valid, true);
  finalizeRound(state);
  return state;
}

test('puzzle stars come from the best and worst lines', () => {
  assert.deepEqual(puzzleTargets({ maxPoints: 1410, minPoints: 960 }), { two: 1120, three: 1270 });
  assert.deepEqual(puzzleTargets({ maxPoints: 510, minPoints: 510 }), { two: 460, three: 460 }, 'one possible score meets both targets');
  assert.deepEqual(puzzleGoldTargets({ maxPoints: 1410 }), { two: 1480, three: 1551 }, 'the best line with three free challenges, +10%');
  assert.deepEqual([0, 1000, 1120, 1270].map(points => puzzleStars(points, true, { two: 1120, three: 1270 })), [1, 1, 2, 3]);
  assert.equal(puzzleStars(5000, false, { two: 1120, three: 1270 }), 0, 'a board that is not cleared earns nothing');
  assert.equal(moveLimitText(PUZZLES.find(puzzle => puzzle.name === 'Low Tide')), 'Clear every block in 3 moves or fewer, the known solution’s length.');
});

test('every puzzle stores targets that follow the rule', () => {
  for (const puzzle of PUZZLES) {
    const targets = puzzleStarTargets(puzzle);
    const gold = puzzleStarGoldTargets(puzzle);
    assert.deepEqual(targets, puzzleTargets({ maxPoints: puzzle.points.best, minPoints: puzzle.points.worst }), puzzle.name);
    assert.ok(targets.two <= targets.three && targets.three <= puzzle.points.best, `${puzzle.name}: three stars are reachable`);
    assert.ok(gold.two <= gold.three && gold.three > puzzle.points.best, `${puzzle.name}: three gold stars need the bonus`);
  }
});

test('each harbor puzzle’s solver results match its stored points, and its solution is a best line', () => {
  for (const [puzzleIndex, puzzle] of PUZZLES.entries()) {
    if (puzzle.set !== 'harbor') continue;
    const solved = calibratePuzzle(puzzleIndex);
    assert.deepEqual({ best: solved.best, worst: solved.worst }, puzzle.points, puzzle.name);
    const state = play(puzzleIndex, puzzle.solution, ['noBoosts', 'noHints', 'noUndo', 'moveLimit']);
    assert.equal(state.status, 'won', `${puzzle.name} fits its move limit`);
    assert.equal(state.roundSummary.netPoints, puzzle.points.best, `${puzzle.name}: the hints teach the best line`);
    const gold = goldResult({ completed: true, points: state.roundSummary.netPoints, modifiers: state.modifiers, targets: puzzleStarGoldTargets(puzzle) });
    assert.equal(gold.stars, 3, `${puzzle.name}: the best line with every challenge earns three gold stars`);
  }
});

test('the calibration tool rewrites only the points of the puzzles it solved', () => {
  const file = 'export const PUZZLES = [\n  {\n    name: "A",\n    points: { best: 1, worst: 1 },\n    rows: [],\n  },\n  {\n    name: "B",\n    rows: [],\n  },\n];\n';
  const next = writePoints(file, new Map([['A', { best: 90, worst: 60 }], ['B', { best: 30, worst: 30 }]]));
  assert.match(next, /name: "A",\n {4}points: \{ best: 90, worst: 60 \},\n {4}rows/);
  assert.match(next, /name: "B",\n {4}points: \{ best: 30, worst: 30 \},\n {4}rows/);
  assert.throws(() => writePoints(file, new Map([['C', { best: 1, worst: 1 }]])), /C is not in the puzzles file/);
});

test('puzzle records keep the best stars and points, and gold apart', () => {
  const storage = memory();
  const progress = createPuzzleProgress(storage);
  assert.deepEqual(progress.best('Low Tide'), { stars: 0, score: 0 });
  assert.equal(progress.record('Low Tide', { stars: 0, points: 300 }).improved, false, 'a puzzle left uncleared saves nothing');
  assert.equal(progress.record('Low Tide', { stars: 2, points: 480 }).improved, true);
  assert.equal(progress.record('Low Tide', { stars: 1, points: 400 }).improved, false);
  const better = progress.record('Low Tide', { stars: 2, points: 500 });
  assert.deepEqual(better, { previous: { stars: 2, score: 480 }, best: { stars: 2, score: 500 }, improved: true });

  const gold = goldResult({ completed: true, points: 510, modifiers: ['noHints', 'noUndo'], targets: { two: 530, three: 561 } });
  const saved = progress.record('Low Tide', {}, gold);
  assert.equal(saved.improved, true);
  assert.equal(progress.record('Low Tide', {}, { ...gold, stars: 1, adjusted: 100 }).improved, false);

  const reload = createPuzzleProgress(storage);
  assert.deepEqual(reload.best('Low Tide'), { stars: 2, score: 500 }, 'gold runs never change regular stars');
  assert.deepEqual(reload.goldBest('Low Tide'), { stars: gold.stars, score: 510, adjustedScore: gold.adjusted, modifiers: ['noHints', 'noUndo'] });
  assert.equal(reload.goldBest('Siren Song'), null);
});

test('stored puzzle records are cleaned on load', () => {
  const storage = memory();
  storage.set('puzzle-stars', { 'Low Tide': { stars: 7, score: -5 }, Drawbridge: 'bad' });
  storage.set('puzzle-gold', { 'Low Tide': { stars: 2, score: 50, adjustedScore: 52, modifiers: ['fastRows', 'noUndo'] }, Drawbridge: { stars: 3, modifiers: ['fastRows'] } });
  const progress = createPuzzleProgress(storage);
  assert.deepEqual(progress.best('Low Tide'), { stars: 3, score: 0 });
  assert.deepEqual(progress.best('Drawbridge'), { stars: 0, score: 0 });
  assert.deepEqual(progress.goldBest('Low Tide').modifiers, ['noUndo'], 'modifiers a puzzle cannot use are dropped');
  assert.equal(progress.goldBest('Drawbridge'), null, 'a gold record needs a puzzle modifier');
});
