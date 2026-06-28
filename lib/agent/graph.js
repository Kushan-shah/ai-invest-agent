/**
 * LangGraph Agent Orchestration Graph
 * 
 * Defines the sequential execution flow and conditional branches.
 */

import { StateGraph } from '@langchain/langgraph';
import { AgentState } from './state.js';
import { getNormalizedFinancialData } from '../tools/financialData.js';
import { calculateCompanyMetrics } from '../compute/metrics.js';
import { computeSectorPercentiles } from '../compute/percentiles.js';
import { detectAnomalies, assessMacroContext } from '../compute/anomalies.js';
import { runAllFrameworks } from '../frameworks/registry.js';
import { runIntegratedDebate } from '../tools/debate.js';
import { validateLLMOutput } from '../validation/multiMethodValidation.js';
import { geminiFlash, geminiPro } from '../utils/llm.js';
import { FinalReportSchema } from '../utils/schemas.js';
import { multiSearch, buildUniversalQueries } from '../tools/webSearch.js';
import { calculateBaselineDCF, calculateReverseDCF } from '../frameworks/valuation.js';
import { runRiskAgent } from './subagents/riskAgent.js';
import { runEarningsCallAgent } from './subagents/earningsCallAgent.js';
import { runInsiderAgent } from './subagents/insiderAgent.js';

// Helper to log progress updates
function appendLog(state, step, status, message) {
  const currentLogs = state.progressLogs || [];
  return [
    ...currentLogs,
    { step, status, message, timestamp: new Date().toISOString() }
  ];
}

/**
 * 1. Data Collection Node
 */
async function collectDataNode(state) {
  const ticker = state.ticker;
  console.log(`[Node: Collect Data] Fetching for: ${ticker}`);
  
  const result = await getNormalizedFinancialData(ticker);
  
  if (!result.success) {
    throw new Error(`Data collection failed for ${ticker}: ${result.error}`);
  }

  const companyName = result.data.profile.name;
  const sector = result.data.profile.sector;
  const industry = result.data.profile.industry;
  const exchange = result.data.profile.exchange;

  // Run Tavily search
  console.log(`[Node: Collect Data] Running Tavily news search for: ${companyName}`);
  let news = [];
  try {
    const searchQueries = buildUniversalQueries(companyName, ticker, sector, exchange);
    const searchResult = await multiSearch(searchQueries);
    if (searchResult.success) {
      news = searchResult.data;
    }
  } catch (err) {
    console.warn('Tavily news search failed during collection:', err.message);
  }

  // Inject news into data bundle
  result.data.news = news;

  const passedCheck = result.gateway.passed;
  const statusMsg = passedCheck
    ? `Data sufficiency gateway passed. TTM statement data verified.`
    : `Gateway warnings: ${result.gateway.issues.join(', ')}. Initializing sparse data fallback.`;

  return {
    companyName,
    sector,
    industry,
    rawData: result.data,
    gatewayStatus: result.gateway,
    progressLogs: appendLog(state, 'COLLECT_DATA', passedCheck ? 'SUCCESS' : 'WARNING', statusMsg)
  };
}

/**
 * 2. Compute Foundation Node
 */
async function computeFoundationNode(state) {
  console.log(`[Node: Compute Foundation] Running math engines...`);
  
  const metrics = calculateCompanyMetrics(state.rawData);
  const percentiles = await computeSectorPercentiles(state.ticker, metrics, state.sector);
  const anomalies = detectAnomalies(metrics, state.rawData, percentiles);
  const macroAnalysis = assessMacroContext(metrics, state.rawData.macro);

  // Lifecycle classification
  const ratios = metrics.ratios;
  const latestVal = metrics.latest;
  const trendsDir = metrics.trends;

  let lifecycle = 'MATURE';
  if (latestVal.revenue < 100e6 && latestVal.netIncome < 0) {
    lifecycle = 'EARLY_STAGE';
  } else if (ratios.revenueGrowthYoY > 0.15 && ratios.netMargin > 0) {
    lifecycle = 'GROWTH';
  } else if (ratios.revenueGrowthYoY < 0 && trendsDir.marginTrend === 'DECELERATING') {
    lifecycle = 'DECLINING';
  }

  console.log(`[Node: Compute Foundation] Lifecycle classified as: ${lifecycle}`);

  return {
    metrics,
    percentiles,
    anomalies,
    macroAnalysis,
    lifecycle,
    progressLogs: appendLog(state, 'COMPUTE_FOUNDATION', 'SUCCESS', `Metric trends, sector percentiles, anomalies, and ${lifecycle} lifecycle calculated.`)
  };
}

