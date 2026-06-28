/**
 * End-to-End Test for Parallel Frameworks, Debate, and Validation
 * 
 * Run with: node --env-file=.env.local lib/tests/testFrameworks.mjs "Tesla"
 */

import { searchCompany } from '../tools/yahooFinance.js';
import { getNormalizedFinancialData } from '../tools/financialData.js';
import { calculateCompanyMetrics } from '../compute/metrics.js';
import { computeSectorPercentiles } from '../compute/percentiles.js';
import { detectAnomalies, assessMacroContext } from '../compute/anomalies.js';
import { runAllFrameworks } from '../frameworks/registry.js';
import { runRiskAgent } from '../agent/subagents/riskAgent.js';
import { runEarningsCallAgent } from '../agent/subagents/earningsCallAgent.js';
import { runInsiderAgent } from '../agent/subagents/insiderAgent.js';
import { runIntegratedDebate } from '../tools/debate.js';
import { validateLLMOutput } from '../validation/multiMethodValidation.js';
import { geminiPro } from '../utils/llm.js';

const TEST_COMPANY = process.argv[2] || 'Tesla';

async function main() {
  console.log(`🚀 Starting Full Agent Reasoning Flow Test for: "${TEST_COMPANY}"`);
  console.log('='.repeat(70));

  try {
    // 1. Resolve Ticker
    const searchRes = await searchCompany(TEST_COMPANY);
    if (!searchRes.success || searchRes.data.length === 0) {
      console.error(`❌ Could not resolve "${TEST_COMPANY}" to a ticker.`);
      return;
    }
    const ticker = searchRes.data[0].ticker;
    console.log(`✅ Resolved Ticker: ${ticker}`);

    // 2. Fetch & Normalize Data
    const dataRes = await getNormalizedFinancialData(ticker);
    if (!dataRes.success) {
      console.error('❌ Data collection failed:', dataRes.error);
      return;
    }
    const companyData = dataRes.data;

    // 3. Compute Metrics
    console.log('\n⚙️ Computing metrics & ratios...');
    const metrics = calculateCompanyMetrics(companyData);
    if (!metrics.success) {
      console.error('❌ Metrics calculation failed:', metrics.error);
      return;
    }

    // 4. Compute Sector Percentiles
    console.log('\n📊 Computing sector percentiles...');
    const percentiles = await computeSectorPercentiles(ticker, metrics, companyData.profile.sector);

    // 5. Detect Anomalies & Macro Context
    console.log('\n🔍 Running anomaly detection & macro filter...');
    const anomalies = detectAnomalies(metrics, companyData, percentiles);
    const macroAnalysis = assessMacroContext(metrics, companyData.macro);

    console.log(`   Found ${anomalies.length} anomaly flags.`);
    console.log(`   Valuation Multiplier: ${macroAnalysis.valuationPenaltyMultiplier}`);

    // 6. Run Frameworks & Swarm Sub-Agents in Parallel
    console.log('\n🤖 Running 4 Parallel Reasoning Frameworks & 2 Swarm Sub-Agents via Gemini Pro (temp=0)...');
    const startTime = Date.now();
    const [signals, riskAgentResult, earningsAgentResult, insiderAgentResult] = await Promise.all([
      runAllFrameworks(
        companyData,
        metrics,
        percentiles,
        anomalies,
        macroAnalysis,
        [], // No news extracted yet for frameworks
        geminiPro
      ),
      runRiskAgent(companyData, metrics, percentiles, geminiPro),
      runEarningsCallAgent(companyData, [], geminiPro),
      runInsiderAgent(companyData, geminiPro)
    ]);
    
    signals.swarm = {
      risk: riskAgentResult,
      sentiment: earningsAgentResult,
      insider: insiderAgentResult
    };

    const frameworkDuration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Frameworks & Swarm completed in ${frameworkDuration}s!`);

    // Log Framework Outputs
    Object.entries(signals).forEach(([name, sig]) => {
      console.log(`\n--- ${name.toUpperCase()} SIGNAL ---`);
      console.log(`    Direction: ${sig.direction} (Strength: ${sig.strength})`);
      console.log(`    Key Driver: ${sig.key_driver}`);
      console.log(`    Uncertainty: ${sig.uncertainty}`);
      
      if (['fundamental', 'moat', 'risk', 'valuation'].includes(name)) {
        // Run Validation
        const val = validateLLMOutput(name === 'fundamental' ? 'fundamental_analysis' : name === 'valuation' ? 'valuation_analysis' : name, sig, companyData, metrics);
        console.log(`    Validation Status: ${val.valid ? '✅ PASSED' : '⚠️ WARNINGS'}`);
        if (val.warnings.length > 0) {
          console.log('    Warnings:');
          val.warnings.forEach(w => console.log(`      - ${w.message || w.context}`));
        }
      }
    });

    console.log(`\n--- SWARM: RISK AGENT ---`);
    console.log(`    Signal: ${signals.swarm.risk?.signal}`);
    console.log(`    Primary Risk: ${signals.swarm.risk?.primary_risk_driver}`);
    console.log(`    Solvency Assessment: ${signals.swarm.risk?.solvency_assessment}`);

    console.log(`\n--- SWARM: SENTIMENT AGENT ---`);
    console.log(`    Tone: ${signals.swarm.sentiment?.overall_tone} (Signal: ${signals.swarm.sentiment?.signal})`);
    console.log(`    Market Froth: ${signals.swarm.sentiment?.market_froth_indicator}`);

    console.log(`\n--- SWARM: INSIDER TRADING AGENT ---`);
    console.log(`    Conviction: ${signals.swarm.insider?.management_confidence}`);
    console.log(`    Signal: ${signals.swarm.insider?.signal}`);
    if (signals.swarm.insider?.key_transactions) {
      signals.swarm.insider.key_transactions.forEach(t => console.log(`      - ${t}`));
    }

    // 7. Run Integrated Debate
    console.log('\n⚔️ Running integrated Bull/Bear Evidence-Locked Debate (1 call)...');
    const debateStart = Date.now();
    const debate = await runIntegratedDebate(
      companyData,
      metrics,
      percentiles,
      signals,
      [], // Empty news for testing
      geminiPro
    );
    const debateDuration = ((Date.now() - debateStart) / 1000).toFixed(1);
    console.log(`✅ Debate completed in ${debateDuration}s!`);

    console.log('\n🎭 DEBATE OUTCOMES:');
    console.log('   Bull Arguments:');
    debate.bull_arguments.forEach(arg => console.log(`     - [BULL]: ${arg.claim}\n       [BEAR COUNTER]: ${arg.counter_argument}`));
    console.log('\n   Bear Arguments:');
    debate.bear_arguments.forEach(arg => console.log(`     - [BEAR]: ${arg.claim}\n       [BULL COUNTER]: ${arg.counter_argument}`));

    console.log('\n💪 STEELMANS:');
    console.log(`   Steelman Bull: ${debate.steelman_bull}`);
    console.log(`   Steelman Bear: ${debate.steelman_bear}`);

  } catch (error) {
    console.error('❌ E2E Flow test failed:', error);
  }
}

main();
