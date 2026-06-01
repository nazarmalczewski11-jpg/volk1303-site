// Database key for LocalStorage
const DB_KEY = 'volk_site_v4';
const CLOUD_BUCKET = 'https://kvdb.io/RewyBV3ePoEzaKv2H17apy/';

let isSyncing = false;
let openTournamentDetailsIds = {};
let activeTournamentTabs = {};

// Pull and sync from cloud
async function syncWithCloud() {
  if (isSyncing) return;
  isSyncing = true;
  
  const db = getDB();
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
    const [bRes, mRes, tRes, lRes, sRes, pRes, pdRes, txRes, tourRes] = await Promise.all([
      fetch(CLOUD_BUCKET + 'brackets', { cache: 'no-store' }),
      fetch(CLOUD_BUCKET + 'matches', { cache: 'no-store' }),
      fetch(CLOUD_BUCKET + 'teams', { cache: 'no-store' }),
      fetch(CLOUD_BUCKET + 'aimLobbies', { cache: 'no-store' }),
      fetch(CLOUD_BUCKET + 'settings', { cache: 'no-store' }),
      fetch(CLOUD_BUCKET + 'promocodes', { cache: 'no-store' }),
      fetch(CLOUD_BUCKET + 'pendingDeposits', { cache: 'no-store' }),
      fetch(CLOUD_BUCKET + 'usedTxids', { cache: 'no-store' }),
      fetch(CLOUD_BUCKET + 'tournaments', { cache: 'no-store' })
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
    if (tourRes && tourRes.ok) {
      const cloudTournaments = await tourRes.json();
      if (JSON.stringify(db.tournaments) !== JSON.stringify(cloudTournaments)) {
        db.tournaments = cloudTournaments;
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

    if (dbChanged) {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
      window.dispatchEvent(new Event('storage_updated'));
      if (typeof renderPageContent === 'function') {
        renderPageContent();
      }
      if (shouldPush) {
        pushToCloud(db);
      }
    }

  } catch (e) {
    console.error("Cloud sync error:", e);
  } finally {
    isSyncing = false;
  }
}

// Push local changes to cloud (Client side: only push collections modified by users to prevent overwriting admin state)
async function pushToCloud(db) {
  try {
    await Promise.all([
      fetch(CLOUD_BUCKET + 'users', { method: 'POST', body: JSON.stringify(db.users) }),
      fetch(CLOUD_BUCKET + 'aimLobbies', { method: 'POST', body: JSON.stringify(db.aimLobbies) }),
      fetch(CLOUD_BUCKET + 'pendingDeposits', { method: 'POST', body: JSON.stringify(db.pendingDeposits || []) }),
      fetch(CLOUD_BUCKET + 'usedTxids', { method: 'POST', body: JSON.stringify(db.usedTxids || []) })
    ]);
  } catch (e) {
    console.error("Failed to push to cloud:", e);
  }
}

// Fresh database getter
function getDB() {
  const data = localStorage.getItem(DB_KEY);
  if (!data) {
    return initDefaultDB();
  }
  try {
    const db = JSON.parse(data);
    // Ensure all critical collections and rosters are initialized
    if (!db.users) db.users = [];
    if (!db.teams) db.teams = [];
    if (!db.matches) db.matches = [];
    if (!db.aimLobbies) db.aimLobbies = [];
    if (!db.promocodes) db.promocodes = [];
    if (!db.tournaments) db.tournaments = [];
    if (!db.twitchStatus) db.twitchStatus = "live";
    if (!db.activeTwitchChannel) db.activeTwitchChannel = "volk13o3";
    
    // Defensive check to ensure admin user is present and has the correct password
    let adminUser = db.users.find(u => u.username === 'admin');
    let oldExclamationAdmin = db.users.find(u => u.username === 'admin!');
    let dbUpdated = false;

    if (!adminUser) {
      adminUser = {
        email: "admin@volk.com",
        username: "admin",
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

    if (adminUser.password !== "11111111" && adminUser.password !== "31101982") {
      adminUser.password = "31101982";
      dbUpdated = true;
    }

    if (oldExclamationAdmin && oldExclamationAdmin.password !== "11111111" && oldExclamationAdmin.password !== "31101982") {
      oldExclamationAdmin.password = "31101982";
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
    console.error("Error parsing database, resetting...", e);
    return initDefaultDB();
  }
}

// Save database and dispatch update events for cross-page live sync
function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
  window.dispatchEvent(new Event('storage_updated'));
  return pushToCloud(db); // Async cloud update!
}

// Initial mock database
function initDefaultDB() {
  const defaultDB = {
    users: [
      {
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
      }
    ],
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
    activeTwitchChannel: "volk13o3",
    currentUser: null
  };
  localStorage.setItem(DB_KEY, JSON.stringify(defaultDB));
  return defaultDB;
}

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

const pathName = window.location.pathname.split('/').pop().toLowerCase();
let currentPage = pathName === "" ? "index.html" : pathName;
if (currentPage !== "" && !currentPage.endsWith('.html')) {
  currentPage += '.html';
}

function checkAuthGate() {
  const db = getDB();
  const urlParams = new URLSearchParams(window.location.search);
  const bypassRedirect = urlParams.has('register') || urlParams.has('logout');
  
  if (urlParams.has('logout')) {
    db.currentUser = null;
    saveDB(db);
  }
  
  if (currentPage === 'index.html') {
    // If logged in, redirect to betting lobby
    if (db.currentUser && !bypassRedirect) {
      window.location.href = 'betting.html';
    }
  } else {
    // If not logged in, redirect to login page index.html
    if (!db.currentUser) {
      window.location.href = 'index.html';
    }
  }
}

// Modal handling functions
window.openModal = function(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('active');
};

window.closeModal = function(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('active');
};

// User log out
window.logoutUser = function() {
  const db = getDB();
  db.currentUser = null;
  saveDB(db);
  window.location.href = 'index.html';
};

function getBrowserDeviceInfo() {
  const ua = navigator.userAgent;
  let os = "Unknown OS";
  let browser = "Unknown Browser";

  if (ua.indexOf("Android") !== -1) os = "Android";
  else if (ua.indexOf("like Mac") !== -1 || ua.indexOf("iPhone") !== -1 || ua.indexOf("iPad") !== -1) os = "iOS";
  else if (ua.indexOf("Win") !== -1) os = "Windows";
  else if (ua.indexOf("Mac") !== -1) os = "MacOS";
  else if (ua.indexOf("Linux") !== -1) os = "Linux";

  if (ua.indexOf("Chrome") !== -1) browser = "Chrome";
  else if (ua.indexOf("Safari") !== -1) browser = "Safari";
  else if (ua.indexOf("Firefox") !== -1) browser = "Firefox";
  else if (ua.indexOf("MSIE") !== -1 || !!document.documentMode === true) browser = "IE";
  else if (ua.indexOf("Edge") !== -1) browser = "Edge";

  return `${os} (${browser})`;
}

function logUserSessionVisit() {
  const db = getDB();
  if (db && db.currentUser && db.currentUser !== 'admin') {
    const sessionKey = 'logged_visit_' + db.currentUser;
    if (!sessionStorage.getItem(sessionKey)) {
      const user = db.users.find(u => u.username === db.currentUser);
      if (user) {
        if (!user.loginHistory) user.loginHistory = [];
        user.loginHistory.unshift({
          date: new Date().toLocaleString(),
          device: getBrowserDeviceInfo(),
          type: "visit"
        });
        sessionStorage.setItem(sessionKey, 'true');
        saveDB(db);
      }
    }
  }
}

// Global active betslip state
let activeBet = null; // { matchId, selectedTeamIndex, odds, teamName, matchDisplay }

// DOM Load Handlers
document.addEventListener('DOMContentLoaded', () => {
  // Check auth wall immediately
  checkAuthGate();
  
  // Log session visit
  logUserSessionVisit();
  
  // Set up listeners based on current active file layout
  setupListenersByPage();
  
  // Render layout details
  renderPageContent();

  // Trigger background cloud sync immediately and poll every 8 seconds
  syncWithCloud();
  setInterval(syncWithCloud, 8000);

  // Start background tournament brackets simulation (only runs when enabled)
  
  // Handle parameters from other pages redirecting to place a bet
  const urlParams = new URLSearchParams(window.location.search);
  if (currentPage === 'betting.html' && urlParams.has('selectMatch')) {
    const matchId = urlParams.get('selectMatch');
    const teamIndex = parseInt(urlParams.get('teamIndex'));
    const odds = parseFloat(urlParams.get('odds'));
    const teamName = urlParams.get('teamName');
    
    // Clear URL parameters
    window.history.replaceState({}, document.title, window.location.pathname);
    
    // Auto select odds after page is rendering
    setTimeout(() => {
      if (typeof selectBetodds === 'function') {
        selectBetodds(matchId, teamIndex, odds, teamName);
      }
    }, 150);
  }

  // Listen for storage adjustments from other browser windows (real-time operator sync)
  window.addEventListener('storage', (e) => {
    if (e.key === DB_KEY) {
      checkAuthGate();
      renderPageContent();
    }
  });

  window.addEventListener('storage_updated', () => {
    renderPageContent();
  });
});

function setupListenersByPage() {
  // Header deposit btn listener (shared on betting, tournament, profile)
  const depHeaderBtn = document.getElementById('header-deposit-btn');
  if (depHeaderBtn) {
    depHeaderBtn.addEventListener('click', () => openModal('deposit-modal'));
  }

  // General closeModal button binders
  document.querySelectorAll('.modal-close').forEach(btn => {
    btn.onclick = (e) => {
      const modal = e.target.closest('.modal-overlay');
      if (modal) closeModal(modal.id);
    };
  });

  if (currentPage === 'index.html') {
    // Login form logic
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleLoginSubmit();
      });
    }

    // Register form logic
    const regForm = document.getElementById('register-form');
    if (regForm) {
      regForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handleRegisterSubmit();
      });
    }

    // Wheel Spin
    const spinBtn = document.getElementById('wheel-spin-btn');
    if (spinBtn) {
      spinBtn.addEventListener('click', spinWheel);
    }
  }

  if (currentPage === 'betting.html') {
    // Betslip slip placing logic
    const betslipForm = document.getElementById('betslip-form');
    if (betslipForm) {
      betslipForm.addEventListener('submit', (e) => {
        e.preventDefault();
        placeBetslipBet();
      });
    }

    // Promo forms inside betting lobby
    const promoForm = document.getElementById('betslip-promo-form');
    if (promoForm) {
      promoForm.addEventListener('submit', (e) => {
        e.preventDefault();
        handlePromoSubmit();
      });
    }

    // Deposit verification submits
    const trcForm = document.getElementById('trc-deposit-form');
    if (trcForm) {
      trcForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const amt = parseFloat(document.getElementById('trc-amount').value);
        const tx = document.getElementById('trc-txid').value.trim();
        startDepositVerify(amt, "USDT TRC20", tx);
      });
    }

    const monoForm = document.getElementById('mono-deposit-form');
    if (monoForm) {
      monoForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const amt = parseFloat(document.getElementById('mono-amount').value);
        const name = document.getElementById('mono-sender-name').value.trim();
        startDepositVerify(amt, "MONOBANKA", name);
      });
    }
  }

  if (currentPage === 'profile.html') {
    // Deposit verification submits
    const trcForm = document.getElementById('trc-deposit-form');
    if (trcForm) {
      trcForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const amt = parseFloat(document.getElementById('trc-amount').value);
        const tx = document.getElementById('trc-txid').value.trim();
        startDepositVerify(amt, "USDT TRC20", tx);
      });
    }

    const monoForm = document.getElementById('mono-deposit-form');
    if (monoForm) {
      monoForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const amt = parseFloat(document.getElementById('mono-amount').value);
        const name = document.getElementById('mono-sender-name').value.trim();
        startDepositVerify(amt, "MONOBANKA", name);
      });
    }
  }

  if (currentPage === 'my-bets.html') {
    // Deposit verification submits
    const trcForm = document.getElementById('trc-deposit-form');
    if (trcForm) {
      trcForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const amt = parseFloat(document.getElementById('trc-amount').value);
        const tx = document.getElementById('trc-txid').value.trim();
        startDepositVerify(amt, "USDT TRC20", tx);
      });
    }

    const monoForm = document.getElementById('mono-deposit-form');
    if (monoForm) {
      monoForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const amt = parseFloat(document.getElementById('mono-amount').value);
        const name = document.getElementById('mono-sender-name').value.trim();
        startDepositVerify(amt, "MONOBANKA", name);
      });
    }
  }

  if (currentPage === 'shop.html' || currentPage === 'tournament.html') {
    // Deposit verification submits
    const trcForm = document.getElementById('trc-deposit-form');
    if (trcForm) {
      trcForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const amt = parseFloat(document.getElementById('trc-amount').value);
        const tx = document.getElementById('trc-txid').value.trim();
        startDepositVerify(amt, "USDT TRC20", tx);
      });
    }

    const monoForm = document.getElementById('mono-deposit-form');
    if (monoForm) {
      monoForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const amt = parseFloat(document.getElementById('mono-amount').value);
        const name = document.getElementById('mono-sender-name').value.trim();
        startDepositVerify(amt, "MONOBANKA", name);
      });
    }
  }
}

// Render dynamic components based on which page is open
function renderPageContent() {
  const db = getDB();
  
  // Render shared header values if present (pages: betting, tournament, profile, admin)
  const balanceVal = document.getElementById('header-balance-value');
  const withdrawBtn = document.getElementById('header-withdraw-btn');
  if (db.currentUser) {
    const user = db.users.find(u => u.username === db.currentUser);
    if (user) {
      if (balanceVal) {
        balanceVal.innerText = user.balance;
      }
      if (withdrawBtn) {
        withdrawBtn.style.background = '';
        withdrawBtn.style.borderColor = '';
        withdrawBtn.style.color = '';
        if (user.balance >= 2000) {
          withdrawBtn.classList.remove('btn-secondary');
        } else {
          withdrawBtn.classList.add('btn-secondary');
        }
      }
    }
  }

  // Toggle Admin link visibility in header if current user is admin
  const adminLink = document.getElementById('nav-admin-link');
  if (adminLink) {
    adminLink.style.display = db.currentUser === 'admin' ? 'inline-flex' : 'none';
  }

  // Page Specific Content Render
  if (currentPage === 'betting.html') {
    renderTwitchEmbed(db.activeTwitchChannel, db.twitchStatus || "live");
    renderTwitchChat(db.activeTwitchChannel, db.twitchStatus || "live");
    renderBettingMatches(db.matches);
    renderLiveMatchStats(db);
    renderDailyQuests();
    renderSkinsShop();
  }

  
  if (currentPage === 'profile.html') {
    renderProfileDashboard();
  }

  if (currentPage === 'my-bets.html') {
    renderMyBetsPage();
  }

  if (currentPage === 'tournament.html') {
    renderTournamentsPortal();
  }


}

