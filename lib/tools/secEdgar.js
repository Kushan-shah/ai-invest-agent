/**
 * SEC EDGAR XBRL API Client
 * 
 * Fetches ground-truth financial statements for US-listed companies
 * directly from SEC filings. Free, unlimited, no API key needed.
 * 
 * Endpoints:
 * - Ticker → CIK mapping: https://www.sec.gov/files/company_tickers.json
 * - Company facts: https://data.sec.gov/api/xbrl/companyfacts/CIK{padded}.json
 */

import fs from 'fs';
import path from 'path';

const USER_AGENT = 'QuorumResearch admin@quorum.dev';
const CACHE_DIR = path.join(process.cwd(), '.cache');
const TICKER_CACHE_FILE = path.join(CACHE_DIR, 'sec_tickers.json');
const TICKER_CACHE_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Ensure cache directory exists.
 */
function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/**
 * Get CIK number for a ticker symbol.
 * Fetches the SEC ticker map and caches it locally for 7 days.
 */
async function getTickerCik(ticker) {
  ensureCacheDir();

  // Check local cache first
  let tickerMap = null;
  try {
    if (fs.existsSync(TICKER_CACHE_FILE)) {
      const cached = JSON.parse(fs.readFileSync(TICKER_CACHE_FILE, 'utf-8'));
      const age = Date.now() - new Date(cached._cachedAt).getTime();
      if (age < TICKER_CACHE_DURATION_MS && cached.data) {
        tickerMap = cached.data;
      }
    }
  } catch (e) {
    // Cache read failed, will fetch fresh
  }

  // Fetch fresh if no cache
  if (!tickerMap) {
    console.log('[SEC EDGAR] Fetching ticker → CIK mapping from SEC...');
    const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
      headers: { 'User-Agent': USER_AGENT }
    });
    if (!res.ok) {
      return { success: false, error: `SEC ticker map HTTP ${res.status}` };
    }
    tickerMap = await res.json();

    // Cache to disk
    try {
      fs.writeFileSync(TICKER_CACHE_FILE, JSON.stringify({
        _cachedAt: new Date().toISOString(),
        data: tickerMap
      }));
    } catch (e) {
      console.warn('[SEC EDGAR] Failed to cache ticker map:', e.message);
    }
  }

  // Find the ticker
  const normalizedTicker = ticker.toUpperCase();
  const entry = Object.values(tickerMap).find(e => e.ticker === normalizedTicker);

  if (!entry) {
    return { success: false, error: `${ticker} not found in SEC ticker map` };
  }

  return {
    success: true,
    cik: String(entry.cik_str).padStart(10, '0'),
    companyName: entry.title
  };
}

/**
 * Extract annual values for a US-GAAP concept from company facts.
 * Deduplicates by fiscal year, taking the latest filing date per year.
 */
function extractAnnualValues(usGaap, conceptName, maxYears = 5) {
  const concept = usGaap[conceptName];
  if (!concept) return [];

  const units = concept.units || {};
  let entries = [];
  Object.values(units).forEach(arr => {
    if (Array.isArray(arr)) {
      entries = entries.concat(arr);
    }
  });

  // Filter to 10-K annual filings only
  const annualEntries = entries.filter(e => e.form === '10-K' && e.fp === 'FY');

  // Deduplicate by the year of the 'end' date, keeping the latest filed date
  const byYear = new Map();
  for (const entry of annualEntries) {
    if (!entry.end) continue;
    const year = new Date(entry.end).getFullYear();
    if (!year) continue;
    const existing = byYear.get(year);
    if (!existing || entry.filed > existing.filed) {
      byYear.set(year, entry);
    }
  }

  // Sort descending by year, take most recent N
  return Array.from(byYear.values())
    .sort((a, b) => {
      const yearA = new Date(a.end).getFullYear();
      const yearB = new Date(b.end).getFullYear();
      return yearB - yearA;
    })
    .slice(0, maxYears)
    .map(e => ({ year: new Date(e.end).getFullYear(), value: e.val }));
}

