import test from 'node:test';
import assert from 'node:assert/strict';
import { COLS, ROWS, URGENCY_RULES, createGame, getFlowMultiplier, advanceTime, addRow, clearAt, usePowerup } from '../dist/engine.js';

function fixture(mode = 'countdown', phase = 'play') {
  const state = createGame({ mode, seed: 12345 });
  state.status = 'playing';
  state.phase = phase;
  state.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  if (phase === 'bonus') {
    state.rowsAdded = state.rowsTarget;
    state.bonusRemaining = 15000;
  }
  state.board[ROWS - 1][5] = { id: state.nextId++, color: 0, kind: 'normal', side: 'bottom' };
  return state;
}

function close(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-8, `${label}: expected ${expected}, received ${actual}`);
}

function equivalent(actual, expected) {
  const left = structuredClone(actual);
  const right = structuredClone(expected);
  for (const key of ['rowProgress', 'elapsed', 'timeLeft', 'bonusRemaining', 'freezeRemaining']) {
    close(left[key], right[key], key);
    delete left[key];
    delete right[key];
  }
  assert.deepEqual(left, right);
}

test('urgency belongs to the active round clock and stops when play stops', () => {
  assert.deepEqual(URGENCY_RULES, { windowMs: 5000, speedMultiplier: 1.3 });
  const state = fixture();
  for (const [remaining, multiplier] of [[5001, 1], [5000, 1.3], [1, 1.3], [0, 1]]) {
    state.timeLeft = remaining;
    assert.equal(getFlowMultiplier(state), multiplier);
  }
  state.timeLeft = 3000;
  for (const status of ['ready', 'paused', 'gameOver', 'won', 'levelComplete']) {
    state.status = status;
    assert.equal(getFlowMultiplier(state), 1);
  }
  state.status = 'playing';
  state.phase = 'bonus';
  state.bonusRemaining = 6000;
  assert.equal(getFlowMultiplier(state), 1);
  state.bonusRemaining = 5000;
  state.timeLeft = 6000;
  assert.equal(getFlowMultiplier(state), 1.3);
  state.bonusRemaining = 0;
  assert.equal(getFlowMultiplier(state), 1);
  const endless = fixture('continuous');
  endless.timeLeft = 3000;
  assert.equal(getFlowMultiplier(endless), 1);
});

test('Countdown feeds exactly 30% faster for its last five real seconds', () => {
  const state = fixture();
  state.timeLeft = 6000;
  advanceTime(state, 1000);
  close(state.rowProgress, 1000 / state.rowInterval, 'normal progress');
  assert.equal(state.timeLeft, 5000);
  advanceTime(state, 1000);
  close(state.rowProgress, 2300 / state.rowInterval, 'urgent progress');
  assert.equal(state.timeLeft, 4000);
  assert.equal(state.elapsed, 2000);
  assert.equal(state.rowsAdded, 0);
});

test('large and incremental ticks agree across row arrivals and the urgency boundary', () => {
  for (const [mode, phase] of [['countdown', 'play'], ['classic', 'bonus']]) {
    const state = fixture(mode, phase);
    state.rowProgress = 0.3;
    if (phase === 'play') state.timeLeft = 15000;
    const chunks = structuredClone(state);
    advanceTime(state, 14000);
    for (const delta of [501, 1499, 4200, 2800, 1000, 3000, 1000]) advanceTime(chunks, delta);
    equivalent(state, chunks);
    assert.equal(state.status, 'playing');
    assert.equal(state.rowsAdded, (phase === 'bonus' ? state.rowsTarget : 0) + 2);
    close(phase === 'bonus' ? state.bonusRemaining : state.timeLeft, 1000, 'remaining clock');
  }
});

test('Classic, Strategy, Slider, and Relapse keep feeding throughout their bonus rounds', () => {
  for (const mode of ['classic', 'strategy', 'slider', 'relapse']) {
    const state = fixture(mode, 'bonus');
    advanceTime(state, 1000);
    close(state.rowProgress, 1000 / state.rowInterval, `${mode} normal bonus progress`);
    assert.equal(state.bonusRemaining, 14000);
    advanceTime(state, 9000);
    const beforeUrgency = state.rowProgress;
    const beforeRows = state.rowsAdded;
    advanceTime(state, 1000);
    close(state.rowProgress, beforeUrgency + 1300 / state.rowInterval, `${mode} urgent bonus progress`);
    assert.equal(state.rowsAdded, beforeRows);
    assert.ok(state.rowsAdded > state.rowsTarget, `${mode} must receive additional bonus rows`);
    assert.equal(state.bonusRemaining, 4000);
    assert.equal(state.status, 'playing');
  }
});

