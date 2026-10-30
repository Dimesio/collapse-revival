import test from 'node:test';
import assert from 'node:assert/strict';
import { STAGES, JOURNEY_STORAGE_KEY, stageStarTargets, stageGoldTargets, stageResult, createJourneyStore, createJourneySession } from '../dist/journey.js';
import { PUZZLES } from '../dist/puzzles.js';
import { getClassicTargets, getClassicGoldTargets } from '../dist/classic-stars.js';
import { validateObjective } from '../dist/objectives.js';
import { ROWS, COLS, createGame, clearAt, finalizeRound, roundPoints, countBlocks } from '../dist/engine.js';
import { PLAY_STYLES, OBJECTIVE_SHARE, targetsFromMedian, puzzleTargets, goldFromReference, puzzleGoldTargets, objectiveTarget } from '../tools/calibrate-journey.js';
import { playReference, planStrategy } from '../tools/reference-player.js';

function memoryStorage(value) {
  const entries = new Map(value ? [[JOURNEY_STORAGE_KEY, JSON.stringify(value)]] : []);
  return { getItem: key => entries.get(key) ?? null, setItem: (key, text) => entries.set(key, text) };
}

const stageGame = item => createGame({ mode: item.mode, difficulty: item.difficulty, level: item.level, puzzleIndex: item.puzzleIndex ?? 0, seed: item.seed });

/** A finished round with chosen stats and an otherwise empty board. */
function finishedRound(item, { status = 'levelComplete', points = 0, largestGroup = 0, blocks = 0, leftovers = 0 } = {}) {
  const state = stageGame(item);
  state.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  for (let col = 0; col < leftovers; col++) state.board[ROWS - 1][col] = { id: 9000 + col, color: col % 2, kind: 'normal', side: 'bottom' };
  Object.assign(state.roundStats, { grossPoints: points, rawGrossPoints: points, largestGroup, blocksCleared: blocks });
  state.status = status;
  return state;
}

// From tools/calibrate-journey.js: the highest-scoring clear order for each Journey puzzle.
const BEST_PUZZLE_LINES = {
  'Corner by Corner': [[5, 12], [5, 13]],
  'Paper Wings': [[5, 12], [4, 11], [3, 10]],
  'Ripples in Glass': [[1, 9], [8, 9], [5, 11], [4, 11], [3, 11], [3, 11]],
  'Secret Garden': [[5, 10], [3, 10], [2, 10], [1, 10], [0, 13], [10, 13], [0, 12]],
  'Stained-Glass Sky': [[4, 10], [10, 10], [0, 13], [2, 11], [3, 10], [1, 11], [5, 13], [7, 11], [8, 10], [6, 11], [2, 14]],
};

test('every stage has a valid, mostly distinctive objective', () => {
  for (const item of STAGES) assert.equal(validateObjective(item.mode, item.objective).ok, true, item.name);
  const finishOnly = STAGES.filter(item => item.objective.type === 'finish').map(item => item.name);
  assert.deepEqual(finishOnly, ['Corner by Corner', 'The Thoughtful Move', 'Last Two Minutes', 'Meet in the Middle', 'The Long Way Home', 'Just One More'], 'plain finishes are kept for the smallest puzzle and the hardest levels');
  assert.ok(new Set(STAGES.map(item => item.objective.type)).size >= 5);
  assert.equal(STAGES.some(item => item.objective.type === 'streak'), false, 'simulated players chain clears far longer than people, so streak goals stay out until playtested');
});

test('star targets are ordered round points, and Classic stages share Classic targets', () => {
  for (const item of STAGES) {
    const targets = stageStarTargets(item);
    assert.ok(Number.isInteger(targets.two) && targets.two > 0 && targets.two <= targets.three, item.name);
    if (item.mode === 'classic') {
      const classic = getClassicTargets(item.level, item.difficulty);
      assert.deepEqual(targets, { two: classic.twoStars, three: classic.threeStars, provisional: classic.provisional }, item.name);
    } else {
      assert.equal(targets.three % (item.mode === 'puzzle' ? 10 : 50), 0, item.name);
    }
  }
  assert.deepEqual(STAGES.filter(item => item.mode !== 'classic' && stageStarTargets(item).provisional).map(item => item.name), [], 'the reference player finishes every stage, so none is estimated');
});

test('gold targets ask more than three regular stars and stay provisional', () => {
  for (const item of STAGES) {
    const regular = stageStarTargets(item);
    const gold = stageGoldTargets(item);
    assert.ok(Number.isInteger(gold.two) && gold.two > regular.three && gold.two <= gold.three, item.name);
    assert.equal(gold.provisional, true, item.name);
    if (item.mode === 'classic') {
      const classic = getClassicGoldTargets(item.level, item.difficulty);
      assert.deepEqual([gold.two, gold.three], [classic.twoStars, classic.threeStars], `${item.name} shares Classic's gold`);
    }
  }
  assert.deepEqual(getClassicGoldTargets(1, 'easy'), { version: 'classic-stars-v1', level: 1, difficulty: 'easy', twoStars: 37400, threeStars: 41550, provisional: true }, 'three gold stars are Classic\'s reference median lifted 24%');
});

