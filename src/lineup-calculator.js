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

// Toggle functions
export function togglePlayerS11Status(leagueId, playerId) {
  const currentStatus = getPlayerS11Status(leagueId, playerId);
  const newStatus = !currentStatus;
  localStorage.setItem(getS11StatusKey(leagueId, playerId), newStatus);
  
  if (newStatus) {
    localStorage.setItem(getSellStatusKey(leagueId, playerId), 'false');
  }

  document.dispatchEvent(new CustomEvent('render-player-table'));
}

export function togglePlayerSellStatus(leagueId, playerId) {
  const currentStatus = getPlayerSellStatus(leagueId, playerId);
  const newStatus = !currentStatus;
  localStorage.setItem(getSellStatusKey(leagueId, playerId), newStatus);

  if (newStatus) {
    localStorage.setItem(getS11StatusKey(leagueId, playerId), 'false');
  }

  document.dispatchEvent(new CustomEvent('render-player-table'));
}