/**
 * 3. Run Frameworks Node
 */
async function runFrameworksNode(state) {
  console.log(`[Node: Run Frameworks] Invoking LLM reasoning frameworks...`);

  // Run the sequential registry runner and the swarm sub-agents in parallel
  const [signals, riskAgentResult, earningsAgentResult, insiderAgentResult] = await Promise.all([
    runAllFrameworks(
      state.rawData,
      state.metrics,
      state.percentiles,
      state.anomalies,
      state.macroAnalysis,
      state.rawData.news || [],
      geminiPro
    ),
    runRiskAgent(
      state.rawData,
      state.metrics,
      state.percentiles,
      geminiPro
    ),
    runEarningsCallAgent(
      state.rawData,
      state.rawData.news || [],
      geminiPro
    ),
    runInsiderAgent(
      state.rawData,
      geminiPro
    )
  ]);
  
  // Inject the Swarm Intelligence back into the framework signals context
  signals.swarm = {
    risk: riskAgentResult,
    sentiment: earningsAgentResult,
    insider: insiderAgentResult
  };

  // Validate outputs
  const validationLogs = {};
  Object.entries(signals).forEach(([name, sig]) => {
    const frameworkId = name === 'fundamental' ? 'fundamental_analysis' : name === 'valuation' ? 'valuation_analysis' : name;
    validationLogs[name] = validateLLMOutput(frameworkId, sig, state.rawData, state.metrics);
  });

  // DCF Transparency Note (softened guardrail — disclose, don't override)
  // Instead of forcing BULLISH → NEUTRAL based on a backward-looking DCF,
  // we now attach a transparent disclosure note so the trader can see both perspectives.
  let dcfValuationNote = null;
  if (signals.valuation) {
    const yield10Y = state.rawData?.macro?.TREASURY_YIELD || 4.25;
    const baselineDcf = calculateBaselineDCF(state.rawData, state.metrics, yield10Y);
    if (baselineDcf && baselineDcf.discount < -0.20) {
      const overvalPct = Math.abs(baselineDcf.discount * 100);
      const curr = state.rawData?.quote?.financialCurrency || state.rawData?.quote?.currency || 'USD';
      const formatPrice = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: curr.toUpperCase() }).format(val);
      
      dcfValuationNote = {
        type: 'DCF_DIVERGENCE',
        severity: overvalPct > 50 ? 'HIGH' : 'MEDIUM',
        overvalPct: parseFloat(overvalPct.toFixed(1)),
        dcfIntrinsicPrice: baselineDcf.intrinsicPrice,
        currentPrice: state.metrics.latest.stockPrice || 0,
        growthRateUsed: baselineDcf.growthRate,
        message: `Note: The backward-looking DCF model (using ${(baselineDcf.growthRate * 100).toFixed(1)}% historical growth) estimates intrinsic value at ${formatPrice(baselineDcf.intrinsicPrice)}, which is ${overvalPct.toFixed(1)}% below the current price of ${formatPrice(state.metrics.latest.stockPrice || 0)}. This DCF uses last year's revenue growth as the projection input. See the Reverse DCF for what growth rate the market actually implies.`
      };
      
      console.log(`[Guardrail] DCF divergence noted (${overvalPct.toFixed(1)}% gap). Disclosed transparently instead of overriding signal.`);
    }
  }

  return {
    frameworkSignals: signals,
    validationLogs,
    dcfValuationNote,
    progressLogs: appendLog(state, 'RUN_FRAMEWORKS', 'SUCCESS', 'Fundamental, Moat, Risk, and Valuation framework analyses completed.')
  };
}

/**
 * 4. Run Debate Node
 */
