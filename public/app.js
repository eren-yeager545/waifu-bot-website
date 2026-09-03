// Initialize Telegram WebApp SDK
const tg = window.Telegram?.WebApp || {
  initData: '',
  initDataUnsafe: {},
  expand: () => {},
  ready: () => {},
  showPopup: (opts) => alert(opts.message || opts.title),
  HapticFeedback: { impactOccurred: () => {}, notificationOccurred: () => {} }
};

tg.expand();
tg.ready();

// State management
const state = {
  user: null,
  stats: { cardCount: 0, totalPower: 0 },
  favoriteCard: null,
  initData: tg.initData,
  collection: [],
  currentCollectionFilter: 'all',
  marketListings: [],
  marketPacks: [],
  tasks: [],
  referrals: [],
  inviteLink: '',
  achievements: [],
  leaderboards: { collectors: [], richest: [], levels: [] },
  catchCooldownTimer: null,
  nextCatchTime: 0
};

// API Helper
async function apiRequest(endpoint, method = 'GET', body = null) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Telegram-Init-Data': state.initData
  };

  const options = { method, headers };
  if (body) options.body = JSON.stringify(body);

  const response = await fetch(endpoint, options);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || 'Server error occurred');
  }
  return data;
}

// App Initialization
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadUserData();
});

async function loadUserData() {
  try {
    const data = await apiRequest('/api/auth/me');
    state.user = data.user;
    state.stats = data.stats;
    state.favoriteCard = data.favoriteCard;

    renderHeaderAndProfile();
    await loadTabContent('home');
  } catch (err) {
    console.error('Failed to load user:', err);
    // If running in development browser without initData
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      showModal('Development Notice', 'Please launch this WebApp through Telegram or specify a valid initData context.');
    }
  }
}

function renderHeaderAndProfile() {
  if (!state.user) return;

  const name = state.user.first_name || state.user.username || 'Waifu Collector';
  document.getElementById('user-name').textContent = name;
  document.getElementById('user-level').textContent = state.user.level || 1;
  document.getElementById('home-lvl').textContent = state.user.level || 1;
  document.getElementById('user-coins').textContent = state.user.coins || 0;
  document.getElementById('user-gems').textContent = state.user.gems || 0;

  if (state.user.photo_url) {
    document.getElementById('user-avatar').src = state.user.photo_url;
  }

  // XP bar
  const currentXp = state.user.xp || 0;
  const xpForNextLevel = (state.user.level || 1) * 100;
  const xpPercent = Math.min(Math.floor((currentXp / xpForNextLevel) * 100), 100);
  document.getElementById('xp-progress-text').textContent = `${currentXp} / ${xpForNextLevel} XP`;
  document.getElementById('xp-bar-inner').style.width = `${xpPercent}%`;

  // Stats
  document.getElementById('stat-cards-count').textContent = state.stats.cardCount || 0;
  document.getElementById('stat-total-power').textContent = state.stats.totalPower || 0;
  document.getElementById('stat-streak').textContent = state.user.streak || 0;

  // Favorite Waifu
  const favContainer = document.getElementById('favorite-card-container');
  if (state.favoriteCard) {
    favContainer.innerHTML = `
      <img src="${state.favoriteCard.image_url}" class="waifu-card-img" alt="${state.favoriteCard.name}">
      <div class="waifu-card-overlay">
        <strong>${state.favoriteCard.name}</strong>
        <p><small>${state.favoriteCard.anime} • PWR ${state.favoriteCard.power}</small></p>
      </div>
    `;
  }

  // Show Admin tab if admin/owner
  if (['admin', 'owner', 'developer'].includes(state.user.role)) {
    document.getElementById('nav-item-admin')?.classList.remove('hidden');
  }
}

// Navigation Tab Switching
async function switchTab(tabName) {
  document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));

  const targetView = document.getElementById(`view-${tabName}`);
  const targetNav = document.querySelector(`.nav-item[data-tab="${tabName}"]`);

  if (targetView) targetView.classList.add('active');
  if (targetNav) targetNav.classList.add('active');

  tg.HapticFeedback.impactOccurred('light');
  await loadTabContent(tabName);
}

