/**
 * Cross-Source Factual News Audit Engine
 * 
 * Deterministically compares qualitative claims from news articles
 * against computed financial statement numbers to detect narrative divergences.
 */

/**
 * Audit news extraction claims against computed metrics.
 * 
 * @param {Array} extractedNews - List of structured news objects from LLM
 * @param {Object} companyMetrics - Computed company metrics
 * @returns {Array} - Array of cross-validation audit logs/flags
 */
export function auditNewsNarratives(extractedNews, companyMetrics) {
  const auditLogs = [];
  if (!Array.isArray(extractedNews) || extractedNews.length === 0) return auditLogs;

  const { ratios, trends } = companyMetrics;

  const claimIndicators = {
    growth: /growth|revenue|sales|record|explosive|expanding/i,
    balanceSheet: /balance sheet|debt|leverage|liquidity|cash|solvency/i,
    margins: /margin|profitability|gross margin|operating margin|earnings/i
  };

  extractedNews.forEach((article, idx) => {
    const claim = article.factual_claim || '';
    if (!claim) return;

    // 1. Audit Growth Narratives
    if (claimIndicators.growth.test(claim) && ratios.revenueGrowthYoY !== null) {
      const isNegativeTrend = trends.revenueTrend === 'DECELERATING' || ratios.revenueGrowthYoY <= 0;
      if (isNegativeTrend && /record|strong|robust|exploding|incredible/i.test(claim)) {
        auditLogs.push({
          articleIndex: idx,
          topic: 'growth',
          claim,
          verification: 'CONTRADICTED',
          message: `News claims robust/record growth, but computed Revenue YoY Growth is ${(ratios.revenueGrowthYoY * 100).toFixed(1)}% and the long-term trend is ${trends.revenueTrend}.`
        });
      } else if (ratios.revenueGrowthYoY > 0 && trends.revenueTrend === 'DECELERATING') {
        auditLogs.push({
          articleIndex: idx,
          topic: 'growth',
          claim,
          verification: 'PARTIALLY_VERIFIED',
          message: `News claims growth, which is directionally true, but revenue growth rate is actually decelerating.`
        });
      } else if (ratios.revenueGrowthYoY > 0.15) {
        auditLogs.push({
          articleIndex: idx,
          topic: 'growth',
          claim,
          verification: 'VERIFIED',
          message: `Revenue growth of ${(ratios.revenueGrowthYoY * 100).toFixed(1)}% supports the news narrative.`
        });
      }
    }

    // 2. Audit Balance Sheet / Leverage Narratives
    if (claimIndicators.balanceSheet.test(claim) && ratios.debtToEquity !== null) {
      const highLeverage = ratios.debtToEquity > 1.2;
      const risingDebt = trends.leverageTrend === 'ACCELERATING';

      if ((highLeverage || risingDebt) && /strong|clean|improving|low debt|healthy/i.test(claim)) {
        auditLogs.push({
          articleIndex: idx,
          topic: 'leverage',
          claim,
          verification: 'CONTRADICTED',
          message: `News claims healthy/low debt balance sheet, but Debt-to-Equity is high (${ratios.debtToEquity.toFixed(2)}) and leverage is ${trends.leverageTrend}.`
        });
      } else if (ratios.debtToEquity < 0.25) {
        auditLogs.push({
          articleIndex: idx,
          topic: 'leverage',
          claim,
          verification: 'VERIFIED',
          message: `Debt-to-Equity ratio of ${ratios.debtToEquity.toFixed(2)} verifies low-leverage claims.`
        });
      }
    }

    // 3. Audit Margin Narratives
    if (claimIndicators.margins.test(claim)) {
      const marginErosion = trends.marginTrend === 'DECELERATING';
      if (marginErosion && /expanding|improving|record profits|strong margin/i.test(claim)) {
        auditLogs.push({
          articleIndex: idx,
          topic: 'margins',
          claim,
          verification: 'CONTRADICTED',
          message: `News claims expanding margins, but computed profit margins are currently eroding.`
        });
      } else if (ratios.netMargin !== null && ratios.netMargin > 0.15 && trends.marginTrend === 'ACCELERATING') {
        auditLogs.push({
          articleIndex: idx,
          topic: 'margins',
          claim,
          verification: 'VERIFIED',
          message: `Net profit margin of ${(ratios.netMargin * 100).toFixed(1)}% with an accelerating trend confirms expansion claims.`
        });
      }
    }
  });

  return auditLogs;
}