async function runDebateNode(state) {
  console.log(`[Node: Run Debate] Moderating integrated Bull/Bear debate...`);

  const debate = await runIntegratedDebate(
    state.rawData,
    state.metrics,
    state.percentiles,
    state.frameworkSignals,
    state.rawData.news || [],
    geminiPro
  );

  return {
    debate,
    progressLogs: appendLog(state, 'RUN_DEBATE', 'SUCCESS', 'Evidence-locked Bull vs Bear debate and steelman reviews concluded.')
  };
}

/**
 * 5. Compute Verdict Node
 */
async function computeVerdictNode(state) {
  console.log(`[Node: Compute Verdict] Converging signals...`);

  // Compute Reverse DCF (implied growth rate from market price)
  let reverseDcf = null;
  try {
    const yield10Y = state.rawData?.macro?.TREASURY_YIELD || 4.25;
    reverseDcf = calculateReverseDCF(state.rawData, state.metrics, yield10Y);
    if (reverseDcf) {
      console.log(`[Reverse DCF] Implied growth rate: ${(reverseDcf.impliedGrowthRate * 100).toFixed(1)}% | Market expectation: ${reverseDcf.marketExpectation}`);
    }
  } catch (err) {
    console.warn('[Reverse DCF] Calculation failed:', err.message);
  }

  const signals = state.frameworkSignals;
  const lifecycle = state.lifecycle || 'MATURE';

  // Adaptive Weights based on Lifecycle or Custom Overrides
  let weights = state.customWeights || {
    fundamental: 0.30,
    moat: 0.20,
    risk: 0.30,
    valuation: 0.20
  };

  if (!state.customWeights) {
    if (lifecycle === 'EARLY_STAGE') {
      weights = {
        fundamental: 0.20,
        moat: 0.30,
        risk: 0.40,
        valuation: 0.10
      };
    } else if (lifecycle === 'GROWTH') {
      weights = {
        fundamental: 0.30,
        moat: 0.30,
        risk: 0.20,
        valuation: 0.20
      };
    } else if (lifecycle === 'DECLINING') {
      weights = {
        fundamental: 0.20,
        moat: 0.10,
        risk: 0.50,
        valuation: 0.20
      };
    }
  }

  // Convert signals to scores
  const scoreMapping = {
    'STRONG': { 'BULLISH': 3, 'BEARISH': -3, 'NEUTRAL': 0 },
    'MODERATE': { 'BULLISH': 2, 'BEARISH': -2, 'NEUTRAL': 0 },
    'WEAK': { 'BULLISH': 1, 'BEARISH': -1, 'NEUTRAL': 0 }
  };

  let totalScore = 0;
  Object.keys(weights).forEach(key => {
    const sig = signals[key];
    const score = scoreMapping[sig.strength]?.[sig.direction] || 0;
    totalScore += score * weights[key];
  });

  // Apply macro valuation penalty if active
  const macroPenalty = state.macroAnalysis.valuationPenaltyMultiplier;
  if (macroPenalty < 1.0) {
    const valScore = scoreMapping[signals.valuation.strength]?.[signals.valuation.direction] || 0;
    totalScore -= (valScore * weights.valuation * (1 - macroPenalty));
  }

  // Helper: extract the first sentence of a key_driver string for concise disclosure
  const firstSentence = (str) => {
    if (!str) return '';
    const match = str.match(/^[^.!?]+[.!?]/);
    return match ? match[0].trim() : str.slice(0, 120).trim();
  };

  // Determine label
  let verdictLabel = 'HOLD';
  let disclosure = '';

  if (totalScore > 1.5) {
    verdictLabel = 'BUY';
  } else if (totalScore > 0.5) {
    verdictLabel = 'ACCUMULATE';
  } else if (totalScore < -1.5) {
    verdictLabel = 'AVOID';
  } else if (totalScore < -0.5) {
    verdictLabel = 'REDUCE';
  }

  // Dynamic disclosure: compile from actual framework key drivers (no boilerplate)
  if (verdictLabel === 'BUY' || verdictLabel === 'ACCUMULATE') {
    disclosure = `${verdictLabel} rating is supported by ${firstSentence(signals.fundamental.key_driver)} Moat assessment: ${firstSentence(signals.moat.key_driver)}`;
  } else if (verdictLabel === 'AVOID' || verdictLabel === 'REDUCE') {
    disclosure = `${verdictLabel} rating is driven by ${firstSentence(signals.risk.key_driver)} Valuation concern: ${firstSentence(signals.valuation.key_driver)}`;
  } else {
    disclosure = `HOLD rating reflects ${firstSentence(signals.fundamental.key_driver)} Balanced against: ${firstSentence(signals.valuation.key_driver)}`;
  }

  // Institutional Risk Guardrail 1: Downgrade BUY/ACCUMULATE to HOLD if high-severity anomalies exist
  const hasHighSeverityAnomaly = state.anomalies?.some(anom => anom.severity === 'HIGH');
  if (hasHighSeverityAnomaly && (verdictLabel === 'BUY' || verdictLabel === 'ACCUMULATE')) {
    const prevVerdict = verdictLabel;
    verdictLabel = 'HOLD';
    totalScore = 0.0;
    disclosure = `Downgraded from ${prevVerdict} to HOLD due to high-severity accounting anomaly: ${state.anomalies.find(anom => anom.severity === 'HIGH').message}`;
  }

  let valuationAlert = null;
  // Institutional Risk Guardrail 2: Valuation Bubble Alert (Dual-Stance Stance)
  // If the current stock price exceeds the bull-case intrinsic value from the DCF model,
  // set a valuation alert instead of forcing a downgrade.
  if (verdictLabel === 'BUY' || verdictLabel === 'ACCUMULATE') {
    try {
      const yield10Y = state.rawData?.macro?.TREASURY_YIELD || 4.25;
      const bullDcf = calculateBaselineDCF(state.rawData, state.metrics, yield10Y, { growthPremium: 0.03, marginPremium: 0.02 });
      const currentPrice = state.metrics?.latest?.stockPrice || state.rawData?.quote?.price || 0;
      if (bullDcf && bullDcf.intrinsicPrice > 0 && currentPrice > bullDcf.intrinsicPrice) {
        const overshoot = (currentPrice / bullDcf.intrinsicPrice) - 1;
        const curr = state.rawData?.quote?.financialCurrency || state.rawData?.quote?.currency || 'USD';
        const formatPrice = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: curr.toUpperCase() }).format(val);

        valuationAlert = {
          overshootPercent: parseFloat((overshoot * 100).toFixed(1)),
          bullIntrinsicPrice: bullDcf.intrinsicPrice,
          message: `Trading Stance is bullish, but the stock trades ${parseFloat((overshoot * 100).toFixed(0))}% above our bull-case DCF fair value (${formatPrice(bullDcf.intrinsicPrice)} vs ${formatPrice(currentPrice)}). Momentum & growth signals are strong, but long-term margin of safety is compressed.`
        };
        
        console.log(`[Guardrail] Valuation bubble alert set: price $${currentPrice.toFixed(2)} vs bull DCF $${bullDcf.intrinsicPrice.toFixed(2)}, overshoot ${(overshoot * 100).toFixed(1)}%.`);
      }
    } catch (err) {
      console.warn('[Guardrail] Valuation bubble alert calculation skipped:', err.message);
    }
  }

  const decision = (verdictLabel === 'BUY' || verdictLabel === 'ACCUMULATE') ? 'INVEST' : (verdictLabel === 'HOLD' ? 'HOLD' : 'PASS');

  // Build Convergence Summary: where do all independent lenses agree/disagree?
  const convergence = {
    lenses: {
      fundamental: signals.fundamental?.direction || 'N/A',
      moat: signals.moat?.direction || 'N/A',
      risk: signals.risk?.direction || 'N/A',
      valuation: signals.valuation?.direction || 'N/A',
      swarmRisk: signals.swarm?.risk?.signal || 'N/A',
      swarmSentiment: signals.swarm?.sentiment?.signal || 'N/A',
      swarmInsider: signals.swarm?.insider?.signal || 'N/A'
    },
    reverseDcf: reverseDcf ? {
      impliedGrowth: reverseDcf.impliedGrowthRate,
      marketExpectation: reverseDcf.marketExpectation,
      interpretation: reverseDcf.interpretation
    } : null,
    dcfNote: state.dcfValuationNote || null
  };

  // Count agreement
  const allDirections = Object.values(convergence.lenses).filter(d => d !== 'N/A');
  const bullishCount = allDirections.filter(d => d === 'BULLISH').length;
  const bearishCount = allDirections.filter(d => d === 'BEARISH').length;
  const neutralCount = allDirections.filter(d => d === 'NEUTRAL').length;
  convergence.agreement = {
    bullish: bullishCount,
    bearish: bearishCount,
    neutral: neutralCount,
    total: allDirections.length,
    dominant: bullishCount >= bearishCount && bullishCount >= neutralCount ? 'BULLISH' :
              bearishCount >= bullishCount && bearishCount >= neutralCount ? 'BEARISH' : 'NEUTRAL',
    unanimity: Math.max(bullishCount, bearishCount, neutralCount) / allDirections.length
  };

  return {
    verdict: {
      score: parseFloat(totalScore.toFixed(2)),
      decision,
      label: verdictLabel,
      disclosure,
      lifecycleUsed: lifecycle,
      appliedWeights: weights,
      valuationAlert: valuationAlert,
      reverseDcf: reverseDcf,
      convergence: convergence
    },
    progressLogs: appendLog(state, 'COMPUTE_VERDICT', 'SUCCESS', `Signal convergence completed using ${lifecycle} weights. Final verdict: ${decision} (${verdictLabel}) (Score: ${totalScore.toFixed(2)}).`)
  };
}