/**
 * Fetch normalized financial statements from SEC EDGAR.
 * Returns data in the same shape as other sources for easy merging.
 */
export async function getSecEdgarFinancials(ticker) {
  try {
    // Step 1: Get CIK
    const cikResult = await getTickerCik(ticker);
    if (!cikResult.success) {
      return { success: false, error: cikResult.error, incomeStatements: [], balanceSheets: [], cashFlows: [] };
    }

    console.log(`[SEC EDGAR] Fetching company facts for ${ticker} (CIK: ${cikResult.cik})...`);

    // Step 2: Fetch company facts
    const factsRes = await fetch(
      `https://data.sec.gov/api/xbrl/companyfacts/CIK${cikResult.cik}.json`,
      { headers: { 'User-Agent': USER_AGENT } }
    );

    if (!factsRes.ok) {
      return { success: false, error: `SEC EDGAR HTTP ${factsRes.status}`, incomeStatements: [], balanceSheets: [], cashFlows: [] };
    }

    const facts = await factsRes.json();
    const usGaap = facts.facts?.['us-gaap'] || {};

    // Step 3: Extract financial data with fallback concept names
    // Revenue — companies use different tags
    const revenue = extractAnnualValues(usGaap, 'Revenues').length > 0
      ? extractAnnualValues(usGaap, 'Revenues')
      : extractAnnualValues(usGaap, 'RevenueFromContractWithCustomerExcludingAssessedTax');

    const netIncome = extractAnnualValues(usGaap, 'NetIncomeLoss');
    const grossProfit = extractAnnualValues(usGaap, 'GrossProfit');
    const operatingIncome = extractAnnualValues(usGaap, 'OperatingIncomeLoss');
    const eps = extractAnnualValues(usGaap, 'EarningsPerShareDiluted');

    // Advanced XBRL mappings
    const cogs = extractAnnualValues(usGaap, 'CostOfGoodsAndServicesSold');
    const rd = extractAnnualValues(usGaap, 'ResearchAndDevelopmentExpense');
    const sga = extractAnnualValues(usGaap, 'SellingGeneralAndAdministrativeExpense');
    const da = extractAnnualValues(usGaap, 'DepreciationDepletionAndAmortization');
    const tax = extractAnnualValues(usGaap, 'IncomeTaxExpenseBenefit');
    const interest = extractAnnualValues(usGaap, 'InterestExpense');

    const totalAssets = extractAnnualValues(usGaap, 'Assets');
    const totalLiabilities = extractAnnualValues(usGaap, 'Liabilities');
    const equity = extractAnnualValues(usGaap, 'StockholdersEquity');
    const mergeConcepts = (primary, secondary) => {
      const mergedMap = new Map();
      primary.forEach(e => mergedMap.set(e.year, e.value));
      secondary.forEach(e => {
        const val = mergedMap.get(e.year) || 0;
        mergedMap.set(e.year, val + e.value);
      });
      return Array.from(mergedMap.entries()).map(([year, value]) => ({ year, value }));
    };

    const ltDebt1 = extractAnnualValues(usGaap, 'LongTermDebt');
    const ltDebt2 = extractAnnualValues(usGaap, 'LongTermDebtNoncurrent');
    const stDebt = extractAnnualValues(usGaap, 'DebtCurrent');

    const ltDebtMap = new Map();
    ltDebt2.forEach(e => ltDebtMap.set(e.year, e.value));
    ltDebt1.forEach(e => {
      if (e.value !== null && e.value !== undefined) {
        ltDebtMap.set(e.year, e.value);
      }
    });

    const debtMap = new Map();
    Array.from(ltDebtMap.entries()).forEach(([year, val]) => {
      debtMap.set(year, val);
    });
    stDebt.forEach(e => {
      const existing = debtMap.get(e.year) || 0;
      debtMap.set(e.year, existing + e.value);
    });

    const debt = Array.from(debtMap.entries()).map(([year, value]) => ({ year, value }));

    const cashEquiv = extractAnnualValues(usGaap, 'CashAndCashEquivalentsAtCarryingValue');
    const shortTermInvestments = extractAnnualValues(usGaap, 'ShortTermInvestments');
    const marketableSecurities = extractAnnualValues(usGaap, 'MarketableSecuritiesCurrent');
    
    let cashCombined = cashEquiv;
    if (shortTermInvestments.length > 0) {
      cashCombined = mergeConcepts(cashCombined, shortTermInvestments);
    }
    if (marketableSecurities.length > 0) {
      cashCombined = mergeConcepts(cashCombined, marketableSecurities);
    }
    const cash = cashCombined;

    const opCashFlow = extractAnnualValues(usGaap, 'NetCashProvidedByUsedInOperatingActivities');
    const capex = extractAnnualValues(usGaap, 'PaymentsToAcquirePropertyPlantAndEquipment');

    // Step 4: Build normalized arrays
    // Collect all years that appear in any dataset
    const allYears = new Set();
    [revenue, netIncome, totalAssets, opCashFlow].forEach(arr =>
      arr.forEach(item => allYears.add(item.year))
    );

    const getVal = (arr, year) => {
      const entry = arr.find(e => e.year === year);
      return entry ? entry.value : null;
    };

    const sortedYears = Array.from(allYears).sort((a, b) => b - a).slice(0, 5);

    const incomeStatements = sortedYears
      .map(year => {
        const rev = getVal(revenue, year);
        const ni = getVal(netIncome, year);
        const gp = getVal(grossProfit, year);
        const oi = getVal(operatingIncome, year);
        if (rev == null && ni == null) return null; // Skip if no meaningful data
        return {
          date: `${year}-12-31`,
          year,
          revenue: rev,
          netIncome: ni,
          grossProfit: gp,
          operatingIncome: oi,
          ebit: oi, // EDGAR doesn't separate EBIT from operating income for most companies
          eps: getVal(eps, year),
          cogs: getVal(cogs, year),
          researchAndDevelopment: getVal(rd, year),
          sellingGeneralAndAdmin: getVal(sga, year),
          depreciationAndAmortization: getVal(da, year),
          incomeTaxExpense: getVal(tax, year),
          interestExpense: getVal(interest, year),
          grossMargin: rev && gp ? gp / rev : null,
          operatingMargin: rev && oi ? oi / rev : null,
          netMargin: rev && ni ? ni / rev : null,
          _source: 'sec_edgar'
        };
      })
      .filter(Boolean);

    const balanceSheets = sortedYears
      .map(year => {
        const ta = getVal(totalAssets, year);
        const eq = getVal(equity, year);
        if (ta == null && eq == null) return null;
        const d = getVal(debt, year);
        return {
          date: `${year}-12-31`,
          year,
          totalAssets: ta,
          totalLiabilities: getVal(totalLiabilities, year),
          equity: eq,
          debt: d,
          cash: getVal(cash, year),
          debtToEquity: eq && d ? d / eq : null,
          _source: 'sec_edgar'
        };
      })
      .filter(Boolean);

    const cashFlows = sortedYears
      .map(year => {
        const ocf = getVal(opCashFlow, year);
        const cx = getVal(capex, year);
        if (ocf == null) return null;
        const normalizedCapex = cx != null ? -Math.abs(cx) : null;
        return {
          date: `${year}-12-31`,
          year,
          operatingCashflow: ocf,
          capex: normalizedCapex,
          freeCashflow: ocf != null && normalizedCapex != null ? ocf + normalizedCapex : null,
          _source: 'sec_edgar'
        };
      })
      .filter(Boolean);

    console.log(`[SEC EDGAR] Extracted ${incomeStatements.length} income, ${balanceSheets.length} balance, ${cashFlows.length} cash flow periods for ${ticker}.`);

    return {
      success: true,
      incomeStatements,
      balanceSheets,
      cashFlows
    };
  } catch (err) {
    console.error(`[SEC EDGAR] Error fetching ${ticker}:`, err.message);
    return { success: false, error: err.message, incomeStatements: [], balanceSheets: [], cashFlows: [] };
  }
}
