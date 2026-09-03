const express = require('express');
const router = express.Router();
const { db } = require('../db');
const { authenticateTelegramUser } = require('../middleware/auth');

router.use(authenticateTelegramUser);

/**
 * GET /api/leaderboard/:type
 * Returns Top 10 leaderboard for normal users with current user's rank/score appended.
 * Types supported: 'level', 'diamonds', 'soft_coins', 'gold', 'cards', 'ctop', 'game_flappy', 'game_mines', 'game_rps', 'game_knife', 'game_snake'
 */
router.get('/:type', (req, res) => {
  const { type } = req.params;
  const user = req.user;
  const isAdminOrOwner = ['owner', 'developer', 'admin'].includes(user.role);

  let query = '';
  let scoreField = '';

  switch (type) {
    case 'level':
      query = `SELECT id, first_name, last_name, username, photo_url, level as score, xp FROM users ORDER BY level DESC, xp DESC`;
      scoreField = 'Level';
      break;
    case 'diamonds':
      query = `SELECT id, first_name, last_name, username, photo_url, diamonds as score FROM users ORDER BY diamonds DESC`;
      scoreField = 'Diamonds';
      break;
    case 'soft_coins':
      query = `SELECT id, first_name, last_name, username, photo_url, soft_coins as score FROM users ORDER BY soft_coins DESC`;
      scoreField = 'Soft Coins';
      break;
    case 'gold':
      query = `SELECT id, first_name, last_name, username, photo_url, gold as score FROM users ORDER BY gold DESC`;
      scoreField = 'Gold';
      break;
    case 'cards':
      query = `
        SELECT u.id, u.first_name, u.last_name, u.username, u.photo_url, COUNT(uc.id) as score
        FROM users u
        LEFT JOIN user_cards uc ON u.id = uc.user_id
        GROUP BY u.id
        ORDER BY score DESC
      `;
      scoreField = 'Cards Owned';
      break;
    case 'ctop':
      // CTOP calculation: (level * 100) + (diamonds * 10) + (soft_coins / 10) + (cards_count * 50)
      query = `
        SELECT
          u.id, u.first_name, u.last_name, u.username, u.photo_url,
          CAST((u.level * 100) + (u.diamonds * 10) + (u.soft_coins / 10) + (COUNT(uc.id) * 50) AS INTEGER) as score
        FROM users u
        LEFT JOIN user_cards uc ON u.id = uc.user_id
        GROUP BY u.id
        ORDER BY score DESC
      `;
      scoreField = 'CTOP Power Score';
      break;
    case 'game_flappy':
    case 'game_mines':
    case 'game_rps':
    case 'game_knife':
    case 'game_snake':
      const gameTypeMap = {
        game_flappy: 'flappy_bird',
        game_mines: 'mines',
        game_rps: 'rps',
        game_knife: 'knife_smash',
        game_snake: 'snake'
      };
      const gameCode = gameTypeMap[type];
      query = `
        SELECT u.id, u.first_name, u.last_name, u.username, u.photo_url, COALESCE(gs.high_score, 0) as score
        FROM users u
        LEFT JOIN game_stats gs ON u.id = gs.user_id AND gs.game_type = '${gameCode}'
        ORDER BY score DESC
      `;
      scoreField = 'High Score';
      break;
    default:
      return res.status(400).json({ error: 'Invalid leaderboard type' });
  }

  const allRows = db.prepare(query).all();

  // Find position of the requesting user
  let userRank = -1;
  let userScore = 0;

  const sanitizedRows = allRows.map((row, index) => {
    const rank = index + 1;
    if (row.id === user.id) {
      userRank = rank;
      userScore = row.score;
    }

    return {
      rank,
      displayName: row.first_name + (row.last_name ? ' ' + row.last_name : ''),
      username: row.username,
      photoUrl: row.photo_url,
      score: row.score,
      isCurrentUser: row.id === user.id
      // Note: Never expose Telegram User ID or DB ID to normal users
    };
  });

  // Apply Privacy Rule: Normal users ONLY see Top 10
  const topList = isAdminOrOwner ? sanitizedRows : sanitizedRows.slice(0, 10);

  res.json({
    type,
    scoreField,
    top10: topList,
    myPosition: {
      rank: userRank,
      score: userScore,
      displayName: user.first_name + (user.last_name ? ' ' + user.last_name : '')
    }
  });
});

module.exports = router;
