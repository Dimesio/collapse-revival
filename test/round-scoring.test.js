import test from 'node:test';
import assert from 'node:assert/strict';
import { COLS, ROWS, MODES, createGame, clearAt, countBlocks, advanceTime, finalizeRound, nextLevel, previewClear } from '../dist/engine.js';

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

function group(state, size, color = 0, side = 'bottom') {
  return Array.from({ length: size }, (_, col) => put(state, col, side === 'top' ? 0 : ROWS - 1, color, 'normal', side));
}

function sumBuckets(summary) {
  return summary.basePoints + summary.groupBonusPoints + summary.streakBonusPoints + summary.roundBonusPoints + summary.clearBonusPoints;
}

test('round ledger attributes each multiplier once and preserves half-point rounding', () => {
  const state = fixture();
  state.phase = 'bonus';
  state.bonusRemaining = 10000;
  state.combo = 1;
  state.elapsed = 2000;
  state.lastClearAt = 1500;
  group(state, 6);
  put(state, 11, ROWS - 1, 1);

  const clear = clearAt(state, 0, ROWS - 1);
  assert.equal(clear.points, 483);
  assert.deepEqual(state.roundStats, {
    basePoints: 120, groupBonusPoints: 90, streakBonusPoints: 32,
    roundBonusPoints: 241, clearBonusPoints: 0, rawGrossPoints: 483, grossPoints: 483,
    difficultyBonusPoints: 0, levelBonusPoints: 0,
    blocksCleared: 6, highestClear: 6, moves: 1,
    doubleClears: 0, tripleClears: 0, bonusClears: 1,
  });
  assert.equal(sumBuckets(state.roundStats), state.score);

  state.status = 'levelComplete';
  const summary = finalizeRound(state);
  assert.equal(summary.remainingBlocks, 1);
  assert.equal(summary.penaltyPoints, 20);
  assert.equal(summary.netPoints, 463);
  assert.equal(summary.totalScore, 463);
  assert.equal(sumBuckets(summary), summary.grossPoints);
});

test('every mode deducts 20 for each remaining ordinary or special block at any terminal result', () => {
  for (const { id: mode } of MODES) {
    for (const terminal of ['levelComplete', 'won', 'gameOver']) {
      const state = fixture(mode);
      group(state, 6);
      put(state, 8, 0, 1, 'normal', 'top');
      put(state, 9, 0, 2, 'stone', 'top');
      put(state, 10, 0, 1, 'colorBomb', 'top');
      put(state, 11, 0, 0, 'gravity', 'top');
      const clear = clearAt(state, 0, ROWS - 1);
      assert.equal(clear.valid, true, mode);
      const remaining = countBlocks(state);
      const gross = state.score;
      state.status = terminal;

      const summary = finalizeRound(state);
      const context = `${mode}, ${terminal}`;
      assert.equal(summary.penaltyPerBlock, 20, context);
      assert.equal(summary.remainingBlocks, remaining, context);
      assert.equal(summary.rawPenaltyPoints, remaining * 20, context);
      assert.equal(summary.penaltyPoints, Math.min(gross, remaining * 20), context);
      assert.equal(summary.netPoints, Math.max(0, gross - remaining * 20), context);
      assert.equal(summary.totalScore, summary.netPoints, context);
      assert.equal(state.score, summary.totalScore, context);
      assert.equal(sumBuckets(summary), summary.grossPoints, context);
    }
  }
});

test('finalization is terminal-only and repeated reads cannot charge a second penalty', () => {
  const state = fixture();
  group(state, 6);
  put(state, 11, ROWS - 1, 1);
  clearAt(state, 0, ROWS - 1);
  for (const status of ['playing', 'paused', 'ready']) {
    state.status = status;
    const before = structuredClone(state);
    assert.equal(finalizeRound(state), null);
    assert.deepEqual(state, before);
  }
  state.status = 'gameOver';
  const summary = finalizeRound(state);
  const score = state.score;
  assert.equal(summary.penaltyPoints, 20);
  assert.strictEqual(finalizeRound(state), summary);
  assert.strictEqual(finalizeRound(state), summary);
  assert.equal(state.score, score);
  assert.equal(countBlocks(state), 1);
});

