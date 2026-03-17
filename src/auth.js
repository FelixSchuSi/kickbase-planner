import {API_BASE_URL} from './app.js';
// Auth state
let authToken = localStorage.getItem('KB_TOKEN');

// Getters and setters for auth token
export function getAuthToken() {
    return authToken;
}

export function setAuthToken(token) {
    authToken = token;
    localStorage.setItem('KB_TOKEN', token);
}

export function isTokenValid() {
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

export function clearStoredAuth() {
    authToken = null;
    localStorage.removeItem('KB_TOKEN');
    localStorage.removeItem('KB_TOKEN_EXPIRE');
}

export function getCredentials() {
    const username = localStorage.getItem('KB_EMAIL') || prompt('Kickbase E-Mail eingeben:') || '';
    const password = localStorage.getItem('KB_PASSWORD') || prompt('Kickbase Passwort:') || '';
    
    return { username, password };
}

export async function login() {
    if (isTokenValid()) return;
    const { username, password } = getCredentials();
            
    if (!username || !password) {
        throw new Error('Credentials required');
    }

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
    setAuthToken(data.tkn);
    localStorage.setItem('KB_TOKEN_EXPIRE', data.tknex);
    localStorage.setItem('KB_EMAIL', username);
    localStorage.setItem('KB_PASSWORD', password);
    return;
}
