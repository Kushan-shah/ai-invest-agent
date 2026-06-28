/**
 * End-to-End Test for the LangGraph workflow
 * 
 * Run with: node --env-file=.env.local lib/tests/testGraph.mjs "Apple"
 */

import { investmentGraph } from '../agent/graph.js';
import { searchCompany } from '../tools/yahooFinance.js';

const QUERY = process.argv[2] || 'Apple';

async function main() {
  console.log(`🚀 Starting Full LangGraph Workflow Test for: "${QUERY}"`);
  console.log('='.repeat(70));

  try {
    // 1. Resolve Ticker
    console.log(`🔍 Resolving ticker for "${QUERY}"...`);
    const searchRes = await searchCompany(QUERY);
    if (!searchRes.success || searchRes.data.length === 0) {
      console.error(`❌ Could not resolve "${QUERY}" to a ticker.`);
      return;
    }
    const ticker = searchRes.data[0].ticker;
    const name = searchRes.data[0].name;
    console.log(`✅ Resolved Ticker: ${ticker} (${name})`);

    // 2. Execute Graph Stream
    console.log(`\n🤖 Launching LangGraph stream...`);
    const stream = await investmentGraph.stream(
      { ticker },
      { streamMode: 'updates' }
    );

    const cumulativeState = { ticker };

    for await (const chunk of stream) {
      const nodeName = Object.keys(chunk)[0];
      const nodeState = chunk[nodeName];
      
      console.log(`\n📍 Node Completed: [${nodeName}]`);
      
      // Print the latest progress log
      if (nodeState.progressLogs && nodeState.progressLogs.length > 0) {
        const latestLog = nodeState.progressLogs[nodeState.progressLogs.length - 1];
        console.log(`   Progress Log: "${latestLog.message}"`);
      }
      
      Object.assign(cumulativeState, nodeState);
    }

    console.log('\n' + '='.repeat(70));
    console.log('🏁 GRAPH EXECUTION COMPLETE');
    console.log('='.repeat(70));

    // 3. Print Final Results
    console.log(`\n🏢 COMPANY: ${cumulativeState.companyName} (${cumulativeState.ticker})`);
    console.log(`🏷️ VERDICT: ${cumulativeState.verdict.label} (Score: ${cumulativeState.verdict.score} / +3.0)`);
    console.log(`💬 DISCLOSURE: "${cumulativeState.verdict.disclosure}"`);
    console.log(`📈 LIFECYCLE CLASSIFIED: ${cumulativeState.verdict.lifecycleUsed}`);
    console.log(`⚖️ WEIGHTS USED: ${JSON.stringify(cumulativeState.verdict.appliedWeights)}`);

    console.log('\n📜 VERDICT DOSSIER REPORT:');
    console.log(`   Verdict Summary:\n   "${cumulativeState.report.verdict_summary}"`);
    console.log(`\n   Investment Thesis:\n   "${cumulativeState.report.investment_thesis}"`);
    
    console.log('\n🔍 MONITORED CATALYSTS & METRICS:');
    console.log(`   Catalysts to watch:`, cumulativeState.report.key_catalysts);
    console.log(`   Metrics to monitor:`, cumulativeState.report.monitoring_metrics);

    console.log('\n📝 DETAILED ANALYSIS (MARKDOWN):');
    console.log(cumulativeState.report.detailed_analysis_markdown);

  } catch (error) {
    console.error('❌ E2E Graph Test failed:', error);
  }
}

main();
