/**
 * Fundamental Analysis Framework Plugin
 */

import { FrameworkSignalSchema } from '../utils/schemas.js';
import { ordinal } from '../utils/format.js';

export const fundamentalFramework = {
  id: 'fundamental_analysis',
  name: 'Fundamental Analysis',
  version: '1.0',
  weight: 0.30, // Default weight (adjusted by lifecycle)
  
  blueprint: [
    'STEP 1 — PROFITABILITY & GROWTH: Assess the company\'s YoY revenue and net income growth rates. Note the direction (accelerating, decelerating, stable, or fluctuating).',
    'STEP 2 — BALANCE SHEET HEALTH & LIQUIDITY: Assess the current leverage (Debt-to-Equity) and overall balance sheet strength. Check if leverage is rising.',
    'STEP 3 — CAPITAL EFFICIENCY: Evaluate Return on Equity (ROE) and Return on Capital Employed (ROCE) relative to general standards.',
    'STEP 4 — CASH FLOW QUALITY & SYNTHESIS: Check the cash flow quality ratio (Operating Cash Flow / Net Income). Combine findings to generate the final signal (BULLISH, BEARISH, NEUTRAL).'
  ],

  analyze: async (companyData, metrics, percentiles, anomalies, llm) => {
    const structuredModel = llm.withStructuredOutput(FrameworkSignalSchema);

    const fmtPct = (val) => (val !== null && val !== undefined) ? `${(val * 100).toFixed(1)}%` : 'N/A';
    const fmtNum = (val, dec = 2) => (val !== null && val !== undefined) ? val.toFixed(dec) : 'N/A';
    const fmtLoc = (val) => (val !== null && val !== undefined) ? val.toLocaleString() : 'N/A';

    const prompt = `You are an expert Wall Street research analyst. Analyze the fundamental financial health of ${companyData.profile.name} (${companyData.profile.ticker}) using the pre-computed metrics below.

Do NOT compute any metrics or perform any math. The math is already done and verified by code.
Your job is to INTERPRET what these numbers mean. 

Interpret the financial observations and metrics contextually. Do not treat observations as absolute warning flags (e.g., high debt-to-equity is normal for utilities/telecoms but risky for tech; negative earnings are typical for early-stage growth companies but concerning for mature operations).

COMPUTED METRICS:
- Revenue: ${fmtLoc(metrics.latest.revenue)} ${companyData.profile.currency}
- Revenue Growth (YoY): ${fmtPct(metrics.ratios.revenueGrowthYoY)} (${percentiles.revenueGrowth.label} — ${ordinal(percentiles.revenueGrowth.percentile)} percentile)
- Revenue Trend: ${metrics.trends.revenueTrend || 'N/A'}
- Net Margin: ${fmtPct(metrics.ratios.netMargin)} (${percentiles.netMargin.label} — ${ordinal(percentiles.netMargin.percentile)} percentile)
- Margin Trend: ${metrics.trends.marginTrend || 'N/A'}
- ROE: ${fmtPct(metrics.ratios.roe)} (${percentiles.roe.label} — ${ordinal(percentiles.roe.percentile)} percentile)
- ROCE: ${fmtPct(metrics.ratios.roce)}
- Debt-to-Equity: ${fmtNum(metrics.ratios.debtToEquity)} (${percentiles.debtToEquity.label} — ${ordinal(percentiles.debtToEquity.percentile)} percentile)
- Debt Trend: ${metrics.trends.leverageTrend || 'N/A'}
- Cash Flow Quality (OCF/Net Income): ${fmtNum(metrics.ratios.cashFlowQuality)}
- Factual Financial Observations: ${JSON.stringify(anomalies.map(f => f.message))}


INSTRUCTIONS:
Follow these steps exactly to complete your intermediate reasoning steps (reasoning_steps):
${fundamentalFramework.blueprint.join('\n')}

CRITICAL NEGATIVE CONSTRAINTS:
1. Do NOT use generic AI filler phrases, hedges, or placeholders (e.g. "balanced risk/reward", "wait-and-see approach", "monitoring trends carefully"). Write with authority.
2. Do NOT refer to yourself as an AI or reference system boundaries. Write like an institutional Wall Street research director.
3. Every single qualitative statement in your reasoning MUST be immediately backed by a specific quantitative metric or ratio from the provided data (e.g. "Net margin is 55.6%"). Cite exact numbers.

Format your final response strictly to the output schema. Citing specific computed metrics in the evidence array.`;

    return await structuredModel.invoke(prompt);
  }
};
