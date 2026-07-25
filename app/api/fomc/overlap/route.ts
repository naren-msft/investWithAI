import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// FOMC portfolio doesn't use ETF top-holdings overlap (no sub-holdings to roll
// up; tickers are individual stocks + thematic ETFs). Empty payload keeps the
// OverlapAnalysis component happy.
export async function GET() {
  return NextResponse.json({
    asOf: new Date().toISOString(),
    topStockExposures: [],
    sectorExposures: [],
    totalTopHoldingsCoverage: 0,
  });
}
