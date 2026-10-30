// Measures how often each in-play cheer would appear, from repeatable runs of
// simulated play styles in every timed mode, so the thresholds in
// dist/celebrations.js can be tuned before human playtests.
// Usage: node tools/calibrate-cheers.js [--runs 4] [--big 12] [--huge 20] [--mode classic,relapse] [--json]
import { CHEER_RULES, CHEERS, clearSizes, createCheers } from '../dist/celebrations.js';
import { playReference, seededRandom } from './reference-player.js';

export const CHEER_MODES = Object.freeze(['classic', 'strategy', 'continuous', 'countdown', 'relapse', 'slider']);
const DIFFICULTIES = ['easy', 'normal', 'hard'];
// A few of the Journey calibration's play styles, from relaxed to ambitious.
const STYLES = [
  { id: 'casual', policy: { patience: 3 }, stepMs: [700, 1100] },
  { id: 'steady', policy: { patience: 3 } },
  { id: 'careful', policy: { lookahead: true, patience: 3 } },
  { id: 'brisk', policy: { patience: 3, addRows: true } },
  { id: 'ambitious', policy: { lookahead: true, patience: 5, addRows: true } },
];
// Continuous never ends on its own, so each run stops here.
const MAX_MS = 4 * 60000;

const percentile = (values, share) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(share * sorted.length))] : 0;
};

/** One mode's runs: clear sizes, the events each clear earned, and the cheers actually shown. */
export function measureMode(mode, { runs = 4, rules = CHEER_RULES } = {}) {
  const sizes = [];
  const earned = Object.fromEntries(Object.keys(CHEERS).map(type => [type, 0]));
  const shown = { ...earned };
  let clears = 0;
  let runsWithCloseCall = 0;
  let total = 0;
  for (const difficulty of DIFFICULTIES) {
    for (const style of STYLES) {
      for (let run = 0; run < runs; run++) {
        const seed = 1000 * DIFFICULTIES.indexOf(difficulty) + 100 * STYLES.indexOf(style) + run + 1;
        const cheers = createCheers({ random: seededRandom(seed), rules });
        cheers.reset({ best: 0 });
        let closeCall = false;
        playReference({ mode, difficulty, level: 1 + (run % 3) * 3, seed }, {
          policy: style.policy, stepMs: style.stepMs, seed, maxMs: MAX_MS, stopAtGoal: false,
          onStep: state => cheers.watch(state),
          onClear: (state, result) => {
            if (!result.valid) return;
            clears++;
            sizes.push(result.scoring.clearedCount);
            const cheer = cheers.afterClear(state, result);
            if (cheer) {
              shown[cheer.type]++;
              for (const type of [cheer.type, ...cheer.also]) earned[type]++;
              if (cheer.type === 'closeCall') closeCall = true;
            } else if (state.status === 'playing') {
              // A quiet clear may still have earned a big or huge cheer.
              const size = result.scoring.clearedCount;
              const { bigClear, hugeClear } = clearSizes(mode, rules);
              if (size >= hugeClear) earned.huge++;
              else if (size >= bigClear) earned.big++;
            }
            cheers.watch(state);
          },
        });
        total++;
        if (closeCall) runsWithCloseCall++;
      }
    }
  }
  const per100 = counts => Object.fromEntries(Object.entries(counts).map(([type, count]) => [type, Number((count * 100 / Math.max(1, clears)).toFixed(2))]));
  return {
    mode, runs: total, clears,
    sizes: { median: percentile(sizes, 0.5), p90: percentile(sizes, 0.9), p97: percentile(sizes, 0.97), p99: percentile(sizes, 0.99), max: Math.max(0, ...sizes) },
    earnedPer100: per100(earned), shownPer100: per100(shown),
    closeCallRunShare: Number((runsWithCloseCall / Math.max(1, total)).toFixed(2)),
  };
}

function report(result) {
  const { sizes, shownPer100: shown, earnedPer100: earned } = result;
  const line = type => `${type} ${shown[type]}${earned[type] !== shown[type] ? ` (earned ${earned[type]})` : ''}`;
  return `${result.mode.padEnd(10)} ${result.runs} runs · ${result.clears} clears · size median ${sizes.median}, p90 ${sizes.p90}, p97 ${sizes.p97}, p99 ${sizes.p99}, max ${sizes.max}\n  cheers per 100 clears: ${['big', 'huge', 'closeCall', 'sweep', 'doubleSweep'].map(line).join(' · ')}\n  runs with a close-call cheer: ${Math.round(result.closeCallRunShare * 100)}%`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const option = name => { const index = args.indexOf(`--${name}`); return index >= 0 ? args[index + 1] : undefined; };
  // --big and --huge replace the thresholds for every measured mode.
  const sizes = { ...(option('big') && { bigClear: Number(option('big')) }), ...(option('huge') && { hugeClear: Number(option('huge')) }) };
  const rules = { ...CHEER_RULES, ...sizes, modes: Object.keys(sizes).length ? {} : CHEER_RULES.modes };
  const modes = option('mode')?.split(',') ?? CHEER_MODES;
  const results = modes.map(mode => measureMode(mode, { runs: Number(option('runs') ?? 4), rules }));
  if (args.includes('--json')) console.log(JSON.stringify({ rules, results }, null, 2));
  else {
    console.log(`Quiet for ${rules.quietClears} clears or ${rules.quietMs / 1000}s after a cheer`);
    for (const result of results) {
      const { bigClear, hugeClear } = clearSizes(result.mode, rules);
      console.log(`${report(result)}\n  big ${bigClear}+ · huge ${hugeClear}+`);
    }
  }
}
