'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getAllReports, deleteReport, getWatchlist, toggleWatchlist } from '../../lib/storage/reportStore';

export default function Dashboard() {
  const [reports, setReports] = useState([]);
  const [watchlist, setWatchlist] = useState([]);
  
  // Grid filters
  const [searchQuery, setSearchQuery] = useState('');
  const [verdictFilter, setVerdictFilter] = useState('ALL'); // ALL, INVEST, PASS
  const [sortBy, setSortBy] = useState('NEWEST'); // NEWEST, OLDEST, SCORE_HIGH, SCORE_LOW

  // Load storage data
  async function loadData() {
    try {
      const allReports = await getAllReports();
      const allWatch = await getWatchlist();
      setReports(allReports);
      setWatchlist(allWatch);
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const handleDelete = async (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this research report?')) {
      await deleteReport(id);
      loadData();
    }
  };

  const handleRemoveWatchlist = async (ticker, e) => {
    e.preventDefault();
    e.stopPropagation();
    await toggleWatchlist(ticker);
    loadData();
  };

  // Calculations for stats
  const totalAnalyzed = reports.length;
  const avgScore = totalAnalyzed > 0 
    ? (reports.reduce((acc, curr) => acc + (curr.score || 0), 0) / totalAnalyzed).toFixed(2)
    : '0.00';
  const investCount = reports.filter(r => r.verdict === 'INVEST').length;
  const passCount = reports.filter(r => r.verdict === 'PASS').length;

  // Filter and sort reports
  const filteredReports = reports.filter(report => {
    const matchesSearch = report.companyName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          report.ticker.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (verdictFilter === 'ALL') return matchesSearch;
    return matchesSearch && report.verdict === verdictFilter;
  });

  const sortedReports = [...filteredReports].sort((a, b) => {
    if (sortBy === 'NEWEST') return new Date(b.createdAt) - new Date(a.createdAt);
    if (sortBy === 'OLDEST') return new Date(a.createdAt) - new Date(b.createdAt);
    if (sortBy === 'SCORE_HIGH') return (b.score || 0) - (a.score || 0);
    if (sortBy === 'SCORE_LOW') return (a.score || 0) - (b.score || 0);
    return 0;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 md:py-12 w-full flex-1 flex flex-col justify-start">
      
      {/* Page Title */}
      <header className="mb-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-4xl font-bold text-white tracking-tight">Investment Workspace</h1>
          <p className="text-slate-400 text-xs mt-1">Manage saved research reports, watchlist pins, and aggregate statistics.</p>
        </div>
        <Link
          href="/analyze"
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-xs shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 text-center transition"
        >
          Run New Analysis
        </Link>
      </header>

      {/* Aggregate Stats Bar */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="glass-panel p-5 bg-slate-900/30 border border-white/5 rounded-2xl flex flex-col justify-between">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Total Analyzed</span>
          <span className="text-2xl md:text-3xl font-black text-white mt-2 font-mono">{totalAnalyzed}</span>
        </div>
        <div className="glass-panel p-5 bg-slate-900/30 border border-white/5 rounded-2xl flex flex-col justify-between">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Average Score</span>
          <span className="text-2xl md:text-3xl font-black text-emerald-400 mt-2 font-mono">{avgScore} <span className="text-xs text-slate-500 font-normal">/+3.0</span></span>
        </div>
        <div className="glass-panel p-5 bg-slate-900/30 border border-white/5 rounded-2xl flex flex-col justify-between">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Verdict: INVEST</span>
          <span className="text-2xl md:text-3xl font-black text-emerald-500 mt-2 font-mono">{investCount}</span>
        </div>
        <div className="glass-panel p-5 bg-slate-900/30 border border-white/5 rounded-2xl flex flex-col justify-between">
          <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider block">Verdict: PASS</span>
          <span className="text-2xl md:text-3xl font-black text-amber-500 mt-2 font-mono">{passCount}</span>
        </div>
      </section>

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Left Side: Watchlist Panel */}
        <aside className="lg:col-span-1 space-y-6">
          <div className="glass-panel p-5 bg-slate-900/20 border border-white/5 rounded-2xl">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 font-mono flex items-center gap-2">
              <svg className="w-4 h-4 text-yellow-400 fill-yellow-400" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>
              Watchlist
            </h3>

            {watchlist.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                No pinned symbols.<br/>Star a company during analysis to pin it here.
              </div>
            ) : (
              <div className="space-y-3">
                {watchlist.map((item) => (
                  <div key={item.ticker} className="bg-slate-950/60 border border-slate-900 rounded-xl p-3 flex items-center justify-between group hover:border-slate-800 transition">
                    <div>
                      <span className="font-mono font-bold text-xs text-white block">{item.ticker}</span>
                      <span className="text-[10px] text-slate-500 block truncate max-w-[130px]">{item.name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => handleRemoveWatchlist(item.ticker, e)}
                        className="opacity-0 group-hover:opacity-100 p-1.5 rounded bg-slate-900 text-slate-500 hover:text-red-400 hover:bg-slate-900/80 transition"
                        title="Remove from Watchlist"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                      <Link
                        href={`/analyze?ticker=${item.ticker}`}
                        className="px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 hover:bg-emerald-500 hover:text-slate-950 text-[10px] font-bold font-mono transition"
                      >
                        Run
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sector Allocation Panel */}
          <div className="glass-panel p-5 bg-slate-900/20 border border-white/5 rounded-2xl">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 font-mono flex items-center gap-2">
              <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11 3.055A9.003 9.003 0 1020.945 13H11V3.055z" /><path strokeLinecap="round" strokeLinejoin="round" d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" /></svg>
              Sector Allocation
            </h3>
            {reports.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                No sectors analyzed yet.
              </div>
            ) : (
              <div className="space-y-3 font-mono text-xs text-slate-300">
                {Object.entries(
                  reports.reduce((acc, r) => {
                    const sector = r.sector || 'Unknown';
                    acc[sector] = (acc[sector] || 0) + 1;
                    return acc;
                  }, {})
                ).map(([sector, count]) => {
                  const pct = Math.round((count / reports.length) * 100);
                  return (
                    <div key={sector} className="space-y-1">
                      <div className="flex justify-between text-[10px]">
                        <span className="truncate max-w-[120px]">{sector}</span>
                        <span className="text-slate-400 font-bold">{count} ({pct}%)</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                        <div 
                          style={{ width: `${pct}%` }} 
                          className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>

        {/* Right Side: Reports Grid */}
        <main className="lg:col-span-3 space-y-6">
          
          {/* Filters Bar */}
          <div className="glass-panel p-4 bg-slate-900/15 border border-white/5 rounded-2xl flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:w-72">
              <input
                type="text"
                placeholder="Search saved reports..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-slate-950/80 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-slate-700 transition"
              />
              <svg className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
            </div>

            <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
              {/* Verdict Filter tabs */}
              <div className="flex bg-slate-950 border border-slate-900 rounded-xl p-0.5 text-[10px] font-mono">
                {['ALL', 'INVEST', 'HOLD', 'PASS'].map((vf) => (
                  <button
                    key={vf}
                    onClick={() => setVerdictFilter(vf)}
                    className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                      verdictFilter === vf ? 'bg-white/10 text-white shadow-inner' : 'text-slate-500 hover:text-slate-300'
                    }`}
                  >
                    {vf}
                  </button>
                ))}
              </div>

              {/* Sort Dropdown */}
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="bg-slate-950 border border-slate-900 rounded-xl p-2 text-[10px] font-mono text-slate-300 focus:outline-none focus:border-slate-700"
              >
                <option value="NEWEST">Newest First</option>
                <option value="OLDEST">Oldest First</option>
                <option value="SCORE_HIGH">Score: High to Low</option>
                <option value="SCORE_LOW">Score: Low to High</option>
              </select>
            </div>
          </div>

          {/* Reports Grid List */}
          {sortedReports.length === 0 ? (
            <div className="glass-panel p-16 text-center border border-white/5 rounded-2xl bg-slate-900/10">
              <div className="w-12 h-12 rounded-full bg-slate-900/60 border border-slate-800 flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
              </div>
              <h3 className="text-sm font-semibold text-white mb-1">No research reports found</h3>
              <p className="text-slate-500 text-xs mb-6 max-w-sm mx-auto">
                {searchQuery || verdictFilter !== 'ALL' 
                  ? 'No saved reports match your search criteria. Try clearing some filters.' 
                  : 'Start by running a stock ticker analysis in the Research Workspace.'}
              </p>
              {!searchQuery && verdictFilter === 'ALL' && (
                <Link
                  href="/analyze"
                  className="inline-block px-5 py-2 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-xl text-white text-xs font-semibold transition"
                >
                  Analyze First Stock
                </Link>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {sortedReports.map((report) => (
                <div 
                  key={report.id}
                  className="glass-panel p-5 bg-slate-900/25 border border-white/5 rounded-2xl flex flex-col justify-between hover:border-slate-800/80 transition duration-300 relative group"
                >
                  {/* Top */}
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors line-clamp-1">{report.companyName}</h4>
                      <span className="text-[10px] font-mono text-slate-500">{report.ticker} • {report.sector}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold font-mono tracking-wider ${
                        report.verdict === 'INVEST' 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : report.verdict === 'HOLD'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        {report.verdict}
                      </span>
                    </div>
                  </div>

                  {/* Body Info */}
                  <div className="bg-slate-950/40 border border-slate-900 rounded-xl p-3 text-xs mb-5 font-mono grid grid-cols-2 gap-3 text-slate-400">
                    <div>
                      <span className="text-[9px] text-slate-600 uppercase block">Verdict Rating</span>
                      <span className="text-white font-semibold">{report.label || 'HOLD'}</span>
                    </div>
                    <div>
                      <span className="text-[9px] text-slate-600 uppercase block">Verdict Score</span>
                      <span className="text-white font-bold">{report.score} / +3.0</span>
                    </div>
                  </div>

                  {/* Actions footer */}
                  <div className="pt-3 border-t border-slate-900/60 flex items-center justify-between text-[10px] font-mono text-slate-500">
                    <span>{new Date(report.createdAt).toLocaleDateString()}</span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => handleDelete(report.id, e)}
                        className="px-2.5 py-1.5 rounded bg-slate-950 text-slate-500 hover:text-red-400 border border-slate-900 transition flex items-center justify-center"
                        title="Delete Report"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                      <Link
                        href={`/terminal/${report.id}`}
                        className="px-3.5 py-1.5 rounded bg-amber-600/10 border border-amber-500/20 text-amber-400 hover:bg-amber-600 hover:text-white transition font-bold"
                      >
                        Terminal
                      </Link>
                      <Link
                        href={`/report/${report.id}`}
                        className="px-3.5 py-1.5 rounded bg-blue-600/10 border border-blue-500/20 text-blue-400 hover:bg-blue-600 hover:text-white transition font-bold"
                      >
                        View Report
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

        </main>

      </div>

    </div>
  );
}
