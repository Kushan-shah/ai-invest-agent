/**
 * Macro Data Cache
 * 
 * Caches macroeconomic indicators (Treasury Yield, GDP, Inflation, CPI)
 * to local disk to respect Alpha Vantage's 25 calls/day limit.
 * Cache is valid for 24 hours.
 */

import fs from 'fs';
import path from 'path';
import { getAvMacroIndicator } from './alphaVantage.js';
import { getFredMacroData } from './fred.js';

// Cache file path in the workspace
const CACHE_DIR = path.join(process.cwd(), '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'macro_indicators.json');
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

// Default fallback values if both API and Cache fail
const DEFAULT_MACRO = {
  TREASURY_YIELD: 4.25, // 10-Yr Treasury yield (%)
  CPI: 3.1,            // Consumer Price Index (%)
  INFLATION: 3.0,      // Inflation rate (%)
  GDP: 2.5,            // GDP growth rate (%)
  _isDefault: true,
  updatedAt: new Date(0).toISOString()
};

/**
 * Ensures cache directory exists.
 */
function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Reads macro cache from disk.
 */
export function readMacroCache() {
  try {
    ensureCacheDir();
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf-8'));
      const age = Date.now() - new Date(data.updatedAt).getTime();
      if (age < CACHE_DURATION_MS) {
        return { valid: true, data };
      }
    }
  } catch (error) {
    console.error('Failed to read macro cache:', error.message);
  }
  return { valid: false, data: null };
}

/**
 * Writes macro cache to disk.
 */
export function writeMacroCache(data) {
  try {
    ensureCacheDir();
    fs.writeFileSync(CACHE_FILE, JSON.stringify({ ...data, _isDefault: false, updatedAt: new Date().toISOString() }, null, 2));
  } catch (error) {
    console.error('Failed to write macro cache:', error.message);
  }
}

/**
 * Get macroeconomic indicators (checks cache first, then API with fallback).
 */
export async function getMacroData() {
  const cache = readMacroCache();
  if (cache.valid) {
    return cache.data;
  }

  const indicators = { ...DEFAULT_MACRO, _isDefault: false };
  let fetchSucceeded = false;

  // 1. Try FRED (Federal Reserve Economic Data) first (120k requests/day limit)
  try {
    console.log('Fetching fresh macro indicators from FRED...');
    const fredRes = await getFredMacroData();
    if (fredRes.success && fredRes.data) {
      const { TREASURY_YIELD, CPI, INFLATION, GDP } = fredRes.data;
      if (TREASURY_YIELD !== null) indicators.TREASURY_YIELD = TREASURY_YIELD;
      if (CPI !== null) indicators.CPI = CPI;
      if (INFLATION !== null) indicators.INFLATION = INFLATION;
      if (GDP !== null) indicators.GDP = GDP;
      fetchSucceeded = true;
      console.log('Successfully fetched macro indicators from FRED.');
    } else {
      console.warn('FRED fetch failed or returned partial data:', fredRes.error);
    }
  } catch (error) {
    console.error('Error fetching macro indicators from FRED:', error.message);
  }

  // 2. Fallback to Alpha Vantage (25 requests/day limit)
  if (!fetchSucceeded) {
    try {
      console.log('Fetching fresh macro indicators from Alpha Vantage (fallback)...');
      const [yieldResult, cpiResult, inflationResult] = await Promise.all([
        getAvMacroIndicator('TREASURY_YIELD'),
        getAvMacroIndicator('CPI'),
        getAvMacroIndicator('INFLATION')
      ]);

      if (yieldResult.success && yieldResult.latestValue !== null) {
        indicators.TREASURY_YIELD = yieldResult.latestValue;
        fetchSucceeded = true;
      }
      if (cpiResult.success && cpiResult.latestValue !== null) {
        indicators.CPI = cpiResult.latestValue;
        fetchSucceeded = true;
      }
      if (inflationResult.success && inflationResult.latestValue !== null) {
        indicators.INFLATION = inflationResult.latestValue;
        fetchSucceeded = true;
      }
    } catch (error) {
      console.error('Error fetching macro indicators from Alpha Vantage:', error.message);
    }
  }

  if (fetchSucceeded) {
    writeMacroCache(indicators);
    return indicators;
  }

  // 3. If both failed, return default indicators marked as default
  console.warn('Macro fetches failed completely. Returning default macro values.');
  return { ...DEFAULT_MACRO, _isDefault: true };
}

