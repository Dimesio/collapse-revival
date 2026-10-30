import { MODES, roundPoints } from './engine.js';
import { PUZZLES } from './puzzles.js';
import { describeObjective, describeProgress, evaluateObjective, validateObjective } from './objectives.js';
import { MODIFIERS, validateModifiers } from './modifiers.js';
import { moveLimitText } from './puzzle-stars.js';

/**
 * Challenges as plain, versioned data: a mode, difficulty, level or puzzle,
 * seed, objective and modifiers. The same definition always builds the same
 * game, so a code or link reproduces a challenge on any device, and a later
 * multiplayer match can start from one. Nothing here touches the page.
 */
export const CHALLENGE_VERSION = 1;
export const CHALLENGE_LEVELS = Object.freeze({ min: 1, max: 30 });

const DAY = 86400000;
const WEEK = 7 * DAY;
// 1 January 1970 was a Thursday, so weeks counted from Monday 29 December 1969 start on Mondays.
const MONDAY_EPOCH = -3 * DAY;
const mod = (value, size) => ((value % size) + size) % size;

const MODE_CODES = Object.freeze({ classic: 'CL', strategy: 'ST', puzzle: 'PZ', relapse: 'RL', continuous: 'CN', countdown: 'CD', slider: 'SL' });
const DIFFICULTY_CODES = Object.freeze({ easy: 'E', normal: 'N', hard: 'H' });
const OBJECTIVE_CODES = Object.freeze({ finish: 'F', score: 'S', group: 'G', blocks: 'B', allClear: 'A', fewBlocks: 'L', streak: 'C' });
const MODIFIER_CODES = Object.freeze({ fastRows: 'Q', tallStart: 'T', noBoosts: 'B', noHints: 'H', noUndo: 'U', moveLimit: 'M' });
const invert = codes => Object.fromEntries(Object.entries(codes).map(([key, code]) => [code, key]));
const MODES_BY_CODE = invert(MODE_CODES);
const DIFFICULTIES_BY_CODE = invert(DIFFICULTY_CODES);
const OBJECTIVES_BY_CODE = invert(OBJECTIVE_CODES);
const MODIFIERS_BY_CODE = invert(MODIFIER_CODES);

/**
 * 32-bit FNV-1a with a final mix, so labels a character apart, such as two
 * week labels, still give unrelated seeds. Stable across browsers.
 */
export function hashText(text) {
  let hash = 0x811c9dc5;
  for (const char of String(text)) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35);
  return (hash ^ (hash >>> 16)) >>> 0;
}

const fail = reason => ({ ok: false, reason });

/**
 * Checks a definition and returns its canonical form. A puzzle board is
 * authored, so its seed, difficulty and level are fixed; two codes for the
 * same puzzle setup are then the same challenge.
 */
export function validateChallenge(value) {
  if (!value || typeof value !== 'object') return fail('A challenge needs its settings.');
  if (value.version !== CHALLENGE_VERSION) return fail(Number.isInteger(value.version) && value.version > CHALLENGE_VERSION ? `This challenge comes from a newer version of the game (format ${value.version}). Refresh the page to update, then try again.` : 'That challenge format is not supported.');
  const { mode } = value;
  if (!MODES.some(item => item.id === mode)) return fail('That challenge names a mode this game doesn’t have.');
  const puzzle = mode === 'puzzle';
  const difficulty = puzzle ? 'easy' : value.difficulty;
  if (!Object.hasOwn(DIFFICULTY_CODES, difficulty)) return fail('Difficulty must be easy, normal or hard.');
  const level = puzzle ? 1 : value.level;
  if (!Number.isInteger(level) || level < CHALLENGE_LEVELS.min || level > CHALLENGE_LEVELS.max) return fail(`Levels run from ${CHALLENGE_LEVELS.min} to ${CHALLENGE_LEVELS.max}.`);
  const puzzleIndex = puzzle ? value.puzzleIndex : 0;
  if (!Number.isInteger(puzzleIndex) || puzzleIndex < 0 || puzzleIndex >= PUZZLES.length) return fail(`Puzzles run from 1 to ${PUZZLES.length}.`);
  const seed = puzzle ? 0 : value.seed;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) return fail('The board seed must be a whole number from 0 to 4294967295.');
  const objective = validateObjective(mode, value.objective);
  if (!objective.ok) return fail(objective.reason);
  const modifiers = validateModifiers(mode, value.modifiers ?? []);
  if (!modifiers.ok) return fail(modifiers.reason);
  return { ok: true, challenge: { version: CHALLENGE_VERSION, mode, difficulty, level, puzzleIndex, seed, objective: objective.objective, modifiers: modifiers.modifiers } };
}

