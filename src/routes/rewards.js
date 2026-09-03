const express = require('express');
const router = express.Router();
const { db, transaction } = require('../db');
const { authenticateTelegramUser } = require('../middleware/auth');

router.use(authenticateTelegramUser);

/**
 * Helper to grant rewards and process XP progression/level-ups
 */
function grantUserRewards(userId, { diamonds = 0, gold = 0, softCoins = 0, xp = 0, cardId = null }) {
  return transaction(() => {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

    let newDiamonds = user.diamonds + (diamonds || 0);
    let newGold = user.gold + (gold || 0);
    let newSoftCoins = user.soft_coins + (softCoins || 0);
    let newXP = user.xp + (xp || 0);
    let newLevel = user.level;
    let leveledUp = false;

    // Calculate level progression
    const baseXP = 100;
    const xpMultiplier = 1.2;
    let xpForNext = Math.floor(baseXP * Math.pow(xpMultiplier, newLevel - 1));

    let levelUpRewards = { diamonds: 0, gold: 0, softCoins: 0 };

    while (newXP >= xpForNext) {
      newXP -= xpForNext;
      newLevel += 1;
      leveledUp = true;

      // Grant Level Up Reward from config
      const levelConfigRaw = db.prepare("SELECT value FROM configs WHERE key = 'level_rewards_formula'").get();
      if (levelConfigRaw) {
        const formula = JSON.parse(levelConfigRaw.value);
        if (formula.reward_per_level) {
          levelUpRewards.diamonds += formula.reward_per_level.diamonds || 0;
          levelUpRewards.gold += formula.reward_per_level.gold || 0;
          levelUpRewards.softCoins += formula.reward_per_level.soft_coins || 0;
        }
      }

      xpForNext = Math.floor(baseXP * Math.pow(xpMultiplier, newLevel - 1));
    }

    newDiamonds += levelUpRewards.diamonds;
    newGold += levelUpRewards.gold;
    newSoftCoins += levelUpRewards.softCoins;

    // Update user record
    db.prepare(`
      UPDATE users
      SET diamonds = ?, gold = ?, soft_coins = ?, xp = ?, level = ?
      WHERE id = ?
    `).run(newDiamonds, newGold, newSoftCoins, newXP, newLevel, userId);

    // Grant Card if configured
    let grantedCard = null;
    if (cardId) {
      db.prepare('INSERT INTO user_cards (user_id, card_id) VALUES (?, ?)').run(userId, cardId);
      grantedCard = db.prepare('SELECT card_number, name, rarity FROM cards WHERE id = ?').get(cardId);
    }

    return {
      leveledUp,
      newLevel,
      newXP,
      balances: {
        diamonds: newDiamonds,
        gold: newGold,
        softCoins: newSoftCoins
      },
      levelUpRewards,
      grantedCard
    };
  });
}

/**
 * GET /api/rewards/status
 * Returns user eligibility for Daily Spin, Periodic Claims, Streak status
 */
router.get('/status', (req, res) => {
  const user = req.user;

  // Spin Cooldown (24h)
  let spinAvailable = true;
  let nextSpinAvailableInSec = 0;
  if (user.last_free_spin_at) {
    const lastSpin = new Date(user.last_free_spin_at).getTime();
    const diffHours = (Date.now() - lastSpin) / (1000 * 60 * 60);
    if (diffHours < 24) {
      spinAvailable = false;
      nextSpinAvailableInSec = Math.ceil((24 - diffHours) * 3600);
    }
  }

  // Periodic Claims Cooldowns
  const now = Date.now();
  const dailyAvailable = !user.last_daily_claim_at || (now - new Date(user.last_daily_claim_at).getTime()) >= 24 * 3600 * 1000;
  const weeklyAvailable = !user.last_weekly_claim_at || (now - new Date(user.last_weekly_claim_at).getTime()) >= 7 * 24 * 3600 * 1000;
  const monthlyAvailable = !user.last_monthly_claim_at || (now - new Date(user.last_monthly_claim_at).getTime()) >= 30 * 24 * 3600 * 1000;

  // Configurations
  const spinConfig = JSON.parse(db.prepare("SELECT value FROM configs WHERE key = 'spin_config'").get().value);
  const streakRewards = JSON.parse(db.prepare("SELECT value FROM configs WHERE key = 'streak_rewards'").get().value);
  const periodicRewards = JSON.parse(db.prepare("SELECT value FROM configs WHERE key = 'periodic_rewards'").get().value);

  res.json({
    spin: {
      available: spinAvailable,
      nextAvailableInSec: nextSpinAvailableInSec,
      config: spinConfig
    },
    periodic: {
      daily: { available: dailyAvailable, reward: periodicRewards.daily },
      weekly: { available: weeklyAvailable, reward: periodicRewards.weekly },
      monthly: { available: monthlyAvailable, reward: periodicRewards.monthly }
    },
    streak: {
      currentStreak: user.streak,
      milestones: streakRewards
    }
  });
});

