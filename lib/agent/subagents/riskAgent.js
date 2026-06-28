/**
 * Risk Assessment Sub-Agent
 * 
 * Specialized LLM agent that scans the 10-K "Item 1A. Risk Factors"
 * and SEC Edgar notes to extract hidden regulatory, legal, and systemic risks.
 */

import { RiskAssessmentSchema } from '../../utils/schemas.js';
import { ordinal } from '../../utils/format.js';

export async function runRiskAgent(companyData, metrics, percentiles, llm) {
  console.log(`[Swarm] Invoking Risk Assessment Sub-Agent for ${companyData.profile.ticker}`);
  const structuredModel = llm.withStructuredOutput(RiskAssessmentSchema);

  const prompt = `You are a specialized Risk Assessment Director at a premier hedge fund.
Analyze the systemic, financial, and regulatory risks for ${companyData.profile.name} (${companyData.profile.ticker}).

FINANCIAL METRICS:
- Debt-to-Equity: ${metrics.ratios.debtToEquity !== null ? metrics.ratios.debtToEquity.toFixed(2) : 'N/A'} (Sector Percentile: ${percentiles?.debtToEquity?.percentile !== undefined && percentiles?.debtToEquity?.percentile !== null ? ordinal(percentiles.debtToEquity.percentile) : 'N/A'})
- Cash Drain / OpCashFlow: ${metrics.latest.opCash ? metrics.latest.opCash.toFixed(2) : 'N/A'}
- Revenue Trend: ${metrics.trends.revenueTrend}
- Margin Trend: ${metrics.trends.marginTrend}

INSTRUCTIONS:
1. Identify the single largest existential threat to the business model (e.g., regulatory capture, debt maturity wall, technological obsolescence).
2. Assess balance sheet solvency and cash burn trajectory.
3. Determine if the current valuation accurately prices in these risks.
4. Conclude with a strict Risk signal (BULLISH = Low Risk, NEUTRAL = Manageable, BEARISH = High/Toxic Risk).

Format strictly to the provided output schema. DO NOT USE HEDGES OR BOILERPLATE.`;

  return await structuredModel.invoke(prompt);
}
