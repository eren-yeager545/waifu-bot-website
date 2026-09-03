const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateTelegramUser, requireAdminOrOwner } = require('../middleware/auth');

router.use(authenticateTelegramUser);
router.use(requireAdminOrOwner);

/**
 * GET /api/admin/dashboard
 * Admin overview stats and full user list with Telegram IDs
 */
router.get('/dashboard', (req, res) => {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  const cardsCount = db.prepare('SELECT COUNT(*) as count FROM cards').get().count;
  const marketItemsCount = db.prepare('SELECT COUNT(*) as count FROM market_items').get().count;

  const users = db.prepare(`
    SELECT id, telegram_id, username, first_name, role, level, xp, diamonds, gold, soft_coins, streak, created_at
    FROM users
    ORDER BY id DESC
    LIMIT 100
  `).all();

  res.json({
    stats: {
      userCount,
      cardsCount,
      marketItemsCount
    },
    users
  });
});

/**
 * GET /api/admin/configs
 * Retrieve all dynamic configurations (spin, rewards, streaks, level formula, referral)
 */
router.get('/configs', (req, res) => {
  const configs = db.prepare('SELECT * FROM configs').all();
  const configMap = {};
  for (const c of configs) {
    try {
      configMap[c.key] = JSON.parse(c.value);
    } catch (e) {
      configMap[c.key] = c.value;
    }
  }
  res.json({ configs: configMap });
});

/**
 * POST /api/admin/configs
 * Save/update dynamic configurations
 */
router.post('/configs', (req, res) => {
  const { key, value } = req.body;
  if (!key || value === undefined) {
    return res.status(400).json({ error: 'key and value are required' });
  }

  const strValue = typeof value === 'object' ? JSON.stringify(value) : String(value);

  db.prepare('INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)').run(key, strValue);

  res.json({ message: `Configuration ${key} updated successfully` });
});

/**
 * POST /api/admin/cards
 * Add a new card to database
 */
router.post('/cards', (req, res) => {
  const { cardNumber, name, anime, rarity, hp, attack, defense, speed, imageUrl } = req.body;

  if (!cardNumber || !name || !rarity) {
    return res.status(400).json({ error: 'cardNumber, name, and rarity are required' });
  }

  try {
    const info = db.prepare(`
      INSERT INTO cards (card_number, name, anime, rarity, hp, attack, defense, speed, image_url)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(cardNumber, name, anime || null, rarity, hp || 100, attack || 50, defense || 50, speed || 50, imageUrl || null);

    res.json({ message: 'Card created successfully', cardId: info.lastInsertRowid });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/admin/market/items
 * Create or update a Market Item
 */
router.post('/market/items', (req, res) => {
  const { cardId, price, currency, isLimited, availableQuantity, isActive } = req.body;

  if (!cardId || !price || !currency) {
    return res.status(400).json({ error: 'cardId, price, and currency are required' });
  }

  const stmt = db.prepare(`
    INSERT INTO market_items (card_id, price, currency, is_limited, available_quantity, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(cardId, price, currency, isLimited ? 1 : 0, availableQuantity !== undefined ? availableQuantity : -1, isActive !== undefined ? (isActive ? 1 : 0) : 1);

  res.json({ message: 'Market item created successfully', marketItemId: info.lastInsertRowid });
});

/**
 * POST /api/admin/grant
 * Direct grant currency or XP or Card to a user
 */
router.post('/grant', (req, res) => {
  const { targetTelegramId, diamonds = 0, gold = 0, softCoins = 0, xp = 0, cardId } = req.body;

  const targetUser = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(targetTelegramId);
  if (!targetUser) {
    return res.status(404).json({ error: 'Target user not found' });
  }

  db.prepare(`
    UPDATE users
    SET diamonds = diamonds + ?, gold = gold + ?, soft_coins = soft_coins + ?, xp = xp + ?
    WHERE id = ?
  `).run(diamonds, gold, softCoins, xp, targetUser.id);

  if (cardId) {
    db.prepare('INSERT INTO user_cards (user_id, card_id) VALUES (?, ?)').run(targetUser.id, cardId);
  }

  db.prepare(`
    INSERT INTO transactions (user_id, type, amount, currency, description)
    VALUES (?, 'admin_grant', ?, 'multiple', ?)
  `).run(targetUser.id, 0, `Admin granted rewards (D:${diamonds}, G:${gold}, C:${softCoins}, XP:${xp})`);

  res.json({ message: `Successfully granted rewards to ${targetUser.username || targetTelegramId}` });
});

module.exports = router;
