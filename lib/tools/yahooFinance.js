/**
 * Yahoo Finance Data Tool
 * 
 * Fetches comprehensive financial data for any publicly traded company.
 * This is a PURE DATA tool — no LLM involvement, no interpretation.
 * All numbers come directly from Yahoo Finance API.
 * 
 * Capabilities:
 * - Company search & identification (ticker lookup)
 * - Current quote data (price, P/E, market cap, etc.)
 * - Company profile (sector, industry, description)
 * - Historical financial data (revenue, income, margins over time)
 * - Key statistics (valuation, profitability, balance sheet)
 */

import YahooFinance from 'yahoo-finance2';
import { withRetry } from '../utils/network.js';

const yahooFinance = new YahooFinance();

/**
 * Search for a company by name and return matching ticker symbols.
 * Used in Node [1]: Company Identification
 * 
 * @param {string} query - Company name (e.g., "Tesla", "Reliance Industries")
 * @returns {Array} - List of matching companies with ticker, name, exchange, type
 */
export async function searchCompany(query) {
  try {
    const results = await withRetry(() => yahooFinance.search(query, {
      newsCount: 0,
      quotesCount: 8,
    }), { domain: 'yahoo' });

    if (!results.quotes || results.quotes.length === 0) {
      return { success: false, error: 'No companies found', data: [] };
    }

    const companies = results.quotes
      .filter(q => q.isYahooFinance && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF'))
      .map(q => ({
        ticker: q.symbol,
        name: q.shortname || q.longname || q.symbol,
        exchange: q.exchange || 'Unknown',
        quoteType: q.quoteType,
        score: q.score || 0,
      }));

    return { success: true, data: companies };
  } catch (error) {
    return { success: false, error: `Search failed: ${error.message}`, data: [] };
  }
}

/**
 * Fetch current quote data for a ticker.
 * Returns: price, P/E, market cap, 52-week range, volume, dividend yield, EPS, etc.
 * 
 * @param {string} ticker - Stock ticker symbol (e.g., "TSLA", "RELIANCE.NS")
 * @returns {Object} - Current quote data
 */
export async function getQuote(ticker) {
  try {
    const quote = await withRetry(() => yahooFinance.quote(ticker), { domain: 'yahoo' });

    return {
      success: true,
      data: {
        ticker: quote.symbol,
        name: quote.shortName || quote.longName,
        currency: quote.currency,
        financialCurrency: quote.financialCurrency || null,
        exchange: quote.fullExchangeName || quote.exchange,

        // Price data
        currentPrice: quote.regularMarketPrice,
        previousClose: quote.regularMarketPreviousClose,
        dayChange: quote.regularMarketChange,
        dayChangePercent: quote.regularMarketChangePercent,
        dayHigh: quote.regularMarketDayHigh,
        dayLow: quote.regularMarketDayLow,
        fiftyTwoWeekHigh: quote.fiftyTwoWeekHigh,
        fiftyTwoWeekLow: quote.fiftyTwoWeekLow,
        fiftyDayAverage: quote.fiftyDayAverage,
        twoHundredDayAverage: quote.twoHundredDayAverage,

        // Volume
        volume: quote.regularMarketVolume,
        averageVolume: quote.averageDailyVolume3Month,

        // Valuation
        marketCap: quote.marketCap,
        sharesOutstanding: quote.sharesOutstanding,
        trailingPE: quote.trailingPE,
        forwardPE: quote.forwardPE,
        priceToBook: quote.priceToBook,

        // Per share
        eps: quote.epsTrailingTwelveMonths,
        epsForward: quote.epsForward,
        bookValue: quote.bookValue,

        // Dividends
        dividendYield: quote.dividendYield,
        dividendRate: quote.dividendRate,
        trailingAnnualDividendYield: quote.trailingAnnualDividendYield,

        // Metadata
        quoteType: quote.quoteType,
        beta: quote.beta || null,
        fetchedAt: new Date().toISOString(),
      }
    };
  } catch (error) {
    return { success: false, error: `Quote fetch failed: ${error.message}`, data: null };
  }
}

/**
 * Fetch detailed company profile including sector, industry, description,
 * employee count, website, and key officers.
 * 
 * @param {string} ticker - Stock ticker symbol
 * @returns {Object} - Company profile data
 */
export async function getCompanyProfile(ticker) {
  try {
    const summary = await withRetry(() => yahooFinance.quoteSummary(ticker, {
      modules: ['assetProfile', 'summaryProfile']
    }), { domain: 'yahoo' });

    const profile = summary.assetProfile || summary.summaryProfile || {};

    return {
      success: true,
      data: {
        ticker,
        sector: profile.sector || 'Unknown',
        industry: profile.industry || 'Unknown',
        description: profile.longBusinessSummary || '',
        website: profile.website || '',
        country: profile.country || '',
        city: profile.city || '',
        employees: profile.fullTimeEmployees || null,
        companyOfficers: (profile.companyOfficers || []).slice(0, 5).map(o => ({
          name: o.name,
          title: o.title,
          age: o.age,
        })),
        fetchedAt: new Date().toISOString(),
      }
    };
  } catch (error) {
    return { success: false, error: `Profile fetch failed: ${error.message}`, data: null };
  }
}

/**
 * Fetch key financial statistics — valuation, profitability, balance sheet metrics.
 * This is the richest source of computed financial data.
 * 
 * @param {string} ticker - Stock ticker symbol
 * @returns {Object} - Key financial statistics
 */
export async function getFinancialStats(ticker) {
  try {
    const summary = await withRetry(() => yahooFinance.quoteSummary(ticker, {
      modules: ['defaultKeyStatistics', 'financialData']
    }, { validateResult: false }), { domain: 'yahoo' });

    const stats = summary.defaultKeyStatistics || {};
    const financial = summary.financialData || {};

    return {
      success: true,
      data: {
        ticker,

        // Valuation metrics
        enterpriseValue: stats.enterpriseValue,
        forwardPE: stats.forwardPE,
        trailingPE: stats.trailingPE,
        pegRatio: stats.pegRatio,
        priceToBook: stats.priceToBook,
        priceToSales: stats.priceToSalesTrailing12Months,
        enterpriseToRevenue: stats.enterpriseToRevenue,
        enterpriseToEbitda: stats.enterpriseToEbitda,

        // Profitability
        profitMargin: stats.profitMargins,
        operatingMargin: financial.operatingMargins,
        grossMargin: financial.grossMargins,
        returnOnEquity: financial.returnOnEquity,
        returnOnAssets: financial.returnOnAssets,

        // Revenue & earnings
        totalRevenue: financial.totalRevenue,
        revenuePerShare: financial.revenuePerShare,
        revenueGrowth: financial.revenueGrowth,
        earningsGrowth: financial.earningsGrowth,
        ebitda: financial.ebitda,
        ebitdaMargins: financial.ebitdaMargins,

        // Balance sheet
        totalCash: financial.totalCash,
        totalCashPerShare: financial.totalCashPerShare,
        totalDebt: financial.totalDebt,
        debtToEquity: financial.debtToEquity,
        currentRatio: financial.currentRatio,
        quickRatio: financial.quickRatio,

        // Cash flow
        freeCashflow: financial.freeCashflow,
        operatingCashflow: financial.operatingCashflow,

        // Shares
        sharesOutstanding: stats.sharesOutstanding,
        floatShares: stats.floatShares,
        sharesShort: stats.sharesShort,
        shortRatio: stats.shortRatio,
        heldPercentInsiders: stats.heldPercentInsiders,
        heldPercentInstitutions: stats.heldPercentInstitutions,

        // Beta & volatility
        beta: stats.beta,

        // Targets
        targetHighPrice: financial.targetHighPrice,
        targetLowPrice: financial.targetLowPrice,
        targetMeanPrice: financial.targetMeanPrice,
        targetMedianPrice: financial.targetMedianPrice,
        numberOfAnalystOpinions: financial.numberOfAnalystOpinions,
        recommendationMean: financial.recommendationMean,
        recommendationKey: financial.recommendationKey,

        fetchedAt: new Date().toISOString(),
      }
    };
  } catch (error) {
    return { success: false, error: `Stats fetch failed: ${error.message}`, data: null };
  }
}

/**
 * Fetch historical financial statements (income statement, balance sheet).
 * Returns annual data for trend analysis.
 * 
 * @param {string} ticker - Stock ticker symbol
 * @returns {Object} - Historical financial data (up to 4 years)
 */
export async function getHistoricalFinancials(ticker) {
  try {
    const summary = await withRetry(() => yahooFinance.quoteSummary(ticker, {
      modules: ['incomeStatementHistory', 'balanceSheetHistory', 'cashflowStatementHistory']
    }, { validateResult: false }), { domain: 'yahoo' });

    const incomeStatements = (summary.incomeStatementHistory?.incomeStatementHistory || [])
      .map(stmt => ({
        date: stmt.endDate,
        totalRevenue: stmt.totalRevenue,
        grossProfit: stmt.grossProfit,
        operatingIncome: stmt.operatingIncome,
        netIncome: stmt.netIncome,
        ebit: stmt.ebit,
        // Computed margins (code computes, not LLM)
        grossMargin: stmt.totalRevenue ? stmt.grossProfit / stmt.totalRevenue : null,
        operatingMargin: stmt.totalRevenue ? stmt.operatingIncome / stmt.totalRevenue : null,
        netMargin: stmt.totalRevenue ? stmt.netIncome / stmt.totalRevenue : null,
      }));

    const balanceSheets = (summary.balanceSheetHistory?.balanceSheetStatements || [])
      .map(stmt => ({
        date: stmt.endDate,
        totalAssets: stmt.totalAssets,
        totalLiabilities: stmt.totalLiab,
        totalStockholderEquity: stmt.totalStockholderEquity,
        totalDebt: stmt.longTermDebt,
        cash: stmt.cash,
        shortTermInvestments: stmt.shortTermInvestments,
        // Computed ratio (code computes)
        debtToEquity: stmt.totalStockholderEquity
          ? (stmt.longTermDebt || 0) / stmt.totalStockholderEquity
          : null,
      }));

    const cashFlows = (summary.cashflowStatementHistory?.cashflowStatements || [])
      .map(stmt => ({
        date: stmt.endDate,
        operatingCashflow: stmt.totalCashFromOperatingActivities,
        capitalExpenditures: stmt.capitalExpenditures,
        freeCashflow: stmt.totalCashFromOperatingActivities && stmt.capitalExpenditures
          ? stmt.totalCashFromOperatingActivities + stmt.capitalExpenditures  // capex is negative
          : null,
        dividendsPaid: stmt.dividendsPaid,
      }));

    return {
      success: true,
      data: {
        ticker,
        incomeStatements,
        balanceSheets,
        cashFlows,
        periodsAvailable: incomeStatements.length,
        fetchedAt: new Date().toISOString(),
      }
    };
  } catch (error) {
    return { success: false, error: `Historical data fetch failed: ${error.message}`, data: null };
  }
}

/**
 * Fetch sector peer data for percentile comparison.
 * Gets summary data for companies in the same sector.
 * 
 * @param {string} ticker - Stock ticker symbol  
 * @returns {Object} - Sector peer metrics for percentile calculation
 */
export async function getSectorPeers(ticker) {
  try {
    const summary = await withRetry(() => yahooFinance.quoteSummary(ticker, {
      modules: ['recommendationTrend', 'industryTrend']
    }, { validateResult: false }), { domain: 'yahoo' });

    // Also try to get peer recommendations
    const industryTrend = summary.industryTrend || {};

    return {
      success: true,
      data: {
        ticker,
        industryTrend: {
          peRatio: industryTrend.peRatio,
          pegRatio: industryTrend.pegRatio,
        },
        recommendationTrend: (summary.recommendationTrend?.trend || []).map(t => ({
          period: t.period,
          strongBuy: t.strongBuy,
          buy: t.buy,
          hold: t.hold,
          sell: t.sell,
          strongSell: t.strongSell,
        })),
        fetchedAt: new Date().toISOString(),
      }
    };
  } catch (error) {
    return { success: false, error: `Sector peers fetch failed: ${error.message}`, data: null };
  }
}

/**
 * Fetch historical financial statements using fundamentalsTimeSeries (FTS).
 * This works after the Nov 2024 quoteSummary deprecation.
 */
export async function getHistoricalFinancialsFTS(ticker) {
  try {
    const result = await withRetry(() => yahooFinance.fundamentalsTimeSeries(ticker, {
      period1: '2020-01-01',
      type: 'annual',
      module: 'all'
    }, { validateResult: false }), { domain: 'yahoo' });

    if (!result || result.length === 0) {
      return { success: false, error: 'No fundamentals time series data returned', data: null };
    }

    // Filter out periods where all key data is undefined
    const validPeriods = result.filter(p => p.date && (p.totalRevenue !== undefined || p.netIncome !== undefined));

    if (validPeriods.length === 0) {
      return { success: false, error: 'All FTS periods had undefined revenue/netIncome', data: null };
    }

    // Map time series to normalized structures
    // Sort chronological descending (latest first)
    const sortedPeriods = [...validPeriods].sort((a, b) => new Date(b.date) - new Date(a.date));

    const incomeStatements = sortedPeriods
      .map(p => {
        const rev = p.totalRevenue;
        const gp = p.grossProfit;
        const opInc = p.operatingIncome;
        const ni = p.netIncome;
        const ebit = p.EBIT;
        const eps = p.dilutedEPS;
        return {
          date: p.date,
          year: new Date(p.date).getFullYear(),
          revenue: rev || null,
          totalRevenue: rev || null,
          grossProfit: gp || null,
          operatingIncome: opInc || null,
          netIncome: ni || null,
          ebit: ebit || opInc || null,
          grossMargin: rev && gp ? gp / rev : null,
          operatingMargin: rev && opInc ? opInc / rev : null,
          netMargin: rev && ni ? ni / rev : null,
          eps: eps || null
        };
      });

    const balanceSheets = sortedPeriods
      .map(p => {
        const assets = p.totalAssets || null;
        const equity = p.stockholdersEquity || p.commonStockEquity || null;
        const debt = p.totalDebt || p.longTermDebt || null;
        const cash = p.cashCashEquivalentsAndShortTermInvestments || p.cashAndCashEquivalents || null;
        const liab = (assets !== null && equity !== null) ? assets - equity : null;
        return {
          date: p.date,
          year: new Date(p.date).getFullYear(),
          totalAssets: assets,
          totalLiabilities: liab,
          equity: equity,
          debt: debt,
          totalStockholderEquity: equity,
          totalDebt: debt,
          cash: cash,
          shortTermInvestments: null,
          debtToEquity: equity && debt ? debt / equity : null,
        };
      });

    const cashFlows = sortedPeriods
      .map(p => {
        const rawCapex = p.capitalExpenditure !== undefined && p.capitalExpenditure !== null ? p.capitalExpenditure : null;
        const capex = rawCapex !== null ? -Math.abs(rawCapex) : null;
        const opCash = p.operatingCashFlow !== undefined && p.operatingCashFlow !== null ? p.operatingCashFlow : null;
        const fcf = p.freeCashFlow !== undefined && p.freeCashFlow !== null
          ? p.freeCashFlow
          : (opCash !== null ? opCash + (capex !== null ? capex : 0) : null);
        return {
          date: p.date,
          year: new Date(p.date).getFullYear(),
          operatingCashflow: opCash,
          capex: capex,
          capitalExpenditures: capex,
          freeCashflow: fcf,
          dividendsPaid: null,
        };
      });

    return {
      success: incomeStatements.length > 0,
      data: {
        ticker,
        incomeStatements,
        balanceSheets,
        cashFlows,
        periodsAvailable: incomeStatements.length,
        fetchedAt: new Date().toISOString(),
      }
    };
  } catch (error) {
    return { success: false, error: `Historical FTS data fetch failed: ${error.message}`, data: null };
  }
}

/**
 * MASTER FUNCTION: Fetch ALL financial data for a company in one call.
 * This is what the agent graph calls — single entry point for all financial data.
 * 
 * @param {string} ticker - Stock ticker symbol
 * @returns {Object} - Complete financial data bundle
 */
export async function fetchCompleteFinancialData(ticker) {
  // Run all fetches in parallel for speed
  const [quote, profile, stats, historical, peers] = await Promise.all([
    getQuote(ticker),
    getCompanyProfile(ticker),
    getFinancialStats(ticker),
    getHistoricalFinancialsFTS(ticker), // Calls FTS instead of deprecated quoteSummary
    getSectorPeers(ticker),
  ]);


  // Track data completeness
  const sources = { quote, profile, stats, historical, peers };
  const successCount = Object.values(sources).filter(s => s.success).length;
  const totalSources = Object.keys(sources).length;

  return {
    success: successCount > 0,
    completeness: successCount / totalSources,
    completenessDetail: Object.fromEntries(
      Object.entries(sources).map(([key, val]) => [key, val.success])
    ),
    data: {
      quote: quote.success ? quote.data : null,
      profile: profile.success ? profile.data : null,
      stats: stats.success ? stats.data : null,
      historical: historical.success ? historical.data : null,
      peers: peers.success ? peers.data : null,
    },
    errors: Object.entries(sources)
      .filter(([_, val]) => !val.success)
      .map(([key, val]) => ({ source: key, error: val.error })),
    fetchedAt: new Date().toISOString(),
  };
}
