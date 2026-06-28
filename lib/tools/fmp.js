/**
 * Financial Modeling Prep (FMP) Data Tool — Institutional Version
 * 
 * Fetches corporate fundamentals, ratios, profiles, and peers
 * using the real API v3 and v4 endpoints, wrapped with robust retries.
 */

import { withRetry } from '../utils/network.js';

const FMP_API_KEY = process.env.FMP_API_KEY;
const BASE_URL = 'https://financialmodelingprep.com/api/v3';
const V4_URL = 'https://financialmodelingprep.com/api/v4';

/**
 * Helper to fetch JSON from FMP API with retries and timeout.
 */
async function fetchFmp(endpoint, params = {}, isV4 = false) {
  if (!FMP_API_KEY) {
    return { success: false, error: 'FMP_API_KEY not configured' };
  }

  const queryParams = new URLSearchParams({ ...params, apikey: FMP_API_KEY }).toString();
  const baseUrl = isV4 ? V4_URL : BASE_URL;
  const url = `${baseUrl}/${endpoint}?${queryParams}`;

  try {
    const data = await withRetry(async () => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
      }
      const json = await res.json();
      if (json.Error || json['Error Message']) {
        // Bubble up error to retry layer if it's transient
        throw new Error(json.Error || json['Error Message']);
      }
      return json;
    }, { maxRetries: 3, baseDelay: 800, timeoutMs: 8000 });

    return { success: true, data };
  } catch (error) {
    return { success: false, error: `FMP fetch error (${endpoint}): ${error.message}` };
  }
}

/**
 * Fetch historical financial statements.
 */
export async function getFmpFinancials(ticker, limit = 4) {
  const [income, balance, cashFlow] = await Promise.all([
    fetchFmp(`income-statement/${ticker}`, { limit }),
    fetchFmp(`balance-sheet-statement/${ticker}`, { limit }),
    fetchFmp(`cash-flow-statement/${ticker}`, { limit }),
  ]);

  return {
    income: income.success ? income.data : [],
    balance: balance.success ? balance.data : [],
    cashFlow: cashFlow.success ? cashFlow.data : [],
    success: income.success || balance.success || cashFlow.success,
  };
}

/**
 * Fetch ratios and metrics.
 */
export async function getFmpRatios(ticker) {
  const [ratios, metrics] = await Promise.all([
    fetchFmp(`ratios/${ticker}`),
    fetchFmp(`key-metrics/${ticker}`),
  ]);

  return {
    success: ratios.success || metrics.success,
    ratios: ratios.success && ratios.data.length > 0 ? ratios.data[0] : null,
    metrics: metrics.success && metrics.data.length > 0 ? metrics.data[0] : null,
  };
}

/**
 * Fetch stock peers (v4).
 */
export async function getFmpPeers(ticker) {
  const result = await fetchFmp('stock_peers', { symbol: ticker }, true);
  if (result.success && Array.isArray(result.data)) {
    const peers = result.data.map(p => p.symbol);
    return { success: true, peers };
  }
  return { success: false, peers: [], error: result.error || 'Failed to get peers list' };
}

/**
 * Fetch profile.
 */
export async function getFmpProfile(ticker) {
  const result = await fetchFmp(`profile/${ticker}`);
  if (result.success && Array.isArray(result.data) && result.data.length > 0) {
    return { success: true, data: result.data[0] };
  }
  return { success: false, error: result.error || 'Profile not found' };
}
