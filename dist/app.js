import { MODES, ROWS, COLS, SCORING_RULES, URGENCY_RULES, LEVEL_ONE_MODES, freePlayLevel, powerupAvailable, boostsAllowed, createGame, clearAt, previewClear, advanceTime, addRow, nextLevel, getGroup, getHint, countBlocks, usePowerup, finalizeRound, roundPoints, hintsAllowed, undoAllowed } from './engine.js';
import { PUZZLES, PUZZLE_SETS } from './puzzles.js';
import { puzzleStarTargets, puzzleStarGoldTargets, puzzleStars, moveLimitText } from './puzzle-stars.js';
import { createPuzzleProgress } from './puzzle-progress.js';
import { puzzleHint } from './puzzle-hints.js';
import { createJourney, starText, ITEMS } from './journey.js';
import { finishRequirement, describeObjective } from './objectives.js';
import { createRoundTally } from './round-tally.js';
import { getBlockDanger } from './block-danger.js';
import { cellAtPoint } from './board-hit.js';
import { getClassicTargets, getClassicGoldTargets } from './classic-stars.js';
import { createClassicProgress } from './classic-progress.js';
import { modifiersForMode } from './modifiers.js';
import { goldUnlocked, goldResult, modifierNames } from './gold.js';
import { openGoldPicker, goldGoals, goldBestLine } from './gold-picker.js';
import { createCheers } from './celebrations.js';
import { challengeConfig, challengeResult, createChallengeStore, describeChallenge, shareText } from './challenges.js';
import { createChallengePanel, bestLine as challengeBestLine, timeLeft } from './challenge-panel.js';

const $ = (id) => document.getElementById(id);
const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const symbols = { classic: '▦', strategy: '⌘', puzzle: '◇', relapse: '↕', continuous: '∞', countdown: '◷', slider: '⇄' };
const taglines = { classic: 'The original', strategy: 'Make every move count', puzzle: 'Take your time', relapse: 'Both sides now', continuous: 'One endless good time', countdown: 'Beat the clock', slider: 'A little twist' };
const labels = { classic: 'THE ORIGINAL', strategy: 'ON YOUR TERMS', puzzle: 'A LITTLE BRAINTEASER', relapse: 'DOUBLE THE FUN', continuous: 'NO FINISH LINE', countdown: 'TWO MINUTES', slider: 'STAY ON YOUR TOES' };
const colors = ['#ef765c', '#e8bd53', '#66baa8', '#839cd7', '#b598df'];
const colorNames = ['coral', 'gold', 'mint', 'blue', 'lavender'];
const cellLabel = (cell) => ({ bomb: 'black blast bomb', colorBomb: `${colorNames[cell.color]} color bomb`, gravity: 'Relapse gravity block', stone: 'gray stone block', anchor: 'gray anchor block' }[cell.kind] || `${colorNames[cell.color]} block`);
const storage = {
  get(key, fallback) { try { return JSON.parse(localStorage.getItem(`collapse:${key}`)) ?? fallback; } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem(`collapse:${key}`, JSON.stringify(value)); } catch { /* Private browser storage can be unavailable. */ } },
};
let preferences = storage.get('preferences', { mode: 'classic', difficulty: 'easy', sound: true, level: 1, puzzleIndex: 0 });
let records = storage.get('records', {});
const classicProgress = createClassicProgress(storage);
let roundId;
let lastStarGoals = '';
let lastJourneyGoals = '';
let state;
let audioContext;
let nextCountdownTick = null;
let focused = { col: 5, row: 12 };
let highlighted = new Set();
let highlightedCount = 0;
let previewTarget = null;
let receiptKey = '';
let celebrationTimeout;
let floatScoreTimeout;
let cheerTimeout;
let lastOverlayKey = '';
let lastFrame = performance.now();
let lastStats = 0;
let toastTimeout;
let autoPaused = false;
let detailsPaused = false;
let lastTouchUp = -Infinity;
let recorded = false;
// The decided Journey stage for this round: a completion with stars, or a miss.
let journeyResult = null;
let journeyGoalMet = false;
let runWasJourney = false;
// A Classic gold run: its level, difficulty and modifiers, then its settled result.
// A gold run outside the Journey, on a Classic level or a puzzle.
let freeGold = null;
let freeGoldResult = null;
const puzzleProgress = createPuzzleProgress(storage);
let puzzleResult = null;
// Each press of the hint goes one layer deeper for the same position.
let hintLayer = { key: '', level: 0 };
let hintAreaTimeout;
// Cheers for big moments in play. The run's best is the mode record from before the run began.
const cheers = createCheers();
let runBest = 0;
let bestRibbonShown = false;
// A weekly or shared challenge in play: { challenge, code, name, week }, then its decided result.
// A challenge keeps its own records and never changes the regular ones.
const challengeStore = createChallengeStore(storage);
const challengePanel = createChallengePanel({ openModal, store: challengeStore, onPlay: launchChallenge, copy: copyText, linkFor: challengeLink });
let challengeRun = null;
let challengeOutcome = null;
let challengeBest = null;
let challengeGoalMet = false;
let lastChallengeGoals = '';
const elements = new Map();
const roundTally = createRoundTally({
  container: $('board-overlay'),
  getBlockElements: () => [...elements.values()],
  playTick: () => tone('tick'),
  onScoreChange: value => {
    $('score').textContent = value.toLocaleString('en-US', { minimumIntegerDigits: 4, useGrouping: false });
  },
  onFinish: (summary, { highlight } = {}) => {
    renderStats();
    if (highlight) { tone('best'); celebrateOverCard(); }
    else if (state.status !== 'gameOver') tone('complete');
  },
});
const journey = createJourney({
  openModal,
  toast,
  launch(config) {
    autoPaused = false;
    $('modal').close();
    $('difficulty').value = config.difficulty;
    $('puzzle-select').value = config.puzzleIndex || 0;
    history = [];
    // The ready overlay shows the stage's objective and star targets before play.
    runWasJourney = true;
    challengeRun = null;
    freshGame(config.mode, config);
    showScreen('game');
  },
  usePowerup(type) {
    const wasPaused = state.status === 'paused';
    if (wasPaused && autoPaused) state.status = 'playing';
    const result = usePowerup(state, type);
    if (!result.valid) { if (wasPaused) state.status = 'paused'; toast(result.message || 'Start a game to use this boost.'); return false; }
    autoPaused = false;
    $('modal').close();
    clearSelection();
    if (result.removed.length) removalEffects(result);
    scoreFeedback(result);
    toast(result.message);
    recordScore();
    render(); checkEnd();
    return true;
  },
});

$('mode-list').innerHTML = MODES.map((mode, i) => `${i === 4 ? '<div class="mode-break">A FEW MORE FAVORITES</div>' : ''}<button class="mode-button" data-mode="${mode.id}" aria-pressed="false"><span class="mode-symbol">${symbols[mode.id]}</span><span class="mode-copy"><strong>${mode.name}</strong><small>${taglines[mode.id]}</small></span><span class="mode-arrow">↗</span></button>`).join('');
$('start-level').innerHTML = Array.from({ length: 10 }, (_, i) => `<option value="${i + 1}">${String(i + 1).padStart(2, '0')}</option>`).join('');
/** Puzzles grouped by set, each with its best stars. */
function renderPuzzleOptions() {
  const selected = $('puzzle-select').value || preferences.puzzleIndex;
  $('puzzle-select').innerHTML = PUZZLE_SETS.map(set => `<optgroup label="${set.name}">${PUZZLES.map((puzzle, i) => (puzzle.set ?? 'collection') === set.id ? `<option value="${i}">${String(i + 1).padStart(2, '0')} · ${puzzle.name}${puzzleProgress.best(puzzle.name).stars ? ` ${starText(puzzleProgress.best(puzzle.name).stars)}` : ''}</option>` : '').join('')}</optgroup>`).join('');
  $('puzzle-select').value = selected;
}
renderPuzzleOptions();
$('difficulty').value = preferences.difficulty;
$('start-level').value = preferences.level;
$('puzzle-select').value = preferences.puzzleIndex;
$('board').tabIndex = 0;

/** The Journey card above the mode list: the next stage and stars so far, marked while a stage is in play. */
function renderJourneyEntry() {
  const { total, stars, next } = journey.progress();
  $('journey-entry-progress').textContent = `${next ? `Next: ${next.name}` : `All ${total} stages cleared`}${stars ? ` · ★ ${stars}` : ''}`;
  $('journey-entry').classList.toggle('selected', runWasJourney);
}

function freshGame(mode = state?.mode || preferences.mode, overrides = {}) {
  roundTally.cancel();
  $('particles').replaceChildren();
  $('confetti').replaceChildren();
  preferences = { ...preferences, mode, difficulty: $('difficulty').value, puzzleIndex: Number($('puzzle-select').value) };
  storage.set('preferences', preferences);
  state = createGame({ ...preferences, level: freePlayLevel(mode, preferences.level), ...overrides, seed: overrides.seed ?? Date.now() });
  challengeBest = challengeRun ? challengeStore.entry(challengeRun.code)?.best ?? null : null;
  // Puzzle records mix every puzzle, so a puzzle has no personal best to pass. A challenge passes its own completed best.
  runBest = challengeRun ? challengeBest?.completed ? challengeBest.points : 0 : state.mode === 'puzzle' ? 0 : records[`${state.mode}:${state.difficulty}`]?.score || 0;
  bestRibbonShown = false;
  cheers.reset({ best: runBest });
  freeGold = !runWasJourney && !challengeRun && ['classic', 'puzzle'].includes(state.mode) && state.modifiers.length ? { mode: state.mode, level: state.level, difficulty: state.difficulty, puzzleIndex: state.puzzleIndex, modifiers: state.modifiers } : null;
  freeGoldResult = null;
  puzzleResult = null;
  hideHintArea();
  roundId = crypto.randomUUID();
  lastStarGoals = '';
  lastJourneyGoals = '';
  nextCountdownTick = null;
  recorded = false;
  journeyResult = null;
  journeyGoalMet = false;
  challengeOutcome = null;
  challengeGoalMet = false;
  lastChallengeGoals = '';
  focused = { col: 5, row: 12 };
  clearSelection();
  receiptKey = '';
  clearTimeout(celebrationTimeout);
  clearTimeout(floatScoreTimeout);
  clearTimeout(cheerTimeout);
  $('clear-celebration').classList.remove('show');
  $('clear-celebration').textContent = '';
  $('float-score').classList.remove('show');
  $('cheer').classList.remove('show');
  $('selection-label').textContent = 'Find a group of 3 or more';
  lastOverlayKey = '';
  for (const element of elements.values()) element.remove();
  elements.clear();
  document.querySelectorAll('.mode-button').forEach(button => { const selected = !runWasJourney && !challengeRun && button.dataset.mode === state.mode; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected); });
  renderJourneyEntry();
  renderChallengeEntry();
  $('game-mode-name').textContent = MODES.find(mode => mode.id === state.mode).name;
  $('mode-help').textContent = MODES.find(mode => mode.id === state.mode).description;
  $('puzzle-label').hidden = state.mode !== 'puzzle';
  $('start-level-label').hidden = state.mode === 'puzzle';
  // The selector is a debug aid: Classic and Relapse always begin at level 1, so it shows the run's level, locked.
  const levelLocked = LEVEL_ONE_MODES.includes(state.mode);
  $('start-level').value = state.level;
  $('start-level').disabled = levelLocked;
  $('start-level').title = levelLocked ? `${MODES.find(item => item.id === state.mode).name} always starts at level 1.` : '';
  $('difficulty').disabled = state.mode === 'puzzle';
  updateSoundButton();
  render();
}

function startGame() {
  if (challengeRun && state.status === 'ready') challengeStore.begin(challengeRun.code, { name: challengeRun.name, week: challengeRun.week?.id });
  state.status = 'playing';
  lastFrame = performance.now();
  tone('start');
  render();
  $('board').focus({ preventScroll: true });
}

// Each cheer has its own short phrase: rising for clears, a sigh and lift for a close call.
const CHEER_NOTES = { big: [659, 880], huge: [523, 784, 1047, 1319], sweep: [523, 659, 784, 1047, 1319], doubleSweep: [523, 659, 784, 1047, 1319, 1568], closeCall: [587, 440, 659], best: [784, 1047, 1319, 1568, 2093] };

