/**
 * Exchange Rate API Client
 * 
 * Normalizes non-USD financial data to USD for consistent comparison.
 * Uses open.er-api.com — completely free, no API key required.
 * 
 * Caches rates to disk for 24 hours to minimize API calls.
 */

import fs from 'fs';
import path from 'path';

const CACHE_DIR = path.join(process.cwd(), '.cache');
const RATE_CACHE_FILE = path.join(CACHE_DIR, 'exchange_rates.json');
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Ensure cache directory exists.
 */
function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Get exchange rates with caching.
 */
async function getRates() {
  ensureCacheDir();

  // Check cache
  try {
    if (fs.existsSync(RATE_CACHE_FILE)) {
      const cached = JSON.parse(fs.readFileSync(RATE_CACHE_FILE, 'utf-8'));
      const age = Date.now() - new Date(cached._cachedAt).getTime();
      if (age < CACHE_DURATION_MS && cached.rates) {
        return cached.rates;
      }
    }
  } catch (e) {
    // Cache read failed, fetch fresh
  }

  // Fetch fresh rates
  console.log('[Exchange Rate] Fetching fresh USD exchange rates...');
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) {
      console.warn(`[Exchange Rate] API returned HTTP ${res.status}`);
      return null;
    }
    const data = await res.json();
    const rates = data.rates;

    if (rates) {
      // Cache to disk
      try {
        fs.writeFileSync(RATE_CACHE_FILE, JSON.stringify({
          _cachedAt: new Date().toISOString(),
          rates
        }));
      } catch (e) {
        console.warn('[Exchange Rate] Failed to cache rates:', e.message);
      }
    }

    return rates;
  } catch (err) {
    console.error('[Exchange Rate] Fetch failed:', err.message);
    return null;
  }
}

/**
 * Get the USD conversion factor for a given currency.
 * Returns the multiplier to convert FROM the given currency TO USD.
 * 
 * Example: getExchangeRate('INR') returns ~0.0106 (1 INR = 0.0106 USD)
 * 
 * @param {string} fromCurrency - ISO currency code (e.g., 'INR', 'GBP', 'JPY')
 * @returns {Promise<number|null>} - Conversion factor to USD, or null if unavailable
 */
export async function getExchangeRate(fromCurrency) {
  if (!fromCurrency || fromCurrency.toUpperCase() === 'USD') return 1.0;

  const rates = await getRates();
  if (!rates) return null;

  const rate = rates[fromCurrency.toUpperCase()];
  if (!rate || rate === 0) return null;

  // rates are USD → foreign, so invert for foreign → USD
  return 1 / rate;
}

/**
 * Convert an amount from a given currency to USD.
 * 
 * @param {number} amount - Amount in the source currency
 * @param {string} currency - ISO currency code
 * @returns {Promise<number|null>} - Amount in USD, or null if conversion unavailable
 */
export async function convertToUSD(amount, currency) {
  if (amount == null) return null;
  if (!currency || currency.toUpperCase() === 'USD') return amount;

  const rate = await getExchangeRate(currency);
  if (rate == null) return null;

  return amount * rate;
}
