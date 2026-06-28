import { fetchCompleteFinancialData, searchCompany, getHistoricalFinancialsFTS, getQuote, getFinancialStats, getCompanyProfile } from './yahooFinance.js';
import { getFmpFinancials, getFmpRatios, getFmpProfile, getFmpPeers } from './fmp.js';
import { getFinnhubQuote, getFinnhubRecommendations, getFinnhubPriceTarget, getFinnhubReportedFinancials, getInsiderSentiment, getInsiderTransactions } from './finnhub.js';
import { getMacroData } from './macroCache.js';
import { search } from './webSearch.js';
import { geminiFlash } from '../utils/llm.js';
import { getSecEdgarFinancials } from './secEdgar.js';
import { getExchangeRate } from './exchangeRate.js';
import { getAvNormalizedFinancials } from './alphaVantage.js';

/**
 * Helper to normalize currency codes.
 */
function normalizeCurrency(currency) {
  if (!currency) return 'USD';
  return currency.toUpperCase();
}

/**
 * Check if a ticker is US-listed or International.
 */
function isInternationalTicker(ticker) {
  const normalized = ticker.toUpperCase();
  // If ticker has a dot and does not end with .US, it is international
  return normalized.includes('.') && !normalized.endsWith('.US');
}

/**
 * Convert financial statement rows to USD based on the exchange rate factor.
 */
function scaleStatements(statements, multiplier) {
  if (!statements || multiplier === 1.0) {
    return statements;
  }
  
  const scaled = {
    incomeStatements: (statements.incomeStatements || []).map(s => ({ ...s })),
    balanceSheets: (statements.balanceSheets || []).map(b => ({ ...b })),
    cashFlows: (statements.cashFlows || []).map(c => ({ ...c }))
  };

  const scaleField = (stmt, fields) => {
    fields.forEach(f => {
      if (stmt[f] !== null && stmt[f] !== undefined) {
        stmt[f] = stmt[f] * multiplier;
      }
    });
  };

  scaled.incomeStatements.forEach(s => {
    scaleField(s, ['revenue', 'grossProfit', 'operatingIncome', 'netIncome', 'ebit']);
    s.grossMargin = s.revenue && s.grossProfit !== null && s.grossProfit !== undefined ? s.grossProfit / s.revenue : null;
    s.operatingMargin = s.revenue && s.operatingIncome !== null && s.operatingIncome !== undefined ? s.operatingIncome / s.revenue : null;
    s.netMargin = s.revenue && s.netIncome !== null && s.netIncome !== undefined ? s.netIncome / s.revenue : null;
  });

  scaled.balanceSheets.forEach(s => {
    scaleField(s, ['totalAssets', 'totalLiabilities', 'equity', 'debt', 'cash']);
    s.debtToEquity = s.equity && s.debt !== null && s.debt !== undefined ? s.debt / s.equity : null;
  });

  scaled.cashFlows.forEach(s => {
    scaleField(s, ['operatingCashflow', 'capex', 'freeCashflow']);
  });

  return scaled;
}

/**
 * Standardize historical statement rows.
 * Prioritizes FTS/EDGAR ground-truth and merges FMP as tertiary fallback.
 */
