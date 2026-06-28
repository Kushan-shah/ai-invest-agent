/**
 * Test Script for Unified Financial Data Engine
 * 
 * Run with: node --env-file=.env.local lib/tests/testUnifiedData.mjs "Tesla"
 */

import { getNormalizedFinancialData } from '../tools/financialData.js';
import { searchCompany } from '../tools/yahooFinance.js';

const TEST_COMPANY = process.argv[2] || 'Tesla';

function formatLargeNumber(num) {
  if (num === null || num === undefined) return 'N/A';
  if (Math.abs(num) >= 1e12) return `$${(num / 1e12).toFixed(2)}T`;
  if (Math.abs(num) >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (Math.abs(num) >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  return `$${num.toLocaleString()}`;
}

async function run() {
  console.log(`🚀 Unified Financial Data Engine Test for: "${TEST_COMPANY}"`);
  console.log('='.repeat(70));

  try {
    // Search for company first to get ticker
    console.log(`🔍 Searching for ticker for query: "${TEST_COMPANY}"...`);
    const searchRes = await searchCompany(TEST_COMPANY);
    if (!searchRes.success || searchRes.data.length === 0) {
      console.error(`❌ Could not resolve "${TEST_COMPANY}" to a ticker.`);
      return;
    }
    const ticker = searchRes.data[0].ticker;
    console.log(`✅ Resolved to ticker: ${ticker} (${searchRes.data[0].name})`);

    const result = await getNormalizedFinancialData(ticker);

    if (!result.success) {
      console.error('❌ Fetch failed:', result.error);
      return;
    }

    console.log('\n🔍 RAW COMPONENT STATUS:');
    const { profile, quote, analystTargets, historical, macro } = result.data;
    const { passed, completenessScore, issues } = result.gateway;
    console.log(`   Yahoo Finance Profile: ${profile.name ? '✅ Found' : '❌ Missing'}`);
    console.log(`   Completeness Score: ${(completenessScore * 100).toFixed(0)}%`);
    if (issues.length > 0) {
      console.log('   Issues:');
      issues.forEach(iss => console.log(`     - ${iss}`));
    }

    console.log('\n🏢 PROFILE:');
    console.log(`   Name: ${profile.name} (${profile.ticker})`);
    console.log(`   Sector: ${profile.sector} | Industry: ${profile.industry}`);
    console.log(`   Exchange: ${profile.exchange} | Currency: ${profile.currency}`);
    console.log(`   Website: ${profile.website} | Employees: ${profile.employees}`);

    console.log('\n📈 QUOTE:');
    console.log(`   Price: ${quote.price}`);
    console.log(`   Change: ${quote.change} (${quote.changePercent}%)`);
    console.log(`   Market Cap: ${formatLargeNumber(quote.marketCap)}`);
    console.log(`   P/E (Trailing): ${quote.pe}`);
    console.log(`   P/E (Forward): ${quote.forwardPe}`);
    console.log(`   EPS: ${quote.eps}`);
    console.log(`   PEG: ${quote.pegRatio}`);

    console.log('\n🏛️ MACRO DATA (Cached/Fetched):');
    console.log(`   10-Yr Treasury Yield: ${macro.TREASURY_YIELD}%`);
    console.log(`   CPI (Inflation Index): ${macro.CPI}%`);
    console.log(`   General Inflation: ${macro.INFLATION}%`);
    console.log(`   GDP: ${macro.GDP}%`);

    console.log('\n🎯 ANALYST TARGETS:');
    console.log(`   Mean Target: ${analystTargets.targetMean}`);
    console.log(`   High Target: ${analystTargets.targetHigh}`);
    console.log(`   Low Target: ${analystTargets.targetLow}`);
    console.log(`   Recommendations Count: ${analystTargets.recommendations?.length || 0}`);

    console.log('\n📅 HISTORICAL FINANCIALS (NORMALIZED):');
    console.log('   Income Statements (Recent 4):');
    historical.incomeStatements.slice(0, 4).forEach(item => {
      console.log(`     Year ${item.year}: Rev: ${formatLargeNumber(item.revenue)} | Net Inc: ${formatLargeNumber(item.netIncome)} | Net Margin: ${(item.netMargin * 100).toFixed(1)}%`);
    });

    console.log('   Balance Sheets (Recent 4):');
    historical.balanceSheets.slice(0, 4).forEach(item => {
      console.log(`     Year ${item.year}: Assets: ${formatLargeNumber(item.totalAssets)} | Liab: ${formatLargeNumber(item.totalLiabilities)} | Equity: ${formatLargeNumber(item.equity)} | Debt/Equity: ${item.debtToEquity?.toFixed(2)}`);
    });

    console.log('   Cash Flows (Recent 4):');
    historical.cashFlows.slice(0, 4).forEach(item => {
      console.log(`     Year ${item.year}: Op Cash: ${formatLargeNumber(item.operatingCashflow)} | Capex: ${formatLargeNumber(item.capex)} | FCF: ${formatLargeNumber(item.freeCashflow)}`);
    });

  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

run();
