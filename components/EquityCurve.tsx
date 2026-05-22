"use client";

import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { fmtUsd } from "@/lib/format";
import { LineChart as LineIcon, TrendingUp } from "lucide-react";

interface Point {
  date: string;
  costBasis: number;
  marketValue: number;
  gain: number;
  gainPct: number;
  spyBenchmark: number;
  spyGainPct: number;
}

interface RiskMetrics {
  annualVol: number;
  maxDrawdown: number;
  maxDrawdownStart: string;
  maxDrawdownEnd: string;
  sharpe: number;
  sortino: number;
  beta: number;
  calmar: number;
  portfolioReturn: number;
  spyReturn: number;
  alphaVsSpy: number;
  daysTracked: number;
}

export function EquityCurve({ refreshTick }: { refreshTick?: number }) {
  const [points, setPoints] = useState<Point[]>([]);
  const [metrics, setMetrics] = useState<RiskMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch("/api/equity-curve")
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.error) { setErr(j.error); setPoints([]); setMetrics(null); }
        else { setPoints(j.points ?? []); setMetrics(j.metrics ?? null); }
      })
      .catch((e) => alive && setErr(String(e)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [refreshTick]);

  const summary = useMemo(() => {
    if (points.length === 0) return null;
    const last = points[points.length - 1];
    return {
      latestMV: last.marketValue,
      latestCB: last.costBasis,
      latestSpy: last.spyBenchmark,
      gain: last.gain,
      gainPct: last.gainPct,
      spyGain: last.spyBenchmark - last.costBasis,
      spyGainPct: last.spyGainPct,
      days: points.length,
    };
  }, [points]);

  return (
    <Card>
      <CardHeader helpSection="equity-curve"
        title="Portfolio growth vs SPY"
        subtitle="Green = your portfolio. Orange dashed = if you'd bought SPY with the same $ on the same dates. Blue dashed = cost basis."
        right={
          summary ? (
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="info">{summary.days} day{summary.days === 1 ? "" : "s"}</Badge>
              <Badge variant={summary.gain >= 0 ? "success" : "danger"}>
                You {summary.gain >= 0 ? "+" : ""}{fmtUsd(summary.gain)} ({(summary.gainPct * 100).toFixed(2)}%)
              </Badge>
              <Badge variant={summary.gain >= summary.spyGain ? "success" : "warn"}>
                SPY {summary.spyGain >= 0 ? "+" : ""}{fmtUsd(summary.spyGain)} ({(summary.spyGainPct * 100).toFixed(2)}%)
              </Badge>
            </div>
          ) : null
        }
      />

      {err && <div className="text-sm text-red-700 dark:text-red-300 mb-2">{err}</div>}
      {loading ? (
        <div className="h-[300px] grid place-items-center subtle text-sm">
          <span className="inline-flex items-center gap-2"><LineIcon className="w-4 h-4 animate-pulse" /> Computing curve…</span>
        </div>
      ) : points.length === 0 ? (
        <div className="h-[160px] grid place-items-center text-sm subtle">
          <div className="text-center">
            <TrendingUp className="w-6 h-6 mx-auto mb-2 opacity-60" />
            Log your first execution below — the chart will start tracking your portfolio growth vs SPY from that date forward.
          </div>
        </div>
      ) : (
        <>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={points} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gainGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"  stopColor="#22c55e" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgb(var(--line) / 0.5)" />
                <XAxis dataKey="date" stroke="rgb(var(--ink-muted))" fontSize={11} minTickGap={40} />
                <YAxis
                  domain={["auto", "auto"]}
                  stroke="rgb(var(--ink-muted))"
                  fontSize={11}
                  width={70}
                  tickFormatter={(v) => `$${Math.round(Number(v) / 1000)}k`}
                />
                <Tooltip
                  contentStyle={{ background: "rgb(var(--surface-1))", border: "1px solid rgb(var(--line))", borderRadius: 10, color: "rgb(var(--ink))" }}
                  itemStyle={{ color: "rgb(var(--ink))" }}
                  labelStyle={{ color: "rgb(var(--ink))" }}
                  formatter={(v: any, k: any) => [fmtUsd(Number(v)), label(k)]}
                />
                <Area  type="monotone" dataKey="marketValue"  stroke="#22c55e" strokeWidth={2}   fill="url(#gainGrad)" />
                <Line  type="monotone" dataKey="spyBenchmark" stroke="#f59e0b" strokeWidth={1.6} dot={false} strokeDasharray="6 3" />
                <Line  type="monotone" dataKey="costBasis"    stroke="#60a5fa" strokeWidth={1.4} dot={false} strokeDasharray="4 3" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 text-[10px] subtle flex items-center gap-4 flex-wrap">
            <span className="inline-flex items-center gap-1"><span className="w-3 h-1 rounded-sm bg-[#22c55e]" /> Your portfolio</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-0.5 bg-[#f59e0b]" style={{ borderTop: "2px dashed #f59e0b" }} /> SPY benchmark (same $, same dates)</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-0.5" style={{ borderTop: "2px dashed #60a5fa" }} /> Cost basis</span>
          </div>

          {metrics && (
            <div className="mt-4 rounded-xl border border-line bg-surface-2 p-3">
              <div className="flex items-center justify-between mb-3">
                <div className="font-semibold text-sm">Risk-adjusted performance</div>
                <Badge variant={metrics.alphaVsSpy >= 0 ? "success" : "danger"}>
                  α vs SPY {metrics.alphaVsSpy >= 0 ? "+" : ""}{(metrics.alphaVsSpy * 100).toFixed(2)}%/yr
                </Badge>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                <Cell label="Annualized return" value={`${(metrics.portfolioReturn * 100).toFixed(1)}%`} tone={metrics.portfolioReturn >= 0 ? "gain" : "loss"} />
                <Cell label="SPY return (same period)" value={`${(metrics.spyReturn * 100).toFixed(1)}%`} />
                <Cell label="Volatility (ann)" value={`${(metrics.annualVol * 100).toFixed(1)}%`} />
                <Cell label="Beta vs SPY" value={metrics.beta.toFixed(2)} />
                <Cell label="Sharpe ratio" value={metrics.sharpe.toFixed(2)} tone={metrics.sharpe >= 1 ? "gain" : metrics.sharpe < 0 ? "loss" : undefined} />
                <Cell label="Sortino ratio" value={metrics.sortino.toFixed(2)} tone={metrics.sortino >= 1 ? "gain" : metrics.sortino < 0 ? "loss" : undefined} />
                <Cell label="Max drawdown" value={`${(metrics.maxDrawdown * 100).toFixed(1)}%`} tone="loss" />
                <Cell label="Calmar ratio" value={metrics.calmar.toFixed(2)} />
              </div>
              <div className="mt-2 text-[10px] subtle">
                Risk-free rate 5.25% (3-mo T-bill). Sharpe &gt;1 = good. Beta &gt;1 = amplifies SPY moves. Max DD from {metrics.maxDrawdownStart} to {metrics.maxDrawdownEnd}.
              </div>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function label(key: string) {
  if (key === "marketValue") return "Your portfolio";
  if (key === "costBasis") return "Cost basis";
  if (key === "spyBenchmark") return "SPY benchmark";
  return key;
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: "gain" | "loss" }) {
  const cls = tone === "gain" ? "text-emerald-700 dark:text-emerald-300"
            : tone === "loss" ? "text-red-700 dark:text-red-300" : "";
  return (
    <div className="rounded-lg bg-surface-1 border border-line px-3 py-2">
      <div className="subtle text-[10px] uppercase tracking-wider">{label}</div>
      <div className={`mt-1 font-mono ${cls}`}>{value}</div>
    </div>
  );
}