function tone(type, size = 3, delay = 0) {
  if (!preferences.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    const start = audioContext.currentTime + delay;
    const tick = type === 'tick';
    const notes = tick ? [1000] : CHEER_NOTES[type] ?? (type === 'start' ? [392, 494, 587] : type === 'complete' ? [523, 659, 784, 1047] : type === 'bomb' ? [100, 65] : type === 'row' ? [180] : [300 + Math.min(size, 20) * 22, 480 + Math.min(size, 20) * 22]);
    notes.forEach((frequency, i) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = tick || type === 'bomb' || type === 'huge' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, start + i * .065);
      gain.gain.setValueAtTime(0, start + i * .065);
      gain.gain.linearRampToValueAtTime(tick ? .03 : .065, start + i * .065 + (tick ? .002 : .008));
      gain.gain.exponentialRampToValueAtTime(.001, start + i * .065 + (tick ? .035 : .16));
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(start + i * .065); oscillator.stop(start + i * .065 + (tick ? .045 : .18));
    });
  } catch { /* Sound is optional. */ }
}

function updateCountdownTick() {
  const remaining = state.phase === 'bonus' ? state.bonusRemaining : state.mode === 'countdown' ? state.timeLeft : 0;
  if (!preferences.sound || document.hidden || state.status !== 'playing' || remaining <= 0 || remaining > URGENCY_RULES.windowMs) {
    nextCountdownTick = null;
    return;
  }
  if (nextCountdownTick === null || state.elapsed >= nextCountdownTick) {
    tone('tick');
    // Follow the game clock, playing at most one tick per frame after a delay.
    const interval = 500 + 500 * remaining / URGENCY_RULES.windowMs;
    nextCountdownTick = state.elapsed + interval;
  }
}

function toast(message) {
  if (!message) return;
  clearTimeout(toastTimeout);
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  toastTimeout = setTimeout(() => $('toast').classList.remove('visible'), 2600);
}

const soundLabel = () => `${icon(preferences.sound ? 'sound' : 'mute')} Sound ${preferences.sound ? 'on' : 'off'}`;
function updateSoundButton() {
  const pauseToggle = $('board-overlay').querySelector('[data-action="sound"]');
  if (pauseToggle) pauseToggle.innerHTML = soundLabel();
  $('sound-button').innerHTML = icon(preferences.sound ? 'sound' : 'mute');
  $('sound-button').setAttribute('aria-label', `Turn sound ${preferences.sound ? 'off' : 'on'}`);
  $('sound-button').setAttribute('aria-pressed', String(preferences.sound));
}

function recordScore() {
  // Only settled scores qualify: the board penalty is still pending during play. A challenge keeps its own records.
  if (challengeRun || !state.roundSummary || state.score <= 0) return;
  const key = `${state.mode}:${state.difficulty}`;
  if (state.score > (records[key]?.score || 0)) {
    records[key] = { score: state.score, level: state.level, date: new Date().toISOString() };
    storage.set('records', records);
  }
}

function renderBoard() {
  const activeIds = new Set();
  const dangerLevels = getBlockDanger(state);
  cheers.watch(state, Math.max(0, ...dangerLevels.values()));
  state.board.forEach((row, y) => row.forEach((cell, x) => {
    if (!cell) return;
    activeIds.add(cell.id);
    let element = elements.get(cell.id);
    if (!element) {
      element = document.createElement('button');
      element.type = 'button';
      element.tabIndex = -1;
      elements.set(cell.id, element);
      $('board').append(element);
    }
    const selected = highlighted.has(cell.id);
    const valuable = selected && cell.kind === 'normal' && highlightedCount >= SCORING_RULES.rockThreshold;
    const dangerLevel = dangerLevels.get(cell.id) || 0;
    const hinted = element.classList.contains('hinted');
    const invalid = element.classList.contains('invalid');
    element.className = `block c${cell.color} ${cell.kind}${selected ? ' highlighted' : ''}${valuable ? ' valuable-group' : ''}${valuable && highlightedCount >= SCORING_RULES.strongRockThreshold ? ' valuable-strong' : ''}${dangerLevel ? ` danger-shake-${dangerLevel}` : ''}${hinted ? ' hinted' : ''}${invalid ? ' invalid' : ''}${$('board') === document.activeElement && focused.col === x && focused.row === y ? ' selected-key' : ''}`;
    if (dangerLevel) {
      element.dataset.dangerLevel = dangerLevel;
      element.style.setProperty('--danger-delay', `${-(cell.id % 7) * .037}s`);
    } else {
      delete element.dataset.dangerLevel;
      element.style.removeProperty('--danger-delay');
    }
    element.style.left = `${x * 100 / COLS}%`;
    element.style.top = `${y * 100 / ROWS}%`;
    element.dataset.col = x;
    element.dataset.row = y;
    element.setAttribute('aria-label', `${cellLabel(cell)}, column ${x + 1}, row ${y + 1}`);
  }));
  for (const [id, element] of elements) {
    if (!activeIds.has(id)) {
      element.classList.remove('highlighted', 'valuable-group', 'valuable-strong', 'hinted', 'invalid');
      element.classList.remove('danger-shake-1', 'danger-shake-2', 'danger-shake-3', 'danger-shake-4');
      delete element.dataset.dangerLevel;
      element.classList.add('removing');
      setTimeout(() => element.remove(), 190);
      elements.delete(id);
    }
  }
  $('board').parentElement.classList.toggle('danger', dangerLevels.size > 0);
  $('next-row').innerHTML = state.nextRow.map(cell => `<i class="preview-block c${cell.color} ${cell.kind}" role="img" aria-label="${cellLabel(cell)}" title="${cellLabel(cell)}"></i>`).join('');
}

function renderOverlay() {
  const key = `${state.status}:${state.mode}:${state.level}:${state.puzzleIndex}`;
  if (key === lastOverlayKey) return;
  lastOverlayKey = key;
  const mode = MODES.find(item => item.id === state.mode);
  let content = '';
  const briefing = state.status === 'ready' && runWasJourney ? journey.runInfo(state) : null;
  if (state.status === 'ready' && challengeRun) {
    content = challengeBriefing();
  } else if (briefing) {
    content = journeyBriefing(briefing);
  } else if (state.status === 'ready' && freeGold) {
    content = freeGoldBriefing();
  } else if (state.status === 'ready' && state.mode === 'puzzle') {
    content = puzzleBriefing();
  } else if (state.status === 'ready') {
    content = `<div class="overlay-art"><i class="c2"></i><i class="c1"></i><i class="c0"></i></div><div class="eyebrow">A LITTLE NOSTALGIA. A LOT OF FUN.</div><h2>${state.mode === 'puzzle' ? state.puzzleName : 'Ready when you are.'}</h2><p>${state.mode === 'puzzle' ? 'A little patience. A little planning.<br>Leave no block behind.' : mode.description}</p><button class="primary-button" data-action="start">${icon('play')} Let’s play</button><button class="secondary-button" data-action="help">How does it work?</button>`;
  } else if (state.status === 'paused') {
    content = `<div class="overlay-art"><i class="c4"></i><i class="c4"></i></div><div class="eyebrow">TAKE YOUR TIME</div><h2>A little breather.</h2><p>Your blocks will be right here.<br>Pick up exactly where you left off.</p><button class="primary-button" data-action="resume">${icon('play')} Back to the game</button><div class="pause-actions"><button class="secondary-button" data-action="restart-run">${icon('restart')} Restart</button><button class="secondary-button" data-action="sound">${soundLabel()}</button><button class="secondary-button" data-action="help">${icon('help')} How to play</button><button class="secondary-button" data-action="home">${icon('home')} Home</button></div>`;
  } else if (['gameOver', 'levelComplete', 'won'].includes(state.status)) {
    const puzzle = state.mode === 'puzzle';
    if (challengeOutcome) { showChallengeResult(); return; }
    if (journeyResult) { showJourneyResult(journeyResult, puzzle); return; }
    if (freeGoldResult) { showFreeGoldResult(); return; }
    if (puzzleResult) { showPuzzleResult(); return; }
    const failed = state.status === 'gameOver';
    const action = failed ? runWasJourney ? 'journey' : 'restart' : state.status === 'won' && !puzzle ? 'restart' : 'next';
    const actionLabel = action === 'journey' ? 'Back to your journey' : failed ? LEVEL_ONE_MODES.includes(state.mode) && state.level > 1 ? 'Start again from level 1' : 'Give it another go' : puzzle ? 'Next puzzle' : action === 'restart' ? 'Play again' : 'On to the next level';
    showTally({
      eyebrow: failed ? 'THERE’S ALWAYS ONE MORE GAME' : 'NICELY DONE',
      title: failed ? puzzle ? 'So close.' : 'A good run.' : puzzle ? 'A clean sweep!' : state.status === 'won' ? 'Time well spent.' : `Level ${state.level}. Collapsed.`,
      message: failed && puzzle ? 'Try a different order next time.' : 'Let’s count every last point.',
      actions: `<button class="primary-button" data-action="${action}">${icon(failed ? 'restart' : 'play')} ${actionLabel}</button>${failed && undoAllowed(state) ? '<button class="secondary-button" data-action="undo">Undo the last move</button>' : ''}`,
    });
    return;
  }
  roundTally.cancel();
  $('board-overlay').innerHTML = content ? `<div class="overlay-card">${content}</div>` : '';
}

/** The first settled round of a run that beats the best from before the run gets a ribbon; a challenge compares completions. */
function bestHighlight() {
  if (bestRibbonShown) return null;
  if (challengeRun) {
    const { completed, improved, previous, points } = challengeOutcome ?? {};
    if (!completed || !improved || !previous?.completed) return null;
    bestRibbonShown = true;
    return { title: 'New challenge best!', detail: `${points.toLocaleString()} · up from ${previous.points.toLocaleString()}` };
  }
  const total = state.roundSummary?.totalScore ?? 0;
  if (runBest <= 0 || total <= runBest) return null;
  bestRibbonShown = true;
  return { title: 'New personal best!', detail: `${total.toLocaleString()} · up from ${runBest.toLocaleString()}` };
}
const showTally = options => roundTally.show(state.roundSummary, { ...options, highlight: bestHighlight() });

const starGoals = (targets, first = 'Objective') => `<span class="nowrap">★ ${first}</span> · <span class="nowrap">★★ ${targets.two.toLocaleString()}</span> · <span class="nowrap">★★★ ${targets.three.toLocaleString()} points</span>`;
const bestLine = best => best?.stars ? `Your best: ${starText(best.stars)} · ${best.score.toLocaleString()} points` : 'No stars yet. Every finish earns one.';
const puzzleNumber = index => String(index + 1).padStart(2, '0');

const goldChallenges = gold => `<p class="gold-brief-challenges">✦ ${modifierNames(gold.modifiers).join(' · ')}${gold.bonus ? ` · +${gold.bonus}% gold bonus` : ''}</p>`;
/** Gold targets for the free-play gold run in progress: a Classic level or a puzzle. */
const goldTargets = () => {
  if (state.mode === 'puzzle') return puzzleStarGoldTargets(PUZZLES[state.puzzleIndex]);
  const targets = getClassicGoldTargets(state.level, state.difficulty);
  return { two: targets.twoStars, three: targets.threeStars };
};
const goldPointsLine = gold => `Gold points: <b>${gold.adjusted.toLocaleString()}</b>${gold.bonus ? ` (${gold.points.toLocaleString()} + ${gold.bonus}%)` : ''}`;

function journeyBriefing(info) {
  const mode = MODES.find(item => item.id === info.stage.mode);
  const { gold } = info;
  const stars = gold
    ? `${goldChallenges(gold)}<p class="journey-brief-stars is-gold">${goldGoals(gold.targets)}</p><p class="journey-brief-best">${goldBestLine(info.goldBest)}</p>`
    : `<p class="journey-brief-stars">${starGoals(info.targets)}${info.targets.provisional ? '<small>Playtest targets · still being tuned</small>' : ''}</p><p class="journey-brief-best">${bestLine(info.best)}</p>`;
  return `<div class="eyebrow">JOURNEY ${info.number} · ${gold ? 'GOLD RUN' : mode.name.toUpperCase()}</div><h2>${info.stage.name}</h2><p class="journey-brief-goal">${info.goal}</p>${stars}<button class="primary-button" data-action="start">${icon('play')} Let’s play</button>${gold ? '<div class="gold-brief-links"><button class="secondary-button" data-action="gold-pick">Change challenges</button><button class="secondary-button" data-action="journey">Back to your journey</button></div>' : '<button class="secondary-button" data-action="journey">Back to your journey</button>'}`;
}

