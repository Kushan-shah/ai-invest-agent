/**
 * Valuation Analysis Framework Plugin
 */

import { FrameworkSignalSchema } from '../utils/schemas.js';
import { ordinal } from '../utils/format.js';

// Baseline 5-year DCF model to supply absolute valuation context to the LLM
export function calculateBaselineDCF(companyData, metrics, yield10Y, options = {}) {
  const price = metrics.latest.stockPrice || 1.0;
  const revenue = metrics.latest.revenue || 0;
  const fcf = metrics.latest.opCash || metrics.latest.fcf || 0;
  
  if (revenue <= 0) return null;
  
  // Fallback FCF margin if FCF is negative or zero
  const fcfMargin = fcf > 0 ? fcf / revenue : 0.15;
  
  // Base terminal growth rate
  const terminalGrowth = 0.025; 

  // Two-Stage Decaying Growth Model (H-Model structure)
  // Instead of a flat 25% cap, we allow a high initial growth rate (capped at 100% or 1.0) 
  // and linearly decay it down to the terminal growth rate over 5 years.
  let initialGrowthRate = Math.max(-0.05, Math.min(1.00, metrics.ratios.revenueGrowthYoY || 0.08));
  
  // Apply optional premiums (used for bull-case estimation by valuation bubble guardrail)
  if (options.growthPremium) {
    initialGrowthRate = Math.min(1.50, initialGrowthRate + options.growthPremium);
  }
  const adjustedFcfMargin = options.marginPremium ? Math.min(0.50, fcfMargin + options.marginPremium) : fcfMargin;
  
  // WACC calculation
  const rf = (yield10Y || 4.25) / 100;
  const beta = metrics.latest.beta || 1.0;
  const erp = 0.05; // 5% Equity Risk Premium
  const costOfEquity = rf + beta * erp;
  
  const costOfDebt = 0.05; // 5% Cost of Debt
  const taxRate = 0.21; // 21% Tax rate
  
  const latestBS = companyData.historical?.balanceSheets?.[0] || {};
  const debt = latestBS.debt || 0;
  const cash = latestBS.cash || 0;
  const shares = companyData.quote?.sharesOutstanding || 1.0;
  const marketCap = companyData.quote?.marketCap || (price * shares) || 0;
  
  const totalCapital = marketCap + debt;
  const equityWeight = totalCapital > 0 ? marketCap / totalCapital : 1.0;
  const debtWeight = totalCapital > 0 ? debt / totalCapital : 0.0;
  
  const wacc = (equityWeight * costOfEquity) + (debtWeight * costOfDebt * (1 - taxRate));
  
  // Projections (5 years)
  let projRevenue = revenue;
  let discountedFcfSum = 0;
  const growthDecayStep = (initialGrowthRate - terminalGrowth) / 5;
  const growthRatesProjected = [];
  
  for (let year = 1; year <= 5; year++) {
    // Linearly decay growth rate each year
    const currentYearGrowth = Math.max(terminalGrowth, initialGrowthRate - (growthDecayStep * (year - 1)));
    growthRatesProjected.push(currentYearGrowth);
    projRevenue = projRevenue * (1 + currentYearGrowth);
    const projFcf = projRevenue * adjustedFcfMargin;
    discountedFcfSum += projFcf / Math.pow(1 + wacc, year);
  }
  
  // Terminal Value (Gordon Growth)
  const g = terminalGrowth;
  const terminalFcf = projRevenue * (1 + g) * adjustedFcfMargin;
  
  let terminalValue = 0;
  if (wacc > g) {
    terminalValue = terminalFcf / (wacc - g);
  }
  
  const discountedTerminalValue = terminalValue / Math.pow(1 + wacc, 5);
  const enterpriseValue = discountedFcfSum + discountedTerminalValue;
  const intrinsicEquityValue = enterpriseValue - debt + cash;
  
  const intrinsicPrice = shares > 0 ? intrinsicEquityValue / shares : 0;
  const discount = price > 0 ? (intrinsicPrice - price) / price : 0;
  
  return {
    intrinsicPrice,
    discount,
    wacc,
    growthRate: initialGrowthRate,
    // Transparency metadata: show exactly what assumptions were used
    assumptions: {
      growthModel: 'Two-Stage Decaying Growth (H-Model)',
      initialGrowthRate: initialGrowthRate,
      terminalGrowth: terminalGrowth,
      growthDecayStep: growthDecayStep,
      growthRatesProjected: growthRatesProjected,
      fcfMarginUsed: adjustedFcfMargin,
      riskFreeRate: rf,
      equityRiskPremium: erp,
      beta: beta,
      costOfEquity: costOfEquity,
      costOfDebt: costOfDebt,
      taxRate: taxRate,
      equityWeight: equityWeight,
      debtWeight: debtWeight
    }
  };
}

