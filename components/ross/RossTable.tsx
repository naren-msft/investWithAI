"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, RefreshCw, Flame, LineChart, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { PillarBreakdown } from "./PillarBreakdown";
import type { RossResult, RossRow, PillarResult } from "@/lib/ross/types";
import type { RossThresholds } from "@/config/ross";

type Filter = "all" | "green" | "strong" | "rising";
type LiveQuote = { price: number; changePct: number; asOf: string };

const INTERVAL_OPTIONS: { label: string; sec: number }[] = [
  { label: "30s", sec: 30 },
  { label: "1m", sec: 60 },
  { label: "5m", sec: 300 },
  { label: "Off", sec: 0 },
];

function fmtPrice(n: number | null | undefined): string {
  if (n == null || !isFinite(n) || n <= 0) return "—";
  return n.toFixed(2);
}
function fmtChangePct(p: number | null | undefined): string {
  if (p == null || !isFinite(p)) return "—";
  const sign = p > 0 ? "+" : "";
  return `${sign}${p.toFixed(1)}%`;
}
function fmtRvol(n: number | null | undefined): string {
  return n == null || !isFinite(n) ? "—" : `${n.toFixed(1)}×`;
}
function fmtShares(n: number | null | undefined): string {
  if (n == null || !isFinite(n)) return "N/A";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return String(Math.round(n));
}
function fmtAgo(iso: string | null): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}
/** Absolute HH:MM in US-Eastern — deterministic across SSR/client (fixed tz). */
function fmtEtTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function ExtHrsCell({ pct, session }: { pct: number | null; session: "premarket" | "afterhours" | null }) {
  if (pct == null || !isFinite(pct)) return <span className="subtle">—</span>;
  const color = pct > 0 ? "text-emerald-500" : pct < 0 ? "text-red-500" : "text-ink/60";
  const sign = pct > 0 ? "+" : "";
  const tag = session === "premarket" ? "PM" : session === "afterhours" ? "AH" : "";
  return (
    <span className={color} title={session === "premarket" ? "Pre-market change" : "After-hours change"}>
      {sign}
      {pct.toFixed(1)}%{tag && <span className="text-[9px] subtle ml-0.5">{tag}</span>}
    </span>
  );
}

function pillarDot(p: PillarResult) {
  const color =
    p.status === "pass"
      ? "bg-emerald-500"
      : p.status === "fail"
      ? "bg-red-500"
      : "bg-amber-400";
  return (
    <span
      key={p.key}
      title={`${p.label}: ${p.status.toUpperCase()} (${p.value})`}
      className={`inline-block w-2.5 h-2.5 rounded-full ${color}`}
    />
  );
}

/** How often to re-scan the universe/news from the server (heavier than the
 *  quote poll). Short so newly-qualifying momentum names surface quickly. */
const NEWS_REFRESH_MS = 60 * 1000;

/** Rebuild the screener query string from resolved thresholds so a news refresh
 *  re-runs the screener with exactly the same criteria the user is viewing.
 *  `minMarketCap` is included so the large-cap profile refreshes correctly. */
function rossQuery(t: RossThresholds, requireExtendedRising: boolean): string {
  const p = new URLSearchParams({
    minRvol: String(t.minRvol),
    minChange: String(t.minChangePct),
    strongMomentum: String(t.strongMomentumPct),
    minPrice: String(t.minPrice),
    maxPrice: String(t.maxPrice),
    maxFloat: String(t.maxFloat),
    minMarketCap: String(t.minMarketCap),
    extRising: requireExtendedRising ? "1" : "0",
  });
  return p.toString();
}

