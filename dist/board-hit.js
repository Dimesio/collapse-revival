import { ROWS, COLS } from './engine.js';

/**
 * The board cell under a pointer, or null outside the board. Each cell owns
 * its half of the gaps around its block, so the cells cover the whole board
 * and a click between two blocks counts for the nearer one.
 */
export function cellAtPoint(rect, x, y) {
  if (!rect.width || !rect.height || x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return null;
  return {
    col: Math.min(COLS - 1, Math.floor((x - rect.left) / rect.width * COLS)),
    row: Math.min(ROWS - 1, Math.floor((y - rect.top) / rect.height * ROWS)),
  };
}
