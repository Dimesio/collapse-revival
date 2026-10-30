import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceTime, clearAt, createGame, finalizeRound } from '../dist/engine.js';
import { PUZZLES } from '../dist/puzzles.js';
import {
  CHALLENGE_VERSION, PUZZLE_ROTATION, WEEKLY_ROTATION, challengeConfig, challengeImproves, challengeResult, createChallengeStore,
  decodeChallenge, encodeChallenge, findWeekly, hashText, shareText, validateChallenge, weekOf, weeklyChallenge,
} from '../dist/challenges.js';
import { bestLine, timeLeft, weekDates } from '../dist/challenge-panel.js';
import { measureTemplate } from '../tools/calibrate-challenges.js';

const WEEK = 7 * 86400000;
const definition = (extra = {}) => ({ version: CHALLENGE_VERSION, mode: 'classic', difficulty: 'normal', level: 3, puzzleIndex: 0, seed: 123456789, objective: { type: 'group', target: 12 }, modifiers: ['noBoosts'], ...extra });
const definitionOf = challenge => ({ version: challenge.version, mode: challenge.mode, difficulty: challenge.difficulty, level: challenge.level, puzzleIndex: challenge.puzzleIndex, seed: challenge.seed, objective: challenge.objective, modifiers: challenge.modifiers });
/** A code with a correct typo check, for testing what is checked after it. */
const signed = body => `${body}-${(hashText(body) % 1296).toString(36).toUpperCase().padStart(2, '0')}`;
/** Everything that decides how a game plays out: the board, the incoming row and the generator. */
const startingConditions = state => JSON.stringify({ board: state.board, nextRow: state.nextRow, rngState: state.rngState, rowInterval: state.rowInterval, rowsTarget: state.rowsTarget, timeLeft: state.timeLeft, modifiers: state.modifiers, moveLimit: state.moveLimit });
const weekStarting = step => weeklyChallenge((WEEKLY_ROTATION.firstWeek + step) * WEEK - 3 * 86400000 + 1000);

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([key, value]) => [key, JSON.stringify(value)]));
  return { get: (key, fallback) => values.has(key) ? JSON.parse(values.get(key)) : fallback, set: (key, value) => values.set(key, JSON.stringify(value)), raw: values };
}

test('a challenge code reproduces the same definition and the same game', () => {
  const challenges = [
    ...WEEKLY_ROTATION.templates.map((_, step) => definitionOf(weekStarting(step))),
    definition({ mode: 'relapse', difficulty: 'hard', level: 30, seed: 0xffffffff, objective: { type: 'allClear', target: 2 }, modifiers: ['tallStart', 'fastRows', 'noHints', 'noBoosts'] }),
    definition({ mode: 'puzzle', puzzleIndex: PUZZLES.length - 1, objective: { type: 'group', target: 5 }, modifiers: ['moveLimit', 'noUndo', 'noHints', 'noBoosts'] }),
    definition({ mode: 'continuous', objective: { type: 'streak', target: 9 }, modifiers: [] }),
  ];
  for (const challenge of challenges) {
    const code = encodeChallenge(challenge);
    const decoded = decodeChallenge(code);
    const canonical = validateChallenge(challenge).challenge;
    assert.equal(decoded.ok, true, code);
    assert.deepEqual(decoded.challenge, canonical, code);
    assert.equal(encodeChallenge(decoded.challenge), code, 'a decoded code encodes back to itself');
    for (const step of [0, 4500, 30000]) {
      const first = createGame(challengeConfig(canonical));
      const second = createGame(challengeConfig(decoded.challenge));
      for (const state of [first, second]) { state.status = 'playing'; advanceTime(state, step); }
      assert.equal(startingConditions(second), startingConditions(first), `${code} after ${step}ms`);
    }
  }
  const code = encodeChallenge(definition());
  assert.match(code, /^CR1-CLN3-G12-B-075BCD15-[0-9A-Z]{2}$/);
  for (const text of [code.toLowerCase(), `  ${code}\n`, `https://example.test/play/#challenge=${code}`, `https://example.test/?challenge=${code}&utm=x`]) {
    assert.equal(encodeChallenge(decodeChallenge(text).challenge), code, `reads ${JSON.stringify(text)}`);
  }
  // A puzzle board is authored: its seed, difficulty and level never matter, so they are fixed.
  const puzzle = validateChallenge(definition({ mode: 'puzzle', puzzleIndex: 3, seed: 999, difficulty: 'hard', level: 9, objective: { type: 'finish' }, modifiers: [] })).challenge;
  assert.deepEqual({ seed: puzzle.seed, difficulty: puzzle.difficulty, level: puzzle.level }, { seed: 0, difficulty: 'easy', level: 1 });
  assert.equal(validateChallenge(definition({ modifiers: ['noBoosts', 'fastRows', 'fastRows'] })).challenge.modifiers.join(), 'fastRows,noBoosts', 'modifiers are kept in one order, once each');
});

