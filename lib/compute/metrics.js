/**
 * Financial Metrics Computation Engine
 * 
 * 100% deterministic calculations. Zero LLM involvement.
 * Calculates margins, growth rates, capital returns, leverage, and cash flow quality.
 */

/**
 * Calculates YoY growth.
 */
function computeYoYGrowth(current, previous) {
  if (previous === 0 || previous === null || previous === undefined || current === null || current === undefined) return null;
  return (current - previous) / Math.abs(previous);
}

/**
 * Computes statistical trend direction for a numeric series.
 * Returns 'ACCELERATING' | 'STABLE' | 'DECELERATING' | 'FLUCTUATING'.
 */
function computeTrend(series) {
  // Filter out null/undefined values
  const cleanSeries = series.filter(x => x !== null && x !== undefined && x !== 0);
  if (cleanSeries.length < 2) return 'STABLE';
  
  // Reverse to chronological order (oldest first)
  const chrono = [...cleanSeries].reverse();
  
  let positiveDiffs = 0;
  let negativeDiffs = 0;
  let totalDiffs = chrono.length - 1;

  for (let i = 0; i < totalDiffs; i++) {
    const pctChange = (chrono[i + 1] - chrono[i]) / Math.abs(chrono[i]);
    if (pctChange > 0.01) positiveDiffs++; // >1% relative growth
    else if (pctChange < -0.01) negativeDiffs++; // >1% relative decline
  }

  if (positiveDiffs === totalDiffs) return 'ACCELERATING';
  if (negativeDiffs === totalDiffs) return 'DECELERATING';
  if (positiveDiffs > 0 && negativeDiffs > 0) return 'FLUCTUATING';
  return 'STABLE';
}

/**
 * Main metrics calculation entry point.
 */
export function calculateCompanyMetrics(normalizedData) {
  const { historical, quote } = normalizedData;
  const is = historical.incomeStatements || [];
  const bs = historical.balanceSheets || [];
  const cf = historical.cashFlows || [];

  const periods = is.length;
  if (periods === 0) {
    return { success: false, error: 'No statement periods available' };
  }

  // Current ratios/metrics (using latest statement year & quote)
  const latestIs = is[0] || {};
  const latestBs = bs[0] || {};
  const latestCf = cf[0] || {};

  const revenue = latestIs.revenue !== undefined && latestIs.revenue !== null ? latestIs.revenue : null;
  const netIncome = latestIs.netIncome !== undefined && latestIs.netIncome !== null ? latestIs.netIncome : null;
  const grossProfit = latestIs.grossProfit !== undefined && latestIs.grossProfit !== null ? latestIs.grossProfit : null;
  const operatingIncome = latestIs.operatingIncome !== undefined && latestIs.operatingIncome !== null ? latestIs.operatingIncome : null;
  const assets = latestBs.totalAssets !== undefined && latestBs.totalAssets !== null ? latestBs.totalAssets : null;
  const equity = latestBs.equity !== undefined && latestBs.equity !== null ? latestBs.equity : (latestBs.totalStockholderEquity !== undefined && latestBs.totalStockholderEquity !== null ? latestBs.totalStockholderEquity : null);
  const debt = latestBs.debt !== undefined && latestBs.debt !== null ? latestBs.debt : (latestBs.totalDebt !== undefined && latestBs.totalDebt !== null ? latestBs.totalDebt : null);
  const cash = latestBs.cash !== undefined && latestBs.cash !== null ? latestBs.cash : null;
  const hasCashFlows = cf && cf.length > 0;
  const opCash = hasCashFlows && latestCf.operatingCashflow !== undefined && latestCf.operatingCashflow !== null ? latestCf.operatingCashflow : null;
  const fcf = hasCashFlows && latestCf.freeCashflow !== undefined && latestCf.freeCashflow !== null ? latestCf.freeCashflow : null;

  // Growth rates
  const revGrowth = periods > 1 ? computeYoYGrowth(is[0].revenue, is[1].revenue) : null;
  const netIncGrowth = periods > 1 ? computeYoYGrowth(is[0].netIncome, is[1].netIncome) : null;

  // Margin history for trend analysis
  const revenueSeries = is.map(item => item.revenue);
  const netMarginSeries = is.map(item => item.netMargin);
  const debtEquitySeries = bs.map(item => item.debtToEquity || null);

  // Capital efficiency
  const roe = (equity && netIncome !== null) ? netIncome / equity : null;
  const roa = (assets && netIncome !== null) ? netIncome / assets : null;
  const ebit = latestIs.ebit !== undefined && latestIs.ebit !== null ? latestIs.ebit : operatingIncome;
  const capitalEmployed = (equity !== null && debt !== null && cash !== null) ? (equity + debt) - cash : null;
  const roce = (capitalEmployed && ebit !== null) ? ebit / capitalEmployed : roe;

  // Cash flow quality
  const cashFlowQuality = (hasCashFlows && opCash !== null && netIncome) ? opCash / Math.abs(netIncome) : null;
  const fcfYield = (hasCashFlows && fcf !== null && quote.marketCap && quote.marketCap > 0) ? fcf / quote.marketCap : null;

  return {
    success: true,
    latest: {
      revenue,
      netIncome,
      grossProfit,
      operatingIncome,
      assets,
      equity,
      debt,
      cash,
      opCash,
      fcf,
      pe: quote.pe || null,
      forwardPe: quote.forwardPe || null,
      peg: quote.pegRatio || null,
      marketCap: quote.marketCap || null,
      stockPrice: quote.price || null
    },
    ratios: {
      grossMargin: latestIs.grossMargin !== undefined && latestIs.grossMargin !== null ? latestIs.grossMargin : null,
      operatingMargin: latestIs.operatingMargin !== undefined && latestIs.operatingMargin !== null ? latestIs.operatingMargin : null,
      netMargin: latestIs.netMargin !== undefined && latestIs.netMargin !== null ? latestIs.netMargin : null,
      revenueGrowthYoY: revGrowth,
      netIncomeGrowthYoY: netIncGrowth,
      roe,
      roa,
      roce,
      debtToEquity: latestBs.debtToEquity !== undefined && latestBs.debtToEquity !== null ? latestBs.debtToEquity : (equity && debt !== null ? debt / equity : null),
      cashFlowQuality,
      fcfYield
    },
    trends: {
      revenueTrend: computeTrend(revenueSeries),
      marginTrend: computeTrend(netMarginSeries),
      leverageTrend: computeTrend(debtEquitySeries)
    }
  };
}

