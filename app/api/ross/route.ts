import { NextResponse, type NextRequest } from "next/server";
import { runRoss } from "@/lib/ross";
import { resolveThresholds } from "@/config/ross";
import { overridesFromRequest, freshFromRequest, requireExtendedRisingFromRequest } from "@/lib/ross/requestParams";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const thresholds = resolveThresholds(overridesFromRequest(req));
    const result = await runRoss({
      thresholds,
      bypassCache: freshFromRequest(req),
      requireExtendedRising: requireExtendedRisingFromRequest(req),
    });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "ross screener failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