const challengeKicker = () => challengeRun.week ? `WEEKLY CHALLENGE · ${challengeRun.week.id}` : 'SHARED CHALLENGE';
const challengeRules = words => `${escapeHtml(words.setup)}${words.modifiers.length ? ` · ${words.modifiers.join(' · ')}` : ''}`;

/** The ready card for a challenge: its objective, setup, rules and your best for this exact challenge. */
function challengeBriefing() {
  const words = describeChallenge(challengeRun.challenge);
  return `<div class="eyebrow">${challengeKicker()}</div><h2>${escapeHtml(challengeRun.name || 'A shared challenge')}</h2><p class="journey-brief-goal">${words.goal}</p><p class="challenge-brief-rules">${challengeRules(words)}</p><p class="journey-brief-best">${escapeHtml(challengeBestLine(challengeStore.entry(challengeRun.code)))}</p><button class="primary-button" data-action="start">${icon('play')} Let’s play</button><button class="secondary-button" data-action="challenges">Back to challenges</button>`;
}

/** The round tally for a decided challenge: your result, then copy it, try again, or go back. */
function showChallengeResult() {
  const outcome = challengeOutcome;
  const words = describeChallenge(challengeRun.challenge);
  const progress = outcome.progress ? ` ${outcome.progress}.` : '';
  const undoButton = state.mode === 'puzzle' && undoAllowed(state) ? '<button class="secondary-button" data-action="undo">Undo the last move</button>' : '';
  showTally({
    eyebrow: outcome.completed ? `${challengeKicker()} · COMPLETE` : 'THERE’S ALWAYS ONE MORE GAME',
    title: outcome.completed ? 'Challenge complete!' : 'So close.',
    message: outcome.completed ? `${challengeBestLine(outcome.entry)} Copy your result to compare.` : `Objective missed: ${words.goal}.${state.status === 'gameOver' ? '' : progress}`,
    stars: false,
    actions: outcome.completed
      ? `<button class="primary-button" data-action="challenge-copy">${icon('star')} Copy your result</button><button class="secondary-button" data-action="challenge-retry">Try again</button><button class="secondary-button" data-action="challenges">Back to challenges</button>`
      : `<button class="primary-button" data-action="challenge-retry">${icon('restart')} Try again</button>${undoButton}<button class="secondary-button" data-action="challenge-copy">Copy your result</button><button class="secondary-button" data-action="challenges">Back to challenges</button>`,
  });
}

/** Starts a weekly or shared challenge at its ready card. */
function launchChallenge(entry) {
  autoPaused = false;
  $('modal').close();
  recordScore();
  journey.abandonRun();
  runWasJourney = false;
  history = [];
  challengeRun = entry;
  const config = challengeConfig(entry.challenge);
  if (config.mode === 'puzzle') $('puzzle-select').value = config.puzzleIndex;
  else $('difficulty').value = config.difficulty;
  freshGame(config.mode, config);
  showScreen('game');
}

/** Judges and saves a decided challenge. Undo can reopen a missed puzzle, which then decides again. */
function settleChallenge() {
  const result = challengeResult(challengeRun.challenge, state);
  challengeOutcome = { ...result, ...challengeStore.finish(challengeRun.code, result, roundId) };
  challengeBest = challengeOutcome.best;
  renderChallengeEntry();
  lastOverlayKey = '';
}

function challengeLink(code) {
  return `${location.origin}${location.pathname}#challenge=${code}`;
}

/** Copies text for the player, or shows it ready to copy when the browser won't allow it. Resolves true once copied. */
async function copyText(text, done) {
  try {
    await navigator.clipboard.writeText(text);
    toast(done);
    return true;
  } catch {
    const root = openModal('COPY IT YOURSELF', '<h2>Ready to copy.</h2><textarea class="feedback-area ch-copy-area" readonly aria-label="Text to copy"></textarea><p class="modal-note">Your browser didn’t allow automatic copying. Select the text and copy it.</p>');
    const area = root.querySelector('textarea');
    area.value = text;
    area.focus();
    area.select();
    return false;
  }
}

/** The weekly card under the Journey: its name, time left and your best, marked while a challenge is in play. */
function renderChallengeEntry() {
  const weekly = challengePanel.weekly();
  const best = challengeStore.entry(weekly.code)?.best;
  $('challenge-entry-kicker').textContent = `WEEKLY · ${timeLeft(weekly.week.end).toUpperCase()}`;
  $('challenge-entry-name').textContent = weekly.name;
  $('challenge-entry-progress').textContent = best?.completed ? `Your best: ✓ ${best.points.toLocaleString()} points` : describeChallenge(weekly.challenge).goal;
  $('challenge-entry').classList.toggle('selected', challengeRun?.code === weekly.code);
}

/** A challenge link opens its challenge, ready to play. The address is tidied so a reload doesn't reopen it. */
function openChallengeLink() {
  if (!/challenge=/i.test(location.hash)) return;
  const text = location.hash;
  window.history.replaceState(null, '', `${location.pathname}${location.search}`);
  challengePanel.openCode(text);
}

const goldRunName = () => state.mode === 'puzzle' ? `PUZZLE GOLD RUN · ${puzzleNumber(state.puzzleIndex)} · ${state.puzzleName.toUpperCase()}` : `CLASSIC GOLD RUN · LEVEL ${String(state.level).padStart(2, '0')} · ${state.difficulty.toUpperCase()}`;
const freeGoldBest = () => state.mode === 'puzzle' ? puzzleProgress.goldBest(state.puzzleName) : classicProgress.goldBest(state.level, state.difficulty);
const regularPlayLabel = () => state.mode === 'puzzle' ? 'Back to regular puzzles' : 'Back to regular Classic';

function freeGoldBriefing() {
  const gold = goldResult({ completed: false, points: 0, modifiers: state.modifiers, targets: goldTargets() });
  return `<div class="eyebrow">${goldRunName()}</div><h2>Go for gold.</h2><p class="journey-brief-goal">${describeObjective({ type: 'finish' }, state.mode)}</p>${goldChallenges(gold)}<p class="journey-brief-stars is-gold">${goldGoals(gold.targets)}</p><p class="journey-brief-best">${goldBestLine(freeGoldBest())}</p><button class="primary-button" data-action="start">${icon('play')} Let’s play</button><div class="gold-brief-links"><button class="secondary-button" data-action="gold-pick">Change challenges</button><button class="secondary-button" data-action="gold-cancel">${regularPlayLabel()}</button></div>`;
}

/** The ready card for a free-play puzzle: its set, its lesson if it has one, and its stars. */
function puzzleBriefing() {
  const puzzle = PUZZLES[state.puzzleIndex];
  const set = PUZZLE_SETS.find(item => item.id === (puzzle.set ?? 'collection'));
  const lessons = PUZZLES.filter(item => item.set === puzzle.set && item.lesson);
  const intro = puzzle.lesson
    ? `<p class="puzzle-lesson"><b>Lesson ${lessons.indexOf(puzzle) + 1} of ${lessons.length} · ${puzzle.lesson.title}</b>${puzzle.lesson.idea}</p>`
    : '<div class="overlay-art"><i class="c2"></i><i class="c1"></i><i class="c0"></i></div><p>A little patience. A little planning.<br>Leave no block behind.</p>';
  return `<div class="eyebrow">PUZZLE ${puzzleNumber(state.puzzleIndex)} · ${set.name.toUpperCase()}</div><h2>${puzzle.name}</h2>${intro}<p class="journey-brief-stars">${starGoals(puzzleStarTargets(puzzle), 'Clear it')}</p><p class="journey-brief-best">${bestLine(puzzleProgress.best(puzzle.name))}</p><button class="primary-button" data-action="start">${icon('play')} Let’s play</button><button class="secondary-button" data-action="help">How does it work?</button>`;
}

/** The round tally's star section for a gold run. */
function goldStarResult(gold, { complete, newBest }) {
  const next = gold.stars < 2 ? gold.targets.two : gold.targets.three;
  return {
    count: gold.stars, label: 'gold stars', tone: 'gold',
    message: !complete ? 'Meet the objective to earn gold stars.' : gold.stars === 3 ? 'Three gold stars!' : `Next gold star: ${next.toLocaleString()} gold points · ${(next - gold.adjusted).toLocaleString()} to go`,
    note: `${gold.adjusted.toLocaleString()} gold points${gold.bonus ? ` (${gold.points.toLocaleString()} + ${gold.bonus}%)` : ''}${newBest ? ' · A new gold best!' : ''}`,
  };
}

/** The round tally for a decided Journey stage: stars for a completion, retry options for a miss. */
function showJourneyResult(result, puzzle) {
  const { complete, stars, points, targets, gold } = result;
  const progress = result.progress ? ` ${result.progress}.` : '';
  const missed = `Objective missed: ${result.goal}.${state.status === 'gameOver' ? '' : progress}`;
  const undoButton = puzzle && undoAllowed(state) ? '<button class="secondary-button" data-action="undo">Undo the last move</button>' : '';
  if (gold) {
    showTally({
      eyebrow: complete ? `JOURNEY ${result.number} · GOLD RUN COMPLETE` : 'THERE’S ALWAYS ONE MORE GAME',
      title: complete ? gold.stars === 3 ? 'Pure gold!' : 'Gold run complete!' : 'So close.',
      message: complete ? 'Your gold record is saved on this device.' : missed,
      stars: goldStarResult(gold, { complete, newBest: complete && result.newGoldBest && Boolean(result.previousGold) }),
      actions: complete
        ? `<button class="primary-button" data-action="journey">${icon('play')} Back to your journey</button>${gold.stars < 3 ? '<button class="secondary-button" data-action="replay">Go for gold again</button>' : ''}<button class="secondary-button" data-action="gold-pick">Change challenges</button>`
        : `<button class="primary-button" data-action="replay">${icon('restart')} Try the gold run again</button>${undoButton}<button class="secondary-button" data-action="gold-pick">Change challenges</button><button class="secondary-button" data-action="journey">Back to your journey</button>`,
    });
    return;
  }
  const next = stars < 2 ? targets.two : targets.three;
  const starMessage = !complete ? 'Meet the objective to earn stars.' : stars === 3 ? 'Three stars!' : `Next star: ${next.toLocaleString()} points · ${(next - points).toLocaleString()} to go`;
  showTally({
    eyebrow: complete ? `JOURNEY ${result.number} · OBJECTIVE COMPLETE` : 'THERE’S ALWAYS ONE MORE GAME',
    title: complete ? 'One step further!' : 'So close.',
    message: complete ? 'Your coins and next stop are waiting.' : missed,
    stars: { count: stars, label: 'Journey stars', message: starMessage, note: complete && result.moreStars && result.previousBest ? 'A new best for this stage!' : targets.provisional ? 'Playtest targets · still being tuned' : '' },
    actions: complete
      ? `<button class="primary-button" data-action="journey">${icon('play')} Back to your journey</button>${stars < 3 ? '<button class="secondary-button" data-action="replay">Play it again for more stars</button>' : ''}`
      : `<button class="primary-button" data-action="replay">${icon('restart')} Try the stage again</button>${undoButton}<button class="secondary-button" data-action="journey">Back to your journey</button>`,
  });
}

function showFreeGoldResult() {
  const gold = freeGoldResult;
  const complete = state.status !== 'gameOver';
  const puzzle = state.mode === 'puzzle';
  showTally({
    eyebrow: complete ? goldRunName() : 'THERE’S ALWAYS ONE MORE GAME',
    title: complete ? gold.stars === 3 ? 'Pure gold!' : 'Gold run complete!' : puzzle ? 'So close.' : 'A good run.',
    message: complete ? 'Your gold record is saved on this device.' : puzzle ? state.message || 'Try a different order next time.' : 'Let’s count every last point.',
    stars: goldStarResult(gold, { complete, newBest: gold.improved && Boolean(gold.previous) }),
    actions: `<button class="primary-button" data-action="gold-retry">${icon('restart')} Go for gold again</button>${!complete && undoAllowed(state) ? '<button class="secondary-button" data-action="undo">Undo the last move</button>' : ''}<button class="secondary-button" data-action="gold-pick">Change challenges</button><button class="secondary-button" data-action="gold-cancel">${regularPlayLabel()}</button>`,
  });
}

