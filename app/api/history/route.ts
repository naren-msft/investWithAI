import { NextResponse } from "next/server";
import { getHistory } from "@/lib/yahoo";
import { rsiSeries } from "@/lib/indicators";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const symbol = searchParams.get("symbol");
  const months = Number(searchParams.get("months") ?? "6");
  if (!symbol) return NextResponse.json({ error: "symbol required" }, { status: 400 });
  try {
    const candles = await getHistory(symbol, months);
    const closes = candles.map((c) => c.close);
    const rsi = rsiSeries(closes, 14);
    const series = candles.map((c, i) => ({
      date: c.date,
      close: c.close,
      rsi: Number.isNaN(rsi[i]) ? null : Number(rsi[i].toFixed(2)),
    }));
    return NextResponse.json({ symbol, data: series });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "fetch failed" }, { status: 500 });
  }
}
