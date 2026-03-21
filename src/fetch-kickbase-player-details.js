import { API_BASE_URL } from './app.js';
import { getAuthToken } from './auth.js';

export async function fetchKickbasePlayerDetails(leagueId, playerId) {
  try {
    const response = await fetch(`${API_BASE_URL}/leagues/${leagueId}/players/${playerId}`, {
      headers: {
        'Accept': 'application/json',
        'Authorization': `Bearer ${getAuthToken()}`
      }
    });
    
    if (!response.ok) {
      console.error(`Failed to fetch player details: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching player details:', error);
    return null;
  }
}
