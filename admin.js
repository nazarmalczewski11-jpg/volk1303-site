// Database key for LocalStorage
const DB_KEY = 'volk_site_v4';
const CLOUD_BUCKET = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://localhost:10000/'
  : '/api/';

window.isValidTournament = function(t) {
  if (!t || !t.id || !t.name) return false;
  const name = t.name.trim().toLowerCase();
  const testNames = ["fsdf", "blbl", "fdkfok", "test tournament"];
  if (name.length < 3 || testNames.includes(name)) return false;
  if (!t.format || !t.map) return false;
  return true;
};

window.formatsMatch = function(f1, f2) {
  if (!f1 || !f2) return false;
  const norm1 = String(f1).toLowerCase().replace(/\s+/g, '').replace(/х/g, 'x');
  const norm2 = String(f2).toLowerCase().replace(/\s+/g, '').replace(/х/g, 'x');
  const getBaseFormat = (str) => {
    if (str.includes('1x1')) return '1x1';
    if (str.includes('2x2')) return '2x2';
    if (str.includes('3x3')) return '3x3';
    if (str.includes('4x4')) return '4x4';
    if (str.includes('5x5')) return '5x5';
    return str;
  };
  return getBaseFormat(norm1) === getBaseFormat(norm2);
};

let isSyncing = false;
let activePushes = 0;

