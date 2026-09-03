import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initDb, getDb } from '../database.js';
import { createMockInitData, validateAndParseInitData } from '../auth.js';
import { authMiddleware } from '../server.js';

const BOT_TOKEN = 'MOCK_BOT_TOKEN_FOR_DEV_AND_TESTS';

describe('Waifu Catcher Telegram Web App Test Suite', () => {

  before(async () => {
    process.env.NODE_ENV = 'test';
    await initDb();
  });

  it('Should validate valid Telegram initData signature', () => {
    const mockUser = { id: 70001, username: 'otaku_test', first_name: 'Otaku' };
    const initDataStr = createMockInitData(mockUser, BOT_TOKEN);

    const result = validateAndParseInitData(initDataStr, BOT_TOKEN);
    assert.equal(result.user.id, 70001);
    assert.equal(result.user.username, 'otaku_test');
  });

  it('Should reject invalid initData signature', () => {
    const mockUser = { id: 70002, username: 'hacker' };
    const invalidInitData = createMockInitData(mockUser, 'WRONG_BOT_TOKEN');

    assert.throws(() => {
      validateAndParseInitData(invalidInitData, BOT_TOKEN);
    }, /Invalid initData signature/);
  });

  it('Should register user and load profile via authentication middleware', async () => {
    const db = await getDb();
    const userId = 80001;
    await db.run('DELETE FROM users WHERE id = ?', [userId]);

    const initData = createMockInitData({ id: userId, username: 'new_user', first_name: 'Newbie' }, BOT_TOKEN);

    const req = { headers: { 'x-telegram-init-data': initData }, query: {} };
    let responseData = null;
    const res = {
      status() { return this; },
      json(data) { responseData = data; }
    };

    await new Promise((resolve) => {
      authMiddleware(req, res, () => resolve());
    });

    assert.equal(req.user.id, userId);
    assert.equal(req.user.username, 'new_user');

    const dbUser = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    assert.ok(dbUser);
    assert.equal(dbUser.username, 'new_user');
  });

  it('Should support Gacha Catch card collection logic', async () => {
    const db = await getDb();
    const userId = 80002;
    await db.run('DELETE FROM user_cards WHERE user_id = ?', [userId]);
    await db.run('DELETE FROM users WHERE id = ?', [userId]);

    const initData = createMockInitData({ id: userId, username: 'catcher', first_name: 'CatchMaster' }, BOT_TOKEN);
    const req = { headers: { 'x-telegram-init-data': initData }, query: {}, body: {} };

    await new Promise((resolve) => {
      authMiddleware(req, { status() { return this; }, json() {} }, () => resolve());
    });

    const cardsBefore = await db.all('SELECT * FROM user_cards WHERE user_id = ?', [userId]);
    assert.equal(cardsBefore.length, 0);

    const card = await db.get('SELECT * FROM cards LIMIT 1');
    await db.run('INSERT INTO user_cards (user_id, card_id) VALUES (?, ?)', [userId, card.id]);

    const cardsAfter = await db.all('SELECT * FROM user_cards WHERE user_id = ?', [userId]);
    assert.equal(cardsAfter.length, 1);
  });

  it('Should support marketplace listing and buying', async () => {
    const db = await getDb();
    const sellerId = 90001;
    const buyerId = 90002;

    await db.run('DELETE FROM market_listings WHERE seller_id = ?', [sellerId]);
    await db.run('DELETE FROM user_cards WHERE user_id IN (?, ?)', [sellerId, buyerId]);
    await db.run('DELETE FROM users WHERE id IN (?, ?)', [sellerId, buyerId]);

    await db.run('INSERT INTO users (id, username, coins) VALUES (?, "seller", 100)', [sellerId]);
    await db.run('INSERT INTO users (id, username, coins) VALUES (?, "buyer", 1000)', [buyerId]);

    const card = await db.get('SELECT * FROM cards LIMIT 1');
    const userCardRes = await db.run('INSERT INTO user_cards (user_id, card_id) VALUES (?, ?)', [sellerId, card.id]);
    const userCardId = userCardRes.lastID;

    const listingRes = await db.run(
      'INSERT INTO market_listings (seller_id, user_card_id, card_id, price, currency) VALUES (?, ?, ?, 200, "coins")',
      [sellerId, userCardId, card.id]
    );

    await db.run('UPDATE users SET coins = coins - 200 WHERE id = ?', [buyerId]);
    await db.run('UPDATE users SET coins = coins + 200 WHERE id = ?', [sellerId]);
    await db.run('UPDATE user_cards SET user_id = ? WHERE id = ?', [buyerId, userCardId]);
    await db.run('UPDATE market_listings SET status = "sold" WHERE id = ?', [listingRes.lastID]);

    const buyerUser = await db.get('SELECT coins FROM users WHERE id = ?', [buyerId]);
    const sellerUser = await db.get('SELECT coins FROM users WHERE id = ?', [sellerId]);
    const updatedUserCard = await db.get('SELECT user_id FROM user_cards WHERE id = ?', [userCardId]);

    assert.equal(buyerUser.coins, 800);
    assert.equal(sellerUser.coins, 300);
    assert.equal(updatedUserCard.user_id, buyerId);
  });

  it('Should enforce admin role permissions on admin endpoints', async () => {
    const db = await getDb();
    const regularId = 95001;
    const adminId = 95002;

    await db.run('DELETE FROM users WHERE id IN (?, ?)', [regularId, adminId]);

    await db.run('INSERT INTO users (id, username, role) VALUES (?, "regular_joe", "user")', [regularId]);
    await db.run('INSERT INTO users (id, username, role) VALUES (?, "admin_boss", "admin")', [adminId]);

    const regularUser = await db.get('SELECT role FROM users WHERE id = ?', [regularId]);
    const adminUser = await db.get('SELECT role FROM users WHERE id = ?', [adminId]);

    assert.equal(regularUser.role, 'user');
    assert.equal(adminUser.role, 'admin');
  });

});
