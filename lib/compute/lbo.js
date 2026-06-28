/**
 * Leveraged Buyout (LBO) Valuation Engine
 * 
 * Computes the IRR floor for private equity targets by modeling
 * entry multiples, debt leverage, cash flow sweep (debt paydown), and exit multiples.
 */

export function calculateLBO(companyData, metrics, options = {}) {
  const price = metrics.latest.stockPrice || 1.0;
  const shares = companyData.quote?.sharesOutstanding || 1.0;
  const marketCap = companyData.quote?.marketCap || (price * shares);
  
  const latestBS = companyData.historical?.balanceSheets?.[0] || {};
  const currentDebt = latestBS.debt || 0;
  const currentCash = latestBS.cash || 0;
  
  const enterpriseValue = marketCap + currentDebt - currentCash;
  
  const ebitda = metrics.latest.operatingIncome ? metrics.latest.operatingIncome + (metrics.latest.depreciationAndAmortization || 0) : null;
  if (!ebitda || ebitda <= 0) {
    return { success: false, error: 'Negative or missing EBITDA' };
  }

  // Assumptions
  const entryMultiple = options.entryMultiple || (enterpriseValue / ebitda);
  const leverageRatio = options.leverageRatio || 0.60; // 60% Debt, 40% Equity
  const interestRate = options.interestRate || 0.08; // 8% Cost of Debt
  const exitMultiple = options.exitMultiple || entryMultiple; // Assume no multiple expansion
  const holdPeriod = options.holdPeriod || 5;
  const taxRate = 0.21;
  const capexPctOfEbitda = 0.10; // Assume capex is 10% of EBITDA

  const entryEV = ebitda * entryMultiple;
  const startingDebt = entryEV * leverageRatio;
  const sponsorEquity = entryEV * (1 - leverageRatio);

  let currentLboDebt = startingDebt;
  let projEbitda = ebitda;
  const revenueGrowth = Math.max(0.02, Math.min(0.15, metrics.ratios.revenueGrowthYoY || 0.05));

  const fcfSchedule = [];

  for (let year = 1; year <= holdPeriod; year++) {
    projEbitda = projEbitda * (1 + revenueGrowth);
    const interestExpense = currentLboDebt * interestRate;
    const ebt = projEbitda - (projEbitda * capexPctOfEbitda) - interestExpense; // Simplified EBT
    const taxes = Math.max(0, ebt * taxRate);
    
    // Operating Cash Flow (Simplified: EBITDA - Capex - Interest - Taxes)
    const leveredFCF = projEbitda - (projEbitda * capexPctOfEbitda) - interestExpense - taxes;
    
    // 100% Cash Flow Sweep to pay down debt
    const paydown = Math.min(currentLboDebt, Math.max(0, leveredFCF));
    currentLboDebt -= paydown;
    
    fcfSchedule.push({
      year,
      ebitda: projEbitda,
      leveredFCF,
      debtRemaining: currentLboDebt
    });
  }

  const exitEV = projEbitda * exitMultiple;
  const exitEquity = exitEV - currentLboDebt;
  
  // Calculate MOIC (Multiple on Invested Capital)
  const moic = exitEquity / sponsorEquity;
  
  // Calculate IRR
  const irr = Math.pow(moic, 1 / holdPeriod) - 1;

  // LBO Implied Share Price (What PE firm would pay today to hit 20% IRR)
  const targetIrr = 0.20;
  const requiredMoic = Math.pow(1 + targetIrr, holdPeriod);
  const maxSponsorEquity = exitEquity / requiredMoic;
  const maxEntryEV = maxSponsorEquity + startingDebt;
  const impliedMarketCap = maxEntryEV - currentDebt + currentCash;
  const impliedPrice = impliedMarketCap / shares;

  return {
    success: true,
    sponsorEquity,
    exitEquity,
    moic,
    irr,
    impliedPrice,
    fcfSchedule
  };
}
