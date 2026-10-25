import { PUZZLES } from './puzzles.js';

/**
 * Deterministic, DOM-free game rules. Coordinates are col 0..11, row 0..14
 * (top to bottom). Commands mutate state and return an event:
 * { type, valid, removed: [{ id, color, kind, side, col, row }], points, message,
 *   activated: [], absorbed: [], transferred: [] }.
 * The host controls ready / playing / paused; only playing games advance.
 */
export const ROWS = 15;
export const COLS = 12;
export const MODES = [
  { id: 'classic', name: 'Classic', tagline: 'The familiar rising stack', description: 'Clear groups of three or more before the rising blocks reach the top. Finish the supply of lines, then enjoy a bonus cleanup.', timed: true },
  { id: 'strategy', name: 'Strategy', tagline: 'Your move sets the pace', description: 'Take your time. Each successful clear brings in one new line. Plan ahead and survive the whole supply.', timed: false },
  { id: 'puzzle', name: 'Puzzle', tagline: 'A clean board is the goal', description: 'Clear every block in handcrafted puzzles. There is no timer and no incoming line.', timed: false },
  { id: 'relapse', name: 'Relapse', tagline: 'Pressure from both ends', description: 'Blocks arrive from the top and bottom. Each stack falls toward its own edge and slides inward independently. Keep the two stacks apart.', timed: true },
  { id: 'continuous', name: 'Continuous', tagline: 'Keep the streak alive', description: 'An endless rising stack that gradually gets quicker. How long can you last?', timed: true },
  { id: 'countdown', name: 'Countdown', tagline: 'Two minutes. Your best score.', description: 'Make as many points as you can in a fixed two-minute score attack while the stack keeps rising.', timed: true },
  { id: 'slider', name: 'Slider', tagline: 'A moving target', description: 'The stack shifts sideways as fresh lines rise. Find your groups while the columns move.', timed: true },
];

const DIFFICULTY = {
  easy: { colors: 3, interval: 6200 },
  normal: { colors: 4, interval: 4900 },
  hard: { colors: 5, interval: 3700 },
};
// Natural specials should be a scarce tactical resource, rather than a routine clear.
export const SPECIAL_RULES = Object.freeze({
  blastRadius: 2,
  blastChance: 0.004,
  colorBombChance: 0.004,
  gravityChance: 0.002,
  stoneChance: 0.002,
  anchorChance: 0.0015,
});
export const SCORING_RULES = Object.freeze({
  pointsPerBlock: 20,
  rockThreshold: 6,
  strongRockThreshold: 10,
  allClearMultiplier: 2,
  doubleSideClearMultiplier: 3,
});
const SPECIALS = new Set(['bomb', 'colorBomb', 'gravity']);
const BLOCKERS = new Set(['stone', 'anchor']);
const COLORED = new Set(['normal']);
const emptyBoard = () => Array.from({ length: ROWS }, () => Array(COLS).fill(null));
const event = (type, valid = false, message = '', removed = [], points = 0) => ({ type, valid, removed, points, message, activated: [], absorbed: [], transferred: [], scoring: null });

/** Explicit factors for the existing group curve, plus a bonus for genuine all-clears. */
export function scoringForClear(count, { combo = 1, phase = 'play', clearedSides = [] } = {}) {
  const clearedCount = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const streak = Number.isFinite(combo) ? Math.max(1, Math.min(5, Math.floor(combo))) : 1;
  const candidates = Array.isArray(clearedSides) ? clearedSides : [];
  const sides = clearedCount === 0 ? [] : candidates.includes('board') ? ['board'] : ['top', 'bottom'].filter(side => candidates.includes(side));
  // Keep the old n(n+1)*5 values, including 10/30-point one/two-block specials.
  const basePoints = clearedCount < 3 ? clearedCount * (clearedCount + 1) * 5 : clearedCount * SCORING_RULES.pointsPerBlock;
  const sizeMultiplier = clearedCount < 3 ? 1 : (clearedCount + 1) / 4;
  const streakPercent = 100 + (streak - 1) * 15;
  const streakMultiplier = streakPercent / 100;
  const roundMultiplier = phase === 'bonus' ? 2 : 1;
  const clearMultiplier = sides.length === 2 ? SCORING_RULES.doubleSideClearMultiplier : sides.length ? SCORING_RULES.allClearMultiplier : 1;
  // Use the integer percentage until the final division so a mathematical .5
  // cannot become .49999999999997 and round the displayed receipt down by one.
  const movePoints = Math.round(basePoints * sizeMultiplier * streakPercent * roundMultiplier / 100);
  const totalPoints = movePoints * clearMultiplier;
  return {
    clearedCount, basePoints, sizeMultiplier, streakMultiplier, roundMultiplier,
    clearMultiplier, movePoints, clearBonusPoints: totalPoints - movePoints,
    totalPoints, clearedSides: sides,
    combinedMultiplier: sizeMultiplier * streakMultiplier * roundMultiplier * clearMultiplier,
  };
}