test('calibration spacing follows the Classic rule and the puzzle rule', () => {
  assert.deepEqual(targetsFromMedian(29230), { two: 17150, three: 26350 });
  assert.deepEqual(puzzleTargets({ maxPoints: 3480, minPoints: 1940 }), { two: 2540, three: 3140 });
  assert.deepEqual(puzzleTargets({ maxPoints: 350, minPoints: 350 }), { two: 320, three: 320 }, 'a single possible score meets both targets');
  assert.deepEqual(goldFromReference(30710), { two: 27650, three: 30750 });
  assert.deepEqual(puzzleGoldTargets({ maxPoints: 350 }), { two: 370, three: 385 }, 'the best line with No boosts, No hints and No undo, +10%');
  for (const item of STAGES.filter(stage => stage.mode === 'puzzle')) {
    const state = stageGame(item);
    state.status = 'playing';
    for (const [col, row] of BEST_PUZZLE_LINES[item.name]) clearAt(state, col, row);
    const { two, three } = puzzleGoldTargets({ maxPoints: stageResult(item, state).points });
    assert.deepEqual(stageGoldTargets(item), { two, three, provisional: true }, item.name);
  }
});

test('objectives sit where a set share of simulated runs reach them', () => {
  assert.deepEqual([...OBJECTIVE_SHARE], [0.5, 0.45, 0.4, 0.35, 0.3], 'later worlds ask more');
  const runs = [12, 9, null, 15, 11, 10, 8, 14, 13, null];
  assert.equal(objectiveTarget('group', runs, 0.5), 11, 'half of these runs cleared a group of 11; failed runs never count');
  assert.equal(objectiveTarget('group', runs, 0.3), 13);
  assert.equal(objectiveTarget('fewBlocks', [22, 31, null, 18, 26], 0.4), 25, 'fewer is better, rounded up to 5');
  assert.equal(objectiveTarget('score', [33575, 41020, 14200, 13900], 0.5), 33000, 'points round down to 1,000');
  assert.equal(objectiveTarget('blocks', [377, 512, 360], 0.6), 370, 'blocks round down to 10');
  assert.equal(objectiveTarget('group', [null, null, 9], 0.5), null, 'too few finished runs set no target');
});

test('stars need the objective first, then settled round points', () => {
  const item = STAGES.find(stage => stage.name === 'Side Street');
  const { two, three } = stageStarTargets(item);
  const group = item.objective.target;
  const result = options => stageResult(item, finishedRound(item, options));
  assert.equal(result({ points: three * 2, largestGroup: group - 1 }).stars, 0, 'a missed objective earns nothing, whatever the points');
  assert.equal(result({ points: three * 2, largestGroup: group - 1 }).status, 'failed');
  assert.equal(result({ points: two - 1, largestGroup: group }).stars, 1);
  assert.equal(result({ points: two, largestGroup: group }).stars, 2);
  assert.equal(result({ points: three, largestGroup: group }).stars, 3);
  const leftovers = finishedRound(item, { points: three, largestGroup: group, leftovers: 3 });
  assert.equal(stageResult(item, leftovers).points, three - 60, 'leftover blocks cost 20 points each, as in Classic');
  assert.equal(stageResult(item, leftovers).stars, 2);
  finalizeRound(leftovers);
  assert.equal(stageResult(item, leftovers).points, leftovers.roundSummary.netPoints);
  assert.equal(stageResult(item, { ...leftovers, mode: 'classic' }), null, 'another mode is not this stage');
});

test('round points preview the settlement during play and match it afterward', () => {
  const state = createGame({ seed: 12 });
  state.status = 'playing';
  assert.equal(roundPoints(state), 0);
  state.roundStats.grossPoints = 5000;
  assert.equal(roundPoints(state), 5000 - countBlocks(state) * 20);
  state.roundStats.grossPoints = 100;
  assert.equal(roundPoints(state), 0, 'the preview never drops below zero');
  state.roundStats.grossPoints = 5000;
  state.status = 'levelComplete';
  const preview = roundPoints(state);
  assert.equal(finalizeRound(state).netPoints, preview);
  assert.equal(roundPoints(state), preview);
});

