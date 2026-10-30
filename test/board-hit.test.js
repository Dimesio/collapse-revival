import test from 'node:test';
import assert from 'node:assert/strict';
import { ROWS, COLS } from '../dist/engine.js';
import { cellAtPoint } from '../dist/board-hit.js';

// A 360 × 450 board at (100, 50): every cell is 30 × 30.
const rect = { left: 100, top: 50, right: 460, bottom: 500, width: 360, height: 450 };
const cellLeft = col => rect.left + col * rect.width / COLS;
const cellTop = row => rect.top + row * rect.height / ROWS;

test('a block centre maps to its own cell', () => {
  assert.deepEqual(cellAtPoint(rect, cellLeft(4) + 15, cellTop(9) + 15), { col: 4, row: 9 });
  assert.deepEqual(cellAtPoint(rect, cellLeft(0) + 15, cellTop(0) + 15), { col: 0, row: 0 });
});

test('the gaps between blocks count for the nearer block', () => {
  // Blocks sit 1.5px inside their cells, so each boundary has a 3px gap.
  assert.deepEqual(cellAtPoint(rect, cellLeft(5) - 1, cellTop(7) + 15), { col: 4, row: 7 });
  assert.deepEqual(cellAtPoint(rect, cellLeft(5) + 1, cellTop(7) + 15), { col: 5, row: 7 });
  assert.deepEqual(cellAtPoint(rect, cellLeft(2) + 15, cellTop(3) - 1), { col: 2, row: 2 });
  assert.deepEqual(cellAtPoint(rect, cellLeft(3) - 1, cellTop(3) - 1), { col: 2, row: 2 });
});

test('every point on the board belongs to exactly the cell around it', () => {
  for (let x = rect.left; x <= rect.right; x += 0.5) {
    for (let y = rect.top; y <= rect.bottom; y += 0.5) {
      const cell = cellAtPoint(rect, x, y);
      assert.ok(cell, `${x}, ${y}`);
      assert.ok(cell.col >= 0 && cell.col < COLS && cell.row >= 0 && cell.row < ROWS);
      assert.ok(x >= cellLeft(cell.col) && (x < cellLeft(cell.col + 1) || cell.col === COLS - 1));
      assert.ok(y >= cellTop(cell.row) && (y < cellTop(cell.row + 1) || cell.row === ROWS - 1));
    }
  }
});

test('points outside the board or on an unlaid board find no cell', () => {
  assert.equal(cellAtPoint(rect, rect.left - 1, rect.top + 10), null);
  assert.equal(cellAtPoint(rect, rect.left + 10, rect.bottom + 1), null);
  assert.equal(cellAtPoint(rect, 0, 0), null);
  assert.equal(cellAtPoint({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }, 0, 0), null);
});
