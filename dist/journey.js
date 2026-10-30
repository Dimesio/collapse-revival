import { roundPoints } from './engine.js';
import { describeObjective, describeProgress, evaluateObjective } from './objectives.js';
import { normalizeModifiers, modifiersForMode, validateModifiers } from './modifiers.js';
import { getClassicTargets, getClassicGoldTargets } from './classic-stars.js';
import { PUZZLES } from './puzzles.js';
import { moveLimitText } from './puzzle-stars.js';
import { goldUnlocked, goldResult, goldImproves } from './gold.js';
import { openGoldPicker } from './gold-picker.js';

const modeNames = { classic: 'Classic', strategy: 'Strategy', puzzle: 'Puzzle', relapse: 'Relapse', continuous: 'Continuous', countdown: 'Countdown', slider: 'Slider' };
const modeSymbols = { classic: '▦', strategy: '⌘', puzzle: '◇', relapse: '↕', continuous: '∞', countdown: '◷', slider: '⇄' };
const stage = (name, mode, options = {}) => ({ name, mode, difficulty: 'easy', level: 1, ...options });
const goal = (type, target) => ({ type, target });

// From tools/calibrate-journey.js: `stars` holds the two- and three-star round
// points and `gold` the provisional gold-star ones. Classic stages share
// Classic's own regular and gold targets. `unfinished` lists the hard-mode mixes
// of play-changing modifiers the reference player never finished.
export const WORLDS = [
  { id: 'sunroom', name: 'The Sunroom', subtitle: 'A familiar little beginning', description: 'Sun on the windows. A favorite game. There is no hurry to get anywhere.', stages: [
    stage('A Familiar Spark', 'classic', { objective: goal('group', 12) }),
    stage('Room to Think', 'strategy', { objective: goal('fewBlocks', 20), stars: [21650, 33250], gold: [47050, 52250] }),
    stage('Corner by Corner', 'puzzle', { puzzleIndex: 2, stars: [320, 320], gold: [370, 385] }),
    stage('A Gentle Rhythm', 'continuous', { objective: goal('blocks', 590), stars: [34000, 52300], gold: [65000, 72200] }),
    stage('Two-Minute Tea', 'countdown', { objective: goal('score', 33000), stars: [54050, 83100], gold: [102100, 113450] }),
  ] },
  { id: 'pier', name: 'Lantern Pier', subtitle: 'A few new twists', description: 'Take the long way along the water. The lights are just coming on.', stages: [
    stage('Side Street', 'slider', { objective: goal('group', 15), stars: [23750, 36500], gold: [40100, 44600] }),
    stage('From Both Shores', 'relapse', { objective: goal('fewBlocks', 25), stars: [12450, 19100], gold: [26650, 29600], unfinished: [['fastRows', 'tallStart']] }),
    stage('Paper Wings', 'puzzle', { puzzleIndex: 6, objective: goal('group', 10), stars: [2540, 3140], gold: [3640, 3828] }),
    stage('One Step Ahead', 'strategy', { level: 2, objective: goal('group', 28), stars: [24900, 38250], gold: [54200, 60200] }),
    stage('Lantern Light', 'classic', { level: 3, objective: goal('group', 15) }),
  ] },
  { id: 'glasshouse', name: 'The Glasshouse', subtitle: 'Let the colors grow', description: 'A winding path through bright patterns, patient planning, and little surprises.', stages: [
    stage('Ripples in Glass', 'puzzle', { puzzleIndex: 10, objective: goal('group', 12), stars: [4050, 5550], gold: [6440, 6776] }),
    stage('Winding Path', 'slider', { difficulty: 'normal', level: 2, objective: goal('group', 8), stars: [13750, 21150], gold: [24500, 27250] }),
    stage('A Passing Shower', 'countdown', { difficulty: 'normal', level: 2, objective: goal('blocks', 780), stars: [49150, 75550], gold: [96150, 106800] }),
    stage('Growing Season', 'continuous', { difficulty: 'normal', level: 3, objective: goal('blocks', 550), stars: [22550, 34650], gold: [38100, 42350] }),
    stage('Roots and Branches', 'relapse', { difficulty: 'normal', level: 2, objective: goal('group', 8), stars: [10800, 16550], gold: [23550, 26150] }),
  ] },
  { id: 'arcade', name: 'Starlight Arcade', subtitle: 'One more good game', description: 'The evening is young, the cabinet is glowing, and your next good move is waiting.', stages: [
    stage('The Thoughtful Move', 'strategy', { difficulty: 'normal', level: 4, stars: [18600, 28600], gold: [38050, 42250] }),
    stage('Secret Garden', 'puzzle', { puzzleIndex: 15, objective: goal('group', 15), stars: [6190, 9350], gold: [10850, 11418] }),
    stage('Neon Nostalgia', 'classic', { difficulty: 'normal', level: 4, objective: goal('fewBlocks', 50) }),
    stage('A Moving Picture', 'slider', { difficulty: 'hard', level: 3, objective: goal('group', 11), stars: [12550, 19250], gold: [22350, 24850], unfinished: [['tallStart'], ['fastRows', 'tallStart']] }),
    stage('Last Two Minutes', 'countdown', { difficulty: 'normal', level: 11, stars: [23300, 35800], gold: [50400, 56000] }),
  ] },
  { id: 'home', name: 'The Way Home', subtitle: 'Bring it all together', description: 'A final collection of bright little challenges. Home is just around the corner.', stages: [
    stage('Stained-Glass Sky', 'puzzle', { puzzleIndex: 18, objective: goal('group', 10), stars: [2950, 3210], gold: [3730, 3916] }),
    stage('Meet in the Middle', 'relapse', { difficulty: 'normal', level: 14, stars: [34100, 52400], gold: [62500, 69450] }),
    stage('A Lasting Glow', 'continuous', { difficulty: 'hard', level: 4, objective: goal('blocks', 420), stars: [12500, 19200], gold: [20200, 22400] }),
    stage('The Long Way Home', 'strategy', { difficulty: 'hard', level: 3, stars: [10950, 16800], gold: [17650, 19600], unfinished: [['tallStart']] }),
    stage('Just One More', 'classic', { difficulty: 'normal', level: 15, unfinished: [['fastRows'], ['fastRows', 'tallStart']] }),
  ] },
];

