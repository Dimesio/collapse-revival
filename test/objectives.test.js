import test from 'node:test';
import assert from 'node:assert/strict';
import { OBJECTIVE_TYPES, finishRequirement, validateObjective, describeObjective, describeProgress, evaluateObjective } from '../dist/objectives.js';
import { COLS, ROWS, MODES, createGame, clearAt, finalizeRound } from '../dist/engine.js';
import { STAGES, stageGoal } from '../dist/journey.js';

function fixture(mode = 'classic') {
  const state = createGame({ mode, seed: 4242 });
  state.status = 'playing';
  state.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  return state;
}

function put(state, col, row, color = 0, kind = 'normal', side = 'bottom') {
  const cell = { id: state.nextId++, color, kind, side };
  state.board[row][col] = cell;
  return cell;
}

// A horizontal run on the bottom row, plus an unrelated block so the board is not emptied.
function bottomGroup(state, size, { keep = true } = {}) {
  for (let col = 0; col < size; col++) put(state, col, ROWS - 1, 0);
  if (keep) put(state, COLS - 1, ROWS - 1, 1);
}

const status = (objective, state) => evaluateObjective(objective, state).status;

test('each mode has the finish requirement its rules imply', () => {
  assert.deepEqual(Object.fromEntries(MODES.map(mode => [mode.id, finishRequirement(mode.id)])), {
    classic: 'level', strategy: 'level', puzzle: 'clear', relapse: 'level', continuous: 'none', countdown: 'round', slider: 'level',
  });
});

test('validation accepts mode-appropriate objectives and bounded whole-number targets', () => {
  assert.deepEqual(validateObjective('classic', { type: 'group', target: 10, extra: true }), { ok: true, objective: { type: 'group', target: 10 } });
  assert.deepEqual(validateObjective('puzzle', { type: 'finish', target: 4 }), { ok: true, objective: { type: 'finish' } });
  for (const [mode, objective] of [
    ['continuous', { type: 'finish' }], ['continuous', { type: 'fewBlocks', target: 5 }],
    ['puzzle', { type: 'allClear', target: 1 }], ['puzzle', { type: 'blocks', target: 10 }],
    ['strategy', { type: 'streak', target: 2 }], ['puzzle', { type: 'streak', target: 2 }],
  ]) assert.match(validateObjective(mode, objective).reason, /does not fit/, `${mode} ${objective.type}`);
  for (const target of [2, 181, 3.5, '10', undefined]) assert.equal(validateObjective('classic', { type: 'group', target }).ok, false, String(target));
  assert.equal(validateObjective('classic', { type: 'streak', target: 25 }).ok, true, 'streak goals can outlast the ×1.6 multiplier');
  assert.equal(validateObjective('classic', { type: 'streak', target: 501 }).ok, false);
  assert.equal(validateObjective('classic', { type: 'fewBlocks', target: 0 }).ok, true);
  for (const type of ['bogus', 'constructor', undefined]) assert.match(validateObjective('classic', { type }).reason, /not supported/);
  assert.equal(validateObjective('classic', null).ok, false);
  assert.ok(Object.values(OBJECTIVE_TYPES).every(rule => rule.modes.length > 0));
});

test('descriptions name the goal and the finish it still requires', () => {
  assert.equal(describeObjective({ type: 'finish' }, 'classic'), 'Finish the level and bonus round');
  assert.equal(describeObjective({ type: 'finish' }, 'countdown'), 'Finish the two-minute round');
  assert.equal(describeObjective({ type: 'finish' }, 'puzzle'), 'Clear every block');
  assert.equal(describeObjective({ type: 'score', target: 1500 }, 'continuous'), 'Score 1,500 points in one run');
  assert.equal(describeObjective({ type: 'group', target: 10 }, 'classic'), 'Clear a group of 10 or more, then finish the level');
  assert.equal(describeObjective({ type: 'group', target: 12 }, 'continuous'), 'Clear a group of 12 or more');
  assert.equal(describeObjective({ type: 'score', target: 20000 }, 'countdown'), 'Earn 20,000 points, then last the full two minutes');
  assert.equal(describeObjective({ type: 'score', target: 900 }, 'puzzle'), 'Earn 900 points, then clear every block');
  assert.equal(describeObjective({ type: 'allClear', target: 1 }, 'classic'), 'Clear the whole board, then finish the level');
  assert.equal(describeObjective({ type: 'allClear', target: 2 }, 'relapse'), 'Empty a whole side 2 times, then finish the level');
  assert.equal(describeObjective({ type: 'fewBlocks', target: 10 }, 'strategy'), 'Finish the level with 10 or fewer blocks left');
  assert.equal(describeObjective({ type: 'fewBlocks', target: 1 }, 'countdown'), 'End the two-minute round with 1 or fewer blocks left');
  assert.equal(describeObjective({ type: 'fewBlocks', target: 0 }, 'slider'), 'Finish the level with an empty board');
  assert.equal(describeObjective({ type: 'blocks', target: 150 }, 'slider'), 'Clear 150 blocks, then finish the level');
  assert.equal(describeObjective({ type: 'streak', target: 4 }, 'countdown'), 'Chain 4 quick clears in a row, then last the full two minutes');
});

