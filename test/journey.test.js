import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORLDS, STAGES, ITEMS, SLOT_SYMBOLS, SLOT_BET, REPLAY_REWARD, JOURNEY_STORAGE_KEY,
  normalizeJourneySave, completeStage, purchaseItem, consumeItem, stageIsComplete,
  slotPayout, playCoinSlot, createJourneyStore, createJourneySession, usePurchasedItem,
  recordStageStars, recordGoldStars,
} from '../dist/journey.js';

function memoryStorage(value) {
  const entries = new Map(value ? [[JOURNEY_STORAGE_KEY, JSON.stringify(value)]] : []);
  return { getItem: key => entries.get(key) ?? null, setItem: (key, text) => entries.set(key, text) };
}

test('the original campaign covers all seven game modes across five worlds', () => {
  assert.equal(WORLDS.length, 5);
  assert.ok(WORLDS.every(world => world.stages.length === 5));
  assert.equal(STAGES.length, 25);
  assert.equal(new Set(STAGES.map(stage => stage.name)).size, 25);
  assert.deepEqual(new Set(STAGES.map(stage => stage.mode)), new Set(['classic', 'strategy', 'puzzle', 'continuous', 'countdown', 'slider', 'relapse']));
  assert.ok(STAGES.every((stage, index) => stage.index === index && stage.worldIndex === Math.floor(index / 5)));
});

test('invalid saved data falls back to a valid local game economy', () => {
  assert.deepEqual(normalizeJourneySave(null), { version: 2, coins: 0, completed: 0, inventory: { blast: 0, color: 0, freeze: 0 }, stars: {}, gold: {} });
  assert.deepEqual(normalizeJourneySave({ coins: -10, completed: 300, inventory: { blast: 4.8, color: '20', freeze: 999 } }), {
    version: 2, coins: 0, completed: 25, inventory: { blast: 4, color: 0, freeze: 99 }, stars: {}, gold: {},
  });
  const corrupt = { getItem: () => '{not json}', setItem() {} };
  assert.equal(createJourneyStore(corrupt).getState().completed, 0);
});

test('stage rewards unlock only the next stage and replays retain earned progress', () => {
  const original = normalizeJourneySave(null);
  assert.equal(completeStage(original, 1).ok, false);
  assert.equal(completeStage(original, -1).ok, false);
  assert.equal(completeStage(original, 0.5).ok, false);
  const first = completeStage(original, 0);
  assert.equal(first.ok, true);
  assert.equal(first.firstClear, true);
  assert.equal(first.reward, 25);
  assert.equal(first.save.completed, 1);
  assert.equal(first.save.coins, 25);
  assert.equal(original.coins, 0, 'pure economy helpers do not mutate their input');
  assert.equal(completeStage(first.save, 2).ok, false);
  const replay = completeStage(first.save, 0);
  assert.equal(replay.firstClear, false);
  assert.equal(replay.reward, REPLAY_REWARD);
  assert.equal(replay.save.completed, 1);
  assert.equal(replay.save.coins, 25 + REPLAY_REWARD);
});

test('all twenty-five first clears unlock the complete campaign', () => {
  let save = normalizeJourneySave(null);
  let earned = 0;
  for (const stage of STAGES) {
    const result = completeStage(save, stage.index);
    assert.equal(result.ok, true);
    earned += stage.reward;
    save = result.save;
  }
  assert.equal(save.completed, 25);
  assert.equal(save.coins, earned);
});

test('each boost is affordable after the first stage, and buying and using are separate', () => {
  const first = completeStage(null, 0).save;
  for (const item of ITEMS) {
    const bought = purchaseItem(first, item.id);
    assert.equal(bought.ok, true, item.name);
    assert.equal(bought.save.coins, 25 - item.price);
    assert.equal(bought.save.inventory[item.id], 1);
    const used = consumeItem(bought.save, item.id);
    assert.equal(used.ok, true);
    assert.equal(used.save.inventory[item.id], 0);
    assert.equal(used.save.coins, bought.save.coins);
    assert.equal(consumeItem(used.save, item.id).ok, false);
  }
  assert.equal(purchaseItem(null, 'blast').ok, false);
  assert.equal(purchaseItem(first, 'unknown').ok, false);
});

