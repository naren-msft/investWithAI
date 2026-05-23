import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Stocks portfolio doesn't use ETF top-holdings overlap (no sub-holdings to
// roll up). Return an empty payload so the OverlapAnalysis component renders
// its empty state without erroring.
export async function GET() {
  return NextResponse.json({
    asOf: new Date().toISOString(),
    topStockExposures: [],
    sectorExposures: [],
    totalTopHoldingsCoverage: 0,
  });
}
