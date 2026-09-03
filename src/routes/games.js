const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { db, transaction } = require('../db');
const { authenticateTelegramUser } = require('../middleware/auth');
const { grantUserRewards } = require('./rewards');

router.use(authenticateTelegramUser);

// In-memory active session store (or session tracking table)
const activeSessions = new Map();

/**
 * POST /api/games/start
 * Generates a signed game session token to validate gameplay start time & anti-cheat rules
 */
router.post('/start', (req, res) => {
  const { gameType } = req.body;
  const allowedGames = ['flappy_bird', 'mines', 'rps', 'knife_smash', 'snake'];

  if (!gameType || !allowedGames.includes(gameType)) {
    return res.status(400).json({ error: 'Invalid gameType' });
  }

  const sessionId = crypto.randomUUID();
  const startTime = Date.now();

  activeSessions.set(sessionId, {
    userId: req.user.id,
    gameType,
    startTime
  });

  res.json({
    sessionId,
    gameType,
    startTime
  });
});

/**
 * POST /api/games/submit
 * Submits game score with server-side sanity & anti-cheat checks, updating stats & granting rewards
 */
router.post('/submit', (req, res) => {
  const { sessionId, gameType, score = 0, isWin = false, isDraw = false, moves = [] } = req.body;
  const user = req.user;

  const session = activeSessions.get(sessionId);
  if (!session) {
    return res.status(400).json({ error: 'INVALID_SESSION: Game session expired or not found.' });
  }

  if (session.userId !== user.id || session.gameType !== gameType) {
    return res.status(403).json({ error: 'SESSION_MISMATCH: Unauthorized game session.' });
  }

  const durationSec = (Date.now() - session.startTime) / 1000;
  activeSessions.delete(sessionId); // Single-use session

  // Anti-cheat verification checks
  if (gameType === 'flappy_bird' && score > 0 && durationSec < score * 0.5) {
    return res.status(400).json({ error: 'ANTI_CHEAT_TRIGGERED: Impossible score for time elapsed.' });
  }
  if (gameType === 'knife_smash' && score > 0 && durationSec < score * 0.3) {
    return res.status(400).json({ error: 'ANTI_CHEAT_TRIGGERED: Unrealistic gameplay speed.' });
  }
  if (gameType === 'snake' && score > 0 && durationSec < score * 0.2) {
    return res.status(400).json({ error: 'ANTI_CHEAT_TRIGGERED: Unrealistic snake score speed.' });
  }

  // Calculate XP & Coin rewards based on performance
  let rewardXP = Math.min(50, Math.floor(score * 2) + (isWin ? 20 : 5));
  let rewardCoins = Math.min(200, Math.floor(score * 5) + (isWin ? 50 : 10));

  // Update Game Stats atomically
  const result = transaction(() => {
    let existingStats = db.prepare('SELECT * FROM game_stats WHERE user_id = ? AND game_type = ?').get(user.id, gameType);

    if (!existingStats) {
      db.prepare(`
        INSERT INTO game_stats (user_id, game_type, games_played, wins, losses, draws, high_score, best_score, xp_earned)
        VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?)
      `).run(
        user.id,
        gameType,
        isWin ? 1 : 0,
        (!isWin && !isDraw) ? 1 : 0,
        isDraw ? 1 : 0,
        score,
        score,
        rewardXP
      );
    } else {
      const newGamesPlayed = existingStats.games_played + 1;
      const newWins = existingStats.wins + (isWin ? 1 : 0);
      const newLosses = existingStats.losses + ((!isWin && !isDraw) ? 1 : 0);
      const newDraws = existingStats.draws + (isDraw ? 1 : 0);
      const newHighScore = Math.max(existingStats.high_score, score);
      const newBestScore = Math.max(existingStats.best_score, score);
      const newXPEarned = existingStats.xp_earned + rewardXP;

      db.prepare(`
        UPDATE game_stats
        SET games_played = ?, wins = ?, losses = ?, draws = ?, high_score = ?, best_score = ?, xp_earned = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newGamesPlayed, newWins, newLosses, newDraws, newHighScore, newBestScore, newXPEarned, existingStats.id);
    }

    // Update Daily Task Progress (e.g., play_games, win_games)
    const todayStr = new Date().toISOString().split('T')[0];
    const playTask = db.prepare("SELECT id, required_count FROM tasks WHERE type = 'play_games' AND is_active = 1").get();
    if (playTask) {
      db.prepare(`
        INSERT INTO user_tasks (user_id, task_id, current_count, completed, date_str)
        VALUES (?, ?, 1, CASE WHEN 1 >= ? THEN 1 ELSE 0 END, ?)
        ON CONFLICT(user_id, task_id, date_str) DO UPDATE SET
          current_count = current_count + 1,
          completed = CASE WHEN current_count + 1 >= ? THEN 1 ELSE completed END
      `).run(user.id, playTask.id, playTask.required_count, todayStr, playTask.required_count);
    }

    if (isWin) {
      const winTask = db.prepare("SELECT id, required_count FROM tasks WHERE type = 'win_games' AND is_active = 1").get();
      if (winTask) {
        db.prepare(`
          INSERT INTO user_tasks (user_id, task_id, current_count, completed, date_str)
          VALUES (?, ?, 1, CASE WHEN 1 >= ? THEN 1 ELSE 0 END, ?)
          ON CONFLICT(user_id, task_id, date_str) DO UPDATE SET
            current_count = current_count + 1,
            completed = CASE WHEN current_count + 1 >= ? THEN 1 ELSE completed END
        `).run(user.id, winTask.id, winTask.required_count, todayStr, winTask.required_count);
      }
    }

    // Grant XP and Coin rewards to user
    const rewardState = grantUserRewards(user.id, {
      softCoins: rewardCoins,
      xp: rewardXP
    });

    return {
      gameType,
      score,
      isWin,
      rewardXP,
      rewardCoins,
      rewardState
    };
  });

  res.json({
    message: 'Game result processed successfully',
    result
  });
});

module.exports = router;
