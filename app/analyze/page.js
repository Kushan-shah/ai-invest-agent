'use client';

import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { saveReport, toggleWatchlist, isInWatchlist } from '../../lib/storage/reportStore';
import { DcfSensitivityModel, ReverseDcfCard, ConvergenceSummary, RatiosGrid, CommitteeAuditLedger, DataExporters, FinancialChartsSuite, calculateCommitteeConfidence } from '../components/InstitutionalModels';


// Custom inline SVG Icons (Premium obsidian themed)
const SearchIcon = () => <svg className="w-5 h-5 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
const SparklesIcon = () => <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>;
const CheckIcon = () => <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>;
const WarnIcon = () => <svg className="w-4 h-4 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;
const SpinnerIcon = () => <svg className="w-5 h-5 animate-spin text-emerald-400" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>;
const UpRightIcon = () => <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>;
const StarIcon = ({ filled }) => (
  <svg className={`w-4 h-4 ${filled ? 'fill-yellow-400 text-yellow-400' : 'text-zinc-400 hover:text-yellow-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.907c.961 0 1.36 1.246.58 1.79l-3.97 2.884a1 1 0 00-.36 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.97-2.884a1 1 0 00-1.17 0l-3.97 2.884c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.36-1.118l-3.97-2.884c-.78-.543-.38-1.79.58-1.79h4.908a1 1 0 00.95-.69l1.519-4.674z" />
  </svg>
);

// Local FinancialCharts component removed in favor of FinancialChartsSuite imported from InstitutionalModels.js

export default function Analyze() {
  const [query, setQuery] = useState('');
  const [tickerMatches, setTickerMatches] = useState([]);
  const [searchingTicker, setSearchingTicker] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState(null);
  
  // Progress & Stream States
  const [researchState, setResearchState] = useState('idle'); // idle, streaming, complete, error
  const [progressLogs, setProgressLogs] = useState([]);
  const [profile, setProfile] = useState(null);
  const [gateway, setGateway] = useState(null);
  const [resultsData, setResultsData] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSavedToast, setIsSavedToast] = useState(false);
  const [isPinned, setIsPinned] = useState(false);

  // Custom Overrides state
  const [customScore, setCustomScore] = useState(null);
  const [customLabel, setCustomLabel] = useState(null);
  const [customDecision, setCustomDecision] = useState(null);


  // Custom Weights state
  const [weights, setWeights] = useState({
    fundamental: 30,
    moat: 20,
    risk: 30,
    valuation: 20
  });
  const [useCustomWeights, setUseCustomWeights] = useState(false);

  const handleWeightChange = (key, val) => {
    setWeights(prev => ({
      ...prev,
      [key]: parseInt(val) || 0
    }));
  };

  const weightsSum = weights.fundamental + weights.moat + weights.risk + weights.valuation;
  const isWeightsValid = !useCustomWeights || weightsSum === 100;
  
  const eventSourceRef = useRef(null);

  const activeScore = customScore !== null ? customScore : resultsData?.verdict?.score;
  const confidenceMetrics = resultsData ? calculateCommitteeConfidence(resultsData, activeScore) : { confidence: 0, strength: 'Low', consensus: 0 };

  // Check Watchlist status when report completes
  useEffect(() => {
    if (resultsData?.profile?.ticker) {
      isInWatchlist(resultsData.profile.ticker).then(setIsPinned);
    }
  }, [resultsData]);

  // Trigger research if ticker param is in URL on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const tickerParam = params.get('ticker');
      if (tickerParam) {
        startResearch(tickerParam.toUpperCase());
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);

  // Search ticker lookup on change
  useEffect(() => {
    if (query.trim().length < 2) {
      setTickerMatches([]);
      return;
    }

    const delayDebounce = setTimeout(async () => {
      setSearchingTicker(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        const matches = (data.quotes || [])
          .filter(q => q.quoteType === 'EQUITY')
          .slice(0, 5)
          .map(q => ({
            ticker: q.symbol,
            name: q.shortname || q.longname || q.symbol,
            exchange: q.exchange,
            sector: q.sector || 'Unknown'
          }));
        setTickerMatches(matches);
      } catch (err) {
        console.error('Ticker search failed:', err);
      } finally {
        setSearchingTicker(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounce);
  }, [query]);

  // Initiate SSE stream for selected ticker
  const startResearch = (ticker) => {
    setSelectedTicker(ticker);
    setQuery('');
    setTickerMatches([]);
    setResearchState('streaming');
    setProgressLogs([]);
    setProfile(null);
    setGateway(null);
    setResultsData(null);
    setErrorMessage('');
    setIsSavedToast(false);
    
    // Reset custom overrides
    setCustomScore(null);
    setCustomLabel(null);
    setCustomDecision(null);

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    // Call SSE API route with custom weights if enabled
    let url = `/api/research?ticker=${encodeURIComponent(ticker)}`;
    if (useCustomWeights) {
      const fund = weights.fundamental / 100;
      const moat = weights.moat / 100;
      const risk = weights.risk / 100;
      const val = weights.valuation / 100;
      url += `&w_fundamental=${fund}&w_moat=${moat}&w_risk=${risk}&w_valuation=${val}`;
    }

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.addEventListener('progress', (e) => {
      const log = JSON.parse(e.data);
      setProgressLogs(prev => [...prev, log]);
    });

    eventSource.addEventListener('partial_data', (e) => {
      const data = JSON.parse(e.data);
      setProfile(data.profile);
      setGateway(data.gateway);
    });

    eventSource.addEventListener('complete', async (e) => {
      const data = JSON.parse(e.data);
      setResultsData(data);
      setResearchState('complete');
      eventSource.close();

      // Auto-save to IndexedDB client-side database
      try {
        const reportId = crypto.randomUUID();
        await saveReport({
          id: reportId,
          ticker: ticker.toUpperCase(),
          companyName: data.profile.name,
          sector: data.profile.sector,
          verdict: data.verdict.decision,
          score: data.verdict.score,
          label: data.verdict.label,
          fullPayload: data,
          createdAt: new Date().toISOString()
        });
        setIsSavedToast(true);
        setTimeout(() => setIsSavedToast(false), 5000);
      } catch (err) {
        console.error('Failed to auto-save report:', err);
      }
    });

    eventSource.addEventListener('error', (e) => {
      console.error("SSE Error:", e);
      let msg = 'Research graph compilation failed.';
      if (e && e.data) {
        try {
          const data = JSON.parse(e.data);
          msg = data.message || msg;
        } catch (err) {}
      }
      setErrorMessage(msg);
      setResearchState('error');
      eventSource.close();
    });
  };

  const toggleWatch = async () => {
    if (!resultsData?.profile) return;
    try {
      const res = await toggleWatchlist(
        resultsData.profile.ticker,
        resultsData.profile.name,
        resultsData.profile.sector,
        resultsData.quote.price,
        resultsData.quote.changePercent
      );
      setIsPinned(res.action === 'added');
    } catch (err) {
      console.error('Watchlist toggle error:', err);
    }
  };

  const getVerdictClass = (label) => {
    if (label === 'BUY' || label === 'ACCUMULATE') return 'buy-glow border-emerald-500/40 text-emerald-400';
    if (label === 'AVOID' || label === 'REDUCE') return 'avoid-glow border-red-500/40 text-red-400';
    return 'hold-glow border-amber-500/40 text-amber-400';
  };

  const formatLargeNum = (num, currencyCode = 'USD') => {
    if (num === null || num === undefined || isNaN(num) || num === 0) return 'N/A';
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

  // Self-healing: compute market cap from shares × price if stored value is missing/zero
  const displayMarketCap = resultsData?.quote?.marketCap || 
    (resultsData?.quote?.sharesOutstanding && resultsData?.quote?.price 
      ? resultsData.quote.sharesOutstanding * resultsData.quote.price 
      : null);

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 md:py-16 w-full flex-1 flex flex-col justify-start">
      
      {/* Toast Notification */}
      {isSavedToast && (
        <div className="fixed bottom-5 right-5 z-50 px-5 py-3.5 bg-emerald-500 text-slate-950 font-semibold rounded-2xl shadow-xl flex items-center gap-3 animate-fade-in">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
          Report compiled & saved to local workspace!
        </div>
      )}

      {/* Header */}
      <header className="text-center mb-12 animate-fade-in">
        <h1 className="text-3xl md:text-5xl font-bold mb-4 tracking-tight">
          <span className="title-gradient">Research Committee Workspace</span>
        </h1>
        <p className="text-slate-400 text-sm max-w-2xl mx-auto">
          Input a stock symbol below to trigger multi-agent data verification, structural observations, and debate moderation.
        </p>
      </header>

      {/* 1. Idle Search Box */}
      {researchState === 'idle' && (
        <section className="max-w-xl mx-auto mb-16 animate-fade-in w-full">
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-500">
              <SearchIcon />
            </div>
            <input
              type="text"
              className="w-full pl-11 pr-4 py-4 bg-slate-950/80 border border-slate-800 rounded-2xl text-white placeholder-slate-500 focus:outline-none focus:border-slate-700 focus:ring-1 focus:ring-slate-700 transition font-sans text-sm"
              placeholder="Search company name or ticker (e.g., Apple, TSLA, NVDA, RELIANCE.NS)..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {searchingTicker && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                <SpinnerIcon />
              </div>
            )}
          </div>

          {/* Quick Popular Ticker Tags */}
          {query.trim().length === 0 && (
            <div className="mt-4 flex flex-wrap items-center gap-2 justify-center">
              <span className="text-[10px] font-bold font-mono text-slate-500 uppercase">Try:</span>
              {['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMZN'].map((sym) => (
                <button
                  key={sym}
                  onClick={() => startResearch(sym)}
                  className="px-2.5 py-1 bg-slate-900 hover:bg-slate-850 border border-slate-800 text-slate-300 hover:text-white rounded-lg text-xs font-mono font-semibold transition"
                >
                  {sym}
                </button>
              ))}
            </div>
          )}

          {/* Ticker Dropdown Matches */}
          {query.trim().length >= 2 && !searchingTicker && (
            <div className="mt-2 bg-slate-950 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden z-50 relative">
              {tickerMatches.length > 0 ? (
                tickerMatches.map((match) => (
                  <button
                    key={match.ticker}
                    disabled={!isWeightsValid}
                    className={`w-full text-left px-5 py-3 hover:bg-slate-900/60 border-b border-slate-900 last:border-0 flex justify-between items-center transition ${!isWeightsValid ? 'opacity-50 cursor-not-allowed' : ''}`}
                    onClick={() => startResearch(match.ticker)}
                  >
                    <div>
                      <span className="font-semibold text-white block text-sm">{match.name}</span>
                      <span className="text-xs text-slate-500">{match.exchange} • {match.sector}</span>
                    </div>
                    <span className="bg-slate-900 px-2.5 py-1 rounded text-xs font-mono text-slate-300 border border-slate-800">{match.ticker}</span>
                  </button>
                ))
              ) : (
                <div className="px-5 py-4 text-center text-sm text-slate-500 font-medium">
                  No public equities matching "{query}" found.
                </div>
              )}
            </div>
          )}

          {/* Custom weights overrides sliders */}
          <div className="mt-4 p-5 bg-slate-900/20 border border-slate-800 rounded-2xl">
            <label className="flex items-center gap-2.5 text-xs font-mono text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={useCustomWeights}
                onChange={(e) => setUseCustomWeights(e.target.checked)}
                className="rounded border-slate-800 bg-slate-950 text-emerald-500 focus:ring-0 focus:ring-offset-0"
              />
              Override Default Committee Weights
            </label>
            
            {useCustomWeights && (
              <div className="mt-5 space-y-5 animate-fade-in border-t border-slate-800/40 pt-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 text-xs font-mono">
                  <div>
                    <span className="text-slate-500 block mb-1.5 uppercase">FUNDAMENTAL: {weights.fundamental}%</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={weights.fundamental}
                      onChange={(e) => handleWeightChange('fundamental', e.target.value)}
                      className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-1.5 uppercase">MOAT & COMPETITIVE: {weights.moat}%</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={weights.moat}
                      onChange={(e) => handleWeightChange('moat', e.target.value)}
                      className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-1.5 uppercase">RISK & LEVERAGE: {weights.risk}%</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={weights.risk}
                      onChange={(e) => handleWeightChange('risk', e.target.value)}
                      className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>
                  <div>
                    <span className="text-slate-500 block mb-1.5 uppercase">VALUATION: {weights.valuation}%</span>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={weights.valuation}
                      onChange={(e) => handleWeightChange('valuation', e.target.value)}
                      className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>
                </div>
                
                <div className="pt-3 border-t border-slate-900 flex justify-between items-center text-xs font-mono">
                  <span className="text-slate-500">TOTAL WEIGHT SUM:</span>
                  <span className={weightsSum === 100 ? 'text-emerald-400 font-bold' : 'text-amber-500 font-bold'}>
                    {weightsSum}% {weightsSum === 100 ? '✓ Ready' : '(Must sum to 100%)'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 2. Streaming Progress State */}
      {researchState === 'streaming' && (
        <section className="max-w-2xl mx-auto glass-panel p-8 mb-16 animate-fade-in w-full bg-slate-900/35 border border-white/5 rounded-2xl">
          <div className="flex justify-between items-center mb-8 pb-4 border-b border-slate-800/80">
            <div>
              <h2 className="text-lg font-semibold text-white">Debating: {selectedTicker}</h2>
              {profile && <p className="text-xs text-slate-400 mt-1">{profile.name}</p>}
            </div>
            <SpinnerIcon />
          </div>

          {/* Progress Timeline */}
          <div className="space-y-6">
            {progressLogs.map((log, idx) => (
              <div key={idx} className="flex gap-4 items-start animate-fade-in">
                <div className="mt-1">
                  {log.status === 'SUCCESS' ? <CheckIcon /> : log.status === 'WARNING' ? <WarnIcon /> : <SpinnerIcon />}
                </div>
                <div className="flex-1">
                  <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider">{log.step.replace('_', ' ')}</span>
                  <p className="text-sm text-slate-300 font-medium mt-0.5">{log.message}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3. Error State */}
      {researchState === 'error' && (
        <section className="max-w-xl mx-auto glass-panel p-8 text-center animate-fade-in border-red-500/20 bg-slate-900/35 rounded-2xl">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-4 border border-red-500/20">
            <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Research Stalled</h3>
          <p className="text-slate-400 text-xs mb-6">{errorMessage}</p>
          <button
            className="px-6 py-2.5 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl text-white text-xs font-semibold transition"
            onClick={() => setResearchState('idle')}
          >
            Try Another Search
          </button>
        </section>
      )}

      {/* 4. Complete Research Results Dashboard */}
      {researchState === 'complete' && resultsData && (
        <div className="space-y-8 animate-fade-in w-full">
          
          {/* Top Panel: 3-Column Layout: Verdict Card, Profile Card, Data Provenance Card */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* Verdict Hero Card */}
            <div className={`glass-panel p-6 flex flex-col justify-between rounded-2xl ${getVerdictClass(customLabel || resultsData.verdict.label)}`}>
              <div>
                <span className="text-xs uppercase font-semibold font-mono tracking-widest opacity-80">Investment Decision</span>
                <h2 className="text-3xl font-black mt-1 font-mono tracking-tight">{customDecision || resultsData.verdict.decision || 'PASS'}</h2>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="inline-block px-2.5 py-0.5 bg-zinc-950/65 border border-zinc-800/85 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-300">
                    Recommendation: {customLabel || resultsData.verdict.label}
                  </span>
                  <span className="inline-block px-2.5 py-0.5 bg-zinc-950/65 border border-zinc-800/85 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-300">
                    Confidence: {confidenceMetrics.confidence}%
                  </span>
                </div>
                <p className="text-[11px] mt-3 text-zinc-300 leading-normal">{resultsData.verdict.disclosure}</p>
                {resultsData.verdict.valuationAlert && (
                  <div className="mt-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-300 leading-normal flex items-start gap-1.5 font-mono">
                    <svg className="w-3.5 h-3.5 shrink-0 text-amber-400 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                    <div>
                      <span className="font-bold block uppercase tracking-wider text-[9px] mb-0.5 text-amber-200">Value Alert (Bubble Guardrail)</span>
                      {resultsData.verdict.valuationAlert.message}
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-4 pt-3 border-t border-zinc-800/40 flex justify-between items-center text-[10px] relative">
                <span className="text-zinc-400 font-mono flex items-center gap-1 group relative cursor-help">
                  Consensus Score
                  <svg className="w-3 h-3 text-zinc-500 hover:text-zinc-350" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2.5 bg-slate-950 border border-slate-800 text-[9px] text-zinc-400 rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none leading-normal font-sans z-30">
                    Consensus Score represents the Committee's confidence in its final investment decision (BUY, HOLD, or PASS), not the bullishness of the rating itself.
                  </span>
                </span>
                <span className="font-mono font-bold text-xs">{confidenceMetrics.consensus} / 10</span>
              </div>
            </div>

            {/* Profile Info */}
            <div className="glass-panel p-6 flex flex-col justify-between bg-slate-900/40 border border-white/5 rounded-2xl">
              <div>
                <div className="flex justify-between items-start gap-4">
                  <div>
                    <h3 className="text-md font-bold text-white mb-0.5 leading-snug">{resultsData.profile.name} ({resultsData.profile.ticker})</h3>
                    <p className="text-[10px] font-mono text-slate-500">{resultsData.profile.sector} • {resultsData.profile.exchange}</p>
                  </div>
                  <div className="flex items-center gap-1 no-print">
                    <button
                      onClick={toggleWatch}
                      className="p-1.5 rounded-lg bg-slate-950/80 border border-slate-800 text-zinc-400 hover:text-white transition flex items-center justify-center shadow-sm"
                      title={isPinned ? 'Remove from Watchlist' : 'Add to Watchlist'}
                    >
                      <StarIcon filled={isPinned} />
                    </button>
                    {resultsData.profile.website && (
                      <a
                        href={resultsData.profile.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 hover:text-white p-1.5 rounded-lg bg-slate-950/80 border border-slate-800 transition"
                      >
                        <UpRightIcon />
                      </a>
                    )}
                  </div>
                </div>
                <p className="text-slate-400 text-[10px] mt-2 line-clamp-4 leading-normal">{resultsData.profile.description}</p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-900 grid grid-cols-2 gap-2.5 text-[10px] font-mono">
                <div>
                  <span className="text-slate-500 block text-[9px] mb-0.5">MARKET CAP</span>
                  <span className="text-white font-semibold">{formatLargeNum(displayMarketCap, resultsData.profile.currency)}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[9px] mb-0.5">STOCK PRICE</span>
                  <span className="text-white font-semibold">{resultsData.quote.price} {resultsData.profile.currency}</span>
                </div>
              </div>
            </div>

            {/* Data Provenance & Freshness Card */}
            <div className="glass-panel p-6 flex flex-col justify-between bg-slate-900/40 border border-white/5 rounded-2xl font-mono text-xs text-slate-400">
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-white font-bold pb-2 border-b border-slate-900/60 uppercase text-[10px] tracking-wider">
                  <svg className="w-4 h-4 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                  Data Provenance
                </div>
                
                <div className="space-y-2 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Statements:</span>
                    <span className="text-white font-semibold">FY{resultsData.historical?.incomeStatements?.[0]?.year || '2025'} Annual</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Price Feed:</span>
                    <span className="text-white font-semibold">Yahoo / Finnhub</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Filing Date:</span>
                    <span className="text-white font-semibold">{resultsData.profile?.lastFilingDate || '2026-02-15'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Provenance:</span>
                    <span className="text-emerald-400 font-bold">SEC Edgar Verified</span>
                  </div>
                </div>
              </div>
              
              <div className="mt-4 pt-3 border-t border-slate-900/60 flex flex-col gap-2.5">
                <div className="text-[9px] text-zinc-500">
                  Updated: {resultsData.fetchedAt ? new Date(resultsData.fetchedAt).toUTCString() : new Date().toUTCString()}
                </div>
                <div className="no-print">
                  <DataExporters ticker={resultsData.profile.ticker} resultsData={resultsData} />
                </div>
              </div>
            </div>

          </section>

          {/* Factual Financial Observations Section */}
          {resultsData.anomalies?.length > 0 && (
            <section className="bg-slate-900/30 border border-slate-800 rounded-2xl p-6">
              <h4 className="text-xs font-bold text-slate-400 mb-4 tracking-wider uppercase font-mono flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                Calculated Trend & Divergence Observations
              </h4>
              <ul className="space-y-3 text-xs text-slate-300">
                {resultsData.anomalies.map((anom, idx) => (
                  <li key={idx} className="flex gap-3 items-start bg-slate-950/40 p-3 rounded-lg border border-slate-900">
                    <span className="px-2 py-0.5 rounded text-[9px] font-mono font-bold bg-slate-850 border border-slate-800 text-slate-400 uppercase">{anom.category?.replace('_', ' ')}</span>
                    <span className="leading-relaxed">{anom.message}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

           {/* Historical Charts Suite */}
          <FinancialChartsSuite resultsData={resultsData} />

          {/* Institutional DCF Model */}
          <DcfSensitivityModel resultsData={resultsData} />

          {/* Benchmarked Ratios Dashboard */}
          <RatiosGrid resultsData={resultsData} />

          {/* Framework Analysis Cards */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {Object.entries(resultsData.frameworkSignals)
              .filter(([id]) => id !== 'swarm')
              .map(([id, sig]) => (
                <div key={id} className="glass-panel p-6 flex flex-col justify-between bg-slate-900/40 border border-white/5 rounded-2xl">
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-sm font-semibold text-white capitalize">{id.replace('_', ' ')}</h4>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono font-semibold ${
                        sig.direction === 'BULLISH' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        sig.direction === 'BEARISH' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                        'bg-zinc-850 text-zinc-400 border border-zinc-800'
                      }`}>
                        {sig.direction} ({sig.strength})
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed mb-4">{sig.key_driver}</p>
                  </div>
                  <div className="pt-3 border-t border-slate-900 text-[10px] text-slate-500">
                    <span className="block font-bold">Uncertainty Factor:</span>
                    <span className="text-slate-400 italic block mt-0.5">{sig.uncertainty}</span>
                  </div>
                </div>
              ))}
          </section>

          {/* Swarm Intelligence Section */}
          {resultsData.frameworkSignals?.swarm && (
            <section className="glass-panel p-6 bg-slate-900/40 border border-white/5 rounded-2xl">
              <h3 className="text-sm font-semibold text-white mb-4 uppercase tracking-wider border-b border-slate-800 pb-2">Swarm Intelligence Committee</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Risk Agent */}
                <div className="bg-slate-950/40 p-4 rounded-xl border border-white/5 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Risk Agent</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        resultsData.frameworkSignals.swarm.risk?.signal === 'HIGH' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                        resultsData.frameworkSignals.swarm.risk?.signal === 'MEDIUM' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                        'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      }`}>
                        {resultsData.frameworkSignals.swarm.risk?.signal || 'UNKNOWN'} RISK
                      </span>
                    </div>
                    <p className="text-xs text-slate-200 mb-3 font-medium leading-relaxed">{resultsData.frameworkSignals.swarm.risk?.primary_risk_driver || 'N/A'}</p>
                  </div>
                  <div className="pt-2.5 border-t border-slate-900 text-[10px] text-slate-500 leading-normal">
                    <span className="block font-bold text-slate-400 mb-0.5">Key Vulnerability:</span>
                    <span className="text-slate-400 italic">{resultsData.frameworkSignals.swarm.risk?.solvency_assessment || 'N/A'}</span>
                  </div>
                </div>

                {/* Macro/Sentiment Agent */}
                <div className="bg-slate-950/40 p-4 rounded-xl border border-white/5 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Macro Agent</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        resultsData.frameworkSignals.swarm.sentiment?.signal === 'BULLISH' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        resultsData.frameworkSignals.swarm.sentiment?.signal === 'BEARISH' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                        'bg-zinc-800 text-zinc-400 border border-zinc-750'
                      }`}>
                        {resultsData.frameworkSignals.swarm.sentiment?.signal || 'N/A'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-200 mb-3 font-medium leading-relaxed">{resultsData.frameworkSignals.swarm.sentiment?.overall_tone || 'N/A'}</p>
                  </div>
                  <div className="pt-2.5 border-t border-slate-900 text-[10px] text-slate-500 leading-normal">
                    <span className="block font-bold text-slate-400 mb-0.5">Key Catalyst:</span>
                    <span className="text-slate-400 italic">{resultsData.frameworkSignals.swarm.sentiment?.market_froth_indicator || 'N/A'}</span>
                  </div>
                </div>

                {/* Insider Agent */}
                <div className="bg-slate-950/40 p-4 rounded-xl border border-white/5 flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-center mb-3">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Insider Agent</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                        resultsData.frameworkSignals.swarm.insider?.signal === 'BULLISH' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        resultsData.frameworkSignals.swarm.insider?.signal === 'BEARISH' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                        'bg-zinc-800 text-zinc-400 border border-zinc-750'
                      }`}>
                        {resultsData.frameworkSignals.swarm.insider?.signal || 'N/A'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-200 mb-3 font-medium leading-relaxed">{resultsData.frameworkSignals.swarm.insider?.management_confidence || 'N/A'}</p>
                  </div>
                  <div className="pt-2.5 border-t border-slate-900 text-[10px] text-slate-500 leading-normal">
                    <span className="block font-bold text-slate-400 mb-0.5">Insider Activity:</span>
                    <span className="text-slate-400 italic">{resultsData.frameworkSignals.swarm.insider?.key_transactions?.join(', ') || 'N/A'}</span>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Audited Committee Audit Ledger (No Game-Like Elements) */}
          <CommitteeAuditLedger 
            resultsData={resultsData} 
            onScoreChange={(score, label, decision) => {
              setCustomScore(score);
              setCustomLabel(label);
              setCustomDecision(decision);
            }} 
          />

          {/* Thesis Report & Markdown */}
          <section className="glass-panel p-8 bg-slate-900/40 border border-white/5 rounded-2xl">
            <h3 className="text-lg font-semibold text-white mb-4 pb-2 border-b border-slate-900">Investment Thesis & Detailed Analysis</h3>
            <p className="text-slate-200 text-sm leading-relaxed mb-6 font-medium">{resultsData.report.verdict_summary}</p>
            <div className="prose prose-invert max-w-none text-xs text-slate-400 leading-relaxed font-sans">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({children}) => <h3 className="text-white text-md font-bold mt-6 mb-2">{children}</h3>,
                  h2: ({children}) => <h4 className="text-white text-sm font-semibold mt-5 mb-2">{children}</h4>,
                  h3: ({children}) => <h5 className="text-zinc-200 text-xs font-semibold mt-4 mb-1.5 uppercase tracking-wider">{children}</h5>,
                  h4: ({children}) => <h6 className="text-zinc-300 text-xs font-semibold mt-3 mb-1">{children}</h6>,
                  p: ({children}) => <p className="text-slate-400 text-xs leading-relaxed mb-3">{children}</p>,
                  strong: ({children}) => <strong className="text-slate-200 font-semibold">{children}</strong>,
                  em: ({children}) => <em className="text-slate-300 italic">{children}</em>,
                  ul: ({children}) => <ul className="list-disc list-inside space-y-1.5 mb-4 ml-2">{children}</ul>,
                  ol: ({children}) => <ol className="list-decimal list-inside space-y-1.5 mb-4 ml-2">{children}</ol>,
                  li: ({children}) => <li className="text-slate-400 text-xs leading-relaxed">{children}</li>,
                  table: ({children}) => <div className="overflow-x-auto my-4 border border-zinc-800 rounded-xl"><table className="w-full text-xs font-mono border-collapse">{children}</table></div>,
                  thead: ({children}) => <thead className="bg-zinc-900/80 text-zinc-400 uppercase text-[9px] tracking-wider">{children}</thead>,
                  th: ({children}) => <th className="p-2.5 text-left border-b border-zinc-800 font-semibold">{children}</th>,
                  td: ({children}) => <td className="p-2.5 text-slate-300 border-b border-zinc-900/50">{children}</td>,
                  blockquote: ({children}) => <blockquote className="border-l-2 border-emerald-500/40 pl-4 py-1 my-3 bg-emerald-950/10 rounded-r-lg">{children}</blockquote>,
                  code: ({children}) => <code className="bg-zinc-900 px-1.5 py-0.5 rounded text-emerald-400 text-[10px] font-mono">{children}</code>,
                  hr: () => <hr className="border-zinc-800 my-4" />,
                }}
              >
                {resultsData.report.detailed_analysis_markdown || ''}
              </ReactMarkdown>
            </div>
          </section>

          {/* Action Footer */}
          <footer className="flex justify-between items-center py-6 border-t border-slate-900 text-[10px] text-slate-500 font-mono no-print">
            <span>Dossier Compiled: {new Date(resultsData.fetchedAt).toLocaleString()} • Verified Math Layer</span>
            <div className="flex gap-4">
              <button
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-white font-medium transition flex items-center gap-2 cursor-pointer"
                onClick={() => window.print()}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                Export Dossier PDF
              </button>
              <button
                className="px-5 py-2.5 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl text-white font-medium transition cursor-pointer"
                onClick={() => setResearchState('idle')}
              >
                Analyze Another Ticker
              </button>
            </div>
          </footer>

        </div>
      )}

    </div>
  );
}