export function RossTable({ result, apiPath = "/api/ross" }: { result: RossResult; apiPath?: string }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [intervalSec, setIntervalSec] = useState<number>(60);
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [lastFetchAt, setLastFetchAt] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [, setTick] = useState(0);
  // Relative timestamps ("scanned Xs ago") depend on Date.now(), which differs
  // between the SSR pass and client hydration — render them only after mount to
  // avoid a React hydration text mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Live copy of the screener result — seeded from the server prop, then
  // refreshed (news + rows) on the news interval so headlines stay current
  // without a full page reload.
  const [data, setData] = useState<RossResult>(result);
  const [newsFetchAt, setNewsFetchAt] = useState<string | null>(null);
  useEffect(() => {
    setData(result);
  }, [result]);

  const allTickers = useMemo(
    () => Array.from(new Set(data.rows.map((r) => r.ticker))),
    [data.rows],
  );

  const inFlight = useRef(false);
  const refresh = useMemo(
    () => async () => {
      if (inFlight.current || allTickers.length === 0) return;
      inFlight.current = true;
      setFetching(true);
      try {
        const url = `/api/quotes?symbols=${encodeURIComponent(allTickers.join(","))}`;
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = await r.json();
        const next: Record<string, LiveQuote> = {};
        for (const q of j.data ?? []) {
          if (!q?.ticker) continue;
          next[q.ticker] = {
            price: q.price ?? 0,
            changePct: q.changePct ?? 0,
            asOf: q.asOf ?? new Date().toISOString(),
          };
        }
        setQuotes(next);
        setLastFetchAt(new Date().toISOString());
      } catch {
        // keep last good values
      } finally {
        inFlight.current = false;
        setFetching(false);
      }
    },
    [allTickers],
  );

  // News (and full-row) refresh — re-runs the screener server-side and swaps in
  // fresh rows/news. Uses the same thresholds the user is currently viewing.
  // `force` bypasses the server scan cache (?fresh=1) — used by the manual
  // Refresh button so the user can always pull a live universe on demand.
  const newsInFlight = useRef(false);
  const refreshNews = useMemo(
    () => async (force = false) => {
      if (newsInFlight.current) return;
      newsInFlight.current = true;
      try {
        const url = `${apiPath}?${rossQuery(data.thresholds, data.requireExtendedRising)}${force ? "&fresh=1" : ""}`;
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const j = (await r.json()) as RossResult;
        if (Array.isArray(j?.rows)) {
          setData(j);
          setNewsFetchAt(new Date().toISOString());
        }
      } catch {
        // keep last good result
      } finally {
        newsInFlight.current = false;
      }
    },
    [data.thresholds, apiPath],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (intervalSec <= 0) return;
    const id = setInterval(refresh, intervalSec * 1000);
    return () => clearInterval(id);
  }, [intervalSec, refresh]);

  // Auto-refresh news on its own (slower) cadence while live updates are on.
  useEffect(() => {
    if (intervalSec <= 0) return;
    const id = setInterval(refreshNews, NEWS_REFRESH_MS);
    return () => clearInterval(id);
  }, [intervalSec, refreshNews]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 1_000_000), 1000);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo(() => {
    let r = data.rows;
    if (filter === "green") r = r.filter((x) => x.allAutomatedMet);
    else if (filter === "strong") r = r.filter((x) => x.strongMomentum);
    else if (filter === "rising") r = r.filter((x) => x.extendedRising);
    return r;
  }, [data.rows, filter]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-1">
          {(["all", "green", "strong", "rising"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`text-xs px-2.5 py-1 rounded-full border transition ${
                filter === f
                  ? "bg-emerald-600 text-white border-emerald-700"
                  : "bg-surface-2 hover:bg-surface-3 border-line"
              }`}
            >
              {f === "all"
                ? "All movers"
                : f === "green"
                ? "✅ All pillars (green)"
                : f === "strong"
                ? "🔥 Strong momentum"
                : "📈 Rising AH/PM"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="text-xs subtle">Refresh:</label>
          <select
            value={intervalSec}
            onChange={(e) => setIntervalSec(Number(e.target.value))}
            className="text-xs bg-surface-2 border border-line rounded-md px-2 py-1"
            title="How often to refresh live prices"
          >
            {INTERVAL_OPTIONS.map((o) => (
              <option key={o.sec} value={o.sec}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => {
              refresh();
              refreshNews(true);
            }}
            disabled={fetching}
            className="text-xs px-2 py-1 rounded-md border border-line bg-surface-2 hover:bg-surface-3 disabled:opacity-50 inline-flex items-center gap-1"
            title="Force a live scan now — bypasses the server cache"
          >
            <RefreshCw className={`w-3 h-3 ${fetching ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">{mounted && lastFetchAt ? `Updated ${fmtAgo(lastFetchAt)}` : "Refresh"}</span>
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full text-xs">
          <thead className="bg-surface-2 text-ink/80">
            <tr>
              <th className="text-left px-2 py-2 w-6"></th>
              <th className="text-left px-2 py-2">Ticker</th>
              <th className="text-left px-2 py-2 hidden md:table-cell">Name</th>
              <th className="text-right px-2 py-2">Price</th>
              <th className="text-right px-2 py-2">Change</th>
              <th className="text-right px-2 py-2 hidden lg:table-cell">Ext. hrs</th>
              <th className="text-right px-2 py-2">RVol</th>
              <th className="text-right px-2 py-2 hidden sm:table-cell">Float</th>
              <th className="text-center px-2 py-2 hidden md:table-cell">First seen</th>
              <th className="text-center px-2 py-2">Pillars</th>
              <th className="text-center px-2 py-2">News</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-2 py-8 text-center subtle">
                  No movers meet these criteria right now. Try widening the max price or lowering RVol / change %.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <Row
                key={row.ticker}
                row={row}
                quote={quotes[row.ticker]}
                thresholds={data.thresholds}
                isOpen={open[row.ticker] ?? false}
                onToggle={() => setOpen((s) => ({ ...s, [row.ticker]: !s[row.ticker] }))}
              />
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] subtle mt-2">
        <span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500/20 border border-emerald-500/50 align-middle mr-1" />
        Green rows meet all automated pillars — verify the news catalyst before trading. Click a row for the pillar + news breakdown.
        {mounted && <span className="ml-1">Universe scanned {fmtAgo(data.asOf) || "just now"}.</span>}
        {mounted && intervalSec > 0 && (
          <span className="ml-1">
            Auto re-scans every {Math.round(NEWS_REFRESH_MS / 1000)}s
            {newsFetchAt ? ` — last re-scan ${fmtAgo(newsFetchAt)}` : ""}. Hit Refresh to force a live scan now.
          </span>
        )}
      </p>
    </div>
  );
}

function Row({
  row,
  quote,
  thresholds,
  isOpen,
  onToggle,
}: {
  row: RossRow;
  quote?: LiveQuote;
  thresholds: RossThresholds;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const price = quote?.price ?? row.candidate.price ?? null;
  const changePct = quote?.changePct ?? row.candidate.changePct ?? null;
  const changeColor =
    changePct == null ? "text-ink/60" : changePct > 0 ? "text-emerald-500" : changePct < 0 ? "text-red-500" : "text-ink/60";

  // Recompute the price/change-dependent pillar status from the LIVE quote so
  // the green background + 🔥 flame stay honest as prices move intraday. RVol and
  // float have no live feed here, so reuse the server pillar verdicts for those.
  const rvolPass = row.pillars.find((p) => p.key === "rvol")?.status === "pass";
  const floatOk = row.pillars.find((p) => p.key === "float")?.status !== "fail";
  const priceOk = price != null && price >= thresholds.minPrice && price <= thresholds.maxPrice;
  const changeOk = changePct != null && changePct >= thresholds.minChangePct;
  const greenLive = priceOk && changeOk && rvolPass && floatOk;
  const strongLive = changePct != null && changePct >= thresholds.strongMomentumPct;

  const greenBg = greenLive
    ? "bg-emerald-500/10 hover:bg-emerald-500/15"
    : "hover:bg-surface-2/60";

  return (
    <>
      <tr className={`border-t border-line cursor-pointer ${greenBg}`} onClick={onToggle}>
        <td className="px-2 py-2 align-middle">
          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </td>
        <td className="px-2 py-2 font-mono font-semibold text-ink">
          <div className="flex items-center gap-1">
            <a
              href={row.chartUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={`Open ${row.tradingViewSymbol} chart on TradingView`}
              className="inline-flex items-center gap-1 hover:text-emerald-600 hover:underline"
            >
              <span>{row.ticker}</span>
              <LineChart className="w-3 h-3 opacity-60" />
            </a>
            {strongLive && (
              <span title="Strong momentum (≥ strong-momentum %) — likely news-driven">
                <Flame className="w-3.5 h-3.5 text-orange-500" />
              </span>
            )}
            {row.extendedRising && (
              <span title={`Rising ${row.extendedSession === "premarket" ? "pre-market" : "after-hours"}`}>
                <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              </span>
            )}
            {row.floatUnknown && (
              <span
                title="Float data unavailable — verify on Finviz (Pillar 5)"
                className="text-[9px] uppercase tracking-wide px-1 py-px rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 font-sans"
              >
                float?
              </span>
            )}
          </div>
        </td>
        <td className="px-2 py-2 hidden md:table-cell max-w-[220px] truncate">{row.name}</td>
        <td className="px-2 py-2 text-right font-mono tabular-nums">{fmtPrice(price)}</td>
        <td className={`px-2 py-2 text-right font-mono tabular-nums ${changeColor}`}>{fmtChangePct(changePct)}</td>
        <td className="px-2 py-2 text-right font-mono tabular-nums hidden lg:table-cell">
          <ExtHrsCell pct={row.extendedChangePct} session={row.extendedSession} />
        </td>
        <td className="px-2 py-2 text-right font-mono tabular-nums">{fmtRvol(row.candidate.relativeVolume)}</td>
        <td className="px-2 py-2 text-right font-mono tabular-nums hidden sm:table-cell">
          {fmtShares(row.candidate.floatShares)}
        </td>
        <td className="px-2 py-2 text-center hidden md:table-cell whitespace-nowrap">
          {row.firstSeenAt ? (
            <span className="subtle" title={`First qualified today at ${fmtEtTime(row.firstSeenAt)} ET`}>
              {fmtEtTime(row.firstSeenAt)}
            </span>
          ) : (
            <span className="subtle">—</span>
          )}
        </td>
        <td className="px-2 py-2">
          <div className="flex items-center justify-center gap-1">{row.pillars.map(pillarDot)}</div>
        </td>
        <td className="px-2 py-2 text-center">
          {row.news.length > 0 ? (
            <Badge variant="success">{row.news.length}</Badge>
          ) : (
            <span className="subtle">—</span>
          )}
        </td>
      </tr>
      {isOpen && (
        <tr className="border-t border-line bg-surface-2/30">
          <td colSpan={11} className="px-3 py-3">
            <HistoryLine row={row} />
            <PillarBreakdown row={row} />
          </td>
        </tr>
      )}
    </>
  );
}

/** Per-ticker screener-history summary shown at the top of the expanded row. */
function HistoryLine({ row }: { row: RossRow }) {
  if (!row.firstSeenAt) return null;
  const peakChg = row.peakChangePct;
  const peakExt = row.peakExtendedPct;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border border-line bg-surface-2/40 px-3 py-2 text-[11px]">
      <span className="text-ink/80">
        <span className="subtle">First seen today:</span>{" "}
        <span className="font-mono font-semibold">{fmtEtTime(row.firstSeenAt)} ET</span>
        <span className="subtle"> ({fmtAgo(row.firstSeenAt)})</span>
      </span>
      {row.seenCount != null && (
        <span className="text-ink/80">
          <span className="subtle">Scans held:</span>{" "}
          <span className="font-mono font-semibold">{row.seenCount}</span>
        </span>
      )}
      {peakChg != null && (
        <span className="text-ink/80">
          <span className="subtle">Peak day change:</span>{" "}
          <span className="font-mono font-semibold text-emerald-500">
            {peakChg > 0 ? "+" : ""}
            {peakChg.toFixed(1)}%
          </span>
        </span>
      )}
      {peakExt != null && (
        <span className="text-ink/80">
          <span className="subtle">Peak AH/PM:</span>{" "}
          <span className={`font-mono font-semibold ${peakExt > 0 ? "text-emerald-500" : "text-red-500"}`}>
            {peakExt > 0 ? "+" : ""}
            {peakExt.toFixed(1)}%
          </span>
        </span>
      )}
    </div>
  );
}
