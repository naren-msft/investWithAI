import { NextResponse, type NextRequest } from "next/server";
import { readScreenerHistory, getTickerHistory, type ScreenerBook } from "@/lib/ross/history";
import { etDateOnly } from "@/lib/marketTime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// Screener history lookup:
//   /api/ross/history                     → today's Ross list (all tickers)
//   /api/ross/history?ticker=DFNS         → one ticker's first/last-seen record
//   /api/ross/history?book=largecap       → large-cap book
//   /api/ross/history?day=2026-07-27      → a specific ET trading day
export async function GET(req: NextRequest) {
  try {
    const q = req.nextUrl.searchParams;
    const book: ScreenerBook = q.get("book") === "largecap" ? "largecap" : "ross";
    const day = q.get("day") || etDateOnly();
    const ticker = q.get("ticker");

    if (ticker) {
      const record = await getTickerHistory(book, ticker, day);
      return NextResponse.json({ book, day, ticker: ticker.toUpperCase(), record });
    }

    const history = await readScreenerHistory(book, day);
    return NextResponse.json({ book, day, count: history.length, history });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "history lookup failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
