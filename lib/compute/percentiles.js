/**
 * Relative Sector Percentile Calculator
 * 
 * Compares company metrics against actual sector peers (fetched from FMP)
 * or falls back to pre-defined sector medians if peer data is unavailable.
 */

import { getFmpPeers, getFmpRatios } from '../tools/fmp.js';

// Pre-computed Sector Medians (Deterministic fallbacks)
const SECTOR_BENCHMARKS = {
  'Technology': { pe: 32, netMargin: 0.15, revenueGrowth: 0.18, debtToEquity: 0.25, roe: 0.12 },
  'Consumer Cyclical': { pe: 18, netMargin: 0.06, revenueGrowth: 0.06, debtToEquity: 0.80, roe: 0.10 },
  'Financial Services': { pe: 12, netMargin: 0.18, revenueGrowth: 0.04, debtToEquity: 1.50, roe: 0.11 },
  'Healthcare': { pe: 24, netMargin: 0.10, revenueGrowth: 0.08, debtToEquity: 0.40, roe: 0.08 },
  'Energy': { pe: 8, netMargin: 0.12, revenueGrowth: 0.03, debtToEquity: 0.60, roe: 0.14 },
  'Industrials': { pe: 16, netMargin: 0.07, revenueGrowth: 0.05, debtToEquity: 0.50, roe: 0.09 },
  'Basic Materials': { pe: 14, netMargin: 0.08, revenueGrowth: 0.04, debtToEquity: 0.45, roe: 0.10 },
  'Real Estate': { pe: 20, netMargin: 0.10, revenueGrowth: 0.05, debtToEquity: 1.20, roe: 0.06 },
  'Utilities': { pe: 15, netMargin: 0.09, revenueGrowth: 0.03, debtToEquity: 1.40, roe: 0.08 },
  'Consumer Defensive': { pe: 20, netMargin: 0.05, revenueGrowth: 0.04, debtToEquity: 0.70, roe: 0.15 },
  'Communication Services': { pe: 22, netMargin: 0.12, revenueGrowth: 0.07, debtToEquity: 0.50, roe: 0.12 },
  'Default': { pe: 18, netMargin: 0.10, revenueGrowth: 0.06, debtToEquity: 0.60, roe: 0.10 }
};

/**
 * Calculates a percentile score (1 to 100) of a value against a peer list.
 * lowerIsBetter = true is used for metrics like P/E or Debt/Equity.
 */
function calculatePercentile(value, peerValues, lowerIsBetter = false) {
  if (value === null || value === undefined || peerValues.length === 0) return 50;

  const validPeers = peerValues.filter(v => v !== null && v !== undefined && !isNaN(v));
  if (validPeers.length === 0) return 50;

  // Add the target company value to the set for comparison
  const sorted = [...validPeers, value].sort((a, b) => a - b);
  const index = sorted.indexOf(value);

  const rawPercentile = (index / (sorted.length - 1)) * 100;
  const percentile = lowerIsBetter ? 100 - rawPercentile : rawPercentile;

  return Math.round(Math.max(1, Math.min(100, percentile)));
}

/**
 * Assigns descriptive position categories based on percentile.
 */
export function getPercentileLabel(percentile) {
  if (percentile > 80) return 'WELL_ABOVE_MEDIAN';
  if (percentile > 60) return 'ABOVE_MEDIAN';
  if (percentile >= 40) return 'AT_MEDIAN';
  if (percentile > 20) return 'BELOW_MEDIAN';
  return 'WELL_BELOW_MEDIAN';
}

/**
 * Calculates median of an array. Falls back to fallback if array is empty.
 */
