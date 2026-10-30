import { modifierBonusPercent } from './modifiers.js';
import { mixUnfinished, modifierNames } from './gold.js';

const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const number = value => value.toLocaleString('en-US');
const goldStarText = count => '★'.repeat(count) + '☆'.repeat(3 - count);

/** Gold targets in the same order as regular stars. */
export const goldGoals = targets => `<span class="nowrap">★ Objective</span> · <span class="nowrap">★★ ${number(targets.two)}</span> · <span class="nowrap">★★★ ${number(targets.three)} gold points</span>`;

export function goldBestLine(best) {
  return best ? `Your best gold: <span class="gold-stars">${goldStarText(best.stars)}</span> · ${number(best.adjustedScore)} gold points with ${escapeHtml(modifierNames(best.modifiers).join(' + '))}` : 'No gold stars yet.';
}

function summary(ids, unfinished) {
  if (!ids.length) return 'Choose at least one challenge to start.';
  const bonus = modifierBonusPercent(ids.length);
  const line = `${ids.length} ${ids.length === 1 ? 'challenge' : 'challenges'} · ${bonus ? `+${bonus}% gold bonus` : 'no bonus yet: a second challenge adds 5%'}`;
  return mixUnfinished(ids, unfinished) ? `${line}<strong>Heads up: our test player never finished this stage with this mix. It may be out of reach.</strong>` : line;
}

/**
 * Opens the hard-mode briefing: targets, the best gold so far, and a choice of
 * modifiers. `available` lists the modifiers to offer; `details` can replace a
 * description, e.g. a puzzle's move limit. Calls `onStart` with the chosen ids.
 */
export function openGoldPicker({ openModal, eyebrow = 'GO FOR GOLD', title, subtitle, goal, available, details = {}, targets, best = null, unfinished = [], onStart, onBack, backLabel = 'Back' }) {
  const root = openModal(eyebrow, `<div class="gold-picker">
    <span class="gold-kicker">GOLD-STAR HARD MODE</span><h2>${escapeHtml(title)}</h2>${subtitle ? `<p class="gold-picker-subtitle">${escapeHtml(subtitle)}</p>` : ''}
    <dl class="gold-picker-facts"><div><dt>Objective</dt><dd>${escapeHtml(goal)}</dd></div><div><dt>Gold stars</dt><dd>${goldGoals(targets)}</dd></div><div><dt>So far</dt><dd>${goldBestLine(best)}</dd></div></dl>
    <fieldset class="gold-modifiers"><legend>Choose your challenges</legend>${available.map(item => `<label class="gold-modifier"><input type="checkbox" value="${item.id}"><span><b>${escapeHtml(item.name)}</b><small>${escapeHtml(details[item.id] || item.description)}</small></span></label>`).join('')}</fieldset>
    <p class="gold-picker-summary" role="status" aria-live="polite">${summary([], unfinished)}</p>
    <div class="gold-picker-actions"><button type="button" class="primary-button" data-gold-start disabled>Start the gold run</button><button type="button" class="secondary-button" data-gold-back>${escapeHtml(backLabel)}</button></div>
    <p class="modal-note">Gold points are your round points after leftover blocks, plus 5% for two challenges or 10% for three or more. Your score and regular stars stay as they are. Gold targets are playtest values, still being tuned.</p>
  </div>`);
  const chosen = () => available.map(item => item.id).filter(id => root.querySelector(`input[value="${id}"]`).checked);
  root.querySelector('.gold-modifiers').addEventListener('change', () => {
    const ids = chosen();
    root.querySelector('[data-gold-start]').disabled = !ids.length;
    root.querySelector('.gold-picker-summary').innerHTML = summary(ids, unfinished);
  });
  root.querySelector('[data-gold-start]').addEventListener('click', () => { const ids = chosen(); if (ids.length) onStart(ids); });
  root.querySelector('[data-gold-back]').addEventListener('click', () => onBack());
  return root;
}
