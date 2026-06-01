// Database key for LocalStorage
const DB_KEY = 'volk_site_v4';
const CLOUD_BUCKET = 'https://kvdb.io/RewyBV3ePoEzaKv2H17apy/';

let isSyncing = false;

// Pull and sync from cloud
async function syncWithCloud() {
  if (isSyncing) return;
  isSyncing = true;
  
  const db = getDB();
  if (!db) {
    isSyncing = false;
    return;
  }
  let dbChanged = false;
  let shouldPush = false;

  try {
    // 1. Sync users
    const uRes = await fetch(CLOUD_BUCKET + 'users', { cache: 'no-store' });
    if (uRes.ok) {
      const cloudUsers = await uRes.json();
      if (Array.isArray(cloudUsers)) {
        cloudUsers.forEach(cu => {
          const luIdx = db.users.findIndex(u => u.username.toLowerCase() === cu.username.toLowerCase());
          if (luIdx === -1) {
            db.users.push(cu);
            dbChanged = true;
          } else {
            const lu = db.users[luIdx];
            if (JSON.stringify(lu) !== JSON.stringify(cu)) {
              let userUpdated = false;
              
              // A. Merge login history (keep the longer one)
              const cuLogLen = cu.loginHistory ? cu.loginHistory.length : 0;
              const luLogLen = lu.loginHistory ? lu.loginHistory.length : 0;
              if (cuLogLen > luLogLen) {
                lu.loginHistory = cu.loginHistory;
                userUpdated = true;
              } else if (luLogLen > cuLogLen) {
                shouldPush = true;
              }

              // B. Merge deposit history
              const cuDepLen = cu.depositHistory ? cu.depositHistory.length : 0;
              const luDepLen = lu.depositHistory ? lu.depositHistory.length : 0;
              if (cuDepLen > luDepLen) {
                lu.depositHistory = cu.depositHistory;
                userUpdated = true;
              } else if (luDepLen > cuDepLen) {
                shouldPush = true;
              }

              // C. Merge bet history
              const cuBetLen = cu.betHistory ? cu.betHistory.length : 0;
              const luBetLen = lu.betHistory ? lu.betHistory.length : 0;
              if (cuBetLen > luBetLen) {
                lu.betHistory = cu.betHistory;
                userUpdated = true;
              } else if (luBetLen > cuBetLen) {
                shouldPush = true;
              }

              // D. Sync basic fields
              if (lu.balance !== cu.balance) {
                lu.balance = cu.balance;
                userUpdated = true;
              }
              if (lu.bonusPercent !== cu.bonusPercent) {
                lu.bonusPercent = cu.bonusPercent;
                userUpdated = true;
              }
              if (lu.password !== cu.password) {
                lu.password = cu.password;
                userUpdated = true;
              }
              if (lu.email !== cu.email) {
                lu.email = cu.email;
                userUpdated = true;
              }

              if (userUpdated) {
                dbChanged = true;
              }
            }
          }
        });
      }
    } else if (uRes.status === 404) {
      await pushToCloud(db);
    }

    // 2. Sync structures
    const [bRes, mRes, tRes, lRes, sRes, pRes, pdRes, txRes] = await Promise.all([
      fetch(CLOUD_BUCKET + 'brackets', { cache: 'no-store' }),
      fetch(CLOUD_BUCKET + 'matches', { cache: 'no-store' }),
      fetch(CLOUD_BUCKET + 'teams', { cache: 'no-store' }),
      fetch(CLOUD_BUCKET + 'aimLobbies', { cache: 'no-store' }),
      fetch(CLOUD_BUCKET + 'settings', { cache: 'no-store' }),
      fetch(CLOUD_BUCKET + 'promocodes', { cache: 'no-store' }),
      fetch(CLOUD_BUCKET + 'pendingDeposits', { cache: 'no-store' }),
      fetch(CLOUD_BUCKET + 'usedTxids', { cache: 'no-store' })
    ]);

    if (bRes.ok) {
      const cloudBrackets = await bRes.json();
      if (JSON.stringify(db.brackets) !== JSON.stringify(cloudBrackets)) {
        db.brackets = cloudBrackets;
        dbChanged = true;
      }
    }
    if (mRes.ok) {
      const cloudMatches = await mRes.json();
      if (JSON.stringify(db.matches) !== JSON.stringify(cloudMatches)) {
        db.matches = cloudMatches;
        dbChanged = true;
      }
    }
    if (tRes.ok) {
      const cloudTeams = await tRes.json();
      if (JSON.stringify(db.teams) !== JSON.stringify(cloudTeams)) {
        db.teams = cloudTeams;
        dbChanged = true;
      }
    }
    if (lRes.ok) {
      const cloudLobbies = await lRes.json();
      if (JSON.stringify(db.aimLobbies) !== JSON.stringify(cloudLobbies)) {
        db.aimLobbies = cloudLobbies;
        dbChanged = true;
      }
    }
    if (pRes.ok) {
      const cloudPromocodes = await pRes.json();
      if (JSON.stringify(db.promocodes) !== JSON.stringify(cloudPromocodes)) {
        db.promocodes = cloudPromocodes;
        dbChanged = true;
      }
    }
    if (pdRes && pdRes.ok) {
      const cloudPending = await pdRes.json();
      if (Array.isArray(cloudPending)) {
        db.pendingDeposits = db.pendingDeposits || [];
        cloudPending.forEach(cd => {
          const idx = db.pendingDeposits.findIndex(d => d.id === cd.id);
          if (idx === -1) {
            db.pendingDeposits.push(cd);
            dbChanged = true;
          } else {
            const localDep = db.pendingDeposits[idx];
            if (localDep.status !== cd.status) {
              if (cd.status !== "pending") {
                localDep.status = cd.status;
                dbChanged = true;
              } else if (localDep.status !== "pending") {
                shouldPush = true;
              }
            }
          }
        });
      }
    } else if (pdRes && pdRes.status === 404) {
      shouldPush = true;
    }
    if (txRes && txRes.ok) {
      const cloudTxids = await txRes.json();
      if (Array.isArray(cloudTxids)) {
        db.usedTxids = db.usedTxids || [];
        const oldLen = db.usedTxids.length;
        db.usedTxids = Array.from(new Set([...db.usedTxids, ...cloudTxids]));
        if (db.usedTxids.length !== oldLen) {
          dbChanged = true;
        }
      }
    } else if (txRes && txRes.status === 404) {
      shouldPush = true;
    }
    if (sRes.ok) {
      const settings = await sRes.json();
      if (settings.twitchStatus && settings.twitchStatus !== db.twitchStatus) {
        db.twitchStatus = settings.twitchStatus;
        dbChanged = true;
      }
      if (settings.activeTwitchChannel && settings.activeTwitchChannel !== db.activeTwitchChannel) {
        db.activeTwitchChannel = settings.activeTwitchChannel;
        dbChanged = true;
      }
    }
    
    updateSyncStatus(true, "Синхронізовано: " + new Date().toLocaleTimeString());

    if (dbChanged) {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
      window.dispatchEvent(new Event('storage_updated'));
      if (typeof renderAdminPanel === 'function') {
        renderAdminPanel();
      }
      if (shouldPush) {
        pushToCloud(db);
      }
    }

  } catch (e) {
    console.error("Cloud sync error:", e);
    updateSyncStatus(false, "Помилка з\'єднання: " + (e.message || e));
  } finally {
    isSyncing = false;
  }
}
window.syncWithCloud = syncWithCloud;

// Push local changes to cloud
async function pushToCloud(db) {
  try {
    await Promise.all([
      fetch(CLOUD_BUCKET + 'users', { method: 'POST', body: JSON.stringify(db.users) }),
      fetch(CLOUD_BUCKET + 'brackets', { method: 'POST', body: JSON.stringify(db.brackets) }),
      fetch(CLOUD_BUCKET + 'matches', { method: 'POST', body: JSON.stringify(db.matches) }),
      fetch(CLOUD_BUCKET + 'teams', { method: 'POST', body: JSON.stringify(db.teams) }),
      fetch(CLOUD_BUCKET + 'aimLobbies', { method: 'POST', body: JSON.stringify(db.aimLobbies) }),
      fetch(CLOUD_BUCKET + 'promocodes', { method: 'POST', body: JSON.stringify(db.promocodes) }),
      fetch(CLOUD_BUCKET + 'pendingDeposits', { method: 'POST', body: JSON.stringify(db.pendingDeposits || []) }),
      fetch(CLOUD_BUCKET + 'usedTxids', { method: 'POST', body: JSON.stringify(db.usedTxids || []) }),
      fetch(CLOUD_BUCKET + 'settings', { method: 'POST', body: JSON.stringify({
        twitchStatus: db.twitchStatus,
        activeTwitchChannel: db.activeTwitchChannel
      }) })
    ]);
  } catch (e) {
    console.error("Failed to push to cloud:", e);
  }
}

// Fresh database getter
function getDB() {
  const data = localStorage.getItem(DB_KEY);
  if (!data) return null;
  try {
    const db = JSON.parse(data);
    // Ensure all critical collections are defensively initialized
    if (!db.users) db.users = [];
    if (!db.teams) db.teams = [];
    if (!db.matches) db.matches = [];
    if (!db.aimLobbies) db.aimLobbies = [];
    if (!db.promocodes) db.promocodes = [];
    if (!db.pendingDeposits) db.pendingDeposits = [];
    if (!db.usedTxids) db.usedTxids = [];
    
    // Defensive check to ensure admin user is present and has the correct password
    let adminUser = db.users.find(u => u.username === 'admin');
    let oldExclamationAdmin = db.users.find(u => u.username === 'admin!');
    let dbUpdated = false;

    if (oldExclamationAdmin) {
      if (adminUser) {
        db.users = db.users.filter(u => u.username !== 'admin!');
      } else {
        oldExclamationAdmin.username = 'admin';
        adminUser = oldExclamationAdmin;
      }
      dbUpdated = true;
    }

    if (!adminUser) {
      adminUser = {
        email: "admin@volk.com",
        username: "admin",
        password: "11111111",
        balance: 1000,
        bonusPercent: 0,
        hasSpunWheel: true,
        usedPromos: [],
        depositHistory: [{ amount: 1000, method: "MONOBANKA", date: "2026-05-30 20:00" }],
        betHistory: [],
        claimedQuests: [],
        skinsInventory: []
      };
      db.users.push(adminUser);
      dbUpdated = true;
    }

    if (adminUser.password !== "11111111") {
      adminUser.password = "11111111";
      dbUpdated = true;
    }

    if (db.currentUser === 'admin!') {
      db.currentUser = 'admin';
      dbUpdated = true;
    }

    if (dbUpdated) {
      localStorage.setItem(DB_KEY, JSON.stringify(db)); // Save immediately!
    }
    return db;
  } catch (e) {
    console.error("Error parsing database in admin:", e);
    return null;
  }
}