function normalizeHistoricalData(yfData, fmpData) {
  const normalized = {
    incomeStatements: [],
    balanceSheets: [],
    cashFlows: []
  };

  const getYearFromDate = (date) => {
    if (!date) return null;
    const y = new Date(date).getFullYear();
    return isNaN(y) ? null : y;
  };

  // 1. Process Income Statement
  const yfIncome = yfData?.historical?.incomeStatements || [];
  const fmpIncome = fmpData?.income || [];
  const incomeMap = new Map();

  for (const item of yfIncome) {
    const year = getYearFromDate(item.date);
    if (!year) continue;
    incomeMap.set(year, {
      date: item.date,
      year,
      revenue: item.totalRevenue !== undefined && item.totalRevenue !== null ? item.totalRevenue : null,
      netIncome: item.netIncome !== undefined && item.netIncome !== null ? item.netIncome : null,
      grossProfit: item.grossProfit !== undefined && item.grossProfit !== null ? item.grossProfit : null,
      operatingIncome: item.operatingIncome !== undefined && item.operatingIncome !== null ? item.operatingIncome : null,
      ebit: item.ebit !== undefined && item.ebit !== null ? item.ebit : null,
      eps: item.dilutedEps || item.eps || item.basicEps || null
    });
  }

  for (const item of fmpIncome) {
    const year = getYearFromDate(item.date) || (item.calendarYear ? parseInt(item.calendarYear) : null);
    if (!year) continue;
    const existing = incomeMap.get(year) || { date: item.date, year };
    incomeMap.set(year, {
      date: existing.date || item.date,
      year,
      revenue: item.revenue !== undefined && item.revenue !== null ? item.revenue : (existing.revenue !== undefined ? existing.revenue : null),
      netIncome: item.netIncome !== undefined && item.netIncome !== null ? item.netIncome : (existing.netIncome !== undefined ? existing.netIncome : null),
      grossProfit: item.grossProfit !== undefined && item.grossProfit !== null ? item.grossProfit : (existing.grossProfit !== undefined ? existing.grossProfit : null),
      operatingIncome: item.operatingIncome !== undefined && item.operatingIncome !== null ? item.operatingIncome : (existing.operatingIncome !== undefined ? existing.operatingIncome : null),
      ebit: item.ebit !== undefined && item.ebit !== null ? item.ebit : (existing.ebit !== undefined ? existing.ebit : null),
      eps: item.eps || item.epsdiluted || existing.eps || null
    });
  }

  normalized.incomeStatements = Array.from(incomeMap.values()).map(item => ({
    ...item,
    eps: item.eps,
    grossMargin: item.revenue && item.grossProfit !== null && item.grossProfit !== undefined ? item.grossProfit / item.revenue : null,
    operatingMargin: item.revenue && item.operatingIncome !== null && item.operatingIncome !== undefined ? item.operatingIncome / item.revenue : null,
    netMargin: item.revenue && item.netIncome !== null && item.netIncome !== undefined ? item.netIncome / item.revenue : null
  }));

  // 2. Process Balance Sheet
  const yfBalance = yfData?.historical?.balanceSheets || [];
  const fmpBalance = fmpData?.balance || [];
  const balanceMap = new Map();

  for (const item of yfBalance) {
    const year = getYearFromDate(item.date);
    if (!year) continue;
    balanceMap.set(year, {
      date: item.date,
      year,
      totalAssets: item.totalAssets !== undefined && item.totalAssets !== null ? item.totalAssets : null,
      totalLiabilities: item.totalLiabilities !== undefined && item.totalLiabilities !== null ? item.totalLiabilities : null,
      equity: item.totalStockholderEquity !== undefined && item.totalStockholderEquity !== null ? item.totalStockholderEquity : (item.equity !== undefined && item.equity !== null ? item.equity : null),
      debt: item.totalDebt !== undefined && item.totalDebt !== null ? item.totalDebt : (item.debt !== undefined && item.debt !== null ? item.debt : null),
      cash: item.cash !== undefined && item.cash !== null ? item.cash : null,
    });
  }

  for (const item of fmpBalance) {
    const year = getYearFromDate(item.date) || (item.calendarYear ? parseInt(item.calendarYear) : null);
    if (!year) continue;
    const existing = balanceMap.get(year) || { date: item.date, year };
    balanceMap.set(year, {
      date: existing.date || item.date,
      year,
      totalAssets: item.totalAssets !== undefined && item.totalAssets !== null ? item.totalAssets : (existing.totalAssets !== undefined ? existing.totalAssets : null),
      totalLiabilities: item.totalLiabilities !== undefined && item.totalLiabilities !== null ? item.totalLiabilities : (existing.totalLiabilities !== undefined ? existing.totalLiabilities : null),
      equity: item.equity !== undefined && item.equity !== null ? item.equity : (existing.equity !== undefined ? existing.equity : null),
      debt: item.debt !== undefined && item.debt !== null ? item.debt : (existing.debt !== undefined ? existing.debt : null),
      cash: item.cash !== undefined && item.cash !== null ? item.cash : (existing.cash !== undefined ? existing.cash : null),
    });
  }

  normalized.balanceSheets = Array.from(balanceMap.values()).map(item => ({
    ...item,
    debtToEquity: item.equity && item.debt !== null && item.debt !== undefined ? item.debt / item.equity : null
  }));

  // 3. Process Cash Flows
  const yfCash = yfData?.historical?.cashFlows || [];
  const fmpCash = fmpData?.cashFlow || [];
  const cashMap = new Map();

  for (const item of yfCash) {
    const year = getYearFromDate(item.date);
    if (!year) continue;
    const capex = item.capitalExpenditures !== undefined && item.capitalExpenditures !== null ? item.capitalExpenditures : null;
    const normalizedCapex = capex !== null ? (capex < 0 ? capex : -capex) : null;
    cashMap.set(year, {
      date: item.date,
      year,
      operatingCashflow: item.operatingCashflow !== undefined && item.operatingCashflow !== null ? item.operatingCashflow : null,
      capex: normalizedCapex,
      freeCashflow: item.freeCashflow !== undefined && item.freeCashflow !== null ? item.freeCashflow : null,
    });
  }

  for (const item of fmpCash) {
    const year = getYearFromDate(item.date) || (item.calendarYear ? parseInt(item.calendarYear) : null);
    if (!year) continue;
    const existing = cashMap.get(year) || { date: item.date, year };

    const capex = item.capitalExpenditures !== undefined && item.capitalExpenditures !== null ? item.capitalExpenditures : (existing.capex !== undefined ? existing.capex : null);
    const normalizedCapex = capex !== null && capex !== undefined ? (capex < 0 ? capex : -capex) : null;
    const operatingCashflow = item.operatingCashFlow !== undefined && item.operatingCashFlow !== null ? item.operatingCashFlow : (existing.operatingCashflow !== undefined ? existing.operatingCashflow : null);

    let freeCashflow = item.freeCashFlow !== undefined && item.freeCashFlow !== null ? item.freeCashFlow : (existing.freeCashflow !== undefined ? existing.freeCashflow : null);
    if (freeCashflow === null || freeCashflow === undefined) {
      if (operatingCashflow !== null && normalizedCapex !== null) {
        freeCashflow = operatingCashflow + normalizedCapex;
      }
    }

    cashMap.set(year, {
      date: existing.date || item.date,
      year,
      operatingCashflow,
      capex: normalizedCapex,
      freeCashflow,
    });
  }

  normalized.cashFlows = Array.from(cashMap.values());

  // Sort periods so latest is first
  normalized.incomeStatements.sort((a, b) => b.year - a.year);
  normalized.balanceSheets.sort((a, b) => b.year - a.year);
  normalized.cashFlows.sort((a, b) => b.year - a.year);

  return normalized;
}

