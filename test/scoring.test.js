import test from 'node:test';
import assert from 'node:assert/strict';
import { COLS, ROWS, MODES, createGame, countBlocks, clearAt, previewClear, scoringForClear, advanceTime, nextLevel } from '../dist/engine.js';

function fixture(mode = 'classic') {
  const state = createGame({ mode, seed: 32145 });
  state.status = 'playing';
  state.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  return state;
}

function put(state, col, row, color = 0, kind = 'normal', side = 'bottom') {
  const cell = { id: state.nextId++, color, kind, side };
  state.board[row][col] = cell;
  return cell;
}

function group(state, col, row, size = 3, color = 0, side = 'bottom') {
  return Array.from({ length: size }, (_, index) => put(state, col + index, row, color, 'normal', side));
}

function locationOf(state, cell) {
  for (let row = 0; row < ROWS; row++) {
    const col = state.board[row].findIndex(candidate => candidate?.id === cell.id);
    if (col !== -1) return [col, row];
  }
  throw new Error(`Block ${cell.id} was not found`);
}

test('group size multiplies a per-block base while preserving established clear values', () => {
  for (const size of [1, 2, 3, 6, 10, 25]) {
    const scoring = scoringForClear(size);
    assert.equal(scoring.clearedCount, size);
    assert.equal(scoring.basePoints, size >= 3 ? size * 20 : size * (size + 1) * 5);
    assert.equal(scoring.sizeMultiplier, size >= 3 ? (size + 1) / 4 : 1);
    assert.equal(scoring.movePoints, size * (size + 1) * 5);
    assert.equal(scoring.clearBonusPoints, 0);
    assert.equal(scoring.totalPoints, scoring.movePoints);
    assert.deepEqual(scoring.clearedSides, []);
  }
  assert.ok(scoringForClear(10).sizeMultiplier > scoringForClear(6).sizeMultiplier);
});

test('streak and bonus-round multipliers combine with clear rewards without fractional points', () => {
  for (const [combo, multiplier] of [[0, 1], [1, 1], [2, 1.15], [5, 1.6], [99, 1.6]]) {
    assert.equal(scoringForClear(6, { combo }).streakMultiplier, multiplier);
  }

  const board = scoringForClear(6, { combo: 2, clearedSides: ['board'] });
  assert.equal(board.movePoints, 242);
  assert.equal(board.clearMultiplier, 2);
  assert.equal(board.clearBonusPoints, 242);
  assert.equal(board.totalPoints, 484);
  assert.equal(board.combinedMultiplier, board.sizeMultiplier * board.streakMultiplier * board.roundMultiplier * board.clearMultiplier);

  const both = scoringForClear(6, { combo: 2, phase: 'bonus', clearedSides: ['top', 'bottom'] });
  assert.equal(both.roundMultiplier, 2);
  assert.equal(both.clearMultiplier, 3);
  assert.equal(both.movePoints, 483);
  assert.equal(both.clearBonusPoints, 966);
  assert.equal(both.totalPoints, 1449);
  assert.equal(both.totalPoints, both.movePoints + both.clearBonusPoints);
});

test('every mode rewards group size and a full clear in ordinary and bonus play', () => {
  for (const { id: mode } of MODES) {
    for (const phase of ['play', 'bonus']) {
      const state = fixture(mode);
      state.phase = phase;
      state.score = 100;
      group(state, 3, ROWS - 1, 6);
      const result = clearAt(state, 3, ROWS - 1);
      const context = `${mode}, ${phase}`;

      assert.equal(result.valid, true, context);
      assert.equal(result.scoring.sizeMultiplier, 1.75, context);
      assert.equal(result.scoring.roundMultiplier, phase === 'bonus' ? 2 : 1, context);
      assert.deepEqual(result.scoring.clearedSides, mode === 'relapse' ? ['bottom'] : ['board'], context);
      assert.equal(result.scoring.clearMultiplier, 2, context);
      assert.equal(result.points, phase === 'bonus' ? 840 : 420, context);
      assert.equal(state.score, 100 + result.points, context);
      assert.equal(result.points, result.scoring.totalPoints, context);
      assert.deepEqual(state.lastScoring, result.scoring, context);
    }
  }
});