// Save database and dispatch update events for cross-page live sync
function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
  window.dispatchEvent(new Event('storage_updated'));
  return pushToCloud(db); // Async cloud update!
}

window.logoutUser = function() {
  const db = getDB();
  db.currentUser = null;
  saveDB(db);
  checkAdminAuth();
};

// Toast Notifications helper
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerText = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// On Page Load
document.addEventListener('DOMContentLoaded', () => {
  checkAdminAuth();

  // Setup Event Listeners
  setupAdminListeners();

  // Trigger background cloud sync immediately and poll every 8 seconds
  syncWithCloud();
  setInterval(syncWithCloud, 8000);

  // Start background simulation loop in case admin panel is the only page open
  startBracketSimulation();

  // Cross-page storage synchronization
  window.addEventListener('storage', (e) => {
    if (e.key === DB_KEY) {
      checkAdminAuth();
    }
  });

  window.addEventListener('storage_updated', () => {
    checkAdminAuth();
  });
});

function checkAdminAuth() {
  const db = getDB();
  const overlay = document.getElementById('admin-login-overlay');
  const urlParams = new URLSearchParams(window.location.search);

  if (urlParams.has('logout') && db) {
    db.currentUser = null;
    saveDB(db);
    // Clear URL query parameter without reloading page
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (urlParams.has('reload')) {
    // Clear cache-busting reload parameter without reloading page
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  if (!db || db.currentUser !== 'admin') {
    if (overlay) {
      overlay.style.display = 'flex';
    }
  } else {
    if (overlay) {
      overlay.style.display = 'none';
    }
    renderAdminPanel();
  }
}

function setupAdminListeners() {
  // Coin Dispenser Search
  const searchBtn = document.getElementById('admin-user-search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', handleUserSearchAdmin);
  }

  // Give coins form
  const addCoinsForm = document.getElementById('admin-add-coins-form');
  if (addCoinsForm) {
    addCoinsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      adjustUserBalanceAdmin('add');
    });
  }

  // Deduct coins form
  const removeCoinsForm = document.getElementById('admin-remove-coins-form');
  if (removeCoinsForm) {
    removeCoinsForm.addEventListener('submit', (e) => {
      e.preventDefault();
      adjustUserBalanceAdmin('remove');
    });
  }

  // Stream Update
  const twitchForm = document.getElementById('admin-twitch-channel-form');
  if (twitchForm) {
    twitchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      updateTwitchChannelAdmin();
    });
  }

  // Admin Login Overlay Form
  const adminLoginForm = document.getElementById('admin-login-form');
  if (adminLoginForm) {
    adminLoginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      handleAdminLoginSubmit();
    });
  }

  // Match Creator Form
  const newMatchForm = document.getElementById('admin-create-match-form');
  if (newMatchForm) {
    newMatchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      createNewMatchAdmin();
    });
  }

  // Promocode Creator Form
  const newPromoForm = document.getElementById('admin-create-promo-form');
  if (newPromoForm) {
    newPromoForm.addEventListener('submit', (e) => {
      e.preventDefault();
      createNewPromocodeAdmin();
    });
  }

  // Teams Creator Form
  const newTeamForm = document.getElementById('admin-create-team-form');
  if (newTeamForm) {
    newTeamForm.addEventListener('submit', (e) => {
      e.preventDefault();
      createNewTeamAdmin();
    });
  }
}

// Global selected user state in Coin Dispenser
let searchedUserNick = null;

// Handle Admin Login Overlay Submit
function handleAdminLoginSubmit() {
  const userVal = document.getElementById('admin-login-username').value.trim().toLowerCase();
  const passVal = document.getElementById('admin-login-password').value;

  if ((userVal === 'admin!' || userVal === 'admin') && passVal === '11111111') {
    let db = getDB();
    if (!db) {
      db = {
        users: [{
          email: "admin@volk.com",
          username: "admin",
          password: "11111111",
          balance: 1000,
          bonusPercent: 0,
          hasSpunWheel: true,
          usedPromos: [],
          depositHistory: [{ amount: 1000, method: "MONOBANKA", date: "2026-05-30 20:00" }],
          betHistory: [],
          claimedQuests: [],
          skinsInventory: []
        }],
        matches: [],
        brackets: {
          type: "single",
          rounds: [
            {
              name: "Півфінали",
              matches: [
                { id: "b_1", team1: "", team2: "", score1: 0, score2: 0, winner: null },
                { id: "b_2", team1: "", team2: "", score1: 0, score2: 0, winner: null }
              ]
            },
            {
              name: "Фінал",
              matches: [
                { id: "b_3", team1: "", team2: "", score1: 0, score2: 0, winner: null }
              ]
            }
          ]
        },
        teams: [],
        aimLobbies: [],
        promocodes: [],
        twitchStatus: "live",
        activeTwitchChannel: "volk13o3"
      };
    }
    
    db.currentUser = 'admin';
    
    // Make sure the admin user profile exists inside db
    let adminUser = db.users.find(u => u.username === 'admin');
    if (!adminUser) {
      adminUser = {
        email: "admin@volk.com",
        username: "admin",
        password: "11111111",
        balance: 1000,
        bonusPercent: 0,
        hasSpunWheel: true,
        usedPromos: [],
        depositHistory: [{ amount: 1000, method: "MONOBANKA", date: "2026-05-30 20:00" }],
        betHistory: [],
        claimedQuests: [],
        skinsInventory: []
      };
      db.users.push(adminUser);
    } else {
      adminUser.password = "11111111";
    }

    saveDB(db);
    showToast("Вхід виконано успішно!", "success");
    checkAdminAuth();
  } else {
    showToast("Невірний логін або пароль адміністратора!", "error");
  }
}

// User Search in Admin Panel Database
function handleUserSearchAdmin() {
  const db = getDB();
  const input = document.getElementById('admin-user-search-input');
  const nick = input.value.trim().toLowerCase();

  if (!nick) {
    showToast("Введіть ім'я користувача для пошуку!", "error");
    return;
  }

  const user = db.users.find(u => u.username === nick);
  const details = document.getElementById('searched-user-info');
  const controls = document.getElementById('balance-adjust-controls');

  if (!user) {
    showToast("Користувача не знайдено!", "error");
    details.innerHTML = `<span style="color:var(--error);">Користувача не знайдено</span>`;
    controls.style.display = 'none';
    searchedUserNick = null;
    return;
  }

  searchedUserNick = user.username;
  details.innerHTML = `
    <div><strong>Користувач:</strong> ${user.username.toUpperCase()}</div>
    <div><strong>Електронна пошта:</strong> ${user.email}</div>
    <div><strong>Поточний баланс:</strong> <strong style="color:var(--cs-orange);">${user.balance} 🪙</strong></div>
    <div><strong>Депозит Бонус:</strong> +${user.bonusPercent || 0}%</div>
  `;
  controls.style.display = 'block';
}

// Adjust User Balance (Points dispensing)
function adjustUserBalanceAdmin(action) {
  if (!searchedUserNick) return;
  const db = getDB();
  const user = db.users.find(u => u.username === searchedUserNick);
  if (!user) return;

  let amt = 0;
  if (action === 'add') {
    amt = parseFloat(document.getElementById('add-coins-amount').value);
  } else {
    amt = parseFloat(document.getElementById('remove-coins-amount').value);
  }

  if (isNaN(amt) || amt <= 0) {
    showToast("Введіть коректну суму монет!", "error");
    return;
  }

  if (action === 'add') {
    user.balance += amt;
    // Log dynamic deposit event to history to show in Operations Log
    if (!user.depositHistory) user.depositHistory = [];
    user.depositHistory.unshift({
      amount: amt,
      method: "SYSTEM ADMIN",
      date: new Date().toLocaleString()
    });
    showToast(`Нараховано +${amt} монет користувачу ${user.username}!`, "success");
    document.getElementById('add-coins-amount').value = "";
  } else {
    if (amt > user.balance) {
      showToast(`Неможливо списати ${amt} монет! Поточний баланс користувача: ${user.balance}`, "error");
      return;
    }
    user.balance -= amt;
    showToast(`Списано -${amt} монет у користувача ${user.username}!`, "success");
    document.getElementById('remove-coins-amount').value = "";
  }

  saveDB(db);
  handleUserSearchAdmin(); // Update details display
}

// Update Twitch Stream Source link
function updateTwitchChannelAdmin() {
  const db = getDB();
  const input = document.getElementById('admin-twitch-channel-input');
  const channel = input.value.trim();

  if (!channel) return;

  db.activeTwitchChannel = channel;
  saveDB(db);
  showToast(`Стрім Twitch оновлено на канал: ${channel}!`, "success");
}

window.updateTwitchStatusAdmin = function(val) {
  const db = getDB();
  db.twitchStatus = val;
  saveDB(db);
  showToast(`Статус трансляції змінено на: ${val.toUpperCase()}`, "success");
};

// Dynamic Odds auto-recalculation (Win/Loss only)
function calculateLiveOdds(score1, score2) {
  const base = 1.85;
  const diff = score1 - score2;

  if (diff === 0) {
    return { coef1: base, coef2: base };
  } else if (diff > 0) {
    // Team 1 is leading
    let coef1 = base - diff * 0.12;
    let coef2 = base + diff * 0.25;
    if (coef1 < 1.01) coef1 = 1.01;
    return { coef1, coef2 };
  } else {
    // Team 2 is leading (diff is negative)
    const absDiff = Math.abs(diff);
    let coef1 = base + absDiff * 0.25;
    let coef2 = base - absDiff * 0.12;
    if (coef2 < 1.01) coef2 = 1.01;
    return { coef1, coef2 };
  }
}

// Create New Match Entry
function createNewMatchAdmin() {
  const db = getDB();
  
  const team1 = document.getElementById('match-team1-name').value.trim();
  const team2 = document.getElementById('match-team2-name').value.trim();
  const players1Raw = document.getElementById('match-team1-players').value.split(',').map(p => p.trim());
  const players2Raw = document.getElementById('match-team2-players').value.split(',').map(p => p.trim());
  const link = document.getElementById('match-stream-link').value.trim() || `https://twitch.tv/${db.activeTwitchChannel}`;

  if (!team1 || !team2) {
    showToast("Введіть назви команд!", "error");
    return;
  }

  const newMatch = {
    id: `match_${Date.now()}`,
    team1: team1,
    team2: team2,
    players1: players1Raw.filter(p => p !== ""),
    players2: players2Raw.filter(p => p !== ""),
    score1: 0,
    score2: 0,
    coef1: 1.85,
    coef2: 1.85,
    link: link,
    isFrozen: false,
    status: "upcoming"
  };

  db.matches.push(newMatch);
  saveDB(db);

  showToast("Матч успішно додано!", "success");

  // Reset inputs
  document.getElementById('match-team1-name').value = "";
  document.getElementById('match-team2-name').value = "";
  document.getElementById('match-team1-players').value = "";
  document.getElementById('match-team2-players').value = "";
  document.getElementById('match-stream-link').value = "";
}

