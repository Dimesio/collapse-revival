import test from 'node:test';
import assert from 'node:assert/strict';
import { ROWS, COLS, createGame, URGENCY_RULES, getFlowMultiplier, advanceTime, addRow, clearAt, usePowerup } from '../dist/engine.js';
function fixture(mode = 'countdown', phase = 'play') {
  const state = createGame({ mode, seed: 12345 });
  state.status = 'playing'; state.phase = phase;
  state.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  state.board[14][5] = { id: state.nextId++, color: 0, kind: 'normal', side: 'bottom' };
  if (phase === 'bonus') { state.rowsAdded = state.rowsTarget; state.bonusRemaining = 15000; }
  return state;
}
function close(actual, expected) { assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`); }
function equivalent(left, right) {
  left = structuredClone(left); right = structuredClone(right);
  for (const key of ['rowProgress', 'elapsed', 'timeLeft', 'bonusRemaining', 'freezeRemaining']) { close(left[key], right[key]); delete left[key]; delete right[key]; }
  assert.deepEqual(left, right);
}
test('ten-second urgency uses a fixed two-second feeder and the active round clock', () => {
  assert.deepEqual(URGENCY_RULES, { windowMs: 10000, rowIntervalMs: 2000 });
  const state = fixture();
  for (const remaining of [10000, 5000, 1]) { state.timeLeft = remaining; close(getFlowMultiplier(state), state.rowInterval / 2000); }
  state.timeLeft = 10001; assert.equal(getFlowMultiplier(state), 1);
  state.timeLeft = 0; assert.equal(getFlowMultiplier(state), 1);
  for (const status of ['ready', 'paused', 'gameOver', 'won', 'levelComplete']) { state.status = status; state.timeLeft = 5000; assert.equal(getFlowMultiplier(state), 1); }
  const bonus = fixture('strategy', 'bonus'); bonus.bonusRemaining = 10000; close(getFlowMultiplier(bonus), bonus.rowInterval / 2000);
});
test('crossing the urgency boundary preserves progress and keeps real seconds', () => {
  const state = fixture(); state.timeLeft = 11000;
  advanceTime(state, 1000); close(state.rowProgress, 1000 / state.rowInterval);
  advanceTime(state, 1000); close(state.rowProgress, 1000 / state.rowInterval + .5);
  assert.equal(state.timeLeft, 9000); assert.equal(state.elapsed, 2000);
});
test('large and split ticks agree across urgency, arrivals, and Classic supply exhaustion', () => {
  for (const [mode, phase] of [['countdown', 'play'], ['classic', 'bonus']]) {
    const state = fixture(mode, phase); state.rowProgress = .3;
    if (phase === 'play') state.timeLeft = 15000;
    const split = structuredClone(state);
    advanceTime(state, 14000);
    for (const amount of [501, 1499, 4200, 2800, 1000, 3000, 1000]) advanceTime(split, amount);
    equivalent(state, split);
    assert.equal(state.rowsAdded, (phase === 'bonus' ? state.rowsTarget : 0) + 5);
    assert.equal(state.status, 'playing');
  }
});
test('all timed bonus modes keep feeding at the approved cadence', () => {
  for (const mode of ['classic', 'strategy', 'slider', 'relapse']) {
    const state = fixture(mode, 'bonus'); advanceTime(state, 10000);
    const progress = state.rowProgress, rows = state.rowsAdded;
    advanceTime(state, 1000); close(state.rowProgress, progress + .5);
    assert.equal(state.rowsAdded, rows); close(state.bonusRemaining, 4000);
    assert.ok(rows > state.rowsTarget);
  }
});
test('bonus arrivals do not restart their fifteen-second clock', () => {
  const state = fixture('strategy'); state.rowsAdded = state.rowsTarget - 1;
  addRow(state); advanceTime(state, 6200);
  assert.equal(state.rowsAdded, state.rowsTarget + 1); assert.equal(state.bonusRemaining, 8800);
  addRow(state); assert.equal(state.bonusRemaining, 8800);
});
test('freeze holds feeding while the real countdown keeps running', () => {
  for (const [mode, phase] of [['countdown', 'play'], ['strategy', 'bonus']]) {
    const state = fixture(mode, phase);
    if (phase === 'play') state.timeLeft = 14000; else state.bonusRemaining = 14000;
    usePowerup(state, 'freeze'); advanceTime(state, 8000);
    assert.equal(state.rowProgress, 0); assert.equal(state.freezeRemaining, 2000);
    const split = structuredClone(state); advanceTime(state, 3000);
    for (let i = 0; i < 3; i++) advanceTime(split, 1000);
    equivalent(state, split); close(state.rowProgress, .5);
    assert.equal(phase === 'play' ? state.timeLeft : state.bonusRemaining, 3000);
  }
});
test('timer expiry takes precedence over a simultaneous row', () => {
  for (const [mode, phase, status] of [['countdown', 'play', 'won'], ['classic', 'bonus', 'levelComplete']]) {
    const state = fixture(mode, phase); state.rowProgress = .5;
    if (phase === 'play') state.timeLeft = 1000; else state.bonusRemaining = 1000;
    const board = structuredClone(state.board), rows = state.rowsAdded;
    advanceTime(state, 2000);
    assert.equal(state.status, status); assert.equal(state.elapsed, 1000);
    assert.equal(state.rowsAdded, rows); assert.deepEqual(state.board, board);
  }
});
test('urgent overflow preserves the board and ends at the exact feeder boundary', () => {
  const state = fixture('classic', 'bonus'); state.bonusRemaining = 4000; state.rowProgress = .99;
  state.board[0][3] = { id: state.nextId++, color: 1, kind: 'normal', side: 'bottom' };
  const before = structuredClone(state.board);
  advanceTime(state, 1000);
  assert.equal(state.status, 'gameOver'); assert.deepEqual(state.board, before);
  close(state.elapsed, 20); close(state.bonusRemaining, 3980);
});
test('Classic all-clear keeps its bonus running while other finite bonuses can finish early', () => {
  for (const mode of ['classic', 'strategy']) {
    const state = fixture(mode, 'bonus'); state.bonusRemaining = 4000;
    for (const col of [4, 6]) state.board[14][col] = { id: state.nextId++, color: 0, kind: 'normal', side: 'bottom' };
    assert.equal(clearAt(state, 5, 14).valid, true);
    assert.equal(state.status, mode === 'classic' ? 'playing' : 'levelComplete');
  }
});
