const modeNames = { classic: 'Classic', strategy: 'Strategy', puzzle: 'Puzzle', relapse: 'Relapse', continuous: 'Continuous', countdown: 'Countdown', slider: 'Slider' };
const modeSymbols = { classic: '▦', strategy: '⌘', puzzle: '◇', relapse: '↕', continuous: '∞', countdown: '◷', slider: '⇄' };
const stage = (name, mode, options = {}) => ({ name, mode, difficulty: 'easy', level: 1, ...options });

export const WORLDS = [
  { id: 'sunroom', name: 'The Sunroom', subtitle: 'A familiar little beginning', description: 'Sun on the windows. A favorite game. There is no hurry to get anywhere.', stages: [
    stage('A Familiar Spark', 'classic'),
    stage('Room to Think', 'strategy'),
    stage('Corner by Corner', 'puzzle', { puzzleIndex: 2 }),
    stage('A Gentle Rhythm', 'continuous', { target: 1500 }),
    stage('Two-Minute Tea', 'countdown'),
  ] },
  { id: 'pier', name: 'Lantern Pier', subtitle: 'A few new twists', description: 'Take the long way along the water. The lights are just coming on.', stages: [
    stage('Side Street', 'slider'),
    stage('From Both Shores', 'relapse'),
    stage('Paper Wings', 'puzzle', { puzzleIndex: 6 }),
    stage('One Step Ahead', 'strategy', { level: 2 }),
    stage('Lantern Light', 'classic', { level: 3 }),
  ] },
  { id: 'glasshouse', name: 'The Glasshouse', subtitle: 'Let the colors grow', description: 'A winding path through bright patterns, patient planning, and little surprises.', stages: [
    stage('Ripples in Glass', 'puzzle', { puzzleIndex: 10 }),
    stage('Winding Path', 'slider', { difficulty: 'normal', level: 2 }),
    stage('A Passing Shower', 'countdown', { difficulty: 'normal', level: 2 }),
    stage('Growing Season', 'continuous', { difficulty: 'normal', level: 3, target: 5000 }),
    stage('Roots and Branches', 'relapse', { difficulty: 'normal', level: 2 }),
  ] },
  { id: 'arcade', name: 'Starlight Arcade', subtitle: 'One more good game', description: 'The evening is young, the cabinet is glowing, and your next good move is waiting.', stages: [
    stage('The Thoughtful Move', 'strategy', { difficulty: 'normal', level: 4 }),
    stage('Secret Garden', 'puzzle', { puzzleIndex: 15 }),
    stage('Neon Nostalgia', 'classic', { difficulty: 'normal', level: 4 }),
    stage('A Moving Picture', 'slider', { difficulty: 'hard', level: 3 }),
    stage('Last Two Minutes', 'countdown', { difficulty: 'hard', level: 3 }),
  ] },
  { id: 'home', name: 'The Way Home', subtitle: 'Bring it all together', description: 'A final collection of bright little challenges. Home is just around the corner.', stages: [
    stage('Stained-Glass Sky', 'puzzle', { puzzleIndex: 18 }),
    stage('Meet in the Middle', 'relapse', { difficulty: 'hard', level: 4 }),
    stage('A Lasting Glow', 'continuous', { difficulty: 'hard', level: 4, target: 10000 }),
    stage('The Long Way Home', 'strategy', { difficulty: 'hard', level: 5 }),
    stage('Just One More', 'classic', { difficulty: 'hard', level: 6 }),
  ] },
];

export const STAGES = WORLDS.flatMap((world, worldIndex) => world.stages.map((item, localIndex) => {
  const index = worldIndex * 5 + localIndex;
  return { ...item, index, worldIndex, reward: 25 + worldIndex * 8 + localIndex * 2, seed: (0xc011a95e + index * 104729) >>> 0 };
}));

export const ITEMS = [
  { id: 'blast', name: 'Pocket Blast', price: 12, symbol: '✹', description: 'Blast a promising patch of blocks.' },
  { id: 'color', name: 'Color Sweep', price: 18, symbol: '◈', description: 'Clear the most common color on the board.' },
  { id: 'freeze', name: 'A Little Breather', price: 10, symbol: '❄', description: 'Hold incoming rows for 10 seconds. The Countdown clock keeps running.' },
];
export const SLOT_SYMBOLS = [
  { id: 'sun', name: 'Sun' }, { id: 'leaf', name: 'Leaf' }, { id: 'moon', name: 'Moon' }, { id: 'gem', name: 'Gem' }, { id: 'star', name: 'Star' },
];
export const SLOT_BET = 5;
export const REPLAY_REWARD = 8;
export const JOURNEY_STORAGE_KEY = 'collapse:journey:v1';
const MAX_COINS = 1000000000;
const boundedInt = (value, limit) => typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(limit, Math.floor(value))) : 0;

export function normalizeJourneySave(value) {
  return {
    version: 1,
    coins: boundedInt(value?.coins, MAX_COINS),
    completed: boundedInt(value?.completed, STAGES.length),
    inventory: Object.fromEntries(ITEMS.map(item => [item.id, boundedInt(value?.inventory?.[item.id], 99)])),
  };
}

export function stageGoal(item) {
  if (item.mode === 'continuous') return `Score ${item.target.toLocaleString('en-US')} points in one run`;
  if (item.mode === 'puzzle') return 'Clear every block';
  if (item.mode === 'countdown') return 'Finish the two-minute round';
  return 'Finish the level and bonus round';
}

