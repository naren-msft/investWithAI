import { NextResponse } from "next/server";
import { computeIncome } from "@/lib/dividends";
import { FOMC_DEFAULT_TARGETS } from "@/config/fomc";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = await computeIncome({ kind: "fomc", targets: [...FOMC_DEFAULT_TARGETS] });
    return NextResponse.json(report);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "dividends failed" }, { status: 500 });
  }
}
