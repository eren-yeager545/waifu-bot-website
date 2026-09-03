-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  telegram_id INTEGER UNIQUE NOT NULL,
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  photo_url TEXT,
  role TEXT DEFAULT 'user', -- 'user', 'admin', 'owner', 'developer'
  level INTEGER DEFAULT 1,
  xp INTEGER DEFAULT 0,
  diamonds INTEGER DEFAULT 0,
  gold INTEGER DEFAULT 0,
  soft_coins INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0,
  last_active_at DATETIME,
  last_free_spin_at DATETIME,
  last_daily_claim_at DATETIME,
  last_weekly_claim_at DATETIME,
  last_monthly_claim_at DATETIME,
  daily_purchases_count INTEGER DEFAULT 0,
  last_purchase_date TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Cards Table
CREATE TABLE IF NOT EXISTS cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_number INTEGER UNIQUE NOT NULL,
  name TEXT NOT NULL,
  anime TEXT,
  rarity TEXT NOT NULL,
  image_url TEXT,
  hp INTEGER DEFAULT 100,
  attack INTEGER DEFAULT 50,
  defense INTEGER DEFAULT 50,
  speed INTEGER DEFAULT 50,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User Cards Collection
CREATE TABLE IF NOT EXISTS user_cards (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  card_id INTEGER NOT NULL,
  obtained_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  games_played INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  score INTEGER DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
);

-- Market Items
CREATE TABLE IF NOT EXISTS market_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  card_id INTEGER NOT NULL,
  price INTEGER NOT NULL,
  currency TEXT NOT NULL,
  is_limited BOOLEAN DEFAULT 0,
  available_quantity INTEGER DEFAULT -1,
  is_active BOOLEAN DEFAULT 1,
  start_at DATETIME,
  end_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE
);

-- Transactions Log
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Dynamic Configuration
CREATE TABLE IF NOT EXISTS configs (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Tasks
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  required_count INTEGER DEFAULT 1,
  reward_type TEXT NOT NULL,
  reward_amount INTEGER DEFAULT 0,
  reward_card_id INTEGER,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User Task Progress
CREATE TABLE IF NOT EXISTS user_tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  task_id INTEGER NOT NULL,
  current_count INTEGER DEFAULT 0,
  completed BOOLEAN DEFAULT 0,
  claimed BOOLEAN DEFAULT 0,
  completed_at DATETIME,
  date_str TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  UNIQUE(user_id, task_id, date_str)
);

-- Achievements
CREATE TABLE IF NOT EXISTS achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  category TEXT DEFAULT 'general',
  requirement_type TEXT NOT NULL,
  requirement_value INTEGER NOT NULL,
  reward_type TEXT NOT NULL,
  reward_amount INTEGER DEFAULT 0,
  reward_card_id INTEGER,
  is_hidden BOOLEAN DEFAULT 0,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User Achievements
CREATE TABLE IF NOT EXISTS user_achievements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  achievement_id INTEGER NOT NULL,
  unlocked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  claimed BOOLEAN DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (achievement_id) REFERENCES achievements(id) ON DELETE CASCADE,
  UNIQUE(user_id, achievement_id)
);

-- Game Statistics
CREATE TABLE IF NOT EXISTS game_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  game_type TEXT NOT NULL,
  games_played INTEGER DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  draws INTEGER DEFAULT 0,
  high_score INTEGER DEFAULT 0,
  best_score INTEGER DEFAULT 0,
  xp_earned INTEGER DEFAULT 0,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, game_type)
);

-- Referrals
CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  inviter_id INTEGER NOT NULL,
  invited_user_id INTEGER UNIQUE NOT NULL,
  reward_claimed BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (inviter_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_user_id) REFERENCES users(id) ON DELETE CASCADE
);
