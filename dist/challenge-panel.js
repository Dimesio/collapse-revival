import { MODES } from './engine.js';
import { PUZZLES } from './puzzles.js';
import { OBJECTIVE_TYPES, describeObjective } from './objectives.js';
import { modifiersForMode } from './modifiers.js';
import { CHALLENGE_LEVELS, CHALLENGE_VERSION, decodeChallenge, describeChallenge, encodeChallenge, extractCode, findWeekly, validateChallenge, weeklyChallenge } from './challenges.js';

const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const number = value => value.toLocaleString('en-US');
const DAY = 86400000;
const HOUR = 3600000;

/** How long a weekly has left, in the largest whole unit. */
export function timeLeft(end, now = Date.now()) {
  const left = end - now;
  if (left >= 2 * DAY) return `${Math.floor(left / DAY)} days left`;
  if (left >= DAY) return '1 day left';
  const hours = Math.floor(left / HOUR);
  return hours >= 2 ? `${hours} hours left` : hours === 1 ? '1 hour left' : 'Under an hour left';
}

/** A week's dates in UTC, such as "Oct 26 – Nov 1". */
export function weekDates(week) {
  const day = time => new Date(time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${day(week.start)} – ${day(week.end - 1)}`;
}

/** The best result for a challenge in a few words. */
export function bestLine(entry) {
  if (!entry?.attempts) return 'Not played yet.';
  const tries = `${entry.attempts} ${entry.attempts === 1 ? 'try' : 'tries'}`;
  if (!entry.best) return `${tries} so far · no finished round yet.`;
  if (entry.best.completed) return `Your best: ✓ ${number(entry.best.points)} points · completed ${entry.completions} of ${tries}.`;
  return `Not completed yet · best try ${number(entry.best.points)} points · ${tries}.`;
}

const OBJECTIVE_LABELS = { finish: 'Just finish', score: 'Earn points', group: 'Clear a big group', blocks: 'Clear blocks', allClear: 'Clear the board', fewBlocks: 'Finish with few blocks left', streak: 'Chain quick clears' };
const DEFAULT_TARGETS = { score: 30000, group: 10, blocks: 300, allClear: 1, fewBlocks: 20, streak: 6 };
const objectiveLabel = (type, mode) => type === 'allClear' && mode === 'relapse' ? 'Empty a side' : OBJECTIVE_LABELS[type];
const objectivesFor = mode => Object.keys(OBJECTIVE_TYPES).filter(type => OBJECTIVE_TYPES[type].modes.includes(mode));
const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

/**
 * The challenges dialog: this week's challenge, a code or link to load, a
 * challenge of your own, and your results. `onPlay` receives
 * { challenge, code, name, week }; `copy(text, done)` and `linkFor(code)` come
 * from the page.
 */
export function createChallengePanel({ openModal, store, onPlay, copy, linkFor, now = () => Date.now() }) {
  let view = 'week';
  let codeText = '';
  let draft = { version: CHALLENGE_VERSION, mode: 'classic', difficulty: 'easy', level: 1, puzzleIndex: 0, seed: randomSeed(), objective: { type: 'group', target: 10 }, modifiers: ['noBoosts'] };
  // What each Play button on the open view starts, by code.
  let playable = new Map();

  /** A weekly label and name for a code, when it is one of the weeklies so far. */
  function meta(challenge, { name = '', week = null } = {}) {
    const code = encodeChallenge(challenge);
    const weekly = week ? null : findWeekly(code, now());
    return { challenge, code, name: name || weekly?.name || '', week: week || weekly?.week || null };
  }

  function card(entry, { kicker, time = '', title, play = 'Play this challenge', note = '' }) {
    playable.set(entry.code, entry);
    const words = describeChallenge(entry.challenge);
    const rules = words.rules.length ? words.rules.map(rule => `<span class="ch-rule"><b>${escapeHtml(rule.name)}</b> ${escapeHtml(rule.description)}</span>`).join('') : 'Standard rules. Boosts and hints are allowed.';
    return `<article class="ch-card">
      <div class="ch-card-top"><span class="ch-kicker">${kicker}</span>${time ? `<span class="ch-time">${time}</span>` : ''}</div>
      <h3>${escapeHtml(title)}</h3>
      <dl class="ch-rules">
        <div><dt>Game</dt><dd>${escapeHtml(words.setup)}</dd></div>
        <div><dt>Objective</dt><dd>${escapeHtml(words.goal)}</dd></div>
        <div><dt>Rules</dt><dd>${rules}</dd></div>
        <div><dt>Board</dt><dd>${entry.challenge.mode === 'puzzle' ? 'The same puzzle for everyone.' : 'The same starting board and incoming rows for everyone.'}</dd></div>
      </dl>
      ${note}<p class="ch-best">${bestLine(store.entry(entry.code))}</p>
      <div class="ch-actions"><button type="button" class="primary-button" data-ch-play="${entry.code}">${play}</button><button type="button" class="secondary-button" data-ch-link="${entry.code}">Copy the link</button></div>
      <p class="ch-code">Code <code>${entry.code}</code></p>
    </article>`;
  }

  const kickerFor = entry => entry.week ? `WEEKLY CHALLENGE · ${entry.week.id}` : 'SHARED CHALLENGE';

  function weekView() {
    const weekly = weeklyChallenge(now());
    const entry = meta(weekly, { name: weekly.name, week: weekly.week });
    const reset = new Date(weekly.week.end).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });
    return card(entry, {
      kicker: `THIS WEEK · ${weekDates(weekly.week).toUpperCase()} · UTC`, time: timeLeft(weekly.week.end, now()), title: weekly.name, play: 'Play this week’s challenge',
      note: `<p class="ch-reset">A new challenge arrives Monday at 00:00 UTC (${escapeHtml(reset)} your time). Play as often as you like; your best counts.</p>`,
    });
  }

  function codeView() {
    const result = codeText ? decodeChallenge(codeText) : null;
    const entry = result?.ok ? meta(result.challenge) : null;
    return `<form class="ch-code-form" data-ch-code-form><label for="ch-code-input">Challenge code or link</label><div><input id="ch-code-input" name="code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="CR1-…" value="${escapeHtml(codeText)}"><button type="submit" class="primary-button">Load it</button></div></form>
      ${result && !result.ok ? `<p class="ch-error" role="alert">${escapeHtml(result.reason)}</p>` : ''}
      ${entry ? card(entry, { kicker: kickerFor(entry), title: entry.name || 'A shared challenge' }) : result ? '' : '<p class="ch-empty">Paste a code like CR1-CLE3-G12-B-… or a challenge link. The same code builds the same board and rules on any device.</p>'}`;
  }

  function makeView() {
    const checked = validateChallenge(draft);
    const puzzle = draft.mode === 'puzzle';
    const type = draft.objective.type;
    const rule = OBJECTIVE_TYPES[type];
    const option = (value, label, selected) => `<option value="${value}"${selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
    if (checked.ok) playable.set(encodeChallenge(checked.challenge), meta(checked.challenge, { name: 'Your challenge' }));
    return `<form class="ch-make" data-ch-make>
      <div class="ch-fields">
        <label>Mode <select data-field="mode">${MODES.map(mode => option(mode.id, mode.name, mode.id === draft.mode)).join('')}</select></label>
        ${puzzle
          ? `<label class="ch-wide">Puzzle <select data-field="puzzleIndex">${PUZZLES.map((item, index) => option(index, `${String(index + 1).padStart(2, '0')} · ${item.name}`, index === draft.puzzleIndex)).join('')}</select></label>`
          : `<label>Difficulty <select data-field="difficulty">${['easy', 'normal', 'hard'].map(value => option(value, `${value[0].toUpperCase()}${value.slice(1)}`, value === draft.difficulty)).join('')}</select></label>
             <label>Level <select data-field="level">${Array.from({ length: CHALLENGE_LEVELS.max }, (_, index) => option(index + 1, String(index + 1), index + 1 === draft.level)).join('')}</select></label>`}
        <label>Objective <select data-field="objective">${objectivesFor(draft.mode).map(value => option(value, objectiveLabel(value, draft.mode), value === type)).join('')}</select></label>
        ${type === 'finish' ? '' : `<label>Target <input type="number" inputmode="numeric" data-field="target" min="${rule.min}" max="${rule.max}" step="1" value="${Number.isFinite(draft.objective.target) ? draft.objective.target : ''}"></label>`}
      </div>
      <fieldset class="gold-modifiers ch-modifiers"><legend>Rules</legend>${modifiersForMode(draft.mode).map(item => `<label class="gold-modifier"><input type="checkbox" data-modifier="${item.id}"${draft.modifiers.includes(item.id) ? ' checked' : ''}><span><b>${escapeHtml(item.name)}</b><small>${escapeHtml(item.description)}</small></span></label>`).join('')}</fieldset>
      ${puzzle ? '' : `<div class="ch-board"><span>Board <code>${draft.seed.toString(16).toUpperCase().padStart(8, '0')}</code></span><button type="button" class="secondary-button" data-ch-reseed>Shuffle the board</button></div>`}
      <div class="ch-draft" aria-live="polite">${draftSummary(checked)}</div>
      <p class="modal-note">Turn on No boosts to compare fairly: boosts come from each player’s own Journey pocket. Targets you choose are untested, so try your challenge before you share it.</p>
    </form>`;
  }

  function draftSummary(checked) {
    if (!checked.ok) return `<p class="ch-error" role="alert">${escapeHtml(checked.reason)}</p>`;
    const code = encodeChallenge(checked.challenge);
    return `<p class="ch-draft-goal">${escapeHtml(describeObjective(checked.challenge.objective, checked.challenge.mode))}</p><p class="ch-code">Code <code>${code}</code></p><div class="ch-actions"><button type="button" class="primary-button" data-ch-play="${code}">Play it</button><button type="button" class="secondary-button" data-ch-link="${code}">Copy the link</button></div>`;
  }

  function resultsView() {
    const recent = store.recent(12);
    if (!recent.length) return '<p class="ch-empty">Play a challenge and your results appear here. Each exact challenge keeps its own best, so a different board, objective or rule starts a new record.</p>';
    return `<ol class="ch-results">${recent.map(item => {
      const entry = meta(item.challenge, { name: item.name, week: item.week ? { id: item.week } : null });
      playable.set(entry.code, entry);
      const words = describeChallenge(item.challenge);
      return `<li><div><b>${escapeHtml(entry.name || words.setup)}</b><small>${entry.week ? `Weekly · ${entry.week.id}` : 'Shared challenge'}</small><span>${entry.name ? `${escapeHtml(words.setup)} · ` : ''}${escapeHtml(words.goal)}${words.modifiers.length ? ` · ${escapeHtml(words.modifiers.join(' · '))}` : ''}</span><span class="ch-best">${bestLine(item)}</span><code>${entry.code}</code></div><div class="ch-result-actions"><button type="button" class="secondary-button" data-ch-play="${entry.code}">Play again</button><button type="button" class="secondary-button" data-ch-link="${entry.code}">Copy the link</button></div></li>`;
    }).join('')}</ol>`;
  }

  function show(next = view, focus = null) {
    view = next;
    playable = new Map();
    const body = { week: weekView, code: codeView, make: makeView, results: resultsView }[view]();
    const count = store.recent(60).length;
    const tab = (id, label) => `<button type="button" data-ch-view="${id}"${id === view ? ' aria-current="page"' : ''}>${label}</button>`;
    const root = openModal('A LITTLE FRIENDLY RIVALRY', `<div class="challenge-shell">
      <div class="ch-toolbar"><div><span class="ch-kicker">SAME BOARD · SAME RULES</span><h2>Challenges.</h2></div><nav aria-label="Challenge views">${tab('week', 'This week')}${tab('code', 'Enter a code')}${tab('make', 'Make your own')}${tab('results', `Your results${count ? ` <small>${count}</small>` : ''}`)}</nav></div>
      <div class="ch-body">${body}</div>
      <p class="ch-footnote">A challenge is a short code holding its mode, level, board, objective and rules, so it plays the same on every device. Results stay in this browser and never count toward your regular records. Copy yours to compare. Weekly targets are playtest values.</p>
    </div>`);
    bind(root);
    if (focus) root.querySelector(focus)?.focus();
    return root;
  }

  function bind(root) {
    root.querySelectorAll('[data-ch-view]').forEach(button => button.addEventListener('click', () => show(button.dataset.chView)));
    root.addEventListener('click', event => {
      const play = event.target.closest('[data-ch-play]');
      const link = event.target.closest('[data-ch-link]');
      if (play && playable.has(play.dataset.chPlay)) onPlay(playable.get(play.dataset.chPlay));
      // The page's toast sits behind the dialog, so the button itself says it worked.
      if (link) copy(linkFor(link.dataset.chLink), 'Link copied. Anyone who opens it gets the same board and rules.').then(done => {
        if (!done || !link.isConnected) return;
        link.textContent = 'Link copied ✓';
        setTimeout(() => { link.textContent = 'Copy the link'; }, 1800);
      });
      if (event.target.closest('[data-ch-reseed]')) { draft = { ...draft, seed: randomSeed() }; show('make', '[data-ch-reseed]'); }
    });
    root.querySelector('[data-ch-code-form]')?.addEventListener('submit', event => {
      event.preventDefault();
      codeText = event.target.elements.code.value.trim();
      show('code', '#ch-code-input');
    });
    const make = root.querySelector('[data-ch-make]');
    if (!make) return;
    make.addEventListener('submit', event => event.preventDefault());
    make.addEventListener('change', event => {
      const field = event.target.dataset.field;
      const modifier = event.target.dataset.modifier;
      if (modifier) draft = { ...draft, modifiers: event.target.checked ? [...draft.modifiers, modifier] : draft.modifiers.filter(id => id !== modifier) };
      else if (field === 'mode') {
        const mode = event.target.value;
        const type = objectivesFor(mode).includes(draft.objective.type) ? draft.objective.type : 'group';
        const offered = modifiersForMode(mode).map(item => item.id);
        draft = { ...draft, mode, objective: type === 'finish' ? { type } : { type, target: draft.objective.target ?? DEFAULT_TARGETS[type] }, modifiers: draft.modifiers.filter(id => offered.includes(id)) };
      } else if (field === 'objective') {
        const type = event.target.value;
        draft = { ...draft, objective: type === 'finish' ? { type } : { type, target: DEFAULT_TARGETS[type] } };
      } else if (field === 'target') return;
      else if (field) draft = { ...draft, [field]: field === 'difficulty' ? event.target.value : Number(event.target.value) };
      show('make', modifier ? `[data-modifier="${modifier}"]` : `[data-field="${field}"]`);
    });
    // Typing a target updates the code in place, so the field keeps its focus.
    make.querySelector('[data-field="target"]')?.addEventListener('input', event => {
      const value = event.target.value.trim();
      draft = { ...draft, objective: { type: draft.objective.type, target: /^\d+$/.test(value) ? Number(value) : NaN } };
      const checked = validateChallenge(draft);
      if (checked.ok) playable.set(encodeChallenge(checked.challenge), meta(checked.challenge, { name: 'Your challenge' }));
      make.querySelector('.ch-draft').innerHTML = draftSummary(checked);
    });
  }

  return {
    open: (next = 'week') => show(next),
    /** Opens a code or link, such as the one in the page address, ready to play. */
    openCode(text) { codeText = extractCode(text); return show('code'); },
    /** This week's challenge, ready for onPlay. */
    weekly() { const weekly = weeklyChallenge(now()); return meta(weekly, { name: weekly.name, week: weekly.week }); },
  };
}
