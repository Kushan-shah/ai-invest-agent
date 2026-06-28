'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getAllReports } from '../lib/storage/reportStore';

export default function Home() {
  const [recentReports, setRecentReports] = useState([]);

  useEffect(() => {
    async function loadReports() {
      try {
        const reports = await getAllReports();
        setRecentReports(reports.slice(0, 3)); // show top 3 recent reports
      } catch (err) {
        console.warn('Failed to load recent reports for home:', err.message);
      }
    }
    loadReports();
  }, []);

  const features = [
    {
      icon: (
        <svg viewBox="0 0 24 24" className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
      title: 'Deterministic Math Engine',
      description: 'Calculates financial growth, leverage, and margins programmatically with 100% precision. Zero LLM math errors.'
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      title: 'Committee Debate Node',
      description: 'Moderates a structural debate between Bull and Bear agents, forcing them to steelman opposing claims with audited evidence.'
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
      ),
      title: 'Optional SEC Filing Scan',
      description: 'Crawls sec.gov in real-time to analyze Item 1A Risk Factors for US equities, bypassing and falling back gracefully for global markets.'
    },
    {
      icon: (
        <svg viewBox="0 0 24 24" className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
      title: 'Factual Observations Only',
      description: 'Ditches rigid code-based severities. Surfs neutral financial patterns for the LLM to interpret intelligently based on industry sector.'
    }
  ];

  const steps = [
    { num: '01', title: 'Data Aggregation', desc: 'Queries financial state statements (IS, BS, CF) from Yahoo Finance, Finnhub, and FMP.' },
    { num: '02', title: 'Divergence Audits', desc: 'Computes multi-period financial trends, capital yields, and cash flow conversions.' },
    { num: '03', title: 'Committee Debate', desc: 'Agents cross-examine observations, validating findings in a moderated bull-bear transcript.' },
    { num: '04', title: 'Institutional Verdict', desc: 'Consolidates analysis into a unified investment decision dossier, complete with confidence scoring.' }
  ];

  return (
    <div className="w-full flex-1 flex flex-col justify-start">
      
      {/* Hero Section */}
      <section className="relative max-w-7xl mx-auto px-4 pt-20 pb-16 md:pt-32 md:pb-24 text-center">
        <div className="absolute inset-0 -z-10 flex items-center justify-center">
          <div className="w-72 h-72 rounded-full bg-emerald-500/10 blur-[100px] animate-pulse"></div>
          <div className="w-96 h-96 rounded-full bg-blue-600/5 blur-[120px] ml-40"></div>
        </div>

        <span className="inline-block px-3 py-1 bg-slate-900 border border-white/5 rounded-full text-xs font-mono font-bold uppercase tracking-wider text-emerald-400 mb-6">
          Institutional investment analysis
        </span>
        
        <h1 className="text-4xl md:text-7xl font-black mb-6 tracking-tight leading-none">
          <span className="title-gradient block">Investment Analysis</span>
          <span className="bg-gradient-to-r from-emerald-400 to-blue-500 bg-clip-text text-transparent block mt-2">
            Automated by Quorum
          </span>
        </h1>
        
        <p className="text-slate-400 text-sm md:text-base max-w-3xl mx-auto mb-10 leading-relaxed">
          Quorum is a multi-agent financial consensus portal. It replaces rigid sector-blind code checks with evidence-locked committee debate nodes, qualitative filing streams, and precise mathematical validation.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/analyze"
            className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-sm transition shadow-lg shadow-emerald-500/20 hover:scale-[1.01]"
          >
            Launch Research Workspace
          </Link>
          <Link
            href="/dashboard"
            className="w-full sm:w-auto px-8 py-3.5 rounded-xl bg-slate-900/60 border border-white/5 hover:border-white/10 text-white font-semibold text-sm transition hover:bg-slate-900"
          >
            View Dashboard
          </Link>
        </div>
      </section>

      {/* Recent reports strip */}
      {recentReports.length > 0 && (
        <section className="max-w-7xl mx-auto px-4 pb-16 w-full animate-fade-in">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest text-center mb-8 font-mono">
            Recent Committee Reports
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {recentReports.map((report) => (
              <Link 
                key={report.id}
                href={`/report/${report.id}`} 
                className="glass-panel p-5 bg-slate-900/25 border border-white/5 hover:border-emerald-500/30 rounded-2xl flex flex-col justify-between group transition-all duration-300 hover:-translate-y-1"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h4 className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">{report.companyName}</h4>
                    <span className="text-[10px] font-mono text-slate-500">{report.ticker} • {report.sector}</span>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold font-mono tracking-wider ${
                    report.verdict === 'INVEST' 
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                      : report.verdict === 'HOLD'
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}>
                    {report.verdict}
                  </span>
                </div>
                <div className="mt-5 pt-3 border-t border-slate-900/60 flex justify-between items-center text-[10px] text-slate-500 font-mono">
                  <span>Score: {report.score}</span>
                  <span>{new Date(report.createdAt).toLocaleDateString()}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Features Grid */}
      <section className="bg-slate-950/40 border-y border-white/5 py-20 px-4 w-full">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">Engineered for Accuracy</h2>
            <p className="text-slate-400 text-xs md:text-sm max-w-xl mx-auto">
              Investment assessments shouldn't rely on generic threshold flags or hallucination-prone LLM math. Here's how Quorum does it differently.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, idx) => (
              <div 
                key={idx} 
                className="glass-panel p-6 bg-slate-900/30 border border-white/5 rounded-2xl hover:border-slate-800 transition"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-950 flex items-center justify-center mb-5 border border-white/5 shadow-inner">
                  {feature.icon}
                </div>
                <h3 className="text-sm font-semibold text-white mb-2">{feature.title}</h3>
                <p className="text-slate-400 text-xs leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works Section */}
      <section className="max-w-7xl mx-auto px-4 py-20 w-full">
        <div className="text-center mb-16">
          <h2 className="text-2xl md:text-4xl font-bold text-white mb-4 font-title">Committee Workflow</h2>
          <p className="text-slate-400 text-xs md:text-sm max-w-xl mx-auto">
            From raw query to consensus verdict, the Quorum research pipeline is fully automated and logged.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 relative">
          {steps.map((step, idx) => (
            <div key={idx} className="glass-panel p-6 bg-slate-900/20 border border-white/5 rounded-2xl relative overflow-hidden group">
              <span className="absolute -right-2 -bottom-6 text-7xl font-black font-mono text-slate-800/15 select-none transition-transform duration-300 group-hover:scale-110">
                {step.num}
              </span>
              <h3 className="text-sm font-semibold text-white mb-2">{step.title}</h3>
              <p className="text-slate-400 text-xs leading-relaxed pr-4">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
