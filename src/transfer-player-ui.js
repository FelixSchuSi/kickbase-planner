import { render, html } from '../lit-html/lit-html.js';
import { getAuthToken } from './auth.js';
import { addPlannedTransfer } from './transfer-planner.js';

// Configuration
const API_BASE_URL = 'https://api.kickbase.com/v4';
const COMPETITION_ID = '1';
const MAX_RESULTS = 5;

// State
let currentLeagueId = null;
let searchTimeout = null;

// Initialize the transfer planner
export function initTransferPlanner(leagueId) {
    currentLeagueId = leagueId;
    setupPopover();
}

// Setup the popover element
function setupPopover() {
    let popover = document.getElementById('transfer-popover');
    const popoverHTML = html`
        <div class="popover-content">
            <div class="popover-header">
                <h3>plan transfer</h3>
                <button class="close-btn" @click=${closeTransferPopover}">&times;</button>
            </div>
            <div class="popover-body">
                <input 
                    type="text" 
                    id="player-search-input" 
                    class="player-search-input" 
                    placeholder="Search for a player..." 
                    autocomplete="off"
                    @input=${handleSearchInput}
                >
                <div id="search-results" class="search-results"></div>
            </div>
        </div>
    `;
    render(popoverHTML, popover);
       
    // Close popover when clicking outside
    popover.addEventListener('click', (e) => {
        if (e.target === popover) {
            closeTransferPopover();
        }
    });
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeTransferPopover();
        }
    });
}

// Open the popover
export function openTransferPopover() {
    const popover = document.getElementById('transfer-popover');
    if (popover) {
        popover.style.display = 'flex';
        document.getElementById('player-search-input').focus();
    }
}

// Close the popover (make it globally accessible)
window.closeTransferPopover = function() {
    const popover = document.getElementById('transfer-popover');
    if (popover) {
        popover.style.display = 'none';
        // Clear search
        document.getElementById('player-search-input').value = '';
        document.getElementById('search-results').innerHTML = '';
    }
};

// Handle search input with debounce
function handleSearchInput(e) {
    const query = e.target.value.trim();
    
    // Clear previous timeout
    if (searchTimeout) {
        clearTimeout(searchTimeout);
    }
    
    // Clear results if empty
    if (!query) {
        document.getElementById('search-results').innerHTML = '';
        return;
    }
    
    // Debounce search
    searchTimeout = setTimeout(() => {
        searchPlayers(query);
    }, 300);
}

// Search players via API
async function searchPlayers(query) {
    if (!currentLeagueId) {
        console.error('No league ID available');
        return;
    }
    
    try {
        const response = await fetch(
            `${API_BASE_URL}/competitions/${COMPETITION_ID}/players/search?leagueId=${currentLeagueId}&query=${encodeURIComponent(query)}&max=${MAX_RESULTS}`,
            {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${getAuthToken()}`
                }
            }
        );
        
        if (!response.ok) {
            throw new Error(`Search failed: ${response.status}`);
        }
        
        const data = await response.json();
        displaySearchResults(data.it || []);
    } catch (error) {
        console.error('Error searching players:', error);
        document.getElementById('search-results').innerHTML = 
            '<div class="search-error">Search failed. Please try again.</div>';
    }
}

// Display search results
function displaySearchResults(players) {
    const resultsContainer = document.getElementById('search-results');
    
    if (players.length === 0) {
        render(html`<div class="no-results">No players found</div>`, resultsContainer);
        return;
    }
    
    // Position mapping
    const posMap = { 1: 'GK', 2: 'DEF', 3: 'MF', 4: 'FWD' };
    
    // Format currency function
    const formatCurrency = (value) => {
        if (!value && value !== 0) return '-';
        return new Intl.NumberFormat('de-DE', {
            style: 'currency',
            currency: 'EUR',
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        }).format(value).replace('EUR', '€');
    };
    
    const playerHtml = players.map(player => {
        const imageUrl = player.pim ? `https://kickbase.b-cdn.net/${player.pim}` : '';
        const imageHtml = imageUrl ? html`<img src="${imageUrl}" alt="${player.n || 'Player'}" class="result-image">` : '';
        const posLabel = posMap[player.pos] || '-';
        const ownerName = player.onm || 'Kickbase';
        const marketValue = formatCurrency(player.mv);
        
        return html`
            <div class="search-result-item" onclick="selectTransferPlayer(${JSON.stringify(player).replace(/"/g, '&quot;')})">
                <div class="result-image-wrapper">${imageHtml}</div>
                <div class="result-info">
                    <div class="result-name">${player.n || 'Unknown'}</div>
                    <div class="result-details">
                        <span class="result-position">${posLabel}</span>
                        <span class="result-owner">${ownerName}</span>
                        <span class="result-value">${marketValue}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    render(html`${playerHtml}`, resultsContainer);
}

// Handle player selection (make it globally accessible)
window.selectTransferPlayer = function(player) {
    // Save the planned transfer with default price = market value
    addPlannedTransfer(currentLeagueId, player.pi, player.mv);
    
    // Close popover
    window.closeTransferPopover();
    
    // Refresh the display to show the new planned transfer
    document.dispatchEvent(new CustomEvent('refresh-planned-transfers'));
};
