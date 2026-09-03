// Initialize Telegram WebApp SDK
const tg = window.Telegram?.WebApp;
if (tg) {
  tg.ready();
  tg.expand();
}

let currentUser = null;
let activeTab = 'home';

// Get Telegram InitData or mock header for dev/testing
function getAuthHeaders() {
  const headers = { 'Content-Type': 'application/json' };
  if (tg && tg.initData) {
    headers['X-Telegram-Init-Data'] = tg.initData;
  } else {
    // Default test fallback for browser development
    headers['x-mock-tg-id'] = '111111';
  }
  return headers;
}

// API Fetch Helper
async function apiFetch(endpoint, options = {}) {
  options.headers = { ...getAuthHeaders(), ...(options.headers || {}) };
  const res = await fetch(endpoint, options);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'API Request Failed');
  }
  return data;
}

// Load Initial Profile
async function loadUserProfile() {
  try {
    const profile = await apiFetch('/api/user/profile');
    currentUser = profile;

    // Update UI Header
    document.getElementById('user-name').textContent = profile.displayName;
    document.getElementById('user-level').textContent = `⭐ Lvl ${profile.level}`;
    document.getElementById('bal-diamonds').textContent = profile.balances.diamonds.toLocaleString();
    document.getElementById('bal-gold').textContent = profile.balances.gold.toLocaleString();
    document.getElementById('bal-softcoins').textContent = profile.balances.softCoins.toLocaleString();

    if (profile.photoUrl) {
      document.getElementById('user-avatar').src = profile.photoUrl;
    }

    // Toggle Admin Tab if Owner/Dev
    if (['owner', 'developer', 'admin'].includes(profile.role)) {
      document.getElementById('nav-admin-btn').classList.remove('hidden');
    }

    renderActiveTab();
  } catch (err) {
    console.error('Failed to load profile:', err);
  }
}

// Navigation Handler
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    activeTab = btn.dataset.tab;
    if (tg?.HapticFeedback) tg.HapticFeedback.impactOccurred('light');
    renderActiveTab();
  });
});

function renderActiveTab() {
  const main = document.getElementById('main-content');
  main.innerHTML = '';

  switch (activeTab) {
    case 'home': renderHomeView(main); break;
    case 'games': renderGamesView(main); break;
    case 'market': renderMarketView(main); break;
    case 'rewards': renderRewardsView(main); break;
    case 'collection': renderCollectionView(main); break;
    case 'leaderboard': renderLeaderboardView(main); break;
    case 'profile': renderProfileView(main); break;
    case 'admin': renderAdminView(main); break;
  }
}

/* ==========================================================================
   1. HOME VIEW
   ========================================================================== */
function renderHomeView(container) {
  if (!currentUser) return;

  container.innerHTML = `
    <div class="glass-card">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
          <h2 style="font-size: 1.2rem; font-weight: 800;">👋 Welcome back, ${currentUser.displayName}!</h2>
          <p style="color: var(--text-muted); font-size: 0.8rem; margin-top: 2px;">🔥 ${currentUser.streak} Day Activity Streak</p>
        </div>
      </div>

      <div style="margin-top: 16px;">
        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 700;">
          <span>Level ${currentUser.level}</span>
          <span>${currentUser.xp} / ${currentUser.xpForNextLevel} XP (${currentUser.xpProgressPct}%)</span>
        </div>
        <div class="xp-bar-container">
          <div class="xp-bar-fill" style="width: ${currentUser.xpProgressPct}%;"></div>
        </div>
      </div>
    </div>

    <div class="glass-card">
      <div class="section-title">🚀 Quick Actions</div>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
        <button class="btn-primary" onclick="switchTab('rewards')">🎡 Free Spin</button>
        <button class="btn-primary" style="background: linear-gradient(135deg, #00f5d4, #007bff);" onclick="switchTab('games')">🎮 Mini Games</button>
        <button class="btn-primary" style="background: linear-gradient(135deg, #ffb703, #fb8500);" onclick="switchTab('market')">🛒 Market</button>
        <button class="btn-primary" style="background: linear-gradient(135deg, #7f00ff, #ff007f);" onclick="switchTab('collection')">🃏 Collection</button>
      </div>
    </div>

    <div class="glass-card" id="home-tasks-container">
      <div class="section-title">📋 Today's Tasks</div>
      <div id="home-task-list">Loading tasks...</div>
    </div>
  `;

  loadHomeTasks();
}

