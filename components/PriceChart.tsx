"use client";
import { useEffect, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface Point { date: string; close: number; rsi: number | null }

export function PriceChart({ tickers }: { tickers: string[] }) {
  const [symbol, setSymbol] = useState(tickers[0] ?? "FELC");
  const [data, setData] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    fetch(`/api/history?symbol=${encodeURIComponent(symbol)}&months=6`)
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j.error) { setErr(j.error); setData([]); }
        else setData(j.data ?? []);
      })
      .catch((e) => alive && setErr(String(e)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [symbol]);

  return (
    <Card>
      <CardHeader
        title="Price & RSI"
        subtitle="6-month daily close + RSI-14. Switch tickers to inspect signals."
        right={
          <select
            className="bg-surface-2 border border-line rounded-md text-sm px-2 py-1"
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
          >
            {tickers.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        }
      />
      {err && <Badge variant="danger">Error: {err}</Badge>}
      <div className="h-[200px] mt-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgb(var(--line) / 0.5)" />
            <XAxis dataKey="date" hide />
            <YAxis domain={["auto", "auto"]} stroke="rgb(var(--ink-muted))" fontSize={11} width={50} />
            <Tooltip
              contentStyle={{
                background: "rgb(var(--surface-1))",
                border: "1px solid rgb(var(--line))",
                borderRadius: 10,
                color: "rgb(var(--ink))",
              }}
              itemStyle={{ color: "rgb(var(--ink))" }}
              labelStyle={{ color: "rgb(var(--ink))" }}
              labelFormatter={(d) => d as string}
              formatter={(v: any, k: any) => [k === "close" ? `$${Number(v).toFixed(2)}` : Number(v).toFixed(1), k]}
            />
            <Line type="monotone" dataKey="close" stroke="#22c55e" dot={false} strokeWidth={1.6} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="h-[110px] mt-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgb(var(--line) / 0.5)" />
            <XAxis dataKey="date" stroke="rgb(var(--ink-muted))" fontSize={10} tickCount={4} />
            <YAxis domain={[0, 100]} stroke="rgb(var(--ink-muted))" fontSize={11} width={50} ticks={[30, 50, 70]} />
            <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" />
            <ReferenceLine y={30} stroke="#22c55e" strokeDasharray="3 3" />
            <Tooltip
              contentStyle={{
                background: "rgb(var(--surface-1))",
                border: "1px solid rgb(var(--line))",
                borderRadius: 10,
                color: "rgb(var(--ink))",
              }}
              itemStyle={{ color: "rgb(var(--ink))" }}
              labelStyle={{ color: "rgb(var(--ink))" }}
              formatter={(v: any) => [Number(v).toFixed(1), "RSI"]}
            />
            <Line type="monotone" dataKey="rsi" stroke="#60a5fa" dot={false} strokeWidth={1.4} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {loading && <p className="text-xs subtle mt-2">Loading…</p>}
    </Card>
  );
}
