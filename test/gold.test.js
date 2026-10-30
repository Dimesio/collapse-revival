import test from 'node:test';
import assert from 'node:assert/strict';
import { GOLD_UNLOCK_STARS, goldUnlocked, goldPoints, goldResult, goldImproves, mixUnfinished, modifierNames } from '../dist/gold.js';
import { STAGES, JOURNEY_STORAGE_KEY, REPLAY_REWARD, stageGoldTargets, stageModifiers, createJourneyStore, createJourneySession } from '../dist/journey.js';
import { createClassicProgress } from '../dist/classic-progress.js';
import { getClassicGoldTargets } from '../dist/classic-stars.js';
import { ROWS, COLS, createGame, finalizeRound, hintsAllowed, undoAllowed } from '../dist/engine.js';

function journeyStorage(value) {
  const entries = new Map(value ? [[JOURNEY_STORAGE_KEY, JSON.stringify(value)]] : []);
  return { getItem: key => entries.get(key) ?? null, setItem: (key, text) => entries.set(key, text) };
}

function memory() {
  const values = new Map();
  return { get: (key, fallback) => values.has(key) ? structuredClone(values.get(key)) : fallback, set: (key, value) => values.set(key, structuredClone(value)) };
}

/** A settled-looking round for a stage, with chosen points and an empty board. */
function finishedRound(item, { status = 'levelComplete', points = 0, largestGroup = 0, modifiers = [] } = {}) {
  const state = createGame({ mode: item.mode, difficulty: item.difficulty, level: item.level, puzzleIndex: item.puzzleIndex ?? 0, seed: item.seed, modifiers });
  state.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  Object.assign(state.roundStats, { grossPoints: points, rawGrossPoints: points, largestGroup });
  state.status = status;
  return state;
}

test('hard mode opens at two regular stars', () => {
  assert.equal(GOLD_UNLOCK_STARS, 2);
  assert.deepEqual([0, 1, 2, 3, undefined].map(goldUnlocked), [false, false, true, true, false]);
});

test('gold points add the modifier bonus in whole points', () => {
  assert.equal(goldPoints(10000, 1), 10000);
  assert.equal(goldPoints(10000, 2), 10500);
  assert.equal(goldPoints(10000, 4), 11000, 'the bonus stops at 10%');
  assert.equal(goldPoints(3481, 3), 3829, 'rounded to the nearest point');
  assert.equal(goldPoints(-50, 3), 0);
});

test('gold stars need the objective, then gold points', () => {
  const targets = { two: 10500, three: 12000 };
  const result = (completed, points, modifiers) => goldResult({ completed, points, modifiers, targets });
  assert.equal(result(false, 99999, ['fastRows', 'noHints', 'noBoosts']).stars, 0, 'a missed objective earns no gold');
  assert.equal(result(true, 10000, ['fastRows']).stars, 1);
  assert.equal(result(true, 10000, ['fastRows', 'noHints']).stars, 2, 'a second modifier lifts 10,000 to 10,500');
  assert.equal(result(true, 10910, ['fastRows', 'noHints', 'noBoosts']).stars, 3, '10,910 + 10% reaches 12,000');
  assert.deepEqual(result(true, 10910, ['fastRows', 'noHints', 'noBoosts']), { stars: 3, points: 10910, adjusted: 12001, bonus: 10, modifiers: ['fastRows', 'noHints', 'noBoosts'], targets });
});

test('a gold record is replaced only by more gold stars, then more gold points', () => {
  const best = { stars: 2, adjustedScore: 5000 };
  assert.equal(goldImproves({ stars: 2, adjustedScore: 5001 }, best), true);
  assert.equal(goldImproves({ stars: 3, adjustedScore: 10 }, best), true);
  assert.equal(goldImproves({ stars: 1, adjustedScore: 9000 }, best), false);
  assert.equal(goldImproves({ stars: 2, adjustedScore: 5000 }, best), false);
  assert.equal(goldImproves({ stars: 0, adjustedScore: 9000 }, null), false, 'a miss is never saved');
  assert.equal(goldImproves({ stars: 1, adjustedScore: 0 }, null), true);
});