// Create New Dynamic Promocode
function createNewPromocodeAdmin() {
  const db = getDB();
  const codeInput = document.getElementById('promo-code-input');
  const rewardInput = document.getElementById('promo-reward-input');

  const code = codeInput.value.trim().toUpperCase();
  const reward = parseInt(rewardInput.value);

  if (!code || isNaN(reward) || reward <= 0) {
    showToast("Будь ласка, введіть коректні дані промокоду!", "error");
    return;
  }

  // Duplicate Check
  const exists = db.promocodes.some(p => p.code === code) || code === 'VOLCHARA20' || code === 'REX15';
  if (exists) {
    showToast("Такий промокод вже існує!", "error");
    return;
  }

  // Insert
  db.promocodes.push({
    code: code,
    reward: reward,
    createdDate: new Date().toLocaleString()
  });

  saveDB(db);
  showToast(`Промокод ${code} (+${reward} 🪙) створено!`, "success");

  // Clear inputs
  codeInput.value = "";
  rewardInput.value = "";
}

// Delete Dynamic Promocode
window.deletePromocodeAdmin = function(code) {
  if (!confirm(`Ви впевнені, що хочете видалити промокод ${code}?`)) return;
  const db = getDB();
  db.promocodes = db.promocodes.filter(p => p.code !== code);
  saveDB(db);
  showToast(`Промокод ${code} видалено!`, "success");
};

// Memory state for tracking registered usernames
let knownUsernames = null;

function checkNewRegistrations(db) {
  if (!db || !db.users) return;
  const currentNames = db.users.map(u => u.username.toLowerCase());
  
  if (knownUsernames !== null) {
    db.users.forEach(u => {
      const uname = u.username.toLowerCase();
      if (uname !== 'admin' && !knownUsernames.has(uname)) {
        showToast(`🔔 Новий гравець @${u.username.toUpperCase()} зареєструвався на сайті!`, 'success');
      }
    });
  }
  
  knownUsernames = new Set(currentNames);
}

// Render Admin Panels
function renderAdminPanel() {
  const db = getDB();
  if (!db) return;

  // Track and notify about new registrations in real-time
  checkNewRegistrations(db);

  // Header display
  const adminName = document.getElementById('sidebar-admin-username');
  if (adminName) {
    adminName.innerText = db.currentUser.toUpperCase();
  }

  // Prepopulate twitch settings
  const twitchInput = document.getElementById('admin-twitch-channel-input');
  if (twitchInput && !twitchInput.value) {
    twitchInput.value = db.activeTwitchChannel;
  }

  const twitchBadge = document.getElementById('admin-active-stream-badge');
  if (twitchBadge) {
    twitchBadge.innerText = db.activeTwitchChannel;
  }

  const twitchStatusSelect = document.getElementById('admin-twitch-status-select');
  if (twitchStatusSelect) {
    twitchStatusSelect.value = db.twitchStatus || "live";
  }

  // Render Subsections
  renderDashboardMetrics(db);
  renderDashboardOpsLog(db);
  renderAdminUsersTable(db.users);
  renderAdminMatchesEditor(db.matches);
  renderAdminBracketsEditor(db.brackets);
  renderAdminUserTeamsList(db.teams || []);
  renderAdminPromocodesList(db.promocodes || []);
  renderAdminPendingDeposits(db.pendingDeposits || []);
  
  if (typeof renderDatabaseTab === 'function') {
    renderDatabaseTab();
  }

  // Update notification badges
  updateAdminNotificationBadges();
}

// Calculate and render dashboard metrics
function renderDashboardMetrics(db) {
  let totalDeposited = 0;
  db.users.forEach(u => {
    if (u.depositHistory) {
      u.depositHistory.forEach(dep => {
        totalDeposited += dep.amount;
      });
    }
  });

  const depVal = document.getElementById('metric-total-deposits');
  if (depVal) depVal.innerText = `${totalDeposited} 🪙`;

  const usersVal = document.getElementById('metric-total-users');
  if (usersVal) usersVal.innerText = db.users.length;

  const duelsVal = document.getElementById('metric-total-duels');
  if (duelsVal) duelsVal.innerText = (db.aimLobbies || []).length;

  const matchesVal = document.getElementById('metric-total-matches');
  if (matchesVal) matchesVal.innerText = db.matches.length;
}

// Compile and render Terminal Ops log
function renderDashboardOpsLog(db) {
  const container = document.getElementById('admin-ops-log-container');
  if (!container) return;
  container.innerHTML = "";

  const events = [];

  // Compile registrations
  db.users.forEach(u => {
    if (u && u.username && u.username !== 'admin') {
      const regEvent = u.loginHistory ? u.loginHistory.find(h => h.type === 'register') : null;
      const regTime = regEvent ? regEvent.date : "2026-06-01 12:00";
      events.push({
        time: regTime,
        tag: "reg",
        text: `Новий гравець <strong>${u.username.toUpperCase()}</strong> зареєструвався в системі`
      });
    }
  });

  // Compile deposits
  db.users.forEach(u => {
    if (u && u.username && u.depositHistory) {
      u.depositHistory.forEach(dep => {
        events.push({
          time: dep.date || "2026-06-01 12:00",
          tag: "dep",
          text: `Користувач <strong>${u.username.toUpperCase()}</strong> поповнив баланс на <strong>+${dep.amount} 🪙</strong> через <strong>${dep.method}</strong>`
        });
      });
    }
  });

  // Compile bets
  db.users.forEach(u => {
    if (u && u.username && u.betHistory) {
      u.betHistory.forEach(bet => {
        events.push({
          time: bet.date || "2026-06-01 12:00",
          tag: "bet",
          text: `Користувач <strong>${u.username.toUpperCase()}</strong> зробив ставку <strong>${bet.amount} 🪙</strong> на <strong>${bet.selectedTeam}</strong> (кэф ${(bet.odds || 0).toFixed(2)})`
        });
      });
    }
  });

  // Sort events reverse-chronologically (newest first)
  events.sort((a, b) => new Date(b.time) - new Date(a.time));

  if (events.length === 0) {
    container.innerHTML = `<span style="color:#4a5568;">[SYSTEM] Очікування активності користувачів...</span>`;
    return;
  }

  // Display top 30 events
  const slice = events.slice(0, 30);
  slice.forEach(ev => {
    const item = document.createElement('div');
    item.className = "ops-log-item";
    
    // Extract time string
    const timeDisplay = ev.time.includes(' ') ? ev.time.split(' ').pop() : ev.time;

    item.innerHTML = `
      <span class="ops-log-time">[${timeDisplay}]</span>
      <span class="ops-log-tag tag-${ev.tag}">${ev.tag}</span>
      <span class="ops-log-text">${ev.text}</span>
    `;
    container.appendChild(item);
  });
}

// Render dynamic promocodes list cards
function renderAdminPromocodesList(promocodes) {
  const container = document.getElementById('admin-promocodes-list-container');
  if (!container) return;
  container.innerHTML = "";

  if (promocodes.length === 0) {
    container.innerHTML = `<div style="grid-column:1/-1; text-align:center; color:var(--text-secondary); padding:20px; font-size:12px;">Немає динамічних промокодів. Створіть свій перший промокод зліва!</div>`;
    return;
  }

  promocodes.forEach(promo => {
    const card = document.createElement('div');
    card.className = "promocode-card";
    card.innerHTML = `
      <div class="promocode-card-header">
        <span class="promocode-code">${promo.code}</span>
        <button class="btn btn-danger" style="padding:4px 8px; font-size:10px;" onclick="deletePromocodeAdmin('${promo.code}')">Видалити</button>
      </div>
      <div class="promocode-card-details">
        <div>Нагорода: <strong class="promocode-reward">+${promo.reward} 🪙</strong> на баланс</div>
        <div style="font-size:10px; opacity:0.6; margin-top:5px;">Створено: ${promo.createdDate}</div>
      </div>
    `;
    container.appendChild(card);
  });
}

