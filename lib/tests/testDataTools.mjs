/**
 * Test Script — Step 1 & 2: Data Tools Evaluation
 * 
 * Run with: node --env-file=.env.local lib/tests/testDataTools.mjs
 * 
 * This script tests both Yahoo Finance and Tavily search tools
 * with a real company so you can evaluate data quality.
 */

import { searchCompany, fetchCompleteFinancialData } from '../tools/yahooFinance.js';
import { search, multiSearch, buildUniversalQueries } from '../tools/webSearch.js';

const TEST_COMPANY = process.argv[2] || 'Tesla';

async function testYahooFinance() {
  console.log('='.repeat(70));
  console.log(`📊 TESTING YAHOO FINANCE — "${TEST_COMPANY}"`);
  console.log('='.repeat(70));

  // Test 1: Company Search
  console.log('\n🔍 Step 1: Searching for company...');
  const searchResult = await searchCompany(TEST_COMPANY);
  
  if (!searchResult.success) {
    console.log(`❌ Search failed: ${searchResult.error}`);
    return null;
  }

  console.log(`✅ Found ${searchResult.data.length} matches:`);
  searchResult.data.forEach((c, i) => {
    console.log(`   ${i + 1}. ${c.name} (${c.ticker}) — ${c.exchange}`);
  });

  const ticker = searchResult.data[0].ticker;
  console.log(`\n📌 Using ticker: ${ticker}`);

  // Test 2: Complete Financial Data
  console.log('\n📈 Step 2: Fetching complete financial data...');
  const financials = await fetchCompleteFinancialData(ticker);

  console.log(`\n📋 Data Completeness: ${(financials.completeness * 100).toFixed(0)}%`);
  Object.entries(financials.completenessDetail).forEach(([source, ok]) => {
    console.log(`   ${ok ? '✅' : '❌'} ${source}`);
  });

  if (financials.errors.length > 0) {
    console.log('\n⚠️  Errors:');
    financials.errors.forEach(e => console.log(`   - ${e.source}: ${e.error}`));
  }

  // Display key metrics
  const q = financials.data.quote;
  const s = financials.data.stats;
  const p = financials.data.profile;
  const h = financials.data.historical;

  if (q) {
    console.log('\n--- QUOTE DATA ---');
    console.log(`   Price: ${q.currency} ${q.currentPrice}`);
    console.log(`   Market Cap: ${formatLargeNumber(q.marketCap)}`);
    console.log(`   P/E (Trailing): ${q.trailingPE?.toFixed(2) || 'N/A'}`);
    console.log(`   P/E (Forward): ${q.forwardPE?.toFixed(2) || 'N/A'}`);
    console.log(`   EPS: ${q.eps?.toFixed(2) || 'N/A'}`);
    console.log(`   52W Range: ${q.fiftyTwoWeekLow} — ${q.fiftyTwoWeekHigh}`);
    console.log(`   Dividend Yield: ${q.dividendYield ? (q.dividendYield * 100).toFixed(2) + '%' : 'None'}`);
  }

  if (p) {
    console.log('\n--- COMPANY PROFILE ---');
    console.log(`   Sector: ${p.sector}`);
    console.log(`   Industry: ${p.industry}`);
    console.log(`   Country: ${p.country}`);
    console.log(`   Employees: ${p.employees?.toLocaleString() || 'N/A'}`);
    console.log(`   Description: ${p.description?.substring(0, 150)}...`);
  }

  if (s) {
    console.log('\n--- KEY STATISTICS ---');
    console.log(`   Revenue: ${formatLargeNumber(s.totalRevenue)}`);
    console.log(`   Revenue Growth: ${s.revenueGrowth ? (s.revenueGrowth * 100).toFixed(2) + '%' : 'N/A'}`);
    console.log(`   Profit Margin: ${s.profitMargin ? (s.profitMargin * 100).toFixed(2) + '%' : 'N/A'}`);
    console.log(`   Operating Margin: ${s.operatingMargin ? (s.operatingMargin * 100).toFixed(2) + '%' : 'N/A'}`);
    console.log(`   Gross Margin: ${s.grossMargin ? (s.grossMargin * 100).toFixed(2) + '%' : 'N/A'}`);
    console.log(`   ROE: ${s.returnOnEquity ? (s.returnOnEquity * 100).toFixed(2) + '%' : 'N/A'}`);
    console.log(`   Debt/Equity: ${s.debtToEquity?.toFixed(2) || 'N/A'}`);
    console.log(`   Current Ratio: ${s.currentRatio?.toFixed(2) || 'N/A'}`);
    console.log(`   Free Cash Flow: ${formatLargeNumber(s.freeCashflow)}`);
    console.log(`   Operating Cash Flow: ${formatLargeNumber(s.operatingCashflow)}`);
    console.log(`   Beta: ${s.beta?.toFixed(2) || 'N/A'}`);
    console.log(`   Analyst Target (Mean): ${q?.currency || '$'}${s.targetMeanPrice?.toFixed(2) || 'N/A'}`);
    console.log(`   Analyst Recommendation: ${s.recommendationKey || 'N/A'}`);
  }

  if (h && h.incomeStatements?.length > 0) {
    console.log('\n--- HISTORICAL INCOME (Annual) ---');
    h.incomeStatements.forEach(stmt => {
      const date = new Date(stmt.date).getFullYear();
      console.log(`   ${date}: Revenue ${formatLargeNumber(stmt.totalRevenue)} | Net Income ${formatLargeNumber(stmt.netIncome)} | Net Margin ${stmt.netMargin ? (stmt.netMargin * 100).toFixed(1) + '%' : 'N/A'}`);
    });
  }

  return { ticker, profile: p, financials };
}