export const STAGES = WORLDS.flatMap((world, worldIndex) => world.stages.map((item, localIndex) => {
  const index = worldIndex * 5 + localIndex;
  return { objective: { type: 'finish' }, ...item, index, worldIndex, reward: 25 + worldIndex * 8 + localIndex * 2, seed: (0xc011a95e + index * 104729) >>> 0 };
}));

// `short` names fit the boost tray under the board.
export const ITEMS = [
  { id: 'blast', name: 'Pocket Blast', short: 'Blast', price: 12, symbol: '✹', description: 'Blast a promising patch of blocks.' },
  { id: 'color', name: 'Color Sweep', short: 'Sweep', price: 18, symbol: '◈', description: 'Clear the most common color on the board.' },
  { id: 'freeze', name: 'A Little Breather', short: 'Breather', price: 10, symbol: '❄', description: 'Hold incoming rows for 10 seconds. The Countdown clock keeps running.' },
];
export const SLOT_SYMBOLS = [
  { id: 'sun', name: 'Sun' }, { id: 'leaf', name: 'Leaf' }, { id: 'moon', name: 'Moon' }, { id: 'gem', name: 'Gem' }, { id: 'star', name: 'Star' },
];
export const SLOT_BET = 5;
export const REPLAY_REWARD = 8;
// The key predates save versions; the save's own `version` field tracks its format.
export const JOURNEY_STORAGE_KEY = 'collapse:journey:v1';
export const JOURNEY_SAVE_VERSION = 2;
const MAX_COINS = 1000000000;
const MAX_POINTS = 1000000000;
const boundedInt = (value, limit) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(limit, Math.floor(value))) : 0;
const plainObject = value => value && typeof value === 'object' && !Array.isArray(value) ? value : {};

function normalizeStarRecord(entry) {
  const stars = boundedInt(entry?.stars, 3);
  return stars ? { stars, score: boundedInt(entry.score, MAX_POINTS) } : null;
}

function normalizeGoldRecord(entry, mode) {
  const record = normalizeStarRecord(entry);
  const modifiers = normalizeModifiers(mode, entry?.modifiers);
  if (!record || !modifiers.length) return null;
  return { ...record, adjustedScore: Math.max(record.score, boundedInt(entry.adjustedScore, MAX_POINTS)), modifiers };
}

/** Records are keyed by stage index. Stars imply a clear, so later stages are dropped. */
function normalizeRecords(value, completed, normalize) {
  return Object.fromEntries(Object.entries(plainObject(value)).flatMap(([key, entry]) => {
    const index = Number(key);
    const record = Number.isInteger(index) && index >= 0 && index < completed && String(index) === key ? normalize(entry, STAGES[index].mode) : null;
    return record ? [[key, record]] : [];
  }));
}

/**
 * Version 1 saves hold only coins, clears, and boosts. They gain empty star
 * and gold records: earlier clears keep their unlocks, and their stars are
 * earned on the next replay rather than inferred.
 */
