// Mobile API layer — mirrors apps/web/src/api.js but stores the JWT in Expo SecureStore.
// All calls go through the API Gateway, exactly like the web app.
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

const API_BASE =
  Constants.expoConfig?.extra?.apiBaseUrl || 'http://localhost:8080';
const TOKEN_KEY = 'tv_token';

let cachedToken = null;

export async function setToken(token) {
  cachedToken = token;
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function loadToken() {
  cachedToken = (await SecureStore.getItemAsync(TOKEN_KEY)) || null;
  return cachedToken;
}

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(cachedToken ? { Authorization: `Bearer ${cachedToken}` } : {}),
    },
    ...options,
  });
  if (res.status === 401 || res.status === 403) {
    await setToken(null);
    throw new Error('Session expired. Please sign in again.');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Request failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  login: (payload) => request('/api/v1/auth/login', { method: 'POST', body: JSON.stringify(payload) }),
  register: (payload) => request('/api/v1/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  getSnapshot: (range = 'All') => request(`/api/v1/me/snapshot?range=${range}`),
  getAccounts: () => request('/api/v1/aggregation/accounts'),
  getTransactions: () => request('/api/v1/aggregation/transactions'),
  createPlaidLinkToken: () => request('/api/v1/aggregation/link-token/create', { method: 'POST' }),
  exchangePlaidPublicToken: (publicToken) =>
    request('/api/v1/aggregation/public-token/exchange', { method: 'POST', body: JSON.stringify({ publicToken }) }),
  getRealEstate: () => request('/api/v1/real-estate'),
  getBusinessDashboard: () => request('/api/v1/business/dashboard'),
  getInsights: () => request('/api/v1/ai/insights'),
  getPaymentIntents: () => request('/api/v1/payments/bill-pay-intents'),
  getNotifications: () => request('/api/v1/notifications'),
};