/** The round tally for a free-play puzzle, with its stars. */
function showPuzzleResult() {
  const { stars, points, targets, previous, improved } = puzzleResult;
  const cleared = state.status === 'won';
  const next = stars < 2 ? targets.two : targets.three;
  showTally({
    eyebrow: cleared ? `PUZZLE ${puzzleNumber(state.puzzleIndex)} · CLEARED` : 'THERE’S ALWAYS ONE MORE GAME',
    title: cleared ? 'A clean sweep!' : 'So close.',
    message: cleared ? 'Let’s count every last point.' : 'Try a different order next time.',
    stars: {
      count: stars, label: 'puzzle stars', note: cleared && improved && previous.stars ? 'A new best for this puzzle!' : '',
      message: !cleared ? 'Clear every block to earn stars.' : stars === 3 ? 'Three stars!' : `Next star: ${next.toLocaleString()} points · ${(next - points).toLocaleString()} to go. Try a different order.`,
    },
    actions: cleared
      ? `<button class="primary-button" data-action="next">${icon('play')} Next puzzle</button>${stars < 3 ? '<button class="secondary-button" data-action="restart">Play it again for more stars</button>' : ''}`
      : `<button class="primary-button" data-action="restart">${icon('restart')} Give it another go</button>${undoAllowed(state) ? '<button class="secondary-button" data-action="undo">Undo the last move</button>' : ''}`,
  });
}

/** Opens the gold hard-mode choice for a Classic level; two regular stars open it. */
function openClassicGold(level = state.level, difficulty = state.difficulty) {
  if (!goldUnlocked(classicProgress.best(level, difficulty).stars)) return toast('Earn ★★ on this level to open gold hard mode.');
  const targets = getClassicGoldTargets(level, difficulty);
  openGoldPicker({
    openModal, title: `Classic level ${level}`, subtitle: `${difficulty[0].toUpperCase()}${difficulty.slice(1)} difficulty. Gold stars are kept for each level and difficulty.`,
    goal: describeObjective({ type: 'finish' }, 'classic'), available: modifiersForMode('classic'),
    targets: { two: targets.twoStars, three: targets.threeStars }, best: classicProgress.goldBest(level, difficulty),
    onStart: modifiers => startFreeGold({ mode: 'classic', level, difficulty, modifiers }), onBack: () => $('modal').close(),
  });
}

/** Opens the gold hard-mode choice for a puzzle; two regular stars open it. */
function openPuzzleGold(puzzleIndex = state.puzzleIndex) {
  const puzzle = PUZZLES[puzzleIndex];
  if (!goldUnlocked(puzzleProgress.best(puzzle.name).stars)) return toast('Earn ★★ on this puzzle to open gold hard mode.');
  openGoldPicker({
    openModal, title: puzzle.name, subtitle: `Puzzle ${puzzleNumber(puzzleIndex)}. Gold stars are kept for each puzzle.`,
    goal: describeObjective({ type: 'finish' }, 'puzzle'), available: modifiersForMode('puzzle'), details: { moveLimit: moveLimitText(puzzle) },
    targets: puzzleStarGoldTargets(puzzle), best: puzzleProgress.goldBest(puzzle.name),
    onStart: modifiers => startFreeGold({ mode: 'puzzle', puzzleIndex, modifiers }), onBack: () => $('modal').close(),
  });
}

const openFreeGold = gold => gold.mode === 'puzzle' ? openPuzzleGold(gold.puzzleIndex) : openClassicGold(gold.level, gold.difficulty);

function startFreeGold({ mode, level, difficulty, puzzleIndex, modifiers }) {
  autoPaused = false;
  $('modal').close();
  recordScore();
  journey.abandonRun();
  runWasJourney = false;
  challengeRun = null;
  history = [];
  if (mode === 'puzzle') $('puzzle-select').value = puzzleIndex;
  freshGame(mode, mode === 'puzzle' ? { puzzleIndex, modifiers } : { level, difficulty, modifiers });
  showScreen('game');
}

/** Judges and saves a settled free-play gold round once. */
function settleFreeGold() {
  const gold = goldResult({ completed: state.status !== 'gameOver', points: state.roundSummary.netPoints, modifiers: state.modifiers, targets: goldTargets() });
  const saved = state.mode === 'puzzle' ? puzzleProgress.record(state.puzzleName, {}, gold) : classicProgress.record(state, roundId, gold);
  freeGoldResult = { ...gold, ...saved };
  lastOverlayKey = '';
  lastStarGoals = '';
}

/** Judges and saves a settled free-play puzzle once. */
function settlePuzzle() {
  const targets = puzzleStarTargets(PUZZLES[state.puzzleIndex]);
  const points = state.roundSummary.netPoints;
  const stars = puzzleStars(points, state.status === 'won', targets);
  puzzleResult = { stars, points, targets, ...puzzleProgress.record(state.puzzleName, { stars, points }) };
  if (puzzleResult.improved) renderPuzzleOptions();
  lastOverlayKey = '';
  lastStarGoals = '';
}

function renderStats() {
  const puzzle = state.mode === 'puzzle';
  const bonus = state.phase === 'bonus';
  const timed = state.mode === 'countdown' || bonus;
  const frozen = state.freezeRemaining > 0;
  const supplyComplete = state.mode === 'classic' && bonus && state.bonusRowsAdded >= state.bonusRowsTarget;
  const roundTimeRemaining = bonus ? state.bonusRemaining : state.mode === 'countdown' ? state.timeLeft : 0;
  const urgent = !frozen && !supplyComplete && state.status === 'playing' && roundTimeRemaining > 0 && roundTimeRemaining <= URGENCY_RULES.windowMs;
  const paceLabel = `${URGENCY_RULES.rowIntervalMs / 1000}S / ROW`;
  const countdown = $('round-countdown');
  const countdownDigit = state.status === 'playing' && roundTimeRemaining > 0 && roundTimeRemaining <= URGENCY_RULES.windowMs
    ? String(Math.ceil(roundTimeRemaining / 1000)) : '';
  countdown.hidden = !countdownDigit;
  if (countdown.textContent !== countdownDigit) countdown.textContent = countdownDigit;
  const remaining = Math.max(0, state.rowsTarget - state.rowsAdded);
  $('score').textContent = (roundTally.getDisplayedScore() ?? state.score).toLocaleString('en-US', { minimumIntegerDigits: 4, useGrouping: false });
  $('best-label').textContent = challengeRun ? 'Challenge best' : 'Personal best';
  $('best-score').textContent = (challengeRun ? challengeBest?.points || 0 : Math.max(records[`${state.mode}:${state.difficulty}`]?.score || 0, state.roundSummary?.totalScore || 0)).toLocaleString();
  $('level-label').textContent = String(puzzle ? state.puzzleIndex + 1 : state.level).padStart(2, '0');
  $('cabinet-level').textContent = `${puzzle ? 'PUZZLE' : 'LEVEL'} ${String(puzzle ? state.puzzleIndex + 1 : state.level).padStart(2, '0')}${challengeRun ? ' · CHALLENGE' : state.modifiers.length ? ' · GOLD RUN' : ''}`;
  $('phase-label').textContent = bonus ? `BONUS ROUND · DOUBLE POINTS${urgent ? ` · ${paceLabel}` : ''}` : urgent ? `FINAL TEN SECONDS · ${paceLabel}` : labels[state.mode];
  $('cabinet-state').textContent = frozen ? `FROZEN · ${Math.ceil(state.freezeRemaining / 1000)}s` : urgent ? `FINAL TEN · ${paceLabel}` : bonus ? 'BONUS! DOUBLE THE POINTS' : state.status === 'ready' ? 'READY TO PLAY' : state.status === 'playing' ? (state.combo > 1 ? `${state.chain || state.combo} IN A ROW · ×${formatMultiplier(1 + .15 * (state.combo - 1))} STREAK` : 'LET THE GOOD TIMES ROLL') : state.status === 'paused' ? 'TAKING A BREATHER' : state.status === 'gameOver' ? 'UNTIL NEXT TIME' : 'BEAUTIFULLY PLAYED';
  $('game-status-dot').style.background = state.status === 'playing' ? '#75aa8a' : '#e98256';
  $('progress-title').textContent = puzzle ? 'PUZZLE PROGRESS' : timed ? 'TIME REMAINING' : 'LEVEL PROGRESS';
  let progress = puzzle ? 1 - countBlocks(state) / PUZZLES[state.puzzleIndex].rows.join('').replace(/\./g, '').length : state.mode === 'continuous' ? (state.rowsAdded % 12) / 12 : state.rowsAdded / state.rowsTarget;
  if (timed) progress = (bonus ? state.bonusRemaining / state.bonusDuration : state.timeLeft / 120000);
  $('level-progress-fill').style.width = `${Math.max(0, Math.min(1, progress)) * 100}%`;
  $('progress-description').textContent = puzzle ? state.puzzleName : supplyComplete ? 'All bonus rows are in. Keep clearing for double points!' : frozen && timed ? 'Feeder frozen. The round clock keeps running.' : urgent ? 'Final ten seconds: one incoming row every 2 seconds.' : bonus ? 'Fresh rows keep coming. Double the points!' : state.mode === 'strategy' ? 'Every good move brings a fresh row.' : state.mode === 'continuous' ? 'Keep going. You’re on a roll.' : state.mode === 'countdown' ? 'Two minutes to make your mark.' : `${remaining} fresh ${remaining === 1 ? 'row' : 'rows'} between you and the next level.`;
  $('cleared-count').textContent = state.cleared;
  $('second-stat-label').textContent = timed ? 'SECONDS LEFT' : puzzle ? 'MOVES' : state.mode === 'continuous' ? 'ROWS SURVIVED' : 'ROWS TO GO';
  $('second-stat').textContent = timed ? Math.ceil((bonus ? state.bonusRemaining : state.timeLeft) / 1000) : puzzle ? state.moveLimit ? `${state.moves}/${state.moveLimit}` : state.moves : state.mode === 'continuous' ? state.rowsAdded : remaining;
  $('row-progress-fill').style.width = `${puzzle || supplyComplete ? 0 : state.rowProgress * 100}%`;
  $('feeder-title').textContent = puzzle ? 'NO NEW ROWS. JUST YOU AND THE PUZZLE.' : state.mode === 'relapse' ? `NEXT ROW · FROM THE ${state.nextSide.toUpperCase()}` : 'NEXT ROW';
  $('feeder-caption').textContent = puzzle ? '' : supplyComplete ? 'BONUS SUPPLY COMPLETE' : frozen ? 'FEEDER FROZEN' : urgent ? `FINAL TEN · ${paceLabel}` : state.mode === 'strategy' && !bonus ? 'AFTER YOUR NEXT MOVE' : 'TAKE A PEEK ↓';
  $('add-row').disabled = state.status !== 'playing' || puzzle || supplyComplete;
  $('add-row').innerHTML = `${icon('arrow')} ${state.mode === 'strategy' && !bonus ? 'Skip a row' : 'Add a row'} <kbd>SPACE</kbd>`;
  $('pause-button').disabled = !['playing', 'paused'].includes(state.status);
  $('pause-button').innerHTML = icon(state.status === 'paused' ? 'play' : 'pause');
  $('pause-button').setAttribute('aria-label', state.status === 'paused' ? 'Resume game' : 'Pause game');
  $('hint-button').disabled = state.status !== 'playing' || !hintsAllowed(state);
  renderScoreReceipt();
  renderJourneyGoals();
  renderChallengeGoals();
  renderStarGoals();
  renderPhone();
}