test('the weekly challenge holds for a whole UTC week and changes on Monday', () => {
  const monday = Date.UTC(2026, 9, 26);
  const week = weekOf(monday);
  assert.deepEqual({ id: week.id, start: week.start, end: week.end }, { id: '2026-W44', start: monday, end: monday + WEEK });
  assert.equal(weekOf(monday + WEEK - 1).id, '2026-W44', 'Sunday 23:59:59.999 UTC is the same week');
  assert.equal(weekOf(monday - 1).id, '2026-W43', 'Sunday night before is the week before');
  assert.equal(weekOf(Date.UTC(2026, 11, 31)).id, '2026-W53', '2026 has 53 ISO weeks');
  assert.equal(weekOf(Date.UTC(2027, 0, 4)).id, '2027-W01');
  assert.equal(weekOf(Date.UTC(2021, 0, 3)).id, '2020-W53', 'early January can belong to the previous year’s last week');
  assert.equal(weekOf(new Date(monday + 5000)).index, week.index, 'a Date or a timestamp');

  const thisWeek = weeklyChallenge(monday);
  assert.equal(thisWeek.name, WEEKLY_ROTATION.templates[0].name, 'the rotation starts the week of 26 October 2026');
  for (const time of [monday + 1, monday + 3 * 86400000 + 12345, monday + WEEK - 1]) assert.equal(weeklyChallenge(time).code, thisWeek.code);
  assert.notEqual(weeklyChallenge(monday + WEEK).code, thisWeek.code);

  const turn = WEEKLY_ROTATION.templates.length;
  const weeks = Array.from({ length: turn * 2 + 1 }, (_, step) => weekStarting(step));
  assert.deepEqual(weeks.slice(0, turn).map(item => item.name), WEEKLY_ROTATION.templates.map(item => item.name), 'each template in turn');
  assert.equal(weeks[turn].name, weeks[0].name, 'then the rotation repeats');
  assert.equal(new Set(weeks.map(item => item.code)).size, weeks.length, 'with a new board every week');
  const puzzleStep = WEEKLY_ROTATION.templates.findIndex(item => item.mode === 'puzzle');
  assert.deepEqual([weeks[puzzleStep], weeks[puzzleStep + turn]].map(item => item.puzzleIndex), PUZZLE_ROTATION.slice(0, 2), 'puzzle weeks step through their own list');
  assert.ok(weeks.every(item => item.modifiers.includes('noBoosts')), 'every weekly turns boosts off, so results compare fairly');
  assert.equal(findWeekly(weeks[3].code, weeks[5].week.start)?.week.id, weeks[3].week.id, 'an earlier weekly’s code is recognized');
  assert.equal(findWeekly(encodeChallenge(definition()), monday), null);
});

