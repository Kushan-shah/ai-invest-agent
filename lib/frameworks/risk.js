/**
 * Risk & Macro Assessment Framework Plugin
 */

import { FrameworkSignalSchema } from '../utils/schemas.js';
import { ordinal } from '../utils/format.js';

export const riskFramework = {
  id: 'risk_analysis',
  name: 'Risk & Macro Assessment',
  version: '1.0',
  weight: 0.25,

  blueprint: [
    'STEP 1 — LEVERAGE & SOLVENCY RISKS: Assess the absolute level of debt and the long-term trend (accelerating leverage) as a potential solvency drag.',
    'STEP 2 — CORPORATE ANOMALIES & AUDITING FLAGS: Evaluate active rules-based anomaly flags (like cash flow-revenue divergence or earnings quality).',
    'STEP 3 — MACRO HEADWINDS & INTEREST RATES: Assess sensitivity to macroeconomic indicators (interest rates, yields, inflation) and how they compress the investment horizon.',
    'STEP 4 — RISK SYNTHESIS: Rank the severity of risks and output the final converged signal (BEARISH = High Risk, NEUTRAL = Moderate Risk, BULLISH = Low/Managed Risk).'
  ],

  analyze: async (companyData, metrics, percentiles, anomalies, macroAnalysis, news, llm) => {
    const structuredModel = llm.withStructuredOutput(FrameworkSignalSchema);

    const fmtPct = (val) => (val !== null && val !== undefined) ? `${(val * 100).toFixed(1)}%` : 'N/A';
    const fmtNum = (val, dec = 2) => (val !== null && val !== undefined) ? val.toFixed(dec) : 'N/A';
    const fmtVal = (val, suffix = '') => (val !== null && val !== undefined) ? `${val}${suffix}` : 'N/A';

    const prompt = `You are an expert financial risk manager. Conduct a risk assessment on ${companyData.profile.name} (${companyData.profile.ticker}) using the pre-computed metrics and macro conditions below.

Your assessment should be sector-aware and life-cycle-aware. Do not treat financial observations as simple black-and-white flags; analyze whether these observations represent normal operational dynamics for the company's sector or represent genuine risk.

COMPUTED RISK METRICS:
- Debt-to-Equity: ${fmtNum(metrics.ratios.debtToEquity)} (${percentiles.debtToEquity.label} — ${ordinal(percentiles.debtToEquity.percentile)} percentile)
- Debt Trend: ${metrics.trends.leverageTrend || 'N/A'}
- Cash Flow Quality (OCF/Net Income): ${fmtNum(metrics.ratios.cashFlowQuality)}

FACTUAL FINANCIAL OBSERVATIONS:
${JSON.stringify(anomalies.map(f => ({ id: f.id, category: f.category, message: f.message })))}

MACRO-ECONOMIC ENVIRONMENT:
- 10-Yr Treasury Yield: ${fmtNum(macroAnalysis.yield10Y)}%
- Inflation Rate (CPI): ${fmtNum(macroAnalysis.inflationRate)}%
- Valuation Interest Rate Penalty applied: ${macroAnalysis.valuationPenaltyMultiplier < 1.0 ? 'YES' : 'NO'} (Multiplier: ${fmtNum(macroAnalysis.valuationPenaltyMultiplier)})
- Active Macro Observations: ${JSON.stringify(macroAnalysis.macroFlags.map(f => ({ id: f.id, category: f.category, message: f.message })))}

RECENT NEWS HEADLINES (RISK SCAN):
${JSON.stringify(news.slice(0, 5).map(n => ({ title: n.title, content: n.content })))}

INSTRUCTIONS:
Follow these steps exactly to complete your intermediate reasoning steps (reasoning_steps):
${riskFramework.blueprint.join('\n')}

CRITICAL NEGATIVE CONSTRAINTS:
1. Do NOT use generic AI filler phrases, hedges, or placeholders (e.g. "balanced risk/reward", "wait-and-see approach", "monitoring trends carefully"). Write with authority.
2. Do NOT refer to yourself as an AI or reference system boundaries. Write like an institutional Wall Street research director.
3. Every single qualitative statement in your reasoning MUST be immediately backed by a specific quantitative metric or ratio from the provided data (e.g. "Debt-to-Equity is 0.10"). Cite exact numbers.

Format your response strictly to the schema. BEARISH denotes high risk, NEUTRAL is moderate risk, and BULLISH represents low/managed risk.`;

    return await structuredModel.invoke(prompt);
  }
};