/** The options createGame needs to build the challenge's starting board. */
export function challengeConfig(challenge) {
  const { mode, difficulty, level, puzzleIndex, seed, modifiers } = challenge;
  return { mode, difficulty, level, puzzleIndex, seed, modifiers: [...modifiers] };
}

const checksum = body => (hashText(body) % 1296).toString(36).toUpperCase().padStart(2, '0');

/**
 * A short code that reads left to right: format, setup, objective, modifiers,
 * seed and a two-character typo check, e.g. CR1-CLN3-G15-B-8F3A91C2-7K.
 */
export function encodeChallenge(value) {
  const checked = validateChallenge(value);
  if (!checked.ok) throw new Error(checked.reason);
  const { mode, difficulty, level, puzzleIndex, seed, objective, modifiers } = checked.challenge;
  const setup = mode === 'puzzle' ? `PZ${puzzleIndex + 1}` : `${MODE_CODES[mode]}${DIFFICULTY_CODES[difficulty]}${level}`;
  const goal = `${OBJECTIVE_CODES[objective.type]}${objective.type === 'finish' ? '' : objective.target}`;
  const mods = modifiers.map(id => MODIFIER_CODES[id]).join('') || '0';
  const body = `CR${CHALLENGE_VERSION}-${setup}-${goal}-${mods}-${seed.toString(16).toUpperCase().padStart(8, '0')}`;
  return `${body}-${checksum(body)}`;
}