export function normalizeJourneySave(value) {
  const completed = boundedInt(value?.completed, STAGES.length);
  return {
    version: JOURNEY_SAVE_VERSION,
    coins: boundedInt(value?.coins, MAX_COINS),
    completed,
    inventory: Object.fromEntries(ITEMS.map(item => [item.id, boundedInt(value?.inventory?.[item.id], 99)])),
    stars: normalizeRecords(value?.stars, completed, normalizeStarRecord),
    gold: normalizeRecords(value?.gold, completed, normalizeGoldRecord),
  };
}

export function stageGoal(item) {
  return describeObjective(item.objective, item.mode);
}

const playsStage = (item, state) => Boolean(item && state && state.mode === item.mode && (item.mode !== 'puzzle' || state.puzzleIndex === item.puzzleIndex));

export function stageIsComplete(item, state) {
  return playsStage(item, state) && evaluateObjective(item.objective, state).status === 'complete';
}

/** Round points for two and three stars. Classic stages share Classic's targets. */
export function stageStarTargets(item) {
  if (item.mode === 'classic') {
    const targets = getClassicTargets(item.level, item.difficulty);
    return { two: targets.twoStars, three: targets.threeStars, provisional: targets.provisional };
  }
  return { two: item.stars[0], three: item.stars[1], provisional: false };
}

/** Gold-star round points for hard mode, provisional until playtested. Classic stages share Classic's. */
export function stageGoldTargets(item) {
  if (item.mode === 'classic') {
    const targets = getClassicGoldTargets(item.level, item.difficulty);
    return { two: targets.twoStars, three: targets.threeStars, provisional: true };
  }
  return { two: item.gold[0], three: item.gold[1], provisional: true };
}

/** The modifiers a stage's hard mode offers: every one for its mode, since each puzzle stage's best line fits its move limit. */
export const stageModifiers = item => modifiersForMode(item.mode);

/** Descriptions that depend on the stage, such as a puzzle's move limit. */
export function stageModifierDetails(item) {
  return item.mode === 'puzzle' ? { moveLimit: moveLimitText(PUZZLES[item.puzzleIndex]) } : {};
}

/**
 * One star for completing the objective, two and three for settled round
 * points, as in Classic. A missed objective earns none, whatever the points.
 * With hard-mode `modifiers`, `gold` holds the same judgement for gold stars.
 */
export function stageResult(item, state, modifiers = []) {
  if (!playsStage(item, state)) return null;
  const objective = evaluateObjective(item.objective, state);
  const targets = stageStarTargets(item);
  const points = roundPoints(state);
  const stars = objective.status !== 'complete' ? 0 : points >= targets.three ? 3 : points >= targets.two ? 2 : 1;
  const gold = modifiers.length ? goldResult({ completed: objective.status === 'complete', points, modifiers, targets: stageGoldTargets(item) }) : null;
  return { status: objective.status, objective, stars, points, targets, gold };
}

/** Best regular stars and best points are kept independently, as in Classic. */
export function recordStageStars(value, stageIndex, result) {
  const save = normalizeJourneySave(value);
  const attempt = normalizeStarRecord(result);
  if (!Number.isInteger(stageIndex) || stageIndex < 0 || stageIndex >= save.completed) return { ok: false, save, improved: false, reason: 'Clear this stage first.' };
  const previous = save.stars[stageIndex];
  if (!attempt) return { ok: true, save, improved: false };
  const record = { stars: Math.max(previous?.stars || 0, attempt.stars), score: Math.max(previous?.score || 0, attempt.score) };
  const improved = !previous || record.stars > previous.stars || record.score > previous.score;
  return { ok: true, improved, save: improved ? { ...save, stars: { ...save.stars, [stageIndex]: record } } : save };
}

/** Gold keeps its best attempt whole, so the modifiers shown are the ones that earned it. */
export function recordGoldStars(value, stageIndex, result) {
  const save = normalizeJourneySave(value);
  if (!Number.isInteger(stageIndex) || stageIndex < 0 || stageIndex >= save.completed) return { ok: false, save, improved: false, reason: 'Clear this stage first.' };
  const attempt = normalizeGoldRecord(result, STAGES[stageIndex].mode);
  const improved = goldImproves(attempt, save.gold[stageIndex]);
  return { ok: true, improved, save: improved ? { ...save, gold: { ...save.gold, [stageIndex]: attempt } } : save };
}

export function completeStage(value, stageIndex) {
  const save = normalizeJourneySave(value);
  const item = STAGES[stageIndex];
  if (!Number.isInteger(stageIndex) || !item || stageIndex > save.completed) return { ok: false, save, reason: 'Finish the earlier stages first.' };
  const firstClear = stageIndex === save.completed;
  const reward = firstClear ? item.reward : REPLAY_REWARD;
  return { ok: true, firstClear, reward, save: { ...save, coins: Math.min(MAX_COINS, save.coins + reward), completed: Math.max(save.completed, stageIndex + 1) } };
}