function stackCounts(state) {
  const counts = { total: 0, top: 0, bottom: 0 };
  for (const cell of state.board.flat()) {
    if (!cell) continue;
    counts.total++;
    if (cell.side === 'top' || cell.side === 'bottom') counts[cell.side]++;
  }
  return counts;
}

function random(state) {
  state.rngState = (state.rngState + 0x6d2b79f5) >>> 0;
  let n = state.rngState;
  n = Math.imul(n ^ (n >>> 15), n | 1);
  n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
  return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
}

function makeCell(state, side = 'bottom', specials = true, fixedColor) {
  const color = fixedColor ?? Math.floor(random(state) * state.colors);
  let kind = 'normal';
  if (specials) {
    const roll = random(state);
    const colorLimit = SPECIAL_RULES.blastChance + SPECIAL_RULES.colorBombChance;
    if (roll < SPECIAL_RULES.blastChance) kind = 'bomb';
    else if (roll < colorLimit) kind = 'colorBomb';
    else if (state.mode === 'relapse' && roll < colorLimit + SPECIAL_RULES.gravityChance) kind = 'gravity';
    else if (state.level > 2 && roll > 1 - SPECIAL_RULES.stoneChance) kind = 'stone';
    else if (state.level > 4 && roll > 1 - SPECIAL_RULES.stoneChance - SPECIAL_RULES.anchorChance) kind = 'anchor';
  }
  return { id: state.nextId++, color, kind, side };
}

function makeRow(state, side) {
  return Array.from({ length: COLS }, () => makeCell(state, side));
}

function rowInterval(state) {
  const endlessLevel = state.mode === 'continuous' ? Math.floor(state.rowsAdded / 12) : 0;
  return Math.max(1100, DIFFICULTY[state.difficulty].interval * (0.91 ** (state.level - 1 + endlessLevel)));
}

function prepareNextRow(state) {
  state.nextRow = makeRow(state, state.nextSide);
}

export function createGame({ mode = 'classic', difficulty = 'easy', level = 1, seed = Date.now(), puzzleIndex = 0 } = {}) {
  mode = MODES.some(item => item.id === mode) ? mode : 'classic';
  difficulty = DIFFICULTY[difficulty] ? difficulty : 'easy';
  const state = {
    mode, difficulty, level: Math.max(1, Math.floor(level) || 1), seed: Number(seed) >>> 0,
    rngState: Number(seed) >>> 0, nextId: 1, colors: DIFFICULTY[difficulty].colors,
    score: 0, lastScoring: null, cleared: 0, rowsAdded: 0, rowsTarget: 12 + Math.max(1, Math.floor(level) || 1) * 3,
    status: 'ready', phase: 'play', rowProgress: 0, nextRow: [],
    timeLeft: mode === 'countdown' ? 120000 : 0, elapsed: 0,
    bonusRemaining: 0, bonusDuration: 15000, freezeRemaining: 0, board: emptyBoard(), combo: 0,
    lastClearAt: -Infinity, moves: 0, puzzleIndex: Math.max(0, Math.floor(puzzleIndex) || 0),
    puzzleProgress: 0, nextSide: 'bottom', sliderDirection: -1, message: '',
  };

  if (mode === 'puzzle') {
    state.puzzleIndex %= PUZZLES.length;
    const puzzle = PUZZLES[state.puzzleIndex];
    state.puzzleName = puzzle.name;
    state.rowsTarget = 0;
    const rows = puzzle.rows.slice(-ROWS);
    rows.forEach((line, index) => {
      [...line].slice(0, COLS).forEach((char, col) => {
        if (/^[0-4]$/.test(char)) state.board[ROWS - rows.length + index][col] = makeCell(state, 'bottom', false, Number(char));
      });
    });
  } else if (mode === 'relapse') {
    for (let row = 0; row < 3; row++) state.board[row] = makeRow(state, 'top');
    for (let row = ROWS - 3; row < ROWS; row++) state.board[row] = makeRow(state, 'bottom');
    prepareNextRow(state);
  } else {
    for (let row = ROWS - 6; row < ROWS; row++) state.board[row] = makeRow(state, 'bottom');
    prepareNextRow(state);
  }
  state.rowInterval = rowInterval(state);
  return state;
}

