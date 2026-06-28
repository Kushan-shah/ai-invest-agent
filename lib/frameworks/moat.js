/**
 * Moat & Competitive Position Framework Plugin
 */

import { FrameworkSignalSchema } from '../utils/schemas.js';
import { ordinal } from '../utils/format.js';

export const moatFramework = {
  id: 'moat_analysis',
  name: 'Moat & Competitive Position',
  version: '1.0',
  weight: 0.20,

  blueprint: [
    'STEP 1 — MARGIN STABILITY & LEVEL: Evaluate the absolute net and gross margins and whether they are consistent, expanding, or declining over 3+ years.',
    'STEP 2 — SECTOR SUPERIORITY: Check the sector percentiles for profit margin and ROE. Being in the top quintile (> 80th percentile) indicates high relative capital efficiency and moat strength.',
    'STEP 3 — BARRIERS TO ENTRY & PRICING POWER: Analyze the company profile, description, and recent news to identify structural barriers: high switching costs, network effects, cost leadership, brand intangible assets, or regulatory license.',
    'STEP 4 — MOAT SYNTHESIS: Converge quantitative margins and qualitative moat markers into a unified signal (BULLISH, BEARISH, NEUTRAL).'
  ],

  analyze: async (companyData, metrics, percentiles, news, llm) => {
    const structuredModel = llm.withStructuredOutput(FrameworkSignalSchema);

    const fmtPct = (val) => (val !== null && val !== undefined) ? `${(val * 100).toFixed(1)}%` : 'N/A';
    const fmtNum = (val, dec = 2) => (val !== null && val !== undefined) ? val.toFixed(dec) : 'N/A';

    const prompt = `You are an expert equity research analyst. Analyze the competitive position and moat of ${companyData.profile.name} (${companyData.profile.ticker}) using the data below.

COMPANY PROFILE:
- Business Summary: ${companyData.profile.description}
- Sector: ${companyData.profile.sector} | Industry: ${companyData.profile.industry}

COMPUTED QUANTITATIVE MOAT MARKERS:
- Net Margin: ${fmtPct(metrics.ratios.netMargin)} (${percentiles.netMargin.label} — ${ordinal(percentiles.netMargin.percentile)} percentile)
- Margin Trend: ${metrics.trends.marginTrend || 'N/A'}
- ROE: ${fmtPct(metrics.ratios.roe)} (${percentiles.roe.label} — ${ordinal(percentiles.roe.percentile)} percentile)
- 3-Year Gross Margin history: ${JSON.stringify(companyData.historical.incomeStatements.map(item => `${item.year}: ${fmtPct(item.grossMargin)}`))}

RECENT NEWS CLUES:
${JSON.stringify(news.slice(0, 5).map(n => ({ title: n.title, content: n.content })))}

INSTRUCTIONS:
Follow these steps exactly to complete your intermediate reasoning steps (reasoning_steps):
${moatFramework.blueprint.join('\n')}

CRITICAL NEGATIVE CONSTRAINTS:
1. Do NOT use generic AI filler phrases, hedges, or placeholders (e.g. "balanced risk/reward", "wait-and-see approach", "monitoring trends carefully"). Write with authority.
2. Do NOT refer to yourself as an AI or reference system boundaries. Write like an institutional Wall Street research director.
3. Every single qualitative statement in your reasoning MUST be immediately backed by a specific quantitative metric or ratio from the provided data (e.g. "ROE stands at 76.3%"). Cite exact numbers.

Format your final response strictly to the output schema. Citing specific computed metrics in the evidence array.`;

    return await structuredModel.invoke(prompt);
  }
};
