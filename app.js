// Configuration
const API_BASE_URL = 'https://api.kickbase.com/v4';

// State
let authToken = null;
let leagues = [];
let currentLeagueId = null;
let currentUser = null;
let currentPlayers = [];
let currentBudget = 0;

// Utility functions
function formatCurrency(value) {
    if (value === null || value === undefined || isNaN(value)) return '-';
    return new Intl.NumberFormat('de-DE', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);
}

function isValidFormation(formation) {
    const validFormations = ['3-4-3', '3-5-2', '3-6-1', '4-2-4', '4-3-3', '4-4-2', '4-5-1', '5-2-3', '5-3-2', '5-4-1'];
    return validFormations.includes(formation);
}

function getGoalkeeperCount(players, leagueId) {
    let goalkeepers = 0;
    players.forEach(player => {
        if (getPlayerS11Status(leagueId, player.i)) {
            const pos = player.pos || player.position;
            if (pos === 1) goalkeepers++;
        }
    });
    return goalkeepers;
}

function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

function calculateLineupFormation(players, leagueId) {
    let defenders = 0;
    let midfielders = 0;
    let forwards = 0;
    let goalkeepers = 0;
    
    players.forEach(player => {
        if (getPlayerS11Status(leagueId, player.i)) {
            // Position values: 1=GK, 2=DEF, 3=MF, 4=FWD
            const pos = player.pos || player.position;
            if (pos === 2) defenders++;
            else if (pos === 3) midfielders++;
            else if (pos === 4) forwards++;
            else if (pos === 1) goalkeepers++;
        }
    });
    
    if (defenders + midfielders + forwards === 0) {
        return '-';
    }
    
    return `${defenders}-${midfielders}-${forwards}`;
}

function getS11StatusKey(leagueId, playerId) {
    return `s11_${leagueId}_${playerId}`;
}

function getPlayerS11Status(leagueId, playerId) {
    const key = getS11StatusKey(leagueId, playerId);
    // Return true if not set (default to checked)
    const value = localStorage.getItem(key);
    return value === null ? true : value === 'true';
}

