import {html} from '../lit-html/lit-html.js';

// State registry - will be populated by app.js
let state = {
  get currentPlayers() { return []; },
  get currentLeagueId() { return null; },
  get currentBudget() { return 0; }
};

// Register state getters from app.js
export function registerBalanceState(stateGetters) {
  state = stateGetters;
}

// Import sell status from lineup calculator
import { getPlayerSellStatus } from './lineup-calculator.js';
import { getPlannedTransfers } from './transfer-planner.js';

// Currency formatting
export function formatCurrency(value) {
  if (value === null || value === undefined || isNaN(value)) return '-';
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

// Calculate all balance-related data
export function calculateBalanceData(players, budget) {
  const squadValue = players.reduce((sum, p) => sum + (p.mv || 0), 0);
  const totalValue = budget + squadValue;
  
  const sellValue = players.reduce((sum, p) => {
    if (getPlayerSellStatus(state.currentLeagueId, p.i)) {
      return sum + (p.mv || 0);
    }
    return sum;
  }, 0);
  
  const projectedBalance = budget + sellValue;
  
  return {
    squadValue,
    totalValue,
    sellValue,
    projectedBalance
  };
}

// Calculate market value diff (24h change)
export function calculateTeamValueDiff(players) {
  return players.reduce((sum, p) => sum + (p.tfhmvt || 0), 0);
}

// Get remaining player count (not marked for sale)
export function getRemainingPlayerCount(players) {
  return players.filter(p => !getPlayerSellStatus(state.currentLeagueId, p.i)).length;
}

// Update balance badge display
export function updateBalanceBadge() {
  if (state.currentPlayers.length === 0 || !state.currentLeagueId) return;
  
  const { sellValue, projectedBalance } = calculateBalanceData(state.currentPlayers, state.currentBudget);
  
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

// Update team value badge display
export function updateTeamValueBadge() {
  if (state.currentPlayers.length === 0 || !state.currentLeagueId) return;
  
  const { totalValue } = calculateBalanceData(state.currentPlayers, state.currentBudget);
  const teamValueDiff = calculateTeamValueDiff(state.currentPlayers);
  const diffClass = teamValueDiff > 0 ? 'positive' : (teamValueDiff < 0 ? 'negative' : '');
  
  const teamValueElement = document.getElementById('team-value');
  const teamValueDiffElement = document.getElementById('team-value-diff');
  
  if (teamValueElement) {
    teamValueElement.textContent = formatCurrency(totalValue);
  }
  
  if (teamValueDiffElement) {
    if (teamValueDiff !== 0) {
      teamValueDiffElement.textContent = `${teamValueDiff > 0 ? '+' : ''}${formatCurrency(teamValueDiff)}`;
      teamValueDiffElement.className = `badge-value diff ${diffClass}`;
      teamValueDiffElement.style.display = 'inline';
    } else {
      teamValueDiffElement.style.display = 'none';
    }
  }
}

// Update player count badge
export function updatePlayerCountBadge() {
  if (state.currentPlayers.length === 0 || !state.currentLeagueId) return;
  
  const currentCount = state.currentPlayers.length;
  const plannedTransfers = getPlannedTransfers(state.currentLeagueId);
  const totalCount = currentCount + plannedTransfers.length;
  
  const playersCountElement = document.getElementById('players-count');
  
  if (playersCountElement) {
    playersCountElement.textContent = totalCount;
  }
}

// Generate balance badge HTML
export function generateBalanceBadgeHTML(budget, projectedBalance, sellValue, plannedCost = 0) {
  const hasProjected = sellValue > 0 || plannedCost > 0;
  const projectedBalanceHTML = hasProjected
    ? html`<span class="badge-value projected" id="projected-balance">${formatCurrency(projectedBalance)}</span>`
    : html`<span class="badge-value projected" id="projected-balance" style="display: none;"></span>`;
  
  return html`
    <div class="stat-badge balance-badge">
      <span class="badge-emoji">💰</span>
      <div class="balance-stack">
        ${projectedBalanceHTML}
        <span class="badge-value current" id="balance-value">${formatCurrency(budget)}</span>
      </div>
    </div>
  `;
}

// Generate team value badge HTML
export function generateTeamValueBadgeHTML(totalValue, teamValueDiff) {
  const diffClass = teamValueDiff > 0 ? 'positive' : (teamValueDiff < 0 ? 'negative' : '');
  const diffHTML = teamValueDiff !== 0 
    ? html`<span class="badge-value diff ${diffClass}" id="team-value-diff">${teamValueDiff > 0 ? '+' : ''}${formatCurrency(teamValueDiff)}</span>`
    : html`<span class="badge-value diff" id="team-value-diff" style="display: none;"></span>`;
  
  return html`
    <div class="stat-badge value-badge">
      <span class="badge-emoji">📊</span>
      <div class="value-stack">
        ${diffHTML}
        <span class="badge-value current" id="team-value">${formatCurrency(totalValue)}</span>
      </div>
    </div>
  `;
}

// Generate player count badge HTML
export function generatePlayerCountBadgeHTML(count) {
  return html`
    <div class="stat-badge">
      <span class="badge-emoji">👥</span>
      <span class="badge-value" id="players-count">${count}</span>
    </div>
  `;
}