test('coins, unlocks, and pocket inventory persist in the browser store', () => {
  const storage = memoryStorage();
  const store = createJourneyStore(storage);
  store.complete(0);
  store.purchase('blast');
  const restored = createJourneyStore(storage).getState();
  assert.equal(restored.coins, 13);
  assert.equal(restored.completed, 1);
  assert.equal(restored.inventory.blast, 1);
  restored.inventory.blast = 99;
  assert.equal(store.getState().inventory.blast, 1, 'callers cannot mutate store state');
});

test('a boost stays in the pocket when the game cannot apply it', () => {
  const store = createJourneyStore(memoryStorage({ coins: 25, inventory: { blast: 1 } }));
  assert.equal(usePurchasedItem(store, 'blast', () => false), false);
  assert.equal(store.getState().inventory.blast, 1);
  assert.equal(usePurchasedItem(store, 'blast', type => { assert.equal(type, 'blast'); return true; }), true);
  assert.equal(store.getState().inventory.blast, 0);
  assert.equal(usePurchasedItem(store, 'blast', () => assert.fail('An empty pocket cannot apply a boost')), false);
});

test('a purchased boost preserves rewards awarded by its game callback', () => {
  const store = createJourneyStore(memoryStorage({ coins: 0, inventory: { color: 1 } }));
  assert.equal(usePurchasedItem(store, 'color', () => { store.complete(0); return true; }), true);
  assert.equal(store.getState().coins, 25);
  assert.equal(store.getState().completed, 1);
  assert.equal(store.getState().inventory.color, 0);
});

test('a campaign run awards exactly once and waits for explicit selection of the next stage', () => {
  const store = createJourneyStore(memoryStorage());
  const session = createJourneySession(store);
  assert.equal(session.start(1), null);
  const config = session.start(0);
  assert.equal(config.mode, 'classic');
  assert.equal(config.seed, STAGES[0].seed);
  // The first stage asks for a group before the level ends.
  const settled = status => ({ mode: 'classic', status, roundStats: { largestGroup: STAGES[0].objective.target }, roundSummary: { netPoints: 0 } });
  assert.equal(session.finish(settled('playing')), null);
  assert.equal(session.finish(settled('levelComplete')).complete, true);
  assert.equal(store.getState().coins, 25);
  assert.equal(session.active(), null);
  assert.equal(session.finish(settled('levelComplete')), null);
  assert.equal(store.getState().coins, 25);
  assert.equal(session.start(1).mode, 'strategy');
  session.abandon();
  assert.equal(session.finish({ mode: 'strategy', status: 'levelComplete' }), null);
});

test('a failed puzzle gives no reward and can still be solved after Undo', () => {
  const store = createJourneyStore(memoryStorage({ completed: 2 }));
  const session = createJourneySession(store);
  session.start(2);
  assert.equal(session.finish({ mode: 'puzzle', puzzleIndex: 2, status: 'gameOver' }).complete, false);
  assert.equal(store.getState().coins, 0);
  assert.equal(session.active().index, 2);
  assert.equal(session.finish({ mode: 'puzzle', puzzleIndex: 1, status: 'won' }), null);
  assert.equal(session.finish({ mode: 'puzzle', puzzleIndex: 2, status: 'won' }).complete, true);
  assert.equal(store.getState().completed, 3);
});

test('continuous milestones complete during play, while countdown requires its finish', () => {
  const continuous = STAGES.find(stage => stage.mode === 'continuous');
  const blocks = continuous.objective.target;
  const run = (mode, status, roundStats) => ({ mode, status, roundStats });
  assert.equal(stageIsComplete(continuous, run('continuous', 'ready', { blocksCleared: blocks * 2 })), false);
  assert.equal(stageIsComplete(continuous, run('continuous', 'playing', { blocksCleared: blocks - 1 })), false);
  assert.equal(stageIsComplete(continuous, run('continuous', 'gameOver', { blocksCleared: blocks })), false);
  assert.equal(stageIsComplete(continuous, run('continuous', 'playing', { blocksCleared: blocks })), true);
  const countdown = STAGES.find(stage => stage.mode === 'countdown');
  const points = countdown.objective.target;
  assert.equal(stageIsComplete(countdown, run('countdown', 'playing', { grossPoints: 999999 })), false);
  assert.equal(stageIsComplete(countdown, run('countdown', 'won', { grossPoints: points - 1 })), false);
  assert.equal(stageIsComplete(countdown, run('countdown', 'won', { grossPoints: points })), true);
});

