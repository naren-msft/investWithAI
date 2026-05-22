"use client";
import type { BuyRecommendation } from "@/types";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";

export function TickerMarquee({
  recs,
  asOf,
}: {
  recs: BuyRecommendation[];
  asOf: string;
}) {
  if (recs.length === 0) {
    return (
      <div className="card !p-0 overflow-hidden">
        <div className="px-4 py-2 text-xs subtle">No active buys recommended right now — hold cash for the next tranche window.</div>
      </div>
    );
  }
  const items = [...recs].sort((a, b) => b.dollars - a.dollars);
  // Duplicate the items so the scroll loop is seamless.
  const loop = [...items, ...items];

  return (
    <div className="card !p-0 overflow-hidden relative">
      <div className="flex items-stretch border-b border-line">
        <div className="shrink-0 px-3 py-2 bg-brand text-black text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
          📊 Today&apos;s buys
        </div>
        <div className="shrink-0 px-3 py-2 text-[11px] subtle border-r border-line flex items-center">
          {new Date(asOf).toLocaleString()}
        </div>
        <div className="shrink-0 px-3 py-2 text-[11px] subtle flex items-center">
          {recs.length} actionable · refresh page for tomorrow&apos;s plan
        </div>
      </div>
      <div className="relative overflow-hidden">
        <div className="marquee-track flex gap-6 py-2.5 px-4 whitespace-nowrap text-sm">
          {loop.map((r, i) => <TickerItem key={`${r.ticker}-${i}`} r={r} />)}
        </div>
      </div>
      <style jsx>{`
        .marquee-track {
          animation: marquee 60s linear infinite;
          width: max-content;
        }
        .marquee-track:hover { animation-play-state: paused; }
        @keyframes marquee {
          0%   { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
      `}</style>
    </div>
  );
}

function TickerItem({ r }: { r: BuyRecommendation }) {
  const up = r.dayChangePct > 0.005;
  const down = r.dayChangePct < -0.005;
  const ArrowI = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  const dayCls = up ? "text-emerald-700 dark:text-emerald-300" : down ? "text-red-700 dark:text-red-300" : "subtle";
  const signalCls =
    r.signal === "BUY"   ? "bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-500 dark:border-emerald-400 dark:text-black" :
    r.signal === "AVOID" ? "bg-red-600 text-white border-red-700 dark:bg-red-500 dark:border-red-400 dark:text-white" :
                           "bg-surface-3 text-ink border-line";
  return (
    <span className="inline-flex items-center gap-2 shrink-0">
      <span className="font-bold tracking-wider">{r.ticker}</span>
      <span className={`px-1.5 py-0.5 text-[10px] rounded border ${signalCls}`}>{r.signal}</span>
      <span className="subtle text-xs">Buy</span>
      <span className="font-mono font-semibold">${Math.round(r.dollars).toLocaleString()}</span>
      <span className="subtle text-xs">({r.shares} sh @ ${r.price.toFixed(2)})</span>
      <span className="subtle text-xs">·</span>
      <span className="subtle text-xs">RSI {Number.isFinite(r.rsi) ? r.rsi.toFixed(1) : "—"}</span>
      <span className="subtle text-xs">·</span>
      <span className={`inline-flex items-center gap-0.5 text-xs font-mono ${dayCls}`}>
        <ArrowI className="w-3 h-3" />
        {r.dayChangePct >= 0 ? "+" : ""}{r.dayChangePct.toFixed(2)}%
      </span>
      <span className="subtle text-xs mx-3">•</span>
    </span>
  );
}
