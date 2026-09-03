const express = require('express');
const router = express.Router();
const { db, transaction } = require('../db');
const { authenticateTelegramUser } = require('../middleware/auth');

router.use(authenticateTelegramUser);

const DAILY_PURCHASE_LIMIT = 5;

/**
 * Helper to check and reset user daily purchase limit if 24 hours have passed or new date
 */
function checkAndUpdateDailyPurchaseLimit(userId) {
  const user = db.prepare('SELECT daily_purchases_count, last_purchase_date FROM users WHERE id = ?').get(userId);
  const todayStr = new Date().toISOString().split('T')[0];

  if (!user.last_purchase_date || user.last_purchase_date !== todayStr) {
    db.prepare(`
      UPDATE users
      SET daily_purchases_count = 0, last_purchase_date = ?
      WHERE id = ?
    `).run(todayStr, userId);
    return 0;
  }

  return user.daily_purchases_count;
}

/**
 * GET /api/market/items
 * Returns all active market items with card details and user's remaining purchase allowance
 */
router.get('/items', (req, res) => {
  const dailyPurchases = checkAndUpdateDailyPurchaseLimit(req.user.id);
  const remainingPurchases = Math.max(0, DAILY_PURCHASE_LIMIT - dailyPurchases);

  const items = db.prepare(`
    SELECT
      m.id as market_item_id,
      m.price,
      m.currency,
      m.is_limited,
      m.available_quantity,
      m.is_active,
      c.card_number,
      c.name,
      c.anime,
      c.rarity,
      c.hp,
      c.attack,
      c.defense,
      c.speed,
      c.image_url
    FROM market_items m
    JOIN cards c ON m.card_id = c.id
    WHERE m.is_active = 1
  `).all();

  res.json({
    dailyLimit: DAILY_PURCHASE_LIMIT,
    purchasesToday: dailyPurchases,
    remainingPurchasesToday: remainingPurchases,
    items
  });
});

/**
 * POST /api/market/buy
 * Atomic purchase transaction of market item with 5 purchases/day limit enforcement
 */
router.post('/buy', (req, res) => {
  const { marketItemId } = req.body;

  if (!marketItemId) {
    return res.status(400).json({ error: 'marketItemId is required' });
  }

  try {
    const result = transaction(() => {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
      const todayStr = new Date().toISOString().split('T')[0];

      let dailyPurchases = user.daily_purchases_count;
      if (!user.last_purchase_date || user.last_purchase_date !== todayStr) {
        dailyPurchases = 0;
      }

      if (dailyPurchases >= DAILY_PURCHASE_LIMIT) {
        throw new Error(`DAILY_LIMIT_REACHED: You have reached the maximum limit of ${DAILY_PURCHASE_LIMIT} purchases per day.`);
      }

      const item = db.prepare(`
        SELECT m.*, c.name as card_name, c.card_number
        FROM market_items m
        JOIN cards c ON m.card_id = c.id
        WHERE m.id = ? AND m.is_active = 1
      `).get(marketItemId);

      if (!item) {
        throw new Error('ITEM_NOT_FOUND: Market item is invalid or inactive.');
      }

      if (item.is_limited && item.available_quantity <= 0) {
        throw new Error('SOLD_OUT: This item is sold out.');
      }

      const currencyCol = item.currency.toLowerCase(); // 'diamonds', 'gold', 'soft_coins'
      const userBalance = user[currencyCol];

      if (userBalance === undefined || userBalance < item.price) {
        throw new Error(`INSUFFICIENT_FUNDS: Not enough ${item.currency}. Required: ${item.price}, Available: ${userBalance}`);
      }

      // Deduct currency
      db.prepare(`UPDATE users SET ${currencyCol} = ${currencyCol} - ? WHERE id = ?`).run(item.price, user.id);

      // Increment daily purchase limit counter
      db.prepare(`
        UPDATE users
        SET daily_purchases_count = ?, last_purchase_date = ?
        WHERE id = ?
      `).run(dailyPurchases + 1, todayStr, user.id);

      // Deduct available stock if limited
      if (item.is_limited) {
        db.prepare('UPDATE market_items SET available_quantity = available_quantity - 1 WHERE id = ?').run(item.id);
      }

      // Add Card to User Collection
      db.prepare('INSERT INTO user_cards (user_id, card_id) VALUES (?, ?)').run(user.id, item.card_id);

      // Record transaction log
      db.prepare(`
        INSERT INTO transactions (user_id, type, amount, currency, description)
        VALUES (?, 'market_purchase', ?, ?, ?)
      `).run(user.id, -item.price, item.currency, `Purchased card ${item.card_name} (#${item.card_number}) from Market`);

      // Fetch updated balances
      const updatedUser = db.prepare('SELECT diamonds, gold, soft_coins FROM users WHERE id = ?').get(user.id);

      return {
        success: true,
        message: `Successfully purchased ${item.card_name}!`,
        cardName: item.card_name,
        cardNumber: item.card_number,
        purchasesToday: dailyPurchases + 1,
        remainingPurchasesToday: DAILY_PURCHASE_LIMIT - (dailyPurchases + 1),
        newBalances: {
          diamonds: updatedUser.diamonds,
          gold: updatedUser.gold,
          softCoins: updatedUser.soft_coins
        }
      };
    });

    res.json(result);
  } catch (err) {
    const errorMsg = err.message || 'Market purchase failed';
    res.status(400).json({ error: errorMsg });
  }
});

/**
 * GET /api/market/history
 * Returns transaction history for the user
 */
router.get('/history', (req, res) => {
  const history = db.prepare(`
    SELECT type, amount, currency, description, created_at
    FROM transactions
    WHERE user_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).all(req.user.id);

  res.json({ history });
});

module.exports = router;