test('Strategy awards its full-board bonus before the next row refills the board', () => {
  const state = fixture('strategy');
  group(state, 4, ROWS - 1);
  const result = clearAt(state, 4, ROWS - 1);

  assert.equal(state.rowsAdded, 1);
  assert.equal(countBlocks(state), COLS);
  assert.deepEqual(result.scoring.clearedSides, ['board']);
  assert.equal(result.points, 120);
});

test('the last scoring breakdown survives a level transition and an invalid click', () => {
  const state = fixture();
  assert.equal(state.lastScoring, null);
  state.phase = 'bonus';
  group(state, 4, ROWS - 1);
  const result = clearAt(state, 4, ROWS - 1);
  assert.equal(state.status, 'playing');
  advanceTime(state, 1);
  assert.equal(state.status, 'levelComplete');
  nextLevel(state);
  assert.equal(state.status, 'playing');
  assert.equal(state.score, result.points);
  assert.deepEqual(state.lastScoring, result.scoring);
  clearAt(state, 0, 0);
  assert.deepEqual(state.lastScoring, result.scoring);
});

test('Relapse rewards clearing either occupied side without requiring the other side to clear', () => {
  for (const side of ['top', 'bottom']) {
    const state = fixture('relapse');
    const opposite = side === 'top' ? 'bottom' : 'top';
    const row = side === 'top' ? 0 : ROWS - 1;
    group(state, 4, row, 3, 0, side);
    put(state, 5, side === 'top' ? ROWS - 1 : 0, 1, 'normal', opposite);
    const result = clearAt(state, 4, row);

    assert.deepEqual(result.scoring.clearedSides, [side]);
    assert.equal(result.scoring.clearMultiplier, 2);
    assert.equal(result.points, 120);
    assert.equal(countBlocks(state), 1);
  }
});

test('an already-empty Relapse side cannot award a second clear bonus', () => {
  const state = fixture('relapse');
  group(state, 4, 0, 3, 0, 'top');
  const bottom = group(state, 4, ROWS - 1, 3, 1);
  put(state, 9, ROWS - 1, 2, 'stone');
  const first = clearAt(state, 4, 0);
  assert.deepEqual(first.scoring.clearedSides, ['top']);

  const second = clearAt(state, ...locationOf(state, bottom[0]));
  assert.deepEqual(second.scoring.clearedSides, []);
  assert.equal(second.scoring.clearMultiplier, 1);
  assert.equal(second.scoring.clearBonusPoints, 0);
  assert.equal(countBlocks(state), 1);
});

test('a color bomb wiping both Relapse sides earns one combined threefold reward', () => {
  const state = fixture('relapse');
  put(state, 5, ROWS - 1, 2, 'colorBomb');
  put(state, 1, 0, 2, 'normal', 'top');
  put(state, 9, ROWS - 1, 2);
  const result = clearAt(state, 5, ROWS - 1);

  assert.equal(result.removed.length, 3);
  assert.deepEqual(new Set(result.scoring.clearedSides), new Set(['top', 'bottom']));
  assert.equal(result.scoring.clearMultiplier, 3);
  assert.equal(result.scoring.movePoints, 60);
  assert.equal(result.scoring.clearBonusPoints, 120);
  assert.equal(result.points, 180);
});

test('a black bomb scores a two-side wipe and counts absorbed specials in its size reward', () => {
  const state = fixture('relapse');
  put(state, 5, 7, 0, 'bomb', 'top');
  put(state, 4, 6, 1, 'normal', 'top');
  put(state, 5, 8, 2);
  put(state, 6, 8, 1, 'colorBomb');
  const result = clearAt(state, 5, 7);

  assert.equal(result.removed.length, 4);
  assert.equal(result.absorbed.length, 1);
  assert.equal(result.scoring.clearedCount, 4);
  assert.equal(result.scoring.sizeMultiplier, 1.25);
  assert.deepEqual(new Set(result.scoring.clearedSides), new Set(['top', 'bottom']));
  assert.equal(result.points, 300);
});

