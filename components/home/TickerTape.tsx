"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

interface Quote { ticker: string; price: number; changePct: number; }

const TAPE_SYMBOLS = [
  "SPY", "QQQ", "GLD", "FBTC",
  "NVDA", "AVGO", "GOOGL", "TSM", "ASML", "ANET",
  "PLTR", "RBRK", "CRWV", "MAR",
  "IONQ", "RGTI", "QBTS", "QNC", "LAES", "ARQQ",
  "BE", "BMNR", "INDI", "ZENA",
  "FETH", "VOO", "XLE", "SHV",
];

export function TickerTape() {
  const [quotes, setQuotes] = useState<Quote[] | null>(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await fetch(`/api/quotes?symbols=${encodeURIComponent(TAPE_SYMBOLS.join(","))}`).then((x) => x.json());
        if (alive && Array.isArray(r?.data)) setQuotes(r.data);
      } catch { /* best-effort */ }
    }
    load();
    const id = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const byTicker = new Map(quotes?.map((q) => [q.ticker, q]) ?? []);
  // Build ordered list, preserve missing ones as "—"
  const items = TAPE_SYMBOLS.map((t) => ({ ticker: t, q: byTicker.get(t) }));
  // Duplicate the list so the marquee can loop seamlessly
  const looped = [...items, ...items];

  return (
    <div className="relative overflow-hidden rounded-lg border border-line bg-surface-2/60 backdrop-blur-sm">
      <div className="flex items-center">
        <div className="shrink-0 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400 border-r border-line bg-surface-2">
          ● Live
        </div>
        <div className="relative flex-1 overflow-hidden">
          <div className="flex gap-6 py-2 whitespace-nowrap animate-ticker-tape will-change-transform">
            {looped.map((it, idx) => {
              const px = it.q?.price ?? 0;
              const pct = it.q?.changePct ?? 0;
              const up = pct > 0;
              const dn = pct < 0;
              return (
                <span key={`${it.ticker}-${idx}`} className="inline-flex items-baseline gap-1.5 text-[12px] font-mono">
                  <span className="font-semibold text-ink">{it.ticker}</span>
                  <span className="subtle">{px > 0 ? `$${px.toFixed(2)}` : "—"}</span>
                  <span className={clsx(
                    "text-[11px]",
                    up && "text-emerald-500",
                    dn && "text-rose-500",
                    !up && !dn && "subtle",
                  )}>
                    {it.q ? `${up ? "▲" : dn ? "▼" : "·"} ${Math.abs(pct).toFixed(2)}%` : ""}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
