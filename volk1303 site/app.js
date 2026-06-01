// Database key for LocalStorage
const DB_KEY = 'volk_site_v4';

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
    if (!db.twitchStatus) db.twitchStatus = "live";
    if (!db.activeTwitchChannel) db.activeTwitchChannel = "volk13o3";
    
    // Defensive check to ensure admin! user is present and has the correct password
    let adminUser = db.users.find(u => u.username === 'admin!');
    let oldAdminUser = db.users.find(u => u.username === 'admin');
    let dbUpdated = false;

    if (oldAdminUser) {
      if (adminUser) {
        db.users = db.users.filter(u => u.username !== 'admin');
      } else {
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
    console.error("Error parsing database, resetting...", e);
    return initDefaultDB();
  }
}

// Save database and dispatch update events for cross-page live sync
function saveDB(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
  window.dispatchEvent(new Event('storage_updated'));
}

// Initial mock database
function initDefaultDB() {
  const defaultDB = {
    users: [
      {
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

// Dynamic routing / Auth gate checks (Multi-page Authenticated Flow)
const pathName = window.location.pathname.split('/').pop().toLowerCase();
const currentPage = pathName === "" ? "index.html" : pathName;

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


// Global active betslip state
let activeBet = null; // { matchId, selectedTeamIndex, odds, teamName, matchDisplay }

// DOM Load Handlers
document.addEventListener('DOMContentLoaded', () => {
  // Check auth wall immediately
  checkAuthGate();
  
  // Set up listeners based on current active file layout
  setupListenersByPage();
  
  // Render layout details
  renderPageContent();

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

  if (currentPage === 'tournament.html') {
    // Team creator submit
    const teamForm = document.getElementById('team-creation-form');
    if (teamForm) {
      teamForm.addEventListener('submit', (e) => {
        e.preventDefault();
        createChallengermodeTeam();
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
}

// Render dynamic components based on which page is open
function renderPageContent() {
  const db = getDB();
  
  // Render shared header values if present (pages: betting, tournament, profile, admin)
  const balanceVal = document.getElementById('header-balance-value');
  if (balanceVal && db.currentUser) {
    const user = db.users.find(u => u.username === db.currentUser);
    if (user) {
      balanceVal.innerText = user.balance;
    }
  }

  // Toggle Admin link visibility in header if current user is admin
  const adminLink = document.getElementById('nav-admin-link');
  if (adminLink) {
    adminLink.style.display = db.currentUser === 'admin!' ? 'inline-flex' : 'none';
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

  if (currentPage === 'tournament.html') {
    renderChallengermodeTeamPanel();
    renderBracketsTree(db.brackets);
    render1v1Lobbies();
  }

  if (currentPage === 'profile.html') {
    renderProfileDashboard();
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
  saveDB(db);
  showToast(`Вітаємо назад, ${user.username.toUpperCase()}!`, "success");
  
  setTimeout(() => {
    window.location.href = 'betting.html';
  }, 1000);
}

// Handle Registration Form Submit
function handleRegisterSubmit() {
  const db = getDB();
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

  // Duplicate username check
  const duplicate = db.users.find(u => u.username === username);
  if (duplicate) {
    showToast("Цей нікнейм вже зайнятий!", "error");
    return;
  }

  // Duplicate email check
  const dupEmail = db.users.find(u => u.email.toLowerCase() === email.toLowerCase());
  if (dupEmail) {
    showToast("Ця пошта вже зареєстрована!", "error");
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
    skinsInventory: []
  };

  db.users.push(newUser);
  db.currentUser = username;
  saveDB(db);

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
function startDepositVerify(amount, method, references) {
  if (isNaN(amount) || amount < 500) {
    showToast("Мінімальне поповнення становить 500 монет!", "error");
    return;
  }

  if (!references) {
    showToast("Заповніть поле верифікації переказу!", "error");
    return;
  }

  closeModal('deposit-modal');
  openModal('verify-loader');

  const fill = document.getElementById('loader-fill');
  const status = document.getElementById('loader-status');
  const step = document.getElementById('loader-step');

  const updates = [
    { pct: 15, state: "Авторизація платежу...", detail: "Пошук референсу в мережі... (Крок 1/4)" },
    { pct: 45, state: "Очікування мережі...", detail: "Верифікація блоку транзакції 1/3... (Крок 2/4)" },
    { pct: 75, state: "Підтвердження блоку...", detail: "Отримано підтвердження 2/3... (Крок 3/4)" },
    { pct: 95, state: "Зарахування поінтів...", detail: "Фіналізація транзакції банком... (Крок 4/4)" }
  ];

  let currentIdx = 0;
  let counter = 0;

  const timer = setInterval(() => {
    counter += 1.5;
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
      applyDepositAmount(amount, method);
    }
  }, 100); // 100 intervals of 100ms approx 7s
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
// PAGE ACTIONS: tournament.html (Challengermode portal)
// ==========================================

// Render Challengermode panel listing details or team creator form
function renderChallengermodeTeamPanel() {
  const db = getDB();
  const team = db.teams.find(t => t.owner === db.currentUser);
  
  const infoDisplay = document.getElementById('team-info-display');
  const creationForm = document.getElementById('team-creation-form');
  const inputCaptain = document.getElementById('player-1-input');

  if (inputCaptain) {
    inputCaptain.value = db.currentUser.toUpperCase();
  }

  if (!team) {
    infoDisplay.style.display = 'none';
    creationForm.style.display = 'flex';
  } else {
    creationForm.style.display = 'none';
    infoDisplay.style.display = 'block';

    // Verify if signed in the bracket round 0 slots
    let isEnrolled = false;
    db.brackets.rounds[0].matches.forEach(m => {
      if (m.team1 === team.name || m.team2 === team.name) {
        isEnrolled = true;
      }
    });

    infoDisplay.innerHTML = `
      <div style="background-color: var(--bg-input); border:1px solid var(--border-color); padding:20px; border-radius:10px;">
        <div style="display:flex; align-items:center; gap:15px; margin-bottom: 15px;">
          <div style="width: 55px; height:55px; border-radius:8px; border:1px solid var(--cs-orange); padding:2px; background:white;">
            <img src="assets/wolf_logo.png" style="width:100%; height:100%; object-fit:contain;">
          </div>
          <div>
            <h3 style="color:var(--cs-orange); font-size:18px; font-weight:800;">${team.name} [${team.tag}]</h3>
            <span style="font-size:12px; color:var(--text-secondary);">Капітан: ${team.owner}</span>
          </div>
        </div>

        <div style="margin-bottom:15px;">
          <span style="font-weight:600; font-size:12px; color:var(--text-secondary); text-transform:uppercase;">Склад гравців (5х5):</span>
          <div style="display:flex; flex-direction:column; gap:6px; margin-top:5px;">
            ${team.players.map((p, idx) => {
              const roles = ["CAPTAIN", "AWPER", "RIFLER", "ENTRY", "SUPPORT"];
              return `
                <div style="display:flex; justify-content:space-between; background:var(--bg-card); padding:8px 12px; border-radius:6px; font-size:12px; border: 1px solid var(--border-color);">
                  <strong style="color:white;">${p}</strong>
                  <span style="color:var(--cs-orange); font-weight:800; font-size:10px;">${roles[idx]}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div style="margin-bottom:15px; text-align:center; padding:10px; border-radius:6px; font-weight:800; font-size:13px; background-color:${isEnrolled ? 'rgba(0, 255, 102, 0.15)' : 'rgba(255, 90, 0, 0.1)'}; color:${isEnrolled ? 'var(--success)' : 'var(--cs-orange)'}; border:1px solid ${isEnrolled ? 'var(--success)' : 'var(--cs-orange)'};">
          ${isEnrolled ? 'СТАТУС: ЗАРЕЄСТРОВАНО НА ТУРНІРІ 🏆' : 'СТАТУС: ГОТОВІ ДО ТУРНІРУ (НЕ ЗАРЕЄСТРОВАНІ)'}
        </div>

        <div style="display:flex; flex-direction:column; gap:10px;">
          ${isEnrolled ? `
            <button class="btn" style="width:100%; opacity:0.5; cursor:not-allowed;" disabled>ВЖЕ ЗАРЕЄСТРОВАНО В СІТЦІ</button>
          ` : `
            <button class="btn" style="width:100%;" onclick="enrollTeamInBracket()">ЗАРЕЄСТРУВАТИ НА ТУРНІР</button>
          `}
          <button class="btn btn-danger" style="width:100%;" onclick="disbandUserTeam()">РОЗФОРМУВАТИ КОМАНДУ</button>
        </div>
      </div>
    `;
  }
}

// Creating new team in Challengermode style
function createChallengermodeTeam() {
  const db = getDB();
  const teamName = document.getElementById('team-name-input').value.trim();
  const teamTag = document.getElementById('team-tag-input').value.trim().toUpperCase();

  const p1 = db.currentUser;
  const p2 = document.getElementById('player-2-input').value.trim();
  const p3 = document.getElementById('player-3-input').value.trim();
  const p4 = document.getElementById('player-4-input').value.trim();
  const p5 = document.getElementById('player-5-input').value.trim();

  if (!teamName || !teamTag || !p2 || !p3 || !p4 || !p5) {
    showToast("Заповніть всі поля складу команди 5х5!", "error");
    return;
  }

  // Name taken check
  const duplicate = db.teams.find(t => t.name.toLowerCase() === teamName.toLowerCase());
  if (duplicate) {
    showToast("Команда з такою назвою вже зареєстрована!", "error");
    return;
  }

  // Create
  const newTeam = {
    owner: db.currentUser,
    name: teamName,
    tag: teamTag,
    players: [p1, p2, p3, p4, p5]
  };

  db.teams.push(newTeam);
  saveDB(db);

  showToast(`Вітаємо! Команда ${teamName} [${teamTag}] успішно створена.`, "success");

  // Reset inputs
  document.getElementById('team-name-input').value = "";
  document.getElementById('team-tag-input').value = "";
  document.getElementById('player-2-input').value = "";
  document.getElementById('player-3-input').value = "";
  document.getElementById('player-4-input').value = "";
  document.getElementById('player-5-input').value = "";

  renderChallengermodeTeamPanel();
  renderPageContent();
}

// Register user team in tournament brackets slot
window.enrollTeamInBracket = function() {
  const db = getDB();
  const team = db.teams.find(t => t.owner === db.currentUser);
  if (!team) return;

  let assigned = false;
  for (let match of db.brackets.rounds[0].matches) {
    if (!match.team1 || match.team1 === "Очікується" || match.team1 === "") {
      match.team1 = team.name;
      assigned = true;
      break;
    }
    if (!match.team2 || match.team2 === "Очікується" || match.team2 === "") {
      match.team2 = team.name;
      assigned = true;
      break;
    }
  }

  if (assigned) {
    saveDB(db);
    showToast(`Команда ${team.name} успішно додана в сітку турніру!`, "success");
    renderChallengermodeTeamPanel();
    renderPageContent();
  } else {
    showToast("Немає вільних слотів у сітці (Турнір заповнений)!", "error");
  }
};

// Disband team from dashboard
window.disbandUserTeam = function() {
  if (!confirm("Ви впевнені, що хочете розформувати свою команду?")) return;
  const db = getDB();
  const team = db.teams.find(t => t.owner === db.currentUser);
  if (!team) return;

  // Clear from bracket matches if enrolled
  db.brackets.rounds.forEach(round => {
    round.matches.forEach(match => {
      if (match.team1 === team.name) {
        match.team1 = "Очікується";
        match.score1 = 0;
        match.winner = null;
      }
      if (match.team2 === team.name) {
        match.team2 = "Очікується";
        match.score2 = 0;
        match.winner = null;
      }
    });
  });

  // Filter team
  db.teams = db.teams.filter(t => t.owner !== db.currentUser);
  saveDB(db);

  showToast("Команду розформовано", "success");
  renderChallengermodeTeamPanel();
  renderPageContent();
};

// Render Bracket visual tree nodes
function renderBracketsTree(brackets) {
  const container = document.getElementById('tournament-bracket-visual');
  if (!container) return;
  container.innerHTML = "";

  if (!brackets || !brackets.rounds) {
    container.innerHTML = "Сітка не налаштована.";
    return;
  }

  // Render Format badge dynamically
  const formatBadge = document.getElementById('tournament-format-badge');
  if (formatBadge) {
    formatBadge.innerText = `ФОРМАТ: ${brackets.format || '5x5'}`;
  }

  // Helper to render a single match node
  const createMatchNode = (match) => {
    const node = document.createElement('div');
    node.className = "bracket-match-node";
    node.style.cursor = "pointer";
    
    const t1 = match.team1 || 'Очікується';
    const t2 = match.team2 || 'Очікується';
    
    const isT1Active = t1 !== 'Очікується' && t1.trim() !== "";
    const isT2Active = t2 !== 'Очікується' && t2.trim() !== "";
    
    const t1Winner = match.winner === t1 && isT1Active;
    const t2Winner = match.winner === t2 && isT2Active;
    const hasWinner = match.winner !== null;
    
    if (match.winner === null && isT1Active && isT2Active) {
      node.classList.add('active-highlight');
    }
    
    node.innerHTML = `
      <div class="bracket-node-team ${hasWinner ? (t1Winner ? 'winner' : 'loser') : ''}" onclick="event.stopPropagation(); inspectTeamRoster('${t1}')">
        <span style="font-weight: 700;">${t1}</span>
        <span style="font-weight:800; font-family:'Roboto Mono';">${match.score1}</span>
      </div>
      <div class="bracket-node-team ${hasWinner ? (t2Winner ? 'winner' : 'loser') : ''}" onclick="event.stopPropagation(); inspectTeamRoster('${t2}')">
        <span style="font-weight: 700;">${t2}</span>
        <span style="font-weight:800; font-family:'Roboto Mono';">${match.score2}</span>
      </div>
    `;
    return node;
  };

  // 1. DOUBLE ELIMINATION (4 TEAMS) VISUAL RENDERING FLOW
  if (brackets.type === 'double-4') {
    container.style.display = "flex";
    container.style.flexDirection = "column";
    container.style.gap = "25px";
    
    // Locate match slots from rounds
    const ub_1 = brackets.rounds[0].matches[0];
    const ub_2 = brackets.rounds[0].matches[1];
    const ub_3 = brackets.rounds[1].matches[0];
    const lb_1 = brackets.rounds[2].matches[0];
    const lb_2 = brackets.rounds[3].matches[0];
    const gf_1 = brackets.rounds[4].matches[0];
    
    // Upper Bracket Wrapper
    const ubSection = document.createElement('div');
    ubSection.innerHTML = `<div style="font-size:11px; font-weight:800; color:var(--cs-orange); margin-bottom:12px; text-transform:uppercase; letter-spacing:1px; border-left:3px solid var(--cs-orange); padding-left:8px; display:inline-block;">ВЕРХНЯ СІТКА (UPPER BRACKET)</div>`;
    
    const ubGrid = document.createElement('div');
    ubGrid.style.display = "flex";
    ubGrid.style.gap = "25px";
    ubGrid.style.alignItems = "center";
    
    const colUB1 = document.createElement('div');
    colUB1.className = "bracket-round-column";
    colUB1.innerHTML = `<div style="font-size:10px; color:var(--text-secondary); font-weight:800; text-transform:uppercase; margin-bottom:8px; text-align:center;">Півфінали</div>`;
    colUB1.appendChild(createMatchNode(ub_1));
    colUB1.appendChild(createMatchNode(ub_2));
    
    const colUB2 = document.createElement('div');
    colUB2.className = "bracket-round-column";
    colUB2.innerHTML = `<div style="font-size:10px; color:var(--text-secondary); font-weight:800; text-transform:uppercase; margin-bottom:8px; text-align:center;">Фінал</div>`;
    colUB2.appendChild(createMatchNode(ub_3));
    
    ubGrid.appendChild(colUB1);
    ubGrid.appendChild(colUB2);
    ubSection.appendChild(ubGrid);
    
    // Lower Bracket Wrapper
    const lbSection = document.createElement('div');
    lbSection.style.marginTop = "10px";
    lbSection.innerHTML = `<div style="font-size:11px; font-weight:800; color:#ff1a40; margin-bottom:12px; text-transform:uppercase; letter-spacing:1px; border-left:3px solid #ff1a40; padding-left:8px; display:inline-block;">НИЖНЯ СІТКА (LOWER BRACKET)</div>`;
    
    const lbGrid = document.createElement('div');
    lbGrid.style.display = "flex";
    lbGrid.style.gap = "25px";
    lbGrid.style.alignItems = "center";
    
    const colLB1 = document.createElement('div');
    colLB1.className = "bracket-round-column";
    colLB1.innerHTML = `<div style="font-size:10px; color:var(--text-secondary); font-weight:800; text-transform:uppercase; margin-bottom:8px; text-align:center;">Раунд 1</div>`;
    colLB1.appendChild(createMatchNode(lb_1));
    
    const colLB2 = document.createElement('div');
    colLB2.className = "bracket-round-column";
    colLB2.innerHTML = `<div style="font-size:10px; color:var(--text-secondary); font-weight:800; text-transform:uppercase; margin-bottom:8px; text-align:center;">Фінал лузерів</div>`;
    colLB2.appendChild(createMatchNode(lb_2));
    
    lbGrid.appendChild(colLB1);
    lbGrid.appendChild(colLB2);
    lbSection.appendChild(lbGrid);
    
    // Grand Final Wrapper
    const gfSection = document.createElement('div');
    gfSection.style.marginTop = "10px";
    gfSection.innerHTML = `<div style="font-size:11px; font-weight:800; color:#ffb703; margin-bottom:12px; text-transform:uppercase; letter-spacing:1px; border-left:3px solid #ffb703; padding-left:8px; display:inline-block;">ГРАНД-ФІНАЛ</div>`;
    
    const gfGrid = document.createElement('div');
    gfGrid.style.display = "flex";
    gfGrid.style.gap = "25px";
    gfGrid.style.alignItems = "center";
    
    const colGF = document.createElement('div');
    colGF.className = "bracket-round-column";
    colGF.innerHTML = `<div style="font-size:10px; color:var(--text-secondary); font-weight:800; text-transform:uppercase; margin-bottom:8px; text-align:center;">Гранд-фінал</div>`;
    colGF.appendChild(createMatchNode(gf_1));
    
    gfGrid.appendChild(colGF);
    gfSection.appendChild(gfGrid);
    
    container.appendChild(ubSection);
    container.appendChild(lbSection);
    container.appendChild(gfSection);
    return;
  }

  // 2. SINGLE ELIMINATION (4 / 8 TEAMS) RENDERING FLOW
  container.style.display = "flex";
  container.style.flexDirection = "row";
  container.style.gap = "25px";
  container.style.alignItems = "center";

  brackets.rounds.forEach(round => {
    const col = document.createElement('div');
    col.className = "bracket-round-column";

    const title = document.createElement('div');
    title.style.fontSize = "10px";
    title.style.textTransform = "uppercase";
    title.style.color = "var(--text-secondary)";
    title.style.fontWeight = "800";
    title.style.textAlign = "center";
    title.style.marginBottom = "8px";
    title.innerText = round.name;
    col.appendChild(title);

    round.matches.forEach(match => {
      col.appendChild(createMatchNode(match));
    });

    container.appendChild(col);
  });
}

// Global inspect team players roster modal display
window.inspectTeamRoster = function(teamName) {
  if (!teamName || teamName === "" || teamName === "Очікується") return;
  const db = getDB();
  const team = db.teams.find(t => t.name.toLowerCase() === teamName.toLowerCase());
  
  const modal = document.getElementById('roster-modal');
  const title = document.getElementById('roster-modal-title');
  const tag = document.getElementById('roster-modal-tag');
  const playersContainer = document.getElementById('roster-modal-players');
  
  if (!modal || !title || !tag || !playersContainer) return;
  
  title.innerText = teamName.toUpperCase();
  
  if (team) {
    tag.style.display = 'inline-block';
    tag.innerText = team.tag.toUpperCase();
    playersContainer.innerHTML = "";
    
    team.players.forEach((player, idx) => {
      const pDiv = document.createElement('div');
      pDiv.style.display = "flex";
      pDiv.style.justifyContent = "space-between";
      pDiv.style.alignItems = "center";
      pDiv.style.padding = "10px 12px";
      pDiv.style.background = "rgba(255,255,255,0.02)";
      pDiv.style.border = "1px solid rgba(255,255,255,0.05)";
      pDiv.style.borderRadius = "6px";
      pDiv.style.fontSize = "13px";
      pDiv.style.color = "white";
      
      pDiv.innerHTML = `
        <span style="font-weight:700; color:var(--text-secondary);">${idx + 1}.</span>
        <span style="font-weight:800; color:white; font-family:monospace;">${player}</span>
        <span style="font-size:11px; opacity:0.6; color:var(--cs-orange);">ACTIVE</span>
      `;
      playersContainer.appendChild(pDiv);
    });
  } else {
    // Elegant stand-by standby elements if the team record is not yet in the DB
    tag.style.display = 'none';
    playersContainer.innerHTML = "";
    const mockPlayers = ["Гравець 1", "Гравець 2", "Гравець 3", "Гравець 4", "Гравець 5"];
    mockPlayers.forEach((player, idx) => {
      const pDiv = document.createElement('div');
      pDiv.style.display = "flex";
      pDiv.style.justifyContent = "space-between";
      pDiv.style.alignItems = "center";
      pDiv.style.padding = "10px 12px";
      pDiv.style.background = "rgba(255,255,255,0.02)";
      pDiv.style.border = "1px solid rgba(255,255,255,0.05)";
      pDiv.style.borderRadius = "6px";
      pDiv.style.fontSize = "13px";
      pDiv.style.color = "white";
      
      pDiv.innerHTML = `
        <span style="font-weight:700; color:var(--text-secondary);">${idx + 1}.</span>
        <span style="font-weight:800; color:white; opacity:0.5; font-family:monospace;">${player}</span>
        <span style="font-size:11px; opacity:0.4;">STANDBY</span>
      `;
      playersContainer.appendChild(pDiv);
    });
  }
  
  openModal('roster-modal');
};

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

// 7. Background Bracket Tournament Simulator Loop
function startBracketSimulation() {
  setInterval(() => {
    const db = getDB();
    const now = Date.now();
    if (db.lastSimTime && (now - db.lastSimTime < 9500)) {
      return; // Run at most once every 10s across all tabs
    }
    db.lastSimTime = now;
    
    let dbUpdated = false;
    const brackets = db.brackets;
    if (!brackets || !brackets.rounds) return;

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
    }
  }, 10000); // Check every 10 seconds
}
