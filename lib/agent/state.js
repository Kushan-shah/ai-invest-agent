/**
 * LangGraph Agent State Definition
 * 
 * Defines the state schema shared across all nodes in the investment research graph.
 */

import { Annotation } from '@langchain/langgraph';

export const AgentState = Annotation.Root({
  // Input / Metadata
  ticker: Annotation(),
  companyName: Annotation(),
  sector: Annotation(),
  industry: Annotation(),
  lifecycle: Annotation(),
  customWeights: Annotation(),

  // Collected Data (Normalized)
  rawData: Annotation(), // Contains raw normalized profile, quote, historical statements, macro
  gatewayStatus: Annotation(), // Gateway passed check, completenessScore, issues list

  // Computations
  metrics: Annotation(), // Calculated margins, growth, trends
  percentiles: Annotation(), // Sector relative rankings
  anomalies: Annotation(), // Accounting/growth anomaly flags
  macroAnalysis: Annotation(), // Valuation rate adjustments

  // Framework Outputs
  frameworkSignals: Annotation(), // Outputs of Fundamental, Moat, Risk, Valuation frameworks
  validationLogs: Annotation(), // Math and consistency audit flags
  dcfValuationNote: Annotation(), // Transparent DCF divergence disclosure (softened guardrail)

  // Debate Outcomes
  debate: Annotation(), // Bull/Bear arguments & Steelman perspectives

  // Verdict & Final Report
  verdict: Annotation(), // Code-converged final verdict (BUY/ACCUMULATE/HOLD/REDUCE/AVOID) and score
  report: Annotation(), // Generated final investment report

  // Progress Logs (for SSE Streaming)
  progressLogs: Annotation() // Array of { step, status, message, timestamp }
});
