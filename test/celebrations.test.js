import test from 'node:test';
import assert from 'node:assert/strict';
import { COLS, ROWS, clearAt, createGame } from '../dist/engine.js';
import { CHEERS, CHEER_RULES, cheerEvents, clearSizes, createCheers, dangerLevel } from '../dist/celebrations.js';
import { seededRandom } from '../tools/reference-player.js';
import { measureMode } from '../tools/calibrate-cheers.js';

const emptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null));
/** A board in play with nothing near the top; cheers read only these fields. */
const calm = (extra = {}) => ({ status: 'playing', mode: 'classic', score: 0, elapsed: 0, board: emptyBoard(), ...extra });
const clear = (clearedCount, clearedSides = []) => ({ valid: true, scoring: { clearedCount, clearedSides } });

/** A real Classic game whose single column reaches row 2: a gold trio on top of alternating blocks. */
function closeCallGame() {
  const state = createGame({ mode: 'classic', difficulty: 'easy', level: 1, seed: 1 });
  state.status = 'playing';
  state.board = emptyBoard();
  let id = 1000;
  for (let row = 1; row < ROWS; row++) state.board[row][5] = { id: id++, color: row <= 3 ? 1 : row % 2 ? 2 : 3, kind: 'normal', side: 'bottom' };
  return state;
}

test('coinciding events keep the most significant first', () => {
  assert.deepEqual(cheerEvents({ mode: 'classic', scoring: { clearedCount: 20, clearedSides: ['board'] }, score: 500, best: 400, closeCallArmed: true, danger: 0 }), ['sweep', 'best', 'closeCall', 'huge']);
  assert.equal(cheerEvents({ mode: 'relapse', scoring: { clearedCount: 6, clearedSides: ['top', 'bottom'] } })[0], 'doubleSweep');
  assert.deepEqual(cheerEvents({ mode: 'classic', scoring: { clearedCount: 9 }, score: 500, best: 0 }), [], 'no best to pass, and nine blocks is ordinary');
  assert.deepEqual(cheerEvents({ mode: 'classic', scoring: { clearedCount: 3 }, closeCallArmed: true, danger: 1 }), [], 'still in danger');
  assert.deepEqual(cheerEvents({ mode: 'classic', scoring: { clearedCount: 15 } }), ['big']);
  assert.deepEqual(cheerEvents({ mode: 'strategy', scoring: { clearedCount: 15 } }), [], 'Strategy’s full board makes fifteen ordinary');
  assert.deepEqual(clearSizes('strategy'), { bigClear: 20, hugeClear: 30 });
  assert.deepEqual(clearSizes('countdown'), { bigClear: CHEER_RULES.bigClear, hugeClear: CHEER_RULES.hugeClear });
  const priorities = Object.values(CHEERS).map(cheer => cheer.priority);
  assert.ok(CHEERS.sweep.priority > CHEERS.best.priority && CHEERS.best.priority > CHEERS.closeCall.priority && CHEERS.closeCall.priority > CHEERS.huge.priority && CHEERS.huge.priority > CHEERS.big.priority, `${priorities}`);
});

test('big clears wait their turn, and bigger moments never do', () => {
  const cheers = createCheers({ random: seededRandom(4) });
  cheers.reset();
  const state = calm();
  assert.equal(cheers.afterClear(state, clear(10)).type, 'big');
  state.elapsed += 1000;
  assert.equal(cheers.afterClear(state, clear(12)), null, 'a second big clear right away stays quiet');
  assert.equal(cheers.afterClear(state, clear(16)).type, 'huge', 'a huge clear still gets its cheer');
  assert.equal(cheers.afterClear(state, clear(18)), null, 'but not two in a row');
  assert.equal(cheers.afterClear(state, clear(5, ['board'])).type, 'sweep', 'a clean sweep always gets its cheer');
  for (let index = 0; index < CHEER_RULES.quietClears; index++) assert.equal(cheers.afterClear(state, clear(3)), null);
  assert.equal(cheers.afterClear(state, clear(10)), null, 'enough clears, but not enough time');
  state.elapsed += CHEER_RULES.quietMs;
  for (let index = 0; index < CHEER_RULES.quietClears; index++) cheers.afterClear(state, clear(3));
  assert.equal(cheers.afterClear(state, clear(10)).type, 'big');
});