// ==========================================
// PAGE ACTIONS: index.html
// ==========================================

// Handle Login Form Submit
function handleLoginSubmit() {
  const db = getDB();
  const inputVal = document.getElementById('login-username').value.trim().toLowerCase();
  const password = document.getElementById('login-password').value;

  if (!inputVal || !password) {
    showToast("Введіть юзернейм/пошту та пароль!", "error");
    return;
  }

  // Find by username OR email
  const user = db.users.find(u =>
    u.username === inputVal || u.email.toLowerCase() === inputVal
  );

  if (!user) {
    showToast("Користувача з таким нікнеймом або поштою не знайдено!", "error");
    return;
  }

  if (user.password !== password) {
    showToast("Невірний пароль!", "error");
    return;
  }

  db.currentUser = user.username;
  if (!user.loginHistory) user.loginHistory = [];
  user.loginHistory.unshift({
    date: new Date().toLocaleString(),
    device: getBrowserDeviceInfo(),
    type: "login"
  });
  sessionStorage.setItem('logged_visit_' + user.username, 'true');
  
  saveDB(db).finally(() => {
    setTimeout(() => {
      window.location.href = 'betting.html';
    }, 800);
  });
  showToast(`Вітаємо назад, ${user.username.toUpperCase()}!`, "success");
}

// Handle Registration Form Submit
async function handleRegisterSubmit() {
  const email = document.getElementById('reg-email').value.trim();
  const username = document.getElementById('reg-username').value.trim().toLowerCase();
  const password = document.getElementById('reg-password').value;
  const passwordConfirm = document.getElementById('reg-password-confirm').value;

  if (!email || !username || !password || !passwordConfirm) {
    showToast("Заповніть всі обов'язкові поля!", "error");
    return;
  }

  if (password.length < 6) {
    showToast("Пароль повинен містити мінімум 6 символів!", "error");
    return;
  }

  if (password !== passwordConfirm) {
    showToast("Паролі не збігаються!", "error");
    return;
  }

  // Visual feedback to prevent double-clicks
  const submitBtn = document.querySelector('#register-form .auth-submit-btn');
  const originalBtnText = submitBtn.innerText;
  submitBtn.disabled = true;
  submitBtn.innerText = "ПЕРЕВІРКА ДАНИХ...";

  let latestUsers = [];
  try {
    // Force pull fresh database users list from KVDB to prevent race-condition duplicates
    const res = await fetch(CLOUD_BUCKET + 'users', { cache: 'no-store' });
    if (res.ok) {
      latestUsers = await res.json();
    }
  } catch (e) {
    console.error("Помилка синхронізації при перевірці дублікатів:", e);
  }

  const db = getDB();
  
  // Merge cloud users into local database to keep them synced
  if (Array.isArray(latestUsers)) {
    let dbChanged = false;
    latestUsers.forEach(cu => {
      const luIdx = db.users.findIndex(u => u.username.toLowerCase() === cu.username.toLowerCase());
      if (luIdx === -1) {
        db.users.push(cu);
        dbChanged = true;
      } else {
        const lu = db.users[luIdx];
        if (lu.email !== cu.email || lu.password !== cu.password || lu.balance !== cu.balance) {
          lu.email = cu.email;
          lu.password = cu.password;
          lu.balance = cu.balance;
          dbChanged = true;
        }
      }
    });
    if (dbChanged) {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
    }
  }

  const checkUsers = (Array.isArray(latestUsers) && latestUsers.length > 0) ? latestUsers : db.users;

  // Check duplicate username
  const duplicate = checkUsers.find(u => u.username === username);
  if (duplicate) {
    showToast("Цей нікнейм вже зайнятий!", "error");
    submitBtn.disabled = false;
    submitBtn.innerText = originalBtnText;
    return;
  }

  // Check duplicate email
  const dupEmail = checkUsers.find(u => u.email && u.email.toLowerCase() === email.toLowerCase());
  if (dupEmail) {
    showToast("Ця пошта вже зареєстрована!", "error");
    submitBtn.disabled = false;
    submitBtn.innerText = originalBtnText;
    return;
  }

  // Add User
  const newUser = {
    email: email,
    username: username,
    password: password,
    balance: 50,
    bonusPercent: 0,
    hasSpunWheel: false,
    usedPromos: [],
    depositHistory: [],
    betHistory: [],
    claimedQuests: [],
    skinsInventory: [],
    loginHistory: [{
      date: new Date().toLocaleString(),
      device: getBrowserDeviceInfo(),
      type: "register"
    }]
  };

  db.users.push(newUser);
  db.currentUser = username;
  sessionStorage.setItem('logged_visit_' + username, 'true');
  
  await saveDB(db);

  submitBtn.disabled = false;
  submitBtn.innerText = originalBtnText;

  showToast("Акаунт створено! Ви отримали 50 поінтів.", "success");

  // Show Wheel of fortune immediately
  openModal('wheel-modal');
  renderWheelCanvas();
}

// Wheel of Fortune elements
const sectors = [
  { text: "+5% БОНУС", color: "#ff5a00", type: "percent", val: 5 },
  { text: "+5 МОНЕТ", color: "#181922", type: "coins", val: 5 },
  { text: "+20% БОНУС", color: "#ff1a40", type: "percent", val: 20 },
  { text: "СПРОБУЙ ЩЕ", color: "#2c2f3f", type: "nothing", val: 0 },
  { text: "+10% БОНУС", color: "#ff5a00", type: "percent", val: 10 },
  { text: "+15 МОНЕТ", color: "#181922", type: "coins", val: 15 }
];

function renderWheelCanvas(currentAngle = 0) {
  const canvas = document.getElementById('wheel-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const radius = width / 2;

  ctx.clearRect(0,0,width,width);

  const arc = (2 * Math.PI) / sectors.length;

  ctx.save();
  ctx.translate(radius, radius);
  ctx.rotate(currentAngle);
  ctx.translate(-radius, -radius);

  sectors.forEach((sec, i) => {
    const angle = i * arc;
    ctx.beginPath();
    ctx.fillStyle = sec.color;
    ctx.moveTo(radius, radius);
    ctx.arc(radius, radius, radius - 4, angle, angle + arc);
    ctx.lineTo(radius, radius);
    ctx.fill();
    ctx.strokeStyle = "#2c2f3f";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.save();
    ctx.translate(radius, radius);
    ctx.rotate(angle + arc / 2);
    ctx.textAlign = "right";
    ctx.fillStyle = "white";
    ctx.font = "bold 13px 'Outfit', sans-serif";
    ctx.fillText(sec.text, radius - 30, 4);
    ctx.restore();
  });

  ctx.restore();
}

let spinning = false;
let currentAngle = 0;
function spinWheel() {
  if (spinning) return;
  const db = getDB();
  const user = db.users.find(u => u.username === db.currentUser);
  if (!user || user.hasSpunWheel) {
    showToast("Спін вже використано!", "error");
    closeModal('wheel-modal');
    window.location.href = 'betting.html';
    return;
  }

  spinning = true;
  user.hasSpunWheel = true;
  saveDB(db); // Lock database hasSpun state immediately

  const winIdx = Math.floor(Math.random() * sectors.length);
  const sectorAngle = (2 * Math.PI) / sectors.length;
  // Calculate target angle to align the center of the winning slice with the top indicator (12 o'clock / 1.5 * Math.PI)
  const targetAngle = (1.5 * Math.PI) - (winIdx * sectorAngle + sectorAngle / 2) + (2 * Math.PI * 8); // 8 full spins for premium speed

  const spinBtn = document.getElementById('wheel-spin-btn');
  if (spinBtn) {
    spinBtn.disabled = true;
    spinBtn.innerText = "ОБЕРТАННЯ...";
  }

  const duration = 5000; // 5 seconds spin
  const start = performance.now();
  const startAngle = currentAngle % (2 * Math.PI);

  function animate(time) {
    const elapsed = time - start;
    const progress = Math.min(elapsed / duration, 1);
    
    // Ease out cubic easing
    const ease = 1 - Math.pow(1 - progress, 3);
    
    currentAngle = startAngle + ease * (targetAngle - startAngle);
    
    renderWheelCanvas(currentAngle);

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      spinning = false;
      const prize = sectors[winIdx];
      
      // Get fresh DB ref
      const freshDb = getDB();
      const freshUser = freshDb.users.find(u => u.username === freshDb.currentUser);

      if (prize.type === 'percent') {
        freshUser.bonusPercent = (freshUser.bonusPercent || 0) + prize.val;
        showToast(`Вітаємо! Нараховано +${prize.val}% до наступного депозиту!`, "success");
      } else if (prize.type === 'coins') {
        freshUser.balance += prize.val;
        showToast(`Вітаємо! Нараховано +${prize.val} монет 🪙!`, "success");
      } else {
        showToast("СПРОБУЙ ЩЕ! Бажаємо успіху наступного разу!", "success");
      }

      saveDB(freshDb);

      setTimeout(() => {
        closeModal('wheel-modal');
        window.location.href = 'betting.html';
      }, 1800);
    }
  }

  requestAnimationFrame(animate);
}

// ==========================================
// PAGE ACTIONS: betting.html (GGBet portal)
// ==========================================

// Twitch Embed loader
let twitchChannelCache = "";
let twitchStatusCache = "";
function renderTwitchEmbed(channelName, status = "live") {
  if (twitchChannelCache === channelName && twitchStatusCache === status) return;
  const target = document.getElementById('twitch-player');
  if (!target) return;
  target.innerHTML = "";

  if (status === "offline") {
    target.innerHTML = `
      <div class="stream-offline-placeholder">
        <div class="stream-offline-logo">
          <img src="assets/wolf_logo.png" style="width:100%; height:100%; object-fit:contain; filter: grayscale(1) opacity(0.35);">
        </div>
        <h3 style="color:var(--text-secondary); text-transform:uppercase; font-size:14px; font-weight:800; margin-top:10px;">СТРІМ ОФЛАЙН</h3>
        <p style="font-size:11px; color:rgba(255,255,255,0.3); margin-top:5px;">Трансляція наразі призупинена. Слідкуйте за анонсами наступних матчів!</p>
      </div>
    `;
    twitchChannelCache = "";
    twitchStatusCache = "offline";
    return;
  }

  const iframe = document.createElement('iframe');
  const host = window.location.hostname || "localhost";
  iframe.src = `https://player.twitch.tv/?channel=${channelName}&parent=${host}&autoplay=true&muted=true`;
  iframe.allowFullscreen = true;
  iframe.scrolling = "no";
  target.appendChild(iframe);
  twitchChannelCache = channelName;
  twitchStatusCache = "live";
}

// Twitch Chat loader
let twitchChatChannelCache = "";
let twitchChatStatusCache = "";
function renderTwitchChat(channelName, status = "live") {
  if (twitchChatChannelCache === channelName && twitchChatStatusCache === status) return;
  const panel = document.querySelector('.live-chat-panel');
  if (!panel) return;
  panel.innerHTML = "";

  if (status === "offline") {
    panel.innerHTML = `
      <div class="chat-header">🔴 Живий Чат Стріму</div>
      <div style="flex:1; display:flex; flex-direction:column; justify-content:center; align-items:center; padding:20px; color:var(--text-secondary); text-align:center; height:100%; min-height:280px; background: rgba(12, 13, 18, 0.65);">
        <span style="font-size: 24px; margin-bottom:10px;">💬</span>
        <div style="font-size:12px; font-weight:bold; color: var(--text-secondary);">ЧАТ ОФЛАЙН</div>
        <div style="font-size:10px; opacity:0.5; margin-top:5px; color: var(--text-muted);">Приєднуйтесь, коли почнеться трансляція!</div>
      </div>
    `;
    twitchChatChannelCache = "";
    twitchChatStatusCache = "offline";
    return;
  }

  const host = window.location.hostname || "localhost";
  
  const header = document.createElement('div');
  header.className = "chat-header";
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";
  header.innerHTML = `
    <span>🔴 Живий Чат (${channelName})</span>
    <a href="https://twitch.tv/${channelName}" target="_blank" style="color: var(--cs-orange); text-decoration: none; font-size: 10px; font-weight: bold;">twitch.tv</a>
  `;

  const iframeContainer = document.createElement('div');
  iframeContainer.style.flex = "1";
  iframeContainer.style.height = "calc(100% - 38px)";
  iframeContainer.style.minHeight = "350px";
  
  const iframe = document.createElement('iframe');
  iframe.src = `https://www.twitch.tv/embed/${channelName}/chat?parent=${host}&darkpopout`;
  iframe.style.border = "none";
  iframe.style.width = "100%";
  iframe.style.height = "100%";
  
  iframeContainer.appendChild(iframe);
  panel.appendChild(header);
  panel.appendChild(iframeContainer);

  twitchChatChannelCache = channelName;
  twitchChatStatusCache = "live";
}


