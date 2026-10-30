import { getBlockDanger } from './block-danger.js';

/**
 * Short cheers for the moments that deserve one: big and huge clears, clean
 * sweeps, recoveries from a close call, and passing a personal best. This
 * module only decides what to say and when; the page draws it, plays its
 * sound, and respects the sound and reduced-motion settings.
 *
 * The values are first playtest settings, measured with
 * `npm run calibrate:cheers`, not settled tuning.
 */
export const CHEER_RULES = Object.freeze({
  // Blocks removed by one clear, bombs included. Strategy's full, untimed
  // board makes big groups ordinary, so it needs more.
  bigClear: 10,
  hugeClear: 16,
  modes: Object.freeze({ strategy: Object.freeze({ bigClear: 20, hugeClear: 30 }) }),
  // A close call starts with a block in the top two rows (Relapse: two rows from
  // the other stack) and ends with four clear rows again.
  closeCallDanger: 3,
  safeDanger: 0,
  // A big or huge clear stays quiet this soon after a cheer of the same weight or more.
  quietClears: 4,
  quietMs: 6000,
});

/** Each cheer, most significant first. The priority settles events that coincide. */
export const CHEERS = Object.freeze({
  sweep: { priority: 5, phrases: ['Clean sweep!', 'Spotless!', 'Not a block left!', 'Swept clean!'] },
  doubleSweep: { priority: 5, phrases: ['Double sweep!', 'Both sides, spotless!', 'Clean sweep, twice over!'] },
  best: { priority: 4, phrases: ['Past your best!', 'Beyond your best!', 'Record pace!'] },
  closeCall: { priority: 3, phrases: ['Phew!', 'Close call!', 'Saved it!', 'Back from the brink!'] },
  huge: { priority: 2, phrases: ['Oh snap!', 'Whoa!', 'Monster clear!', 'Unreal!'] },
  big: { priority: 1, phrases: ['Nice!', 'Big time!', 'Look at that!', 'Lovely!', 'Now we’re talking!'] },
});

/** The board's highest warning level: 0 when calm, 4 when a stack touches the limit. */
export function dangerLevel(state) {
  let level = 0;
  for (const value of getBlockDanger(state).values()) level = Math.max(level, value);
  return level;
}

/** The clear sizes that count as big and huge in a mode. */
export function clearSizes(mode, rules = CHEER_RULES) {
  const { bigClear, hugeClear } = { ...rules, ...rules.modes?.[mode] };
  return { bigClear, hugeClear };
}

/** Every cheer this clear has earned, most significant first. */
export function cheerEvents({ mode, scoring, score = 0, best = 0, passedBest = false, closeCallArmed = false, danger = 0, rules = CHEER_RULES }) {
  const events = [];
  const sides = scoring?.clearedSides ?? [];
  if (sides.length === 2) events.push('doubleSweep');
  else if (sides.length) events.push('sweep');
  if (best > 0 && !passedBest && score > best) events.push('best');
  if (closeCallArmed && danger <= rules.safeDanger) events.push('closeCall');
  const count = scoring?.clearedCount ?? 0;
  const { bigClear, hugeClear } = clearSizes(mode, rules);
  if (count >= hugeClear) events.push('huge');
  else if (count >= bigClear) events.push('big');
  return events.sort((a, b) => CHEERS[b].priority - CHEERS[a].priority);
}

/**
 * Tracks one run. `reset` starts a run with the best score to beat, `newRound`
 * starts a fresh board within it, `watch` follows the board between clears,
 * and `afterClear` returns the cheer for a clear that was just made, or null.
 */
export function createCheers({ random = Math.random, rules = CHEER_RULES } = {}) {
  let best = 0;
  let passedBest = false;
  let closeCallArmed = false;
  let clears = 0;
  let last = null;
  const decks = new Map();
  const lastPhrase = new Map();

  /** Phrases come from a shuffled deck, so each is heard before any repeats, never twice running. */
  function phrase(type) {
    let deck = decks.get(type);
    if (!deck?.length) {
      deck = [...CHEERS[type].phrases];
      for (let index = deck.length - 1; index > 0; index--) {
        const swap = Math.floor(random() * (index + 1));
        [deck[index], deck[swap]] = [deck[swap], deck[index]];
      }
      const end = deck.length - 1;
      if (end > 0 && deck[end] === lastPhrase.get(type)) [deck[0], deck[end]] = [deck[end], deck[0]];
      decks.set(type, deck);
    }
    const next = deck.pop();
    lastPhrase.set(type, next);
    return next;
  }

  function newRound() {
    closeCallArmed = false;
    last = null;
  }

  return {
    reset({ best: nextBest = 0 } = {}) {
      best = Math.max(0, nextBest || 0);
      passedBest = false;
      clears = 0;
      newRound();
    },
    newRound,
    watch(state, danger = dangerLevel(state)) {
      if (state.status !== 'playing') return;
      if (danger >= rules.closeCallDanger) closeCallArmed = true;
      // Anything else that calms the board, such as a boost, ends the close call quietly.
      else if (danger <= rules.safeDanger) closeCallArmed = false;
    },
    afterClear(state, result) {
      if (!result?.valid || !result.scoring?.clearedCount) return null;
      clears++;
      // A finished round has its own result, and a puzzle's biggest group can be its trap.
      if (state.status !== 'playing' || state.mode === 'puzzle') return null;
      const danger = dangerLevel(state);
      const events = cheerEvents({ mode: state.mode, scoring: result.scoring, score: state.score, best, passedBest, closeCallArmed, danger, rules });
      if (events.includes('best')) passedBest = true;
      if (events.includes('closeCall')) closeCallArmed = false;
      else if (danger >= rules.closeCallDanger) closeCallArmed = true;
      const [type, ...also] = events;
      if (!type) return null;
      const { priority } = CHEERS[type];
      const now = state.elapsed ?? 0;
      const recent = last && (clears - last.clears < rules.quietClears || now - last.at < rules.quietMs);
      if (priority <= CHEERS.huge.priority && recent && priority <= last.priority) return null;
      last = { clears, at: now, priority };
      const detail = type === 'best' ? `Your best was ${best.toLocaleString('en-US')}` : type === 'closeCall' ? 'Out of the danger zone' : '';
      return { type, phrase: phrase(type), detail, priority, also };
    },
  };
}