async function loadHomeTasks() {
  try {
    const data = await apiFetch('/api/rewards/tasks');
    const container = document.getElementById('home-task-list');
    if (!container) return;

    if (data.tasks.length === 0) {
      container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem;">No tasks available today.</p>';
      return;
    }

    container.innerHTML = data.tasks.map(t => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
        <div>
          <div style="font-weight: 700; font-size: 0.85rem;">${t.title}</div>
          <div style="color: var(--text-muted); font-size: 0.75rem;">${t.description} (${t.currentCount}/${t.requiredCount})</div>
        </div>
        <div>
          ${t.claimed ? '<span style="color: var(--text-muted); font-size: 0.8rem; font-weight: 700;">Claimed</span>' :
            t.completed ? `<button class="btn-primary" style="padding: 6px 12px; font-size: 0.75rem;" onclick="claimTask(${t.taskId})">Claim</button>` :
            `<span style="color: var(--accent-gold); font-size: 0.75rem; font-weight: 700;">${t.reward.amount} ${t.reward.type}</span>`
          }
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

async function claimTask(taskId) {
  try {
    const res = await apiFetch('/api/tasks/claim', {
      method: 'POST',
      body: JSON.stringify({ taskId })
    });
    showModal('🎉 Task Completed!', `${res.message}`);
    loadUserProfile();
  } catch (err) {
    showModal('Error', err.message);
  }
}

function switchTab(tabName) {
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === tabName);
  });
  activeTab = tabName;
  renderActiveTab();
}

/* ==========================================================================
   2. GAMES VIEW (Flappy Bird, Mines, RPS, Knife Smash, Snake)
   ========================================================================== */
function renderGamesView(container) {
  container.innerHTML = `
    <div class="glass-card">
      <div class="section-title">🎮 Choose a Mini-Game</div>
      <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 12px;">Earn XP and Soft Coins while playing!</p>

      <div style="display: flex; flex-direction: column; gap: 12px;">
        <button class="btn-primary" style="background: linear-gradient(135deg, #00f5d4, #00b4d8);" onclick="playFlappyBird()">🐦 Flappy Bird</button>
        <button class="btn-primary" style="background: linear-gradient(135deg, #ff007f, #7f00ff);" onclick="playMines()">💣 Mines</button>
        <button class="btn-primary" style="background: linear-gradient(135deg, #ffb703, #fb8500);" onclick="playRPS()">✊ Rock Paper Scissors</button>
        <button class="btn-primary" style="background: linear-gradient(135deg, #e63946, #d62828);" onclick="playKnifeSmash()">🔪 Knife Smash</button>
        <button class="btn-primary" style="background: linear-gradient(135deg, #52b788, #2d6a4f);" onclick="playSnake()">🐍 Snake.io</button>
      </div>
    </div>

    <div id="game-modal-area"></div>
  `;
}

