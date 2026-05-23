"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { GateBreakdown } from "./GateBreakdown";
import type { ScreenerResult, ScreenerRow } from "@/lib/screener/types";
import type { ThemeTag } from "@/config/screener-themes";

type Filter = "all" | "passed" | "core" | "emerging" | "venture";

type LiveQuote = { price: number; changePct: number; asOf: string };

const TAG_BADGE: Record<ThemeTag, "info" | "warn" | "danger"> = {
  core: "info",
  emerging: "warn",
  venture: "danger",
};

const INTERVAL_OPTIONS: { label: string; sec: number }[] = [
  { label: "30s", sec: 30 },
  { label: "1m", sec: 60 },
  { label: "5m", sec: 300 },
  { label: "Off", sec: 0 },
];

function gatePill(passed: boolean, label: string) {
  return (
    <Badge variant={passed ? "success" : "default"}>{label}</Badge>
  );
}

function fmtTrancheSplit(tag: ThemeTag): string {
  return tag === "core" ? "50/25/25" : tag === "emerging" ? "40/30/30" : "33/33/33";
}

function fmtPrice(n: number | null | undefined): string {
  if (n == null || !isFinite(n) || n <= 0) return "—";
  return n >= 1000
    ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
    : n.toFixed(2);
}

function fmtChangePct(p: number | null | undefined): string {
  if (p == null || !isFinite(p)) return "";
  const sign = p > 0 ? "+" : "";
  return `${sign}${p.toFixed(2)}%`;
}

function fmtAgo(iso: string | null): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function ScreenerTable({ result }: { result: ScreenerResult }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [theme, setTheme] = useState<string>("all");
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const [intervalSec, setIntervalSec] = useState<number>(60);
  const [quotes, setQuotes] = useState<Record<string, LiveQuote>>({});
  const [lastFetchAt, setLastFetchAt] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [tick, setTick] = useState(0);

  const allTickers = useMemo(
    () => Array.from(new Set(result.rows.map((r) => r.ticker))),
    [result.rows]
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
        // swallow — keep last good values
      } finally {
        inFlight.current = false;
        setFetching(false);
      }
    },
    [allTickers]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (intervalSec <= 0) return;
    const id = setInterval(refresh, intervalSec * 1000);
    return () => clearInterval(id);
  }, [intervalSec, refresh]);

  // Re-render the "Updated Xs ago" label once per second.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 1_000_000), 1000);
    return () => clearInterval(id);
  }, []);
  void tick;

  const rows = useMemo(() => {
    let r = result.rows;
    if (filter === "passed") r = r.filter((x) => x.passedAll);
    else if (filter !== "all") r = r.filter((x) => x.tag === filter);
    if (theme !== "all") r = r.filter((x) => x.primaryTheme === theme || x.secondaryThemes.includes(theme as any));
    return r;
  }, [result.rows, filter, theme]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-1">
          {(["all", "passed", "core", "emerging", "venture"] as Filter[]).map((f) => (
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
              {f === "passed" ? "Pass all 3 gates" : f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <label className="text-xs subtle">Theme:</label>
          <select
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            className="text-xs bg-surface-2 border border-line rounded-md px-2 py-1"
          >
            <option value="all">All themes</option>
            {result.themes.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
          <span className="text-[11px] subtle hidden sm:inline">·</span>
          <label className="text-xs subtle">Refresh:</label>
          <select
            value={intervalSec}
            onChange={(e) => setIntervalSec(Number(e.target.value))}
            className="text-xs bg-surface-2 border border-line rounded-md px-2 py-1"
            title="How often to refresh live prices"
          >
            {INTERVAL_OPTIONS.map((o) => (
              <option key={o.sec} value={o.sec}>{o.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={refresh}
            disabled={fetching}
            className="text-xs px-2 py-1 rounded-md border border-line bg-surface-2 hover:bg-surface-3 disabled:opacity-50 inline-flex items-center gap-1"
            title="Refresh prices now"
          >
            <RefreshCw className={`w-3 h-3 ${fetching ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">{lastFetchAt ? `Updated ${fmtAgo(lastFetchAt)}` : "Refresh"}</span>
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
              <th className="text-left px-2 py-2">Theme</th>
              <th className="text-left px-2 py-2">Tag</th>
              <th className="text-center px-2 py-2">G1 Fund</th>
              <th className="text-center px-2 py-2">G2 Moat</th>
              <th className="text-center px-2 py-2">G3 Trend</th>
              <th className="text-right px-2 py-2">Confidence</th>
              <th className="text-left px-2 py-2 hidden lg:table-cell">Tranches</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={11} className="px-2 py-6 text-center subtle">
                  No tickers match this filter.
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const isOpen = open[row.ticker] ?? false;
              return (
                <Row
                  key={row.ticker}
                  row={row}
                  quote={quotes[row.ticker]}
                  isOpen={isOpen}
                  onToggle={() => setOpen((s) => ({ ...s, [row.ticker]: !s[row.ticker] }))}
                />
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] subtle mt-2">
        Click any row to see the per-gate breakdown and confidence components. Prices refresh automatically; gate scores recompute every 5 min.
      </p>
    </div>
  );
}

function Row({
  row,
  quote,
  isOpen,
  onToggle,
}: {
  row: ScreenerRow;
  quote?: LiveQuote;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const price = quote?.price ?? row.trend?.price ?? null;
  const changePct = quote?.changePct ?? null;
  const changeColor =
    changePct == null
      ? "text-ink/60"
      : changePct > 0
      ? "text-emerald-500"
      : changePct < 0
      ? "text-red-500"
      : "text-ink/60";
  return (
    <>
      <tr
        className="border-t border-line hover:bg-surface-2/60 cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-2 py-2 align-middle">
          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </td>
        <td className="px-2 py-2 font-mono font-semibold text-ink">{row.ticker}</td>
        <td className="px-2 py-2 hidden md:table-cell">{row.name}</td>
        <td className="px-2 py-2 text-right font-mono tabular-nums">
          <div>{fmtPrice(price)}</div>
          {changePct != null && (
            <div className={`text-[10px] ${changeColor}`}>{fmtChangePct(changePct)}</div>
          )}
        </td>
        <td className="px-2 py-2">
          <div className="text-ink/90">{row.primaryThemeLabel}</div>
          {row.secondaryThemes.length > 0 && (
            <div className="text-[10px] subtle">+ {row.secondaryThemes.length} more</div>
          )}
        </td>
        <td className="px-2 py-2">
          <Badge variant={TAG_BADGE[row.tag]}>{row.tag}</Badge>
        </td>
        <td className="px-2 py-2 text-center">{gatePill(row.gate1.passed, row.gate1.score.toFixed(0))}</td>
        <td className="px-2 py-2 text-center">{gatePill(row.gate2.passed, row.gate2.score.toFixed(0))}</td>
        <td className="px-2 py-2 text-center">{gatePill(row.gate3.passed, row.gate3.score.toFixed(0))}</td>
        <td className="px-2 py-2 text-right">
          <ConfidenceBadge score={row.confidence} />
        </td>
        <td className="px-2 py-2 hidden lg:table-cell font-mono text-[11px]">
          {fmtTrancheSplit(row.tag)}
        </td>
      </tr>
      {isOpen && (
        <tr className="border-t border-line bg-surface-2/30">
          <td colSpan={11} className="px-3 py-3">
            <GateBreakdown row={row} />
          </td>
        </tr>
      )}
    </>
  );
}