test('cautions match a mix by the modifiers that change play', () => {
  const unfinished = [['tallStart'], ['fastRows', 'tallStart']];
  assert.equal(mixUnfinished(['tallStart', 'noHints'], unfinished), true);
  assert.equal(mixUnfinished(['noBoosts', 'tallStart', 'fastRows'], unfinished), true);
  assert.equal(mixUnfinished(['fastRows', 'noHints'], unfinished), false);
  assert.equal(mixUnfinished(['noHints'], unfinished), false);
  assert.equal(mixUnfinished(['tallStart'], []), false);
  assert.deepEqual(modifierNames(['fastRows', 'moveLimit']), ['Quicker rows', 'Move limit']);
});

test('every stage that warns about a mix offers the modifiers in it', () => {
  const warned = STAGES.filter(item => item.unfinished);
  assert.deepEqual(warned.map(item => item.name), ['From Both Shores', 'A Moving Picture', 'The Long Way Home', 'Just One More']);
  for (const item of warned) {
    const offered = stageModifiers(item).map(entry => entry.id);
    for (const mix of item.unfinished) assert.ok(mix.length && mix.every(id => offered.includes(id)), item.name);
  }
});

test('a gold run needs two regular stars and a valid choice of modifiers', () => {
  const store = createJourneyStore(journeyStorage({ completed: 5, stars: { 1: { stars: 1, score: 100 }, 2: { stars: 2, score: 320 } } }));
  const session = createJourneySession(store);
  assert.equal(session.start(1, ['noHints']), null, 'one regular star does not open gold');
  assert.equal(session.start(2, ['fastRows']), null, 'Quicker rows is not offered in a puzzle');
  assert.equal(session.start(2, ['bogus']), null);
  const config = session.start(2, ['moveLimit', 'noUndo', 'moveLimit']);
  assert.deepEqual(config.modifiers, ['noUndo', 'moveLimit'], 'modifiers are de-duplicated and ordered');
  assert.deepEqual(session.modifiers(), ['noUndo', 'moveLimit']);
  const state = createGame(config);
  assert.equal(undoAllowed(state), false);
  assert.equal(hintsAllowed(state), true);
  assert.equal(state.moveLimit, 2);
  assert.deepEqual(session.start(2).modifiers, [], 'an ordinary run has no modifiers');
  assert.deepEqual(session.modifiers(), []);
});

test('a gold run saves gold apart from regular stars and keeps the best attempt', () => {
  const storage = journeyStorage({ completed: 6, coins: 0, stars: { 5: { stars: 2, score: 25000 } } });
  const store = createJourneyStore(storage);
  const session = createJourneySession(store);
  const item = STAGES[5];
  const targets = stageGoldTargets(item);
  const group = item.objective.target;
  const modifiers = ['fastRows', 'noHints'];

  session.start(5, modifiers);
  const missed = session.finish(finishedRound(item, { points: 99999, largestGroup: group - 1, modifiers }));
  assert.equal(missed.complete, false);
  assert.equal(missed.gold.stars, 0);
  assert.deepEqual(store.getState().gold, {}, 'a missed objective saves no gold');

  const twoGold = Math.ceil(targets.two / 1.05);
  const first = session.finish(finishedRound(item, { points: twoGold, largestGroup: group, modifiers }));
  assert.equal(first.complete, true);
  assert.equal(first.gold.stars, 2);
  assert.equal(first.reward, REPLAY_REWARD, 'a gold run pays the replay reward');
  assert.equal(first.newGoldBest, true);
  assert.deepEqual(store.getState().gold[5], { stars: 2, score: twoGold, adjustedScore: first.gold.adjusted, modifiers });
  assert.deepEqual(store.getState().stars[5], { stars: 2, score: 25000 }, 'regular stars come only from ordinary runs');

  session.start(5, ['tallStart']);
  const weaker = session.finish(finishedRound(item, { points: targets.three * 2, largestGroup: group - 1, modifiers: ['tallStart'] }));
  assert.equal(weaker.complete, false);
  session.start(5, ['tallStart']);
  const oneGold = session.finish(finishedRound(item, { points: 100, largestGroup: group, modifiers: ['tallStart'] }));
  assert.equal(oneGold.gold.stars, 1);
  assert.equal(oneGold.newGoldBest, false);
  assert.deepEqual(createJourneyStore(storage).getState().gold[5].modifiers, modifiers, 'a weaker attempt never replaces the record or its modifiers');
});

