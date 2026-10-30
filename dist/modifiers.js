/**
 * Hard-mode modifiers. Each one is enforced by the engine or the host and is
 * offered only in modes where it changes play. None alters an authored puzzle
 * board, so every combination offered for a puzzle leaves its solution intact.
 */
const FEEDER_MODES = ['classic', 'relapse', 'continuous', 'countdown', 'slider'];
const STACK_MODES = ['classic', 'strategy', 'relapse', 'continuous', 'countdown', 'slider'];
const ALL_MODES = [...STACK_MODES, 'puzzle'];

export const MODIFIER_RULES = Object.freeze({
  fastRowsFactor: 0.8,
  tallStartRows: 2,
  relapseTallStartRows: 1,
});

export const MODIFIERS = Object.freeze([
  { id: 'fastRows', name: 'Quicker rows', description: 'Incoming rows arrive 20% sooner.', modes: FEEDER_MODES },
  { id: 'tallStart', name: 'Taller start', description: 'Start with two extra rows of blocks, or one more on each side in Relapse.', modes: STACK_MODES },
  { id: 'noBoosts', name: 'No boosts', description: 'Shop boosts cannot be used.', modes: ALL_MODES },
  { id: 'noHints', name: 'No hints', description: 'The hint is switched off.', modes: ALL_MODES },
  { id: 'noUndo', name: 'No undo', description: 'Puzzle moves cannot be taken back.', modes: ['puzzle'] },
  { id: 'moveLimit', name: 'Move limit', description: 'Clear the board within the known solution’s number of moves.', modes: ['puzzle'] },
].map(item => Object.freeze({ ...item, modes: Object.freeze(item.modes) })));

const order = new Map(MODIFIERS.map((item, index) => [item.id, index]));

export const modifiersForMode = mode => MODIFIERS.filter(item => item.modes.includes(mode));

/** Report the first problem in a requested combination, or a sorted, de-duplicated list. */
export function validateModifiers(mode, ids = [], { requireOne = false } = {}) {
  if (!Array.isArray(ids)) return { ok: false, reason: 'Modifiers must be a list.' };
  const unique = [...new Set(ids)];
  for (const id of unique) {
    const item = MODIFIERS.find(entry => entry.id === id);
    if (!item) return { ok: false, reason: `“${String(id)}” is not a known modifier.` };
    if (!item.modes.includes(mode)) return { ok: false, reason: `${item.name} is not available in this mode.` };
  }
  if (requireOne && !unique.length) return { ok: false, reason: 'Choose at least one modifier for hard mode.' };
  return { ok: true, modifiers: unique.sort((a, b) => order.get(a) - order.get(b)) };
}

/** The engine keeps only modifiers that apply; hosts validate first to explain a rejection. */
export function normalizeModifiers(mode, ids) {
  return Array.isArray(ids) ? validateModifiers(mode, ids.filter(id => MODIFIERS.some(item => item.id === id && item.modes.includes(mode)))).modifiers : [];
}

/** Gold-star evaluation bonus: 5% for a second modifier, 10% for three or more. */
export function modifierBonusPercent(count) {
  const total = Number.isFinite(count) ? Math.floor(count) : 0;
  return total >= 3 ? 10 : total === 2 ? 5 : 0;
}
