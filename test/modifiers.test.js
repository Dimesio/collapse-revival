import test from 'node:test';
import assert from 'node:assert/strict';
import { MODIFIERS, MODIFIER_RULES, modifiersForMode, validateModifiers, normalizeModifiers, modifierBonusPercent } from '../dist/modifiers.js';
import { PUZZLES } from '../dist/puzzles.js';
import { COLS, ROWS, MODES, createGame, clearAt, countBlocks, addRow, usePowerup, nextLevel, hintsAllowed, undoAllowed } from '../dist/engine.js';

const PUZZLE_MODIFIERS = modifiersForMode('puzzle').map(item => item.id);
const subsets = items => items.reduce((all, item) => all.concat(all.map(set => [...set, item])), [[]]);

test('every modifier is offered only where it changes play', () => {
  assert.deepEqual(MODIFIERS.map(item => item.id), ['fastRows', 'tallStart', 'noBoosts', 'noHints', 'noUndo', 'moveLimit']);
  assert.deepEqual(PUZZLE_MODIFIERS, ['noBoosts', 'noHints', 'noUndo', 'moveLimit']);
  assert.deepEqual(modifiersForMode('strategy').map(item => item.id), ['tallStart', 'noBoosts', 'noHints']);
  for (const mode of MODES.filter(item => !['puzzle', 'strategy'].includes(item.id))) {
    assert.deepEqual(modifiersForMode(mode.id).map(item => item.id), ['fastRows', 'tallStart', 'noBoosts', 'noHints'], mode.id);
  }
  assert.ok(MODES.every(mode => modifiersForMode(mode.id).length >= 3), 'each mode offers a real choice');
});

test('validation explains rejected combinations and returns a canonical list', () => {
  assert.deepEqual(validateModifiers('classic', ['noHints', 'fastRows', 'noHints']), { ok: true, modifiers: ['fastRows', 'noHints'] });
  assert.deepEqual(validateModifiers('classic', []), { ok: true, modifiers: [] });
  assert.equal(validateModifiers('classic', [], { requireOne: true }).ok, false);
  assert.match(validateModifiers('classic', [], { requireOne: true }).reason, /at least one/);
  assert.match(validateModifiers('classic', ['noUndo']).reason, /No undo is not available/);
  assert.match(validateModifiers('puzzle', ['fastRows']).reason, /Quicker rows is not available/);
  assert.match(validateModifiers('strategy', ['fastRows']).reason, /not available/);
  assert.match(validateModifiers('classic', ['turbo']).reason, /not a known modifier/);
  assert.match(validateModifiers('classic', ['constructor']).reason, /not a known modifier/);
  assert.equal(validateModifiers('classic', 'fastRows').ok, false);
});

test('the engine keeps only applicable modifiers, deterministically', () => {
  assert.deepEqual(normalizeModifiers('puzzle', ['moveLimit', 'fastRows', 'bogus', 'noHints']), ['noHints', 'moveLimit']);
  assert.deepEqual(normalizeModifiers('classic', null), []);
  assert.deepEqual(createGame({ seed: 7, modifiers: ['noUndo', 'tallStart'] }).modifiers, ['tallStart']);
  assert.deepEqual(createGame({ seed: 7 }).modifiers, []);
  assert.deepEqual(createGame({ seed: 7, modifiers: ['tallStart', 'fastRows'] }), createGame({ seed: 7, modifiers: ['fastRows', 'tallStart'] }));
});

test('the gold-star bonus is 5% for a second modifier and caps at 10%', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 6].map(modifierBonusPercent), [0, 0, 5, 10, 10, 10]);
  assert.equal(modifierBonusPercent(NaN), 0);
});

test('Quicker rows shortens every feeder interval, including the fastest levels', () => {
  for (const mode of ['classic', 'relapse', 'continuous', 'countdown', 'slider']) {
    for (const difficulty of ['easy', 'normal', 'hard']) {
      for (const level of [1, 4, 40]) {
        const plain = createGame({ mode, difficulty, level, seed: 3 });
        const quick = createGame({ mode, difficulty, level, seed: 3, modifiers: ['fastRows'] });
        assert.equal(quick.rowInterval, plain.rowInterval * MODIFIER_RULES.fastRowsFactor, `${mode} ${difficulty} ${level}`);
      }
    }
  }
  assert.equal(createGame({ level: 40, modifiers: ['fastRows'] }).rowInterval, 1100 * MODIFIER_RULES.fastRowsFactor);
  const plain = createGame({ seed: 3 });
  const quick = createGame({ seed: 3, modifiers: ['fastRows'] });
  assert.ok(quick.bonusRowsTarget > plain.bonusRowsTarget, 'the Classic bonus supply follows the faster pace');
});

