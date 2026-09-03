const express = require('express');
const supertest = require('supertest');
const seedDatabase = require('../src/db/seed');
const adminRoutes = require('../src/routes/admin');

process.env.NODE_ENV = 'test';

const app = express();
app.use(express.json());
app.use('/api/admin', adminRoutes);

describe('Owner & Developer Admin Management API Routes', () => {
  beforeEach(() => {
    seedDatabase();
  });

  test('GET /api/admin/dashboard blocks regular users with 403 Forbidden', async () => {
    const res = await supertest(app)
      .get('/api/admin/dashboard')
      .set('x-mock-tg-id', '111111'); // Regular user role

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Access denied');
  });

  test('GET /api/admin/dashboard allows owner role and returns full dashboard data', async () => {
    const res = await supertest(app)
      .get('/api/admin/dashboard')
      .set('x-mock-tg-id', '999999'); // Owner role

    expect(res.status).toBe(200);
    expect(res.body.users.length).toBeGreaterThan(0);
    expect(res.body.users[0].telegram_id).toBeDefined(); // Admins see TG IDs
  });

  test('POST /api/admin/configs allows owner to update dynamic spin config', async () => {
    const newConfig = { enabled: false, cooldown_hours: 12, outcomes: [] };

    const res = await supertest(app)
      .post('/api/admin/configs')
      .set('x-mock-tg-id', '999999')
      .send({ key: 'spin_config', value: newConfig });

    expect(res.status).toBe(200);
  });
});