test('malformed or unsupported codes are rejected with a clear reason', () => {
  const good = encodeChallenge(definition());
  const typo = good.replace('G12', 'G13');
  const cases = [
    ['', /Paste a challenge code/],
    ['hello there', /doesn’t look like a challenge code/],
    [signed('CR2-CLN3-G12-B-075BCD15'), /newer version of the game \(format 2\)/],
    [signed('CR0-CLN3-G12-B-075BCD15'), /Format 0 codes are not supported/],
    [good.split('-').slice(0, 4).join('-'), /incomplete/],
    [typo, /typo/],
    [signed('CR1-XXN3-G12-B-075BCD15'), /mode this game doesn’t have/],
    [signed('CR1-CLX3-G12-B-075BCD15'), /Difficulty/],
    [signed('CR1-CLN31-G12-B-075BCD15'), /Levels run from 1 to 30/],
    [signed('CR1-CLN0-G12-B-075BCD15'), /Levels run from 1 to 30/],
    [signed(`CR1-PZ${PUZZLES.length + 1}-F-0-00000000`), new RegExp(`Puzzles run from 1 to ${PUZZLES.length}`)],
    [signed('CR1-CLN3-Z12-B-075BCD15'), /objective type is not supported/],
    [signed('CR1-CLN3-G-B-075BCD15'), /missing its target/],
    [signed('CR1-CLN3-F5-B-075BCD15'), /missing its target/],
    [signed('CR1-CLN3-G2-B-075BCD15'), /whole number from 3/],
    [signed('CR1-PZ3-C5-0-00000000'), /does not fit this mode/],
    [signed('CR1-CNN3-F-0-075BCD15'), /does not fit this mode/],
    [signed('CR1-CLN3-G12-U-075BCD15'), /No undo is not available in this mode/],
    [signed('CR1-CLN3-G12-X-075BCD15'), /modifier this game doesn’t have/],
    [signed('CR1-CLN3-G12-BB-075BCD15'), /repeats a modifier/],
    [signed('CR1-CLN3-G12-B-75BCD15'), /board seed/],
  ];
  for (const [text, reason] of cases) {
    const result = decodeChallenge(text);
    assert.equal(result.ok, false, `${JSON.stringify(text)} is rejected`);
    assert.match(result.reason, reason, JSON.stringify(text));
  }
  assert.match(validateChallenge(definition({ version: 3 })).reason, /newer version/);
  assert.match(validateChallenge(definition({ seed: 1.5 })).reason, /seed/);
  assert.match(validateChallenge(definition({ seed: 2 ** 32 })).reason, /seed/);
  assert.match(validateChallenge(definition({ level: '3' })).reason, /Levels/);
  assert.match(validateChallenge(definition({ modifiers: 'noBoosts' })).reason, /list/);
  assert.equal(validateChallenge(null).ok, false);
  assert.throws(() => encodeChallenge(definition({ mode: 'arcade' })), /mode/);
});

test('a challenge is judged by its objective and settled round points', () => {
  const puzzle = PUZZLES.findIndex(item => item.name === 'Lighthouse');
  const challenge = validateChallenge(definition({ mode: 'puzzle', puzzleIndex: puzzle, objective: { type: 'finish' }, modifiers: ['moveLimit', 'noBoosts'] })).challenge;
  const state = createGame(challengeConfig(challenge));
  state.status = 'playing';
  assert.equal(state.moveLimit, PUZZLES[puzzle].solution.length, 'the move limit is the known solution’s length');
  assert.equal(challengeResult(challenge, state).status, 'active');
  for (const move of PUZZLES[puzzle].solution) clearAt(state, move.col, move.row);
  finalizeRound(state);
  const result = challengeResult(challenge, state);
  assert.equal(result.status, 'complete');
  assert.equal(result.points, state.roundSummary.netPoints);
  assert.equal(result.stats.moves, PUZZLES[puzzle].solution.length);

  const bigger = validateChallenge({ ...challenge, objective: { type: 'group', target: 40 } }).challenge;
  assert.equal(challengeResult(bigger, state).status, 'failed', 'clearing the board is not enough when the goal was a bigger group');
  assert.match(challengeResult(bigger, state).progress, /Biggest group: \d+ of 40/);

  const classic = validateChallenge(definition({ objective: { type: 'finish' } })).challenge;
  const lost = createGame(challengeConfig(classic));
  lost.status = 'gameOver';
  assert.equal(challengeResult(classic, lost).status, 'failed');
});