test('a goal met mid-level still waits for the level to finish', () => {
  const objective = { type: 'group', target: 8 };
  const state = fixture();
  bottomGroup(state, 7);
  clearAt(state, 0, ROWS - 1);
  assert.equal(evaluateObjective(objective, state).current, 7);
  assert.equal(status(objective, state), 'active');
  bottomGroup(state, 8);
  clearAt(state, 0, ROWS - 1);
  assert.deepEqual(evaluateObjective(objective, state), { status: 'met', goalMet: true, finished: false, current: 8, target: 8 });
  state.status = 'paused';
  assert.equal(status(objective, state), 'met');
  state.status = 'levelComplete';
  assert.equal(status(objective, state), 'complete');
  state.status = 'gameOver';
  assert.equal(status(objective, state), 'failed', 'a top-out fails even after the goal was reached');
});

test('a level that ends without its goal fails, and Finish needs only the ending', () => {
  const state = fixture('strategy');
  bottomGroup(state, 5);
  clearAt(state, 0, ROWS - 1);
  state.status = 'levelComplete';
  assert.equal(status({ type: 'group', target: 8 }, state), 'failed');
  assert.equal(status({ type: 'finish' }, state), 'complete');
  state.status = 'playing';
  assert.equal(status({ type: 'finish' }, state), 'active');
  state.status = 'ready';
  assert.equal(status({ type: 'finish' }, state), 'active');
});

test('group objectives count matching groups, not bomb or boost blasts', () => {
  const state = fixture();
  for (let col = 0; col < COLS; col++) for (let row = ROWS - 4; row < ROWS; row++) put(state, col, row, (col + row) % 3);
  put(state, 5, ROWS - 2, 0, 'bomb');
  const blast = clearAt(state, 5, ROWS - 2);
  assert.ok(blast.removed.length >= 20);
  assert.equal(state.roundStats.highestClear, blast.removed.length);
  assert.equal(state.roundStats.largestGroup, 0);
  assert.equal(evaluateObjective({ type: 'group', target: 3 }, state).goalMet, false);
});

test('all-clears count whole boards, and Relapse counts each emptied side once per move', () => {
  const classic = fixture();
  bottomGroup(classic, 4, { keep: false });
  clearAt(classic, 0, ROWS - 1);
  assert.equal(evaluateObjective({ type: 'allClear', target: 1 }, classic).status, 'met');

  const relapse = fixture('relapse');
  for (let col = 0; col < 3; col++) put(relapse, col, 0, 2, 'normal', 'top');
  put(relapse, 0, ROWS - 1, 1, 'normal', 'bottom');
  clearAt(relapse, 0, 0);
  const result = evaluateObjective({ type: 'allClear', target: 1 }, relapse);
  assert.equal(result.current, 1);
  assert.equal(result.status, 'met');
});

test('score objectives use earned round points, so settling the round cannot undo them', () => {
  const objective = { type: 'score', target: 200 };
  const state = fixture();
  bottomGroup(state, 6);
  for (let col = 0; col < COLS; col++) put(state, col, ROWS - 3, 2);
  clearAt(state, 0, ROWS - 1);
  assert.ok(state.score >= 200);
  assert.equal(status(objective, state), 'met');
  state.status = 'levelComplete';
  finalizeRound(state);
  assert.ok(state.score < 200, 'the leftover deduction lowers the settled score');
  assert.equal(status(objective, state), 'complete');
});

test('few-blocks objectives are judged only when the round ends', () => {
  const objective = { type: 'fewBlocks', target: 2 };
  const state = fixture();
  put(state, 0, ROWS - 1, 1);
  put(state, 1, ROWS - 1, 2);
  put(state, 2, ROWS - 1, 1);
  assert.deepEqual(evaluateObjective(objective, state), { status: 'active', goalMet: false, finished: false, current: 3, target: 2 });
  state.status = 'levelComplete';
  assert.equal(status(objective, state), 'failed');
  state.board[ROWS - 1][2] = null;
  assert.equal(status(objective, state), 'complete');

  const countdown = fixture('countdown');
  countdown.status = 'won';
  assert.equal(status(objective, countdown), 'complete');
});

