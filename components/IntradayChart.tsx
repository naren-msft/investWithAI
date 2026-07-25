"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine,
  Bar, Cell, Line,
} from "recharts";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Activity, TrendingUp, TrendingDown } from "lucide-react";
import { rsiSeries, macdSeries, computeVerdict, type Verdict } from "@/lib/indicators";

interface Candle {
  ts: number; open: number; high: number; low: number; close: number; volume: number;
}
interface IntradayPayload {
  ticker: string;
  interval: string;
  range: string;
  asOf: string;
  previousClose: number | null;
  last: { ts: number; close: number; volume: number } | null;
  sessions?: { date: string; ts: number; close: number }[];
  candles: Candle[];
}

// =============================================================================
// SPY 1-min candle chart for the FOMC dashboard.
//
// Recharts doesn't have a native candlestick. We synthesize one via two Bar
// series stacked at the same x-position:
//   1. an "openClose" bar covering the body (open→close)
//   2. a "wick" bar covering high→low rendered narrow behind the body
// Each bar gets a Cell with red/green fill driven by close vs open.
//
// Auto-refreshes every 60s independently of the page-level AutoRefresh so the
// chart stays live even if the user pauses the global refresh. Polls
// `/api/fomc/intraday?ticker=SPY&interval=1m&range=1d`.
// =============================================================================
const REFRESH_MS = 60_000;

interface Props {
  ticker?: string;
  interval?: "1m" | "2m" | "5m" | "15m" | "30m" | "60m";
  range?: "1d" | "5d" | "6d";
}