// 2a. Flappy Bird Implementation
async function playFlappyBird() {
  const area = document.getElementById('game-modal-area');
  const session = await apiFetch('/api/games/start', { method: 'POST', body: JSON.stringify({ gameType: 'flappy_bird' }) });

  area.innerHTML = `
    <div class="glass-card" style="margin-top: 12px;">
      <div class="section-title">🐦 Flappy Bird</div>
      <div class="game-container">
        <canvas id="flappy-canvas" width="320" height="280"></canvas>
      </div>
      <p style="text-align: center; font-size: 0.8rem; color: var(--text-muted); margin-top: 8px;">Tap / Click canvas to flap!</p>
    </div>
  `;

  const canvas = document.getElementById('flappy-canvas');
  const ctx = canvas.getContext('2d');
  let birdY = 140, velocity = 0, gravity = 0.4, score = 0, gameOver = false;
  let pipes = [];

  function flap() {
    if (gameOver) return;
    velocity = -6;
  }
  canvas.addEventListener('touchstart', flap);
  canvas.addEventListener('mousedown', flap);

  function loop() {
    if (gameOver) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Bird logic
    velocity += gravity;
    birdY += velocity;

    ctx.fillStyle = '#ffb703';
    ctx.beginPath();
    ctx.arc(60, birdY, 10, 0, Math.PI * 2);
    ctx.fill();

    // Pipe logic
    if (pipes.length === 0 || pipes[pipes.length - 1].x < canvas.width - 120) {
      const gapY = Math.floor(Math.random() * 120) + 60;
      pipes.push({ x: canvas.width, gapY });
    }

    for (let i = 0; i < pipes.length; i++) {
      let p = pipes[i];
      p.x -= 2;

      ctx.fillStyle = '#2a9d8f';
      ctx.fillRect(p.x, 0, 30, p.gapY - 40);
      ctx.fillRect(p.x, p.gapY + 40, 30, canvas.height - (p.gapY + 40));

      if (p.x === 60) score++;

      // Collision
      if (p.x < 70 && p.x + 30 > 50) {
        if (birdY - 10 < p.gapY - 40 || birdY + 10 > p.gapY + 40) {
          gameOver = true;
        }
      }
    }

    if (birdY > canvas.height || birdY < 0) gameOver = true;

    ctx.fillStyle = '#fff';
    ctx.font = '16px Montserrat';
    ctx.fillText(`Score: ${score}`, 10, 25);

    if (!gameOver) {
      requestAnimationFrame(loop);
    } else {
      finishGameSession(session.sessionId, 'flappy_bird', score, score > 0);
    }
  }

  loop();
}

// 2b. Rock Paper Scissors
async function playRPS() {
  const area = document.getElementById('game-modal-area');
  const session = await apiFetch('/api/games/start', { method: 'POST', body: JSON.stringify({ gameType: 'rps' }) });

  area.innerHTML = `
    <div class="glass-card" style="margin-top: 12px; text-align: center;">
      <div class="section-title" style="justify-content: center;">✊ Rock Paper Scissors</div>
      <div style="display: flex; justify-content: space-around; margin: 20px 0;">
        <button class="btn-primary" style="width: 80px;" onclick="submitRPSChoice('rock')">✊<br>Rock</button>
        <button class="btn-primary" style="width: 80px;" onclick="submitRPSChoice('paper')">✋<br>Paper</button>
        <button class="btn-primary" style="width: 80px;" onclick="submitRPSChoice('scissors')">✌️<br>Scissors</button>
      </div>
    </div>
  `;

  window.submitRPSChoice = async (userChoice) => {
    const choices = ['rock', 'paper', 'scissors'];
    const botChoice = choices[Math.floor(Math.random() * choices.length)];

    let isWin = false, isDraw = false, score = 0;
    if (userChoice === botChoice) {
      isDraw = true;
    } else if (
      (userChoice === 'rock' && botChoice === 'scissors') ||
      (userChoice === 'paper' && botChoice === 'rock') ||
      (userChoice === 'scissors' && botChoice === 'paper')
    ) {
      isWin = true;
      score = 1;
    }

    const outcomeText = isDraw ? 'DRAW 🤝' : isWin ? 'YOU WIN! 🎉' : 'YOU LOST 😢';
    alert(`You picked ${userChoice.toUpperCase()}, Bot picked ${botChoice.toUpperCase()}.\nResult: ${outcomeText}`);

    finishGameSession(session.sessionId, 'rps', score, isWin, isDraw);
  };
}

