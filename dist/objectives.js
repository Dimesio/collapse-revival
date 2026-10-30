import { ROWS, COLS, countBlocks } from './engine.js';

/**
 * Round objectives as plain data, e.g. { type: 'group', target: 10 }. Progress
 * is read from engine state alone, so undo snapshots, replays, and shared
 * challenges evaluate the same way. Each objective is a goal plus the mode's
 * finish requirement: finite levels must end, Countdown must reach time, a
 * puzzle must be cleared, and Continuous completes as soon as the goal is met.
 */
const ALL_MODES = ['classic', 'strategy', 'relapse', 'slider', 'countdown', 'continuous', 'puzzle'];
const FINITE_MODES = ['classic', 'strategy', 'relapse', 'slider'];
// Strategy and Puzzle clears never build a timed streak.
const STREAK_MODES = ['classic', 'relapse', 'slider', 'countdown', 'continuous'];
const BOARD_CELLS = ROWS * COLS;

export const OBJECTIVE_TYPES = Object.freeze({
  finish: { modes: ALL_MODES.filter(mode => mode !== 'continuous') },
  score: { modes: ALL_MODES, min: 1, max: 1000000000 },
  group: { modes: ALL_MODES, min: 3, max: BOARD_CELLS },
  blocks: { modes: ALL_MODES.filter(mode => mode !== 'puzzle'), min: 1, max: 1000000 },
  allClear: { modes: ALL_MODES.filter(mode => mode !== 'puzzle'), min: 1, max: 20 },
  fewBlocks: { modes: [...FINITE_MODES, 'countdown'], min: 0, max: BOARD_CELLS },
  streak: { modes: STREAK_MODES, min: 2, max: 500 },
});

/** 'level', 'round', 'clear', or 'none' for Continuous. */
export function finishRequirement(mode) {
  return mode === 'continuous' ? 'none' : mode === 'countdown' ? 'round' : mode === 'puzzle' ? 'clear' : 'level';
}

export function validateObjective(mode, objective) {
  if (!Object.hasOwn(OBJECTIVE_TYPES, objective?.type)) return { ok: false, reason: 'That objective type is not supported.' };
  const rule = OBJECTIVE_TYPES[objective.type];
  if (!rule.modes.includes(mode)) return { ok: false, reason: 'That objective does not fit this mode.' };
  if (objective.type === 'finish') return { ok: true, objective: { type: 'finish' } };
  const { target } = objective;
  if (!Number.isInteger(target) || target < rule.min || target > rule.max) return { ok: false, reason: `The objective target must be a whole number from ${rule.min} to ${rule.max}.` };
  return { ok: true, objective: { type: objective.type, target } };
}

const number = value => value.toLocaleString('en-US');

export function describeObjective(objective, mode) {
  const requirement = finishRequirement(mode);
  const { type, target } = objective;
  if (type === 'finish') return { level: 'Finish the level and bonus round', round: 'Finish the two-minute round', clear: 'Clear every block' }[requirement];
  if (type === 'fewBlocks') {
    const left = target === 0 ? 'an empty board' : `${number(target)} or fewer blocks left`;
    return requirement === 'round' ? `End the two-minute round with ${left}` : `Finish the level with ${left}`;
  }
  if (type === 'score' && requirement === 'none') return `Score ${number(target)} points in one run`;
  const side = mode === 'relapse';
  const goal = {
    score: `Earn ${number(target)} points`,
    group: `Clear a group of ${number(target)} or more`,
    blocks: `Clear ${number(target)} blocks`,
    allClear: `${side ? 'Empty a whole side' : 'Clear the whole board'}${target === 1 ? '' : ` ${target} times`}`,
    streak: `Chain ${target} quick clears in a row`,
  }[type];
  const finish = { level: 'finish the level', round: 'last the full two minutes', clear: 'clear every block', none: '' }[requirement];
  return finish ? `${goal}, then ${finish}` : goal;
}

/** A short progress line for an evaluation; Finish objectives have none. */
export function describeProgress(objective, evaluation, mode) {
  const { current, target } = evaluation;
  // Progress stops at the target; a fuller count belongs in the round tally.
  const reached = Math.min(current, target);
  switch (objective.type) {
    case 'score': return `${number(reached)} of ${number(target)} points`;
    case 'group': return `Biggest group: ${number(reached)} of ${number(target)}`;
    case 'blocks': return `${number(reached)} of ${number(target)} blocks cleared`;
    case 'allClear': return `${reached} of ${target} ${mode === 'relapse' ? 'sides emptied' : 'board clears'}`;
    case 'streak': return `Best streak: ${reached} of ${target}`;
    case 'fewBlocks': return `${number(current)} ${current === 1 ? 'block' : 'blocks'} on the board · ${target ? `${number(target)} or fewer` : 'none'} at the end`;
    default: return '';
  }
}

const earnedPoints = state =>state.roundStats ? state.roundStats.grossPoints : state.score || 0;

function goalProgress(type, state) {
  const stats = state.roundStats || {};
  switch (type) {
    case 'score': return earnedPoints(state);
    case 'group': return stats.largestGroup || 0;
    case 'blocks': return stats.blocksCleared || 0;
    case 'allClear': return (stats.doubleClears || 0) + (stats.tripleClears || 0);
    case 'streak': return stats.bestStreak || 0;
    case 'fewBlocks': return state.board ? countBlocks(state) : 0;
    default: return null;
  }
}

/**
 * Status is 'active', 'met' (goal reached, finish still required), 'complete',
 * or 'failed'. Score uses points earned this round, before the leftover-block
 * deduction, so the result is the same before and after the round is settled.
 */
export function evaluateObjective(objective, state) {
  const requirement = finishRequirement(state.mode);
  const current = goalProgress(objective.type, state);
  const target = objective.type === 'finish' ? null : objective.target;
  const finished = requirement === 'none' ? false : requirement === 'level' ? ['levelComplete', 'won'].includes(state.status) : state.status === 'won';
  const goalMet = objective.type === 'finish' ? true : objective.type === 'fewBlocks' ? finished && current <= target : current >= target;
  let status;
  if (state.status === 'gameOver') status = 'failed';
  else if (requirement === 'none') status = goalMet && ['playing', 'paused', 'won', 'levelComplete'].includes(state.status) ? 'complete' : 'active';
  else if (finished) status = goalMet ? 'complete' : 'failed';
  else status = goalMet && objective.type !== 'finish' ? 'met' : 'active';
  return { status, goalMet, finished, current, target };
}
