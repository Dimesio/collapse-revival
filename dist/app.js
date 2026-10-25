import { MODES, ROWS, COLS, SCORING_RULES, createGame, clearAt, previewClear, advanceTime, addRow, nextLevel, getGroup, getHint, countBlocks, usePowerup } from './engine.js';
import { PUZZLES } from './puzzles.js';
import { createJourney } from './journey.js';

const $ = (id) => document.getElementById(id);
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
let state;
let audioContext;
let focused = { col: 5, row: 12 };
let highlighted = new Set();
let highlightedCount = 0;
let previewTarget = null;
let receiptKey = '';
let celebrationTimeout;
let floatScoreTimeout;
let lastOverlayKey = '';
let lastFrame = performance.now();
let lastStats = 0;
let toastTimeout;
let autoPaused = false;
let recorded = false;
let journeyCompleted = false;
let runWasJourney = false;
const elements = new Map();
const journey = createJourney({
  openModal,
  toast,
  launch(config) {
    autoPaused = false;
    $('modal').close();
    $('difficulty').value = config.difficulty;
    $('start-level').value = config.level;
    $('puzzle-select').value = config.puzzleIndex || 0;
    history = [];
    freshGame(config.mode, config);
    runWasJourney = true;
    startGame();
    toast(journey.getActiveLabel());
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
$('puzzle-select').innerHTML = PUZZLES.map((puzzle, i) => `<option value="${i}">${String(i + 1).padStart(2, '0')} · ${puzzle.name}</option>`).join('');
$('difficulty').value = preferences.difficulty;
$('start-level').value = preferences.level;
$('puzzle-select').value = preferences.puzzleIndex;
$('board').tabIndex = 0;

function freshGame(mode = state?.mode || preferences.mode, overrides = {}) {
  preferences = { ...preferences, mode, difficulty: $('difficulty').value, level: Number($('start-level').value), puzzleIndex: Number($('puzzle-select').value) };
  storage.set('preferences', preferences);
  state = createGame({ ...preferences, ...overrides, seed: overrides.seed ?? Date.now() });
  recorded = false;
  journeyCompleted = false;
  focused = { col: 5, row: 12 };
  clearSelection();
  receiptKey = '';
  clearTimeout(celebrationTimeout);
  clearTimeout(floatScoreTimeout);
  $('clear-celebration').classList.remove('show');
  $('clear-celebration').textContent = '';
  $('float-score').classList.remove('show');
  $('selection-label').textContent = 'Find a group of 3 or more';
  lastOverlayKey = '';
  for (const element of elements.values()) element.remove();
  elements.clear();
  document.querySelectorAll('.mode-button').forEach(button => { const selected = button.dataset.mode === state.mode; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', selected); });
  $('game-mode-name').textContent = MODES.find(mode => mode.id === state.mode).name;
  $('mode-help').textContent = MODES.find(mode => mode.id === state.mode).description;
  $('puzzle-label').hidden = state.mode !== 'puzzle';
  $('start-level-label').hidden = state.mode === 'puzzle';
  $('difficulty').disabled = state.mode === 'puzzle';
  updateSoundButton();
  render();
}

function startGame() {
  state.status = 'playing';
  lastFrame = performance.now();
  tone('start');
  render();
  $('board').focus({ preventScroll: true });
}

function tone(type, size = 3) {
  if (!preferences.sound) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    const start = audioContext.currentTime;
    const notes = type === 'start' ? [392, 494, 587] : type === 'complete' ? [523, 659, 784, 1047] : type === 'bomb' ? [100, 65] : type === 'row' ? [180] : [300 + Math.min(size, 20) * 22, 480 + Math.min(size, 20) * 22];
    notes.forEach((frequency, i) => {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = type === 'bomb' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequency, start + i * .065);
      gain.gain.setValueAtTime(0, start + i * .065);
      gain.gain.linearRampToValueAtTime(.065, start + i * .065 + .008);
      gain.gain.exponentialRampToValueAtTime(.001, start + i * .065 + .16);
      oscillator.connect(gain); gain.connect(audioContext.destination);
      oscillator.start(start + i * .065); oscillator.stop(start + i * .065 + .18);
    });
  } catch { /* Sound is optional. */ }
}

function toast(message) {
  if (!message) return;
  clearTimeout(toastTimeout);
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  toastTimeout = setTimeout(() => $('toast').classList.remove('visible'), 2600);
}

function updateSoundButton() {
  $('sound-button').innerHTML = icon(preferences.sound ? 'sound' : 'mute');
  $('sound-button').setAttribute('aria-label', `Turn sound ${preferences.sound ? 'off' : 'on'}`);
  $('sound-button').setAttribute('aria-pressed', String(preferences.sound));
}

function recordScore() {
  if (state.score <= 0) return;
  const key = `${state.mode}:${state.difficulty}`;
  if (state.score > (records[key]?.score || 0)) {
    records[key] = { score: state.score, level: state.level, date: new Date().toISOString() };
    storage.set('records', records);
  }
}

function renderBoard() {
  const activeIds = new Set();
  let danger = false;
  state.board.forEach((row, y) => row.forEach((cell, x) => {
    if (!cell) return;
    if ((state.mode !== 'relapse' && y <= 2) || (state.mode === 'relapse' && ((cell.side === 'top' && y >= 5) || (cell.side === 'bottom' && y <= 9)))) danger = true;
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
    const hinted = element.classList.contains('hinted');
    const invalid = element.classList.contains('invalid');
    element.className = `block c${cell.color} ${cell.kind}${selected ? ' highlighted' : ''}${valuable ? ' valuable-group' : ''}${valuable && highlightedCount >= SCORING_RULES.strongRockThreshold ? ' valuable-strong' : ''}${hinted ? ' hinted' : ''}${invalid ? ' invalid' : ''}${$('board') === document.activeElement && focused.col === x && focused.row === y ? ' selected-key' : ''}`;
    element.style.left = `${x * 100 / COLS}%`;
    element.style.top = `${y * 100 / ROWS}%`;
    element.dataset.col = x;
    element.dataset.row = y;
    element.setAttribute('aria-label', `${cellLabel(cell)}, column ${x + 1}, row ${y + 1}`);
  }));
  for (const [id, element] of elements) {
    if (!activeIds.has(id)) {
      element.classList.remove('highlighted', 'valuable-group', 'valuable-strong', 'hinted', 'invalid');
      element.classList.add('removing');
      setTimeout(() => element.remove(), 190);
      elements.delete(id);
    }
  }
  $('board').parentElement.classList.toggle('danger', danger && state.status === 'playing');
  $('next-row').innerHTML = state.nextRow.map(cell => `<i class="preview-block c${cell.color} ${cell.kind}" role="img" aria-label="${cellLabel(cell)}" title="${cellLabel(cell)}"></i>`).join('');
}

function renderOverlay() {
  const key = `${state.status}:${state.mode}:${state.level}:${state.puzzleIndex}`;
  if (key === lastOverlayKey) return;
  lastOverlayKey = key;
  const mode = MODES.find(item => item.id === state.mode);
  let content = '';
  if (state.status === 'ready') {
    content = `<div class="overlay-art"><i class="c2"></i><i class="c1"></i><i class="c0"></i></div><div class="eyebrow">A LITTLE NOSTALGIA. A LOT OF FUN.</div><h2>${state.mode === 'puzzle' ? state.puzzleName : 'Ready when you are.'}</h2><p>${state.mode === 'puzzle' ? 'A little patience. A little planning.<br>Leave no block behind.' : mode.description}</p><button class="primary-button" data-action="start">${icon('play')} Let’s play</button><button class="secondary-button" data-action="help">How does it work?</button>`;
  } else if (state.status === 'paused') {
    content = `<div class="overlay-art"><i class="c4"></i><i class="c4"></i></div><div class="eyebrow">TAKE YOUR TIME</div><h2>A little breather.</h2><p>Your blocks will be right here.<br>Pick up exactly where you left off.</p><button class="primary-button" data-action="resume">${icon('play')} Back to the game</button>`;
  } else if (state.status === 'gameOver') {
    content = `<div class="eyebrow">THERE’S ALWAYS ONE MORE GAME</div><h2>${state.mode === 'puzzle' ? 'So close.' : 'A good run.'}</h2><p>${state.mode === 'puzzle' ? 'A few blocks got left behind.<br>Try a different order this time.' : `${state.score.toLocaleString()} points. ${state.cleared} blocks cleared.<br>Ready to beat that?`}</p><button class="primary-button" data-action="${runWasJourney ? 'journey' : 'restart'}">${icon('restart')} ${runWasJourney ? 'Back to your journey' : 'Give it another go'}</button>${state.mode === 'puzzle' ? '<button class="secondary-button" data-action="undo">Undo the last move</button>' : ''}`;
  } else if (state.status === 'levelComplete' || state.status === 'won') {
    const puzzle = state.mode === 'puzzle';
    content = `<div class="overlay-art"><i class="c1"></i><i class="c0"></i><i class="c2"></i></div><div class="eyebrow">NICELY DONE</div><h2>${journeyCompleted ? 'One step further!' : puzzle ? 'A clean sweep!' : state.status === 'won' ? 'Time well spent.' : `Level ${state.level}. Collapsed.`}</h2><p>${state.score.toLocaleString()} points and counting.<br>${journeyCompleted ? 'Your coins and next stop are waiting.' : puzzle ? 'Another little brainteaser awaits.' : 'That felt good, didn’t it?'}</p>${state.lastScoring?.clearedSides.length ? `<div class="overlay-score-receipt"><b>${clearLabel(state.lastScoring)} ×${formatMultiplier(state.lastScoring.clearMultiplier)}</b><span>+${state.lastScoring.clearBonusPoints.toLocaleString()} bonus · +${state.lastScoring.totalPoints.toLocaleString()} this move</span></div>` : ''}<button class="primary-button" data-action="${journeyCompleted ? 'journey' : state.status === 'won' && !puzzle ? 'restart' : 'next'}">${icon('play')} ${journeyCompleted ? 'Back to your journey' : puzzle ? 'Next puzzle' : state.status === 'won' ? 'Play again' : 'On to the next level'}</button>`;
  }
  $('board-overlay').innerHTML = content ? `<div class="overlay-card">${content}</div>` : '';
}

function renderStats() {
  const puzzle = state.mode === 'puzzle';
  const bonus = state.phase === 'bonus';
  const timed = state.mode === 'countdown' || bonus;
  const roundTimeRemaining = bonus ? state.bonusRemaining : state.mode === 'countdown' ? state.timeLeft : 0;
  const countdown = $('round-countdown');
  const countdownDigit = state.status === 'playing' && roundTimeRemaining > 0 && roundTimeRemaining <= 5000
    ? String(Math.ceil(roundTimeRemaining / 1000)) : '';
  countdown.hidden = !countdownDigit;
  if (countdown.textContent !== countdownDigit) countdown.textContent = countdownDigit;
  const remaining = Math.max(0, state.rowsTarget - state.rowsAdded);
  $('score').textContent = state.score.toLocaleString('en-US', { minimumIntegerDigits: 4, useGrouping: false });
  $('best-score').textContent = Math.max(records[`${state.mode}:${state.difficulty}`]?.score || 0, state.score).toLocaleString();
  $('level-label').textContent = String(puzzle ? state.puzzleIndex + 1 : state.level).padStart(2, '0');
  $('cabinet-level').textContent = `${puzzle ? 'PUZZLE' : 'LEVEL'} ${String(puzzle ? state.puzzleIndex + 1 : state.level).padStart(2, '0')}`;
  $('phase-label').textContent = bonus ? 'BONUS ROUND · DOUBLE POINTS' : labels[state.mode];
  $('cabinet-state').textContent = state.freezeRemaining > 0 ? `FROZEN · ${Math.ceil(state.freezeRemaining / 1000)}s` : bonus ? 'BONUS! CLEAR THE BOARD' : state.status === 'ready' ? 'READY TO PLAY' : state.status === 'playing' ? (state.combo > 1 ? `${state.combo} IN A ROW · ×${formatMultiplier(1 + .15 * (state.combo - 1))} STREAK` : 'LET THE GOOD TIMES ROLL') : state.status === 'paused' ? 'TAKING A BREATHER' : state.status === 'gameOver' ? 'UNTIL NEXT TIME' : 'BEAUTIFULLY PLAYED';
  $('game-status-dot').style.background = state.status === 'playing' ? '#75aa8a' : '#e98256';
  $('progress-title').textContent = puzzle ? 'PUZZLE PROGRESS' : timed ? 'TIME REMAINING' : 'LEVEL PROGRESS';
  let progress = puzzle ? 1 - countBlocks(state) / PUZZLES[state.puzzleIndex].rows.join('').replace(/\./g, '').length : state.mode === 'continuous' ? (state.rowsAdded % 12) / 12 : state.rowsAdded / state.rowsTarget;
  if (timed) progress = (bonus ? state.bonusRemaining / state.bonusDuration : state.timeLeft / 120000);
  $('level-progress-fill').style.width = `${Math.max(0, Math.min(1, progress)) * 100}%`;
  $('progress-description').textContent = puzzle ? state.puzzleName : bonus ? 'A little bonus. Make it count!' : state.mode === 'strategy' ? 'Every good move brings a fresh row.' : state.mode === 'continuous' ? 'Keep going. You’re on a roll.' : state.mode === 'countdown' ? 'Two minutes to make your mark.' : `${remaining} fresh ${remaining === 1 ? 'row' : 'rows'} between you and the next level.`;
  $('cleared-count').textContent = state.cleared;
  $('second-stat-label').textContent = timed ? 'SECONDS LEFT' : puzzle ? 'MOVES' : state.mode === 'continuous' ? 'ROWS SURVIVED' : 'ROWS TO GO';
  $('second-stat').textContent = timed ? Math.ceil((bonus ? state.bonusRemaining : state.timeLeft) / 1000) : puzzle ? state.moves : state.mode === 'continuous' ? state.rowsAdded : remaining;
  $('row-progress-fill').style.width = `${puzzle ? 0 : bonus ? (1 - state.bonusRemaining / state.bonusDuration) * 100 : state.rowProgress * 100}%`;
  $('feeder-title').textContent = puzzle ? 'NO NEW ROWS. JUST YOU AND THE PUZZLE.' : bonus ? 'NO NEW ROWS · DOUBLE POINTS' : state.mode === 'relapse' ? `NEXT ROW · FROM THE ${state.nextSide.toUpperCase()}` : 'NEXT ROW';
  $('feeder-caption').textContent = puzzle || bonus ? '' : state.mode === 'strategy' ? 'AFTER YOUR NEXT MOVE' : 'TAKE A PEEK ↓';
  $('add-row').disabled = state.status !== 'playing' || puzzle || bonus;
  $('add-row').innerHTML = `${icon('arrow')} ${state.mode === 'strategy' ? 'Skip a row' : 'Add a row'} <kbd>SPACE</kbd>`;
  $('pause-button').disabled = !['playing', 'paused'].includes(state.status);
  $('pause-button').innerHTML = icon(state.status === 'paused' ? 'play' : 'pause');
  $('pause-button').setAttribute('aria-label', state.status === 'paused' ? 'Resume game' : 'Pause game');
  $('hint-button').disabled = state.status !== 'playing';
  renderScoreReceipt();
}

function render() {
  renderBoard(); renderOverlay(); renderStats();
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
  receipt.innerHTML = `<div class="receipt-heading"><span class="receipt-eyebrow">LAST CLEAR</span><strong>+${scoring.totalPoints.toLocaleString()}</strong></div><p class="receipt-base">${scoring.clearedCount} ${scoring.clearedCount === 1 ? 'block' : 'blocks'} · ${scoring.basePoints.toLocaleString()} base points</p><div class="receipt-factors"><span>×${formatMultiplier(scoring.sizeMultiplier)} group</span><span>×${formatMultiplier(scoring.streakMultiplier)} streak</span>${scoring.roundMultiplier > 1 ? `<span>×${formatMultiplier(scoring.roundMultiplier)} bonus round</span>` : ''}</div><p class="receipt-subtotal">${scoring.movePoints.toLocaleString()} move points${scoring.clearMultiplier > 1 ? ' before clear bonus' : ''}</p>${scoring.clearMultiplier > 1 ? `<div class="receipt-clear"><b>${clearLabel(scoring)} ×${formatMultiplier(scoring.clearMultiplier)}</b><span>+${scoring.clearBonusPoints.toLocaleString()} bonus points</span></div>` : ''}`;
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

function scoreFeedback(result, col = COLS / 2 - .5, row = ROWS / 2) {
  const scoring = result.scoring;
  if (!scoring?.clearedCount) return;
  const score = $('float-score');
  score.innerHTML = `<strong>+${scoring.totalPoints.toLocaleString()}</strong><span>${scoring.clearedCount} cleared · ×${formatMultiplier(scoring.sizeMultiplier)} group</span>`;
  score.style.left = `${Math.max(20, Math.min(80, (col + .5) * 100 / COLS))}%`;
  score.style.top = `${Math.max(14, Math.min(86, (row + .5) * 100 / ROWS))}%`;
  score.classList.remove('show');
  void score.offsetWidth;
  score.classList.add('show');
  clearTimeout(floatScoreTimeout);
  floatScoreTimeout = setTimeout(() => score.classList.remove('show'), 1150);
  clearTimeout(celebrationTimeout);
  $('clear-celebration').classList.remove('show');
  if (scoring.clearMultiplier > 1) {
    const celebration = $('clear-celebration');
    celebration.innerHTML = `<span>${clearLabel(scoring)}</span><strong>×${formatMultiplier(scoring.clearMultiplier)} POINTS</strong><small>+${scoring.clearBonusPoints.toLocaleString()} bonus</small>`;
    celebration.classList.remove('show');
    void celebration.offsetWidth;
    celebration.classList.add('show');
    celebrationTimeout = setTimeout(() => celebration.classList.remove('show'), 2300);
  }
}

let history = [];
function clearBlock(col, row) {
  if (state.status !== 'playing') return;
  const before = state.mode === 'puzzle' ? structuredClone(state) : null;
  const result = clearAt(state, col, row);
  clearSelection();
  if (!result.valid) {
    const cell = state.board[row]?.[col];
    if (cell) { const element = elements.get(cell.id); element?.classList.add('invalid'); setTimeout(() => element?.classList.remove('invalid'), 400); }
    $('selection-label').textContent = result.message || 'Try a group of 3 or more';
    return;
  }
  if (before) history.push(before);
  removalEffects(result);
  const transferred = result.transferred.length;
  const absorbed = result.absorbed.length;
  $('selection-label').textContent = transferred ? `${transferred} ${transferred === 1 ? 'block' : 'blocks'} moved to the other side.` : absorbed ? `${result.removed.length} cleared · ${absorbed} ${absorbed === 1 ? 'special' : 'specials'} removed quietly.` : `${result.removed.length} blocks. Nice choice!`;
  scoreFeedback(result, col, row);
  recordScore();
  render();
  checkEnd();
}

function removalEffects(result) {
  const absorbed = new Set(result.absorbed.map(cell => cell.id));
  for (const id of absorbed) elements.get(id)?.classList.add('absorbed');
  const activated = result.activated;
  tone(activated.some(cell => cell.kind === 'bomb' || cell.kind === 'colorBomb') ? 'bomb' : activated.some(cell => cell.kind === 'gravity') ? 'row' : 'clear', result.removed.length);
  burst(result.removed.filter(cell => !absorbed.has(cell.id)));
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

function checkEnd() {
  if (journey.finishRun(state)) {
    journeyCompleted = true;
    state.status = 'won';
    lastOverlayKey = '';
    render();
  }
  if (['levelComplete', 'won', 'gameOver'].includes(state.status) && !recorded) {
    recorded = true;
    recordScore();
    if (state.status !== 'gameOver') tone('complete');
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

function hint() {
  if (state.status !== 'playing') return;
  const target = getHint(state);
  if (!target) return toast(state.mode === 'puzzle' ? 'No matches left. Undo with U or try the puzzle again.' : 'No groups yet. A new row might help.');
  const group = getGroup(state, target.col, target.row);
  (group.length >= 3 ? group : [state.board[target.row][target.col]]).forEach(cell => {
    const element = elements.get(cell.id); element?.classList.remove('hinted'); void element?.offsetWidth; element?.classList.add('hinted');
    if (element) {
      clearTimeout(element.hintTimeout);
      element.hintTimeout = setTimeout(() => element.classList.remove('hinted'), 2400);
    }
  });
  focused = target;
  toast(state.mode === 'puzzle' ? 'Try the sparkling group. Think about what falls next.' : 'There’s a promising group for you.');
}

function undo() {
  if (state.mode !== 'puzzle' || !history.length) return toast('No puzzle moves to undo yet.');
  state = history.pop();
  state.status = 'playing';
  recorded = false;
  clearSelection();
  clearTimeout(celebrationTimeout);
  clearTimeout(floatScoreTimeout);
  $('clear-celebration').classList.remove('show');
  $('float-score').classList.remove('show');
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
    <ol class="instructions-list"><li><b>Find your group.</b> Tap 3 or more touching ordinary blocks of the same color. Blocks connect up, down, left, and right.</li><li><b>Make room for more.</b> Blocks fall into the gaps. Empty columns gather toward the center. Bigger groups earn more points.</li><li><b>Save a special.</b> Bombs and gravity blocks are rare. Tap one to use it. Clearing an ordinary group touching a bomb or gravity block removes it quietly, without activating it.</li><li><b>Keep an eye on the next row.</b> Don’t let the stack reach the top. In Relapse, keep the top and bottom stacks apart.</li></ol>
    <h3>${MODES.find(mode => mode.id === state.mode).name} mode</h3><p>${MODES.find(mode => mode.id === state.mode).description}</p>
    <div class="special-list"><div class="special-item"><span class="special-symbol bomb" aria-hidden="true">✹</span><span><b>Black blast bomb</b>Tap to clear a 5 × 5 area, even gray blocks.</span></div><div class="special-item"><span class="special-symbol colorBomb c0" aria-hidden="true">✹</span><span><b>Color bomb</b>A colored ring marks the color it clears across the board.</span></div><div class="special-item"><span class="special-symbol stone" aria-hidden="true">×</span><span><b>Gray blocks</b>A little obstacle. Save a blast bomb for these.</span></div><div class="special-item"><span class="special-symbol gravity" aria-hidden="true">↕</span><span><b>Relapse gravity block</b>Tap to move its entire stack to the other side.</span></div></div>
    <p class="modal-note">Specials caught by a bomb also disappear without activating. A gravity block moves the blocks on its own side; the next row keeps its scheduled side.</p>
    <h3>Bigger groups. A better score.</h3><p>Each cleared block starts at 20 points. For 3 or more blocks, the group multiplier is (blocks + 1) ÷ 4. That makes <b>3 blocks = 60</b>, <b>6 = 210</b>, and <b>10 = 550 points</b> before streaks and clear bonuses. Groups of 6 or more gently rock when selected; 10 or more get a little extra sparkle.</p><p>Quick clears build a streak: each step adds 0.15 to the streak multiplier (×1, ×1.15, ×1.30…). Bonus rounds add ×2. We round those move points to a whole number, then apply a clear bonus: <b>empty the board for ×2</b>; in Relapse, <b>empty either side for ×2, or both in one move for ×3</b>. The receipt below your score shows exactly how each clear added up.</p><p class="modal-note">Specials removed quietly count toward the clear. A move that removes only 1 or 2 blocks earns 10 or 30 base points. Moving a Relapse stack with gravity does not earn a side-clear bonus.</p>
    <h3>A little adventure, too.</h3><p>Open The journey to explore 25 stages, earn game coins, and pick up a boost in the shop. The arcade’s three reels use game coins only.</p><h3>Make yourself comfortable.</h3><div class="keyboard-hints"><span>ARROWS · Select block</span><span>ENTER · Clear group</span><span>SPACE · Add row</span><span>P · Pause</span><span>H · Hint</span><span>U · Undo puzzle move</span></div><p class="modal-note">This is a playtest recreation with original puzzles and a new journey. Rules, timing, and scoring are being tuned against the collection.</p>`);
}

function showRecords() {
  const difficulties = ['easy', 'normal', 'hard'];
  openModal('A LITTLE FRIENDLY COMPETITION', `<h2>Your personal bests.</h2><table class="records-table"><thead><tr><th>MODE</th>${difficulties.map(d => `<th>${d.toUpperCase()}</th>`).join('')}</tr></thead><tbody>${MODES.map(mode => `<tr><td>${mode.name}</td>${difficulties.map(d => `<td>${records[`${mode.id}:${d}`]?.score.toLocaleString() || '—'}</td>`).join('')}</tr>`).join('')}</tbody></table><p class="modal-note">Your records stay in this browser, on this device. A new high score is saved as you play.</p>`);
}

function feedback() {
  openModal('HELP BRING AN OLD FAVORITE BACK', `<h2>How did that feel?</h2><p>Too fast? A bomb you remember differently? A favorite feature missing? Leave yourself a note for the next round of tuning.</p><textarea id="feedback-text" class="feedback-area" aria-label="Playtest note" placeholder="The bit I loved was… The bit I’d change is…" maxlength="3000"></textarea><div class="feedback-actions"><button id="save-note" class="primary-button">Save this note</button><button id="export-notes" class="secondary-button">Export notes ↓</button></div><p class="modal-note">Notes are saved only in this browser. Export them to share; nothing is sent automatically.</p>`);
  $('save-note').onclick = () => {
    const text = $('feedback-text').value.trim();
    if (!text) { $('feedback-text').focus(); return; }
    const notes = storage.get('notes', []);
    notes.push({ text, mode: state.mode, difficulty: state.difficulty, level: state.level, score: state.score, seed: state.seed, rowsAdded: state.rowsAdded, phase: state.phase, version: '0.1.0', date: new Date().toISOString() });
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

$('mode-list').addEventListener('click', event => { const button = event.target.closest('[data-mode]'); if (button) { recordScore(); journey.abandonRun(); runWasJourney = false; history = []; freshGame(button.dataset.mode); } });
for (const id of ['difficulty', 'start-level', 'puzzle-select']) $(id).addEventListener('change', () => { recordScore(); journey.abandonRun(); runWasJourney = false; history = []; freshGame(); });
$('board').addEventListener('click', event => { const button = event.target.closest('.block'); if (button) clearBlock(Number(button.dataset.col), Number(button.dataset.row)); });
$('board').addEventListener('pointerover', event => {
  const button = event.target.closest('.block');
  if (!button) return;
  previewSelection(Number(button.dataset.col), Number(button.dataset.row));
});
$('board').addEventListener('pointerdown', event => {
  const button = event.target.closest('.block');
  if (button) previewSelection(Number(button.dataset.col), Number(button.dataset.row));
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
  if (action === 'help') help();
  if (action === 'journey') journey.openJourney();
  if (action === 'undo') undo();
  if (action === 'next') {
    history = []; recorded = false;
    if (state.mode === 'puzzle') { $('puzzle-select').value = (state.puzzleIndex + 1) % PUZZLES.length; freshGame(); startGame(); }
    else { nextLevel(state); clearSelection(); render(); }
  }
});
$('sound-button').onclick = () => { preferences.sound = !preferences.sound; storage.set('preferences', preferences); updateSoundButton(); if (preferences.sound) tone('clear'); };
$('pause-button').onclick = pause;
$('restart-button').onclick = () => { recordScore(); history = []; freshGame(); };
$('add-row').onclick = requestRow;
$('hint-button').onclick = hint;
$('help-button').onclick = help;
$('quick-help').onclick = help;
$('records-button').onclick = showRecords;
$('journey-button').onclick = journey.openJourney;
$('feedback-button').onclick = feedback;
$('nav-play').onclick = () => $('board').scrollIntoView({ behavior: 'smooth', block: 'center' });
$('close-modal').onclick = () => $('modal').close();
$('modal').addEventListener('click', event => { if (event.target === $('modal')) { const rect = $('modal').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('modal').close(); } });
$('modal').addEventListener('close', () => { if (autoPaused && state.status === 'paused') { state.status = 'playing'; lastFrame = performance.now(); render(); } autoPaused = false; });
document.addEventListener('keydown', event => {
  if ($('modal').open || ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
  const key = event.key.toLowerCase();
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
    if (state.phase === 'bonus' && !before.includes(':bonus:')) toast('Bonus round! No new rows. Double the points.');
    if (result?.message && state.status === 'playing' && state.phase !== 'bonus') $('selection-label').textContent = result.message;
    render(); checkEnd();
  } else if (now - lastStats > 100) {
    if (previewTarget) previewSelection(previewTarget.col, previewTarget.row);
    renderStats(); lastStats = now;
  }
  requestAnimationFrame(frame);
}

freshGame();
requestAnimationFrame(frame);
