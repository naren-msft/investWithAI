import { NextResponse } from "next/server";
import { computeTaxReport } from "@/lib/taxLots";
import { FOMC_DEFAULT_TARGETS } from "@/config/fomc";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = await computeTaxReport({ kind: "fomc", targets: [...FOMC_DEFAULT_TARGETS] });
    return NextResponse.json(report);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "tax-lots failed" }, { status: 500 });
  }
}
