import { normalizeModifiers } from './modifiers.js';
import { goldImproves } from './gold.js';

const number = value => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

/** Browser-local best stars, best gold, and bounded calibration history; nothing is transmitted. */
export function createClassicProgress(storage) {
  const bests = object(storage.get('classic-stars', {}));
  const golds = object(storage.get('classic-gold', {}));
  let runs = storage.get('classic-playtests', []);
  runs = Array.isArray(runs) ? runs.filter(run => run && typeof run.id === 'string').slice(-500) : [];
  const key = (level, difficulty) => `${difficulty}:${level}`;
  function best(level, difficulty) {
    const entry = object(bests[key(level, difficulty)]);
    return { stars: Math.min(3, number(entry.stars)), score: number(entry.score) };
  }
  /** The best gold attempt, kept whole with the modifiers that earned it, or null. */
  function goldBest(level, difficulty) {
    const entry = object(golds[key(level, difficulty)]);
    const stars = Math.min(3, number(entry.stars));
    const modifiers = normalizeModifiers('classic', entry.modifiers);
    return stars && modifiers.length ? { stars, score: number(entry.score), adjustedScore: number(entry.adjustedScore), modifiers } : null;
  }
  /**
   * Saves a settled Classic round once. With `gold` (from goldResult) it is a
   * gold run: only the gold record can change, and the result says how.
   */
  function record(state, id, gold = null) {
    const summary = state.roundSummary;
    if (!summary?.classic || runs.some(run => run.id === id)) return null;
    const classic = summary.classic;
    let result = null;
    if (gold) {
      const previous = goldBest(classic.level, classic.difficulty);
      const attempt = { stars: gold.stars, score: gold.points, adjustedScore: gold.adjusted, modifiers: gold.modifiers };
      const improved = goldImproves(attempt, previous);
      if (improved) {
        golds[key(classic.level, classic.difficulty)] = { ...attempt, version: classic.version };
        storage.set('classic-gold', golds);
      }
      result = { previous, best: improved ? attempt : previous, improved };
    } else {
      const previous = best(classic.level, classic.difficulty);
      bests[key(classic.level, classic.difficulty)] = {
        stars: Math.max(previous.stars, classic.stars), score: Math.max(previous.score, summary.netPoints), version: classic.version,
      };
      storage.set('classic-stars', bests);
    }
    runs.push({
      id, version: classic.version, date: new Date().toISOString(), level: classic.level, difficulty: classic.difficulty,
      seed: state.seed, completed: state.status !== 'gameOver', stars: classic.stars, rawGross: summary.rawGrossPoints,
      gross: summary.grossPoints, net: summary.netPoints, remainingBlocks: summary.remainingBlocks,
      elapsed: state.elapsed, moves: summary.moves, biggestClear: summary.highestClear, blocksCleared: summary.blocksCleared,
      bonusRows: classic.bonusRows, bonusRowBudget: classic.bonusRowBudget, boostsUsed: classic.boostsUsed,
      twoStarTarget: classic.twoStars, threeStarTarget: classic.threeStars, provisional: classic.provisional,
      ...(gold ? { modifiers: gold.modifiers, goldStars: gold.stars, goldPoints: gold.adjusted, goldTwoTarget: gold.targets.two, goldThreeTarget: gold.targets.three } : {}),
    });
    runs = runs.slice(-500);
    storage.set('classic-playtests', runs);
    return result;
  }
  function entries() {
    return Object.keys(bests).flatMap(value => {
      const [difficulty, rawLevel] = value.split(':');
      const level = number(Number(rawLevel));
      return ['easy', 'normal', 'hard'].includes(difficulty) && level > 0 ? [{ level, difficulty, ...best(level, difficulty), gold: goldBest(level, difficulty) }] : [];
    }).sort((a, b) => a.level - b.level || ['easy', 'normal', 'hard'].indexOf(a.difficulty) - ['easy', 'normal', 'hard'].indexOf(b.difficulty));
  }
  return { best, goldBest, record, entries, exportRuns: () => structuredClone(runs) };
}
