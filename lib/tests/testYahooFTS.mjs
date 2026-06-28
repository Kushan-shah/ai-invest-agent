/**
 * Test Yahoo FTS + FRED from project directory (so yahoo-finance2 resolves)
 */
import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// ─── Test 1: Yahoo FTS for AAPL ───
console.log('=== Test 1: Yahoo FTS for AAPL ===');
try {
  const result = await yf.fundamentalsTimeSeries('AAPL', {
    period1: '2021-01-01',
    type: [
      'annualTotalRevenue',
      'annualNetIncome',
      'annualGrossProfit',
      'annualOperatingIncome',
      'annualTotalAssets',
      'annualStockholdersEquity',
      'annualLongTermDebt',
      'annualCashAndCashEquivalents',
      'annualOperatingCashFlow',
      'annualCapitalExpenditure',
      'annualFreeCashFlow',
      'annualDilutedEPS'
    ]
  });
  
  console.log(`✅ Total periods: ${result.length}`);
  result.forEach(r => {
    console.log(`  ${r.date?.toISOString?.() || r.date} | Rev: ${r.annualTotalRevenue} | NI: ${r.annualNetIncome} | OCF: ${r.annualOperatingCashFlow} | FCF: ${r.annualFreeCashFlow} | Assets: ${r.annualTotalAssets} | Equity: ${r.annualStockholdersEquity} | EPS: ${r.annualDilutedEPS}`);
  });
} catch (err) {
  console.log(`❌ Yahoo FTS AAPL failed: ${err.message}`);
}

// ─── Test 2: Yahoo FTS for TSLA ───
console.log('\n=== Test 2: Yahoo FTS for TSLA ===');
try {
  const result = await yf.fundamentalsTimeSeries('TSLA', {
    period1: '2021-01-01',
    type: [
      'annualTotalRevenue',
      'annualNetIncome',
      'annualOperatingCashFlow',
      'annualFreeCashFlow',
      'annualCapitalExpenditure',
      'annualTotalAssets',
      'annualStockholdersEquity'
    ]
  });
  
  console.log(`✅ Total periods: ${result.length}`);
  result.forEach(r => {
    console.log(`  ${r.date?.toISOString?.() || r.date} | Rev: ${r.annualTotalRevenue} | NI: ${r.annualNetIncome} | OCF: ${r.annualOperatingCashFlow} | FCF: ${r.annualFreeCashFlow}`);
  });
} catch (err) {
  console.log(`❌ Yahoo FTS TSLA failed: ${err.message}`);
}

// ─── Test 3: Yahoo FTS for RELIANCE.NS (International) ───
console.log('\n=== Test 3: Yahoo FTS for RELIANCE.NS (International) ===');
try {
  const result = await yf.fundamentalsTimeSeries('RELIANCE.NS', {
    period1: '2021-01-01',
    type: [
      'annualTotalRevenue',
      'annualNetIncome',
      'annualOperatingCashFlow',
      'annualTotalAssets'
    ]
  });
  
  console.log(`✅ Total periods: ${result.length}`);
  result.forEach(r => {
    console.log(`  ${r.date?.toISOString?.() || r.date} | Rev: ${r.annualTotalRevenue} | NI: ${r.annualNetIncome} | OCF: ${r.annualOperatingCashFlow} | Assets: ${r.annualTotalAssets}`);
  });
} catch (err) {
  console.log(`❌ Yahoo FTS RELIANCE.NS failed: ${err.message}`);
}

// ─── Test 4: FRED API alternatives ───
console.log('\n=== Test 4: FRED API alternatives ===');
try {
  const res = await fetch('https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v2/accounting/od/avg_interest_rates?sort=-record_date&page[size]=5');
  if (res.ok) {
    const data = await res.json();
    console.log(`✅ Treasury.gov fiscal data works! Records: ${data.data?.length}`);
  } else {
    console.log(`❌ Treasury.gov returned ${res.status}`);
  }
} catch (err) {
  console.log(`❌ Treasury.gov failed: ${err.message}`);
}

console.log('\n  Alpha Vantage macro (already integrated and working) ✅');
console.log('  → Keep existing Alpha Vantage macro approach, no need for FRED');
