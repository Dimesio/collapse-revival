import { normalizeModifiers } from './modifiers.js';
import { goldImproves } from './gold.js';

const number = value => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

/**
 * Browser-local best stars and best gold for free-play puzzles, keyed by
 * puzzle name so a reordered collection keeps its records. Nothing is sent.
 */
export function createPuzzleProgress(storage) {
  const bests = object(storage.get('puzzle-stars', {}));
  const golds = object(storage.get('puzzle-gold', {}));
  function best(name) {
    const entry = object(bests[name]);
    return { stars: Math.min(3, number(entry.stars)), score: number(entry.score) };
  }
  /** The best gold attempt, kept whole with the modifiers that earned it, or null. */
  function goldBest(name) {
    const entry = object(golds[name]);
    const stars = Math.min(3, number(entry.stars));
    const modifiers = normalizeModifiers('puzzle', entry.modifiers);
    return stars && modifiers.length ? { stars, score: number(entry.score), adjustedScore: number(entry.adjustedScore), modifiers } : null;
  }
  /**
   * Saves a settled puzzle's stars and points. With `gold` (from goldResult) it
   * is a gold run: only the gold record can change, and the result says how.
   */
  function record(name, { stars, points }, gold = null) {
    if (gold) {
      const previous = goldBest(name);
      const attempt = { stars: gold.stars, score: gold.points, adjustedScore: gold.adjusted, modifiers: gold.modifiers };
      const improved = goldImproves(attempt, previous);
      if (improved) {
        golds[name] = attempt;
        storage.set('puzzle-gold', golds);
      }
      return { previous, best: improved ? attempt : previous, improved };
    }
    const previous = best(name);
    if (!stars || (stars <= previous.stars && points <= previous.score)) return { previous, best: previous, improved: false };
    bests[name] = { stars: Math.max(previous.stars, stars), score: Math.max(previous.score, number(points)) };
    storage.set('puzzle-stars', bests);
    return { previous, best: best(name), improved: true };
  }
  return { best, goldBest, record };
}
