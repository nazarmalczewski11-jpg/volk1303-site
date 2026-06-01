// Database key for LocalStorage
const DB_KEY = 'volk_site_data';

// Fresh database getter
function getDB() {
  const data = localStorage.getItem(DB_KEY);
  if (!data) return null;
  return JSON.parse(data);
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
  window.location.href = 'index.html';
};

window.openModal = function(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
};

window.closeModal = function(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
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
  // Access Gate: restrict page if not admin!
  const db = getDB();
  if (!db || db.currentUser !== 'admin') {
    window.location.href = 'betting.html';
    return;
  }

  // Initial load
  renderAdminPanel();

  // Setup Event Listeners
  setupAdminListeners();

  // Cross-page storage synchronization
  window.addEventListener('storage', (e) => {
    if (e.key === DB_KEY) {
      const freshDb = getDB();
      if (!freshDb || freshDb.currentUser !== 'admin') {
        window.location.href = 'betting.html';
        return;
      }
      renderAdminPanel();
    }
  });

  window.addEventListener('storage_updated', () => {
    renderAdminPanel();
  });
});

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

  // Match Creator Form
  const newMatchForm = document.getElementById('admin-create-match-form');
  if (newMatchForm) {
    newMatchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      createNewMatchAdmin();
    });
  }

  // Edit User Details Form
  const editUserForm = document.getElementById('admin-edit-user-form');
  if (editUserForm) {
    editUserForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveUserDataAdmin();
    });
  }
}

// Global selected user state in Coin Dispenser
let searchedUserNick = null;

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
    <div><strong>Username:</strong> ${user.username.toUpperCase()}</div>
    <div><strong>Email:</strong> ${user.email}</div>
    <div><strong>Баланс:</strong> <strong style="color:var(--cs-orange);">${user.balance} 🪙</strong></div>
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
// Base odds = 1.85. Leader odds drop by 0.12, trailing team odds rise by 0.25 per point difference.
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

// Create New Match Entry (Rosters 1x1 to 5x5)
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