test('each exact challenge keeps its own record', () => {
  let clock = Date.UTC(2026, 9, 29);
  const storage = memoryStorage();
  const store = createChallengeStore(storage, { now: () => new Date(clock++) });
  const base = encodeChallenge(definition());
  const otherSeed = encodeChallenge(definition({ seed: 42 }));
  const otherRule = encodeChallenge(definition({ modifiers: ['noBoosts', 'fastRows'] }));
  const otherGoal = encodeChallenge(definition({ objective: { type: 'group', target: 13 } }));
  assert.equal(new Set([base, otherSeed, otherRule, otherGoal]).size, 4);
  const result = (completed, points) => ({ completed, points, stats: { largestGroup: 14, blocksCleared: 300, moves: 80 } });

  store.begin(base, { name: 'Gather Round', week: '2026-W44' });
  const miss = store.finish(base, result(false, 30000), 'run-1');
  assert.deepEqual({ improved: miss.improved, completions: miss.entry.completions, attempts: miss.entry.attempts }, { improved: true, completions: 0, attempts: 1 });
  store.begin(base);
  const first = store.finish(base, result(true, 12000), 'run-2');
  assert.equal(first.improved, true, 'a completion beats a higher-scoring miss');
  assert.equal(first.firstCompletion, true);
  // Undo can reopen a decided puzzle; the same run counts one completion.
  const again = store.finish(base, result(true, 15000), 'run-2');
  assert.deepEqual({ completions: again.entry.completions, best: again.best.points, improved: again.improved }, { completions: 1, best: 15000, improved: true });
  store.begin(base);
  const worse = store.finish(base, result(true, 9000), 'run-3');
  assert.deepEqual({ improved: worse.improved, best: worse.best.points, completions: worse.entry.completions, attempts: worse.entry.attempts }, { improved: false, best: 15000, completions: 2, attempts: 3 });
  store.begin(base);
  assert.equal(store.finish(base, result(false, 90000), 'run-4').improved, false, 'a miss never replaces a completion');

  for (const code of [otherSeed, otherRule, otherGoal]) assert.equal(store.entry(code), null, 'other configurations are untouched');
  store.begin(otherSeed);
  store.finish(otherSeed, result(true, 50000), 'run-5');
  assert.equal(store.entry(base).best.points, 15000, 'and they do not touch it either');

  const reloaded = createChallengeStore(storage);
  assert.deepEqual(reloaded.entry(base), store.entry(base), 'records survive a reload');
  assert.deepEqual(reloaded.recent().map(item => item.code), [otherSeed, base], 'newest first');
  assert.equal(reloaded.entry(base).name, 'Gather Round');
  assert.equal(reloaded.entry(base).week, '2026-W44');

  const corrupt = createChallengeStore(memoryStorage({ challenges: { entries: { 'not-a-code': { attempts: 3 }, [base]: { attempts: -4, completions: 'x', best: { completed: 'yes' } } } } }));
  assert.equal(corrupt.entry('not-a-code'), null, 'unreadable codes are dropped');
  assert.deepEqual({ attempts: corrupt.entry(base).attempts, completions: corrupt.entry(base).completions, best: corrupt.entry(base).best }, { attempts: 0, completions: 0, best: null });

  const crowded = createChallengeStore(memoryStorage(), { now: () => new Date(clock++) });
  for (let seed = 0; seed < 70; seed++) crowded.begin(encodeChallenge(definition({ seed })));
  assert.equal(crowded.recent(100).length, 60, 'the oldest records make room after 60 challenges');
  assert.equal(crowded.entry(encodeChallenge(definition({ seed: 69 }))).attempts, 1);
  assert.equal(crowded.entry(encodeChallenge(definition({ seed: 0 }))), null);

  assert.equal(challengeImproves(null, null), false);
  assert.equal(challengeImproves({ completed: false, points: 1 }, null), true);
});

