import test from 'node:test';
import assert from 'node:assert/strict';
import { COLS, ROWS, MODES, createGame, countBlocks, getGroup, clearAt, addRow, advanceTime, getHint, nextLevel, usePowerup } from '../dist/engine.js';

function fixture(mode = 'classic') {
  const state = createGame({ mode, seed: 12345 });
  state.status = 'playing';
  state.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  return state;
}

function put(state, col, row, color = 0, kind = 'normal', side = 'bottom') {
  const cell = { id: state.nextId++, color, kind, side };
  state.board[row][col] = cell;
  return cell;
}

function group(state, coords, color = 0) {
  return coords.map(([col, row]) => put(state, col, row, color));
}

test('the seven modes and seeded boards are reproducible', () => {
  assert.equal(MODES.length, 7);
  assert.deepEqual(createGame({ seed: 42 }), createGame({ seed: 42 }));
  assert.notDeepEqual(createGame({ seed: 42 }).board, createGame({ seed: 43 }).board);
  const game = createGame({ seed: 42 });
  assert.equal(game.status, 'ready');
  assert.equal(game.board.length, ROWS);
  assert.equal(game.nextRow.length, COLS);
  assert.equal(countBlocks(game), 72);
  assert.equal(createGame({ difficulty: 'normal' }).colors, 4);
  assert.equal(createGame({ difficulty: 'hard' }).colors, 5);
});

test('groups are orthogonal, need at least three, and invalid clicks are inert', () => {
  const state = fixture();
  group(state, [[4, 14], [5, 14]]);
  put(state, 6, 13);
  const snapshot = structuredClone(state);
  assert.equal(getGroup(state, 4, 14).length, 2);
  assert.equal(clearAt(state, 4, 14).valid, false);
  assert.deepEqual(state, snapshot);
  put(state, 5, 13);
  assert.equal(getGroup(state, 4, 14).length, 4);
  const result = clearAt(state, 4, 14);
  assert.equal(result.valid, true);
  assert.equal(result.removed.length, 4);
  assert.equal(countBlocks(state), 0);
  assert.equal(state.score, result.points);
  assert.equal(state.moves, 1);
});

test('clears settle blocks downward and recenter surviving columns in order', () => {
  const state = fixture();
  group(state, [[3, 14], [3, 13], [3, 12]]);
  const left = put(state, 3, 10, 1);
  const right = put(state, 9, 9, 2);
  clearAt(state, 3, 14);
  assert.equal(state.board[14][5].id, left.id);
  assert.equal(state.board[14][6].id, right.id);
  assert.equal(countBlocks(state), 2);
});

test('bombs chain, remove adjacent blockers, and report original coordinates', () => {
  const state = fixture();
  put(state, 5, 13, 0, 'bomb');
  const blocker = put(state, 5, 14, 1, 'stone');
  put(state, 6, 13, 1, 'bomb');
  put(state, 7, 13, 2);
  const distant = put(state, 0, 14, 0);
  const result = clearAt(state, 5, 13);
  assert.equal(result.removed.length, 4);
  assert.deepEqual(result.removed.find(cell => cell.id === blocker.id), { ...blocker, col: 5, row: 14 });
  assert.equal(countBlocks(state), 1);
  assert.equal(state.board[14][5].id, distant.id);
});

test('color bombs remove their color globally while stones resist color matching', () => {
  const state = fixture();
  put(state, 0, 14, 2, 'colorBomb');
  put(state, 11, 10, 2);
  const survivor = put(state, 8, 14, 1);
  const stone = put(state, 4, 14, 2, 'stone');
  const result = clearAt(state, 0, 14);
  assert.equal(result.removed.length, 2);
  assert.deepEqual(state.board[14].filter(Boolean).map(cell => cell.id), [stone.id, survivor.id]);
  assert.equal(clearAt(state, 5, 14).valid, false);
});

