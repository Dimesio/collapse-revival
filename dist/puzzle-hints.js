// Layered puzzle hints: an idea first, then an area of the board, then the move.
// Hints follow the stored solution while the player is on it. Off that line,
// a bounded search finds another way through, or proves there is none.
import { ROWS, COLS, clearAt, getGroup } from './engine.js';
import { PUZZLES } from './puzzles.js';

export const HINT_SEARCH_BUDGET = 20000;

export const NUDGES = Object.freeze({
  wait: 'The biggest group is a trap right now. Something smaller opens the way.',
  slide: 'Empty a whole column and the two sides slide together.',
  join: 'Clear what sits between matching blocks so they can meet.',
  drop: 'Clear underneath, and the blocks above drop into line.',
  fall: 'Blocks above fall into any gap. Picture where they will land.',
  finish: 'One group left. Clear it for the clean sweep.',
  plain: 'Look for a group that won’t leave any stragglers behind.',
});

const fork = state => ({ ...state, board: state.board.map(line => line.slice()), roundStats: { ...state.roundStats }, boostsUsed: { ...state.boostsUsed } });
// Moves made matter only when a move limit can end the puzzle early.
const positionKey = state => `${state.moveLimit ? state.moves : ''}|${state.board.map(line => line.map(cell => cell ? cell.color : '.').join('')).join('/')}`;
const columnsInUse = state => Array.from({ length: COLS }, (_, col) => state.board.some(line => line[col])).filter(Boolean).length;

/** Every clearable group once, largest first; its first cell names the move. */
export function puzzleMoves(state) {
  const seen = new Set();
  const moves = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = state.board[row][col];
      if (!cell || seen.has(cell.id)) continue;
      const group = getGroup(state, col, row);
      group.forEach(item => seen.add(item.id));
      if (group.length >= 3) moves.push({ col, row, size: group.length });
    }
  }
  return moves.sort((a, b) => b.size - a.size);
}

/**
 * Moves that clear the board from here; null when no line exists, or undefined
 * when the search used its budget before it could tell.
 */
export function findLine(state, { budget = HINT_SEARCH_BUDGET } = {}) {
  if (state.status !== 'playing') return null;
  const dead = new Set();
  let left = budget;
  function search(current) {
    const key = positionKey(current);
    if (dead.has(key)) return null;
    for (const move of puzzleMoves(current)) {
      if (--left < 0) return undefined;
      const next = fork(current);
      clearAt(next, move.col, move.row);
      if (next.status === 'won') return [move];
      if (next.status !== 'playing') continue;
      const rest = search(next);
      if (rest === undefined) return undefined;
      if (rest) return [move, ...rest];
    }
    dead.add(key);
    return null;
  }
  return search(state);
}

/** Labels every block by the group it belongs to, whatever its size. */
function groupLabels(state) {
  const labels = new Map();
  state.board.forEach((line, row) => line.forEach((cell, col) => {
    if (!cell || labels.has(cell.id)) return;
    for (const item of getGroup(state, col, row)) labels.set(item.id, cell.id);
  }));
  return labels;
}

/**
 * The idea behind a move: holding back from a tempting dead end, sliding
 * columns together, stacking separated blocks onto each other (join), or
 * dropping blocks level with their neighbors (drop).
 */
export function moveConcept(state, move, { budget = HINT_SEARCH_BUDGET } = {}) {
  const size = getGroup(state, move.col, move.row).length;
  const next = fork(state);
  clearAt(next, move.col, move.row);
  if (next.status === 'won') return 'finish';
  const biggest = puzzleMoves(state)[0];
  if (biggest.size > size) {
    const tempting = fork(state);
    clearAt(tempting, biggest.col, biggest.row);
    if (tempting.status !== 'won' && findLine(tempting, { budget }) === null) return 'wait';
  }
  if (columnsInUse(next) < columnsInUse(state)) return 'slide';
  // A new contact between blocks from different groups: above and below, or side by side.
  const before = groupLabels(state);
  let stacked = false;
  let level = false;
  for (const group of puzzleMoves(next)) {
    for (const cell of getGroup(next, group.col, group.row)) {
      const right = next.board[cell.row][cell.col + 1];
      const below = next.board[cell.row + 1]?.[cell.col];
      if (right?.kind === 'normal' && right.color === cell.color && before.get(right.id) !== before.get(cell.id)) level = true;
      if (below?.kind === 'normal' && below.color === cell.color && before.get(below.id) !== before.get(cell.id)) stacked = true;
    }
  }
  if (stacked) return 'join';
  if (level) return 'drop';
  const removed = new Set(getGroup(state, move.col, move.row).map(cell => cell.id));
  const fell = state.board.some((line, row) => line.some((cell, col) => cell && !removed.has(cell.id) && next.board[row][col]?.id !== cell.id));
  return fell ? 'fall' : 'plain';
}

/** The group's bounding box, one cell larger on every side, in board cells. */
export function hintArea(state, move) {
  const group = getGroup(state, move.col, move.row);
  const cols = group.map(cell => cell.col);
  const rows = group.map(cell => cell.row);
  return {
    left: Math.max(0, Math.min(...cols) - 1), right: Math.min(COLS - 1, Math.max(...cols) + 1),
    top: Math.max(0, Math.min(...rows) - 1), bottom: Math.min(ROWS - 1, Math.max(...rows) + 1),
  };
}

/**
 * The next puzzle hint. `lost` means no line clears the board from here;
 * `unsure` means the search gave up and the move is simply the biggest group.
 */
export function puzzleHint(state, { budget = HINT_SEARCH_BUDGET } = {}) {
  if (state.mode !== 'puzzle' || state.status !== 'playing') return null;
  const stored = state.puzzleProgress >= 0 ? PUZZLES[state.puzzleIndex]?.solution?.[state.puzzleProgress] : null;
  let move = stored && getGroup(state, stored.col, stored.row).length >= 3 ? stored : null;
  let unsure = false;
  if (!move) {
    const line = findLine(state, { budget });
    if (line === null) return { lost: true };
    unsure = line === undefined;
    move = unsure ? puzzleMoves(state)[0] : line[0];
    if (!move) return { lost: true };
  }
  const concept = unsure ? 'plain' : moveConcept(state, move, { budget });
  return { col: move.col, row: move.row, size: getGroup(state, move.col, move.row).length, concept, nudge: NUDGES[concept], area: hintArea(state, move), lost: false, unsure };
}
