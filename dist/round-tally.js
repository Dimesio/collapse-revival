const formatPoints = value => Math.max(0, Math.round(value || 0)).toLocaleString('en-US');
const escapeText = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));

/** Present an already-finalized score. This controller never changes game state. */
export function createRoundTally({ container, getBlockElements = () => [], playTick = () => {}, onScoreChange = () => {}, onFinish = () => {} }) {
  let summary = null;
  let frameId = null;
  let generation = 0;
  let complete = false;
  let displayedScore = null;
  let blockElements = [];
  let countedBlocks = 0;
  let fields = {};
  let lastTick = -Infinity;

  const reducedMotion = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function cancel() {
    generation++;
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    for (const block of blockElements) delete block.dataset.tallyRemaining;
    blockElements = [];
    countedBlocks = 0;
    summary = null;
    complete = false;
    displayedScore = null;
    fields = {};
    container.classList.remove('showing-round-tally', 'showing-classic-tally');
  }

  function markBlocks(count, animate = true) {
    const target = Math.min(blockElements.length, count);
    while (countedBlocks < target) {
      blockElements[countedBlocks].dataset.tallyRemaining = animate ? 'counted' : 'done';
      countedBlocks++;
    }
    if (!animate) for (const block of blockElements) block.dataset.tallyRemaining = 'done';
  }

  function setValues(roundPoints, blocks, penalty) {
    if (!summary) return;
    fields.score.textContent = formatPoints(roundPoints);
    fields.blocks.textContent = formatPoints(blocks);
    fields.penalty.textContent = formatPoints(penalty);
    displayedScore = summary.startScore + Math.max(0, Math.round(roundPoints));
    onScoreChange(displayedScore);
  }

  function finish() {
    if (!summary || complete) return;
    complete = true;
    generation++;
    if (frameId !== null) cancelAnimationFrame(frameId);
    frameId = null;
    markBlocks(summary.remainingBlocks, false);
    setValues(summary.netPoints, summary.remainingBlocks, summary.penaltyPoints);
    displayedScore = summary.totalScore;
    onScoreChange(displayedScore);
    fields.card.dataset.stage = 'complete';
    fields.stage.textContent = 'ROUND POINTS';
    fields.caption.textContent = 'After the leftover-block penalty';
    fields.records.hidden = false;
    if (fields.stars) fields.stars.hidden = false;
    fields.details.hidden = false;
    fields.skip.hidden = true;
    for (const button of fields.actions.querySelectorAll('button')) button.disabled = false;
    fields.announcement.textContent = `Round complete. ${summary.blocksCleared} blocks cleared. Biggest clear: ${summary.highestClear} blocks. ${summary.remainingBlocks} blocks left, minus ${summary.penaltyPoints} points. ${summary.netPoints} points scored. Total score: ${summary.totalScore}.`;
    if (summary.classic) fields.announcement.textContent += ` ${summary.classic.stars} of 3 Classic stars.${summary.classic.provisional ? ' Playtest targets are still being tuned.' : ''}`;
    onFinish(summary);
  }

  function show(nextSummary, { eyebrow = 'ROUND COMPLETE', title = 'Every move adds up.', message = '', actions = '' } = {}) {
    if (!nextSummary || summary === nextSummary) return;
    cancel();
    summary = nextSummary;
    const animationGeneration = generation;
    const hasCarry = summary.startScore > 0;
    const capped = summary.rawPenaltyPoints > summary.penaltyPoints;
    const bonusRows = [
      ['Base points', summary.basePoints],
      ['Group-size bonuses', summary.groupBonusPoints],
      ['Quick-clear streaks', summary.streakBonusPoints],
      ['Bonus round ×2', summary.roundBonusPoints],
      ['All-clears ×2 / ×3', summary.clearBonusPoints],
    ];
    const classic = summary.classic;
    if (classic) bonusRows.push([`Difficulty ×${classic.difficultyMultiplier}`, summary.difficultyBonusPoints], [`Level ×${Number(classic.levelMultiplier.toFixed(2))}`, summary.levelBonusPoints]);
    const nextTarget = classic ? classic.stars < 2 ? classic.twoStars : classic.threeStars : 0;
    const starsHTML = classic ? `<section class="classic-result-stars" hidden aria-label="${classic.stars} of 3 stars"><div aria-hidden="true">${[0, 1, 2].map(index => `<i class="${index < classic.stars ? 'earned' : ''}" style="--star-delay:${index * .12}s">${index < classic.stars ? '★' : '☆'}</i>`).join('')}</div><p>${classic.stars === 0 ? 'Complete the level to earn stars.' : classic.stars === 3 ? 'Three-star mastery!' : `Next star: ${formatPoints(nextTarget)} points · ${formatPoints(Math.max(0, nextTarget - summary.netPoints))} to go`}</p>${classic.provisional ? '<small>Playtest targets · still being tuned</small>' : ''}</section>` : '';
    container.classList.add('showing-round-tally');
    container.classList.toggle('showing-classic-tally', Boolean(classic));
    container.innerHTML = `<article class="overlay-card round-tally-card" data-stage="earned" tabindex="-1" aria-labelledby="round-tally-title">
      <header class="round-tally-header"><div class="eyebrow">${escapeText(eyebrow)}</div><h2 id="round-tally-title">${escapeText(title)}</h2>${message ? `<p>${escapeText(message)}</p>` : ''}</header>
      <div class="round-tally-score" aria-hidden="true"><span data-tally-stage>POINTS EARNED</span><strong data-tally-score>0</strong><small data-tally-caption>Adding up your good moves…</small></div>
      <div class="round-tally-penalty"><span><b data-tally-blocks aria-hidden="true">0</b><span class="round-tally-sr-only">${summary.remainingBlocks}</span> blocks left × ${summary.penaltyPerBlock}</span><strong aria-hidden="true">−<span data-tally-penalty>0</span></strong><span class="round-tally-sr-only">Minus ${summary.penaltyPoints} points.</span></div>
      ${starsHTML}<div class="round-tally-records" hidden><span><b>${formatPoints(summary.highestClear)}</b>Biggest clear</span><span><b>${formatPoints(summary.blocksCleared)}</b>Blocks cleared</span></div>
      <div class="round-tally-details" tabindex="0" role="region" aria-label="Score breakdown" hidden>
        <dl class="round-tally-breakdown">${bonusRows.map(([label, points]) => `<div><dt>${label}</dt><dd>+${formatPoints(points)}</dd></div>`).join('')}<div class="round-tally-gross"><dt>Points earned</dt><dd>${formatPoints(summary.grossPoints)}</dd></div></dl>
        <div class="round-tally-multipliers" aria-label="Multiplier counts"><span>×2 all-clears <b>${summary.doubleClears}</b></span><span>×3 all-clears <b>${summary.tripleClears}</b></span><span>Bonus ×2 <b>${summary.bonusClears}</b></span></div>
        ${capped ? '<p class="round-tally-cap">The penalty stops at zero for this round.</p>' : ''}
        ${hasCarry ? `<div class="round-tally-total"><span>Total score <small>${formatPoints(summary.startScore)} carried forward + ${formatPoints(summary.netPoints)} this round</small></span><b>${formatPoints(summary.totalScore)}</b></div>` : ''}
      </div>
      <div class="round-tally-actions" data-tally-actions>${actions}</div>
      <button class="round-tally-skip" data-action="tally-skip" type="button">Skip count →</button>
      <span class="round-tally-sr-only" role="status" aria-live="polite" data-tally-announcement></span>
    </article>`;
    const query = selector => container.querySelector(selector);
    fields = {
      card: query('.round-tally-card'), stage: query('[data-tally-stage]'), score: query('[data-tally-score]'),
      caption: query('[data-tally-caption]'), blocks: query('[data-tally-blocks]'), penalty: query('[data-tally-penalty]'),
      details: query('.round-tally-details'), records: query('.round-tally-records'), stars: query('.classic-result-stars'), actions: query('[data-tally-actions]'), skip: query('.round-tally-skip'),
      announcement: query('[data-tally-announcement]'),
    };
    for (const button of fields.actions.querySelectorAll('button')) button.disabled = true;
    fields.skip.onclick = event => { event.preventDefault(); finish(); };
    blockElements = Array.from(getBlockElements()).filter(block => block && block.isConnected && !block.classList.contains('removing'));
    blockElements.sort((left, right) => Number(right.dataset.row) - Number(left.dataset.row) || Number(left.dataset.col) - Number(right.dataset.col));
    setValues(0, 0, 0);
    fields.card.focus({ preventScroll: true });
    if (reducedMotion()) { finish(); return; }

    const earnedDuration = 900;
    const penaltyStart = 1200;
    const penaltyDuration = summary.remainingBlocks ? 1350 : 450;
    const finishAt = penaltyStart + penaltyDuration + 300;
    let startTime = null;
    lastTick = -Infinity;

    function animate(now) {
      if (generation !== animationGeneration || !summary || complete) return;
      if (reducedMotion()) { finish(); return; }
      if (startTime === null) startTime = now;
      const elapsed = now - startTime;
      if (elapsed < penaltyStart) {
        const progress = Math.min(1, elapsed / earnedDuration);
        const eased = 1 - (1 - progress) ** 3;
        setValues(Math.round(summary.grossPoints * eased), 0, 0);
        if (progress < 1 && summary.grossPoints && now - lastTick >= 100) { playTick(); lastTick = now; }
      } else {
        fields.card.dataset.stage = 'penalty';
        fields.stage.textContent = 'COUNTING LEFTOVERS';
        fields.caption.textContent = summary.remainingBlocks ? `Each block left behind costs ${summary.penaltyPerBlock} points` : 'A clean board. No points lost.';
        const progress = Math.min(1, (elapsed - penaltyStart) / penaltyDuration);
        const blocks = Math.min(summary.remainingBlocks, Math.floor(summary.remainingBlocks * progress));
        const penalty = Math.min(summary.penaltyPoints, blocks * summary.penaltyPerBlock);
        const previousCount = countedBlocks;
        markBlocks(blocks);
        setValues(summary.grossPoints - penalty, blocks, penalty);
        if (countedBlocks > previousCount && now - lastTick >= 100) { playTick(); lastTick = now; }
      }
      if (elapsed >= finishAt) { finish(); return; }
      frameId = requestAnimationFrame(animate);
    }
    frameId = requestAnimationFrame(animate);
  }

  return { show, cancel, finish, getDisplayedScore: () => displayedScore, isActive: () => Boolean(summary && !complete) };
}