async function loadTabContent(tabName) {
  switch (tabName) {
    case 'games':
      initGachaSection();
      break;
    case 'collection':
      await loadCollection();
      break;
    case 'market':
      await loadMarketplace();
      break;
    case 'tasks':
      await loadTasks();
      break;
    case 'rewards':
      await loadRewards();
      break;
    case 'achievements':
      await loadAchievements();
      break;
    case 'leaderboard':
      await loadLeaderboard();
      break;
    case 'admin':
      await loadAdminPanel();
      break;
  }
}

// --- GACHA CATCH GAME ---
function initGachaSection() {
  const catchBtn = document.getElementById('btn-catch-waifu');
  const now = Date.now();
  const lastCatch = state.user?.last_catch_time || 0;
  const cooldownMs = 60 * 1000;

  if (now - lastCatch < cooldownMs) {
    state.nextCatchTime = lastCatch + cooldownMs;
    startCatchTimer();
  } else {
    document.getElementById('catch-timer').textContent = 'Ready!';
    catchBtn.disabled = false;
  }
}

function startCatchTimer() {
  const timerBadge = document.getElementById('catch-timer');
  const catchBtn = document.getElementById('btn-catch-waifu');
  catchBtn.disabled = true;

  clearInterval(state.catchCooldownTimer);
  state.catchCooldownTimer = setInterval(() => {
    const diffSec = Math.ceil((state.nextCatchTime - Date.now()) / 1000);
    if (diffSec <= 0) {
      clearInterval(state.catchCooldownTimer);
      timerBadge.textContent = 'Ready!';
      catchBtn.disabled = false;
    } else {
      timerBadge.textContent = `${diffSec}s`;
    }
  }, 1000);
}

async function handleCatchWaifu() {
  const orb = document.getElementById('gacha-orb');
  const resultDiv = document.getElementById('gacha-result');
  const catchBtn = document.getElementById('btn-catch-waifu');

  try {
    catchBtn.disabled = true;
    orb.style.transform = 'scale(1.3) rotate(360deg)';
    tg.HapticFeedback.impactOccurred('medium');

    const res = await apiRequest('/api/games/catch', 'POST');

    setTimeout(() => {
      orb.style.transform = 'scale(1)';
      tg.HapticFeedback.notificationOccurred('success');

      let duplicateText = res.isDuplicate ? `<p style="color:var(--gold-color)">Duplicate Bonus: +${res.duplicateCoinsBonus} Coins!</p>` : '';
      showModal('✨ Waifu Caught! ✨', `
        <div style="text-align:center">
          <img src="${res.card.image_url}" style="width:160px; height:220px; border-radius:12px; object-fit:cover; border:2px solid var(--accent-color); margin-bottom:10px;">
          <h3>${res.card.name}</h3>
          <p><small>${res.card.anime} • Rarity: ${res.card.rarity}</small></p>
          <p style="margin-top:8px">Power: <strong>${res.card.power}</strong></p>
          ${duplicateText}
          <p style="margin-top:6px; color:#a5b4fc">+${res.coinsEarned} Coins | +${res.xpEarned} XP</p>
        </div>
      `);

      state.user.last_catch_time = Date.now();
      state.nextCatchTime = res.nextCatchTime;
      startCatchTimer();
      loadUserData();
    }, 600);

  } catch (err) {
    showModal('Catch Failed', err.message);
    catchBtn.disabled = false;
  }
}

// --- MEMORY MINI-GAME ---
let memoryCards = [];
let flippedCards = [];
let matchedPairs = 0;

function startMemoryGame() {
  const board = document.getElementById('memory-game-board');
  const emojis = ['🌸', '💖', '⭐', '🎀', '🌸', '💖', '⭐', '🎀'];
  memoryCards = emojis.sort(() => Math.random() - 0.5);
  flippedCards = [];
  matchedPairs = 0;

  board.innerHTML = memoryCards.map((emoji, index) => `
    <div class="memory-card" data-index="${index}" onclick="handleMemoryClick(${index})">
      <span class="card-back">❓</span>
    </div>
  `).join('');
}

