import { fetchKickbasePlayerDetails } from "./fetch-kickbase-player-details.js";

// State registry - will be populated by app.js
let state = {
  get currentPlayers() {
    return [];
  },
  get currentLeagueId() {
    return null;
  },
  get currentBudget() {
    return 0;
  },
};

// Register state getters from app.js
export function registerPlannedTransferState(stateGetters) {
  state = stateGetters;
}

// Get the localStorage key for planned transfers of a league
function getPlannedTransfersKey(leagueId) {
  return `planned_transfers_${leagueId}`;
}

// Add a planned transfer to localStorage
export function addPlannedTransfer(leagueId, playerId, price) {
  const key = getPlannedTransfersKey(leagueId);
  const existing = JSON.parse(localStorage.getItem(key) || "[]");

  // Check if already exists
  if (existing.some((t) => t.playerId === playerId)) {
    console.log("Player already in planned transfers");
    return false;
  }
  existing.push({
    playerId: playerId.toString(),
    price: price || 0,
    timestamp: Date.now(),
  });

  localStorage.setItem(key, JSON.stringify(existing));
  return true;
}

// Get planned transfers from localStorage (returns array of { playerId, price, timestamp })
export function getPlannedTransfers(leagueId) {
  const key = getPlannedTransfersKey(leagueId);
  return JSON.parse(localStorage.getItem(key) || "[]");
}

// Remove a planned transfer from localStorage
export function removePlannedTransfer(leagueId, playerId) {
  const key = getPlannedTransfersKey(leagueId);
  const existing = JSON.parse(localStorage.getItem(key) || "[]");

  const filtered = existing.filter((t) => t.playerId !== playerId.toString());

  localStorage.setItem(key, JSON.stringify(filtered));
  return true;
}

// Update the price of a planned transfer
export function updatePlannedTransferPrice(leagueId, playerId, newPrice) {
  const key = getPlannedTransfersKey(leagueId);
  const existing = JSON.parse(localStorage.getItem(key) || "[]");

  const transfer = existing.find((t) => t.playerId === playerId.toString());
  if (transfer) {
    transfer.price = newPrice;
    localStorage.setItem(key, JSON.stringify(existing));
    return true;
  }
  return false;
}

// Calculate total cost of all planned transfers
export function calculatePlannedTransfersCost(leagueId) {
  const transfers = getPlannedTransfers(leagueId);
  return transfers.reduce((sum, t) => sum + (t.price || 0), 0);
}

// Load planned transfers and fetch fresh player details from API
export async function loadPlannedTransferPlayers(leagueId) {
  const transfers = getPlannedTransfers(leagueId);
  if (transfers.length === 0) return [];

  const players = [];

  for (const transfer of transfers) {
    const playerData = await fetchKickbasePlayerDetails(
      leagueId,
      transfer.playerId,
    );
    if (playerData) {
      // Add isPlannedTransfer flag and store the planned price
      playerData.isPlannedTransfer = true;
      playerData.plannedPrice = transfer.price;
      players.push(playerData);
    }
  }

  players.forEach((p) => (p["n"] = p.ln));

  return players;
}