export function stageIsComplete(item, state) {
  if (!item || !state || state.mode !== item.mode || state.status === 'gameOver') return false;
  if (item.mode === 'puzzle' && state.puzzleIndex !== item.puzzleIndex) return false;
  if (item.mode === 'continuous') return ['playing', 'paused', 'won', 'levelComplete'].includes(state.status) && state.score >= item.target;
  return state.status === 'won' || state.status === 'levelComplete';
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
  return {
    start(index) {
      const item = STAGES[index];
      if (!Number.isInteger(index) || !item || index > store.getState().completed) return null;
      activeIndex = index;
      return { mode: item.mode, difficulty: item.difficulty, level: item.level, puzzleIndex: item.puzzleIndex ?? 0, seed: item.seed };
    },
    finish(state) {
      if (activeIndex === null || !stageIsComplete(STAGES[activeIndex], state)) return null;
      const index = activeIndex;
      const result = store.complete(index);
      if (!result.ok) return null;
      activeIndex = null;
      return { ...result, stage: STAGES[index] };
    },
    abandon() { activeIndex = null; },
    active: () => activeIndex === null ? null : STAGES[activeIndex],
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

export function createJourney({ openModal, launch, usePowerup, toast = () => {}, storage } = {}) {
  if (!storage) { try { storage = globalThis.localStorage; } catch { /* Storage can be disabled. */ } }
  const store = createJourneyStore(storage);
  const session = createJourneySession(store);
  let selectedWorld = Math.min(WORLDS.length - 1, Math.floor(store.getState().completed / 5));
  let lastSlot = null;

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
      <div class="j-title"><div><span class="j-kicker">25 STAGES · 5 PLACES TO GO</span><h2>A little journey.</h2></div><div class="j-total"><strong>${save.completed}<span> / 25</span></strong><small>STAGES CLEARED</small></div></div>
      <p class="j-intro">All your favorite ways to play, strung into one colorful trip. Clear stages, collect coins, and bring a little help along.</p>
      ${allDone ? '<div class="j-finished"><span aria-hidden="true">✦</span><div><strong>You made it home.</strong><p>All 25 stages, beautifully played. Revisit any favorite for 8 more coins.</p></div></div>' : ''}
      <div class="j-world-tabs" aria-label="Journey worlds">${WORLDS.map((item, index) => `<button type="button" class="j-world-tab ${index === selectedWorld ? 'is-selected' : ''}" data-world="${index}" aria-pressed="${index === selectedWorld}"><span class="j-world-number">${save.completed >= (index + 1) * 5 ? '✓' : String(index + 1).padStart(2, '0')}</span><span>${escapeHtml(item.name)}</span></button>`).join('')}</div>
      <section class="j-world j-world-${world.id}" aria-label="${escapeHtml(world.name)}"><div class="j-world-copy"><span class="j-kicker">WORLD ${selectedWorld + 1} · ${completedHere} OF 5 CLEARED</span><h3>${world.name}</h3><strong>${world.subtitle}</strong><p>${world.description}</p></div><div class="j-world-art" aria-hidden="true"><i class="j-art-sun"></i><i class="j-art-hill j-art-hill-back"></i><i class="j-art-hill"></i><i class="j-art-block j-art-block-one"></i><i class="j-art-block j-art-block-two"></i><i class="j-art-block j-art-block-three"></i><i class="j-art-spark">✦</i></div></section>
      <div class="j-stages">${STAGES.filter(item => item.worldIndex === selectedWorld).map(item => {
        const done = item.index < save.completed;
        const locked = item.index > save.completed;
        const active = session.active()?.index === item.index;
        return `<article class="j-stage ${done ? 'is-cleared' : locked ? 'is-locked' : 'is-next'}"><div class="j-stage-number" aria-label="Stage ${item.index + 1}">${done ? '✓' : formatStage(item)}</div><div class="j-stage-copy"><div><span class="j-stage-mode">${modeSymbols[item.mode]} ${modeNames[item.mode]}</span><span class="j-stage-difficulty">${item.difficulty}${item.mode === 'puzzle' ? '' : ` · level ${item.level}`}</span></div><h4>${escapeHtml(item.name)}</h4><p>${stageGoal(item)}</p></div><div class="j-stage-action"><span>${coin} +${done ? REPLAY_REWARD : item.reward}</span><button type="button" data-stage="${item.index}" ${locked ? 'disabled aria-label="Finish the earlier stage to unlock"' : ''}>${locked ? 'Locked' : active ? 'Restart' : done ? 'Revisit' : 'Let’s play'}<span aria-hidden="true">${locked ? ' ·' : ' ↗'}</span></button></div></article>`;
      }).join('')}</div>
      <div class="j-footnote"><span>Your progress and coins are saved on this device.</span><span>First clear earns the big reward. Replays earn ${REPLAY_REWARD} coins.</span></div>`);
    root.querySelectorAll('[data-world]').forEach(button => button.addEventListener('click', () => { selectedWorld = Number(button.dataset.world); openJourney(); }));
    root.querySelectorAll('[data-stage]').forEach(button => button.addEventListener('click', () => {
      const config = session.start(Number(button.dataset.stage));
      if (config) launch(config);
    }));
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
    finishRun(state) {
      const result = session.finish(state);
      if (!result) return false;
      selectedWorld = Math.min(WORLDS.length - 1, Math.floor(result.save.completed / 5));
      toast(`${result.stage.name} cleared! +${result.reward} coins${result.firstClear && result.save.completed < STAGES.length ? ' · Next stage unlocked' : ''}`);
      return true;
    },
    abandonRun: () => session.abandon(),
    isActive: () => Boolean(session.active()),
    getActiveLabel() { const item = session.active(); return item ? `Journey ${formatStage(item)} · ${item.name} · ${stageGoal(item)}` : ''; },
  };
}