export function countBlocks(state) {
  return state.board.reduce((total, row) => total + row.filter(Boolean).length, 0);
}

/** Only ordinary blocks form matches. Specials activate when clicked directly. */
export function getGroup(state, col, row) {
  const start = state.board[row]?.[col];
  if (!start || !COLORED.has(start.kind)) return [];
  const group = [];
  const stack = [[col, row]];
  const seen = new Set();
  while (stack.length) {
    const [x, y] = stack.pop();
    const key = y * COLS + x;
    if (seen.has(key)) continue;
    seen.add(key);
    const cell = state.board[y]?.[x];
    if (!cell || cell.color !== start.color || !COLORED.has(cell.kind) || (state.mode === 'relapse' && cell.side !== start.side)) continue;
    group.push({ ...cell, col: x, row: y });
    if (x > 0) stack.push([x - 1, y]);
    if (x < COLS - 1) stack.push([x + 1, y]);
    if (y > 0) stack.push([x, y - 1]);
    if (y < ROWS - 1) stack.push([x, y + 1]);
  }
  return group;
}

function settleSegment(board, col, first, last, towardTop) {
  const cells = [];
  for (let row = first; row <= last; row++) {
    if (board[row][col]) cells.push(board[row][col]);
    board[row][col] = null;
  }
  const offset = towardTop ? first : last - cells.length + 1;
  cells.forEach((cell, index) => { board[offset + index][col] = cell; });
}

function settle(state) {
  if (state.mode === 'relapse') {
    const board = emptyBoard();
    for (const side of ['top', 'bottom']) {
      const columns = [];
      for (let col = 0; col < COLS; col++) {
        const cells = state.board.map(line => line[col]).filter(cell => cell?.side === side);
        if (cells.length) columns.push(cells);
      }
      // Each stack owns its empty columns: the other side cannot hold a gap open.
      const left = Math.floor((COLS - columns.length) / 2);
      for (const [index, cells] of columns.entries()) {
        const first = side === 'top' ? 0 : ROWS - cells.length;
        for (const [offset, cell] of cells.entries()) {
          const row = first + offset;
          const col = left + index;
          if (board[row][col]) {
            // Preserve every surviving cell if inward movement would collide.
            state.status = 'gameOver';
            state.message = 'The two stacks met!';
            return false;
          }
          board[row][col] = cell;
        }
      }
    }
    state.board = board;
    return true;
  }
  for (let col = 0; col < COLS; col++) {
    // Anchors stay in their row and divide a column into independent falls.
    let first = 0;
    for (let row = 0; row <= ROWS; row++) {
      if (row === ROWS || state.board[row][col]?.kind === 'anchor') {
        settleSegment(state.board, col, first, row - 1, false);
        first = row + 1;
      }
    }
  }
  const columns = [];
  for (let col = 0; col < COLS; col++) {
    const cells = state.board.map(row => row[col]);
    if (cells.some(Boolean)) columns.push(cells);
  }
  const left = Math.floor((COLS - columns.length) / 2);
  state.board = emptyBoard();
  columns.forEach((cells, index) => cells.forEach((cell, row) => { state.board[row][left + index] = cell; }));
}

function canClear(state, col, row) {
  const cell = state.board[row]?.[col];
  return Boolean(cell && (SPECIALS.has(cell.kind) || getGroup(state, col, row).length >= 3));
}