function handleMemoryClick(index) {
  if (flippedCards.length >= 2) return;

  const cardElem = document.querySelector(`.memory-card[data-index="${index}"]`);
  if (cardElem.classList.contains('flipped') || cardElem.classList.contains('matched')) return;

  cardElem.classList.add('flipped');
  cardElem.innerHTML = memoryCards[index];
  flippedCards.push({ index, emoji: memoryCards[index], elem: cardElem });

  tg.HapticFeedback.impactOccurred('light');

  if (flippedCards.length === 2) {
    const [c1, c2] = flippedCards;
    if (c1.emoji === c2.emoji) {
      c1.elem.classList.add('matched');
      c2.elem.classList.add('matched');
      matchedPairs++;
      flippedCards = [];

      if (matchedPairs === 4) {
        setTimeout(completeMemoryGame, 400);
      }
    } else {
      setTimeout(() => {
        c1.elem.classList.remove('flipped');
        c2.elem.classList.remove('flipped');
        c1.elem.innerHTML = '❓';
        c2.elem.innerHTML = '❓';
        flippedCards = [];
      }, 800);
    }
  }
}

async function completeMemoryGame() {
  try {
    const res = await apiRequest('/api/games/memory/complete', 'POST', { score: 100, moves: 8, timeSeconds: 20 });
    showModal('🧠 Memory Complete!', `Great job! You earned <strong>+${res.coinsEarned} Coins</strong> and <strong>+${res.xpEarned} XP</strong>.`);
    await loadUserData();
    document.getElementById('memory-game-board').innerHTML = `<button id="btn-start-memory" class="btn-secondary" onclick="startMemoryGame()">Play Again</button>`;
  } catch (err) {
    showModal('Error', err.message);
  }
}

// --- COLLECTION VIEW ---
async function loadCollection() {
  try {
    const data = await apiRequest('/api/collection');
    state.collection = data.collection;
    document.getElementById('collection-count-badge').textContent = `${state.collection.length} Cards`;
    renderCollection();
  } catch (err) {
    console.error('Collection fetch error:', err);
  }
}

function filterCollection(rarity, chipElem) {
  state.currentCollectionFilter = rarity;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  if (chipElem) chipElem.classList.add('active');
  renderCollection();
}

function renderCollection() {
  const grid = document.getElementById('collection-grid');
  let filtered = state.collection;

  if (state.currentCollectionFilter !== 'all') {
    filtered = filtered.filter(c => c.rarity === state.currentCollectionFilter);
  }

  if (filtered.length === 0) {
    grid.innerHTML = `<p style="grid-column: 1/-1; text-align:center; color:var(--text-muted); padding:30px;">No waifus found in this category.</p>`;
    return;
  }

  grid.innerHTML = filtered.map(card => `
    <div class="waifu-card rarity-${card.rarity}">
      <div class="card-img-wrap">
        <img src="${card.image_url}" alt="${card.name}">
        <span class="rarity-badge">${card.rarity}</span>
      </div>
      <div class="card-details">
        <span class="card-name">${card.name}</span>
        <span class="card-anime">${card.anime}</span>
        <span class="card-power">⚡ Power: ${card.power}</span>
        <div style="display:flex; gap:4px; margin-top:6px;">
          <button class="btn-secondary small" style="flex:1;" onclick="setFavoriteCard(${card.id})">
            ${card.is_favorite ? '⭐ Fav' : 'Set Fav'}
          </button>
          <button class="btn-secondary small" onclick="openSellModal(${card.user_card_id}, '${card.name}')">Sell</button>
        </div>
      </div>
    </div>
  `).join('');
}

async function setFavoriteCard(cardId) {
  try {
    const res = await apiRequest('/api/collection/favorite', 'POST', { cardId });
    showModal('Favorite Updated', 'Your favorite waifu display has been updated.');
    await loadUserData();
    await loadCollection();
  } catch (err) {
    showModal('Error', err.message);
  }
}

function openSellModal(userCardId, cardName) {
  showModal('List Waifu for Sale', `
    <div style="display:flex; flex-direction:column; gap:10px;">
      <p>List <strong>${cardName}</strong> on the marketplace:</p>
      <input type="number" id="sell-price-input" placeholder="Price" min="1" style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); color:#fff; padding:10px; border-radius:8px;">
      <select id="sell-currency-input" style="background:rgba(0,0,0,0.3); border:1px solid rgba(255,255,255,0.1); color:#fff; padding:10px; border-radius:8px;">
        <option value="coins">Coins 🪙</option>
        <option value="gems">Gems 💎</option>
      </select>
      <button class="btn-primary" onclick="confirmSell(${userCardId})">List on Market</button>
    </div>
  `);
}

