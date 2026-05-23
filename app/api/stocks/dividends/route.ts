import { NextResponse } from "next/server";
import { computeIncome } from "@/lib/dividends";
import { STOCK_TARGETS } from "@/config/stocks";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = await computeIncome({ kind: "stocks", targets: STOCK_TARGETS });
    return NextResponse.json(report);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "dividends failed" }, { status: 500 });
  }
}
