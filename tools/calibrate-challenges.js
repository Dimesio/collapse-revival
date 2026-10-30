// Measures the weekly rotation with the reference player: each template on
// several weeks' boards, played by every simulated style. Reports how often
// the objective is met and the target a chosen share of runs would reach.
// Usage: node tools/calibrate-challenges.js [--weeks 6] [--runs 1] [--share 0.45] [--json]
import { WEEKLY_ROTATION, challengeConfig, describeChallenge, weeklyChallenge } from '../dist/challenges.js';
import { evaluateObjective, finishRequirement } from '../dist/objectives.js';
import { PUZZLES } from '../dist/puzzles.js';
import { PLAY_STYLES, objectiveTarget } from './calibrate-journey.js';
import { playReference, solvePuzzle } from './reference-player.js';

const WEEK = 7 * 86400000;
const MONDAY_EPOCH = -3 * 86400000;
// An endless Continuous run is cut off here when probing what it can clear.
export const CONTINUOUS_PROBE_MS = 8 * 60000;

const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
};

/** The challenges a template will set over its next `weeks` turns in the rotation. */
export function templateWeeks(templateIndex, weeks, rotation = WEEKLY_ROTATION) {
  return Array.from({ length: weeks }, (_, turn) => {
    const step = templateIndex + turn * rotation.templates.length;
    return weeklyChallenge(MONDAY_EPOCH + (rotation.firstWeek + step) * WEEK + 86400000, rotation);
  });
}

function playAll(challenge, { runs, objective = challenge.objective, stopAtGoal = true }) {
  const open = !stopAtGoal && finishRequirement(challenge.mode) === 'none';
  return PLAY_STYLES.flatMap(style => Array.from({ length: runs }, (_, run) => playReference(challengeConfig(challenge), {
    objective, policy: style.policy, stepMs: style.stepMs, seed: (run + 1) * 7919, stopAtGoal, ...(open ? { maxMs: CONTINUOUS_PROBE_MS } : {}),
  })));
}

/** Completion share and settled points for one template, plus a proposed target unless `propose` is false. */
export function measureTemplate(templateIndex, { weeks = 6, runs = 1, share = 0.45, propose = true, rotation = WEEKLY_ROTATION } = {}) {
  const challenges = templateWeeks(templateIndex, weeks, rotation);
  const [first] = challenges;
  const { name } = rotation.templates[templateIndex];
  const words = describeChallenge(first);
  if (first.mode === 'puzzle') {
    const puzzles = challenges.map(challenge => {
      const solved = solvePuzzle(challenge.puzzleIndex, challenge.objective);
      const limit = PUZZLES[challenge.puzzleIndex].solution.length;
      return { puzzle: PUZZLES[challenge.puzzleIndex].name, solvable: Boolean(solved && solved.minMoves <= limit), minMoves: solved?.minMoves ?? null, limit };
    });
    return { name, mode: first.mode, goal: words.goal, modifiers: words.modifiers, basis: 'solver', puzzles };
  }
  const results = challenges.flatMap(challenge => playAll(challenge, { runs }));
  const completed = results.filter(result => result.status === 'complete');
  let proposed = first.objective;
  const { type } = first.objective;
  if (propose && type !== 'finish') {
    const probe = { type, target: type === 'fewBlocks' ? 0 : 1 };
    const values = challenges.flatMap(challenge => playAll(challenge, { runs, objective: probe, stopAtGoal: false }).map(({ state }) => {
      const evaluation = evaluateObjective(probe, state);
      return evaluation.finished || finishRequirement(challenge.mode) === 'none' ? evaluation.current : null;
    }));
    const target = objectiveTarget(type, values, share);
    proposed = target === null ? null : { type, target };
  }
  return {
    name, mode: first.mode, goal: words.goal, modifiers: words.modifiers, basis: 'reference', runs: results.length,
    completionShare: completed.length / results.length, medianPoints: median(completed.map(result => result.summary.netPoints)), proposed,
  };
}

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const weeks = Number(option('weeks', 6));
  const runs = Number(option('runs', 1));
  const share = Number(option('share', 0.45));
  const report = WEEKLY_ROTATION.templates.map((_, index) => measureTemplate(index, { weeks, runs, share }));
  if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Weekly rotation v${WEEKLY_ROTATION.version}: ${weeks} weeks per template, ${PLAY_STYLES.length} styles, ${runs} run(s) each. Proposed targets reach ${Math.round(share * 100)}% of runs.\n`);
    for (const entry of report) {
      console.log(`${entry.name} · ${entry.mode} · ${entry.goal}${entry.modifiers.length ? ` · ${entry.modifiers.join(', ')}` : ''}`);
      if (entry.basis === 'solver') entry.puzzles.forEach(puzzle => console.log(`  ${puzzle.puzzle}: ${puzzle.solvable ? 'solvable' : 'NOT SOLVABLE'} within ${puzzle.limit} moves (shortest ${puzzle.minMoves})`));
      else console.log(`  completed ${(entry.completionShare * 100).toFixed(0)}% of ${entry.runs} runs · median ${entry.medianPoints?.toLocaleString('en-US') ?? '—'} points · proposed ${entry.proposed ? JSON.stringify(entry.proposed) : 'none'}`);
    }
  }
}