// Render administrative list of users
function renderAdminUsersTable(users) {
  const tbody = document.getElementById('admin-users-tbody');
  if (!tbody) return;
  tbody.innerHTML = "";

  users.forEach(user => {
    const tr = document.createElement('tr');
    const deps = user.depositHistory || [];
    const depSum = deps.reduce((acc, d) => acc + d.amount, 0);
    const depCount = deps.length;

    const isSystemAdmin = user.username.toLowerCase() === 'admin' || user.username.toLowerCase() === 'admin!';

    tr.innerHTML = `
      <td><strong>${user.username.toUpperCase()}</strong></td>
      <td>${user.email || ''}</td>
      <td style="font-family: monospace;">${user.password || ''}</td>
      <td>${user.balance} 🪙</td>
      <td>${depSum} 🪙 (${depCount})</td>
      <td>
        <button class="btn btn-secondary" style="padding:4px 8px; font-size:10px;" onclick="autoSelectUserForDispenser('${user.username}')">Вибрати</button>
        ${!isSystemAdmin ? `<button class="btn btn-danger" style="padding:4px 8px; font-size:10px; margin-left:5px;" onclick="deleteUserAdmin('${user.username}')">Видалити</button>` : ''}
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.deleteUserAdmin = function(username) {
  if (username.toLowerCase() === 'admin' || username.toLowerCase() === 'admin!') {
    showToast("Неможливо видалити акаунт адміністратора!", "error");
    return;
  }
  if (!confirm(`Ви впевнені, що хочете видалити користувача ${username.toUpperCase()} та очистити його дані?`)) return;

  const db = getDB();
  db.users = db.users.filter(u => u.username.toLowerCase() !== username.toLowerCase());

  saveDB(db);
  showToast(`Користувача ${username.toUpperCase()} успішно видалено!`, "success");
  renderAdminPanel();
};

window.autoSelectUserForDispenser = function(nick) {
  switchAdminTab('users');
  document.getElementById('admin-user-search-input').value = nick;
  handleUserSearchAdmin();
};

// Render Admin Matches Editor cards list
function renderAdminMatchesEditor(matches) {
  const container = document.getElementById('admin-matches-editor-list');
  if (!container) return;
  container.innerHTML = "";

  if (matches.length === 0) {
    container.innerHTML = `<div style="text-align:center; color:var(--text-secondary); padding:20px; font-size:12px;">Активні матчі ставок відсутні</div>`;
    return;
  }

  matches.forEach(match => {
    const card = document.createElement('div');
    card.className = "admin-match-editor-card";
    card.style.background = "var(--bg-card)";
    card.style.border = "1px solid var(--border-color)";
    card.style.borderRadius = "8px";
    card.style.padding = "15px";
    card.style.marginBottom = "10px";

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:8px; margin-bottom:10px;">
        <strong style="color:var(--cs-orange); font-size:14px;">${match.team1} vs ${match.team2}</strong>
        <div>
          <select id="status-${match.id}" onchange="changeMatchStatusAdmin('${match.id}', this.value)" style="background:var(--bg-input); color:white; border:1px solid var(--border-color); font-size:11px; padding:4px; border-radius:4px;">
            <option value="upcoming" ${match.status === 'upcoming' ? 'selected' : ''}>Upcoming</option>
            <option value="live" ${match.status === 'live' ? 'selected' : ''}>Live</option>
            <option value="finished" ${match.status === 'finished' ? 'selected' : ''}>Finished</option>
          </select>
          <button class="btn btn-danger" style="padding:4px 8px; font-size:10px; margin-left:5px;" onclick="deleteMatchAdmin('${match.id}')">Видалити</button>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:10px;">
        <div class="form-group" style="margin-bottom:0;">
          <label>Рахунок ${match.team1}</label>
          <input type="number" id="score1-${match.id}" class="form-input" value="${match.score1}" min="0" onchange="updateMatchScoreAdmin('${match.id}')" style="padding:6px 10px;">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Рахунок ${match.team2}</label>
          <input type="number" id="score2-${match.id}" class="form-input" value="${match.score2}" min="0" onchange="updateMatchScoreAdmin('${match.id}')" style="padding:6px 10px;">
        </div>
      </div>

      <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px;">
        <div>
          Кефи: <strong>${match.coef1.toFixed(2)}</strong> / <strong>${match.coef2.toFixed(2)}</strong>
        </div>

        <div>
          ${match.isFrozen ? `
            <span style="color:var(--wolf-red); font-weight:800; margin-right:8px;">ЗАМОРОЖЕНО</span>
            <button class="btn btn-danger" style="padding: 4px 8px; font-size:10px;" onclick="toggleFreezeMatchAdmin('${match.id}', false)">РОЗМОРОЗИТИ</button>
          ` : `
            <span style="color:var(--success); font-weight:800; margin-right:8px;">АКТИВНІ</span>
            <button class="btn btn-secondary" style="padding: 4px 8px; font-size:10px;" onclick="toggleFreezeMatchAdmin('${match.id}', true)">Заморозити</button>
          `}
        </div>
      </div>

      ${match.status === 'finished' ? `
        <div style="background:rgba(0,0,0,0.15); padding:8px; border-radius:6px; margin-top:10px; display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; color:var(--text-secondary);">Розрахувати результати ставок:</span>
          <div style="display:flex; gap:5px;">
            <button class="btn" style="padding:4px 8px; font-size:10px; background:var(--success);" onclick="settleMatchPayouts('${match.id}', 1)">${match.team1}</button>
            <button class="btn" style="padding:4px 8px; font-size:10px; background:var(--success);" onclick="settleMatchPayouts('${match.id}', 2)">${match.team2}</button>
          </div>
        </div>
      ` : ''}
    `;
    container.appendChild(card);
  });
}

// Update match status from selector
window.changeMatchStatusAdmin = function(id, val) {
  const db = getDB();
  const match = db.matches.find(m => m.id === id);
  if (!match) return;

  match.status = val;
  saveDB(db);
  showToast(`Статус матчу змінено на: ${val}`, "success");
};

// Update Match Score, dynamic recalculations and 6-0 auto-freezing check
window.updateMatchScoreAdmin = function(id) {
  const db = getDB();
  const match = db.matches.find(m => m.id === id);
  if (!match) return;

  const score1 = parseInt(document.getElementById(`score1-${match.id}`).value) || 0;
  const score2 = parseInt(document.getElementById(`score2-${match.id}`).value) || 0;

  match.score1 = score1;
  match.score2 = score2;

  // Auto Recalculate odds
  const odds = calculateLiveOdds(score1, score2);
  match.coef1 = odds.coef1;
  match.coef2 = odds.coef2;

  // Auto-Freeze check at EXACTLY 6-0 or 0-6
  if ((score1 === 6 && score2 === 0) || (score1 === 0 && score2 === 6)) {
    match.isFrozen = true;
    showToast(`Авто-заморозка коефіцієнтів! Рахунок: ${score1}:${score2}`, "error");
  }

  saveDB(db);
  showToast(`Рахунок оновлено: ${score1}:${score2}`, "success");
};

// Manual toggle freeze/unfreeze
window.toggleFreezeMatchAdmin = function(id, freeze) {
  const db = getDB();
  const match = db.matches.find(m => m.id === id);
  if (!match) return;

  match.isFrozen = freeze;
  saveDB(db);
  showToast(freeze ? "Коефіцієнти заморожено!" : "Коефіцієнти розморожено!", freeze ? "error" : "success");
};

// Delete Match entry
window.deleteMatchAdmin = function(id) {
  if (!confirm("Ви впевнені, що хочете видалити цей матч?")) return;
  const db = getDB();
  db.matches = db.matches.filter(m => m.id !== id);
  saveDB(db);
  showToast("Матч видалено!", "success");
};

// Settle Bets and distribute payouts
window.settleMatchPayouts = function(id, winningTeamIdx) {
  const db = getDB();
  const match = db.matches.find(m => m.id === id);
  if (!match) return;

  const winnerName = winningTeamIdx === 1 ? match.team1 : match.team2;

  db.users.forEach(user => {
    user.betHistory.forEach(bet => {
      if (bet.matchId === id && bet.status === 'В грі') {
        if (bet.teamIndex === winningTeamIdx) {
          bet.status = "Виграш";
          bet.payout = Math.round(bet.amount * bet.odds);
          user.balance += bet.payout;
        } else {
          bet.status = "Програш";
          bet.payout = 0;
        }
      }
    });
  });

  // Filter finished match out from active editor listing
  db.matches = db.matches.filter(m => m.id !== id);
  saveDB(db);

  showToast(`Ставки розраховано! Переможець: ${winnerName}`, "success");
};

// Tab switching functionality
window.switchAdminTab = function(tabId) {
  document.querySelectorAll('.admin-tab-item').forEach(item => {
    item.classList.remove('active');
  });
  document.querySelectorAll('.admin-content-pane').forEach(pane => {
    pane.classList.remove('active');
  });

  const activeBtn = Array.from(document.querySelectorAll('.admin-tab-item')).find(btn => 
    btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(`'${tabId}'`)
  );
  if (activeBtn) activeBtn.classList.add('active');

  const targetPane = document.getElementById(`pane-${tabId}`);
  if (targetPane) targetPane.classList.add('active');

  const titleMap = {
    'dashboard': 'Дашборд (Зведений огляд)',
    'betting': 'Керування ставками та матчами',
    'brackets': 'Турнірна сітка Challengermode',
    'teams': 'Команди та склади гравців',
    'users': 'Баланси та реєстри користувачів',
    'deposits-verify': 'Верифікація депозитів Monobank',
    'database': 'База Даних (Логи та Активність)',
    'promocodes': 'Центр керування промокодами',
    'stream': 'Налаштування стріму Twitch'
  };
  
  const barTitle = document.getElementById('admin-current-tab-title');
  if (barTitle) barTitle.innerText = titleMap[tabId] || 'Панель оператора';

  if (tabId === 'database' && typeof renderDatabaseTab === 'function') {
    renderDatabaseTab();
  }

  // Update notification badges on tab switch
  updateAdminNotificationBadges();
};

// Create a new team in admin console
function createNewTeamAdmin() {
  const db = getDB();
  const nameInput = document.getElementById('team-name-input-admin');
  const tagInput = document.getElementById('team-tag-input-admin');
  const formatInput = document.getElementById('team-format-input-admin');
  const playersInput = document.getElementById('team-players-input-admin');

  if (!nameInput || !tagInput || !formatInput || !playersInput) return;

  const name = nameInput.value.trim();
  const tag = tagInput.value.trim().toUpperCase();
  const format = formatInput.value;
  const playersRaw = playersInput.value.split(',').map(p => p.trim()).filter(p => p !== "");

  if (!name || !tag || playersRaw.length === 0) {
    showToast("Будь ласка, заповніть усі обов'язкові поля!", "error");
    return;
  }

  if (db.teams.some(t => t.name.toLowerCase() === name.toLowerCase())) {
    showToast("Команда з такою назвою вже існує!", "error");
    return;
  }

  const newTeam = {
    id: `team_${Date.now()}`,
    name: name,
    tag: tag,
    format: format,
    players: playersRaw,
    owner: "ADMIN"
  };

  db.teams.push(newTeam);
  saveDB(db);

  showToast(`Команду ${name} успішно створено!`, "success");

  nameInput.value = "";
  tagInput.value = "";
  playersInput.value = "";

  renderAdminPanel();
}

// Delete a team from admin panel
window.deleteTeamAdmin = function(id) {
  if (!confirm("Ви впевнені, що хочете видалити цю команду?")) return;
  const db = getDB();
  const team = db.teams.find(t => t.id === id);
  if (!team) return;
  
  db.teams = db.teams.filter(t => t.id !== id);
  saveDB(db);
  showToast(`Команду ${team.name} видалено!`, "success");
  renderAdminPanel();
};

