import { html, render } from "../lit-html/lit-html.js";
import { repeat } from "../lit-html/directives/repeat.js";
import { getAuthToken, login } from "./auth.js";
import {
  fetchLigainsiderPredictions,
  fetchKickbasePredictions,
  getPlayerPills,
} from "./s11-predictions.js";
import {
  registerLineupState,
  getPlayerSellStatus,
  getPlayerS11Status,
  isValidFormation,
  getGoalkeeperCount,
  calculateLineupFormation,
  togglePlayerS11Status,
  togglePlayerSellStatus,
} from "./lineup-calculator.js";
import {
  registerBalanceState,
  formatCurrency,
  calculateBalanceData,
  calculateTeamValueDiff,
  generateBalanceBadgeHTML,
  generateTeamValueBadgeHTML,
  generatePlayerCountBadgeHTML,
} from "./balance-calculator.js";
import {
  initTransferPlanner,
  openTransferPopover,
} from "./transfer-player-ui.js";
import {
  loadPlannedTransferPlayers,
  removePlannedTransfer,
  updatePlannedTransferPrice,
  calculatePlannedTransfersCost,
} from "./transfer-planner.js";

// Configuration
export const API_BASE_URL = "https://api.kickbase.com/v4";

// State
let leagues = [];
let currentLeagueId = localStorage.getItem("KB_SELECTED_LEAGUE_ID");
let currentPlayers = [];
let currentBudget = 0;

// Register state with lineup calculator
registerLineupState({
  get currentPlayers() {
    return currentPlayers;
  },
  get currentLeagueId() {
    return currentLeagueId;
  },
  get currentBudget() {
    return currentBudget;
  },
});

// Register state with balance calculator
registerBalanceState({
  get currentPlayers() {
    return currentPlayers;
  },
  get currentLeagueId() {
    return currentLeagueId;
  },
  get currentBudget() {
    return currentBudget;
  },
});

// Utility functions
function showError(message) {
  const errorDiv = document.getElementById("error");
  errorDiv.textContent = message;
  errorDiv.style.display = "block";
}

async function getLeagues() {
  const response = await fetch(`${API_BASE_URL}/leagues/`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${getAuthToken()}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get leagues: ${response.status}`);
  }

  const data = await response.json();
  // Map API response to expected format (lins array with i/n fields)
  const leagues = data.lins || [];
  return leagues.map((league) => ({
    id: league.i,
    name: league.n,
  }));
}

async function getSquad(leagueId) {
  const response = await fetch(`${API_BASE_URL}/leagues/${leagueId}/squad`, {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${getAuthToken()}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to get squad: ${response.status}`);
  }

  const data = await response.json();
  return data.it || [];
}

async function getBudget(leagueId) {
  const response = await fetch(
    `${API_BASE_URL}/leagues/${leagueId}/me/budget`,
    {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${getAuthToken()}`,
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Failed to get budget: ${response.status}`);
  }

  const data = await response.json();
  return data.b || 0;
}

async function showLeagueSelector(leaguesData) {
  leagues = leaguesData;
  const selector = document.getElementById("league-selector");
  const selectElement = document.getElementById("league-select");

  if (!selector || !selectElement) {
    console.error("League selector elements not found");
    return;
  }
  render(
    html`
      ${leagues.map(
        (league) => html` <option value=${league.id}>${league.name}</option> `,
      )}
    `,
    selectElement,
  );

  // Add change listener if not already added
  selectElement.onchange = async () => {
    if (selectElement.value) {
      localStorage.setItem("KB_SELECTED_LEAGUE_ID", selectElement.value);
      await loadSelectedLeague();
    }
  };

  const savedLeagueId = localStorage.getItem("KB_SELECTED_LEAGUE_ID");

  if (savedLeagueId && leagues.find((l) => l.id === savedLeagueId)) {
    selectElement.value = savedLeagueId;
    await loadSelectedLeague();
  }
}

async function loadSelectedLeague() {
  const select = document.getElementById("league-select");
  currentLeagueId = select.value;

  if (!currentLeagueId) {
    showError("Please select a league");
    return;
  }

  localStorage.setItem("KB_SELECTED_LEAGUE_ID", currentLeagueId);
  await loadAndDisplayData();
}

