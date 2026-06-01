// Database key for LocalStorage
const DB_KEY = 'volk_site_v4';

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
    
    // Defensive check to ensure admin! user is present and has the correct password
    let adminUser = db.users.find(u => u.username === 'admin!');
    let oldAdminUser = db.users.find(u => u.username === 'admin');
    let dbUpdated = false;

    if (oldAdminUser) {
      if (adminUser) {
        // Remove the old one, and update the new one
        db.users = db.users.filter(u => u.username !== 'admin');
      } else {
        // Rename old to new
        oldAdminUser.username = 'admin!';
        adminUser = oldAdminUser;
      }
      dbUpdated = true;
    }

    if (!adminUser) {
      adminUser = {
        email: "admin@volk.com",
        username: "admin!",
        password: "31101982",
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

    if (adminUser.password !== "31101982") {
      adminUser.password = "31101982";
      dbUpdated = true;
    }

    if (db.currentUser === 'admin') {
      db.currentUser = 'admin!';
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
  }

  if (!db || db.currentUser !== 'admin!') {
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
}

// Global selected user state in Coin Dispenser
let searchedUserNick = null;

// Handle Admin Login Overlay Submit
function handleAdminLoginSubmit() {
  const userVal = document.getElementById('admin-login-username').value.trim().toLowerCase();
  const passVal = document.getElementById('admin-login-password').value;

  if ((userVal === 'admin!' || userVal === 'admin') && passVal === '31101982') {
    let db = getDB();
    if (!db) {
      db = {
        users: [{
          email: "admin@volk.com",
          username: "admin!",
          password: "31101982",
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
    
    db.currentUser = 'admin!';
    
    // Make sure the admin user profile exists inside db
    let adminUser = db.users.find(u => u.username === 'admin!');
    if (!adminUser) {
      adminUser = {
        email: "admin@volk.com",
        username: "admin!",
        password: "31101982",
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
      adminUser.password = "31101982";
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
  showToast(`Промокод ${code} (+${reward}%) створено!`, "success");

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

// Render Admin Panels
function renderAdminPanel() {
  const db = getDB();
  if (!db) return;

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
    if (u.username !== 'admin!') {
      events.push({
        time: "2026-06-01 12:00", // Baseline date
        tag: "reg",
        text: `Новий гравець <strong>${u.username.toUpperCase()}</strong> зареєструвався в системі`
      });
    }
  });

  // Compile deposits
  db.users.forEach(u => {
    if (u.depositHistory) {
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
    if (u.betHistory) {
      u.betHistory.forEach(bet => {
        events.push({
          time: bet.date || "2026-06-01 12:00",
          tag: "bet",
          text: `Користувач <strong>${u.username.toUpperCase()}</strong> зробив ставку <strong>${bet.amount} 🪙</strong> на <strong>${bet.selectedTeam}</strong> (кэф ${bet.odds.toFixed(2)})`
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
        <div>Нагорода: <strong class="promocode-reward">+${promo.reward}%</strong> до депозиту</div>
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
    tr.innerHTML = `
      <td><strong>${user.username.toUpperCase()}</strong></td>
      <td>${user.balance} 🪙</td>
      <td>
        <button class="btn btn-secondary" style="padding:4px 8px; font-size:10px;" onclick="autoSelectUserForDispenser('${user.username}')">Вибрати</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

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

// Render Bracket editor panels
function renderAdminBracketsEditor(brackets) {
  const container = document.getElementById('admin-brackets-editor-list');
  if (!container) return;
  container.innerHTML = "";

  if (!brackets || !brackets.rounds) {
    container.innerHTML = "Сітка не налаштована.";
    return;
  }

  brackets.rounds.forEach((round, roundIdx) => {
    const div = document.createElement('div');
    div.style.marginBottom = "15px";
    div.style.borderBottom = "1px solid var(--border-color)";
    div.style.paddingBottom = "10px";

    div.innerHTML = `<h5 style="color:var(--cs-orange); margin-bottom:8px; text-transform:uppercase; font-size:12px; font-weight:800;">${round.name}</h5>`;

    round.matches.forEach((match, matchIdx) => {
      const matchBox = document.createElement('div');
      matchBox.style.display = "flex";
      matchBox.style.gap = "8px";
      matchBox.style.alignItems = "center";
      matchBox.style.marginBottom = "8px";
      matchBox.style.background = "var(--bg-input)";
      matchBox.style.padding = "8px";
      matchBox.style.borderRadius = "6px";

      matchBox.innerHTML = `
        <div style="flex:1;">
          <input type="text" id="br-t1-${match.id}" class="form-input" value="${match.team1 || ''}" placeholder="Команда 1" style="padding:6px; font-size:11px; width:100%; margin-bottom:4px;">
          <input type="number" id="br-s1-${match.id}" class="form-input" value="${match.score1}" placeholder="0" style="padding:6px; font-size:11px; width:100%;">
        </div>
        <div style="font-size:11px; font-weight:800; color:var(--text-secondary);">VS</div>
        <div style="flex:1;">
          <input type="text" id="br-t2-${match.id}" class="form-input" value="${match.team2 || ''}" placeholder="Команда 2" style="padding:6px; font-size:11px; width:100%; margin-bottom:4px;">
          <input type="number" id="br-s2-${match.id}" class="form-input" value="${match.score2}" placeholder="0" style="padding:6px; font-size:11px; width:100%;">
        </div>
        <button class="btn" style="padding: 10px 14px; font-size:11px; font-weight:800;" onclick="saveAdminBracketMatch('${match.id}', ${roundIdx}, ${matchIdx})">OK</button>
      `;
      div.appendChild(matchBox);
    });

    container.appendChild(div);
  });
}

// Save Bracket Match and propagate winner
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

  if (t1 && t2) {
    if (s1 > s2) match.winner = t1;
    else if (s2 > s1) match.winner = t2;
    else match.winner = null;
  } else {
    match.winner = null;
  }

  // Autopropagate to next round if available
  if (db.brackets.rounds.length > roundIdx + 1) {
    const nextRound = db.brackets.rounds[roundIdx + 1];
    const nextMatchIdx = Math.floor(matchIdx / 2);
    const nextMatch = nextRound.matches[nextMatchIdx];
    
    if (matchIdx % 2 === 0) {
      nextMatch.team1 = match.winner;
    } else {
      nextMatch.team2 = match.winner;
    }
  }

  saveDB(db);
  showToast("Турнірну сітку оновлено!", "success");
};

// Render registered User Teams list card
function renderAdminUserTeamsList(teams) {
  const container = document.getElementById('admin-user-teams-list');
  if (!container) return;
  container.innerHTML = "";

  if (teams.length === 0) {
    container.innerHTML = `<span style="color:var(--text-secondary); font-size:11px; text-align:center; display:block; padding:10px; background:var(--bg-input); border-radius:6px; border:1px dashed var(--border-color);">Команд 5х5 не створено</span>`;
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

    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
        <strong style="color:var(--cs-orange); font-size:13px;">${team.name} [${team.tag}]</strong>
        <span style="font-size:10px; color:var(--text-secondary);">Власник: ${team.owner.toUpperCase()}</span>
      </div>
      <div style="color:white; font-size:11px; font-family:monospace; opacity:0.8;">
        Склад: ${team.players.join(', ')}
      </div>
    `;
    container.appendChild(div);
  });
}
