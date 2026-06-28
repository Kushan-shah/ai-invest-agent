/**
 * Multi-Method Validation Layer
 * 
 * Audits LLM output reports, framework signals, and debates.
 * Implements Math Audit, Grounding Audit, and Consistency Checks.
 */

/**
 * Math Audit:
 * Extract all numbers (e.g. percentages, ratios, currency amounts) from LLM text/fields
 * and verify if they exist in the verified company data bundle.
 * If not, logs a warning and marks as "unverified math".
 * 
 * @param {Object} llmOutput - The structured object returned by LLM
 * @param {Object} metrics - Computed metrics
 * @returns {Object} - Audit result { passed: boolean, discrepancies: Array }
 */
export function runMathAudit(llmOutput, companyData, metrics) {
  const discrepancies = [];
  const textToScan = JSON.stringify(llmOutput);

  // Regex to match percentages (e.g. 15.5%, -5%) or decimal multiples (e.g. 45.2x, 1.2)
  const numberRegex = /-?\b\d+(\.\d+)?(%|x)?\b/g;
  const matches = textToScan.match(numberRegex) || [];

  // Create a flat set of all numeric values present in computed metrics and raw statements
  const flatComputedValues = new Set();
  
  const collectNumbers = (obj) => {
    if (obj === null || obj === undefined) return;
    if (typeof obj === 'number') {
      flatComputedValues.add(obj);
      flatComputedValues.add(Math.round(obj));
      flatComputedValues.add(parseFloat(obj.toFixed(1)));
      flatComputedValues.add(parseFloat(obj.toFixed(2)));
      
      // If it's a decimal ratio/margin (e.g. 0.155) or a growth rate (e.g. 1.044), also add its percentage equivalent (e.g. 15.5 or 104.4)
      if (Math.abs(obj) <= 10.0) {
        const pct = obj * 100;
        flatComputedValues.add(pct);
        flatComputedValues.add(Math.round(pct));
        flatComputedValues.add(parseFloat(pct.toFixed(1)));
        flatComputedValues.add(parseFloat(pct.toFixed(2)));
      }
      
      // If it's a large value, add its millions, billions, and trillions scaled equivalents
      if (Math.abs(obj) >= 1e5) {
        // Millions (M)
        const m = obj / 1e6;
        flatComputedValues.add(m);
        flatComputedValues.add(Math.round(m));
        flatComputedValues.add(parseFloat(m.toFixed(1)));
        flatComputedValues.add(parseFloat(m.toFixed(2)));

        // Billions (B)
        const b = obj / 1e9;
        flatComputedValues.add(b);
        flatComputedValues.add(Math.round(b));
        flatComputedValues.add(parseFloat(b.toFixed(1)));
        flatComputedValues.add(parseFloat(b.toFixed(2)));

        // Trillions (T)
        const t = obj / 1e12;
        flatComputedValues.add(t);
        flatComputedValues.add(Math.round(t));
        flatComputedValues.add(parseFloat(t.toFixed(1)));
        flatComputedValues.add(parseFloat(t.toFixed(2)));
      }
      return;
    }
    if (typeof obj === 'object') {
      Object.values(obj).forEach(collectNumbers);
    }
  };

  collectNumbers(metrics);
  if (companyData) {
    collectNumbers(companyData.historical);
    collectNumbers(companyData.quote);
    collectNumbers(companyData.analystTargets);
  }

  // Audit matches
  matches.forEach(match => {
    const cleanNumStr = match.replace(/%|x/g, '');
    const num = parseFloat(cleanNumStr);
    if (isNaN(num)) return;

    // Ignore small integers (<= 5), label-related integers (like 10 for '10-Yr Treasury'), and years (1900 to 2100)
    if (num <= 5 || num === 10 || (num >= 1900 && num <= 2100)) return;

    // Check if the number is close to any computed value
    let found = false;
    for (const val of flatComputedValues) {
      if (Math.abs(val - num) < 0.1) {
        found = true;
        break;
      }
    }

    // Ignore 100 which is common for percentages/limits
    if (!found && num !== 100) {
      discrepancies.push({
        numberCITED: match,
        context: `Number '${match}' was cited in LLM output but does not exist in deterministic computed financial metrics.`
      });
    }
  });

  return {
    passed: discrepancies.length === 0,
    discrepancies
  };
}

/**
 * Consistency Check:
 * Verifies if LLM signals correlate logically with computed trends/metrics.
 * E.g., if a company's Net Income growth is -80%, Net Margin is eroding,
 * and OCF/Net Income is < 0.5, but the Fundamental signal is BULLISH,
 * flag it as a consistency divergence.
 */
export function runConsistencyAudit(frameworkId, signal, metrics) {
  const discrepancies = [];

  if (frameworkId === 'fundamental_analysis') {
    const isLossMaking = metrics.latest.netIncome < 0;
    const isDecliningRev = metrics.ratios.revenueGrowthYoY < -0.1;
    const isErodingMargins = metrics.trends.marginTrend === 'DECELERATING';

    if (signal.direction === 'BULLISH' && (isLossMaking && isDecliningRev && isErodingMargins)) {
      discrepancies.push({
        rule: 'FUNDAMENTAL_BULLISH_ON_DECAY',
        message: 'LLM generated a BULLISH fundamental signal despite negative earnings, declining revenue, and eroding margins.'
      });
    }
  }

  if (frameworkId === 'valuation_analysis') {
    const pe = metrics.latest.pe;
    const peg = metrics.latest.peg;

    if (signal.direction === 'BULLISH' && pe && pe > 50 && peg && peg > 3.0) {
      discrepancies.push({
        rule: 'VALUATION_BULLISH_ON_EXTREME_MULTIPLES',
        message: 'LLM generated a BULLISH valuation signal despite an extremely high P/E ratio (>50x) and a PEG > 3.0.'
      });
    }
  }

  return {
    passed: discrepancies.length === 0,
    discrepancies
  };
}

export function validateLLMOutput(frameworkId, signal, companyData, metrics) {
  const mathAudit = runMathAudit(signal, companyData, metrics);
  const consistencyAudit = runConsistencyAudit(frameworkId, signal, metrics);

  const warnings = [...mathAudit.discrepancies, ...consistencyAudit.discrepancies];

  const ticker = companyData?.profile?.ticker || '';
  const FINANCIAL_SERVICES_COMPANIES = ['DE', 'CAT', 'F', 'GM', 'CNH', 'HON'];
  if (FINANCIAL_SERVICES_COMPANIES.includes(ticker.toUpperCase())) {
    warnings.push({
      rule: 'CAPTIVE_FINANCE_DEBT_WARNING',
      message: 'Net debt scope may exclude captive finance arm. Verify label.'
    });
  }

  return {
    mathAudit,
    consistencyAudit,
    valid: mathAudit.passed && consistencyAudit.passed,
    warnings
  };
}
