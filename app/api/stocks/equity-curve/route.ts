import { NextResponse } from "next/server";
import { readExecutions } from "@/lib/store";
import { computeEquityCurve } from "@/lib/equityCurve";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const execs = await readExecutions("stocks");
    const { points, metrics } = await computeEquityCurve(execs);
    return NextResponse.json({ points, metrics });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "equity curve failed" }, { status: 500 });
  }
}
