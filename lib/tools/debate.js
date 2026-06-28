/**
 * Integrated Evidence-Locked Debate Engine
 * 
 * Runs a single-call integrated debate generating Bull, Bear, and Steelman perspectives.
 * Enforces Zod schema parsing and citations to normalized metrics/quotes.
 */

import { IntegratedDebateSchema } from '../utils/schemas.js';

/**
 * Executes the integrated debate.
 * 
 * @param {Object} companyData - Normalized data bundle
 * @param {Object} metrics - Computed metrics
 * @param {Object} percentiles - Sector percentiles
 * @param {Object} frameworksSignals - Resolved framework signals
 * @param {Array} news - Extracted news articles
 * @param {Object} llm - Gemini Pro client
 */
export async function runIntegratedDebate(companyData, metrics, percentiles, frameworksSignals, news, llm) {
  console.log(`Executing evidence-locked debate for: ${companyData.profile.ticker}`);

  const structuredModel = llm.withStructuredOutput(IntegratedDebateSchema);

  const fmtPct = (val) => (val !== null && val !== undefined) ? `${(val * 100).toFixed(1)}%` : 'N/A';
  const fmtNum = (val, dec = 2) => (val !== null && val !== undefined) ? val.toFixed(dec) : 'N/A';
  const fmtVal = (val, suffix = '') => (val !== null && val !== undefined) ? `${val}${suffix}` : 'N/A';

  const prompt = `You are a moderator for a rigorous investment committee. You have two highly opinionated analysts: a Bull Analyst (defending the investment) and a Bear Analyst (finding every reason to pass).

We are debating: ${companyData.profile.name} (${companyData.profile.ticker})
Sector: ${companyData.profile.sector} | Industry: ${companyData.profile.industry}

COMPUTED QUANTITATIVE BUNDLE:
- Current Price: ${metrics.latest.stockPrice ? metrics.latest.stockPrice + ' ' + companyData.profile.currency : 'N/A'}
- Trailing P/E: ${fmtVal(metrics.latest.pe, 'x')} (Percentile: ${percentiles.pe.percentile})
- Revenue Growth YoY: ${fmtPct(metrics.ratios.revenueGrowthYoY)} (Percentile: ${percentiles.revenueGrowth.percentile})
- Net Margin: ${fmtPct(metrics.ratios.netMargin)} (Percentile: ${percentiles.netMargin.percentile})
- Debt-to-Equity: ${fmtNum(metrics.ratios.debtToEquity)} (Percentile: ${percentiles.debtToEquity.percentile})
- Cash Flow Quality: ${fmtNum(metrics.ratios.cashFlowQuality)}

RESOLVED FRAMEWORK SIGNALS:
- Fundamental Analysis: ${frameworksSignals.fundamental.direction} (Strength: ${frameworksSignals.fundamental.strength}, Key Driver: ${frameworksSignals.fundamental.key_driver})
- Moat & Competitive: ${frameworksSignals.moat.direction} (Strength: ${frameworksSignals.moat.strength}, Key Driver: ${frameworksSignals.moat.key_driver})
- Risk & Macro: ${frameworksSignals.risk.direction} (Strength: ${frameworksSignals.risk.strength}, Key Driver: ${frameworksSignals.risk.key_driver})
- Valuation Analysis: ${frameworksSignals.valuation.direction} (Strength: ${frameworksSignals.valuation.strength}, Key Driver: ${frameworksSignals.valuation.key_driver})

SWARM INTELLIGENCE SIGNALS:
- Risk & Solvency Agent: ${frameworksSignals.swarm?.risk?.signal || 'N/A'} (Primary Risk: ${frameworksSignals.swarm?.risk?.primary_risk_driver || 'N/A'})
- Macro Sentiment Agent: ${frameworksSignals.swarm?.sentiment?.signal || 'N/A'} (Tone: ${frameworksSignals.swarm?.sentiment?.overall_tone || 'N/A'})
- Insider Trading Agent: ${frameworksSignals.swarm?.insider?.signal || 'N/A'} (Conviction: ${frameworksSignals.swarm?.insider?.management_confidence || 'N/A'})

RECENT MARKET NEWS:
${JSON.stringify(news.slice(0, 5).map(n => ({ title: n.title, content: n.content })))}

DEBATE INSTRUCTIONS:
1. Construct 2-4 distinct, evidence-backed Bull arguments. For each, the Bear Analyst must write a specific, sharp counter-argument based on the data.
2. Construct 2-4 distinct, evidence-backed Bear arguments. For each, the Bull Analyst must write a specific, sharp counter-argument based on the data.
3. Every argument MUST cite a specific computed metric or fact from the bundle. No generic or speculative claims.
4. Steelman Bull: The Bear analyst must state the Bull's single most compelling argument and explain why it has genuine merit.
5. Steelman Bear: The Bull analyst must state the Bear's single most compelling argument and explain why it has genuine merit.

CRITICAL NEGATIVE CONSTRAINTS:
1. Do NOT use generic AI filler phrases, hedges, or placeholders (e.g. "balanced risk/reward", "wait-and-see approach", "monitoring trends carefully"). Write with authority.
2. Do NOT refer to yourself as an AI or reference system boundaries. Write like an institutional Wall Street research director.
3. Every single qualitative statement in your reasoning MUST be immediately backed by a specific quantitative metric or ratio from the provided data. Cite exact numbers.

Respond strictly following the IntegratedDebateSchema JSON structure.`;

  try {
    return await structuredModel.invoke(prompt);
  } catch (error) {
    console.error('Debate invocation failed, falling back to basic mock debate:', error.message);
    // Graceful degradation fallback
    return {
      bull_arguments: [
        {
          claim: 'Strong sector positioning in growth metrics',
          evidence: `YoY Revenue Growth of ${fmtPct(metrics.ratios.revenueGrowthYoY)}`,
          counter_argument: 'Valuation already premiums this growth rate heavily'
        }
      ],
      bear_arguments: [
        {
          claim: 'High interest rate environment compresses valuations',
          evidence: `Current trailing P/E of ${metrics.latest.pe ? metrics.latest.pe.toFixed(1) + 'x' : 'elevated ratio'}`,
          counter_argument: 'Earnings power and competitive moat offset rate sensitivity'
        }
      ],
      steelman_bull: 'Strong revenue trajectory and solid market share',
      steelman_bear: 'Interest rate headwinds and multiple compression risk'
    };
  }
}
