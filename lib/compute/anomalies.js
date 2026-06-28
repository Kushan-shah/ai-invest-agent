/**
 * Anomaly Detection & Macro Context Engine
 * 
 * 100% deterministic rules. Checks for accounting patterns, cash flow divergences,
 * leverage acceleration, margin trends, and macro-valuation indicators.
 * Surfices factual observations for the LLM to interpret contextually.
 */

import { ordinal } from '../utils/format.js';

function isDateStale(dateString, year) {
  const filingDate = dateString ? new Date(dateString) : new Date(year, 11, 31);
  const now = new Date();
  const diffMonths = (now.getFullYear() - filingDate.getFullYear()) * 12 + (now.getMonth() - filingDate.getMonth());
  return diffMonths > 18;
}

/**
 * Detects factual trends and financial divergences.
 */
export function detectAnomalies(companyMetrics, normalizedData, percentiles = null) {
  const currency = normalizedData?.quote?.financialCurrency || normalizedData?.quote?.currency || 'USD';
  const formatVal = (val) => new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase(), notation: 'compact', maximumFractionDigits: 2 }).format(val);

  const observations = [];
  const { ratios, trends, latest } = companyMetrics;
  const historical = normalizedData?.historical || {};
  const is = historical.incomeStatements || [];
  const bs = historical.balanceSheets || [];
  const cf = historical.cashFlows || [];
  
  const sector = normalizedData?.profile?.sector || 'Unknown';

  // --- 1. HISTORICAL PERIOD INTEGRITY & SEQUENCE CHECKS ---
  if (is.length > 1) {
    for (let i = 0; i < is.length - 1; i++) {
      if (is[i].year <= is[i+1].year) {
        observations.push({
          id: 'OUT_OF_SEQUENCE_YEARS',
          category: 'DATA_INTEGRITY',
          severity: 'HIGH',
          year: is[i].year,
          message: `Income statements are not in strictly descending chronological order (FY${is[i].year} followed by FY${is[i+1].year}).`
        });
      }
    }
  }

  // --- 2. MULTI-YEAR CONTINUOUS ACCOUNTING AUDITS ---
  is.forEach(incomeItem => {
    const year = incomeItem.year;
    if (isDateStale(incomeItem.date, year)) {
      return;
    }

    const balanceItem = bs.find(b => b.year === year);
    const cashFlowItem = cf.find(c => c.year === year);

    // A. Balance Sheet Balancing Check: Assets = Liabilities + Equity
    if (balanceItem) {
      const assets = balanceItem.totalAssets;
      const liabilities = balanceItem.totalLiabilities;
      const equity = balanceItem.equity;

      if (assets !== null && liabilities !== null && equity !== null && assets > 0) {
        const diff = Math.abs(assets - (liabilities + equity));
        const diffPercent = diff / assets;
        if (diffPercent > 0.015) { // Threshold > 1.5% mismatch
          observations.push({
            id: 'UNBALANCED_BALANCE_SHEET',
            category: 'ACCOUNTING_ANOMALY',
            severity: diffPercent > 0.05 ? 'HIGH' : 'MEDIUM',
            year: year,
            message: `Balance sheet mismatch in FY${year}: Total Assets (${formatVal(assets)}) do not equal Liabilities (${formatVal(liabilities)}) + Equity (${formatVal(equity)}). Discrepancy: ${formatVal(diff)} (${(diffPercent * 100).toFixed(2)}%).`
          });
        }
      }

      // Negative Equity check
      if (equity !== null && equity < 0) {
        observations.push({
          id: 'NEGATIVE_EQUITY',
          category: 'SOLVENCY_ANOMALY',
          severity: 'HIGH',
          year: year,
          message: `Negative equity (capital deficit) of ${formatVal(equity)} detected in FY${year}, indicating high risk of insolvency.`
        });
      }
    }

    // B. Cash Flow Reconciliation Check: FCF = Operating Cash Flow - Capex (capex is negative in our statements)
    if (cashFlowItem) {
      const ocf = cashFlowItem.operatingCashflow;
      const capex = cashFlowItem.capex; // expected to be negative
      const fcf = cashFlowItem.freeCashflow;

      if (ocf !== null && capex !== null && fcf !== null) {
        const expectedFcf = ocf + capex; // since capex is negative
        const diff = Math.abs(fcf - expectedFcf);
        const refVal = Math.max(1e6, Math.abs(fcf)); // Avoid division by zero
        const diffPercent = diff / refVal;

        if (diffPercent > 0.05 && diff > 1e6) { // Discrepancy > 5% and > $1M
          observations.push({
            id: 'UNRECONCILED_CASH_FLOW',
            category: 'ACCOUNTING_ANOMALY',
            severity: 'MEDIUM',
            year: year,
            message: `Cash flow reconciliation mismatch in FY${year}: Reported FCF (${formatVal(fcf)}) does not equal OCF (${formatVal(ocf)}) plus Capex (${formatVal(capex)}). Discrepancy: ${formatVal(diff)}.`
          });
        }
      }

      // Earnings Quality check per year: OCF should support Net Income
      const netIncome = incomeItem.netIncome;
      if (ocf !== null && netIncome !== null && netIncome > 0) {
        const qualityRatio = ocf / netIncome;
        if (qualityRatio < 0.75) {
          observations.push({
            id: 'LOW_EARNINGS_QUALITY',
            category: 'CASH_FLOW_QUALITY',
            severity: 'MEDIUM',
            year: year,
            message: `Operating cash flow (${formatVal(ocf)}) lags net income (${formatVal(netIncome)}) in FY${year} (ratio: ${qualityRatio.toFixed(2)}), suggesting low earnings quality (accrual expansion).`
          });
        } else if (qualityRatio > 1.1) {
          observations.push({
            id: 'HIGH_EARNINGS_QUALITY',
            category: 'CASH_FLOW_QUALITY',
            severity: 'LOW',
            year: year,
            message: `OCF: ${formatVal(ocf)}, Net Income: ${formatVal(netIncome)}, Ratio: ${qualityRatio.toFixed(2)} — HIGH earnings quality (cash exceeds income)`
          });
        }
      }
    }

    // C. DuPont Factor Anomaly Checks
    if (balanceItem) {
      const assets = balanceItem.totalAssets;
      const equity = balanceItem.equity;
      const revenue = incomeItem.revenue;
      const netIncome = incomeItem.netIncome || 0;
      
      let ebt = incomeItem.ebt;
      if (!ebt) {
        if (netIncome < 0) ebt = netIncome;
        else if (netIncome > 0) ebt = netIncome / 0.79;
        else ebt = 0;
      }

      const ebit = incomeItem.ebit || incomeItem.operatingIncome || ebt || 1.0;

      if (assets > 0 && equity > 0 && revenue > 0 && ebit > 0 && ebt !== 0) {
        const taxBurden = netIncome / ebt;
        const interestBurden = ebt / ebit;
        const assetTurnover = revenue / assets;
        const equityMult = assets / equity;

        // 1. Tax Burden Anomaly (> 1.0 indicates tax credits, < 0.30 indicates extremely low taxes)
        if (taxBurden > 1.05 && netIncome > 0) {
          observations.push({
            id: 'DUPONT_TAX_CREDIT_SURGE',
            category: 'DUPONT_ANOMALY',
            severity: 'MEDIUM',
            message: `DuPont anomaly in FY${year}: Tax Burden is ${taxBurden.toFixed(2)}x, indicating earnings are boosted by non-recurring tax credits rather than operating profit.`
          });
        }

        // 2. Interest Burden Anomaly (< 0.50 means interest eats up over 50% of EBIT)
        if (interestBurden < 0.50 && ebt > 0) {
          observations.push({
            id: 'DUPONT_INTEREST_DRAG',
            category: 'DUPONT_ANOMALY',
            severity: 'HIGH',
            message: `DuPont anomaly in FY${year}: Interest Burden is ${interestBurden.toFixed(2)}x, indicating interest costs eat up ${((1 - interestBurden) * 100).toFixed(0)}% of operating income.`
          });
        }

        // 3. Asset Turnover Anomaly (< 0.15 indicates extremely low efficiency)
        if (assetTurnover < 0.15) {
          observations.push({
            id: 'DUPONT_LOW_TURNOVER',
            category: 'DUPONT_ANOMALY',
            severity: 'MEDIUM',
            message: `DuPont anomaly in FY${year}: Asset Turnover is extremely low at ${assetTurnover.toFixed(2)}x, indicating capital inefficiency.`
          });
        }

        // 4. Excessive Gearing / Leverage Multiplier (> 5.0x for standard, higher for finance/utilities)
        let gearingLimit = 5.0;
        if (sector === 'Financial Services') {
          gearingLimit = 12.0;
        } else if (sector === 'Utilities') {
          gearingLimit = 8.0;
        }

        if (equityMult > gearingLimit) {
          const totalAssets = balanceItem?.totalAssets || 0;
          const debt = balanceItem?.debt || 0;
          const debtToAssets = totalAssets > 0 ? debt / totalAssets : 0;

          // If debt-to-assets is low, this is buyback-driven capital structure optimization, not financial gearing risk
          if (debtToAssets >= 0.40) {
            observations.push({
              id: 'DUPONT_HIGH_GEARING',
              category: 'DUPONT_ANOMALY',
              severity: equityMult > (gearingLimit * 1.5) ? 'HIGH' : 'MEDIUM',
              message: `DuPont anomaly in FY${year}: Leverage multiplier (Equity Multiplier) is elevated at ${equityMult.toFixed(2)}x (sector threshold: ${gearingLimit}x), indicating high financial gearing.`
            });
          }
        }
      }
    }
  });

  // --- 3. LIQUIDITY & DRAINING TREND CHECKS (ONLY IF NOT STALE) ---
  const isLatestStale = is[0] ? isDateStale(is[0].date, is[0].year) : true;

  if (!isLatestStale) {
    if (bs.length > 1) {
      const latestCash = bs[0].cash;
      const prevCash = bs[1].cash;
      if (latestCash !== null && prevCash !== null && prevCash > 0) {
        const cashDrain = (latestCash - prevCash) / prevCash;
        if (cashDrain < -0.4) { // Drained more than 40%
          // Check if driven by heavy Capex while OCF remains positive
          const latestCf = cf[0];
          const isCapexDriven = latestCf && latestCf.capex !== null && latestCf.operatingCashflow !== null &&
                                latestCf.operatingCashflow > 0 && Math.abs(latestCf.capex) > latestCf.operatingCashflow;
          
          observations.push({
            id: 'CASH_DRAINAGE_WARNING',
            category: 'LIQUIDITY_ANOMALY',
            severity: isCapexDriven ? 'LOW' : 'MEDIUM',
            message: `Liquidity warning: Corporate cash reserves drained by ${(Math.abs(cashDrain) * 100).toFixed(1)}% year-over-year, from ${formatVal(prevCash)} down to ${formatVal(latestCash)}.${isCapexDriven ? ' (Driven by heavy capital reinvestment/Capex exceeding operating cash flow).' : ''}`
          });
        }
      }
    }

    // --- 4. ORIGINAL CORE ANOMALIES ---
    if (ratios.revenueGrowthYoY !== null && ratios.netIncomeGrowthYoY !== null && ratios.revenueGrowthYoY > 0.05 && ratios.netIncomeGrowthYoY < -0.05) {
      observations.push({
        id: 'REVENUE_NET_INCOME_DIVERGENCE',
        category: 'GROWTH_DIVERGENCE',
        severity: 'MEDIUM',
        message: `Growth divergence: Revenue grew by ${(ratios.revenueGrowthYoY * 100).toFixed(1)}% but Net Income declined by ${(Math.abs(ratios.netIncomeGrowthYoY) * 100).toFixed(1)}%.`
      });
    }

    if (ratios.cashFlowQuality !== null && ratios.cashFlowQuality < 0.8 && latest.netIncome !== null && latest.netIncome > 0) {
      const exists = observations.some(o => o.id === 'LOW_EARNINGS_QUALITY' && o.message.includes(`FY${is[0]?.year}`));
      if (!exists) {
        observations.push({
          id: 'EARNINGS_QUALITY_ALERT',
          category: 'CASH_FLOW_QUALITY',
          severity: 'MEDIUM',
          message: `Operating Cash Flow is below Net Income (ratio: ${ratios.cashFlowQuality.toFixed(2)}).`
        });
      }
    }

    if (trends.marginTrend === 'DECELERATING') {
      observations.push({
        id: 'MARGIN_EROSION',
        category: 'MARGIN_TREND',
        severity: 'MEDIUM',
        message: 'Net profit margins have declined over the last 3 statement periods.'
      });
    }

    // --- 5. DUAL-GATE DEBT & LEVERAGE CHECKS ---
    if (ratios.debtToEquity !== null) {
      const deVal = ratios.debtToEquity;
      
      // Gate 1: Absolute Outer Guardrail (High Risk)
      if (deVal > 3.0) {
        observations.push({
          id: 'EXCESSIVE_ABSOLUTE_LEVERAGE',
          category: 'LEVERAGE_ANOMALY',
          severity: 'HIGH',
          message: `Dangerous absolute leverage detected: Debt-to-Equity ratio stands at an extreme ${deVal.toFixed(2)}x, indicating significant solvency risk.`
        });
      } else {
        // Gate 2: Sector-Specific/Percentile Gating
        let isHighLeverage = false;
        let thresholdMsg = '';

        if (percentiles && percentiles.debtToEquity) {
          const pct = percentiles.debtToEquity.percentile;
          // Since lowerIsBetter is true, pct < 20 means worst 20% of peers (highest debt)
          if (pct < 20) {
            isHighLeverage = true;
            thresholdMsg = `which ranks in the worst 20% of its sector peers (${ordinal(pct)} percentile)`;
          }
        } else {
          // Fallback static thresholds by sector if peer percentiles are unavailable
          let defaultSectorLimit = 0.8;
          if (sector === 'Utilities' || sector === 'Financial Services') {
            defaultSectorLimit = 1.6;
          } else if (sector === 'Technology') {
            defaultSectorLimit = 0.4;
          }

          if (deVal > defaultSectorLimit) {
            isHighLeverage = true;
            thresholdMsg = `which is elevated for its sector (threshold: ${defaultSectorLimit}x)`;
          }
        }

        if (isHighLeverage) {
          observations.push({
            id: 'HIGH_SECTOR_LEVERAGE',
            category: 'LEVERAGE_ANOMALY',
            severity: 'MEDIUM',
            message: `Elevated leverage: Debt-to-Equity ratio stands at ${deVal.toFixed(2)}x, ${thresholdMsg}.`
          });
        }
      }

      // Accelerating leverage warning with sector-aware limit
      let accelerateLimit = 0.5;
      if (sector === 'Utilities' || sector === 'Financial Services') {
        accelerateLimit = 1.2;
      }
      if (trends.leverageTrend === 'ACCELERATING' && deVal > accelerateLimit) {
        observations.push({
          id: 'ACCELERATING_LEVERAGE',
          category: 'LEVERAGE_ACCELERATION',
          severity: 'MEDIUM',
          message: `Leverage is accelerating: Debt-to-Equity has risen and stands at a high of ${deVal.toFixed(2)}x.`
        });
      }
    }

    // --- 6. DUAL-GATE VALUATION CHECKS ---
    const peVal = latest.pe;
    if (peVal !== null && peVal > 0) {
      // Gate 1: Absolute Outer Guardrail (High Risk)
      if (peVal > 80.0) {
        observations.push({
          id: 'ABSOLUTE_OVERVALUATION_BUBBLE',
          category: 'VALUATION_ANOMALY',
          severity: 'HIGH',
          message: `Extreme absolute valuation detected: Trailing P/E ratio stands at ${peVal.toFixed(1)}x, indicating bubble risk and high sensitivity to growth deceleration.`
        });
      } else {
        // Gate 2: Sector-Specific/Percentile Gating
        let isOvervalued = false;
        let thresholdMsg = '';

        if (percentiles && percentiles.pe) {
          const pct = percentiles.pe.percentile;
          // Since lowerIsBetter is true, pct < 15 means worst 15% (most expensive) of peers
          if (pct < 15) {
            isOvervalued = true;
            thresholdMsg = `which ranks in the worst 15% of its sector peers (${ordinal(pct)} percentile)`;
          }
        } else {
          // Fallback static thresholds by sector
          let defaultSectorLimit = 25.0;
          if (sector === 'Technology') {
            defaultSectorLimit = 35.0;
          } else if (sector === 'Financial Services' || sector === 'Energy') {
            defaultSectorLimit = 15.0;
          }

          if (peVal > defaultSectorLimit) {
            isOvervalued = true;
            thresholdMsg = `which exceeds the standard sector multiple (threshold: ${defaultSectorLimit}x)`;
          }
        }

        if (isOvervalued) {
          observations.push({
            id: 'SECTOR_RELATIVE_OVERVALUATION',
            category: 'VALUATION_ANOMALY',
            severity: 'MEDIUM',
            message: `Elevated sector valuation: Trailing P/E ratio stands at ${peVal.toFixed(1)}x, ${thresholdMsg}.`
          });
        }
      }
    }

    // --- 7. RUNWAY-ADJUSTED UNPROFITABLE GROWTH ---
    if (latest.revenue !== null && latest.revenue > 0 && latest.netIncome !== null && latest.netIncome < 0 && ratios.revenueGrowthYoY !== null && ratios.revenueGrowthYoY > 0.1) {
      const latestCash = bs[0]?.cash || 0;
      const netLoss = Math.abs(latest.netIncome);
      const yearsOfRunway = netLoss > 0 ? (latestCash / netLoss) : 99;
      const isEarlyStage = (latest.revenue < 150e6);

      observations.push({
        id: 'UNPROFITABLE_GROWTH',
        category: 'UNPROFITABLE_GROWTH',
        severity: (isEarlyStage || yearsOfRunway > 3.0) ? 'MEDIUM' : 'HIGH',
        message: `Company is growing revenue at ${(ratios.revenueGrowthYoY * 100).toFixed(1)}% but remains unprofitable with a net loss of $${(netLoss / 1e6).toFixed(1)}M.${yearsOfRunway > 3.0 ? ` (However, cash reserves of $${(latestCash / 1e9).toFixed(3)}B provide a comfortable ${yearsOfRunway.toFixed(1)} years of runway).` : ''}`
      });
    }
  }

  // Map observations to inject a vintage year label
  return observations.map(o => {
    if (o.message && !o.message.includes('based on FY')) {
      const yearVal = o.year || is[0]?.year || new Date().getFullYear();
      o.message = `${o.message} [based on FY${yearVal} data]`;
    }
    return o;
  });
}

