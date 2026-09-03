const express = require('express');
const supertest = require('supertest');
const { db } = require('../src/db');
const seedDatabase = require('../src/db/seed');
const marketRoutes = require('../src/routes/market');

process.env.NODE_ENV = 'test';

const app = express();
app.use(express.json());
app.use('/api/market', marketRoutes);

describe('Market API Routes & Purchase Limit', () => {
  beforeEach(() => {
    seedDatabase();
    const todayStr = new Date().toISOString().split('T')[0];
    db.prepare('UPDATE users SET diamonds = 250, daily_purchases_count = 0, last_purchase_date = ? WHERE telegram_id = 111111').run(todayStr);
  });

  test('GET /api/market/items returns items and daily limit info', async () => {
    const res = await supertest(app)
      .get('/api/market/items')
      .set('x-mock-tg-id', '111111');

    expect(res.status).toBe(200);
    expect(res.body.dailyLimit).toBe(5);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  test('POST /api/market/buy performs atomic purchase', async () => {
    const res = await supertest(app)
      .post('/api/market/buy')
      .set('x-mock-tg-id', '111111')
      .send({ marketItemId: 1 });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.purchasesToday).toBe(1);
    expect(res.body.newBalances.diamonds).toBe(150);
  });

  test('POST /api/market/buy blocks when 5 purchase daily limit is reached', async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    db.prepare('UPDATE users SET daily_purchases_count = 5, last_purchase_date = ? WHERE telegram_id = 111111').run(todayStr);

    const res = await supertest(app)
      .post('/api/market/buy')
      .set('x-mock-tg-id', '111111')
      .send({ marketItemId: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('DAILY_LIMIT_REACHED');
  });

  test('POST /api/market/buy rolls back when funds are insufficient', async () => {
    const todayStr = new Date().toISOString().split('T')[0];
    db.prepare('UPDATE users SET diamonds = 10, daily_purchases_count = 0, last_purchase_date = ? WHERE telegram_id = 111111').run(todayStr);

    const res = await supertest(app)
      .post('/api/market/buy')
      .set('x-mock-tg-id', '111111')
      .send({ marketItemId: 1 });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('INSUFFICIENT_FUNDS');
  });
});