test('an anchor divides a fall and cannot be matched as an ordinary block', () => {
  const state = fixture();
  group(state, [[4, 11], [5, 11], [6, 11]]);
  const above = put(state, 4, 5, 1);
  const anchor = put(state, 4, 9, 1, 'anchor');
  const below = put(state, 4, 10, 2);
  clearAt(state, 5, 11);
  assert.equal(state.board[8][5].id, above.id);
  assert.equal(state.board[9][5].id, anchor.id);
  assert.equal(state.board[14][5].id, below.id);
});

test('Strategy only feeds after successful clears and ignores elapsed time', () => {
  const state = fixture('strategy');
  group(state, [[4, 14], [5, 14], [6, 14]]);
  advanceTime(state, 100000);
  assert.equal(state.rowsAdded, 0);
  assert.equal(clearAt(state, 0, 0).valid, false);
  assert.equal(state.rowsAdded, 0);
  clearAt(state, 5, 14);
  assert.equal(state.rowsAdded, 1);
  assert.equal(countBlocks(state), COLS);
});

test('rising rows overflow without deleting the overflowing board', () => {
  const state = fixture();
  put(state, 3, 0);
  const before = structuredClone(state.board);
  assert.equal(addRow(state).type, 'overflow');
  assert.equal(state.status, 'gameOver');
  assert.deepEqual(state.board, before);
  assert.equal(state.rowsAdded, 0);
});

test('ready and paused games do not clear, feed, or consume time', () => {
  for (const status of ['ready', 'paused', 'gameOver', 'won']) {
    const state = fixture('countdown');
    state.status = status;
    group(state, [[4, 14], [5, 14], [6, 14]]);
    const before = structuredClone(state);
    clearAt(state, 5, 14);
    advanceTime(state, 10000);
    addRow(state);
    assert.deepEqual(state, before);
  }
});

test('time advances through multiple feeder boundaries deterministically', () => {
  const once = fixture();
  const chunks = structuredClone(once);
  const interval = once.rowInterval;
  advanceTime(once, interval * 3 + 777);
  for (let step = 0; step < 3; step++) advanceTime(chunks, interval);
  advanceTime(chunks, 777);
  assert.deepEqual(once, chunks);
  assert.equal(once.rowsAdded, 3);
  assert.ok(once.rowProgress > 0);
});

test('the last line starts a timed bonus and nextLevel retains earned points', () => {
  const state = fixture();
  state.rowsAdded = state.rowsTarget - 1;
  state.score = 125;
  addRow(state);
  assert.equal(state.phase, 'bonus');
  assert.equal(state.bonusRemaining, 15000);
  const lines = state.rowsAdded;
  advanceTime(state, 14999);
  assert.equal(state.status, 'playing');
  assert.equal(state.rowsAdded, lines);
  advanceTime(state, 1);
  assert.equal(state.status, 'levelComplete');
  nextLevel(state);
  assert.equal(state.level, 2);
  assert.equal(state.score, 125);
  assert.equal(state.status, 'playing');
  assert.equal(state.phase, 'play');
  assert.equal(state.rowsAdded, 0);
});

test('Countdown has a fixed two-minute clock and clears do not refill it', () => {
  const state = fixture('countdown');
  group(state, [[4, 14], [5, 14], [6, 14]]);
  advanceTime(state, 300);
  clearAt(state, 5, 14);
  assert.equal(state.timeLeft, 119700);
  state.timeLeft = 1;
  advanceTime(state, 5);
  assert.equal(state.status, 'won');
  assert.equal(state.timeLeft, 0);
  assert.equal(state.elapsed, 301);
});

test('Continuous never enters a level bonus and gains speed', () => {
  const state = fixture('continuous');
  state.rowsAdded = state.rowsTarget - 1;
  const interval = state.rowInterval;
  addRow(state);
  assert.equal(state.phase, 'play');
  assert.equal(state.status, 'playing');
  assert.ok(state.rowInterval < interval);
});