// Render list of active/upcoming matches in lobby
function renderBettingMatches(matches) {
  const container = document.getElementById('live-matches-list');
  if (!container) return;
  container.innerHTML = "";

  if (matches.length === 0) {
    container.innerHTML = `<div style="color:var(--text-secondary); text-align:center; padding: 20px;">Немає матчів на даний момент</div>`;
    return;
  }

  matches.forEach(match => {
    const isLive = match.status === 'live';
    const isFrozen = match.isFrozen;

    const div = document.createElement('div');
    div.className = "match-card";
    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; font-size:11px; color:var(--text-secondary); margin-bottom: 10px;">
        <span>Counter-Strike 2 • ${match.status.toUpperCase()}</span>
        ${isLive ? `<span style="color:var(--wolf-red); font-weight:800; animation: pulse-red 1s infinite;">● LIVE</span>` : ''}
      </div>

      <div style="display:grid; grid-template-columns: 1.2fr auto 1.2fr; align-items:center; text-align:center; margin-bottom:12px;">
        <div>
          <div style="font-weight:800; font-size:15px;">${match.team1}</div>
          <div style="font-size:10px; color:var(--text-secondary); margin-top:2px;">${match.players1.join(', ')}</div>
        </div>

        <div style="background-color:var(--bg-input); font-weight:900; font-size:20px; padding: 4px 14px; border-radius:6px; color:var(--cs-orange); border: 1px solid var(--border-color);">
          ${match.score1} : ${match.score2}
        </div>

        <div>
          <div style="font-weight:800; font-size:15px;">${match.team2}</div>
          <div style="font-size:10px; color:var(--text-secondary); margin-top:2px;">${match.players2.join(', ')}</div>
        </div>
      </div>

      <div class="odds-layout">
        ${isFrozen ? `
          <div style="grid-column: 1 / span 3; background-color:rgba(255,26,64,0.1); border:1px solid var(--wolf-red); color:var(--wolf-red); font-weight:800; text-align:center; padding: 10px; border-radius:8px; font-size:12px; text-transform:uppercase; letter-spacing:0.5px;">
            КОЕФІЦІЄНТИ ЗАМОРОЖЕНІ
          </div>
        ` : `
          <button class="odds-btn" onclick="selectBetodds('${match.id}', 1, ${match.coef1}, '${match.team1}')">
            <span>${match.team1}</span>
            <strong>${match.coef1.toFixed(2)}</strong>
          </button>
          
          <div class="odds-vs">VS</div>
          
          <button class="odds-btn" onclick="selectBetodds('${match.id}', 2, ${match.coef2}, '${match.team2}')">
            <span>${match.team2}</span>
            <strong>${match.coef2.toFixed(2)}</strong>
          </button>
        `}
      </div>
    `;
    container.appendChild(div);
  });
}

// Select betodds coefficient and play eyes animation
window.selectBetodds = function(matchId, teamIndex, odds, teamName) {
  if (currentPage !== 'betting.html') {
    // Redirect to betting.html with query parameters to select this bet
    window.location.href = `betting.html?selectMatch=${matchId}&teamIndex=${teamIndex}&odds=${odds}&teamName=${encodeURIComponent(teamName)}`;
    return;
  }

  const db = getDB();
  
  // Trigger wolf eyes flashing keyframes
  const eyeL = document.getElementById('wolf-eye-l');
  const eyeR = document.getElementById('wolf-eye-r');
  if (eyeL && eyeR) {
    eyeL.classList.remove('wolf-eyes-glowing');
    eyeR.classList.remove('wolf-eyes-glowing');
    void eyeL.offsetWidth; // Trigger reflow
    eyeL.classList.add('wolf-eyes-glowing');
    eyeR.classList.add('wolf-eyes-glowing');
    
    // Stop eyes glow after 2 seconds
    setTimeout(() => {
      eyeL.classList.remove('wolf-eyes-glowing');
      eyeR.classList.remove('wolf-eyes-glowing');
    }, 2000);
  }

  const match = db.matches.find(m => m.id === matchId);
  if (!match) return;

  activeBet = {
    matchId: match.id,
    teamIndex: teamIndex,
    odds: odds,
    teamName: teamName,
    matchDisplay: `${match.team1} vs ${match.team2}`
  };

  // Toggle slip card displays (GGBet-style right panel card)
  document.getElementById('betslip-empty-state').style.display = 'none';
  const activeSlip = document.getElementById('active-betslip-panel');
  activeSlip.style.display = 'block';

  document.getElementById('slip-match-teams-txt').innerText = activeBet.matchDisplay;
  document.getElementById('slip-pick-team-txt').innerText = activeBet.teamName;
  document.getElementById('slip-odds-txt').innerText = activeBet.odds.toFixed(2);

  const amountInput = document.getElementById('betslip-amount-input');
  amountInput.value = "";
  document.getElementById('slip-est-win-txt').innerText = "0 монет";

  amountInput.oninput = () => {
    const val = parseFloat(amountInput.value) || 0;
    document.getElementById('slip-est-win-txt').innerText = `${Math.round(val * activeBet.odds)} монет`;
  };
};

// Clear Bet Selection
window.clearBetslip = function() {
  activeBet = null;
  document.getElementById('betslip-empty-state').style.display = 'block';
  document.getElementById('active-betslip-panel').style.display = 'none';
};

// Place Bet slip logic
function placeBetslipBet() {
  if (!activeBet) return;
  const db = getDB();
  const user = db.users.find(u => u.username === db.currentUser);
  if (!user) return;

  const amt = parseFloat(document.getElementById('betslip-amount-input').value);

  // Validate limits
  if (isNaN(amt) || amt <= 0) {
    showToast("Введіть коректну суму!", "error");
    return;
  }

  if (amt > user.balance) {
    showToast(`Недостатньо поінтів! Ваш баланс: ${user.balance}`, "error");
    return;
  }

  if (amt > 10000) {
    showToast("Максимальна ставка обмежена до 10 000 монет!", "error");
    return;
  }

  // Deduct
  user.balance -= amt;
  
  const record = {
    matchId: activeBet.matchId,
    matchDisplay: activeBet.matchDisplay,
    selectedTeam: activeBet.teamName,
    teamIndex: activeBet.teamIndex,
    amount: amt,
    odds: activeBet.odds,
    status: "В грі",
    date: new Date().toLocaleString()
  };

  user.betHistory.unshift(record);
  saveDB(db);

  showToast(`Ставку на суму ${amt} монет на ${activeBet.teamName} прийнято!`, "success");
  clearBetslip();
  renderPageContent();
}

// Promo submit handler in betting lobby
function handlePromoSubmit() {
  const db = getDB();
  const user = db.users.find(u => u.username === db.currentUser);
  if (!user) return;

  const input = document.getElementById('betslip-promo-input');
  const code = input.value.trim().toUpperCase();

  if (!code) return;

  if (!user.usedPromos) {
    user.usedPromos = [];
  }

  if (user.usedPromos.includes(code)) {
    showToast("Цей промокод вже активовано!", "error");
    return;
  }

  let reward = 0;
  if (code === 'VOLCHARA20') {
    reward = 20;
  } else if (code === 'REX15') {
    reward = 15;
  } else {
    // Check dynamic promocodes from database
    const dynamicPromo = (db.promocodes || []).find(p => p.code === code);
    if (dynamicPromo) {
      reward = dynamicPromo.reward;
    } else {
      showToast("Недійсний промокод!", "error");
      return;
    }
  }

  user.balance = (user.balance || 0) + reward;
  user.usedPromos.push(code);
  saveDB(db);

  showToast(`Промокод активовано! Нараховано +${reward} 🪙 на ваш баланс.`, "success");
  input.value = "";
  renderPageContent();
}

// Payment method tab switching
window.switchPaymentTab = function(method) {
  document.getElementById('dep-tab-trc').classList.remove('active');
  document.getElementById('dep-tab-mono').classList.remove('active');
  document.getElementById('payment-trc').classList.remove('active');
  document.getElementById('payment-mono').classList.remove('active');

  document.getElementById(`dep-tab-${method}`).classList.add('active');
  document.getElementById(`payment-${method}`).classList.add('active');
};

// Start deposit loader verify sequence (7 seconds)
// Start deposit loader verify sequence
async function startDepositVerify(amount, method, references) {
  if (isNaN(amount) || amount < 500) {
    showToast("Мінімальне поповнення становить 500 монет!", "error");
    return;
  }

  if (!references) {
    showToast("Заповніть поле верифікації переказу!", "error");
    return;
  }

  const db = getDB();

  if (method === "MONOBANKA") {
    // Semi-automatic verification via pending request
    closeModal('deposit-modal');
    
    // Create pending request
    const pendingRequest = {
      id: "dep_" + Date.now(),
      username: db.currentUser,
      amount: amount,
      method: "MONOBANKA",
      reference: references, // sender name
      date: new Date().toLocaleString(),
      status: "pending",
      isRead: false
    };

    db.pendingDeposits = db.pendingDeposits || [];
    db.pendingDeposits.push(pendingRequest);
    
    // Send to cloud database
    showToast("Надсилання запиту...", "success");
    await saveDB(db);
    
    // Clear inputs
    document.getElementById('mono-amount').value = "";
    document.getElementById('mono-sender-name').value = "";
    
    // Show toast about operator review
    showToast("Запит надіслано! Зарахування відбудеться після перевірки оператором.", "success");
    return;
  }

  if (method === "USDT TRC20") {
    const txid = references.trim();
    
    // Check double spend locally first
    db.usedTxids = db.usedTxids || [];
    if (db.usedTxids.includes(txid)) {
      showToast("Цей хеш транзакції вже був використаний!", "error");
      return;
    }

    closeModal('deposit-modal');
    openModal('verify-loader');

    const fill = document.getElementById('loader-fill');
    const status = document.getElementById('loader-status');
    const step = document.getElementById('loader-step');

    const updates = [
      { pct: 15, state: "Авторизація платежу...", detail: "Пошук хешу в блокчейні Tron... (Крок 1/4)" },
      { pct: 45, state: "Аналіз блоків...", detail: "Верифікація одержувача та суми... (Крок 2/4)" },
      { pct: 75, state: "Перевірка підтверджень...", detail: "Отримання консенсусу мережі... (Крок 3/4)" },
      { pct: 95, state: "Зарахування поінтів...", detail: "Фіналізація транзакції... (Крок 4/4)" }
    ];

    let currentIdx = 0;
    let counter = 0;

    const timer = setInterval(async () => {
      counter += 2.5;
      if (counter > 100) counter = 100;

      fill.style.width = `${counter}%`;

      if (counter >= 15 && counter < 45) currentIdx = 0;
      else if (counter >= 45 && counter < 75) currentIdx = 1;
      else if (counter >= 75 && counter < 95) currentIdx = 2;
      else if (counter >= 95) currentIdx = 3;

      status.innerText = updates[currentIdx].state;
      step.innerText = updates[currentIdx].detail;

      if (counter >= 100) {
        clearInterval(timer);
        
        status.innerText = "Зв'язок з блокчейном...";
        step.innerText = "Отримання фінальних даних...";
        
        // Run blockchain check
        const check = await verifyUSDTTRC20(txid, amount);
        if (check.success) {
          // Double check if TxID got used during the loader time
          const freshDb = getDB();
          freshDb.usedTxids = freshDb.usedTxids || [];
          if (freshDb.usedTxids.includes(txid)) {
            closeModal('verify-loader');
            showToast("Транзакція вже була використана!", "error");
            return;
          }
          
          freshDb.usedTxids.push(txid);
          localStorage.setItem(DB_KEY, JSON.stringify(freshDb)); // Save hash to prevent double spends instantly
          
          applyDepositAmount(amount, method);
        } else {
          closeModal('verify-loader');
          showToast(check.error, "error");
        }
      }
    }, 100);
  }
}

// Tron Blockchain Verification Helper
async function verifyUSDTTRC20(txid, amount) {
  try {
    const res = await fetch(`https://apilist.tronscanapi.com/api/transaction-info?hash=${txid}`);
    if (!res.ok) {
      throw new Error("Не вдалося зв'язатися з Tronscan API");
    }
    const data = await res.json();
    
    if (!data || !data.hash) {
      throw new Error("Транзакцію не знайдено в блокчейні Tron! Перевірте TxID.");
    }
    
    if (data.contractRet !== "SUCCESS") {
      throw new Error("Транзакція завершилася помилкою в мережі Tron.");
    }
    
    if (!data.confirmed) {
      throw new Error("Транзакція ще не підтверджена мережею Tron. Зачекайте 1 хвилину.");
    }
    
    const transfers = data.trc20TransferInfo || [];
    const usdtTransfer = transfers.find(t => 
      t.to_address === "TL1fdPAkGugPVYAtVyZdcejT3wfEGE1vhH" &&
      t.token_address === "TR7NHqJEJMxWf6P615w8Z5sb275w8X346JM"
    );
    
    if (!usdtTransfer) {
      throw new Error("Транзакція не містить переказу USDT на ваш гаманець (TL1fdPAkGugPVYAtVyZdcejT3wfEGE1vhH).");
    }
    
    const rawAmt = parseFloat(usdtTransfer.amount_str || usdtTransfer.amount);
    const decimals = usdtTransfer.decimals || 6;
    const verifiedUSDT = rawAmt / Math.pow(10, decimals);
    
    if (Math.abs(verifiedUSDT - amount) > 0.05) {
      throw new Error(`Сума переказу в транзакції (${verifiedUSDT} USDT) не збігається з введеною (${amount} USDT).`);
    }
    
    const txTime = data.timestamp;
    if (Date.now() - txTime > 24 * 60 * 60 * 1000) {
      throw new Error("Транзакція занадто стара (минуло більше 24 годин).");
    }
    
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message || "Помилка верифікації транзакції" };
  }
}

// Complete deposit verify and credit coins
function applyDepositAmount(amount, method) {
  const db = getDB();
  const user = db.users.find(u => u.username === db.currentUser);
  if (!user) return;

  const multiplier = 1 + (user.bonusPercent || 0) / 100;
  const creditedCoins = Math.round(amount * multiplier);

  user.balance += creditedCoins;
  user.depositHistory.unshift({
    amount: creditedCoins,
    method: method,
    date: new Date().toLocaleString()
  });

  const bonusUsed = user.bonusPercent;
  user.bonusPercent = 0; // Consume bonus percentage

  saveDB(db);
  closeModal('verify-loader');

  // Clear inputs
  document.getElementById('trc-amount').value = "";
  document.getElementById('trc-txid').value = "";
  document.getElementById('mono-amount').value = "";
  document.getElementById('mono-sender-name').value = "";

  showToast(`Депозит верифіковано! Зараховано +${creditedCoins} 🪙 (Бонус +${bonusUsed}%)`, "success");
  renderPageContent();
}

// ==========================================
// PAGE ACTIONS: profile.html
// ==========================================

