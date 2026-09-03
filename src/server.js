const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { initDatabase } = require('./db');
const seedDatabase = require('./db/seed');

const userRoutes = require('./routes/user');
const marketRoutes = require('./routes/market');
const { router: rewardsRoutes } = require('./routes/rewards');
const leaderboardRoutes = require('./routes/leaderboards');
const gameRoutes = require('./routes/games');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend assets
app.use(express.static(path.join(__dirname, '../public')));

// Initialize database schema and seed initial data if needed
initDatabase();
seedDatabase();

// API Routes
app.use('/api/user', userRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/rewards', rewardsRoutes);
app.use('/api/leaderboards', leaderboardRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/admin', adminRoutes);

// Catch-all route to serve SPA frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🌸 Waifu Catcher WebApp server running on port ${PORT}`);
  });
}

module.exports = app;
