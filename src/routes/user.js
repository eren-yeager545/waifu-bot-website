const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateTelegramUser } = require('../middleware/auth');

// Apply auth middleware to all user routes
router.use(authenticateTelegramUser);

/**
 * GET /api/user/profile
 * Returns public user profile, balances, level, XP, and streak.
 * Masked Telegram User ID / internal database IDs for privacy.
 */
router.get('/profile', (req, res) => {
  const user = req.user;

  // Calculate XP required for next level based on formula
  const baseXP = 100;
  const xpMultiplier = 1.2;
  const xpForNextLevel = Math.floor(baseXP * Math.pow(xpMultiplier, user.level - 1));
  const xpProgressPct = Math.min(100, Math.floor((user.xp / xpForNextLevel) * 100));

  res.json({
    displayName: user.first_name + (user.last_name ? ' ' + user.last_name : ''),
    username: user.username,
    photoUrl: user.photo_url,
    role: user.role,
    level: user.level,
    xp: user.xp,
    xpForNextLevel,
    xpProgressPct,
    streak: user.streak,
    balances: {
      diamonds: user.diamonds,
      gold: user.gold,
      softCoins: user.soft_coins
    },
    lastActiveAt: user.last_active_at,
    dailyPurchasesCount: user.daily_purchases_count
  });
});

/**
 * GET /api/user/balances
 * Returns current balances only
 */
router.get('/balances', (req, res) => {
  res.json({
    diamonds: req.user.diamonds,
    gold: req.user.gold,
    softCoins: req.user.soft_coins
  });
});

/**
 * GET /api/user/collection
 * Returns cards owned by the authenticated user with stats and card details
 */
router.get('/collection', (req, res) => {
  const userCards = db.prepare(`
    SELECT
      uc.id as collection_id,
      uc.obtained_at,
      uc.games_played,
      uc.wins,
      uc.score,
      c.card_number,
      c.name,
      c.anime,
      c.rarity,
      c.hp,
      c.attack,
      c.defense,
      c.speed,
      c.image_url
    FROM user_cards uc
    JOIN cards c ON uc.card_id = c.id
    WHERE uc.user_id = ?
    ORDER BY c.card_number ASC, uc.obtained_at DESC
  `).all(req.user.id);

  res.json({
    totalCards: userCards.length,
    cards: userCards
  });
});

/**
 * GET /api/user/game-stats
 * Returns overall game statistics for the user across all mini-games
 */
router.get('/game-stats', (req, res) => {
  const stats = db.prepare(`
    SELECT game_type, games_played, wins, losses, draws, high_score, best_score, xp_earned
    FROM game_stats
    WHERE user_id = ?
  `).all(req.user.id);

  res.json({
    stats
  });
});

/**
 * GET /api/user/public-profile/:id
 * Displays another user's public profile safely without exposing IDs or private info
 */
router.get('/public-profile/:userId', (req, res) => {
  const targetUser = db.prepare(`
    SELECT first_name, last_name, username, photo_url, level, xp, streak
    FROM users WHERE id = ?
  `).get(req.params.userId);

  if (!targetUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  const userCardsCount = db.prepare('SELECT COUNT(*) as count FROM user_cards WHERE user_id = ?').get(req.params.userId).count;

  res.json({
    displayName: targetUser.first_name + (targetUser.last_name ? ' ' + targetUser.last_name : ''),
    username: targetUser.username,
    photoUrl: targetUser.photo_url,
    level: targetUser.level,
    xp: targetUser.xp,
    streak: targetUser.streak,
    totalCardsCount: userCardsCount
  });
});

module.exports = router;
