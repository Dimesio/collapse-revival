/** Per-block visual warning levels; this never changes the board or game rules. */
export function getBlockDanger(state) {
  const danger = new Map();
  if (state.status !== 'playing' || state.mode === 'puzzle') return danger;

  const board = state.board;
  const rows = board.length;
  const cols = board.reduce((width, row) => Math.max(width, row.length), 0);
  const topFront = Array(cols).fill(-1);
  const bottomFront = Array(cols).fill(rows);

  if (state.mode === 'relapse') {
    board.forEach((line, row) => line.forEach((cell, col) => {
      if (cell?.side === 'top') topFront[col] = Math.max(topFront[col], row);
      if (cell?.side === 'bottom') bottomFront[col] = Math.min(bottomFront[col], row);
    }));
  }

  board.forEach((line, row) => line.forEach((cell, col) => {
    if (!cell) return;
    let gap = row;
    if (state.mode === 'relapse') {
      if (cell.side === 'top') {
        gap = bottomFront[col] < rows ? bottomFront[col] - row - 1 : rows - 1 - row;
      } else {
        gap = topFront[col] >= 0 ? row - topFront[col] - 1 : row;
      }
    }
    // Three clear rows start the warning; contact is the strongest level.
    if (gap <= 3) danger.set(cell.id, Math.min(4, 4 - gap));
  }));
  return danger;
}
