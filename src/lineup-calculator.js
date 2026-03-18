// State registry - will be populated by app.js
let state = {
  get currentPlayers() { return []; },
  get currentLeagueId() { return null; },
  get currentBudget() { return 0; }
};

// Register state getters from app.js
export function registerLineupState(stateGetters) {
  state = stateGetters;
}

// Status key functions
export function getS11StatusKey(leagueId, playerId) {
  return `s11_${leagueId}_${playerId}`;
}

export function getSellStatusKey(leagueId, playerId) {
  return `sell_${leagueId}_${playerId}`;
}

// Status getter functions
export function getPlayerS11Status(leagueId, playerId) {
  const key = getS11StatusKey(leagueId, playerId);
  const value = localStorage.getItem(key);
  return value === null ? true : value === 'true';
}

export function getPlayerSellStatus(leagueId, playerId) {
  const key = getSellStatusKey(leagueId, playerId);
  return localStorage.getItem(key) === 'true';
}

// Formation calculation
export function isValidFormation(formation) {
  const validFormations = ['3-4-3', '3-5-2', '3-6-1', '4-2-4', '4-3-3', '4-4-2', '4-5-1', '5-2-3', '5-3-2', '5-4-1'];
  return validFormations.includes(formation);
}

export function getGoalkeeperCount(players, leagueId) {
  let goalkeepers = 0;
  players.forEach(player => {
    if (getPlayerS11Status(leagueId, player.i)) {
      const pos = player.pos || player.position;
      if (pos === 1) goalkeepers++;
    }
  });
  return goalkeepers;
}

export function calculateLineupFormation(players, leagueId) {
  let defenders = 0;
  let midfielders = 0;
  let forwards = 0;
  
  players.forEach(player => {
    if (getPlayerS11Status(leagueId, player.i)) {
      const pos = player.pos || player.position;
      if (pos === 2) defenders++;
      else if (pos === 3) midfielders++;
      else if (pos === 4) forwards++;
    }
  });
  
  if (defenders + midfielders + forwards === 0) {
    return '-';
  }
  
  return `${defenders}-${midfielders}-${forwards}`;
}

// Display update functions
export function updateLineupDisplay() {
  if (state.currentPlayers.length === 0 || !state.currentLeagueId) return;
  
  const lineup = calculateLineupFormation(state.currentPlayers, state.currentLeagueId);
  const gkCount = getGoalkeeperCount(state.currentPlayers, state.currentLeagueId);
  const isFormationValid = isValidFormation(lineup);
  const needsGoalkeeper = gkCount === 0;
  const tooManyGoalkeepers = gkCount > 1;
  
  const lineupElement = document.getElementById('lineup-value');
  const formationBadge = lineupElement?.closest('.stat-badge');
  
  if (lineupElement) {
    lineupElement.textContent = lineup;
  }
  
  if (formationBadge) {
    if (isFormationValid) {
      formationBadge.classList.remove('invalid');
    } else {
      formationBadge.classList.add('invalid');
    }
  }
  
  // Handle goalkeeper error badges
  const badgeRow = document.querySelector('.badge-row');
  const existingGkBadges = badgeRow?.querySelectorAll('.error-badge');
  
  existingGkBadges?.forEach(badge => badge.remove());
  
  if (needsGoalkeeper) {
    const gkBadge = document.createElement('div');
    gkBadge.className = 'stat-badge error-badge';
    gkBadge.innerHTML = '<span class="badge-emoji">⚠️</span><span class="badge-value">No GK</span>';
    badgeRow?.appendChild(gkBadge);
  }
  
  if (tooManyGoalkeepers) {
    const gkBadge = document.createElement('div');
    gkBadge.className = 'stat-badge error-badge';
    gkBadge.innerHTML = '<span class="badge-emoji">⚠️</span><span class="badge-value">' + gkCount + ' GKs</span>';
    badgeRow?.appendChild(gkBadge);
  }
}

// Helper function for formatting currency
function formatCurrency(value) {
  if (value === null || value === undefined || isNaN(value)) return '-';
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

export function updatePlayerCountDisplay() {
  if (state.currentPlayers.length === 0 || !state.currentLeagueId) return;
  
  const remainingCount = state.currentPlayers.filter(p => !getPlayerSellStatus(state.currentLeagueId, p.i)).length;
  const playersCountElement = document.getElementById('players-count');
  if (playersCountElement) {
    playersCountElement.textContent = remainingCount;
  }
}

export function updateProjectedBalanceDisplay() {
  if (state.currentPlayers.length === 0 || !state.currentLeagueId) return;
  
  const sellValue = state.currentPlayers.reduce((sum, p) => {
    if (getPlayerSellStatus(state.currentLeagueId, p.i)) {
      return sum + (p.mv || 0);
    }
    return sum;
  }, 0);
  
  const projectedBalance = state.currentBudget + sellValue;
  const balanceValueElement = document.getElementById('balance-value');
  const projectedBalanceElement = document.getElementById('projected-balance');
  
  if (balanceValueElement) {
    balanceValueElement.textContent = formatCurrency(state.currentBudget);
  }
  
  if (projectedBalanceElement) {
    if (sellValue > 0) {
      projectedBalanceElement.textContent = formatCurrency(projectedBalance);
      projectedBalanceElement.style.display = 'inline';
    } else {
      projectedBalanceElement.style.display = 'none';
    }
  }
}

// Toggle functions
export function togglePlayerS11Status(leagueId, playerId, checkbox) {
  const key = getS11StatusKey(leagueId, playerId);
  const currentStatus = getPlayerS11Status(leagueId, playerId);
  const newStatus = !currentStatus;
  localStorage.setItem(key, newStatus);
  
  if (newStatus) {
    const sellKey = getSellStatusKey(leagueId, playerId);
    localStorage.setItem(sellKey, 'false');
    
    const row = checkbox.closest('.grid-row');
    const sellCheckbox = row.querySelector('.cell-sell input[type="checkbox"]');
    if (sellCheckbox) {
      sellCheckbox.checked = false;
    }
    
    updatePlayerCountDisplay();
    updateProjectedBalanceDisplay();
  }
  
  updateLineupDisplay();
  return newStatus;
}

export function togglePlayerSellStatus(leagueId, playerId, checkbox) {
  const key = getSellStatusKey(leagueId, playerId);
  const currentStatus = getPlayerSellStatus(leagueId, playerId);
  const newStatus = !currentStatus;
  localStorage.setItem(key, newStatus);

  if (newStatus) {
    const s11Key = getS11StatusKey(leagueId, playerId);
    localStorage.setItem(s11Key, 'false');
    
    const row = checkbox.closest('.grid-row');
    const s11Checkbox = row.querySelector('.cell-s11 input[type="checkbox"]');
    if (s11Checkbox) {
      s11Checkbox.checked = false;
    }
    
    updateLineupDisplay();
  }
  
  updatePlayerCountDisplay();
  updateProjectedBalanceDisplay();
  return newStatus;
}

// Expose toggle functions to global scope for inline event handlers
if (typeof window !== 'undefined') {
  window.togglePlayerS11Status = togglePlayerS11Status;
  window.togglePlayerSellStatus = togglePlayerSellStatus;
}
