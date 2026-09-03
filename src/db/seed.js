const { db, initDatabase } = require('./index');

function seedDatabase() {
  initDatabase();

  console.log("Seeding database initial records...");

  const configs = [
    {
      key: 'spin_config',
      value: JSON.stringify({
        enabled: true,
        cooldown_hours: 24,
        outcomes: [
          { type: 'diamonds', amount: 10, probability: 0.1, label: '10 Diamonds' },
          { type: 'diamonds', amount: 50, probability: 0.02, label: '50 Diamonds' },
          { type: 'gold', amount: 100, probability: 0.3, label: '100 Gold' },
          { type: 'gold', amount: 500, probability: 0.1, label: '500 Gold' },
          { type: 'soft_coins', amount: 500, probability: 0.35, label: '500 Coins' },
          { type: 'soft_coins', amount: 2500, probability: 0.1, label: '2500 Coins' },
          { type: 'xp', amount: 100, probability: 0.03, label: '100 XP' }
        ]
      })
    },
    {
      key: 'periodic_rewards',
      value: JSON.stringify({
        daily: { diamonds: 5, gold: 50, soft_coins: 200, xp: 50 },
        weekly: { diamonds: 30, gold: 300, soft_coins: 1000, xp: 200 },
        monthly: { diamonds: 150, gold: 1500, soft_coins: 5000, xp: 1000 }
      })
    },
    {
      key: 'streak_rewards',
      value: JSON.stringify([
        { day: 1, diamonds: 2, gold: 20, soft_coins: 100, xp: 20 },
        { day: 3, diamonds: 10, gold: 100, soft_coins: 500, xp: 50 },
        { day: 7, diamonds: 25, gold: 250, soft_coins: 1000, xp: 150 },
        { day: 14, diamonds: 60, gold: 600, soft_coins: 2500, xp: 350 },
        { day: 30, diamonds: 150, gold: 1500, soft_coins: 7000, xp: 1000 }
      ])
    },
    {
      key: 'level_rewards_formula',
      value: JSON.stringify({
        base_xp: 100,
        xp_multiplier: 1.2,
        reward_per_level: { diamonds: 10, gold: 50, soft_coins: 200 }
      })
    },
    {
      key: 'referral_rewards',
      value: JSON.stringify({
        inviter: { diamonds: 20, gold: 100, soft_coins: 500, xp: 100 },
        invited: { diamonds: 10, gold: 50, soft_coins: 250, xp: 50 }
      })
    }
  ];

  const insertConfig = db.prepare(`INSERT OR REPLACE INTO configs (key, value) VALUES (?, ?)`);
  for (const cfg of configs) {
    insertConfig.run(cfg.key, cfg.value);
  }

  const cards = [
    { card_number: 101, name: 'Rem', anime: 'Re:Zero', rarity: 'Legendary', hp: 120, attack: 85, defense: 70, speed: 90, image_url: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400' },
    { card_number: 102, name: 'Asuka Langley', anime: 'Neon Genesis Evangelion', rarity: 'Epic', hp: 110, attack: 80, defense: 65, speed: 85, image_url: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=400' },
    { card_number: 103, name: 'Mikasa Ackerman', anime: 'Attack on Titan', rarity: 'Mythic', hp: 150, attack: 95, defense: 85, speed: 95, image_url: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=400' },
    { card_number: 104, name: 'Zero Two', anime: 'Darling in the Franxx', rarity: 'Mythic', hp: 140, attack: 90, defense: 80, speed: 90, image_url: 'https://images.unsplash.com/photo-1563089145-599997674d42?w=400' },
    { card_number: 105, name: 'Nezuko Kamado', anime: 'Demon Slayer', rarity: 'Legendary', hp: 130, attack: 85, defense: 75, speed: 88, image_url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=400' },
    { card_number: 106, name: 'Saber', anime: 'Fate/stay night', rarity: 'Rare', hp: 100, attack: 70, defense: 60, speed: 75, image_url: 'https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=400' }
  ];

  const insertCard = db.prepare(`
    INSERT OR IGNORE INTO cards (card_number, name, anime, rarity, hp, attack, defense, speed, image_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const c of cards) {
    insertCard.run(c.card_number, c.name, c.anime, c.rarity, c.hp, c.attack, c.defense, c.speed, c.image_url);
  }

  const marketItems = [
    { card_number: 101, price: 100, currency: 'diamonds', is_limited: 0, available_quantity: -1 },
    { card_number: 102, price: 500, currency: 'gold', is_limited: 0, available_quantity: -1 },
    { card_number: 105, price: 2000, currency: 'soft_coins', is_limited: 1, available_quantity: 50 },
    { card_number: 106, price: 1000, currency: 'soft_coins', is_limited: 0, available_quantity: -1 }
  ];

  const insertMarket = db.prepare(`
    INSERT OR IGNORE INTO market_items (card_id, price, currency, is_limited, available_quantity, is_active)
    SELECT id, ?, ?, ?, ?, 1 FROM cards WHERE card_number = ?
  `);

  for (const m of marketItems) {
    insertMarket.run(m.price, m.currency, m.is_limited, m.available_quantity, m.card_number);
  }

  const tasks = [
    { code: 'TASK_PLAY_3_GAMES', title: 'Game Enthusiast', description: 'Play any 3 mini-games today', type: 'play_games', required_count: 3, reward_type: 'gold', reward_amount: 100 },
    { code: 'TASK_WIN_2_GAMES', title: 'Victorious Waifu', description: 'Win 2 mini-games today', type: 'win_games', required_count: 2, reward_type: 'diamonds', reward_amount: 10 },
    { code: 'TASK_PURCHASE_ITEM', title: 'Market Shopper', description: 'Purchase 1 card from the Market', type: 'purchase_item', required_count: 1, reward_type: 'soft_coins', reward_amount: 500 }
  ];

  const insertTask = db.prepare(`
    INSERT OR IGNORE INTO tasks (code, title, description, type, required_count, reward_type, reward_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const t of tasks) {
    insertTask.run(t.code, t.title, t.description, t.type, t.required_count, t.reward_type, t.reward_amount);
  }

  const achievements = [
    { code: 'ACH_WAIFU_MASTER', name: '👑 Waifu Master', description: 'Collect 5 unique Waifu cards', requirement_type: 'cards_collected', requirement_value: 5, reward_type: 'diamonds', reward_amount: 50 },
    { code: 'ACH_GAME_MASTER', name: '🎮 Game Master', description: 'Win a total of 10 mini-games', requirement_type: 'games_won', requirement_value: 10, reward_type: 'gold', reward_amount: 500 },
    { code: 'ACH_RICH_PLAYER', name: '💰 Rich Player', description: 'Accumulate 10,000 Soft Coins', requirement_type: 'currency_earned', requirement_value: 10000, reward_type: 'diamonds', reward_amount: 30 },
    { code: 'ACH_STREAK_MASTER', name: '🔥 Streak Master', description: 'Maintain a 7-day activity streak', requirement_type: 'streak_days', requirement_value: 7, reward_type: 'diamonds', reward_amount: 100 }
  ];

  const insertAchievement = db.prepare(`
    INSERT OR IGNORE INTO achievements (code, name, description, requirement_type, requirement_value, reward_type, reward_amount)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  for (const a of achievements) {
    insertAchievement.run(a.code, a.name, a.description, a.requirement_type, a.requirement_value, a.reward_type, a.reward_amount);
  }

  const testUsers = [
    { telegram_id: 111111, username: 'PlayerOne', first_name: 'Alice', role: 'user', level: 5, xp: 450, diamonds: 250, gold: 1500, soft_coins: 5000, streak: 3 },
    { telegram_id: 222222, username: 'TopGramer', first_name: 'Bob', role: 'user', level: 12, xp: 1800, diamonds: 1200, gold: 8000, soft_coins: 25000, streak: 7 },
    { telegram_id: 999999, username: 'WaifuOwner', first_name: 'AdminDev', role: 'owner', level: 50, xp: 99999, diamonds: 99999, gold: 99999, soft_coins: 99999, streak: 30 }
  ];

  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO users (telegram_id, username, first_name, role, level, xp, diamonds, gold, soft_coins, streak)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const u of testUsers) {
    insertUser.run(u.telegram_id, u.username, u.first_name, u.role, u.level, u.xp, u.diamonds, u.gold, u.soft_coins, u.streak);
  }

  console.log("Database seeded successfully!");
}

if (require.main === module) {
  seedDatabase();
}

module.exports = seedDatabase;