test('Slider shifts the stack sideways when a line arrives', () => {
  const state = fixture('slider');
  const marker = put(state, 4, 14, 1);
  addRow(state);
  assert.equal(state.board[13][3].id, marker.id);
  assert.equal(state.rowsAdded, 1);
});

test('Relapse clears preserve opposing gravity and prevent stack collision', () => {
  const state = fixture('relapse');
  group(state, [[4, 6], [5, 6], [6, 6]]);
  const top = put(state, 4, 3, 1, 'normal', 'top');
  const bottom = put(state, 4, 11, 2);
  clearAt(state, 5, 6);
  assert.equal(state.board[0][5].id, top.id);
  assert.equal(state.board[14][5].id, bottom.id);

  const collision = fixture('relapse');
  put(collision, 5, 6, 0, 'normal', 'top');
  put(collision, 5, 7, 1, 'normal', 'bottom');
  collision.nextSide = 'bottom';
  const before = structuredClone(collision.board);
  assert.equal(addRow(collision).type, 'overflow');
  assert.equal(collision.status, 'gameOver');
  assert.deepEqual(collision.board, before);
});

test('Relapse gravity tokens clear a row and switch the feeder side', () => {
  const state = fixture('relapse');
  put(state, 4, 14, 0, 'gravity');
  put(state, 5, 14, 1);
  put(state, 6, 14, 2);
  assert.equal(state.nextSide, 'bottom');
  const result = clearAt(state, 4, 14);
  assert.equal(result.removed.length, 3);
  assert.equal(state.nextSide, 'top');
  assert.ok(state.nextRow.every(cell => cell.side === 'top'));
});

test('hints find a standalone special even if its small group was already visited', () => {
  const state = fixture();
  put(state, 4, 14, 0);
  put(state, 5, 14, 0, 'bomb');
  assert.deepEqual(getHint(state), { col: 5, row: 14, size: 1 });
});

test('Puzzle wins on an empty board and loses when isolated leftovers remain', () => {
  const win = fixture('puzzle');
  group(win, [[4, 14], [5, 14], [6, 14]]);
  assert.equal(clearAt(win, 5, 14).valid, true);
  assert.equal(win.status, 'won');
  const stuck = fixture('puzzle');
  group(stuck, [[4, 14], [5, 14], [6, 14]]);
  put(stuck, 10, 14, 1);
  clearAt(stuck, 5, 14);
  assert.equal(stuck.status, 'gameOver');
  assert.equal(getHint(stuck), null);
});

test('canonical puzzle hints survive clicking any block in the expected group', () => {
  const state = createGame({ mode: 'puzzle', puzzleIndex: 0 });
  state.status = 'playing';
  const hint = getHint(state);
  const alternate = getGroup(state, hint.col, hint.row).find(cell => cell.col !== hint.col || cell.row !== hint.row);
  clearAt(state, alternate.col, alternate.row);
  assert.equal(state.puzzleProgress, 1);
});

test('charcoal bombs and gravity tokens cannot bridge or pad a colored group', () => {
  for (const kind of ['bomb', 'gravity']) {
    const state = fixture();
    group(state, [[4, 13], [4, 14], [6, 13], [6, 14]], 0);
    put(state, 5, 14, 0, kind);
    assert.equal(getGroup(state, 4, 14).length, 2);
    assert.equal(getGroup(state, 5, 14).length, 0);
    assert.equal(clearAt(state, 4, 14).valid, false);
    assert.equal(countBlocks(state), 5);
    assert.equal(clearAt(state, 5, 14).valid, true);
  }
});

test('color matching does not activate charcoal specials through their hidden color', () => {
  const state = fixture();
  put(state, 0, 14, 2, 'colorBomb');
  put(state, 2, 14, 2);
  const bomb = put(state, 8, 14, 2, 'bomb');
  const neighbor = put(state, 9, 14, 1);
  const result = clearAt(state, 0, 14);
  assert.equal(result.removed.length, 2);
  assert.deepEqual(state.board[14].filter(Boolean).map(cell => cell.id), [bomb.id, neighbor.id]);
});