/**
 * Merge secondary financial statements into primary target statements.
 */
function mergeStatements(primary, secondary, sourceName, provenanceSet) {
  const merged = {
    incomeStatements: [...primary.incomeStatements],
    balanceSheets: [...primary.balanceSheets],
    cashFlows: [...primary.cashFlows]
  };

  const mergeArray = (target, source, key = 'year') => {
    if (!source || !Array.isArray(source)) return;
    source.forEach(srcItem => {
      const matchIdx = target.findIndex(t => t[key] === srcItem[key]);
      if (matchIdx >= 0) {
        let updated = false;
        Object.keys(srcItem).forEach(field => {
          if (target[matchIdx][field] === null || target[matchIdx][field] === undefined || target[matchIdx][field] === 0) {
            if (srcItem[field] !== null && srcItem[field] !== undefined && srcItem[field] !== 0) {
              target[matchIdx][field] = srcItem[field];
              updated = true;
            }
          }
        });
        if (updated) provenanceSet.add(sourceName);
      } else {
        target.push({ ...srcItem });
        provenanceSet.add(sourceName);
      }
    });
  };

  mergeArray(merged.incomeStatements, secondary.incomeStatements);
  mergeArray(merged.balanceSheets, secondary.balanceSheets);
  mergeArray(merged.cashFlows, secondary.cashFlows);

  // Sort descending by year
  merged.incomeStatements.sort((a, b) => b.year - a.year);
  merged.balanceSheets.sort((a, b) => b.year - a.year);
  merged.cashFlows.sort((a, b) => b.year - a.year);

  return merged;
}

/**
 * Detects if core gaps are present in the financials.
 */
function hasGaps(statements) {
  const minYears = 3;
  if (statements.incomeStatements.length < minYears || 
      statements.balanceSheets.length < minYears || 
      statements.cashFlows.length < minYears) {
    return true;
  }

  // Check if any critical fields in recent years are missing or zero
  const recentIncome = statements.incomeStatements.slice(0, minYears);
  const recentBalance = statements.balanceSheets.slice(0, minYears);
  const recentCashFlow = statements.cashFlows.slice(0, minYears);

  const missingIncome = recentIncome.some(item => !item.revenue || item.revenue === 0 || !item.netIncome || item.netIncome === 0);
  const missingBalance = recentBalance.some(item => item.totalAssets === null || item.totalAssets === undefined || item.equity === null || item.equity === undefined);
  const missingCash = recentCashFlow.some(item => item.operatingCashflow === null || item.operatingCashflow === undefined);

  return missingIncome || missingBalance || missingCash;
}

/**
 * Verify data sufficiency checklist.
 */