async function confirmSell(userCardId) {
  const price = parseInt(document.getElementById('sell-price-input').value);
  const currency = document.getElementById('sell-currency-input').value;

  if (!price || price <= 0) {
    alert('Please enter a valid price.');
    return;
  }

  try {
    await apiRequest('/api/market/list', 'POST', { userCardId, price, currency });
    closeModal();
    showModal('Listed!', 'Your card is now live on the marketplace.');
    await loadCollection();
  } catch (err) {
    showModal('Error', err.message);
  }
}

// --- MARKETPLACE VIEW ---
async function loadMarketplace() {
  try {
    const data = await apiRequest('/api/market');
    state.marketListings = data.listings;
    state.marketPacks = data.packs;

    renderPacks();
    renderListings();
  } catch (err) {
    console.error('Market error:', err);
  }
}

function switchMarketSubtab(subtab, btnElem) {
  document.querySelectorAll('.market-subview').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('#view-market .subtab-btn').forEach(b => b.classList.remove('active'));

  document.getElementById(`market-${subtab}-container`).classList.add('active');
  if (btnElem) btnElem.classList.add('active');
}

function renderPacks() {
  const grid = document.getElementById('packs-grid');
  grid.innerHTML = state.marketPacks.map(pack => `
    <div class="pack-card">
      <div>
        <strong>📦 ${pack.name}</strong>
        <p><small style="color:var(--text-muted)">1 Waifu Card Gacha</small></p>
      </div>
      <button class="btn-primary small" onclick="buyPack('${pack.id}')">
        Buy ${pack.priceCoins > 0 ? `${pack.priceCoins} 🪙` : `${pack.priceGems} 💎`}
      </button>
    </div>
  `).join('');
}

async function buyPack(packId) {
  try {
    const res = await apiRequest('/api/market/buy-pack', 'POST', { packId });
    showModal('📦 Pack Opened!', `
      <div style="text-align:center">
        <img src="${res.card.image_url}" style="width:150px; height:200px; border-radius:12px; object-fit:cover; margin-bottom:8px;">
        <h3>${res.card.name}</h3>
        <p>Rarity: <strong>${res.card.rarity}</strong> • PWR: ${res.card.power}</p>
      </div>
    `);
    await loadUserData();
  } catch (err) {
    showModal('Purchase Failed', err.message);
  }
}

function renderListings() {
  const grid = document.getElementById('listings-grid');
  if (state.marketListings.length === 0) {
    grid.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:20px;">No player listings right now.</p>`;
    return;
  }

  grid.innerHTML = state.marketListings.map(item => `
    <div class="listing-card">
      <div style="display:flex; gap:10px; align-items:center;">
        <img src="${item.image_url}" style="width:48px; height:48px; border-radius:8px; object-fit:cover;">
        <div>
          <strong>${item.name} (${item.rarity})</strong>
          <p><small style="color:var(--text-muted)">Seller: ${item.seller_first_name || item.seller_username}</small></p>
        </div>
      </div>
      <button class="btn-primary small" onclick="buyListing(${item.listing_id})">
        ${item.price} ${item.currency === 'gems' ? '💎' : '🪙'}
      </button>
    </div>
  `).join('');
}

async function buyListing(listingId) {
  try {
    await apiRequest('/api/market/buy', 'POST', { listingId });
    showModal('Success', 'Card purchased and added to your collection!');
    await loadUserData();
    await loadMarketplace();
  } catch (err) {
    showModal('Error', err.message);
  }
}

// --- TASKS & STREAK ---
async function loadTasks() {
  try {
    const data = await apiRequest('/api/tasks');
    state.tasks = data.tasks;
    document.getElementById('task-streak-count').textContent = state.user?.streak || 0;

    const list = document.getElementById('tasks-list');
    list.innerHTML = state.tasks.map(t => `
      <div class="task-card">
        <div>
          <strong>${t.title}</strong>
          <p><small style="color:var(--text-muted)">${t.description}</small></p>
          <p><small>Progress: ${t.progress} / ${t.requirement_count}</small></p>
        </div>
        <button class="btn-primary small" ${t.completed || t.progress < t.requirement_count ? 'disabled' : ''} onclick="claimTask(${t.id})">
          ${t.completed ? 'Claimed' : `Claim ${t.reward_amount} ${t.reward_type === 'gems' ? '💎' : '🪙'}`}
        </button>
      </div>
    `).join('');
  } catch (err) {
    console.error('Tasks error:', err);
  }
}