export function getHint(state) {
  if (state.mode === 'puzzle' && state.puzzleProgress >= 0) {
    const move = PUZZLES[state.puzzleIndex]?.solution?.[state.puzzleProgress];
    if (move && canClear(state, move.col, move.row)) return { ...move, size: getGroup(state, move.col, move.row).length };
  }
  const seen = new Set();
  let best = null;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = state.board[row][col];
      if (!cell) continue;
      if (SPECIALS.has(cell.kind) && !best) best = { col, row, size: 1 };
      if (seen.has(cell.id)) continue;
      const group = getGroup(state, col, row);
      group.forEach(item => seen.add(item.id));
      if (group.length >= 3 && (!best || group.length > best.size)) best = { col, row, size: group.length };
    }
  }
  return best;
}

function beginBonus(state) {
  state.phase = 'bonus';
  state.bonusRemaining = state.bonusDuration;
  state.rowProgress = 0;
  state.message = 'Bonus round! Clear as much as you can.';
  if (countBlocks(state) === 0) finishBonus(state);
}

function finishBonus(state) {
  state.status = 'levelComplete';
  state.bonusRemaining = 0;
  state.message = `Level ${state.level} complete!`;
}

export function clearAt(state, col, row) {
  if (state.status !== 'playing') return event('inactive', false);
  const cell = state.board[row]?.[col];
  if (!cell) return event('empty', false);
  const group = getGroup(state, col, row);
  if (!SPECIALS.has(cell.kind) && group.length < 3) return event('smallGroup', false, 'Find three or more matching blocks.');
  const before = stackCounts(state);

  const targets = new Map();
  const add = (x, y, allowBlocker = false) => {
    const target = state.board[y]?.[x];
    if (!target || (!allowBlocker && BLOCKERS.has(target.kind))) return;
    const key = y * COLS + x;
    if (!targets.has(key)) {
      const snapshot = { ...target, col: x, row: y };
      targets.set(key, snapshot);
    }
  };
  const activated = SPECIALS.has(cell.kind) ? [{ ...cell, col, row }] : [];
  const usedGravity = cell.kind === 'gravity';
  if (activated.length) {
    add(col, row);
    if (cell.kind === 'bomb') {
      for (let y = row - SPECIAL_RULES.blastRadius; y <= row + SPECIAL_RULES.blastRadius; y++) {
        for (let x = col - SPECIAL_RULES.blastRadius; x <= col + SPECIAL_RULES.blastRadius; x++) add(x, y, true);
      }
    } else if (cell.kind === 'colorBomb') {
      state.board.forEach((line, y) => line.forEach((target, x) => {
        if (target?.kind === 'normal' && target.color === cell.color) add(x, y);
      }));
    }
  } else {
    group.forEach(item => add(item.col, item.row));
  }
  // Consume touching specials without activating them. This is a single adjacency
  // pass from the removed ordinary blocks, never a chain through other specials.
  for (const target of [...targets.values()]) {
    if (target.kind !== 'normal') continue;
    for (const [x, y] of [[target.col - 1, target.row], [target.col + 1, target.row], [target.col, target.row - 1], [target.col, target.row + 1]]) {
      if (SPECIALS.has(state.board[y]?.[x]?.kind)) add(x, y);
    }
  }
  const removed = [...targets.values()];
  const absorbed = removed.filter(item => SPECIALS.has(item.kind) && item.id !== cell.id);
  const transferred = [];
  removed.forEach(item => { state.board[item.row][item.col] = null; });
  // Count immediately after removal, before transfers or Strategy's refill. Moving
  // a stack away with a gravity block is not the same as clearing those blocks.
  const afterRemoval = stackCounts(state);
  if (usedGravity && state.mode === 'relapse') {
    const fromSide = cell.side;
    const toSide = fromSide === 'top' ? 'bottom' : 'top';
    state.board.forEach((line, y) => line.forEach((target, x) => {
      if (target?.side !== fromSide) return;
      target.side = toSide;
      transferred.push({ ...target, col: x, row: y, fromSide, toSide });
    }));
  }
  settle(state);

  const timedCombo = state.mode !== 'puzzle' && state.mode !== 'strategy' && state.elapsed - state.lastClearAt < 2500;
  state.combo = timedCombo ? Math.min(5, state.combo + 1) : 1;
  state.lastClearAt = state.elapsed;
  const clearedSides = state.status === 'gameOver' ? [] : state.mode === 'relapse'
    ? ['top', 'bottom'].filter(side => before[side] > 0 && afterRemoval[side] === 0)
    : before.total > 0 && afterRemoval.total === 0 ? ['board'] : [];
  const scoring = scoringForClear(removed.length, { combo: state.combo, phase: state.phase, clearedSides });
  const points = scoring.totalPoints;
  state.lastScoring = scoring;
  state.score += points;
  state.cleared += removed.length;
  state.moves++;
  let message = state.status === 'gameOver' ? state.message : usedGravity ? 'Gravity shifted the stack to the other side!' : removed.length >= 10 ? 'Super collapse!' : removed.length >= 6 ? 'Great collapse!' : '';

  if (state.mode === 'puzzle') {
    const expected = PUZZLES[state.puzzleIndex]?.solution?.[state.puzzleProgress];
    if (expected && removed.some(item => item.col === expected.col && item.row === expected.row)) state.puzzleProgress++;
    else state.puzzleProgress = -1;
    if (countBlocks(state) === 0) {
      state.status = 'won';
      message = 'Puzzle cleared!';
    } else if (!getHint(state)) {
      state.status = 'gameOver';
      message = 'No groups remain. Give this puzzle another try.';
    }
  } else if (state.phase === 'bonus' && countBlocks(state) === 0) {
    finishBonus(state);
    message = state.message;
  } else if (state.mode === 'strategy' && state.phase === 'play') {
    const rowEvent = addRow(state);
    if (rowEvent.message) message = rowEvent.message;
  }
  state.message = message;
  return { ...event('clear', true, message, removed, points), activated, absorbed, transferred, scoring };
}

