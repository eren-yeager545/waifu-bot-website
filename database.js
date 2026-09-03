import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DB_PATH || path.join(__dirname, 'waifu_catcher.db');

let dbInstance = null;

export async function getDb() {
  if (dbInstance) return dbInstance;

  dbInstance = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  await dbInstance.exec('PRAGMA foreign_keys = ON;');
  return dbInstance;
}

export async function initDb() {
  const db = await getDb();

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, -- Telegram User ID
      username TEXT,
      first_name TEXT,
      last_name TEXT,
      photo_url TEXT,
      coins INTEGER DEFAULT 100,
      gems INTEGER DEFAULT 10,
      xp INTEGER DEFAULT 0,
      level INTEGER DEFAULT 1,
      streak INTEGER DEFAULT 0,
      last_streak_date TEXT,
      last_catch_time INTEGER DEFAULT 0,
      role TEXT DEFAULT 'user',
      favorite_card_id INTEGER,
      referred_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      anime TEXT NOT NULL,
      rarity TEXT NOT NULL,
      image_url TEXT NOT NULL,
      power INTEGER NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS user_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      card_id INTEGER NOT NULL,
      obtained_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_favorite INTEGER DEFAULT 0,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(card_id) REFERENCES cards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS market_listings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      seller_id INTEGER NOT NULL,
      user_card_id INTEGER NOT NULL,
      card_id INTEGER NOT NULL,
      price INTEGER NOT NULL,
      currency TEXT DEFAULT 'coins',
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(seller_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(user_card_id) REFERENCES user_cards(id) ON DELETE CASCADE,
      FOREIGN KEY(card_id) REFERENCES cards(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      reward_type TEXT DEFAULT 'coins',
      reward_amount INTEGER NOT NULL,
      type TEXT DEFAULT 'daily',
      requirement_type TEXT,
      requirement_count INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS user_tasks (
      user_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      progress INTEGER DEFAULT 0,
      completed INTEGER DEFAULT 0,
      last_completed_at DATETIME,
      PRIMARY KEY (user_id, task_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS achievements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      icon TEXT DEFAULT '🏆',
      reward_coins INTEGER DEFAULT 0,
      reward_gems INTEGER DEFAULT 0,
      reward_xp INTEGER DEFAULT 0,
      requirement_type TEXT NOT NULL,
      requirement_value INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_achievements (
      user_id INTEGER NOT NULL,
      achievement_id INTEGER NOT NULL,
      unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      claimed INTEGER DEFAULT 0,
      PRIMARY KEY (user_id, achievement_id),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(achievement_id) REFERENCES achievements(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS referrals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      referrer_id INTEGER NOT NULL,
      referred_id INTEGER UNIQUE NOT NULL,
      claimed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(referrer_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(referred_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS game_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      game_type TEXT NOT NULL,
      result_data TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  await seedInitialData(db);
  return db;
}

async function seedInitialData(db) {
  const cardCount = await db.get('SELECT COUNT(*) as count FROM cards');
  if (cardCount.count === 0) {
    const defaultCards = [
      { name: 'Rem', anime: 'Re:Zero', rarity: 'Legendary', image_url: 'https://picsum.photos/seed/rem/300/400', power: 92, description: 'Twin maid of the Roswaal mansion.' },
      { name: 'Emilia', anime: 'Re:Zero', rarity: 'Epic', image_url: 'https://picsum.photos/seed/emilia/300/400', power: 85, description: 'Half-elf spirit caster with silver hair.' },
      { name: 'Mikasa Ackerman', anime: 'Attack on Titan', rarity: 'Legendary', image_url: 'https://picsum.photos/seed/mikasa/300/400', power: 95, description: 'Elite soldier with unmatched combat skills.' },
      { name: 'Nezuko Kamado', anime: 'Demon Slayer', rarity: 'Rare', image_url: 'https://picsum.photos/seed/nezuko/300/400', power: 78, description: 'Demon girl who fights alongside Tanjiro.' },
      { name: 'Marin Kitagawa', anime: 'My Dress-Up Darling', rarity: 'Rare', image_url: 'https://picsum.photos/seed/marin/300/400', power: 70, description: 'Enthusiastic cosplayer and high schooler.' },
      { name: 'Zero Two', anime: 'Darling in the Franxx', rarity: 'Mythic', image_url: 'https://picsum.photos/seed/zerotwo/300/400', power: 99, description: 'Elite FRANXX parasite with Klaxosaur blood.' },
      { name: 'Megumin', anime: 'Konosuba', rarity: 'Epic', image_url: 'https://picsum.photos/seed/megumin/300/400', power: 88, description: 'Arch wizard obsessed with Explosion magic.' },
      { name: 'Aqua', anime: 'Konosuba', rarity: 'Common', image_url: 'https://picsum.photos/seed/aqua/300/400', power: 50, description: 'Goddess of water, useful sometimes...' },
      { name: 'Yor Forger', anime: 'Spy x Family', rarity: 'Legendary', image_url: 'https://picsum.photos/seed/yor/300/400', power: 94, description: 'Thorn Princess assassin and loving mother.' },
      { name: 'Anya Forger', anime: 'Spy x Family', rarity: 'Rare', image_url: 'https://picsum.photos/seed/anya/300/400', power: 65, description: 'Telepathic kid who loves peanuts.' },
      { name: 'Chika Fujiwara', anime: 'Kaguya-sama', rarity: 'Common', image_url: 'https://picsum.photos/seed/chika/300/400', power: 45, description: 'Student council secretary and chaotic dance queen.' },
      { name: 'Asuka Langley', anime: 'Evangelion', rarity: 'Epic', image_url: 'https://picsum.photos/seed/asuka/300/400', power: 84, description: 'Second Child and pilot of Evangelion Unit-02.' }
    ];

    for (const card of defaultCards) {
      await db.run(
        `INSERT INTO cards (name, anime, rarity, image_url, power, description) VALUES (?, ?, ?, ?, ?, ?)`,
        [card.name, card.anime, card.rarity, card.image_url, card.power, card.description]
      );
    }
  }

  const taskCount = await db.get('SELECT COUNT(*) as count FROM tasks');
  if (taskCount.count === 0) {
    const defaultTasks = [
      { title: 'Daily Catch', description: 'Catch at least 1 waifu card today.', reward_type: 'coins', reward_amount: 50, type: 'daily', requirement_type: 'catch_cards', requirement_count: 1 },
      { title: 'Waifu Master', description: 'Catch 3 waifus in a single day.', reward_type: 'gems', reward_amount: 5, type: 'daily', requirement_type: 'catch_cards', requirement_count: 3 },
      { title: 'Memory Challenge', description: 'Play and win a game of Waifu Memory.', reward_type: 'coins', reward_amount: 100, type: 'daily', requirement_type: 'memory_game', requirement_count: 1 },
      { title: 'Friendly Recruiter', description: 'Invite 1 friend using your referral link.', reward_type: 'gems', reward_amount: 10, type: 'one_time', requirement_type: 'invite_friends', requirement_count: 1 }
    ];

    for (const task of defaultTasks) {
      await db.run(
        `INSERT INTO tasks (title, description, reward_type, reward_amount, type, requirement_type, requirement_count) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [task.title, task.description, task.reward_type, task.reward_amount, task.type, task.requirement_type, task.requirement_count]
      );
    }
  }

  const achCount = await db.get('SELECT COUNT(*) as count FROM achievements');
  if (achCount.count === 0) {
    const defaultAchievements = [
      { code: 'FIRST_CATCH', title: 'First Encounter', description: 'Catch your very first waifu.', icon: '🎯', reward_coins: 100, reward_gems: 5, reward_xp: 50, requirement_type: 'card_count', requirement_value: 1 },
      { code: 'COLLECTOR_10', title: 'Budding Collector', description: 'Collect 10 waifu cards.', icon: '📚', reward_coins: 300, reward_gems: 15, reward_xp: 150, requirement_type: 'card_count', requirement_value: 10 },
      { code: 'STREAK_7', title: 'Dedicated Fan', description: 'Maintain a 7-day login streak.', icon: '🔥', reward_coins: 500, reward_gems: 25, reward_xp: 300, requirement_type: 'streak_days', requirement_value: 7 },
      { code: 'LEVEL_5', title: 'Rising Star', description: 'Reach Level 5.', icon: '⭐', reward_coins: 400, reward_gems: 20, reward_xp: 200, requirement_type: 'level_reached', requirement_value: 5 },
      { code: 'MARKET_DEAL', title: 'Merchant', description: 'Sell a card on the marketplace.', icon: '🤝', reward_coins: 200, reward_gems: 10, reward_xp: 100, requirement_type: 'market_sales', requirement_value: 1 }
    ];

    for (const ach of defaultAchievements) {
      await db.run(
        `INSERT INTO achievements (code, title, description, icon, reward_coins, reward_gems, reward_xp, requirement_type, requirement_value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ach.code, ach.title, ach.description, ach.icon, ach.reward_coins, ach.reward_gems, ach.reward_xp, ach.requirement_type, ach.requirement_value]
      );
    }
  }
}
