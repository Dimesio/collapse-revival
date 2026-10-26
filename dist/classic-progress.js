const number = value => Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
const object = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

/** Browser-local best stars and bounded calibration history; nothing is transmitted. */
export function createClassicProgress(storage) {
  const bests = object(storage.get('classic-stars', {}));
  let runs = storage.get('classic-playtests', []);
  runs = Array.isArray(runs) ? runs.filter(run => run && typeof run.id === 'string').slice(-500) : [];
  const key = (level, difficulty) => `${difficulty}:${level}`;
  function best(level, difficulty) {
    const entry = object(bests[key(level, difficulty)]);
    return { stars: Math.min(3, number(entry.stars)), score: number(entry.score) };
  }
  function record(state, id) {
    const summary = state.roundSummary;
    if (!summary?.classic || runs.some(run => run.id === id)) return;
    const classic = summary.classic;
    const previous = best(classic.level, classic.difficulty);
    bests[key(classic.level, classic.difficulty)] = {
      stars: Math.max(previous.stars, classic.stars), score: Math.max(previous.score, summary.netPoints), version: classic.version,
    };
    runs.push({
      id, version: classic.version, date: new Date().toISOString(), level: classic.level, difficulty: classic.difficulty,
      seed: state.seed, completed: state.status !== 'gameOver', stars: classic.stars, rawGross: summary.rawGrossPoints,
      gross: summary.grossPoints, net: summary.netPoints, remainingBlocks: summary.remainingBlocks,
      elapsed: state.elapsed, moves: summary.moves, biggestClear: summary.highestClear, blocksCleared: summary.blocksCleared,
      bonusRows: classic.bonusRows, bonusRowBudget: classic.bonusRowBudget, boostsUsed: classic.boostsUsed,
      twoStarTarget: classic.twoStars, threeStarTarget: classic.threeStars, provisional: classic.provisional,
    });
    runs = runs.slice(-500);
    storage.set('classic-stars', bests);
    storage.set('classic-playtests', runs);
  }
  function entries() {
    return Object.keys(bests).flatMap(value => {
      const [difficulty, rawLevel] = value.split(':');
      const level = number(Number(rawLevel));
      return ['easy', 'normal', 'hard'].includes(difficulty) && level > 0 ? [{ level, difficulty, ...best(level, difficulty) }] : [];
    }).sort((a, b) => a.level - b.level || ['easy', 'normal', 'hard'].indexOf(a.difficulty) - ['easy', 'normal', 'hard'].indexOf(b.difficulty));
  }
  return { best, record, entries, exportRuns: () => structuredClone(runs) };
}