/**
 * 6. Generate Report Node
 */
async function generateReportNode(state) {
  console.log(`[Node: Generate Report] Compiling final dossier...`);

  const structuredModel = geminiPro.withStructuredOutput(FinalReportSchema);

  const quote = state.rawData?.quote || {};
  const profile = state.rawData?.profile || {};
  const is = state.rawData?.historical?.incomeStatements || [];
  const bs = state.rawData?.historical?.balanceSheets || [];
  const cf = state.rawData?.historical?.cashFlows || [];
  const macro = state.rawData?.macro || {};
  const ratios = state.metrics?.ratios || {};
  const trends = state.metrics?.trends || {};
  const percentiles = state.percentiles || {};
  const anomalies = state.anomalies || [];

  // Helper to format numbers
  const formatPct = (v) => (v != null ? `${(v * 100).toFixed(2)}%` : 'N/A');
  const formatBillion = (v) => (v != null ? `$${(v / 1e9).toFixed(2)}B` : 'N/A');

  const historyStr = `HISTORICAL FINANCIALS (NORMALIZED):
${is.map(item => {
    const bal = bs.find(b => b.year === item.year) || {};
    const cashFlow = cf.find(c => c.year === item.year) || {};
    return `- Year ${item.year}: 
  * Revenue: ${formatBillion(item.revenue)} (Gross Margin: ${formatPct(item.grossMargin)}, Operating Margin: ${formatPct(item.operatingMargin)}, Net Margin: ${formatPct(item.netMargin)})
  * Net Income: ${formatBillion(item.netIncome)} (EPS: ${item.eps || 'N/A'})
  * Balance Sheet: Assets ${formatBillion(bal.totalAssets)}, Liab ${formatBillion(bal.totalLiabilities)}, Equity ${formatBillion(bal.equity)}, Debt-to-Equity ${bal.debtToEquity != null ? bal.debtToEquity.toFixed(2) : 'N/A'}
  * Cash Flow: Operating Cashflow ${formatBillion(cashFlow.operatingCashflow)}, Capex ${formatBillion(cashFlow.capex)}, Free Cashflow ${formatBillion(cashFlow.freeCashflow)}`;
}).join('\n')}`;

  const ratiosStr = `CALCULATED INVESTMENT RATIOS & TRENDS:
- Profitability: Gross Margin ${formatPct(ratios.grossMargin)}, Operating Margin ${formatPct(ratios.operatingMargin)}, Net Margin ${formatPct(ratios.netMargin)}, ROE ${formatPct(ratios.roe)}, ROA ${formatPct(ratios.roa)}, ROCE ${formatPct(ratios.roce)}
- Solvency: Debt-to-Equity ${ratios.debtToEquity != null ? ratios.debtToEquity.toFixed(2) : 'N/A'}
- Efficiency: Cash Flow Quality ${ratios.cashFlowQuality != null ? ratios.cashFlowQuality.toFixed(2) : 'N/A'}, FCF Yield ${formatPct(ratios.fcfYield)}
- Trends: Revenue is ${trends.revenueTrend}, Net Margin is ${trends.marginTrend}, Leverage is ${trends.leverageTrend}`;

  const percentilesStr = `SECTOR BENCHMARKING (PERCENTILE RANKINGS IN ${profile.sector} SECTOR):
- P/E Ratio: Target Value: ${quote.pe || 'N/A'} (Percentile: ${percentiles.pe?.percentile || 'N/A'}% - ${percentiles.pe?.label || 'N/A'})
- Net Margin: Target Value: ${formatPct(ratios.netMargin)} (Percentile: ${percentiles.netMargin?.percentile || 'N/A'}% - ${percentiles.netMargin?.label || 'N/A'})
- Revenue Growth: Target Value: ${formatPct(ratios.revenueGrowthYoY)} (Percentile: ${percentiles.revenueGrowth?.percentile || 'N/A'}% - ${percentiles.revenueGrowth?.label || 'N/A'})
- Debt-to-Equity: Target Value: ${ratios.debtToEquity != null ? ratios.debtToEquity.toFixed(2) : 'N/A'} (Percentile: ${percentiles.debtToEquity?.percentile || 'N/A'}% - ${percentiles.debtToEquity?.label || 'N/A'})
- ROE: Target Value: ${formatPct(ratios.roe)} (Percentile: ${percentiles.roe?.percentile || 'N/A'}% - ${percentiles.roe?.label || 'N/A'})`;

  const anomaliesStr = `DETECTED AUDIT ANOMALIES:
${anomalies.length > 0 ? anomalies.map(a => `- [${a.severity} Severity] ${a.message}`).join('\n') : 'No accounting or growth anomalies detected.'}`;

  const macroStr = `FRED MACROECONOMIC INDICATORS:
- 10-Yr Treasury Yield (WACC Base): ${macro.TREASURY_YIELD || 'N/A'}%
- CPI (Inflation Index): ${macro.CPI || 'N/A'}%
- YoY General Inflation: ${macro.INFLATION || 'N/A'}%
- GDP Growth: ${macro.GDP || 'N/A'}%`;

  const prompt = `You are a managing director and senior equity research analyst at a top global investment bank (e.g., Goldman Sachs, Morgan Stanley). Write an institutional-grade, professional research dossier for ${state.companyName} (${state.ticker}).

Your output must be deeply quantitative, analytical, and objective. Banish all generic AI filler and boilerplate statements (such as "balanced risk/reward, monitoring core trends" or "wait and see phase"). Ground your thesis, arguments, and scenarios directly in the actual financial data and metrics provided below. CITE specific numbers (margins, growth rates, debt ratios, currency figures in ${state.rawData.profile.currency || 'USD'}) in every section of your analysis.

VERDICT METADATA:
- Investment Decision: ${state.verdict.decision} (Rating: ${state.verdict.label})
- Composite Score: ${state.verdict.score}
- Disclosure: ${state.verdict.disclosure}

FRAMEWORK SIGNALS SUMMARY:
- Fundamental: ${state.frameworkSignals.fundamental.direction} (Key Driver: ${state.frameworkSignals.fundamental.key_driver})
- Moat: ${state.frameworkSignals.moat.direction} (Key Driver: ${state.frameworkSignals.moat.key_driver})
- Risk: ${state.frameworkSignals.risk.direction} (Key Driver: ${state.frameworkSignals.risk.key_driver})
- Valuation: ${state.frameworkSignals.valuation.direction} (Key Driver: ${state.frameworkSignals.valuation.key_driver})

DEBATE HIGHLIGHTS:
- Bull Steelman: ${state.debate.steelman_bull}
- Bear Steelman: ${state.debate.steelman_bear}

REVERSE DCF (MARKET-IMPLIED GROWTH ANALYSIS):
${state.verdict.reverseDcf ? `- Market-Implied Annual Growth Rate: ${(state.verdict.reverseDcf.impliedGrowthRate * 100).toFixed(1)}%
- Historical Revenue Growth (Last Reported): ${(state.verdict.reverseDcf.historicalGrowthRate * 100).toFixed(1)}%
- Growth Gap: ${(state.verdict.reverseDcf.growthGap * 100).toFixed(1)}%
- Market Expectation: ${state.verdict.reverseDcf.marketExpectation}
- Interpretation: ${state.verdict.reverseDcf.interpretation}` : '- Reverse DCF data not available.'}

CONVERGENCE SUMMARY (MULTI-LENS AGREEMENT):
${state.verdict.convergence ? `- Bullish Lenses: ${state.verdict.convergence.agreement?.bullish || 0} out of ${state.verdict.convergence.agreement?.total || 0}
- Bearish Lenses: ${state.verdict.convergence.agreement?.bearish || 0} out of ${state.verdict.convergence.agreement?.total || 0}
- Neutral Lenses: ${state.verdict.convergence.agreement?.neutral || 0} out of ${state.verdict.convergence.agreement?.total || 0}
- Dominant Signal: ${state.verdict.convergence.agreement?.dominant || 'N/A'}
- Unanimity: ${state.verdict.convergence.agreement?.unanimity ? (state.verdict.convergence.agreement.unanimity * 100).toFixed(0) + '%' : 'N/A'}` : '- Convergence data not available.'}
${state.dcfValuationNote ? `\nDCF TRANSPARENCY NOTE:\n- ${state.dcfValuationNote.message}` : ''}

${historyStr}

${ratiosStr}

${percentilesStr}

${anomaliesStr}

${macroStr}

INSTRUCTIONS:
1. Write a compelling, sophisticated two-sentence executive summary for the verdict_summary.
2. In investment_thesis, write a highly structured, data-driven core rationale for the rating.
3. In detailed_analysis_markdown, write a comprehensive, publication-ready research report with the following mandatory sections:
   ### Thesis
   A rigorous, data-driven synthesis explaining why the rating is justified. You must explicitly reference key historical trends (revenue, net income), capital returns (ROE, ROCE), and valuation multiples (Trailing and Forward P/E) to frame the company's valuation.
   
   ### Key Strengths
   A bulleted list of 2-3 major operational or financial advantages. Detail these with actual figures:
   * **Balance Sheet & Leverage**: Citing the exact Debt-to-Equity ratio (${ratios.debtToEquity != null ? ratios.debtToEquity.toFixed(2) : 'N/A'}), cash holdings, and interest coverage.
   * **Profitability & Capital Returns**: Citing margins (Gross: ${formatPct(ratios.grossMargin)}, Operating: ${formatPct(ratios.operatingMargin)}, Net: ${formatPct(ratios.netMargin)}), ROE (${formatPct(ratios.roe)}), and sector percentiles.
   
   ### Risks & Vulnerabilities
   A bulleted list of 2-3 major risks. Explicitly address:
   * **Valuation / Multiple Compression**: Detail the current Trailing P/E ratio (${quote.pe || 'N/A'}) compared to sector medians.
   * **Operating Margin Stability & Headwinds**: Citing recent margin trends and competitive pressures.
   * **Audit & Anomalies**: Address any anomalies listed under DETECTED AUDIT ANOMALIES. If none are present, discuss the significance of a clean audit ledger.
   
   ### Scenarios
   Outline concrete Bull, Base, and Bear cases. Define specific numerical parameters for each case (e.g., FCF Growth rates, terminal growth rates, target margins, and discount rates/WACC influenced by the current 10-Yr Treasury Yield of ${macro.TREASURY_YIELD || 'N/A'}%).
      ### Key Assumptions
    Specify the exact parameters underpinning the valuation models (WACC, terminal growth, tax rate, and outstanding share count).

4. In valuation_scenarios, output the precise Bear, Base, and Bull case parameters (growth, margin, wacc, terminal) that correspond to your scenario analysis. Ensure WACC is in decimal (e.g. 0.085 for 8.5%), growth is in decimal (e.g. 0.12 for 12%), margin is in decimal, and terminal growth is in decimal.

CRITICAL NEGATIVE CONSTRAINTS:
1. Do NOT use generic AI filler phrases, hedges, or placeholders (e.g. "balanced risk/reward", "wait-and-see approach", "monitoring trends carefully"). Write with authority.
2. Do NOT refer to yourself as an AI or reference system boundaries. Write like an institutional Wall Street research director.
3. Every single qualitative statement in your reasoning and thesis MUST be immediately backed by a specific quantitative metric or ratio from the provided quantitative data. Cite exact numbers.
4. When citing revenue growth or other rates, match the precise mathematical calculations from the data (e.g. 14.93% for Microsoft's FY2025 revenue growth based on $245.12B to $281.72B) but feel free to clarify that it rounds to the officially reported figure (e.g. 15% YoY growth). Always cite both the exact unrounded rate and the official rounded rate to preserve the highest precision of the Verified Math Layer.

Ensure the entire report reads like an official financial publication that will be presented to institutional clients. Banish all placeholder phrases, conversational filler, and meta-commentary.

Output strictly conforming to the FinalReportSchema.`;

  const report = await structuredModel.invoke(prompt);

  return {
    report,
    progressLogs: appendLog(state, 'GENERATE_REPORT', 'SUCCESS', 'Investment research report successfully compiled and validated.')
  };
}

