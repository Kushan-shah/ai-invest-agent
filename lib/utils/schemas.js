/**
 * Zod Schemas for Structured LLM Outputs
 */

import { z } from 'zod';

/**
 * [5d] Structured News Extraction Schema
 */
export const NewsArticleExtractionSchema = z.object({
  sentiment: z.enum(['POSITIVE', 'NEGATIVE', 'NEUTRAL']),
  magnitude: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  topics: z.array(z.enum([
    'earnings', 'product', 'regulatory', 'management', 
    'competition', 'legal', 'expansion', 'other'
  ])),
  factual_claim: z.string().describe('One key quantitative or factual claim from this article (e.g. Revenue grew 12%)'),
  supporting_quote: z.string().describe('Exact quote from the text backing up the factual claim'),
  relevance_to_investment: z.string().describe('A brief explanation of how this affects an investor\'s thesis')
});

export const NewsExtractionResponseSchema = z.object({
  articles: z.array(NewsArticleExtractionSchema)
});

/**
 * [Swarm] Risk Assessment Sub-Agent Schema
 */
export const RiskAssessmentSchema = z.object({
  primary_risk_driver: z.string().describe('The single largest existential threat to the business model'),
  solvency_assessment: z.string().describe('Assessment of balance sheet solvency and cash burn trajectory'),
  valuation_risk_pricing: z.string().describe('Determination of if the current valuation accurately prices in these risks'),
  signal: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']).describe('BULLISH = Low Risk, NEUTRAL = Manageable, BEARISH = High/Toxic Risk')
});

/**
 * [Swarm] Sentiment & Earnings Sub-Agent Schema
 */
export const SentimentAssessmentSchema = z.object({
  overall_tone: z.enum(['HAWKISH', 'DOVISH', 'MIXED']),
  forward_guidance_shifts: z.array(z.string()).describe('Identified shifts in management forward guidance or macro headwinds'),
  market_froth_indicator: z.string().describe('Detection of market over-optimism (froth) or over-pessimism (capitulation)'),
  signal: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']).describe('BULLISH = Positive Flow, NEUTRAL = Mixed, BEARISH = Negative Flow')
});

/**
 * [Swarm] Insider & Congressional Trading Sub-Agent Schema
 */
export const InsiderAssessmentSchema = z.object({
  key_transactions: z.array(z.string()).describe('List of significant insider buys/sells or structural patterns observed'),
  management_confidence: z.string().describe('Assessment of management conviction (e.g. capitulation selling vs cluster buying)'),
  signal: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']).describe('BULLISH = Net Accumulation, NEUTRAL = Balanced/10b5-1 selling, BEARISH = Mass Exodus')
});

/**
 * [6] Framework Output Schema (Fundamental, Moat, Risk, Valuation)
 */
export const FrameworkSignalSchema = z.object({
  direction: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']),
  strength: z.enum(['STRONG', 'MODERATE', 'WEAK']),
  key_driver: z.string().describe('The primary quantitative or qualitative factor driving this signal'),
  reasoning_steps: z.array(z.string()).describe('The FinCoT intermediate reasoning steps'),
  evidence: z.array(z.object({
    claim: z.string(),
    data_point: z.string().describe('The specific number or fact cited (must exist in provided metrics)'),
    source: z.string().describe('The source, e.g. "Balance Sheet 2025" or "News Search"')
  })),
  uncertainty: z.string().describe('What event or metric change would invalidate this framework signal')
});

/**
 * [9] Integrated Evidence-Battle (Debate) Schema
 */
export const IntegratedDebateSchema = z.object({
  bull_arguments: z.array(z.object({
    claim: z.string(),
    evidence: z.string().describe('Factual metric or quote backing this up'),
    counter_argument: z.string().describe('The bear analyst\'s response to this specific claim')
  })).min(2).max(4),
  bear_arguments: z.array(z.object({
    claim: z.string(),
    evidence: z.string().describe('Factual metric or quote backing this up'),
    counter_argument: z.string().describe('The bull analyst\'s response to this specific claim')
  })).min(2).max(4),
  steelman_bull: z.string().describe('The bear analyst stating the bull\'s single most compelling point and why it is valid'),
  steelman_bear: z.string().describe('The bull analyst stating the bear\'s single most compelling point and why it is valid')
});

/**
 * [11] Thesis & Report Generation Schema
 */
export const ValuationScenarioSchema = z.object({
  growth: z.number().describe('FCF growth rate (e.g. 0.08 for 8%)'),
  margin: z.number().describe('Target FCF margin (e.g. 0.15 for 15%)'),
  wacc: z.number().describe('Discount rate / WACC (e.g. 0.09 for 9%)'),
  terminal: z.number().describe('Terminal growth rate (e.g. 0.025 for 2.5%)')
});

export const FinalReportSchema = z.object({
  verdict_summary: z.string().describe('A 2-sentence executive summary of the buy/hold/avoid decision'),
  investment_thesis: z.string().describe('The core rationale behind the investment verdict'),
  key_catalysts: z.array(z.string()).describe('List of upcoming catalysts or milestones to watch'),
  monitoring_metrics: z.array(z.string()).describe('Metrics to track that could trigger a thesis revision'),
  valuation_scenarios: z.object({
    bear: ValuationScenarioSchema,
    base: ValuationScenarioSchema,
    bull: ValuationScenarioSchema
  }).describe('The specific valuation parameters used for the Bear, Base, and Bull cases in the DCF analysis'),
  detailed_analysis_markdown: z.string().describe('Full markdown-formatted report containing all sections (Thesis, Strengths, Risks, Scenarios, assumptions)')
});
