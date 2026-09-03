const express = require('express');
const supertest = require('supertest');
const { db } = require('../src/db');
const seedDatabase = require('../src/db/seed');
const userRoutes = require('../src/routes/user');

process.env.NODE_ENV = 'test';

const app = express();
app.use(express.json());
app.use('/api/user', userRoutes);

describe('User API Routes', () => {
  beforeEach(() => {
    seedDatabase();
    // Re-set user level to 5 for test assertions
    db.prepare('UPDATE users SET level = 5, xp = 0 WHERE telegram_id = 111111').run();
  });

  test('GET /api/user/profile returns authenticated profile details without sensitive IDs', async () => {
    const res = await supertest(app)
      .get('/api/user/profile')
      .set('x-mock-tg-id', '111111');

    expect(res.status).toBe(200);
    expect(res.body.displayName).toBe('Alice');
    expect(res.body.balances.diamonds).toBeDefined();
    expect(res.body.level).toBe(5);
    expect(res.body.telegram_id).toBeUndefined();
    expect(res.body.id).toBeUndefined();
  });

  test('GET /api/user/collection returns owned card items', async () => {
    db.prepare('INSERT INTO user_cards (user_id, card_id) VALUES (1, 1)').run();

    const res = await supertest(app)
      .get('/api/user/collection')
      .set('x-mock-tg-id', '111111');

    expect(res.status).toBe(200);
    expect(res.body.totalCards).toBeGreaterThanOrEqual(1);
    expect(res.body.cards[0].name).toBeDefined();
  });
});