test('blast and color boosters return ordinary scoring and clear snapshots', () => {
  const blast = fixture();
  group(blast, [[5, 13], [5, 14], [6, 14]]);
  const result = usePowerup(blast, 'blast');
  assert.equal(result.type, 'powerup');
  assert.equal(result.valid, true);
  assert.equal(result.removed.length, 3);
  assert.ok(result.removed.some(cell => cell.kind === 'bomb'));
  assert.equal(blast.score, result.points);
  assert.equal(countBlocks(blast), 0);

  const color = fixture();
  group(color, [[0, 14], [2, 12], [5, 10], [8, 8]], 2);
  group(color, [[4, 14], [6, 14]], 1);
  const colorResult = usePowerup(color, 'color');
  assert.equal(colorResult.valid, true);
  assert.equal(colorResult.removed.length, 4);
  assert.ok(colorResult.removed.every(cell => cell.color === 2));
  assert.equal(countBlocks(color), 2);
});

test('powerups reject inactive games and unavailable targets without mutation', () => {
  for (const status of ['ready', 'paused', 'gameOver', 'won']) {
    for (const type of ['blast', 'color', 'freeze']) {
      const state = createGame({ seed: 8 });
      state.status = status;
      const before = structuredClone(state);
      assert.equal(usePowerup(state, type).valid, false);
      assert.deepEqual(state, before);
    }
  }
  const empty = fixture();
  for (const type of ['blast', 'color', 'unrecognized']) {
    const before = structuredClone(empty);
    assert.equal(usePowerup(empty, type).valid, false);
    assert.deepEqual(empty, before);
  }
});

test('freeze is limited to timed play and extends by ten seconds per use', () => {
  for (const mode of ['strategy', 'puzzle']) {
    const state = fixture(mode);
    assert.equal(usePowerup(state, 'freeze').valid, false);
    assert.equal(state.freezeRemaining, 0);
  }
  const bonus = fixture();
  bonus.phase = 'bonus';
  assert.equal(usePowerup(bonus, 'freeze').valid, false);
  const state = fixture();
  assert.equal(usePowerup(state, 'freeze').valid, true);
  assert.equal(state.freezeRemaining, 10000);
  usePowerup(state, 'freeze');
  assert.equal(state.freezeRemaining, 20000);
});

test('freeze preserves feeder progress and resumes at the exact elapsed boundary', () => {
  const state = fixture();
  state.rowProgress = 0.4;
  usePowerup(state, 'freeze');
  const chunks = structuredClone(state);
  advanceTime(state, 10000 + state.rowInterval / 4);
  advanceTime(chunks, 10000);
  advanceTime(chunks, chunks.rowInterval / 4);
  assert.deepEqual(state, chunks);
  assert.equal(state.freezeRemaining, 0);
  assert.equal(state.rowsAdded, 0);
  assert.ok(Math.abs(state.rowProgress - 0.65) < 1e-10);
  assert.equal(state.elapsed, 10000 + state.rowInterval / 4);
});

test('freeze continues consuming Countdown and bonus time and permits manual feeding', () => {
  const countdown = fixture('countdown');
  countdown.timeLeft = 6000;
  usePowerup(countdown, 'freeze');
  advanceTime(countdown, 7000);
  assert.equal(countdown.status, 'won');
  assert.equal(countdown.timeLeft, 0);
  assert.equal(countdown.freezeRemaining, 4000);
  assert.equal(countdown.rowsAdded, 0);

  const bonus = fixture();
  usePowerup(bonus, 'freeze');
  bonus.rowsAdded = bonus.rowsTarget - 1;
  assert.equal(addRow(bonus).valid, true);
  assert.equal(bonus.phase, 'bonus');
  advanceTime(bonus, 5000);
  assert.equal(bonus.bonusRemaining, 10000);
  assert.equal(bonus.freezeRemaining, 5000);
});
