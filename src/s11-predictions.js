import { html } from "../lit-html/lit-html.js";

// Configuration
const LIGAINSIDER_WORKER_URL =
  window.location.hostname === "localhost"
    ? "http://localhost:8787/"
    : "https://li-worker.better-kickbase.workers.dev/";

// State
const kickbasePredictions = new Map(); // Stores teamId -> plpim mapping
const ligainsiderData = new Map(); // Stores teamId -> probability data

// Cache for fetched player probabilities (session-only, not persisted)
const playerProbabilityCache = new Map(); // playerId -> probability

// Set cached probability for a player
export function setCachedProbability(playerId, prob) {
  if (playerId && prob !== null && prob !== undefined) {
    playerProbabilityCache.set(playerId.toString(), prob);
  }
}

// Get cached probability for a player
export function getCachedProbability(playerId) {
  return playerProbabilityCache.get(playerId?.toString()) || null;
}

const teamLigainsiderMap = new Map([
  [2, "https://www.ligainsider.de/fc-bayern-muenchen/1/"], // Bayern
  [7, "https://www.ligainsider.de/bayer-04-leverkusen/4/"], // Leverkusen
  [4, "https://www.ligainsider.de/eintracht-frankfurt/3/"], // Frankfurt
  [3, "https://www.ligainsider.de/borussia-dortmund/14/"], // Dortmund
  [5, "https://www.ligainsider.de/sc-freiburg/18/"], // Freiburg
  [18, "https://www.ligainsider.de/1-fsv-mainz-05/17/"], // Mainz
  [43, "https://www.ligainsider.de/rb-leipzig/1311/"], // Leipzig
  [10, "https://www.ligainsider.de/sv-werder-bremen/2/"], // Bremen
  [9, "https://www.ligainsider.de/vfb-stuttgart/12/"], // Stuttgart
  [15, "https://www.ligainsider.de/borussia-moenchengladbach/5/"], // Gladbach
  [11, "https://www.ligainsider.de/vfl-wolfsburg/16/"], // Wolfsburg
  [13, "https://www.ligainsider.de/fc-augsburg/21/"], // Augsburg
  [40, "https://www.ligainsider.de/1-fc-union-berlin/1246/"], // Union Berlin
  [39, "https://www.ligainsider.de/fc-st-pauli/20/"], // St. Pauli
  [14, "https://www.ligainsider.de/tsg-hoffenheim/10/"], // Hoffenheim
  [50, "https://www.ligainsider.de/1-fc-heidenheim/1259/"], // Heidenheim
  [28, "https://www.ligainsider.de/1-fc-koeln/15/"], // Köln
  [6, "https://www.ligainsider.de/hamburger-sv/9/"], // Hamburg
]);

function getProbabilityColor(prob) {
  const colorMap = {
    1: "rgb(0, 122, 255)", // certain
    2: "rgb(0, 156, 81)", // expected
    3: "rgb(237, 135, 40)", // uncertain
    4: "rgb(255, 70, 0)", // unlikely
    5: "rgb(39, 39, 41)", // ruled out
  };
  return colorMap[prob] || "rgb(200, 200, 200)"; // default gray for unknown
}

function getProbabilityIcon(prob) {
  const iconMap = {
    1: "✦",
    2: "✔",
    3: "?",
    4: "!",
    5: "X",
  };
  return iconMap[prob] || "";
}

function getLiCategoryColor(category) {
  const colorMap = {
    certainPlayers: "rgb(0, 122, 255)",
    playersWithAlternative: "rgb(237, 135, 40)",
    playersFirstAlternative: "rgb(237, 135, 40)",
    playersSecondAlternative: "rgb(237, 135, 40)",
    playersThirdAlternative: "rgb(237, 135, 40)",
    "": "rgb(39, 39, 41)",
  };
  return colorMap[category] || "rgb(39, 39, 41)";
}

export { getLiCategoryColor };

function getLiCategoryText(category) {
  const textMap = {
    certainPlayers: "LI ✦",
    playersWithAlternative: "LI ✔ >",
    playersFirstAlternative: "< LI ?",
    playersSecondAlternative: "<< LI ?",
    playersThirdAlternative: "<<< LI ?",
    "": "LI X",
  };
  return textMap[category] || "LI X";
}