// Pull and sync from cloud
async function syncWithCloud() {
  if (isSyncing || activePushes > 0) return;
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
              } else if (cuBetLen === luBetLen && JSON.stringify(lu.betHistory) !== JSON.stringify(cu.betHistory)) {
                lu.betHistory = cu.betHistory;
                userUpdated = true;
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

    // 2. Sync structures (staggered to prevent 429 rate limits)
    if (!window.syncCycleCount) window.syncCycleCount = 0;
    window.syncCycleCount++;

    const isFullSync = (window.syncCycleCount === 1) || (window.syncCycleCount % 3 === 0);

    const fetches = [
      fetch(CLOUD_BUCKET + 'matches', { cache: 'no-store' }),
      fetch(CLOUD_BUCKET + 'tournaments', { cache: 'no-store' })
    ];

    if (isFullSync) {
      fetches.push(
        fetch(CLOUD_BUCKET + 'brackets', { cache: 'no-store' }),
        fetch(CLOUD_BUCKET + 'teams', { cache: 'no-store' }),
        fetch(CLOUD_BUCKET + 'aimLobbies', { cache: 'no-store' }),
        fetch(CLOUD_BUCKET + 'settings', { cache: 'no-store' }),
        fetch(CLOUD_BUCKET + 'promocodes', { cache: 'no-store' }),
        fetch(CLOUD_BUCKET + 'pendingDeposits', { cache: 'no-store' }),
        fetch(CLOUD_BUCKET + 'pendingWithdrawals', { cache: 'no-store' }),
        fetch(CLOUD_BUCKET + 'usedTxids', { cache: 'no-store' }),
        fetch(CLOUD_BUCKET + 'quests', { cache: 'no-store' })
      );
    }

    const results = await Promise.all(fetches);
    
    // Assign results
    let mRes = results[0];
    let tourRes = results[1];
    let bRes = isFullSync ? results[2] : null;
    let tRes = isFullSync ? results[3] : null;
    let lRes = isFullSync ? results[4] : null;
    let sRes = isFullSync ? results[5] : null;
    let pRes = isFullSync ? results[6] : null;
    let pdRes = isFullSync ? results[7] : null;
    let pwdRes = isFullSync ? results[8] : null;
    let txRes = isFullSync ? results[9] : null;
    let questsRes = isFullSync ? results[10] : null;

    if (bRes && bRes.ok) {
      const cloudBrackets = await bRes.json();
      if (JSON.stringify(db.brackets) !== JSON.stringify(cloudBrackets)) {
        db.brackets = cloudBrackets;
        dbChanged = true;
      }
    }
    if (mRes && mRes.ok) {
      const cloudMatches = await mRes.json();
      if (JSON.stringify(db.matches) !== JSON.stringify(cloudMatches)) {
        db.matches = cloudMatches;
        dbChanged = true;
      }
    }
    if (tRes && tRes.ok) {
      const cloudTeams = await tRes.json();
      if (JSON.stringify(db.teams) !== JSON.stringify(cloudTeams)) {
        db.teams = cloudTeams;
        dbChanged = true;
      }
    }
    if (lRes && lRes.ok) {
      const cloudLobbies = await lRes.json();
      if (JSON.stringify(db.aimLobbies) !== JSON.stringify(cloudLobbies)) {
        db.aimLobbies = cloudLobbies;
        dbChanged = true;
      }
    }
    if (pRes && pRes.ok) {
      const cloudPromocodes = await pRes.json();
      if (JSON.stringify(db.promocodes) !== JSON.stringify(cloudPromocodes)) {
        db.promocodes = cloudPromocodes;
        dbChanged = true;
      }
    }
    if (tourRes && tourRes.ok) {
      const cloudTournaments = await tourRes.json();
      if (Array.isArray(cloudTournaments)) {
        db.tournaments = db.tournaments || [];
        db.deletedTournamentIds = db.deletedTournamentIds || [];
        let toursChanged = false;
        cloudTournaments.forEach(ct => {
          // Skip any tournament that was explicitly deleted locally
          if (db.deletedTournamentIds.includes(ct.id)) return;
          const localIdx = db.tournaments.findIndex(t => t.id === ct.id);
          if (localIdx === -1) {
            db.tournaments.push(ct);
            toursChanged = true;
          } else {
            const localTour = db.tournaments[localIdx];
            const cloudTime = ct.lastModified || 0;
            const localTime = localTour.lastModified || 0;
            if (cloudTime > localTime) {
              db.tournaments[localIdx] = ct;
              toursChanged = true;
            } else if (localTime > cloudTime) {
              shouldPush = true;
            } else {
              if (JSON.stringify(localTour) !== JSON.stringify(ct)) {
                db.tournaments[localIdx] = ct;
                toursChanged = true;
              }
            }
          }
        });
        if (toursChanged) dbChanged = true;
      }

      // Retrospective settlement of any 'В грі' tournament bets for completed tournaments
      let betsSettledRetrospectively = false;
      db.tournaments.forEach(tour => {
        if (tour.brackets && tour.brackets.rounds && tour.brackets.rounds.length > 0) {
          const lastRound = tour.brackets.rounds[tour.brackets.rounds.length - 1];
          const finalMatch = lastRound.matches[0];
          if (finalMatch && finalMatch.status === 'finished' && finalMatch.winner) {
            const winnerTeam = finalMatch.winner;
            // Auto mark tournament as completed in db if not done yet
            if (tour.status !== 'completed') {
              tour.status = 'completed';
              tour.completedAt = new Date().toISOString();
              dbChanged = true;
            }
            db.users.forEach(u => {
              let userModified = false;
              (u.betHistory || []).forEach(bet => {
                if (bet.tourId && bet.tourId === tour.id && bet.status === 'В грі') {
                  const isWinner = bet.selectedTeam.toLowerCase() === winnerTeam.toLowerCase();
                  bet.status = isWinner ? "Виграш" : "Програш";
                  bet.payout = isWinner ? Math.round(bet.amount * bet.odds) : 0;
                  if (isWinner) {
                    u.unclaimedBalance = (u.unclaimedBalance || 0) + bet.payout;
                  }
                  betsSettledRetrospectively = true;
                  dbChanged = true;
                  userModified = true;
                }
              });
              if (userModified) {
                fetch(CLOUD_BUCKET + 'user_' + u.username.toLowerCase(), {
                  method: 'POST',
                  body: JSON.stringify(u)
                }).catch(e => console.error("Error pushing individual user key retrospectively:", e));
              }
            });
          }
        }
      });
      if (betsSettledRetrospectively) {
        shouldPush = true;
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
    if (pwdRes && pwdRes.ok) {
      const cloudPendingWithdrawals = await pwdRes.json();
      if (Array.isArray(cloudPendingWithdrawals)) {
        db.pendingWithdrawals = db.pendingWithdrawals || [];
        cloudPendingWithdrawals.forEach(cw => {
          const idx = db.pendingWithdrawals.findIndex(w => w.id === cw.id);
          if (idx === -1) {
            db.pendingWithdrawals.push(cw);
            dbChanged = true;
          } else {
            const localWithdraw = db.pendingWithdrawals[idx];
            if (localWithdraw.status !== cw.status) {
              if (cw.status !== "pending") {
                localWithdraw.status = cw.status;
                dbChanged = true;
              } else if (localWithdraw.status !== "pending") {
                shouldPush = true;
              }
            }
          }
        });
      }
    } else if (pwdRes && pwdRes.status === 404) {
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
    if (sRes && sRes.ok) {
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
    if (questsRes && questsRes.ok) {
      const cloudQuests = await questsRes.json();
      if (JSON.stringify(db.quests) !== JSON.stringify(cloudQuests)) {
        db.quests = cloudQuests;
        dbChanged = true;
      }
    } else if (questsRes && questsRes.status === 404) {
      shouldPush = true;
    }
    
    updateSyncStatus(true, "Синхронізовано: " + new Date().toLocaleTimeString());

    if (dbChanged) {
      // Abort overwriting if a local push has started in the meantime to avoid race conditions!
      if (activePushes > 0) {
        console.log("[SYNC] Aborted overwriting local changes due to active push.");
        return;
      }
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

async function pushToCloud(db) {
  activePushes++;
  try {
    const promises = [
      fetch(CLOUD_BUCKET + 'users', { method: 'POST', body: JSON.stringify(db.users) }),
      fetch(CLOUD_BUCKET + 'brackets', { method: 'POST', body: JSON.stringify(db.brackets) }),
      fetch(CLOUD_BUCKET + 'matches', { method: 'POST', body: JSON.stringify(db.matches) }),
      fetch(CLOUD_BUCKET + 'teams', { method: 'POST', body: JSON.stringify(db.teams) }),
      fetch(CLOUD_BUCKET + 'aimLobbies', { method: 'POST', body: JSON.stringify(db.aimLobbies) }),
      fetch(CLOUD_BUCKET + 'promocodes', { method: 'POST', body: JSON.stringify(db.promocodes) }),
      fetch(CLOUD_BUCKET + 'pendingDeposits', { method: 'POST', body: JSON.stringify(db.pendingDeposits || []) }),
      fetch(CLOUD_BUCKET + 'pendingWithdrawals', { method: 'POST', body: JSON.stringify(db.pendingWithdrawals || []) }),
      fetch(CLOUD_BUCKET + 'usedTxids', { method: 'POST', body: JSON.stringify(db.usedTxids || []) }),
      fetch(CLOUD_BUCKET + 'tournaments', { method: 'POST', body: JSON.stringify(db.tournaments || []) }),
      fetch(CLOUD_BUCKET + 'settings', { method: 'POST', body: JSON.stringify({
        twitchStatus: db.twitchStatus,
        activeTwitchChannel: db.activeTwitchChannel
      }) }),
      fetch(CLOUD_BUCKET + 'quests', { method: 'POST', body: JSON.stringify(db.quests || []) })
    ];

    if (searchedUserNick) {
      const username = searchedUserNick.toLowerCase();
      const user = db.users.find(u => u.username.toLowerCase() === username);
      if (user) {
        promises.push(
          fetch(CLOUD_BUCKET + 'user_' + username, {
            method: 'POST',
            body: JSON.stringify(user)
          })
        );
      }
    }

    await Promise.all(promises);
  } catch (e) {
    console.error("Failed to push to cloud:", e);
  } finally {
    activePushes = Math.max(0, activePushes - 1);
  }
}

// Fresh database getter
function getDB() {
  const data = localStorage.getItem(DB_KEY);
  if (!data) return null;
  try {
    const db = JSON.parse(data);
    
    // Parse stringified collections from cloud
    const parseField = (f) => {
      if (typeof f === 'string') {
        try {
          return JSON.parse(f);
        } catch (e) {
          console.error("Error parsing field:", e);
        }
      }
      return f;
    };
    db.users = parseField(db.users) || [];
    db.teams = parseField(db.teams) || [];
    db.matches = parseField(db.matches) || [];
    db.aimLobbies = parseField(db.aimLobbies) || [];
    db.promocodes = parseField(db.promocodes) || [];
    db.pendingDeposits = parseField(db.pendingDeposits) || [];
    db.pendingWithdrawals = parseField(db.pendingWithdrawals) || [];
    db.usedTxids = parseField(db.usedTxids) || [];
    db.tournaments = parseField(db.tournaments) || [];
    db.quests = parseField(db.quests) || [];
    
    // Defensive check to ensure admin user is present and has the correct password
    let adminUser = db.users.find(u => u.username === 'admin');
    let oldAdminUser = db.users.find(u => u.username === 'admin!');
    let dbUpdated = false;

    if (oldAdminUser) {
      if (adminUser) {
        db.users = db.users.filter(u => u.username !== 'admin!');
      } else {
        oldAdminUser.username = 'admin';
        adminUser = oldAdminUser;
      }
      dbUpdated = true;
    }

    if (!adminUser) {
      adminUser = {
        email: "admin@volk.com",
        username: "admin",
        password: "111111",
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

    if (adminUser.password !== "111111") {
      adminUser.password = "111111";
      dbUpdated = true;
    }

    if (db.currentUser === 'admin!') {
      db.currentUser = 'admin';
      dbUpdated = true;
    }

    // Filter out phantom bets (FSDF or deleted tournaments)
    db.users.forEach(user => {
      if (user.betHistory && Array.isArray(user.betHistory)) {
        const oldLen = user.betHistory.length;
        user.betHistory = user.betHistory.filter(bet => {
          if (!bet) return false;
          if (bet.selectedTeam && bet.selectedTeam.toUpperCase() === 'FSDF') {
            return false;
          }
          if (bet.type === 'tournament') {
            const tourExists = db.tournaments.some(t => String(t.id) === String(bet.tourId));
            if (!tourExists) {
              return false;
            }
          }
          return true;
        });
        if (user.betHistory.length !== oldLen) {
          dbUpdated = true;
        }
      }
    });

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
  sessionStorage.removeItem('volk_admin_authorized');
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

  // Trigger background cloud sync immediately and poll every 12 seconds
  syncWithCloud();
  setInterval(syncWithCloud, 12000);

  // Start background simulation loop in case admin panel is the only page open
  
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
  const overlay = document.getElementById('admin-login-overlay');
  const urlParams = new URLSearchParams(window.location.search);

  if (urlParams.has('logout')) {
    sessionStorage.removeItem('volk_admin_authorized');
    // Clear URL query parameter without reloading page
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (urlParams.has('reload')) {
    // Clear cache-busting reload parameter without reloading page
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  const isAdminAuthorized = sessionStorage.getItem('volk_admin_authorized') === 'true';

  if (!isAdminAuthorized) {
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

  // Faceit update form
  const updateFaceitForm = document.getElementById('admin-update-faceit-form');
  if (updateFaceitForm) {
    updateFaceitForm.addEventListener('submit', (e) => {
      e.preventDefault();
      updateUserFaceitAdmin();
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

  // Tournament Form Submit Listener
  const tourForm = document.getElementById('admin-tournament-form');
  if (tourForm) {
    tourForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveTournamentAdmin();
    });
  }
}

// Global selected user state in Coin Dispenser
let searchedUserNick = null;

// Handle Admin Login Overlay Submit
function handleAdminLoginSubmit() {
  const userVal = document.getElementById('admin-login-username').value.trim().toLowerCase();
  const passVal = document.getElementById('admin-login-password').value;

  if (userVal === 'admin' && passVal === '111111') {
    let db = getDB();
    if (!db) {
      db = {
        users: [{
          email: "admin@volk.com",
          username: "admin",
          password: "111111",
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
    
    sessionStorage.setItem('volk_admin_authorized', 'true');
    showToast("Вхід виконано успішно!", "success");
    checkAdminAuth();
  } else {
    showToast("Невірний логін або пароль адміністратора!", "error");
  }
}

// User Search in Admin Panel Database
async function handleUserSearchAdmin() {
  const db = getDB();
  const input = document.getElementById('admin-user-search-input');
  const nick = input.value.trim().toLowerCase();

  if (!nick) {
    showToast("Введіть ім'я користувача для пошуку!", "error");
    return;
  }

  // Fetch individual user key directly from cloud for real-time fresh balance
  let user = null;
  try {
    const res = await fetch(CLOUD_BUCKET + 'user_' + nick, { cache: 'no-store' });
    if (res.ok) {
      const cloudUser = await res.json();
      if (cloudUser && cloudUser.username) {
        const luIdx = db.users.findIndex(u => u.username.toLowerCase() === nick);
        if (luIdx === -1) {
          db.users.push(cloudUser);
        } else {
          db.users[luIdx] = cloudUser;
        }
        localStorage.setItem(DB_KEY, JSON.stringify(db));
        user = cloudUser;
      }
    }
  } catch (e) {
    console.error("Failed to fetch fresh user key from cloud:", e);
  }

  if (!user) {
    user = db.users.find(u => u.username.toLowerCase() === nick.toLowerCase());
  }

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
    <div><strong>FACEIT:</strong> ${user.linkedFaceitName ? `${user.linkedFaceitName} (LVL ${user.faceitLevel || 1}, ELO ${user.faceitElo || 0})` : 'не прив\'язано'}</div>
  `;
  controls.style.display = 'block';

  // Prepopulate Faceit fields
  const faceitNickInput = document.getElementById('admin-faceit-nick');
  const faceitLvlInput = document.getElementById('admin-faceit-lvl');
  const faceitEloInput = document.getElementById('admin-faceit-elo');
  if (faceitNickInput) faceitNickInput.value = user.linkedFaceitName || "";
  if (faceitLvlInput) faceitLvlInput.value = user.faceitLevel || "";
  if (faceitEloInput) faceitEloInput.value = user.faceitElo || "";
}

// Adjust User Balance (Points dispensing)
function adjustUserBalanceAdmin(action) {
  if (!searchedUserNick) return;
  const db = getDB();
  const user = db.users.find(u => u.username.toLowerCase() === searchedUserNick.toLowerCase());
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
  const isAdminAuthorized = sessionStorage.getItem('volk_admin_authorized') === 'true';
  if (!db || !isAdminAuthorized) return;

  // Track and notify about new registrations in real-time
  checkNewRegistrations(db);

  // Header display
  const adminName = document.getElementById('sidebar-admin-username');
  if (adminName) {
    adminName.innerText = "ADMIN";
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
  renderAdminUserTeamsList(db.teams || []);
  renderAdminPromocodesList(db.promocodes || []);
  renderAdminPendingDeposits(db.pendingDeposits || []);
  renderAdminPendingWithdrawals(db.pendingWithdrawals || []);
  renderAdminTournamentsList(db.tournaments || []);
  renderTournamentBettingTab();
  renderAdminQuests(db);
  renderAdminQuestsList(db);
  
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

  const matchesVal = document.getElementById('metric-total-matches');
  if (matchesVal) {
    const activeTournaments = (db.tournaments || []).filter(t => t.status === 'active').length;
    const activeLobbyMatches = (db.matches || []).filter(m => m.status === 'live' || m.status === 'active').length;
    matchesVal.innerText = activeTournaments + activeLobbyMatches;
  }
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
      if (regEvent) {
        events.push({
          time: regEvent.date,
          tag: "reg",
          text: `Новий гравець <strong>${u.username.toUpperCase()}</strong> зареєструвався в системі`
        });
      }
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
  events.sort((a, b) => parseLocaleDateAdmin(b.time) - parseLocaleDateAdmin(a.time));

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

    const isSystemAdmin = user.username.toLowerCase() === 'admin';

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

window.deleteUserAdmin = async function(username) {
  if (username.toLowerCase() === 'admin') {
    showToast("Неможливо видалити акаунт адміністратора!", "error");
    return;
  }
  if (!confirm(`Ви впевнені, що хочете видалити користувача ${username.toUpperCase()} та очистити його дані?`)) return;

  const db = getDB();
  db.users = db.users.filter(u => u.username.toLowerCase() !== username.toLowerCase());

  try {
    await fetch(CLOUD_BUCKET + 'user_' + username.toLowerCase(), { method: 'DELETE' });
  } catch (err) {
    console.error("Failed to delete user profile from backend:", err);
  }

  await saveDB(db);
  showToast(`Користувача ${username.toUpperCase()} успішно видалено!`, "success");
  renderAdminPanel();
};

window.autoSelectUserForDispenser = function(nick) {
  switchAdminTab('users');
  document.getElementById('admin-user-search-input').value = nick;
  handleUserSearchAdmin();
};

// =====================================================
// TOURNAMENT BETTING TAB - Admin
// =====================================================
function renderTournamentBettingTab() {
  console.log("Rendering Tournament Betting Tab...");
  const container = document.getElementById('admin-tournament-betting-list');
  if (!container) {
    console.error("Betting container not found!");
    return;
  }
  
  try {
    const db = getDB();
    if (!db) {
      console.warn("Database not loaded.");
      return;
    }
    const tournaments = (db.tournaments || []).filter(t => window.isValidTournament(t));
    console.log(`Found ${tournaments.length} active tournaments for betting.`);

    if (tournaments.length === 0) {
      container.innerHTML = `<div style="text-align:center; color:var(--text-secondary); padding:40px; font-size:13px;">Немає доступних турнірів</div>`;
      return;
    }

    container.innerHTML = "";
    tournaments.forEach(tour => {
      const statusMap = { upcoming: { label: "Очікується", color: "var(--text-secondary)" }, active: { label: "Активний", color: "var(--cs-orange)" }, completed: { label: "Завершений", color: "var(--success)" } };
      const st = statusMap[tour.status] || statusMap.upcoming;

      const card = document.createElement('div');
      card.className = "card";
      card.style.marginBottom = "12px";
      card.style.overflow = "hidden";

      const regTeams = (tour.registeredTeams || []).filter(Boolean);
      const teamCount = regTeams.length;

      card.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; cursor:pointer; gap:12px;" onclick="toggleBettingTourCard('${tour.id}')">
          <div style="display:flex; align-items:center; gap:12px; flex:1; min-width:0;">
            <div style="background:rgba(255,90,0,0.1); border:1px solid rgba(255,90,0,0.3); border-radius:8px; width:40px; height:40px; display:flex; align-items:center; justify-content:center; font-size:18px; flex-shrink:0;">🏆</div>
            <div style="min-width:0;">
              <div style="font-size:14px; font-weight:800; color:white; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${tour.name}</div>
              <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">${tour.format} · ${tour.map} · <span style="color:${st.color}; font-weight:700;">${st.label}</span></div>
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:10px; flex-shrink:0;">
            <span style="font-size:11px; background:rgba(255,255,255,0.05); padding:4px 10px; border-radius:20px; color:var(--text-secondary);">${teamCount} команд</span>
            ${tour.isFrozen ? `
              <button onclick="event.stopPropagation(); toggleFreezeTournamentBettingAdmin('${tour.id}', false);" class="btn btn-danger" style="padding:4px 10px; font-size:11px; font-weight:800; background:var(--error); border:none; border-radius:6px; color:white; cursor:pointer;">Розморозити 🔓</button>
            ` : `
              <button onclick="event.stopPropagation(); toggleFreezeTournamentBettingAdmin('${tour.id}', true);" class="btn btn-secondary" style="padding:4px 10px; font-size:11px; font-weight:800; background:#2d3748; border:1px solid #4a5568; border-radius:6px; color:white; cursor:pointer;">Заморозити ❄️</button>
            `}
            <span id="betting-chevron-${tour.id}" style="color:var(--cs-orange); font-size:14px; transition:transform 0.2s;">▼</span>
          </div>
        </div>
        <div id="betting-tour-teams-${tour.id}" style="display:none; margin-top:16px; border-top:1px solid rgba(255,255,255,0.05); padding-top:16px;">
          <div id="betting-teams-inner-${tour.id}"></div>
        </div>
      `;
      container.appendChild(card);
    });
  } catch (err) {
    console.error("Error in renderTournamentBettingTab:", err);
    container.innerHTML = `<div style="text-align:center; color:red; padding:40px; font-size:13px;">Помилка відображення: ${err.message}</div>`;
  }
}

window.toggleFreezeTournamentBettingAdmin = function(tourId, freeze) {
  const db = getDB();
  const tour = (db.tournaments || []).find(t => t.id === tourId);
  if (!tour) return;
  tour.isFrozen = freeze;
  tour.lastModified = Date.now();
  saveDB(db);
  showToast(freeze ? "Ставки на турнір заморожено!" : "Ставки на турнір розморожено!", freeze ? "error" : "success");
  renderAdminPanel();
};

window.toggleBettingTourCard = function(tourId) {
  const panel = document.getElementById(`betting-tour-teams-${tourId}`);
  const chevron = document.getElementById(`betting-chevron-${tourId}`);
  if (!panel) return;

  if (panel.style.display === 'none') {
    panel.style.display = 'block';
    if (chevron) chevron.style.transform = 'rotate(180deg)';
    renderBettingTeamsForTour(tourId);
  } else {
    panel.style.display = 'none';
    if (chevron) chevron.style.transform = 'rotate(0deg)';
  }
};

function renderBettingTeamsForTour(tourId) {
  try {
    const db = getDB();
    const tournaments = (db.tournaments || []).filter(Boolean);
    const tour = tournaments.find(t => t.id === tourId);
    const inner = document.getElementById(`betting-teams-inner-${tourId}`);
    if (!tour || !inner) return;

    const regTeams = (tour.registeredTeams || []).filter(Boolean);

    if (regTeams.length === 0) {
      inner.innerHTML = `<div style="color:var(--text-secondary); font-size:12px; text-align:center; padding:16px;">Команди ще не додані до цього турніру</div>`;
      return;
    }

    const teams = (db.teams || []).filter(Boolean);
    const teamObjects = regTeams.map(tid => teams.find(t => t.id === tid)).filter(Boolean);

    inner.innerHTML = `
      <div style="font-size:11px; font-weight:800; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:12px;">👥 Команди та коефіцієнти</div>
      <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:10px;">
        ${teamObjects.map(team => {
          const odds = (tour.teamOdds && tour.teamOdds[team.id] !== undefined) ? tour.teamOdds[team.id] : 2.5;
          return `
            <div style="background:#0c0d12; border:1px solid rgba(255,255,255,0.05); border-radius:10px; padding:14px; display:flex; flex-direction:column; gap:10px;">
              <div style="display:flex; align-items:center; gap:8px;">
                <div style="width:8px; height:8px; border-radius:50%; background:var(--cs-orange); flex-shrink:0;"></div>
                <span style="font-size:13px; font-weight:800; color:white; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">${team.name}</span>
                <span style="font-size:10px; color:var(--text-secondary);">[${team.tag || '?'}]</span>
              </div>
              <div style="font-size:10px; color:var(--text-secondary);">👥 ${(team.players || []).length} гравців</div>
              <div>
                <label style="font-size:10px; font-weight:800; color:var(--cs-orange); text-transform:uppercase; letter-spacing:0.5px; display:block; margin-bottom:5px;">КОЕФІЦІЄНТ</label>
                <div style="display:flex; gap:6px; align-items:center;">
                  <input type="number" id="odds-input-${tourId}-${team.id}" value="${odds}" min="1.01" max="99.99" step="0.01" placeholder="напр. 2.50" style="flex:1; background:#1a1b26; border:1px solid rgba(255,90,0,0.3); color:white; border-radius:6px; padding:7px 10px; font-size:13px; font-weight:800; outline:none;" onkeyup="if(event.key==='Enter') setTournamentTeamOdds('${tourId}', '${team.id}')">
                  <button onclick="setTournamentTeamOdds('${tourId}', '${team.id}')" style="background:var(--cs-orange); border:none; color:white; border-radius:6px; padding:7px 12px; font-size:12px; font-weight:800; cursor:pointer; transition:opacity 0.2s;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">✓</button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } catch (err) {
    console.error("Error in renderBettingTeamsForTour:", err);
  }
}

window.setTournamentTeamOdds = function(tourId, teamId) {
  const db = getDB();
  const tournaments = (db.tournaments || []).filter(Boolean);
  const tour = tournaments.find(t => t.id === tourId);
  if (!tour) return;

  const input = document.getElementById(`odds-input-${tourId}-${teamId}`);
  if (!input) return;

  const val = parseFloat(input.value);
  if (isNaN(val) || val < 1.01) {
    showToast('Коефіцієнт має бути числом ≥ 1.01', 'error');
    return;
  }

  if (!tour.teamOdds) tour.teamOdds = {};
  tour.teamOdds[teamId] = parseFloat(val.toFixed(2));

  saveDB(db);
  showToast(`Коефіцієнт встановлено: x${val.toFixed(2)}`, 'success');
  // Flash the input green briefly
  input.style.borderColor = 'var(--success)';
  setTimeout(() => { input.style.borderColor = 'rgba(255,90,0,0.3)'; }, 1000);
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
          <input type="number" id="score1-${match.id}" class="form-input" value="${match.score1}" min="0" max="13" onchange="updateMatchScoreAdmin('${match.id}')" style="padding:6px 10px;">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>Рахунок ${match.team2}</label>
          <input type="number" id="score2-${match.id}" class="form-input" value="${match.score2}" min="0" max="13" onchange="updateMatchScoreAdmin('${match.id}')" style="padding:6px 10px;">
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
  // Also freeze odds when finished
  if (val === 'finished') {
    match.isFrozen = true;
  }
  saveDB(db);

  // Push matches to cloud immediately so clients see the status change
  fetch(CLOUD_BUCKET + 'matches', { method: 'POST', body: JSON.stringify(db.matches) })
    .catch(e => console.error('Помилка пуша матчів:', e));

  showToast(`Статус матчу змінено на: ${val}`, "success");

  // Remind admin to settle bets when match is finished
  if (val === 'finished') {
    let activeBetsOnMatch = 0;
    db.users.forEach(u => {
      (u.betHistory || []).forEach(bet => {
        if (bet.matchId === id && bet.status === 'В грі') activeBetsOnMatch++;
      });
    });
    if (activeBetsOnMatch > 0) {
      setTimeout(() => {
        showToast(`⚠️ Є ${activeBetsOnMatch} ставок "В грі" на цей матч! Натисніть кнопку розрахунку нижче.`, 'error');
      }, 800);
    }
    renderAdminPanel();
  }
};


// Update Match Score, dynamic recalculations and 6-0 auto-freezing check
window.updateMatchScoreAdmin = function(id) {
  const db = getDB();
  const match = db.matches.find(m => m.id === id);
  if (!match) return;

  let score1 = parseInt(document.getElementById(`score1-${match.id}`).value) || 0;
  let score2 = parseInt(document.getElementById(`score2-${match.id}`).value) || 0;

  if (score1 > 13) {
    score1 = 13;
    document.getElementById(`score1-${match.id}`).value = 13;
  }
  if (score2 > 13) {
    score2 = 13;
    document.getElementById(`score2-${match.id}`).value = 13;
  }

  match.score1 = score1;
  match.score2 = score2;

  // Auto Recalculate odds
  const odds = calculateLiveOdds(score1, score2);
  match.coef1 = odds.coef1;
  match.coef2 = odds.coef2;

  // Auto-Freeze check if score difference is 6 or more
  if (Math.abs(score1 - score2) >= 6) {
    match.isFrozen = true;
    showToast(`Авто-заморозка коефіцієнтів! Рахунок: ${score1}:${score2}`, "error");
  }

  // Auto-finish if score reaches 13 or more (CS2 limit)
  if (score1 >= 13 || score2 >= 13) {
    match.status = 'finished';
    match.isFrozen = true;
    showToast(`Матч завершено! Рахунок: ${score1}:${score2}. Оберіть переможця нижче.`, "success");
  }

  saveDB(db);
  showToast(`Рахунок оновлено: ${score1}:${score2}`, "success");
  if (score1 >= 13 || score2 >= 13) {
    renderAdminPanel();
  }
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
  if (!confirm("Ви впевнені, що хочете видалити цей матч? Усі ставки 'В грі' будуть анульовані і кошти повернуто!")) return;
  const db = getDB();

  // Auto-cancel all active bets on this match and refund coins
  let refundCount = 0;
  db.users.forEach(user => {
    (user.betHistory || []).forEach(bet => {
      if (bet.matchId === id && bet.status === 'В грі') {
        bet.status = 'Анульовано';
        bet.payout = bet.amount; // full refund
        user.balance += bet.amount;
        refundCount++;
      }
    });
  });

  db.matches = db.matches.filter(m => m.id !== id);
  saveDB(db);

  if (refundCount > 0) {
    showToast(`Матч видалено! Анульовано ${refundCount} ставок — кошти повернуто гравцям.`, "success");
  } else {
    showToast("Матч видалено!", "success");
  }
};

// Settle Bets and distribute payouts
window.settleMatchPayouts = function(id, winningTeamIdx) {
  const db = getDB();
  const match = db.matches.find(m => m.id === id);
  if (!match) return;

  const winnerName = winningTeamIdx === 1 ? match.team1 : match.team2;
  const settledPromises = [];

  db.users.forEach(user => {
    let userModified = false;
    (user.betHistory || []).forEach(bet => {
      if (bet.matchId === id && bet.status === 'В грі') {
        if (bet.teamIndex === winningTeamIdx) {
          bet.status = "Виграш";
          bet.payout = Math.round(bet.amount * bet.odds);
          user.unclaimedBalance = (user.unclaimedBalance || 0) + bet.payout;
        } else {
          bet.status = "Програш";
          bet.payout = 0;
        }
        userModified = true;
      }
    });

    if (userModified) {
      settledPromises.push(
        fetch(CLOUD_BUCKET + 'user_' + user.username.toLowerCase(), {
          method: 'POST',
          body: JSON.stringify(user)
        })
      );
    }
  });

  // Remove settled match from active list
  db.matches = db.matches.filter(m => m.id !== id);
  saveDB(db);

  // Immediately push settled users AND updated matches to cloud
  settledPromises.push(fetch(CLOUD_BUCKET + 'users', { method: 'POST', body: JSON.stringify(db.users) }));
  settledPromises.push(fetch(CLOUD_BUCKET + 'matches', { method: 'POST', body: JSON.stringify(db.matches) }));

  Promise.all(settledPromises).catch(e => console.error('Помилка пуша розрахунку:', e));

  showToast(`Ставки розраховано! Переможець: ${winnerName}`, "success");
  renderAdminPanel();
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
    'brackets': 'Керування турнірами та сітками матчів',
    'teams': 'Команди та склади гравців',
    'users': 'Баланси та реєстри користувачів',
    'deposits-verify': 'Верифікація депозитів Monobank',
    'database': 'База Даних (Логи та Активність)',
    'promocodes': 'Центр керування промокодами',
    'quests': 'Керування щоденними квестами',
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

// Get maximum allowed players based on the format string
function getMaxPlayersForFormat(formatStr) {
  if (!formatStr) return 99;
  const normalized = formatStr.toLowerCase().replace(/\s+/g, '');
  // Matches patterns like 2x2, 2v2, 2н2 (Ukrainian н), 2на2, 2-2, 2_2, 2х2 (cyrillic х)
  const match = normalized.match(/^(\d+)(?:x|v|на|н|-|\u0445)?\d*$/);
  if (match) {
    const num = parseInt(match[1], 10);
    if (!isNaN(num)) return num;
  }
  const anyDigit = normalized.match(/(\d+)/);
  if (anyDigit) {
    return parseInt(anyDigit[1], 10);
  }
  return 99;
}

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

  const maxAllowed = getMaxPlayersForFormat(format);
  if (playersRaw.length > maxAllowed) {
    showToast(`Помилка: Максимальна кількість учасників для формату ${format} становить ${maxAllowed}!`, "error");
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

// Render registered User Teams list card
function renderAdminUserTeamsList(teams) {
  const db = getDB();
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
        Склад: ${team.players.map(p => {
          const userObj = db.users.find(u => u.username.toLowerCase() === p.toLowerCase());
          let isOnline = false;
          if (userObj && userObj.loginHistory && userObj.loginHistory.length > 0) {
            const lastLogin = userObj.loginHistory[0];
            if (lastLogin && lastLogin.date) {
              const lastVisitTime = new Date(lastLogin.date);
              isOnline = lastVisitTime && (Date.now() - lastVisitTime.getTime() < 10 * 60 * 1000);
            }
          }
          const color = isOnline ? '#26A17B' : 'rgba(255,255,255,0.6)';
          return `<span style="color:${color}; font-weight:${isOnline ? 'bold' : 'normal'};">@${p.toUpperCase()}${isOnline ? ' (online)' : ' (offline)'}</span>`;
        }).join(', ') || '<span style="color:var(--text-secondary); font-style:italic;">Немає гравців</span>'}
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

function parseLocaleDateAdmin(dateStr) {
  if (!dateStr) return new Date(0);
  let cleanStr = dateStr.trim();
  if (cleanStr.includes('.')) {
    const parts = cleanStr.split(',');
    const datePart = parts[0].trim();
    const timePart = parts[1] ? parts[1].trim() : '';
    const dateSubparts = datePart.split('.');
    if (dateSubparts.length === 3) {
      const day = parseInt(dateSubparts[0], 10);
      const month = parseInt(dateSubparts[1], 10) - 1;
      const year = parseInt(dateSubparts[2], 10);
      let hour = 0, min = 0, sec = 0;
      if (timePart) {
        const timeSubparts = timePart.split(':');
        hour = parseInt(timeSubparts[0] || 0, 10);
        min = parseInt(timeSubparts[1] || 0, 10);
        sec = parseInt(timeSubparts[2] || 0, 10);
      }
      return new Date(year, month, day, hour, min, sec);
    }
  }
  const d = new Date(cleanStr);
  if (!isNaN(d.getTime())) {
    return d;
  }
  return new Date(0);
}

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

  allDeposits.sort((a, b) => parseLocaleDateAdmin(b.date) - parseLocaleDateAdmin(a.date));

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
      <td><button class="btn btn-danger" style="padding:4px 8px; font-size:10px;" onclick="deleteDepositLogAdmin('${dep.username}', '${dep.date}')">Видалити</button></td>
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
        id: bet.id || '',
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

  allBets.sort((a, b) => parseLocaleDateAdmin(b.date) - parseLocaleDateAdmin(a.date));

  const filtered = allBets.filter(b => {
    return b.username.toLowerCase().includes(searchQuery) || b.matchDisplay.toLowerCase().includes(searchQuery) || b.selectedTeam.toLowerCase().includes(searchQuery);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color:var(--text-secondary); padding: 20px;">Ставок не знайдено</td></tr>`;
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
      <td><button class="btn btn-danger" style="padding:4px 8px; font-size:10px;" onclick="deleteBetLogAdmin('${bet.username}', '${bet.id}')">Видалити</button></td>
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

  allLogins.sort((a, b) => parseLocaleDateAdmin(b.date) - parseLocaleDateAdmin(a.date));

  const filtered = allLogins.filter(l => {
    return l.username.toLowerCase().includes(searchQuery) || l.device.toLowerCase().includes(searchQuery);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-secondary); padding: 20px;">Логів входів не знайдено</td></tr>`;
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
      <td><button class="btn btn-danger" style="padding:4px 8px; font-size:10px;" onclick="deleteLoginLogAdmin('${log.username}', '${log.date}')">Видалити</button></td>
    `;
    tbody.appendChild(tr);
  });
}

window.deleteDepositLogAdmin = async function(username, date) {
  if (!confirm(`Ви впевнені, що хочете видалити цей запис депозиту?`)) return;
  const db = getDB();
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (user) {
    user.depositHistory = (user.depositHistory || []).filter(dep => dep.date !== date);
    try {
      await fetch(CLOUD_BUCKET + 'user_' + username.toLowerCase(), {
        method: 'POST',
        body: JSON.stringify(user)
      });
    } catch (e) {
      console.error(e);
    }
    await saveDB(db);
    showToast("Запис депозиту успішно видалено!", "success");
    renderDatabaseTab();
  }
};

window.deleteBetLogAdmin = async function(username, betId) {
  if (!confirm(`Ви впевнені, що хочете видалити цей запис ставки?`)) return;
  const db = getDB();
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (user) {
    user.betHistory = (user.betHistory || []).filter(b => b.id !== betId);
    try {
      await fetch(CLOUD_BUCKET + 'user_' + username.toLowerCase(), {
        method: 'POST',
        body: JSON.stringify(user)
      });
    } catch (e) {
      console.error(e);
    }
    await saveDB(db);
    showToast("Запис ставки успішно видалено!", "success");
    renderDatabaseTab();
  }
};

window.deleteLoginLogAdmin = async function(username, date) {
  if (!confirm(`Ви впевнені, що хочете видалити цей запис входу?`)) return;
  const db = getDB();
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (user) {
    user.loginHistory = (user.loginHistory || []).filter(log => log.date !== date);
    try {
      await fetch(CLOUD_BUCKET + 'user_' + username.toLowerCase(), {
        method: 'POST',
        body: JSON.stringify(user)
      });
    } catch (e) {
      console.error(e);
    }
    await saveDB(db);
    showToast("Запис входу успішно видалено!", "success");
    renderDatabaseTab();
  }
};

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

  const logins = [...(user.loginHistory || [])];
  logins.sort((a, b) => parseLocaleDateAdmin(b.date) - parseLocaleDateAdmin(a.date));
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

  const user = db.users.find(u => u.username.toLowerCase() === deposit.username.toLowerCase());
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

  // Push dedicated user key for approved depositor instantly!
  fetch(CLOUD_BUCKET + 'user_' + user.username.toLowerCase(), {
    method: 'POST',
    body: JSON.stringify(user)
  }).catch(e => console.error("Failed to push approved user key:", e));

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

// Render pending withdrawals list
function renderAdminPendingWithdrawals(pendingWithdrawals) {
  const tbody = document.getElementById('admin-pending-withdrawals-tbody');
  if (!tbody) return;
  tbody.innerHTML = "";

  const activePending = pendingWithdrawals.filter(w => w.status === "pending");

  if (activePending.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-secondary); padding: 15px;">Немає активних запитів на виведення коштів</td></tr>`;
    return;
  }

  const db = getDB();

  activePending.forEach(w => {
    const user = db.users.find(u => u.username.toLowerCase() === w.username.toLowerCase());
    const balance = user ? user.balance : 0;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${w.username ? w.username.toUpperCase() : ''}</strong></td>
      <td>${balance} 🪙</td>
      <td style="color: var(--cs-orange); font-weight: bold;">${w.amount} 🪙</td>
      <td><span class="rank-badge-inline" style="background: rgba(255, 90, 0, 0.1); color: var(--cs-orange); border-color: rgba(255, 90, 0, 0.2);">${w.method}</span></td>
      <td><code style="background: rgba(255,255,255,0.05); padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 11px;">${w.details || ''}</code></td>
      <td>${w.date || ''}</td>
      <td>
        <button class="btn btn-success" style="padding:4px 8px; font-size:10px; background: var(--success); border-color: var(--success);" onclick="approveWithdrawAdmin('${w.id}')">Виплачено</button>
        <button class="btn btn-danger" style="padding:4px 8px; font-size:10px; margin-left:5px;" onclick="rejectWithdrawAdmin('${w.id}')">Відхилити</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Approve withdrawal request
window.approveWithdrawAdmin = async function(withdrawId) {
  const db = getDB();
  const withdraw = (db.pendingWithdrawals || []).find(w => w.id === withdrawId);
  if (!withdraw) {
    showToast("Запит на виведення не знайдено!", "error");
    return;
  }

  if (withdraw.status !== "pending") {
    showToast("Цей запит вже було оброблено!", "error");
    return;
  }

  const user = db.users.find(u => u.username.toLowerCase() === withdraw.username.toLowerCase());
  if (!user) {
    showToast(`Гравця ${withdraw.username} не знайдено!`, "error");
    return;
  }

  // Update status in cloud/db pending collection
  withdraw.status = "approved";

  // Update status in user's withdrawHistory
  if (user.withdrawHistory) {
    const userW = user.withdrawHistory.find(w => w.id === withdrawId);
    if (userW) userW.status = "approved";
  }

  showToast("Підтвердження виплати...", "success");
  await saveDB(db);

  // Push dedicated user key instantly!
  fetch(CLOUD_BUCKET + 'user_' + user.username.toLowerCase(), {
    method: 'POST',
    body: JSON.stringify(user)
  }).catch(e => console.error("Failed to push approved user key:", e));

  showToast(`Запит схвалено! Статус виплати для ${withdraw.username.toUpperCase()} оновлено на 'Виплачено'.`, "success");
  renderAdminPanel();
};

// Reject withdrawal request (Refund coins)
window.rejectWithdrawAdmin = async function(withdrawId) {
  const db = getDB();
  const withdraw = (db.pendingWithdrawals || []).find(w => w.id === withdrawId);
  if (!withdraw) {
    showToast("Запит на виведення не знайдено!", "error");
    return;
  }

  if (withdraw.status !== "pending") {
    showToast("Цей запит вже було оброблено!", "error");
    return;
  }

  const user = db.users.find(u => u.username.toLowerCase() === withdraw.username.toLowerCase());
  if (!user) {
    showToast(`Гравця ${withdraw.username} не знайдено!`, "error");
    return;
  }

  // Refund the deducted coins to user balance
  user.balance = (user.balance || 0) + withdraw.amount;

  // Update status in cloud/db pending collection
  withdraw.status = "rejected";

  // Update status in user's withdrawHistory
  if (user.withdrawHistory) {
    const userW = user.withdrawHistory.find(w => w.id === withdrawId);
    if (userW) userW.status = "rejected";
  }

  showToast("Відхилення запиту та повернення монет...", "success");
  await saveDB(db);

  // Push dedicated user key instantly!
  fetch(CLOUD_BUCKET + 'user_' + user.username.toLowerCase(), {
    method: 'POST',
    body: JSON.stringify(user)
  }).catch(e => console.error("Failed to push rejected user key:", e));

  showToast(`Запит відхилено! Гравцю ${withdraw.username.toUpperCase()} повернуто ${withdraw.amount} 🪙`, "success");
  renderAdminPanel();
};

// Check for unviewed pending deposits and update the orange notification dot
function updateAdminNotificationBadges() {
  const db = getDB();
  if (!db) return;

  const verifyBtn = document.querySelector('button[onclick*="deposits-verify"]');
  if (!verifyBtn) return;

  const isCurrentlyOnVerifyTab = verifyBtn.classList.contains('active');
  const pending = (db.pendingDeposits || []).filter(d => d.status === "pending");

  if (pending.length === 0) {
    const existingDot = verifyBtn.querySelector('.notification-badge-dot');
    if (existingDot) existingDot.remove();
    return;
  }

  if (isCurrentlyOnVerifyTab) {
    // If operator is on the tab, mark all pending deposits as read immediately
    let changed = false;
    db.pendingDeposits.forEach(d => {
      if (d.status === "pending" && !d.isRead) {
        d.isRead = true;
        changed = true;
      }
    });
    if (changed) {
      saveDB(db);
    }
    const existingDot = verifyBtn.querySelector('.notification-badge-dot');
    if (existingDot) existingDot.remove();
  } else {
    // If not on the tab, check if there is any pending deposit that is unread
    const hasUnreadPending = pending.some(d => !d.isRead);

    if (hasUnreadPending) {
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

// ==========================================
// TOURNAMENT BRACKETS & ROSTERS CONTROLLER
// ==========================================

const DEFAULT_UKRAINIAN_RULES = `1. Регламент проведення:
- Усі матчі проходять у форматі Single Elimination (або Double Elimination) на вказаній карті.
- Формат гри відповідає типу турніру (2х2, 3х3, 4х4, 5x5).
- Сервери гри визначаються суддями VOLK 1303.

2. Правила поведінки та чесної гри (Fair Play):
- Використання будь-якого стороннього софту (чітів, скриптів, макросів) або багів карти заборонено. Порушення карається миттєвою дискваліфікацією.
- Обов'язкова повага до суперників. Образи у чаті гри ведуть до попередження або дискваліфікації.

3. Процедура старту та результати:
- Команди зобов'язані з'явитися в лобі матчу протягом 15 хвилин після початку гри.
- Результат матчу вноситься та перевіряється адміністратором турніру.
- Призові монети автоматично нараховуються капітанам команд-переможців згідно з відсотковим розподілом.`;

// Open modal to create a new tournament
window.openAddTournamentModal = function() {
  // Clear inputs
  document.getElementById('tournament-id-field').value = "";
  document.getElementById('tour-name').value = "";
  document.getElementById('tour-format').value = "5x5";
  document.getElementById('tour-map').value = "de_mirage";
  document.getElementById('tour-status').value = "upcoming";
  document.getElementById('tour-max-teams').value = "4";
  document.getElementById('tour-system').value = "single";
  document.getElementById('tour-prize-pool').value = "1000";
  document.getElementById('tour-prize-places').value = "3";
  document.getElementById('tour-rules').value = DEFAULT_UKRAINIAN_RULES;
  
  // Set calendar min date on the fly to prevent choosing past dates
  const dtInput = document.getElementById('tour-datetime');
  if (dtInput) {
    const now = new Date();
    // Offset local timezone
    const tzOffset = now.getTimezoneOffset() * 60000;
    const localISOTime = (new Date(now - tzOffset)).toISOString().slice(0, 16);
    dtInput.value = localISOTime;
  }

  // Adjust options
  adjustConductingSystems("4");
  adjustPrizePercentsInputs("3");

  document.getElementById('tournament-modal-title').innerText = "🏆 Створити новий турнір";
  document.getElementById('tournament-form-modal').classList.add('active');
};

// Open modal prefilled to edit a tournament
window.openEditTournamentModal = function(tourId) {
  const db = getDB();
  const tour = (db.tournaments || []).find(t => t.id === tourId);
  if (!tour) return;

  document.getElementById('tournament-id-field').value = tour.id;
  document.getElementById('tour-name').value = tour.name;
  document.getElementById('tour-format').value = tour.format;
  document.getElementById('tour-map').value = tour.map;
  document.getElementById('tour-status').value = tour.status;
  document.getElementById('tour-max-teams').value = tour.maxTeams;
  document.getElementById('tour-system').value = tour.system;
  document.getElementById('tour-prize-pool').value = tour.prizePool;
  document.getElementById('tour-prize-places').value = tour.prizePlaces || "1";
  document.getElementById('tour-rules').value = tour.rules || DEFAULT_UKRAINIAN_RULES;
  
  const dtInput = document.getElementById('tour-datetime');
  if (dtInput) {
    dtInput.value = tour.datetime || "";
  }

  // Adjust displays
  adjustConductingSystems(tour.maxTeams);
  adjustPrizePercentsInputs(tour.prizePlaces || "1");

  // Fill in percentages
  if (tour.percents) {
    if (document.getElementById('pct-1')) document.getElementById('pct-1').value = tour.percents[1] || "";
    if (document.getElementById('pct-2')) document.getElementById('pct-2').value = tour.percents[2] || "";
    if (document.getElementById('pct-3')) document.getElementById('pct-3').value = tour.percents[3] || "";
  }

  document.getElementById('tournament-modal-title').innerText = "📝 Редагувати турнір";
  document.getElementById('tournament-form-modal').classList.add('active');
};

// Handle prize place selector change
function adjustPrizePercentsInputs(placesVal) {
  const container = document.getElementById('tour-prize-percents-container');
  const grp1 = document.getElementById('pct-grp-1');
  const grp2 = document.getElementById('pct-grp-2');
  const grp3 = document.getElementById('pct-grp-3');
  
  if (!container) return;
  container.style.display = "flex";

  if (placesVal === "1") {
    grp1.style.display = "block";
    grp2.style.display = "none";
    grp3.style.display = "none";
    document.getElementById('pct-1').value = "100";
  } else if (placesVal === "2") {
    grp1.style.display = "block";
    grp2.style.display = "block";
    grp3.style.display = "none";
    document.getElementById('pct-1').value = "60";
    document.getElementById('pct-2').value = "40";
  } else {
    grp1.style.display = "block";
    grp2.style.display = "block";
    grp3.style.display = "block";
    document.getElementById('pct-1').value = "50";
    document.getElementById('pct-2').value = "30";
    document.getElementById('pct-3').value = "20";
  }
}
window.adjustPrizePercentsInputs = adjustPrizePercentsInputs;

// Handle conducting system select options depending on team count
function adjustConductingSystems(maxTeamsVal) {
  const opt = document.getElementById('double-elim-opt');
  const sysSelect = document.getElementById('tour-system');
  if (!opt || !sysSelect) return;

  if (maxTeamsVal && maxTeamsVal.toString() === "4") {
    opt.disabled = false;
    opt.style.display = "block";
  } else {
    opt.disabled = true;
    opt.style.display = "none";
    sysSelect.value = "single";
  }
}
window.adjustConductingSystems = adjustConductingSystems;

// Generate standard rounds/matches layouts for bracket tree structure
function generateBracketStructure(maxTeams, system) {
  const rounds = [];
  
  if (system === "double" && maxTeams === 4) {
    // 6-match Double Elimination Layout
    rounds.push({
      name: "Верхня сітка - Півфінали",
      matches: [
        { id: "m_1", team1: "Очікується", team2: "Очікується", score1: 0, score2: 0, status: "upcoming", time: "", winner: null },
        { id: "m_2", team1: "Очікується", team2: "Очікується", score1: 0, score2: 0, status: "upcoming", time: "", winner: null }
      ]
    });
    rounds.push({
      name: "Верхня сітка - Фінал / Нижня сітка - Раунд 1",
      matches: [
        { id: "m_3", team1: "Очікується", team2: "Очікується", score1: 0, score2: 0, status: "upcoming", time: "", winner: null }, // Upper Final
        { id: "m_4", team1: "Очікується", team2: "Очікується", score1: 0, score2: 0, status: "upcoming", time: "", winner: null }  // Lower R1
      ]
    });
    rounds.push({
      name: "Нижня сітка - Фінал",
      matches: [
        { id: "m_5", team1: "Очікується", team2: "Очікується", score1: 0, score2: 0, status: "upcoming", time: "", winner: null }
      ]
    });
    rounds.push({
      name: "Суперфінал",
      matches: [
        { id: "m_6", team1: "Очікується", team2: "Очікується", score1: 0, score2: 0, status: "upcoming", time: "", winner: null }
      ]
    });
    return { rounds };
  }

  // Single Elimination Algorithm
  const numTeams = parseInt(maxTeams, 10);
  let roundSize = numTeams / 2;
  let roundIndex = 1;
  let matchIdCounter = 1;

  while (roundSize >= 1) {
    let roundName = "";
    if (roundSize === 1) roundName = "Фінал";
    else if (roundSize === 2) roundName = "Півфінали";
    else if (roundSize === 4) roundName = "Чвертьфінали";
    else roundName = `1/${roundSize * 2} Фіналу`;

    const matches = [];
    for (let i = 0; i < roundSize; i++) {
      matches.push({
        id: `m_${matchIdCounter++}`,
        team1: "Очікується",
        team2: "Очікується",
        score1: 0,
        score2: 0,
        status: "upcoming",
        time: "",
        winner: null
      });
    }

    rounds.push({ name: roundName, matches });
    roundSize = roundSize / 2;
  }

  return { rounds };
}

// Re-fill team slots in brackets based on current registration roster
function rebuildBracketTeamSlots(tour) {
  if (!tour || !tour.brackets || !tour.brackets.rounds || tour.brackets.rounds.length === 0) return;
  const db = getDB();
  const registeredTeams = tour.registeredTeams || [];
  
  // Get first round matches
  const round1 = tour.brackets.rounds[0];
  if (!round1 || !round1.matches) return;

  // Clear only team names in all matches — PRESERVE winner, scores, status, time
  // If manual overrides exist, initialize them instead of unconditionally resetting to "Очікується"
  tour.brackets.rounds.forEach(round => {
    round.matches.forEach(m => {
      m.team1 = m.manualTeam1 || "Очікується";
      m.team2 = m.manualTeam2 || "Очікується";
      // winner, score1, score2, status, time are intentionally NOT reset here
    });
  });

  // Re-fill first round match slots
  for (let i = 0; i < round1.matches.length; i++) {
    const match = round1.matches[i];
    const team1Id = registeredTeams[i * 2];
    const team2Id = registeredTeams[i * 2 + 1];

    if (team1Id) {
      const team = db.teams.find(t => t.id === team1Id);
      match.team1 = team ? team.name : "Очікується";
    }
    if (team2Id) {
      const team = db.teams.find(t => t.id === team2Id);
      match.team2 = team ? team.name : "Очікується";
    }
  }

  // Restore propagated winners if match scores already exist
  for (let r = 0; r < tour.brackets.rounds.length - 1; r++) {
    const currentRound = tour.brackets.rounds[r];
    const nextRound = tour.brackets.rounds[r + 1];

    if (tour.system === "double" && tour.maxTeams === 4) {
      // Propagation for Double Elimination
      const m1 = currentRound.matches[0]; // m_1
      const m2 = currentRound.matches[1]; // m_2
      
      if (r === 0) {
        // Upper Semis propagate to Upper Final (m_3) and Lower R1 (m_4)
        const nextM3 = nextRound.matches[0];
        const nextM4 = nextRound.matches[1];

        if (m1 && m1.winner) {
          nextM3.team1 = m1.winner;
          nextM4.team1 = (m1.winner === m1.team1) ? m1.team2 : m1.team1;
        }
        if (m2 && m2.winner) {
          nextM3.team2 = m2.winner;
          nextM4.team2 = (m2.winner === m2.team1) ? m2.team2 : m2.team1;
        }
      } else if (r === 1) {
        // Round 1 matches (m_3 & m_4) propagate to Lower Final (m_5)
        const m3 = currentRound.matches[0]; // m_3
        const m4 = currentRound.matches[1]; // m_4
        const nextM5 = nextRound.matches[0]; // m_5

        if (m3 && m3.winner) {
          nextM5.team1 = (m3.winner === m3.team1) ? m3.team2 : m3.team1; // loser of m3
        }
        if (m4 && m4.winner) {
          nextM5.team2 = m4.winner; // winner of m4
        }
      } else if (r === 2) {
        // Lower Final (m_5) propagates to Superfinal (m_6)
        const m5 = currentRound.matches[0]; // m_5
        const nextM6 = nextRound.matches[0]; // m_6
        
        // Find winner of m3 (which went straight to Superfinal team1)
        const round1Matches = tour.brackets.rounds[1];
        const m3 = round1Matches.matches[0];
        if (m3 && m3.winner) {
          nextM6.team1 = m3.winner;
        }
        if (m5 && m5.winner) {
          nextM6.team2 = m5.winner;
        }
      }
    } else {
      // Propagation for Single Elimination
      for (let m = 0; m < currentRound.matches.length; m++) {
        const match = currentRound.matches[m];
        if (match.winner && match.winner !== "Очікується") {
          const nextMatchIdx = Math.floor(m / 2);
          const nextMatchSlot = (m % 2 === 0) ? 'team1' : 'team2';
          const nextMatch = nextRound.matches[nextMatchIdx];
          if (nextMatch) {
            nextMatch[nextMatchSlot] = match.winner;
          }
        }
      }
    }
  }

  // Synchronize winner team name with winnerSlot in all matches to prevent reset and support auto-healing propagation
  tour.brackets.rounds.forEach(round => {
    round.matches.forEach(m => {
      if (m.status === "finished") {
        if (m.winnerSlot === "team1") {
          m.winner = m.team1;
        } else if (m.winnerSlot === "team2") {
          m.winner = m.team2;
        }
      } else {
        m.winner = null;
        m.winnerSlot = null;
      }
    });
  });
}

// Save or Update tournament in database
window.saveTournamentAdmin = function() {
  const db = getDB();
  const id = document.getElementById('tournament-id-field').value;
  const name = document.getElementById('tour-name').value.trim();
  const format = document.getElementById('tour-format').value;
  const map = document.getElementById('tour-map').value;
  const status = document.getElementById('tour-status').value;
  const maxTeams = parseInt(document.getElementById('tour-max-teams').value, 10);
  const system = document.getElementById('tour-system').value;
  const datetime = document.getElementById('tour-datetime').value;
  const prizePool = parseFloat(document.getElementById('tour-prize-pool').value);
  const prizePlaces = parseInt(document.getElementById('tour-prize-places').value, 10);
  const rules = document.getElementById('tour-rules').value.trim();

  // Validate percentages
  const p1 = parseFloat(document.getElementById('pct-1').value) || 0;
  const p2 = parseFloat(document.getElementById('pct-2').value) || 0;
  const p3 = parseFloat(document.getElementById('pct-3').value) || 0;

  let totalPercent = 0;
  const percents = {};
  if (prizePlaces === 1) {
    totalPercent = p1;
    percents[1] = p1;
  } else if (prizePlaces === 2) {
    totalPercent = p1 + p2;
    percents[1] = p1;
    percents[2] = p2;
  } else {
    totalPercent = p1 + p2 + p3;
    percents[1] = p1;
    percents[2] = p2;
    percents[3] = p3;
  }

  if (totalPercent !== 100) {
    showToast(`Помилка: Сума відсотків має дорівнювати 100% (зараз: ${totalPercent}%)`, "error");
    return;
  }

  if (id) {
    // EDIT MODE
    const tour = db.tournaments.find(t => t.id === id);
    if (!tour) return;

    if (status === 'completed') {
      const lastRound = tour.brackets && tour.brackets.rounds ? tour.brackets.rounds[tour.brackets.rounds.length - 1] : null;
      const finalMatch = lastRound && lastRound.matches ? lastRound.matches[0] : null;
      if (!finalMatch || finalMatch.status !== 'finished' || !finalMatch.winner) {
        showToast('⚠️ Неможливо завершити турнір: фінальний матч ще не зіграно або немає переможця!', 'error');
        return;
      }
    }

    tour.name = name;
    tour.format = format;
    tour.map = map;
    tour.status = status;
    if (status === 'completed' && !tour.completedAt) {
      tour.completedAt = new Date().toISOString();
    }
    
    // If maximum teams changed, initialize new brackets
    if (parseInt(tour.maxTeams, 10) !== parseInt(maxTeams, 10) || tour.system !== system) {
      tour.maxTeams = maxTeams;
      tour.system = system;
      tour.brackets = generateBracketStructure(maxTeams, system);
      tour.registeredTeams = [];
    }
    
    tour.datetime = datetime;
    tour.prizePool = prizePool;
    tour.prizePlaces = prizePlaces;
    tour.percents = percents;
    tour.rules = rules;
    tour.lastModified = Date.now();

    rebuildBracketTeamSlots(tour);
    showToast("Турнір успішно оновлено!", "success");
  } else {
    // CREATE MODE
    const newTour = {
      id: "tour_" + Date.now(),
      name: name,
      format: format,
      map: map,
      status: status,
      maxTeams: maxTeams,
      system: system,
      datetime: datetime,
      prizePool: prizePool,
      prizePlaces: prizePlaces,
      percents: percents,
      rules: rules,
      registeredTeams: [],
      brackets: generateBracketStructure(maxTeams, system),
      lastModified: Date.now()
    };
    
    db.tournaments.push(newTour);
    showToast("Новий турнір успішно створено!", "success");
  }

  saveDB(db);
  closeModal('tournament-form-modal');
  renderAdminPanel();
};

// Delete tournament
window.deleteTournamentAdmin = async function(tourId) {
  if (!confirm("Ви впевнені, що хочете видалити цей турнір та очистити всі його сітки та склади?")) return;
  const db = getDB();
  db.tournaments = (db.tournaments || []).filter(t => t.id !== tourId);
  // Track deleted IDs so syncWithCloud never restores them from the cloud
  db.deletedTournamentIds = db.deletedTournamentIds || [];
  if (!db.deletedTournamentIds.includes(tourId)) {
    db.deletedTournamentIds.push(tourId);
  }
  localStorage.setItem(DB_KEY, JSON.stringify(db));
  // Wait for push to complete before allowing next sync
  await pushToCloud(db);
  showToast("Турнір видалено!", "success");
  renderAdminPanel();
};

// Render administrative tournaments table list
function renderAdminTournamentsList(allTournaments) {
  const tbody = document.getElementById('admin-tournaments-tbody');
  if (!tbody) return;
  tbody.innerHTML = "";

  // Filter completed tournaments older than 10 minutes
  const tournaments = (allTournaments || []).filter(t => {
    if (!window.isValidTournament(t)) return false;
    if (t.status === 'completed') {
      if (!t.completedAt) return false;
      const diffMs = Date.now() - new Date(t.completedAt).getTime();
      return diffMs < 10 * 60 * 1000; // 10 minutes
    }
    return true;
  });

  if (tournaments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-secondary); padding: 25px;">Створіть свій перший турнір за допомогою кнопки вище!</td></tr>`;
    return;
  }

  tournaments.forEach(tour => {
    const tr = document.createElement('tr');
    
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

    tr.innerHTML = `
      <td><strong>${tour.name}</strong></td>
      <td><span class="rank-badge-inline" style="background:rgba(255,255,255,0.03); color:white; border-color:var(--border-color);">${tour.format}</span></td>
      <td><span style="font-family:monospace; opacity:0.9;">${tour.map}</span></td>
      <td>
        <div style="display:flex; flex-direction:column; gap:4px;">
          <strong>${regCount} / ${tour.maxTeams}</strong>
          <a href="#" onclick="openRosterModal('${tour.id}'); return false;" style="color:var(--cs-orange); font-size:10px; text-decoration:none; font-weight:800;">🛡️ Реєструвати склади</a>
        </div>
      </td>
      <td><strong style="color:white;">🪙 ${tour.prizePool}</strong></td>
      <td>
        <select onchange="quickChangeTourStatus('${tour.id}', this.value)" style="background:var(--bg-input); color:white; border:1px solid var(--border-color); border-radius:6px; padding:5px 8px; font-size:11px; font-weight:700; cursor:pointer;">
          <option value="upcoming" ${tour.status === 'upcoming' ? 'selected' : ''}>Майбутній</option>
          <option value="active" ${tour.status === 'active' ? 'selected' : ''}>Активний</option>
          <option value="completed" ${tour.status === 'completed' ? 'selected' : ''}>Завершений</option>
        </select>
      </td>
      <td>
        <div style="display:flex; gap:6px; align-items:center;">
          ${tour.status === 'upcoming' ? `<button class="btn" style="padding:4px 8px; font-size:10px; background:var(--cs-orange); border-color:var(--cs-orange); color:white; font-weight:800;" onclick="quickChangeTourStatus('${tour.id}', 'active')">🚀 ЗАПУСТИТИ</button>` : ''}
          ${tour.status === 'active' ? `
            <button class="btn btn-secondary" style="padding:4px 8px; font-size:10px; font-weight:800;" onclick="quickChangeTourStatus('${tour.id}', 'upcoming')">⏸️ ПАУЗА</button>
            <button class="btn btn-danger" style="padding:4px 8px; font-size:10px; font-weight:800;" onclick="quickChangeTourStatus('${tour.id}', 'completed')">🏁 ЗАВЕРШИТИ</button>
          ` : ''}
          ${tour.status === 'completed' ? `<span style="color:var(--text-secondary); font-size:10px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px;">🏁 Завершено</span>` : ''}
          <button class="btn" style="padding:4px 8px; font-size:10px;" onclick="openBracketEditorCard('${tour.id}')">🏆 Керувати сіткою</button>
          <button class="btn btn-secondary" style="padding:4px 8px; font-size:10px;" onclick="openEditTournamentModal('${tour.id}')">📝</button>
          <button class="btn btn-danger" style="padding:4px 8px; font-size:10px;" onclick="deleteTournamentAdmin('${tour.id}')">❌</button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

window.quickChangeTourStatus = function(tourId, newStatus) {
  const db = getDB();
  const tour = (db.tournaments || []).find(t => t.id === tourId);
  if (!tour) return;

  if (newStatus === 'completed') {
    const lastRound = tour.brackets && tour.brackets.rounds ? tour.brackets.rounds[tour.brackets.rounds.length - 1] : null;
    const finalMatch = lastRound && lastRound.matches ? lastRound.matches[0] : null;
    if (!finalMatch || finalMatch.status !== 'finished' || !finalMatch.winner) {
      showToast('⚠️ Неможливо завершити турнір: фінальний матч ще не зіграно або немає переможця!', 'error');
      renderAdminPanel();
      return;
    }
  }

  tour.status = newStatus;
  if (newStatus === 'completed' && !tour.completedAt) {
    tour.completedAt = new Date().toISOString();
  }
  tour.lastModified = Date.now() + 1; // +1 to guarantee it's newer than cloud
  saveDB(db);

  // Immediately push tournaments to cloud
  fetch(CLOUD_BUCKET + 'tournaments', { method: 'POST', body: JSON.stringify(db.tournaments) })
    .then(() => {
      const label = newStatus === 'upcoming' ? 'Майбутній' : newStatus === 'active' ? 'Активний' : 'Завершений';
      showToast(`✅ Статус турніру змінено на: ${label}`, 'success');
      renderAdminPanel();
    })
    .catch(e => { console.error(e); showToast('Помилка оновлення хмари!', 'error'); });
};



// Global state for roster modal selection
let activeRosterTournamentId = null;

// Open roster manager modal with a slot-based layout
window.openRosterModal = function(tourId) {
  const db = getDB();
  const tour = db.tournaments.find(t => t.id === tourId);
  if (!tour) return;

  activeRosterTournamentId = tourId;
  
  const maxTeams = tour.maxTeams || 4;
  const registeredTeams = tour.registeredTeams || [];

  const slotsContainer = document.getElementById('roster-slots-container');
  if (!slotsContainer) return;
  slotsContainer.innerHTML = "";

  document.getElementById('roster-count-val').innerText = `${registeredTeams.length} / ${maxTeams}`;
  document.getElementById('roster-format-val').innerText = tour.format;

  // Render maxTeams slots!
  for (let i = 0; i < maxTeams; i++) {
    const slotCard = document.createElement('div');
    slotCard.className = "roster-slot-card";
    slotCard.style.background = "#13151f";
    slotCard.style.border = "1px solid rgba(255,255,255,0.05)";
    slotCard.style.borderRadius = "12px";
    slotCard.style.padding = "16px";
    slotCard.style.display = "flex";
    slotCard.style.flexDirection = "column";
    slotCard.style.gap = "12px";
    slotCard.style.boxShadow = "0 4px 15px rgba(0,0,0,0.2)";

    const teamId = registeredTeams[i];
    const team = teamId ? db.teams.find(t => t.id === teamId) : null;

    if (!team) {
      // EMPTY SLOT
      slotCard.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <strong style="color:var(--text-secondary); font-size:14px; font-weight: 700;">🛡️ Слот Команди ${i + 1} (Вільний)</strong>
          <span style="font-size: 10px; color: var(--text-secondary); text-transform: uppercase; font-weight:800; background: rgba(255,255,255,0.05); padding: 4px 8px; border-radius: 4px; letter-spacing: 0.5px;">Вільний</span>
        </div>
        <div style="display:flex; gap:10px; margin-top:8px;">
          <button class="btn" style="padding: 10px 16px; font-size:12px; font-weight:800; margin-bottom:0; flex:1;" onclick="showAddTeamSlotForm(${i})">➕ Створити команду</button>
          <button class="btn btn-secondary" style="padding: 10px 16px; font-size:12px; font-weight:800; margin-bottom:0; flex:1;" onclick="showSelectExistingTeamForm(${i})">🔌 Вибрати існуючу</button>
        </div>
        <div id="slot-form-container-${i}" style="display:none; margin-top:12px; padding-top:12px; border-top:1px solid rgba(255,255,255,0.05);"></div>
      `;
    } else {
      // FILLED SLOT
      const players = team.players || [];
      const playersListHtml = players.map(p => {
        const userObj = db.users.find(u => u.username.toLowerCase() === p.toLowerCase());
        let isOnline = false;
        if (userObj && userObj.loginHistory && userObj.loginHistory.length > 0) {
          const lastLogin = userObj.loginHistory[0];
          if (lastLogin && lastLogin.date) {
            const lastVisitTime = new Date(lastLogin.date);
            isOnline = lastVisitTime && (Date.now() - lastVisitTime.getTime() < 10 * 60 * 1000);
          }
        }
        const dotColor = isOnline ? '#26A17B' : '#718096';
        const dotGlow = isOnline ? 'box-shadow: 0 0 6px #26A17B;' : '';
        return `
          <span class="player-tag-badge" style="display:inline-flex; align-items:center; background:#1e293b; color:white; border:1px solid rgba(255,255,255,0.08); padding:5px 12px; border-radius:6px; font-size:12px; gap:8px; font-weight:bold; transition: all 0.2s; max-width: 100%; box-sizing: border-box; overflow: hidden;" onmouseover="this.style.background='rgba(255,90,0,0.1)'; this.style.borderColor='var(--cs-orange)';" onmouseout="this.style.background='#1e293b'; this.style.borderColor='rgba(255,255,255,0.08)';">
            <span style="text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 140px; display: inline-block;">@${p.toUpperCase()}</span>
            <span style="width:6px; height:6px; border-radius:50%; background:${dotColor}; ${dotGlow}" title="${isOnline ? 'Online' : 'Offline'}"></span>
            <button type="button" style="color:var(--wolf-red); cursor:pointer; font-weight:900; font-size:17px; padding:0 4px; display:inline-flex; align-items:center; justify-content:center; background:transparent; border:none; transition: transform 0.1s; flex-shrink: 0; line-height:1;" onmouseover="this.style.transform='scale(1.3)';" onmouseout="this.style.transform='scale(1)';" onclick="event.stopPropagation(); removePlayerFromSlotTeam('${team.id}', '${p}')" title="Видалити гравця">&times;</button>
          </span>
        `;
      }).join(" ");

      slotCard.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; gap: 8px;">
          <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; padding-right: 5px;">
            <strong style="color:white; font-size:15px; font-weight:800; display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="🛡️ Команда ${i + 1}: ${team.name} [${team.tag}]">🛡️ Команда ${i + 1}: ${team.name} [${team.tag}]</strong>
            <div style="font-size:11px; color:var(--text-secondary); margin-top:2px;">Формат: <span style="color:var(--cs-orange); font-weight:bold;">${team.format}</span></div>
          </div>
          <div style="display:flex; gap:8px; flex-shrink: 0;">
            <button class="btn btn-secondary" style="padding: 6px 12px; font-size:11px; margin-bottom:0; font-weight:bold;" onclick="showRenameTeamSlotForm(${i}, '${team.id}', '${team.name}')">📝 Назва</button>
            <button class="btn btn-danger" style="padding: 6px 12px; font-size:11px; margin-bottom:0; font-weight:bold;" onclick="unregisterTeamSlot(${i})">❌</button>
          </div>
        </div>
        <div id="slot-rename-container-${i}" style="display:none; margin-top:8px; padding-bottom:8px;"></div>
        
        <div style="background:#0c0d12; border-radius:8px; padding:12px; border:1px solid rgba(255,255,255,0.02); margin-top:8px; box-shadow: inset 0 2px 8px rgba(0,0,0,0.4);">
          <div style="font-size:11px; font-weight:800; color:var(--text-secondary); text-transform:uppercase; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center; letter-spacing: 0.5px; gap: 8px;">
            <span>👥 Учасники (${players.length}):</span>
            <div style="display:flex; gap:6px;">
              <a href="#" onclick="fillSlotTeamWithBots('${team.id}'); return false;" style="color:#26A17B; text-decoration:none; font-weight:800; font-size:11px; background:rgba(38,161,123,0.1); padding:4px 8px; border-radius:4px; border:1px solid rgba(38,161,123,0.2); transition: all 0.2s; flex-shrink: 0;" onmouseover="this.style.background='#26A17B'; this.style.color='white';" onmouseout="this.style.background='rgba(38,161,123,0.1)'; this.style.color='#26A17B';">🤖 Боти</a>
              <a href="#" onclick="showAddPlayerToSlotForm(${i}, '${team.id}'); return false;" style="color:var(--cs-orange); text-decoration:none; font-weight:800; font-size:11px; background:rgba(255,90,0,0.1); padding:4px 8px; border-radius:4px; border:1px solid rgba(255,90,0,0.2); transition: all 0.2s; flex-shrink: 0;" onmouseover="this.style.background='var(--cs-orange)'; this.style.color='white';" onmouseout="this.style.background='rgba(255,90,0,0.1)'; this.style.color='var(--cs-orange)';">➕ Додати</a>
            </div>
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:6px; min-height: 28px; align-items:center;">
            ${players.length === 0 ? '<span style="font-size:11px; color:var(--text-secondary); font-style:italic;">Немає гравців</span>' : playersListHtml}
          </div>
        </div>
        
        <div id="slot-add-player-container-${i}" style="display:none; margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.05);"></div>
      `;
    }

    slotsContainer.appendChild(slotCard);
  }

  document.getElementById('tournament-roster-modal').classList.add('active');
};

// Form helpers for slot manager
window.showAddTeamSlotForm = function(slotIndex) {
  const container = document.getElementById(`slot-form-container-${slotIndex}`);
  if (!container) return;
  container.style.display = "block";
  container.innerHTML = `
    <div style="display:flex; gap:8px; align-items:center;">
      <input type="text" id="slot-team-name-input-${slotIndex}" class="form-input" placeholder="Назва команди..." style="margin-bottom:0; font-size:13px; padding:10px 14px; flex:1;" onkeyup="if(event.key === 'Enter') createNewTeamForSlot(${slotIndex})">
      <button class="btn" style="padding:10px 18px; font-size:12px; margin-bottom:0; font-weight:bold;" onclick="createNewTeamForSlot(${slotIndex})">Зберегти</button>
      <button class="btn btn-secondary" style="padding:10px 14px; font-size:12px; margin-bottom:0; font-weight:bold;" onclick="hideSlotForm(${slotIndex})">Скасувати</button>
    </div>
  `;
};

window.showSelectExistingTeamForm = function(slotIndex) {
  const db = getDB();
  const tour = db.tournaments.find(t => t.id === activeRosterTournamentId);
  if (!tour) return;

  const container = document.getElementById(`slot-form-container-${slotIndex}`);
  if (!container) return;
  container.style.display = "block";

  const format = tour.format;
  const registered = tour.registeredTeams || [];
  const matchingTeams = db.teams.filter(t => formatsMatch(t.format, format) && !registered.includes(t.id));

  if (matchingTeams.length === 0) {
    container.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; padding:6px 0;">
        <span style="color:var(--text-secondary);">Немає вільних команд формату ${format}</span>
        <button class="btn btn-secondary" style="padding:6px 12px; font-size:11px; margin-bottom:0; font-weight:bold;" onclick="hideSlotForm(${slotIndex})">Закрити</button>
      </div>
    `;
    return;
  }

  const optionsHtml = matchingTeams.map(t => `<option value="${t.id}">${t.name} [${t.tag}]</option>`).join("");

  container.innerHTML = `
    <div style="display:flex; gap:8px; align-items:center;">
      <select id="slot-team-select-${slotIndex}" class="form-input" style="margin-bottom:0; font-size:13px; padding:10px 14px; flex:1; background:#0c0d12;">
        ${optionsHtml}
      </select>
      <button class="btn" style="padding:10px 18px; font-size:12px; margin-bottom:0; font-weight:bold;" onclick="selectExistingTeamForSlot(${slotIndex})">🔌 Додати</button>
      <button class="btn btn-secondary" style="padding:10px 14px; font-size:12px; margin-bottom:0; font-weight:bold;" onclick="hideSlotForm(${slotIndex})">Скасувати</button>
    </div>
  `;
};

window.hideSlotForm = function(slotIndex) {
  const container = document.getElementById(`slot-form-container-${slotIndex}`);
  if (container) container.style.display = "none";
};

window.createNewTeamForSlot = function(slotIndex) {
  const nameVal = document.getElementById(`slot-team-name-input-${slotIndex}`).value.trim();
  if (!nameVal) {
    showToast("Введіть назву команди!", "error");
    return;
  }

  const db = getDB();
  const tour = db.tournaments.find(t => t.id === activeRosterTournamentId);
  if (!tour) {
    showToast("Помилка: Активний турнір не знайдено! Будь ласка, відкрийте вікно реєстрації знову.", "error");
    return;
  }

  if (db.teams.some(t => t.name.toLowerCase() === nameVal.toLowerCase())) {
    showToast("Команда з такою назвою вже існує!", "error");
    return;
  }

  const teamId = `team_${Date.now()}_${slotIndex}`;
  const newTeam = {
    id: teamId,
    name: nameVal,
    tag: nameVal.substring(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, 'T'),
    format: tour.format,
    players: [],
    owner: "ADMIN"
  };

  db.teams.push(newTeam);
  if (!tour.registeredTeams) tour.registeredTeams = [];
  tour.registeredTeams[slotIndex] = teamId;

  rebuildBracketTeamSlots(tour);
  saveDB(db);

  showToast(`Команду ${nameVal} створено для Слоту ${slotIndex + 1}!`, "success");
  openRosterModal(activeRosterTournamentId);
  renderAdminPanel();
};

window.selectExistingTeamForSlot = function(slotIndex) {
  const selectEl = document.getElementById(`slot-team-select-${slotIndex}`);
  if (!selectEl) return;
  const teamId = selectEl.value;

  const db = getDB();
  const tour = db.tournaments.find(t => t.id === activeRosterTournamentId);
  if (!tour) return;

  if (!tour.registeredTeams) tour.registeredTeams = [];

  // Exclusivity & player count limitations checks
  if (teamId) {
    const selectedTeam = db.teams.find(t => t.id === teamId);
    if (selectedTeam) {
      // 1. Check player count limit based on format
      const maxAllowed = getMaxPlayersForFormat(tour.format);
      const playerLen = (selectedTeam.players || []).length;
      if (playerLen > maxAllowed) {
        showToast(`Помилка: Команда "${selectedTeam.name}" має ${playerLen} гравців, що перевищує ліміт (${maxAllowed}) для формату ${tour.format}!`, "error");
        return;
      }

      // 2. Exclusivity validation: one player cannot be in two teams in the same tournament
      if (selectedTeam.players && selectedTeam.players.length > 0) {
        const selectedPlayersLower = selectedTeam.players.map(p => p.toLowerCase());
        for (let i = 0; i < tour.registeredTeams.length; i++) {
          if (i === slotIndex) continue; // Skip the slot being overwritten
          const otherTeamId = tour.registeredTeams[i];
          if (!otherTeamId || otherTeamId === teamId) continue;
          const otherTeam = db.teams.find(t => t.id === otherTeamId);
          if (otherTeam && otherTeam.players) {
            for (const p of otherTeam.players) {
              if (selectedPlayersLower.includes(p.toLowerCase())) {
                showToast(`Помилка: Гравець @${p.toUpperCase()} вже бере участь у цьому турнірі в складі команди "${otherTeam.name}"!`, "error");
                return;
              }
            }
          }
        }
      }
    }
  }

  tour.registeredTeams[slotIndex] = teamId;
  tour.lastModified = Date.now();

  rebuildBracketTeamSlots(tour);
  saveDB(db);

  showToast("Команду успішно додано до слоту!", "success");
  openRosterModal(activeRosterTournamentId);
  renderAdminPanel();
};

window.showRenameTeamSlotForm = function(slotIndex, teamId, oldName) {
  const container = document.getElementById(`slot-rename-container-${slotIndex}`);
  if (!container) return;
  container.style.display = "block";
  container.innerHTML = `
    <div style="display:flex; gap:8px; align-items:center; margin-top:8px; padding-top:8px; border-top:1px solid rgba(255,255,255,0.05);">
      <input type="text" id="slot-rename-input-${slotIndex}" class="form-input" value="${oldName}" style="margin-bottom:0; font-size:13px; padding:10px 14px; flex:1;" onkeyup="if(event.key === 'Enter') renameTeamSlot(${slotIndex}, '${teamId}')">
      <button class="btn" style="padding:10px 18px; font-size:12px; margin-bottom:0; font-weight:bold;" onclick="renameTeamSlot(${slotIndex}, '${teamId}')">Оновити</button>
      <button class="btn btn-secondary" style="padding:10px 14px; font-size:12px; margin-bottom:0; font-weight:bold;" onclick="hideRenameForm(${slotIndex})">Скасувати</button>
    </div>
  `;
};

window.hideRenameForm = function(slotIndex) {
  const container = document.getElementById(`slot-rename-container-${slotIndex}`);
  if (container) container.style.display = "none";
};

window.renameTeamSlot = function(slotIndex, teamId) {
  const nameVal = document.getElementById(`slot-rename-input-${slotIndex}`).value.trim();
  if (!nameVal) {
    showToast("Введіть назву команди!", "error");
    return;
  }

  const db = getDB();
  const team = db.teams.find(t => t.id === teamId);
  if (!team) return;

  if (db.teams.some(t => t.id !== teamId && t.name.toLowerCase() === nameVal.toLowerCase())) {
    showToast("Команда з такою назвою вже існує!", "error");
    return;
  }

  team.name = nameVal;
  team.tag = nameVal.substring(0, 4).toUpperCase().replace(/[^A-Z0-9]/g, 'T');

  const tour = db.tournaments.find(t => t.id === activeRosterTournamentId);
  if (tour) {
    tour.lastModified = Date.now();
    rebuildBracketTeamSlots(tour);
  }

  saveDB(db);

  showToast(`Назву команди змінено на ${nameVal}!`, "success");
  openRosterModal(activeRosterTournamentId);
  renderAdminPanel();
};

window.unregisterTeamSlot = function(slotIndex) {
  if (!confirm("Ви впевнені, що хочете звільнити цей слот? Команда буде вилучена з турніру.")) return;

  const db = getDB();
  const tour = db.tournaments.find(t => t.id === activeRosterTournamentId);
  if (!tour) return;

  if (tour.registeredTeams) {
    tour.registeredTeams.splice(slotIndex, 1);
    tour.lastModified = Date.now();
    rebuildBracketTeamSlots(tour);
    saveDB(db);
  }

  showToast("Слот успішно звільнено!", "success");
  openRosterModal(activeRosterTournamentId);
  renderAdminPanel();
};

window.showAddPlayerToSlotForm = function(slotIndex, teamId) {
  const container = document.getElementById(`slot-add-player-container-${slotIndex}`);
  if (!container) return;
  container.style.display = "block";
  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:8px;">
      <div style="display:flex; gap:8px;">
        <input type="text" id="slot-player-search-input-${slotIndex}" class="form-input" placeholder="🔍 Введіть юзернейм гравця..." style="margin-bottom:0; font-size:13px; padding:10px 14px; flex:1;" oninput="searchUsersForTeamSlot(${slotIndex}, '${teamId}')">
        <button class="btn btn-secondary" style="padding:10px 16px; font-size:12px; margin-bottom:0; font-weight:bold;" onclick="hideAddPlayerForm(${slotIndex})">Закрити</button>
      </div>
      <div id="slot-player-search-results-${slotIndex}" style="display:flex; flex-direction:column; gap:6px; max-height:160px; overflow-y:auto; background:#0c0d12; border-radius:8px; padding:8px; border:1px solid rgba(255,255,255,0.05); margin-top:4px;">
        <span style="font-size:12px; color:var(--text-secondary); padding:4px;">Почніть вводити юзернейм для пошуку...</span>
      </div>
    </div>
  `;
};

window.hideAddPlayerForm = function(slotIndex) {
  const container = document.getElementById(`slot-add-player-container-${slotIndex}`);
  if (container) container.style.display = "none";
};

window.searchUsersForTeamSlot = function(slotIndex, teamId) {
  const query = document.getElementById(`slot-player-search-input-${slotIndex}`).value.trim().toLowerCase();
  const resultsContainer = document.getElementById(`slot-player-search-results-${slotIndex}`);
  if (!resultsContainer) return;

  if (!query) {
    resultsContainer.innerHTML = `<span style="font-size:12px; color:var(--text-secondary); padding:4px;">Почніть вводити юзернейм для пошуку...</span>`;
    return;
  }

  const db = getDB();
  const team = db.teams.find(t => t.id === teamId);
  if (!team) return;

  const teamPlayers = team.players || [];

  const matchingUsers = db.users.filter(u => 
    u.username.toLowerCase() !== 'admin' && 
    u.username.toLowerCase().includes(query) && 
    !teamPlayers.map(p => p.toLowerCase()).includes(u.username.toLowerCase())
  );

  if (matchingUsers.length === 0) {
    resultsContainer.innerHTML = `<span style="font-size:12px; color:var(--text-secondary); padding:4px;">Гравців не знайдено</span>`;
    return;
  }

  resultsContainer.innerHTML = matchingUsers.map(user => `
    <div onclick="addPlayerToSlotTeam('${teamId}', '${user.username}')" style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:#181a26; border-radius:6px; border:1px solid rgba(255,255,255,0.05); cursor:pointer; transition: all 0.2s ease; margin-bottom:4px; gap:8px;" onmouseover="this.style.background='var(--cs-orange)'; this.style.borderColor='var(--cs-orange)';" onmouseout="this.style.background='#181a26'; this.style.borderColor='rgba(255,255,255,0.05)'">
      <span style="font-size:13px; font-weight:800; color:white; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1;">@${user.username.toUpperCase()}</span>
      <span style="font-size:11px; color:rgba(255,255,255,0.7); display:flex; align-items:center; gap:4px; font-weight:bold; flex-shrink:0;">➕ Швидке додавання</span>
    </div>
  `).join("");
};



window.addPlayerToSlotTeam = function(teamId, username) {
  const db = getDB();
  const team = db.teams.find(t => t.id === teamId);
  if (!team) return;

  if (!team.players) team.players = [];
  const userNickLower = username.toLowerCase();

  // Format size limitation check
  const tour = db.tournaments.find(t => t.id === activeRosterTournamentId);
  const format = tour ? tour.format : (team.format || '2x2');
  const maxAllowed = getMaxPlayersForFormat(format);
  if (team.players.length >= maxAllowed) {
    showToast(`Помилка: Максимальна кількість учасників для формату ${format} становить ${maxAllowed}!`, "error");
    return;
  }

  // Normalize all stored players to lowercase for reliable comparison
  team.players = team.players.map(p => p.toLowerCase());

  if (team.players.includes(userNickLower)) {
    showToast("Цей гравець вже є у команді!", "error");
    return;
  }

  // Exclusivity validation: one player cannot be in two teams in the same tournament
  if (tour && tour.registeredTeams) {
    for (const regTeamId of tour.registeredTeams) {
      if (!regTeamId || regTeamId === teamId) continue;
      const otherTeam = db.teams.find(t => t.id === regTeamId);
      if (otherTeam && otherTeam.players) {
        // Normalize other team players too
        otherTeam.players = otherTeam.players.map(p => p.toLowerCase());
        if (otherTeam.players.includes(userNickLower)) {
          showToast(`Помилка: Гравець @${username.toUpperCase()} вже бере участь у цьому турнірі в складі команди "${otherTeam.name}"!`, "error");
          return;
        }
      }
    }
  }

  team.players.push(userNickLower);
  if (tour) {
    tour.lastModified = Date.now();
  }
  saveDB(db);

  showToast(`Гравець @${username.toUpperCase()} доданий до команди ${team.name}!`, "success");
  openRosterModal(activeRosterTournamentId);
};

window.removePlayerFromSlotTeam = function(teamId, username) {
  if (!confirm(`Ви впевнені, що хочете вилучити гравця @${username.toUpperCase()} з команди?`)) return;

  const db = getDB();
  const team = db.teams.find(t => t.id === teamId);
  if (!team) { showToast('Помилка: команду не знайдено', 'error'); return; }

  const before = (team.players || []).length;
  team.players = (team.players || []).filter(p => p.toLowerCase() !== username.toLowerCase());
  const after = team.players.length;

  if (before === after) {
    showToast(`Гравця @${username.toUpperCase()} не знайдено в команді`, 'error');
    return;
  }

  const tour = db.tournaments.find(t => t.id === activeRosterTournamentId);
  if (tour) {
    tour.lastModified = Date.now();
  }
  saveDB(db);
  showToast(`Гравця @${username.toUpperCase()} вилучено з команди!`, "success");
  // Re-open roster modal to refresh the UI
  if (activeRosterTournamentId) {
    openRosterModal(activeRosterTournamentId);
  }
};

window.fillSlotTeamWithBots = function(teamId) {
  const db = getDB();
  const team = db.teams.find(t => t.id === teamId);
  if (!team) return;

  const tour = db.tournaments.find(t => t.id === activeRosterTournamentId);
  const format = tour ? tour.format : (team.format || '2x2');
  const maxAllowed = getMaxPlayersForFormat(format);

  if (!team.players) team.players = [];

  if (team.players.length >= maxAllowed) {
    showToast(`Команда вже повністю заповнена!`, "error");
    return;
  }

  const botPool = [
    'bot_simple', 'bot_zywoo', 'bot_donk', 'bot_m0nesy', 'bot_niko', 
    'bot_dev1ce', 'bot_ropz', 'bot_twistzz', 'bot_b1t', 'bot_elig', 
    'bot_shox', 'bot_kennys', 'bot_coldzera', 'bot_fallen', 'bot_stewie2k', 
    'bot_tarik', 'bot_scream', 'bot_getright', 'bot_forest', 'bot_pasha',
    'bot_neo', 'bot_trinity', 'bot_morpheus', 'bot_smith', 'bot_cypher'
  ];

  let addedCount = 0;
  // Get currently registered players in this tournament across all teams to ensure uniqueness
  const activePlayers = new Set();
  if (tour && tour.registeredTeams) {
    tour.registeredTeams.forEach(tid => {
      if (!tid) return;
      const t = db.teams.find(o => o.id === tid);
      if (t && t.players) {
        t.players.forEach(p => activePlayers.add(p.toLowerCase()));
      }
    });
  }

  // Shuffle pool to get random bots
  const shuffledPool = botPool.sort(() => 0.5 - Math.random());

  for (const botName of shuffledPool) {
    if (team.players.length >= maxAllowed) break;
    const botNameLower = botName.toLowerCase();
    
    // Check if bot is already playing in the tournament or in the team
    if (team.players.includes(botNameLower) || activePlayers.has(botNameLower)) {
      continue;
    }

    team.players.push(botNameLower);
    activePlayers.add(botNameLower);
    addedCount++;

    // Ensure bot is in db.users
    const userExists = db.users.some(u => u.username.toLowerCase() === botNameLower);
    if (!userExists) {
      db.users.push({
        email: `${botNameLower}@volk.bot`,
        username: botNameLower,
        password: "111111",
        balance: 1000,
        bonusPercent: 0,
        hasSpunWheel: true,
        usedPromos: [],
        depositHistory: [],
        betHistory: [],
        claimedQuests: [],
        skinsInventory: []
      });
    }
  }

  if (addedCount > 0) {
    if (tour) {
      tour.lastModified = Date.now();
      rebuildBracketTeamSlots(tour);
    }
    saveDB(db);
    showToast(`Команду заповнено ботами (+${addedCount})!`, "success");
    if (activeRosterTournamentId) {
      openRosterModal(activeRosterTournamentId);
    }
    renderAdminPanel();
  } else {
    showToast(`Не вдалося знайти унікальних ботів для заповнення.`, "error");
  }
};

// Global state for bracket editor selection
let activeEditorTournamentId = null;

// Open Visual Match Bracket Editor Card for selected tournament
// Open Visual Match Bracket Editor Card for selected tournament
window.openBracketEditorCard = function(tourId, skipScroll = false) {
  const db = getDB();
  if (!db) return;
  const tour = (db.tournaments || []).filter(Boolean).find(t => t.id === tourId);
  if (!tour) return;

  activeEditorTournamentId = tourId;
  const titleEl = document.getElementById('admin-editor-tournament-name');
  if (titleEl) titleEl.innerText = tour.name;
  
  const prizePoolInput = document.getElementById('admin-editor-prize-pool');
  if (prizePoolInput) {
    prizePoolInput.value = tour.prizePool || 0;
  }
  
  const container = document.getElementById('admin-bracket-matches-container');
  if (!container) return;
  container.innerHTML = "";

  const editorCard = document.getElementById('admin-bracket-editor-card');
  if (editorCard) {
    editorCard.style.display = "block";
    if (!skipScroll) {
      editorCard.scrollIntoView({ behavior: 'smooth' });
    }
  }

  if (!tour.brackets || !tour.brackets.rounds) {
    container.innerHTML = `<span style="color:var(--text-secondary); text-align:center; display:block; padding:10px;">Сітку не згенеровано.</span>`;
    return;
  }

  // Populate round match listings
  tour.brackets.rounds.forEach((round, rIndex) => {
    const roundDiv = document.createElement('div');
    roundDiv.className = "card";
    roundDiv.style.background = "#0c0d12";
    roundDiv.style.borderColor = "rgba(255,255,255,0.03)";
    
    roundDiv.innerHTML = `
      <div style="font-size:12px; font-weight:800; text-transform:uppercase; color:var(--cs-orange); margin-bottom:15px; border-bottom:1px solid rgba(255,255,255,0.05); padding-bottom:6px;">
        ${round.name}
      </div>
      <div style="display:flex; flex-direction:column; gap:12px;" id="round-matches-list-${rIndex}"></div>
    `;
    
    container.appendChild(roundDiv);
    
    const mContainer = roundDiv.querySelector(`#round-matches-list-${rIndex}`);
    if (!mContainer) return;

    (round.matches || []).forEach((match, mIndex) => {
      const matchCard = document.createElement('div');
      matchCard.style.background = "#14151e";
      matchCard.style.border = "1px solid var(--border-color)";
      matchCard.style.padding = "15px";
      matchCard.style.borderRadius = "8px";

      const regTeamIds = tour.registeredTeams || [];
      const tourTeams = (db.teams || []).filter(t => t && t.name && (!tour.format || formatsMatch(t.format, tour.format)));
      const teamList1 = tourTeams.map(t => `<option value="${t.name}" ${match.team1 === t.name ? 'selected' : ''}>${t.name}</option>`).join('');
      const teamList2 = tourTeams.map(t => `<option value="${t.name}" ${match.team2 === t.name ? 'selected' : ''}>${t.name}</option>`).join('');

      matchCard.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.03); padding-bottom:6px;">
          <strong style="color:white; font-size:12px;">Матч ID: ${match.id}</strong>
          <div>
            <select id="m-status-${rIndex}-${mIndex}" onchange="saveBracketMatchAdmin(${rIndex}, ${mIndex})" style="background:var(--bg-input); color:white; border:1px solid var(--border-color); font-size:11px; padding:4px 8px; border-radius:4px;">
              <option value="upcoming" ${match.status === 'upcoming' ? 'selected' : ''}>Очікується</option>
              <option value="live" ${match.status === 'live' ? 'selected' : ''}>Активний</option>
              <option value="finished" ${match.status === 'finished' ? 'selected' : ''}>Завершений</option>
            </select>
          </div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom:12px;">
          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:10px; margin-bottom:4px;">Команда 1</label>
            <select id="m-team1-${rIndex}-${mIndex}" class="form-input" style="padding:6px; font-size:12px;">
              <option value="Очікується" ${match.team1 === 'Очікується' ? 'selected' : ''}>Очікується</option>
              ${teamList1}
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:10px; margin-bottom:4px;">Команда 2</label>
            <select id="m-team2-${rIndex}-${mIndex}" class="form-input" style="padding:6px; font-size:12px;">
              <option value="Очікується" ${match.team2 === 'Очікується' ? 'selected' : ''}>Очікується</option>
              ${teamList2}
            </select>
          </div>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom:12px;">
          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:10px; margin-bottom:4px;">Рахунок Команди 1 (${match.team1})</label>
            <div style="display:flex; gap:6px; align-items:center;">
              <button type="button" class="btn" style="padding: 6px 10px; background: #2d3748; border-color: #4a5568; margin-bottom: 0; font-size:11px;" onclick="adjustTourScore('${rIndex}', '${mIndex}', 1, -1)">-1</button>
              <input type="number" id="m-score1-${rIndex}-${mIndex}" class="form-input" min="0" max="13" value="${match.score1}" readonly style="padding:6px 10px; text-align:center; flex:1;">
              <button type="button" class="btn" style="padding: 6px 10px; background: var(--cs-orange); border-color: var(--cs-orange); margin-bottom: 0; font-weight: 800; font-size:11px;" onclick="adjustTourScore('${rIndex}', '${mIndex}', 1, 1)">+1</button>
            </div>
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:10px; margin-bottom:4px;">Рахунок Команди 2 (${match.team2})</label>
            <div style="display:flex; gap:6px; align-items:center;">
              <button type="button" class="btn" style="padding: 6px 10px; background: #2d3748; border-color: #4a5568; margin-bottom: 0; font-size:11px;" onclick="adjustTourScore('${rIndex}', '${mIndex}', 2, -1)">-1</button>
              <input type="number" id="m-score2-${rIndex}-${mIndex}" class="form-input" min="0" max="13" value="${match.score2}" readonly style="padding:6px 10px; text-align:center; flex:1;">
              <button type="button" class="btn" style="padding: 6px 10px; background: var(--cs-orange); border-color: var(--cs-orange); margin-bottom: 0; font-weight: 800; font-size:11px;" onclick="adjustTourScore('${rIndex}', '${mIndex}', 2, 1)">+1</button>
            </div>
          </div>
        </div>

        <div class="form-group" style="margin-bottom:12px;">
          <label style="font-size:10px; margin-bottom:4px; display:block;">🏆 Переможець матчу (для завершених)</label>
          <select id="m-winner-${rIndex}-${mIndex}" class="form-input" style="padding:6px; font-size:12px; background:#0c0d12;">
            <option value="Очікується" ${(!match.winnerSlot && !match.winner) || match.winnerSlot === 'Очікується' || match.winner === 'Очікується' ? 'selected' : ''}>Очікується (Автовибір за рахунком)</option>
            <option value="team1" ${match.winnerSlot === 'team1' || (match.winner && match.winner === match.team1 && match.team1 !== 'Очікується') ? 'selected' : ''}>${match.team1}</option>
            <option value="team2" ${match.winnerSlot === 'team2' || (match.winner && match.winner === match.team2 && match.team2 !== 'Очікується') ? 'selected' : ''}>${match.team2}</option>
          </select>
        </div>

        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:15px; margin-bottom:12px;">
          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:10px; margin-bottom:4px;">Час початку</label>
            <input type="datetime-local" id="m-time-${rIndex}-${mIndex}" class="form-input" value="${match.time || ''}" style="padding:5px 8px; font-size:11px;">
          </div>
          <div class="form-group" style="margin-bottom:0;">
            <label style="font-size:10px; margin-bottom:4px; display:block;">🗺️ Карта матчу</label>
            <select id="m-map-${rIndex}-${mIndex}" class="form-input" style="padding:6px; font-size:11px; background:#0c0d12; height:32px;">
              <option value="de_mirage" ${match.map === 'de_mirage' || !match.map ? 'selected' : ''}>de_mirage</option>
              <option value="de_dust2" ${match.map === 'de_dust2' ? 'selected' : ''}>de_dust2</option>
              <option value="de_inferno" ${match.map === 'de_inferno' ? 'selected' : ''}>de_inferno</option>
              <option value="de_nuke" ${match.map === 'de_nuke' ? 'selected' : ''}>de_nuke</option>
              <option value="de_ancient" ${match.map === 'de_ancient' ? 'selected' : ''}>de_ancient</option>
              <option value="de_anubis" ${match.map === 'de_anubis' ? 'selected' : ''}>de_anubis</option>
              <option value="de_train" ${match.map === 'de_train' ? 'selected' : ''}>de_train</option>
              <option value="de_cache" ${match.map === 'de_cache' ? 'selected' : ''}>de_cache</option>
            </select>
          </div>
        </div>

        <div style="display:flex; gap:8px;">
          <button class="btn" style="flex:1; padding:9px 12px; font-size:11px; margin-bottom:0; font-weight:800;" onclick="saveBracketMatchAdmin(${rIndex}, ${mIndex})">Зберегти матч</button>
        </div>
      `;
      mContainer.appendChild(matchCard);
    });
  });
};

// Close Bracket Editor Card panel
window.closeBracketEditorCard = function() {
  document.getElementById('admin-bracket-editor-card').style.display = "none";
  activeEditorTournamentId = null;
};

window.saveBracketPrizePool = function() {
  if (!activeEditorTournamentId) return;
  const db = getDB();
  if (!db) return;
  const tour = (db.tournaments || []).filter(Boolean).find(t => t.id === activeEditorTournamentId);
  if (!tour) return;

  const prizeInput = document.getElementById('admin-editor-prize-pool');
  if (!prizeInput) return;

  const newPrize = parseFloat(prizeInput.value);
  if (isNaN(newPrize) || newPrize < 0) {
    showToast("Введіть коректний призовий фонд!", "error");
    return;
  }

  tour.prizePool = newPrize;
  tour.lastModified = Date.now();
  
  saveDB(db);
  pushToCloud(db);

  showToast(`Призовий фонд турніру "${tour.name}" успішно оновлено на ${newPrize} 🪙!`, "success");
  renderAdminPanel();
};

// Adjust score in bracket editor using buttons
window.adjustTourScore = function(rIndex, mIndex, teamNum, val) {
  const el = document.getElementById(`m-score${teamNum}-${rIndex}-${mIndex}`);
  if (!el) return;
  let currentVal = parseInt(el.value, 10) || 0;
  let newVal = currentVal + val;
  if (newVal < 0) newVal = 0;
  if (newVal > 13) newVal = 13;
  el.value = newVal;

  // Auto-save match score changes immediately to DB and Cloud
  saveBracketMatchAdmin(rIndex, mIndex);
};

// Save edited match bracket properties and run auto propagation algorithm
window.saveBracketMatchAdmin = function(rIndex, mIndex) {
  const scrollPos = window.scrollY; // Preserve scroll position
  if (!activeEditorTournamentId) return;
  const db = getDB();
  if (!db) return;
  const tour = (db.tournaments || []).filter(Boolean).find(t => t.id === activeEditorTournamentId);
  if (!tour || !tour.brackets || !tour.brackets.rounds) return;

  const round = tour.brackets.rounds[rIndex];
  if (!round || !round.matches) return;
  const match = round.matches[mIndex];
  if (!match) return;

  // Get inputs
  const team1El = document.getElementById(`m-team1-${rIndex}-${mIndex}`);
  const team2El = document.getElementById(`m-team2-${rIndex}-${mIndex}`);
  const score1El = document.getElementById(`m-score1-${rIndex}-${mIndex}`);
  const score2El = document.getElementById(`m-score2-${rIndex}-${mIndex}`);
  const statusEl = document.getElementById(`m-status-${rIndex}-${mIndex}`);
  const timeEl = document.getElementById(`m-time-${rIndex}-${mIndex}`);
  const winnerSelectEl = document.getElementById(`m-winner-${rIndex}-${mIndex}`);
  const mapEl = document.getElementById(`m-map-${rIndex}-${mIndex}`);

  const team1 = team1El ? team1El.value : "Очікується";
  const team2 = team2El ? team2El.value : "Очікується";
  let score1 = score1El ? (parseInt(score1El.value, 10) || 0) : 0;
  let score2 = score2El ? (parseInt(score2El.value, 10) || 0) : 0;

  if (score1 > 13) {
    score1 = 13;
    if (score1El) score1El.value = 13;
  }
  if (score2 > 13) {
    score2 = 13;
    if (score2El) score2El.value = 13;
  }

  let status = statusEl ? statusEl.value : "upcoming";
  const time = timeEl ? timeEl.value : "";

  // Auto-finish if either score reaches 13 or more
  if (score1 >= 13 || score2 >= 13) {
    status = "finished";
  }

  // If editing first round, sync back to registeredTeams roster so rebuild preserves it
  if (rIndex === 0) {
    if (!tour.registeredTeams) tour.registeredTeams = [];
    
    if (team1 === "Очікується") {
      tour.registeredTeams[mIndex * 2] = null;
    } else {
      const t = db.teams.find(team => team.name === team1);
      if (t) {
        tour.registeredTeams[mIndex * 2] = t.id;
      }
    }

    if (team2 === "Очікується") {
      tour.registeredTeams[mIndex * 2 + 1] = null;
    } else {
      const t = db.teams.find(team => team.name === team2);
      if (t) {
        tour.registeredTeams[mIndex * 2 + 1] = t.id;
      }
    }
  }

  match.team1 = team1;
  match.team2 = team2;
  match.manualTeam1 = team1;
  match.manualTeam2 = team2;
  match.score1 = score1;
  match.score2 = score2;
  match.status = status;
  match.time = time;
  if (mapEl) {
    match.map = mapEl.value;
  }

  // Settle Winner if finished
  if (status === "finished") {
    const winnerSelect = winnerSelectEl ? winnerSelectEl.value : "Очікується";
    
    // Auto-winner check by score threshold 13
    if (score1 >= 13 && score1 > score2) {
      match.winner = team1;
      match.winnerSlot = "team1";
    } else if (score2 >= 13 && score2 > score1) {
      match.winner = team2;
      match.winnerSlot = "team2";
    } else {
      // Manual selection or fallback
      if (winnerSelect === "team1") {
        match.winner = team1;
        match.winnerSlot = "team1";
      } else if (winnerSelect === "team2") {
        match.winner = team2;
        match.winnerSlot = "team2";
      } else {
        // Fallback to scores if left as "Очікується"
        if (score1 === score2) {
          showToast("Помилка: У матчі на виліт не може бути нічиєї!", "error");
          return;
        }
        if (score1 > score2) {
          match.winner = team1;
          match.winnerSlot = "team1";
        } else {
          match.winner = team2;
          match.winnerSlot = "team2";
        }
      }
    }
  } else {
    match.winner = null;
    match.winnerSlot = null;
  }

  // Perform brackets rebuild and propagation
  rebuildBracketTeamSlots(tour);

  // Auto check if entire tournament is finished (Final match completed)
  const lastRound = tour.brackets.rounds[tour.brackets.rounds.length - 1];
  const finalMatch = lastRound.matches[0];

  if (finalMatch && finalMatch.status === "finished" && finalMatch.winner) {
    tour.status = "completed";
    if (!tour.completedAt) {
      tour.completedAt = new Date().toISOString();
    }
    
    // Distribute prizes to team owners automatically
    distributeTournamentPrizes(tour, db);

    // Automatically settle all tournament outright bets placed on this tournament
    const winningTeamName = finalMatch.winner;
    db.users.forEach(u => {
      (u.betHistory || []).forEach(bet => {
        if (bet.tourId && bet.tourId === tour.id && bet.status === 'В грі') {
          if (bet.selectedTeam.toLowerCase() === winningTeamName.toLowerCase()) {
            bet.status = "Виграш";
            bet.payout = Math.round(bet.amount * bet.odds);
            u.unclaimedBalance = (u.unclaimedBalance || 0) + bet.payout;
          } else {
            bet.status = "Програш";
            bet.payout = 0;
          }
        }
      });
    });

    showToast(`🏆 Турнір завершено! Переможець: ${finalMatch.winner.toUpperCase()}! Кошти зараховано капітанам!`, "success");
  }

  tour.lastModified = Date.now();
  saveDB(db);

  // Use pushToCloud to block background sync and prevent race conditions
  pushToCloud(db);

  showToast(`Матч ${match.id} успішно оновлено!`, "success");
  openBracketEditorCard(activeEditorTournamentId, true); // Refresh editor list
  renderAdminPanel();
  window.scrollTo(0, scrollPos); // Restore scroll position
};


// Automatical prizes payout distribution to team owners
function distributeTournamentPrizes(tour, db) {
  if (!tour || !tour.percents) return;

  const prizePool = tour.prizePool || 0;
  const prizePlaces = tour.prizePlaces || 1;

  let firstPlaceTeam = null;
  let secondPlaceTeam = null;
  let thirdPlaceTeams = [];

  // Determine winners
  if (tour.system === "double" && tour.maxTeams === 4) {
    // Double Elimination standings
    // Final Match (m_6)
    const finalM6 = tour.brackets.rounds[3].matches[0];
    if (finalM6) {
      firstPlaceTeam = finalM6.winner;
      secondPlaceTeam = (finalM6.winner === finalM6.team1) ? finalM6.team2 : finalM6.team1;
    }
    // 3rd place is the loser of Lower Final (m_5)
    const m5 = tour.brackets.rounds[2].matches[0];
    if (m5) {
      const loserOfM5 = (m5.winner === m5.team1) ? m5.team2 : m5.team1;
      thirdPlaceTeams.push(loserOfM5);
    }
  } else {
    // Single Elimination standings
    const lastRound = tour.brackets.rounds[tour.brackets.rounds.length - 1];
    const finalMatch = lastRound.matches[0];

    if (finalMatch) {
      firstPlaceTeam = finalMatch.winner;
      secondPlaceTeam = (finalMatch.winner === finalMatch.team1) ? finalMatch.team2 : finalMatch.team1;
    }

    // 3rd place: split between both losers of the semi-finals
    if (tour.brackets.rounds.length >= 2) {
      const semis = tour.brackets.rounds[tour.brackets.rounds.length - 2];
      semis.matches.forEach(m => {
        if (m.winner) {
          const loser = (m.winner === m.team1) ? m.team2 : m.team1;
          thirdPlaceTeams.push(loser);
        }
      });
    }
  }

  // Pay 1st place
  if (firstPlaceTeam && percentsInPool(tour.percents[1])) {
    awardPrizeToTeamPlayers(firstPlaceTeam, (prizePool * tour.percents[1]) / 100, "1 місце в турнірі " + tour.name, db);
  }

  // Pay 2nd place
  if (secondPlaceTeam && percentsInPool(tour.percents[2])) {
    awardPrizeToTeamPlayers(secondPlaceTeam, (prizePool * tour.percents[2]) / 100, "2 місце в турнірі " + tour.name, db);
  }

  // Pay 3rd place (split if multiple)
  if (thirdPlaceTeams.length > 0 && percentsInPool(tour.percents[3])) {
    const total3rdAmt = (prizePool * tour.percents[3]) / 100;
    const splitAmt = total3rdAmt / thirdPlaceTeams.length;
    thirdPlaceTeams.forEach(teamName => {
      awardPrizeToTeamPlayers(teamName, splitAmt, "3 місце в турнірі " + tour.name, db);
    });
  }
}

function percentsInPool(pctVal) {
  return pctVal !== undefined && pctVal > 0;
}

function awardPrizeToTeamPlayers(teamName, totalCoinsForPlace, reason, db) {
  if (!teamName || teamName === "Очікується" || totalCoinsForPlace <= 0) return;
  
  const team = db.teams.find(t => t.name.toLowerCase() === teamName.toLowerCase());
  if (!team) return;

  const players = team.players || [];
  
  if (players.length === 0) {
    // Fallback: If no players are registered in the team roster, award the full amount to the team owner/captain
    const ownerNick = team.owner.toLowerCase();
    const ownerUser = db.users.find(u => u.username.toLowerCase() === ownerNick);
    if (ownerUser) {
      const amtRounded = Math.round(totalCoinsForPlace);
      ownerUser.balance = (ownerUser.balance || 0) + amtRounded;
      if (!ownerUser.depositHistory) ownerUser.depositHistory = [];
      ownerUser.depositHistory.unshift({
        amount: amtRounded,
        method: "🏆 " + reason + " (Капітан)",
        date: new Date().toLocaleString()
      });
      console.log(`[PRIZE] Awarded fallback ${amtRounded} coins to team owner ${ownerUser.username} for team ${team.name}`);
    }
  } else {
    // Divide the coins equally among all registered players in the team!
    const coinsPerPlayer = totalCoinsForPlace / players.length;
    const amtRounded = Math.round(coinsPerPlayer); // round to nearest integer
    
    players.forEach(pNick => {
      const playerUser = db.users.find(u => u.username.toLowerCase() === pNick.toLowerCase());
      if (playerUser) {
        playerUser.balance = (playerUser.balance || 0) + amtRounded;
        if (!playerUser.depositHistory) playerUser.depositHistory = [];
        playerUser.depositHistory.unshift({
          amount: amtRounded,
          method: `🏆 ${reason} (Склад команди ${team.name})`,
          date: new Date().toLocaleString()
        });
        console.log(`[PRIZE] Awarded ${amtRounded} coins to player ${playerUser.username} of team ${team.name}`);
      }
    });
  }
}

// Global Modal helper closes
window.closeModal = function(modalId) {
  const overlay = document.getElementById(modalId);
  if (overlay) {
    overlay.classList.remove('active');
  }
};

// Clear statistics history (reset total deposits, bets, and logs) for all users
window.clearDashboardStats = async function() {
  if (!confirm("Ви впевнені, що хочете очистити всю статистику дашборду (історію поповнень, історію ставок та консоль логів) для всіх користувачів? Це дійство є незворотнім.")) {
    return;
  }
  const db = getDB();
  db.users.forEach(u => {
    u.depositHistory = [];
    u.betHistory = [];
    u.loginHistory = []; // Clear registration/login history too so logs don't persist
  });
  db.pendingDeposits = [];
  db.pendingWithdrawals = [];
  db.aimLobbies = [];
  
  try {
    await saveDB(db);
    // Also clear all individual user keys on the server!
    const userClearPromises = db.users.map(u => {
      return fetch(CLOUD_BUCKET + 'user_' + u.username.toLowerCase(), {
        method: 'POST',
        body: JSON.stringify(u)
      });
    });
    await Promise.all(userClearPromises);
    showToast("Статистику дашборду успішно очищено!", "success");
  } catch (e) {
    console.error(e);
    showToast("Помилка при очищенні статистики!", "error");
  }
  renderAdminPanel();
};


// Update User Faceit account info
window.updateUserFaceitAdmin = function() {
  if (!searchedUserNick) return;
  const db = getDB();
  const user = db.users.find(u => u.username.toLowerCase() === searchedUserNick.toLowerCase());
  if (!user) return;

  const nick = document.getElementById('admin-faceit-nick').value.trim();
  const lvl = parseInt(document.getElementById('admin-faceit-lvl').value);
  const elo = parseInt(document.getElementById('admin-faceit-elo').value);

  if (!nick) {
    user.linkedFaceitName = null;
    user.faceitLevel = null;
    user.faceitElo = null;
    user.faceitKD = null;
    user.faceitWinrate = null;
    user.faceitHS = null;
    showToast(`FACEIT акаунт відв'язано для ${user.username}!`, "success");
  } else {
    user.linkedFaceitName = nick;
    user.faceitLevel = isNaN(lvl) ? 1 : Math.max(1, Math.min(10, lvl));
    user.faceitElo = isNaN(elo) ? 1000 : elo;
    if (!user.faceitKD) user.faceitKD = "1.20";
    if (!user.faceitWinrate) user.faceitWinrate = "52%";
    if (!user.faceitHS) user.faceitHS = "45%";
    showToast(`Дані FACEIT для ${user.username} оновлено!`, "success");
  }

  saveDB(db);
  handleUserSearchAdmin();
};

// Render Admin Quests table progress
function renderAdminQuests(db) {
  const theadTr = document.getElementById('admin-quests-thead-tr');
  const tbody = document.getElementById('admin-quests-tbody');
  if (!tbody) return;

  const quests = db.quests || [];

  // Update headers
  if (theadTr) {
    theadTr.innerHTML = `
      <th>Нікнейм</th>
      ${quests.map(q => `<th>${q.title}</th>`).join('')}
      <th>Статус нагород</th>
    `;
  }

  tbody.innerHTML = "";

  const users = db.users || [];
  users.forEach(user => {
    if (user.username.toLowerCase() === 'admin') return;

    let questCellsHTML = "";
    quests.forEach(quest => {
      // calculate progress dynamically
      const target = quest.targetCount || 1;
      let progress = 0;
      if (quest.type === "bets") {
        progress = (user.betHistory || []).filter(b => b.matchDisplay && !b.matchDisplay.startsWith("Дуель")).length;
      } else if (quest.type === "duels_win") {
        progress = (user.betHistory || []).filter(b => b.matchDisplay && b.matchDisplay.startsWith("Дуель") && b.status === "Виграш").length;
      } else if (quest.type === "wins") {
        progress = (user.betHistory || []).filter(b => b.status === "Виграш").length;
      } else if (quest.type === "tour_win") {
        progress = (user.betHistory || []).filter(b => b.type === "tournament" && b.status === "Виграш").length;
      } else if (quest.type === "balance") {
        progress = Math.round(parseFloat(user.balance) || 0);
      }

      const completed = progress >= target;
      const claimed = (user.claimedQuests || []).includes(quest.id);

      let statusHTML = "";
      if (claimed) {
        statusHTML = `<span style="color:#26a17b; font-weight:bold;">🏆 Забрано (${progress}/${target})</span>`;
      } else if (completed) {
        statusHTML = `<span style="color:#FFA500; font-weight:bold;">✅ Виконано (${progress}/${target})</span>`;
      } else {
        statusHTML = `<span style="color:var(--text-secondary);">${progress}/${target}</span>`;
      }
      questCellsHTML += `<td>${statusHTML}</td>`;
    });

    const claimedCount = (user.claimedQuests || []).filter(qid => quests.some(q => q.id === qid)).length;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${user.username.toUpperCase()}</strong></td>
      ${questCellsHTML}
      <td><span class="badge-mini-${claimedCount > 0 ? 'win' : 'pending'}">${claimedCount} / ${quests.length} забрано</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// Render dynamic list of active quests in admin
function renderAdminQuestsList(db) {
  const container = document.getElementById('admin-active-quests-list');
  if (!container) return;
  container.innerHTML = "";

  const quests = db.quests || [];
  quests.forEach(quest => {
    const card = document.createElement('div');
    card.className = "card";
    card.style.background = "rgba(255,255,255,0.02)";
    card.style.borderColor = "rgba(255,255,255,0.05)";
    card.style.padding = "15px";
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.justifyContent = "space-between";

    const badgeColor = {
      'bets': '#26a17b',
      'duels_win': '#ff5500',
      'wins': '#FFA500',
      'tour_win': '#c79847',
      'balance': '#e6005c'
    }[quest.type] || '#8b949e';

    const badgeLabel = {
      'bets': 'Ставки',
      'duels_win': 'Дуелі',
      'wins': 'Виграші',
      'tour_win': 'Турніри',
      'balance': 'Баланс'
    }[quest.type] || 'Квест';

    card.innerHTML = `
      <div>
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 10px;">
          <strong style="color: white; font-size: 13px;">${quest.title}</strong>
          <span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: ${badgeColor}; color: white;">
            ${badgeLabel}
          </span>
        </div>
        <p style="font-size: 11px; color: var(--text-secondary); margin: 6px 0 10px 0; line-height: 1.4;">${quest.description}</p>
        <div style="font-size: 11px; color: var(--cs-orange); font-weight: bold;">
          Нагорода: +${quest.reward} 🪙 (Ціль: ${quest.targetCount})
        </div>
      </div>
      <button class="btn btn-danger" onclick="adminDeleteQuest('${quest.id}')" style="margin-top: 15px; padding: 6px 12px; font-size: 11px; font-weight: 800; width: 100%;">
        🗑️ ВИДАЛИТИ КВЕСТ
      </button>
    `;
    container.appendChild(card);
  });
}

window.adminCreateQuest = function() {
  const db = getDB();
  
  const title = document.getElementById('quest-title-input').value.trim();
  const desc = document.getElementById('quest-desc-input').value.trim();
  const reward = parseInt(document.getElementById('quest-reward-input').value);
  const target = parseInt(document.getElementById('quest-target-input').value);
  const typeEl = document.getElementById('quest-type-input');
  const type = typeEl ? typeEl.value : "bets";

  if (!title || !desc || isNaN(reward) || isNaN(target)) {
    showToast("Будь ласка, заповніть всі поля правильно!", "error");
    return;
  }

  const newQuest = {
    id: "quest_" + Date.now(),
    title: title,
    description: desc,
    reward: reward,
    targetCount: target,
    type: type
  };

  if (!db.quests) db.quests = [];
  db.quests.push(newQuest);

  saveDB(db);
  showToast("Квест успішно створено!", "success");
  
  // Reset form
  document.getElementById('admin-create-quest-form').reset();
  
  // Re-render
  renderAdminQuestsList(db);
  renderAdminQuests(db);
};

window.adminDeleteQuest = function(questId) {
  if (!confirm("Ви впевнені, що хочете видалити цей квест?")) return;
  
  const db = getDB();
  db.quests = (db.quests || []).filter(q => q.id !== questId);
  
  saveDB(db);
  showToast("Квест видалено!", "success");
  
  // Re-render
  renderAdminQuestsList(db);
  renderAdminQuests(db);
};



