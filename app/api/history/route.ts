import { NextResponse } from "next/server";
import { getHistory } from "@/lib/yahoo";
import { rsiSeries } from "@/lib/indicators";

export const dynamic = "force-dynamic";

// EMA helper used to compute MACD history series.
function emaSeries(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = new Array(values.length).fill(NaN);
  if (values.length < period) return out;
  const seed = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = seed;
  let prev = seed;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

function macdSeries(values: number[], fast = 12, slow = 26, signal = 9) {
  const emaFast = emaSeries(values, fast);
  const emaSlow = emaSeries(values, slow);
  const macdLine = values.map((_, i) => emaFast[i] - emaSlow[i]);
  // Compact valid macd values for signal computation, then re-align.
  const validIdx: number[] = [];
  const valid: number[] = [];
  for (let i = 0; i < macdLine.length; i++) if (!Number.isNaN(macdLine[i])) { validIdx.push(i); valid.push(macdLine[i]); }
  const sig = emaSeries(valid, signal);
  const signalLine: number[] = new Array(values.length).fill(NaN);
  for (let j = 0; j < validIdx.length; j++) signalLine[validIdx[j]] = sig[j];
  const hist = macdLine.map((m, i) => (Number.isNaN(m) || Number.isNaN(signalLine[i])) ? NaN : m - signalLine[i]);
  return { macdLine, signalLine, hist };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const months = Number(searchParams.get("months") ?? "6");
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
  try {
    const candles = await getHistory(symbol, months);
    const closes = candles.map((c) => c.close);
    const rsi = rsiSeries(closes, 14);
    const m = macdSeries(closes);
    const series = candles.map((c, i) => ({
      date: c.date,
      close: c.close,
      rsi: Number.isNaN(rsi[i]) ? null : Number(rsi[i].toFixed(2)),
      macd: Number.isNaN(m.macdLine[i]) ? null : Number(m.macdLine[i].toFixed(3)),
      macdSignal: Number.isNaN(m.signalLine[i]) ? null : Number(m.signalLine[i].toFixed(3)),
      macdHist: Number.isNaN(m.hist[i]) ? null : Number(m.hist[i].toFixed(3)),
    }));
    return NextResponse.json({ symbol, data: series });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "fetch failed" }, { status: 500 });
  }
}