async function claimStreak() {
  try {
    const res = await apiRequest('/api/tasks/streak/claim', 'POST');
    showModal('🔥 Streak Claimed!', `Claimed day <strong>${res.streak}</strong> streak bonus: +${res.rewardCoins} Coins!`);
    await loadUserData();
    await loadTasks();
  } catch (err) {
    showModal('Streak', err.message);
  }
}

async function claimTask(taskId) {
  try {
    const res = await apiRequest('/api/tasks/claim', 'POST', { taskId });
    showModal('Task Completed!', `Received +${res.rewardAmount} ${res.rewardType}!`);
    await loadUserData();
    await loadTasks();
  } catch (err) {
    showModal('Error', err.message);
  }
}

// --- REWARDS & REFERRALS ---
async function loadRewards() {
  try {
    const data = await apiRequest('/api/rewards/referrals');
    state.referrals = data.referrals;
    state.inviteLink = data.inviteLink;

    document.getElementById('invite-link-input').value = data.inviteLink;
    document.getElementById('ref-count').textContent = data.totalReferrals;

    const list = document.getElementById('referrals-list');
    if (data.referrals.length === 0) {
      list.innerHTML = `<p style="color:var(--text-muted); font-size:12px;">No friends invited yet.</p>`;
      return;
    }

    list.innerHTML = data.referrals.map(r => `
      <div class="task-card">
        <div>
          <strong>${r.first_name || r.username}</strong>
          <p><small style="color:var(--text-muted)">Joined ${new Date(r.created_at).toLocaleDateString()}</small></p>
        </div>
        <button class="btn-primary small" ${r.claimed ? 'disabled' : ''} onclick="claimReferral(${r.id})">
          ${r.claimed ? 'Claimed' : 'Claim Reward'}
        </button>
      </div>
    `).join('');
  } catch (err) {
    console.error('Rewards error:', err);
  }
}

async function claimReferral(referralId) {
  try {
    const res = await apiRequest('/api/rewards/referral/claim', 'POST', { referralId });
    showModal('Referral Claimed!', `Earned +${res.coinsGained} Coins and +${res.gemsGained} Gems!`);
    await loadUserData();
    await loadRewards();
  } catch (err) {
    showModal('Error', err.message);
  }
}

// --- ACHIEVEMENTS ---
async function loadAchievements() {
  try {
    const data = await apiRequest('/api/achievements');
    state.achievements = data.achievements;

    const grid = document.getElementById('achievements-grid');
    grid.innerHTML = state.achievements.map(a => `
      <div class="achievement-card">
        <span class="ach-icon">${a.icon}</span>
        <div style="flex:1;">
          <strong>${a.title}</strong>
          <p><small style="color:var(--text-muted)">${a.description}</small></p>
          <small>Progress: ${a.currentProgress} / ${a.requirement_value}</small>
        </div>
        <button class="btn-primary small" ${!a.isUnlocked || a.isClaimed ? 'disabled' : ''} onclick="claimAchievement(${a.id})">
          ${a.isClaimed ? 'Unlocked' : 'Claim'}
        </button>
      </div>
    `).join('');
  } catch (err) {
    console.error('Achievements error:', err);
  }
}

async function claimAchievement(achievementId) {
  try {
    const res = await apiRequest('/api/achievements/claim', 'POST', { achievementId });
    showModal('🏆 Achievement Unlocked!', `Claimed reward: +${res.rewardCoins} Coins | +${res.rewardGems} Gems!`);
    await loadUserData();
    await loadAchievements();
  } catch (err) {
    showModal('Error', err.message);
  }
}

// --- LEADERBOARD ---
async function loadLeaderboard() {
  try {
    const data = await apiRequest('/api/leaderboard');
    state.leaderboards = data;
    renderLeaderboardSubtab('collectors');
  } catch (err) {
    console.error('Leaderboard error:', err);
  }
}