/**
 * Assesses Macro Context (e.g. Yield relationships).
 */
export function assessMacroContext(companyMetrics, macroData) {
  const yield10Y = macroData.TREASURY_YIELD || 4.25;
  const pe = companyMetrics.latest.pe;
  const observations = [];
  let valuationPenaltyMultiplier = 1.0;

  // Rule: Dynamic yield vs PE checks
  if (yield10Y > 4.5 && pe && pe > 30) {
    valuationPenaltyMultiplier = 0.8;
    observations.push({
      id: 'HIGH_INTEREST_RATE_VALUATION_RISK',
      category: 'MACRO_HEADWIND',
      message: `10-Yr Treasury yield is elevated at ${yield10Y.toFixed(2)}% while stock trades at P/E of ${pe.toFixed(1)}x.`
    });
  } else if (yield10Y > 4.0 && pe && pe > 25) {
    valuationPenaltyMultiplier = 0.9;
    observations.push({
      id: 'MODERATE_INTEREST_RATE_VALUATION_RISK',
      category: 'MACRO_HEADWIND',
      message: `10-Yr Treasury yield is ${yield10Y.toFixed(2)}% and stock trades at P/E of ${pe.toFixed(1)}x.`
    });
  }

  return {
    valuationPenaltyMultiplier,
    macroFlags: observations, // Kept key name for backwards compatibility in frameworks
    yield10Y,
    inflationRate: macroData.INFLATION || 3.0
  };
}