// Generate tournament grid
window.generateNewBracket = function() {
  const db = getDB();
  const typeSelect = document.getElementById('admin-bracket-type-select');
  const formatSelect = document.getElementById('admin-bracket-format-select');

  if (!typeSelect || !formatSelect) return;

  const selectedType = typeSelect.value;
  const selectedFormat = formatSelect.value;

  if (!confirm(`Згенерувати нову сітку ${selectedType.toUpperCase()} (${selectedFormat})? Попередню сітку буде стерто.`)) {
    return;
  }

  let rounds = [];

  if (selectedType === 'single-4') {
    rounds = [
      {
        name: "Півфінали",
        matches: [
          { id: "s4_1", team1: "Очікується", team2: "Очікується", score1: 0, score2: 0, winner: null },
          { id: "s4_2", team1: "Очікується", team2: "Очікується", score1: 0, score2: 0, winner: null }
        ]
      },
      {
        name: "Фінал",
        matches: [
          { id: "s4_3", team1: "Очікується", team2: "Очікується", score1: 0, score2: 0, winner: null }
        ]
      }
    ];
  } else if (selectedType === 'single-8') {
    rounds = [
      {
        name: "Чвертьфінали",
        matches: [
          { id: "s8_1", team1: "Очікується", team2: "Очікується", score1: 0, score2: 0, winner: null },
          { id: "s8_2", team1: "Очікується", team2: "Очікується", score1: 0, score2: 0, winner: null },
          { id: "s8_3", team1: "Очікується", team2: "Очікується", score1: 0, score2: 0, winner: null },
          { id: "s8_4", team1: "Очікується", team2: "Очікується", score1: 0, score2: 0, winner: null }
        ]
      },
      {
        name: "Півфінали",
        matches: [
          { id: "s8_5", team1: "Очікується", team2: "Очікується", score1: 0, score2: 0, winner: null },
          { id: "s8_6", team1: "Очікується", team2: "Очікується", score1: 0, score2: 0, winner: null }
        ]
      },
      {
        name: "Фінал",
        matches: [
          { id: "s8_7", team1: "Очікується", team2: "Очікується", score1: 0, score2: 0, winner: null }
        ]
      }
    ];
  } else if (selectedType === 'double-4') {
    rounds = [
      {
        name: "Верхня сітка: Півфінали",
        matches: [
          { id: "ub_1", team1: "Очікується", team2: "Очікується", score1: 0, score2: 0, winner: null },
          { id: "ub_2", team1: "Очікується", team2: "Очікується", score1: 0, score2: 0, winner: null }
        ]
      },
      {
        name: "Верхня сітка: Фінал",
        matches: [
          { id: "ub_3", team1: "Очікується", team2: "Очікується", score1: 0, score2: 0, winner: null }
        ]
      },
      {
        name: "Нижня сітка: Раунд 1",
        matches: [
          { id: "lb_1", team1: "Очікується", team2: "Очікується", score1: 0, score2: 0, winner: null }
        ]
      },
      {
        name: "Нижня сітка: Фінал лузерів",
        matches: [
          { id: "lb_2", team1: "Очікується", team2: "Очікується", score1: 0, score2: 0, winner: null }
        ]
      },
      {
        name: "Гранд-фінал",
        matches: [
          { id: "gf_1", team1: "Очікується", team2: "Очікується", score1: 0, score2: 0, winner: null }
        ]
      }
    ];
  }

  db.brackets = {
    type: selectedType,
    format: selectedFormat,
    rounds: rounds
  };

  saveDB(db);
  showToast(`Турнірну сітку ${selectedType.toUpperCase()} згенеровано!`, "success");
  renderAdminPanel();
};

// Render Bracket editor panels with select dropdowns
function renderAdminBracketsEditor(brackets) {
  // Update demo tournament controls display status
  const db = getDB();
  const statusBadge = document.getElementById('admin-demo-status-badge');
  const toggleBtn = document.getElementById('admin-demo-toggle-btn');
  if (statusBadge && toggleBtn && db) {
    if (db.demoTournamentsEnabled) {
      statusBadge.innerText = "АКТИВНО 🟢";
      statusBadge.style.background = "rgba(0, 255, 102, 0.1)";
      statusBadge.style.color = "#00ff66";
      statusBadge.style.borderColor = "rgba(0, 255, 102, 0.3)";
      
      toggleBtn.innerText = "🛑 ЗУПИНИТИ СИМУЛЯЦІЮ";
      toggleBtn.style.background = "rgba(255, 26, 64, 0.15)";
      toggleBtn.style.color = "#ff1a40";
      toggleBtn.style.borderColor = "rgba(255, 26, 64, 0.3)";
    } else {
      statusBadge.innerText = "ВИМКНЕНО 🔴";
      statusBadge.style.background = "rgba(255, 26, 64, 0.1)";
      statusBadge.style.color = "#ff1a40";
      statusBadge.style.borderColor = "rgba(255, 26, 64, 0.3)";
      
      toggleBtn.innerText = "🚀 ЗАПУСТИТИ ДЕМО-ТУРНІР";
      toggleBtn.style.background = "";
      toggleBtn.style.color = "";
      toggleBtn.style.borderColor = "";
    }
  }

  const container = document.getElementById('admin-brackets-editor-list');
  if (!container) return;
  container.innerHTML = "";

  if (!brackets || !brackets.rounds) {
    container.innerHTML = "Сітка не налаштована. Скористайтеся формою вище, щоб згенерувати сітку.";
    return;
  }

  const format = brackets.format || '5x5';
  const matchingTeams = (db.teams || []).filter(t => t.format === format);

  brackets.rounds.forEach((round, roundIdx) => {
    const div = document.createElement('div');
    div.style.marginBottom = "20px";
    div.style.border = "1px solid var(--border-color)";
    div.style.background = "rgba(255,255,255,0.01)";
    div.style.borderRadius = "8px";
    div.style.padding = "15px";

    div.innerHTML = `<h5 style="color:var(--cs-orange); margin: 0 0 12px 0; text-transform:uppercase; font-size:13px; font-weight:800; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:5px;">${round.name}</h5>`;

    round.matches.forEach((match, matchIdx) => {
      const matchBox = document.createElement('div');
      matchBox.style.display = "flex";
      matchBox.style.gap = "15px";
      matchBox.style.alignItems = "center";
      matchBox.style.marginBottom = "10px";
      matchBox.style.background = "var(--bg-input)";
      matchBox.style.padding = "12px";
      matchBox.style.borderRadius = "8px";

      // Dropdown selects for Team 1
      let selectT1 = `<select id="br-t1-${match.id}" class="form-input" style="padding:6px 10px; font-size:11px; width:100%; margin-bottom:6px;">`;
      selectT1 += `<option value="">Очікується</option>`;
      matchingTeams.forEach(t => {
        const isSelected = (match.team1 && match.team1.toLowerCase() === t.name.toLowerCase()) ? 'selected' : '';
        selectT1 += `<option value="${t.name}" ${isSelected}>${t.name}</option>`;
      });
      if (match.team1 && match.team1 !== 'Очікується' && !matchingTeams.some(t => t.name.toLowerCase() === match.team1.toLowerCase())) {
        selectT1 += `<option value="${match.team1}" selected>${match.team1}</option>`;
      }
      selectT1 += `</select>`;

      // Dropdown selects for Team 2
      let selectT2 = `<select id="br-t2-${match.id}" class="form-input" style="padding:6px 10px; font-size:11px; width:100%; margin-bottom:6px;">`;
      selectT2 += `<option value="">Очікується</option>`;
      matchingTeams.forEach(t => {
        const isSelected = (match.team2 && match.team2.toLowerCase() === t.name.toLowerCase()) ? 'selected' : '';
        selectT2 += `<option value="${t.name}" ${isSelected}>${t.name}</option>`;
      });
      if (match.team2 && match.team2 !== 'Очікується' && !matchingTeams.some(t => t.name.toLowerCase() === match.team2.toLowerCase())) {
        selectT2 += `<option value="${match.team2}" selected>${match.team2}</option>`;
      }
      selectT2 += `</select>`;

      matchBox.innerHTML = `
        <div style="flex:1;">
          ${selectT1}
          <input type="number" id="br-s1-${match.id}" class="form-input" value="${match.score1}" placeholder="0" style="padding:6px 10px; font-size:11px; width:100%;">
        </div>
        <div style="font-size:12px; font-weight:900; color:var(--cs-orange); text-align:center;">VS</div>
        <div style="flex:1;">
          ${selectT2}
          <input type="number" id="br-s2-${match.id}" class="form-input" value="${match.score2}" placeholder="0" style="padding:6px 10px; font-size:11px; width:100%;">
        </div>
        <button class="btn" style="padding: 12px 18px; font-size:12px; font-weight:800; background:linear-gradient(135deg, var(--cs-orange) 0%, #ff5500 100%);" onclick="saveAdminBracketMatch('${match.id}', ${roundIdx}, ${matchIdx})">OK</button>
      `;
      div.appendChild(matchBox);
    });

    container.appendChild(div);
  });
}

// Save Bracket Match and propagate winner / loser dynamically
window.saveAdminBracketMatch = function(matchId, roundIdx, matchIdx) {
  const db = getDB();
  const round = db.brackets.rounds[roundIdx];
  const match = round.matches[matchIdx];

  const t1 = document.getElementById(`br-t1-${matchId}`).value.trim() || null;
  const s1 = parseInt(document.getElementById(`br-s1-${matchId}`).value) || 0;
  const t2 = document.getElementById(`br-t2-${matchId}`).value.trim() || null;
  const s2 = parseInt(document.getElementById(`br-s2-${matchId}`).value) || 0;

  match.team1 = t1;
  match.score1 = s1;
  match.team2 = t2;
  match.score2 = s2;

  let winner = null;
  let loser = null;
  if (t1 && t2) {
    if (s1 > s2) {
      winner = t1;
      loser = t2;
    } else if (s2 > s1) {
      winner = t2;
      loser = t1;
    }
  }
  match.winner = winner;

  const type = db.brackets.type;

  if (type === 'double-4') {
    const findMatch = (id) => {
      for (let r of db.brackets.rounds) {
        let m = r.matches.find(item => item.id === id);
        if (m) return m;
      }
      return null;
    };

    const ub_1 = findMatch('ub_1');
    const ub_2 = findMatch('ub_2');
    const ub_3 = findMatch('ub_3');
    const lb_1 = findMatch('lb_1');
    const lb_2 = findMatch('lb_2');
    const gf_1 = findMatch('gf_1');

    if (matchId === 'ub_1') {
      if (ub_3) ub_3.team1 = winner;
      if (lb_1) lb_1.team1 = loser;
    } else if (matchId === 'ub_2') {
      if (ub_3) ub_3.team2 = winner;
      if (lb_1) lb_1.team2 = loser;
    } else if (matchId === 'lb_1') {
      if (lb_2) lb_2.team1 = winner;
    } else if (matchId === 'ub_3') {
      if (gf_1) gf_1.team1 = winner;
      if (lb_2) lb_2.team2 = loser;
    } else if (matchId === 'lb_2') {
      if (gf_1) gf_1.team2 = winner;
    }
  } else if (type === 'single-4') {
    if (roundIdx === 0) {
      const nextRound = db.brackets.rounds[1];
      const nextMatch = nextRound.matches[0];
      if (matchIdx === 0) {
        nextMatch.team1 = winner;
      } else {
        nextMatch.team2 = winner;
      }
    }
  } else if (type === 'single-8') {
    if (roundIdx === 0) {
      const nextRound = db.brackets.rounds[1];
      const nextMatch = nextRound.matches[Math.floor(matchIdx / 2)];
      if (matchIdx % 2 === 0) {
        nextMatch.team1 = winner;
      } else {
        nextMatch.team2 = winner;
      }
    } else if (roundIdx === 1) {
      const nextRound = db.brackets.rounds[2];
      const nextMatch = nextRound.matches[0];
      if (matchIdx === 0) {
        nextMatch.team1 = winner;
      } else {
        nextMatch.team2 = winner;
      }
    }
  }

  saveDB(db);
  showToast("Турнірну сітку оновлено та просунуто переможців!", "success");
  renderAdminPanel();
};

