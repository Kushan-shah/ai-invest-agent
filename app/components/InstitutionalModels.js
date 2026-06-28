'use client';

import { useState, useEffect, useRef } from 'react';

// Format Helpers
const formatNum = (val, currencyCode = 'USD') => {
  if (val === null || val === undefined || isNaN(val) || val === 0) return 'N/A';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      notation: 'compact',
      maximumFractionDigits: 2
    }).format(val);
  } catch (e) {
    return `${currencyCode} ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
};

const formatPct = (val) => {
  if (val === null || val === undefined || isNaN(val)) return 'N/A';
  return `${(val * 100).toFixed(2)}%`;
};

// Box-Muller transform for normal distributions
function randomNormal(mean, stdDev) {
  let u1 = 0, u2 = 0;
  while (u1 === 0) u1 = Math.random(); // avoid ln(0)
  while (u2 === 0) u2 = Math.random();
  const num = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  return mean + stdDev * num;
}

// Peer Database
const peerDb = {
  AAPL: { name: 'Apple Inc.', pe: 32.5, peg: 2.2, evRev: 8.8, netMargin: 0.26, de: 1.40, roe: 1.45, growth: 0.08 },
  MSFT: { name: 'Microsoft Corp.', pe: 35.2, peg: 2.1, evRev: 12.5, netMargin: 0.36, de: 0.44, roe: 0.38, growth: 0.14 },
  GOOG: { name: 'Alphabet Inc.', pe: 24.5, peg: 1.2, evRev: 6.2, netMargin: 0.26, de: 0.08, roe: 0.29, growth: 0.12 },
  AMZN: { name: 'Amazon.com Inc.', pe: 42.1, peg: 1.5, evRev: 3.1, netMargin: 0.06, de: 0.62, roe: 0.20, growth: 0.11 },
  AMD: { name: 'Advanced Micro Devices', pe: 55.4, peg: 1.1, evRev: 8.5, netMargin: 0.08, de: 0.05, roe: 0.06, growth: 0.09 },
  INTC: { name: 'Intel Corp.', pe: 32.1, peg: 4.5, evRev: 2.1, netMargin: 0.02, de: 0.42, roe: 0.02, growth: -0.04 },
  QCOM: { name: 'QUALCOMM Inc.', pe: 18.2, peg: 1.3, evRev: 4.8, netMargin: 0.22, de: 0.72, roe: 0.45, growth: 0.08 },
  F: { name: 'Ford Motor Co.', pe: 6.5, peg: 0.8, evRev: 1.1, netMargin: 0.03, de: 2.15, roe: 0.11, growth: 0.04 },
  GM: { name: 'General Motors', pe: 5.2, peg: 0.6, evRev: 0.9, netMargin: 0.05, de: 1.85, roe: 0.13, growth: 0.05 },
  BYDDY: { name: 'BYD Co. Ltd.', pe: 18.5, peg: 0.9, evRev: 1.5, netMargin: 0.05, de: 0.65, roe: 0.22, growth: 0.28 },
  JPM: { name: 'JPMorgan Chase & Co.', pe: 11.5, peg: 1.8, evRev: 4.5, netMargin: 0.28, de: 1.12, roe: 0.17, growth: 0.08 },
  BAC: { name: 'Bank of America', pe: 12.1, peg: 2.1, evRev: 3.8, netMargin: 0.24, de: 1.25, roe: 0.11, growth: 0.04 },
  WFC: { name: 'Wells Fargo & Co.', pe: 10.8, peg: 1.6, evRev: 3.5, netMargin: 0.21, de: 1.30, roe: 0.10, growth: 0.03 },
  JNJ: { name: 'Johnson & Johnson', pe: 15.4, peg: 2.3, evRev: 4.2, netMargin: 0.18, de: 0.45, roe: 0.22, growth: 0.05 },
  LLY: { name: 'Eli Lilly & Co.', pe: 85.2, peg: 2.4, evRev: 18.2, netMargin: 0.20, de: 1.55, roe: 0.58, growth: 0.26 },
  UNH: { name: 'UnitedHealth Group', pe: 18.5, peg: 1.5, evRev: 1.4, netMargin: 0.06, de: 0.68, roe: 0.24, growth: 0.10 }
};

// 1. DCF SENSITIVITY SANDBOX COMPONENT (WITH MULTI-SCENARIO CASE MANAGER)
export function DcfSensitivityModel({ resultsData, onDcfBaseChange }) {
  const incomeStatements = resultsData?.historical?.incomeStatements || resultsData?.fullPayload?.historical?.incomeStatements || [];
  const cashFlows = resultsData?.historical?.cashFlows || resultsData?.fullPayload?.historical?.cashFlows || [];
  const balanceSheets = resultsData?.historical?.balanceSheets || resultsData?.fullPayload?.historical?.balanceSheets || [];
  const quote = resultsData?.quote || resultsData?.fullPayload?.quote || {};

  const latestIS = incomeStatements[0] || {};
  const latestCF = cashFlows[0] || {};
  const latestBS = balanceSheets[0] || {};

  const baseRevenue = latestIS.revenue || 0;
  const baseFcf = latestCF.operatingCashflow || latestCF.freeCashflow || 0;
  
  // Calculate Revenue CAGR over available historical periods
  let histRevGrowth = 0.08;
  if (incomeStatements.length >= 2) {
    const revs = incomeStatements.map(item => item.revenue).filter(r => r !== null && r !== undefined && r > 0);
    if (revs.length >= 2) {
      const latestRev = revs[0];
      const oldestRev = revs[revs.length - 1];
      const numYears = revs.length - 1;
      if (latestRev > 0 && oldestRev > 0 && numYears > 0) {
        histRevGrowth = Math.pow(latestRev / oldestRev, 1 / numYears) - 1;
      }
    }
  }

  const defaultGrowth = Math.max(-0.2, Math.min(0.4, histRevGrowth));
  const defaultFcfMargin = baseRevenue > 0 ? Math.max(0, Math.min(0.6, baseFcf / baseRevenue)) : 0.15;

  // Active Scenario Key
  const [scenario, setScenario] = useState('base'); // base, bull, bear

  // Scenarios State Storage
  const [scenarios, setScenarios] = useState({
    base: { growth: defaultGrowth, margin: defaultFcfMargin, wacc: 0.09, terminal: 0.025 },
    bull: { growth: defaultGrowth + 0.05, margin: defaultFcfMargin + 0.03, wacc: 0.08, terminal: 0.03 },
    bear: { growth: defaultGrowth - 0.06, margin: Math.max(0.01, defaultFcfMargin - 0.04), wacc: 0.11, terminal: 0.015 }
  });

  const [rf, setRf] = useState(resultsData?.macro?.TREASURY_YIELD || resultsData?.fullPayload?.macro?.TREASURY_YIELD || 4.25);
  const [beta, setBeta] = useState(quote.beta || 1.0);
  const [erp, setErp] = useState(5.5);
  const [costOfDebt, setCostOfDebt] = useState(5.0);
  const [taxRate, setTaxRate] = useState(21.0);
  const [waccMode, setWaccMode] = useState('slider');
  const [isWaccExpanded, setIsWaccExpanded] = useState(false);

  const years = [1, 2, 3, 4, 5];
  const currency = resultsData?.profile?.currency || 
    resultsData?.fullPayload?.profile?.currency || 
    resultsData?.quote?.financialCurrency || 
    resultsData?.fullPayload?.quote?.financialCurrency || 
    'USD';

  const currentPrice = quote.price || 1;
  const sharesOutstanding = quote.sharesOutstanding || 
    (quote.marketCap > 0 && currentPrice > 0 ? quote.marketCap / currentPrice : null) || 
    resultsData?.quote?.sharesOutstanding || 
    resultsData?.fullPayload?.quote?.sharesOutstanding || 
    1e8;
  const hasValidShares = sharesOutstanding !== null && sharesOutstanding > 0;

  // Keep scenarios in sync with loaded data (crucial for SSE streaming updates)
  const lastTicker = useRef(null);

  // Calculate weights
  const totalDebt = latestBS.debt || 0;
  const marketCap = quote.marketCap || (baseRevenue * 3) || 1000000000;
  const totalCapital = marketCap + totalDebt;
  const equityWeight = totalCapital > 0 ? (marketCap / totalCapital) : 1.0;
  const debtWeight = totalCapital > 0 ? (totalDebt / totalCapital) : 0;

  useEffect(() => {
    const ticker = resultsData?.profile?.ticker || resultsData?.fullPayload?.profile?.ticker;
    if (baseRevenue > 0 && ticker && ticker !== lastTicker.current) {
      lastTicker.current = ticker;
      
      const recommended = resultsData?.report?.valuation_scenarios || resultsData?.fullPayload?.report?.valuation_scenarios;
      if (recommended && recommended.base && recommended.bull && recommended.bear) {
        setScenarios({
          base: { ...recommended.base },
          bull: { ...recommended.bull },
          bear: { ...recommended.bear }
        });
      } else {
        // Calculate initial cost of equity & WACC based on newly loaded profile beta and rf rate
        const initBeta = quote.beta || 1.0;
        const initRf = resultsData?.macro?.TREASURY_YIELD || resultsData?.fullPayload?.macro?.TREASURY_YIELD || 4.25;
        const initCostOfEquity = initRf + initBeta * 5.0;
        const initAfterTaxCostOfDebt = 5.0 * (1 - 21.0 / 100);
        const initWacc = ((equityWeight * initCostOfEquity + debtWeight * initAfterTaxCostOfDebt) / 100) || 0.09;

        setScenarios({
          base: { growth: defaultGrowth, margin: defaultFcfMargin, wacc: initWacc, terminal: 0.025 },
          bull: { growth: defaultGrowth + 0.05, margin: defaultFcfMargin + 0.03, wacc: Math.max(0.04, initWacc - 0.01), terminal: 0.03 },
          bear: { growth: defaultGrowth - 0.06, margin: Math.max(0.01, defaultFcfMargin - 0.04), wacc: initWacc + 0.02, terminal: 0.015 }
        });
      }
    }
  }, [defaultGrowth, defaultFcfMargin, baseRevenue, resultsData, quote.beta, equityWeight, debtWeight]);

  const activeParams = scenarios[scenario];

  const updateParam = (key, val) => {
    setScenarios(prev => ({
      ...prev,
      [scenario]: {
        ...prev[scenario],
        [key]: val
      }
    }));
  };

  const debt = latestBS.debt || 0;
  const cash = latestBS.cash || 0;
  const netDebt = debt - cash;

  // Sync default values when quote or resultsData changes
  useEffect(() => {
    if (quote.beta) {
      setBeta(quote.beta);
    }
    const treasury = resultsData?.macro?.TREASURY_YIELD || resultsData?.fullPayload?.macro?.TREASURY_YIELD;
    if (treasury) {
      setRf(treasury);
    }
  }, [quote.beta, resultsData]);

  const costOfEquity = rf + beta * erp;
  const afterTaxCostOfDebt = costOfDebt * (1 - taxRate / 100);
  const calculatedWacc = (equityWeight * costOfEquity + debtWeight * afterTaxCostOfDebt) / 100;

  // Auto-update WACC in active scenario when formula parameters change
  useEffect(() => {
    if (waccMode === 'formula') {
      updateParam('wacc', parseFloat(calculatedWacc.toFixed(4)));
    }
  }, [calculatedWacc, waccMode, scenario]);

  const projectedRevenues = [];
  const projectedFcfs = [];
  const discountFactors = [];
  const pvFcfs = [];

  const baseFcfMargin = baseRevenue > 0 ? baseFcf / baseRevenue : 0.10;
  let tempRev = baseRevenue;
  for (let i = 1; i <= 5; i++) {
    tempRev = tempRev * (1 + activeParams.growth);
    projectedRevenues.push(tempRev);

    // Use target margin directly (standardized constant margin model)
    const fcf = tempRev * activeParams.margin;
    projectedFcfs.push(fcf);

    const df = 1 / Math.pow(1 + activeParams.wacc, i);
    discountFactors.push(df);

    pvFcfs.push(fcf * df);
  }

  const sumPvFcfs = pvFcfs.reduce((a, b) => a + b, 0);
  const terminalFcf = projectedFcfs[4] * (1 + activeParams.terminal);
  const waccMinusG = activeParams.wacc - activeParams.terminal;
  const tv = waccMinusG > 0 ? (terminalFcf / waccMinusG) : 0;
  const pvTv = tv * discountFactors[4];

  const enterpriseValue = sumPvFcfs + pvTv;
  const equityValue = enterpriseValue - netDebt;
  const intrinsicValuePerShare = hasValidShares ? (equityValue / sharesOutstanding) : 0;
  const upsidePct = (currentPrice > 0 && intrinsicValuePerShare > 0) ? ((intrinsicValuePerShare - currentPrice) / currentPrice) : 0;

  // Verification of inputs
  const hasDcfInputs = 
    baseRevenue > 0 && 
    baseFcf !== 0 && 
    hasValidShares;

  const getIntrinsicVal = (p) => {
    let testRev = baseRevenue;
    const testFcfs = [];
    const testFcfMargin = baseRevenue > 0 ? baseFcf / baseRevenue : 0.10;
    for (let i = 1; i <= 5; i++) {
      testRev = testRev * (1 + p.growth);
      testFcfs.push(testRev * p.margin);
    }
    const testDFs = years.map(y => 1 / Math.pow(1 + p.wacc, y));
    const testSumPV = testFcfs.reduce((sum, f, idx) => sum + (f * testDFs[idx]), 0);
    const testTV = (p.wacc - p.terminal) > 0 ? (testFcfs[4] * (1 + p.terminal) / (p.wacc - p.terminal)) : 0;
    const testPvTv = testTV * testDFs[4];
    const testEV = testSumPV + testPvTv;
    const testEqVal = testEV - netDebt;
    return hasValidShares ? (testEqVal / sharesOutstanding) : 0;
  };

  const bearVal = getIntrinsicVal(scenarios.bear);
  const baseVal = getIntrinsicVal(scenarios.base);
  const bullVal = getIntrinsicVal(scenarios.bull);

  const hasComputedScenarios = 
    hasDcfInputs &&
    !isNaN(bearVal) && bearVal > 0 && 
    !isNaN(baseVal) && baseVal > 0 && 
    !isNaN(bullVal) && bullVal > 0;

  useEffect(() => {
    if (onDcfBaseChange && hasDcfInputs) {
      onDcfBaseChange(intrinsicValuePerShare);
    }
  }, [intrinsicValuePerShare, hasDcfInputs]);

  if (!hasDcfInputs) {
    return (
      <section id="valuation-sandbox" className="glass-panel p-6 bg-[#0D0D12]/80 border border-white/5 rounded-2xl relative">
        <div className="flex items-center gap-3 text-zinc-400 font-mono py-4">
          <svg className="w-5.5 h-5.5 text-zinc-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span className="text-xs uppercase tracking-wider font-semibold">DCF valuation unavailable due to insufficient financial inputs.</span>
        </div>
      </section>
    );
  }

  return (
    <section id="valuation-sandbox" className="glass-panel p-6 bg-[#0D0D12]/80 border border-white/5 rounded-2xl relative overflow-hidden">
      <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 pb-4 border-b border-white/5 gap-4">
        <div>
          <h3 className="text-xs font-semibold text-white flex items-center gap-2 font-mono uppercase tracking-wider">
            <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
            Multi-Scenario DCF Valuation Sandbox
          </h3>
          <p className="text-[10px] text-zinc-400 mt-1">Configure and compare Bear, Base, and Bull financial cases dynamically.</p>
        </div>

        <div className="flex items-center gap-1 bg-zinc-950 p-1 border border-zinc-900 rounded-xl">
          {[
            { id: 'bear', name: 'Bear Case', color: 'text-red-400' },
            { id: 'base', name: 'Base Case', color: 'text-zinc-300' },
            { id: 'bull', name: 'Bull Case', color: 'text-emerald-400' }
          ].map((c) => (
            <button
              key={c.id}
              onClick={() => setScenario(c.id)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-all ${
                scenario === c.id 
                  ? 'bg-zinc-900 text-white border border-white/5 shadow-inner' 
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <span className={scenario === c.id ? c.color : ''}>{c.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8 bg-zinc-950/40 p-4 rounded-xl border border-zinc-900">
        <div>
          <div className="flex justify-between items-center mb-1.5 text-xs font-mono text-zinc-400">
            <span className="uppercase">FCF Growth Rate</span>
            <span className="text-white font-bold">{(activeParams.growth * 100).toFixed(1)}%</span>
          </div>
          <input
            type="range"
            min="-0.20"
            max="0.50"
            step="0.01"
            value={activeParams.growth}
            onChange={(e) => updateParam('growth', parseFloat(e.target.value))}
            className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />
          <span className="text-[9px] text-zinc-500 font-mono flex justify-between mt-1">
            <span>-20%</span>
            <span>Hist: {(histRevGrowth * 100).toFixed(1)}%</span>
            <span>+50%</span>
          </span>
        </div>

        <div>
          <div className="flex justify-between items-center mb-1.5 text-xs font-mono text-zinc-400">
            <span className="uppercase">Target FCF Margin</span>
            <span className="text-white font-bold">{(activeParams.margin * 100).toFixed(1)}%</span>
          </div>
          <input
            type="range"
            min="0.01"
            max="0.60"
            step="0.01"
            value={activeParams.margin}
            onChange={(e) => updateParam('margin', parseFloat(e.target.value))}
            className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />
          <span className="text-[9px] text-zinc-500 font-mono flex justify-between mt-1">
            <span>1%</span>
            <span>Hist: {(defaultFcfMargin * 100).toFixed(1)}%</span>
            <span>60%</span>
          </span>
        </div>

        <div>
          <div className="flex justify-between items-center mb-1.5 text-xs font-mono text-zinc-400">
            <span className="uppercase">Discount Rate (WACC)</span>
            <span className="text-white font-bold">{(activeParams.wacc * 100).toFixed(1)}%</span>
          </div>
          {waccMode === 'slider' ? (
            <input
              type="range"
              min="0.04"
              max="0.20"
              step="0.005"
              value={activeParams.wacc}
              onChange={(e) => updateParam('wacc', parseFloat(e.target.value))}
              className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
            />
          ) : (
            <div className="h-1 bg-zinc-800 rounded-lg w-full flex items-center">
              <div 
                style={{ width: `${Math.max(0, Math.min(100, (activeParams.wacc - 0.04) / 0.16 * 100))}%` }}
                className="h-full bg-emerald-500 rounded-full animate-pulse"
              />
            </div>
          )}
          <span className="text-[9px] text-zinc-500 font-mono flex justify-between mt-1 items-center">
            <span>{waccMode === 'slider' ? '4%' : 'Formula Mode'}</span>
            <button 
              type="button"
              onClick={() => {
                const nextMode = waccMode === 'slider' ? 'formula' : 'slider';
                setWaccMode(nextMode);
                setIsWaccExpanded(nextMode === 'formula');
              }}
              className="px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-white transition flex items-center gap-1 font-bold text-[8px]"
            >
              <svg className={`w-2 h-2 ${isWaccExpanded ? 'rotate-180' : ''} transition-transform`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" /></svg>
              {isWaccExpanded ? 'CLOSE CALC' : 'DECOMPOSE'}
            </button>
            <span>{waccMode === 'slider' ? '20%' : `Val: ${(activeParams.wacc * 100).toFixed(2)}%`}</span>
          </span>
        </div>

        <div>
          <div className="flex justify-between items-center mb-1.5 text-xs font-mono text-zinc-400">
            <span className="uppercase">Terminal Growth</span>
            <span className="text-white font-bold">{(activeParams.terminal * 100).toFixed(1)}%</span>
          </div>
          <input
            type="range"
            min="0.005"
            max="0.05"
            step="0.001"
            value={activeParams.terminal}
            onChange={(e) => updateParam('terminal', parseFloat(e.target.value))}
            className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
          />
          <span className="text-[9px] text-zinc-500 font-mono flex justify-between mt-1">
            <span>0.5%</span>
            <span>Standard: 2.5%</span>
            <span>5%</span>
          </span>
        </div>
      </div>

      {isWaccExpanded && (
        <div className="mb-8 p-5 bg-zinc-950/60 border border-zinc-900 rounded-2xl space-y-4 font-mono text-xs text-zinc-300">
          <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
            <span className="font-bold text-white uppercase text-[10px] tracking-wider flex items-center gap-2">
              <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
              Weighted Average Cost of Capital (WACC) Decomposition
            </span>
            <span className="text-[9px] text-zinc-505">WACC = [E/V × Ke] + [D/V × Kd × (1 - Tc)]</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-3">
              <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-900/60 pb-1.5">Cost of Equity (Kₑ)</div>
              
              <div>
                <div className="flex justify-between mb-1.5 text-zinc-400 text-[11px]">
                  <span>Risk-Free Rate (Rf — FRED 10-Yr Treasury)</span>
                  <span className="text-white font-bold">{rf.toFixed(2)}%</span>
                </div>
                <input
                  type="range"
                  min="0.01"
                  max="10.00"
                  step="0.05"
                  value={rf}
                  onChange={(e) => setRf(parseFloat(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-emerald-500"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1.5 text-zinc-400 text-[11px]">
                  <span>Equity Beta (β — Yahoo Finance)</span>
                  <span className="text-white font-bold">{beta.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0.20"
                  max="3.00"
                  step="0.05"
                  value={beta}
                  onChange={(e) => setBeta(parseFloat(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-emerald-500"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1.5 text-zinc-400 text-[11px]">
                  <span>Equity Risk Premium (ERP)</span>
                  <span className="text-white font-bold">{erp.toFixed(1)}%</span>
                </div>
                <input
                  type="range"
                  min="3.00"
                  max="9.00"
                  step="0.10"
                  value={erp}
                  onChange={(e) => setErp(parseFloat(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-emerald-500"
                />
              </div>

              <div className="p-2.5 bg-zinc-950 border border-zinc-900 rounded-lg text-emerald-400 font-bold flex justify-between text-[11px]">
                <span>Cost of Equity (Kₑ = Rf + β × ERP)</span>
                <span>{costOfEquity.toFixed(2)}%</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-900/60 pb-1.5">Cost of Debt (Kd) & Capital Weights</div>
              
              <div>
                <div className="flex justify-between mb-1.5 text-zinc-400 text-[11px]">
                  <span>Pre-tax Cost of Debt (Kd)</span>
                  <span className="text-white font-bold">{costOfDebt.toFixed(2)}%</span>
                </div>
                <input
                  type="range"
                  min="1.00"
                  max="15.00"
                  step="0.25"
                  value={costOfDebt}
                  onChange={(e) => setCostOfDebt(parseFloat(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-emerald-500"
                />
              </div>

              <div>
                <div className="flex justify-between mb-1.5 text-zinc-400 text-[11px]">
                  <span>Corporate Tax Rate (Tc)</span>
                  <span className="text-white font-bold">{taxRate.toFixed(1)}%</span>
                </div>
                <input
                  type="range"
                  min="0.00"
                  max="40.00"
                  step="0.50"
                  value={taxRate}
                  onChange={(e) => setTaxRate(parseFloat(e.target.value))}
                  className="w-full h-1 bg-zinc-800 rounded appearance-none cursor-pointer accent-emerald-500"
                />
              </div>

              <div className="pt-1.5 grid grid-cols-2 gap-3 text-[10px] text-zinc-400">
                <div className="p-2.5 bg-zinc-900/40 border border-zinc-900 rounded-lg flex flex-col justify-between">
                  <span>Equity Weight (E/V)</span>
                  <span className="text-white font-bold text-sm mt-1">{(equityWeight * 100).toFixed(1)}%</span>
                  <span className="text-[8px] text-zinc-500 mt-0.5 font-mono truncate">Cap: {formatNum(marketCap, currency)}</span>
                </div>
                <div className="p-2.5 bg-zinc-900/40 border border-zinc-900 rounded-lg flex flex-col justify-between">
                  <span>Debt Weight (D/V)</span>
                  <span className="text-white font-bold text-sm mt-1">{(debtWeight * 100).toFixed(1)}%</span>
                  <span className="text-[8px] text-zinc-500 mt-0.5 font-mono truncate">Debt: {formatNum(totalDebt, currency)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-emerald-500/5 border border-emerald-500/20 rounded-xl flex flex-col sm:flex-row justify-between items-center gap-3">
            <div>
              <span className="text-[11px] font-bold text-emerald-400 block uppercase tracking-wider">Formula Derived WACC</span>
              <span className="text-[9px] text-zinc-400 block mt-0.5">
                Calculated: [{(equityWeight * 100).toFixed(1)}% E/V × {costOfEquity.toFixed(2)}% Ke] + [{(debtWeight * 100).toFixed(1)}% D/V × {costOfDebt.toFixed(2)}% Kd × (1 - {taxRate}%) after-tax Cost of Debt]
              </span>
            </div>
            <div className="text-right">
              <span className="text-2xl font-black text-emerald-400">{(calculatedWacc * 100).toFixed(2)}%</span>
            </div>
          </div>
        </div>
      )}

      {activeParams.wacc <= activeParams.terminal && (
        <div className="mb-6 p-3 bg-red-950/20 border border-red-500/30 rounded-xl text-xs text-red-400 font-mono">
          [CRITICAL] WACC must be strictly greater than Terminal Growth Rate to compute terminal valuation.
        </div>
      )}

      <div className="overflow-x-auto border border-zinc-900 rounded-xl bg-zinc-950/60 mb-6">
        <table className="w-full text-left border-collapse text-xs font-mono">
          <thead>
            <tr className="border-b border-zinc-900 bg-zinc-950/80 text-zinc-500 uppercase tracking-widest text-[9px]">
              <th className="p-3">Forecast Metric ({scenario.toUpperCase()} Case)</th>
              <th className="p-3 text-right">Base Year</th>
              {years.map((y) => (
                <th key={y} className="p-3 text-right">Year {y}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900 text-zinc-300">
            <tr>
              <td className="p-3 font-semibold text-white">Projected Revenue</td>
              <td className="p-3 text-right text-zinc-400">{formatNum(baseRevenue, currency)}</td>
              {projectedRevenues.map((rev, i) => (
                <td key={i} className="p-3 text-right">{formatNum(rev, currency)}</td>
              ))}
            </tr>
            <tr>
              <td className="p-3 font-semibold text-white">Projected Free Cash Flow</td>
              <td className="p-3 text-right text-zinc-400">{formatNum(baseFcf, currency)}</td>
              {projectedFcfs.map((fcf, i) => (
                <td key={i} className="p-3 text-right">{formatNum(fcf, currency)}</td>
              ))}
            </tr>
            <tr>
              <td className="p-3 text-zinc-500 font-semibold">Discount Factor</td>
              <td className="p-3 text-right text-zinc-500">1.0000</td>
              {discountFactors.map((df, i) => (
                <td key={i} className="p-3 text-right text-zinc-400">{df.toFixed(4)}</td>
              ))}
            </tr>
            <tr className="bg-zinc-900/10">
              <td className="p-3 font-semibold text-emerald-400">Present Value of FCF</td>
              <td className="p-3 text-right text-zinc-500">-</td>
              {pvFcfs.map((pv, i) => (
                <td key={i} className="p-3 text-right text-emerald-400 font-bold">{formatNum(pv, currency)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs font-mono">
        <div className="bg-zinc-950/20 p-4 rounded-xl border border-zinc-900 space-y-2">
          <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Enterprise Value</h4>
          <div className="flex justify-between py-1 border-b border-zinc-900/60">
            <span className="text-zinc-500">Sum PV of FCFs:</span>
            <span className="text-white">{formatNum(sumPvFcfs, currency)}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-zinc-900/60">
            <span className="text-zinc-500">Terminal Value:</span>
            <span className="text-white">{formatNum(tv, currency)}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-zinc-900/60">
            <span className="text-zinc-500">PV of Terminal Value:</span>
            <span className="text-white">{formatNum(pvTv, currency)}</span>
          </div>
          <div className="flex justify-between pt-2">
            <span className="text-zinc-400 font-bold">Implied EV:</span>
            <span className="text-emerald-400 font-black">{formatNum(enterpriseValue, currency)}</span>
          </div>
        </div>

        <div className="bg-zinc-950/20 p-4 rounded-xl border border-zinc-900 space-y-2">
          <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Equity Value</h4>
          <div className="flex justify-between py-1 border-b border-zinc-900/60">
            <span className="text-zinc-500">Implied EV:</span>
            <span className="text-white">{formatNum(enterpriseValue, currency)}</span>
          </div>
          <div className="flex justify-between py-1 border-b border-zinc-900/60">
            <span className="text-zinc-500">
              {['DE', 'CAT', 'F', 'GM', 'CNH', 'HON'].includes((resultsData?.profile?.ticker || resultsData?.fullPayload?.profile?.ticker || '').toUpperCase()) 
                ? 'Equip. Ops Net Debt (excl. JDF)' 
                : 'Balance Sheet Net Debt'}:
            </span>
            <span className={netDebt >= 0 ? 'text-red-400' : 'text-emerald-400'}>
              {netDebt >= 0 ? '' : '-'}{formatNum(Math.abs(netDebt), currency)}
            </span>
          </div>
          <div className="flex justify-between py-1 border-b border-zinc-900/60">
            <span className="text-zinc-500">Shares Outstanding:</span>
            <span className="text-white">{hasValidShares ? (sharesOutstanding / 1e6).toFixed(1) + 'M' : 'N/A'}</span>
          </div>
          <div className="flex justify-between pt-2">
            <span className="text-zinc-400 font-bold">Implied Equity:</span>
            <span className="text-emerald-400 font-black">{formatNum(equityValue, currency)}</span>
          </div>
        </div>

        <div className="bg-zinc-950/20 p-4 rounded-xl border border-zinc-900 flex flex-col justify-between">
          <div>
            <h4 className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-3">Valuation Reconciliation</h4>
            <div className="space-y-3">
              <div className="bg-zinc-950/60 p-3 rounded-xl border border-zinc-900 flex justify-between items-center">
                <span className="text-zinc-400 text-xs">Intrinsic Value/Share</span>
                <div className="font-mono text-emerald-400 font-bold tracking-wide">
                  {hasValidShares ? formatNum(intrinsicValuePerShare, currency) : 'N/A (Missing Shares Data)'}
                </div>
              </div>
              <div className="bg-zinc-950/60 p-3 rounded-xl border border-zinc-900 flex justify-between items-center">
                <span className="text-zinc-400 text-xs">Current Trading Price</span>
                <div className="font-mono text-white font-semibold">
                  {currentPrice ? formatNum(currentPrice, currency) : 'N/A'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <MonteCarloSimulation 
        baseGrowth={activeParams.growth} 
        baseMargin={activeParams.margin} 
        baseWacc={activeParams.wacc} 
        baseTerminal={activeParams.terminal}
        baseRevenue={baseRevenue}
        baseFcfMargin={baseFcfMargin}
        netDebt={netDebt}
        shares={sharesOutstanding}
        currentPrice={currentPrice}
        currency={currency}
      />

      <SensitivityHeatmap
        baseRevenue={baseRevenue}
        baseFcfMargin={baseFcfMargin}
        activeGrowth={activeParams.growth}
        activeMargin={activeParams.margin}
        netDebt={netDebt}
        shares={sharesOutstanding}
        currentPrice={currentPrice}
        currency={currency}
      />
    </section>
  );
}

// REVERSE DCF — MARKET-IMPLIED GROWTH RATE CARD
export function ReverseDcfCard({ resultsData }) {
  const reverseDcf = resultsData?.verdict?.reverseDcf;
  const dcfNote = resultsData?.dcfValuationNote || resultsData?.verdict?.convergence?.dcfNote;
  const currency = resultsData?.profile?.currency || resultsData?.fullPayload?.profile?.currency || 'USD';

  if (!reverseDcf) return null;

  const impliedPct = (reverseDcf.impliedGrowthRate * 100).toFixed(1);
  const historicalPct = (reverseDcf.historicalGrowthRate * 100).toFixed(1);
  const gapPct = (reverseDcf.growthGap * 100).toFixed(1);
  const isOptimistic = reverseDcf.marketExpectation === 'OPTIMISTIC';
  const isPessimistic = reverseDcf.marketExpectation === 'PESSIMISTIC';

  // Visual gauge position (0-100 scale, centered at 50 for 0% growth)
  const gaugePos = Math.max(2, Math.min(98, 50 + (reverseDcf.impliedGrowthRate * 100)));
  const histGaugePos = Math.max(2, Math.min(98, 50 + (reverseDcf.historicalGrowthRate * 100)));

  return (
    <section className="glass-panel p-6 bg-[#0D0D12]/80 border border-white/5 rounded-2xl relative overflow-hidden">
      {/* Subtle gradient accent */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent" />
      
      <div className="flex items-center gap-3 mb-5">
        <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
          <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white tracking-wide">Reverse DCF — Market-Implied Growth</h3>
          <p className="text-[10px] text-zinc-500 mt-0.5">What growth rate does the current stock price imply? No prediction — pure math.</p>
        </div>
      </div>

      {/* Main implied growth display */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-xl p-4 text-center">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono mb-1">Market Implies</p>
          <p className={`text-2xl font-bold font-mono ${parseFloat(impliedPct) >= 0 ? 'text-cyan-400' : 'text-red-400'}`}>
            {impliedPct}%
          </p>
          <p className="text-[9px] text-zinc-600 mt-1">Annual Revenue Growth</p>
        </div>
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-xl p-4 text-center">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono mb-1">Last Reported</p>
          <p className={`text-2xl font-bold font-mono ${parseFloat(historicalPct) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {historicalPct}%
          </p>
          <p className="text-[9px] text-zinc-600 mt-1">Historical YoY Growth</p>
        </div>
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-xl p-4 text-center">
          <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono mb-1">Growth Gap</p>
          <p className={`text-2xl font-bold font-mono ${parseFloat(gapPct) >= 0 ? 'text-amber-400' : 'text-violet-400'}`}>
            {parseFloat(gapPct) >= 0 ? '+' : ''}{gapPct}%
          </p>
          <p className="text-[9px] text-zinc-600 mt-1">Implied vs Historical</p>
        </div>
      </div>

      {/* Visual gauge bar */}
      <div className="mb-5">
        <div className="flex justify-between text-[9px] text-zinc-600 font-mono mb-1">
          <span>-30%</span>
          <span>0%</span>
          <span>+50%</span>
        </div>
        <div className="relative h-3 bg-slate-800/80 rounded-full overflow-hidden">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-r from-red-500/20 via-zinc-500/10 to-emerald-500/20 rounded-full" />
          {/* Center line */}
          <div className="absolute left-1/2 top-0 bottom-0 w-px bg-zinc-600/50 transform -translate-x-1/2" />
          {/* Historical marker */}
          <div 
            className="absolute top-0 bottom-0 w-1.5 bg-emerald-500/40 rounded-full transition-all duration-700"
            style={{ left: `${histGaugePos}%`, transform: 'translateX(-50%)' }}
            title={`Historical: ${historicalPct}%`}
          />
          {/* Implied marker */}
          <div 
            className="absolute -top-0.5 w-4 h-4 rounded-full bg-cyan-400 border-2 border-cyan-300 shadow-lg shadow-cyan-500/30 transition-all duration-700"
            style={{ left: `${gaugePos}%`, transform: 'translateX(-50%)' }}
            title={`Implied: ${impliedPct}%`}
          />
        </div>
        <div className="flex justify-between text-[9px] mt-1.5">
          <span className="text-emerald-500/60 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/40"></span> Historical
          </span>
          <span className="text-cyan-400/60 flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-cyan-400 border border-cyan-300"></span> Market Implied
          </span>
        </div>
      </div>

      {/* Market expectation badge */}
      <div className={`p-3 rounded-lg border text-xs ${
        isOptimistic ? 'bg-amber-500/5 border-amber-500/20 text-amber-300' :
        isPessimistic ? 'bg-violet-500/5 border-violet-500/20 text-violet-300' :
        'bg-emerald-500/5 border-emerald-500/20 text-emerald-300'
      }`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="font-mono font-bold text-[10px] uppercase tracking-wider">
            {reverseDcf.marketExpectation.replace('_', ' ')}
          </span>
        </div>
        <p className="text-[11px] leading-relaxed opacity-80">{reverseDcf.interpretation}</p>
      </div>

      {/* DCF Transparency Note */}
      {dcfNote && (
        <div className="mt-4 p-3 rounded-lg bg-zinc-900/60 border border-zinc-800/60 text-[10px] text-zinc-400 leading-relaxed">
          <span className="font-mono font-bold text-zinc-500 uppercase text-[9px]">⚠ DCF Model Note: </span>
          {dcfNote.message}
        </div>
      )}
    </section>
  );
}

// CONVERGENCE SUMMARY — MULTI-LENS AGREEMENT VISUALIZATION
export function ConvergenceSummary({ resultsData }) {
  const convergence = resultsData?.verdict?.convergence;
  if (!convergence || !convergence.agreement) return null;

  const { lenses, agreement } = convergence;
  const lensEntries = Object.entries(lenses).filter(([_, v]) => v !== 'N/A');
  const unanimityPct = (agreement.unanimity * 100).toFixed(0);

  const lensLabels = {
    fundamental: 'Fundamental',
    moat: 'Moat & Competitive',
    risk: 'Risk & Macro',
    valuation: 'Valuation',
    swarmRisk: 'Swarm: Risk',
    swarmSentiment: 'Swarm: Sentiment',
    swarmInsider: 'Swarm: Insider'
  };

  const dirColor = (dir) => {
    if (dir === 'BULLISH') return { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', dot: 'bg-emerald-400' };
    if (dir === 'BEARISH') return { bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20', dot: 'bg-red-400' };
    return { bg: 'bg-zinc-800/50', text: 'text-zinc-400', border: 'border-zinc-700/50', dot: 'bg-zinc-500' };
  };

  return (
    <section className="glass-panel p-6 bg-[#0D0D12]/80 border border-white/5 rounded-2xl relative overflow-hidden">
      {/* Subtle gradient accent */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-violet-500/40 to-transparent" />
      
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white tracking-wide">Convergence Summary</h3>
            <p className="text-[10px] text-zinc-500 mt-0.5">Multi-lens agreement across {agreement.total} independent analytical frameworks</p>
          </div>
        </div>
        {/* Unanimity badge */}
        <div className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold ${
          agreement.unanimity >= 0.7 ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
          agreement.unanimity >= 0.5 ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
          'bg-red-500/10 text-red-400 border border-red-500/20'
        }`}>
          {unanimityPct}% Consensus
        </div>
      </div>

      {/* Agreement bars */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-3 text-center">
          <p className="text-xl font-bold font-mono text-emerald-400">{agreement.bullish}</p>
          <p className="text-[9px] text-emerald-500/60 uppercase tracking-wider font-mono mt-0.5">Bullish</p>
        </div>
        <div className="bg-zinc-800/30 border border-zinc-700/30 rounded-lg p-3 text-center">
          <p className="text-xl font-bold font-mono text-zinc-400">{agreement.neutral}</p>
          <p className="text-[9px] text-zinc-500/60 uppercase tracking-wider font-mono mt-0.5">Neutral</p>
        </div>
        <div className="bg-red-500/5 border border-red-500/10 rounded-lg p-3 text-center">
          <p className="text-xl font-bold font-mono text-red-400">{agreement.bearish}</p>
          <p className="text-[9px] text-red-500/60 uppercase tracking-wider font-mono mt-0.5">Bearish</p>
        </div>
      </div>

      {/* Individual lens breakdown */}
      <div className="space-y-2">
        {lensEntries.map(([key, dir]) => {
          const colors = dirColor(dir);
          return (
            <div key={key} className={`flex items-center justify-between px-3 py-2 rounded-lg ${colors.bg} border ${colors.border} transition-all duration-200 hover:scale-[1.01]`}>
              <div className="flex items-center gap-2.5">
                <span className={`w-2 h-2 rounded-full ${colors.dot}`}></span>
                <span className="text-xs text-zinc-300 font-medium">{lensLabels[key] || key}</span>
              </div>
              <span className={`text-[10px] font-mono font-bold uppercase tracking-wider ${colors.text}`}>{dir}</span>
            </div>
          );
        })}
      </div>

      {/* Reverse DCF in convergence context */}
      {convergence.reverseDcf && (
        <div className="mt-4 p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/10 text-[11px] text-cyan-300/70 leading-relaxed">
          <span className="font-mono font-bold text-cyan-400/80 text-[9px] uppercase tracking-wider">Reverse DCF Lens: </span>
          {convergence.reverseDcf.interpretation}
        </div>
      )}
    </section>
  );
}

// MONTE CARLO SIMULATION COMPONENT
export function MonteCarloSimulation({ baseGrowth, baseMargin, baseWacc, baseTerminal, baseRevenue, baseFcfMargin, netDebt, shares, currentPrice, currency }) {
  const [simResults, setSimResults] = useState(null);
  const [simulating, setSimulating] = useState(false);

  const runSimulation = () => {
    setSimulating(true);
    setTimeout(() => {
      const trials = 1000;
      const results = [];
      const years = [1, 2, 3, 4, 5];
      const actualBaseRev = baseRevenue || 1;
      const actualBaseFcfMargin = baseFcfMargin || 0.10;

      for (let t = 0; t < trials; t++) {
        const randGrowth = randomNormal(baseGrowth, 0.03); 
        const randMargin = Math.max(0.01, randomNormal(baseMargin, 0.02)); 
        const randWacc = Math.max(0.03, randomNormal(baseWacc, 0.008)); 
        const randTerm = Math.max(0.001, randomNormal(baseTerminal, 0.005)); 

        let trialRev = actualBaseRev;
        const projectedFcfs = [];
        for (let i = 1; i <= 5; i++) {
          trialRev = trialRev * (1 + randGrowth);
          projectedFcfs.push(trialRev * randMargin);
        }

        const dfs = years.map(y => 1 / Math.pow(1 + randWacc, y));
        const sumPV = projectedFcfs.reduce((sum, f, idx) => sum + (f * dfs[idx]), 0);
        
        const tv = randWacc > randTerm ? (projectedFcfs[4] * (1 + randTerm) / (randWacc - randTerm)) : 0;
        const pvTv = tv * dfs[4];
        const enterpriseValue = sumPV + pvTv;

        const equityValue = enterpriseValue - netDebt;
        const valuePerShare = shares > 0 ? (equityValue / shares) : 0;

        if (!isNaN(valuePerShare) && isFinite(valuePerShare) && valuePerShare > 0) {
          results.push(valuePerShare);
        }
      }

      results.sort((a, b) => a - b);
      
      const p10 = results[Math.floor(results.length * 0.1)] || 0;
      const p50 = results[Math.floor(results.length * 0.5)] || 0;
      const p90 = results[Math.floor(results.length * 0.9)] || 0;

      const upsideCount = results.filter(v => v > currentPrice).length;
      const probUpside = (upsideCount / results.length) * 100;

      const minVal = results[0];
      const maxVal = results[results.length - 1];
      const range = maxVal - minVal;
      const binsCount = 25;
      const binWidth = range / binsCount;
      const bins = Array.from({ length: binsCount }).map((_, i) => ({
        x: minVal + i * binWidth + binWidth / 2,
        count: 0
      }));

      results.forEach(v => {
        const binIdx = Math.min(binsCount - 1, Math.floor((v - minVal) / binWidth));
        if (bins[binIdx]) bins[binIdx].count++;
      });

      setSimResults({
        p10, p50, p90, probUpside, bins, results, minVal, maxVal
      });
      setSimulating(false);
    }, 450);
  };

  return (
    <div className="mt-8 pt-6 border-t border-white/5 space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
            Monte Carlo Quant Simulator
          </h4>
        </div>
        <button
          onClick={runSimulation}
          disabled={simulating}
          className="px-4 py-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 disabled:opacity-50 text-white font-mono text-[10px] font-bold rounded-xl transition cursor-pointer"
        >
          {simulating ? 'Simulating...' : 'Run Simulation'}
        </button>
      </div>

      {simResults && !simulating && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-zinc-950/40 p-5 rounded-xl border border-zinc-900">
          <div className="lg:col-span-2">
            <div className="h-44 w-full bg-zinc-950/60 border border-zinc-900/60 rounded-xl pt-6 pb-2 px-4 relative">
              <svg className="w-full h-full overflow-visible" viewBox="0 0 500 100" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="bellGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity="0.3" />
                    <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                {(() => {
                  const maxCount = Math.max(...simResults.bins.map(b => b.count)) || 1;
                  const pts = simResults.bins.map((b, idx) => {
                    const x = (idx / (simResults.bins.length - 1)) * 500;
                    const y = 90 - (b.count / maxCount) * 80;
                    return { x, y };
                  });
                  const pathD = `M ${pts.map(p => `${p.x},${p.y}`).join(' L ')}`;
                  const areaD = `${pathD} L 500,100 L 0,100 Z`;

                  // Map P50 & Price coordinates
                  const getXCoord = (val) => {
                    const ratio = (val - simResults.minVal) / (simResults.maxVal - simResults.minVal);
                    return Math.min(500, Math.max(0, ratio * 500));
                  };

                  const p50X = getXCoord(simResults.p50);
                  const priceX = getXCoord(currentPrice);
                  const p10X = getXCoord(simResults.p10);
                  const p90X = getXCoord(simResults.p90);

                  return (
                    <>
                      <path d={areaD} fill="url(#bellGrad)" />
                      <path d={pathD} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
                      
                      {/* P10 Bear Notch */}
                      <line x1={p10X} y1="0" x2={p10X} y2="100" stroke="#ef4444" strokeWidth="1" strokeDasharray="3,3" />
                      
                      {/* P50 Median Notch */}
                      <line x1={p50X} y1="0" x2={p50X} y2="100" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="2,2" />
                      
                      {/* P90 Bull Notch */}
                      <line x1={p90X} y1="0" x2={p90X} y2="100" stroke="#10b981" strokeWidth="1" strokeDasharray="3,3" />

                      {/* Current price notch */}
                      <line x1={priceX} y1="0" x2={priceX} y2="100" stroke="#f59e0b" strokeWidth="2" />
                    </>
                  );
                })()}
              </svg>
              
              {/* Labels on top */}
              <div className="absolute inset-0 flex justify-between px-4 text-[8px] font-mono text-zinc-500 pointer-events-none p-2">
                <span>Bear Zone (Low)</span>
                <span>Expected Value Center</span>
                <span>Bull Zone (High)</span>
              </div>
            </div>

            <div className="flex justify-between items-center text-[9px] font-mono text-zinc-500 px-1 mt-2">
              <span>Min: {formatNum(simResults.minVal, currency)}</span>
              <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-[#f59e0b] inline-block" /> Current Price ({formatNum(currentPrice, currency)})</span>
              <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-[#3b82f6] inline-block" /> Median P50 ({formatNum(simResults.p50, currency)})</span>
              <span>Max: {formatNum(simResults.maxVal, currency)}</span>
            </div>
          </div>

          {/* Stats Output Card */}
          <div className="bg-zinc-950/60 p-4 border border-zinc-900 rounded-xl flex flex-col justify-between text-xs font-mono">
            <div className="space-y-3">
              <h5 className="text-[10px] font-bold text-white uppercase tracking-widest border-b border-zinc-900 pb-2">Simulation Outputs</h5>
              
              <div className="flex justify-between">
                <span className="text-zinc-500">P10 (Worst Case):</span>
                <span className="text-red-400 font-bold">{formatNum(simResults.p10, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">P50 (Median Case):</span>
                <span className="text-blue-400 font-bold">{formatNum(simResults.p50, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">P90 (Best Case):</span>
                <span className="text-emerald-400 font-bold">{formatNum(simResults.p90, currency)}</span>
              </div>
              <div className="flex justify-between border-t border-zinc-900 pt-2">
                <span className="text-zinc-400">Probability of Upside:</span>
                <span className={`font-black ${simResults.probUpside >= 50 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {simResults.probUpside.toFixed(1)}%
                </span>
              </div>
            </div>

            <div className="mt-4 p-2.5 bg-zinc-900/40 rounded border border-zinc-900 text-[9px] text-zinc-400 leading-normal">
              {simResults.probUpside >= 65 ? (
                <span className="text-emerald-400 font-bold">[ACCUMULATION RECOMMENDED] Strong statistical backing with high margin of safety.</span>
              ) : simResults.probUpside >= 40 ? (
                <span className="text-amber-500 font-bold">[HOLD/WAIT RECOMMENDED] Mixed distribution. Fairly valued relative to current rates.</span>
              ) : (
                <span className="text-red-400 font-bold">[EXPOSURE RISK DETECTED] Intrinsic value probability distribution sits below market price.</span>
              )}
            </div>
          </div>
          
        </div>
      )}
    </div>
  );
}

// WACC × TERMINAL GROWTH SENSITIVITY HEATMAP
export function SensitivityHeatmap({ baseRevenue, baseFcfMargin, activeGrowth, activeMargin, netDebt, shares, currentPrice, currency }) {
  if (!baseRevenue || baseRevenue <= 0 || !shares || shares <= 0) return null;

  const waccSteps = [0.06, 0.07, 0.08, 0.09, 0.10, 0.11, 0.12];
  const termSteps = [0.01, 0.015, 0.02, 0.025, 0.03, 0.035, 0.04];

  const computeIntrinsic = (wacc, term) => {
    if (wacc <= term) return null;
    let rev = baseRevenue;
    const fcfs = [];
    for (let i = 1; i <= 5; i++) {
      rev = rev * (1 + activeGrowth);
      fcfs.push(rev * activeMargin);
    }
    const dfs = [1,2,3,4,5].map(y => 1 / Math.pow(1 + wacc, y));
    const sumPV = fcfs.reduce((s, f, i) => s + f * dfs[i], 0);
    const tv = fcfs[4] * (1 + term) / (wacc - term);
    const pvTv = tv * dfs[4];
    const ev = sumPV + pvTv;
    const eq = ev - netDebt;
    return shares > 0 ? eq / shares : 0;
  };

  const getCellColor = (val) => {
    if (val === null) return 'bg-zinc-900 text-zinc-600';
    const pct = currentPrice > 0 ? ((val - currentPrice) / currentPrice) : 0;
    if (pct > 0.30) return 'bg-emerald-950 text-emerald-400 border border-emerald-500/20 font-bold';
    if (pct > 0.10) return 'bg-amber-950/40 text-amber-400 border border-amber-500/10';
    if (pct > -0.10) return 'bg-zinc-900/40 text-zinc-400 border border-zinc-800';
    if (pct > -0.30) return 'bg-orange-950/30 text-orange-400 border border-orange-500/10';
    return 'bg-red-950 text-red-400 border border-red-500/20 font-bold';
  };

  return (
    <div className="mt-8 pt-6 border-t border-white/5 space-y-4">
      <div>
        <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
          <svg className="w-4 h-4 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" /></svg>
          WACC × Terminal Growth Sensitivity Matrix
        </h4>
        <p className="text-[10px] text-zinc-400 mt-0.5">Implied intrinsic value per share across discount rate and perpetuity growth assumptions. Current price: <span className="text-amber-400 font-bold">{formatNum(currentPrice, currency)}</span></p>
      </div>

      <div className="overflow-x-auto border border-zinc-900 rounded-xl bg-zinc-950/60">
        <table className="w-full text-center border-collapse text-[10px] font-mono">
          <thead>
            <tr className="border-b border-zinc-900 bg-zinc-950/80">
              <th className="p-2 text-zinc-500 text-[9px] uppercase">WACC ↓ \ Tg →</th>
              {termSteps.map(t => (
                <th key={t} className="p-2 text-zinc-400 font-bold">{(t * 100).toFixed(1)}%</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900">
            {waccSteps.map(w => (
              <tr key={w}>
                <td className="p-2 text-zinc-400 font-bold bg-zinc-950/80 text-left">{(w * 100).toFixed(0)}%</td>
                {termSteps.map(t => {
                  const val = computeIntrinsic(w, t);
                  return (
                    <td key={`${w}-${t}`} className={`p-2 transition ${getCellColor(val)}`}>
                      {val !== null ? formatNum(val, currency) : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-4 text-[9px] font-mono text-zinc-500">
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-emerald-950 inline-block border border-emerald-500/20" /> &gt;30% upside</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-amber-950/40 inline-block border border-amber-500/10" /> 10-30% upside</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-zinc-900/40 inline-block border border-zinc-800" /> ±10% (fair value)</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-orange-950/30 inline-block border border-orange-500/10" /> 10-30% downside</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 rounded bg-red-950 inline-block border border-red-500/20" /> &gt;30% downside</span>
      </div>
    </div>
  );
}

// 2. EXPANDED BENCHMARKED RATIOS DASHBOARD COMPONENT
export function RatiosGrid({ resultsData }) {
  const incomeStatements = resultsData?.historical?.incomeStatements || [];
  const balanceSheets = resultsData?.historical?.balanceSheets || [];
  const cashFlows = resultsData?.historical?.cashFlows || [];
  const quote = resultsData?.quote || resultsData?.fullPayload?.quote || {};
  
  if (incomeStatements.length === 0) return null;

  const latestIS = incomeStatements[0] || {};
  const latestBS = balanceSheets[0] || {};
  const latestCF = cashFlows[0] || {};

  const rev = latestIS.revenue || 0;
  const netInc = latestIS.netIncome || 0;
  const opInc = latestIS.operatingIncome || 0;
  const gross = latestIS.grossProfit || 0;
  const assets = latestBS.totalAssets || 0;
  const debt = latestBS.debt !== undefined && latestBS.debt !== null ? latestBS.debt : (latestBS.totalDebt !== undefined && latestBS.totalDebt !== null ? latestBS.totalDebt : 0);
  const equity = latestBS.equity !== undefined && latestBS.equity !== null ? latestBS.equity : (latestBS.totalStockholderEquity !== undefined && latestBS.totalStockholderEquity !== null ? latestBS.totalStockholderEquity : 0);
  const liab = latestBS.totalLiabilities || 0;
  const cash = latestBS.cash || 0;
  const hasCashFlows = cashFlows.length > 0;
  const ocf = hasCashFlows ? (latestCF.operatingCashflow || 0) : null;
  const fcf = hasCashFlows ? (latestCF.freeCashflow || 0) : null;
  const capex = hasCashFlows ? Math.abs(latestCF.capex || 0) : null;

  const sector = resultsData?.profile?.sector || 'Technology';
  const isTech = sector.toLowerCase().includes('tech') || sector.toLowerCase().includes('semiconductor');
  const isFinancial = sector.toLowerCase().includes('financial') || sector.toLowerCase().includes('bank') || sector.toLowerCase().includes('insurance');

  // Computations (nullify non-meaningful corporate ratios for financial institutions)
  const grossMarginVal = isFinancial ? null : (rev ? gross / rev : null);
  const opMarginVal = isFinancial ? null : (rev ? opInc / rev : null);
  const netMarginVal = rev ? netInc / rev : null;
  const roeVal = equity ? netInc / equity : null;
  const roaVal = assets ? netInc / assets : null;

  const deVal = equity ? debt / equity : null;
  const daVal = assets ? debt / assets : null;
  const cashToDebtVal = debt ? cash / debt : null;
  const leverageVal = assets ? liab / assets : null;

  const assetTurnoverVal = isFinancial ? null : (assets ? rev / assets : null);
  const ocfMarginVal = (ocf !== null && rev) ? ocf / rev : null;
  const fcfConversionVal = (fcf !== null && netInc) ? fcf / netInc : null;
  const capexToRevVal = (capex !== null && rev) ? capex / rev : null;

  // Sector benchmarks
  const benchmarks = {
    grossMargin: isTech ? 0.45 : (isFinancial ? null : 0.35),
    operatingMargin: isTech ? 0.22 : (isFinancial ? null : 0.15),
    netMargin: isTech ? 0.18 : (isFinancial ? 0.15 : 0.12),
    roe: isTech ? 0.20 : (isFinancial ? 0.12 : 0.14),
    roa: isTech ? 0.10 : (isFinancial ? 0.01 : 0.07), // Banks have low ROA (1% is solid)
    de: isTech ? 0.40 : (isFinancial ? 8.00 : 0.70), // Banks operate with high leverage
    da: isTech ? 0.25 : (isFinancial ? 0.90 : 0.35),
    cashToDebt: isTech ? 1.20 : (isFinancial ? 0.10 : 0.50),
    leverage: isTech ? 0.45 : (isFinancial ? 0.90 : 0.55),
    assetTurnover: isTech ? 0.70 : (isFinancial ? null : 0.65),
    ocfMargin: isTech ? 0.24 : (isFinancial ? 0.15 : 0.18),
    fcfConversion: 0.90,
    capexToRev: isTech ? 0.07 : (isFinancial ? 0.02 : 0.05)
  };

  const getStatus = (metricName, value, benchmark, lowerIsBetter = false) => {
    if (value === null || value === undefined) return { label: 'N/A', color: 'bg-zinc-800 text-zinc-400' };
    
    const diff = lowerIsBetter ? (benchmark - value) / benchmark : (value - benchmark) / benchmark;
    
    if (diff > 0.20) return { label: 'OUTSTANDING', color: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' };
    if (diff >= 0) return { label: 'HEALTHY', color: 'bg-teal-500/10 text-teal-400 border border-teal-500/20' };
    if (diff > -0.15) return { label: 'ADEQUATE', color: 'bg-amber-500/10 text-amber-400 border border-amber-500/20' };
    
    // Customize red labels so non-solvency ratios are not called "LEVERAGED"
    if (metricName.includes('Debt to Equity') || metricName === 'Debt to Assets' || metricName === 'Leverage Ratio (Total Liabilities / Assets)') {
      return { label: 'LEVERAGED', color: 'bg-red-500/10 text-red-400 border border-red-500/20' };
    }
    if (metricName === 'Capex to Revenue') {
      return { label: 'CAPITAL INTENSIVE', color: 'bg-red-500/10 text-red-400 border border-red-500/20' };
    }
    if (metricName === 'FCF Conversion Rate') {
      return { label: 'BELOW BENCHMARK', color: 'bg-red-500/10 text-red-400 border border-red-500/20' };
    }
    return { label: 'UNDERPERFORMING', color: 'bg-red-500/10 text-red-400 border border-red-500/20' };
  };

  const renderMeter = (value, benchmark, lowerIsBetter = false) => {
    if (value === null || value === undefined) return null;
    const maxScale = Math.max(value, benchmark) * 1.3 || 1;
    const valPct = Math.min(100, Math.max(5, (value / maxScale) * 100));
    const benchPct = Math.min(100, Math.max(5, (benchmark / maxScale) * 100));
    
    return (
      <div className="w-full bg-zinc-900 h-2 rounded-full relative overflow-visible mt-2">
        <div 
          style={{ width: `${valPct}%` }} 
          className={`h-full rounded-full ${lowerIsBetter ? (value > benchmark ? 'bg-red-500' : 'bg-emerald-500') : (value < benchmark ? 'bg-amber-500' : 'bg-emerald-500')}`} 
        />
        <div 
          style={{ left: `${benchPct}%` }} 
          className="absolute -top-1 w-1.5 h-4 bg-zinc-400 rounded-sm border border-zinc-950" 
          title={`Sector Benchmark: ${benchmark}`}
        />
      </div>
    );
  };

  const ratioGroups = [
    {
      title: 'Profitability Ratios',
      desc: 'Measures company efficiency at earning profits relative to assets, equity, and sales.',
      items: [
        { name: 'Gross Margin', value: grossMarginVal, isPct: true, bench: benchmarks.grossMargin },
        { name: 'Operating Margin', value: opMarginVal, isPct: true, bench: benchmarks.operatingMargin },
        { name: 'Net Profit Margin', value: netMarginVal, isPct: true, bench: benchmarks.netMargin },
        { name: 'Return on Equity (ROE)', value: roeVal, isPct: true, bench: benchmarks.roe },
        { name: 'Return on Assets (ROA)', value: roaVal, isPct: true, bench: benchmarks.roa }
      ]
    },
    {
      title: 'Solvency & Leverage Ratios',
      desc: 'Measures capabilities to meet long-term obligations and structural debt health.',
      items: [
        { name: 'Debt to Equity (LTD Only)', value: deVal, isPct: false, bench: benchmarks.de, lowerIsBetter: true },
        { name: 'Debt to Assets', value: daVal, isPct: false, bench: benchmarks.da, lowerIsBetter: true },
        { name: 'Cash to Debt Coverage', value: cashToDebtVal, isPct: false, bench: benchmarks.cashToDebt },
        { name: 'Leverage Ratio (Total Liabilities / Assets)', value: leverageVal, isPct: false, bench: benchmarks.leverage, lowerIsBetter: true }
      ]
    },
    {
      title: 'Operating Efficiency Ratios',
      desc: 'Measures rate at which assets generate sales revenues and convert them to free cash.',
      items: [
        { name: 'Asset Turnover', value: assetTurnoverVal, isPct: false, bench: benchmarks.assetTurnover, isMultiplier: true },
        { name: 'OCF Margin', value: ocfMarginVal, isPct: true, bench: benchmarks.ocfMargin },
        { name: 'FCF Conversion Rate', value: fcfConversionVal, isPct: true, bench: benchmarks.fcfConversion },
        { name: 'Capex to Revenue', value: capexToRevVal, isPct: true, bench: benchmarks.capexToRev, lowerIsBetter: true }
      ]
    }
  ];

  return (
    <section id="ratios-dashboard" className="glass-panel p-6 bg-[#0D0D12]/80 border border-white/5 rounded-2xl relative overflow-hidden scroll-mt-20">
      <div className="absolute top-0 left-0 w-64 h-64 bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="mb-6 pb-4 border-b border-white/5">
        <h3 className="text-xs font-semibold text-white flex items-center gap-2 font-mono uppercase tracking-wider">
          <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16 8v8m-4-5v5m-4-2v2M2 4h20v16H2V4z" /></svg>
          Benchmarked Ratios Dashboard
        </h3>
        <p className="text-[10px] text-zinc-400 mt-1">
          Historical financial metrics benchmarked against sector averages ({sector} sector).
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {ratioGroups.map((group, gIdx) => (
          <div key={gIdx} className="space-y-4 bg-zinc-950/20 p-4 rounded-xl border border-zinc-900">
            <div>
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">{group.title}</h4>
              <p className="text-[9px] text-zinc-500 leading-normal mt-1">{group.desc}</p>
            </div>
            
            <div className="space-y-4">
              {group.items.map((item, iIdx) => {
                const status = getStatus(item.name, item.value, item.bench, item.lowerIsBetter);
                const displayVal = item.isPct ? formatPct(item.value) : (item.isMultiplier ? `${item.value?.toFixed(2)}x` : item.value?.toFixed(2));
                const displayBench = item.isPct ? formatPct(item.bench) : (item.isMultiplier ? `${item.bench?.toFixed(2)}x` : item.bench?.toFixed(2));
                
                return (
                  <div key={iIdx} className="p-3 bg-zinc-950/60 border border-zinc-900 rounded-lg">
                    <div className="flex justify-between items-start gap-2 mb-1.5">
                      <span className="text-[10px] font-semibold text-zinc-300 font-sans">{item.name}</span>
                      <span className={`text-[8px] font-bold font-mono px-1.5 py-0.5 rounded ${status.color}`}>
                        {status.label}
                      </span>
                    </div>
                    
                    <div className="flex justify-between items-baseline text-xs font-mono">
                      <div>
                        <span className="text-zinc-500 text-[9px] block">Actual</span>
                        <span className="text-white font-bold">{displayVal}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-zinc-500 text-[9px] block">Benchmark</span>
                        <span className="text-zinc-400">{displayBench}</span>
                      </div>
                    </div>
                    
                    {renderMeter(item.value, item.bench, item.lowerIsBetter)}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* 2B. 5-WAY DUPONT ANALYSIS DECOMPOSITION */}
      <DupontAnalysis incomeStatements={incomeStatements} balanceSheets={balanceSheets} />

      {/* 2C. COMPETITOR PEER BENCHMARKING MATRIX */}
      <PeerBenchmarking ticker={resultsData?.profile?.ticker} sector={sector} currentQuote={quote} resultsData={resultsData} />

    </section>
  );
}

// 5-WAY DUPONT ANALYSIS BREAKDOWN COMPONENT
export function DupontAnalysis({ incomeStatements, balanceSheets }) {
  // Sort statements by year descending, grab past 3 periods
  const isList = [...incomeStatements].sort((a, b) => b.year - a.year).slice(0, 3).reverse();
  
  return (
    <div className="pt-6 border-t border-white/5 space-y-4">
      <div>
        <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
          <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
          5-Way DuPont Analysis Decomposition
        </h4>
        <p className="text-[10px] text-zinc-400 mt-0.5">Deconstruct ROE = Tax Burden × Interest Burden × Operating Margin × Asset Turnover × Equity Multiplier.</p>
      </div>

      <div className="overflow-x-auto border border-zinc-900 rounded-xl bg-zinc-950/60">
        <table className="w-full text-left border-collapse text-xs font-mono">
          <thead>
            <tr className="border-b border-zinc-900 bg-zinc-950/80 text-zinc-500 uppercase tracking-widest text-[9px]">
              <th className="p-3">DuPont Pillar</th>
              <th className="p-3">Operational Lever</th>
              {isList.map(item => (
                <th key={item.year} className="p-3 text-right">FY{item.year}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900 text-zinc-300">
            {(() => {
              const rows = isList.map(item => {
                const bal = balanceSheets.find(b => b.year === item.year) || {};
                
                const netIncome = item.netIncome || 0;
                
                // Estimate EBT (Earnings Before Tax) — handle loss-making companies
                let ebt;
                if (item.ebt) {
                  ebt = item.ebt;
                } else if (netIncome < 0) {
                  // For loss-making companies, assume no tax benefit: EBT ≈ Net Income
                  ebt = netIncome;
                } else if (netIncome > 0) {
                  // Standard assumption: 21% effective tax rate
                  ebt = netIncome / 0.79;
                } else {
                  ebt = 0;
                }

                const ebit = item.ebit || item.operatingIncome || ebt || 1;
                const revenue = item.revenue || 1;
                const assets = bal.totalAssets || 1;
                const equity = bal.equity || 1;

                // DuPont Factors — guard against division issues
                const taxBurden = (ebt !== 0 && ebt !== null) ? netIncome / ebt : (netIncome === 0 ? 1 : 0);
                const interestBurden = (ebit !== 0 && ebit !== null) ? ebt / ebit : 1;
                const opMargin = ebit / revenue;
                const assetTurnover = revenue / assets;
                const equityMult = assets / equity;
                const roe = equity ? netIncome / equity : 0;

                return {
                  year: item.year,
                  taxBurden,
                  interestBurden,
                  opMargin,
                  assetTurnover,
                  equityMult,
                  roe
                };
              });

              return (
                <>
                  <tr>
                    <td className="p-3 font-semibold text-white">1. Tax Burden</td>
                    <td className="p-3 text-zinc-500">Net Income / EBT (Tax efficiency)</td>
                    {rows.map(r => (
                      <td key={r.year} className="p-3 text-right">{r.taxBurden.toFixed(3)}x</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-white">2. Interest Burden</td>
                    <td className="p-3 text-zinc-500">EBT / EBIT (Interest leverage burden)</td>
                    {rows.map(r => (
                      <td key={r.year} className="p-3 text-right">{r.interestBurden.toFixed(3)}x</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-white">3. Operating Margin</td>
                    <td className="p-3 text-zinc-500">EBIT / Revenue (Operating profit rate)</td>
                    {rows.map(r => (
                      <td key={r.year} className="p-3 text-right">{(r.opMargin * 100).toFixed(1)}%</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-white">4. Asset Turnover</td>
                    <td className="p-3 text-zinc-500">Revenue / Assets (Asset usage efficiency)</td>
                    {rows.map(r => (
                      <td key={r.year} className="p-3 text-right">{r.assetTurnover.toFixed(2)}x</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="p-3 font-semibold text-white">5. Equity Multiplier</td>
                    <td className="p-3 text-zinc-500">Assets / Equity (Structural financial leverage)</td>
                    {rows.map(r => (
                      <td key={r.year} className="p-3 text-right">{r.equityMult.toFixed(2)}x</td>
                    ))}
                  </tr>
                  <tr className="bg-zinc-900/30">
                    <td className="p-3 font-bold text-emerald-400">Return on Equity (ROE)</td>
                    <td className="p-3 text-zinc-400 italic font-sans font-medium">Decomposed final equity return rate</td>
                    {rows.map(r => (
                      <td key={r.year} className="p-3 text-right text-emerald-400 font-bold">{(r.roe * 100).toFixed(2)}%</td>
                    ))}
                  </tr>
                </>
              );
            })()}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// COMPETITOR PEER BENCHMARKING COMPONENT
export function PeerBenchmarking({ ticker, sector, currentQuote, resultsData }) {
  const cleanTicker = ticker?.toUpperCase() || '';
  
  // Use dynamically resolved peers from backend if available
  let peerList = resultsData?.peers || resultsData?.fullPayload?.peers || [];
  
  if (peerList.length === 0) {
    const peersKeys = cleanTicker === 'AAPL' ? ['MSFT', 'GOOG', 'AMZN'] :
                      cleanTicker === 'NVDA' ? ['AMD', 'INTC', 'QCOM'] :
                      cleanTicker === 'TSLA' ? ['F', 'GM', 'BYDDY'] :
                      cleanTicker === 'MSFT' ? ['AAPL', 'GOOG', 'AMZN'] :
                      ['MSFT', 'GOOG', 'LLY']; // Technology defaults
    
    // Filter out the active target itself to prevent duplicate rows
    const filteredPeersKeys = peersKeys.filter(k => k !== cleanTicker);
    peerList = filteredPeersKeys.map(k => ({ ticker: k, ...peerDb[k] }));
  }

  // Dynamic calculations for target active stock
  const incomeStatements = resultsData?.historical?.incomeStatements || resultsData?.fullPayload?.historical?.incomeStatements || [];
  const balanceSheets = resultsData?.historical?.balanceSheets || resultsData?.fullPayload?.historical?.balanceSheets || [];
  const latestIS = incomeStatements[0] || {};
  const latestBS = balanceSheets[0] || {};
  const prevIS = incomeStatements[1] || {};

  const targetNetMargin = latestIS.revenue ? (latestIS.netIncome / latestIS.revenue) : (currentQuote?.pe ? 1.0 / currentQuote.pe : 0.15);
  const targetDE = latestBS.equity ? (latestBS.debt / latestBS.equity) : 0.45;
  const targetROE = latestBS.equity ? (latestIS.netIncome / latestBS.equity) : 0.20;
  const targetGrowth = prevIS.revenue ? (latestIS.revenue - prevIS.revenue) / prevIS.revenue : 0.08;
  
  const currentPrice = currentQuote?.price || 1;
  const sharesOutstanding = currentQuote?.sharesOutstanding || 
    (currentQuote?.marketCap > 0 && currentPrice > 0 ? currentQuote.marketCap / currentPrice : null) || 1e8;
  const marketCap = currentQuote?.marketCap || (sharesOutstanding * currentPrice) || 0;
  const debt = latestBS.debt || 0;
  const cash = latestBS.cash || 0;
  
  // Enterprise Value is defined as Market Cap + Debt - Cash. 
  // If marketCap is not loaded or is 0, we treat EV as null to avoid invalid negative/distorted ratios.
  const targetEV = marketCap > 0 ? (marketCap + debt - cash) : null;
  const targetEVRev = (latestIS.revenue && targetEV !== null && targetEV > 0) ? (targetEV / latestIS.revenue) : null;

  return (
    <div className="pt-6 border-t border-white/5 space-y-4">
      <div>
        <h4 className="text-xs font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
          Advanced Competitor Peer Benchmarking
        </h4>
        <p className="text-[10px] text-zinc-400 mt-0.5">Benchmarking matrix comparing {cleanTicker} against sector peers.</p>
      </div>

      <div className="overflow-x-auto border border-zinc-900 rounded-xl bg-zinc-950/60">
        <table className="w-full text-left border-collapse text-xs font-mono">
          <thead>
            <tr className="border-b border-zinc-900 bg-zinc-950/80 text-zinc-500 uppercase tracking-widest text-[9px]">
              <th className="p-3">Peer Entity</th>
              <th className="p-3 text-right">P/E Ratio</th>
              <th className="p-3 text-right">PEG Ratio</th>
              <th className="p-3 text-right">EV/Revenue</th>
              <th className="p-3 text-right">Net Margin</th>
              <th className="p-3 text-right">Debt/Equity</th>
              <th className="p-3 text-right">ROE</th>
              <th className="p-3 text-right">Growth Rate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-900 text-zinc-300">
            {/* Target Stock Row */}
            <tr className="bg-blue-500/5 font-semibold">
              <td className="p-3 text-white flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                {cleanTicker} (Active Target)
              </td>
              <td className="p-3 text-right text-white">
                {(() => {
                  const dynamicPe = (latestIS.eps && latestIS.eps > 0 && currentPrice) ? (currentPrice / latestIS.eps) : (currentQuote?.pe || null);
                  return dynamicPe ? `${dynamicPe.toFixed(1)}x` : 'N/A';
                })()}
              </td>
              <td className="p-3 text-right text-white">{currentQuote?.pegRatio ? currentQuote.pegRatio.toFixed(2) : 'N/A'}</td>
              <td className="p-3 text-right text-white">{targetEVRev ? `${targetEVRev.toFixed(2)}x` : 'N/A'}</td>
              <td className="p-3 text-right text-white">{(targetNetMargin * 100).toFixed(1)}%</td>
              <td className="p-3 text-right text-white">{targetDE?.toFixed(2) || 'N/A'}</td>
              <td className="p-3 text-right text-emerald-400">{(targetROE * 100).toFixed(1)}%</td>
              <td className="p-3 text-right text-emerald-400">{targetGrowth >= 0 ? '+' : ''}{(targetGrowth * 100).toFixed(1)}%</td>
            </tr>

            {/* Competitors */}
            {peerList.map(peer => (
              <tr key={peer.ticker} className="hover:bg-zinc-900/35">
                <td className="p-3 text-zinc-400">{peer.ticker} ({peer.name})</td>
                <td className="p-3 text-right">{peer.pe ? `${peer.pe.toFixed(1)}x` : 'N/A'}</td>
                <td className="p-3 text-right">{peer.peg ? peer.peg.toFixed(2) : 'N/A'}</td>
                <td className="p-3 text-right">{peer.evRev ? `${peer.evRev.toFixed(2)}x` : 'N/A'}</td>
                <td className="p-3 text-right">
                  {peer.netMargin !== undefined && peer.netMargin !== null ? `${(peer.netMargin * 100).toFixed(1)}%` : 'N/A'}
                </td>
                <td className="p-3 text-right">{peer.de !== undefined && peer.de !== null ? peer.de.toFixed(2) : 'N/A'}</td>
                <td className="p-3 text-right">
                  {peer.roe !== undefined && peer.roe !== null ? `${(peer.roe * 100).toFixed(1)}%` : 'N/A'}
                </td>
                <td className="p-3 text-right">
                  {peer.growth !== undefined && peer.growth !== null ? `${peer.growth >= 0 ? '+' : ''}${(peer.growth * 100).toFixed(1)}%` : 'N/A'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 3. COMMITTEE AUDIT LEDGER COMPONENT (WITH DYNAMIC CLAIM OVERRIDES)
export function CommitteeAuditLedger({ resultsData, onScoreChange }) {
  const debate = resultsData?.debate || {};
  const bullArgs = debate.bull_arguments || [];
  const bearArgs = debate.bear_arguments || [];
  const maxLen = Math.max(bullArgs.length, bearArgs.length);

  // Initialize weights for claims
  const [bullWeights, setBullWeights] = useState(Array(bullArgs.length).fill(3)); // default weight = 3
  const [bearWeights, setBearWeights] = useState(Array(bearArgs.length).fill(3)); // default weight = 3

  const handleBullWeight = (idx, val) => {
    const next = [...bullWeights];
    next[idx] = parseInt(val) || 1;
    setBullWeights(next);
  };

  const handleBearWeight = (idx, val) => {
    const next = [...bearWeights];
    next[idx] = parseInt(val) || 1;
    setBearWeights(next);
  };

  // Recalculate verdict score based on overrides
  useEffect(() => {
    const baseScore = resultsData?.verdict?.score || 0;
    
    // Sum deltas from base weight (3)
    let bullDelta = 0;
    bullWeights.forEach(w => {
      bullDelta += (w - 3) * 0.15;
    });

    let bearDelta = 0;
    bearWeights.forEach(w => {
      bearDelta += (w - 3) * 0.15;
    });

    // Final custom score clamped between -3.0 and +3.0
    const finalScore = Math.max(-3.0, Math.min(3.0, baseScore + bullDelta - bearDelta));
    
    // Determine custom recommendation label & decision
    let label = 'HOLD';
    let decision = 'HOLD';

    if (finalScore >= 2.0) {
      label = 'BUY';
      decision = 'INVEST';
    } else if (finalScore >= 1.0) {
      label = 'ACCUMULATE';
      decision = 'INVEST';
    } else if (finalScore >= -1.0) {
      label = 'HOLD';
      decision = 'HOLD';
    } else {
      label = 'AVOID';
      decision = 'PASS';
    }

    if (onScoreChange) {
      onScoreChange(finalScore, label, decision);
    }
  }, [bullWeights, bearWeights, resultsData]);

  // Dynamic accordion toggle state
  const [expandedRows, setExpandedRows] = useState({ 0: true });

  const toggleRow = (idx) => {
    setExpandedRows(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  const baseScore = resultsData?.verdict?.score || 0;
  
  // Sum deltas from base weight (3)
  let bullDelta = 0;
  bullWeights.forEach(w => {
    bullDelta += (w - 3) * 0.15;
  });

  let bearDelta = 0;
  bearWeights.forEach(w => {
    bearDelta += (w - 3) * 0.15;
  });

  // Final score & confidence metrics calculated at render-time
  const finalScore = Math.max(-3.0, Math.min(3.0, baseScore + bullDelta - bearDelta));
  const confidenceMetrics = calculateCommitteeConfidence(resultsData, finalScore);

  return (
    <section id="audit-ledger" className="glass-panel overflow-hidden bg-[#0D0D12]/80 border border-white/5 rounded-2xl scroll-mt-20">
      
      {/* Header and Live Scorecard Panel */}
      <div className="px-6 py-5 bg-zinc-950/80 border-b border-zinc-900 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h3 className="text-xs font-semibold text-white flex items-center gap-2 font-mono uppercase tracking-wider">
            <svg className="w-5 h-5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            Committee Audit Ledger
          </h3>
          <p className="text-[10px] text-zinc-400 mt-1">Override claim weights below to dynamically recalibrate committee verdict settings in real time.</p>
        </div>
        
        {/* Dynamic Confidence Scorecard */}
        <div className="flex flex-wrap items-center gap-3 bg-zinc-900/60 p-2.5 border border-zinc-800/80 rounded-xl text-[10px] font-mono">
          <div className="px-2 border-r border-zinc-850">
            <span className="text-zinc-500 block text-[9px] uppercase">Consensus</span>
            <span className="font-bold text-amber-400 text-xs">{confidenceMetrics.consensus} / 10</span>
          </div>
          <div className="px-2 border-r border-zinc-850">
            <span className="text-zinc-500 block text-[9px] uppercase">Confidence</span>
            <span className="font-bold text-emerald-400 text-xs">{confidenceMetrics.confidence}%</span>
          </div>
          <div className="px-2 border-r border-zinc-850">
            <span className="text-zinc-500 block text-[9px] uppercase">Evidence Strength</span>
            <span className="font-bold text-blue-400 text-xs">{confidenceMetrics.strength}</span>
          </div>
          <div className="px-2" title={`Provenances: ${(resultsData?.dataProvenance || resultsData?.gateway?.dataProvenance || resultsData?.fullPayload?.gateway?.dataProvenance || []).join(', ') || 'Yahoo Finance'}`}>
            <span className="text-zinc-500 block text-[9px] uppercase">Data Integrity</span>
            <span className={`font-bold text-xs ${
              (resultsData?.dataConfidence || resultsData?.gateway?.dataConfidence || resultsData?.fullPayload?.gateway?.dataConfidence) === 'LOW' ? 'text-rose-500' :
              (resultsData?.dataConfidence || resultsData?.gateway?.dataConfidence || resultsData?.fullPayload?.gateway?.dataConfidence) === 'MEDIUM' ? 'text-amber-400' :
              'text-emerald-400'
            }`}>{resultsData?.dataConfidence || resultsData?.gateway?.dataConfidence || resultsData?.fullPayload?.gateway?.dataConfidence || 'HIGH'}</span>
          </div>
        </div>
      </div>

      <div className="divide-y divide-zinc-900 bg-zinc-950/20">
        
        {/* Audit Accordion Rows */}
        {maxLen > 0 ? (
          Array.from({ length: maxLen }).map((_, idx) => {
            const bull = bullArgs[idx];
            const bear = bearArgs[idx];
            const isExpanded = expandedRows[idx];

            return (
              <div key={idx} className="divide-y divide-zinc-900">
                
                {/* Accordion Trigger Header */}
                <div 
                  onClick={() => toggleRow(idx)}
                  className="px-6 py-4 bg-zinc-950/45 hover:bg-zinc-900/30 flex justify-between items-center gap-4 cursor-pointer transition select-none"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <span className={`text-[10px] font-mono font-black transition-transform duration-200 ${isExpanded ? 'rotate-90 text-amber-500' : 'text-zinc-500'}`}>
                      ▶
                    </span>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 flex-1 min-w-0">
                      <span className="text-[10px] font-bold font-mono tracking-wider text-zinc-400 uppercase">Debate Pillar #{idx + 1}</span>
                      <p className="text-[11px] text-zinc-300 font-sans truncate max-w-md">
                        {bull?.claim || 'N/A'} vs {bear?.claim || 'N/A'}
                      </p>
                    </div>
                  </div>
                  
                  {/* Select Controls displayed in Header */}
                  <div className="flex items-center gap-3 no-print" onClick={(e) => e.stopPropagation()}>
                    {bull && (
                      <div className="flex items-center gap-1 bg-zinc-950 px-2 py-1 rounded border border-zinc-900 text-[9px]">
                        <span className="text-emerald-500 font-bold font-mono uppercase text-[8px] mr-1">Bull Weight:</span>
                        <select 
                          value={bullWeights[idx]} 
                          onChange={(e) => handleBullWeight(idx, e.target.value)}
                          className="bg-transparent border-0 text-white font-bold font-mono focus:ring-0 p-0 text-[10px] cursor-pointer"
                        >
                          <option value="1" className="bg-zinc-950 text-white">1 (Low)</option>
                          <option value="2" className="bg-zinc-950 text-white">2</option>
                          <option value="3" className="bg-zinc-950 text-white">3 (Mid)</option>
                          <option value="4" className="bg-zinc-950 text-white">4</option>
                          <option value="5" className="bg-zinc-950 text-white">5 (High)</option>
                        </select>
                      </div>
                    )}
                    {bear && (
                      <div className="flex items-center gap-1 bg-zinc-950 px-2 py-1 rounded border border-zinc-900 text-[9px]">
                        <span className="text-red-400 font-bold font-mono uppercase text-[8px] mr-1">Bear Weight:</span>
                        <select 
                          value={bearWeights[idx]} 
                          onChange={(e) => handleBearWeight(idx, e.target.value)}
                          className="bg-transparent border-0 text-white font-bold font-mono focus:ring-0 p-0 text-[10px] cursor-pointer"
                        >
                          <option value="1" className="bg-zinc-950 text-white">1 (Low)</option>
                          <option value="2" className="bg-zinc-950 text-white">2</option>
                          <option value="3" className="bg-zinc-950 text-white">3 (Mid)</option>
                          <option value="4" className="bg-zinc-950 text-white">4</option>
                          <option value="5" className="bg-zinc-950 text-white">5 (High)</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                {/* Accordion Body Content */}
                {isExpanded && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-zinc-900 bg-zinc-950/20 text-xs animate-fade-in">
                    
                    {/* Bull Evidence Pillar */}
                    <div className="p-6 space-y-5">
                      {bull ? (
                        <div className="space-y-4 max-w-2xl">
                          <div className="flex items-center gap-2">
                            <span className="text-[8px] font-bold font-mono px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md">
                              BULL CHECKPOINT
                            </span>
                            <h4 className="font-bold text-white text-xs font-sans leading-snug">{bull.claim}</h4>
                          </div>
                          
                          <div className="p-4 bg-zinc-950/80 border border-zinc-900/60 rounded-xl space-y-2">
                            <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block font-bold">Audited Evidence</span>
                            <p className="text-zinc-300 leading-relaxed font-sans">{bull.evidence}</p>
                          </div>
                          
                          <div className="p-4 bg-red-950/5 border-l-2 border-red-500/25 rounded-r-xl space-y-2">
                            <span className="text-[9px] font-mono text-red-400 uppercase tracking-widest block font-bold">Counter-Argument Counterweight</span>
                            <p className="text-zinc-400 leading-relaxed font-sans italic">{bull.counter_argument}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-zinc-500 font-mono italic text-[11px]">No active Bullish arguments.</p>
                      )}
                    </div>

                    {/* Bear Evidence Pillar */}
                    <div className="p-6 space-y-5">
                      {bear ? (
                        <div className="space-y-4 max-w-2xl">
                          <div className="flex items-center gap-2">
                            <span className="text-[8px] font-bold font-mono px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-md">
                              BEAR CHECKPOINT
                            </span>
                            <h4 className="font-bold text-white text-xs font-sans leading-snug">{bear.claim}</h4>
                          </div>
                          
                          <div className="p-4 bg-zinc-950/80 border border-zinc-900/60 rounded-xl space-y-2">
                            <span className="text-[9px] font-mono text-zinc-500 uppercase tracking-widest block font-bold">Audited Evidence</span>
                            <p className="text-zinc-300 leading-relaxed font-sans">{bear.evidence}</p>
                          </div>
                          
                          <div className="p-4 bg-emerald-950/5 border-l-2 border-emerald-500/25 rounded-r-xl space-y-2">
                            <span className="text-[9px] font-mono text-emerald-400 uppercase tracking-widest block font-bold">Mitigating Counterweight</span>
                            <p className="text-zinc-400 leading-relaxed font-sans italic">{bear.counter_argument}</p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-zinc-500 font-mono italic text-[11px]">No active Bearish arguments.</p>
                      )}
                    </div>

                  </div>
                )}
                
              </div>
            );
          })
        ) : (
          <div className="p-8 text-center text-zinc-500 font-mono italic text-xs">
            No active debate logs found for this entity.
          </div>
        )}

        {/* Steelman Audit Summary */}
        <div className="p-6 bg-zinc-950/85 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs border-t border-zinc-900">
          <div className="space-y-2 max-w-2xl">
            <span className="text-emerald-400 font-bold font-mono uppercase tracking-wider text-[9px] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              Steelman Audit: Bear defending Bull
            </span>
            <p className="text-zinc-350 leading-relaxed italic bg-zinc-950/40 p-4 rounded-xl border border-zinc-900">
              "{debate.steelman_bull || 'N/A'}"
            </p>
          </div>
          <div className="space-y-2 max-w-2xl">
            <span className="text-red-400 font-bold font-mono uppercase tracking-wider text-[9px] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
              Steelman Audit: Bull defending Bear
            </span>
            <p className="text-zinc-350 leading-relaxed italic bg-zinc-950/40 p-4 rounded-xl border border-zinc-900">
              "{debate.steelman_bear || 'N/A'}"
            </p>
          </div>
        </div>

      </div>
    </section>
  );
}

// 4. DATA EXPORTER COMPONENT
export function DataExporters({ ticker, resultsData }) {
  const [copied, setCopied] = useState(false);

  const downloadJson = () => {
    try {
      const dataStr = JSON.stringify(resultsData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${ticker}_quorum_dossier.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed JSON download:', err);
    }
  };

  const downloadCsv = () => {
    try {
      const is = resultsData?.historical?.incomeStatements || [];
      const bs = resultsData?.historical?.balanceSheets || [];
      const cf = resultsData?.historical?.cashFlows || [];
      
      const years = Array.from(new Set([
        ...is.map(item => item.year),
        ...bs.map(item => item.year),
        ...cf.map(item => item.year)
      ])).sort((a, b) => b - a);

      let csv = "Year,Revenue,Net Income,Gross Profit,Operating Income,Total Assets,Total Liabilities,Total Equity,Total Debt,Cash Position,Operating Cashflow,Capital Expenditures,Free Cashflow\n";
      
      for (const y of years) {
        const income = is.find(item => item.year === y) || {};
        const balance = bs.find(item => item.year === y) || {};
        const cash = cf.find(item => item.year === y) || {};

        const row = [
          y,
          income.revenue || 0,
          income.netIncome || 0,
          income.grossProfit || 0,
          income.operatingIncome || 0,
          balance.totalAssets || 0,
          balance.totalLiabilities || 0,
          balance.equity || 0,
          balance.debt || 0,
          balance.cash || 0,
          cash.operatingCashflow || 0,
          Math.abs(cash.capex || 0),
          cash.freeCashflow || 0
        ];
        
        csv += row.join(",") + "\n";
      }

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${ticker}_historical_statements.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed CSV download:', err);
    }
  };

  const copyMarkdown = () => {
    try {
      const is = resultsData?.historical?.incomeStatements || [];
      const quote = resultsData?.quote || {};
      const displayMarketCap = quote.marketCap || 
        (quote.sharesOutstanding && quote.price ? quote.sharesOutstanding * quote.price : null);
      const cur = resultsData?.profile?.currency || 'USD';
      
      let md = `## Quorum Terminal Financial Export: ${ticker}\n\n`;
      md += `**Current Price:** ${formatNum(quote.price, cur)} | **Market Cap:** ${formatNum(displayMarketCap, cur)} | **P/E:** ${quote.pe ? `${quote.pe}x` : 'N/A'}\n\n`;
      md += `### Historical Statement Highlights\n\n`;
      md += `| Year | Revenue | Net Margin | Gross Profit | Operating Income |\n`;
      md += `| --- | --- | --- | --- | --- |\n`;
      
      is.forEach(item => {
        md += `| ${item.year} | ${formatNum(item.revenue, cur)} | ${formatPct(item.netMargin)} | ${formatNum(item.grossProfit, cur)} | ${formatNum(item.operatingIncome, cur)} |\n`;
      });
      
      navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch (err) {
      console.error('Failed clipboard write:', err);
    }
  };

  return (
    <div className="flex flex-wrap gap-2.5 items-center justify-end no-print">
      <button
        onClick={downloadJson}
        className="px-4 py-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl text-white font-mono text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
        title="Download complete structured JSON payload"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
        JSON
      </button>
      
      <button
        onClick={downloadCsv}
        className="px-4 py-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl text-white font-mono text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
        title="Download combined statement metrics as spreadsheet CSV"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
        CSV
      </button>

      <button
        onClick={copyMarkdown}
        className="px-4 py-2 bg-zinc-900 border border-zinc-800 hover:border-zinc-700 rounded-xl text-white font-mono text-xs font-semibold flex items-center gap-2 transition cursor-pointer"
        title="Copy summary table in markdown structure"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
        {copied ? 'Copied!' : 'Markdown'}
      </button>
    </div>
  );
}

/**
 * Calculates a dynamic Committee Confidence percentage, consensus score,
 * and evidence strength rating based on framework signals, anomalies, and active score.
 */
export function calculateCommitteeConfidence(resultsData, customScore) {
  const score = customScore !== null && customScore !== undefined ? customScore : (resultsData?.verdict?.score || 0);
  const signals = resultsData?.frameworkSignals || resultsData?.fullPayload?.frameworkSignals || {};
  const anomalies = resultsData?.anomalies || resultsData?.fullPayload?.anomalies || [];
  
  let baseConfidence = 75; // starts at 75%
  
  // 1. Alignment of signals
  const directions = Object.values(signals).map(s => s.direction).filter(Boolean);
  const bullishCount = directions.filter(d => d === 'BULLISH').length;
  const bearishCount = directions.filter(d => d === 'BEARISH').length;
  
  if (bullishCount === 4 || bearishCount === 4) {
    baseConfidence += 15; // Complete alignment
  } else if (bullishCount === 3 || bearishCount === 3) {
    baseConfidence += 5;  // Strong consensus
  } else if (directions.length > 0) {
    baseConfidence -= 10; // Divided committee
  }
  
  // 2. Score intensity
  const absScore = Math.abs(score);
  baseConfidence += Math.round(absScore * 5); // up to +15% for extreme scores
  
  // 3. Anomalies penalty
  const highAnomaly = anomalies.some(a => a.severity === 'HIGH' || a.category === 'ACCOUNTING_ANOMALY');
  const midAnomaly = anomalies.some(a => a.severity === 'MEDIUM');
  if (highAnomaly) {
    baseConfidence -= 15;
  } else if (midAnomaly) {
    baseConfidence -= 5;
  }
  
  // Clamp between 45% and 98% (no committee is 100% confident)
  const finalConfidence = Math.max(45, Math.min(98, baseConfidence));
  
  // Evidence Strength classification
  let evidenceStrength = 'Moderate';
  if (finalConfidence >= 85) {
    evidenceStrength = 'High';
  } else if (finalConfidence < 60) {
    evidenceStrength = 'Low';
  }
  
  // Consensus Score out of 10
  const consensusScore = (finalConfidence / 10).toFixed(1);
  
  return {
    confidence: finalConfidence,
    strength: evidenceStrength,
    consensus: consensusScore
  };
}

/**
 * Premium Tabbed SVG Charting Suite
 */
export function FinancialChartsSuite({ resultsData }) {
  const [activeTab, setActiveTab] = useState('growth'); // 'growth', 'capital', 'valuation'
  const [hoverIdx, setHoverIdx] = useState(null);

  const historical = resultsData?.historical || resultsData?.fullPayload?.historical || {};
  const incomeStatements = historical.incomeStatements || [];
  const balanceSheets = historical.balanceSheets || [];
  const cashFlows = historical.cashFlows || [];
  const quote = resultsData?.quote || resultsData?.fullPayload?.quote || {};

  if (!incomeStatements || incomeStatements.length === 0) {
    return (
      <section className="glass-panel p-6 bg-[#0D0D12]/80 border border-white/5 rounded-2xl">
        <div className="text-zinc-500 font-mono italic text-xs py-6 text-center">
          No historical statement data available to generate charts.
        </div>
      </section>
    );
  }

  const is = [...incomeStatements].reverse();
  const bs = [...balanceSheets].reverse();
  const cf = [...cashFlows].reverse();

  // Scale ranges
  const maxRevenue = Math.max(...is.map(x => x.revenue || 0)) || 1;
  const maxFcf = Math.max(...cf.map(x => Math.abs(x.freeCashflow || 0)), 1) || 1;
  const maxEps = Math.max(...is.map(x => Math.abs(x.eps || 0)), 1) || 1;
  const minEps = Math.min(...is.map(x => x.eps || 0), 0);
  const maxDebtCash = Math.max(...bs.map(b => Math.max(b.debt || 0, b.cash || 0)), 1) || 1;

  // ROE and ROIC calculations
  const roeList = is.map(item => {
    const bal = bs.find(b => b.year === item.year) || {};
    const roe = bal.equity ? (item.netIncome / bal.equity) : (item.netMargin || 0) * 0.8; // Heuristic fallback
    
    const capital = (bal.debt || 0) + (bal.equity || 0) - (bal.cash || 0);
    const roic = capital > 0 ? ((item.ebit || item.operatingIncome || (item.netIncome / 0.79)) * 0.79 / capital) : (item.netMargin || 0) * 0.6;
    
    return { year: item.year, roe, roic };
  });

  const maxRoeRoic = Math.max(...roeList.map(r => Math.max(Math.abs(r.roe || 0), Math.abs(r.roic || 0))), 0.2) || 0.2;
  const maxLeverage = Math.max(...bs.map(b => b.totalAssets && b.equity ? b.totalAssets / b.equity : 1.5), 2) || 2;

  return (
    <section id="trends" className="glass-panel p-6 bg-[#0D0D12]/80 border border-white/5 rounded-2xl relative overflow-hidden scroll-mt-20">
      <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-[100px] pointer-events-none" />
      
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8 border-b border-white/5 pb-4">
        <div>
          <h3 className="text-xs font-semibold text-white flex items-center gap-2 font-mono uppercase tracking-wider">
            <svg className="w-5 h-5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
            Historical Financial Terminal Suite
          </h3>
          <p className="text-[10px] text-zinc-400 mt-1">Multi-dimensional SVG visualizations of corporate performance.</p>
        </div>

        {/* Tab Selection */}
        <div className="flex items-center gap-1 bg-zinc-950 p-1 border border-zinc-900 rounded-xl no-print">
          {[
            { id: 'growth', name: 'Growth & Margins' },
            { id: 'capital', name: 'Capital & Solvency' },
            { id: 'valuation', name: 'Valuation & Price' }
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer ${
                activeTab === t.id 
                  ? 'bg-zinc-900 text-white border border-white/5 shadow-inner shadow-black' 
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'growth' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* Revenue & Net Income Bar Chart */}
          <div className="bg-zinc-950/40 p-4 border border-zinc-900 rounded-xl space-y-3">
            <div className="flex justify-between items-center text-[10px] font-mono">
              <span className="text-zinc-400 uppercase font-bold">Revenue & Net Income</span>
              <span className="text-[9px] text-zinc-500">Blue=Rev, Green=NetInc</span>
            </div>
            <div className="h-44 w-full flex items-end justify-between px-2 pt-6 pb-2 bg-zinc-950/60 border border-zinc-900/60 rounded-xl relative">
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none p-3 opacity-10">
                <div className="border-t border-dashed border-zinc-500 w-full" />
                <div className="border-t border-dashed border-zinc-500 w-full" />
                <div className="border-t border-dashed border-zinc-500 w-full" />
              </div>
              {is.map((item, idx) => {
                const revPct = Math.round((item.revenue / maxRevenue) * 80) + '%';
                const netPct = Math.round((Math.abs(item.netIncome || (item.revenue * item.netMargin) || 0) / maxRevenue) * 80) + '%';
                
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full relative group">
                    <div className="flex items-end justify-center gap-1 w-full h-[80%]">
                      <div style={{ height: revPct }} className="w-3.5 rounded-t bg-gradient-to-t from-blue-700/80 to-blue-500/80 hover:to-blue-400 transition-all duration-300" title={`Revenue: ${formatNum(item.revenue)}`} />
                      <div style={{ height: netPct }} className="w-3.5 rounded-t bg-gradient-to-t from-emerald-700/80 to-emerald-500/80 hover:to-emerald-400 transition-all duration-300" title={`Net Income: ${formatNum(item.netIncome || item.revenue * item.netMargin)}`} />
                    </div>
                    <span className="text-[9px] font-mono text-zinc-500 mt-2">FY{item.year}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[9px] font-mono text-zinc-500">
              <span>Start: {formatNum(is[0]?.revenue)}</span>
              <span>Latest: {formatNum(is[is.length-1]?.revenue)}</span>
            </div>
          </div>

          {/* FCF Trend */}
          <div className="bg-zinc-950/40 p-4 border border-zinc-900 rounded-xl space-y-3">
            <div className="flex justify-between items-center text-[10px] font-mono">
              <span className="text-zinc-400 uppercase font-bold">Free Cash Flow Trend</span>
              <span className="text-[9px] text-zinc-500">Green = FCF</span>
            </div>
            <div className="h-44 w-full flex items-end justify-between px-2 pt-6 pb-2 bg-zinc-950/60 border border-zinc-900/60 rounded-xl relative">
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none p-3 opacity-10">
                <div className="border-t border-dashed border-zinc-500 w-full" />
                <div className="border-t border-dashed border-zinc-500 w-full" />
              </div>
              {cf.length > 0 ? cf.map((item, idx) => {
                const fcfPct = Math.round((Math.max(0, item.freeCashflow) / maxFcf) * 80) + '%';
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full relative group">
                    <div style={{ height: fcfPct }} className="w-7 rounded-t bg-gradient-to-t from-teal-700/80 to-teal-500/80 hover:to-teal-400 transition-all duration-300" title={`FCF: ${formatNum(item.freeCashflow)}`} />
                    <span className="text-[9px] font-mono text-zinc-500 mt-2">FY{item.year}</span>
                  </div>
                );
              }) : (
                <div className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-600 font-mono italic">No Cash Flows Logged</div>
              )}
            </div>
            <div className="flex justify-between text-[9px] font-mono text-zinc-500">
              {cf.length > 0 ? (
                <>
                  <span>Start: {formatNum(cf[0]?.freeCashflow)}</span>
                  <span>Latest: {formatNum(cf[cf.length-1]?.freeCashflow)}</span>
                </>
              ) : <span>N/A</span>}
            </div>
          </div>

          {/* EPS Diluted Trend */}
          <div className="bg-zinc-950/40 p-4 border border-zinc-900 rounded-xl space-y-3">
            <div className="flex justify-between items-center text-[10px] font-mono">
              <span className="text-zinc-400 uppercase font-bold">EPS Trend</span>
              <span className="text-[9px] text-zinc-500">Earnings per share</span>
            </div>
            <div className="h-44 w-full bg-zinc-950/60 border border-zinc-900/60 rounded-xl pt-6 pb-2 relative overflow-hidden">
              <div className="absolute inset-0 flex flex-col justify-between pointer-events-none p-3 opacity-10">
                <div className="border-t border-dashed border-zinc-500 w-full" />
                <div className="border-t border-dashed border-zinc-500 w-full" />
              </div>
              {is.some(x => x.eps !== null && x.eps !== undefined && x.eps !== 0) ? (
                <svg className="w-full h-[70%] px-4 overflow-visible" viewBox="0 0 300 100" preserveAspectRatio="none">
                  {(() => {
                    const points = is.map((item, idx) => {
                      const x = (idx / (is.length - 1)) * 300;
                      const range = maxEps - minEps || 1;
                      const y = 90 - (((item.eps || 0) - minEps) / range) * 80;
                      return { x, y, val: item.eps };
                    });
                    const pathD = `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`;
                    return (
                      <>
                        <path d={pathD} fill="none" stroke="#60a5fa" strokeWidth="2.5" strokeLinecap="round" />
                        {points.map((p, idx) => (
                          <circle key={idx} cx={p.x} cy={p.y} r="4" fill="#050508" stroke="#60a5fa" strokeWidth="2" title={`EPS: $${p.val?.toFixed(2)}`} />
                        ))}
                      </>
                    );
                  })()}
                </svg>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-600 font-mono italic">EPS History Unavailable</div>
              )}
              <div className="absolute bottom-2 inset-x-0 flex justify-between px-4 text-[8px] font-mono text-zinc-500">
                {is.map((item, idx) => (
                  <div key={idx} className="text-center">
                    <span className="block font-bold text-blue-400">{item.eps !== null && item.eps !== undefined ? `$${item.eps.toFixed(2)}` : 'N/A'}</span>
                    <span>FY{item.year}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-between text-[9px] font-mono text-zinc-500">
              <span>EPS trend progression</span>
            </div>
          </div>

          {/* Margins & ROE / ROIC */}
          <div className="bg-zinc-950/40 p-4 border border-zinc-900 rounded-xl space-y-3 xl:col-span-3">
            <div className="flex justify-between items-center text-[10px] font-mono">
              <span className="text-zinc-400 uppercase font-bold">Returns & Margins Trend (ROE, ROIC, Net Margin)</span>
              <span className="text-[9px] text-zinc-500">Dashed = NetMargin, Amber = ROE, Emerald = ROIC</span>
            </div>
            <div className="h-44 w-full bg-zinc-950/60 border border-zinc-900/60 rounded-xl pt-6 pb-2 relative overflow-hidden">
              <svg className="w-full h-[70%] px-8 overflow-visible" viewBox="0 0 500 100" preserveAspectRatio="none">
                {/* Net Margin Line */}
                {(() => {
                  const points = is.map((item, idx) => {
                    const x = (idx / (is.length - 1)) * 500;
                    const y = 90 - (Math.max(0, item.netMargin || 0) / maxRoeRoic) * 80;
                    return { x, y };
                  });
                  return <path d={`M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`} fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="4,4" />;
                })()}
                {/* ROE Line */}
                {(() => {
                  const points = roeList.map((item, idx) => {
                    const x = (idx / (roeList.length - 1)) * 500;
                    const y = 90 - (Math.max(0, item.roe || 0) / maxRoeRoic) * 80;
                    return { x, y };
                  });
                  return <path d={`M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" />;
                })()}
                {/* ROIC Line */}
                {(() => {
                  const points = roeList.map((item, idx) => {
                    const x = (idx / (roeList.length - 1)) * 500;
                    const y = 90 - (Math.max(0, item.roic || 0) / maxRoeRoic) * 80;
                    return { x, y };
                  });
                  return <path d={`M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`} fill="none" stroke="#10b981" strokeWidth="2.5" strokeLinecap="round" />;
                })()}
              </svg>
              <div className="absolute bottom-2 inset-x-0 flex justify-between px-8 text-[8px] font-mono text-zinc-500">
                {roeList.map((item, idx) => (
                  <div key={idx} className="text-center font-mono">
                    <span className="block font-bold text-white">ROE: {item.roe ? `${(item.roe * 100).toFixed(1)}%` : 'N/A'}</span>
                    <span className="block text-emerald-400">ROIC: {item.roic ? `${(item.roic * 100).toFixed(1)}%` : 'N/A'}</span>
                    <span>FY{item.year}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-between text-[9px] font-mono text-zinc-500">
              <span>Return ratios benchmarked against operating profit rates.</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'capital' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Debt vs Cash Balance Chart */}
          <div className="bg-zinc-950/40 p-4 border border-zinc-900 rounded-xl space-y-3">
            <div className="flex justify-between items-center text-[10px] font-mono">
              <span className="text-zinc-400 uppercase font-bold">Liquidity: Debt vs Cash Reserves</span>
              <span className="text-[9px] text-zinc-500">Red=Debt, Emerald=Cash</span>
            </div>
            <div className="h-44 w-full flex items-end justify-between px-4 pt-6 pb-2 bg-zinc-950/60 border border-zinc-900/60 rounded-xl relative">
              {bs.map((item, idx) => {
                const debtPct = Math.round((Math.max(0, item.debt || 0) / maxDebtCash) * 80) + '%';
                const cashPct = Math.round((Math.max(0, item.cash || 0) / maxDebtCash) * 80) + '%';
                return (
                  <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full relative group font-mono">
                    <div className="flex items-end justify-center gap-1.5 w-full h-[80%]">
                      <div style={{ height: debtPct }} className="w-5 rounded-t bg-gradient-to-t from-red-800/80 to-red-500/80" title={`Debt: ${formatNum(item.debt)}`} />
                      <div style={{ height: cashPct }} className="w-5 rounded-t bg-gradient-to-t from-emerald-800/80 to-emerald-500/80" title={`Cash: ${formatNum(item.cash)}`} />
                    </div>
                    <span className="text-[9px] text-zinc-500 mt-2">FY{item.year}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between text-[9px] font-mono text-zinc-500 font-mono">
              {bs.length > 0 ? (
                <>
                  <span>Net Debt (Latest): {formatNum((bs[bs.length-1]?.debt || 0) - (bs[bs.length-1]?.cash || 0))}</span>
                  <span>Leverage: {bs[bs.length-1]?.debt > bs[bs.length-1]?.cash ? 'Net Debtor' : 'Net Liquidity'}</span>
                </>
              ) : <span>N/A</span>}
            </div>
          </div>

          {/* Equity Multiplier / Leverage */}
          <div className="bg-zinc-950/40 p-4 border border-zinc-900 rounded-xl space-y-3">
            <div className="flex justify-between items-center text-[10px] font-mono">
              <span className="text-zinc-400 uppercase font-bold">Equity Multiplier (Structural Leverage)</span>
              <span className="text-[9px] text-zinc-500">Assets / Equity</span>
            </div>
            <div className="h-44 w-full bg-zinc-950/60 border border-zinc-900/60 rounded-xl pt-6 pb-2 relative overflow-hidden">
              {bs.length >= 2 ? (
                <svg className="w-full h-[70%] px-6 overflow-visible" viewBox="0 0 300 100" preserveAspectRatio="none">
                  {(() => {
                    const points = bs.map((item, idx) => {
                      const x = (idx / (bs.length - 1)) * 300;
                      const assets = item.totalAssets || (item.equity * maxLeverage * 0.5) || 1.5;
                      const equity = item.equity || 1.0;
                      const lev = assets / equity;
                      const y = 90 - (lev / maxLeverage) * 80;
                      return { x, y, lev };
                    });
                    return (
                      <>
                        <path d={`M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`} fill="none" stroke="#a78bfa" strokeWidth="2.5" />
                        {points.map((p, idx) => (
                          <circle key={idx} cx={p.x} cy={p.y} r="4" fill="#050508" stroke="#8b5cf6" strokeWidth="2" title={`Leverage: ${p.lev.toFixed(2)}x`} />
                        ))}
                      </>
                    );
                  })()}
                </svg>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-[10px] text-zinc-600 font-mono italic">Leverage History Unavailable</div>
              )}
              <div className="absolute bottom-2 inset-x-0 flex justify-between px-6 text-[8px] font-mono text-zinc-500">
                {bs.map((item, idx) => (
                  <div key={idx} className="text-center">
                    <span className="block font-bold text-violet-400">
                      {item.totalAssets && item.equity ? `${(item.totalAssets / item.equity).toFixed(2)}x` : (item.debtToEquity ? `${(item.debtToEquity + 1).toFixed(2)}x` : '1.50x')}
                    </span>
                    <span>FY{item.year}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-between text-[9px] font-mono text-zinc-500">
              <span>Financial leverage factor trends</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'valuation' && (
        <div className="bg-zinc-950/40 p-5 border border-zinc-900 rounded-xl space-y-4">
          <div className="flex justify-between items-center text-[10px] font-mono">
            <span className="text-zinc-400 uppercase font-bold">Current Price vs Intrinsic Value Scenario Ranges</span>
            <span className="text-zinc-500">Compares market price to model limits</span>
          </div>
          
          <div className="h-44 w-full bg-zinc-950/60 border border-zinc-900/60 rounded-xl relative flex items-center justify-center px-8">
            {(() => {
              const currentPrice = quote.price || 100;
              const latestIS = is[is.length - 1] || {};
              const latestCF = cf[cf.length - 1] || {};
              const latestBS = bs[bs.length - 1] || {};
              const rev = latestIS.revenue || 0;
              const fcf = latestCF.freeCashflow || 0;
              const sharesOutstanding = quote.sharesOutstanding || 
                (quote.marketCap > 0 && currentPrice > 0 ? quote.marketCap / currentPrice : null) || 1e8;
              const shares = sharesOutstanding;
              const debt = latestBS.debt || 0;
              const cash = latestBS.cash || 0;
              
              // Use proper 5-year DCF matching the sandbox model
              const fcfMarginEst = fcf > 0 && rev > 0 ? fcf / rev : 0.15;
              const prevIS = is.length >= 2 ? is[is.length - 2] : null;
              const baseGrowth = prevIS && prevIS.revenue > 0 ? (rev / prevIS.revenue) - 1 : 0.08;
              const clampedGrowth = Math.max(-0.05, Math.min(0.25, baseGrowth));
              const waccEst = 0.09; // 9% default WACC for chart estimation
              const termGrowth = 0.025;
              
              // Run 5-year DCF for each scenario
              const runMiniDCF = (growth, marginAdj) => {
                const margin = Math.min(0.50, Math.max(0.02, fcfMarginEst + marginAdj));
                let projRev = rev;
                let sumPV = 0;
                for (let y = 1; y <= 5; y++) {
                  projRev *= (1 + growth);
                  sumPV += (projRev * margin) / Math.pow(1 + waccEst, y);
                }
                const tvFcf = projRev * (1 + termGrowth) * margin;
                const tv = waccEst > termGrowth ? tvFcf / (waccEst - termGrowth) : 0;
                const pvTv = tv / Math.pow(1 + waccEst, 5);
                const ev = sumPV + pvTv;
                return shares > 0 ? (ev - debt + cash) / shares : 0;
              };
              
              const dcfValBase = runMiniDCF(clampedGrowth, 0);
              const dcfValBear = runMiniDCF(Math.max(-0.05, clampedGrowth - 0.04), -0.03);
              const dcfValBull = runMiniDCF(Math.min(0.30, clampedGrowth + 0.04), 0.03);

              if (dcfValBase <= 0) {
                return <span className="text-[10px] text-zinc-500 font-mono italic">Insufficient valuation parameters to draw Price vs Value bounds.</span>;
              }

              const minBound = Math.min(dcfValBear, currentPrice) * 0.85;
              const maxBound = Math.max(dcfValBull, currentPrice) * 1.15;
              const scale = maxBound - minBound || 1;

              const bearPct = ((dcfValBear - minBound) / scale) * 100;
              const basePct = ((dcfValBase - minBound) / scale) * 100;
              const bullPct = ((dcfValBull - minBound) / scale) * 100;
              const pricePct = ((currentPrice - minBound) / scale) * 100;

              return (
                <div className="w-full relative py-6">
                  <div className="h-2 w-full bg-zinc-900 rounded-full border border-zinc-800" />
                  
                  <div 
                    style={{ left: `${bearPct}%`, width: `${bullPct - bearPct}%` }}
                    className="absolute top-6 h-2 bg-emerald-500/20 rounded-full animate-fade-in"
                  />

                  {/* Bear Marker */}
                  <div style={{ left: `${bearPct}%` }} className="absolute -top-1 flex flex-col items-center -translate-x-1/2">
                    <span className="w-1.5 h-4 bg-red-500 rounded-sm" />
                    <span className="text-[8px] font-mono text-red-400 font-bold mt-1">Bear: ${dcfValBear.toFixed(1)}</span>
                  </div>

                  {/* Base Marker */}
                  <div style={{ left: `${basePct}%` }} className="absolute -top-1 flex flex-col items-center -translate-x-1/2">
                    <span className="w-1.5 h-4 bg-zinc-400 rounded-sm" />
                    <span className="text-[8px] font-mono text-zinc-300 font-bold mt-1">Base: ${dcfValBase.toFixed(1)}</span>
                  </div>

                  {/* Bull Marker */}
                  <div style={{ left: `${bullPct}%` }} className="absolute -top-1 flex flex-col items-center -translate-x-1/2">
                    <span className="w-1.5 h-4 bg-emerald-500 rounded-sm" />
                    <span className="text-[8px] font-mono text-emerald-400 font-bold mt-1">Bull: ${dcfValBull.toFixed(1)}</span>
                  </div>

                  {/* Current Price Pin */}
                  <div style={{ left: `${pricePct}%` }} className="absolute top-2 flex flex-col items-center -translate-x-1/2 z-10">
                    <span className="text-[8px] font-mono bg-amber-500 text-zinc-950 px-1.5 py-0.5 rounded font-black shadow shadow-amber-500/30">Price: ${currentPrice.toFixed(2)}</span>
                    <span className="w-2 h-2 rounded-full bg-amber-500 border border-zinc-950 mt-0.5" />
                  </div>
                </div>
              );
            })()}
          </div>
          <div className="text-[9px] font-mono text-zinc-500 leading-normal">
            *Intrinsic values estimated from statement data. Adjust parameters in the DCF Sandbox section below to run live multi-scenario projections.
          </div>
        </div>
      )}
    </section>
  );
}