/**
 * POST /api/rewards/spin
 * Executes dynamic probabilistic Daily Free Spin
 */
router.post('/spin', (req, res) => {
  const user = req.user;
  const now = Date.now();

  if (user.last_free_spin_at) {
    const diffHours = (now - new Date(user.last_free_spin_at).getTime()) / (1000 * 60 * 60);
    if (diffHours < 24) {
      return res.status(400).json({ error: 'Daily free spin is on cooldown.' });
    }
  }

  const spinConfigRaw = db.prepare("SELECT value FROM configs WHERE key = 'spin_config'").get();
  const spinConfig = JSON.parse(spinConfigRaw.value);

  if (!spinConfig.enabled) {
    return res.status(400).json({ error: 'Daily free spin is currently disabled.' });
  }

  // Weighted random pick server-side
  const outcomes = spinConfig.outcomes;
  const rand = Math.random();
  let cumulative = 0;
  let wonOutcome = outcomes[0];

  for (const item of outcomes) {
    cumulative += item.probability;
    if (rand <= cumulative) {
      wonOutcome = item;
      break;
    }
  }

  // Record reward and update last_free_spin_at
  db.prepare("UPDATE users SET last_free_spin_at = CURRENT_TIMESTAMP WHERE id = ?").run(user.id);

  const grant = {
    diamonds: wonOutcome.type === 'diamonds' ? wonOutcome.amount : 0,
    gold: wonOutcome.type === 'gold' ? wonOutcome.amount : 0,
    softCoins: wonOutcome.type === 'soft_coins' ? wonOutcome.amount : 0,
    xp: wonOutcome.type === 'xp' ? wonOutcome.amount : 0
  };

  const rewardResult = grantUserRewards(user.id, grant);

  // Log transaction
  db.prepare(`
    INSERT INTO transactions (user_id, type, amount, currency, description)
    VALUES (?, 'spin_reward', ?, ?, ?)
  `).run(user.id, wonOutcome.amount, wonOutcome.type, `Won ${wonOutcome.label} from Free Spin`);

  res.json({
    wonOutcome,
    updatedState: rewardResult
  });
});

/**
 * POST /api/rewards/claim-periodic
 * Claims Daily, Weekly, or Monthly configurable rewards
 */
router.post('/claim-periodic', (req, res) => {
  const { period } = req.body; // 'daily', 'weekly', 'monthly'
  if (!['daily', 'weekly', 'monthly'].includes(period)) {
    return res.status(400).json({ error: 'Invalid period. Expected daily, weekly, or monthly.' });
  }

  const user = req.user;
  const now = Date.now();
  const colMap = {
    daily: 'last_daily_claim_at',
    weekly: 'last_weekly_claim_at',
    monthly: 'last_monthly_claim_at'
  };
  const cooldownMap = {
    daily: 24 * 3600 * 1000,
    weekly: 7 * 24 * 3600 * 1000,
    monthly: 30 * 24 * 3600 * 1000
  };

  const lastClaim = user[colMap[period]];
  if (lastClaim && (now - new Date(lastClaim).getTime()) < cooldownMap[period]) {
    return res.status(400).json({ error: `${period.toUpperCase()} reward is already claimed or on cooldown.` });
  }

  const periodicRewards = JSON.parse(db.prepare("SELECT value FROM configs WHERE key = 'periodic_rewards'").get().value);
  const reward = periodicRewards[period];

  db.prepare(`UPDATE users SET ${colMap[period]} = CURRENT_TIMESTAMP WHERE id = ?`).run(user.id);

  const result = grantUserRewards(user.id, {
    diamonds: reward.diamonds,
    gold: reward.gold,
    softCoins: reward.soft_coins,
    xp: reward.xp
  });

  res.json({
    message: `${period.toUpperCase()} reward claimed successfully!`,
    claimedReward: reward,
    updatedState: result
  });
});

