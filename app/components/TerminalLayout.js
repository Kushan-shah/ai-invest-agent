'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Advanced Terminal Layout (Bloomberg-style)
 * 
 * Provides a highly condensed, multi-pane view optimized for institutional users.
 * Supports drag-and-drop or fixed grid panels.
 */
export default function TerminalLayout({ report, data }) {
  if (!report || !data) return <div className="p-8 text-center text-zinc-500 font-mono">Loading Terminal...</div>;

  return (
    <div className="min-h-screen bg-black text-amber-500 font-mono p-4 text-[11px] leading-tight flex flex-col gap-2">
      {/* Top Bar - Ticker & Price */}
      <div className="border border-amber-900/50 bg-amber-950/20 p-2 flex justify-between items-center">
        <div className="flex gap-4">
          <span className="text-amber-400 font-bold text-sm">{data.profile?.ticker || 'UNKNOWN'} US Equity</span>
          <span>{data.profile?.name}</span>
          <span className="text-white bg-amber-600 px-1">{report.verdict_summary.split('.')[0] || 'N/A'}</span>
        </div>
        <div className="flex gap-4 text-right">
          <span>PRICE: {data.quote?.price ? data.quote.price.toFixed(2) : '---'}</span>
          <span>VOL: {data.quote?.volume ? (data.quote.volume / 1e6).toFixed(2) + 'M' : '---'}</span>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-12 gap-2">
        {/* Left Col: Ratios & Alerts */}
        <div className="col-span-3 flex flex-col gap-2">
          <div className="border border-amber-900/50 bg-amber-950/20 p-2 flex-1 overflow-y-auto max-h-[40vh]">
            <h2 className="uppercase border-b border-amber-900 mb-2 pb-1 text-amber-300">Key Metrics</h2>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1">
              <span>P/E Ratio</span><span className="text-right">{data.metrics?.latest?.pe?.toFixed(2) || 'N/A'}</span>
              <span>PEG Ratio</span><span className="text-right">{data.metrics?.latest?.peg?.toFixed(2) || 'N/A'}</span>
              <span>ROE</span><span className="text-right">{data.metrics?.ratios?.roe ? (data.metrics.ratios.roe * 100).toFixed(1) + '%' : 'N/A'}</span>
              <span>Net Margin</span><span className="text-right">{data.metrics?.ratios?.netMargin ? (data.metrics.ratios.netMargin * 100).toFixed(1) + '%' : 'N/A'}</span>
              <span>Debt/Eq</span><span className="text-right">{data.metrics?.ratios?.debtToEquity?.toFixed(2) || 'N/A'}</span>
            </div>
          </div>
          
          <div className="border border-amber-900/50 bg-amber-950/20 p-2 flex-1 overflow-y-auto max-h-[40vh]">
            <h2 className="uppercase border-b border-amber-900 mb-2 pb-1 text-amber-300">Swarm Intelligence</h2>
            {data.frameworkSignals?.swarm ? (
              <div className="space-y-2">
                <div>
                  <span className="font-bold">Risk Agent:</span> {data.frameworkSignals.swarm.risk?.signal}
                  <p className="mt-1 opacity-80">{data.frameworkSignals.swarm.risk?.primary_risk_driver}</p>
                </div>
                <div className="pt-1 border-t border-amber-900/30">
                  <span className="font-bold">Macro Agent:</span> {data.frameworkSignals.swarm.sentiment?.signal}
                  <p className="mt-1 opacity-80">{data.frameworkSignals.swarm.sentiment?.overall_tone}</p>
                </div>
                <div className="pt-1 border-t border-amber-900/30">
                  <span className="font-bold">Insider Agent:</span> {data.frameworkSignals.swarm.insider?.signal || 'N/A'}
                  <p className="mt-1 opacity-80">{data.frameworkSignals.swarm.insider?.management_confidence || 'N/A'}</p>
                </div>
              </div>
            ) : (
              <div className="opacity-50 italic">Swarm data currently unavailable.</div>
            )}
          </div>
        </div>

        {/* Center Col: Institutional Thesis */}
        <div className="col-span-6 border border-amber-900/50 bg-amber-950/20 p-4 overflow-y-auto max-h-[80vh] terminal-markdown">
          <h2 className="uppercase border-b border-amber-900 mb-4 pb-2 text-amber-300 text-sm">Investment Thesis</h2>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {report.investment_thesis + '\n\n' + report.detailed_analysis_markdown}
          </ReactMarkdown>
        </div>

        {/* Right Col: Catalysts & Scenarios */}
        <div className="col-span-3 flex flex-col gap-2">
          <div className="border border-amber-900/50 bg-amber-950/20 p-2 flex-1">
            <h2 className="uppercase border-b border-amber-900 mb-2 pb-1 text-amber-300">Key Catalysts</h2>
            <ul className="list-disc pl-4 space-y-1">
              {report.key_catalysts?.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>

          <div className="border border-amber-900/50 bg-amber-950/20 p-2 flex-1">
            <h2 className="uppercase border-b border-amber-900 mb-2 pb-1 text-amber-300">DCF Scenarios (WACC / T.Growth)</h2>
            <div className="space-y-2">
              {['bear', 'base', 'bull'].map(s => {
                const scen = report.valuation_scenarios?.[s];
                if (!scen) return null;
                return (
                  <div key={s} className="flex justify-between">
                    <span className="uppercase">{s}</span>
                    <span>{(scen.wacc * 100).toFixed(1)}% / {(scen.terminal * 100).toFixed(1)}%</span>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .terminal-markdown h1, .terminal-markdown h2, .terminal-markdown h3 { color: #fcd34d; margin-top: 1em; margin-bottom: 0.5em; text-transform: uppercase; }
        .terminal-markdown p { margin-bottom: 1em; opacity: 0.9; }
        .terminal-markdown ul { list-style-type: square; padding-left: 1.5em; margin-bottom: 1em; }
        .terminal-markdown li { margin-bottom: 0.25em; }
      `}} />
    </div>
  );
}