/**
 * Reverse DCF — Implied Growth Rate Calculator
 * 
 * Instead of guessing a growth rate and computing intrinsic value,
 * this function takes the CURRENT market price as truth and solves
 * backwards for: "What annual growth rate does the market imply?"
 * 
 * Zero assumptions about future growth = zero backlash.
 * The trader decides if the implied growth rate is achievable.
 * 
 * Uses binary search to solve: find g such that DCF(g) = current price.
 */
export function calculateReverseDCF(companyData, metrics, yield10Y) {
  const price = metrics.latest.stockPrice || 0;
  const revenue = metrics.latest.revenue || 0;
  const fcf = metrics.latest.opCash || metrics.latest.fcf || 0;

  if (revenue <= 0 || price <= 0) return null;

  const fcfMargin = fcf > 0 ? fcf / revenue : 0.15;

  // Use the same WACC calculation as the baseline DCF
  const rf = (yield10Y || 4.25) / 100;
  const beta = metrics.latest.beta || 1.0;
  const erp = 0.05;
  const costOfEquity = rf + beta * erp;
  const costOfDebt = 0.05;
  const taxRate = 0.21;

  const latestBS = companyData.historical?.balanceSheets?.[0] || {};
  const debt = latestBS.debt || 0;
  const cash = latestBS.cash || 0;
  const shares = companyData.quote?.sharesOutstanding || 1.0;
  const marketCap = companyData.quote?.marketCap || (price * shares) || 0;

  const totalCapital = marketCap + debt;
  const equityWeight = totalCapital > 0 ? marketCap / totalCapital : 1.0;
  const debtWeight = totalCapital > 0 ? debt / totalCapital : 0.0;
  const wacc = (equityWeight * costOfEquity) + (debtWeight * costOfDebt * (1 - taxRate));

  const terminalGrowth = 0.025;

  // Function: given a growth rate g, compute intrinsic price per share
  function computeIntrinsicPrice(g) {
    let projRevenue = revenue;
    let discountedFcfSum = 0;

    for (let year = 1; year <= 5; year++) {
      projRevenue = projRevenue * (1 + g);
      const projFcf = projRevenue * fcfMargin;
      discountedFcfSum += projFcf / Math.pow(1 + wacc, year);
    }

    const terminalFcf = projRevenue * (1 + terminalGrowth) * fcfMargin;
    let terminalValue = 0;
    if (wacc > terminalGrowth) {
      terminalValue = terminalFcf / (wacc - terminalGrowth);
    }

    const discountedTerminalValue = terminalValue / Math.pow(1 + wacc, 5);
    const enterpriseValue = discountedFcfSum + discountedTerminalValue;
    const equityValue = enterpriseValue - debt + cash;
    return shares > 0 ? equityValue / shares : 0;
  }

  // Binary search: find the growth rate g where computeIntrinsicPrice(g) ≈ price
  let lo = -0.30; // -30% (severe decline)
  let hi = 1.00;  // +100% (extreme growth)
  let impliedGrowth = 0;
  const tolerance = price * 0.005; // within 0.5% of current price

  for (let iter = 0; iter < 100; iter++) {
    const mid = (lo + hi) / 2;
    const midPrice = computeIntrinsicPrice(mid);

    if (Math.abs(midPrice - price) < tolerance) {
      impliedGrowth = mid;
      break;
    }

    if (midPrice < price) {
      lo = mid;
    } else {
      hi = mid;
    }
    impliedGrowth = mid;
  }

  // Compare with historical actual growth
  const historicalGrowth = metrics.ratios.revenueGrowthYoY || 0;
  const growthGap = impliedGrowth - historicalGrowth;

  // Determine market expectations interpretation
  let marketExpectation = 'NEUTRAL';
  let interpretation = '';

  if (impliedGrowth > historicalGrowth * 1.5 && growthGap > 0.05) {
    marketExpectation = 'OPTIMISTIC';
    interpretation = `Market is pricing in ${(impliedGrowth * 100).toFixed(1)}% annual growth, which is significantly above the last reported ${(historicalGrowth * 100).toFixed(1)}%. The market expects growth acceleration.`;
  } else if (impliedGrowth < historicalGrowth * 0.6 && growthGap < -0.05) {
    marketExpectation = 'PESSIMISTIC';
    interpretation = `Market is pricing in only ${(impliedGrowth * 100).toFixed(1)}% annual growth, well below the last reported ${(historicalGrowth * 100).toFixed(1)}%. The market expects growth deceleration.`;
  } else {
    marketExpectation = 'FAIRLY_PRICED';
    interpretation = `Market-implied growth of ${(impliedGrowth * 100).toFixed(1)}% is roughly in line with the last reported ${(historicalGrowth * 100).toFixed(1)}%. The stock appears fairly priced relative to recent performance.`;
  }

  return {
    impliedGrowthRate: parseFloat(impliedGrowth.toFixed(4)),
    historicalGrowthRate: parseFloat(historicalGrowth.toFixed(4)),
    growthGap: parseFloat(growthGap.toFixed(4)),
    marketExpectation,
    interpretation,
    wacc,
    fcfMarginUsed: fcfMargin,
    currentPrice: price
  };
}

