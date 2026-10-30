// Proposes Journey objectives, regular star targets and provisional gold-star
// targets from repeatable runs of a population of simulated play styles.
// Usage: node tools/calibrate-journey.js [--runs 24] [--stage 7,8] [--json]
import { STAGES } from '../dist/journey.js';
import { getClassicTargets, getClassicGoldTargets } from '../dist/classic-stars.js';
import { describeObjective, evaluateObjective, finishRequirement } from '../dist/objectives.js';
import { modifiersForMode, modifierBonusPercent } from '../dist/modifiers.js';
import { PLAY_MODIFIERS } from '../dist/gold.js';
import { puzzleTargets, puzzleGoldTargets } from '../dist/puzzle-stars.js';
import { playReference, planStrategy, solvePuzzle } from './reference-player.js';

// Journey puzzle stages use the same rules as free-play puzzles.
export { puzzleTargets, puzzleGoldTargets };

/**
 * Simulated play styles, from a slower player who clears whatever is ready to
 * an ambitious one who waits for big groups and brings rows in early. Strategy
 * stages add a planned style that thinks every untimed move through.
 */
export const PLAY_STYLES = Object.freeze([
  { id: 'casual', policy: { patience: 3 }, stepMs: [700, 1100] },
  { id: 'steady', policy: { patience: 3 } },
  { id: 'careful', policy: { lookahead: true, patience: 3 } },
  { id: 'guarded', policy: { lookahead: true, patience: 3, dangerRows: 6 } },
  { id: 'brisk', policy: { patience: 3, addRows: true } },
  { id: 'planner', policy: { lookahead: true, patience: 3, addRows: true } },
  { id: 'patient', policy: { patience: 5, addRows: true } },
  { id: 'builder', policy: { patience: 7, addRows: true } },
  { id: 'ambitious', policy: { lookahead: true, patience: 5, addRows: true } },
].map(style => Object.freeze(style)));

/** Share of all simulated runs that should meet the objective, by world. */
export const OBJECTIVE_SHARE = Object.freeze([0.5, 0.45, 0.4, 0.35, 0.3]);
// Bots never use boosts or hints, so a player can always add these two for free.
const FREE_MODIFIERS = ['noBoosts', 'noHints'];
// Continuous never finishes, so its goal counts what a run clears in this time.
export const CONTINUOUS_BUDGET_MS = 90000;

const roundUp = (value, step) => Math.ceil(value / step) * step;
const roundDown = (value, step) => Math.floor(value / step) * step;
const median = values => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
};

/** Classic's approved spacing: three stars at 90% of the expert median, two at 65% of three. */
export function targetsFromMedian(value) {
  const three = roundUp(value * 0.9, 50);
  return { two: roundUp(three * 0.65, 50), three };
}

/**
 * Gold stars measure against the strongest modifier choice. `reference` is the
 * highest bonus-adjusted expert median across the combinations a player can pick.
 */
export function goldFromReference(reference) {
  return { two: roundUp(reference * 0.9, 50), three: roundUp(reference, 50) };
}

/**
 * The goal value reached by at least `share` of runs, rounded toward the easier
 * side. Runs that failed the mode's finish count as never reaching it.
 */
export function objectiveTarget(type, values, share) {
  const lower = type === 'fewBlocks';
  const sorted = values.map(value => value ?? (lower ? Infinity : -Infinity)).sort((a, b) => lower ? a - b : b - a);
  const value = sorted[Math.max(0, Math.ceil(share * sorted.length) - 1)];
  if (!Number.isFinite(value)) return null;
  if (lower) return roundUp(value, 5);
  if (type === 'score') return Math.max(1000, roundDown(value, 1000));
  if (type === 'blocks') return Math.max(10, roundDown(value, 10));
  return value;
}

const stageConfig = (stage, modifiers = []) => ({ mode: stage.mode, difficulty: stage.difficulty, level: stage.level, seed: stage.seed, modifiers });

function stylesFor(stage, modifiers) {
  if (stage.mode !== 'strategy') return PLAY_STYLES;
  const plan = planStrategy(stageConfig(stage, modifiers));
  return plan ? [...PLAY_STYLES, { id: 'planned', policy: PLAY_STYLES[1].policy, plan }] : PLAY_STYLES;
}

function play(stage, style, { runs, objective, modifiers = [], stopAtGoal = true }) {
  const open = !stopAtGoal && finishRequirement(stage.mode) === 'none';
  return Array.from({ length: runs }, (_, run) => playReference(stageConfig(stage, modifiers), {
    objective, policy: style.policy, plan: style.plan, stepMs: style.stepMs, seed: (run + 1) * 7919, stopAtGoal, ...(open ? { maxMs: CONTINUOUS_BUDGET_MS } : {}),
  }));
}

/** Each style's completion rate and median settled points for one objective. */
function measure(stage, { runs, objective = stage.objective, modifiers = [] }) {
  return stylesFor(stage, modifiers).map(style => {
    const results = play(stage, style, { runs, objective, modifiers });
    const completed = results.filter(result => result.status === 'complete').map(result => result.summary.netPoints);
    return { style: style.id, completionRate: completed.length / runs, median: completed.length ? median(completed) : null };
  });
}

/** The expert is the highest-scoring style among those completing at least half their runs. */
const expertOf = measured => measured.filter(entry => entry.completionRate >= 0.5).reduce((best, entry) => !best || entry.median > best.median ? entry : best, null);