async function testTavilySearch(companyName, ticker, sector) {
  console.log('\n' + '='.repeat(70));
  console.log(`📰 TESTING TAVILY SEARCH — "${companyName}"`);
  console.log('='.repeat(70));

  // Test 1: Single search
  console.log('\n🔍 Step 1: Single search query...');
  const singleResult = await search(`${companyName} latest investment news ${new Date().getFullYear()}`, {
    topic: 'news',
    maxResults: 3,
  });

  if (singleResult.success) {
    console.log(`✅ Found ${singleResult.resultCount} results:`);
    singleResult.data.forEach((r, i) => {
      console.log(`\n   ${i + 1}. ${r.title}`);
      console.log(`      URL: ${r.url}`);
      console.log(`      Score: ${r.score?.toFixed(3) || 'N/A'}`);
      console.log(`      Content: ${r.content?.substring(0, 200)}...`);
    });
  } else {
    console.log(`❌ Search failed: ${singleResult.error}`);
  }

  // Test 2: Multi-query research (Universal Template)
  console.log('\n\n🔬 Step 2: Multi-query universal research...');
  const queries = buildUniversalQueries(companyName, ticker || '', sector || '');
  console.log(`   Running ${queries.length} parallel queries...`);

  const multiResult = await multiSearch(queries);

  console.log(`\n   ✅ ${multiResult.successfulQueries}/${multiResult.totalQueries} queries successful`);
  console.log(`   📄 ${multiResult.totalResults} unique results (deduplicated)`);

  console.log('\n   Query breakdown:');
  multiResult.queryResults.forEach(qr => {
    console.log(`   ${qr.success ? '✅' : '❌'} "${qr.query.substring(0, 50)}..." → ${qr.resultCount} results`);
  });

  console.log('\n   Top 5 results by relevance:');
  multiResult.data
    .sort((a, b) => (b.score || 0) - (a.score || 0))
    .slice(0, 5)
    .forEach((r, i) => {
      console.log(`\n   ${i + 1}. [${r.sourceQuery?.substring(0, 30)}...]`);
      console.log(`      ${r.title}`);
      console.log(`      ${r.content?.substring(0, 150)}...`);
    });
}

function formatLargeNumber(num) {
  if (num === null || num === undefined) return 'N/A';
  if (Math.abs(num) >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (Math.abs(num) >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (Math.abs(num) >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  return `$${num.toLocaleString()}`;
}

// Run tests
async function main() {
  console.log(`\n🚀 AI Investment Research Agent — Data Tools Test`);
  console.log(`   Testing with: "${TEST_COMPANY}"\n`);

  const result = await testYahooFinance();

  if (result) {
    await testTavilySearch(
      result.profile?.name || TEST_COMPANY,
      result.ticker,
      result.profile?.sector || ''
    );
  }

  console.log('\n' + '='.repeat(70));
  console.log('✅ DATA TOOLS TEST COMPLETE');
  console.log('='.repeat(70));
  console.log('\n📝 EVALUATE:');
  console.log('   1. Is the financial data rich enough for deep analysis?');
  console.log('   2. Are the search results relevant and recent?');
  console.log('   3. Any data gaps that concern you?');
  console.log('   4. Should we add any additional data sources?\n');
}

main().catch(console.error);