export const valuationFramework = {
  id: 'valuation_analysis',
  name: 'Valuation Analysis',
  version: '1.0',
  weight: 0.15,

  blueprint: [
    'STEP 1 — MULTIPLES BENCHMARKING: Evaluate trailing P/E and forward P/E ratios. Check where they sit relative to sector percentiles.',
    'STEP 2 — GROWTH ADJUSTED PRICING: Check the PEG ratio. A PEG below 1.0 indicates growth is underpriced; a PEG above 2.0 indicates growth is heavily premium-priced.',
    'STEP 3 — ABSOLUTE INTRINSIC RECONCILIATION: Check the baseline DCF valuation. Identify if the stock trades at an absolute premium (overvalued) or discount (undervalued).',
    'STEP 4 — MARGIN OF SAFETY (TARGET TARGETS): Compare current price against the average analyst target price. Compute the percentage difference (upside/downside).',
    'STEP 5 — VALUATION SYNTHESIS: Weigh the relative multiples against the absolute DCF valuation, and macro interest rate headwinds to formulate the final signal (BULLISH = Undervalued, NEUTRAL = Fairly Valued, BEARISH = Overvalued).'
  ],

  analyze: async (companyData, metrics, percentiles, macroAnalysis, llm) => {
    const structuredModel = llm.withStructuredOutput(FrameworkSignalSchema);

    const price = metrics.latest.stockPrice;
    const targetMean = companyData.analystTargets.targetMean;
    const targetUpside = companyData.analystTargets.upside;

    const fmtPct = (val) => (val !== null && val !== undefined) ? `${(val * 100).toFixed(1)}%` : 'N/A';
    const fmtNum = (val, dec = 2) => (val !== null && val !== undefined) ? val.toFixed(dec) : 'N/A';
    const fmtVal = (val, suffix = '') => (val !== null && val !== undefined) ? `${val}${suffix}` : 'N/A';

    const baselineDcf = calculateBaselineDCF(companyData, metrics, macroAnalysis.yield10Y);

    const prompt = `You are an expert valuation specialist. Analyze the valuation of ${companyData.profile.name} (${companyData.profile.ticker}) using the pre-computed valuation metrics below.

VALUATION MULTIPLES:
- Current Stock Price: ${price ? price + ' ' + companyData.profile.currency : 'N/A'}
- Trailing P/E: ${fmtVal(metrics.latest.pe, 'x')} (${percentiles.pe.label} — ${ordinal(percentiles.pe.percentile)} percentile)
- Forward P/E: ${fmtVal(metrics.latest.forwardPe, 'x')}
- PEG Ratio: ${fmtNum(metrics.latest.peg)}

ABSOLUTE INTRINSIC VALUATION (BASELINE DCF MODEL):
${baselineDcf ? `- Baseline WACC: ${fmtPct(baselineDcf.wacc)}
- Baseline 5-Yr Growth Rate: ${fmtPct(baselineDcf.growthRate)}
- Baseline Intrinsic Value per share: ${baselineDcf.intrinsicPrice.toFixed(2)} ${companyData.profile.currency || 'USD'}
- Premium / Discount to current price: ${baselineDcf.discount >= 0 ? '+' : ''}${fmtPct(baselineDcf.discount)} (${baselineDcf.discount >= 0 ? 'Undervalued' : 'Overvalued / Premium-priced'})` : '- Baseline DCF Model: N/A (Insufficient cash flows or revenue)'}

CONSENSUS TARGET ANALYSTS:
- Mean Target Price: ${fmtNum(targetMean)}
- Calculated Upside to Consensus: ${fmtPct(targetUpside)}
- Target High: ${fmtVal(companyData.analystTargets.targetHigh)} | Low: ${fmtVal(companyData.analystTargets.targetLow)}

MACRO COMPRESSION:
- 10-Yr Treasury Yield: ${fmtNum(macroAnalysis.yield10Y)}%
- Valuation Multiplier penalty applied: ${macroAnalysis.valuationPenaltyMultiplier < 1.0 ? 'YES' : 'NO'} (Multiplier: ${fmtNum(macroAnalysis.valuationPenaltyMultiplier)})

INSTRUCTIONS:
Follow these steps exactly to complete your intermediate reasoning steps (reasoning_steps):
${valuationFramework.blueprint.join('\n')}

CRITICAL VALUATION RECONCILIATION RULE:
Weigh both relative multiples (which may suggest undervaluation) and absolute DCF valuation (which may suggest overvaluation). If the absolute DCF model shows the stock is overvalued by more than 20% (i.e. trades at a discount less than -20%, such as -35% or -69%), you MUST NOT output a "BULLISH" signal. In this case, you must limit the direction to "NEUTRAL" or "BEARISH" and explicitly call out this core contradiction in your reasoning and key_driver (e.g., 'Relative valuation multiple discount is offset by severe absolute overvaluation on a DCF basis'). This is a hard, non-negotiable rule.

CRITICAL NEGATIVE CONSTRAINTS:
1. Do NOT use generic AI filler phrases, hedges, or placeholders (e.g. "balanced risk/reward", "wait-and-see approach", "monitoring trends carefully"). Write with authority.
2. Do NOT refer to yourself as an AI or reference system boundaries. Write like an institutional Wall Street research director.
3. Every single qualitative statement in your reasoning MUST be immediately backed by a specific quantitative metric or ratio from the provided data (e.g. "PEG Ratio stands at 0.95"). Cite exact numbers.

Format your final response strictly to the output schema. Citing specific computed metrics in the evidence array.`;

    return await structuredModel.invoke(prompt);
  }
};