// 2c. Mines Game
async function playMines() {
  const area = document.getElementById('game-modal-area');
  const session = await apiFetch('/api/games/start', { method: 'POST', body: JSON.stringify({ gameType: 'mines' }) });

  const mineIndex = Math.floor(Math.random() * 9);
  let revealed = 0;

  area.innerHTML = `
    <div class="glass-card" style="margin-top: 12px; text-align: center;">
      <div class="section-title" style="justify-content: center;">💣 Mines (3x3)</div>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 16px 0;">
        ${Array.from({ length: 9 }).map((_, i) => `<button class="btn-primary mine-tile" data-idx="${i}" style="height: 60px; font-size: 1.2rem;" onclick="clickMineTile(${i})">❓</button>`).join('')}
      </div>
    </div>
  `;

  window.clickMineTile = (idx) => {
    const btn = document.querySelector(`.mine-tile[data-idx="${idx}"]`);
    if (!btn || btn.disabled) return;

    if (idx === mineIndex) {
      btn.textContent = '💣';
      btn.style.background = '#e63946';
      alert('BOOM! You hit a mine!');
      finishGameSession(session.sessionId, 'mines', revealed, false);
    } else {
      btn.textContent = '💎';
      btn.style.background = '#2a9d8f';
      btn.disabled = true;
      revealed++;
      if (revealed >= 3) {
        alert('Safe sweep! You won!');
        finishGameSession(session.sessionId, 'mines', revealed, true);
      }
    }
  };
}

// 2d. Knife Smash
async function playKnifeSmash() {
  const area = document.getElementById('game-modal-area');
  const session = await apiFetch('/api/games/start', { method: 'POST', body: JSON.stringify({ gameType: 'knife_smash' }) });

  area.innerHTML = `
    <div class="glass-card" style="margin-top: 12px; text-align: center;">
      <div class="section-title" style="justify-content: center;">🔪 Knife Smash</div>
      <div class="game-container">
        <div id="target-wheel" style="width: 80px; height: 80px; border-radius: 50%; background: #ffb703; border: 4px solid #fff; display: flex; align-items: center; justify-content: center; font-size: 1.5rem; animation: spinWheel 2s linear infinite;">🎯</div>
      </div>
      <button class="btn-primary" style="margin-top: 12px;" onclick="throwKnife()">🔪 Throw Knife</button>
    </div>
    <style>@keyframes spinWheel { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>
  `;

  let score = 0;
  window.throwKnife = () => {
    score++;
    if (score >= 5) {
      alert('Target smashed cleanly! 5 knives stuck!');
      finishGameSession(session.sessionId, 'knife_smash', score, true);
    } else if (Math.random() < 0.2) {
      alert('Knife bounced off! Game Over!');
      finishGameSession(session.sessionId, 'knife_smash', score, false);
    }
  };
}

// 2e. Snake
async function playSnake() {
  const area = document.getElementById('game-modal-area');
  const session = await apiFetch('/api/games/start', { method: 'POST', body: JSON.stringify({ gameType: 'snake' }) });

  area.innerHTML = `
    <div class="glass-card" style="margin-top: 12px; text-align: center;">
      <div class="section-title" style="justify-content: center;">🐍 Snake.io</div>
      <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 8px;">Tap buttons to direct snake</p>
      <div class="game-container">
        <canvas id="snake-canvas" width="200" height="200"></canvas>
      </div>
      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; width: 180px; margin: 12px auto;">
        <div></div><button class="btn-primary" onclick="setSnakeDir('UP')">⬆️</button><div></div>
        <button class="btn-primary" onclick="setSnakeDir('LEFT')">⬅️</button>
        <button class="btn-primary" onclick="setSnakeDir('DOWN')">⬇️</button>
        <button class="btn-primary" onclick="setSnakeDir('RIGHT')">➡️</button>
      </div>
    </div>
  `;

  const canvas = document.getElementById('snake-canvas');
  const ctx = canvas.getContext('2d');
  let snake = [{ x: 5, y: 5 }], dir = 'RIGHT', food = { x: 8, y: 8 }, score = 0, gameOver = false;

  window.setSnakeDir = (d) => dir = d;

  function loop() {
    if (gameOver) return;
    let head = { ...snake[0] };
    if (dir === 'UP') head.y--;
    if (dir === 'DOWN') head.y++;
    if (dir === 'LEFT') head.x--;
    if (dir === 'RIGHT') head.x++;

    if (head.x < 0 || head.x >= 20 || head.y < 0 || head.y >= 20) {
      gameOver = true;
    }

    if (head.x === food.x && head.y === food.y) {
      score++;
      food = { x: Math.floor(Math.random() * 20), y: Math.floor(Math.random() * 20) };
    } else {
      snake.pop();
    }

    snake.unshift(head);

    ctx.fillStyle = '#05030a';
    ctx.fillRect(0, 0, 200, 200);

    ctx.fillStyle = '#ff2a85';
    ctx.fillRect(food.x * 10, food.y * 10, 9, 9);

    ctx.fillStyle = '#52b788';
    snake.forEach(s => ctx.fillRect(s.x * 10, s.y * 10, 9, 9));

    if (!gameOver) {
      setTimeout(loop, 200);
    } else {
      finishGameSession(session.sessionId, 'snake', score, score > 0);
    }
  }

  loop();
}