function switchLbSubtab(subtab, btnElem) {
  document.querySelectorAll('#view-leaderboard .subtab-btn').forEach(b => b.classList.remove('active'));
  if (btnElem) btnElem.classList.add('active');
  renderLeaderboardSubtab(subtab);
}

function renderLeaderboardSubtab(type) {
  const list = document.getElementById('leaderboard-list');
  const data = state.leaderboards[type] || [];

  if (data.length === 0) {
    list.innerHTML = `<p style="text-align:center; color:var(--text-muted); padding:20px;">No entries found.</p>`;
    return;
  }

  list.innerHTML = data.map((item, index) => `
    <div class="lb-item">
      <span class="lb-rank">#${index + 1}</span>
      <div style="flex:1; margin-left:10px;">
        <strong>${item.first_name || item.username || 'User'}</strong>
      </div>
      <strong>${item.score} ${type === 'richest' ? '🪙' : type === 'collectors' ? '🎴' : 'Lvl'}</strong>
    </div>
  `).join('');
}

// --- ADMIN PANEL ---
async function loadAdminPanel() {
  try {
    const data = await apiRequest('/api/admin/overview');
    document.getElementById('adm-users').textContent = data.metrics.totalUsers;
    document.getElementById('adm-cards').textContent = data.metrics.totalCardsInDb;
    document.getElementById('adm-collected').textContent = data.metrics.totalCardsCollected;
  } catch (err) {
    showModal('Access Denied', err.message);
  }
}

async function handleAdminUserUpdate() {
  const targetUserId = parseInt(document.getElementById('adm-input-id').value);
  const coins = document.getElementById('adm-input-coins').value;
  const gems = document.getElementById('adm-input-gems').value;
  const level = document.getElementById('adm-input-level').value;
  const role = document.getElementById('adm-input-role').value;

  if (!targetUserId) {
    alert('Please enter a user ID');
    return;
  }

  try {
    const res = await apiRequest('/api/admin/user/update', 'POST', {
      targetUserId,
      coins: coins ? parseInt(coins) : undefined,
      gems: gems ? parseInt(gems) : undefined,
      level: level ? parseInt(level) : undefined,
      role
    });
    showModal('Admin Action', `User ${res.user.id} updated successfully.`);
    await loadAdminPanel();
  } catch (err) {
    showModal('Admin Error', err.message);
  }
}

async function handleAdminGrantCard() {
  const targetUserId = parseInt(document.getElementById('adm-grant-userid').value);
  const cardId = parseInt(document.getElementById('adm-grant-cardid').value);

  if (!targetUserId || !cardId) {
    alert('Please enter user ID and card ID');
    return;
  }

  try {
    await apiRequest('/api/admin/user/grant-card', 'POST', { targetUserId, cardId });
    showModal('Admin Action', `Granted card #${cardId} to user #${targetUserId}.`);
  } catch (err) {
    showModal('Admin Error', err.message);
  }
}

// --- EVENT LISTENERS & MODALS ---
function setupEventListeners() {
  document.getElementById('btn-catch-waifu')?.addEventListener('click', handleCatchWaifu);
  document.getElementById('btn-start-memory')?.addEventListener('click', startMemoryGame);
  document.getElementById('btn-claim-streak')?.addEventListener('click', claimStreak);
  document.getElementById('btn-select-fav')?.addEventListener('click', () => switchTab('collection'));
  document.getElementById('btn-adm-update-user')?.addEventListener('click', handleAdminUserUpdate);
  document.getElementById('btn-adm-grant-card')?.addEventListener('click', handleAdminGrantCard);

  document.getElementById('btn-copy-invite')?.addEventListener('click', () => {
    const linkInput = document.getElementById('invite-link-input');
    linkInput.select();
    document.execCommand('copy');
    tg.HapticFeedback.notificationOccurred('success');
    alert('Referral link copied to clipboard!');
  });
}

function showModal(title, bodyHtml) {
  document.getElementById('modal-body').innerHTML = `
    <h3 style="margin-bottom:12px; font-size:18px;">${title}</h3>
    <div>${bodyHtml}</div>
  `;
  document.getElementById('modal-overlay').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.add('hidden');
}