/** The host may preview a legal move without changing the board, RNG, or clocks. */
export function previewClear(state, col, row) {
  return clearAt(structuredClone(state), col, row);
}

/** Adds the visible feeder. Overflow is detected before any board mutation. */
export function addRow(state) {
  if (state.status !== 'playing' || state.phase !== 'play' || state.mode === 'puzzle') return event('inactive', false);
  const side = state.mode === 'relapse' ? state.nextSide : 'bottom';
  if (state.mode === 'relapse') {
    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS; row++) {
        const cell = state.board[row][col];
        if (!cell || cell.side !== side) continue;
        const next = row + (side === 'top' ? 1 : -1);
        if (next < 0 || next >= ROWS || (state.board[next][col] && state.board[next][col].side !== side)) {
          state.status = 'gameOver';
          state.message = 'The two stacks met!';
          return event('overflow', false, state.message);
        }
      }
    }
    const board = emptyBoard();
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const cell = state.board[row][col];
        if (cell) board[row + (cell.side === side ? (side === 'top' ? 1 : -1) : 0)][col] = cell;
      }
    }
    board[side === 'top' ? 0 : ROWS - 1] = state.nextRow;
    state.board = board;
    state.nextSide = side === 'top' ? 'bottom' : 'top';
  } else {
    if (state.board[0].some(Boolean)) {
      state.status = 'gameOver';
      state.message = 'The stack reached the top!';
      return event('overflow', false, state.message);
    }
    state.board.shift();
    state.board.push(state.nextRow);
    if (state.mode === 'slider') {
      const direction = state.sliderDirection;
      state.board = state.board.map(row => direction < 0 ? [...row.slice(1), row[0]] : [row[COLS - 1], ...row.slice(0, COLS - 1)]);
      if ((state.rowsAdded + 1) % 4 === 0) state.sliderDirection *= -1;
    }
  }
  state.rowsAdded++;
  state.rowProgress = 0;
  state.rowInterval = rowInterval(state);
  prepareNextRow(state);
  if (!['continuous', 'countdown'].includes(state.mode) && state.rowsAdded >= state.rowsTarget) beginBonus(state);
  const message = state.phase === 'bonus' ? state.message : '';
  return event('row', true, message);
}

