import test from 'node:test';
import assert from 'node:assert/strict';
import { COLS, ROWS, MODES, SPECIAL_RULES, createGame, countBlocks, getGroup, clearAt, addRow, advanceTime, getHint, nextLevel, usePowerup } from '../dist/engine.js';

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

test('a black bomb clears a 5×5 area and consumes other bombs without a chain', () => {
  const state = fixture();
  const clicked = put(state, 5, 12, 0, 'bomb');
  const blocker = put(state, 5, 14, 1, 'stone');
  const adjacentBomb = put(state, 7, 12, 1, 'bomb');
  put(state, 3, 10, 2);
  const distant = put(state, 8, 12, 0);
  const result = clearAt(state, 5, 12);
  assert.equal(result.removed.length, 4);
  assert.deepEqual(result.removed.find(cell => cell.id === blocker.id), { ...blocker, col: 5, row: 14 });
  assert.deepEqual(result.activated.map(cell => cell.id), [clicked.id]);
  assert.deepEqual(result.absorbed.map(cell => cell.id), [adjacentBomb.id]);
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

test('Relapse closes each side’s column gaps without moving the centered opposite side', () => {
  for (const side of ['top', 'bottom']) {
    const state = fixture('relapse');
    const opposite = side === 'top' ? 'bottom' : 'top';
    const edge = side === 'top' ? 0 : ROWS - 1;
    const oppositeEdge = side === 'top' ? ROWS - 1 : 0;
    const clearedRows = side === 'top' ? [0, 1, 2] : [12, 13, 14];
    const cleared = clearedRows.map(row => put(state, 4, row, 0, 'normal', side));
    const left = put(state, 2, edge, 1, 'normal', side);
    const upper = put(state, 8, side === 'top' ? 0 : 13, 2, 'normal', side);
    const lower = put(state, 8, side === 'top' ? 1 : 14, 3, 'normal', side);
    const stationary = [4, 5, 6].map(col => put(state, col, oppositeEdge, 1, 'normal', opposite));

    const result = clearAt(state, 4, clearedRows[0]);

    assert.equal(result.valid, true);
    assert.deepEqual(new Set(result.removed.map(cell => cell.id)), new Set(cleared.map(cell => cell.id)));
    assert.deepEqual(state.board[edge][5], left);
    assert.deepEqual(state.board[side === 'top' ? 0 : 13][6], upper);
    assert.deepEqual(state.board[side === 'top' ? 1 : 14][6], lower);
    for (const [index, col] of [4, 5, 6].entries()) {
      assert.deepEqual(state.board[oppositeEdge][col], stationary[index]);
    }
    assert.equal(countBlocks(state), 6);
    assert.equal(state.status, 'playing');
  }
});

test('Relapse independently centers different top and bottom footprints in column and vertical order', () => {
  const state = fixture('relapse');
  const cleared = group(state, [[11, 6], [11, 7], [11, 8]]);
  const topFirst = put(state, 1, 3, 1, 'normal', 'top');
  const topSecond = put(state, 1, 5, 2, 'normal', 'top');
  const topRight = put(state, 9, 4, 3, 'normal', 'top');
  const bottomFirst = put(state, 0, 10, 3);
  const bottomSecond = put(state, 0, 12, 2);
  const bottomMiddle = put(state, 3, 11, 1);
  const bottomRight = put(state, 10, 14, 3);
  const expected = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  expected[0][5] = topFirst;
  expected[1][5] = topSecond;
  expected[0][6] = topRight;
  expected[13][4] = bottomFirst;
  expected[14][4] = bottomSecond;
  expected[14][5] = bottomMiddle;
  expected[14][6] = bottomRight;

  const result = clearAt(state, 11, 7);

  assert.equal(result.valid, true);
  assert.deepEqual(new Set(result.removed.map(cell => cell.id)), new Set(cleared.map(cell => cell.id)));
  assert.deepEqual(state.board, expected);
  assert.equal(state.status, 'playing');
});

test('Relapse independent compaction allows touching stacks and preserves survivors if they overlap', () => {
  for (const topHeight of [7, 8]) {
    const state = fixture('relapse');
    group(state, [[0, 12], [0, 13], [0, 14]]);
    const top = Array.from({ length: topHeight }, (_, row) => put(state, 1, row, 1, 'normal', 'top'));
    const bottom = Array.from({ length: 8 }, (_, index) => put(state, 10, 7 + index, 2));
    const afterRemoval = structuredClone(state.board);
    for (const row of [12, 13, 14]) afterRemoval[row][0] = null;

    const result = clearAt(state, 0, 14);

    assert.equal(result.valid, true);
    assert.equal(result.removed.length, 3);
    assert.equal(countBlocks(state), topHeight + bottom.length);
    if (topHeight === 7) {
      const expected = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
      top.forEach((cell, row) => { expected[row][5] = cell; });
      bottom.forEach((cell, index) => { expected[7 + index][5] = cell; });
      assert.deepEqual(state.board, expected);
      assert.equal(state.status, 'playing');
    } else {
      assert.equal(state.status, 'gameOver');
      assert.deepEqual(state.board, afterRemoval);
    }
  }
});

test('Relapse gravity transfers its entire side into the opposite stack in both directions', () => {
  for (const fromSide of ['top', 'bottom']) {
    const state = fixture('relapse');
    const toSide = fromSide === 'top' ? 'bottom' : 'top';
    const clickRow = fromSide === 'top' ? 0 : 14;
    const clicked = put(state, 5, clickRow, 0, 'gravity', fromSide);
    const first = put(state, 5, fromSide === 'top' ? 1 : 12, 1, 'normal', fromSide);
    const second = put(state, 5, fromSide === 'top' ? 2 : 13, 2, 'normal', fromSide);
    const otherColumn = put(state, 6, clickRow, 1, 'colorBomb', fromSide);
    const existing = put(state, 5, fromSide === 'top' ? 14 : 0, 2, 'normal', toSide);
    const feederBefore = structuredClone(state.nextRow);
    const result = clearAt(state, 5, clickRow);
    assert.deepEqual(result.removed.map(cell => cell.id), [clicked.id]);
    assert.equal(result.activated[0].kind, 'gravity');
    assert.equal(result.absorbed.length, 0);
    assert.deepEqual(new Set(result.transferred.map(cell => cell.id)), new Set([first.id, second.id, otherColumn.id]));
    assert.ok(result.transferred.every(cell => cell.fromSide === fromSide && cell.toSide === toSide));
    const remaining = state.board.flat().filter(Boolean);
    assert.equal(remaining.length, 4);
    assert.ok(remaining.every(cell => cell.side === toSide));
    const combined = state.board.map(line => line[5]).filter(Boolean).map(cell => cell.id);
    assert.deepEqual(combined, fromSide === 'top' ? [first.id, second.id, existing.id] : [existing.id, first.id, second.id]);
    assert.equal(state.board[fromSide === 'top' ? 14 : 0][6].id, otherColumn.id);
    assert.equal(state.nextSide, 'bottom');
    assert.deepEqual(state.nextRow, feederBefore);
    assert.equal(state.status, 'playing');
    // The shifted board must still accept the next alternating feeder safely.
    assert.equal(addRow(state).valid, true);
  }
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

test('normal matches silently consume adjacent specials once, without their effects', () => {
  const state = fixture('relapse');
  group(state, [[4, 12], [4, 13], [4, 14]], 0);
  const bomb = put(state, 5, 13, 2, 'bomb');
  const colored = put(state, 3, 14, 1, 'colorBomb');
  const gravity = put(state, 4, 11, 2, 'gravity');
  const unconnected = put(state, 6, 13, 1, 'bomb');
  const distantColor = put(state, 9, 14, 1);
  const result = clearAt(state, 4, 14);
  assert.equal(result.removed.length, 6);
  assert.deepEqual(new Set(result.absorbed.map(cell => cell.id)), new Set([bomb.id, colored.id, gravity.id]));
  assert.deepEqual(result.activated, []);
  assert.deepEqual(result.transferred, []);
  assert.deepEqual(new Set(state.board.flat().filter(Boolean).map(cell => cell.id)), new Set([unconnected.id, distantColor.id]));
  assert.ok(state.board.flat().filter(Boolean).every(cell => cell.side === 'bottom'));
});

test('diagonally touching specials survive a match, including at the board boundary', () => {
  const state = fixture();
  group(state, [[0, 12], [0, 13], [0, 14]], 0);
  const diagonal = put(state, 1, 11, 1, 'colorBomb');
  const result = clearAt(state, 0, 14);
  assert.equal(result.removed.length, 3);
  assert.deepEqual(result.absorbed, []);
  assert.equal(countBlocks(state), 1);
  assert.equal(state.board[14][5].id, diagonal.id);
});

test('color bombs do not pad a small normal group or bridge two groups', () => {
  const state = fixture();
  group(state, [[4, 13], [4, 14], [6, 13], [6, 14]], 1);
  put(state, 5, 14, 1, 'colorBomb');
  assert.equal(getGroup(state, 4, 14).length, 2);
  assert.deepEqual(getGroup(state, 5, 14), []);
  const before = structuredClone(state);
  assert.equal(clearAt(state, 4, 14).valid, false);
  assert.deepEqual(state, before);
  const result = clearAt(state, 5, 14);
  assert.equal(result.removed.length, 5);
  assert.equal(result.activated[0].kind, 'colorBomb');
});

test('each color bomb clears only its own normal color, absorbing touching specials silently', () => {
  for (let color = 0; color < 5; color++) {
    const state = fixture('relapse');
    const clicked = put(state, 0, 0, color, 'colorBomb', 'top');
    const matchingTop = put(state, 2, 0, color, 'normal', 'top');
    const matchingBottom = put(state, 9, 14, color);
    const sameColorBomb = put(state, 3, 0, color, 'colorBomb', 'top');
    const differentColorBomb = put(state, 10, 14, (color + 1) % 5, 'colorBomb');
    const gravity = put(state, 9, 13, color, 'gravity');
    const distantBomb = put(state, 6, 14, color, 'colorBomb');
    const otherColor = put(state, 7, 14, (color + 1) % 5);
    const result = clearAt(state, 0, 0);
    assert.deepEqual(new Set(result.removed.map(cell => cell.id)), new Set([clicked.id, matchingTop.id, matchingBottom.id, sameColorBomb.id, differentColorBomb.id, gravity.id]));
    assert.deepEqual(result.activated.map(cell => cell.id), [clicked.id]);
    assert.deepEqual(result.transferred, []);
    assert.deepEqual(new Set(state.board.flat().filter(Boolean).map(cell => cell.id)), new Set([distantBomb.id, otherColor.id]));
  }
});

test('a corner blast clips to the board without reaching outside its radius', () => {
  const state = fixture();
  put(state, 0, 14, 0, 'bomb');
  put(state, 2, 12, 1, 'anchor');
  const outside = put(state, 3, 11, 2);
  const result = clearAt(state, 0, 14);
  assert.equal(result.removed.length, 2);
  assert.equal(countBlocks(state), 1);
  assert.equal(state.board[14][5].id, outside.id);
});

test('natural specials are rare, with both bomb types and every active color represented', () => {
  for (const mode of ['classic', 'relapse']) {
    const counts = { bomb: 0, colorBomb: 0, gravity: 0 };
    const colors = new Set();
    let total = 0;
    for (let seed = 1; seed <= 500; seed++) {
      const state = createGame({ mode, difficulty: 'hard', seed });
      for (const cell of [...state.board.flat().filter(Boolean), ...state.nextRow]) {
        total++;
        if (cell.kind in counts) counts[cell.kind]++;
        if (cell.kind === 'colorBomb') colors.add(cell.color);
      }
    }
    const fraction = Object.values(counts).reduce((sum, count) => sum + count, 0) / total;
    assert.ok(fraction > 0.005 && fraction < (mode === 'relapse' ? 0.014 : 0.012), `${mode} special frequency ${fraction}`);
    assert.ok(counts.bomb > 100 && counts.colorBomb > 100);
    assert.deepEqual([...colors].sort(), [0, 1, 2, 3, 4]);
    assert.equal(counts.gravity > 0, mode === 'relapse');
  }
  assert.equal(SPECIAL_RULES.blastRadius, 2);
});
