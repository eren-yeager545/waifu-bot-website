const express = require('express');
const supertest = require('supertest');
const seedDatabase = require('../src/db/seed');
const leaderboardRoutes = require('../src/routes/leaderboards');

process.env.NODE_ENV = 'test';

const app = express();
app.use(express.json());
app.use('/api/leaderboards', leaderboardRoutes);

describe('Leaderboard Privacy & Ranking API Routes', () => {
  beforeEach(() => {
    seedDatabase();
  });

  test('GET /api/leaderboards/level returns top 10 max for normal users and personal position', async () => {
    const res = await supertest(app)
      .get('/api/leaderboards/level')
      .set('x-mock-tg-id', '111111');

    expect(res.status).toBe(200);
    expect(res.body.top10.length).toBeLessThanOrEqual(10);
    expect(res.body.myPosition.rank).toBeGreaterThan(0);
    expect(res.body.top10[0].telegram_id).toBeUndefined();
    expect(res.body.top10[0].id).toBeUndefined();
  });

  test('GET /api/leaderboards/ctop returns CTOP power calculation', async () => {
    const res = await supertest(app)
      .get('/api/leaderboards/ctop')
      .set('x-mock-tg-id', '111111');

    expect(res.status).toBe(200);
    expect(res.body.scoreField).toBe('CTOP Power Score');
  });
});