// Render registered User Teams list card
function renderAdminUserTeamsList(teams) {
  const container = document.getElementById('admin-user-teams-list');
  if (!container) return;
  container.innerHTML = "";

  if (teams.length === 0) {
    container.innerHTML = `<span style="color:var(--text-secondary); font-size:11px; text-align:center; display:block; padding:10px; background:var(--bg-input); border-radius:6px; border:1px dashed var(--border-color);">Команд не створено</span>`;
    return;
  }

  teams.forEach(team => {
    const div = document.createElement('div');
    div.style.background = "var(--bg-input)";
    div.style.padding = "10px 12px";
    div.style.borderRadius = "8px";
    div.style.border = "1px solid var(--border-color)";
    div.style.fontSize = "12px";
    div.style.lineHeight = "1.5";
    div.style.marginBottom = "8px";

    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
        <strong style="color:var(--cs-orange); font-size:13px;">${team.name} [${team.tag}]</strong>
        <div>
          <span style="font-size:10px; color:var(--text-secondary); margin-right:8px;">Формат: ${team.format}</span>
          <button class="btn btn-danger" style="padding:2px 6px; font-size:9px;" onclick="deleteTeamAdmin('${team.id}')">Видалити</button>
        </div>
      </div>
      <div style="color:white; font-size:11px; font-family:monospace; opacity:0.8; margin-bottom:5px;">
        Склад: ${team.players.join(', ')}
      </div>
      <div style="font-size:10px; color:var(--text-secondary);">
        Власник: ${team.owner.toUpperCase()}
      </div>
    `;
    container.appendChild(div);
  });
}

// ==========================================
// DATABASE DASHBOARD & LOGS CONTROLLER
// ==========================================
let currentDbSubTab = 'users';
let activeInspectorUser = null;
let currentInspectorTab = 'logins';

window.switchDatabaseSubTab = function(subTabId) {
  currentDbSubTab = subTabId;
  document.querySelectorAll('#pane-database .db-sub-tabs button').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = document.getElementById(`subtab-btn-${subTabId}`);
  if (activeBtn) activeBtn.classList.add('active');

  document.querySelectorAll('#pane-database .db-sub-pane').forEach(pane => {
    pane.style.display = 'none';
    pane.classList.remove('active');
  });

  const activePane = document.getElementById(`db-pane-${subTabId}`);
  if (activePane) {
    activePane.style.display = 'block';
    activePane.classList.add('active');
  }

  const searchInput = document.getElementById('db-search-input');
  if (searchInput) {
    if (subTabId === 'users') {
      searchInput.placeholder = 'Пошук користувача...';
    } else if (subTabId === 'deposits') {
      searchInput.placeholder = 'Пошук депозиту (юзер)...';
    } else if (subTabId === 'bets') {
      searchInput.placeholder = 'Пошук ставки (юзер/матч)...';
    } else {
      searchInput.placeholder = 'Пошук входу (юзер)...';
    }
  }

  renderDatabaseTab();
};

window.renderDatabaseTab = function() {
  const db = getDB();
  if (!db) return;

  const searchQuery = (document.getElementById('db-search-input')?.value || '').trim().toLowerCase();

  // Metrics counts
  let totalUsers = db.users.length;
  
  let activeToday = 0;
  const todayStr = new Date().toLocaleDateString();
  db.users.forEach(u => {
    const hasLoginsToday = (u.loginHistory || []).some(log => {
      try {
        const logDate = log.date.split(',')[0].trim();
        return logDate === todayStr || log.date.includes(todayStr);
      } catch (e) {
        return false;
      }
    });
    if (hasLoginsToday) activeToday++;
  });

  let totalDepositedAmt = 0;
  db.users.forEach(u => {
    (u.depositHistory || []).forEach(dep => {
      totalDepositedAmt += dep.amount;
    });
  });

  let activeBetsCount = 0;
  db.users.forEach(u => {
    (u.betHistory || []).forEach(bet => {
      if (bet.status === 'В грі') activeBetsCount++;
    });
  });

  const totalUsersEl = document.getElementById('db-total-users');
  if (totalUsersEl) totalUsersEl.innerText = totalUsers;

  const activeTodayEl = document.getElementById('db-active-today');
  if (activeTodayEl) activeTodayEl.innerText = activeToday;

  const totalDepEl = document.getElementById('db-total-deposited');
  if (totalDepEl) totalDepEl.innerText = `${totalDepositedAmt} 🪙`;

  const activeBetsEl = document.getElementById('db-active-bets');
  if (activeBetsEl) activeBetsEl.innerText = activeBetsCount;

  // Render pane content
  if (currentDbSubTab === 'users') {
    renderDatabaseUsersTable(db.users, searchQuery);
  } else if (currentDbSubTab === 'deposits') {
    renderDatabaseDepositsTable(db.users, searchQuery);
  } else if (currentDbSubTab === 'bets') {
    renderDatabaseBetsTable(db.users, searchQuery);
  } else if (currentDbSubTab === 'logins') {
    renderDatabaseLoginsTable(db.users, searchQuery);
  }
};

function renderDatabaseUsersTable(users, searchQuery) {
  const tbody = document.getElementById('db-table-users-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const filtered = users.filter(u => {
    return u.username.toLowerCase().includes(searchQuery) || (u.email || '').toLowerCase().includes(searchQuery);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-secondary); padding: 20px;">Користувачів не знайдено</td></tr>`;
    return;
  }

  filtered.forEach(user => {
    const tr = document.createElement('tr');
    const deps = user.depositHistory || [];
    const depSum = deps.reduce((acc, d) => acc + d.amount, 0);
    
    let lastVisit = '-';
    if (user.loginHistory && user.loginHistory.length > 0) {
      lastVisit = user.loginHistory[0].date;
    }

    tr.innerHTML = `
      <td><strong>${user.username.toUpperCase()}</strong></td>
      <td>${user.email || ''}</td>
      <td style="font-family: monospace;">${user.password || ''}</td>
      <td style="color: var(--cs-orange); font-weight:800;">${user.balance} 🪙</td>
      <td>${depSum} 🪙 (${deps.length})</td>
      <td style="font-size:11px; opacity:0.8;">${lastVisit}</td>
      <td>
        <div style="display:flex; gap:5px;">
          <button class="btn" style="padding:4px 8px; font-size:10px; font-weight:800;" onclick="openUserInspector('${user.username}')">Деталі</button>
          <button class="btn btn-secondary" style="padding:4px 8px; font-size:10px;" onclick="autoSelectUserForDispenser('${user.username}')">Баланс</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderDatabaseDepositsTable(users, searchQuery) {
  const tbody = document.getElementById('db-table-deposits-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const allDeposits = [];
  users.forEach(u => {
    (u.depositHistory || []).forEach(dep => {
      allDeposits.push({
        username: u.username,
        method: dep.method,
        amount: dep.amount,
        date: dep.date
      });
    });
  });

  allDeposits.sort((a, b) => new Date(b.date) - new Date(a.date));

  const filtered = allDeposits.filter(d => {
    return d.username.toLowerCase().includes(searchQuery) || d.method.toLowerCase().includes(searchQuery);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-secondary); padding: 20px;">Депозитів не знайдено</td></tr>`;
    return;
  }

  filtered.forEach(dep => {
    const tr = document.createElement('tr');
    
    let badgeClass = 'tag-sys';
    if (dep.method.includes('MONO')) badgeClass = 'tag-mono';
    else if (dep.method.includes('TRC') || dep.method.includes('USDT')) badgeClass = 'tag-dep';

    tr.innerHTML = `
      <td><strong>${dep.username.toUpperCase()}</strong></td>
      <td><span class="ops-log-tag ${badgeClass}" style="font-size:10px; padding:3px 8px;">${dep.method}</span></td>
      <td style="color:#26A17B; font-weight:800;">+${dep.amount} 🪙</td>
      <td style="font-size:11px; opacity:0.8;">${dep.date}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderDatabaseBetsTable(users, searchQuery) {
  const tbody = document.getElementById('db-table-bets-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const allBets = [];
  users.forEach(u => {
    (u.betHistory || []).forEach(bet => {
      allBets.push({
        username: u.username,
        matchDisplay: bet.matchDisplay || 'Дуель',
        selectedTeam: bet.selectedTeam,
        amount: bet.amount,
        odds: bet.odds,
        payout: bet.payout,
        status: bet.status,
        date: bet.date
      });
    });
  });

  allBets.sort((a, b) => new Date(b.date) - new Date(a.date));

  const filtered = allBets.filter(b => {
    return b.username.toLowerCase().includes(searchQuery) || b.matchDisplay.toLowerCase().includes(searchQuery) || b.selectedTeam.toLowerCase().includes(searchQuery);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-secondary); padding: 20px;">Ставок не знайдено</td></tr>`;
    return;
  }

  filtered.forEach(bet => {
    const tr = document.createElement('tr');
    
    let statusClass = 'tag-sys';
    if (bet.status === 'Виграш') statusClass = 'tag-dep';
    else if (bet.status === 'Програш') statusClass = 'tag-danger';
    else if (bet.status === 'В грі') statusClass = 'tag-bet';

    let payoutText = '-';
    if (bet.status === 'Виграш') payoutText = `+${bet.payout} 🪙`;
    else if (bet.status === 'Програш') payoutText = '0 🪙';

    tr.innerHTML = `
      <td><strong>${bet.username.toUpperCase()}</strong></td>
      <td style="font-size:11px; opacity:0.9;">${bet.matchDisplay}</td>
      <td style="font-weight:700;">${bet.selectedTeam}</td>
      <td>${bet.amount} 🪙</td>
      <td style="color:var(--cs-orange); font-weight:800;">${(bet.odds || 0).toFixed(2)}</td>
      <td style="color:${bet.status === 'Виграш' ? '#26A17B' : 'white'}; font-weight:800;">${payoutText}</td>
      <td style="font-size:11px; opacity:0.8;">${bet.date}</td>
      <td><span class="ops-log-tag ${statusClass}" style="font-size:9px; padding:2px 6px;">${bet.status}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

function renderDatabaseLoginsTable(users, searchQuery) {
  const tbody = document.getElementById('db-table-logins-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  const allLogins = [];
  users.forEach(u => {
    (u.loginHistory || []).forEach(log => {
      allLogins.push({
        username: u.username,
        date: log.date,
        device: log.device || 'Невідомий',
        type: log.type || 'login'
      });
    });
  });

  allLogins.sort((a, b) => new Date(b.date) - new Date(a.date));

  const filtered = allLogins.filter(l => {
    return l.username.toLowerCase().includes(searchQuery) || l.device.toLowerCase().includes(searchQuery);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-secondary); padding: 20px;">Логів входів не знайдено</td></tr>`;
    return;
  }

  filtered.forEach(log => {
    const tr = document.createElement('tr');
    
    let typeBadge = 'tag-sys';
    let typeText = 'Вхід';
    if (log.type === 'visit') {
      typeBadge = 'tag-reg';
      typeText = 'Візит';
    } else if (log.type === 'register') {
      typeBadge = 'tag-bet';
      typeText = 'Реєстрація';
    }

    tr.innerHTML = `
      <td><strong>${log.username.toUpperCase()}</strong></td>
      <td style="font-size:11px; opacity:0.8;">${log.date}</td>
      <td style="font-size:12px;">${log.device}</td>
      <td><span class="ops-log-tag ${typeBadge}" style="font-size:9px; padding:2px 6px;">${typeText}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

window.openUserInspector = function(username) {
  const db = getDB();
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user) return;

  activeInspectorUser = user.username;
  currentInspectorTab = 'logins';

  document.getElementById('inspector-username').innerText = user.username.toUpperCase();
  document.getElementById('inspector-email').innerText = user.email || 'Немає пошти';
  document.getElementById('inspector-avatar-char').innerText = user.username.charAt(0).toUpperCase();
  document.getElementById('inspector-balance').innerText = `${user.balance} 🪙`;
  
  const totalDepsSum = (user.depositHistory || []).reduce((acc, d) => acc + d.amount, 0);
  document.getElementById('inspector-total-deps').innerText = `${totalDepsSum} 🪙`;

  const totalBetsCount = (user.betHistory || []).length;
  const totalBetsSum = (user.betHistory || []).reduce((acc, b) => acc + b.amount, 0);
  document.getElementById('inspector-total-bets').innerText = `${totalBetsCount} (${totalBetsSum} 🪙)`;

  const statusBadge = document.getElementById('inspector-status-badge');
  if (statusBadge) {
    let lastVisitTime = null;
    if (user.loginHistory && user.loginHistory.length > 0) {
      // Find the first visit or login
      const lastLogin = user.loginHistory[0];
      if (lastLogin && lastLogin.date) {
        lastVisitTime = new Date(lastLogin.date);
      }
    }
    const isOnline = lastVisitTime && (Date.now() - lastVisitTime.getTime() < 10 * 60 * 1000);
    statusBadge.innerText = isOnline ? 'Online' : 'Offline';
    statusBadge.style.background = isOnline ? 'rgba(38,161,123,0.1)' : 'rgba(255,255,255,0.05)';
    statusBadge.style.color = isOnline ? '#26A17B' : 'var(--text-secondary)';
    statusBadge.style.borderColor = isOnline ? 'rgba(38,161,123,0.25)' : 'rgba(255,255,255,0.1)';
  }

  renderInspectorLoginsList(user);
  renderInspectorDepositsList(user);
  renderInspectorBetsList(user);

  switchInspectorTab('logins');

  document.getElementById('user-inspector-overlay').classList.add('active');
  document.getElementById('user-inspector-drawer').classList.add('active');
};

window.closeUserInspector = function() {
  document.getElementById('user-inspector-overlay').classList.remove('active');
  document.getElementById('user-inspector-drawer').classList.remove('active');
  activeInspectorUser = null;
};

window.switchInspectorTab = function(tabId) {
  currentInspectorTab = tabId;
  document.querySelectorAll('#user-inspector-drawer .inspector-tabs button').forEach(btn => {
    btn.classList.remove('active');
  });
  const activeBtn = document.getElementById(`ins-tab-${tabId}`);
  if (activeBtn) activeBtn.classList.add('active');

  document.querySelectorAll('#user-inspector-drawer .inspector-pane').forEach(pane => {
    pane.style.display = 'none';
    pane.classList.remove('active');
  });

  const activePane = document.getElementById(`ins-pane-${tabId}`);
  if (activePane) {
    activePane.style.display = 'block';
    activePane.classList.add('active');
  }
};

function renderInspectorLoginsList(user) {
  const container = document.getElementById('inspector-logins-list');
  if (!container) return;
  container.innerHTML = '';

  const logins = user.loginHistory || [];
  if (logins.length === 0) {
    container.innerHTML = `<span style="font-size:11px; color:var(--text-secondary); text-align:center; display:block; padding:10px;">Історія входів відсутня</span>`;
    return;
  }

  logins.forEach(log => {
    const div = document.createElement('div');
    div.style.background = '#08090c';
    div.style.padding = '8px 12px';
    div.style.borderRadius = '6px';
    div.style.border = '1px solid rgba(255,255,255,0.02)';
    div.style.fontSize = '11px';
    div.style.display = 'flex';
    div.style.justifyContent = 'space-between';
    
    let typeText = 'Вхід';
    if (log.type === 'visit') typeText = 'Візит';
    else if (log.type === 'register') typeText = 'Реєстрація';

    div.innerHTML = `
      <div>
        <strong style="color:white;">${typeText}</strong>
        <div style="font-size:10px; color:var(--text-secondary); margin-top:2px;">${log.device || ''}</div>
      </div>
      <div style="color:var(--text-secondary); text-align:right;">${log.date}</div>
    `;
    container.appendChild(div);
  });
}

function renderInspectorDepositsList(user) {
  const container = document.getElementById('inspector-deposits-list');
  if (!container) return;
  container.innerHTML = '';

  const deps = user.depositHistory || [];
  if (deps.length === 0) {
    container.innerHTML = `<span style="font-size:11px; color:var(--text-secondary); text-align:center; display:block; padding:10px;">Депозити відсутні</span>`;
    return;
  }

  deps.forEach(dep => {
    const div = document.createElement('div');
    div.style.background = '#08090c';
    div.style.padding = '8px 12px';
    div.style.borderRadius = '6px';
    div.style.border = '1px solid rgba(255,255,255,0.02)';
    div.style.fontSize = '11px';
    div.style.display = 'flex';
    div.style.justifyContent = 'space-between';
    div.style.alignItems = 'center';

    div.innerHTML = `
      <div>
        <strong style="color:white; text-transform:uppercase;">${dep.method}</strong>
        <div style="font-size:10px; color:var(--text-secondary); margin-top:2px;">${dep.date}</div>
      </div>
      <div style="color:#26A17B; font-weight:800;">+${dep.amount} 🪙</div>
    `;
    container.appendChild(div);
  });
}

function renderInspectorBetsList(user) {
  const container = document.getElementById('inspector-bets-list');
  if (!container) return;
  container.innerHTML = '';

  const bets = user.betHistory || [];
  if (bets.length === 0) {
    container.innerHTML = `<span style="font-size:11px; color:var(--text-secondary); text-align:center; display:block; padding:10px;">Ставки відсутні</span>`;
    return;
  }

  bets.forEach(bet => {
    const div = document.createElement('div');
    div.style.background = '#08090c';
    div.style.padding = '8px 12px';
    div.style.borderRadius = '6px';
    div.style.border = '1px solid rgba(255,255,255,0.02)';
    div.style.fontSize = '11px';
    div.style.display = 'flex';
    div.style.justifyContent = 'space-between';
    div.style.alignItems = 'center';

    let color = 'white';
    let payoutText = '';
    if (bet.status === 'Виграш') {
      color = '#26A17B';
      payoutText = ` (+${bet.payout})`;
    } else if (bet.status === 'Програш') {
      color = 'var(--wolf-red)';
    } else {
      color = 'var(--cs-orange)';
    }

    div.innerHTML = `
      <div style="flex:1;">
        <div style="font-weight:800; color:white;">${bet.matchDisplay || 'Дуель'}</div>
        <div style="font-size:10px; color:var(--text-secondary); margin-top:2px;">Ставка: ${bet.amount} 🪙 на ${bet.selectedTeam} (кэф ${(bet.odds || 0).toFixed(2)})</div>
        <div style="font-size:10px; color:var(--text-secondary); margin-top:1px;">${bet.date}</div>
      </div>
      <div style="color:${color}; font-weight:800; font-size:10px; text-transform:uppercase;">
        ${bet.status}${payoutText}
      </div>
    `;
    container.appendChild(div);
  });
}

window.adjustInspectorUserBalance = function(action) {
  if (!activeInspectorUser) return;
  const amtInput = document.getElementById('inspector-balance-adjust-amount');
  const amt = parseFloat(amtInput.value);

  if (isNaN(amt) || amt <= 0) {
    showToast("Введіть коректну суму монет!", "error");
    return;
  }

  const db = getDB();
  const user = db.users.find(u => u.username.toLowerCase() === activeInspectorUser.toLowerCase());
  if (!user) return;

  if (action === 'add') {
    user.balance += amt;
    if (!user.depositHistory) user.depositHistory = [];
    user.depositHistory.unshift({
      amount: amt,
      method: "SYSTEM ADMIN",
      date: new Date().toLocaleString()
    });
    showToast(`Нараховано +${amt} монет користувачу ${user.username}!`, "success");
  } else {
    if (amt > user.balance) {
      showToast(`Неможливо списати ${amt} монет! Поточний баланс: ${user.balance}`, "error");
      return;
    }
    user.balance -= amt;
    showToast(`Списано -${amt} монет у користувача ${user.username}!`, "success");
  }

  saveDB(db);
  amtInput.value = '';
  
  openUserInspector(user.username);
  renderDatabaseTab();
};

function updateSyncStatus(success, text) {
  const dot = document.getElementById('sync-status-dot');
  const txt = document.getElementById('sync-status-text');
  if (dot && txt) {
    dot.style.color = success ? '#26A17B' : 'var(--wolf-red)';
    dot.style.textShadow = success ? '0 0 8px rgba(38,161,123,0.5)' : '0 0 8px rgba(255,26,64,0.5)';
    txt.innerText = text;
  }
}

window.manualSyncFromUI = function(btn) {
  if (btn.disabled) return;
  btn.disabled = true;
  btn.innerHTML = `<span style="display:inline-block; animation: spin 1s linear infinite;">🔄</span> Оновлення...`;
  
  // Force browser cache bypass by redirecting with a unique query param (behaves exactly like Ctrl + F5)
  const currentUrl = new URL(window.location.href);
  currentUrl.searchParams.set('reload', Date.now().toString());
  window.location.href = currentUrl.toString();
};

window.toggleDemoTournaments = function() {
  const db = getDB();
  if (db.demoTournamentsEnabled) {
    db.demoTournamentsEnabled = false;
    saveDB(db);
    showToast("Симуляцію демо-турнірів зупинено.", "warning");
  } else {
    db.demoTournamentsEnabled = true;
    
    // Auto reset to a clean 4-team single elimination bracket ready for simulation
    db.brackets = {
      type: "single",
      format: "1x1",
      rounds: [
        {
          name: "Півфінали",
          matches: [
            { id: "b_1", team1: "Очікується", team2: "Очікується", score1: 0, score2: 0, winner: null },
            { id: "b_2", team1: "Очікується", team2: "Очікується", score1: 0, score2: 0, winner: null }
          ]
        },
        {
          name: "Фінал",
          matches: [
            { id: "b_3", team1: "Очікується", team2: "Очікується", score1: 0, score2: 0, winner: null }
          ]
        }
      ]
    };
    db.bracketResetCounter = 0;
    db.lastSimTime = 0; // Force immediate simulation step
    
    saveDB(db);
    showToast("Симуляцію демо-турнірів успішно активовано! Турнір стартує за кілька секунд.", "success");
  }
  renderAdminPanel();
};

function startBracketSimulation() {
  setInterval(() => {
    const db = getDB();
    if (!db || !db.demoTournamentsEnabled) {
      return; // Run only when enabled
    }
    const now = Date.now();
    if (db.lastSimTime && (now - db.lastSimTime < 9500)) {
      return; // Run at most once every 10s across all tabs
    }
    db.lastSimTime = now;
    
    let dbUpdated = false;
    const brackets = db.brackets;
    if (!brackets || !brackets.rounds) return;

    // Safety check: ensure bracket structure matches the standard 4-team single elimination simulation layout
    if (brackets.rounds.length !== 2 || 
        !brackets.rounds[0] || !brackets.rounds[0].matches || brackets.rounds[0].matches.length !== 2 ||
        !brackets.rounds[1] || !brackets.rounds[1].matches || brackets.rounds[1].matches.length !== 1) {
      return;
    }

    // Fill empty slots in Round 0 (Півфінали) with mock teams if they are empty
    const round0 = brackets.rounds[0];
    const mockPool = ["Astralis", "MOUZ", "Heroic", "Team Liquid", "Virtus.pro", "Team Spirit", "Complexity", "Falcons"];
    
    round0.matches.forEach((m, idx) => {
      const otherMatch = round0.matches[1 - idx] || {};
      if (!m.team1 || m.team1 === "Очікується" || m.team1 === "") {
        const used = [m.team2, otherMatch.team1, otherMatch.team2].filter(Boolean);
        const available = mockPool.filter(t => !used.includes(t));
        m.team1 = available[Math.floor(Math.random() * available.length)] || "Astralis";
        m.score1 = 0;
        m.score2 = 0;
        m.winner = null;
        dbUpdated = true;
      }
      if (!m.team2 || m.team2 === "Очікується" || m.team2 === "") {
        const used = [m.team1, otherMatch.team1, otherMatch.team2].filter(Boolean);
        const available = mockPool.filter(t => !used.includes(t));
        m.team2 = available[Math.floor(Math.random() * available.length)] || "Heroic";
        m.score2 = 0;
        m.score1 = 0;
        m.winner = null;
        dbUpdated = true;
      }
    });

    // Simulate active match
    let activeMatch = round0.matches.find(m => m.winner === null);
    
    if (activeMatch) {
      if (Math.random() > 0.5) {
        activeMatch.score1++;
      } else {
        activeMatch.score2++;
      }
      dbUpdated = true;

      // Check if match is finished (first to 13)
      if (activeMatch.score1 >= 13 || activeMatch.score2 >= 13) {
        const winner = activeMatch.score1 >= 13 ? activeMatch.team1 : activeMatch.team2;
        activeMatch.winner = winner;
        showToast(`🏆 Півфінал: ${activeMatch.team1} vs ${activeMatch.team2} завершено! Переможець: ${winner} (${activeMatch.score1}:${activeMatch.score2})`, "success");
      }
    } else {
      // Round 0 matches are both completed. Check Round 1 (Фінал)
      const round1 = brackets.rounds[1];
      const finalMatch = round1.matches ? round1.matches[0] : null;
      if (!finalMatch) return;

      // Populate final match teams from round 0 winners if not already set
      if ((finalMatch.team1 === "Очікується" || finalMatch.team1 === "") && round0.matches[0].winner) {
        finalMatch.team1 = round0.matches[0].winner;
        finalMatch.score1 = 0;
        dbUpdated = true;
      }
      if ((finalMatch.team2 === "Очікується" || finalMatch.team2 === "") && round0.matches[1].winner) {
        finalMatch.team2 = round0.matches[1].winner;
        finalMatch.score2 = 0;
        dbUpdated = true;
      }

      // If final match has teams and is not finished, simulate it
      if (finalMatch.team1 && finalMatch.team2 && finalMatch.team1 !== "Очікується" && finalMatch.team2 !== "Очікується" && finalMatch.winner === null) {
        if (Math.random() > 0.5) {
          finalMatch.score1++;
        } else {
          finalMatch.score2++;
        }
        dbUpdated = true;

        if (finalMatch.score1 >= 13 || finalMatch.score2 >= 13) {
          const winner = finalMatch.score1 >= 13 ? finalMatch.team1 : finalMatch.team2;
          finalMatch.winner = winner;
          showToast(`👑 Фінал турніру: ${finalMatch.team1} vs ${finalMatch.team2} завершено! ЧЕМПІОН: ${winner} (${finalMatch.score1}:${finalMatch.score2})`, "success");
        }
      } else if (finalMatch.winner !== null) {
        // Tournament is finished. Reset tournament bracket after a delay
        if (!db.bracketResetCounter) {
          db.bracketResetCounter = 1;
          dbUpdated = true;
        } else {
          db.bracketResetCounter++;
          dbUpdated = true;
          if (db.bracketResetCounter >= 4) { // ~40 seconds of display
            db.brackets = {
              type: "single",
              rounds: [
                {
                  name: "Півфінали",
                  matches: [
                    { id: "b_1", team1: "Очікується", team2: "Очікується", score1: 0, score2: 0, winner: null },
                    { id: "b_2", team1: "Очікується", team2: "Очікується", score1: 0, score2: 0, winner: null }
                  ]
                },
                {
                  name: "Фінал",
                  matches: [
                    { id: "b_3", team1: "Очікується", team2: "Очікується", score1: 0, score2: 0, winner: null }
                  ]
                }
              ]
            };
            db.bracketResetCounter = 0;
            showToast("🚀 Розпочався новий турнір Challengermode! Реєструйте свої команди!", "success");
          }
        }
      }
    }

    if (dbUpdated) {
      saveDB(db);
      renderAdminPanel();
    }
  }, 10000); // Check every 10 seconds
}

// Render pending deposits list
function renderAdminPendingDeposits(pendingDeposits) {
  const tbody = document.getElementById('admin-pending-deposits-tbody');
  if (!tbody) return;
  tbody.innerHTML = "";

  const activePending = pendingDeposits.filter(d => d.status === "pending");

  if (activePending.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-secondary); padding: 15px;">Немає активних запитів на верифікацію</td></tr>`;
    return;
  }

  activePending.forEach(dep => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${dep.username ? dep.username.toUpperCase() : ''}</strong></td>
      <td>${dep.amount} UAH (🪙)</td>
      <td><span class="rank-badge-inline" style="background: rgba(38,161,123,0.1); color:#26A17B; border-color:rgba(38,161,123,0.2);">${dep.method}</span></td>
      <td>${dep.reference || ''}</td>
      <td>${dep.date || ''}</td>
      <td>
        <button class="btn btn-success" style="padding:4px 8px; font-size:10px; background: var(--cs-orange); border-color: var(--cs-orange);" onclick="approveDepositAdmin('${dep.id}')">Підтвердити</button>
        <button class="btn btn-danger" style="padding:4px 8px; font-size:10px; margin-left:5px;" onclick="rejectDepositAdmin('${dep.id}')">Відхилити</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Approve pending monobank deposit
window.approveDepositAdmin = async function(depositId) {
  const db = getDB();
  const deposit = (db.pendingDeposits || []).find(d => d.id === depositId);
  if (!deposit) {
    showToast("Запит на депозит не знайдено!", "error");
    return;
  }
  
  if (deposit.status !== "pending") {
    showToast("Цей запит вже було оброблено!", "error");
    return;
  }

  const user = db.users.find(u => u.username === deposit.username);
  if (!user) {
    showToast(`Користувача ${deposit.username} не знайдено!`, "error");
    return;
  }

  const multiplier = 1 + (user.bonusPercent || 0) / 100;
  const creditedCoins = Math.round(deposit.amount * multiplier);

  user.balance = (user.balance || 0) + creditedCoins;
  user.depositHistory = user.depositHistory || [];
  user.depositHistory.unshift({
    amount: creditedCoins,
    method: deposit.method,
    date: new Date().toLocaleString(),
    status: "approved"
  });

  deposit.status = "approved";

  showToast("Зарахування поповнення...", "success");
  await saveDB(db);
  showToast(`Запит схвалено! Гравцю ${deposit.username.toUpperCase()} нараховано ${creditedCoins} 🪙`, "success");
  renderAdminPanel();
};

// Reject pending monobank deposit
window.rejectDepositAdmin = async function(depositId) {
  const db = getDB();
  const deposit = (db.pendingDeposits || []).find(d => d.id === depositId);
  if (!deposit) {
    showToast("Запит на депозит не знайдено!", "error");
    return;
  }

  if (deposit.status !== "pending") {
    showToast("Цей запит вже було оброблено!", "error");
    return;
  }

  deposit.status = "rejected";

  showToast("Відхилення запиту...", "success");
  await saveDB(db);
  showToast("Запит відхилено!", "success");
  renderAdminPanel();
};

// Check for unviewed pending deposits and update the orange notification dot
function updateAdminNotificationBadges() {
  const db = getDB();
  if (!db) return;

  const verifyBtn = Array.from(document.querySelectorAll('.admin-tab-item')).find(btn => 
    btn.getAttribute('onclick') && btn.getAttribute('onclick').includes("'deposits-verify'")
  );
  if (!verifyBtn) return;

  const isCurrentlyOnVerifyTab = verifyBtn.classList.contains('active');
  const pending = (db.pendingDeposits || []).filter(d => d.status === "pending");

  if (pending.length === 0) {
    const existingDot = verifyBtn.querySelector('.notification-badge-dot');
    if (existingDot) existingDot.remove();
    return;
  }

  // Find the latest pending deposit timestamp based on id (dep_1234567890)
  let latestPendingTime = 0;
  pending.forEach(d => {
    const tsStr = d.id.replace('dep_', '');
    const ts = parseInt(tsStr, 10);
    if (!isNaN(ts) && ts > latestPendingTime) {
      latestPendingTime = ts;
    }
  });

  if (isCurrentlyOnVerifyTab) {
    localStorage.setItem('admin_last_viewed_deposit_time', latestPendingTime.toString());
    const existingDot = verifyBtn.querySelector('.notification-badge-dot');
    if (existingDot) existingDot.remove();
  } else {
    const lastViewedTimeStr = localStorage.getItem('admin_last_viewed_deposit_time') || "0";
    const lastViewedTime = parseInt(lastViewedTimeStr, 10) || 0;

    if (latestPendingTime > lastViewedTime) {
      let existingDot = verifyBtn.querySelector('.notification-badge-dot');
      if (!existingDot) {
        existingDot = document.createElement('span');
        existingDot.className = 'notification-badge-dot';
        verifyBtn.appendChild(existingDot);
      }
    } else {
      const existingDot = verifyBtn.querySelector('.notification-badge-dot');
      if (existingDot) existingDot.remove();
    }
  }
}