test('bonus row arrivals never start the bonus again or refill its timer', () => {
  const state = fixture('strategy');
  state.rowsAdded = state.rowsTarget - 1;
  assert.equal(addRow(state).valid, true);
  assert.equal(state.phase, 'bonus');
  assert.equal(state.bonusRemaining, 15000);
  advanceTime(state, state.rowInterval);
  assert.equal(state.rowsAdded, state.rowsTarget + 1);
  assert.equal(state.bonusRemaining, 8800);
  assert.equal(addRow(state).valid, true);
  assert.equal(state.rowsAdded, state.rowsTarget + 2);
  assert.equal(state.bonusRemaining, 8800);
});

test('freeze preserves the feeder while both round clocks consume real seconds', () => {
  for (const [mode, phase] of [['countdown', 'play'], ['strategy', 'bonus']]) {
    const state = fixture(mode, phase);
    if (phase === 'play') state.timeLeft = 14000;
    else state.bonusRemaining = 14000;
    assert.equal(usePowerup(state, 'freeze').valid, true);
    advanceTime(state, 8000);
    assert.equal(state.freezeRemaining, 2000);
    assert.equal(state.rowProgress, 0);
    assert.equal(phase === 'bonus' ? state.bonusRemaining : state.timeLeft, 6000);
    const chunks = structuredClone(state);
    advanceTime(state, 3000);
    for (const delta of [1000, 1000, 1000]) advanceTime(chunks, delta);
    equivalent(state, chunks);
    assert.equal(state.freezeRemaining, 0);
    close(state.rowProgress, 1300 / state.rowInterval, 'post-freeze urgent progress');
    assert.equal(phase === 'bonus' ? state.bonusRemaining : state.timeLeft, 3000);
    assert.equal(state.elapsed, 11000);
  }
});

test('ready, paused, and completed rounds do not feed or consume their final seconds', () => {
  for (const status of ['ready', 'paused', 'gameOver', 'won', 'levelComplete']) {
    for (const [mode, phase] of [['countdown', 'play'], ['classic', 'bonus']]) {
      const state = fixture(mode, phase);
      state.status = status;
      state.timeLeft = 3000;
      state.bonusRemaining = 3000;
      state.rowProgress = 0.9;
      const before = structuredClone(state);
      advanceTime(state, 10000);
      addRow(state);
      assert.deepEqual(state, before);
    }
  }
});

test('timer expiry wins over a simultaneous urgent row arrival', () => {
  for (const [mode, phase, status] of [['countdown', 'play', 'won'], ['classic', 'bonus', 'levelComplete']]) {
    const state = fixture(mode, phase);
    if (phase === 'play') state.timeLeft = 1000;
    else state.bonusRemaining = 1000;
    state.rowProgress = 1 - 1300 / state.rowInterval;
    const beforeBoard = structuredClone(state.board);
    const beforeRows = state.rowsAdded;
    advanceTime(state, 2000);
    assert.equal(state.status, status);
    close(state.elapsed, 1000, 'elapsed at expiry');
    assert.equal(phase === 'bonus' ? state.bonusRemaining : state.timeLeft, 0);
    assert.equal(state.rowsAdded, beforeRows);
    assert.deepEqual(state.board, beforeBoard);
  }
});

test('an urgent bonus feed still detects overflow without changing the board', () => {
  const state = fixture('classic', 'bonus');
  state.bonusRemaining = 4000;
  state.rowProgress = 0.99;
  state.board[0][3] = { id: state.nextId++, color: 1, kind: 'normal', side: 'bottom' };
  const beforeBoard = structuredClone(state.board);
  const beforeRows = state.rowsAdded;
  const untilRow = 0.01 * state.rowInterval / 1.3;
  advanceTime(state, 1000);
  assert.equal(state.status, 'gameOver');
  assert.equal(state.rowsAdded, beforeRows);
  assert.deepEqual(state.board, beforeBoard);
  close(state.elapsed, untilRow, 'overflow elapsed');
  close(state.bonusRemaining, 4000 - untilRow, 'bonus time at overflow');
});

test('clearing the whole board still finishes a bonus before another urgent row arrives', () => {
  const state = fixture('classic', 'bonus');
  state.bonusRemaining = 4000;
  state.rowProgress = 0.9;
  for (const col of [4, 6]) {
    state.board[ROWS - 1][col] = { id: state.nextId++, color: 0, kind: 'normal', side: 'bottom' };
  }
  const result = clearAt(state, 5, ROWS - 1);
  assert.equal(result.valid, true);
  assert.equal(state.status, 'levelComplete');
  assert.equal(state.bonusRemaining, 0);
  assert.ok(result.points > 0);
  const before = structuredClone(state);
  advanceTime(state, 10000);
  assert.deepEqual(state, before);
});