test('gravity transfer does not qualify as clearing the transferred side', () => {
  for (const side of ['top', 'bottom']) {
    const state = fixture('relapse');
    const row = side === 'top' ? 0 : ROWS - 1;
    put(state, 4, row, 0, 'gravity', side);
    put(state, 5, row, 1, 'normal', side);
    put(state, 6, row, 2, 'normal', side);
    const result = clearAt(state, 4, row);

    assert.equal(result.transferred.length, 2);
    assert.equal(result.scoring.clearedCount, 1);
    assert.deepEqual(result.scoring.clearedSides, []);
    assert.equal(result.scoring.clearMultiplier, 1);
    assert.equal(result.scoring.clearBonusPoints, 0);
    assert.equal(result.points, 10);
  }
});

test('timed streak points expire, while Strategy and Puzzle do not create timed streaks', () => {
  for (const mode of ['classic', 'strategy', 'puzzle']) {
    const state = fixture(mode);
    if (mode === 'strategy') state.nextRow = Array.from({ length: COLS }, () => ({ id: state.nextId++, color: 3, kind: 'stone', side: 'bottom' }));
    const first = group(state, 0, ROWS - 1, 3, 0);
    const second = group(state, 5, ROWS - 1, 3, 1);
    const third = group(state, 8, ROWS - 1, 3, 2);
    put(state, 11, ROWS - 1, 3, 'stone');
    assert.equal(clearAt(state, ...locationOf(state, first[0])).scoring.streakMultiplier, 1);
    advanceTime(state, 1000);
    const result = clearAt(state, ...locationOf(state, second[0]));
    assert.equal(result.scoring.streakMultiplier, mode === 'classic' ? 1.15 : 1);
    assert.equal(result.points, mode === 'classic' ? 69 : 60);

    advanceTime(state, 2500);
    assert.equal(clearAt(state, ...locationOf(state, third[0])).scoring.streakMultiplier, 1);
  }
});

test('preview uses the actual clear event without changing the board, RNG, score, or timers', () => {
  const candidates = [];

  const bonus = fixture();
  bonus.phase = 'bonus';
  bonus.bonusRemaining = 12345;
  bonus.combo = 2;
  bonus.elapsed = 2000;
  bonus.lastClearAt = 1500;
  group(bonus, 3, ROWS - 1, 6);
  candidates.push([bonus, 3, ROWS - 1]);

  const strategy = fixture('strategy');
  group(strategy, 4, ROWS - 1);
  candidates.push([strategy, 4, ROWS - 1]);

  const relapse = fixture('relapse');
  put(relapse, 5, ROWS - 1, 2, 'colorBomb');
  put(relapse, 1, 0, 2, 'normal', 'top');
  put(relapse, 9, ROWS - 1, 2);
  candidates.push([relapse, 5, ROWS - 1]);

  const gravity = fixture('relapse');
  put(gravity, 4, 0, 0, 'gravity', 'top');
  put(gravity, 5, 0, 1, 'normal', 'top');
  candidates.push([gravity, 4, 0]);

  for (const [state, col, row] of candidates) {
    const before = structuredClone(state);
    const preview = previewClear(state, col, row);
    assert.deepEqual(state, before);
    const applied = structuredClone(state);
    assert.deepEqual(preview, clearAt(applied, col, row));
    assert.equal(preview.points, preview.scoring.totalPoints);
    assert.deepEqual(state, before);
  }
});

test('invalid and inactive previews leave state intact and contain no scoring breakdown', () => {
  const state = fixture();
  group(state, 4, ROWS - 1, 2);
  for (const [status, col, row] of [['playing', 4, ROWS - 1], ['playing', 0, 0], ['playing', -1, 0], ['playing', 0, ROWS], ['ready', 4, ROWS - 1], ['paused', 4, ROWS - 1]]) {
    state.status = status;
    const before = structuredClone(state);
    const result = previewClear(state, col, row);
    assert.equal(result.valid, false);
    assert.equal(result.points, 0);
    assert.equal(result.scoring, null);
    assert.deepEqual(state, before);
  }
});
