import { NextResponse } from "next/server";
import { runPipeline } from "@/lib/agents";
import { stocksBundle } from "@/config/stocks";
import { STOCK_TARGETS } from "@/config/stocks";
import { buildInvalidationReport, loadEwData, type EwCount } from "@/lib/elliott-wave";
import { computeAutomatedCount } from "@/lib/elliott-wave/counter";
import { getHistory } from "@/lib/yahoo";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await runPipeline({ bundle: stocksBundle });
    const priceByTicker: Record<string, number> = {};
    for (const d of data.drift) priceByTicker[d.ticker] = d.price;

    const tierByTicker: Record<string, "core" | "growth" | "speculative" | undefined> = {};
    for (const t of STOCK_TARGETS) tierByTicker[t.ticker] = t.tier;

    // Auto-count any ticker whose manual entry is UNKNOWN. Manual overrides win.
    const manual = loadEwData();
    const tickersNeedingAuto = Object.entries(manual.counts)
      .filter(([, c]) => !c || c.phase === "UNKNOWN")
      .map(([t]) => t);

    const autoCounts: Record<string, EwCount | null> = {};
    await Promise.all(
      tickersNeedingAuto.map(async (ticker) => {
        const price = priceByTicker[ticker] ?? 0;
        if (price <= 0) { autoCounts[ticker] = null; return; }
        try {
          const months = tierByTicker[ticker] === "speculative" ? 18 : 12;
          const candles = await getHistory(ticker, months);
          autoCounts[ticker] = computeAutomatedCount(candles, tierByTicker[ticker], price);
        } catch {
          autoCounts[ticker] = null;
        }
      }),
    );

    const report = buildInvalidationReport(priceByTicker, autoCounts, tierByTicker);
    return NextResponse.json(report);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "elliott-wave failed" }, { status: 500 });
  }
}