function runSufficiencyGateway(normalizedData) {
  const issues = [];

  // Required properties check
  if (!normalizedData.quote.price) issues.push('Current Price is missing');
  if (normalizedData.historical.incomeStatements.length < 3) {
    issues.push(`Insufficient income statements: found ${normalizedData.historical.incomeStatements.length}, need 3`);
  } else {
    const recentRev = normalizedData.historical.incomeStatements[0]?.revenue;
    if (!recentRev || recentRev === 0) {
      issues.push('Recent revenue is zero or missing');
    }
  }

  if (normalizedData.historical.balanceSheets.length < 3) {
    issues.push(`Insufficient balance sheets: found ${normalizedData.historical.balanceSheets.length}, need 3`);
  }

  if (normalizedData.historical.cashFlows.length < 3) {
    issues.push(`Insufficient cash flows: found ${normalizedData.historical.cashFlows.length}, need 3`);
  }

  const overallCompleteness = issues.length === 0 ? 1.0 : Math.max(0.1, 1 - (issues.length * 0.15));

  return {
    passed: issues.length === 0,
    completenessScore: overallCompleteness,
    issues
  };
}

/**
 * Fetch and build the complete normalized financial data bundle.
 */
export async function getNormalizedFinancialData(ticker) {
  console.log(`Starting multi-source collection for: ${ticker}`);

  const isIntl = isInternationalTicker(ticker);
  const provenanceSet = new Set();

  // 1. Fetch profile, quotes, targets, stats, macro in parallel
  const [fmpProfile, fhQuote, yfQuoteRes, yfStatsRes, yfProfileRes, fhRecs, fhPriceTarget, macroData, insiderSentiment, insiderTransactions] = await Promise.all([
    getFmpProfile(ticker),
    getFinnhubQuote(ticker),
    getQuote(ticker),
    getFinancialStats(ticker),
    getCompanyProfile(ticker),
    getFinnhubRecommendations(ticker),
    getFinnhubPriceTarget(ticker),
    getMacroData(),
    getInsiderSentiment(ticker),
    getInsiderTransactions(ticker)
  ]);

  // Try to search Yahoo Finance for profiles if FMP fails
  const yfSearchResult = await searchCompany(ticker);
  const profileName = yfSearchResult.success && yfSearchResult.data?.[0]?.name;

  const yfQuote = yfQuoteRes.success ? yfQuoteRes.data : {};
  const yfStats = yfStatsRes.success ? yfStatsRes.data : {};
  const yfProfile = yfProfileRes.success ? yfProfileRes.data : {};

  const profile = {
    ticker,
    name: profileName || fmpProfile.data?.companyName || ticker,
    sector: fmpProfile.data?.sector || yfProfile.sector || 'Unknown',
    industry: fmpProfile.data?.industry || yfProfile.industry || 'Unknown',
    exchange: fmpProfile.data?.exchange || yfQuote.exchange || 'Unknown',
    currency: normalizeCurrency(yfQuote.financialCurrency || fmpProfile.data?.currency || yfQuote.currency || (ticker.endsWith('.NS') || ticker.endsWith('.BO') ? 'INR' : 'USD')),
    description: fmpProfile.data?.description || yfProfile.description || '',
    website: fmpProfile.data?.website || yfProfile.website || '',
    employees: fmpProfile.data?.fullTimeEmployees || yfProfile.employees || null,
  };

  const quoteCurrency = normalizeCurrency(yfQuote.currency || fmpProfile.data?.currency || 'USD');
  
  // Calculate price to use for fallback computations
  const finalPrice = (fhQuote.success && fhQuote.data.price) ? fhQuote.data.price : (yfQuote.currentPrice || null);
  
  const quote = {
    price: finalPrice,
    change: (fhQuote.success && fhQuote.data.change !== null) ? fhQuote.data.change : (yfQuote.dayChange || null),
    changePercent: (fhQuote.success && fhQuote.data.changePercent !== null) ? fhQuote.data.changePercent : (yfQuote.dayChangePercent || null),
    previousClose: (fhQuote.success && fhQuote.data.previousClose !== null) ? fhQuote.data.previousClose : (yfQuote.previousClose || null),
    currency: quoteCurrency,
    financialCurrency: profile.currency,
    sharesOutstanding: yfQuote.sharesOutstanding || yfStats.sharesOutstanding || fmpProfile.data?.sharesOutstanding || ( (yfQuote.marketCap || fmpProfile.data?.mCap) && finalPrice ? Math.floor((yfQuote.marketCap || fmpProfile.data?.mCap) / finalPrice) : null ),
    marketCap: yfQuote.marketCap || 
               fmpProfile.data?.mCap || 
               ((yfQuote.sharesOutstanding || yfStats.sharesOutstanding || fmpProfile.data?.sharesOutstanding) && finalPrice 
                 ? (yfQuote.sharesOutstanding || yfStats.sharesOutstanding || fmpProfile.data?.sharesOutstanding) * finalPrice 
                 : null) || 
               null,
    pe: yfQuote.trailingPE || yfStats.trailingPE || null,
    forwardPe: yfQuote.forwardPE || yfStats.forwardPE || null,
    eps: yfQuote.eps || null,
    pegRatio: yfStats.pegRatio || null,
    priceToBook: yfQuote.priceToBook || yfStats.priceToBook || null,
    beta: yfQuote.beta || yfStats.beta || null
  };


  // 2. Fetch Tier 1 Historical Statements
  let historical = { incomeStatements: [], balanceSheets: [], cashFlows: [] };

  const financialCurrency = normalizeCurrency(yfQuote.financialCurrency || fmpProfile.data?.currency || yfQuote.currency || (ticker.endsWith('.NS') || ticker.endsWith('.BO') ? 'INR' : 'USD'));
  const usdToLocalRate = financialCurrency !== 'USD' ? (1.0 / (await getExchangeRate(financialCurrency))) : 1.0;

  const unpack = (res) => {
    if (!res || !res.success) return { incomeStatements: [], balanceSheets: [], cashFlows: [] };
    if (res.data) return res.data;
    return res;
  };

  if (!isIntl) {
    // US Tier 1: SEC EDGAR + Yahoo FTS
    console.log('[Tier 1] Fetching US sources: SEC EDGAR & Yahoo FTS...');
    const [secRes, ftsRes] = await Promise.all([
      getSecEdgarFinancials(ticker),
      getHistoricalFinancialsFTS(ticker)
    ]);

    const secData = unpack(secRes);
    const ftsData = unpack(ftsRes); // Yahoo FTS is already in USD for US stocks

    if (secRes.success && secData.incomeStatements.length > 0) {
      provenanceSet.add('SEC EDGAR');
      historical = secData;
    }
    if (ftsRes.success && ftsData.incomeStatements.length > 0) {
      if (provenanceSet.size === 0) {
        provenanceSet.add('Yahoo FTS');
        historical = ftsData;
      } else {
        historical = mergeStatements(historical, ftsData, 'Yahoo FTS', provenanceSet);
      }
    }
  } else {
    // Intl Tier 1: Yahoo FTS + FMP
    console.log('[Tier 1] Fetching Intl sources: Yahoo FTS & FMP...');
    const [ftsRes, fmpRes] = await Promise.all([
      getHistoricalFinancialsFTS(ticker),
      getFmpFinancials(ticker)
    ]);

    // Yahoo FTS and FMP both typically return native currency for international stocks
    const ftsData = unpack(ftsRes);
    const fmpData = fmpRes.success ? normalizeHistoricalData(null, fmpRes.data) : { incomeStatements: [], balanceSheets: [], cashFlows: [] };

    if (ftsRes.success && ftsData.incomeStatements.length > 0) {
      provenanceSet.add('Yahoo FTS');
      historical = ftsData;
    }
    if (fmpRes.success && fmpData.incomeStatements.length > 0) {
      if (provenanceSet.size === 0) {
        provenanceSet.add('FMP');
        historical = fmpData;
      } else {
        historical = mergeStatements(historical, fmpData, 'FMP', provenanceSet);
      }
    }
  }

  // 3. Tier 2 fallback if gaps found
  if (hasGaps(historical)) {
    console.log(`[Tier 2] Gaps detected. Attempting fallbacks (Finnhub & Alpha Vantage)...`);
    const [fhRes, avRes] = await Promise.all([
      getFinnhubReportedFinancials(ticker),
      getAvNormalizedFinancials(ticker)
    ]);

    // Finnhub is from SEC, so always USD. We must convert it to local currency if this is an intl stock
    const fhData = scaleStatements(unpack(fhRes), usdToLocalRate);
    
    // Alpha Vantage returns in USD typically if not requested natively, so we scale it.
    const avData = scaleStatements(unpack(avRes), usdToLocalRate);

    if (fhRes.success && fhData.incomeStatements.length > 0) {
      historical = mergeStatements(historical, fhData, 'Finnhub', provenanceSet);
    }
    if (avRes.success && avData.incomeStatements.length > 0) {
      historical = mergeStatements(historical, avData, 'Alpha Vantage', provenanceSet);
    }
  }

  // 4. Tier 3 aggressive web search fallback
  if (hasGaps(historical)) {
    console.log(`[Tier 3] Gaps still exist. Triggering aggressive self-heal search...`);
    const rawSearchData = await fetchMissingFinancialsFromWebSearch(ticker, historical, financialCurrency);
    historical = rawSearchData;
    provenanceSet.add('Web Scrape');
  }

  // Fallback for TTM quotes and stats using Yahoo FTS latest year if missing
  if (historical.incomeStatements.length > 0) {
    const latestInc = historical.incomeStatements[0];
    if (!quote.eps) quote.eps = latestInc.eps || (latestInc.netIncome && quote.sharesOutstanding ? latestInc.netIncome / quote.sharesOutstanding : null);
    if (!quote.pe && quote.price && quote.eps) quote.pe = quote.price / quote.eps;
  }

  // 5. Currency Normalization for Quote & Profile
  profile.currency = financialCurrency;
  
  // Note: We no longer scale quote.price and quote.marketCap to USD.
  // We keep them in the native currency to match the historical statements.
  let analystTargets = {
    targetHigh: fhPriceTarget.success ? fhPriceTarget.data.targetHigh : null,
    targetLow: fhPriceTarget.success ? fhPriceTarget.data.targetLow : null,
    targetMean: fhPriceTarget.success ? fhPriceTarget.data.targetMean : null,
    targetMedian: fhPriceTarget.success ? fhPriceTarget.data.targetMedian : null,
    upside: null,
    recommendations: fhRecs.success ? fhRecs.data : []
  };

  if (fhPriceTarget.success && fhPriceTarget.data) {
    // If Finnhub targets are in USD, we must scale them to local currency for international stocks
    if (usdToLocalRate !== 1.0) {
      if (analystTargets.targetMean) analystTargets.targetMean = analystTargets.targetMean * usdToLocalRate;
      if (analystTargets.targetHigh) analystTargets.targetHigh = analystTargets.targetHigh * usdToLocalRate;
      if (analystTargets.targetLow) analystTargets.targetLow = analystTargets.targetLow * usdToLocalRate;
      if (analystTargets.targetMedian) analystTargets.targetMedian = analystTargets.targetMedian * usdToLocalRate;
    }
    analystTargets.upside = (analystTargets.targetMean && quote.price) ? (analystTargets.targetMean - quote.price) / quote.price : null;
  }

  // 6. Data Confidence Assessment
  let dataConfidence = 'HIGH';
  if (hasGaps(historical)) {
    dataConfidence = 'LOW';
  } else if (provenanceSet.has('Alpha Vantage') || provenanceSet.has('Web Scrape')) {
    dataConfidence = 'MEDIUM';
  }



  // --- Dynamic Competitor Peer Resolution ---
  const resolvedPeers = [];
  try {
    let peerSymbols = [];
    const isFinancial = profile.sector.toLowerCase().includes('financial') || profile.industry.toLowerCase().includes('bank');
    const isTech = profile.sector.toLowerCase().includes('tech') || profile.industry.toLowerCase().includes('semiconductor');
    const isHealthcare = profile.sector.toLowerCase().includes('health') || profile.industry.toLowerCase().includes('pharm');
    const isAuto = profile.industry.toLowerCase().includes('auto');

    if (process.env.FMP_API_KEY) {
      const fmpPeersRes = await getFmpPeers(ticker);
      if (fmpPeersRes.success && fmpPeersRes.peers && fmpPeersRes.peers.length > 0) {
        peerSymbols = fmpPeersRes.peers
          .filter(p => p.toUpperCase() !== ticker.toUpperCase() && !p.includes('.'))
          .slice(0, 4);
      }
    }

    if (peerSymbols.length === 0) {
      let fallbacks = [];
      if (isFinancial) fallbacks = ['JPM', 'BAC', 'WFC', 'C'];
      else if (isTech) fallbacks = ['AAPL', 'MSFT', 'GOOG', 'NVDA', 'META'];
      else if (isHealthcare) fallbacks = ['JNJ', 'LLY', 'NVO', 'MRK'];
      else if (isAuto) fallbacks = ['TSLA', 'F', 'GM', 'TM'];
      else fallbacks = ['MSFT', 'GOOG', 'LLY', 'AAPL']; // General fallback

      peerSymbols = fallbacks
        .filter(p => p.toUpperCase() !== ticker.toUpperCase())
        .slice(0, 3);
    }

    console.log(`[Peers Resolution] Resolving dynamic metrics for peers of ${ticker}: ${peerSymbols.join(', ')}`);

    const peerFetches = peerSymbols.map(async (sym) => {
      try {
        const [qRes, sRes] = await Promise.all([
          getQuote(sym),
          getFinancialStats(sym)
        ]);

        if (qRes.success && qRes.data) {
          const q = qRes.data;
          const s = sRes.success && sRes.data ? sRes.data : {};
          
          return {
            ticker: sym,
            name: q.name || sym,
            pe: s.trailingPE || q.trailingPE || null,
            peg: s.pegRatio || null,
            evRev: s.enterpriseToRevenue || null,
            netMargin: s.profitMargin !== undefined ? s.profitMargin : null,
            de: s.debtToEquity ? s.debtToEquity / 100 : null,
            roe: s.returnOnEquity !== undefined ? s.returnOnEquity : null,
            growth: s.revenueGrowth !== undefined ? s.revenueGrowth : null
          };
        }
      } catch (err) {
        console.warn(`[Peers Resolution] Failed to fetch peer ${sym}:`, err.message);
      }
      return null;
    });

    const results = await Promise.all(peerFetches);
    results.forEach(r => {
      if (r) resolvedPeers.push(r);
    });
  } catch (peerErr) {
    console.error(`[Peers Resolution] Critical error during peer resolution:`, peerErr);
  }

  const normalizedBundle = {
    profile,
    quote,
    analystTargets,
    historical,
    macro: macroData,
    insiderTrading: {
      sentiment: insiderSentiment.success ? insiderSentiment.data : [],
      transactions: insiderTransactions.success ? insiderTransactions.data : []
    },
    peers: resolvedPeers,
    dataConfidence,
    dataProvenance: Array.from(provenanceSet),
    fetchedAt: new Date().toISOString()
  };

  const gateway = {
    ...runSufficiencyGateway(normalizedBundle),
    dataConfidence,
    dataProvenance: Array.from(provenanceSet)
  };

  return {
    success: true,
    data: normalizedBundle,
    gateway
  };
}