test('completing a stage awards coins once, saves stars, and keeps the best', () => {
  const storage = memoryStorage();
  const store = createJourneyStore(storage);
  const session = createJourneySession(store);
  const item = STAGES[0];
  const { two, three } = stageStarTargets(item);
  const group = item.objective.target;
  session.start(0);
  const first = session.finish(finishedRound(item, { points: two, largestGroup: group }));
  assert.equal(first.complete, true);
  assert.equal(first.stars, 2);
  assert.equal(first.reward, item.reward);
  assert.equal(first.previousBest, null);
  assert.equal(first.moreStars, true);
  assert.deepEqual(first.best, { stars: 2, score: two });
  assert.equal(session.active(), null);
  assert.equal(session.finish(finishedRound(item, { points: three, largestGroup: group })), null, 'a finished run cannot be claimed twice');

  session.start(0);
  const replay = session.finish(finishedRound(item, { points: two + 500, largestGroup: group + 2 }));
  assert.equal(replay.firstClear, false);
  assert.equal(replay.moreStars, false);
  assert.deepEqual(replay.best, { stars: 2, score: two + 500 });
  session.start(0);
  assert.equal(session.finish(finishedRound(item, { points: three, largestGroup: group })).moreStars, true);
  session.start(0);
  session.finish(finishedRound(item, { points: 0, largestGroup: group }));
  assert.deepEqual(createJourneyStore(storage).getState().stars, { 0: { stars: 3, score: three } }, 'a weaker replay never lowers saved stars');
});

test('a missed objective awards nothing and leaves the stage ready to retry', () => {
  const store = createJourneyStore(memoryStorage({ completed: 5, coins: 3 }));
  const session = createJourneySession(store);
  const item = STAGES[5];
  const group = item.objective.target;
  session.start(5);
  assert.equal(session.finish(finishedRound(item, { status: 'playing', points: 9000, largestGroup: group - 6 })), null, 'an undecided run is not finished');
  const missed = session.finish(finishedRound(item, { points: 99999, largestGroup: group - 1 }));
  assert.equal(missed.complete, false);
  assert.equal(missed.stars, 0);
  assert.equal(store.getState().coins, 3);
  assert.deepEqual(store.getState().stars, {});
  assert.equal(session.active(), item, 'the stage stays active, so Undo or a retry can still complete it');
  assert.equal(session.last(), item);
  const gameOver = session.finish(finishedRound(item, { status: 'gameOver', points: 99999, largestGroup: group + 2 }));
  assert.equal(gameOver.complete, false);
  assert.equal(session.finish(finishedRound(item, { points: 100, largestGroup: group + 2 })).complete, true);
  assert.equal(session.last(), item, 'the last stage can be replayed for more stars');
});

test('each Journey puzzle has a clear order that earns all three stars', () => {
  for (const item of STAGES.filter(stage => stage.mode === 'puzzle')) {
    const state = stageGame(item);
    state.status = 'playing';
    for (const [col, row] of BEST_PUZZLE_LINES[item.name]) assert.equal(clearAt(state, col, row).valid, true, item.name);
    assert.equal(state.status, 'won', item.name);
    const result = stageResult(item, state);
    assert.equal(result.status, 'complete', item.name);
    assert.equal(result.stars, 3, `${item.name}: ${result.points} points`);
  }
});

test('each Journey puzzle\'s best line fits its move limit and earns three gold stars only with three modifiers', () => {
  for (const item of STAGES.filter(stage => stage.mode === 'puzzle')) {
    const line = BEST_PUZZLE_LINES[item.name];
    assert.ok(line.length <= PUZZLES[item.puzzleIndex].solution.length, `${item.name} fits the move limit`);
    const play = modifiers => {
      const state = createGame({ mode: 'puzzle', puzzleIndex: item.puzzleIndex, seed: item.seed, modifiers });
      state.status = 'playing';
      for (const [col, row] of line) assert.equal(clearAt(state, col, row).valid, true, item.name);
      assert.equal(state.status, 'won', item.name);
      return stageResult(item, state, state.modifiers).gold;
    };
    assert.equal(play(['noHints', 'noUndo', 'moveLimit']).stars, 3, item.name);
    assert.equal(play(['noBoosts', 'noHints']).stars < 3, true, `${item.name}: two modifiers fall short of three gold stars`);
  }
});

test('the reference player can complete every stage it calibrated', () => {
  for (const item of STAGES.filter(stage => stage.mode !== 'puzzle' && !stageStarTargets(stage).provisional)) {
    const config = { mode: item.mode, difficulty: item.difficulty, level: item.level, seed: item.seed };
    const plan = item.mode === 'strategy' ? planStrategy(config) : null;
    const attempts = [...PLAY_STYLES, ...(plan ? [{ ...PLAY_STYLES[1], plan }] : [])].map(({ policy, stepMs, plan }) => ({ policy, stepMs, plan }));
    const completed = attempts.some(attempt => playReference(config, { objective: item.objective, ...attempt, seed: 7919 }).status === 'complete');
    assert.ok(completed, item.name);
  }
});