async function loadAndDisplayData() {
  try {
    // Fetch all data in parallel including team predictions (fast - no Ligainsider blocking)
    const [players, budget] = await Promise.all([
      getSquad(currentLeagueId),
      getBudget(currentLeagueId),
    ]);

    // Load planned transfers and merge with current players
    const plannedTransferPlayers =
      await loadPlannedTransferPlayers(currentLeagueId);
    currentPlayers = [...plannedTransferPlayers, ...players];
    currentBudget = budget;

    // Render immediately with Kickbase data only (fast initial load)
    displayData(currentPlayers, budget);

    await Promise.all([
      fetchKickbasePredictions(getAuthToken(), API_BASE_URL).then(() =>
        displayData(currentPlayers, budget),
      ),
      fetchLigainsiderPredictions().then(() =>
        displayData(currentPlayers, budget),
      ),
    ]);
  } catch (error) {
    showError(error.message);
  }
}

function displayData(players, budget) {
  const container = document.getElementById("data-container");

  const plannedCost = calculatePlannedTransfersCost(currentLeagueId);

  const { totalValue, sellValue, projectedBalance } = calculateBalanceData(
    players,
    budget,
  );
  const teamValueDiff = calculateTeamValueDiff(players);

  // Calculate formation using regular functions (planned transfers are already in players array)
  const lineup = calculateLineupFormation(players, currentLeagueId);
  const gkCount = getGoalkeeperCount(players, currentLeagueId);
  const isFormationValid = isValidFormation(lineup);
  const needsGoalkeeper = gkCount === 0;
  const tooManyGoalkeepers = gkCount > 1;

  // Calculate projected balance including planned transfers cost
  const finalProjectedBalance = projectedBalance - plannedCost;
  // Sort players: planned transfers first (by position), then regular players (by position)
  const sortedPlayers = players.slice().sort((a, b) => {
    // Planned transfers come first
    if (a.isPlannedTransfer && !b.isPlannedTransfer) return -1;
    if (!a.isPlannedTransfer && b.isPlannedTransfer) return 1;

    // Then sort by position: GK (1), DEF (2), MF (3), FWD (4)
    const posA = a.pos || a.position || 0;
    const posB = b.pos || b.position || 0;
    return posA - posB;
  });

  const template = html`
    <div class="badge-row">
      ${generateBalanceBadgeHTML(
        budget,
        finalProjectedBalance,
        sellValue,
        plannedCost,
      )}
      ${generateTeamValueBadgeHTML(totalValue, teamValueDiff)}
      <div class="stat-badge ${!isFormationValid ? "invalid" : ""}">
        <span class="badge-emoji">📋</span>
        <span class="badge-value" id="lineup-value">${lineup}</span>
      </div>
      ${generatePlayerCountBadgeHTML(players.length)}
      ${needsGoalkeeper
        ? html`<div class="stat-badge error-badge">
            <span class="badge-emoji">⚠️</span
            ><span class="badge-value">No GK</span>
          </div>`
        : ""}
      ${tooManyGoalkeepers
        ? html`<div class="stat-badge error-badge">
            <span class="badge-emoji">⚠️</span
            ><span class="badge-value">${gkCount} GKs</span>
          </div>`
        : ""}
      <button
        id="plan-transfer-btn"
        class="plan-transfer-btn"
        @click=${openTransferPopover}
      >
        plan transfer
      </button>
    </div>
    <div class="data-grid">
      <div class="grid-header">
        <div class="grid-cell cell-image"></div>
        <div class="grid-cell cell-s11">s11</div>
        <div class="grid-cell cell-sell">sell</div>
        <div class="grid-cell cell-pos">pos</div>
        <div class="grid-cell cell-player">player</div>
        <div class="grid-cell cell-value currency">value</div>
      </div>

      ${repeat(
        sortedPlayers,
        (player) => player.i,
        (player) => {
          const diff = player.tfhmvt || 0;
          const diffClass = diff > 0 ? "positive" : diff < 0 ? "negative" : "";
          const playerId = player.i;
          const isSellChecked = getPlayerSellStatus(currentLeagueId, playerId);
          const isS11Checked = getPlayerS11Status(currentLeagueId, playerId);

          // Map position values: 1=GK, 2=DEF, 3=MF, 4=FWD
          const pos = player.pos;
          const posMap = { 1: "GK", 2: "DEF", 3: "MF", 4: "FWD" };
          const posLabel = posMap[pos] || "-";

          // Construct player image URL
          const imageUrl = player.pim
            ? `https://kickbase.b-cdn.net/${player.pim}`
            : "";
          const imageHtml = imageUrl
            ? html`<img
                src="${imageUrl}"
                alt="${player.n || "Player"}"
                class="player-image"
              />`
            : "";

          // Add planned-transfer-row class if it's a planned transfer
          const rowClass = player.isPlannedTransfer
            ? "grid-row planned-transfer-row"
            : "grid-row";
          return html`
            <div class="${rowClass}">
              <div class="grid-cell cell-image">
                <div class="img-wrapper">${imageHtml}</div>
              </div>
              <div class="grid-cell checkbox-cell cell-s11">
                <input
                  type="checkbox"
                  .checked=${isS11Checked}
                  class=${`s11-toggle-${playerId}`}
                  @change=${() =>
                    togglePlayerS11Status(currentLeagueId, playerId)}
                />
              </div>
              <div class="grid-cell checkbox-cell cell-sell">
                <input
                  type="checkbox"
                  .checked=${isSellChecked}
                  class=${`sell-toggle-${playerId}`}
                  @change=${() =>
                    togglePlayerSellStatus(currentLeagueId, playerId)}
                />
              </div>
              <div
                class="grid-cell pos-cell cell-pos"
                style="color: #333; font-weight: 600;"
              >
                ${posLabel}
              </div>
              <div class="grid-cell cell-player">
                <div class="player-stack">
                  <span class="player-pills playerid-${player.i}"
                    >${getPlayerPills(player)}</span
                  >
                  <span
                    >${player.n || "Unknown"}${player.isPlannedTransfer
                      ? html`<button
                          @click=${() =>
                            removePlannedTransferAndRefresh(
                              currentLeagueId,
                              playerId,
                            )}
                          class="remove-planned-transfer-button"
                        >
                          x
                        </button>`
                      : ""}</span
                  >
                </div>
              </div>
              <div class="grid-cell currency value-cell cell-value">
                <div class="diff-value ${diffClass}">
                  ${diff > 0 ? "+" : ""}${formatCurrency(diff)}
                </div>
                ${player.isPlannedTransfer
                  ? html`<input type="number" value=${player.plannedPrice} placeholder=${player.mv} @change=${(e) => updatePlannedTransferPriceAndRefresh(currentLeagueId, playerId, e)}> </input> `
                  : html`<div class="market-value">
                      ${formatCurrency(player.mv)}
                    </div>`}
              </div>
            </div>
          `;
        },
      )}
    </div>
  `;
  render(template, container);
  // Initialize transfer planner
  initTransferPlanner(currentLeagueId);
}

// Remove a planned transfer and refresh the display
async function removePlannedTransferAndRefresh(leagueId, playerId) {
  removePlannedTransfer(leagueId, playerId);
  await loadAndDisplayData();
}

// Update a planned transfer price and update balance display
async function updatePlannedTransferPriceAndRefresh(
  leagueId,
  playerId,
  changeEvent,
) {
  const price = parseInt(changeEvent.target.value) || 0;
  updatePlannedTransferPrice(leagueId, playerId, price);
  await loadAndDisplayData();
}

// Refresh planned transfers when new one is added
async function refreshPlannedTransfers() {
  if (!currentLeagueId) return;

  try {
    // Fetch fresh planned transfer data
    const plannedTransferPlayers =
      await loadPlannedTransferPlayers(currentLeagueId);

    // Filter out existing planned transfers from currentPlayers
    const regularPlayers = currentPlayers.filter((p) => !p.isPlannedTransfer);

    // Merge planned transfers with regular players
    currentPlayers = [...plannedTransferPlayers, ...regularPlayers];

    // Re-render the display
    displayData(currentPlayers, currentBudget);
  } catch (error) {
    console.error("Error refreshing planned transfers:", error);
  }
}

document.addEventListener("refresh-planned-transfers", refreshPlannedTransfers);
document.addEventListener("render-player-table", () =>
  displayData(currentPlayers, currentBudget),
);

async function init() {
  try {
    await login();
    const leaguesData = await getLeagues();
    await showLeagueSelector(leaguesData);
  } catch (error) {
    showError(error.message);
  }
}

document.addEventListener("DOMContentLoaded", init);