test('a copied result names the challenge, the outcome and the code that replays it', () => {
  const weekly = weeklyChallenge(Date.UTC(2026, 9, 29));
  const result = { completed: true, points: 41250, stats: { largestGroup: 18, blocksCleared: 320, bestStreak: 6, allClears: 0, moves: 90, remainingBlocks: 4, elapsed: 120000, boostsUsed: 0 } };
  const text = shareText(weekly, result, { name: weekly.name, week: weekly.week, link: `https://example.test/#challenge=${weekly.code}` });
  assert.equal(text, [
    'Collapse Revival · Weekly challenge 2026-W44 · Gather Round',
    'Classic · Easy · Level 3 · No boosts',
    'Goal: Clear a group of 12 or more, then finish the level',
    '✓ Complete · 41,250 points · biggest group 18',
    `Same board, same rules: ${weekly.code}`,
    `https://example.test/#challenge=${weekly.code}`,
  ].join('\n'));
  const shared = validateChallenge(definition({ mode: 'relapse', objective: { type: 'allClear', target: 2 }, modifiers: [] })).challenge;
  const missed = shareText(shared, { ...result, completed: false, points: 900, stats: { ...result.stats, allClears: 1, boostsUsed: 2 } });
  assert.match(missed, /^Collapse Revival · A shared challenge\n/);
  assert.match(missed, /✗ Not this time · 900 points · 1 side emptied · 2 boosts used/);
  assert.ok(!missed.includes('https://'), 'no link unless the page gives one');
});

test('the challenge panel words its dates, time left and best', () => {
  const week = weekOf(Date.UTC(2026, 9, 29));
  assert.equal(weekDates(week), 'Oct 26 – Nov 1');
  assert.equal(timeLeft(week.end, week.end - 3.5 * 86400000), '3 days left');
  assert.equal(timeLeft(week.end, week.end - 30 * 3600000), '1 day left');
  assert.equal(timeLeft(week.end, week.end - 5.5 * 3600000), '5 hours left');
  assert.equal(timeLeft(week.end, week.end - 90 * 60000), '1 hour left');
  assert.equal(timeLeft(week.end, week.end - 60000), 'Under an hour left');
  assert.equal(bestLine(null), 'Not played yet.');
  assert.equal(bestLine({ attempts: 1, completions: 0, best: null }), '1 try so far · no finished round yet.');
  assert.equal(bestLine({ attempts: 3, completions: 0, best: { completed: false, points: 12300 } }), 'Not completed yet · best try 12,300 points · 3 tries.');
  assert.equal(bestLine({ attempts: 5, completions: 2, best: { completed: true, points: 41250 } }), 'Your best: ✓ 41,250 points · completed 2 of 5 tries.');
});

test('weekly puzzles can be solved within their move limit', () => {
  for (const puzzleIndex of PUZZLE_ROTATION) {
    const puzzle = PUZZLES[puzzleIndex];
    const challenge = validateChallenge(definition({ mode: 'puzzle', puzzleIndex, objective: { type: 'finish' }, modifiers: ['noBoosts', 'moveLimit'] })).challenge;
    const state = createGame(challengeConfig(challenge));
    state.status = 'playing';
    for (const move of puzzle.solution) clearAt(state, move.col, move.row);
    assert.equal(challengeResult(challenge, state).status, 'complete', puzzle.name);
  }
});

test('in simulated play, each weekly is neither out of reach nor a formality', () => {
  WEEKLY_ROTATION.templates.forEach((template, index) => {
    if (template.mode === 'puzzle') return;
    const { completionShare } = measureTemplate(index, { weeks: 4, runs: 1, propose: false });
    assert.ok(completionShare >= 0.15 && completionShare <= 0.85, `${template.name}: ${Math.round(completionShare * 100)}% of simulated runs complete it`);
  });
});
