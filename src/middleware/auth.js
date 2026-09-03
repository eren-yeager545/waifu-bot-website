const crypto = require('crypto');
const { db } = require('../db');

const BOT_TOKEN = process.env.BOT_TOKEN || '123456789:ABCdefGHIjklMNOpqrsTUVwxyz';
const OWNER_TG_IDS = (process.env.OWNER_TG_IDS || '').split(',').map(id => id.trim()).filter(Boolean);
const DEV_TG_IDS = (process.env.DEV_TG_IDS || '').split(',').map(id => id.trim()).filter(Boolean);

/**
 * Validates Telegram WebApp initData query string using HMAC-SHA256
 */
function verifyTelegramInitData(initData, botToken) {
  if (!initData) return null;

  const urlParams = new URLSearchParams(initData);
  const hash = urlParams.get('hash');
  if (!hash) return null;

  urlParams.delete('hash');

  const params = [];
  for (const [key, value] of urlParams.entries()) {
    params.push(`${key}=${value}`);
  }
  params.sort();
  const dataCheckString = params.join('\n');

  // Secret key calculation for WebApp
  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (calculatedHash !== hash) {
    return null;
  }

  const userJson = urlParams.get('user');
  if (!userJson) return null;

  try {
    return JSON.parse(userJson);
  } catch (err) {
    return null;
  }
}

/**
 * Helper to generate valid initData signature for testing & local development
 */
function createMockInitData(userObj, botToken = BOT_TOKEN) {
  const userStr = JSON.stringify(userObj);
  const params = new URLSearchParams();
  params.set('user', userStr);
  params.set('auth_date', Math.floor(Date.now() / 1000).toString());

  const paramPairs = [];
  for (const [key, value] of params.entries()) {
    paramPairs.push(`${key}=${value}`);
  }
  paramPairs.sort();
  const dataCheckString = paramPairs.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  params.set('hash', hash);
  return params.toString();
}

/**
 * Middleware: Authenticates Telegram user from initData header/query parameter.
 */
function authenticateTelegramUser(req, res, next) {
  const initData = req.headers['x-telegram-init-data'] || req.query.initData;

  // Development fallback/bypass mode if allowed by env
  if (process.env.NODE_ENV === 'test' && req.headers['x-mock-tg-id']) {
    const mockTgId = parseInt(req.headers['x-mock-tg-id'], 10);
    const user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(mockTgId);
    if (user) {
      req.user = user;
      return next();
    }
  }

  if (!initData) {
    return res.status(401).json({ error: 'Missing Telegram WebApp initData authorization' });
  }

  const tgUser = verifyTelegramInitData(initData, BOT_TOKEN);
  if (!tgUser || !tgUser.id) {
    return res.status(401).json({ error: 'Invalid or tampered Telegram initData' });
  }

  const telegramId = tgUser.id;

  // Determine Role
  let role = 'user';
  if (OWNER_TG_IDS.includes(String(telegramId))) {
    role = 'owner';
  } else if (DEV_TG_IDS.includes(String(telegramId))) {
    role = 'developer';
  }

  // Load or auto-register user from database
  let user = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId);

  if (!user) {
    const stmt = db.prepare(`
      INSERT INTO users (telegram_id, username, first_name, last_name, photo_url, role, last_active_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
    const info = stmt.run(
      telegramId,
      tgUser.username || null,
      tgUser.first_name || null,
      tgUser.last_name || null,
      tgUser.photo_url || null,
      role
    );
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  } else {
    // Update role if changed in env config and update last_active_at
    db.prepare(`
      UPDATE users
      SET username = ?, first_name = ?, last_name = ?, photo_url = ?, role = CASE WHEN role IN ('owner', 'developer') THEN role ELSE ? END, last_active_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      tgUser.username || user.username,
      tgUser.first_name || user.first_name,
      tgUser.last_name || user.last_name,
      tgUser.photo_url || user.photo_url,
      role,
      user.id
    );
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  }

  req.user = user;
  next();
}

/**
 * Middleware: Restricts access to Owner or Developer roles only
 */
function requireAdminOrOwner(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (['owner', 'developer', 'admin'].includes(req.user.role)) {
    return next();
  }

  return res.status(403).json({ error: 'Access denied: Admin/Owner access required' });
}

module.exports = {
  verifyTelegramInitData,
  createMockInitData,
  authenticateTelegramUser,
  requireAdminOrOwner
};
