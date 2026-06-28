/**
 * Sum-of-the-Parts (SOTP) Valuation Engine
 * 
 * Computes enterprise value by valuing separate business divisions independently.
 * Falls back to peer-based EBITDA multiples for consolidated metrics if segments are unavailable.
 */

export function calculateSOTP(companyData, metrics, percentiles) {
  const price = metrics.latest.stockPrice || 1.0;
  const shares = companyData.quote?.sharesOutstanding || 1.0;
  
  const latestBS = companyData.historical?.balanceSheets?.[0] || {};
  const currentDebt = latestBS.debt || 0;
  const currentCash = latestBS.cash || 0;
  
  // SOTP normally takes segment financials. Since XBRL segment data is sparse,
  // we proxy a 2-part SOTP using a 'Core' and 'Growth' division split based on
  // gross profit margins or simply applying a blended multiple.
  // In a full institutional rollout, this would ingest 10-K Note 14 Segment Reporting.
  
  const ebitda = metrics.latest.operatingIncome ? metrics.latest.operatingIncome + (metrics.latest.depreciationAndAmortization || 0) : 0;
  
  if (ebitda <= 0) {
    return { success: false, error: 'Negative EBITDA prevents SOTP multiple expansion.' };
  }
  
  // Proxy Division 1: Core Operations (80% of EBITDA)
  const coreEbitda = ebitda * 0.80;
  // Use a conservative sector multiple for the core business
  const sectorMultiple = percentiles?.pe?.sectorMedian || 15; 
  const coreEV = coreEbitda * Math.max(8, sectorMultiple * 0.6); // EV/EBITDA is usually ~60% of P/E
  
  // Proxy Division 2: Growth / Emerging Operations (20% of EBITDA)
  const growthEbitda = ebitda * 0.20;
  // Use a premium multiple for the growth wing
  const growthEV = growthEbitda * Math.max(15, sectorMultiple * 1.2);
  
  const totalEnterpriseValue = coreEV + growthEV;
  
  // Bridge to Equity Value
  const intrinsicEquityValue = totalEnterpriseValue - currentDebt + currentCash;
  const intrinsicPrice = shares > 0 ? intrinsicEquityValue / shares : 0;
  const discount = price > 0 ? (intrinsicPrice - price) / price : 0;
  
  return {
    success: true,
    intrinsicPrice,
    discount,
    divisions: [
      {
        name: 'Core Operations (Proxy)',
        ebitda: coreEbitda,
        appliedMultiple: Math.max(8, sectorMultiple * 0.6),
        enterpriseValue: coreEV
      },
      {
        name: 'Growth Segments (Proxy)',
        ebitda: growthEbitda,
        appliedMultiple: Math.max(15, sectorMultiple * 1.2),
        enterpriseValue: growthEV
      }
    ],
    totalEnterpriseValue,
    netDebt: currentDebt - currentCash
  };
}