test('Quicker rows persists as Continuous speeds up and across a new level', () => {
  const plain = createGame({ mode: 'continuous', seed: 5 });
  const quick = createGame({ mode: 'continuous', seed: 5, modifiers: ['fastRows'] });
  for (const state of [plain, quick]) {
    state.status = 'playing';
    state.board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    for (let row = 0; row < 12; row++) { addRow(state); state.board[ROWS - 1] = Array(COLS).fill(null); }
  }
  assert.equal(quick.rowInterval, plain.rowInterval * MODIFIER_RULES.fastRowsFactor);

  const classic = createGame({ seed: 5, modifiers: ['fastRows', 'noHints'] });
  classic.status = 'levelComplete';
  assert.equal(nextLevel(classic).valid, true);
  assert.equal(classic.level, 2);
  assert.deepEqual(classic.modifiers, ['fastRows', 'noHints']);
  assert.equal(classic.rowInterval, createGame({ level: 2 }).rowInterval * MODIFIER_RULES.fastRowsFactor);
});

test('Taller start adds two rows, or one more on each Relapse side', () => {
  for (const mode of ['classic', 'strategy', 'continuous', 'countdown', 'slider']) {
    const state = createGame({ mode, seed: 9, modifiers: ['tallStart'] });
    assert.equal(countBlocks(state), (6 + MODIFIER_RULES.tallStartRows) * COLS, mode);
    assert.ok(state.board[ROWS - 8].every(Boolean) && state.board[ROWS - 9].every(cell => !cell), mode);
  }
  const relapse = createGame({ mode: 'relapse', seed: 9, modifiers: ['tallStart'] });
  assert.equal(countBlocks(relapse), 8 * COLS);
  assert.ok(relapse.board.slice(0, 4).flat().every(cell => cell?.side === 'top'));
  assert.ok(relapse.board.slice(ROWS - 4).flat().every(cell => cell?.side === 'bottom'));
  assert.ok(relapse.board.slice(4, ROWS - 4).flat().every(cell => !cell));
});

test('No boosts refuses every shop boost without touching the game', () => {
  for (const type of ['blast', 'color', 'freeze']) {
    const state = createGame({ seed: 11, modifiers: ['noBoosts'] });
    state.status = 'playing';
    const before = structuredClone(state);
    const result = usePowerup(state, type);
    assert.equal(result.valid, false, type);
    assert.match(result.message, /Boosts are off/);
    assert.deepEqual(state, before, type);
  }
  const allowed = createGame({ seed: 11 });
  allowed.status = 'playing';
  assert.equal(usePowerup(allowed, 'freeze').valid, true);
});

test('hint and undo permissions follow their modifiers', () => {
  assert.equal(hintsAllowed(createGame({ seed: 1 })), true);
  assert.equal(hintsAllowed(createGame({ seed: 1, modifiers: ['noHints'] })), false);
  assert.equal(undoAllowed(createGame({ mode: 'puzzle' })), true);
  assert.equal(undoAllowed(createGame({ mode: 'puzzle', modifiers: ['noUndo'] })), false);
  assert.equal(undoAllowed(createGame({ mode: 'classic' })), false, 'only puzzles can be undone');
});

test('a move limit equals the stored solution and stays out of ordinary play', () => {
  for (const [puzzleIndex, puzzle] of PUZZLES.entries()) {
    assert.equal(createGame({ mode: 'puzzle', puzzleIndex, modifiers: ['moveLimit'] }).moveLimit, puzzle.solution.length);
    assert.equal(createGame({ mode: 'puzzle', puzzleIndex }).moveLimit, null);
  }
  const state = createGame({ mode: 'puzzle', puzzleIndex: 0, modifiers: ['moveLimit'] });
  state.status = 'won';
  nextLevel(state);
  assert.equal(state.puzzleIndex, 1);
  assert.equal(state.moveLimit, PUZZLES[1].solution.length, 'the next puzzle uses its own limit');
});

test('every offered puzzle combination still allows the known solution', () => {
  for (const [puzzleIndex, puzzle] of PUZZLES.entries()) {
    for (const modifiers of subsets(PUZZLE_MODIFIERS)) {
      const state = createGame({ mode: 'puzzle', puzzleIndex, seed: 1, modifiers });
      state.status = 'playing';
      for (const move of puzzle.solution) assert.equal(clearAt(state, move.col, move.row).valid, true, `${puzzle.name} ${modifiers}`);
      assert.equal(state.status, 'won', `${puzzle.name} with ${modifiers.join(', ') || 'no modifiers'}`);
    }
  }
});

test('running out of moves ends the puzzle and keeps the remaining board', () => {
  const state = createGame({ mode: 'puzzle', puzzleIndex: 1, modifiers: ['moveLimit'] });
  state.status = 'playing';
  state.moveLimit = 1;
  const result = clearAt(state, 3, 12);
  assert.equal(result.valid, true);
  assert.equal(state.status, 'gameOver');
  assert.match(state.message, /Out of moves/);
  assert.equal(countBlocks(state), 6);

  const unlimited = createGame({ mode: 'puzzle', puzzleIndex: 1 });
  unlimited.status = 'playing';
  clearAt(unlimited, 3, 12);
  assert.equal(unlimited.status, 'playing');
});
