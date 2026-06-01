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

  // Start background simulation loop in case admin panel is the only page open
  startBracketSimulation();
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
    'promocodes': 'Центр керування промокодами',
    'stream': 'Налаштування стріму Twitch'
  };
  
  const barTitle = document.getElementById('admin-current-tab-title');
  if (barTitle) barTitle.innerText = titleMap[tabId] || 'Панель оператора';
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

  const db = getDB();
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
    if (brackets.rounds.length !== 2 || brackets.rounds[0].matches.length !== 2) return;

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
      const finalMatch = round1.matches[0];

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