export function purchaseItem(value, type) {
  const save = normalizeJourneySave(value);
  const item = ITEMS.find(entry => entry.id === type);
  if (!item) return { ok: false, save, reason: 'That boost is unavailable.' };
  if (save.coins < item.price) return { ok: false, save, reason: 'Play a Journey stage to earn a few more coins.' };
  if (save.inventory[type] >= 99) return { ok: false, save, reason: 'Your pocket is full of that boost.' };
  return { ok: true, save: { ...save, coins: save.coins - item.price, inventory: { ...save.inventory, [type]: save.inventory[type] + 1 } } };
}

export function consumeItem(value, type) {
  const save = normalizeJourneySave(value);
  if (!ITEMS.some(item => item.id === type) || save.inventory[type] < 1) return { ok: false, save };
  return { ok: true, save: { ...save, inventory: { ...save.inventory, [type]: save.inventory[type] - 1 } } };
}

export function slotPayout(reels) {
  if (!Array.isArray(reels) || reels.length !== 3 || reels.some(id => !SLOT_SYMBOLS.some(symbol => symbol.id === id))) return 0;
  if (reels.every(id => id === 'star')) return 100;
  if (reels.every(id => id === reels[0])) return 30;
  return new Set(reels).size === 2 ? 6 : 0;
}

export function playCoinSlot(coins, random = Math.random) {
  const balance = boundedInt(coins, MAX_COINS);
  if (balance < SLOT_BET) return { ok: false, coins: balance, bet: 0, payout: 0, reels: [] };
  const reels = Array.from({ length: 3 }, () => {
    const roll = random();
    const index = typeof roll === 'number' && Number.isFinite(roll) ? Math.min(SLOT_SYMBOLS.length - 1, Math.max(0, Math.floor(roll * SLOT_SYMBOLS.length))) : 0;
    return SLOT_SYMBOLS[index].id;
  });
  const payout = slotPayout(reels);
  return { ok: true, coins: Math.min(MAX_COINS, balance - SLOT_BET + payout), bet: SLOT_BET, payout, reels };
}

export function createJourneyStore(storage) {
  let save;
  try { save = normalizeJourneySave(JSON.parse(storage?.getItem(JOURNEY_STORAGE_KEY) || 'null')); }
  catch { save = normalizeJourneySave(null); }
  const commit = value => {
    save = normalizeJourneySave(value);
    try { storage?.setItem(JOURNEY_STORAGE_KEY, JSON.stringify(save)); } catch { /* An unavailable browser store still permits this session to play. */ }
  };
  const apply = result => { if (result.ok) commit(result.save); return result; };
  return {
    getState: () => normalizeJourneySave(save),
    complete: index => apply(completeStage(save, index)),
    recordStars: (index, result) => apply(recordStageStars(save, index, result)),
    recordGold: (index, result) => apply(recordGoldStars(save, index, result)),
    purchase: type => apply(purchaseItem(save, type)),
    consume: type => apply(consumeItem(save, type)),
    spin(random = Math.random) {
      if (save.coins < SLOT_BET) return playCoinSlot(save.coins, random);
      const balance = save.coins;
      // Commit the stake before drawing any reels. A reload cannot cancel a losing bet.
      commit({ ...save, coins: balance - SLOT_BET });
      const result = playCoinSlot(balance, random);
      commit({ ...save, coins: result.coins });
      return result;
    },
  };
}