// Render Admin Panels
function renderAdminPanel() {
  const db = getDB();
  if (!db) return;

  // Render header values
  const balanceVal = document.getElementById('header-balance-value');
  if (balanceVal) {
    const user = db.users.find(u => u.username === db.currentUser);
    if (user) {
      balanceVal.innerText = user.balance;
    }
  }

  // Prepopulate twitch channel settings input
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

  // Render collections
  renderAdminUsersTable(db.users);
  renderAdminMatchesEditor(db.matches);
  renderAdminBracketsEditor(db.brackets);
  renderAdminUserTeamsList(db.teams || []);
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
        <div style="display:flex; gap:4px;">
          <button class="btn btn-secondary" style="padding:4px 8px; font-size:10px;" onclick="autoSelectUserForDispenser('${user.username}')">Вибрати</button>
          <button class="btn" style="padding:4px 8px; font-size:10px; background:linear-gradient(135deg, var(--cs-orange) 0%, #cc4800 100%);" onclick="openEditUserModal('${user.username}')">Редагувати</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.autoSelectUserForDispenser = function(nick) {
  document.getElementById('admin-user-search-input').value = nick;
  handleUserSearchAdmin();
};

window.openEditUserModal = function(nick) {
  const db = getDB();
  const user = db.users.find(u => u.username === nick);
  if (!user) return;

  document.getElementById('edit-user-original-username').value = user.username;
  document.getElementById('edit-user-username').value = user.username;
  document.getElementById('edit-user-email').value = user.email || "";
  document.getElementById('edit-user-balance').value = user.balance || 0;
  document.getElementById('edit-user-bonus').value = user.bonusPercent || 0;

  openModal('edit-user-modal');
};

window.saveUserDataAdmin = function() {
  const db = getDB();
  const origNick = document.getElementById('edit-user-original-username').value;
  const user = db.users.find(u => u.username === origNick);
  if (!user) {
    showToast("Користувача не знайдено!", "error");
    return;
  }

  const newNick = document.getElementById('edit-user-username').value.trim().toLowerCase();
  const newEmail = document.getElementById('edit-user-email').value.trim();
  const newBalance = parseFloat(document.getElementById('edit-user-balance').value);
  const newBonus = parseFloat(document.getElementById('edit-user-bonus').value);

  if (!newNick || !newEmail || isNaN(newBalance) || isNaN(newBonus)) {
    showToast("Заповніть всі поля!", "error");
    return;
  }

  // Duplicate checks if username changed
  if (newNick !== origNick) {
    const dup = db.users.find(u => u.username === newNick);
    if (dup) {
      showToast("Цей нікнейм вже зайнятий іншим користувачем!", "error");
      return;
    }
  }

  // Update current user if admin renamed currently logged in user
  if (db.currentUser === origNick) {
    db.currentUser = newNick;
  }

  user.username = newNick;
  user.email = newEmail;
  user.balance = newBalance;
  user.bonusPercent = newBonus;

  saveDB(db);
  closeModal('edit-user-modal');
  showToast("Дані користувача успішно оновлено!", "success");
  renderAdminPanel();
};

// Render Admin Matches Editor cards list
function renderAdminMatchesEditor(matches) {
  const container = document.getElementById('admin-matches-editor-list');
  if (!container) return;
  container.innerHTML = "";

  if (matches.length === 0) {
    container.innerHTML = `<div style="text-align:center; color:var(--text-secondary); padding:20px;">Активні матчі відсутні</div>`;
    return;
  }

  matches.forEach(match => {
    const card = document.createElement('div');
    card.className = "admin-match-editor-card";
    card.style.background = "var(--bg-input)";
    card.style.border = "1px solid var(--border-color)";
    card.style.borderRadius = "8px";
    card.style.padding = "15px";
    card.style.marginBottom = "10px";

    card.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:8px; margin-bottom:10px;">
        <strong style="color:var(--cs-orange); font-size:14px;">${match.team1} vs ${match.team2}</strong>
        <div>
          <select id="status-${match.id}" onchange="changeMatchStatusAdmin('${match.id}', this.value)" style="background:var(--bg-card); color:white; border:1px solid var(--border-color); font-size:11px; padding:4px; border-radius:4px;">
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

      <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; margin-bottom:10px;">
        <div>
          Кефи: <strong>${match.coef1.toFixed(2)}</strong> / <strong>${match.coef2.toFixed(2)}</strong>
        </div>

        <div>
          ${match.isFrozen ? `
            <span style="color:var(--volk-red); font-weight:800; margin-right:8px;">ЗАМОРОЖЕНО</span>
            <button class="btn btn-danger" style="padding: 4px 8px; font-size:10px;" onclick="toggleFreezeMatchAdmin('${match.id}', false)">РОЗМОРОЗИТИ</button>
          ` : `
            <span style="color:var(--success); font-weight:800; margin-right:8px;">АКТИВНІ</span>
            <button class="btn btn-secondary" style="padding: 4px 8px; font-size:10px;" onclick="toggleFreezeMatchAdmin('${match.id}', true)">Заморозити</button>
          `}
        </div>
      </div>

      <!-- Toggle Edit Fields Section -->
      <details style="margin-top:10px; border-top: 1px dashed var(--border-color); padding-top:10px;">
        <summary style="font-size:12px; color:var(--text-secondary); cursor:pointer; font-weight:600; text-transform:uppercase;">Редагувати інші параметри</summary>
        <div style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
            <div class="form-group" style="margin-bottom:0;">
              <label style="font-size:10px;">Назва Команди 1</label>
              <input type="text" id="edit-t1-name-${match.id}" class="form-input" value="${match.team1}" style="padding:4px 8px; font-size:12px;">
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label style="font-size:10px;">Назва Команди 2</label>
              <input type="text" id="edit-t2-name-${match.id}" class="form-input" value="${match.team2}" style="padding:4px 8px; font-size:12px;">
            </div>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:10px;">Гравці 1 (через кому)</label>
            <input type="text" id="edit-t1-players-${match.id}" class="form-input" value="${match.players1.join(', ')}" style="padding:4px 8px; font-size:12px;">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:10px;">Гравці 2 (через кому)</label>
            <input type="text" id="edit-t2-players-${match.id}" class="form-input" value="${match.players2.join(', ')}" style="padding:4px 8px; font-size:12px;">
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
            <div class="form-group" style="margin-bottom:0;">
              <label style="font-size:10px;">Кеф 1</label>
              <input type="number" id="edit-t1-coef-${match.id}" class="form-input" value="${match.coef1}" step="0.01" style="padding:4px 8px; font-size:12px;">
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label style="font-size:10px;">Кеф 2</label>
              <input type="number" id="edit-t2-coef-${match.id}" class="form-input" value="${match.coef2}" step="0.01" style="padding:4px 8px; font-size:12px;">
            </div>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:10px;">Посилання на стрім</label>
            <input type="text" id="edit-stream-link-${match.id}" class="form-input" value="${match.link || ''}" style="padding:4px 8px; font-size:12px;">
          </div>
          <button class="btn" style="padding:6px; font-size:11px;" onclick="saveMatchDetailsAdmin('${match.id}')">Зберегти деталі</button>
        </div>
      </details>

      ${match.status === 'finished' ? `
        <div style="background:rgba(0,0,0,0.15); padding:8px; border-radius:6px; margin-top:10px; display:flex; justify-content:space-between; align-items:center;">
          <span style="font-size:11px; color:var(--text-secondary);">Хто переміг для розрахунку ставок?</span>
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

window.saveMatchDetailsAdmin = function(id) {
  const db = getDB();
  const match = db.matches.find(m => m.id === id);
  if (!match) return;

  const t1Name = document.getElementById(`edit-t1-name-${id}`).value.trim();
  const t2Name = document.getElementById(`edit-t2-name-${id}`).value.trim();
  const players1Raw = document.getElementById(`edit-t1-players-${id}`).value.split(',').map(p => p.trim());
  const players2Raw = document.getElementById(`edit-t2-players-${id}`).value.split(',').map(p => p.trim());
  const coef1 = parseFloat(document.getElementById(`edit-t1-coef-${id}`).value) || 1.85;
  const coef2 = parseFloat(document.getElementById(`edit-t2-coef-${id}`).value) || 1.85;
  const streamLink = document.getElementById(`edit-stream-link-${id}`).value.trim();

  if (!t1Name || !t2Name) {
    showToast("Назви команд не можуть бути пустими!", "error");
    return;
  }

  match.team1 = t1Name;
  match.team2 = t2Name;
  match.players1 = players1Raw.filter(p => p !== "");
  match.players2 = players2Raw.filter(p => p !== "");
  match.coef1 = coef1;
  match.coef2 = coef2;
  match.link = streamLink;

  saveDB(db);
  showToast("Деталі матчу оновлено!", "success");
  renderAdminPanel();
};

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

  // Auto-Freeze check at EXACTLY 6-0 or 0-6 (Requirement 8)
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

    div.innerHTML = `<h5 style="color:var(--cs-orange); margin-bottom:8px; text-transform:uppercase;">${round.name}</h5>`;

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
          <input type="text" id="br-t1-${match.id}" class="form-input" value="${match.team1 || ''}" placeholder="Команда 1" style="padding:4px; font-size:11px; width:100%; margin-bottom:4px;">
          <input type="number" id="br-s1-${match.id}" class="form-input" value="${match.score1}" placeholder="0" style="padding:4px; font-size:11px; width:100%;">
        </div>
        <div style="font-size:11px; font-weight:800;">VS</div>
        <div style="flex:1;">
          <input type="text" id="br-t2-${match.id}" class="form-input" value="${match.team2 || ''}" placeholder="Команда 2" style="padding:4px; font-size:11px; width:100%; margin-bottom:4px;">
          <input type="number" id="br-s2-${match.id}" class="form-input" value="${match.score2}" placeholder="0" style="padding:4px; font-size:11px; width:100%;">
        </div>
        <button class="btn" style="padding: 6px 10px; font-size:10px;" onclick="saveAdminBracketMatch('${match.id}', ${roundIdx}, ${matchIdx})">OK</button>
      `;
      div.appendChild(matchBox);
    });

    container.appendChild(div);
  });
}

// Save Bracket Match and propagate winner (Single elimination flow)
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

// Render registered User Teams list card in admin panel
function renderAdminUserTeamsList(teams) {
  const container = document.getElementById('admin-user-teams-list');
  if (!container) return;
  container.innerHTML = "";

  if (teams.length === 0) {
    container.innerHTML = `<span style="color:var(--text-secondary); font-size:11px; text-align:center; display:block; padding:10px;">Команд не створено</span>`;
    return;
  }

  teams.forEach(team => {
    const div = document.createElement('div');
    div.style.background = "var(--bg-input)";
    div.style.padding = "8px 10px";
    div.style.borderRadius = "6px";
    div.style.border = "1px solid var(--border-color)";

    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
        <strong style="color:var(--cs-orange); font-size:12px;">${team.name} [${team.tag}]</strong>
        <span style="font-size:10px; color:var(--text-secondary);">Кап: ${team.owner}</span>
      </div>
      <div style="font-size:11px; color:white;">
        Склад: ${team.players.join(', ')}
      </div>
    `;
    container.appendChild(div);
  });
}