function renderJourneyGoals() {
  const panel = $('journey-goals');
  const info = runWasJourney ? journeyResult || journey.runInfo(state) : null;
  panel.hidden = !info;
  if (!info) return;
  const status = journeyResult ? journeyResult.complete ? 'complete' : 'failed' : info.status;
  const key = `${info.stage.index}:${status}:${info.progress}:${info.points}:${state.status}`;
  if (key === lastJourneyGoals) return;
  lastJourneyGoals = key;
  const { gold } = info;
  const badge = { met: '✓ Goal reached · see it through', complete: gold ? `Gold run complete · ${starText(gold.stars)}` : `Objective complete · ${starText(info.stars)}`, failed: 'Objective missed' }[status];
  const bestStars = (gold ? info.goldBest : info.best)?.stars ?? 0;
  const heading = `<div class="journey-goal-heading"><b>JOURNEY ${info.number} · ${gold ? 'GOLD RUN' : 'OBJECTIVE'}</b><span class="${gold ? 'gold-stars' : ''}" role="img" aria-label="Best${gold ? ' gold' : ''}: ${bestStars} of 3 stars">${starText(bestStars)}</span></div>`;
  const goals = gold
    ? `<small>${goldGoals(gold.targets)}</small><small>Challenges: ${modifierNames(gold.modifiers).join(' · ')}</small>${state.status !== 'ready' ? `<small>${goldPointsLine(gold)}</small>` : ''}<span class="classic-trial">Playtest targets · still being tuned</span>`
    : `<small>${starGoals(info.targets)}</small>${state.status !== 'ready' ? `<small>Round points after leftovers: <b>${info.points.toLocaleString()}</b></small>` : ''}${info.targets.provisional ? '<span class="classic-trial">Playtest targets · still being tuned</span>' : ''}`;
  panel.classList.toggle('is-gold', Boolean(gold));
  panel.innerHTML = `${heading}<p class="journey-goal-text">${info.goal}</p>${info.progress ? `<p class="journey-goal-progress">${info.progress}</p>` : ''}${badge ? `<span class="journey-goal-badge is-${status}">${badge}</span>` : ''}${goals}`;
}

/** The challenge beside the board: its objective, progress, rules and your best. */
function renderChallengeGoals() {
  const panel = $('challenge-goals');
  panel.hidden = !challengeRun;
  if (!challengeRun) return;
  const info = challengeOutcome || challengeResult(challengeRun.challenge, state);
  const key = `${challengeRun.code}:${info.status}:${info.progress}:${info.points}:${state.status}:${challengeBest?.points}:${challengeBest?.completed}`;
  if (key === lastChallengeGoals) return;
  lastChallengeGoals = key;
  const words = describeChallenge(challengeRun.challenge);
  const badge = { met: '✓ Goal reached · see it through', complete: 'Challenge complete', failed: 'Objective missed' }[info.status];
  const name = challengeRun.name ? ` · ${escapeHtml(challengeRun.name.toUpperCase())}` : '';
  panel.innerHTML = `<div class="journey-goal-heading"><b>${challengeRun.week ? 'WEEKLY' : 'SHARED'} CHALLENGE${name}</b></div><p class="journey-goal-text">${words.goal}</p>${info.progress ? `<p class="journey-goal-progress">${info.progress}</p>` : ''}${badge ? `<span class="journey-goal-badge is-${info.status}">${badge}</span>` : ''}<small>${challengeRules(words)}</small>${state.status !== 'ready' ? `<small>Round points after leftovers: <b>${info.points.toLocaleString()}</b></small>` : ''}<small>${escapeHtml(challengeBestLine(challengeStore.entry(challengeRun.code)))}</small>`;
}

/** Stars beside the board for free play: a Classic level or a puzzle, or its gold run. */
function renderStarGoals() {
  const panel = $('classic-star-goals');
  const puzzle = state.mode === 'puzzle';
  // A Journey stage shows its targets in its own panel.
  panel.hidden = !(puzzle || state.mode === 'classic') || runWasJourney || Boolean(challengeRun);
  if (panel.hidden) return;
  const best = puzzle ? puzzleProgress.best(state.puzzleName) : classicProgress.best(state.level, state.difficulty);
  const goldBest = freeGoldBest();
  const net = roundPoints(state);
  const key = `${state.mode}:${state.puzzleIndex}:${state.level}:${state.difficulty}:${best.stars}:${goldBest?.stars}:${goldBest?.adjustedScore}:${net}:${state.status}:${Boolean(freeGold)}`;
  if (key === lastStarGoals) return;
  lastStarGoals = key;
  panel.classList.toggle('is-gold', Boolean(freeGold));
  if (freeGold) {
    const gold = freeGoldResult || goldResult({ completed: false, points: net, modifiers: state.modifiers, targets: goldTargets() });
    panel.innerHTML = `<div class="classic-goal-heading"><b>${puzzle ? 'PUZZLE' : 'CLASSIC'} GOLD RUN</b><span class="gold-stars" aria-label="Best gold: ${goldBest?.stars ?? 0} of 3 stars">${starText(goldBest?.stars ?? 0)}</span></div><p>${goldGoals(gold.targets)}</p><small>Challenges: ${modifierNames(gold.modifiers).join(' · ')}</small>${state.status !== 'ready' ? `<small>${goldPointsLine(gold)}</small>` : ''}<span class="classic-trial">Playtest targets · still being tuned</span>`;
    return;
  }
  const goldTarget = goldTargets();
  const gold = goldUnlocked(best.stars)
    ? `<div class="classic-gold-line"><span class="gold-stars" aria-label="Best gold: ${goldBest?.stars ?? 0} of 3 stars">${starText(goldBest?.stars ?? 0)}</span><span><b>GOLD</b> ★★ ${goldTarget.two.toLocaleString()} · ★★★ ${goldTarget.three.toLocaleString()}</span><button type="button" class="gold-link" data-free-gold>Go for gold <span aria-hidden="true">✦</span></button></div>`
    : `<small class="classic-gold-locked">Earn ★★ on this ${puzzle ? 'puzzle' : 'level'} to open gold hard mode.</small>`;
  if (puzzle) {
    const targets = puzzleStarTargets(PUZZLES[state.puzzleIndex]);
    panel.innerHTML = `<div class="classic-goal-heading"><b>BEST PUZZLE STARS</b><span aria-label="Best: ${best.stars} of 3 stars">${starText(best.stars)}</span></div><p>★ Clear it · ★★ ${targets.two.toLocaleString()} · ★★★ ${targets.three.toLocaleString()}</p><small>Points depend on the order of your moves.</small>${state.status !== 'ready' ? `<small>Points so far: <b>${net.toLocaleString()}</b></small>` : ''}${gold}`;
    return;
  }
  const targets = getClassicTargets(state.level, state.difficulty);
  panel.innerHTML = `<div class="classic-goal-heading"><b>BEST CLASSIC STARS</b><span aria-label="Best: ${best.stars} of 3 stars">${starText(best.stars)}</span></div><p>★ Complete · ★★ ${targets.twoStars.toLocaleString()} · ★★★ ${targets.threeStars.toLocaleString()}</p><small>×${formatMultiplier(targets.difficultyMultiplier)} difficulty · ×${formatMultiplier(targets.levelMultiplier)} level</small>${state.status !== 'ready' ? `<small>Round points after leftovers: <b>${net.toLocaleString()}</b></small>` : ''}${targets.provisional ? '<span class="classic-trial">Playtest targets · still being tuned</span>' : ''}${gold}`;
}

function render() {
  prepareRoundResult();
  renderBoard(); renderOverlay(); renderStats(); renderBoosts();
}

// The same screens as phone.css: phones, and touch screens tall enough to be tablets.
const screensLayout = matchMedia('(max-width: 620px), (hover: none) and (pointer: coarse) and (min-height: 560px)');
/** Phones and tablets show one screen at a time: home to choose a game, then the game alone, full screen. Computers show both. */
function showScreen(screen) {
  if (screen === 'home' && state.status === 'playing') pause();
  closeDetails();
  document.body.dataset.screen = screen;
  if (screensLayout.matches) window.scrollTo(0, 0);
}

let lastPhone = '';
/** The phone screens' own parts: the bar above the board, the tools beside Add a row, and the home screen's play button. */
function renderPhone() {
  const puzzle = state.mode === 'puzzle';
  const score = (roundTally.getDisplayedScore() ?? state.score).toLocaleString();
  if ($('phone-score').textContent !== score) $('phone-score').textContent = score;
  $('phone-progress-fill').style.width = $('level-progress-fill').style.width;
  const goals = !$('journey-goals').hidden || !$('challenge-goals').hidden || !$('classic-star-goals').hidden;
  const stage = runWasJourney ? journey.runInfo(state) : null;
  const name = challengeRun ? 'the challenge' : stage ? `journey stage ${stage.number}` : MODES.find(mode => mode.id === state.mode).name;
  const key = [state.status, state.mode, $('progress-title').textContent, goals, name, undoAllowed(state), history.length, hintsAllowed(state)].join(':');
  if (key === lastPhone) return;
  lastPhone = key;
  $('phone-progress-title').textContent = $('progress-title').textContent;
  $('phone-menu').innerHTML = icon(state.status === 'playing' ? 'pause' : state.status === 'paused' ? 'play' : 'home');
  $('phone-menu').setAttribute('aria-label', state.status === 'playing' ? 'Pause game' : state.status === 'paused' ? 'Resume game' : 'Back to the home screen');
  $('phone-details-label').textContent = goals ? 'Goals' : 'Stats';
  $('phone-details').setAttribute('aria-label', goals ? 'Goals, stars and score details' : 'Score details');
  $('phone-undo').hidden = !(puzzle && undoAllowed(state));
  $('phone-undo').disabled = state.status !== 'playing' || !history.length;
  $('phone-hint').disabled = state.status !== 'playing' || !hintsAllowed(state);
  $('phone-play').innerHTML = `${icon('play')} ${['playing', 'paused', 'levelComplete'].includes(state.status) ? 'Continue' : 'Play'} ${name}`;
  document.querySelector('.game-section').classList.toggle('is-puzzle', puzzle);
}

/** On phones the score panel opens as a sheet over the board, pausing a running game until the sheet closes. */
function openDetails() {
  detailsPaused = state.status === 'playing';
  if (detailsPaused) pause();
  document.body.classList.add('details-open');
  $('details-close').focus({ preventScroll: true });
}

function closeDetails() {
  if (!document.body.classList.contains('details-open')) return;
  document.body.classList.remove('details-open');
  if (detailsPaused && state.status === 'paused') { state.status = 'playing'; lastFrame = performance.now(); render(); }
  detailsPaused = false;
}

let lastBoosts = '';
/** Boosts from the Journey pocket, a tap away under the board; hidden while the pocket is empty. */
function renderBoosts() {
  const inventory = journey.inventory();
  const owned = ITEMS.filter(item => inventory[item.id] > 0);
  const checks = owned.map(item => powerupAvailable(state, item.id));
  const key = JSON.stringify([owned.map(item => inventory[item.id]), checks]);
  if (key === lastBoosts) return;
  lastBoosts = key;
  const tray = $('boost-tray');
  tray.hidden = !owned.length;
  tray.innerHTML = owned.length ? `<span class="boost-tray-label">BOOSTS</span>${owned.map((item, index) => `<button type="button" class="boost-button boost-${item.id}" data-boost="${item.id}" aria-label="${item.name}, ${inventory[item.id]} in your pocket" title="${escapeHtml(`${item.name}: ${checks[index].ok ? item.description : checks[index].reason}`)}"${checks[index].ok ? '' : ' disabled'}><span class="boost-symbol" aria-hidden="true">${item.symbol}</span><span class="boost-name">${item.short}</span><b aria-hidden="true">×${inventory[item.id]}</b></button>`).join('')}${boostsAllowed(state) ? '' : `<small class="boost-tray-note">Off for this ${challengeRun ? 'challenge' : 'run'}</small>`}<button type="button" class="boost-shop" data-boost-shop>Shop <span aria-hidden="true">↗</span></button>` : '';
}

