// Configuration
const API_BASE_URL = 'https://api.kickbase.com/v4';
const LIGAINSIDER_WORKER_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:8787/'
    : 'https://li-worker.better-kickbase.workers.dev/';

// State
let authToken = localStorage.getItem('KB_TOKEN');
let leagues = [];
let currentLeagueId = localStorage.getItem('KB_SELECTED_LEAGUE_ID');
let currentPlayers = [];
let currentBudget = 0;
let teamPredictions = new Map(); // Stores teamId -> plpim mapping
let ligainsiderData = new Map(); // Stores teamId -> probability data



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

function getProbabilityColor(prob) {
    // Map probability values to colors for starting eleven likelihood
    const colorMap = {
        1: 'rgb(0, 122, 255)',      // certain
        2: 'rgb(0, 156, 81)',       // expected
        3: 'rgb(237, 135, 40)',     // uncertain
        4: 'rgb(255, 70, 0)',       // unlikely
        5: 'rgb(39, 39, 41)'        // ruled out
    };
    return colorMap[prob] || 'rgb(200, 200, 200)'; // default gray for unknown
}

async function fetchAllLigainsiderData() {
    if (ligainsiderData.size > 0) return ligainsiderData;
    
    try {
        // Fetch all teams data in a single request
        const response = await fetch(LIGAINSIDER_WORKER_URL);
        
        if (!response.ok) {
            console.warn(`Failed to fetch Ligainsider data: ${response.status}`);
            return null;
        }
        
        const data = await response.json();
        
        // Store each team's data in the Map
        if (data.teams) {
            Object.entries(data.teams).forEach(([teamId, teamData]) => {
                ligainsiderData.set(parseInt(teamId), teamData);
            });
        }
        
        // Log any errors for debugging
        if (data.errors && Object.keys(data.errors).length > 0) {
            console.warn('Some teams failed to load:', data.errors);
        }
        
        return ligainsiderData;
    } catch (error) {
        console.warn('Error fetching Ligainsider data:', error);
        return null;
    }
}

function getPlayerLigainsiderCategory(playerName, teamId) {
    // Get the Ligainsider probability category for a player
    const teamData = ligainsiderData.get(parseInt(teamId));
    if (!teamData) return null;
    const normalizedName = playerName.toLowerCase().trim();

    const filter = (name ) => {
        const nom = name.toLowerCase().trim();
        return nom.includes(normalizedName) || normalizedName.includes(nom);
    }
    
    // Check each category
    if (teamData.certainPlayers?.some(filter)) {
        return 'certainPlayers';
    }
    if (teamData.playersWithAlternative?.some(filter)) {
        return 'playersWithAlternative';
    }
    if (teamData.playersFirstAlternative?.some(filter)) {
        return 'playersFirstAlternative';
    }
    if (teamData.playersSecondAlternative?.some(filter)) {
        return 'playersSecondAlternative';
    }
    if (teamData.playersThirdAlternative?.some(filter)) {
        return 'playersThirdAlternative';
    }
    
    return "";
}

function getLiCategoryColor(category) {
    const colorMap = {
        "certainPlayers": 'rgb(0, 122, 255)',
        "playersWithAlternative": 'rgb(237, 135, 40)',
        "playersFirstAlternative": 'rgb(237, 135, 40)',
        "playersSecondAlternative": 'rgb(237, 135, 40)',
        "playersThirdAlternative": 'rgb(237, 135, 40)',
        "": 'rgb(39, 39, 41)',
    };
    return colorMap[category] || 'rgb(39, 39, 41)';
}

function getLiCategoryText(category) {
    const textMap = {
        "certainPlayers": 'LI',
        "playersWithAlternative": 'LI >',
        "playersFirstAlternative": '< LI',
        "playersSecondAlternative": '<< LI',
        "playersThirdAlternative": '<<< LI',
        "": 'LI'
    };
    return textMap[category] || 'LI';
}

async function openTeamPredictionImage(teamId) {
    if (!teamId) {
        console.error('No teamId provided for prediction image');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE_URL}/base/predictions/teams/1`, {
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            console.error(`Failed to fetch team predictions: ${response.status}`);
            return;
        }
        
        const data = await response.json();
        const team = data.tms?.find(t => t.tid === teamId);
        
        if (!team || !team.plpim) {
            console.error(`Team prediction not found for teamId: ${teamId}`);
            return;
        }
        
        const imageUrl = `https://kickbase.b-cdn.net/${team.plpim}`;
        window.open(imageUrl, '_blank');
    } catch (error) {
        console.error('Error opening team prediction image:', error);
    }
}