export function IntradayChart({ ticker = "SPY", interval = "1m", range = "1d" }: Props) {
  const [data, setData] = useState<IntradayPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const hasData = data !== null && data.candles.length > 0;
  const isMultiDay = range !== "1d";

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        const r = await fetch(`/api/fomc/intraday?ticker=${ticker}&interval=${interval}&range=${range}`);
        const j = await r.json();
        if (!alive) return;
        if (j.error) setErr(j.error);
        else { setErr(null); setData(j); }
      } catch (e: any) {
        if (alive) setErr(String(e?.message ?? e));
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(id); };
  }, [ticker, interval, range]);

  // Transform candles → recharts-friendly rows where openClose carries the
  // body extent as [open, close] (low→high tuple). Recharts Bar with array
  // domain renders a floating-bar segment, which we color by direction.
  const rows = useMemo(() => {
    if (!data) return [] as any[];
    const closes = data.candles.map((c) => c.close);
    const r  = rsiSeries(closes, 14);
    const mz = macdSeries(closes, 12, 26, 9);
    return data.candles.map((c, i) => {
      const up = c.close >= c.open;
      const d = new Date(c.ts);
      const time = isMultiDay
        ? d.toLocaleString([], { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
        : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
      const rsiV = Number.isNaN(r[i]) ? null : r[i];
      const macdV   = Number.isNaN(mz.macd[i])   ? null : mz.macd[i];
      const signalV = Number.isNaN(mz.signal[i]) ? null : mz.signal[i];
      const histV   = Number.isNaN(mz.hist[i])   ? null : mz.hist[i];
      return {
        ts: c.ts,
        time,
        body:   [c.open, c.close] as [number, number],
        wick:   [c.low,  c.high]  as [number, number],
        close:  c.close,
        open:   c.open,
        high:   c.high,
        low:    c.low,
        volume: c.volume,
        up,
        rsi:    rsiV,
        macd:   macdV,
        signal: signalV,
        hist:   histV,
      };
    });
  }, [data, isMultiDay]);

  // Buy / Hold / Sell verdict computed from the trailing closes.
  const verdict = useMemo(() => {
    if (!data || data.candles.length < 35) return null;
    return computeVerdict(data.candles.map((c) => c.close));
  }, [data]);

  const pc = data?.previousClose ?? null;
  const last = data?.last ?? null;
  const chgVsPc = last && pc ? (last.close - pc) / pc : 0;
  const chgUsd  = last && pc ? last.close - pc : 0;
  const isUp    = chgVsPc >= 0;

  // Session-open dividers (skip the very first session — no divider needed
  // before the chart starts). For each subsequent session, find the row whose
  // ts matches the session's first candle and use its categorical `time` key
  // as the ReferenceLine x value.
  const sessionDividers = useMemo(() => {
    if (!data?.sessions || data.sessions.length < 2 || rows.length === 0) return [] as { x: string; date: string }[];
    const out: { x: string; date: string }[] = [];
    for (let i = 1; i < data.sessions.length; i++) {
      const s = data.sessions[i];
      const row = rows.find((r: any) => r.ts === s.ts);
      if (row) out.push({ x: row.time, date: s.date.slice(5) }); // "MM-DD"
    }
    return out;
  }, [data, rows]);
  const yDomain = useMemo<[number, number] | undefined>(() => {
    if (rows.length === 0) return undefined;
    let lo = Infinity, hi = -Infinity;
    for (const r of rows) { if (r.low < lo) lo = r.low; if (r.high > hi) hi = r.high; }
    if (pc != null) { if (pc < lo) lo = pc; if (pc > hi) hi = pc; }
    const pad = (hi - lo) * 0.05 || hi * 0.005;
    return [lo - pad, hi + pad];
  }, [rows, pc]);

  return (
    <Card>
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-500" />
            S&amp;P 500 · live intraday (1-min candles)
          </span>
        }
        subtitle={
          isMultiDay
            ? `${ticker} · ${interval} candles · last 5 sessions + today · auto-refreshes every 60s independent of page refresh`
            : `${ticker} · ${interval} candles · auto-refreshes every 60s independent of page refresh`
        }
        right={
          last && pc ? (
            <span className={`inline-flex items-center gap-1.5 text-xs font-mono ${isUp ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
              {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              ${last.close.toFixed(2)}
              <Badge variant={isUp ? "success" : "danger"}>
                {chgUsd >= 0 ? "+" : ""}{chgUsd.toFixed(2)} ({chgVsPc >= 0 ? "+" : ""}{(chgVsPc * 100).toFixed(2)}%)
              </Badge>
            </span>
          ) : (
            <Badge variant="info">{loading ? "loading…" : "—"}</Badge>
          )
        }
      />

      {err && <div className="text-[11px] text-red-700 dark:text-red-300 mb-2">{err}</div>}

      {!hasData ? (
        <div className="h-[260px] grid place-items-center subtle text-sm">
          {loading ? "Fetching live SPY candles…" : "No intraday data — market may be closed (weekend / pre-open)."}
        </div>
      ) : (
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 10, left: 0, bottom: 0 }} barCategoryGap={1}>
              <CartesianGrid stroke="rgb(var(--line) / 0.4)" />
              <XAxis
                dataKey="time"
                stroke="rgb(var(--ink-muted))"
                fontSize={10}
                minTickGap={50}
              />
              <YAxis
                domain={yDomain ?? ["auto", "auto"]}
                stroke="rgb(var(--ink-muted))"
                fontSize={10}
                width={62}
                tickFormatter={(v) => `$${Number(v).toFixed(2)}`}
              />
              <Tooltip
                contentStyle={{ background: "rgb(var(--surface-1))", border: "1px solid rgb(var(--line))", borderRadius: 8, color: "rgb(var(--ink))", fontSize: 11 }}
                labelStyle={{ color: "rgb(var(--ink))" }}
                formatter={(_v: any, _k: any, p: any) => {
                  const r = p?.payload;
                  if (!r) return ["", ""];
                  return [
                    `O ${r.open.toFixed(2)}  H ${r.high.toFixed(2)}  L ${r.low.toFixed(2)}  C ${r.close.toFixed(2)}`,
                    r.time,
                  ];
                }}
              />
              {pc != null && (
                <ReferenceLine
                  y={pc}
                  stroke="rgb(var(--ink-muted))"
                  strokeDasharray="4 3"
                  label={{ value: `PC $${pc.toFixed(2)}`, position: "right", fill: "rgb(var(--ink-muted))", fontSize: 10 }}
                />
              )}
              {sessionDividers.map((d) => (
                <ReferenceLine
                  key={d.x}
                  x={d.x}
                  stroke="rgb(var(--ink-muted) / 0.6)"
                  strokeDasharray="2 2"
                  label={{ value: d.date, position: "insideTopLeft", fill: "rgb(var(--ink-muted))", fontSize: 9 }}
                />
              ))}
              {/* Wick — thin floating bar from low→high */}
              <Bar dataKey="wick" barSize={1.5} isAnimationActive={false}>
                {rows.map((r, i) => (
                  <Cell key={i} fill={r.up ? "#16a34a" : "#dc2626"} />
                ))}
              </Bar>
              {/* Body — wider floating bar from open→close */}
              <Bar dataKey="body" barSize={4} isAnimationActive={false}>
                {rows.map((r, i) => (
                  <Cell key={i} fill={r.up ? "#22c55e" : "#ef4444"} />
                ))}
              </Bar>
              {/* Subtle close-price line for the trend overlay */}
              <Line type="monotone" dataKey="close" stroke="rgb(var(--ink) / 0.35)" strokeWidth={1} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ---------- MACD sub-panel ---------- */}
      {hasData && (
        <div className="h-[110px] mt-3">
          <div className="text-[10px] subtle mb-0.5 px-1">MACD (12, 26, 9)</div>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 2, right: 10, left: 0, bottom: 0 }} barCategoryGap={1}>
              <CartesianGrid stroke="rgb(var(--line) / 0.4)" />
              <XAxis dataKey="time" hide />
              <YAxis stroke="rgb(var(--ink-muted))" fontSize={9} width={62} tickFormatter={(v) => Number(v).toFixed(2)} />
              <Tooltip
                contentStyle={{ background: "rgb(var(--surface-1))", border: "1px solid rgb(var(--line))", borderRadius: 8, color: "rgb(var(--ink))", fontSize: 11 }}
                formatter={(_v: any, _k: any, p: any) => {
                  const r = p?.payload;
                  if (!r || r.macd == null) return ["", ""];
                  return [
                    `MACD ${r.macd.toFixed(3)}  Signal ${r.signal?.toFixed(3) ?? "—"}  Hist ${r.hist?.toFixed(3) ?? "—"}`,
                    r.time,
                  ];
                }}
              />
              <ReferenceLine y={0} stroke="rgb(var(--ink-muted))" />
              <Bar dataKey="hist" barSize={2} isAnimationActive={false}>
                {rows.map((r, i) => (
                  <Cell key={i} fill={r.hist == null ? "transparent" : r.hist >= 0 ? "#22c55e" : "#ef4444"} />
                ))}
              </Bar>
              <Line type="monotone" dataKey="macd"   stroke="#3b82f6" strokeWidth={1.4} dot={false} isAnimationActive={false} connectNulls />
              <Line type="monotone" dataKey="signal" stroke="#f59e0b" strokeWidth={1.4} dot={false} isAnimationActive={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ---------- RSI sub-panel ---------- */}
      {hasData && (
        <div className="h-[100px] mt-3">
          <div className="text-[10px] subtle mb-0.5 px-1">RSI (14)</div>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 2, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid stroke="rgb(var(--line) / 0.4)" />
              <XAxis dataKey="time" stroke="rgb(var(--ink-muted))" fontSize={9} minTickGap={60} />
              <YAxis domain={[0, 100]} ticks={[30, 50, 70]} stroke="rgb(var(--ink-muted))" fontSize={9} width={62} />
              <Tooltip
                contentStyle={{ background: "rgb(var(--surface-1))", border: "1px solid rgb(var(--line))", borderRadius: 8, color: "rgb(var(--ink))", fontSize: 11 }}
                formatter={(_v: any, _k: any, p: any) => {
                  const r = p?.payload;
                  if (!r || r.rsi == null) return ["", ""];
                  return [`RSI ${r.rsi.toFixed(1)}`, r.time];
                }}
              />
              <ReferenceLine y={70} stroke="#dc2626" strokeDasharray="3 3" label={{ value: "70", fill: "#dc2626", fontSize: 9, position: "right" }} />
              <ReferenceLine y={30} stroke="#16a34a" strokeDasharray="3 3" label={{ value: "30", fill: "#16a34a", fontSize: 9, position: "right" }} />
              <ReferenceLine y={50} stroke="rgb(var(--ink-muted))" strokeDasharray="1 4" />
              <Line type="monotone" dataKey="rsi" stroke="#a855f7" strokeWidth={1.6} dot={false} isAnimationActive={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ---------- Verdict footer ---------- */}
      {verdict && (
        <div className="mt-3 rounded-lg border border-line bg-surface-2 p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[11px] uppercase tracking-wide subtle">Signal verdict (MACD + RSI)</span>
            <Badge variant={verdict.verdict === "BUY" ? "success" : verdict.verdict === "SELL" ? "danger" : "warn"}>
              {verdict.verdict}
            </Badge>
            <span className="text-[10px] subtle">score {verdict.score >= 0 ? "+" : ""}{verdict.score}</span>
          </div>
          <ul className="text-[11px] leading-snug list-disc pl-4 text-ink/85">
            {verdict.reasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
          <p className="text-[10px] subtle mt-2 leading-snug">
            Heuristic for informational use only — not financial advice.
            <b> BUY</b> = fresh bullish MACD cross or strong upside momentum confirmed by RSI.
            <b> SELL</b> = fresh bearish MACD cross or RSI overbought + waning momentum.
            <b> HOLD</b> = mixed / consolidating signals.
          </p>
        </div>
      )}

      <p className="text-[10px] subtle mt-2 leading-snug">
        Green = close ≥ open · Red = close &lt; open · Dashed line = previous close.
        Data source: Yahoo Finance (cached server-side for 45s, polled client-side every 60s).
      </p>
    </Card>
  );
}