function formatMultiplier(value) {
  return Number(value.toFixed(2)).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function clearLabel(scoring) {
  if (scoring.clearedSides.includes('board')) return 'BOARD CLEAR';
  if (scoring.clearedSides.length === 2) return 'BOTH SIDES CLEAR';
  return `${scoring.clearedSides[0]?.toUpperCase() || ''} SIDE CLEAR`;
}

function renderScoreReceipt() {
  const scoring = state.lastScoring;
  const key = `${state.score}:${JSON.stringify(scoring)}`;
  if (key === receiptKey) return;
  receiptKey = key;
  const receipt = $('score-receipt');
  if (!scoring?.clearedCount) {
    receipt.classList.add('empty');
    receipt.innerHTML = '<span class="receipt-eyebrow">MAKE IT A BIG ONE</span><p>Hover or select a group to see its points.<br>Clear a board or a Relapse side for a bonus.</p>';
    return;
  }
  receipt.classList.remove('empty');
  receipt.innerHTML = `<div class="receipt-heading"><span class="receipt-eyebrow">LAST CLEAR</span><strong>+${scoring.totalPoints.toLocaleString()}</strong></div><p class="receipt-base">${scoring.clearedCount} ${scoring.clearedCount === 1 ? 'block' : 'blocks'} · ${scoring.basePoints.toLocaleString()} base points</p><div class="receipt-factors"><span>×${formatMultiplier(scoring.sizeMultiplier)} group</span><span>×${formatMultiplier(scoring.streakMultiplier)} streak</span>${scoring.roundMultiplier > 1 ? `<span>×${formatMultiplier(scoring.roundMultiplier)} bonus round</span>` : ''}${scoring.difficultyMultiplier ? `<span>×${formatMultiplier(scoring.difficultyMultiplier)} difficulty</span><span>×${formatMultiplier(scoring.levelMultiplier)} level</span>` : ''}</div><p class="receipt-subtotal">${scoring.movePoints.toLocaleString()} move points${scoring.clearMultiplier > 1 ? ' before clear bonus' : ''}${scoring.difficultyMultiplier ? ' and Classic bonuses' : ''}</p>${scoring.clearMultiplier > 1 ? `<div class="receipt-clear"><b>${clearLabel(scoring)} ×${formatMultiplier(scoring.clearMultiplier)}</b><span>+${scoring.clearBonusPoints.toLocaleString()} clear bonus</span></div>` : ''}${scoring.difficultyMultiplier ? `<p class="receipt-subtotal">+${scoring.difficultyBonusPoints.toLocaleString()} difficulty · +${scoring.levelBonusPoints.toLocaleString()} level bonus</p>` : ''}`;
}

function clearSelection(resetLabel = true) {
  highlighted.clear();
  highlightedCount = 0;
  previewTarget = null;
  if (resetLabel) $('selection-label').textContent = 'Find a group of 3 or more';
  $('selection-label').classList.remove('valuable-preview');
}

function previewSelection(col, row) {
  clearSelection();
  if (state.status !== 'playing') return;
  const cell = state.board[row]?.[col];
  if (!cell) { renderBoard(); return; }
  previewTarget = { col, row };
  const group = getGroup(state, col, row);
  const special = ['bomb', 'colorBomb', 'gravity'].includes(cell.kind);
  const prediction = previewClear(state, col, row);
  const scoring = prediction.scoring;
  highlighted = new Set(special ? [cell.id] : group.length >= 3 ? group.map(item => item.id) : []);
  highlightedCount = group.length;
  const specialMessages = { bomb: 'Blast bomb', colorBomb: `${colorNames[cell.color]} color bomb`, gravity: 'Move this stack to the other side', stone: 'A blast bomb can clear this gray block', anchor: 'A blast bomb can clear this fixed block' };
  if (prediction.valid && scoring?.clearedCount) {
    const detail = specialMessages[cell.kind] || `${scoring.clearedCount} matching blocks`;
    $('selection-label').textContent = `${detail} · ×${formatMultiplier(scoring.sizeMultiplier)} group · +${scoring.totalPoints.toLocaleString()}${scoring.clearMultiplier > 1 ? ` · ${clearLabel(scoring).toLowerCase()} ×${formatMultiplier(scoring.clearMultiplier)}` : ''}`;
    $('selection-label').classList.toggle('valuable-preview', group.length >= SCORING_RULES.rockThreshold || scoring.clearMultiplier > 1);
  } else $('selection-label').textContent = specialMessages[cell.kind] || 'Find a group of 3 or more';
  renderBoard();
}

/** The points for a clear beside the group, with a cheer above them when one was earned; sweeps get the banner. */
function scoreFeedback(result, col = COLS / 2 - .5, row = ROWS / 2, cheer = null) {
  const scoring = result.scoring;
  if (!scoring?.clearedCount) return;
  const sweep = ['sweep', 'doubleSweep'].includes(cheer?.type);
  const word = cheer && !sweep ? cheer : null;
  const score = $('float-score');
  score.innerHTML = `<strong>+${scoring.totalPoints.toLocaleString()}</strong><span>${word?.detail || `${scoring.clearedCount} cleared · ×${formatMultiplier(scoring.sizeMultiplier)} group`}</span>`;
  score.style.left = `${Math.max(20, Math.min(80, (col + .5) * 100 / COLS))}%`;
  // A cheer sits above the points, so keep both clear of the board's top edge.
  score.style.top = `${Math.max(word ? 24 : 14, Math.min(86, (row + .5) * 100 / ROWS))}%`;
  score.classList.remove('show');
  void score.offsetWidth;
  score.classList.add('show');
  clearTimeout(floatScoreTimeout);
  floatScoreTimeout = setTimeout(() => score.classList.remove('show'), 1150);
  if (word) {
    const element = $('cheer');
    element.innerHTML = `<em>${word.phrase}</em>`;
    element.className = `cheer cheer-${word.type}`;
    // Center the word over the points, but keep a long one inside the board.
    const width = $('board').clientWidth;
    const half = element.offsetWidth / 2 + 8;
    element.style.left = `${Math.max(half, Math.min(width - half, parseFloat(score.style.left) * width / 100))}px`;
    element.style.top = score.style.top;
    void element.offsetWidth;
    element.classList.add('show');
    clearTimeout(cheerTimeout);
    cheerTimeout = setTimeout(() => element.classList.remove('show'), 1700);
  }
  if (cheer) tone(cheer.type, 3, .14);
  clearTimeout(celebrationTimeout);
  $('clear-celebration').classList.remove('show');
  if (scoring.clearMultiplier > 1) {
    const celebration = $('clear-celebration');
    const passedBest = sweep && cheer.also.includes('best') ? ' · past your best!' : '';
    celebration.innerHTML = sweep
      ? `<span>${clearLabel(scoring)} · ×${formatMultiplier(scoring.clearMultiplier)} POINTS</span><strong class="cheer-sweep">${cheer.phrase}</strong><small>+${scoring.clearBonusPoints.toLocaleString()} bonus${passedBest}</small>`
      : `<span>${clearLabel(scoring)}</span><strong>×${formatMultiplier(scoring.clearMultiplier)} POINTS</strong><small>+${scoring.clearBonusPoints.toLocaleString()} bonus</small>`;
    if (sweep) confetti(36);
    celebration.classList.remove('show');
    void celebration.offsetWidth;
    celebration.classList.add('show');
    celebrationTimeout = setTimeout(() => celebration.classList.remove('show'), 2300);
  }
}

let history = [];
function clearBlock(col, row) {
  if (state.status !== 'playing') return;
  const before = undoAllowed(state) ? structuredClone(state) : null;
  const result = clearAt(state, col, row);
  clearSelection();
  if (!result.valid) {
    const cell = state.board[row]?.[col];
    if (cell) { const element = elements.get(cell.id); element?.classList.add('invalid'); setTimeout(() => element?.classList.remove('invalid'), 400); }
    $('selection-label').textContent = result.message || 'Try a group of 3 or more';
    return;
  }
  if (before) history.push(before);
  hideHintArea();
  removalEffects(result);
  const transferred = result.transferred.length;
  const absorbed = result.absorbed.length;
  $('selection-label').textContent = transferred ? `${transferred} ${transferred === 1 ? 'block' : 'blocks'} moved to the other side.` : absorbed ? `${result.removed.length} cleared · ${absorbed} ${absorbed === 1 ? 'special' : 'specials'} removed quietly.` : `${result.removed.length} blocks cleared.`;
  scoreFeedback(result, col, row, cheers.afterClear(state, result));
  recordScore();
  render();
  checkEnd();
}

function removalEffects(result) {
  const absorbed = new Set(result.absorbed.map(cell => cell.id));
  for (const id of absorbed) elements.get(id)?.classList.add('absorbed');
  const activated = result.activated;
  tone(activated.some(cell => cell.kind === 'bomb' || cell.kind === 'colorBomb') ? 'bomb' : activated.some(cell => cell.kind === 'gravity') ? 'row' : 'clear', result.removed.length);
  const matchingBlocks = activated.length ? [] : result.removed.filter(cell => cell.kind === 'normal');
  if (matchingBlocks.length >= SCORING_RULES.rockThreshold) glowBurst(matchingBlocks);
  burst(result.removed.filter(cell => !absorbed.has(cell.id)));
}

function glowBurst(removed) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  // Sample a few tiles across the group so the glow opens outward gently.
  const stride = Math.max(1, Math.ceil(removed.length / 10));
  removed.filter((_, index) => index % stride === 0).forEach((cell, index) => {
    const left = (cell.col + .5) * 100 / COLS;
    const top = (cell.row + .5) * 100 / ROWS;
    const ring = document.createElement('i');
    ring.className = 'clear-glow-burst';
    ring.style.cssText = `left:${left}%;top:${top}%;--glow-color:#ffecae`;
    $('particles').append(ring);
    setTimeout(() => ring.remove(), 500);
    for (let sparkIndex = 0; sparkIndex < 3; sparkIndex++) {
      const angle = (sparkIndex / 3 + index * .17) * Math.PI * 2;
      const distance = 14 + (index % 3) * 4;
      const spark = document.createElement('i');
      spark.className = 'clear-glow-spark';
      spark.style.cssText = `left:${left}%;top:${top}%;--glow-color:#ffecae;--dx:${Math.cos(angle) * distance}px;--dy:${Math.sin(angle) * distance}px`;
      $('particles').append(spark);
      setTimeout(() => spark.remove(), 500);
    }
  });
}

/** Confetti in the block colors, falling from the top of its layer: the board's own, unless given another. */
function confetti(count = 40, layer = $('confetti')) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const height = layer.clientHeight || 500;
  for (let index = 0; index < count; index++) {
    const piece = document.createElement('i');
    piece.className = `confetti-piece${index % 4 === 0 ? ' round' : ''}`;
    piece.style.cssText = `left:${3 + Math.random() * 94}%;background:${colors[index % colors.length]};--fall:${Math.round(height * (.55 + Math.random() * .45))}px;--drift:${Math.round((Math.random() - .5) * 90)}px;--spin:${Math.round((Math.random() - .5) * 900)}deg;--duration:${(1.5 + Math.random() * .8).toFixed(2)}s;--delay:${(Math.random() * .3).toFixed(2)}s`;
    layer.append(piece);
    setTimeout(() => piece.remove(), 2600);
  }
}

/** The round tally covers the board, so its confetti falls over the card instead. */
function celebrateOverCard() {
  const layer = document.createElement('div');
  layer.className = 'confetti';
  layer.setAttribute('aria-hidden', 'true');
  $('board-overlay').append(layer);
  confetti(48, layer);
  setTimeout(() => layer.remove(), 2800);
}

function burst(removed) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  removed.slice(0, 30).forEach(cell => {
    for (let i = 0; i < 3; i++) {
      const particle = document.createElement('i');
      particle.className = 'particle';
      particle.style.cssText = `left:${(cell.col + .5) * 100 / COLS}%;top:${(cell.row + .5) * 100 / ROWS}%;background:${colors[cell.color]};--dx:${(Math.random() - .5) * 80}px;--dy:${-20 - Math.random() * 70}px`;
      $('particles').append(particle);
      setTimeout(() => particle.remove(), 650);
    }
  });
}

const goalReachedMessage = () => `Objective reached! ${{ level: 'Now finish the level.', round: 'Now last the full two minutes.', clear: 'Now clear every block.' }[finishRequirement(state.mode)]}`;

function prepareRoundResult() {
  // A decided Journey objective ends the run (Continuous stops at its goal), and
  // the round is settled once before its stars are judged on settled points.
  if (!state.roundSummary && journey.isActive()) {
    const status = journey.objectiveStatus(state);
    if (status === 'met' && !journeyGoalMet) { journeyGoalMet = true; toast(goalReachedMessage()); }
    if (status === 'complete' || status === 'failed') {
      if (status === 'complete') state.status = 'won';
      finalizeRound(state);
      journeyResult = journey.finishRun(state);
      renderJourneyEntry();
      lastOverlayKey = '';
    }
  }
  // A challenge ends the same way, once its objective is decided.
  if (!state.roundSummary && challengeRun && !challengeOutcome) {
    const { status } = challengeResult(challengeRun.challenge, state);
    if (status === 'met' && !challengeGoalMet) { challengeGoalMet = true; toast(goalReachedMessage()); }
    if (status === 'complete' || status === 'failed') {
      if (status === 'complete') state.status = 'won';
      finalizeRound(state);
      settleChallenge();
    }
  }
  finalizeRound(state);
  if (!state.roundSummary || runWasJourney || challengeRun) return;
  if (freeGold && !freeGoldResult) settleFreeGold();
  else if (!freeGold && state.mode === 'puzzle' && !puzzleResult) settlePuzzle();
}