function updateLineupDisplay() {
    if (currentPlayers.length === 0 || !currentLeagueId) return;
    
    const lineup = calculateLineupFormation(currentPlayers, currentLeagueId);
    const gkCount = getGoalkeeperCount(currentPlayers, currentLeagueId);
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
    
    // Remove all existing GK error badges
    existingGkBadges?.forEach(badge => badge.remove());
    
    // Add new badges as needed
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

function updatePlayerCountDisplay() {
    if (currentPlayers.length === 0 || !currentLeagueId) return;
    
    // Count players NOT marked for sale
    const remainingCount = currentPlayers.filter(p => !getPlayerSellStatus(currentLeagueId, p.i)).length;
    const playersCountElement = document.getElementById('players-count');
    if (playersCountElement) {
        playersCountElement.textContent = remainingCount;
    }
}

function updateProjectedBalanceDisplay() {
    if (currentPlayers.length === 0 || !currentLeagueId) return;
    
    // Calculate value of players marked for sale
    const sellValue = currentPlayers.reduce((sum, p) => {
        if (getPlayerSellStatus(currentLeagueId, p.i)) {
            return sum + (p.mv || 0);
        }
        return sum;
    }, 0);
    
    const projectedBalance = currentBudget + sellValue;
    const balanceValueElement = document.getElementById('balance-value');
    const projectedBalanceElement = document.getElementById('projected-balance');
    
    if (balanceValueElement) {
        balanceValueElement.textContent = formatCurrency(currentBudget);
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

function togglePlayerS11Status(leagueId, playerId) {
    const key = getS11StatusKey(leagueId, playerId);
    const currentStatus = getPlayerS11Status(leagueId, playerId);
    localStorage.setItem(key, !currentStatus);
    updateLineupDisplay();
    return !currentStatus;
}

function getSellStatusKey(leagueId, playerId) {
    return `sell_${leagueId}_${playerId}`;
}

function getPlayerSellStatus(leagueId, playerId) {
    const key = getSellStatusKey(leagueId, playerId);
    return localStorage.getItem(key) === 'true';
}

function togglePlayerSellStatus(leagueId, playerId, checkbox) {
    const key = getSellStatusKey(leagueId, playerId);
    const currentStatus = getPlayerSellStatus(leagueId, playerId);
    const newStatus = !currentStatus;
    localStorage.setItem(key, newStatus);
    
    // If marking for sell, also unmark from s11
    if (newStatus) {
        const s11Key = getS11StatusKey(leagueId, playerId);
        localStorage.setItem(s11Key, 'false');
        
        // Uncheck the s11 checkbox in the same row (first checkbox-cell)
        const row = checkbox.closest('tr');
        const s11Checkbox = row.querySelector('td.checkbox-cell:first-child input[type="checkbox"]');
        if (s11Checkbox) {
            s11Checkbox.checked = false;
        }
        
        updateLineupDisplay();
    }
    
    updatePlayerCountDisplay();
    updateProjectedBalanceDisplay();
    return newStatus;
}

function getCredentials() {
    const username = localStorage.getItem('KB_EMAIL') || prompt('Kickbase E-Mail eingeben:') || '';
    const password = localStorage.getItem('KB_PASSWORD') || prompt('Kickbase Passwort:') || '';
    
    return { username, password };
}

async function login(username, password) {
    const response = await fetch(`${API_BASE_URL}/user/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({
            em: username,
            pass: password,
            ext: true,
            loy: false
        })
    });
    
    if (response.status === 401) {
        throw new Error('Login failed: Invalid credentials');
    }
    
    if (!response.ok) {
        throw new Error(`Login failed: ${response.status}`);
    }
    
    const data = await response.json();
    authToken = data.tkn;
    currentUser = data.u;
    localStorage.setItem('KB_TOKEN', authToken);
    localStorage.setItem('KB_TOKEN_EXPIRE', data.tknex);
    localStorage.setItem('KB_EMAIL', username);
    localStorage.setItem('KB_PASSWORD', password);
    return data;
}

async function getLeagues() {
    const response = await fetch(`${API_BASE_URL}/leagues/`, {
        headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${authToken}`
        }
    });
    
    if (!response.ok) {
        throw new Error(`Failed to get leagues: ${response.status}`);
    }
    
    const data = await response.json();
    // Map API response to expected format (lins array with i/n fields)
    const leagues = data.lins || [];
    return leagues.map(league => ({
        id: league.i,
        name: league.n
    }));
}

async function getSquad(leagueId) {
    const response = await fetch(`${API_BASE_URL}/leagues/${leagueId}/squad`, {
        headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${authToken}`
        }
    });
    
    if (!response.ok) {
        throw new Error(`Failed to get squad: ${response.status}`);
    }
    
    const data = await response.json();
    return data.it || [];
}

async function getBudget(leagueId) {
    const response = await fetch(`${API_BASE_URL}/leagues/${leagueId}/me/budget`, {
        headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${authToken}`
        }
    });
    
    if (!response.ok) {
        throw new Error(`Failed to get budget: ${response.status}`);
    }
    
    const data = await response.json();
    return data.b || 0;
}