async function fetchTeamPredictions() {
    try {
        const response = await fetch(`${API_BASE_URL}/base/predictions/teams/1`, {
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            console.error(`Failed to fetch team predictions: ${response.status}`);
            return;
        }
        
        const data = await response.json();
        teamPredictions.clear();
        
        if (data.tms) {
            data.tms.forEach(team => {
                if (team.tid && team.plpim) {
                    teamPredictions.set(team.tid, `https://kickbase.b-cdn.net/${team.plpim}`);
                }
            });
        }
    } catch (error) {
        console.error('Error fetching team predictions:', error);
    }
}

const teamLigainsiderMap = new Map([
    [2, "https://www.ligainsider.de/fc-bayern-muenchen/1/"],        // Bayern
    [7, "https://www.ligainsider.de/bayer-04-leverkusen/4/"],       // Leverkusen
    [4, "https://www.ligainsider.de/eintracht-frankfurt/3/"],       // Frankfurt
    [3, "https://www.ligainsider.de/borussia-dortmund/14/"],        // Dortmund
    [5, "https://www.ligainsider.de/sc-freiburg/18/"],              // Freiburg
    [18, "https://www.ligainsider.de/1-fsv-mainz-05/17/"],          // Mainz
    [43, "https://www.ligainsider.de/rb-leipzig/1311/"],            // Leipzig
    [10, "https://www.ligainsider.de/sv-werder-bremen/2/"],         // Bremen
    [9, "https://www.ligainsider.de/vfb-stuttgart/12/"],            // Stuttgart
    [15, "https://www.ligainsider.de/borussia-moenchengladbach/5/"],// Gladbach
    [11, "https://www.ligainsider.de/vfl-wolfsburg/16/"],           // Wolfsburg
    [13, "https://www.ligainsider.de/fc-augsburg/21/"],             // Augsburg
    [40, "https://www.ligainsider.de/1-fc-union-berlin/1246/"],     // Union Berlin
    [39, "https://www.ligainsider.de/fc-st-pauli/20/"],             // St. Pauli
    [14, "https://www.ligainsider.de/tsg-hoffenheim/10/"],          // Hoffenheim
    [50, "https://www.ligainsider.de/1-fc-heidenheim/1259/"],       // Heidenheim
    [28, "https://www.ligainsider.de/1-fc-koeln/15/"],              // Köln
    [6, "https://www.ligainsider.de/hamburger-sv/9/"]              // Hamburg
]);

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

function togglePlayerS11Status(leagueId, playerId, checkbox) {
    const key = getS11StatusKey(leagueId, playerId);
    const currentStatus = getPlayerS11Status(leagueId, playerId);
    const newStatus = !currentStatus;
    localStorage.setItem(key, newStatus);
    
    // If marking for starting eleven, also unmark from sell
    if (newStatus) {
        const sellKey = getSellStatusKey(leagueId, playerId);
        localStorage.setItem(sellKey, 'false');
        
        // Uncheck the sell checkbox in the same row
        const row = checkbox.closest('tr');
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
        // Fetch all data in parallel including team predictions (fast - no Ligainsider blocking)
        const [players, budget] = await Promise.all([
            getSquad(currentLeagueId),
            getBudget(currentLeagueId)
        ]);
        
        // Fetch team predictions (don't block display on this)
        fetchTeamPredictions();
        
        currentPlayers = players;
        currentBudget = budget;
        
        // Render immediately with Kickbase data only (fast initial load)
        displayData(players, budget);
        
        // Then fetch Ligainsider data asynchronously and update UI
        await fetchAllLigainsiderData();
        await new Promise(resolve => setTimeout(resolve, 10));
        const pillerContainers = [...document.querySelectorAll('.player-pills')];
        for (player of players) {
            const pillContainer = pillerContainers.find(pc => pc.classList.contains(`playerid-${player.i}`));
            if (!pillContainer) continue;
            // Update the pill container with the correct LI pill
            pillContainer.innerHTML = getPlayerPills(player);
        }        
    } catch (error) {
        showError(error.message);
    }
}

function getPlayerPills(player) {
    // Create KB probability pill - wrapped in team predictions link
    const kbPillHtml = `<a href="${teamPredictions.get(player.tid) || '#'}" target="_blank" style="text-decoration: none;"><span class="prob-pill" style="background-color: ${getProbabilityColor(player.prob)};">KB</span></a>`
    
    // Create LI probability pill (only if category exists) - wrapped in Ligainsider link
    const ligainsiderCategory = getPlayerLigainsiderCategory(player.n, player.tid);
    let liLoading = false;
    if (ligainsiderCategory === null) liLoading = true;
    let liPillHtml = `<a href="${teamLigainsiderMap.get(parseInt(player.tid)) || '#'}" target="_blank" style="text-decoration: none;"><span class="prob-pill li-pill ${liLoading ? "loading": "" }" style="background-color: ${getLiCategoryColor(ligainsiderCategory)};">${getLiCategoryText(ligainsiderCategory)}</span></a>` 
    
    return `${kbPillHtml}${liPillHtml}`;
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
    const teamValueDiff = players.reduce((sum, p) => sum + (p.tfhmvt || 0), 0);
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
        const leaguesData = await getLeagues();
        await showLeagueSelector(leaguesData);
    } catch (error) {
        showError(error.message);
    }
}

document.addEventListener('DOMContentLoaded', init);
