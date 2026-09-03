const express = require('express');
const supertest = require('supertest');
const { db } = require('../src/db');
const seedDatabase = require('../src/db/seed');
const { router: rewardsRoutes } = require('../src/routes/rewards');

process.env.NODE_ENV = 'test';

const app = express();
app.use(express.json());
app.use('/api/rewards', rewardsRoutes);

describe('Configurable Rewards & Tasks API Routes', () => {
  beforeEach(() => {
    seedDatabase();
    // Reset user spin time for predictable tests
    db.prepare('UPDATE users SET last_free_spin_at = NULL, last_daily_claim_at = NULL WHERE telegram_id = 111111').run();
  });

  test('GET /api/rewards/status returns spin & periodic status', async () => {
    const res = await supertest(app)
      .get('/api/rewards/status')
      .set('x-mock-tg-id', '111111');

    expect(res.status).toBe(200);
    expect(res.body.spin.available).toBe(true);
    expect(res.body.periodic.daily.available).toBe(true);
  });

  test('POST /api/rewards/spin grants spin reward and puts spin on cooldown', async () => {
    const res = await supertest(app)
      .post('/api/rewards/spin')
      .set('x-mock-tg-id', '111111');

    expect(res.status).toBe(200);
    expect(res.body.wonOutcome).toBeDefined();

    // Second spin attempt should fail due to cooldown
    const res2 = await supertest(app)
      .post('/api/rewards/spin')
      .set('x-mock-tg-id', '111111');

    expect(res2.status).toBe(400);
    expect(res2.body.error).toContain('cooldown');
  });

  test('POST /api/rewards/claim-periodic claims daily reward', async () => {
    const res = await supertest(app)
      .post('/api/rewards/claim-periodic')
      .set('x-mock-tg-id', '111111')
      .send({ period: 'daily' });

    expect(res.status).toBe(200);
    expect(res.body.claimedReward.diamonds).toBe(5);
  });
});