async function getPlayerMarketValueHistory(leagueId, playerId) {
    const response = await fetch(`${API_BASE_URL}/leagues/${leagueId}/players/${playerId}/marketvalue/92`, {
        headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${authToken}`
        }
    });
    
    if (!response.ok) {
        return null;
    }
    
    return await response.json();
}

async function calculateMarketValueDiff(leagueId, playerId) {
    const history = await getPlayerMarketValueHistory(leagueId, playerId);
    
    if (!history || !history.it || history.it.length < 2) {
        return 0;
    }
    
    const items = history.it;
    return items[items.length - 1].mv - items[items.length - 2].mv;
}

async function showLeagueSelector(leaguesData) {
    leagues = leaguesData;
    const selector = document.getElementById('league-selector');
    const select = document.getElementById('league-select');
    
    if (!selector || !select) {
        console.error('League selector elements not found');
        return;
    }
    
    // Always show the selector first
    selector.style.display = 'block';
    
    select.innerHTML = '<option value="">-- Select a league --</option>';
    
    leagues.forEach(league => {
        const option = document.createElement('option');
        option.value = league.id;
        option.textContent = league.name;
        select.appendChild(option);
    });
    
    // Add change listener if not already added
    select.onchange = async () => {
        if (select.value) {
            localStorage.setItem('KB_SELECTED_LEAGUE_ID', select.value);
            await loadSelectedLeague();
        }
    };
    
    const savedLeagueId = localStorage.getItem('KB_SELECTED_LEAGUE_ID');
    
    if (savedLeagueId && leagues.find(l => l.id === savedLeagueId)) {
        select.value = savedLeagueId;
        await loadSelectedLeague();
    }
}

async function loadSelectedLeague() {
    const select = document.getElementById('league-select');
    currentLeagueId = select.value;
    
    if (!currentLeagueId) {
        showError('Please select a league');
        return;
    }
    
    localStorage.setItem('KB_SELECTED_LEAGUE_ID', currentLeagueId);
    await loadAndDisplayData();
}

async function loadAndDisplayData() {
    
    try {
        const [players, budget] = await Promise.all([
            getSquad(currentLeagueId),
            getBudget(currentLeagueId)
        ]);
        
        const playersWithDiff = await Promise.all(
            players.map(async player => {
                const diff = await calculateMarketValueDiff(currentLeagueId, player.i);
                return {
                    ...player,
                    marketValueDiff: diff
                };
            })
        );
        
        currentPlayers = playersWithDiff;
        currentBudget = budget;
        displayData(playersWithDiff, budget);
    } catch (error) {
        showError(error.message);
    }
}

function displayData(players, budget) {
    const container = document.getElementById('data-container');
    
    const squadValue = players.reduce((sum, p) => sum + (p.mv || 0), 0);
    const totalValue = budget + squadValue;
    
    // Calculate value of players marked for sale
    const sellValue = players.reduce((sum, p) => {
        if (getPlayerSellStatus(currentLeagueId, p.i)) {
            return sum + (p.mv || 0);
        }
        return sum;
    }, 0);
    const projectedBalance = budget + sellValue;
    
    // Calculate total market value diff (24h change)
    const teamValueDiff = players.reduce((sum, p) => sum + (p.marketValueDiff || 0), 0);
    const diffClass = teamValueDiff > 0 ? 'positive' : (teamValueDiff < 0 ? 'negative' : '');
    const lineup = calculateLineupFormation(players, currentLeagueId);
    const gkCount = getGoalkeeperCount(players, currentLeagueId);
    const isFormationValid = isValidFormation(lineup);
    const needsGoalkeeper = gkCount === 0;
    const tooManyGoalkeepers = gkCount > 1;
    
    let html = `
        <div class="badge-row">
            <div class="stat-badge balance-badge">
                <span class="badge-emoji">💰</span>
                <div class="balance-stack">
                    ${sellValue > 0 ? `<span class="badge-value projected" id="projected-balance">${formatCurrency(projectedBalance)}</span>` : '<span class="badge-value projected" id="projected-balance" style="display: none;"></span>'}
                    <span class="badge-value current" id="balance-value">${formatCurrency(budget)}</span>
                </div>
            </div>
            <div class="stat-badge value-badge">
                <span class="badge-emoji">📊</span>
                <div class="value-stack">
                    ${teamValueDiff !== 0 ? `<span class="badge-value diff ${diffClass}" id="team-value-diff">${teamValueDiff > 0 ? '+' : ''}${formatCurrency(teamValueDiff)}</span>` : '<span class="badge-value diff" id="team-value-diff" style="display: none;"></span>'}
                    <span class="badge-value current" id="team-value">${formatCurrency(totalValue)}</span>
                </div>
            </div>
            <div class="stat-badge ${!isFormationValid ? 'invalid' : ''}">
                <span class="badge-emoji">📋</span>
                <span class="badge-value" id="lineup-value">${lineup}</span>
            </div>
            <div class="stat-badge">
                <span class="badge-emoji">👥</span>
                <span class="badge-value" id="players-count">${players.filter(p => !getPlayerSellStatus(currentLeagueId, p.i)).length}</span>
            </div>
            ${needsGoalkeeper ? '<div class="stat-badge error-badge"><span class="badge-emoji">⚠️</span><span class="badge-value">No GK</span></div>' : ''}
            ${tooManyGoalkeepers ? '<div class="stat-badge error-badge"><span class="badge-emoji">⚠️</span><span class="badge-value">' + gkCount + ' GKs</span></div>' : ''}
        </div>
        <table>
            <thead>
                <tr>
                    <th class="cell-s11">s11</th>
                    <th class="cell-sell">sell</th>
                    <th class="cell-pos">pos</th>
                    <th class="cell-player">player</th>
                    <th class="cell-value currency">value</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    // Sort players by position: GK (1), DEF (2), MF (3), FWD (4)
    const sortedPlayers = players.slice().sort((a, b) => {
        const posA = a.pos || a.position || 0;
        const posB = b.pos || b.position || 0;
        return posA - posB;
    });
    
    sortedPlayers.forEach(player => {
        const diff = player.marketValueDiff || 0;
        const diffClass = diff > 0 ? 'positive' : (diff < 0 ? 'negative' : '');
        const playerId = player.i;
        const sellStatus = getPlayerSellStatus(currentLeagueId, playerId);
        const sellChecked = sellStatus ? 'checked' : '';
        const s11Status = getPlayerS11Status(currentLeagueId, playerId);
        const s11Checked = s11Status ? 'checked' : '';
        
        // Map position values: 1=GK, 2=DEF, 3=MF, 4=FWD
        const pos = player.pos || player.position;
        const posMap = { 1: 'GK', 2: 'DEF', 3: 'MF', 4: 'FWD' };
        const posLabel = posMap[pos] || '-';
        
        html += `
            <tr>
                <td class="checkbox-cell cell-s11">
                    <input type="checkbox" ${s11Checked} onchange="togglePlayerS11Status('${currentLeagueId}', '${playerId}')">
                </td>
                <td class="checkbox-cell cell-sell">
                    <input type="checkbox" ${sellChecked} onchange="togglePlayerSellStatus('${currentLeagueId}', '${playerId}', this)">
                </td>
                <td class="pos-cell cell-pos">${posLabel}</td>
                <td class="cell-player">${player.n || 'Unknown'}</td>
                <td class="currency value-cell cell-value">
                    <div class="diff-value ${diffClass}">${diff > 0 ? '+' : ''}${formatCurrency(diff)}</div>
                    <div class="market-value">${formatCurrency(player.mv)}</div>
                </td>
            </tr>
        `;
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function isTokenValid() {
    const token = localStorage.getItem('KB_TOKEN');
    const expire = localStorage.getItem('KB_TOKEN_EXPIRE');
    
    if (!token || !expire) {
        return false;
    }
    
    // Check if token expires in more than 1 day (similar to Python code)
    const expireDate = new Date(expire);
    const oneDayFromNow = new Date();
    oneDayFromNow.setDate(oneDayFromNow.getDate() + 1);
    
    return expireDate > oneDayFromNow;
}

function clearStoredAuth() {
    localStorage.removeItem('KB_TOKEN');
    localStorage.removeItem('KB_TOKEN_EXPIRE');
}

async function init() { 
    try {       
        if (!isTokenValid()) {
            const { username, password } = getCredentials();
            
            if (!username || !password) {
                throw new Error('Credentials required');
            }
           
            await login(username, password);
        }
        
        authToken = localStorage.getItem('KB_TOKEN');
        const leaguesData = await getLeagues();
        await showLeagueSelector(leaguesData);
    } catch (error) {
        showError(error.message);
    }
}

document.addEventListener('DOMContentLoaded', init);