async function finishGameSession(sessionId, gameType, score, isWin, isDraw = false) {
  try {
    const res = await apiFetch('/api/games/submit', {
      method: 'POST',
      body: JSON.stringify({ sessionId, gameType, score, isWin, isDraw })
    });
    showModal('🎮 Game Finished', `Score: ${score}\nCoins Earned: +${res.result.rewardCoins}\nXP Earned: +${res.result.rewardXP}`);
    loadUserProfile();
  } catch (err) {
    showModal('Error', err.message);
  }
}

/* ==========================================================================
   3. MARKET VIEW
   ========================================================================== */
async function renderMarketView(container) {
  container.innerHTML = `<p style="color: var(--text-muted);">Loading market items...</p>`;
  try {
    const data = await apiFetch('/api/market/items');

    container.innerHTML = `
      <div class="glass-card">
        <div class="section-title">🛒 Waifu Market</div>
        <p style="color: var(--text-muted); font-size: 0.8rem;">
          Daily Purchase Allowance: <strong>${data.remainingPurchasesToday} / ${data.dailyLimit}</strong> remaining today
        </p>
      </div>

      <div class="cards-grid">
        ${data.items.map(item => `
          <div class="waifu-card">
            <span class="rarity-tag rarity-${item.rarity}">${item.rarity}</span>
            <img src="${item.image_url || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400'}" alt="${item.name}">
            <div class="card-body">
              <div class="card-title">${item.name}</div>
              <div class="card-anime">${item.anime || 'Anime'} (#${item.card_number})</div>
              <div style="font-size: 0.75rem; font-weight: 800; color: var(--accent-gold); margin-top: 4px;">
                Price: ${item.price} ${item.currency.toUpperCase()}
              </div>
              <button class="btn-primary" style="margin-top: 6px; padding: 6px; font-size: 0.75rem;"
                ${data.remainingPurchasesToday <= 0 ? 'disabled' : ''}
                onclick="buyMarketCard(${item.market_item_id})">
                Buy Card
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p style="color: var(--accent-pink);">Failed to load market: ${err.message}</p>`;
  }
}

async function buyMarketCard(marketItemId) {
  try {
    const res = await apiFetch('/api/market/buy', {
      method: 'POST',
      body: JSON.stringify({ marketItemId })
    });
    showModal('🎉 Purchase Successful!', `${res.message}\nRemaining Purchases Today: ${res.remainingPurchasesToday}`);
    loadUserProfile();
    renderMarketView(document.getElementById('main-content'));
  } catch (err) {
    showModal('Purchase Failed', err.message);
  }
}

/* ==========================================================================
   4. REWARDS VIEW
   ========================================================================== */
async function renderRewardsView(container) {
  container.innerHTML = `<p style="color: var(--text-muted);">Loading rewards...</p>`;
  try {
    const status = await apiFetch('/api/rewards/status');

    container.innerHTML = `
      <div class="glass-card" style="text-align: center;">
        <div class="section-title" style="justify-content: center;">🎡 Daily Free Spin</div>
        <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 12px;">Spin daily to win free Diamonds, Gold, Coins, and XP!</p>
        <button class="btn-primary" ${!status.spin.available ? 'disabled' : ''} onclick="triggerDailySpin()">
          ${status.spin.available ? '✨ SPIN NOW' : '⏳ On Cooldown'}
        </button>
      </div>

      <div class="glass-card">
        <div class="section-title">📅 Calendar Rewards</div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span>Daily Login Reward</span>
            <button class="btn-primary" style="width: auto; padding: 6px 12px; font-size: 0.75rem;" ${!status.periodic.daily.available ? 'disabled' : ''} onclick="claimPeriodic('daily')">Claim</button>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span>Weekly Bonus</span>
            <button class="btn-primary" style="width: auto; padding: 6px 12px; font-size: 0.75rem;" ${!status.periodic.weekly.available ? 'disabled' : ''} onclick="claimPeriodic('weekly')">Claim</button>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span>Monthly Mega Claim</span>
            <button class="btn-primary" style="width: auto; padding: 6px 12px; font-size: 0.75rem;" ${!status.periodic.monthly.available ? 'disabled' : ''} onclick="claimPeriodic('monthly')">Claim</button>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p style="color: var(--accent-pink);">${err.message}</p>`;
  }
}

async function triggerDailySpin() {
  try {
    const res = await apiFetch('/api/rewards/spin', { method: 'POST' });
    showModal('🎰 SPIN RESULT', `🎉 You won: ${res.wonOutcome.label}!`);
    loadUserProfile();
    renderRewardsView(document.getElementById('main-content'));
  } catch (err) {
    showModal('Spin Failed', err.message);
  }
}

async function claimPeriodic(period) {
  try {
    const res = await apiFetch('/api/rewards/claim-periodic', { method: 'POST', body: JSON.stringify({ period }) });
    showModal('🎁 Reward Claimed', res.message);
    loadUserProfile();
    renderRewardsView(document.getElementById('main-content'));
  } catch (err) {
    showModal('Claim Failed', err.message);
  }
}

/* ==========================================================================
   5. COLLECTION VIEW
   ========================================================================== */
async function renderCollectionView(container) {
  container.innerHTML = `<p style="color: var(--text-muted);">Loading collection...</p>`;
  try {
    const data = await apiFetch('/api/user/collection');

    if (data.cards.length === 0) {
      container.innerHTML = `
        <div class="glass-card" style="text-align: center;">
          <div class="section-title" style="justify-content: center;">🃏 Card Collection</div>
          <p style="color: var(--text-muted); font-size: 0.85rem;">You don't own any Waifu cards yet! Visit the Market to get your first card.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = `
      <div class="glass-card">
        <div class="section-title">🃏 Card Collection (${data.totalCards})</div>
      </div>

      <div class="cards-grid">
        ${data.cards.map(card => `
          <div class="waifu-card">
            <span class="rarity-tag rarity-${card.rarity}">${card.rarity}</span>
            <img src="${card.image_url || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400'}" alt="${card.name}">
            <div class="card-body">
              <div class="card-title">${card.name}</div>
              <div class="card-anime">${card.anime || 'Anime'} (#${card.card_number})</div>
              <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 4px;">
                ⚔️ ATK: ${card.attack} | 🛡️ DEF: ${card.defense}
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p style="color: var(--accent-pink);">${err.message}</p>`;
  }
}

/* ==========================================================================
   6. LEADERBOARD VIEW
   ========================================================================== */
async function renderLeaderboardView(container) {
  container.innerHTML = `<p style="color: var(--text-muted);">Loading leaderboards...</p>`;
  try {
    const data = await apiFetch('/api/leaderboards/ctop');

    container.innerHTML = `
      <div class="glass-card">
        <div class="section-title">🏆 CTOP Leaderboard</div>
        <p style="color: var(--text-muted); font-size: 0.8rem; margin-bottom: 8px;">Top 10 Rankings</p>
        <div style="font-size: 0.85rem; font-weight: 700; color: var(--accent-gold); margin-bottom: 12px;">
          📍 Your Rank: #${data.myPosition.rank} | Score: ${data.myPosition.score}
        </div>

        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${data.top10.map(item => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 12px; background: rgba(255,255,255,0.05); border-radius: 10px; ${item.isCurrentUser ? 'border: 1px solid var(--accent-pink);' : ''}">
              <div style="display: flex; align-items: center; gap: 10px;">
                <span style="font-weight: 800; font-size: 0.9rem; width: 24px;">#${item.rank}</span>
                <span style="font-weight: 700; font-size: 0.85rem;">${item.displayName}</span>
              </div>
              <span style="font-weight: 800; color: var(--accent-gold); font-size: 0.85rem;">${item.score.toLocaleString()}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p style="color: var(--accent-pink);">${err.message}</p>`;
  }
}

/* ==========================================================================
   7. PROFILE VIEW
   ========================================================================== */
function renderProfileView(container) {
  if (!currentUser) return;

  container.innerHTML = `
    <div class="glass-card" style="text-align: center;">
      <img src="${currentUser.photoUrl || 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=100'}" style="width: 80px; height: 80px; border-radius: 50%; border: 3px solid var(--accent-purple);" alt="Avatar">
      <h2 style="font-size: 1.2rem; font-weight: 800; margin-top: 8px;">${currentUser.displayName}</h2>
      <p style="color: var(--accent-gold); font-size: 0.85rem; font-weight: 700;">⭐ Level ${currentUser.level}</p>

      <div style="display: flex; justify-content: space-around; margin-top: 16px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.1);">
        <div>
          <div style="font-size: 1rem; font-weight: 800;">💎 ${currentUser.balances.diamonds}</div>
          <div style="font-size: 0.7rem; color: var(--text-muted);">Diamonds</div>
        </div>
        <div>
          <div style="font-size: 1rem; font-weight: 800;">🪙 ${currentUser.balances.gold}</div>
          <div style="font-size: 0.7rem; color: var(--text-muted);">Gold</div>
        </div>
        <div>
          <div style="font-size: 1rem; font-weight: 800;">🟡 ${currentUser.balances.softCoins}</div>
          <div style="font-size: 0.7rem; color: var(--text-muted);">Soft Coins</div>
        </div>
      </div>
    </div>
  `;
}

/* ==========================================================================
   8. ADMIN DASHBOARD VIEW (Owner & Developer Only)
   ========================================================================== */
async function renderAdminView(container) {
  container.innerHTML = `<p style="color: var(--text-muted);">Loading Admin Dashboard...</p>`;
  try {
    const data = await apiFetch('/api/admin/dashboard');

    container.innerHTML = `
      <div class="glass-card">
        <div class="section-title">⚙️ Owner & Developer Controls</div>
        <p style="color: var(--text-muted); font-size: 0.8rem;">
          Total Users: ${data.stats.userCount} | Cards: ${data.stats.cardsCount} | Market Items: ${data.stats.marketItemsCount}
        </p>
      </div>

      <div class="glass-card">
        <div class="section-title">👥 User Management (Unmasked TG IDs)</div>
        <div style="max-height: 250px; overflow-y: auto; font-size: 0.75rem;">
          ${data.users.map(u => `
            <div style="padding: 6px; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; justify-content: space-between;">
              <span><strong>${u.first_name}</strong> (TG ID: ${u.telegram_id})</span>
              <span>Lvl ${u.level} | ${u.role.toUpperCase()}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  } catch (err) {
    container.innerHTML = `<p style="color: var(--accent-pink);">Admin Access Denied: ${err.message}</p>`;
  }
}

// Modal Helper
function showModal(title, text) {
  const overlay = document.getElementById('modal-overlay');
  const content = document.getElementById('modal-content');
  content.innerHTML = `
    <h3 style="font-family: 'Orbitron', sans-serif; color: #fff;">${title}</h3>
    <p style="color: var(--text-muted); font-size: 0.9rem; white-space: pre-wrap;">${text}</p>
    <button class="btn-primary" onclick="closeModal()">OK</button>
  `;
  overlay.classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

// App Entry Point
loadUserProfile();
