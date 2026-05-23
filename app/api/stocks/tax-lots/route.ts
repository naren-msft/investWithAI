import { NextResponse } from "next/server";
import { computeTaxReport } from "@/lib/taxLots";
import { STOCK_TARGETS } from "@/config/stocks";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = await computeTaxReport({ kind: "stocks", targets: STOCK_TARGETS });
    return NextResponse.json(report);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "tax-lots failed" }, { status: 500 });
  }
}
