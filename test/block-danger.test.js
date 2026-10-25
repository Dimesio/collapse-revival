import test from 'node:test';
import assert from 'node:assert/strict';
import { getBlockDanger } from '../dist/block-danger.js';

function fixture(mode = 'classic', rows = 15, cols = 12) {
  return { mode, status: 'playing', board: Array.from({ length: rows }, () => Array(cols).fill(null)), nextId: 1 };
}

function put(state, col, row, side = 'bottom', kind = 'normal') {
  const cell = { id: state.nextId++, color: 0, side, kind };
  state.board[row][col] = cell;
  return cell;
}

test('rising modes escalate at three, two, one empty rows and top contact', () => {
  for (const mode of ['classic', 'strategy', 'slider', 'continuous', 'countdown']) {
    const state = fixture(mode);
    const cells = Array.from({ length: 6 }, (_, row) => put(state, 0, row));
    const danger = getBlockDanger(state);
    assert.deepEqual(cells.map(cell => danger.get(cell.id) ?? 0), [4, 3, 2, 1, 0, 0], mode);
  }
});

test('specials and obstacles near the edge receive the same warning as normal cubes', () => {
  const state = fixture();
  const stone = put(state, 0, 0, 'bottom', 'stone');
  const bomb = put(state, 1, 1, 'bottom', 'bomb');
  const colorBomb = put(state, 2, 2, 'bottom', 'colorBomb');
  const danger = getBlockDanger(state);
  assert.equal(danger.get(stone.id), 4);
  assert.equal(danger.get(bomb.id), 3);
  assert.equal(danger.get(colorBomb.id), 2);
});

test('Relapse measures the actual opposing gap independently in each column', () => {
  const state = fixture('relapse');
  const threeTop = put(state, 0, 4, 'top');
  const threeBottom = put(state, 0, 8);
  const safeBehind = put(state, 0, 3, 'top');
  const twoTop = put(state, 1, 5, 'top');
  const twoBottom = put(state, 1, 8);
  const behindTop = put(state, 1, 4, 'top');
  const behindBottom = put(state, 1, 9);
  const danger = getBlockDanger(state);
  assert.equal(danger.get(threeTop.id), 1);
  assert.equal(danger.get(threeBottom.id), 1);
  assert.equal(danger.has(safeBehind.id), false);
  assert.equal(danger.get(twoTop.id), 2);
  assert.equal(danger.get(twoBottom.id), 2);
  assert.equal(danger.get(behindTop.id), 1);
  assert.equal(danger.get(behindBottom.id), 1);
});

test('touching Relapse fronts shake strongest and cells behind grade down by distance', () => {
  const state = fixture('relapse');
  const top = [7, 6, 5, 4, 3].map(row => put(state, 2, row, 'top'));
  const bottom = [8, 9, 10, 11, 12].map(row => put(state, 2, row));
  const danger = getBlockDanger(state);
  assert.deepEqual(top.map(cell => danger.get(cell.id) ?? 0), [4, 3, 2, 1, 0]);
  assert.deepEqual(bottom.map(cell => danger.get(cell.id) ?? 0), [4, 3, 2, 1, 0]);
});

test('asymmetric Relapse stacks do not trigger a fixed middle-row warning', () => {
  const state = fixture('relapse');
  put(state, 0, 6, 'top');
  put(state, 0, 14);
  put(state, 1, 0, 'top');
  put(state, 1, 8);
  assert.equal(getBlockDanger(state).size, 0);
});

test('a Relapse column without an opposing stack warns at its own advancing boundary', () => {
  const state = fixture('relapse', 8, 3);
  const topContact = put(state, 0, 7, 'top');
  const topThree = put(state, 0, 4, 'top');
  const bottomContact = put(state, 2, 0);
  const bottomThree = put(state, 2, 3);
  const danger = getBlockDanger(state);
  assert.equal(danger.get(topContact.id), 4);
  assert.equal(danger.get(topThree.id), 1);
  assert.equal(danger.get(bottomContact.id), 4);
  assert.equal(danger.get(bottomThree.id), 1);
});

test('warnings stop when play stops and do not imply danger in untimed puzzles', () => {
  const state = fixture();
  put(state, 0, 0);
  for (const status of ['ready', 'paused', 'won', 'levelComplete', 'gameOver']) {
    state.status = status;
    assert.equal(getBlockDanger(state).size, 0, status);
  }
  state.status = 'playing';
  state.mode = 'puzzle';
  assert.equal(getBlockDanger(state).size, 0);
});

test('empty boards are safe and warning calculation leaves state unchanged', () => {
  const empty = fixture('relapse');
  assert.equal(getBlockDanger(empty).size, 0);
  const state = fixture('relapse');
  put(state, 2, 5, 'top');
  put(state, 2, 8);
  const before = structuredClone(state);
  assert.equal(getBlockDanger(state).size, 2);
  assert.deepEqual(state, before);
});