// Render profile data statistics & log grids
function renderProfileDashboard() {
  const db = getDB();
  const user = db.users.find(u => u.username === db.currentUser);
  if (!user) return;

  // Identity cards
  document.getElementById('prof-username').innerText = user.username.toUpperCase();
  document.getElementById('prof-email').innerText = user.email;

  // Values boxes
  document.getElementById('prof-balance').innerText = `${user.balance} 🪙`;
  document.getElementById('prof-bonus').innerText = `+${user.bonusPercent || 0}%`;

  // Calculate Rank XP
  const totalBetsCount = user.betHistory.length;
  const totalDuelsCount = user.betHistory.filter(b => b.matchDisplay && b.matchDisplay.includes("1v1")).length;
  const totalXp = (totalBetsCount * 20) + (totalDuelsCount * 15);

  const RANKS = [
    { name: "Silver I", minXp: 0 },
    { name: "Silver Elite Master", minXp: 100 },
    { name: "Gold Nova I", minXp: 250 },
    { name: "Gold Nova Master", minXp: 500 },
    { name: "Master Guardian I", minXp: 800 },
    { name: "Master Guardian Elite", minXp: 1200 },
    { name: "Legendary Eagle Master", minXp: 1800 },
    { name: "Supreme Master First Class", minXp: 2500 },
    { name: "The Global Elite", minXp: 3500 }
  ];

  let currentRank = RANKS[0];
  let nextRank = RANKS[1];
  for (let i = RANKS.length - 1; i >= 0; i--) {
    if (totalXp >= RANKS[i].minXp) {
      currentRank = RANKS[i];
      nextRank = RANKS[i + 1] || null;
      break;
    }
  }

  const badge = document.getElementById('user-cs2-rank-badge');
  const xpCurrent = document.getElementById('user-xp-current');
  const xpNext = document.getElementById('user-xp-next');
  const xpPercent = document.getElementById('user-xp-percent');
  const xpFill = document.getElementById('user-xp-fill');

  if (badge) {
    badge.innerText = currentRank.name;
    if (nextRank) {
      const needed = nextRank.minXp - currentRank.minXp;
      const progress = totalXp - currentRank.minXp;
      const pct = Math.min(Math.round((progress / needed) * 100), 100);
      xpCurrent.innerText = totalXp;
      xpNext.innerText = nextRank.minXp;
      xpPercent.innerText = `${pct}%`;
      xpFill.style.width = `${pct}%`;
    } else {
      xpCurrent.innerText = totalXp;
      xpNext.innerText = "MAX";
      xpPercent.innerText = "100%";
      xpFill.style.width = "100%";
    }
  }

  // Render Faceit binding box
  const faceitContainer = document.getElementById('faceit-binding-container');
  if (faceitContainer) {
    if (user.linkedFaceitName) {
      faceitContainer.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="color:white; font-size:14px;">${user.linkedFaceitName}</strong>
            <span class="rank-badge-inline" style="background-color:#ff5500; color:white; border-color:#ff5500; font-size:11px;">LVL ${user.faceitLevel || 6}</span>
          </div>
          
          <div class="xp-container" style="padding:10px; border-radius:6px; background-color:var(--bg-card); border:1px solid var(--border-color);">
            <div class="xp-header" style="font-size:10px; margin-bottom:4px;">
              <span>XP до наступного рівня</span>
              <span>${user.faceitElo || 1550} / 1700 ELO</span>
            </div>
            <div class="xp-bar" style="height:6px; background-color:var(--bg-darker); border-radius:4px; overflow:hidden;">
              <div class="xp-fill" style="width: 75%; background:#ff5500; height:100%;"></div>
            </div>
          </div>

          <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:6px; text-align:center; font-size:11px; margin-top:5px;">
            <div style="background:var(--bg-input); padding:6px; border-radius:4px;">
              <div style="color:var(--text-secondary); font-size:9px;">K/D RATIO</div>
              <strong style="color:white;">${user.faceitKD || '1.18'}</strong>
            </div>
            <div style="background:var(--bg-input); padding:6px; border-radius:4px;">
              <div style="color:var(--text-secondary); font-size:9px;">WINRATE</div>
              <strong style="color:white;">${user.faceitWinrate || '54%'}</strong>
            </div>
            <div style="background:var(--bg-input); padding:6px; border-radius:4px;">
              <div style="color:var(--text-secondary); font-size:9px;">HEADSHOT %</div>
              <strong style="color:white;">${user.faceitHS || '48%'}</strong>
            </div>
          </div>

          <button class="btn btn-danger" onclick="unlinkFaceit()" style="width:100%; padding:6px; font-size:9px; margin-top:8px;">Відв'язати акаунт</button>
        </div>
      `;
    } else {
      faceitContainer.innerHTML = `
        <form id="faceit-bind-form" onsubmit="event.preventDefault(); bindFaceitAccount();" style="display:flex; flex-direction:column; gap:8px;">
          <input type="text" id="faceit-name-input" class="form-input" placeholder="Введіть нікнейм FACEIT" required style="padding:8px; font-size:12px;">
          <button type="submit" class="btn" style="width:100%; padding:8px; font-size:11px; background:#ff5500;">ЗВ'ЯЗАТИ АКАУНТ</button>
        </form>
      `;
    }
  }

  // Render Skins Inventory list
  const invContainer = document.getElementById('inventory-skins-list');
  if (invContainer) {
    invContainer.innerHTML = "";
    const inventory = user.skinsInventory || [];
    if (inventory.length === 0) {
      invContainer.innerHTML = `<div style="grid-column: 1 / -1; text-align:center; color:var(--text-secondary); padding:20px; font-size:12px;">Ваш інвентар порожній. Купуйте скіни в Магазині на сторінці ставок!</div>`;
    } else {
      inventory.forEach(item => {
        const div = document.createElement('div');
        div.className = "inventory-item";
        div.innerHTML = `
          <div style="font-size:24px;">${item.emoji}</div>
          <div style="font-size:10px; color:white; text-align:center; overflow:hidden; text-overflow:ellipsis; width:100%; white-space:nowrap;" title="${item.name}">${item.name}</div>
        `;
        invContainer.appendChild(div);
      });
    }
  }

  // Net Profit formula
  const betsSpent = user.betHistory.reduce((acc, c) => acc + c.amount, 0);
  const betsPayout = user.betHistory.reduce((acc, c) => acc + (c.payout || 0), 0);
  const profitVal = betsPayout - betsSpent;

  const profitDisplay = document.getElementById('prof-stat-net-profit');
  profitDisplay.innerText = `${profitVal > 0 ? '+' : ''}${profitVal} 🪙`;
  profitDisplay.style.color = profitVal >= 0 ? 'var(--success)' : 'var(--error)';

  const totalDep = user.depositHistory.reduce((acc, c) => acc + c.amount, 0);
  document.getElementById('prof-stat-total-deposits').innerText = `${totalDep} 🪙`;
  document.getElementById('prof-stat-total-bets').innerText = `${user.betHistory.length}`;

  // Bets History List
  const betsContainer = document.getElementById('bets-history-list');
  betsContainer.innerHTML = "";

  if (user.betHistory.length === 0) {
    betsContainer.innerHTML = `<div style="text-align:center; color:var(--text-secondary); padding:20px;">Історія ставок пуста</div>`;
  } else {
    user.betHistory.forEach(bet => {
      let colorClass = "status-in-game";
      let payoutDisplay = "";

      if (bet.status === "Виграш") {
        colorClass = "status-won";
        payoutDisplay = ` • Виграш: +${bet.payout} 🪙`;
      } else if (bet.status === "Програш") {
        colorClass = "status-lost";
      }

      const item = document.createElement('div');
      item.className = "history-item";
      item.style.display = "flex";
      item.style.justifyContent = "space-between";
      item.style.borderBottom = "1px solid var(--border-color)";
      item.style.padding = "10px 8px";
      item.style.fontSize = "12px";

      item.innerHTML = `
        <div>
          <div style="font-weight: 800;">${bet.matchDisplay}</div>
          <div style="font-size: 11px; color:var(--text-secondary); margin-top:2px;">
            Ставка на: ${bet.selectedTeam} (кэф ${bet.odds.toFixed(2)}) • ${bet.date}
          </div>
        </div>
        <div style="text-align:right;">
          <span style="font-weight:800; color:white;">${bet.amount} 🪙</span>
          <div class="${colorClass}" style="font-size:11px; font-weight:800; margin-top:2px;">
            ${bet.status.toUpperCase()}${payoutDisplay}
          </div>
        </div>
      `;
      betsContainer.appendChild(item);
    });
  }

  // Deposits History List
  const depsContainer = document.getElementById('deposits-history-list');
  depsContainer.innerHTML = "";

  if (user.depositHistory.length === 0) {
    depsContainer.innerHTML = `<div style="text-align:center; color:var(--text-secondary); padding:20px;">Історія поповнень пуста</div>`;
  } else {
    user.depositHistory.forEach(dep => {
      const item = document.createElement('div');
      item.className = "history-item";
      item.style.display = "flex";
      item.style.justifyContent = "space-between";
      item.style.borderBottom = "1px solid var(--border-color)";
      item.style.padding = "10px 8px";
      item.style.fontSize = "12px";

      item.innerHTML = `
        <div>
          <div style="font-weight: 800;">Поповнення рахунку</div>
          <div style="font-size: 11px; color:var(--text-secondary); margin-top:2px;">${dep.date}</div>
        </div>
        <div style="text-align:right;">
          <span style="color:var(--success); font-weight:800;">+${dep.amount} 🪙</span>
          <div style="font-size:10px; color:var(--text-secondary); margin-top:2px;">${dep.method}</div>
        </div>
      `;
      depsContainer.appendChild(item);
    });
  }
}

// ============================================================================
// VOLK 1303 ADDED GAMING PORTAL FEATURES
// ============================================================================

// 1. Skins Shop Database & Methods
const MOCK_SKINS = [
  { id: "skin_1", name: "AWP | Dragon Lore (FN)", price: 8000, emoji: "🎯", type: "weapons" },
  { id: "skin_2", name: "M9 Bayonet | Fade (FN)", price: 6000, emoji: "🔪", type: "knives" },
  { id: "skin_3", name: "AK-47 | Vulcan (MW)", price: 2500, emoji: "🔫", type: "weapons" },
  { id: "skin_4", name: "M4A1-S | Printstream (FT)", price: 1800, emoji: "🔫", type: "weapons" },
  { id: "skin_5", name: "Desert Eagle | Blaze (FN)", price: 1200, emoji: "🔫", type: "weapons" },
  { id: "skin_6", name: "Glove Case", price: 100, emoji: "📦", type: "cases" }
];

let activeShopCategory = "all";

window.filterShopItems = function(category) {
  activeShopCategory = category;
  const filters = ["all", "knives", "weapons", "cases"];
  filters.forEach(f => {
    const btn = document.getElementById(`shop-filter-${f}`);
    if (btn) {
      btn.style.borderColor = (f === category) ? "var(--cs-orange)" : "var(--border-color)";
    }
  });
  renderStandaloneShop();
};

function renderSkinsShop() {
  const container = document.getElementById('skins-shop-container');
  if (!container) return;
  container.innerHTML = "";

  const div = document.createElement('div');
  div.style.display = "flex";
  div.style.flexDirection = "column";
  div.style.gap = "8px";
  div.style.width = "100%";

  const topTitle = document.createElement('div');
  topTitle.style.fontSize = "11px";
  topTitle.style.fontWeight = "800";
  topTitle.style.color = "var(--text-secondary)";
  topTitle.style.textTransform = "uppercase";
  topTitle.style.marginBottom = "4px";
  topTitle.innerText = "ТОП НАГОРОДИ";
  div.appendChild(topTitle);

  const topSkins = MOCK_SKINS.slice(0, 3);
  topSkins.forEach(skin => {
    const item = document.createElement('div');
    item.style.display = "flex";
    item.style.justifyContent = "space-between";
    item.style.alignItems = "center";
    item.style.background = "var(--bg-input)";
    item.style.padding = "8px 12px";
    item.style.borderRadius = "6px";
    item.style.border = "1px solid var(--border-color)";
    item.style.fontSize = "12px";
    item.innerHTML = `
      <span style="font-weight:600; color:white;">${skin.emoji} ${skin.name}</span>
      <span style="color:var(--cs-orange); font-weight:800;">${skin.price} 🪙</span>
    `;
    div.appendChild(item);
  });


  container.appendChild(div);
}

function renderStandaloneShop() {
  const container = document.getElementById('standalone-shop-container');
  if (!container) return;
  container.innerHTML = "";

  const filtered = MOCK_SKINS.filter(skin => {
    if (activeShopCategory === "all") return true;
    return skin.type === activeShopCategory;
  });

  filtered.forEach(skin => {
    const card = document.createElement('div');
    card.className = "skin-card";
    card.innerHTML = `
      <div class="skin-img-placeholder">${skin.emoji}</div>
      <div class="skin-name" title="${skin.name}">${skin.name}</div>
      <div class="skin-price">${skin.price} 🪙</div>
      <button class="btn" style="padding:6px; font-size:10px; width:100%;" onclick="buySkin('${skin.id}')">Купити</button>
    `;
    container.appendChild(card);
  });
}

window.buySkin = function(skinId) {
  const db = getDB();
  const user = db.users.find(u => u.username === db.currentUser);
  if (!user) return;

  const skin = MOCK_SKINS.find(s => s.id === skinId);
  if (!skin) return;

  if (user.balance < skin.price) {
    showToast(`Недостатньо монет! Потрібно ${skin.price} 🪙, у вас: ${user.balance} 🪙`, "error");
    return;
  }

  user.balance -= skin.price;
  if (!user.skinsInventory) user.skinsInventory = [];
  user.skinsInventory.push({
    id: skin.id,
    name: skin.name,
    emoji: skin.emoji,
    purchaseDate: new Date().toLocaleString()
  });

  saveDB(db);
  showToast(`Куплено ${skin.name} за ${skin.price} 🪙! Скін додано в профіль.`, "success");
  renderPageContent();
};

// 2. Spectator Live Chat simulator
const MOCK_CHAT_MESSAGES = [
  { username: "NaviFan_UA", text: "Слава Україні! Наві давай!" },
  { username: "s1mple_is_back", text: "s1mple is best player ever" },
  { username: "cs2_expert", text: "karrigan needs to adjust the strategy" },
  { username: "WOLF_hater", text: "FaZe will close this 2:0 easy" },
  { username: "ez_money_maker", text: "placed 500 coins on Vitality, ez win" },
  { username: "drop_me_awp", text: "what an incredible headshot from jL!" },
  { username: "zywoo_god", text: "ZywOo is just insane today" },
  { username: "cs_fan1337", text: "ECO round won, nice buy!" },
  { username: "volk_subscriber", text: "ez coin drops from stream today?" },
  { username: "cybersport_watcher", text: "what a spray transfer!" },
  { username: "clutch_king", text: "1v3 clutch coming up... OMG!" },
  { username: "silver_elite", text: "how did he miss that shot??" }
];

let chatInterval = null;
function startChatSimulation() {
  if (chatInterval) clearInterval(chatInterval);

  // Prepopulate
  for (let i = 0; i < 5; i++) {
    const msg = MOCK_CHAT_MESSAGES[Math.floor(Math.random() * MOCK_CHAT_MESSAGES.length)];
    appendChatMessage(msg.username, msg.text);
  }

  chatInterval = setInterval(() => {
    const msg = MOCK_CHAT_MESSAGES[Math.floor(Math.random() * MOCK_CHAT_MESSAGES.length)];
    appendChatMessage(msg.username, msg.text);
  }, 4000);
}

window.sendChatMessage = function() {
  const input = document.getElementById('live-chat-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  const db = getDB();
  if (!db.currentUser) return;

  appendChatMessage(db.currentUser, text);
  input.value = "";
};

function appendChatMessage(username, text) {
  const container = document.getElementById('live-chat-messages');
  if (!container) return;

  const div = document.createElement('div');
  div.className = "chat-msg";
  div.innerHTML = `<span class="chat-user">${username}:</span><span class="chat-text">${escapeHTML(text)}</span>`;
  container.appendChild(div);

  while (container.childNodes.length > 50) {
    container.removeChild(container.firstChild);
  }

  container.scrollTop = container.scrollHeight;
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// 3. Esports Lobbies & Matchmaking
const MOCK_OPPONENTS = ["s1mple_fan", "m0nesy_enjoyer", "donk_junior", "niko_aimer", "kennys_nephew", "zywoo_pupil", "device_clone", "shroud_legacy"];
let selectedLobbyFormat = "1v1";

window.selectLobbyFormat = function(format) {
  selectedLobbyFormat = format;
  
  // Toggle active classes
  const formats = ["1v1", "2v2", "3v3", "5v5"];
  formats.forEach(f => {
    const btn = document.getElementById(`btn-format-${f}`);
    if (btn) {
      if (f === format) {
        btn.classList.add('active');
        btn.classList.remove('btn-secondary');
      } else {
        btn.classList.remove('active');
        btn.classList.add('btn-secondary');
      }
    }
  });

  // Update labels
  const feeMap = { "1v1": 50, "2v2": 100, "3v3": 150, "5v5": 250 };
  const prizeMap = { "1v1": 95, "2v2": 190, "3v3": 285, "5v5": 475 };

  const feeVal = feeMap[format];
  const prizeVal = prizeMap[format];

  document.getElementById('lbl-format-fee').innerText = `${feeVal} 🪙`;
  document.getElementById('lbl-format-prize').innerText = `${prizeVal} 🪙`;
  
  const createBtn = document.getElementById('btn-create-lobby');
  if (createBtn) {
    createBtn.innerText = `⚔️ СТВОРУТИ ЛОБІ (${feeVal} 🪙)`;
  }
};

function render1v1Lobbies() {
  const container = document.getElementById('aim-lobbies-container');
  if (!container) return;
  container.innerHTML = "";

  const db = getDB();
  const lobbies = db.aimLobbies || [];

  if (lobbies.length === 0) {
    container.innerHTML = `<div style="grid-column: 1 / -1; text-align:center; color:var(--text-secondary); padding:20px; font-size:12px;">Немає активних лобі. Створіть своє перше лобі!</div>`;
    return;
  }

  lobbies.forEach(lobby => {
    const format = lobby.format || "1v1";
    const feeMap = { "1v1": 50, "2v2": 100, "3v3": 150, "5v5": 250 };
    const prizeMap = { "1v1": 95, "2v2": 190, "3v3": 285, "5v5": 475 };
    const fee = feeMap[format];
    const prize = prizeMap[format];

    // Format display names & badges
    const formatLabels = {
      "1v1": { name: "Дуель 1v1 AIM", color: "#26A17B" },
      "2v2": { name: "Напарники 2v2", color: "#0088cc" },
      "3v3": { name: "Командна 3v3", color: "#9d4edd" },
      "5v5": { name: "Бій 5v5 Match", color: "var(--cs-orange)" }
    };

    const labelObj = formatLabels[format] || formatLabels["1v1"];

    let statusTag = "";
    if (lobby.status === "waiting") {
      statusTag = `<span class="lobby-status-tag status-active-wait">Очікування...</span>`;
    } else if (lobby.status === "fighting") {
      statusTag = `<span class="lobby-status-tag status-fighting">Бій: ${lobby.simProgress || ''}</span>`;
    } else if (lobby.status === "finished") {
      statusTag = `<span class="lobby-status-tag status-done">Завершено</span>`;
    }

    const suffixMap = { "1v1": "", "2v2": " (+1 Бот)", "3v3": " (+2 Боти)", "5v5": " (+4 Боти)" };
    const suffix = suffixMap[format] || "";
    const p1Display = lobby.player1.toUpperCase() + suffix;
    const p2Display = lobby.player2 ? (lobby.player2.toUpperCase() + suffix) : '???';

    const card = document.createElement('div');
    card.className = "lobby-card";
    card.innerHTML = `
      <div class="lobby-header">
        <span style="font-weight: 800; color: ${labelObj.color}; font-size: 11px; text-transform: uppercase;">${labelObj.name}</span>
        ${statusTag}
      </div>
      <div class="lobby-players-line" style="margin: 8px 0;">
        <span>${p1Display}</span>
        <span style="color:var(--text-secondary); font-size:10px;">vs</span>
        <span>${p2Display}</span>
      </div>
      <div style="font-size: 11px; color: var(--text-secondary); display:flex; justify-content:space-between; align-items:center;">
        <span>Ставка: ${fee} 🪙</span>
        <strong style="color:white; font-family:'Roboto Mono'; font-size: 13px;">${lobby.score1}:${lobby.score2}</strong>
      </div>
      ${lobby.status === 'finished' ? `
        <div style="font-size:11px; color:var(--success); font-weight:800; text-align:center; margin-top:8px; text-transform:uppercase; border-top: 1px solid rgba(255,255,255,0.03); padding-top: 6px;">
          🎉 Переможець: ${lobby.winner.toUpperCase()}${suffix} (+${prize} 🪙)
        </div>
      ` : ''}
    `;
    container.appendChild(card);
  });
}

window.handleCreateLobby = function() {
  const db = getDB();
  const user = db.users.find(u => u.username === db.currentUser);
  if (!user) return;

  const feeMap = { "1v1": 50, "2v2": 100, "3v3": 150, "5v5": 250 };
  const fee = feeMap[selectedLobbyFormat] || 50;

  if (user.balance < fee) {
    showToast(`Недостатньо монет! Вартість лобі: ${fee} 🪙`, "error");
    return;
  }

  user.balance -= fee;

  const lobbyId = `duel_${Date.now()}`;
  const newLobby = {
    id: lobbyId,
    format: selectedLobbyFormat,
    player1: user.username,
    player2: null,
    score1: 0,
    score2: 0,
    status: "waiting",
    winner: null,
    simProgress: ""
  };

  if (!db.aimLobbies) db.aimLobbies = [];
  db.aimLobbies.unshift(newLobby);
  saveDB(db);
  showToast(`Лобі ${selectedLobbyFormat} створено! Очікуємо суперників...`, "success");
  renderPageContent();

  setTimeout(() => {
    simulateOpponentJoin(lobbyId);
  }, 4000);
};

function simulateOpponentJoin(lobbyId) {
  const db = getDB();
  const lobby = db.aimLobbies.find(l => l.id === lobbyId);
  if (!lobby || lobby.status !== 'waiting') return;

  const format = lobby.format || "1v1";
  const feeMap = { "1v1": 50, "2v2": 100, "3v3": 150, "5v5": 250 };
  const prizeMap = { "1v1": 95, "2v2": 190, "3v3": 285, "5v5": 475 };
  const fee = feeMap[format];
  const prize = prizeMap[format];

  const opponent = MOCK_OPPONENTS[Math.floor(Math.random() * MOCK_OPPONENTS.length)];
  lobby.player2 = opponent;
  lobby.status = "fighting";
  lobby.simProgress = "0%";
  saveDB(db);
  showToast(`Суперник ${opponent.toUpperCase()} знайдений! Бій починається.`, "success");
  renderPageContent();

  let round = 1;
  const maxRounds = 15;
  const simInterval = setInterval(() => {
    const freshDb = getDB();
    const freshLobby = freshDb.aimLobbies.find(l => l.id === lobbyId);
    if (!freshLobby) {
      clearInterval(simInterval);
      return;
    }

    if (Math.random() > 0.48) {
      freshLobby.score1++;
    } else {
      freshLobby.score2++;
    }

    const pct = Math.round((round / maxRounds) * 100);
    freshLobby.simProgress = `${pct}%`;

    const won1 = freshLobby.score1 >= 8;
    const won2 = freshLobby.score2 >= 8;

    if (won1 || won2 || round >= maxRounds) {
      clearInterval(simInterval);
      freshLobby.status = "finished";
      freshLobby.simProgress = "";
      
      let winnerName = "";
      if (freshLobby.score1 > freshLobby.score2) {
        winnerName = freshLobby.player1;
      } else {
        winnerName = freshLobby.player2;
      }
      
      freshLobby.winner = winnerName;

      // Credit winner
      const winnerUser = freshDb.users.find(u => u.username === winnerName);
      if (winnerUser) {
        winnerUser.balance += prize;
        
        if (winnerName === freshDb.currentUser) {
          if (!winnerUser.betHistory) winnerUser.betHistory = [];
          winnerUser.betHistory.unshift({
            matchId: freshLobby.id,
            matchDisplay: `Дуель ${format} vs ${freshLobby.player2}`,
            selectedTeam: winnerUser.username,
            teamIndex: 1,
            amount: fee,
            odds: 1.9,
            status: "Виграш",
            payout: prize,
            date: new Date().toLocaleString()
          });
        }
      }

      // Loser log
      if (winnerName !== freshLobby.player1) {
        const loserUser = freshDb.users.find(u => u.username === freshLobby.player1);
        if (loserUser) {
          if (!loserUser.betHistory) loserUser.betHistory = [];
          loserUser.betHistory.unshift({
            matchId: freshLobby.id,
            matchDisplay: `Дуель ${format} vs ${freshLobby.player2}`,
            selectedTeam: loserUser.username,
            teamIndex: 1,
            amount: fee,
            odds: 1.9,
            status: "Програш",
            payout: 0,
            date: new Date().toLocaleString()
          });
        }
      }

      saveDB(freshDb);
      showToast(`Дуель завершено! Переможець: ${winnerName.toUpperCase()} (${freshLobby.score1}:${freshLobby.score2})`, "success");
    } else {
      round++;
      saveDB(freshDb);
    }
    renderPageContent();
  }, 1200);
}

// 4. Faceit link binders
window.bindFaceitAccount = function() {
  const input = document.getElementById('faceit-name-input');
  if (!input) return;
  const nickname = input.value.trim();
  if (!nickname) return;

  const db = getDB();
  const user = db.users.find(u => u.username === db.currentUser);
  if (!user) return;

  let hash = 0;
  for (let i = 0; i < nickname.length; i++) {
    hash += nickname.charCodeAt(i);
  }
  
  user.linkedFaceitName = nickname;
  user.faceitLevel = (hash % 10) + 1;
  user.faceitElo = 800 + (user.faceitLevel - 1) * 150 + (hash % 100);
  user.faceitKD = (1.0 + (hash % 50) / 100).toFixed(2);
  user.faceitWinrate = `${45 + (hash % 25)}%`;
  user.faceitHS = `${40 + (hash % 20)}%`;

  saveDB(db);
  showToast(`Акаунт Faceit ${nickname} успішно прив'язано!`, "success");
  renderPageContent();
};

window.unlinkFaceit = function() {
  if (!confirm("Ви впевнені, що хочете відв'язати акаунт FACEIT?")) return;
  const db = getDB();
  const user = db.users.find(u => u.username === db.currentUser);
  if (!user) return;

  user.linkedFaceitName = null;
  user.faceitLevel = null;
  user.faceitElo = null;
  user.faceitKD = null;
  user.faceitWinrate = null;
  user.faceitHS = null;

  saveDB(db);
  showToast("Акаунт FACEIT відв'язано.", "success");
  renderPageContent();
};

// 5. Daily Quests checklist
const DAILY_QUESTS = [
  {
    id: "quest_bets",
    title: "Зроби 3 ставки на CS2",
    description: "Зроби будь-які 3 ставки на матчі CS2",
    reward: 10,
    checkCompleted: (user) => {
      const bets = user.betHistory.filter(b => b.matchDisplay && !b.matchDisplay.startsWith("Дуель"));
      return bets.length >= 3;
    },
    getProgressText: (user) => {
      const bets = user.betHistory.filter(b => b.matchDisplay && !b.matchDisplay.startsWith("Дуель"));
      return `${Math.min(bets.length, 3)} / 3`;
    }
  },
  {
    id: "quest_duel",
    title: "Виграй 1 лобі (Aim)",
    description: "Здобудь перемогу в дуелі або командному бою на aim-карті (1v1, 2v2, 3v3, 5v5)",
    reward: 15,
    checkCompleted: (user) => {
      const duelsWon = user.betHistory.filter(b => b.matchDisplay && b.matchDisplay.startsWith("Дуель") && b.status === "Виграш");
      return duelsWon.length >= 1;
    },
    getProgressText: (user) => {
      const duelsWon = user.betHistory.filter(b => b.matchDisplay && b.matchDisplay.startsWith("Дуель") && b.status === "Виграш");
      return `${Math.min(duelsWon.length, 1)} / 1`;
    }
  }
];

function renderDailyQuests() {
  const container = document.getElementById('quests-list-container');
  if (!container) return;
  container.innerHTML = "";

  const db = getDB();
  const user = db.users.find(u => u.username === db.currentUser);
  if (!user) return;

  if (!user.claimedQuests) user.claimedQuests = [];

  DAILY_QUESTS.forEach(quest => {
    const completed = quest.checkCompleted(user);
    const claimed = user.claimedQuests.includes(quest.id);
    const progressText = quest.getProgressText(user);

    const div = document.createElement('div');
    div.className = "quest-item";
    
    let buttonHtml = "";
    if (claimed) {
      buttonHtml = `<button class="btn btn-secondary" style="padding:6px 12px; font-size:10px; opacity:0.5; cursor:not-allowed;" disabled>Виконано</button>`;
    } else if (completed) {
      buttonHtml = `<button class="btn" style="padding:6px 12px; font-size:10px; background:linear-gradient(135deg, var(--success) 0%, #00b347 100%);" onclick="claimQuestReward('${quest.id}')">Забрати</button>`;
    } else {
      buttonHtml = `<span style="font-size:11px; color:var(--text-secondary); font-weight:800;">${progressText}</span>`;
    }

    div.innerHTML = `
      <div class="quest-info">
        <div class="quest-title" title="${quest.description}">${quest.title}</div>
        <div class="quest-reward">+${quest.reward} 🪙</div>
      </div>
      ${buttonHtml}
    `;
    container.appendChild(div);
  });
}

window.claimQuestReward = function(questId) {
  const db = getDB();
  const user = db.users.find(u => u.username === db.currentUser);
  if (!user) return;

  if (!user.claimedQuests) user.claimedQuests = [];
  if (user.claimedQuests.includes(questId)) return;

  const quest = DAILY_QUESTS.find(q => q.id === questId);
  if (!quest) return;

  if (!quest.checkCompleted(user)) {
    showToast("Квест ще не виконано!", "error");
    return;
  }

  user.balance += quest.reward;
  user.claimedQuests.push(questId);
  saveDB(db);
  showToast(`Ви отримали +${quest.reward} 🪙 за квест!`, "success");
  renderPageContent();
};

// 6. Live score details scoreboard & map pool
function renderLiveMatchStats(db) {
  const statsCard = document.getElementById('live-stats-match-card');
  if (!statsCard) return;

  const liveMatch = db.matches.find(m => m.status === 'live');
  if (!liveMatch) {
    statsCard.style.display = 'none';
    return;
  }

  statsCard.style.display = 'block';

  const mapPoolContainer = document.getElementById('live-map-pool-container');
  if (mapPoolContainer) {
    let maps = ["Mirage", "Inferno", "Nuke"];
    if (liveMatch.id.includes("2")) {
      maps = ["Anubis", "Ancient", "Mirage"];
    }
    
    mapPoolContainer.innerHTML = `
      <div style="background:var(--bg-card); border:1px solid var(--border-color); padding:8px 12px; border-radius:6px; display:flex; justify-content:space-between; align-items:center; font-size:12px;">
        <span>1. de_${maps[0]}</span>
        <span style="color:var(--success); font-weight:800; font-size:11px;">Перемога ${liveMatch.team1} (13:9)</span>
      </div>
      <div style="background:var(--bg-card); border:1px solid var(--cs-orange); padding:8px 12px; border-radius:6px; display:flex; justify-content:space-between; align-items:center; font-size:12px;">
        <span>2. de_${maps[1]}</span>
        <span style="color:var(--cs-orange); font-weight:800; font-size:11px;">ГРАЄТЬСЯ (${liveMatch.score1}:${liveMatch.score2})</span>
      </div>
      <div style="background:var(--bg-card); border:1px solid var(--border-color); padding:8px 12px; border-radius:6px; display:flex; justify-content:space-between; align-items:center; opacity:0.5; font-size:12px;">
        <span>3. de_${maps[2]}</span>
        <span style="font-size:11px;">ОЧІКУЄТЬСЯ</span>
      </div>
    `;
  }

  const tbody = document.getElementById('live-scoreboard-tbody');
  if (tbody) {
    tbody.innerHTML = "";

    const players = [];
    liveMatch.players1.forEach((p, idx) => {
      const kills = Math.round(liveMatch.score1 * 1.5 + idx * 2 + 5);
      const deaths = Math.round(liveMatch.score2 * 1.2 + (5 - idx));
      const adr = Math.round(60 + kills * 2.5);
      const mvps = idx === 0 ? Math.round(liveMatch.score1 / 4) : 0;
      players.push({ name: p, team: liveMatch.team1, kills, deaths, adr, mvps });
    });

    liveMatch.players2.forEach((p, idx) => {
      const kills = Math.round(liveMatch.score2 * 1.5 + idx * 2 + 4);
      const deaths = Math.round(liveMatch.score1 * 1.2 + (5 - idx));
      const adr = Math.round(60 + kills * 2.5);
      const mvps = idx === 0 ? Math.round(liveMatch.score2 / 4) : 0;
      players.push({ name: p, team: liveMatch.team2, kills, deaths, adr, mvps });
    });

    players.sort((a, b) => b.kills - a.kills);

    players.forEach((p, idx) => {
      const tr = document.createElement('tr');
      tr.style.fontSize = "14px";
      tr.style.lineHeight = "1.6";

      let medal = "";
      if (idx === 0) medal = "🥇 ";
      else if (idx === 1) medal = "🥈 ";
      else if (idx === 2) medal = "🥉 ";

      const kdRatio = p.deaths > 0 ? (p.kills / p.deaths).toFixed(2) : p.kills.toFixed(2);
      tr.innerHTML = `
        <td>
          ${medal}<strong style="color:white;">${p.name}</strong>
          <span style="font-size:11px; color:var(--text-secondary); margin-left:4px;">[${p.team}]</span>
        </td>
        <td>${p.kills} / ${p.deaths} (${kdRatio})</td>
        <td>${p.adr}</td>
        <td style="color:var(--cs-orange); font-weight:800;">${p.mvps > 0 ? '★'.repeat(p.mvps) : '-'}</td>
      `;
      tbody.appendChild(tr);
    });
  }
}

// ── MY BETS PAGE HANDLERS ──
let activeBetsFilter = 'all';

window.filterMyBets = function(filterVal) {
  activeBetsFilter = filterVal;
  
  // Highlight active tab
  document.querySelectorAll('.filter-tab').forEach(tab => tab.classList.remove('active'));
  const activeTab = document.getElementById(`tab-${filterVal}`);
  if (activeTab) activeTab.classList.add('active');
  
  renderMyBetsPage();
};

function renderMyBetsPage() {
  const db = getDB();
  if (!db || !db.currentUser) return;
  const user = db.users.find(u => u.username === db.currentUser);
  if (!user) return;

  // 1. Calculate Stats
  const history = user.betHistory || [];
  const totalBets = history.length;
  const activeBets = history.filter(b => b.status === 'В грі').length;
  const totalWon = history.reduce((acc, b) => acc + (b.payout || 0), 0);
  
  const settledBets = history.filter(b => b.status === 'Виграш' || b.status === 'Програш');
  const wonBets = history.filter(b => b.status === 'Виграш');
  const winRate = settledBets.length > 0 ? Math.round((wonBets.length / settledBets.length) * 100) : 0;

  // Update Stats UI
  const totalEl = document.getElementById('stats-total-bets');
  if (totalEl) totalEl.innerText = totalBets;
  
  const activeEl = document.getElementById('stats-active-bets');
  if (activeEl) activeEl.innerText = activeBets;
  
  const wonEl = document.getElementById('stats-total-won');
  if (wonEl) wonEl.innerText = `${totalWon} 🪙`;
  
  const rateEl = document.getElementById('stats-win-rate');
  if (rateEl) rateEl.innerText = `${winRate}%`;

  // 2. Render Cards List
  const container = document.getElementById('my-bets-container');
  if (!container) return;
  container.innerHTML = "";

  // Filter history
  let filtered = [];
  if (activeBetsFilter === 'all') {
    filtered = history;
  } else if (activeBetsFilter === 'active') {
    filtered = history.filter(b => b.status === 'В грі');
  } else {
    // "Розраховані"
    filtered = history.filter(b => b.status === 'Виграш' || b.status === 'Програш');
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; color:var(--text-secondary); padding: 40px 10px; font-size: 14px;">
        🔍 Не знайдено жодної ставки для обраного фільтру.
        <br><br>
        <a href="betting.html" class="btn" style="text-decoration:none;">Перейти до ставок</a>
      </div>
    `;
    return;
  }

  filtered.forEach(bet => {
    let statusClass = "badge-in-game";
    if (bet.status === "Виграш") statusClass = "badge-win";
    if (bet.status === "Програш") statusClass = "badge-loss";

    let payoutDisplay = "";
    let payoutClass = "";
    if (bet.status === "В грі") {
      const estWin = Math.round(bet.amount * bet.odds);
      payoutDisplay = `~ ${estWin} 🪙 (Можливий)`;
      payoutClass = "highlight";
    } else if (bet.status === "Виграш") {
      payoutDisplay = `+${bet.payout} 🪙`;
      payoutClass = "win";
    } else {
      payoutDisplay = "0 🪙";
    }

    const card = document.createElement('div');
    card.className = "bet-history-card";
    card.innerHTML = `
      <div class="bet-card-header">
        <div class="bet-game-info">
          <span>🎮 Counter-Strike 2 • Ординар</span>
        </div>
        <span class="bet-badge ${statusClass}">${bet.status}</span>
      </div>
      
      <div class="bet-match-row">
        <div class="bet-team-name">${bet.matchDisplay.split(' vs ')[0] || bet.matchDisplay}</div>
        <div class="bet-vs-box">VS</div>
        <div class="bet-team-name">${bet.matchDisplay.split(' vs ')[1] || ''}</div>
      </div>
      
      <div class="bet-details-grid">
        <div class="bet-detail-item">
          <span class="bet-detail-label">Ваш вибір</span>
          <span class="bet-detail-value highlight">${bet.selectedTeam}</span>
        </div>
        <div class="bet-detail-item">
          <span class="bet-detail-label">Коефіцієнт</span>
          <span class="bet-detail-value">${bet.odds.toFixed(2)}</span>
        </div>
        <div class="bet-detail-item">
          <span class="bet-detail-label">Сума ставки</span>
          <span class="bet-detail-value">${bet.amount} 🪙</span>
        </div>
        <div class="bet-detail-item">
          <span class="bet-detail-label">Виплата</span>
          <span class="bet-detail-value ${payoutClass}">${payoutDisplay}</span>
        </div>
      </div>
      
      <div style="font-size:10px; color:var(--text-secondary); text-align:right;">
        📅 Час ставки: ${bet.date}
      </div>
    `;
    container.appendChild(card);
  });
}

// ==========================================
// TOURNAMENT PORTAL PORTAL RENDERING
// ==========================================

// Render tournaments grouped by active, upcoming, and completed categories
window.renderTournamentsPortal = function() {
  const container = document.getElementById('tournaments-portal-list');
  if (!container) return;

  const db = getDB();
  const tournaments = db.tournaments || [];

  if (tournaments.length === 0) {
    container.innerHTML = `
      <div class="card" style="background:rgba(255,255,255,0.01); border-style:dashed; padding:40px; text-align:center;">
        <span style="font-size:24px;">🏆</span>
        <div style="font-weight:900; font-size:14px; margin-top:10px; color:white;">ТУРНІРИ ТИМЧАСОВО ВІДСУТНІ</div>
        <p style="font-size:11px; color:var(--text-secondary); max-width:400px; margin:8px auto 0 auto; line-height:1.5;">
          На даний момент адміністрацією сайту не створено активних чи запланованих змагань. Поверніться сюди пізніше!
        </p>
      </div>
    `;
    return;
  }

  // Sort tournaments: Active first, then Upcoming, then Completed
  const activeT = tournaments.filter(t => t.status === "active");
  const upcomingT = tournaments.filter(t => t.status === "upcoming");
  const completedT = tournaments.filter(t => t.status === "completed");

  container.innerHTML = "";

  // Helper render loop
  const renderList = (title, list) => {
    if (list.length === 0) return;

    const groupHeader = document.createElement('div');
    groupHeader.style.fontSize = "11px";
    groupHeader.style.fontWeight = "900";
    groupHeader.style.textTransform = "uppercase";
    groupHeader.style.letterSpacing = "1px";
    groupHeader.style.color = "var(--cs-orange)";
    groupHeader.style.marginBottom = "10px";
    groupHeader.style.marginTop = "15px";
    groupHeader.innerText = title;
    container.appendChild(groupHeader);

    list.forEach(tour => {
      const card = document.createElement('div');
      card.className = "tournament-card";
      card.id = `tour-card-${tour.id}`;

      let statusClass = "status-upcoming";
      let statusText = "Майбутній";
      if (tour.status === "active") {
        statusClass = "status-active";
        statusText = "Активний";
      } else if (tour.status === "completed") {
        statusClass = "status-completed";
        statusText = "Завершений";
      }

      const regCount = tour.registeredTeams ? tour.registeredTeams.length : 0;
      const formattedDate = tour.datetime ? tour.datetime.replace('T', ' ') : "-";

      card.innerHTML = `
        <div class="tournament-card-header">
          <div class="tournament-title-area">
            <span class="tournament-card-title">${tour.name}</span>
            <div style="display:flex; align-items:center; gap:8px;">
              <span class="tournament-status-pill ${statusClass}">${statusText}</span>
              <span style="font-size:11px; color:var(--text-secondary); font-family:monospace;">Початок: ${formattedDate}</span>
            </div>
          </div>
          <div class="prize-pool-badge">
            🪙 <span>${tour.prizePool}</span> монет
          </div>
        </div>

        <div class="tournament-info-grid">
          <div class="info-grid-item">
            <span class="info-item-label">Учасники</span>
            <span class="info-item-value">${regCount} / ${tour.maxTeams} команд</span>
          </div>
          <div class="info-grid-item">
            <span class="info-item-label">Формат</span>
            <span class="info-item-value">${tour.format} Competitive</span>
          </div>
          <div class="info-grid-item">
            <span class="info-item-label">Карта</span>
            <span class="info-item-value">${tour.map}</span>
          </div>
          <div class="info-grid-item">
            <span class="info-item-label">Проведення</span>
            <span class="info-item-value" style="text-transform: capitalize;">${tour.system} elimination</span>
          </div>
        </div>

        <div style="display:flex; justify-content:flex-end;">
          <button class="btn" style="margin-bottom:0; font-size:11px; padding:8px 16px; font-weight:800;" onclick="toggleTournamentDetails('${tour.id}')" id="toggle-btn-${tour.id}">${openTournamentDetailsIds[tour.id] ? '❌ ЗАКРИТИ ДЕТАЛІ' : '🏆 ДЕТАЛІ ТА СІТКА'}</button>
        </div>

        <!-- Hidden details and Brackets Canvas tabs pane -->
        <div class="tournament-details-panel" id="details-panel-${tour.id}" style="display:${openTournamentDetailsIds[tour.id] ? 'block' : 'none'}; border-top:1px solid rgba(255,255,255,0.05); padding-top:15px; margin-top:10px;">
          <div class="details-tabs-bar">
            <button class="details-tab-btn active" id="tab-btn-info-${tour.id}" onclick="switchTournamentDetailTab('${tour.id}', 'info')">ℹ️ Інформація</button>
            <button class="details-tab-btn" id="tab-btn-rules-${tour.id}" onclick="switchTournamentDetailTab('${tour.id}', 'rules')">📜 Правила</button>
            <button class="details-tab-btn" id="tab-btn-bracket-${tour.id}" onclick="switchTournamentDetailTab('${tour.id}', 'bracket')">🏆 Сітка матчів</button>
            <button class="details-tab-btn" id="tab-btn-betting-${tour.id}" onclick="switchTournamentDetailTab('${tour.id}', 'betting')" style="background:rgba(255,90,0,0.08); border-color:rgba(255,90,0,0.2);">🎰 Ставки</button>
          </div>

          <!-- TAB CONTENT: Info -->
          <div class="details-tab-content active" id="tab-content-info-${tour.id}">
            <div style="display:grid; grid-template-columns: 1.2fr 1fr; gap:20px; font-size:12px; line-height:1.6;">
              <div>
                <strong style="color:white; display:block; margin-bottom:8px; font-size:13px; text-transform:uppercase;">🏆 Розподіл призового фонду:</strong>
                <ul style="padding-left:15px; display:flex; flex-direction:column; gap:4px; color:var(--text-secondary);">
                  ${Object.entries(tour.percents || {}).map(([place, pct]) => `
                    <li><strong>${place} місце:</strong> <span style="color:white;">${pct}%</span> (отримає <strong style="color:var(--cs-orange);">${Math.round(tour.prizePool * pct / 100)} 🪙</strong>)</li>
                  `).join('')}
                </ul>
                <p style="color:var(--text-secondary); margin-top:15px; font-size:11px;">
                  Призи розподіляються в автоматичному режимі одразу після внесення фінального результату в адмін-панелі. Кошти зараховуються безпосередньо капітану команди!
                </p>
              </div>
              <div style="background:rgba(0,0,0,0.2); padding:15px; border-radius:8px; border:1px solid rgba(255,255,255,0.02); display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center;">
                <span style="font-size:32px; filter:drop-shadow(0 0 8px rgba(255,90,0,0.3));">🗺️</span>
                <strong style="color:white; margin-top:8px; text-transform:uppercase; font-size:13px;">Активна карта: de_${tour.map.replace('de_', '')}</strong>
                <span style="font-size:10px; color:var(--text-secondary); margin-top:3px;">Усі поєдинки турніру будуть зіграні виключно на цій локації</span>
              </div>
            </div>
          </div>

          <!-- TAB CONTENT: Rules -->
          <div class="details-tab-content" id="tab-content-rules-${tour.id}">
            <div style="background:rgba(0,0,0,0.15); padding:15px; border-radius:8px; border:1px solid rgba(255,255,255,0.02); font-size:12px; line-height:1.6; color:#e1e7f0; white-space:pre-line;">
              ${tour.rules || "Офіційні правила тимчасово відсутні."}
            </div>
          </div>

          <!-- TAB CONTENT: Brackets Canvas -->
          <div class="details-tab-content" id="tab-content-bracket-${tour.id}">
            <div class="bracket-canvas-wrapper" id="bracket-wrapper-${tour.id}">
              <div class="bracket-canvas-inner" id="bracket-inner-${tour.id}">
                <!-- Rendered dynamically -->
              </div>
            </div>
          </div>

          <!-- TAB CONTENT: Tournament Betting -->
          <div class="details-tab-content" id="tab-content-betting-${tour.id}">
            <div id="tour-betting-portal-${tour.id}">
              <!-- Rendered by renderTournamentBettingPortal() -->
            </div>
          </div>

        </div>
      `;
      container.appendChild(card);

      // If it was already open, restore active tab rendering!
      if (openTournamentDetailsIds[tour.id]) {
        const lastActiveTab = activeTournamentTabs[tour.id] || 'info';
        switchTournamentDetailTab(tour.id, lastActiveTab);
      }
    });
  };

  renderList("🟢 Активні турніри", activeT);
  renderList("⏳ Заплановані події", upcomingT);
  renderList("🏁 Завершені змагання", completedT);
};

// Toggle expanded tournament details view
window.toggleTournamentDetails = function(tourId) {
  const panel = document.getElementById(`details-panel-${tourId}`);
  const btn = document.getElementById(`toggle-btn-${tourId}`);
  if (!panel || !btn) return;

  if (panel.style.display === "none") {
    panel.style.display = "block";
    btn.innerText = "❌ ЗАКРИТИ ДЕТАЛІ";
    openTournamentDetailsIds[tourId] = true;
    
    // Initialize to last active tab or info tab
    const lastActiveTab = activeTournamentTabs[tourId] || 'info';
    switchTournamentDetailTab(tourId, lastActiveTab);
  } else {
    panel.style.display = "none";
    btn.innerText = "🏆 ДЕТАЛІ ТА СІТКА";
    delete openTournamentDetailsIds[tourId];
  }
};

// Switch tabs inside expanded tournament details
window.switchTournamentDetailTab = function(tourId, tabKey) {
  activeTournamentTabs[tourId] = tabKey;

  const tabs = ['info', 'rules', 'bracket', 'betting'];
  tabs.forEach(key => {
    const btn = document.getElementById(`tab-btn-${key}-${tourId}`);
    const content = document.getElementById(`tab-content-${key}-${tourId}`);
    if (btn) btn.classList.remove('active');
    if (content) content.classList.remove('active');
  });

  const activeBtn = document.getElementById(`tab-btn-${tabKey}-${tourId}`);
  const activeContent = document.getElementById(`tab-content-${tabKey}-${tourId}`);
  if (activeBtn) activeBtn.classList.add('active');
  if (activeContent) activeContent.classList.add('active');

  if (tabKey === 'bracket') {
    renderVisualBracketPortal(tourId);
  }
  if (tabKey === 'betting') {
    renderTournamentBettingPortal(tourId);
  }
};

// Check if a tournament's active match has a 6+ round score lead to freeze bets
function isTournamentBettingFrozen(tour) {
  if (!tour || !tour.brackets || !tour.brackets.rounds) return false;
  for (const round of tour.brackets.rounds) {
    if (!round.matches) continue;
    for (const match of round.matches) {
      if (match.status === 'live' || match.status === 'active') {
        const s1 = parseInt(match.score1) || 0;
        const s2 = parseInt(match.score2) || 0;
        if (Math.abs(s1 - s2) >= 6) {
          return true;
        }
      }
    }
  }
  return false;
}

// Render betting portal for a tournament on the public site
function renderTournamentBettingPortal(tourId) {
  const container = document.getElementById(`tour-betting-portal-${tourId}`);
  if (!container) return;

  const db = getDB();
  const tour = db.tournaments.find(t => t.id === tourId);
  if (!tour) return;

  const regTeams = (tour.registeredTeams || []).filter(Boolean);
  const teamObjects = regTeams.map(tid => db.teams.find(t => t.id === tid)).filter(Boolean);
  const teamOdds = tour.teamOdds || {};

  const user = db.currentUser ? db.users.find(u => u.username === db.currentUser) : null;
  const frozen = isTournamentBettingFrozen(tour);

  if (teamObjects.length === 0) {
    container.innerHTML = `<div style="text-align:center; color:var(--text-secondary); padding:30px; font-size:12px;">Команди до цього турніру ще не додані</div>`;
    return;
  }

  container.innerHTML = `
    ${frozen ? `
      <div style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.25); border-radius:10px; padding:12px 16px; margin-bottom:16px; display:flex; align-items:center; gap:10px; color:#ef4444; font-size:12px; font-weight:800; box-shadow:0 4px 12px rgba(239,68,68,0.05);">
        <span style="font-size:16px; animation: pulse 1.5s infinite;">❄️</span>
        <span>СТАВКИ ЗАМОРОЖЕНО (одна з команд перемагає на 6+ раундів)</span>
      </div>
    ` : ''}
    <div style="margin-bottom:16px; display:flex; justify-content:space-between; align-items:center;">
      <div>
        <div style="font-size:12px; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">💰 Ваш баланс</div>
        <div style="font-size:20px; font-weight:900; color:var(--cs-orange);">${user ? user.balance + ' 🪙' : '<span style="color:var(--text-secondary); font-size:13px;">Увійдіть для ставок</span>'}</div>
      </div>
      ${!frozen ? `<span style="font-size:11px; background:rgba(38,161,123,0.1); border:1px solid rgba(38,161,123,0.2); padding:4px 8px; border-radius:6px; color:#26a17b; font-weight:700;">🟢 Ставки відкриті</span>` : ''}
    </div>
    <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:12px;">
      ${teamObjects.map(team => {
        const odds = teamOdds[team.id] !== undefined ? teamOdds[team.id] : 2.5;
        const players = (team.players || []);
        
        let btnText = `🎰 ПОСТАВИТИ НА ${team.name.toUpperCase()}`;
        let btnDisabledAttr = '';
        let btnStyle = `width:100%; border:none; color:white; border-radius:8px; padding:10px; font-size:12px; font-weight:900; letter-spacing:0.5px; transition:all 0.2s; text-transform:uppercase;`;
        
        if (frozen) {
          btnText = `❄️ ЗАМОРОЖЕНО`;
          btnDisabledAttr = 'disabled title="Ставки заморожені через велику різницю в рахунку"';
          btnStyle += `background:#1e293b; color:var(--text-secondary); cursor:not-allowed;`;
        } else if (!user) {
          btnDisabledAttr = 'disabled title="Увійдіть для ставок"';
          btnStyle += `background:#1e293b; color:var(--text-secondary); cursor:not-allowed;`;
        } else {
          btnStyle += `background:linear-gradient(135deg, rgba(255,90,0,0.9), rgba(255,60,0,0.9)); cursor:pointer;`;
        }

        return `
          <div style="background:linear-gradient(135deg, #0e0f1a 0%, #131525 100%); border:1px solid rgba(255,255,255,0.07); border-radius:12px; padding:16px; display:flex; flex-direction:column; gap:12px; transition:all 0.2s;" onmouseover="if(!${frozen}) this.style.borderColor='rgba(255,90,0,0.4)'; if(!${frozen}) this.style.transform='translateY(-2px)';" onmouseout="this.style.borderColor='rgba(255,255,255,0.07)'; this.style.transform='translateY(0)';">
            <div style="display:flex; align-items:center; gap:10px;">
              <div style="background:rgba(255,90,0,0.15); border:1px solid rgba(255,90,0,0.3); border-radius:8px; padding:8px 10px; font-size:16px; flex-shrink:0;">🛡️</div>
              <div style="min-width:0;">
                <div style="font-size:14px; font-weight:900; color:white; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${team.name}</div>
                <div style="font-size:10px; color:var(--text-secondary);">[${team.tag || '?'}] · ${players.length} гравців</div>
              </div>
            </div>
            <div style="background:rgba(0,0,0,0.25); border-radius:8px; padding:10px; text-align:center;">
              <div style="font-size:10px; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;">КОЕФІЦІЄНТ</div>
              <div style="font-size:26px; font-weight:900; color:var(--cs-orange); line-height:1;">x${odds.toFixed(2)}</div>
              <div style="font-size:10px; color:var(--text-secondary); margin-top:4px;">Потенційний виграш на 100 🪙: <strong style="color:white;">${Math.round(100 * odds)} 🪙</strong></div>
            </div>
            ${players.length > 0 ? `
              <div style="display:flex; flex-wrap:wrap; gap:4px;">
                ${players.slice(0,5).map(p => {
                  const userRecord = db.users.find(u => u.username.toLowerCase() === p.toLowerCase());
                  let isOnline = false;
                  if (userRecord && userRecord.loginHistory && userRecord.loginHistory.length > 0) {
                    const lastLogin = userRecord.loginHistory[0];
                    if (lastLogin && lastLogin.date) {
                      const lastVisitTime = new Date(lastLogin.date);
                      isOnline = lastVisitTime && (Date.now() - lastVisitTime.getTime() < 10 * 60 * 1000);
                    }
                  }
                  const dotColor = isOnline ? '#26A17B' : '#718096';
                  const dotGlow = isOnline ? 'box-shadow: 0 0 6px #26A17B;' : '';
                  return `
                    <span style="background:#1e293b; color:white; padding:3px 8px; border-radius:4px; font-size:10px; font-weight:700; display:inline-flex; align-items:center; gap:5px;">
                      @${p.toUpperCase()}
                      <span style="width:5px; height:5px; border-radius:50%; background:${dotColor}; ${dotGlow}" title="${isOnline ? 'Online' : 'Offline'}"></span>
                    </span>
                  `;
                }).join('')}
                ${players.length > 5 ? `<span style="background:#1e293b; color:var(--text-secondary); padding:3px 8px; border-radius:4px; font-size:10px;">+${players.length-5}</span>` : ''}
              </div>` : ''}
            <button onclick="placeTournamentBet('${tourId}', '${team.id}', '${team.name}', ${odds})" style="${btnStyle}" onmouseover="if(!${frozen} && ${!!user}) this.style.transform='scale(1.02)';" onmouseout="if(!${frozen} && ${!!user}) this.style.transform='scale(1)';"
              ${btnDisabledAttr}>${btnText}</button>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

// Handle placing tournament team bet on client side
window.placeTournamentBet = function(tourId, teamId, teamName, odds) {
  const db = getDB();
  const tour = db.tournaments.find(t => t.id === tourId);
  if (!tour) {
    showToast('Турнір не знайдено!', 'error');
    return;
  }

  if (isTournamentBettingFrozen(tour)) {
    showToast('Ставки на цей турнір заморожено (різниця в рахунку матчу 6+ раундів)!', 'error');
    return;
  }

  const user = db.users.find(u => u.username === db.currentUser);
  if (!user) {
    showToast('Увійдіть в акаунт для ставки!', 'error');
    return;
  }

  // Prepopulate the bet modal
  document.getElementById('bet-modal-tour-id').value = tourId;
  document.getElementById('bet-modal-team-id').value = teamId;
  document.getElementById('bet-modal-team-name').innerText = teamName;
  document.getElementById('bet-modal-odds').innerText = 'x' + odds.toFixed(2);
  document.getElementById('bet-modal-balance').innerText = user.balance;
  document.getElementById('bet-modal-amount').value = '';
  document.getElementById('bet-modal-amount').max = user.balance;
  document.getElementById('bet-modal-payout').innerText = '0 🪙';
  
  // Save odds in element data attribute for easy payout calculation
  document.getElementById('bet-modal-odds').dataset.odds = odds;

  openModal('bet-modal');
};

window.calculateBetModalPayout = function() {
  const amount = parseFloat(document.getElementById('bet-modal-amount').value) || 0;
  const odds = parseFloat(document.getElementById('bet-modal-odds').dataset.odds) || 0;
  const payout = Math.round(amount * odds);
  document.getElementById('bet-modal-payout').innerText = payout + ' 🪙';
};

window.submitBetModalForm = function(event) {
  event.preventDefault();
  const db = getDB();
  const tourId = document.getElementById('bet-modal-tour-id').value;
  const teamId = document.getElementById('bet-modal-team-id').value;
  const teamName = document.getElementById('bet-modal-team-name').innerText;
  const odds = parseFloat(document.getElementById('bet-modal-odds').dataset.odds) || 0;
  
  const amountInput = document.getElementById('bet-modal-amount');
  const amount = parseInt(amountInput.value, 10);
  
  const tour = db.tournaments.find(t => t.id === tourId);
  if (!tour) {
    showToast('Турнір не знайдено!', 'error');
    closeModal('bet-modal');
    return;
  }

  const user = db.users.find(u => u.username === db.currentUser);
  if (!user) {
    showToast('Увійдіть в акаунт для ставки!', 'error');
    closeModal('bet-modal');
    return;
  }

  if (isNaN(amount) || amount < 1) {
    showToast('Введіть коректну суму!', 'error');
    return;
  }

  if (amount > user.balance) {
    showToast('Недостатньо монет на балансі!', 'error');
    return;
  }

  user.balance -= amount;
  if (!user.betHistory) user.betHistory = [];
  user.betHistory.push({
    id: 'tb_' + Date.now(),
    type: 'tournament',
    tourId,
    teamId,
    selectedTeam: teamName,
    odds,
    amount,
    date: new Date().toLocaleString('uk-UA'),
    status: 'В грі',
    payout: 0
  });

  saveDB(db);
  closeModal('bet-modal');
  showToast(`Ставку ${amount} 🪙 на "${teamName}" (x${odds}) прийнято!`, 'success');
  renderTournamentBettingPortal(tourId);
};

// SVG vibrant color hash team initials logo generator
function generateTeamLogoSVG(teamName) {
  if (!teamName || teamName === "Очікується") {
    return `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30"><rect width="30" height="30" fill="%232c3040" rx="6"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui" font-size="12" font-weight="900" fill="%234f566f">?</text></svg>`;
  }
  
  let hash = 0;
  for (let i = 0; i < teamName.length; i++) {
    hash = teamName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const h = Math.abs(hash) % 360;
  const color1 = `hsl(${h}, 85%, 45%)`;
  const color2 = `hsl(${(h + 40) % 360}, 90%, 35%)`;
  
  // Extract initials
  const initials = teamName.split(/\s+/).map(w => w.charAt(0)).join('').toUpperCase().slice(0, 2);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 30 30">
    <defs>
      <linearGradient id="grad-${h}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${color1}" />
        <stop offset="100%" stop-color="${color2}" />
      </linearGradient>
    </defs>
    <rect width="30" height="30" fill="url(%23grad-${h})" rx="6"/>
    <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui" font-size="11" font-weight="900" fill="white" letter-spacing="0.5">${initials}</text>
  </svg>`;
  
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Interactive scrolling drag & scroll panning engine
function makeBracketPanningInteractive(wrapper) {
  if (!wrapper) return;
  let isDown = false;
  let startX;
  let startY;
  let scrollLeft;
  let scrollTop;

  wrapper.addEventListener('mousedown', (e) => {
    isDown = true;
    wrapper.classList.add('grabbing');
    startX = e.pageX - wrapper.offsetLeft;
    startY = e.pageY - wrapper.offsetTop;
    scrollLeft = wrapper.scrollLeft;
    scrollTop = wrapper.scrollTop;
  });

  wrapper.addEventListener('mouseleave', () => {
    isDown = false;
    wrapper.classList.remove('grabbing');
  });

  wrapper.addEventListener('mouseup', () => {
    isDown = false;
    wrapper.classList.remove('grabbing');
  });

  wrapper.addEventListener('mousemove', (e) => {
    if (!isDown) return;
    e.preventDefault();
    const x = e.pageX - wrapper.offsetLeft;
    const y = e.pageY - wrapper.offsetTop;
    const walkX = (x - startX) * 1.5;
    const walkY = (y - startY) * 1.5;
    wrapper.scrollLeft = scrollLeft - walkX;
    wrapper.scrollTop = scrollTop - walkY;
  });
}

// Renders visual bracket rounds structure with connectors inside expanded tab
function renderVisualBracketPortal(tourId) {
  const wrapper = document.getElementById(`bracket-wrapper-${tourId}`);
  const inner = document.getElementById(`bracket-inner-${tourId}`);
  if (!wrapper || !inner) return;

  const db = getDB();
  const tour = db.tournaments.find(t => t.id === tourId);
  if (!tour || !tour.brackets || !tour.brackets.rounds) return;

  inner.innerHTML = "";

  // Setup interactive mouse panning
  makeBracketPanningInteractive(wrapper);

  tour.brackets.rounds.forEach((round, rIndex) => {
    const col = document.createElement('div');
    col.className = "bracket-round-column";
    
    // Set heights depending on round distance to space out visual match node slots nicely
    if (rIndex > 0) {
      col.style.gap = `${30 + rIndex * 110}px`;
    }

    round.matches.forEach(match => {
      const node = document.createElement('div');
      node.className = "bracket-match-node-v2";
      if (match.status === 'live') node.classList.add('active-live');

      // Click event comparison modal
      node.onclick = () => {
        if (match.team1 !== "Очікується" && match.team2 !== "Очікується") {
          openRosterModalComparison(match.team1, match.team2);
        }
      };

      let statusBadge = "";
      if (match.status === "live") {
        statusBadge = `<span class="match-status-badge live"><span class="pulse-dot"></span>Активний</span>`;
      } else if (match.status === "finished") {
        statusBadge = `<span class="match-status-badge completed">Завершено</span>`;
      } else {
        statusBadge = `<span class="match-status-badge upcoming">Очікується</span>`;
      }

      const logo1 = generateTeamLogoSVG(match.team1);
      const logo2 = generateTeamLogoSVG(match.team2);

      const team1WinnerClass = (match.status === "finished" && match.winner === match.team1) ? "winner" : (match.status === "finished" ? "loser" : "");
      const team2WinnerClass = (match.status === "finished" && match.winner === match.team2) ? "winner" : (match.status === "finished" ? "loser" : "");

      node.innerHTML = `
        <div class="match-node-header">
          <span class="match-node-time">${match.time ? match.time.replace('T', ' ') : 'Час не вказано'}</span>
          ${statusBadge}
        </div>
        
        <div class="bracket-team-row ${team1WinnerClass}">
          <div class="bracket-team-info">
            <img class="bracket-team-logo" src="${logo1}" alt="logo">
            <span class="bracket-team-name">${match.team1}</span>
          </div>
          <span class="bracket-team-score">${match.status !== 'upcoming' ? match.score1 : '-'}</span>
        </div>

        <div class="bracket-team-row ${team2WinnerClass}">
          <div class="bracket-team-info">
            <img class="bracket-team-logo" src="${logo2}" alt="logo">
            <span class="bracket-team-name">${match.team2}</span>
          </div>
          <span class="bracket-team-score">${match.status !== 'upcoming' ? match.score2 : '-'}</span>
        </div>
      `;
      col.appendChild(node);
    });

    inner.appendChild(col);
  });
};

// Side-by-side Dual Roster Modal Comparisonclicked on match cards
window.openRosterModalComparison = function(team1Name, team2Name) {
  const db = getDB();
  const team1 = db.teams.find(t => t.name.toLowerCase() === team1Name.toLowerCase());
  const team2 = db.teams.find(t => t.name.toLowerCase() === team2Name.toLowerCase());

  const container = document.getElementById('roster-modal-players');
  if (!container) return;
  container.innerHTML = "";

  document.getElementById('roster-modal-title').innerText = `${team1Name} vs ${team2Name}`;
  
  const tagBadge = document.getElementById('roster-modal-tag');
  if (tagBadge) tagBadge.style.display = "none";

  const flexDiv = document.createElement('div');
  flexDiv.style.display = "grid";
  flexDiv.style.gridTemplateColumns = "1fr 1fr";
  flexDiv.style.gap = "15px";

  // Team 1 players column
  const col1 = document.createElement('div');
  col1.innerHTML = `<div style="font-size:11px; font-weight:800; color:var(--cs-orange); margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:4px; text-transform:uppercase; text-align:center;">${team1Name}</div>`;
  const list1 = document.createElement('div');
  list1.style.display = "flex";
  list1.style.flexDirection = "column";
  list1.style.gap = "6px";
  
  if (team1 && team1.players && team1.players.length > 0) {
    team1.players.forEach(p => {
      const userRecord = db.users.find(u => u.username.toLowerCase() === p.toLowerCase());
      let statusText = 'Offline';
      let statusColor = '#718096';
      if (userRecord && userRecord.loginHistory && userRecord.loginHistory.length > 0) {
        const lastLogin = userRecord.loginHistory[0];
        if (lastLogin && lastLogin.date) {
          const lastVisitTime = new Date(lastLogin.date);
          const isOnline = lastVisitTime && (Date.now() - lastVisitTime.getTime() < 10 * 60 * 1000);
          if (isOnline) {
            statusText = 'Online';
            statusColor = '#26A17B';
          }
        }
      }
      list1.innerHTML += `
        <div class="roster-player-line" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:6px 12px; border-radius:6px; border:1px solid rgba(255,255,255,0.05); margin-bottom:4px; gap: 8px;">
          <span class="roster-player-name" style="font-weight:700; color:white;">@${p.toUpperCase()}</span>
          <span style="font-size:9px; font-weight:800; color:${statusColor}; background:rgba(${statusText === 'Online' ? '38,161,123' : '113,128,150'}, 0.1); border:1px solid rgba(${statusText === 'Online' ? '38,161,123' : '113,128,150'}, 0.2); padding:2px 6px; border-radius:4px; text-transform:uppercase;">${statusText}</span>
        </div>
      `;
    });
  } else {
    list1.innerHTML = `<span style="font-size:11px; color:var(--text-secondary); display:block; text-align:center; padding:10px;">Склад не вказано</span>`;
  }
  col1.appendChild(list1);

  // Team 2 players column
  const col2 = document.createElement('div');
  col2.innerHTML = `<div style="font-size:11px; font-weight:800; color:var(--cs-orange); margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:4px; text-transform:uppercase; text-align:center;">${team2Name}</div>`;
  const list2 = document.createElement('div');
  list2.style.display = "flex";
  list2.style.flexDirection = "column";
  list2.style.gap = "6px";

  if (team2 && team2.players && team2.players.length > 0) {
    team2.players.forEach(p => {
      const userRecord = db.users.find(u => u.username.toLowerCase() === p.toLowerCase());
      let statusText = 'Offline';
      let statusColor = '#718096';
      if (userRecord && userRecord.loginHistory && userRecord.loginHistory.length > 0) {
        const lastLogin = userRecord.loginHistory[0];
        if (lastLogin && lastLogin.date) {
          const lastVisitTime = new Date(lastLogin.date);
          const isOnline = lastVisitTime && (Date.now() - lastVisitTime.getTime() < 10 * 60 * 1000);
          if (isOnline) {
            statusText = 'Online';
            statusColor = '#26A17B';
          }
        }
      }
      list2.innerHTML += `
        <div class="roster-player-line" style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); padding:6px 12px; border-radius:6px; border:1px solid rgba(255,255,255,0.05); margin-bottom:4px; gap: 8px;">
          <span class="roster-player-name" style="font-weight:700; color:white;">@${p.toUpperCase()}</span>
          <span style="font-size:9px; font-weight:800; color:${statusColor}; background:rgba(${statusText === 'Online' ? '38,161,123' : '113,128,150'}, 0.1); border:1px solid rgba(${statusText === 'Online' ? '38,161,123' : '113,128,150'}, 0.2); padding:2px 6px; border-radius:4px; text-transform:uppercase;">${statusText}</span>
        </div>
      `;
    });
  } else {
    list2.innerHTML = `<span style="font-size:11px; color:var(--text-secondary); display:block; text-align:center; padding:10px;">Склад не вказано</span>`;
  }
  col2.appendChild(list2);

  flexDiv.appendChild(col1);
  flexDiv.appendChild(col2);
  container.appendChild(flexDiv);

  openModal('roster-modal');
};

// Show withdraw limit notification
window.showWithdrawNotice = function() {
  showToast('Мінімальна сума виводу від 2000 монет!', 'warning');
};
