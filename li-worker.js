const teamLigainsiderMap = new Map([
  [2, "https://www.ligainsider.de/fc-bayern-muenchen/1/"],
  [7, "https://www.ligainsider.de/bayer-04-leverkusen/4/"],
  [4, "https://www.ligainsider.de/eintracht-frankfurt/3/"],
  [3, "https://www.ligainsider.de/borussia-dortmund/14/"],
  [5, "https://www.ligainsider.de/sc-freiburg/18/"],
  [18, "https://www.ligainsider.de/1-fsv-mainz-05/17/"],
  [43, "https://www.ligainsider.de/rb-leipzig/1311/"],
  [10, "https://www.ligainsider.de/sv-werder-bremen/2/"],
  [9, "https://www.ligainsider.de/vfb-stuttgart/12/"],
  [15, "https://www.ligainsider.de/borussia-moenchengladbach/5/"],
  [11, "https://www.ligainsider.de/vfl-wolfsburg/16/"],
  [13, "https://www.ligainsider.de/fc-augsburg/21/"],
  [40, "https://www.ligainsider.de/1-fc-union-berlin/1246/"],
  [39, "https://www.ligainsider.de/fc-st-pauli/20/"],
  [14, "https://www.ligainsider.de/tsg-hoffenheim/10/"],
  [50, "https://www.ligainsider.de/1-fc-heidenheim/1259/"],
  [28, "https://www.ligainsider.de/1-fc-koeln/15/"],
  [6, "https://www.ligainsider.de/hamburger-sv/9/"]
]);

class PlayerNameCollector {
  constructor() {
    this.playerNames = [];
    this.currentText = "";
  }

  text(text) {
    this.currentText += text.text;
    if (text.lastInTextNode) {
      const trimmed = this.currentText.trim();
      if (trimmed) {
        this.playerNames.push(trimmed.toLocaleLowerCase());
      }
      this.currentText = "";
    }
  }
}

async function getPlayers(response) {
  // Parse HTML and extract player names
  const certainPlayers = new PlayerNameCollector();
  const playersWithAlternative = new PlayerNameCollector();
  const playersFirstAlternative = new PlayerNameCollector();
  const playersSecondAlternative = new PlayerNameCollector();
  const playersThirdAlternative = new PlayerNameCollector();

  const certainPlayersRewriter = new HTMLRewriter()
    .on(".player_position_column > .player_name > a", certainPlayers);
  await certainPlayersRewriter.transform(response.clone()).arrayBuffer();
  
  const playersWithAlternativeRewriter = new HTMLRewriter()
    .on(".sub_child:nth-child(1) > .player_name > a", playersWithAlternative);
  await playersWithAlternativeRewriter.transform(response.clone()).arrayBuffer();
  
  const playersFirstAlternativeRewriter = new HTMLRewriter()
    .on(".sub_child:nth-child(2) > .player_name > a", playersFirstAlternative);
  await playersFirstAlternativeRewriter.transform(response.clone()).arrayBuffer();
  
  const playersSecondAlternativeRewriter = new HTMLRewriter()
    .on(".sub_child:nth-child(3) > .player_name > a", playersSecondAlternative);
  await playersSecondAlternativeRewriter.transform(response.clone()).arrayBuffer();

  const playersThirdAlternativeRewriter = new HTMLRewriter()
    .on(".sub_child:nth-child(4) > .player_name > a", playersThirdAlternative);
  await playersThirdAlternativeRewriter.transform(response.clone()).arrayBuffer();

  return {
      certainPlayers: certainPlayers.playerNames,
      playersWithAlternative: playersWithAlternative.playerNames,
      playersFirstAlternative: playersFirstAlternative.playerNames,
      playersSecondAlternative: playersSecondAlternative.playerNames,
      playersThirdAlternative: playersThirdAlternative.playerNames
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Extract team ID from path (e.g., /2 or /2/)
    const match = path.match(/^\/(\d+)\/?$/);
    if (!match) {
      return new Response("Invalid path. Use /{teamId}", { status: 400 });
    }
    
    const teamId = parseInt(match[1], 10);
    const ligainsiderUrl = teamLigainsiderMap.get(teamId);
    
    if (!ligainsiderUrl) {
      return new Response(`Team ID ${teamId} not found`, { status: 404 });
    }
    
    try {
      const response = await fetch(ligainsiderUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
      });
      
      if (!response.ok) {
        return new Response(`Failed to fetch from Ligainsider: ${response.status}`, { 
          status: response.status 
        });
      }
      
      const result = await getPlayers(response);
      
      return new Response(JSON.stringify(result), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*"
        }
      });
    } catch (error) {
      return new Response(`Error fetching data: ${error.message}`, { status: 500 });
    }
  }
};