test('a gold replay keeps its modifiers', () => {
  const store = createJourneyStore(journeyStorage({ completed: 3, stars: { 0: { stars: 3, score: 40000 } } }));
  const session = createJourneySession(store);
  session.start(0, ['tallStart', 'noBoosts']);
  session.abandon();
  assert.deepEqual(session.lastModifiers(), ['tallStart', 'noBoosts']);
  assert.deepEqual(session.start(0, session.lastModifiers()).modifiers, ['tallStart', 'noBoosts']);
});

test('Classic gold runs keep their own record for each level and difficulty', () => {
  const storage = memory();
  const progress = createClassicProgress(storage);
  const targets = getClassicGoldTargets(1, 'easy');
  const round = (points, modifiers, status = 'levelComplete') => {
    const state = createGame({ seed: 4, modifiers });
    state.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    state.roundStats.grossPoints = points;
    state.score = points;
    state.status = status;
    finalizeRound(state);
    return state;
  };
  const gold = (state) => goldResult({ completed: state.status !== 'gameOver', points: state.roundSummary.netPoints, modifiers: state.modifiers, targets: { two: targets.twoStars, three: targets.threeStars } });

  const ordinary = round(35000, []);
  progress.record(ordinary, 'ordinary');
  assert.equal(progress.best(1, 'easy').stars, 3);
  assert.equal(progress.goldBest(1, 'easy'), null, 'an ordinary run earns no gold');

  const hard = round(targets.threeStars, ['fastRows']);
  const saved = progress.record(hard, 'gold', gold(hard));
  assert.deepEqual(saved, { previous: null, best: { stars: 3, score: targets.threeStars, adjustedScore: targets.threeStars, modifiers: ['fastRows'] }, improved: true });
  const weaker = round(1000, ['fastRows', 'tallStart', 'noHints']);
  assert.equal(progress.record(weaker, 'weaker', gold(weaker)).improved, false);
  assert.equal(progress.record(weaker, 'weaker', gold(weaker)), null, 'a round is saved once');

  const reload = createClassicProgress(storage);
  assert.deepEqual(reload.best(1, 'easy'), { stars: 3, score: 35000 }, 'gold runs never change regular stars');
  assert.deepEqual(reload.goldBest(1, 'easy').modifiers, ['fastRows']);
  assert.equal(reload.goldBest(1, 'normal'), null);
  assert.equal(reload.entries()[0].gold.stars, 3);
  const runs = reload.exportRuns();
  assert.equal(runs.length, 3);
  assert.deepEqual(runs[2].modifiers, ['fastRows', 'tallStart', 'noHints']);
  assert.equal(runs[2].goldStars, 1);
  assert.equal(runs[0].modifiers, undefined);
});

test('stored gold records are cleaned on load', () => {
  const storage = memory();
  storage.set('classic-gold', { 'easy:1': { stars: 9, score: 50, adjustedScore: 55, modifiers: ['noUndo', 'fastRows'] }, 'easy:2': { stars: 2, modifiers: [] }, 'hard:3': 'bad' });
  const progress = createClassicProgress(storage);
  assert.deepEqual(progress.goldBest(1, 'easy'), { stars: 3, score: 50, adjustedScore: 55, modifiers: ['fastRows'] });
  assert.equal(progress.goldBest(2, 'easy'), null, 'a gold record without modifiers is ignored');
  assert.equal(progress.goldBest(3, 'hard'), null);
});
