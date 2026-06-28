/**
 * Finnhub Data Tool
 * 
 * Fetches real-time quotes, price targets, analyst ratings, and corporate event data.
 */

import { withRetry } from '../utils/network.js';

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const BASE_URL = 'https://finnhub.io/api/v1';

/**
 * Helper to fetch JSON from Finnhub API.
 */
async function fetchFinnhub(path, params = {}) {
  if (!FINNHUB_API_KEY) {
    return { success: false, error: 'FINNHUB_API_KEY not configured' };
  }

  const queryParams = new URLSearchParams({ ...params, token: FINNHUB_API_KEY }).toString();
  const url = `${BASE_URL}/${path}?${queryParams}`;

  try {
    const data = await withRetry(async () => {
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
      }
      return await res.json();
    }, { maxRetries: 4, baseDelay: 1000, timeoutMs: 10000 }); // Finnhub can be strict on free tier

    return { success: true, data };
  } catch (error) {
    return { success: false, error: `Finnhub fetch error (${path}): ${error.message}` };
  }
}

/**
 * Fetch current real-time quote.
 * Returns: c (current price), d (change), dp (percent change), h (high), l (low), o (open), pc (previous close), t (timestamp)
 */
export async function getFinnhubQuote(ticker) {
  const result = await fetchFinnhub('quote', { symbol: ticker });
  if (result.success && result.data) {
    const d = result.data;
    // Map to friendly names
    return {
      success: true,
      data: {
        price: d.c,
        change: d.d,
        changePercent: d.dp,
        high: d.h,
        low: d.l,
        open: d.o,
        previousClose: d.pc,
        timestamp: d.t,
      }
    };
  }
  return { success: false, error: result.error || 'Failed to fetch quote' };
}

/**
 * Fetch analyst recommendations.
 */
export async function getFinnhubRecommendations(ticker) {
  const result = await fetchFinnhub('stock/recommendation', { symbol: ticker });
  if (result.success && Array.isArray(result.data)) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error || 'Failed to fetch recommendations' };
}

/**
 * Fetch analyst price target.
 */
export async function getFinnhubPriceTarget(ticker) {
  const result = await fetchFinnhub('stock/price-target', { symbol: ticker });
  if (result.success && result.data) {
    return {
      success: true,
      data: {
        targetHigh: result.data.targetHigh,
        targetLow: result.data.targetLow,
        targetMean: result.data.targetMean,
        targetMedian: result.data.targetMedian,
      }
    };
  }
  return { success: false, error: result.error || 'Failed to fetch price target' };
}

/**
 * Fetch basic financials / company profile from Finnhub as fallback.
 */
export async function getFinnhubBasicFinancials(ticker) {
  const result = await fetchFinnhub('stock/metric', { symbol: ticker, metric: 'all' });
  if (result.success && result.data) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error || 'Failed to fetch basic financials' };
}

/**
 * Fetch reported financials from Finnhub (from SEC filings).
 * Calls `/stock/financials-reported?symbol=${ticker}&freq=annual`
 */
