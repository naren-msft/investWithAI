import { NextResponse, type NextRequest } from "next/server";
import { runScreener } from "@/lib/ross";
import { resolveLargecapThresholds, LARGECAP_PROFILE } from "@/config/largecap";
import { overridesFromRequest } from "@/lib/ross/requestParams";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  try {
    const thresholds = resolveLargecapThresholds(overridesFromRequest(req));
    const result = await runScreener({ thresholds, profile: LARGECAP_PROFILE });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "large-cap screener failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
