import { NextResponse } from "next/server";
import { getIntradayCandles, type IntradayInterval, type IntradayRange } from "@/lib/yahoo";

export const dynamic = "force-dynamic";

const ALLOWED_INTERVALS: IntradayInterval[] = ["1m", "2m", "5m", "15m", "30m", "60m"];
const ALLOWED_RANGES: IntradayRange[]       = ["1d", "5d", "6d"];

// GET /api/fomc/intraday?ticker=SPY&interval=1m&range=1d
// Returns candles + the previous close so the client can plot a "vs PC" line.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const ticker = (url.searchParams.get("ticker") ?? "SPY").toUpperCase();
  const interval = (url.searchParams.get("interval") ?? "1m") as IntradayInterval;
  const range    = (url.searchParams.get("range")    ?? "1d") as IntradayRange;
  if (!ALLOWED_INTERVALS.includes(interval)) {
    return NextResponse.json({ error: `interval must be one of ${ALLOWED_INTERVALS.join(",")}` }, { status: 400 });
  }
  if (!ALLOWED_RANGES.includes(range)) {
    return NextResponse.json({ error: `range must be one of ${ALLOWED_RANGES.join(",")}` }, { status: 400 });
  }

  const allCandles = await getIntradayCandles(ticker, interval, range);

  // Group by ET calendar date so we can (a) keep only the most recent N
  // sessions and (b) tell the client where each session starts so it can draw
  // vertical day-dividers and compute "today vs prior-session close".
  const etDate = (ts: number) =>
    new Date(ts).toLocaleDateString("en-CA", { timeZone: "America/New_York" }); // YYYY-MM-DD
  const sessionMap = new Map<string, { firstTs: number; lastClose: number }>();
  for (const c of allCandles) {
    const d = etDate(c.ts);
    const cur = sessionMap.get(d);
    if (!cur) sessionMap.set(d, { firstTs: c.ts, lastClose: c.close });
    else      cur.lastClose = c.close;
  }
  const sessionsAll = [...sessionMap.entries()].sort((a, b) => a[1].firstTs - b[1].firstTs);

  // For "5d" we want 5 prior sessions + today = 6 total. For "1d" just today.
  const wantSessions = range === "1d" ? 1 : range === "5d" ? 6 : range === "6d" ? 7 : 6;
  const keptSessions = sessionsAll.slice(-wantSessions);
  const keptKeys = new Set(keptSessions.map(([k]) => k));
  const candles = allCandles.filter((c) => keptKeys.has(etDate(c.ts)));

  // Previous close = last close of the second-most-recent kept session (so the
  // header badge "vs PC" reflects today's move). Falls back to first open.
  const previousClose =
    keptSessions.length >= 2
      ? keptSessions[keptSessions.length - 2][1].lastClose
      : candles.length > 0
      ? candles[0].open
      : null;
  const last = candles.length > 0 ? candles[candles.length - 1] : null;
  const sessionStarts = keptSessions.map(([date, v]) => ({ date, ts: v.firstTs, close: v.lastClose }));

  return NextResponse.json({
    ticker, interval, range,
    asOf: new Date().toISOString(),
    previousClose,
    last: last ? { ts: last.ts, close: last.close, volume: last.volume } : null,
    sessions: sessionStarts,
    candles,
  });
}
