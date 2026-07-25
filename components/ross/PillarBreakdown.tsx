"use client";

import { useEffect, useRef } from "react";
import { ExternalLink, Newspaper, LineChart, TrendingUp } from "lucide-react";
import type { RossRow, PillarResult, RossNewsItem } from "@/lib/ross/types";

// Expanded per-row detail:
//   • a live TradingView mini chart (loaded lazily when the row is expanded),
//   • the 5 pillars with pass/fail/na status, and
//   • the positive catalyst-news list (summary + timestamp + source + window),
//     all rendered green per product decision.

function pillarClasses(status: PillarResult["status"]): string {
  switch (status) {
    case "pass":
      return "border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200";
    case "fail":
      return "border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-200";
    default:
      return "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200";
  }
}

function statusIcon(status: PillarResult["status"]): string {
  return status === "pass" ? "✅" : status === "fail" ? "❌" : "⚠️";
}

function timeAgo(ms?: number): string {
  if (!ms) return "";
  const s = Math.max(1, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

function fmtStamp(ms?: number): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }) + " ET";
}

const WINDOW_LABEL: Record<NonNullable<RossNewsItem["window"]>, string> = {
  afterhours: "After-hours",
  overnight: "Overnight",
  premarket: "Pre-market",
  regular: "Regular hrs",
};

/** Published within the last 3 hours → flag as NEW. */
function isFresh(ms?: number): boolean {
  return ms != null && Date.now() - ms <= 3 * 60 * 60 * 1000;
}

/** Lazily-mounted TradingView mini symbol chart for the expanded row. */
function TradingViewChart({ symbol }: { symbol: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.innerHTML = "";
    const widget = document.createElement("div");
    widget.className = "tradingview-widget-container__widget";
    el.appendChild(widget);

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js";
    script.async = true;
    script.type = "text/javascript";
    script.innerHTML = JSON.stringify({
      symbol,
      width: "100%",
      height: 220,
      locale: "en",
      dateRange: "1D",
      colorTheme: "light",
      isTransparent: true,
      autosize: false,
      largeChartUrl: "",
    });
    el.appendChild(script);

    return () => {
      el.innerHTML = "";
    };
  }, [symbol]);

  return (
    <div className="rounded-md border border-line overflow-hidden bg-surface-1">
      <div ref={containerRef} className="tradingview-widget-container" style={{ minHeight: 220 }} />
    </div>
  );
}

export function PillarBreakdown({ row }: { row: RossRow }) {
  return (
    <div className="space-y-3">
      {/* Live chart + open-in-TradingView */}
      <div>
        <div className="text-[11px] uppercase tracking-wide subtle mb-1.5 flex items-center gap-1">
          <LineChart className="w-3 h-3" /> Latest chart
          {row.extendedRising && row.extendedChangePct != null && (
            <span className="ml-2 inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 normal-case tracking-normal">
              <TrendingUp className="w-3 h-3" />
              {row.extendedSession === "premarket" ? "Pre-market" : "After-hours"} +
              {row.extendedChangePct.toFixed(1)}%
            </span>
          )}
          <a
            href={row.chartUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-emerald-600 hover:underline normal-case tracking-normal"
          >
            Open in TradingView <ExternalLink className="w-3 h-3" />
          </a>
        </div>
        <TradingViewChart symbol={row.tradingViewSymbol} />
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wide subtle mb-1.5">5 Pillars</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
          {row.pillars.map((p, i) => (
            <div key={p.key} className={`rounded-md border p-2 ${pillarClasses(p.status)}`}>
              <div className="flex items-center gap-1 text-xs font-semibold">
                <span>{statusIcon(p.status)}</span>
                <span>
                  {i + 1}. {p.label}
                </span>
                {!p.automated && (
                  <span className="ml-auto text-[9px] uppercase tracking-wide opacity-70">manual</span>
                )}
              </div>
              <div className="mt-1 font-mono text-sm">{p.value}</div>
              <div className="text-[10px] opacity-80 mt-0.5">{p.detail}</div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="text-[11px] uppercase tracking-wide subtle mb-1.5 flex items-center gap-1">
          <Newspaper className="w-3 h-3" /> Latest positive catalyst (after-hours → pre-market)
        </div>
        {row.news.length === 0 ? (
          <p className="text-xs subtle">
            No fresh positive headline in the catalyst window (last 24 hours).{" "}
            {row.strongMomentum
              ? "Strong move — verify the catalyst manually before trading."
              : "Confirm any catalyst manually."}
          </p>
        ) : (
          <ul className="space-y-1.5">
            {row.news.map((n) => (
              <li key={n.link}>
                <a
                  href={n.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block rounded-md border border-emerald-500/40 bg-emerald-500/10 hover:bg-emerald-500/15 p-2 transition"
                >
                  <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                    {isFresh(n.publishedAt) && (
                      <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-600 text-white animate-pulse">
                        ● new
                      </span>
                    )}
                    <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                      {n.window ? WINDOW_LABEL[n.window] : "catalyst"}
                    </span>
                    {typeof n.sentimentScore === "number" && n.sentimentScore > 0 && (
                      <span className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-700 dark:text-emerald-300">
                        ▲ bullish
                      </span>
                    )}
                    <span className="text-[11px] subtle truncate">{n.publisher ?? "—"}</span>
                    {n.publishedAt && (
                      <span className="text-[11px] subtle ml-auto whitespace-nowrap" title={fmtStamp(n.publishedAt)}>
                        {fmtStamp(n.publishedAt)} · {timeAgo(n.publishedAt)}
                      </span>
                    )}
                  </div>
                  <div className="text-sm font-medium leading-snug text-emerald-800 dark:text-emerald-200">
                    {n.title}
                    <ExternalLink className="inline w-3 h-3 ml-1 -mt-0.5 opacity-60" />
                  </div>
                  {n.summary && (
                    <p className="text-[11px] text-emerald-900/70 dark:text-emerald-100/70 mt-1 line-clamp-3">
                      {n.summary}
                    </p>
                  )}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-3 pt-1">
        <a
          href={row.googleFinanceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs subtle hover:text-ink inline-flex items-center gap-1 transition"
        >
          Google Finance <ExternalLink className="w-3 h-3" />
        </a>
        {row.floatUnknown && (
          <span className="text-[11px] text-amber-700 dark:text-amber-300">
            Float N/A — verify on Finviz (Pillar 5).
          </span>
        )}
      </div>
    </div>
  );
}