export function createJourneySession(store) {
  let activeIndex = null;
  let lastIndex = null;
  // Hard-mode modifiers for the active and the most recent run; none for an ordinary run.
  let activeModifiers = [];
  let lastModifiers = [];
  return {
    /** Starts a stage. Modifiers make it a gold run, which needs two regular stars on the stage. */
    start(index, modifiers = []) {
      const item = STAGES[index];
      if (!Number.isInteger(index) || !item || index > store.getState().completed) return null;
      let chosen = [];
      if (modifiers.length) {
        const checked = validateModifiers(item.mode, modifiers, { requireOne: true });
        if (!checked.ok || !goldUnlocked(store.getState().stars[index]?.stars)) return null;
        chosen = checked.modifiers;
      }
      activeIndex = lastIndex = index;
      activeModifiers = lastModifiers = chosen;
      return { mode: item.mode, difficulty: item.difficulty, level: item.level, puzzleIndex: item.puzzleIndex ?? 0, seed: item.seed, modifiers: chosen };
    },
    /**
     * Resolves the active stage once its objective is complete or failed. The
     * host ends and settles the round first, so stars use settled points. A
     * miss awards nothing and keeps the stage active, so Undo can still save it.
     * A gold run saves only its gold record; regular stars come from ordinary runs.
     */
    finish(state) {
      if (activeIndex === null) return null;
      const index = activeIndex;
      const result = stageResult(STAGES[index], state, activeModifiers);
      if (!result || !['complete', 'failed'].includes(result.status)) return null;
      if (result.status === 'failed') return { ...result, complete: false, stage: STAGES[index] };
      const before = store.getState();
      const previousBest = before.stars[index] ?? null;
      const previousGold = before.gold[index] ?? null;
      const completion = store.complete(index);
      if (!completion.ok) return null;
      const { gold } = result;
      const recorded = gold
        ? store.recordGold(index, { stars: gold.stars, score: gold.points, adjustedScore: gold.adjusted, modifiers: gold.modifiers })
        : store.recordStars(index, { stars: result.stars, score: result.points });
      activeIndex = null;
      return {
        ...completion, ...result, save: recorded.save, complete: true, stage: STAGES[index],
        previousBest, best: recorded.save.stars[index] ?? null, moreStars: !gold && result.stars > (previousBest?.stars ?? 0),
        previousGold, goldBest: recorded.save.gold[index] ?? null, newGoldBest: Boolean(gold) && recorded.improved,
      };
    },
    abandon() { activeIndex = null; activeModifiers = []; },
    active: () => activeIndex === null ? null : STAGES[activeIndex],
    last: () => lastIndex === null ? null : STAGES[lastIndex],
    /** The active run's hard-mode modifiers; empty for an ordinary run. */
    modifiers: () => activeIndex === null ? [] : activeModifiers,
    lastModifiers: () => lastModifiers,
  };
}

export function usePurchasedItem(store, type, apply) {
  if (!ITEMS.some(item => item.id === type) || store.getState().inventory[type] < 1) return false;
  if (!apply?.(type)) return false;
  return store.consume(type).ok;
}

const escapeHtml = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const coin = '<span class="j-coin" aria-hidden="true">C</span>';
const number = value => value.toLocaleString('en-US');
const formatStage = item => String(item.index + 1).padStart(2, '0');
export const starText = count => '★'.repeat(count) + '☆'.repeat(3 - count);
const totalStars = records => Object.values(records).reduce((sum, record) => sum + record.stars, 0);
const stageStars = (item, record) => {
  const targets = stageStarTargets(item);
  const stars = record?.stars ?? 0;
  return `<div class="j-stage-stars"><span class="j-best-stars${stars ? '' : ' is-empty'}" role="img" aria-label="Best: ${stars} of 3 stars">${starText(stars)}</span><span><span class="nowrap">★★ ${number(targets.two)}</span> · <span class="nowrap">★★★ ${number(targets.three)} points</span>${targets.provisional ? '<sup title="Playtest targets · still being tuned">†</sup>' : ''}</span></div>`;
};
// Gold appears once a stage is cleared: its targets when open, the way to open it otherwise.
const stageGold = (item, regular, record) => {
  if (!goldUnlocked(regular?.stars)) return '<div class="j-stage-gold is-closed">Earn ★★ to open gold hard mode</div>';
  const targets = stageGoldTargets(item);
  const stars = record?.stars ?? 0;
  return `<div class="j-stage-gold"><span class="gold-stars${stars ? '' : ' is-empty'}" role="img" aria-label="Best gold: ${stars} of 3 gold stars">${starText(stars)}</span><span><b>GOLD</b> <span class="nowrap">★★ ${number(targets.two)}</span> · <span class="nowrap">★★★ ${number(targets.three)}</span><sup title="Playtest targets · still being tuned">†</sup></span></div>`;
};

