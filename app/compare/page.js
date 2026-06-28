'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getAllReports } from '../../lib/storage/reportStore';

export default function Compare() {
  const [reports, setReports] = useState([]);
  const [selectedIdA, setSelectedIdA] = useState('');
  const [selectedIdB, setSelectedIdB] = useState('');
  const [reportA, setReportA] = useState(null);
  const [reportB, setReportB] = useState(null);

  useEffect(() => {
    async function loadReports() {
      const data = await getAllReports();
      setReports(data);
      if (data.length >= 2) {
        setSelectedIdA(data[0].id);
        setSelectedIdB(data[1].id);
      }
    }
    loadReports();
  }, []);

  useEffect(() => {
    if (selectedIdA) {
      const rep = reports.find(r => r.id === selectedIdA);
      setReportA(rep || null);
    } else {
      setReportA(null);
    }
  }, [selectedIdA, reports]);

  useEffect(() => {
    if (selectedIdB) {
      const rep = reports.find(r => r.id === selectedIdB);
      setReportB(rep || null);
    } else {
      setReportB(null);
    }
  }, [selectedIdB, reports]);

  // Metric highlights helper: returns green class for winner, red class for loser
  // type: 'high' (higher is better, e.g. margin, revenue) or 'low' (lower is better, e.g. debt, P/E)
  const compareMetrics = (valA, valB, type = 'high') => {
    if (valA === null || valA === undefined || isNaN(valA)) return { classA: '', classB: '' };
    if (valB === null || valB === undefined || isNaN(valB)) return { classA: '', classB: '' };

    if (valA === valB) return { classA: '', classB: '' };

    const isAWinner = type === 'high' ? valA > valB : valA < valB;

    return {
      classA: isAWinner ? 'text-emerald-400 font-bold bg-emerald-500/5' : 'text-slate-400',
      classB: !isAWinner ? 'text-emerald-400 font-bold bg-emerald-500/5' : 'text-slate-400'
    };
  };

  const formatLargeNum = (num, currencyCode = 'USD') => {
    if (num === null || num === undefined || isNaN(num)) return 'N/A';
    try {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currencyCode,
        notation: 'compact',
        maximumFractionDigits: 2
      }).format(num);
    } catch (e) {
      return `$${(num / 1e9).toFixed(2)}B`;
    }
  };

  const payloadA = reportA?.fullPayload;
  const payloadB = reportB?.fullPayload;

  // Run comparisons for highlights
  const compRev = compareMetrics(payloadA?.metrics?.latest?.revenue, payloadB?.metrics?.latest?.revenue, 'high');
  const compMargin = compareMetrics(payloadA?.metrics?.ratios?.netMargin, payloadB?.metrics?.ratios?.netMargin, 'high');
  const compDe = compareMetrics(payloadA?.metrics?.ratios?.debtToEquity, payloadB?.metrics?.ratios?.debtToEquity, 'low');
  const compPe = compareMetrics(payloadA?.quote?.pe, payloadB?.quote?.pe, 'low');
  const compPeg = compareMetrics(payloadA?.quote?.pegRatio, payloadB?.quote?.pegRatio, 'low');
  const compScore = compareMetrics(reportA?.score, reportB?.score, 'high');

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 md:py-12 w-full flex-1 flex flex-col justify-start">
      
      {/* Title */}
      <header className="mb-8">
        <h1 className="text-2xl md:text-4xl font-bold text-white tracking-tight">Side-by-Side Comparison</h1>
        <p className="text-slate-400 text-xs mt-1">Cross-examine two investment dossiers side by side to highlight competitive strengths.</p>
      </header>

      {reports.length < 2 ? (
        <div className="glass-panel p-16 text-center border-white/5 rounded-2xl bg-slate-900/10">
          <div className="w-12 h-12 rounded-full bg-slate-900/60 border border-slate-800 flex items-center justify-center mx-auto mb-4">
            <svg viewBox="0 0 24 24" className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
          </div>
          <h3 className="text-sm font-semibold text-white mb-1">Insufficient data to compare</h3>
          <p className="text-slate-500 text-xs mb-6 max-w-sm mx-auto">You need to analyze and save at least two stock dossiers in your workspace to run the comparative matrix.</p>
          <Link href="/analyze" className="inline-block px-5 py-2.5 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl text-white text-xs font-semibold transition">
            Analyze Stock Tickers
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          
          {/* Selectors Panel */}
          <div className="glass-panel p-5 bg-slate-900/15 border border-white/5 rounded-2xl grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="text-[10px] font-bold font-mono text-slate-500 uppercase block mb-2">Select Company A</label>
              <select
                value={selectedIdA}
                onChange={(e) => setSelectedIdA(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-slate-700 transition"
              >
                {reports.map((r) => (
                  <option key={r.id} value={r.id} disabled={r.id === selectedIdB}>
                    {r.companyName} ({r.ticker})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold font-mono text-slate-500 uppercase block mb-2">Select Company B</label>
              <select
                value={selectedIdB}
                onChange={(e) => setSelectedIdB(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-sm text-white focus:outline-none focus:border-slate-700 transition"
              >
                {reports.map((r) => (
                  <option key={r.id} value={r.id} disabled={r.id === selectedIdA}>
                    {r.companyName} ({r.ticker})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Side-by-side Matrix Grid */}
          {reportA && reportB && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Left Column: Company A */}
              <div className="space-y-6">
                <div className="glass-panel p-6 bg-slate-900/25 border-emerald-500/20 rounded-2xl relative">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-xl font-bold text-white mb-1">{reportA.companyName}</h2>
                      <span className="bg-slate-900 px-2 py-0.5 rounded text-[10px] font-mono text-slate-400 border border-slate-800">{reportA.ticker} • {reportA.sector}</span>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${
                      reportA.verdict === 'INVEST' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : reportA.verdict === 'HOLD' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                      {reportA.verdict}
                    </span>
                  </div>
                </div>

                {/* Key Metrics Card A */}
                <div className="glass-panel overflow-hidden bg-slate-900/30 border border-white/5 rounded-2xl">
                  <span className="text-[10px] font-bold font-mono text-slate-500 uppercase tracking-widest block p-5 pb-3 border-b border-slate-900 bg-slate-950/20">Key Metrics</span>
                  <div className="divide-y divide-slate-900 font-mono text-xs">
                    <div className={`p-4 flex justify-between ${compRev.classA}`}>
                      <span className="text-slate-500">Revenue</span>
                      <span>{formatLargeNum(payloadA?.metrics?.latest?.revenue, payloadA?.profile?.currency)}</span>
                    </div>
                    <div className={`p-4 flex justify-between ${compMargin.classA}`}>
                      <span className="text-slate-500">Net Margin</span>
                      <span>{payloadA?.metrics?.ratios?.netMargin ? `${(payloadA.metrics.ratios.netMargin * 100).toFixed(1)}%` : 'N/A'}</span>
                    </div>
                    <div className={`p-4 flex justify-between ${compDe.classA}`}>
                      <span className="text-slate-500">Debt to Equity</span>
                      <span>{payloadA?.metrics?.ratios?.debtToEquity?.toFixed(2) || '0.00'}</span>
                    </div>
                    <div className={`p-4 flex justify-between ${compPe.classA}`}>
                      <span className="text-slate-500">P/E Ratio</span>
                      <span>{payloadA?.quote?.pe ? `${payloadA.quote.pe.toFixed(1)}x` : 'N/A'}</span>
                    </div>
                    <div className={`p-4 flex justify-between ${compPeg.classA}`}>
                      <span className="text-slate-500">PEG Ratio</span>
                      <span>{payloadA?.quote?.pegRatio ? payloadA.quote.pegRatio.toFixed(2) : 'N/A'}</span>
                    </div>
                    <div className={`p-4 flex justify-between ${compScore.classA}`}>
                      <span className="text-slate-500">Committee Score</span>
                      <span>{reportA.score} / +3.0</span>
                    </div>
                  </div>
                </div>

                {/* Framework Signals Card A */}
                <div className="glass-panel p-6 bg-slate-900/25 border border-white/5 rounded-2xl space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">Framework Verdicts</h3>
                  {payloadA && Object.entries(payloadA.frameworkSignals).map(([fid, sig]) => (
                    <div key={fid} className="p-3.5 bg-slate-950/40 border border-slate-900 rounded-xl flex items-center justify-between gap-4">
                      <span className="capitalize text-xs text-white font-semibold">{fid}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        sig.direction === 'BULLISH' ? 'bg-emerald-500/10 text-emerald-400' : sig.direction === 'BEARISH' ? 'bg-red-500/10 text-red-400' : 'bg-slate-900 text-slate-400'
                      }`}>
                        {sig.direction}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Company B */}
              <div className="space-y-6">
                <div className="glass-panel p-6 bg-slate-900/25 border-emerald-500/20 rounded-2xl relative">
                  <div className="flex justify-between items-start">
                    <div>
                      <h2 className="text-xl font-bold text-white mb-1">{reportB.companyName}</h2>
                      <span className="bg-slate-900 px-2 py-0.5 rounded text-[10px] font-mono text-slate-400 border border-slate-800">{reportB.ticker} • {reportB.sector}</span>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold font-mono ${
                      reportB.verdict === 'INVEST' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : reportB.verdict === 'HOLD' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                      {reportB.verdict}
                    </span>
                  </div>
                </div>

                {/* Key Metrics Card B */}
                <div className="glass-panel overflow-hidden bg-slate-900/30 border border-white/5 rounded-2xl">
                  <span className="text-[10px] font-bold font-mono text-slate-500 uppercase tracking-widest block p-5 pb-3 border-b border-slate-900 bg-slate-950/20">Key Metrics</span>
                  <div className="divide-y divide-slate-900 font-mono text-xs">
                    <div className={`p-4 flex justify-between ${compRev.classB}`}>
                      <span className="text-slate-500">Revenue</span>
                      <span>{formatLargeNum(payloadB?.metrics?.latest?.revenue, payloadB?.profile?.currency)}</span>
                    </div>
                    <div className={`p-4 flex justify-between ${compMargin.classB}`}>
                      <span className="text-slate-500">Net Margin</span>
                      <span>{payloadB?.metrics?.ratios?.netMargin ? `${(payloadB.metrics.ratios.netMargin * 100).toFixed(1)}%` : 'N/A'}</span>
                    </div>
                    <div className={`p-4 flex justify-between ${compDe.classB}`}>
                      <span className="text-slate-500">Debt to Equity</span>
                      <span>{payloadB?.metrics?.ratios?.debtToEquity?.toFixed(2) || '0.00'}</span>
                    </div>
                    <div className={`p-4 flex justify-between ${compPe.classB}`}>
                      <span className="text-slate-500">P/E Ratio</span>
                      <span>{payloadB?.quote?.pe ? `${payloadB.quote.pe.toFixed(1)}x` : 'N/A'}</span>
                    </div>
                    <div className={`p-4 flex justify-between ${compPeg.classB}`}>
                      <span className="text-slate-500">PEG Ratio</span>
                      <span>{payloadB?.quote?.pegRatio ? payloadB.quote.pegRatio.toFixed(2) : 'N/A'}</span>
                    </div>
                    <div className={`p-4 flex justify-between ${compScore.classB}`}>
                      <span className="text-slate-500">Committee Score</span>
                      <span>{reportB.score} / +3.0</span>
                    </div>
                  </div>
                </div>

                {/* Framework Signals Card B */}
                <div className="glass-panel p-6 bg-slate-900/25 border border-white/5 rounded-2xl space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest font-mono">Framework Verdicts</h3>
                  {payloadB && Object.entries(payloadB.frameworkSignals).map(([fid, sig]) => (
                    <div key={fid} className="p-3.5 bg-slate-950/40 border border-slate-900 rounded-xl flex items-center justify-between gap-4">
                      <span className="capitalize text-xs text-white font-semibold">{fid}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        sig.direction === 'BULLISH' ? 'bg-emerald-500/10 text-emerald-400' : sig.direction === 'BEARISH' ? 'bg-red-500/10 text-red-400' : 'bg-slate-900 text-slate-400'
                      }`}>
                        {sig.direction}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

        </div>
      )}

    </div>
  );
}
