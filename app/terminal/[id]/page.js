'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { getReport } from '../../../lib/storage/reportStore';
import TerminalLayout from '../../components/TerminalLayout';

export default function TerminalPage({ params: paramsPromise }) {
  const params = use(paramsPromise);
  const id = params.id;
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadReport() {
      try {
        const data = await getReport(id);
        if (data) {
          setReport(data);
        }
      } catch (err) {
        console.error('Failed to load report:', err);
      } finally {
        setLoading(false);
      }
    }
    loadReport();
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-amber-500 font-mono text-sm animate-pulse">
          INITIALIZING TERMINAL DATA FEED...
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-4">
        <div className="text-red-500 font-mono text-lg mb-4">ERR: DOSSIER NOT FOUND OR CORRUPTED</div>
        <Link href="/dashboard" className="border border-amber-900 text-amber-500 px-4 py-2 font-mono hover:bg-amber-900/30">
          RETURN TO MAIN TERMINAL
        </Link>
      </div>
    );
  }

  const resultsData = report.fullPayload;

  return (
    <div className="bg-black min-h-screen relative">
      {/* Floating Navigation Actions */}
      <div className="fixed bottom-4 right-4 flex gap-3 z-50">
        <Link 
          href={`/report/${id}`}
          className="border border-emerald-900 bg-emerald-950/80 text-emerald-500 px-4 py-2 font-mono text-xs hover:bg-emerald-900 transition flex items-center gap-2 backdrop-blur-sm"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
          CLASSIC UI
        </Link>
        <Link 
          href="/dashboard"
          className="border border-amber-900 bg-amber-950/80 text-amber-500 px-4 py-2 font-mono text-xs hover:bg-amber-900 transition flex items-center gap-2 backdrop-blur-sm"
        >
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          DASHBOARD
        </Link>
      </div>

      <TerminalLayout data={resultsData} report={resultsData.report} />
    </div>
  );
}