export function createJourney({ openModal, launch, usePowerup, toast = () => {}, storage } = {}) {
  if (!storage) { try { storage = globalThis.localStorage; } catch { /* Storage can be disabled. */ } }
  const store = createJourneyStore(storage);
  const session = createJourneySession(store);
  let selectedWorld = Math.min(WORLDS.length - 1, Math.floor(store.getState().completed / 5));
  let lastSlot = null;
  const describeRun = (item, result) => ({
    ...result, stage: item, number: formatStage(item), goal: stageGoal(item),
    progress: describeProgress(item.objective, result.objective, item.mode), best: store.getState().stars[item.index] ?? null,
    goldBest: store.getState().gold[item.index] ?? null,
  });

  const toolbar = (save, current) => `<div class="j-toolbar"><div class="j-balance" aria-label="${save.coins} arcade coins">${coin}<strong>${number(save.coins)}</strong><span>COINS</span></div><nav aria-label="Journey activities"><button type="button" data-j-nav="journey" ${current === 'journey' ? 'aria-current="page"' : ''}>Journey</button><button type="button" data-j-nav="shop" ${current === 'shop' ? 'aria-current="page"' : ''}>Boost shop <small>${Object.values(save.inventory).reduce((sum, count) => sum + count, 0)}</small></button><button type="button" data-j-nav="casino" ${current === 'casino' ? 'aria-current="page"' : ''}>Coin arcade</button></nav></div>`;
  const bindNavigation = root => root.querySelectorAll('[data-j-nav]').forEach(button => button.addEventListener('click', () => ({ journey: openJourney, shop: openShop, casino: openCasino })[button.dataset.jNav]()));
  const show = (eyebrow, content) => {
    const root = openModal(eyebrow, `<div class="journey-shell">${content}</div>`);
    bindNavigation(root);
    return root;
  };

  function openJourney() {
    const save = store.getState();
    const world = WORLDS[selectedWorld];
    const completedHere = Math.max(0, Math.min(5, save.completed - selectedWorld * 5));
    const allDone = save.completed === STAGES.length;
    const root = show('A LITTLE ADVENTURE', `${toolbar(save, 'journey')}
      <div class="j-title"><div><span class="j-kicker">25 STAGES · 5 PLACES TO GO</span><h2>A little journey.</h2></div><div class="j-totals"><div class="j-total"><strong>${save.completed}<span> / 25</span></strong><small>STAGES CLEARED</small></div><div class="j-total j-total-stars"><strong>${totalStars(save.stars)}<span> / ${STAGES.length * 3}</span></strong><small>★ STARS</small></div><div class="j-total j-total-gold"><strong>${totalStars(save.gold)}<span> / ${STAGES.length * 3}</span></strong><small>★ GOLD</small></div></div></div>
      <p class="j-intro">All your favorite ways to play, strung into one colorful trip. Clear stages, collect coins, and bring a little help along.</p>
      ${allDone ? '<div class="j-finished"><span aria-hidden="true">✦</span><div><strong>You made it home.</strong><p>All 25 stages, beautifully played. Revisit any favorite for 8 more coins.</p></div></div>' : ''}
      <div class="j-world-tabs" aria-label="Journey worlds">${WORLDS.map((item, index) => `<button type="button" class="j-world-tab ${index === selectedWorld ? 'is-selected' : ''}" data-world="${index}" aria-pressed="${index === selectedWorld}"><span class="j-world-number">${save.completed >= (index + 1) * 5 ? '✓' : String(index + 1).padStart(2, '0')}</span><span>${escapeHtml(item.name)}</span></button>`).join('')}</div>
      <section class="j-world j-world-${world.id}" aria-label="${escapeHtml(world.name)}"><div class="j-world-copy"><span class="j-kicker">WORLD ${selectedWorld + 1} · ${completedHere} OF 5 CLEARED</span><h3>${world.name}</h3><strong>${world.subtitle}</strong><p>${world.description}</p></div><div class="j-world-art" aria-hidden="true"><i class="j-art-sun"></i><i class="j-art-hill j-art-hill-back"></i><i class="j-art-hill"></i><i class="j-art-block j-art-block-one"></i><i class="j-art-block j-art-block-two"></i><i class="j-art-block j-art-block-three"></i><i class="j-art-spark">✦</i></div></section>
      <div class="j-stages">${STAGES.filter(item => item.worldIndex === selectedWorld).map(item => {
        const done = item.index < save.completed;
        const locked = item.index > save.completed;
        const active = session.active()?.index === item.index;
        return `<article class="j-stage ${done ? 'is-cleared' : locked ? 'is-locked' : 'is-next'}"><div class="j-stage-number" aria-label="Stage ${item.index + 1}">${done ? '✓' : formatStage(item)}</div><div class="j-stage-copy"><div><span class="j-stage-mode">${modeSymbols[item.mode]} ${modeNames[item.mode]}</span><span class="j-stage-difficulty">${item.difficulty}${item.mode === 'puzzle' ? '' : ` · level ${item.level}`}</span></div><h4>${escapeHtml(item.name)}</h4><p>${stageGoal(item)}</p>${locked ? '' : stageStars(item, save.stars[item.index])}${done ? stageGold(item, save.stars[item.index], save.gold[item.index]) : ''}</div><div class="j-stage-action"><span>${coin} +${done ? REPLAY_REWARD : item.reward}</span><button type="button" data-stage="${item.index}" ${locked ? 'disabled aria-label="Finish the earlier stage to unlock"' : ''}>${locked ? 'Locked' : active && !session.modifiers().length ? 'Restart' : done ? 'Revisit' : 'Let’s play'}<span aria-hidden="true">${locked ? ' ·' : ' ↗'}</span></button>${done && goldUnlocked(save.stars[item.index]?.stars) ? `<button type="button" class="j-gold-button" data-gold-stage="${item.index}">Go for gold <span aria-hidden="true">✦</span></button>` : ''}</div></article>`;
      }).join('')}</div>
      <div class="j-footnote"><span>★ Meet the objective. ★★ and ★★★ need the round points shown, after leftover blocks. Two stars on a stage open its gold hard mode. † Playtest targets, still being tuned.</span><span>Your progress and coins are saved on this device. First clear earns the big reward. Replays earn ${REPLAY_REWARD} coins.</span></div>`);
    root.querySelectorAll('[data-world]').forEach(button => button.addEventListener('click', () => { selectedWorld = Number(button.dataset.world); openJourney(); }));
    root.querySelectorAll('[data-stage]').forEach(button => button.addEventListener('click', () => {
      const config = session.start(Number(button.dataset.stage));
      if (config) launch(config);
    }));
    root.querySelectorAll('[data-gold-stage]').forEach(button => button.addEventListener('click', () => openGold(STAGES[Number(button.dataset.goldStage)])));
  }

  function openGold(item) {
    const save = store.getState();
    const mode = modeNames[item.mode];
    openGoldPicker({
      openModal, title: item.name, subtitle: `Journey ${formatStage(item)} · ${mode}${item.mode === 'puzzle' ? '' : ` · ${item.difficulty} level ${item.level}`}`,
      goal: stageGoal(item), available: stageModifiers(item), details: stageModifierDetails(item), targets: stageGoldTargets(item),
      best: save.gold[item.index] ?? null, unfinished: item.unfinished, backLabel: 'Back to your journey', onBack: openJourney,
      onStart(modifiers) {
        const config = session.start(item.index, modifiers);
        if (config) launch(config);
      },
    });
  }

  function openShop() {
    const save = store.getState();
    const root = show('A LITTLE HELP IN YOUR POCKET', `${toolbar(save, 'shop')}
      <div class="j-title"><div><span class="j-kicker">EARNED BY PLAYING</span><h2>The boost shop.</h2></div><span class="j-shop-art" aria-hidden="true">✹</span></div>
      <p class="j-intro">A small boost for a tricky moment. Buy it now, keep it in your pocket, and use it during any game.</p>
      <div class="j-shop-items">${ITEMS.map(item => `<article class="j-shop-item j-item-${item.id}"><div class="j-item-art" aria-hidden="true">${item.symbol}</div><span class="j-kicker">${save.inventory[item.id]} IN YOUR POCKET</span><h3>${item.name}</h3><p>${item.description}</p><button class="j-buy" type="button" data-buy="${item.id}" ${save.coins < item.price || save.inventory[item.id] >= 99 ? 'disabled' : ''}>Buy one <span>${coin} ${item.price}</span></button><button class="j-use" type="button" data-use="${item.id}" ${save.inventory[item.id] < 1 ? 'disabled' : ''}>Use one now <span aria-hidden="true">↗</span></button></article>`).join('')}</div>
      <p class="j-shop-note">Boosts are used once. If a boost cannot be used in the current game, it stays in your pocket. Puzzle boosts can help finish a stage.</p>
      ${save.coins < 10 ? '<div class="j-empty-note">A stage clear earns at least 25 coins. Your next little boost is one good game away.</div>' : ''}`);
    root.querySelectorAll('[data-buy]').forEach(button => button.addEventListener('click', () => {
      const result = store.purchase(button.dataset.buy);
      if (!result.ok) { toast(result.reason); return; }
      toast(`${ITEMS.find(item => item.id === button.dataset.buy).name} added to your pocket.`);
      openShop();
    }));
    root.querySelectorAll('[data-use]').forEach(button => button.addEventListener('click', () => {
      usePurchasedItem(store, button.dataset.use, usePowerup);
    }));
  }

  function openCasino() {
    const save = store.getState();
    const reels = lastSlot?.reels || ['sun', 'star', 'leaf'];
    const result = !lastSlot ? 'A little luck, a little pocket change.' : lastSlot.payout === 100 ? 'Three stars! A 100-coin jackpot.' : lastSlot.payout === 30 ? 'Three alike! 30 coins back.' : lastSlot.payout === 6 ? 'A matching pair. 6 coins back.' : 'No match this time. The next game is waiting.';
    const root = show('JUST FOR THE FUN OF IT', `${toolbar(save, 'casino')}
      <div class="j-title"><div><span class="j-kicker">GAME COINS ONLY · NO REAL MONEY</span><h2>The coin arcade.</h2></div><span class="j-casino-art" aria-hidden="true">✦</span></div>
      <p class="j-intro">Three little reels and a chance to top up your boost fund. Each spin costs ${SLOT_BET} coins, paid before the reels turn.</p>
      <section class="j-slot-machine"><div class="j-slot-heading"><i></i><span>A LITTLE LUCK</span><i></i></div><div class="j-reels ${lastSlot ? 'has-spun' : ''}" aria-label="${reels.map(id => SLOT_SYMBOLS.find(item => item.id === id).name).join(', ')}">${reels.map(id => `<div class="j-reel"><span class="j-reel-symbol j-symbol-${id}" aria-hidden="true"></span></div>`).join('')}</div><div class="j-slot-result" role="status"><strong>${result}</strong>${lastSlot ? `<span>Bet ${SLOT_BET} · Returned ${lastSlot.payout} · ${lastSlot.payout - SLOT_BET >= 0 ? '+' : '−'}${Math.abs(lastSlot.payout - SLOT_BET)} coins overall</span>` : '<span>Five equally likely symbols. One small spin.</span>'}</div><button type="button" class="j-spin" data-spin ${save.coins < SLOT_BET ? 'disabled' : ''}>${lastSlot ? 'Spin again' : 'Give it a spin'} <span>${coin} ${SLOT_BET}</span></button></section>
      <div class="j-payouts"><div><span>THREE STARS</span><strong>100 ${coin}</strong><small>0.8% chance</small></div><div><span>OTHER THREE ALIKE</span><strong>30 ${coin}</strong><small>3.2% chance</small></div><div><span>ANY PAIR</span><strong>6 ${coin}</strong><small>48% chance</small></div><div><span>NO MATCH</span><strong>0 ${coin}</strong><small>48% chance</small></div></div>
      <p class="j-shop-note">Payouts include your stake. Each of the 125 reel combinations has the same chance; the average return is 4.64 coins per 5-coin spin. Coins have no cash value.</p>
      ${save.coins < SLOT_BET ? '<div class="j-empty-note">Your coin pocket is a little light. Clear or replay a Journey stage to earn more.</div>' : ''}`);
    root.querySelectorAll('[data-spin]').forEach(button => button.addEventListener('click', () => {
      const outcome = store.spin();
      if (outcome.ok) { lastSlot = outcome; openCasino(); }
    }));
  }

  return {
    openJourney, openShop, openCasino,
    /** Totals for the Journey entry beside the board; `next` is the first uncleared stage. */
    progress() {
      const save = store.getState();
      return { completed: save.completed, total: STAGES.length, stars: totalStars(save.stars), gold: totalStars(save.gold), next: STAGES[save.completed] ?? null };
    },
    /** Reopens the modifier choice for the most recent gold run. */
    openLastGold() { const item = session.last(); if (item) openGold(item); },
    /** Call with a settled round; returns the stage result once it is complete or missed. */
    finishRun(state) {
      const finished = session.finish(state);
      if (!finished) return null;
      const result = describeRun(finished.stage, finished);
      if (!result.complete) return result;
      selectedWorld = Math.min(WORLDS.length - 1, Math.floor(result.save.completed / 5));
      toast(result.gold
        ? `${result.stage.name}: gold ${starText(result.gold.stars)} · +${result.reward} coins`
        : `${result.stage.name} cleared! ${starText(result.stars)} · +${result.reward} coins${result.firstClear && result.save.completed < STAGES.length ? ' · Next stage unlocked' : ''}`);
      return result;
    },
    /** 'active', 'met', 'complete', or 'failed' for the active stage; null otherwise. */
    objectiveStatus(state) {
      const item = session.active();
      return (item && stageResult(item, state)?.status) || null;
    },
    /** What the in-game panel shows for the active stage, with `gold` on a gold run. */
    runInfo(state) {
      const item = session.active();
      const result = item && stageResult(item, state, session.modifiers());
      return result ? describeRun(item, result) : null;
    },
    /** Launches the most recent stage again, with the same modifiers for a gold run. */
    replay() {
      const item = session.last();
      const config = item && session.start(item.index, session.lastModifiers());
      if (config) launch(config);
      return Boolean(config);
    },
    /** Boosts in the pocket, by type. */
    inventory: () => store.getState().inventory,
    /** Uses one boost from the pocket in the current game. If it can't be used, the pocket keeps it. */
    useBoost: type => usePurchasedItem(store, type, usePowerup),
    abandonRun: () => session.abandon(),
    isActive: () => Boolean(session.active()),
  };
}