/** A code from a pasted code, a full link, or the page's own address. */
export function extractCode(text) {
  const value = String(text ?? '').trim();
  const linked = value.match(/[#?&]challenge=([^&#\s]+)/i);
  const raw = linked ? decodeURIComponent(linked[1]) : value;
  return raw.replace(/\s+/g, '').toUpperCase();
}

/** Reads a code or link. Rejections explain what is wrong in plain words. */
export function decodeChallenge(text) {
  const code = extractCode(text);
  if (!code) return fail('Paste a challenge code or link first.');
  const parts = code.split('-');
  const format = parts[0].match(/^CR(\d+)$/);
  if (!format) return fail('That doesn’t look like a challenge code. Codes start with CR1-.');
  const version = Number(format[1]);
  if (version > CHALLENGE_VERSION) return fail(`This code comes from a newer version of the game (format ${version}). Refresh the page to update, then try again.`);
  if (version !== CHALLENGE_VERSION) return fail(`Format ${version} codes are not supported. This game reads format ${CHALLENGE_VERSION}.`);
  if (parts.length !== 6) return fail('That code looks incomplete. Check that you copied all of it.');
  const [, setup, goal, mods, seedText, check] = parts;
  if (checksum(parts.slice(0, 5).join('-')) !== check) return fail('That code doesn’t add up. Check it for a typo.');
  const puzzle = setup.match(/^PZ(\d{1,3})$/);
  const stack = setup.match(/^([A-Z]{2})([A-Z])(\d{1,3})$/);
  if (!puzzle && !(stack && MODES_BY_CODE[stack[1]] && MODES_BY_CODE[stack[1]] !== 'puzzle')) return fail('That code names a mode this game doesn’t have.');
  if (stack && !DIFFICULTIES_BY_CODE[stack[2]]) return fail('Difficulty must be easy, normal or hard.');
  const objectiveMatch = goal.match(/^([A-Z])(\d*)$/);
  const type = objectiveMatch && OBJECTIVES_BY_CODE[objectiveMatch[1]];
  if (!type) return fail('That objective type is not supported.');
  if ((type === 'finish') !== (objectiveMatch[2] === '')) return fail('That objective is missing its target.');
  const modifierCodes = mods === '0' ? [] : [...mods];
  if (modifierCodes.some(item => !MODIFIERS_BY_CODE[item])) return fail('That code names a modifier this game doesn’t have.');
  if (new Set(modifierCodes).size !== modifierCodes.length) return fail('That code repeats a modifier.');
  if (!/^[0-9A-F]{8}$/.test(seedText)) return fail('The board seed in that code is not valid.');
  const objective = type === 'finish' ? { type } : { type, target: Number(objectiveMatch[2]) };
  return validateChallenge({
    version, mode: puzzle ? 'puzzle' : MODES_BY_CODE[stack[1]], difficulty: stack ? DIFFICULTIES_BY_CODE[stack[2]] : 'easy',
    level: stack ? Number(stack[3]) : 1, puzzleIndex: puzzle ? Number(puzzle[1]) - 1 : 0,
    seed: parseInt(seedText, 16), objective, modifiers: modifierCodes.map(item => MODIFIERS_BY_CODE[item]),
  });
}

/** The Monday-to-Monday UTC week holding `date`, with its ISO week label such as 2026-W44. */
export function weekOf(date = Date.now()) {
  const time = date instanceof Date ? date.getTime() : Number(date);
  const index = Math.floor((time - MONDAY_EPOCH) / WEEK);
  const start = MONDAY_EPOCH + index * WEEK;
  // An ISO week belongs to the year that holds its Thursday.
  const thursday = new Date(start + 3 * DAY);
  const year = thursday.getUTCFullYear();
  const number = Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / WEEK) + 1;
  return { id: `${year}-W${String(number).padStart(2, '0')}`, index, start, end: start + WEEK };
}

const weekly = (name, mode, options) => Object.freeze({ name, mode, difficulty: 'easy', level: 1, modifiers: ['noBoosts'], ...options });

/**
 * Version 1 of the weekly rotation, starting the week of Monday 26 October
 * 2026. Each week takes the next template and a seed made from its week label;
 * puzzle weeks also step through PUZZLE_ROTATION. Every weekly turns boosts off,
 * so players with full Journey pockets compare fairly. Never edit a template
 * that has already run: start a new rotation version from a future week.
 * Targets come from tools/calibrate-challenges.js and are playtest values.
 */
export const WEEKLY_ROTATION = Object.freeze({
  version: 1,
  firstWeek: weekOf(Date.UTC(2026, 9, 26)).index,
  templates: Object.freeze([
    weekly('Gather Round', 'classic', { level: 3, objective: { type: 'group', target: 12 } }),
    weekly('Quick Brew', 'countdown', { level: 4, objective: { type: 'score', target: 40000 } }),
    weekly('Neat and Tidy', 'strategy', { level: 3, objective: { type: 'fewBlocks', target: 15 } }),
    weekly('Shifting Sands', 'slider', { difficulty: 'normal', level: 2, objective: { type: 'group', target: 10 }, modifiers: ['fastRows', 'noBoosts'] }),
    weekly('Measured Steps', 'puzzle', { objective: { type: 'finish' }, modifiers: ['noBoosts', 'moveLimit'] }),
    weekly('Both Tides', 'relapse', { level: 5, objective: { type: 'allClear', target: 1 } }),
    weekly('The Long Run', 'continuous', { difficulty: 'hard', level: 3, objective: { type: 'blocks', target: 380 } }),
    weekly('Tall Order', 'classic', { difficulty: 'hard', level: 3, objective: { type: 'finish' }, modifiers: ['tallStart', 'noBoosts'] }),
  ]),
});

// Puzzle weeks visit these in turn: the harder collection puzzles and the harbor set.
export const PUZZLE_ROTATION = Object.freeze([9, 21, 13, 24, 16, 22, 19, 25, 15, 17]);

/** This week's challenge, or any week's: the same everywhere for the whole UTC week. */
export function weeklyChallenge(date = Date.now(), rotation = WEEKLY_ROTATION) {
  const week = weekOf(date);
  const step = week.index - rotation.firstWeek;
  const template = rotation.templates[mod(step, rotation.templates.length)];
  const cycle = Math.floor(step / rotation.templates.length);
  const checked = validateChallenge({
    version: CHALLENGE_VERSION, mode: template.mode, difficulty: template.difficulty, level: template.level,
    puzzleIndex: template.mode === 'puzzle' ? PUZZLE_ROTATION[mod(cycle, PUZZLE_ROTATION.length)] : 0,
    seed: hashText(`weekly-${rotation.version}-${week.id}`), objective: template.objective, modifiers: template.modifiers,
  });
  if (!checked.ok) throw new Error(`Weekly template “${template.name}” is invalid: ${checked.reason}`);
  return { ...checked.challenge, name: template.name, week, code: encodeChallenge(checked.challenge) };
}

/** The weekly that `code` names, searching back up to `weeks` weeks from `date`, or null. */
export function findWeekly(code, date = Date.now(), { weeks = 104, rotation = WEEKLY_ROTATION } = {}) {
  const { index } = weekOf(date);
  for (let week = index; week >= Math.max(rotation.firstWeek, index - weeks); week--) {
    const weekly = weeklyChallenge(MONDAY_EPOCH + week * WEEK + DAY, rotation);
    if (weekly.code === code) return weekly;
  }
  return null;
}

const modeName = mode => MODES.find(item => item.id === mode).name;
const capital = text => `${text[0].toUpperCase()}${text.slice(1)}`;
export const modifierLabels = ids => ids.map(id => MODIFIERS.find(item => item.id === id).name);

/** Words for a challenge's setup, objective and modifiers; `rules` explains each modifier. */
export function describeChallenge(challenge) {
  const puzzle = challenge.mode === 'puzzle';
  const setup = puzzle ? `Puzzle ${challenge.puzzleIndex + 1} · ${PUZZLES[challenge.puzzleIndex].name}` : `${modeName(challenge.mode)} · ${capital(challenge.difficulty)} · Level ${challenge.level}`;
  const rules = challenge.modifiers.map(id => {
    const item = MODIFIERS.find(entry => entry.id === id);
    return { id, name: item.name, description: id === 'moveLimit' ? moveLimitText(PUZZLES[challenge.puzzleIndex]) : item.description };
  });
  return { setup, goal: describeObjective(challenge.objective, challenge.mode), modifiers: rules.map(rule => rule.name), rules };
}

/** A stat that speaks to the objective, for result lines and the copied summary. */
export function highlightStat(challenge, result) {
  const { stats } = result;
  const number = value => value.toLocaleString('en-US');
  switch (challenge.objective.type) {
    case 'group': return `biggest group ${number(stats.largestGroup)}`;
    case 'blocks': return `${number(stats.blocksCleared)} blocks cleared`;
    case 'allClear': return `${stats.allClears} ${challenge.mode === 'relapse' ? (stats.allClears === 1 ? 'side' : 'sides') + ' emptied' : stats.allClears === 1 ? 'board clear' : 'board clears'}`;
    case 'streak': return `best streak ${stats.bestStreak}`;
    case 'fewBlocks': return `${stats.remainingBlocks} ${stats.remainingBlocks === 1 ? 'block' : 'blocks'} left`;
    default: return challenge.mode === 'puzzle' ? `${stats.moves} ${stats.moves === 1 ? 'move' : 'moves'}` : '';
  }
}

/**
 * Judges a game against its challenge: 'active', 'met', 'complete' or
 * 'failed', the round points after leftover blocks, and the stats a result
 * line reports. Points are settled once the round is finalized.
 */
export function challengeResult(challenge, state) {
  const objective = evaluateObjective(challenge.objective, state);
  const stats = state.roundSummary ?? state.roundStats ?? {};
  return {
    status: objective.status, completed: objective.status === 'complete', objective, points: roundPoints(state),
    progress: describeProgress(challenge.objective, objective, challenge.mode),
    stats: {
      largestGroup: stats.largestGroup || 0, blocksCleared: stats.blocksCleared || 0, bestStreak: stats.bestStreak || 0,
      allClears: (stats.doubleClears || 0) + (stats.tripleClears || 0), moves: stats.moves || 0,
      remainingBlocks: state.roundSummary?.remainingBlocks ?? 0, elapsed: Math.round(state.elapsed || 0),
      boostsUsed: Object.values(state.boostsUsed || {}).reduce((sum, count) => sum + count, 0),
    },
  };
}

/** A completion beats a miss, then more points win. */
export function challengeImproves(attempt, previous) {
  if (!attempt) return false;
  if (!previous) return true;
  if (attempt.completed !== previous.completed) return attempt.completed;
  return attempt.points > previous.points;
}

/** A plain-text result to paste anywhere, with the code that reproduces the board. */
export function shareText(challenge, result, { name = '', week = null, link = '' } = {}) {
  const { setup, goal, modifiers } = describeChallenge(challenge);
  const stat = highlightStat(challenge, result);
  const boosts = result.stats.boostsUsed ? ` · ${result.stats.boostsUsed} ${result.stats.boostsUsed === 1 ? 'boost' : 'boosts'} used` : '';
  const title = week ? `Weekly challenge ${week.id}${name ? ` · ${name}` : ''}` : name ? `Challenge · ${name}` : 'A shared challenge';
  return [
    `Collapse Revival · ${title}`,
    [setup, ...modifiers].join(' · '),
    `Goal: ${goal}`,
    `${result.completed ? '✓ Complete' : '✗ Not this time'} · ${result.points.toLocaleString('en-US')} points${stat ? ` · ${stat}` : ''}${boosts}`,
    `Same board, same rules: ${encodeChallenge(challenge)}`,
    ...(link ? [link] : []),
  ].join('\n');
}

const MAX_ENTRIES = 60;
const count = value => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
const plain = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

function normalizeBest(value) {
  const entry = plain(value);
  if (typeof entry.completed !== 'boolean') return null;
  const stats = plain(entry.stats);
  return {
    completed: entry.completed, points: count(entry.points), date: typeof entry.date === 'string' ? entry.date : '',
    stats: Object.fromEntries(['largestGroup', 'blocksCleared', 'bestStreak', 'allClears', 'moves', 'remainingBlocks', 'elapsed', 'boostsUsed'].map(key => [key, count(stats[key])])),
  };
}

function normalizeEntry(code, value) {
  if (!decodeChallenge(code).ok) return null;
  const entry = plain(value);
  return {
    attempts: count(entry.attempts), completions: count(entry.completions), best: normalizeBest(entry.best),
    last: typeof entry.last === 'string' ? entry.last : '', week: typeof entry.week === 'string' ? entry.week : '',
    name: typeof entry.name === 'string' ? entry.name.slice(0, 60) : '', run: typeof entry.run === 'string' ? entry.run : '',
  };
}

/**
 * Browser-local results for each exact challenge, keyed by its code, so a
 * changed seed, objective or modifier is a different record. Nothing is sent.
 * `storage` is the page's JSON store with get(key, fallback) and set(key, value).
 */
export function createChallengeStore(storage, { now = () => new Date() } = {}) {
  const saved = plain(storage.get('challenges', {}));
  const entries = new Map(Object.entries(plain(saved.entries)).flatMap(([code, value]) => {
    const entry = normalizeEntry(code, value);
    return entry ? [[code, entry]] : [];
  }));
  const save = () => {
    const kept = [...entries].sort((a, b) => b[1].last.localeCompare(a[1].last)).slice(0, MAX_ENTRIES);
    entries.clear();
    kept.forEach(([code, entry]) => entries.set(code, entry));
    storage.set('challenges', { version: CHALLENGE_VERSION, entries: Object.fromEntries(entries) });
  };
  const blank = () => ({ attempts: 0, completions: 0, best: null, last: '', week: '', name: '', run: '' });
  const copy = entry => entry && structuredClone(entry);
  return {
    entry: code => copy(entries.get(code) ?? null),
    /** Counts an attempt when play begins. */
    begin(code, { name = '', week = '' } = {}) {
      const entry = entries.get(code) ?? blank();
      entries.set(code, { ...entry, attempts: entry.attempts + 1, last: now().toISOString(), name: name || entry.name, week: week || entry.week });
      save();
      return copy(entries.get(code));
    },
    /**
     * Saves a decided result. A run counts one completion however often Undo
     * reopens it; its best result still replaces a worse one.
     */
    finish(code, result, runId) {
      const entry = entries.get(code) ?? blank();
      const attempt = normalizeBest({ ...result, date: now().toISOString() });
      const previous = entry.best;
      const improved = challengeImproves(attempt, previous);
      const counted = result.completed && entry.run !== runId;
      entries.set(code, {
        ...entry, attempts: Math.max(1, entry.attempts), last: now().toISOString(), best: improved ? attempt : previous,
        completions: entry.completions + (counted ? 1 : 0), run: counted ? runId : entry.run,
      });
      save();
      return { previous: copy(previous), best: copy(entries.get(code).best), improved, firstCompletion: result.completed && !previous?.completed, entry: copy(entries.get(code)) };
    },
    /** The most recently played challenges, newest first. */
    recent(limit = 8) {
      return [...entries].sort((a, b) => b[1].last.localeCompare(a[1].last)).slice(0, limit).map(([code, entry]) => ({ code, challenge: decodeChallenge(code).challenge, ...copy(entry) }));
    },
  };
}
