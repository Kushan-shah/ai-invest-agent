/**
 * FRED (Federal Reserve Economic Data) API Client
 * 
 * Fetches macroeconomic indicators (Treasury Yield, GDP, CPI, Inflation)
 * using the Federal Reserve's API.
 * Free, stable, and supports up to 120,000 requests/day per API key.
 */

const FRED_API_KEY = process.env.FRED_API_KEY;
const BASE_URL = 'https://api.stlouisfed.org/fred/series/observations';

/**
 * Fetch a series from FRED.
 */
async function fetchFredSeries(seriesId, limit = 50) {
  if (!FRED_API_KEY) {
    return { success: false, error: 'FRED_API_KEY not configured' };
  }
  const url = `${BASE_URL}?series_id=${seriesId}&api_key=${FRED_API_KEY}&file_type=json&sort_order=desc&limit=${limit}`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    if (data.error_message) {
      throw new Error(data.error_message);
    }
    return { success: true, observations: data.observations };
  } catch (error) {
    return { success: false, error: `FRED fetch error for ${seriesId}: ${error.message}` };
  }
}

/**
 * Fetches all core macroeconomic indicators.
 * 
 * Series used:
 * - TREASURY_YIELD: DGS10 (10-Year Treasury Constant Maturity Rate - Daily)
 * - CPI: CPIAUCSL (Consumer Price Index for All Urban Consumers - Monthly)
 * - INFLATION: Calculated YoY from CPIAUCSL, fallback to FPCPITOTLZGUSA (Annual Inflation)
 * - GDP: A191RL1A225NBEA (Real GDP Percent Change from Preceding Period - Annual)
 */
export async function getFredMacroData() {
  if (!FRED_API_KEY) {
    return { success: false, error: 'FRED_API_KEY not configured' };
  }
  
  try {
    const results = {
      TREASURY_YIELD: null,
      CPI: null,
      INFLATION: null,
      GDP: null
    };

    // Run fetches in parallel
    const [yieldRes, cpiRes, gdpRes] = await Promise.all([
      fetchFredSeries('DGS10', 10),
      fetchFredSeries('CPIAUCSL', 15),
      fetchFredSeries('A191RL1A225NBEA', 5)
    ]);

    // 1. Process 10-Yr Treasury Yield
    if (yieldRes.success && yieldRes.observations) {
      const validObs = yieldRes.observations.find(obs => obs.value !== '.');
      if (validObs) {
        results.TREASURY_YIELD = parseFloat(validObs.value);
      }
    }

    // 2. Process CPI & YoY Inflation
    if (cpiRes.success && cpiRes.observations && cpiRes.observations.length >= 13) {
      const latestObs = cpiRes.observations[0];
      const yearAgoObs = cpiRes.observations[12]; // 12 months ago
      if (latestObs && latestObs.value !== '.' && yearAgoObs && yearAgoObs.value !== '.') {
        results.CPI = parseFloat(latestObs.value);
        const latestVal = parseFloat(latestObs.value);
        const yearAgoVal = parseFloat(yearAgoObs.value);
        results.INFLATION = parseFloat(((latestVal - yearAgoVal) / yearAgoVal * 100).toFixed(2));
      }
    }

    // Fallback for Inflation if CPI calculation failed
    if (results.INFLATION === null) {
      const annualInflationRes = await fetchFredSeries('FPCPITOTLZGUSA', 5);
      if (annualInflationRes.success && annualInflationRes.observations) {
        const validObs = annualInflationRes.observations.find(obs => obs.value !== '.');
        if (validObs) {
          results.INFLATION = parseFloat(validObs.value);
        }
      }
    }

    // 3. Process GDP Growth Rate
    if (gdpRes.success && gdpRes.observations) {
      const validObs = gdpRes.observations.find(obs => obs.value !== '.');
      if (validObs) {
        results.GDP = parseFloat(validObs.value);
      }
    }

    const success = results.TREASURY_YIELD !== null || results.CPI !== null || results.INFLATION !== null || results.GDP !== null;

    return {
      success,
      data: results,
      error: success ? null : 'All FRED indicator fetches returned empty/null data'
    };
  } catch (error) {
    return { success: false, error: `FRED macro data fetch failed: ${error.message}` };
  }
}