export async function fetchLigainsiderPredictions() {
  if (ligainsiderData.size > 0) return ligainsiderData;

  try {
    const response = await fetch(LIGAINSIDER_WORKER_URL);

    if (!response.ok) {
      console.warn(`Failed to fetch Ligainsider data: ${response.status}`);
      return null;
    }

    const data = await response.json();

    if (data.teams) {
      Object.entries(data.teams).forEach(([teamId, teamData]) => {
        ligainsiderData.set(parseInt(teamId), teamData);
      });
    }

    if (data.errors && Object.keys(data.errors).length > 0) {
      console.warn("Some teams failed to load:", data.errors);
    }

    return ligainsiderData;
  } catch (error) {
    console.warn("Error fetching Ligainsider data:", error);
    return null;
  }
}

function removeDiacritics(str) {
  const normalized = str.normalize("NFD");
  let result = "";

  for (const char of normalized) {
    const code = char.charCodeAt(0);
    if (code < 0x0300 || code > 0x036f) {
      result += char;
    }
  }

  return result;
}

function getPlayerLigainsiderCategory(playerName, teamId) {
  const teamData = ligainsiderData.get(parseInt(teamId));
  if (!teamData) return null;

  const normalizedName = removeDiacritics(playerName.toLowerCase().trim());

  const filter = (name) =>
    removeDiacritics(name.toLowerCase().trim()).includes(normalizedName);

  if (teamData.certainPlayers?.some(filter)) {
    return "certainPlayers";
  }
  if (teamData.playersWithAlternative?.some(filter)) {
    return "playersWithAlternative";
  }
  if (teamData.playersFirstAlternative?.some(filter)) {
    return "playersFirstAlternative";
  }
  if (teamData.playersSecondAlternative?.some(filter)) {
    return "playersSecondAlternative";
  }
  if (teamData.playersThirdAlternative?.some(filter)) {
    return "playersThirdAlternative";
  }

  return "";
}

export async function fetchKickbasePredictions(authToken, apiBaseUrl) {
  try {
    const response = await fetch(`${apiBaseUrl}/base/predictions/teams/1`, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${authToken}`,
      },
    });

    if (!response.ok) {
      console.error(`Failed to fetch team predictions: ${response.status}`);
      return;
    }

    const data = await response.json();
    kickbasePredictions.clear();

    if (data.tms) {
      data.tms.forEach((team) => {
        if (team.tid && team.plpim) {
          kickbasePredictions.set(
            team.tid,
            `https://kickbase.b-cdn.net/${team.plpim}`,
          );
        }
      });
    }
  } catch (error) {
    console.error("Error fetching team predictions:", error);
  }
}

export function getKickbasePredictionUrl(teamId) {
  return kickbasePredictions.get(teamId) || null;
}

export function getPlayerPills(player) {
  const kbPredictionUrl = kickbasePredictions.get(player.tid);
  const kbLoading = kbPredictionUrl == undefined;

  const kbPillHtml = html`
    <a href=${kbPredictionUrl} target="_blank" style="text-decoration: none;">
      <span
        class="prob-pill  ${kbLoading ? "loading" : ""}"
        style="background-color: ${getProbabilityColor(player.prob)};"
        >KB ${getProbabilityIcon(player.prob)}
      </span>
    </a>
  `;
  const ligainsiderCategory = getPlayerLigainsiderCategory(
    player.n,
    player.tid,
  );

  let liLoading = ligainsiderCategory === null;
  let liPillHtml = html` <a
    href="${teamLigainsiderMap.get(parseInt(player.tid)) || "#"}"
    target="_blank"
    style="text-decoration: none;"
  >
    <span
      class="prob-pill li-pill ${liLoading ? "loading" : ""}"
      style="background-color: ${getLiCategoryColor(ligainsiderCategory)};"
      >${getLiCategoryText(ligainsiderCategory)}
    </span>
  </a>`;

  return html`${kbPillHtml}${liPillHtml}`;
}
