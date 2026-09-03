import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb, getDb } from './database.js';
import { validateAndParseInitData } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const BOT_TOKEN = process.env.BOT_TOKEN || 'MOCK_BOT_TOKEN_FOR_DEV_AND_TESTS';

// Middleware to authenticate Telegram initData header or query param
async function authMiddleware(req, res, next) {
  try {
    const initData = req.headers['x-telegram-init-data'] || req.query.initData;

    // In test environment, allow test header if explicitly specified
    if (process.env.NODE_ENV === 'test' && req.headers['x-mock-user-id']) {
      const mockUserId = parseInt(req.headers['x-mock-user-id']);
      const db = await getDb();
      let user = await db.get('SELECT * FROM users WHERE id = ?', [mockUserId]);
      if (!user) {
        await db.run('INSERT INTO users (id, username, first_name, role) VALUES (?, ?, ?, ?)', [mockUserId, 'TestUser', 'Test', 'user']);
        user = await db.get('SELECT * FROM users WHERE id = ?', [mockUserId]);
      }
      req.user = user;
      return next();
    }

    if (!initData) {
      return res.status(401).json({ error: 'Unauthorized: missing initData' });
    }

    const { user: tgUser, startParam } = validateAndParseInitData(initData, BOT_TOKEN);
    const db = await getDb();

    let user = await db.get('SELECT * FROM users WHERE id = ?', [tgUser.id]);

    if (!user) {
      let referredBy = null;
      if (startParam && startParam.startsWith('ref_')) {
        const refId = parseInt(startParam.replace('ref_', ''));
        if (!isNaN(refId) && refId !== tgUser.id) {
          const referrer = await db.get('SELECT id FROM users WHERE id = ?', [refId]);
          if (referrer) referredBy = refId;
        }
      }

      const isFirstUser = (await db.get('SELECT COUNT(*) as c FROM users')).c === 0;
      const role = isFirstUser ? 'admin' : 'user';

      await db.run(
        `INSERT INTO users (id, username, first_name, last_name, photo_url, role, referred_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [tgUser.id, tgUser.username || '', tgUser.first_name || '', tgUser.last_name || '', tgUser.photo_url || '', role, referredBy]
      );

      if (referredBy) {
        await db.run(
          `INSERT OR IGNORE INTO referrals (referrer_id, referred_id) VALUES (?, ?)`,
          [referredBy, tgUser.id]
        );
      }

      user = await db.get('SELECT * FROM users WHERE id = ?', [tgUser.id]);
    } else {
      // Update profile info if changed
      await db.run(
        `UPDATE users SET username = ?, first_name = ?, last_name = ?, photo_url = ? WHERE id = ?`,
        [tgUser.username || user.username, tgUser.first_name || user.first_name, tgUser.last_name || user.last_name, tgUser.photo_url || user.photo_url, tgUser.id]
      );
      user = await db.get('SELECT * FROM users WHERE id = ?', [tgUser.id]);
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Authentication failed: ' + err.message });
  }
}

export { authMiddleware };

// Auth endpoint
app.get('/api/auth/me', authMiddleware, async (req, res) => {
  const db = await getDb();

  // Calculate card count & total power
  const stats = await db.get(
    `SELECT COUNT(*) as card_count, COALESCE(SUM(c.power), 0) as total_power
     FROM user_cards uc
     JOIN cards c ON uc.card_id = c.id
     WHERE uc.user_id = ?`,
    [req.user.id]
  );

  let favoriteCard = null;
  if (req.user.favorite_card_id) {
    favoriteCard = await db.get('SELECT * FROM cards WHERE id = ?', [req.user.favorite_card_id]);
  }

  res.json({
    user: req.user,
    stats: {
      cardCount: stats.card_count,
      totalPower: stats.total_power
    },
    favoriteCard
  });
});

const PORT = process.env.PORT || 3000;
if (process.env.NODE_ENV !== 'test' && process.argv[1]?.endsWith('server.js')) {
  initDb().then(() => {
    app.listen(PORT, () => {
      console.log(`Waifu Catcher Telegram Web App running on port ${PORT}`);
    });
  });
}

export default app;

// --- COLLECTION ROUTES ---

// Get user card collection
app.get('/api/collection', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const cards = await db.all(
      `SELECT uc.id as user_card_id, uc.obtained_at, uc.is_favorite, c.*
       FROM user_cards uc
       JOIN cards c ON uc.card_id = c.id
       WHERE uc.user_id = ?
       ORDER BY uc.is_favorite DESC, c.power DESC, uc.obtained_at DESC`,
      [req.user.id]
    );
    res.json({ collection: cards });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Set / unset favorite waifu
app.post('/api/collection/favorite', authMiddleware, async (req, res) => {
  try {
    const { cardId } = req.body;
    const db = await getDb();

    if (cardId === null || cardId === undefined) {
      await db.run('UPDATE users SET favorite_card_id = NULL WHERE id = ?', [req.user.id]);
      await db.run('UPDATE user_cards SET is_favorite = 0 WHERE user_id = ?', [req.user.id]);
      return res.json({ success: true, favoriteCardId: null });
    }

    // Verify user owns the card
    const userCard = await db.get(
      'SELECT uc.*, c.id as card_id FROM user_cards uc JOIN cards c ON uc.card_id = c.id WHERE uc.user_id = ? AND c.id = ?',
      [req.user.id, cardId]
    );

    if (!userCard) {
      return res.status(400).json({ error: 'You do not own this waifu card.' });
    }

    await db.run('UPDATE user_cards SET is_favorite = 0 WHERE user_id = ?', [req.user.id]);
    await db.run('UPDATE user_cards SET is_favorite = 1 WHERE user_id = ? AND card_id = ?', [req.user.id, cardId]);
    await db.run('UPDATE users SET favorite_card_id = ? WHERE id = ?', [cardId, req.user.id]);

    const favoriteCard = await db.get('SELECT * FROM cards WHERE id = ?', [cardId]);

    res.json({ success: true, favoriteCard });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// --- GAME ROUTES ---

const CATCH_COOLDOWN_MS = 60 * 1000; // 1 minute cooldown for quick testing/gameplay

// Helper to update user XP and level
async function addXpAndCoins(db, userId, xpGained, coinsGained, gemsGained = 0) {
  const user = await db.get('SELECT xp, level, coins, gems FROM users WHERE id = ?', [userId]);
  let newXp = user.xp + xpGained;
  let newLevel = user.level;
  let xpForNextLevel = newLevel * 100;

  while (newXp >= xpForNextLevel) {
    newXp -= xpForNextLevel;
    newLevel += 1;
    xpForNextLevel = newLevel * 100;
  }

  const newCoins = user.coins + coinsGained;
  const newGems = user.gems + gemsGained;

  await db.run(
    'UPDATE users SET xp = ?, level = ?, coins = ?, gems = ? WHERE id = ?',
    [newXp, newLevel, newCoins, newGems, userId]
  );

  return { newXp, newLevel, levelUp: newLevel > user.level, newCoins, newGems };
}

// Catch Waifu Gacha endpoint
app.post('/api/games/catch', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const now = Date.now();
    const lastCatch = req.user.last_catch_time || 0;
    const timeRemaining = CATCH_COOLDOWN_MS - (now - lastCatch);

    if (timeRemaining > 0) {
      return res.status(429).json({
        error: 'Catch on cooldown',
        cooldownSeconds: Math.ceil(timeRemaining / 1000)
      });
    }

    // Weighted random selection based on rarity
    const allCards = await db.all('SELECT * FROM cards');
    if (!allCards || allCards.length === 0) {
      return res.status(500).json({ error: 'No cards available in database.' });
    }

    // Rarity weights: Common: 50%, Rare: 30%, Epic: 15%, Legendary: 4%, Mythic: 1%
    const weights = { Common: 50, Rare: 30, Epic: 15, Legendary: 4, Mythic: 1 };

    // Group cards by rarity
    const cardsByRarity = {};
    for (const card of allCards) {
      const rarity = card.rarity || 'Common';
      if (!cardsByRarity[rarity]) cardsByRarity[rarity] = [];
      cardsByRarity[rarity].push(card);
    }

    // Pick a rarity weighted
    const rarityPool = [];
    for (const [rarity, weight] of Object.entries(weights)) {
      if (cardsByRarity[rarity] && cardsByRarity[rarity].length > 0) {
        for (let i = 0; i < weight; i++) rarityPool.push(rarity);
      }
    }

    const chosenRarity = rarityPool[Math.floor(Math.random() * rarityPool.length)];
    const availableCardsInRarity = cardsByRarity[chosenRarity];
    const caughtCard = availableCardsInRarity[Math.floor(Math.random() * availableCardsInRarity.length)];

    // Check if duplicate
    const existing = await db.get(
      'SELECT id FROM user_cards WHERE user_id = ? AND card_id = ?',
      [req.user.id, caughtCard.id]
    );

    let isDuplicate = false;
    let duplicateCoinsBonus = 0;

    if (existing) {
      isDuplicate = true;
      // Bonus coins for duplicate based on card power
      duplicateCoinsBonus = Math.floor(caughtCard.power * 1.5);
    }

    // Add card to user collection
    const insertRes = await db.run(
      'INSERT INTO user_cards (user_id, card_id) VALUES (?, ?)',
      [req.user.id, caughtCard.id]
    );

    // Reward XP & Coins
    const baseCoins = Math.floor(caughtCard.power / 2);
    const totalCoins = baseCoins + duplicateCoinsBonus;
    const xpGained = caughtCard.power;

    const rewardStats = await addXpAndCoins(db, req.user.id, xpGained, totalCoins);

    // Update last_catch_time
    await db.run('UPDATE users SET last_catch_time = ? WHERE id = ?', [now, req.user.id]);

    // Log game action
    await db.run(
      'INSERT INTO game_logs (user_id, game_type, result_data) VALUES (?, ?, ?)',
      [req.user.id, 'catch', JSON.stringify({ cardId: caughtCard.id, cardName: caughtCard.name, isDuplicate })]
    );

    // Check tasks for daily catch
    await db.run(
      `UPDATE user_tasks SET progress = progress + 1 WHERE user_id = ? AND task_id IN (
        SELECT id FROM tasks WHERE requirement_type = 'catch_cards'
      )`,
      [req.user.id]
    );

    res.json({
      success: true,
      card: caughtCard,
      userCardId: insertRes.lastID,
      isDuplicate,
      duplicateCoinsBonus,
      coinsEarned: totalCoins,
      xpEarned: xpGained,
      userStats: rewardStats,
      nextCatchTime: now + CATCH_COOLDOWN_MS
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Memory Match Game Reward endpoint
app.post('/api/games/memory/complete', authMiddleware, async (req, res) => {
  try {
    const { score, moves, timeSeconds } = req.body;
    const db = await getDb();

    if (!score || score <= 0) {
      return res.status(400).json({ error: 'Invalid score.' });
    }

    const coinsEarned = Math.min(Math.floor(score * 2), 200);
    const xpEarned = Math.min(Math.floor(score * 1.5), 150);

    const rewardStats = await addXpAndCoins(db, req.user.id, xpEarned, coinsEarned);

    // Log game
    await db.run(
      'INSERT INTO game_logs (user_id, game_type, result_data) VALUES (?, ?, ?)',
      [req.user.id, 'memory', JSON.stringify({ score, moves, timeSeconds })]
    );

    // Update memory game task progress
    await db.run(
      `UPDATE user_tasks SET progress = progress + 1 WHERE user_id = ? AND task_id IN (
        SELECT id FROM tasks WHERE requirement_type = 'memory_game'
      )`,
      [req.user.id]
    );

    res.json({
      success: true,
      coinsEarned,
      xpEarned,
      userStats: rewardStats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- MARKETPLACE ROUTES ---

// Get active marketplace listings & booster packs
app.get('/api/market', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const listings = await db.all(
      `SELECT ml.id as listing_id, ml.price, ml.currency, ml.created_at,
              c.id as card_id, c.name, c.anime, c.rarity, c.image_url, c.power, c.description,
              u.id as seller_id, u.username as seller_username, u.first_name as seller_first_name
       FROM market_listings ml
       JOIN user_cards uc ON ml.user_card_id = uc.id
       JOIN cards c ON ml.card_id = c.id
       JOIN users u ON ml.seller_id = u.id
       WHERE ml.status = 'active'
       ORDER BY ml.created_at DESC`
    );

    // Card Packs definition
    const packs = [
      { id: 'standard_pack', name: 'Standard Waifu Pack', priceCoins: 200, priceGems: 0, cardCount: 1, gachaWeights: { Common: 60, Rare: 30, Epic: 9, Legendary: 1 } },
      { id: 'premium_pack', name: 'Premium Waifu Pack', priceCoins: 0, priceGems: 15, cardCount: 1, gachaWeights: { Common: 20, Rare: 45, Epic: 25, Legendary: 8, Mythic: 2 } },
      { id: 'legendary_pack', name: 'Legendary Waifu Pack', priceCoins: 0, priceGems: 50, cardCount: 1, gachaWeights: { Common: 0, Rare: 20, Epic: 50, Legendary: 25, Mythic: 5 } }
    ];

    res.json({ listings, packs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// List card for sale on market
app.post('/api/market/list', authMiddleware, async (req, res) => {
  try {
    const { userCardId, price, currency = 'coins' } = req.body;
    const db = await getDb();

    if (!userCardId || !price || price <= 0) {
      return res.status(400).json({ error: 'Invalid userCardId or price.' });
    }

    const userCard = await db.get(
      'SELECT uc.*, c.id as card_id FROM user_cards uc JOIN cards c ON uc.card_id = c.id WHERE uc.id = ? AND uc.user_id = ?',
      [userCardId, req.user.id]
    );

    if (!userCard) {
      return res.status(400).json({ error: 'Card not found in your collection.' });
    }

    // Check if already listed
    const existingListing = await db.get(
      'SELECT id FROM market_listings WHERE user_card_id = ? AND status = "active"',
      [userCardId]
    );

    if (existingListing) {
      return res.status(400).json({ error: 'Card is already listed on the market.' });
    }

    const insertRes = await db.run(
      `INSERT INTO market_listings (seller_id, user_card_id, card_id, price, currency)
       VALUES (?, ?, ?, ?, ?)`,
      [req.user.id, userCardId, userCard.card_id, price, currency]
    );

    // Track achievement progress for market sales/listings
    await db.run(
      `UPDATE user_tasks SET progress = progress + 1 WHERE user_id = ? AND task_id IN (
        SELECT id FROM tasks WHERE requirement_type = 'market_sales'
      )`,
      [req.user.id]
    );

    res.json({ success: true, listingId: insertRes.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Buy card from market
app.post('/api/market/buy', authMiddleware, async (req, res) => {
  try {
    const { listingId } = req.body;
    const db = await getDb();

    const listing = await db.get(
      'SELECT * FROM market_listings WHERE id = ? AND status = "active"',
      [listingId]
    );

    if (!listing) {
      return res.status(404).json({ error: 'Listing not found or no longer active.' });
    }

    if (listing.seller_id === req.user.id) {
      return res.status(400).json({ error: 'You cannot buy your own listing.' });
    }

    const buyer = await db.get('SELECT coins, gems FROM users WHERE id = ?', [req.user.id]);
    const currency = listing.currency || 'coins';

    if (currency === 'coins' && buyer.coins < listing.price) {
      return res.status(400).json({ error: 'Insufficient coins.' });
    }
    if (currency === 'gems' && buyer.gems < listing.price) {
      return res.status(400).json({ error: 'Insufficient gems.' });
    }

    // Deduct from buyer
    if (currency === 'coins') {
      await db.run('UPDATE users SET coins = coins - ? WHERE id = ?', [listing.price, req.user.id]);
      await db.run('UPDATE users SET coins = coins + ? WHERE id = ?', [listing.price, listing.seller_id]);
    } else {
      await db.run('UPDATE users SET gems = gems - ? WHERE id = ?', [listing.price, req.user.id]);
      await db.run('UPDATE users SET gems = gems + ? WHERE id = ?', [listing.price, listing.seller_id]);
    }

    // Transfer card ownership
    await db.run('UPDATE user_cards SET user_id = ?, is_favorite = 0 WHERE id = ?', [req.user.id, listing.user_card_id]);
    await db.run('UPDATE market_listings SET status = "sold" WHERE id = ?', [listingId]);

    const updatedUser = await db.get('SELECT coins, gems FROM users WHERE id = ?', [req.user.id]);

    res.json({
      success: true,
      message: 'Card purchased successfully!',
      coins: updatedUser.coins,
      gems: updatedUser.gems
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Buy Booster Pack
app.post('/api/market/buy-pack', authMiddleware, async (req, res) => {
  try {
    const { packId } = req.body;
    const db = await getDb();

    const packPrices = {
      standard_pack: { priceCoins: 200, priceGems: 0, weights: { Common: 60, Rare: 30, Epic: 9, Legendary: 1 } },
      premium_pack: { priceCoins: 0, priceGems: 15, weights: { Common: 20, Rare: 45, Epic: 25, Legendary: 8, Mythic: 2 } },
      legendary_pack: { priceCoins: 0, priceGems: 50, weights: { Common: 0, Rare: 20, Epic: 50, Legendary: 25, Mythic: 5 } }
    };

    const pack = packPrices[packId];
    if (!pack) {
      return res.status(400).json({ error: 'Invalid pack ID.' });
    }

    const user = await db.get('SELECT coins, gems FROM users WHERE id = ?', [req.user.id]);

    if (pack.priceCoins > 0 && user.coins < pack.priceCoins) {
      return res.status(400).json({ error: 'Insufficient coins for this pack.' });
    }
    if (pack.priceGems > 0 && user.gems < pack.priceGems) {
      return res.status(400).json({ error: 'Insufficient gems for this pack.' });
    }

    // Deduct cost
    await db.run(
      'UPDATE users SET coins = coins - ?, gems = gems - ? WHERE id = ?',
      [pack.priceCoins, pack.priceGems, req.user.id]
    );

    // Roll gacha card based on pack weights
    const allCards = await db.all('SELECT * FROM cards');
    const cardsByRarity = {};
    for (const c of allCards) {
      const r = c.rarity || 'Common';
      if (!cardsByRarity[r]) cardsByRarity[r] = [];
      cardsByRarity[r].push(c);
    }

    const rarityPool = [];
    for (const [rarity, weight] of Object.entries(pack.weights)) {
      if (cardsByRarity[rarity] && cardsByRarity[rarity].length > 0) {
        for (let i = 0; i < weight; i++) rarityPool.push(rarity);
      }
    }

    const chosenRarity = rarityPool[Math.floor(Math.random() * rarityPool.length)];
    const chosenCard = cardsByRarity[chosenRarity][Math.floor(Math.random() * cardsByRarity[chosenRarity].length)];

    // Insert to user collection
    const insertRes = await db.run(
      'INSERT INTO user_cards (user_id, card_id) VALUES (?, ?)',
      [req.user.id, chosenCard.id]
    );

    const updatedUser = await db.get('SELECT coins, gems FROM users WHERE id = ?', [req.user.id]);

    res.json({
      success: true,
      card: chosenCard,
      userCardId: insertRes.lastID,
      coins: updatedUser.coins,
      gems: updatedUser.gems
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// --- TASKS & STREAK ROUTES ---

// Get tasks and current user progress
app.get('/api/tasks', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const tasks = await db.all('SELECT * FROM tasks');

    // Ensure user_tasks records exist for this user
    for (const task of tasks) {
      await db.run(
        `INSERT OR IGNORE INTO user_tasks (user_id, task_id, progress, completed) VALUES (?, ?, 0, 0)`,
        [req.user.id, task.id]
      );
    }

    const userTasks = await db.all(
      `SELECT t.*, ut.progress, ut.completed, ut.last_completed_at
       FROM tasks t
       JOIN user_tasks ut ON t.id = ut.task_id
       WHERE ut.user_id = ?`,
      [req.user.id]
    );

    res.json({ tasks: userTasks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Daily Streak Check-in
app.post('/api/tasks/streak/claim', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const todayStr = new Date().toISOString().split('T')[0];
    const user = await db.get('SELECT streak, last_streak_date, coins, gems FROM users WHERE id = ?', [req.user.id]);

    if (user.last_streak_date === todayStr) {
      return res.status(400).json({ error: 'Daily streak reward already claimed today.' });
    }

    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];
    let newStreak = 1;
    if (user.last_streak_date === yesterdayStr) {
      newStreak = user.streak + 1;
    }

    // Streak rewards increase with streak length
    const coinReward = 50 + (newStreak * 10);
    const gemReward = (newStreak % 7 === 0) ? 10 : 0; // Bonus gems every 7 days

    await db.run(
      `UPDATE users
       SET streak = ?, last_streak_date = ?, coins = coins + ?, gems = gems + ?
       WHERE id = ?`,
      [newStreak, todayStr, coinReward, gemReward, req.user.id]
    );

    res.json({
      success: true,
      streak: newStreak,
      rewardCoins: coinReward,
      rewardGems: gemReward
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Claim task completion reward
app.post('/api/tasks/claim', authMiddleware, async (req, res) => {
  try {
    const { taskId } = req.body;
    const db = await getDb();

    const userTask = await db.get(
      `SELECT ut.*, t.reward_type, t.reward_amount, t.requirement_count
       FROM user_tasks ut
       JOIN tasks t ON ut.task_id = t.id
       WHERE ut.user_id = ? AND ut.task_id = ?`,
      [req.user.id, taskId]
    );

    if (!userTask) {
      return res.status(404).json({ error: 'Task record not found.' });
    }

    if (userTask.completed) {
      return res.status(400).json({ error: 'Task reward already claimed.' });
    }

    if (userTask.progress < userTask.requirement_count) {
      return res.status(400).json({ error: 'Task requirements not yet met.' });
    }

    // Reward user
    if (userTask.reward_type === 'coins') {
      await db.run('UPDATE users SET coins = coins + ? WHERE id = ?', [userTask.reward_amount, req.user.id]);
    } else if (userTask.reward_type === 'gems') {
      await db.run('UPDATE users SET gems = gems + ? WHERE id = ?', [userTask.reward_amount, req.user.id]);
    }

    await db.run(
      `UPDATE user_tasks SET completed = 1, last_completed_at = CURRENT_TIMESTAMP WHERE user_id = ? AND task_id = ?`,
      [req.user.id, taskId]
    );

    const updatedUser = await db.get('SELECT coins, gems FROM users WHERE id = ?', [req.user.id]);

    res.json({
      success: true,
      rewardType: userTask.reward_type,
      rewardAmount: userTask.reward_amount,
      coins: updatedUser.coins,
      gems: updatedUser.gems
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// --- REWARDS & REFERRALS ROUTES ---

app.get('/api/rewards/referrals', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const referralList = await db.all(
      `SELECT r.id, r.claimed, r.created_at, u.username, u.first_name
       FROM referrals r
       JOIN users u ON r.referred_id = u.id
       WHERE r.referrer_id = ?
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );

    const botUsername = process.env.BOT_USERNAME || 'WaifuCatcherBot';
    const inviteLink = `https://t.me/${botUsername}?start=ref_${req.user.id}`;

    res.json({
      referrals: referralList,
      totalReferrals: referralList.length,
      inviteLink
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Claim referral bonus
app.post('/api/rewards/referral/claim', authMiddleware, async (req, res) => {
  try {
    const { referralId } = req.body;
    const db = await getDb();

    const referral = await db.get(
      'SELECT * FROM referrals WHERE id = ? AND referrer_id = ?',
      [referralId, req.user.id]
    );

    if (!referral) {
      return res.status(404).json({ error: 'Referral record not found.' });
    }

    if (referral.claimed) {
      return res.status(400).json({ error: 'Referral bonus already claimed.' });
    }

    // Reward: 200 coins and 10 gems per referral
    await db.run('UPDATE users SET coins = coins + 200, gems = gems + 10 WHERE id = ?', [req.user.id]);
    await db.run('UPDATE referrals SET claimed = 1 WHERE id = ?', [referralId]);

    const updatedUser = await db.get('SELECT coins, gems FROM users WHERE id = ?', [req.user.id]);

    res.json({
      success: true,
      coinsGained: 200,
      gemsGained: 10,
      coins: updatedUser.coins,
      gems: updatedUser.gems
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// --- ACHIEVEMENTS ROUTES ---

app.get('/api/achievements', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const achievements = await db.all('SELECT * FROM achievements');

    // Get user stats for evaluation
    const user = req.user;
    const cardCount = (await db.get('SELECT COUNT(*) as c FROM user_cards WHERE user_id = ?', [user.id])).c;
    const salesCount = (await db.get('SELECT COUNT(*) as c FROM market_listings WHERE seller_id = ?', [user.id])).c;

    const userAchList = await db.all('SELECT * FROM user_achievements WHERE user_id = ?', [user.id]);
    const userAchMap = {};
    for (const ua of userAchList) {
      userAchMap[ua.achievement_id] = ua;
    }

    const formattedAchievements = [];

    for (const ach of achievements) {
      let isUnlocked = false;
      let currentVal = 0;

      if (ach.requirement_type === 'card_count') currentVal = cardCount;
      else if (ach.requirement_type === 'streak_days') currentVal = user.streak;
      else if (ach.requirement_type === 'level_reached') currentVal = user.level;
      else if (ach.requirement_type === 'market_sales') currentVal = salesCount;

      isUnlocked = currentVal >= ach.requirement_value;

      const ua = userAchMap[ach.id];

      formattedAchievements.push({
        ...ach,
        currentProgress: currentVal,
        isUnlocked,
        isClaimed: ua ? Boolean(ua.claimed) : false
      });
    }

    res.json({ achievements: formattedAchievements });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Claim achievement reward
app.post('/api/achievements/claim', authMiddleware, async (req, res) => {
  try {
    const { achievementId } = req.body;
    const db = await getDb();

    const ach = await db.get('SELECT * FROM achievements WHERE id = ?', [achievementId]);
    if (!ach) {
      return res.status(404).json({ error: 'Achievement not found.' });
    }

    // Evaluate if user qualifies
    const user = req.user;
    const cardCount = (await db.get('SELECT COUNT(*) as c FROM user_cards WHERE user_id = ?', [user.id])).c;
    const salesCount = (await db.get('SELECT COUNT(*) as c FROM market_listings WHERE seller_id = ?', [user.id])).c;

    let currentVal = 0;
    if (ach.requirement_type === 'card_count') currentVal = cardCount;
    else if (ach.requirement_type === 'streak_days') currentVal = user.streak;
    else if (ach.requirement_type === 'level_reached') currentVal = user.level;
    else if (ach.requirement_type === 'market_sales') currentVal = salesCount;

    if (currentVal < ach.requirement_value) {
      return res.status(400).json({ error: 'Achievement requirements not met.' });
    }

    let ua = await db.get('SELECT * FROM user_achievements WHERE user_id = ? AND achievement_id = ?', [user.id, achievementId]);
    if (ua && ua.claimed) {
      return res.status(400).json({ error: 'Achievement reward already claimed.' });
    }

    if (!ua) {
      await db.run('INSERT INTO user_achievements (user_id, achievement_id, claimed) VALUES (?, ?, 1)', [user.id, achievementId]);
    } else {
      await db.run('UPDATE user_achievements SET claimed = 1 WHERE user_id = ? AND achievement_id = ?', [user.id, achievementId]);
    }

    const rewardStats = await addXpAndCoins(db, user.id, ach.reward_xp, ach.reward_coins, ach.reward_gems);

    res.json({
      success: true,
      rewardCoins: ach.reward_coins,
      rewardGems: ach.reward_gems,
      rewardXp: ach.reward_xp,
      userStats: rewardStats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// --- LEADERBOARD ROUTES ---

app.get('/api/leaderboard', authMiddleware, async (req, res) => {
  try {
    const db = await getDb();

    // Top collectors
    const topCollectors = await db.all(
      `SELECT u.id, u.username, u.first_name, u.photo_url, COUNT(uc.id) as score
       FROM users u
       LEFT JOIN user_cards uc ON u.id = uc.user_id
       GROUP BY u.id
       ORDER BY score DESC, u.xp DESC
       LIMIT 20`
    );

    // Richest users
    const topRichest = await db.all(
      `SELECT id, username, first_name, photo_url, coins as score
       FROM users
       ORDER BY coins DESC, gems DESC
       LIMIT 20`
    );

    // Highest level
    const topLevels = await db.all(
      `SELECT id, username, first_name, photo_url, level as score, xp
       FROM users
       ORDER BY level DESC, xp DESC
       LIMIT 20`
    );

    res.json({
      collectors: topCollectors,
      richest: topRichest,
      levels: topLevels
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- ADMIN / DEVELOPER CONTROLS ---

function adminMiddleware(req, res, next) {
  if (!req.user || (req.user.role !== 'admin' && req.user.role !== 'owner' && req.user.role !== 'developer')) {
    return res.status(403).json({ error: 'Access denied: Admin/Developer privileges required.' });
  }
  next();
}

// Get admin stats & overview
app.get('/api/admin/overview', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const db = await getDb();
    const totalUsers = (await db.get('SELECT COUNT(*) as count FROM users')).count;
    const totalCardsInDb = (await db.get('SELECT COUNT(*) as count FROM cards')).count;
    const totalCardsCollected = (await db.get('SELECT COUNT(*) as count FROM user_cards')).count;
    const activeMarketListings = (await db.get('SELECT COUNT(*) as count FROM market_listings WHERE status = "active"')).count;
    const recentUsers = await db.all('SELECT id, username, first_name, coins, gems, level, role, created_at FROM users ORDER BY created_at DESC LIMIT 10');

    res.json({
      metrics: {
        totalUsers,
        totalCardsInDb,
        totalCardsCollected,
        activeMarketListings
      },
      recentUsers
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Modify user resources (coins, gems, level, role)
app.post('/api/admin/user/update', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { targetUserId, coins, gems, level, role } = req.body;
    const db = await getDb();

    const targetUser = await db.get('SELECT * FROM users WHERE id = ?', [targetUserId]);
    if (!targetUser) {
      return res.status(404).json({ error: 'Target user not found.' });
    }

    const newCoins = coins !== undefined ? parseInt(coins) : targetUser.coins;
    const newGems = gems !== undefined ? parseInt(gems) : targetUser.gems;
    const newLevel = level !== undefined ? parseInt(level) : targetUser.level;
    const newRole = role !== undefined ? role : targetUser.role;

    await db.run(
      'UPDATE users SET coins = ?, gems = ?, level = ?, role = ? WHERE id = ?',
      [newCoins, newGems, newLevel, newRole, targetUserId]
    );

    const updated = await db.get('SELECT id, username, coins, gems, level, role FROM users WHERE id = ?', [targetUserId]);

    res.json({ success: true, user: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Grant specific waifu card to user
app.post('/api/admin/user/grant-card', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { targetUserId, cardId } = req.body;
    const db = await getDb();

    const card = await db.get('SELECT * FROM cards WHERE id = ?', [cardId]);
    if (!card) {
      return res.status(404).json({ error: 'Card not found.' });
    }

    const insertRes = await db.run(
      'INSERT INTO user_cards (user_id, card_id) VALUES (?, ?)',
      [targetUserId, cardId]
    );

    res.json({ success: true, userCardId: insertRes.lastID, card });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add new card to database
app.post('/api/admin/cards/add', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, anime, rarity, image_url, power, description } = req.body;
    const db = await getDb();

    if (!name || !anime || !rarity || !power) {
      return res.status(400).json({ error: 'Missing required card fields.' });
    }

    const insertRes = await db.run(
      `INSERT INTO cards (name, anime, rarity, image_url, power, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, anime, rarity, image_url || 'https://picsum.photos/seed/waifu/300/400', parseInt(power), description || '']
    );

    const newCard = await db.get('SELECT * FROM cards WHERE id = ?', [insertRes.lastID]);

    res.json({ success: true, card: newCard });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
