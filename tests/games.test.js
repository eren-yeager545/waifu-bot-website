const express = require('express');
const supertest = require('supertest');
const seedDatabase = require('../src/db/seed');
const gameRoutes = require('../src/routes/games');

process.env.NODE_ENV = 'test';

const app = express();
app.use(express.json());
app.use('/api/games', gameRoutes);

describe('Game Session & Anti-Cheat Validation API Routes', () => {
  beforeEach(() => {
    seedDatabase();
  });

  test('POST /api/games/start initiates valid game session', async () => {
    const res = await supertest(app)
      .post('/api/games/start')
      .set('x-mock-tg-id', '111111')
      .send({ gameType: 'flappy_bird' });

    expect(res.status).toBe(200);
    expect(res.body.sessionId).toBeDefined();
    expect(res.body.gameType).toBe('flappy_bird');
  });

  test('POST /api/games/submit rejects forged/impossible score (anti-cheat)', async () => {
    const startRes = await supertest(app)
      .post('/api/games/start')
      .set('x-mock-tg-id', '111111')
      .send({ gameType: 'flappy_bird' });

    const sessionId = startRes.body.sessionId;

    // Immediately submit an impossible score of 100 within 0.01 seconds
    const submitRes = await supertest(app)
      .post('/api/games/submit')
      .set('x-mock-tg-id', '111111')
      .send({
        sessionId,
        gameType: 'flappy_bird',
        score: 100,
        isWin: true
      });

    expect(submitRes.status).toBe(400);
    expect(submitRes.body.error).toContain('ANTI_CHEAT_TRIGGERED');
  });

  test('POST /api/games/submit accepts realistic game score and grants rewards', async () => {
    const startRes = await supertest(app)
      .post('/api/games/start')
      .set('x-mock-tg-id', '111111')
      .send({ gameType: 'rps' });

    const sessionId = startRes.body.sessionId;

    const submitRes = await supertest(app)
      .post('/api/games/submit')
      .set('x-mock-tg-id', '111111')
      .send({
        sessionId,
        gameType: 'rps',
        score: 1,
        isWin: true
      });

    expect(submitRes.status).toBe(200);
    expect(submitRes.body.result.rewardCoins).toBeGreaterThan(0);
  });
});