/**
 * 7. Sparse Fallback Report Node
 */
async function generateSparseReportNode(state) {
  console.log(`[Node: Generate Sparse Report] Falling back...`);

  const structuredModel = geminiFlash.withStructuredOutput(FinalReportSchema);

  const prompt = `You are an investment analyst. Write a Sparse Data Qualitative Report for ${state.ticker}.
  We have insufficient financial statements, so we are conducting a search-based qualitative review.
  
  GATEWAY CONSTRAINTS:
  - Missing Data: ${state.gatewayStatus.issues.join(', ')}
  
  Write a qualitative warning and analysis. Output the valuation_scenarios with standard default parameters (e.g. growth 0.0, margin 0.10, wacc 0.09, terminal 0.025 for all cases bear, base, and bull) and conform to the FinalReportSchema.`;

  const report = await structuredModel.invoke(prompt);

  return {
    verdict: { score: 0, decision: 'PASS', label: 'HOLD', disclosure: 'Sparse data fallback' },
    report,
    progressLogs: appendLog(state, 'SPARSE_FALLBACK', 'SUCCESS', 'Sparse report generated due to missing financial statement series.')
  };
}

/**
 * 8. Routing gateway function
 */
function routeAfterCollection(state) {
  if (state.gatewayStatus?.passed) {
    return 'computeFoundation';
  }
  return 'generateSparseReport';
}

// Build the LangGraph StateGraph
const workflow = new StateGraph(AgentState)
  .addNode('collectData', collectDataNode)
  .addNode('computeFoundation', computeFoundationNode)
  .addNode('runFrameworks', runFrameworksNode)
  .addNode('runDebate', runDebateNode)
  .addNode('computeVerdict', computeVerdictNode)
  .addNode('generateReport', generateReportNode)
  .addNode('generateSparseReport', generateSparseReportNode);

// Configure Edges
workflow.addEdge('__start__', 'collectData');

workflow.addConditionalEdges(
  'collectData',
  routeAfterCollection,
  {
    computeFoundation: 'computeFoundation',
    generateSparseReport: 'generateSparseReport'
  }
);

workflow.addEdge('computeFoundation', 'runFrameworks');
workflow.addEdge('runFrameworks', 'runDebate');
workflow.addEdge('runDebate', 'computeVerdict');
workflow.addEdge('computeVerdict', 'generateReport');

workflow.addEdge('generateReport', '__end__');
workflow.addEdge('generateSparseReport', '__end__');

export const investmentGraph = workflow.compile();
