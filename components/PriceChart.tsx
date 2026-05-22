"use client";
import { useEffect, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

interface Point {
  date: string;
  close: number;
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
}

const TOOLTIP_STYLE = {
  background: "rgb(var(--surface-1))",
  border: "1px solid rgb(var(--line))",
  borderRadius: 10,
  color: "rgb(var(--ink))",
};

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
      <CardHeader helpSection="price-chart"
        title="Price · RSI · MACD"
        subtitle="6-month daily close + RSI-14 + MACD(12,26,9). Switch tickers to inspect signals."
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

      <div className="h-[180px] mt-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgb(var(--line) / 0.5)" />
            <XAxis dataKey="date" hide />
            <YAxis domain={["auto", "auto"]} stroke="rgb(var(--ink-muted))" fontSize={11} width={50} />
            <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: "rgb(var(--ink))" }} labelStyle={{ color: "rgb(var(--ink))" }}
                     formatter={(v: any) => [`$${Number(v).toFixed(2)}`, "Close"]} />
            <Line type="monotone" dataKey="close" stroke="#22c55e" dot={false} strokeWidth={1.6} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="h-[100px] mt-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgb(var(--line) / 0.5)" />
            <XAxis dataKey="date" hide />
            <YAxis domain={[0, 100]} stroke="rgb(var(--ink-muted))" fontSize={11} width={50} ticks={[35, 50, 70]} />
            <ReferenceLine y={70} stroke="#ef4444" strokeDasharray="3 3" />
            <ReferenceLine y={35} stroke="#22c55e" strokeDasharray="3 3" />
            <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: "rgb(var(--ink))" }} labelStyle={{ color: "rgb(var(--ink))" }}
                     formatter={(v: any) => [Number(v).toFixed(1), "RSI-14"]} />
            <Line type="monotone" dataKey="rsi" stroke="#60a5fa" dot={false} strokeWidth={1.4} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="h-[110px] mt-1">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="rgb(var(--line) / 0.5)" />
            <XAxis dataKey="date" stroke="rgb(var(--ink-muted))" fontSize={10} tickCount={4} />
            <YAxis stroke="rgb(var(--ink-muted))" fontSize={11} width={50} />
            <ReferenceLine y={0} stroke="rgb(var(--ink-muted))" />
            <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: "rgb(var(--ink))" }} labelStyle={{ color: "rgb(var(--ink))" }}
                     formatter={(v: any, k: any) => [Number(v).toFixed(3), k]} />
            <Bar  dataKey="macdHist"   fill="#f59e0b" opacity={0.55} />
            <Line dataKey="macd"       stroke="#22c55e" dot={false} strokeWidth={1.4} />
            <Line dataKey="macdSignal" stroke="#ef4444" dot={false} strokeWidth={1.2} strokeDasharray="3 2" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-1 text-[10px] subtle flex items-center gap-4 flex-wrap">
        <span className="inline-flex items-center gap-1"><span className="w-3 h-1 rounded-sm bg-[#22c55e]" /> MACD line</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-0.5" style={{ borderTop: "2px dashed #ef4444" }} /> Signal line</span>
        <span className="inline-flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-[#f59e0b] opacity-55" /> Histogram</span>
      </div>
      {loading && <p className="text-xs subtle mt-2">Loading…</p>}
    </Card>
  );
}