test('slot payouts and displayed odds agree for all 125 equally likely outcomes', () => {
  const counts = { 0: 0, 6: 0, 30: 0, 100: 0 };
  let returned = 0;
  for (const a of SLOT_SYMBOLS) for (const b of SLOT_SYMBOLS) for (const c of SLOT_SYMBOLS) {
    const payout = slotPayout([a.id, b.id, c.id]);
    counts[payout]++;
    returned += payout;
  }
  assert.deepEqual(counts, { 0: 60, 6: 60, 30: 4, 100: 1 });
  assert.equal(returned, 580);
  assert.equal(returned / 125, 4.64);
  assert.equal(slotPayout(['star', 'star', 'invalid']), 0);
});

test('a coin spin charges five once, returns the stated payout, and blocks an unaffordable bet', () => {
  const jackpot = playCoinSlot(5, () => 0.999);
  assert.equal(jackpot.bet, SLOT_BET);
  assert.equal(jackpot.payout, 100);
  assert.equal(jackpot.coins, 100);
  const draws = [0, 0.2, 0.4];
  const loss = playCoinSlot(20, () => draws.shift());
  assert.equal(loss.payout, 0);
  assert.equal(loss.coins, 15);
  const noBet = playCoinSlot(4, () => assert.fail('Insufficient coins must not draw a reel'));
  assert.equal(noBet.ok, false);
  assert.equal(noBet.coins, 4);
});

test('the stake is persisted before the reels are drawn', () => {
  const storage = memoryStorage({ coins: 25 });
  const store = createJourneyStore(storage);
  const result = store.spin(() => {
    assert.equal(JSON.parse(storage.getItem(JOURNEY_STORAGE_KEY)).coins, 20);
    return 0;
  });
  assert.equal(result.payout, 30);
  assert.equal(store.getState().coins, 50);
  assert.equal(createJourneyStore(storage).getState().coins, 50);
});

test('unavailable browser storage still permits an in-memory campaign session', () => {
  const storage = { getItem() { throw new Error('disabled'); }, setItem() { throw new Error('disabled'); } };
  const store = createJourneyStore(storage);
  assert.equal(store.complete(0).ok, true);
  assert.equal(store.getState().coins, 25);
  assert.equal(store.purchase('freeze').ok, true);
  assert.equal(store.getState().inventory.freeze, 1);
});

test('a version 1 save keeps its unlocks, coins, and boosts, and starts with no inferred stars', () => {
  const v1 = { version: 1, coins: 140, completed: 7, inventory: { blast: 2, color: 0, freeze: 1 } };
  assert.deepEqual(normalizeJourneySave(v1), { version: 2, coins: 140, completed: 7, inventory: { blast: 2, color: 0, freeze: 1 }, stars: {}, gold: {} });
  const storage = memoryStorage(v1);
  const store = createJourneyStore(storage);
  assert.equal(store.getState().completed, 7);
  assert.equal(store.complete(3).firstClear, false, 'a migrated clear is still a clear');
  const saved = JSON.parse(storage.getItem(JOURNEY_STORAGE_KEY));
  assert.equal(saved.version, 2);
  assert.equal(saved.completed, 7);
  assert.equal(saved.coins, 140 + REPLAY_REWARD);
  assert.deepEqual(saved.stars, {});
});