export function advanceTime(state, deltaMs) {
  if (state.status !== 'playing' || !Number.isFinite(deltaMs) || deltaMs <= 0) return event('inactive', false);
  let remaining = deltaMs;
  // Process chronologically, including a large elapsed step crossing a bonus boundary.
  while (remaining > 0 && state.status === 'playing') {
    const feederFrozen = state.freezeRemaining > 0;
    let untilEvent = remaining;
    if (state.mode === 'countdown') untilEvent = Math.min(untilEvent, state.timeLeft);
    if (feederFrozen) untilEvent = Math.min(untilEvent, state.freezeRemaining);
    if (state.phase === 'bonus') untilEvent = Math.min(untilEvent, state.bonusRemaining);
    else if (!feederFrozen && state.mode !== 'strategy' && state.mode !== 'puzzle') untilEvent = Math.min(untilEvent, (1 - state.rowProgress) * state.rowInterval);
    if (untilEvent < 0.00001) untilEvent = 0;
    state.elapsed += untilEvent;
    remaining -= untilEvent;
    state.freezeRemaining = Math.max(0, state.freezeRemaining - untilEvent);
    if (state.mode === 'countdown') state.timeLeft = Math.max(0, state.timeLeft - untilEvent);
    if (state.phase === 'bonus') {
      state.bonusRemaining = Math.max(0, state.bonusRemaining - untilEvent);
      if (state.bonusRemaining <= 0) finishBonus(state);
    } else if (state.mode !== 'strategy' && state.mode !== 'puzzle') {
      if (!feederFrozen) state.rowProgress = Math.min(1, state.rowProgress + untilEvent / state.rowInterval);
      if (state.mode === 'countdown' && state.timeLeft <= 0) {
        state.status = 'won';
        state.message = 'Time! Your two-minute score is in.';
      } else if (state.rowProgress >= 1 - 1e-10) {
        addRow(state);
      }
    }
    if (untilEvent === 0 && state.status === 'playing' && state.phase === 'play' && state.rowProgress < 1 - 1e-10) break;
  }
  if (state.combo && state.elapsed - state.lastClearAt >= 2500) state.combo = 0;
  return event('tick', true, state.message);
}

/** Shop boosters use the same clear rules and event snapshots as ordinary moves. */
export function usePowerup(state, type) {
  if (state.status !== 'playing') return event('inactive', false);
  if (type === 'freeze') {
    if (state.phase !== 'play' || !MODES.find(mode => mode.id === state.mode)?.timed) return event('powerup', false, 'Freeze is available during timed play.');
    state.freezeRemaining += 10000;
    state.message = 'Feeder frozen for 10 seconds!';
    return event('powerup', true, state.message);
  }

  let target;
  if (type === 'blast') {
    target = getHint(state);
    if (!target) return event('powerup', false, 'No blast target is available.');
  } else if (type === 'color') {
    const counts = Array(5).fill(0);
    const first = Array(5).fill(null);
    state.board.forEach((row, y) => row.forEach((cell, x) => {
      if (!cell || !COLORED.has(cell.kind)) return;
      counts[cell.color]++;
      first[cell.color] ||= { col: x, row: y };
    }));
    const color = counts.indexOf(Math.max(...counts));
    target = first[color];
    if (!target) return event('powerup', false, 'No colored blocks are available.');
  } else {
    return event('powerup', false, 'Unknown powerup.');
  }

  state.board[target.row][target.col].kind = type === 'blast' ? 'bomb' : 'colorBomb';
  const result = clearAt(state, target.col, target.row);
  return { ...result, type: 'powerup' };
}

/** Start the next level/puzzle in place, retaining the accumulated score. */
export function nextLevel(state) {
  if (!['levelComplete', 'won'].includes(state.status) || ['continuous', 'countdown'].includes(state.mode)) return event('inactive', false);
  const score = state.score;
  const lastScoring = state.lastScoring;
  const cleared = state.cleared;
  const replacement = createGame({ mode: state.mode, difficulty: state.difficulty, level: state.level + 1, seed: state.rngState, puzzleIndex: state.mode === 'puzzle' ? (state.puzzleIndex + 1) % PUZZLES.length : state.puzzleIndex });
  Object.assign(state, replacement, { score, lastScoring, cleared, status: 'playing' });
  return event('nextLevel', true, state.mode === 'puzzle' ? state.puzzleName : `Level ${state.level}`);
}