export async function getFinnhubReportedFinancials(ticker) {
  const result = await fetchFinnhub('stock/financials-reported', { symbol: ticker, freq: 'annual' });
  if (!result.success || !result.data || !Array.isArray(result.data.data)) {
    return { success: false, error: result.error || 'Failed to fetch reported financials', data: null };
  }

  const reports = result.data.data.filter(r => r.form === '10-K');
  if (reports.length === 0) {
    return { success: false, error: 'No 10-K annual reports found', data: null };
  }

  const findVal = (list = [], tags = []) => {
    for (const tag of tags) {
      const match = list.find(c => c.concept === tag || c.concept === `us-gaap_${tag}` || c.concept === `ifrs-full_${tag}`);
      if (match && match.value !== undefined) {
        return parseFloat(match.value);
      }
    }
    return null;
  };

  const incomeStatements = [];
  const balanceSheets = [];
  const cashFlows = [];

  for (const r of reports) {
    const year = parseInt(r.year);
    const date = r.endDate;
    const ic = r.report?.ic || [];
    const bs = r.report?.bs || [];
    const cf = r.report?.cf || [];

    // Income
    const rev = findVal(ic, ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'SalesRevenueGoodsNet', 'Revenue']);
    const gp = findVal(ic, ['GrossProfit']);
    const opInc = findVal(ic, ['OperatingIncomeLoss']);
    const ni = findVal(ic, ['NetIncomeLoss', 'NetIncomeLossAvailableToCommonStockholdersBasic']);
    const eps = findVal(ic, ['EarningsPerShareDiluted', 'EarningsPerShareBasic']);

    if (rev !== null || ni !== null) {
      incomeStatements.push({
        date,
        year,
        totalRevenue: rev,
        grossProfit: gp,
        operatingIncome: opInc,
        netIncome: ni,
        ebit: opInc,
        grossMargin: rev && gp ? gp / rev : null,
        operatingMargin: rev && opInc ? opInc / rev : null,
        netMargin: rev && ni ? ni / rev : null,
        eps
      });
    }

    // Balance
    const assets = findVal(bs, ['Assets']);
    const equity = findVal(bs, ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest']);
    const liab = findVal(bs, ['Liabilities']) || (assets !== null && equity !== null ? assets - equity : null);
    const debt = findVal(bs, ['LongTermDebt', 'LongTermDebtNoncurrent', 'ShortTermBorrowings']);
    const cash = findVal(bs, ['CashAndCashEquivalentsAtCarryingValue', 'Cash']);

    if (assets !== null || equity !== null) {
      balanceSheets.push({
        date,
        year,
        totalAssets: assets,
        totalLiabilities: liab,
        totalStockholderEquity: equity,
        totalDebt: debt,
        cash,
        shortTermInvestments: null,
        debtToEquity: equity && debt ? debt / equity : null
      });
    }

    // Cash Flow
    const opCash = findVal(cf, ['NetCashProvidedByUsedInOperatingActivities']);
    const capex = findVal(cf, ['PaymentsToAcquirePropertyPlantAndEquipment', 'CapitalExpenditures']);
    const fcf = opCash !== null ? opCash - (capex || 0) : null;

    if (opCash !== null) {
      cashFlows.push({
        date,
        year,
        operatingCashflow: opCash,
        capitalExpenditures: capex ? -Math.abs(capex) : null,
        freeCashflow: fcf,
        dividendsPaid: findVal(cf, ['PaymentsOfDividendsCommonStock', 'DividendsPaid'])
      });
    }
  }

  // Sort descending by year
  incomeStatements.sort((a, b) => b.year - a.year);
  balanceSheets.sort((a, b) => b.year - a.year);
  cashFlows.sort((a, b) => b.year - a.year);

  return {
    success: incomeStatements.length > 0,
    data: {
      ticker,
      incomeStatements,
      balanceSheets,
      cashFlows,
      periodsAvailable: incomeStatements.length,
      fetchedAt: new Date().toISOString()
    }
  };
}

/**
 * Fetch Insider Sentiment (Monthly Share Purchase Ratio and Net Buying)
 */
export async function getInsiderSentiment(ticker) {
  // Fetch from the start of the previous year to now to get sufficient context
  const fromDate = new Date();
  fromDate.setFullYear(fromDate.getFullYear() - 1);
  const fromStr = fromDate.toISOString().split('T')[0];
  const toStr = new Date().toISOString().split('T')[0];

  const result = await fetchFinnhub('stock/insider-sentiment', { 
    symbol: ticker,
    from: fromStr,
    to: toStr
  });

  if (result.success && result.data && result.data.data) {
    return {
      success: true,
      data: result.data.data // array of monthly { year, month, change, mspr }
    };
  }
  return { success: false, error: 'No insider sentiment found', data: [] };
}

/**
 * Fetch raw Insider Transactions (Form 4 Filings)
 */
export async function getInsiderTransactions(ticker) {
  const result = await fetchFinnhub('stock/insider-transactions', { 
    symbol: ticker
  });

  if (result.success && result.data && result.data.data) {
    return {
      success: true,
      data: result.data.data // array of transaction objects
    };
  }
  return { success: false, error: 'No insider transactions found', data: [] };
}
