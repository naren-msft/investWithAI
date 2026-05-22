import { NextResponse } from "next/server";
import { computeIncome } from "@/lib/dividends";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = await computeIncome();
    return NextResponse.json(report);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "dividends failed" }, { status: 500 });
  }
}
