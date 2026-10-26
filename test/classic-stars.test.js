import test from 'node:test';
import assert from 'node:assert/strict';
import { createGame, clearAt, addRow, advanceTime, finalizeRound, nextLevel, previewClear, usePowerup, ROWS, COLS } from '../dist/engine.js';
import { getClassicTargets, classicStarsForScore, classicLevelMultiplier, classicBonusRowBudget } from '../dist/classic-stars.js';
import { createClassicProgress } from '../dist/classic-progress.js';

function fixture(difficulty = 'easy', level = 1) {
  const state = createGame({ difficulty, level, seed: 321 });
  state.status = 'playing'; empty(state); return state;
}
function empty(state) { state.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null)); }
function put(state, col, row, kind = 'normal', color = 0) {
  state.board[row][col] = { id: state.nextId++, kind, color, side: 'bottom' };
}
function clearGroup(state, count) {
  empty(state);
  for (let col = 0; col < count; col++) put(state, col, ROWS - 1);
  return clearAt(state, 0, ROWS - 1);
}
function memory() {
  const values = new Map();
  return { get: (key, fallback) => values.has(key) ? structuredClone(values.get(key)) : fallback, set: (key, value) => values.set(key, structuredClone(value)) };
}

test('approved target table, provisional labels, and future-level formula are stable', () => {
  assert.deepEqual([getClassicTargets(1).twoStars, getClassicTargets(1).threeStars], [19600, 30150]);
  assert.equal(getClassicTargets(5, 'hard').threeStars, 79950);
  assert.equal(getClassicTargets(10, 'normal').threeStars, 116750);
  assert.equal(getClassicTargets(10, 'hard').provisional, true);
  assert.equal(getClassicTargets(30, 'easy').provisional, false);
  assert.equal(getClassicTargets(31).provisional, true);
  assert.ok(getClassicTargets(31).threeStars > getClassicTargets(30).threeStars);
  assert.equal(classicLevelMultiplier(5), 1.2);
  assert.equal(classicLevelMultiplier(21), 2);
  assert.equal(classicLevelMultiplier(100), 2);
  assert.equal(getClassicTargets(Infinity, 'bad').level, 1);
});

test('completion gates stars and exact threshold boundaries award the right tier', () => {
  const target = getClassicTargets(1);
  for (const [score, stars] of [[0, 1], [19599, 1], [19600, 2], [30149, 2], [30150, 3]]) {
    assert.equal(classicStarsForScore(score, true, target), stars);
    assert.equal(classicStarsForScore(score, false, target), 0);
  }
});

test('aggregate Classic multiplier rounding and additive ledger agree after every clear', () => {
  const state = fixture('hard', 5);
  let awards = 0;
  for (const count of [3, 6, 7, 10, 3]) {
    const result = clearGroup(state, count); awards += result.points;
    const stats = state.roundStats;
    assert.equal(stats.grossPoints, Math.round(stats.rawGrossPoints * 355 * 120 / 10000));
    assert.equal(stats.basePoints + stats.groupBonusPoints + stats.streakBonusPoints + stats.roundBonusPoints + stats.clearBonusPoints + stats.difficultyBonusPoints + stats.levelBonusPoints, stats.grossPoints);
    assert.equal(state.score, awards);
    assert.equal(state.score, stats.grossPoints);
  }
  put(state, 4, 14);
  state.status = 'levelComplete';
  const summary = finalizeRound(state);
  assert.equal(summary.penaltyPoints, 20);
  assert.equal(summary.netPoints, awards - 20);
  assert.equal(summary.classic.stars, 1);
  assert.strictEqual(finalizeRound(state), summary);
});

test('previews include Classic bonuses without changing the original ledger or score', () => {
  const state = fixture('normal', 5);
  for (let col = 0; col < 6; col++) put(state, col, 14);
  const before = structuredClone(state);
  const prediction = previewClear(state, 0, 14);
  assert.deepEqual(state, before);
  const result = clearAt(state, 0, 14);
  assert.equal(result.points, prediction.points);
  assert.equal(result.scoring.difficultyMultiplier, 2.1);
  assert.equal(result.scoring.levelMultiplier, 1.2);
});

