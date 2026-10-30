// Puzzle stars. A puzzle's points depend only on the order of its moves, so
// its targets come from the best and worst lines that clear it, found by an
// exhaustive solver (tools/calibrate-puzzles.js). See docs/puzzle-stars.md.
import { goldPoints } from './gold.js';

const roundUp = (value, step) => Math.ceil(value / step) * step;

// A perfect line needs no boosts, hints or undo, so these three cost nothing to take.
export const PUZZLE_FREE_MODIFIERS = Object.freeze(['noBoosts', 'noHints', 'noUndo']);

/** Three stars at 90% of the best line's points, two halfway from the worst line. */
export function puzzleTargets({ maxPoints, minPoints }) {
  const three = roundUp(maxPoints * 0.9, 10);
  return { two: Math.min(three, roundUp((minPoints + three) / 2, 10)), three };
}

/**
 * Three gold stars need the best line with the three challenges it costs
 * nothing to take, as gold points; two need 95% of that.
 */
export function puzzleGoldTargets({ maxPoints }) {
  const three = goldPoints(maxPoints, PUZZLE_FREE_MODIFIERS.length);
  return { two: Math.min(three, roundUp(three * 0.95, 10)), three };
}

/** Free-play targets for a puzzle from its stored best and worst points. */
export const puzzleStarTargets = puzzle => puzzleTargets({ maxPoints: puzzle.points.best, minPoints: puzzle.points.worst });
export const puzzleStarGoldTargets = puzzle => puzzleGoldTargets({ maxPoints: puzzle.points.best });

/** How the Move limit challenge reads for a puzzle. */
export const moveLimitText = puzzle => `Clear every block in ${puzzle.solution.length} moves or fewer, the known solution’s length.`;

/** ★ for clearing the board; ★★ and ★★★ for its points. */
export function puzzleStars(points, cleared, targets) {
  if (!cleared) return 0;
  return points >= targets.three ? 3 : points >= targets.two ? 2 : 1;
}