test('cheer phrases rotate: each is heard before any repeats, and never twice running', () => {
  const cheers = createCheers({ random: seededRandom(9) });
  cheers.reset();
  const state = calm();
  const phrases = [];
  for (let index = 0; index < 40; index++) {
    state.elapsed += CHEER_RULES.quietMs;
    for (let quiet = 0; quiet < CHEER_RULES.quietClears - 1; quiet++) cheers.afterClear(state, clear(3));
    phrases.push(cheers.afterClear(state, clear(11)).phrase);
  }
  const deck = CHEERS.big.phrases.length;
  for (let start = 0; start < phrases.length; start += deck) assert.equal(new Set(phrases.slice(start, start + deck)).size, deck, `round ${start / deck + 1} uses every phrase`);
  phrases.forEach((phrase, index) => assert.notEqual(phrase, phrases[index - 1], `cheer ${index + 1} repeats`));
});

test('passing a personal best cheers once a run', () => {
  const cheers = createCheers();
  cheers.reset({ best: 1000 });
  assert.equal(cheers.afterClear(calm({ score: 900 }), clear(3)), null);
  const passed = cheers.afterClear(calm({ score: 1100 }), clear(3));
  assert.deepEqual({ type: passed.type, detail: passed.detail }, { type: 'best', detail: 'Your best was 1,000' });
  assert.equal(cheers.afterClear(calm({ score: 1500, elapsed: 60000 }), clear(3)), null, 'once is enough');
  cheers.reset({ best: 1000 });
  assert.equal(cheers.afterClear(calm({ score: 1100 }), clear(3)).type, 'best', 'a new run can pass it again');
  cheers.reset({ best: 0 });
  assert.equal(cheers.afterClear(calm({ score: 5000 }), clear(3)), null, 'a first game has no best to pass');
  const sweep = createCheers();
  sweep.reset({ best: 1000 });
  const both = sweep.afterClear(calm({ score: 2000 }), clear(6, ['board']));
  assert.equal(both.type, 'sweep');
  assert.deepEqual(both.also, ['best'], 'the sweep’s banner can mention the best it also passed');
});

test('a close call cheers when the board gets back to safety', () => {
  const state = closeCallGame();
  assert.equal(dangerLevel(state), 3, 'a block in the second row');
  const cheers = createCheers();
  cheers.reset();
  cheers.watch(state);
  const cheer = cheers.afterClear(state, clearAt(state, 5, 1));
  assert.equal(state.status, 'playing');
  assert.equal(dangerLevel(state), 0, 'four clear rows again');
  assert.deepEqual({ type: cheer.type, detail: cheer.detail }, { type: 'closeCall', detail: 'Out of the danger zone' });

  const paused = closeCallGame();
  cheers.reset();
  cheers.watch(paused);
  paused.status = 'paused';
  cheers.watch(paused);
  paused.status = 'playing';
  assert.equal(cheers.afterClear(paused, clearAt(paused, 5, 1))?.type, 'closeCall', 'a pause does not end the close call');

  const boosted = closeCallGame();
  cheers.reset();
  cheers.watch(boosted);
  for (let row = 1; row <= 3; row++) boosted.board[row][5] = null;
  cheers.watch(boosted);
  assert.equal(cheers.afterClear(boosted, clear(3)), null, 'a board calmed some other way, such as a boost, earns nothing');

  const nextLevel = closeCallGame();
  cheers.reset();
  cheers.watch(nextLevel);
  cheers.newRound();
  assert.equal(cheers.afterClear(calm(), clear(3)), null, 'a fresh level starts calm');
});

test('puzzles, finished rounds and invalid clears get no cheers', () => {
  const cheers = createCheers();
  cheers.reset({ best: 10 });
  assert.equal(cheers.afterClear(calm({ mode: 'puzzle', score: 500 }), clear(20, ['board'])), null, 'a puzzle’s biggest group can be its trap');
  assert.equal(cheers.afterClear(calm({ status: 'levelComplete', score: 500 }), clear(20, ['board'])), null, 'the round result celebrates instead');
  assert.equal(cheers.afterClear(calm({ score: 500 }), { valid: false, scoring: null }), null);
});

test('in simulated play, cheers stay occasional', () => {
  for (const mode of ['classic', 'strategy']) {
    const result = measureMode(mode, { runs: 1 });
    const shown = result.shownPer100.big + result.shownPer100.huge;
    assert.ok(shown >= 1 && shown <= 6, `${mode}: ${shown} big or huge cheers per 100 clears`);
    for (const type of Object.keys(CHEERS)) assert.ok(result.shownPer100[type] <= result.earnedPer100[type], `${mode}: ${type} is never shown more than earned`);
  }
});