/**
 * GET /api/tasks
 * Returns active daily tasks and user's completion/claim state for today
 */
router.get('/tasks', (req, res) => {
  const todayStr = new Date().toISOString().split('T')[0];
  const user = req.user;

  const tasks = db.prepare('SELECT * FROM tasks WHERE is_active = 1').all();
  const userTasks = db.prepare('SELECT * FROM user_tasks WHERE user_id = ? AND date_str = ?').all(user.id, todayStr);

  const userTaskMap = {};
  for (const ut of userTasks) {
    userTaskMap[ut.task_id] = ut;
  }

  const taskList = tasks.map(t => {
    const ut = userTaskMap[t.id];
    return {
      taskId: t.id,
      code: t.code,
      title: t.title,
      description: t.description,
      type: t.type,
      requiredCount: t.required_count,
      currentCount: ut ? ut.current_count : 0,
      completed: ut ? Boolean(ut.completed) : false,
      claimed: ut ? Boolean(ut.claimed) : false,
      reward: {
        type: t.reward_type,
        amount: t.reward_amount
      }
    };
  });

  res.json({ date: todayStr, tasks: taskList });
});

/**
 * POST /api/tasks/claim
 * Claims completed task reward
 */
router.post('/tasks/claim', (req, res) => {
  const { taskId } = req.body;
  const todayStr = new Date().toISOString().split('T')[0];
  const user = req.user;

  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND is_active = 1').get(taskId);
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const userTask = db.prepare('SELECT * FROM user_tasks WHERE user_id = ? AND task_id = ? AND date_str = ?').get(user.id, taskId, todayStr);

  if (!userTask || !userTask.completed) {
    return res.status(400).json({ error: 'Task is not yet completed.' });
  }

  if (userTask.claimed) {
    return res.status(400).json({ error: 'Task reward has already been claimed today.' });
  }

  db.prepare('UPDATE user_tasks SET claimed = 1 WHERE id = ?').run(userTask.id);

  const grant = {
    diamonds: task.reward_type === 'diamonds' ? task.reward_amount : 0,
    gold: task.reward_type === 'gold' ? task.reward_amount : 0,
    softCoins: task.reward_type === 'soft_coins' ? task.reward_amount : 0,
    xp: task.reward_type === 'xp' ? task.reward_amount : 0,
    cardId: task.reward_type === 'card' ? task.reward_card_id : null
  };

  const result = grantUserRewards(user.id, grant);

  res.json({
    message: 'Task reward claimed successfully!',
    taskTitle: task.title,
    reward: grant,
    updatedState: result
  });
});

/**
 * POST /api/rewards/referral
 * Claims referral reward using inviter code/ID
 */
router.post('/referral', (req, res) => {
  const { inviterTgId } = req.body;
  const invitedUser = req.user;

  if (!inviterTgId || String(inviterTgId) === String(invitedUser.telegram_id)) {
    return res.status(400).json({ error: 'Invalid inviter Telegram ID.' });
  }

  const inviter = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(inviterTgId);
  if (!inviter) {
    return res.status(404).json({ error: 'Inviter user not found.' });
  }

  // Check if referral record exists
  const existingRef = db.prepare('SELECT * FROM referrals WHERE invited_user_id = ?').get(invitedUser.id);
  if (existingRef) {
    return res.status(400).json({ error: 'Referral reward has already been claimed for this account.' });
  }

  const refRewards = JSON.parse(db.prepare("SELECT value FROM configs WHERE key = 'referral_rewards'").get().value);

  // Grant inviter and invited rewards
  grantUserRewards(inviter.id, {
    diamonds: refRewards.inviter.diamonds,
    gold: refRewards.inviter.gold,
    softCoins: refRewards.inviter.soft_coins,
    xp: refRewards.inviter.xp
  });

  const invitedResult = grantUserRewards(invitedUser.id, {
    diamonds: refRewards.invited.diamonds,
    gold: refRewards.invited.gold,
    softCoins: refRewards.invited.soft_coins,
    xp: refRewards.invited.xp
  });

  db.prepare('INSERT INTO referrals (inviter_id, invited_user_id, reward_claimed) VALUES (?, ?, 1)').run(inviter.id, invitedUser.id);

  res.json({
    message: 'Referral reward claimed successfully!',
    reward: refRewards.invited,
    updatedState: invitedResult
  });
});

module.exports = {
  router,
  grantUserRewards
};
