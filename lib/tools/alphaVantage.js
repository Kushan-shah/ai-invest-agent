/**
 * Alpha Vantage Data Tool
 * 
 * Fetches macroeconomic indicators and acts as a tertiary fallback for corporate financials.
 * NOTE: The free tier is limited to 25 calls/day, so use selectively and cache/degrade gracefully.
 */

const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY;
const BASE_URL = 'https://www.alphavantage.co/query';

/**
 * Helper to fetch JSON from Alpha Vantage.
 */
async function fetchAv(params = {}) {
  if (!ALPHA_VANTAGE_API_KEY) {
    return { success: false, error: 'ALPHA_VANTAGE_API_KEY not configured' };
  }

  const queryParams = new URLSearchParams({ ...params, apikey: ALPHA_VANTAGE_API_KEY }).toString();
  const url = `${BASE_URL}?${queryParams}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}: ${res.statusText}`);
    }
    const data = await res.json();
    if (data['Note'] || data['Information']) {
      // Free tier rate limit message
      throw new Error(data['Note'] || data['Information']);
    }
    return { success: true, data };
  } catch (error) {
    return { success: false, error: `Alpha Vantage fetch error: ${error.message}` };
  }
}

/**
 * Fetch Macro Economic Indicators.
 * Supported functions: GDP, CPI, INFLATION, FEDERAL_FUNDS_RATE, TREASURY_YIELD
 */
export async function getAvMacroIndicator(indicatorFunction) {
  const result = await fetchAv({ function: indicatorFunction });
  if (result.success && result.data && Array.isArray(result.data.data)) {
    // Return the latest reading
    const series = result.data.data;
    return {
      success: true,
      name: result.data.name,
      interval: result.data.interval,
      unit: result.data.unit,
      latestValue: series.length > 0 ? parseFloat(series[0].value) : null,
      data: series.slice(0, 5), // Keep top 5 readings
    };
  }
  return { success: false, error: result.error || 'Failed to fetch macro indicator' };
}

/**
 * Fetch historical financial statements as fallback.
 */
export async function getAvFinancials(ticker) {
  const [income, balance, cashFlow] = await Promise.all([
    fetchAv({ function: 'INCOME_STATEMENT', symbol: ticker }),
    fetchAv({ function: 'BALANCE_SHEET', symbol: ticker }),
    fetchAv({ function: 'CASH_FLOW', symbol: ticker }),
  ]);

  return {
    success: income.success || balance.success || cashFlow.success,
    income: income.success ? income.data : null,
    balance: balance.success ? balance.data : null,
    cashFlow: cashFlow.success ? cashFlow.data : null,
  };
}

/**
 * Fetches and standardizes financial statements from Alpha Vantage.
 */
export async function getAvNormalizedFinancials(ticker) {
  const raw = await getAvFinancials(ticker);
  if (!raw.success) {
    return { success: false, error: 'Failed to fetch raw Alpha Vantage financials', data: null };
  }

  const parseNum = (val) => {
    if (val === undefined || val === null || val === 'None' || val === '0') return null;
    const parsed = parseFloat(val);
    return isNaN(parsed) ? null : parsed;
  };

  const incomeStatements = [];
  const balanceSheets = [];
  const cashFlows = [];

  const rawIncomeReports = raw.income?.annualReports || [];
  const rawBalanceReports = raw.balance?.annualReports || [];
  const rawCashReports = raw.cashFlow?.annualReports || [];

  // Group fields by fiscal date ending
  const periods = {};

  for (const r of rawIncomeReports) {
    const date = r.fiscalDateEnding;
    if (!date) continue;
    periods[date] = periods[date] || { date };
    periods[date].income = r;
  }
  for (const r of rawBalanceReports) {
    const date = r.fiscalDateEnding;
    if (!date) continue;
    periods[date] = periods[date] || { date };
    periods[date].balance = r;
  }
  for (const r of rawCashReports) {
    const date = r.fiscalDateEnding;
    if (!date) continue;
    periods[date] = periods[date] || { date };
    periods[date].cash = r;
  }

  // Map each period to our normalized schema
  for (const date of Object.keys(periods)) {
    const p = periods[date];
    const year = new Date(date).getFullYear();

    // Income
    const ic = p.income || {};
    const rev = parseNum(ic.totalRevenue);
    const gp = parseNum(ic.grossProfit);
    const opInc = parseNum(ic.operatingIncome);
    const ni = parseNum(ic.netIncome);
    const eps = parseNum(ic.dilutedEarningsPerShare) || parseNum(ic.basicEarningsPerShare);

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
    const bs = p.balance || {};
    const assets = parseNum(bs.totalAssets);
    const equity = parseNum(bs.totalShareholderEquity) || parseNum(bs.commonStockEquity);
    const liab = parseNum(bs.totalLiabilities) || (assets !== null && equity !== null ? assets - equity : null);
    const debt = parseNum(bs.longTermDebt);
    const cash = parseNum(bs.cashAndCashEquivalentsAtCarryingValue) || parseNum(bs.cashAndShortTermInvestments);

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
    const cf = p.cash || {};
    const opCash = parseNum(cf.operatingCashflow);
    const capex = parseNum(cf.capitalExpenditures);
    const fcf = parseNum(cf.freeCashFlow) || (opCash !== null ? opCash - (capex || 0) : null);

    if (opCash !== null) {
      cashFlows.push({
        date,
        year,
        operatingCashflow: opCash,
        capitalExpenditures: capex ? -Math.abs(capex) : null,
        freeCashflow: fcf,
        dividendsPaid: parseNum(cf.dividendPayout)
      });
    }
  }

  // Sort descending by date
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