test('a completed empty board has no deduction and tracks its double reward and biggest clear', () => {
  const state = fixture();
  state.phase = 'bonus';
  group(state, 10);
  clearAt(state, 0, ROWS - 1);
  assert.equal(state.status, 'playing');
  state.bonusRemaining = 1;
  advanceTime(state, 1);
  assert.equal(state.status, 'levelComplete');
  const summary = finalizeRound(state);
  assert.equal(summary.highestClear, 10);
  assert.equal(summary.blocksCleared, 10);
  assert.equal(summary.moves, 1);
  assert.equal(summary.doubleClears, 1);
  assert.equal(summary.tripleClears, 0);
  assert.equal(summary.bonusClears, 1);
  assert.equal(summary.remainingBlocks, 0);
  assert.equal(summary.penaltyPoints, 0);
  assert.equal(summary.totalScore, 2200);
  assert.equal(sumBuckets(summary), summary.totalScore);
});

test('a two-side Relapse wipe is a triple rather than two double rewards', () => {
  const state = fixture('relapse');
  put(state, 5, ROWS - 1, 2, 'colorBomb');
  put(state, 1, 0, 2, 'normal', 'top');
  put(state, 9, ROWS - 1, 2);
  clearAt(state, 5, ROWS - 1);
  state.status = 'levelComplete';
  const summary = finalizeRound(state);
  assert.equal(summary.doubleClears, 0);
  assert.equal(summary.tripleClears, 1);
  assert.equal(summary.clearBonusPoints, 120);
  assert.equal(summary.highestClear, 3);
  assert.equal(summary.totalScore, 180);
});

test('the next level settles the old round, carries net earnings and resets its ledger', () => {
  const state = fixture();
  group(state, 6);
  put(state, 11, ROWS - 1, 1);
  clearAt(state, 0, ROWS - 1);
  state.status = 'levelComplete';
  assert.equal(state.score, 210);
  assert.equal(nextLevel(state).valid, true);
  assert.equal(state.score, 190);
  assert.equal(state.roundStartScore, 190);
  assert.equal(state.roundSummary, null);
  assert.equal(state.roundStats.grossPoints, 0);
  assert.equal(state.roundStats.highestClear, 0);
  assert.equal(state.roundStats.moves, 0);

  state.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  put(state, 0, ROWS - 1, 0, 'gravity');
  put(state, 11, ROWS - 1, 1);
  clearAt(state, 0, ROWS - 1);
  state.status = 'gameOver';
  const summary = finalizeRound(state);
  assert.equal(summary.startScore, 190);
  assert.equal(summary.grossPoints, 11);
  assert.equal(summary.rawPenaltyPoints, 20);
  assert.equal(summary.penaltyPoints, 11);
  assert.equal(summary.netPoints, 0);
  assert.equal(summary.totalScore, 190);
});

test('a round with no earnings cannot go negative or subtract a carried score', () => {
  const state = fixture();
  state.roundStartScore = state.score = 500;
  put(state, 0, ROWS - 1);
  put(state, 1, ROWS - 1, 1, 'stone');
  state.status = 'gameOver';
  const summary = finalizeRound(state);
  assert.equal(summary.rawPenaltyPoints, 40);
  assert.equal(summary.penaltyPoints, 0);
  assert.equal(summary.netPoints, 0);
  assert.equal(summary.totalScore, 500);
});

test('preview and undo snapshots do not accumulate extra ledger entries or keep a settled penalty', () => {
  const state = fixture('puzzle');
  group(state, 6);
  put(state, 11, ROWS - 1, 1);
  const before = structuredClone(state);
  previewClear(state, 0, ROWS - 1);
  previewClear(state, 0, ROWS - 1);
  assert.deepEqual(state, before);
  clearAt(state, 0, ROWS - 1);
  assert.equal(state.status, 'gameOver');
  finalizeRound(state);
  assert.equal(state.roundStats.moves, 1);
  assert.equal(state.roundSummary.penaltyPoints, 20);
  assert.equal(before.roundSummary, null);
  assert.equal(before.roundStats.moves, 0);
  assert.equal(before.score, 0);
});
