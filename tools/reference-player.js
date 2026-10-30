import { ROWS, COLS, createGame, clearAt, previewClear, addRow, advanceTime, finalizeRound, getGroup } from '../dist/engine.js';
import { evaluateObjective, finishRequirement } from '../dist/objectives.js';

/**
 * A heuristic reference player and an exhaustive puzzle solver for calibrating
 * star targets. They are benchmarks, not models of a human player: the player
 * acts at about two interactions per second, as in the Classic calibration.
 */

/** Small deterministic generator for the player's own timing and tie-breaks. */
export function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let n = Math.imul(value ^ (value >>> 15), value | 1);
    n ^= n + Math.imul(n ^ (n >>> 7), n | 61);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

/** Every distinct legal clear: groups of three or more, plus bombs. */
export function legalMoves(state) {
  const seen = new Set();
  const moves = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = state.board[row][col];
      if (!cell || seen.has(cell.id)) continue;
      if (cell.kind === 'bomb' || cell.kind === 'colorBomb') {
        moves.push({ col, row, size: previewClear(state, col, row).removed.length, special: true });
        continue;
      }
      const group = getGroup(state, col, row);
      group.forEach(item => seen.add(item.id));
      if (group.length >= 3) moves.push({ col, row, size: group.length, top: Math.min(...group.map(item => item.row)) });
    }
  }
  return moves;
}

/** Empty rows between the stack and the ceiling, or between Relapse's stacks. */
export function freeRows(state) {
  if (state.mode === 'relapse') {
    let gap = ROWS;
    for (let col = 0; col < COLS; col++) {
      let top = -1;
      let bottom = ROWS;
      for (let row = 0; row < ROWS; row++) {
        const cell = state.board[row][col];
        if (cell?.side === 'top') top = Math.max(top, row);
        if (cell?.side === 'bottom') bottom = Math.min(bottom, row);
      }
      gap = Math.min(gap, bottom - top - 1);
    }
    return gap;
  }
  const first = state.board.findIndex(line => line.some(Boolean));
  return first === -1 ? ROWS : first;
}

function inEndgame(state, endgameMs) {
  if (state.phase === 'bonus') return (state.mode === 'classic' && state.bonusRowsAdded >= state.bonusRowsTarget) || state.bonusRemaining <= endgameMs;
  return state.mode === 'countdown' && state.timeLeft <= endgameMs;
}

/** Points the board could still yield: every group of two or more, valued as if cleared now. */
function potential(state) {
  const seen = new Set();
  let total = 0;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = state.board[row][col];
      if (!cell || seen.has(cell.id) || cell.kind !== 'normal') continue;
      const group = getGroup(state, col, row);
      group.forEach(item => seen.add(item.id));
      if (group.length >= 2) total += 5 * group.length * (group.length + 1);
    }
  }
  return total;
}

/**
 * Patient play: wait for a group of `patience` blocks, but clear anything when
 * the stack is within `dangerRows` of losing or the round is about to end.
 * With `lookahead`, each candidate is played on a copy and judged by its points,
 * the groups it leaves, and the room left above the stack.
 */
export function chooseMove(state, { patience = 3, dangerRows = 4, endgameMs = 4000, lookahead = false, keep = 0.5 } = {}, random = Math.random) {
  const free = freeRows(state);
  const danger = free <= dangerRows;
  const endgame = inEndgame(state, endgameMs);
  const threshold = danger || endgame ? 3 : patience;
  const moves = legalMoves(state).filter(move => move.special ? danger || move.size >= patience * 2 : move.size >= threshold);
  if (!lookahead) {
    const value = move => move.size + (danger && !move.special ? (ROWS - move.top) / ROWS : 0) + random() * 0.01;
    return moves.reduce((best, move) => !best || value(move) > value(best) ? move : best, null);
  }
  const risk = rows => rows <= dangerRows ? (dangerRows - rows + 1) ** 2 * 2000 : 0;
  // Waiting keeps the board's potential, but the next row brings the stack closer.
  let best = null;
  let bestValue = danger || endgame || !moves.length ? -Infinity : keep * potential(state) - risk(free - 1);
  for (const move of moves) {
    const next = structuredClone(state);
    const points = clearAt(next, move.col, move.row).points;
    if (next.status === 'gameOver') continue;
    const value = points + (endgame ? 0 : keep * potential(next)) - risk(freeRows(next)) + random();
    if (value > bestValue) { best = move; bestValue = value; }
  }
  return best;
}

/**
 * A copy for searching ahead. Clears replace board cells without changing
 * them, so rows are copied but cells are shared. Not for Relapse gravity.
 */
function fork(state) {
  // The feeder row becomes a board row, so it needs its own copy too.
  return { ...state, board: state.board.map(line => line.slice()), nextRow: state.nextRow.slice(), roundStats: { ...state.roundStats }, boostsUsed: { ...state.boostsUsed } };
}

