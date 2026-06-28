/**
 * Dividend Discount Model (DDM) Valuation Engine
 * 
 * Computes intrinsic value based on projected future dividend payments,
 * assuming a constant terminal growth rate (Gordon Growth Model variant).
 * Highly relevant for mature, dividend-paying companies (Utilities, REITs, Financials).
 */

export function calculateDDM(companyData, metrics, yield10Y, options = {}) {
  const price = metrics.latest.stockPrice || 1.0;
  
  // Extract historical dividend data
  // We need to look at historical cash flows or income statements for dividends paid
  const cf = companyData.historical?.cashFlows || [];
  
  // Let's assume we have dividendsPaid from cash flows, if available.
  // Alternatively, derive from EPS and payout ratio.
  const eps = metrics.latest.eps || 0;
  const is = companyData.historical?.incomeStatements?.[0] || {};
  const currentDividendsPaid = is.dividendsPaid || (cf[0]?.dividendsPaid ? Math.abs(cf[0].dividendsPaid) : 0);
  const shares = companyData.quote?.sharesOutstanding || 1.0;
  
  let currentDPS = options.dps || 0;
  
  if (currentDPS === 0 && currentDividendsPaid > 0 && shares > 0) {
    currentDPS = currentDividendsPaid / shares;
  }
  
  if (currentDPS === 0) {
    return { success: false, error: 'No dividend history available to run DDM.' };
  }

  // WACC or Cost of Equity calculation
  const rf = (yield10Y || 4.25) / 100;
  const beta = metrics.latest.beta || 1.0;
  const erp = 0.05; // 5% Equity Risk Premium
  const costOfEquity = rf + beta * erp;
  
  // Dividend Growth Rate Assumptions
  // Base growth on ROE * Retention Ratio
  const roe = metrics.ratios.roe || 0.10;
  const payoutRatio = eps > 0 ? (currentDPS / eps) : 1;
  const retentionRatio = Math.max(0, 1 - payoutRatio);
  const fundamentalGrowth = roe * retentionRatio;
  
  const stage1Growth = options.stage1Growth || Math.max(0.01, Math.min(0.15, fundamentalGrowth));
  const stage1Years = options.stage1Years || 5;
  const terminalGrowth = options.terminalGrowth || 0.02; // 2% long term growth
  
  if (costOfEquity <= terminalGrowth) {
    return { success: false, error: 'Cost of equity must be greater than terminal growth rate.' };
  }
  
  const schedule = [];
  let projDPS = currentDPS;
  let presentValueDividends = 0;
  
  // Stage 1: Explicit Growth Period
  for (let year = 1; year <= stage1Years; year++) {
    projDPS = projDPS * (1 + stage1Growth);
    const pv = projDPS / Math.pow(1 + costOfEquity, year);
    presentValueDividends += pv;
    schedule.push({ year, dps: projDPS, pv });
  }
  
  // Stage 2: Terminal Value (Gordon Growth)
  const terminalDPS = projDPS * (1 + terminalGrowth);
  const terminalValue = terminalDPS / (costOfEquity - terminalGrowth);
  const pvTerminalValue = terminalValue / Math.pow(1 + costOfEquity, stage1Years);
  
  const intrinsicPrice = presentValueDividends + pvTerminalValue;
  const discount = price > 0 ? (intrinsicPrice - price) / price : 0;
  
  return {
    success: true,
    intrinsicPrice,
    discount,
    costOfEquity,
    stage1Growth,
    terminalGrowth,
    schedule,
    pvTerminalValue
  };
}