test('all-clear keeps Classic bonus alive and fixed supply stops manual farming', () => {
  const state = fixture();
  state.rowsAdded = state.rowsTarget - 1;
  addRow(state);
  assert.equal(state.phase, 'bonus');
  clearGroup(state, 6);
  assert.equal(state.status, 'playing');
  assert.equal(state.bonusRemaining, 15000);
  for (let row = 0; row < state.bonusRowsTarget; row++) { empty(state); assert.equal(addRow(state).valid, true); }
  assert.equal(state.bonusRowsAdded, 5);
  assert.deepEqual(state.nextRow, []);
  const before = structuredClone(state);
  assert.equal(addRow(state).type, 'supplyComplete');
  assert.deepEqual(state, before);
  advanceTime(state, 14999);
  assert.equal(state.status, 'playing');
  advanceTime(state, 1);
  assert.equal(state.status, 'levelComplete');
  assert.equal(state.elapsed, 15000);
});

test('automatic bonus budgets match pace at low, middle and capped levels', () => {
  for (const difficulty of ['easy', 'normal', 'hard']) for (const level of [1, 5, 10, 20, 30]) {
    const state = fixture(difficulty, level);
    state.phase = 'bonus'; state.bonusRemaining = 15000; state.rowsAdded = state.rowsTarget;
    const expected = classicBonusRowBudget(state.rowInterval);
    for (let tick = 0; tick < 150; tick++) { empty(state); advanceTime(state, 100); }
    assert.equal(state.bonusRowsAdded, expected, `${difficulty} ${level}`);
    assert.equal(state.rowsAdded, state.rowsTarget + expected);
    assert.equal(state.status, 'levelComplete');
  }
});

test('Classic boosts are tracked and do not change star eligibility', () => {
  const state = fixture();
  clearGroup(state, 6);
  assert.equal(usePowerup(state, 'freeze').valid, true);
  state.status = 'levelComplete';
  assert.equal(finalizeRound(state).classic.stars, 1);
  assert.equal(state.roundSummary.classic.boostsUsed.freeze, 1);
});

test('next level banks the net score and resets budget, boosts and stars', () => {
  const state = fixture('normal', 5); clearGroup(state, 9);
  state.status = 'levelComplete';
  const banked = finalizeRound(state).totalScore;
  nextLevel(state);
  assert.equal(state.score, banked);
  assert.equal(state.roundStartScore, banked);
  assert.equal(state.roundSummary, null);
  assert.equal(state.roundStats.rawGrossPoints, 0);
  assert.equal(state.bonusRowsAdded, 0);
  assert.deepEqual(state.boostsUsed, { blast: 0, color: 0, freeze: 0 });
});

test('stars use net level points, with no credit from carried scores or failed attempts', () => {
  const target = getClassicTargets(1);
  for (const [status, carried, remaining, expected] of [
    ['levelComplete', 0, 1, 2], ['gameOver', 0, 0, 0], ['levelComplete', 1000000, 1, 2],
  ]) {
    const state = fixture();
    state.roundStartScore = carried;
    state.roundStats.grossPoints = target.threeStars;
    state.score = carried + target.threeStars;
    if (remaining) put(state, 5, 14);
    state.status = status;
    assert.equal(finalizeRound(state).classic.stars, expected);
  }
});

test('best stars stay separate by level and difficulty and never downgrade', () => {
  const storage = memory(), progress = createClassicProgress(storage);
  const state = fixture(); clearGroup(state, 6); state.status = 'levelComplete';
  const summary = finalizeRound(state);
  summary.classic.stars = 3; summary.netPoints = 40000;
  progress.record(state, 'first');
  summary.classic.stars = 1; summary.netPoints = 100;
  progress.record(state, 'second'); progress.record(state, 'second');
  const reload = createClassicProgress(storage);
  assert.deepEqual(reload.best(1, 'easy'), { stars: 3, score: 40000 });
  assert.deepEqual(reload.best(1, 'normal'), { stars: 0, score: 0 });
  assert.deepEqual(reload.best(2, 'easy'), { stars: 0, score: 0 });
  assert.equal(reload.exportRuns().length, 2);
  assert.equal(reload.exportRuns()[0].version, 'classic-stars-v1');
  assert.equal(reload.exportRuns()[1].stars, 1);
});

test('other modes retain their scoring and bonus supply behavior', () => {
  const state = createGame({ mode: 'strategy', difficulty: 'hard', level: 5, seed: 123 });
  state.status = 'playing'; state.phase = 'bonus'; state.bonusRemaining = 15000; empty(state);
  const result = clearGroup(state, 6);
  assert.equal(result.points, 840);
  assert.equal(state.status, 'levelComplete');
  assert.equal(finalizeRound(state).classic, undefined);
});