/**
 * Aggressively searches the web for income statements, balance sheets, and cash flow statements
 * to fill gaps in database returns.
 */
export async function fetchMissingFinancialsFromWebSearch(ticker, currentHistorical, targetCurrency) {
  try {
    const query = `${ticker} financial statements "income statement" "balance sheet" "cash flow statement" FY2023 FY2024 FY2025`;
    const searchRes = await search(query, { searchDepth: 'advanced', maxResults: 5 });

    if (!searchRes.success || searchRes.data.length === 0) {
      console.warn(`[Agent: Aggressive Search] Fallback search yielded no web results.`);
      return currentHistorical;
    }

    const context = searchRes.data.map(r => `Source: ${r.url}\nContent: ${r.content}`).join('\n\n');

    const prompt = `You are an expert financial analyst agent.
Extract the historical financial statement figures for FY2025, FY2024, and FY2023 for stock ticker ${ticker} from the search results below.

Search Results:
${context}

Rules:
1. Extract numbers as raw numbers in ${targetCurrency} (e.g. 10.5 Billion becomes 10500000000, 250M becomes 250000000).
2. For the Income Statement, extract: revenue, netIncome, grossProfit, operatingIncome, ebit, eps.
3. For the Balance Sheet, extract: totalAssets, totalLiabilities, equity, debt, cash.
4. For the Cash Flow Statement, extract: operatingCashflow, capex (positive absolute value), freeCashflow.
5. If freeCashflow is not stated, calculate it as: Free Cash Flow = Operating Cash Flow - Capex.
6. Return a valid JSON object ONLY. Do not write markdown blocks or explanations.
JSON Format:
{
  "incomeStatements": [
    { "year": 2025, "revenue": 1000000000, "netIncome": 150000000, "grossProfit": 400000000, "operatingIncome": 200000000, "ebit": 200000000, "eps": 1.50 },
    ...
  ],
  "balanceSheets": [
    { "year": 2025, "totalAssets": 2000000000, "totalLiabilities": 800000000, "equity": 1200000000, "debt": 300000000, "cash": 500000000 },
    ...
  ],
  "cashFlows": [
    { "year": 2025, "operatingCashflow": 250000000, "capex": 50000000, "freeCashflow": 200000000 },
    ...
  ]
}`;

    const modelResponse = await geminiFlash.invoke([{ role: 'user', content: prompt }]);
    const cleanText = modelResponse.content.trim().replace(/```json/g, '').replace(/```/g, '').trim();
    const extracted = JSON.parse(cleanText);

    const merged = {
      incomeStatements: [...currentHistorical.incomeStatements],
      balanceSheets: [...currentHistorical.balanceSheets],
      cashFlows: [...currentHistorical.cashFlows]
    };

    // Helper to merge statement arrays
    const mergeStatementsLocal = (targetArray, sourceArray, keyExtractor, mapper) => {
      if (!sourceArray || !Array.isArray(sourceArray)) return;
      sourceArray.forEach(item => {
        const year = parseInt(item.year);
        if (!year) return;
        const existingIdx = targetArray.findIndex(x => x.year === year);
        
        // Map source item
        const mapped = mapper(item, year, existingIdx >= 0 ? targetArray[existingIdx] : {});
        
        if (existingIdx >= 0) {
          // Update missing fields in existing record
          targetArray[existingIdx] = { ...targetArray[existingIdx], ...mapped };
        } else {
          // Push new record
          targetArray.push(mapped);
        }
      });
    };

    // Merge Income Statements
    mergeStatementsLocal(merged.incomeStatements, extracted.incomeStatements, x => x.year, (item, year, existing) => {
      const revenue = item.revenue !== undefined && item.revenue !== null ? item.revenue : (existing.revenue !== undefined ? existing.revenue : null);
      const netIncome = item.netIncome !== undefined && item.netIncome !== null ? item.netIncome : (existing.netIncome !== undefined ? existing.netIncome : null);
      const grossProfit = item.grossProfit !== undefined && item.grossProfit !== null ? item.grossProfit : (existing.grossProfit !== undefined ? existing.grossProfit : null);
      const operatingIncome = item.operatingIncome !== undefined && item.operatingIncome !== null ? item.operatingIncome : (existing.operatingIncome !== undefined ? existing.operatingIncome : null);
      const ebit = item.ebit !== undefined && item.ebit !== null ? item.ebit : (existing.ebit !== undefined ? existing.ebit : null);
      return {
        date: existing.date || `${year}-12-31`,
        year,
        revenue,
        netIncome,
        grossProfit,
        operatingIncome,
        ebit,
        eps: item.eps || existing.eps || null,
        grossMargin: revenue && grossProfit !== null && grossProfit !== undefined ? grossProfit / revenue : null,
        operatingMargin: revenue && operatingIncome !== null && operatingIncome !== undefined ? operatingIncome / revenue : null,
        netMargin: revenue && netIncome !== null && netIncome !== undefined ? netIncome / revenue : null
      };
    });

    // Merge Balance Sheets
    mergeStatementsLocal(merged.balanceSheets, extracted.balanceSheets, x => x.year, (item, year, existing) => {
      const totalAssets = item.totalAssets !== undefined && item.totalAssets !== null ? item.totalAssets : (existing.totalAssets !== undefined ? existing.totalAssets : null);
      const totalLiabilities = item.totalLiabilities !== undefined && item.totalLiabilities !== null ? item.totalLiabilities : (existing.totalLiabilities !== undefined ? existing.totalLiabilities : null);
      const equity = item.equity !== undefined && item.equity !== null ? item.equity : (existing.equity !== undefined ? existing.equity : null);
      const debt = item.debt !== undefined && item.debt !== null ? item.debt : (existing.debt !== undefined ? existing.debt : null);
      const cash = item.cash !== undefined && item.cash !== null ? item.cash : (existing.cash !== undefined ? existing.cash : null);
      return {
        date: existing.date || `${year}-12-31`,
        year,
        totalAssets,
        totalLiabilities,
        equity,
        debt,
        cash,
        debtToEquity: equity && debt !== null && debt !== undefined ? debt / equity : null
      };
    });

    // Merge Cash Flows
    mergeStatementsLocal(merged.cashFlows, extracted.cashFlows, x => x.year, (item, year, existing) => {
      const capex = item.capex !== undefined && item.capex !== null ? -Math.abs(item.capex) : (existing.capex !== undefined && existing.capex !== null ? existing.capex : null);
      const operatingCashflow = item.operatingCashflow !== undefined && item.operatingCashflow !== null ? item.operatingCashflow : (existing.operatingCashflow !== undefined && existing.operatingCashflow !== null ? existing.operatingCashflow : null);
      let freeCashflow = item.freeCashflow !== undefined && item.freeCashflow !== null ? item.freeCashflow : (existing.freeCashflow !== undefined && existing.freeCashflow !== null ? existing.freeCashflow : null);
      if (freeCashflow === null && operatingCashflow !== null && capex !== null) {
        freeCashflow = operatingCashflow + capex;
      }
      return {
        date: existing.date || `${year}-12-31`,
        year,
        operatingCashflow,
        capex,
        freeCashflow
      };
    });

    // Sort descending
    merged.incomeStatements.sort((a, b) => b.year - a.year);
    merged.balanceSheets.sort((a, b) => b.year - a.year);
    merged.cashFlows.sort((a, b) => b.year - a.year);

    return merged;
  } catch (err) {
    console.error(`[Agent: Aggressive Search] fetchMissingFinancialsFromWebSearch error:`, err);
  }
  return currentHistorical;
}
