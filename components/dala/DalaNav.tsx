"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { WordmarkGlyph } from "./icons";

// Fixed top nav with reveal-on-load (CSS animation triggers 2.2s after first
// paint to wait out the loader). Mobile gets a purple circular hamburger that
// toggles a blurred-overlay menu, matching Dala's pattern.
export function DalaNav() {
  const [open, setOpen] = useState(false);

  // Close on route nav / Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="dala-header">
        <div className="dala-shell">
          <nav className="dala-nav">
            <Link href="/" className="flex items-center gap-2.5">
              <WordmarkGlyph width={22} height={22} style={{ color: "#8052ff" }} />
              <span style={{ fontWeight: 600, fontSize: 18, letterSpacing: -0.005, color: "#fff" }}>
                InvestWith.AI
              </span>
            </Link>
            <div className="dala-nav-list">
              <Link className="dala-nav-link" href="/fomc">FOMC</Link>
              <Link className="dala-nav-link" href="/etf">ETF</Link>
              <Link className="dala-nav-link" href="/stocks">STOCKS</Link>
              <Link className="dala-nav-link" href="/screener">ROSS SCREENER</Link>
              <Link className="dala-nav-link" href="/ross-dashboard">ROSS DASHBOARD</Link>
            </div>
            <Link href="/fomc" className="dala-pill-ghost dala-header-cta">Launch Dashboard</Link>
          </nav>
        </div>
      </header>

      <button
        className="dala-nav-toggle"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? (
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M4 4L16 16M16 4L4 16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <path d="M3 7H19M3 15H19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        )}
      </button>

      <div className="dala-mobile-nav" data-open={open ? "true" : "false"} onClick={() => setOpen(false)}>
        <Link href="/fomc">FOMC</Link>
        <Link href="/etf">ETF</Link>
        <Link href="/stocks">STOCKS</Link>
        <Link href="/screener">ROSS SCREENER</Link>
        <Link href="/ross-dashboard">ROSS DASHBOARD</Link>
        <Link href="/fomc" className="dala-pill" style={{ marginTop: 12 }}>Launch Dashboard</Link>
      </div>
    </>
  );
}