function checkEnd() {
  prepareRoundResult();
  if (['levelComplete', 'won', 'gameOver'].includes(state.status) && !recorded) {
    recorded = true;
    // A gold run saved its own record when it settled, and a challenge keeps its own.
    if (!freeGold && !challengeRun) classicProgress.record(state, roundId);
    lastStarGoals = '';
    recordScore();
  }
}

function pause() {
  if (state.status === 'playing') state.status = 'paused';
  else if (state.status === 'paused') state.status = 'playing';
  clearSelection();
  render();
}

function requestRow() {
  const result = addRow(state);
  if (result.valid) { tone('row'); clearSelection(); render(); checkEnd(); }
  else { render(); checkEnd(); if (result.message) toast(result.message); }
}

/** Makes the suggested group sparkle and moves keyboard focus to it. */
function pulseGroup(target) {
  const group = getGroup(state, target.col, target.row);
  (group.length >= 3 ? group : [state.board[target.row][target.col]]).forEach(cell => {
    const element = elements.get(cell.id); element?.classList.remove('hinted'); void element?.offsetWidth; element?.classList.add('hinted');
    if (element) {
      clearTimeout(element.hintTimeout);
      element.hintTimeout = setTimeout(() => element.classList.remove('hinted'), 2400);
    }
  });
  focused = { col: target.col, row: target.row };
}

function showHintArea(area) {
  const element = $('hint-area');
  element.style.cssText = `left:${area.left * 100 / COLS}%;top:${area.top * 100 / ROWS}%;width:${(area.right - area.left + 1) * 100 / COLS}%;height:${(area.bottom - area.top + 1) * 100 / ROWS}%`;
  element.hidden = true;
  void element.offsetWidth;
  element.hidden = false;
  clearTimeout(hintAreaTimeout);
  hintAreaTimeout = setTimeout(hideHintArea, 4000);
}

function hideHintArea() {
  clearTimeout(hintAreaTimeout);
  $('hint-area').hidden = true;
}

function hint() {
  if (state.status !== 'playing') return;
  if (!hintsAllowed(state)) return toast(`Hints are off for this ${challengeRun ? 'challenge' : 'gold run'}.`);
  if (state.mode === 'puzzle') return layeredHint();
  const target = getHint(state);
  if (!target) return toast('No groups yet. A new row might help.');
  pulseGroup(target);
  toast('There’s a promising group for you.');
}

/** Puzzle hints go one layer deeper each time for the same position: an idea, where to look, then the move. */
function layeredHint() {
  const key = `${roundId}:${state.moves}`;
  if (hintLayer.key !== key) hintLayer = { key, level: 0, result: puzzleHint(state) };
  const { result } = hintLayer;
  if (!result) return;
  if (result.lost) return toast(undoAllowed(state) && history.length ? 'This board can’t be cleared from here. Undo (U) to step back.' : 'This board can’t be cleared from here. Try the puzzle again.');
  hintLayer.level = Math.min(3, hintLayer.level + 1);
  if (hintLayer.level === 1) {
    $('selection-label').textContent = 'Hint 1 of 3 · Ask again to see where.';
    return toast(result.nudge);
  }
  if (hintLayer.level === 2) {
    showHintArea(result.area);
    $('selection-label').textContent = 'Hint 2 of 3 · Ask again for the move.';
    return toast('Look inside the highlighted area.');
  }
  pulseGroup(result);
  $('selection-label').textContent = 'Hint 3 of 3 · The suggested move.';
  toast(result.unsure ? 'You’re off the known solution, so this is simply the biggest group. Undo to get back on track.' : 'Try the sparkling group.');
}

function undo() {
  if (state.mode === 'puzzle' && !undoAllowed(state)) return toast(`Undo is off for this ${challengeRun ? 'challenge' : 'gold run'}.`);
  if (state.mode !== 'puzzle' || !history.length) return toast('No puzzle moves to undo yet.');
  roundTally.cancel();
  $('particles').replaceChildren();
  state = history.pop();
  state.status = 'playing';
  recorded = false;
  // A missed Journey puzzle stays active, so the restored board can still complete it.
  journeyResult = null;
  lastJourneyGoals = '';
  challengeOutcome = null;
  lastChallengeGoals = '';
  freeGoldResult = null;
  puzzleResult = null;
  lastStarGoals = '';
  hideHintArea();
  clearSelection();
  clearTimeout(celebrationTimeout);
  clearTimeout(floatScoreTimeout);
  clearTimeout(cheerTimeout);
  $('clear-celebration').classList.remove('show');
  $('float-score').classList.remove('show');
  $('cheer').classList.remove('show');
  render();
  toast('One move back. A fresh possibility.');
}

function openModal(title, content) {
  autoPaused = $('modal').open ? autoPaused : state.status === 'playing';
  if (autoPaused) { state.status = 'paused'; clearSelection(); render(); }
  $('modal-eyebrow').textContent = title;
  $('modal-content').innerHTML = content;
  if (!$('modal').open) $('modal').showModal();
  return $('modal-content');
}

function help() {
  openModal('THE JOY IS IN THE COLLAPSE', `<h2>A few good moves.</h2>
    <ol class="instructions-list"><li><b>Find your group.</b> Tap 3 or more touching ordinary blocks of the same color. Blocks connect up, down, left, and right.</li><li><b>Make room for more.</b> Blocks fall into the gaps. Empty columns gather toward the center. Bigger groups earn more points.</li><li><b>Save a special.</b> Bombs and gravity blocks are rare. Tap one to use it. Clearing a group quietly removes touching black bombs and gravity blocks. A touching color bomb disappears only if the cleared cubes match its color.</li><li><b>Keep an eye on the next row.</b> Don’t let the stack reach the top. In Relapse, keep the top and bottom stacks apart.</li></ol>
    <h3>${MODES.find(mode => mode.id === state.mode).name} mode</h3><p>${MODES.find(mode => mode.id === state.mode).description}</p>
    <div class="special-list"><div class="special-item"><span class="special-symbol bomb" aria-hidden="true">✹</span><span><b>Black blast bomb</b>Tap to clear a 5 × 5 area, even gray blocks.</span></div><div class="special-item"><span class="special-symbol colorBomb c0" aria-hidden="true">✹</span><span><b>Color bomb</b>A colored ring marks the color it clears across the board.</span></div><div class="special-item"><span class="special-symbol stone" aria-hidden="true">×</span><span><b>Gray blocks</b>A little obstacle. Save a blast bomb for these.</span></div><div class="special-item"><span class="special-symbol gravity" aria-hidden="true">↕</span><span><b>Relapse gravity block</b>Tap to move its entire stack to the other side.</span></div></div>
    <p class="modal-note">Specials caught by a bomb also disappear without activating. A gravity block moves the blocks on its own side; the next row keeps its scheduled side.</p>
    <h3>Bigger groups. A better score.</h3><p>Each cleared block starts at 20 points. For 3 or more blocks, the group multiplier is (blocks + 1) ÷ 4. That makes <b>3 blocks = 60</b>, <b>6 = 210</b>, and <b>10 = 550 points</b> before streaks and clear bonuses. Groups of 6 or more gently rock when selected; 10 or more get a little extra sparkle.</p><p>Quick clears build a streak: each step adds 0.15 to the streak multiplier (×1, ×1.15, ×1.30…). Bonus rounds add ×2. We round those move points to a whole number, then apply a clear bonus: <b>empty the board for ×2</b>; in Relapse, <b>empty either side for ×2, or both in one move for ×3</b>. The receipt below your score shows exactly how each clear added up.</p><p class="modal-note">Specials removed quietly count toward the clear. A move that removes only 1 or 2 blocks earns 10 or 30 base points. Moving a Relapse stack with gravity does not earn a side-clear bonus.</p>
    <h3>Count every last point.</h3><p>At the end of a round, watch your earned points count up and the remaining blocks take away <b>${SCORING_RULES.penaltyPerBlock} points each</b>. The round cannot drop below zero, and points banked in earlier levels stay safe. Your breakdown shows group and streak bonuses, bonus-round ×2 points, all-clear ×2/×3 rewards, and your biggest clear. Skip the count to see the result immediately.</p>
    <h3>A little applause.</h3><p>Big clears, clean sweeps, close calls and passing your personal best each earn a quick cheer. A new personal best also gets a ribbon on the round’s result. Cheers follow the sound button and your device’s reduced-motion setting.</p>
    <h3>Classic stars.</h3><p>Classic and Relapse games always begin at level 1, so losing means starting over. Finish the level for ★. Reach the displayed round-score targets for ★★ or ★★★. Difficulty adds ×1 on Easy, ×2.10 on Normal, or ×3.55 on Hard. Each later level adds 5%, up to ×2. Classic bonus rounds always last 15 seconds, with a fixed supply of rows. Add a row brings that supply forward. Your best stars are saved for each level and difficulty; playtest targets are labeled while we tune them.</p>
    <h3>A little adventure, too.</h3><p>Open The journey to explore 25 stages, earn game coins, and pick up a boost in the shop. The arcade’s three reels use game coins only. Boosts in your pocket wait under the board in any game: tap one to use it.</p><p>Each stage has its own objective, shown before you start and beside the board while you play. Meet it for ★, then reach the stage’s round-point targets for ★★ or ★★★. Round points are counted after leftover blocks, as in Classic. A missed objective earns no stars or coins, and you can try again straight away. Your best stars for each stage are saved.</p><h3>Puzzle stars and hints.</h3><p>Clear a puzzle for ★. Its points depend on the order of your moves, so reach the displayed targets for ★★ or ★★★. The harbor set teaches one idea per puzzle. Ask for a hint and you get an idea first; ask again to see where to look, and once more for the move itself. Wander off the known solution and the hint looks for another way, or tells you when the board can no longer be cleared.</p><h3>Go for gold.</h3><p>Earn ★★ on a Classic level, a puzzle or a Journey stage to open its gold hard mode. Pick at least one challenge: quicker rows, a taller start, no boosts or no hints, and for puzzles no undo or a move limit. Meet the objective for a gold ★, then reach the gold-point targets for ★★ and ★★★. Gold points are your round points plus 5% for two challenges or 10% for three or more. Your score never changes, and gold records are saved apart from your regular stars.</p><h3>Weekly and shared challenges.</h3><p>Each week brings one challenge for everyone: the same mode, level, board, objective and rules, from Monday 00:00 UTC to the next. Open the weekly card under The journey to play it, load a friend’s code or link, or make your own. Each exact challenge keeps its own best on this device, apart from your regular records. Copy your result to compare.</p><h3>Make yourself comfortable.</h3><div class="keyboard-hints"><span>ARROWS · Select block</span><span>ENTER · Clear group</span><span>SPACE · Add row</span><span>P · Pause</span><span>H · Hint</span><span>U · Undo puzzle move</span></div><p class="modal-note">This is a playtest recreation with original puzzles and a new journey. Rules, timing, and scoring are being tuned against the collection.</p>`);
}