/**
 * Strategy's untimed play phase is deterministic: every clear or skipped row
 * brings the same next row. A beam search over those choices stands in for a
 * player who thinks each move through. Returns the actions up to the bonus.
 */
export function planStrategy(config, { beamWidth = 30 } = {}) {
  const root = createGame(config);
  root.status = 'playing';
  const value = state => 0.3 * state.roundStats.grossPoints + 0.3 * potential(state) + 2000 * Math.min(freeRows(state), 8) - 20 * state.board.flat().filter(Boolean).length;
  let beam = [{ state: root, actions: [] }];
  while (beam.length && beam[0].state.phase === 'play') {
    const seen = new Set();
    const children = [];
    for (const { state, actions } of beam) {
      for (const move of [...legalMoves(state), { row: -1 }]) {
        const next = fork(state);
        if (move.row < 0) addRow(next);
        else clearAt(next, move.col, move.row);
        const key = next.board.map(line => line.map(cell => cell ? cell.color : '.').join('')).join('/');
        if (next.status === 'gameOver' || seen.has(key)) continue;
        seen.add(key);
        children.push({ state: next, actions: [...actions, move.row < 0 ? null : { col: move.col, row: move.row }], value: value(next) });
      }
    }
    beam = children.sort((a, b) => b.value - a.value).slice(0, beamWidth);
  }
  return beam[0]?.actions ?? null;
}

/**
 * Plays one round to its end. A met Continuous objective ends the run, as the
 * Journey does, unless `stopAtGoal` is false. Returns the settled summary and
 * the objective's final status. `plan` replays Strategy actions from
 * planStrategy before timed play resumes. `config` may include modifiers.
 * `onClear(state, result)` and `onStep(state)` observe each clear and time step.
 */
export function playReference(config, { objective = { type: 'finish' }, policy = {}, plan = null, seed = 1, stepMs = [400, 600], maxMs = 20 * 60000, stopAtGoal = true, onClear = () => {}, onStep = () => {} } = {}) {
  const random = seededRandom(seed);
  const state = createGame(config);
  state.status = 'playing';
  for (const action of plan || []) {
    if (action) clearAt(state, action.col, action.row);
    else addRow(state);
  }
  const untilFinish = stopAtGoal && finishRequirement(state.mode) === 'none';
  const met = () => untilFinish && evaluateObjective(objective, state).status === 'complete';
  while (state.status === 'playing' && state.elapsed < maxMs) {
    const move = chooseMove(state, policy, random);
    if (move) onClear(state, clearAt(state, move.col, move.row));
    // With nothing to clear, bring the next row forward while there is room, as
    // a player would; Strategy can only continue this way.
    else if ((state.mode === 'strategy' && state.phase === 'play') || (policy.addRows && freeRows(state) > (policy.dangerRows ?? 4) && !inEndgame(state, policy.endgameMs ?? 4000))) addRow(state);
    if (met()) { state.status = 'won'; break; }
    if (state.status !== 'playing') break;
    advanceTime(state, stepMs[0] + random() * (stepMs[1] - stepMs[0]));
    onStep(state);
    if (met()) { state.status = 'won'; break; }
  }
  if (state.status === 'playing') state.status = 'gameOver';
  const result = evaluateObjective(objective, state);
  const summary = finalizeRound(state);
  return { status: result.status, summary, state };
}

/**
 * Exhaustive puzzle search over every clear that completes `objective`.
 * Puzzle clears never build a timed streak, so the points still available
 * depend only on the board and whether the goal is already met; both are memoized.
 */
export function solvePuzzle(puzzleIndex, objective = { type: 'finish' }) {
  const memo = new Map();
  const boardKey = state => state.board.map(line => line.map(cell => cell ? cell.color : '.').join('')).join('/');
  const goalMet = state => evaluateObjective(objective, { ...state, status: 'playing' }).goalMet;
  function search(state) {
    const key = `${goalMet(state)}|${boardKey(state)}`;
    if (memo.has(key)) return memo.get(key);
    let result = null;
    for (const move of legalMoves(state)) {
      const next = fork(state);
      const points = clearAt(next, move.col, move.row).points;
      const rest = next.status === 'won' ? goalMet(next) ? { max: 0, min: 0, minMoves: 0, line: [] } : null : next.status === 'gameOver' ? null : search(next);
      if (!rest) continue;
      const step = { col: move.col, row: move.row };
      if (!result) result = { max: rest.max + points, min: rest.min + points, minMoves: rest.minMoves + 1, line: [step, ...rest.line] };
      else {
        if (rest.max + points > result.max) result = { ...result, max: rest.max + points, line: [step, ...rest.line] };
        result.min = Math.min(result.min, rest.min + points);
        result.minMoves = Math.min(result.minMoves, rest.minMoves + 1);
      }
    }
    memo.set(key, result);
    return result;
  }
  const state = createGame({ mode: 'puzzle', puzzleIndex });
  state.status = 'playing';
  const result = search(state);
  return result && { maxPoints: result.max, minPoints: result.min, minMoves: result.minMoves, bestLine: result.line };
}