test('streak objectives track the best quick-clear chain this round', () => {
  const objective = { type: 'streak', target: 3 };
  const state = fixture('countdown');
  for (const elapsed of [1000, 2000, 3000]) {
    state.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    bottomGroup(state, 3);
    state.elapsed = elapsed;
    assert.equal(clearAt(state, 0, ROWS - 1).valid, true);
  }
  assert.equal(state.roundStats.bestStreak, 3);
  assert.equal(status(objective, state), 'met');
  for (const elapsed of [4000, 5000, 6000, 7000]) {
    state.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    bottomGroup(state, 3);
    state.elapsed = elapsed;
    clearAt(state, 0, ROWS - 1);
  }
  assert.equal(state.combo, 5, 'the streak multiplier stops at five clears');
  assert.equal(state.roundStats.bestStreak, 7, 'the streak record keeps counting');
  state.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  bottomGroup(state, 3);
  state.elapsed = 9600;
  clearAt(state, 0, ROWS - 1);
  assert.equal(state.chain, 1, 'a pause of 2.5 seconds starts a new chain');
  assert.equal(state.roundStats.bestStreak, 7);
  state.status = 'won';
  assert.equal(status(objective, state), 'complete');
});

test('Continuous completes the moment its goal is met during play', () => {
  const objective = { type: 'blocks', target: 6 };
  const state = fixture('continuous');
  bottomGroup(state, 6);
  assert.equal(status(objective, state), 'active');
  clearAt(state, 0, ROWS - 1);
  assert.equal(status(objective, state), 'complete');
  state.status = 'ready';
  assert.equal(status(objective, state), 'active');
  state.status = 'gameOver';
  assert.equal(status(objective, state), 'failed');
});

test('Countdown and Puzzle goals need their own finish', () => {
  const countdown = fixture('countdown');
  bottomGroup(countdown, 6);
  clearAt(countdown, 0, ROWS - 1);
  assert.equal(status({ type: 'blocks', target: 6 }, countdown), 'met');
  countdown.status = 'won';
  assert.equal(status({ type: 'blocks', target: 6 }, countdown), 'complete');

  const puzzle = createGame({ mode: 'puzzle', puzzleIndex: 1 });
  puzzle.status = 'playing';
  clearAt(puzzle, 3, 12);
  assert.equal(status({ type: 'score', target: 100 }, puzzle), 'met');
  clearAt(puzzle, 5, 12);
  assert.equal(puzzle.status, 'won');
  assert.equal(status({ type: 'score', target: 100 }, puzzle), 'complete');
  assert.equal(status({ type: 'score', target: 100000 }, puzzle), 'failed');
});

test('Journey goals are described from their objectives', () => {
  for (const stage of STAGES) assert.equal(stageGoal(stage), describeObjective(stage.objective, stage.mode), stage.name);
  const goal = name => stageGoal(STAGES.find(stage => stage.name === name));
  assert.equal(goal('A Familiar Spark'), 'Clear a group of 12 or more, then finish the level');
  assert.equal(goal('A Gentle Rhythm'), 'Clear 590 blocks');
  assert.equal(goal('From Both Shores'), 'Finish the level with 25 or fewer blocks left');
  assert.equal(goal('Two-Minute Tea'), 'Earn 33,000 points, then last the full two minutes');
});

test('progress lines stop at the target and judge leftovers at the end', () => {
  const line = (objective, current, mode = 'classic') => describeProgress(objective, { current, target: objective.target }, mode);
  assert.equal(line({ type: 'group', target: 10 }, 7), 'Biggest group: 7 of 10');
  assert.equal(line({ type: 'group', target: 10 }, 14), 'Biggest group: 10 of 10');
  assert.equal(line({ type: 'score', target: 20000 }, 1234), '1,234 of 20,000 points');
  assert.equal(line({ type: 'blocks', target: 400 }, 401), '400 of 400 blocks cleared');
  assert.equal(line({ type: 'allClear', target: 2 }, 1, 'relapse'), '1 of 2 sides emptied');
  assert.equal(line({ type: 'allClear', target: 1 }, 0), '0 of 1 board clears');
  assert.equal(line({ type: 'streak', target: 4 }, 2), 'Best streak: 2 of 4');
  assert.equal(line({ type: 'fewBlocks', target: 35 }, 48), '48 blocks on the board · 35 or fewer at the end');
  assert.equal(line({ type: 'fewBlocks', target: 0 }, 1), '1 block on the board · none at the end');
  assert.equal(describeProgress({ type: 'finish' }, { current: null, target: null }, 'classic'), '');
});
