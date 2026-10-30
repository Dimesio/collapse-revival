import { MODIFIERS, modifierBonusPercent } from './modifiers.js';

/**
 * Gold-star hard mode. A level or stage opens its hard mode at two regular
 * stars, and every attempt needs at least one modifier. Gold stars judge round
 * points raised by the modifier bonus; the ordinary score is never changed.
 */
export const GOLD_UNLOCK_STARS = 2;
// The modifiers that change play. Calibration tries each mix of them, and its
// cautions name a mix by these alone.
export const PLAY_MODIFIERS = Object.freeze(['fastRows', 'tallStart']);

export const goldUnlocked = regularStars => (Number(regularStars) || 0) >= GOLD_UNLOCK_STARS;

/** Round points plus the modifier bonus, in whole points. */
export function goldPoints(points, modifierCount) {
  return Math.round(Math.max(0, points) * (100 + modifierBonusPercent(modifierCount)) / 100);
}

/** One gold star for meeting the objective in hard mode, two and three for gold points. */
export function goldResult({ completed, points, modifiers, targets }) {
  const adjusted = goldPoints(points, modifiers.length);
  const stars = !completed ? 0 : adjusted >= targets.three ? 3 : adjusted >= targets.two ? 2 : 1;
  return { stars, points, adjusted, bonus: modifierBonusPercent(modifiers.length), modifiers: [...modifiers], targets };
}

/** A gold record is kept whole: more gold stars win, then more gold points. */
export function goldImproves(attempt, previous) {
  if (!attempt?.stars) return false;
  return !previous || attempt.stars > previous.stars || (attempt.stars === previous.stars && attempt.adjustedScore > previous.adjustedScore);
}

/** True when the modifiers that change play form a mix the reference player never finished here. */
export function mixUnfinished(ids, unfinished = []) {
  const key = mix => PLAY_MODIFIERS.filter(id => mix.includes(id)).join('+');
  return unfinished.some(mix => key(mix) === key(ids));
}

export const modifierNames = ids => ids.map(id => MODIFIERS.find(item => item.id === id)?.name ?? id);
