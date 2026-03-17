import {  
    getAuthToken,
    login 
} from './auth.js';
import {
    fetchLigainsiderPredictions,
    fetchKickbasePredictions,
    getPlayerPills
} from './s11-predictions.js';
import {
    registerLineupState,
    getPlayerSellStatus,
    getPlayerS11Status,
    calculateLineupFormation,
    getGoalkeeperCount,
    isValidFormation
} from './lineup-calculator.js';
import {
    registerBalanceState,
    formatCurrency,
    calculateBalanceData,
    calculateTeamValueDiff,
    getRemainingPlayerCount,
    generateBalanceBadgeHTML,
    generateTeamValueBadgeHTML,
    generatePlayerCountBadgeHTML
} from './balance-calculator.js';

// Configuration
export const API_BASE_URL = 'https://api.kickbase.com/v4';

// State
let leagues = [];
let currentLeagueId = localStorage.getItem('KB_SELECTED_LEAGUE_ID');
let currentPlayers = [];
let currentBudget = 0;

// Register state with lineup calculator
registerLineupState({
  get currentPlayers() { return currentPlayers; },
  get currentLeagueId() { return currentLeagueId; },
  get currentBudget() { return currentBudget; }
});

// Register state with balance calculator
registerBalanceState({
  get currentPlayers() { return currentPlayers; },
  get currentLeagueId() { return currentLeagueId; },
  get currentBudget() { return currentBudget; }
});

// Utility functions
function showError(message) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
}

async function getLeagues() {
    const response = await fetch(`${API_BASE_URL}/leagues/`, {
        headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${getAuthToken()}`
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
            'Authorization': `Bearer ${getAuthToken()}`
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
            'Authorization': `Bearer ${getAuthToken()}`
        }
    });
    
    if (!response.ok) {
        throw new Error(`Failed to get budget: ${response.status}`);
    }
    
    const data = await response.json();
    return data.b || 0;
}

async function showLeagueSelector(leaguesData) {
    leagues = leaguesData;
    const selector = document.getElementById('league-selector');
    const select = document.getElementById('league-select');
    
    if (!selector || !select) {
        console.error('League selector elements not found');
        return;
    }
    
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
        // Fetch all data in parallel including team predictions (fast - no Ligainsider blocking)
        const [players, budget] = await Promise.all([
            getSquad(currentLeagueId),
            getBudget(currentLeagueId)
        ]);
        
        // Fetch team predictions (don't block display on this)
        fetchKickbasePredictions(getAuthToken(), API_BASE_URL);
        
        currentPlayers = players;
        currentBudget = budget;
        
        // Render immediately with Kickbase data only (fast initial load)
        displayData(players, budget);
        
        // Then fetch Ligainsider data asynchronously and update UI
        await fetchLigainsiderPredictions();
        await new Promise(resolve => setTimeout(resolve, 10));
        const pillerContainers = [...document.querySelectorAll('.player-pills')];
        for (const player of players) {
            const pillContainer = pillerContainers.find(pc => pc.classList.contains(`playerid-${player.i}`));
            if (!pillContainer) continue;
            // Update the pill container with the correct LI pill
            pillContainer.innerHTML = getPlayerPills(player);
        }        
    } catch (error) {
        showError(error.message);
    }
}

function displayData(players, budget) {
    const container = document.getElementById('data-container');
    
    const { totalValue, sellValue, projectedBalance } = calculateBalanceData(players, budget);
    const teamValueDiff = calculateTeamValueDiff(players);
    const lineup = calculateLineupFormation(players, currentLeagueId);
    const gkCount = getGoalkeeperCount(players, currentLeagueId);
    const isFormationValid = isValidFormation(lineup);
    const needsGoalkeeper = gkCount === 0;
    const tooManyGoalkeepers = gkCount > 1;
    const remainingCount = getRemainingPlayerCount(players);
    
    let html = `
        <div class="badge-row">
            ${generateBalanceBadgeHTML(budget, projectedBalance, sellValue)}
            ${generateTeamValueBadgeHTML(totalValue, teamValueDiff)}
            <div class="stat-badge ${!isFormationValid ? 'invalid' : ''}">
                <span class="badge-emoji">📋</span>
                <span class="badge-value" id="lineup-value">${lineup}</span>
            </div>
            ${generatePlayerCountBadgeHTML(remainingCount)}
            ${needsGoalkeeper ? '<div class="stat-badge error-badge"><span class="badge-emoji">⚠️</span><span class="badge-value">No GK</span></div>' : ''}
            ${tooManyGoalkeepers ? '<div class="stat-badge error-badge"><span class="badge-emoji">⚠️</span><span class="badge-value">' + gkCount + ' GKs</span></div>' : ''}
        </div>
        <table>
            <thead>
                <tr>
                    <th class="cell-image"></th>
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
        const diff = player.tfhmvt || 0;
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
        
        // Construct player image URL
        const imageUrl = player.pim ? `https://kickbase.b-cdn.net/${player.pim}` : '';
        const imageHtml = imageUrl ? `<img src="${imageUrl}" alt="${player.n || 'Player'}" class="player-image">` : '';
        
        
        
        html += `
            <tr>
                <td class="cell-image"><div class="img-wrapper">${imageHtml}</div></td>
                <td class="checkbox-cell cell-s11">
                    <input type="checkbox" ${s11Checked} onchange="togglePlayerS11Status('${currentLeagueId}', '${playerId}', this)">
                </td>
                <td class="checkbox-cell cell-sell">
                    <input type="checkbox" ${sellChecked} onchange="togglePlayerSellStatus('${currentLeagueId}', '${playerId}', this)">
                </td>
                <td class="pos-cell cell-pos" style="color: #333; font-weight: 600;">${posLabel}</td>
                <td class="cell-player">
                    <div class="player-stack">
                        <span class="player-pills playerid-${player.i}">${getPlayerPills(player)}</span>
                        <span>${player.n || 'Unknown'}</span>
                    </div>
                </td>
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

async function init() { 
    try {       
        await login();
        const leaguesData = await getLeagues();
        await showLeagueSelector(leaguesData);
    } catch (error) {
        showError(error.message);
    }
}

document.addEventListener('DOMContentLoaded', init);