function showRecords() {
  const difficulties = ['easy', 'normal', 'hard'];
  const stars = classicProgress.entries();
  const puzzles = PUZZLES.map((puzzle, index) => ({ name: puzzle.name, index, ...puzzleProgress.best(puzzle.name), gold: puzzleProgress.goldBest(puzzle.name) })).filter(entry => entry.stars);
  openModal('A LITTLE FRIENDLY COMPETITION', `<h2>Your personal bests.</h2><table class="records-table"><thead><tr><th>MODE</th>${difficulties.map(d => `<th>${d.toUpperCase()}</th>`).join('')}</tr></thead><tbody>${MODES.map(mode => `<tr><td>${mode.name}</td>${difficulties.map(d => `<td>${records[`${mode.id}:${d}`]?.score.toLocaleString() || '—'}</td>`).join('')}</tr>`).join('')}</tbody></table><p class="modal-note">Your records stay in this browser, on this device. A new high score is saved after the round’s remaining-block penalty is settled.</p><h3>Classic stars by level</h3>${stars.length ? `<div class="classic-records"><table class="records-table"><thead><tr><th>LEVEL</th><th>DIFFICULTY</th><th>STARS</th><th>BEST ROUND</th><th>GOLD</th></tr></thead><tbody>${stars.map(entry => `<tr><td>${entry.level}</td><td>${entry.difficulty}</td><td class="saved-stars" aria-label="${entry.stars} of 3 stars">${starText(entry.stars)}</td><td>${entry.score.toLocaleString()}</td><td class="saved-stars gold-stars" aria-label="${entry.gold?.stars ?? 0} of 3 gold stars">${entry.gold ? starText(entry.gold.stars) : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<p>Finish a Classic level to start your star collection.</p>'}<button class="classic-export" id="export-classic-results">Export Classic playtest results ↓</button><p class="modal-note">Stars keep your best result for each level and difficulty. The last 500 finished attempts are saved locally for tuning playtest targets.</p><h3>Puzzle stars</h3>${puzzles.length ? `<div class="classic-records"><table class="records-table"><thead><tr><th>PUZZLE</th><th>STARS</th><th>BEST POINTS</th><th>GOLD</th></tr></thead><tbody>${puzzles.map(entry => `<tr><td>${puzzleNumber(entry.index)} · ${entry.name}</td><td class="saved-stars" aria-label="${entry.stars} of 3 stars">${starText(entry.stars)}</td><td>${entry.score.toLocaleString()}</td><td class="saved-stars gold-stars" aria-label="${entry.gold?.stars ?? 0} of 3 gold stars">${entry.gold ? starText(entry.gold.stars) : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<p>Clear a puzzle to start collecting its stars.</p>'}`);
  $('export-classic-results').onclick = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(classicProgress.exportRuns(), null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'collapse-classic-playtests.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
}

function feedback() {
  openModal('HELP BRING AN OLD FAVORITE BACK', `<h2>How did that feel?</h2><p>Too fast? A bomb you remember differently? A favorite feature missing? Leave yourself a note for the next round of tuning.</p><textarea id="feedback-text" class="feedback-area" aria-label="Playtest note" placeholder="The bit I loved was… The bit I’d change is…" maxlength="3000"></textarea><div class="feedback-actions"><button id="save-note" class="primary-button">Save this note</button><button id="export-notes" class="secondary-button">Export notes ↓</button></div><p class="modal-note">Notes are saved only in this browser. Export them to share; nothing is sent automatically.</p>`);
  $('save-note').onclick = () => {
    const text = $('feedback-text').value.trim();
    if (!text) { $('feedback-text').focus(); return; }
    const notes = storage.get('notes', []);
    notes.push({ text, mode: state.mode, difficulty: state.difficulty, level: state.level, score: state.score, seed: state.seed, rowsAdded: state.rowsAdded, phase: state.phase, version: '1.0.0', date: new Date().toISOString() });
    storage.set('notes', notes);
    $('feedback-text').value = '';
    toast('Saved. A little note for a better next game.');
  };
  $('export-notes').onclick = () => {
    const notes = storage.get('notes', []);
    if (!notes.length) return toast('Save a playtest note first.');
    const url = URL.createObjectURL(new Blob([JSON.stringify(notes, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'collapse-playtest-notes.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
}

$('mode-list').addEventListener('click', event => { const button = event.target.closest('[data-mode]'); if (button) { recordScore(); journey.abandonRun(); runWasJourney = false; challengeRun = null; history = []; freshGame(button.dataset.mode); } });
$('start-level').addEventListener('change', () => { preferences.level = Number($('start-level').value); });
for (const id of ['difficulty', 'start-level', 'puzzle-select']) $(id).addEventListener('change', () => { recordScore(); journey.abandonRun(); runWasJourney = false; challengeRun = null; history = []; freshGame(); });
/** The block a pointer event points at, counting the gaps between blocks. */
function blockAtPointer(event) {
  // A block under the pointer wins, even while it is still sliding into its cell.
  const button = event.target.closest('.block');
  if (button) return { col: Number(button.dataset.col), row: Number(button.dataset.row) };
  const cell = cellAtPoint($('board').getBoundingClientRect(), event.clientX, event.clientY);
  return cell && state.board[cell.row]?.[cell.col] ? cell : null;
}
// Click works on the board, so a press and release on different blocks or gaps still counts.
// A touch already cleared on lifting, so the click a browser sends after it is ignored.
$('board').addEventListener('click', event => { if (performance.now() - lastTouchUp < 600) return; const cell = blockAtPointer(event); if (cell) clearBlock(cell.col, cell.row); });
// Touch clears the group under the finger when it lifts, so sliding onto another group picks that one and sliding off the board cancels.
$('board').addEventListener('pointerup', event => {
  if (event.pointerType !== 'touch') return;
  lastTouchUp = performance.now();
  const cell = blockAtPointer(event);
  if (cell) clearBlock(cell.col, cell.row);
});
$('board').addEventListener('pointercancel', () => { clearSelection(); renderBoard(); });
$('board').addEventListener('pointermove', event => {
  const cell = blockAtPointer(event);
  if (cell?.col === previewTarget?.col && cell?.row === previewTarget?.row) return;
  if (cell) previewSelection(cell.col, cell.row);
  else if (previewTarget) { clearSelection(); renderBoard(); }
});
$('board').addEventListener('pointerdown', event => {
  // A touch is held by the block it started on; letting go of it makes the finger's moves report what is under it.
  if (event.pointerType === 'touch' && event.target.hasPointerCapture?.(event.pointerId)) event.target.releasePointerCapture(event.pointerId);
  const cell = blockAtPointer(event);
  if (cell) previewSelection(cell.col, cell.row);
});
$('board').addEventListener('pointerleave', () => { clearSelection(); renderBoard(); });
$('board').addEventListener('animationend', event => { if (event.animationName === 'hint-pulse') event.target.classList.remove('hinted'); });
$('board').addEventListener('focus', renderBoard);
$('board').addEventListener('blur', event => { if (!$('board').contains(event.relatedTarget)) clearSelection(); renderBoard(); });
$('board-overlay').addEventListener('click', event => {
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (action === 'start') startGame();
  if (action === 'resume') pause();
  if (action === 'restart') { history = []; freshGame(); startGame(); }
  if (action === 'replay') journey.replay();
  if (action === 'help') help();
  if (action === 'home') showScreen('home');
  if (action === 'sound') toggleSound();
  if (action === 'restart-run') restartRun();
  if (action === 'journey') journey.openJourney();
  if (action === 'undo') undo();
  if (action === 'gold-retry' && freeGold) startFreeGold(freeGold);
  if (action === 'gold-pick') { if (runWasJourney) journey.openLastGold(); else if (freeGold) openFreeGold(freeGold); }
  if (action === 'gold-cancel') { history = []; freshGame(state.mode); }
  if (action === 'challenges') challengePanel.open(challengeRun?.code === challengePanel.weekly().code ? 'week' : 'results');
  if (action === 'challenge-retry' && challengeRun) launchChallenge(challengeRun);
  if (action === 'challenge-copy' && challengeOutcome) copyText(shareText(challengeRun.challenge, challengeOutcome, { name: challengeRun.name, week: challengeRun.week, link: challengeLink(challengeRun.code) }), 'Result copied. Paste it anywhere to compare.');
  if (action === 'next') {
    history = []; recorded = false;
    $('particles').replaceChildren();
    if (state.mode === 'puzzle') { $('puzzle-select').value = (state.puzzleIndex + 1) % PUZZLES.length; freshGame(); startGame(); }
    else { nextLevel(state); cheers.newRound(); roundId = crypto.randomUUID(); lastStarGoals = ''; clearSelection(); render(); }
  }
});
function toggleSound() { preferences.sound = !preferences.sound; storage.set('preferences', preferences); updateSoundButton(); if (preferences.sound) tone('clear'); }
/** Starts the current run over: the same challenge, Journey stage or gold run, or a fresh game. */
function restartRun() {
  recordScore(); history = [];
  if (challengeRun) return launchChallenge(challengeRun);
  if (runWasJourney && journey.replay()) return;
  if (freeGold) startFreeGold(freeGold);
  else freshGame();
}
$('sound-button').onclick = toggleSound;
$('pause-button').onclick = pause;
$('restart-button').onclick = restartRun;
$('phone-menu').onclick = () => ['playing', 'paused'].includes(state.status) ? pause() : showScreen('home');
$('phone-play').onclick = () => { if (['gameOver', 'won'].includes(state.status)) restartRun(); showScreen('game'); };
$('phone-details').onclick = openDetails;
$('details-close').onclick = closeDetails;
$('details-backdrop').onclick = closeDetails;
$('phone-hint').onclick = hint;
$('phone-undo').onclick = undo;
$('classic-star-goals').addEventListener('click', event => { if (event.target.closest('[data-free-gold]')) { if (state.mode === 'puzzle') openPuzzleGold(); else openClassicGold(); } });
$('add-row').onclick = requestRow;
$('boost-tray').addEventListener('click', event => {
  const type = event.target.closest('[data-boost]')?.dataset.boost;
  if (type) {
    journey.useBoost(type);
    renderBoosts();
    // Back to the board, so Space and the arrow keys keep playing.
    $('board').focus({ preventScroll: true });
  }
  if (event.target.closest('[data-boost-shop]')) journey.openShop();
});
$('hint-button').onclick = hint;
$('help-button').onclick = help;
$('quick-help').onclick = help;
$('records-button').onclick = showRecords;
$('journey-button').onclick = journey.openJourney;
$('journey-entry').onclick = journey.openJourney;
$('challenge-entry').onclick = () => challengePanel.open('week');
$('feedback-button').onclick = feedback;
$('nav-play').onclick = () => $('board').scrollIntoView({ behavior: 'smooth', block: 'center' });
$('close-modal').onclick = () => $('modal').close();
$('modal').addEventListener('click', event => { if (event.target === $('modal')) { const rect = $('modal').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('modal').close(); } });
$('modal').addEventListener('close', () => { if (autoPaused && state.status === 'paused') { state.status = 'playing'; lastFrame = performance.now(); render(); } autoPaused = false; renderBoosts(); });
document.addEventListener('keydown', event => {
  if ($('modal').open || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
  const key = event.key.toLowerCase();
  if (key === 'escape' && document.body.classList.contains('details-open')) { closeDetails(); return; }
  if (key === 'p' || key === 'escape') { event.preventDefault(); pause(); }
  if (key === 'h') hint();
  if (key === 'u') undo();
  if (key === ' ') { event.preventDefault(); if (state.status === 'ready') startGame(); else if (state.status === 'paused') pause(); else requestRow(); }
  if (event.key.startsWith('Arrow')) {
    event.preventDefault();
    focused.col = Math.max(0, Math.min(COLS - 1, focused.col + (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0)));
    focused.row = Math.max(0, Math.min(ROWS - 1, focused.row + (event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0)));
    $('board').focus({ preventScroll: true }); previewSelection(focused.col, focused.row);
  }
  if (key === 'enter' && document.activeElement === $('board')) { event.preventDefault(); if (state.status === 'ready') startGame(); else clearBlock(focused.col, focused.row); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && state.status === 'playing') { state.status = 'paused'; clearSelection(); recordScore(); render(); } });
window.addEventListener('pagehide', () => { clearSelection(); recordScore(); });

function frame(now) {
  const delta = Math.min(250, Math.max(0, now - lastFrame));
  lastFrame = now;
  const before = `${state.status}:${state.phase}:${state.rowsAdded}:${state.nextId}`;
  const result = advanceTime(state, delta);
  const after = `${state.status}:${state.phase}:${state.rowsAdded}:${state.nextId}`;
  if (before !== after) {
    clearSelection();
    if (state.phase === 'bonus' && !before.includes(':bonus:')) toast('Bonus round! Keep clearing fresh rows for double points.');
    if (result?.message && state.status === 'playing' && state.phase !== 'bonus') $('selection-label').textContent = result.message;
    render(); checkEnd();
  } else if (now - lastStats > 100) {
    if (previewTarget) previewSelection(previewTarget.col, previewTarget.row);
    renderStats(); lastStats = now;
  }
  updateCountdownTick();
  requestAnimationFrame(frame);
}

freshGame();
openChallengeLink();
window.addEventListener('hashchange', openChallengeLink);
// The weekly card counts down; a new week's challenge appears without a reload.
setInterval(renderChallengeEntry, 60000);
requestAnimationFrame(frame);
// The published game keeps an offline copy; the local dev server skips it so edits show up on reload.
if ('serviceWorker' in navigator && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)) navigator.serviceWorker.register('./sw.js');