function getMedian(arr, fallback) {
  const valid = arr.filter(v => v !== null && v !== undefined && !isNaN(v));
  if (valid.length === 0) return fallback;
  const sorted = [...valid].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Fetch peer metrics and compute percentiles.
 */
export async function computeSectorPercentiles(ticker, companyMetrics, sectorName) {
  const normalizedSector = SECTOR_BENCHMARKS[sectorName] ? sectorName : 'Default';
  const benchmarks = SECTOR_BENCHMARKS[normalizedSector];

  const results = {
    pe: { value: companyMetrics.latest.pe, percentile: 50, label: 'AT_MEDIAN', sectorMedian: benchmarks.pe },
    netMargin: { value: companyMetrics.ratios.netMargin, percentile: 50, label: 'AT_MEDIAN', sectorMedian: benchmarks.netMargin },
    revenueGrowth: { value: companyMetrics.ratios.revenueGrowthYoY, percentile: 50, label: 'AT_MEDIAN', sectorMedian: benchmarks.revenueGrowth },
    debtToEquity: { value: companyMetrics.ratios.debtToEquity, percentile: 50, label: 'AT_MEDIAN', sectorMedian: benchmarks.debtToEquity },
    roe: { value: companyMetrics.ratios.roe, percentile: 50, label: 'AT_MEDIAN', sectorMedian: benchmarks.roe },
    source: 'Benchmark Dictionary'
  };

  // Limit FMP peer lookups to 5 peers to conserve API calls
  try {
    console.log(`Fetching peers for: ${ticker}`);
    const peersResult = await getFmpPeers(ticker);

    if (peersResult.success && peersResult.peers.length > 0) {
      const topPeers = peersResult.peers.slice(0, 5);
      console.log(`Benchmarking against top peers: ${topPeers.join(', ')}`);

      // Fetch ratios for peers in parallel
      const peerRatiosResults = await Promise.all(
        topPeers.map(p => getFmpRatios(p))
      );

      const peerData = peerRatiosResults
        .filter(r => r.success && r.ratios)
        .map(r => r.ratios);

      if (peerData.length > 0) {
        // Collect peer arrays
        const peList = peerData.map(d => d.peRatioTTM).filter(Boolean);
        const marginList = peerData.map(d => d.netProfitMarginTTM).filter(Boolean);
        const revGrowthList = peerData.map(d => d.revenueGrowthYoYTTM || d.revenueGrowthTTM).filter(v => v !== undefined);
        const deList = peerData.map(d => d.debtToEquityTTM).filter(v => v !== undefined);
        const roeList = peerData.map(d => d.returnOnEquityTTM).filter(Boolean);

        // Compute relative percentiles
        results.pe.percentile = calculatePercentile(companyMetrics.latest.pe, peList, true);
        results.pe.sectorMedian = getMedian(peList, benchmarks.pe);

        results.netMargin.percentile = calculatePercentile(companyMetrics.ratios.netMargin, marginList, false);
        results.netMargin.sectorMedian = getMedian(marginList, benchmarks.netMargin);

        results.revenueGrowth.percentile = calculatePercentile(companyMetrics.ratios.revenueGrowthYoY, revGrowthList, false);
        results.revenueGrowth.sectorMedian = getMedian(revGrowthList, benchmarks.revenueGrowth);

        results.debtToEquity.percentile = calculatePercentile(companyMetrics.ratios.debtToEquity, deList, true);
        results.debtToEquity.sectorMedian = getMedian(deList, benchmarks.debtToEquity);

        results.roe.percentile = calculatePercentile(companyMetrics.ratios.roe, roeList, false);
        results.roe.sectorMedian = getMedian(roeList, benchmarks.roe);

        results.source = 'Live FMP Peers';

        // Apply labels
        Object.keys(results).forEach(key => {
          if (results[key] && results[key].percentile !== undefined) {
            results[key].label = getPercentileLabel(results[key].percentile);
          }
        });

        return results;
      }
    }
  } catch (err) {
    console.warn(`Peer calculation failed: ${err.message}. Falling back to default benchmarks.`);
  }

  // Fallback calculations using Sector Benchmarks
  console.log(`Using pre-computed sector benchmarks for: ${normalizedSector}`);
  
  // Synthesize pseudo-peer sets using benchmark as median (benchmarks * 0.5, * 1.0, * 1.5)
  // this gives a smooth distribution centered on the sector benchmark
  const mockPeers = (median, lowerIsBetter = false) => {
    return [median * 0.5, median * 0.8, median * 1.0, median * 1.2, median * 1.5];
  };

  results.pe.percentile = calculatePercentile(companyMetrics.latest.pe, mockPeers(benchmarks.pe), true);
  results.netMargin.percentile = calculatePercentile(companyMetrics.ratios.netMargin, mockPeers(benchmarks.netMargin), false);
  results.revenueGrowth.percentile = calculatePercentile(companyMetrics.ratios.revenueGrowthYoY, mockPeers(benchmarks.revenueGrowth), false);
  results.debtToEquity.percentile = calculatePercentile(companyMetrics.ratios.debtToEquity, mockPeers(benchmarks.debtToEquity), true);
  results.roe.percentile = calculatePercentile(companyMetrics.ratios.roe, mockPeers(benchmarks.roe), false);

  Object.keys(results).forEach(key => {
    if (results[key] && results[key].percentile !== undefined) {
      results[key].label = getPercentileLabel(results[key].percentile);
    }
  });

  return results;
}
