'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getAllReports, getWatchlist } from '../../lib/storage/reportStore';

export default function Navbar() {
  const pathname = usePathname();
  const [reportCount, setReportCount] = useState(0);
  const [watchlistCount, setWatchlistCount] = useState(0);

  // Sync badges periodically
  useEffect(() => {
    async function updateBadges() {
      try {
        const reports = await getAllReports();
        const watchlist = await getWatchlist();
        setReportCount(reports.length);
        setWatchlistCount(watchlist.length);
      } catch (err) {
        console.warn('Failed to fetch count badges:', err.message);
      }
    }

    updateBadges();

    // Listen for custom storage events or simple interval polling
    const interval = setInterval(updateBadges, 2000);
    return () => clearInterval(interval);
  }, [pathname]);

  const navItems = [
    { label: 'Home', path: '/' },
    { label: 'Workspace', path: '/analyze' },
    { 
      label: 'Dashboard', 
      path: '/dashboard', 
      badge: reportCount > 0 ? reportCount : null 
    },
    { 
      label: 'Compare', 
      path: '/compare',
      badge: watchlistCount > 0 ? `★ ${watchlistCount}` : null
    }
  ];

  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-4 py-3 bg-[#0B0F19]/70 backdrop-blur-md border-b border-white/5">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        
        {/* Brand logo & name */}
        <Link href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-emerald-500 to-blue-600 flex items-center justify-between p-1.5 shadow-md shadow-emerald-500/10 group-hover:scale-105 transition-transform">
            <svg viewBox="0 0 24 24" className="w-full h-full text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-.778.099-1.533.284-2.253" />
            </svg>
          </div>
          <span className="font-semibold text-lg bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent group-hover:opacity-95 transition-opacity">
            Quorum
          </span>
        </Link>

        {/* Navigation links */}
        <nav className="flex items-center gap-1.5 md:gap-4 bg-slate-900/40 p-1 rounded-full border border-white/5">
          {navItems.map((item) => {
            const isActive = pathname === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`relative px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                  isActive 
                    ? 'text-white bg-white/10 shadow-inner' 
                    : 'text-slate-400 hover:text-slate-100 hover:bg-white/5'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {item.label}
                  {item.badge && (
                    <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 text-white leading-none shadow-sm shadow-emerald-500/10">
                      {item.badge}
                    </span>
                  )}
                </span>
              </Link>
            );
          })}
        </nav>

        {/* Action Button */}
        <div className="hidden sm:block">
          <Link
            href="/analyze"
            className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-semibold text-xs transition-all shadow-md shadow-emerald-500/10 hover:shadow-emerald-500/20 hover:scale-[1.02]"
          >
            Launch Analyst
          </Link>
        </div>

      </div>
    </header>
  );
}