test('saved star records are bounded, tied to cleared stages, and gold needs a modifier', () => {
  const puzzleStage = STAGES.find(stage => stage.mode === 'puzzle').index;
  const save = normalizeJourneySave({
    completed: 5,
    stars: { 0: { stars: 2, score: 9000.7 }, 1: { stars: 9, score: -4 }, 2: { stars: 0, score: 50 }, 4: { stars: 1 }, 5: { stars: 3, score: 1 }, '01': { stars: 1 }, x: { stars: 1 } },
    gold: {
      0: { stars: 1, score: 500, adjustedScore: 525, modifiers: ['noHints', 'fastRows', 'noUndo'] },
      1: { stars: 2, score: 800, modifiers: [] },
      [puzzleStage]: { stars: 3, score: 700, adjustedScore: 100, modifiers: ['moveLimit', 'fastRows'] },
    },
  });
  assert.deepEqual(save.stars, { 0: { stars: 2, score: 9000 }, 1: { stars: 3, score: 0 }, 4: { stars: 1, score: 0 } });
  assert.deepEqual(save.gold, {
    0: { stars: 1, score: 500, adjustedScore: 525, modifiers: ['fastRows', 'noHints'] },
    [puzzleStage]: { stars: 3, score: 700, adjustedScore: 700, modifiers: ['moveLimit'] },
  });
});

test('regular stars keep the best stars and best points, and never lower either', () => {
  let save = normalizeJourneySave({ completed: 3 });
  assert.equal(recordStageStars(save, 3, { stars: 1, score: 10 }).ok, false, 'an uncleared stage cannot hold stars');
  let result = recordStageStars(save, 1, { stars: 2, score: 4000 });
  assert.equal(result.improved, true);
  save = result.save;
  result = recordStageStars(save, 1, { stars: 1, score: 5000 });
  assert.deepEqual(result.save.stars[1], { stars: 2, score: 5000 });
  save = result.save;
  result = recordStageStars(save, 1, { stars: 1, score: 100 });
  assert.equal(result.improved, false);
  assert.deepEqual(result.save, save);
  result = recordStageStars(save, 1, { stars: 0, score: 999999 });
  assert.equal(result.ok, true);
  assert.equal(result.improved, false, 'a failed attempt earns no stars and records nothing');
  assert.deepEqual(result.save.stars[1], { stars: 2, score: 5000 });
});

test('gold records keep the best attempt whole and stay separate from regular stars', () => {
  let save = recordStageStars(normalizeJourneySave({ completed: 1 }), 0, { stars: 3, score: 40000 }).save;
  const first = { stars: 2, score: 30000, adjustedScore: 31500, modifiers: ['fastRows', 'tallStart'] };
  save = recordGoldStars(save, 0, first).save;
  assert.deepEqual(save.gold[0], first);
  const worse = recordGoldStars(save, 0, { stars: 1, score: 50000, adjustedScore: 55000, modifiers: ['fastRows', 'tallStart', 'noHints'] });
  assert.equal(worse.improved, false, 'more points cannot outrank more gold stars');
  const tiedHigher = recordGoldStars(save, 0, { stars: 2, score: 31000, adjustedScore: 32550, modifiers: ['noHints', 'noBoosts'] });
  assert.equal(tiedHigher.improved, true);
  assert.deepEqual(tiedHigher.save.gold[0].modifiers, ['noBoosts', 'noHints']);
  assert.equal(recordGoldStars(save, 0, { stars: 3, score: 1, adjustedScore: 1, modifiers: [] }).improved, false, 'gold requires a modifier');
  assert.deepEqual(tiedHigher.save.stars[0], { stars: 3, score: 40000 }, 'regular records are untouched');
});

test('stars and gold persist through the browser store alongside replays', () => {
  const storage = memoryStorage({ completed: 2, coins: 10 });
  const store = createJourneyStore(storage);
  assert.equal(store.recordStars(1, { stars: 2, score: 1200 }).ok, true);
  assert.equal(store.recordGold(1, { stars: 1, score: 900, adjustedScore: 900, modifiers: ['noHints'] }).ok, true);
  store.complete(1);
  const restored = createJourneyStore(storage).getState();
  assert.deepEqual(restored.stars, { 1: { stars: 2, score: 1200 } });
  assert.deepEqual(restored.gold, { 1: { stars: 1, score: 900, adjustedScore: 900, modifiers: ['noHints'] } });
  assert.equal(restored.coins, 10 + REPLAY_REWARD);
});
