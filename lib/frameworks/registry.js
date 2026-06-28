/**
 * Framework Registry
 * 
 * Manages active research frameworks and provides execution helpers.
 */

import { fundamentalFramework } from './fundamental.js';
import { moatFramework } from './moat.js';
import { riskFramework } from './risk.js';
import { valuationFramework } from './valuation.js';

export const frameworkRegistry = {
  fundamental: fundamentalFramework,
  moat: moatFramework,
  risk: riskFramework,
  valuation: valuationFramework
};

/**
 * Runs all registered frameworks sequentially with a 1-second stagger.
 * This prevents hitting Gemini's 5 requests-per-minute rate limit.
 * Enforces use of temperature = 0.
 * 
 * @param {Object} companyData - Normalized data bundle
 * @param {Object} metrics - Computed metrics
 * @param {Object} percentiles - Sector percentiles
 * @param {Array} anomalies - Detected anomalies
 * @param {Object} macroAnalysis - Macro context assessment
 * @param {Array} news - Extracted news articles
 * @param {Object} llm - Gemini Flash/Pro LLM client
 */
export async function runAllFrameworks(companyData, metrics, percentiles, anomalies, macroAnalysis, news, llm) {
  console.log(`Running analysis frameworks sequentially for: ${companyData.profile.ticker}`);

  console.log('Running: Fundamental Analysis...');
  const fundamentalRes = await fundamentalFramework.analyze(companyData, metrics, percentiles, anomalies, llm);
  
  console.log('Staggering 1s to prevent rate limit...');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('Running: Moat & Competitive...');
  const moatRes = await moatFramework.analyze(companyData, metrics, percentiles, news, llm);

  console.log('Staggering 1s to prevent rate limit...');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('Running: Risk & Macro Assessment...');
  const riskRes = await riskFramework.analyze(companyData, metrics, percentiles, anomalies, macroAnalysis, news, llm);

  console.log('Staggering 1s to prevent rate limit...');
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log('Running: Valuation Analysis...');
  const valuationRes = await valuationFramework.analyze(companyData, metrics, percentiles, macroAnalysis, llm);

  return {
    fundamental: fundamentalRes,
    moat: moatRes,
    risk: riskRes,
    valuation: valuationRes
  };
}
