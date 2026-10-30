import test from 'node:test';
import assert from 'node:assert/strict';
import { PUZZLES } from '../dist/puzzles.js';
import { COLS, ROWS, clearAt, countBlocks, createGame, getGroup } from '../dist/engine.js';
import { NUDGES, findLine, moveConcept, puzzleHint, puzzleMoves } from '../dist/puzzle-hints.js';

const indexOf = name => PUZZLES.findIndex(puzzle => puzzle.name === name);
function start(name, modifiers = []) {
  const state = createGame({ mode: 'puzzle', puzzleIndex: indexOf(name), seed: 5, modifiers });
  state.status = 'playing';
  return state;
}
/** The idea behind each move of a puzzle's stored solution. */
function conceptsOf(name) {
  const state = start(name);
  return PUZZLES[indexOf(name)].solution.map(move => {
    const concept = moveConcept(state, move);
    clearAt(state, move.col, move.row);
    return concept;
  });
}

test('each harbor lesson teaches its idea in its known solution', () => {
  assert.deepEqual(conceptsOf('Low Tide'), ['join', 'slide', 'finish'], 'the water clears and the shells meet');
  assert.deepEqual(conceptsOf('Sails Down'), ['drop', 'plain', 'finish'], 'the mast drops its flags into line');
  assert.deepEqual(conceptsOf('Drawbridge'), ['slide', 'plain', 'plain', 'finish'], 'the bridge clears and the towers meet');
  assert.equal(conceptsOf('Siren Song')[0], 'wait', 'the biggest group is a dead end');
  const lighthouse = conceptsOf('Lighthouse');
  assert.ok(lighthouse.includes('drop') && lighthouse.includes('slide') && !lighthouse.includes('wait'), 'gravity and columns together');
  const finale = conceptsOf('Harbor Lights');
  for (const idea of ['join', 'drop', 'slide', 'wait']) assert.ok(finale.includes(idea), `the finale uses ${idea}`);
});

test('harbor layouts start settled and centered, so the first move never jolts the board', () => {
  for (const puzzle of PUZZLES.filter(item => item.set === 'harbor')) {
    const state = createGame({ mode: 'puzzle', puzzleIndex: PUZZLES.indexOf(puzzle) });
    const used = [];
    for (let col = 0; col < COLS; col++) {
      const cells = state.board.map(line => line[col]);
      const top = cells.findIndex(Boolean);
      if (top < 0) continue;
      used.push(col);
      assert.ok(cells.slice(top).every(Boolean), `${puzzle.name} column ${col + 1} has no gaps`);
    }
    assert.equal(used[0], Math.floor((COLS - used.length) / 2), `${puzzle.name} is centered`);
    assert.equal(used.at(-1) - used[0] + 1, used.length, `${puzzle.name} has no empty columns between blocks`);
  }
});

test('on the known solution, every hint layer points at the stored move', () => {
  for (const [puzzleIndex, puzzle] of PUZZLES.entries()) {
    if (puzzle.set !== 'harbor') continue;
    const state = createGame({ mode: 'puzzle', puzzleIndex });
    state.status = 'playing';
    for (const move of puzzle.solution) {
      const hint = puzzleHint(state);
      assert.deepEqual({ col: hint.col, row: hint.row }, move, puzzle.name);
      assert.equal(hint.nudge, NUDGES[hint.concept]);
      assert.equal(hint.unsure, false);
      const group = getGroup(state, move.col, move.row);
      assert.equal(hint.size, group.length);
      for (const cell of group) assert.ok(cell.col >= hint.area.left && cell.col <= hint.area.right && cell.row >= hint.area.top && cell.row <= hint.area.bottom, `${puzzle.name}: the area holds the group`);
      assert.ok(hint.area.right - hint.area.left > Math.max(...group.map(cell => cell.col)) - Math.min(...group.map(cell => cell.col)) || hint.area.left === 0 || hint.area.right === COLS - 1, 'the area is wider than the group');
      clearAt(state, move.col, move.row);
    }
    assert.equal(state.status, 'won');
    assert.equal(puzzleHint(state), null, 'a finished puzzle has no hint');
  }
});

test('off the known solution, hints find another way through', () => {
  const state = start('Lighthouse');
  const [first] = PUZZLES[indexOf('Lighthouse')].solution;
  const other = puzzleMoves(state).find(move => !getGroup(state, move.col, move.row).some(cell => cell.col === first.col && cell.row === first.row));
  clearAt(state, other.col, other.row);
  assert.equal(state.puzzleProgress, -1, 'the stored line no longer applies');
  for (let moves = 0; state.status === 'playing' && moves < 20; moves++) {
    const hint = puzzleHint(state);
    assert.equal(hint.lost, false);
    assert.equal(hint.unsure, false);
    clearAt(state, hint.col, hint.row);
  }
  assert.equal(state.status, 'won');
  assert.equal(countBlocks(state), 0);
});

test('a hint says when the board can no longer be cleared', () => {
  const siren = start('Siren Song');
  const [biggest] = puzzleMoves(siren);
  assert.equal(biggest.size, 10);
  clearAt(siren, biggest.col, biggest.row);
  assert.equal(siren.status, 'gameOver', 'the siren’s trap strands every block at once');

  const state = start('Harbor Lights');
  const [, lavender] = puzzleMoves(state);
  assert.equal(lavender.size, 6);
  clearAt(state, lavender.col, lavender.row);
  assert.equal(state.status, 'playing', 'the finale’s trap still leaves moves to make');
  assert.equal(findLine(state), null);
  assert.deepEqual(puzzleHint(state), { lost: true });
});

test('the hint search respects a move limit and its budget', () => {
  const limited = start('Lighthouse', ['moveLimit']);
  assert.equal(findLine(limited).length, PUZZLES[indexOf('Lighthouse')].solution.length);
  limited.moveLimit = 1;
  assert.equal(findLine(limited), null, 'no line clears it in one move');
  const finale = start('Harbor Lights');
  finale.puzzleProgress = -1;
  assert.equal(findLine(finale, { budget: 2 }), undefined, 'out of budget, the search does not guess');
  const hint = puzzleHint(finale, { budget: 2 });
  assert.equal(hint.unsure, true);
  assert.equal(hint.size, puzzleMoves(finale)[0].size, 'it falls back to the biggest group');
});

test('older puzzles get layered hints too', () => {
  for (const name of ['Mushroom', 'Four Windows', 'Clockwork']) {
    const state = start(name);
    const hint = puzzleHint(state);
    assert.deepEqual({ col: hint.col, row: hint.row }, PUZZLES[indexOf(name)].solution[0]);
    assert.ok(Object.keys(NUDGES).includes(hint.concept));
    assert.ok(hint.area.left >= 0 && hint.area.right < COLS && hint.area.top >= 0 && hint.area.bottom < ROWS);
  }
});
