import test from 'node:test';
import assert from 'node:assert/strict';
import { PUZZLES } from '../dist/puzzles.js';
import { COLS, ROWS, clearAt, countBlocks, createGame, getHint } from '../dist/engine.js';

test('the puzzle collection contains twenty distinct, playable board definitions', () => {
  assert.equal(PUZZLES.length, 20);
  assert.equal(new Set(PUZZLES.map(puzzle => puzzle.name)).size, PUZZLES.length);
  assert.equal(new Set(PUZZLES.map(puzzle => puzzle.rows.join('\n'))).size, PUZZLES.length);

  for (const puzzle of PUZZLES) {
    assert.ok(puzzle.rows.length > 0 && puzzle.rows.length <= ROWS, puzzle.name);
    assert.ok(puzzle.solution.length > 0, `${puzzle.name} has a solution`);
    for (const row of puzzle.rows) {
      assert.equal(row.length, COLS, `${puzzle.name} has twelve columns`);
      assert.match(row, /^[.0-4]+$/, `${puzzle.name} uses ordinary colored blocks`);
    }
    for (const move of puzzle.solution) {
      assert.ok(Number.isInteger(move.col) && move.col >= 0 && move.col < COLS);
      assert.ok(Number.isInteger(move.row) && move.row >= 0 && move.row < ROWS);
    }
  }
});

for (const [puzzleIndex, puzzle] of PUZZLES.entries()) {
  test(`${puzzle.name}: its hint sequence clears every block using the game rules`, () => {
    const state = createGame({ mode: 'puzzle', puzzleIndex, seed: 123 });
    const expectedBlocks = puzzle.rows.join('').replaceAll('.', '').length;
    assert.equal(countBlocks(state), expectedBlocks);
    assert.equal(state.puzzleName, puzzle.name);
    state.status = 'playing';

    for (const [moveIndex, move] of puzzle.solution.entries()) {
      assert.equal(state.status, 'playing', `Move ${moveIndex + 1} remains reachable`);
      const hint = getHint(state);
      assert.ok(hint, `Move ${moveIndex + 1} has a hint`);
      assert.deepEqual({ col: hint.col, row: hint.row }, move);
      assert.ok(hint.size >= 3, `Move ${moveIndex + 1} clears a legal group`);

      const before = countBlocks(state);
      const result = clearAt(state, move.col, move.row);
      assert.equal(result.valid, true, `Move ${moveIndex + 1} is legal after settling`);
      assert.ok(result.removed.length >= 3);
      assert.equal(countBlocks(state), before - result.removed.length);
    }

    assert.equal(countBlocks(state), 0);
    assert.equal(state.status, 'won');
    assert.equal(state.moves, puzzle.solution.length);
    assert.equal(state.rowsAdded, 0);
  });
}