/** Plays every style to the end without the target, then sets the target by world. */
export function calibrateObjective(stage, { runs = 24 } = {}) {
  const { type } = stage.objective;
  if (type === 'finish') return stage.objective;
  const probe = { type, target: type === 'fewBlocks' ? 0 : 1 };
  const values = stylesFor(stage, []).flatMap(style => play(stage, style, { runs, objective: probe, stopAtGoal: false }).map(({ state }) => {
    const evaluation = evaluateObjective(probe, state);
    // Continuous has no finish: its value is what the run cleared within the budget.
    return evaluation.finished || finishRequirement(stage.mode) === 'none' ? evaluation.current : null;
  }));
  const target = objectiveTarget(type, values, OBJECTIVE_SHARE[stage.worldIndex]);
  return target === null ? null : { type, target };
}

/**
 * Gold combinations: the free modifiers alone, then with each mix of the
 * modifiers that change play. Returns each one's expert and adjusted median.
 */
export function calibrateGold(stage, objective, { runs = 24, base = null } = {}) {
  const offered = modifiersForMode(stage.mode).map(item => item.id);
  const playing = PLAY_MODIFIERS.filter(id => offered.includes(id));
  const combos = [[], ...playing.map(id => [id]), ...(playing.length > 1 ? [playing] : [])];
  const free = FREE_MODIFIERS.filter(id => offered.includes(id));
  const measured = combos.map(combo => {
    const expert = combo.length || !base ? expertOf(measure(stage, { runs, objective, modifiers: combo })) : base;
    const bonus = modifierBonusPercent(combo.length + free.length);
    return { modifiers: combo, bonus, expert, adjusted: expert ? expert.median * (1 + bonus / 100) : null };
  });
  const best = measured.filter(entry => entry.adjusted !== null).reduce((top, entry) => !top || entry.adjusted > top.adjusted ? entry : top, null);
  return best ? { ...goldFromReference(best.adjusted), reference: best.adjusted, from: best.modifiers, combos: measured } : { combos: measured };
}

export function calibrateStage(stage, { runs = 24, gold = true } = {}) {
  if (stage.mode === 'puzzle') {
    const solved = solvePuzzle(stage.puzzleIndex, stage.objective);
    if (!solved) return { basis: 'unsolvable', objective: stage.objective };
    return { basis: 'solver', objective: stage.objective, ...puzzleTargets(solved), gold: puzzleGoldTargets(solved), maxPoints: solved.maxPoints, minPoints: solved.minPoints, bestLine: solved.bestLine };
  }
  const objective = calibrateObjective(stage, { runs });
  if (!objective) return { basis: 'unreachable', objective: stage.objective };
  const measured = measure(stage, { runs, objective });
  const expert = expertOf(measured);
  const goldResult = gold && expert ? calibrateGold(stage, objective, { runs, base: expert }) : null;
  if (stage.mode === 'classic') {
    // Classic stages share Classic's targets; the measured gold is kept for comparison.
    const targets = getClassicTargets(stage.level, stage.difficulty);
    const gold = getClassicGoldTargets(stage.level, stage.difficulty);
    return { basis: 'classic', objective, two: targets.twoStars, three: targets.threeStars, provisional: targets.provisional, expert, measured, gold: { two: gold.twoStars, three: gold.threeStars, measured: goldResult } };
  }
  if (!expert) return { basis: 'unfinished', objective, measured };
  // The lift from the best modifier choice sets Classic's gold rule (CLASSIC_GOLD_LIFT).
  const lift = goldResult?.reference ? goldResult.reference / expert.median : null;
  return { basis: 'reference', objective, ...targetsFromMedian(expert.median), expert, measured, gold: goldResult && { ...goldResult, lift } };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const argument = name => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
  const runs = Number(argument('--runs') || 24);
  const only = argument('--stage') ? argument('--stage').split(',').map(value => Number(value) - 1) : null;
  const results = new Map(STAGES.filter(stage => !only || only.includes(stage.index)).map(stage => [stage.index, calibrateStage(stage, { runs, gold: !process.argv.includes('--no-gold') })]));
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(Object.fromEntries([...results].map(([index, result]) => [index + 1, result])), null, 2));
  } else {
    for (const [index, result] of results) {
      const stage = STAGES[index];
      const expert = result.expert ? ` · expert ${result.expert.style} ${Math.round(result.expert.completionRate * 100)}% done, median ${Math.round(result.expert.median)}` : '';
      const gold = result.gold?.three ? ` · gold ★★ ${result.gold.two} · ★★★ ${result.gold.three}${result.gold.from ? ` (best with ${result.gold.from.join(' + ') || 'free modifiers'})` : ''}` : '';
      const blocked = result.gold?.combos?.filter(combo => !combo.expert).map(combo => combo.modifiers.join(' + ')) ?? [];
      console.log(`${String(index + 1).padStart(2, '0')} ${stage.name} (${stage.mode} ${stage.difficulty} ${stage.level}) — ${describeObjective(result.objective, stage.mode)}\n   ${result.basis}: ★★ ${result.two ?? '–'} · ★★★ ${result.three ?? '–'}${result.provisional ? ' (provisional)' : ''}${expert}${gold}${result.bestLine ? ` · best ${result.maxPoints}, worst ${result.minPoints}` : ''}${blocked.length ? `\n   not finished with: ${blocked.join(', ')}` : ''}`);
    }
    const lifts = [...results.values()].map(result => result.gold?.lift).filter(Boolean);
    if (lifts.length) console.log(`Median gold lift across ${lifts.length} calibrated stages: ${median(lifts).toFixed(3)} (CLASSIC_GOLD_LIFT)`);
  }
}
