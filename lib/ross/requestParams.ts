import type { NextRequest } from "next/server";
import type { RossThresholdOverrides } from "@/config/ross";

/** Parse Ross threshold overrides from a request's query string. */
export function overridesFromRequest(req: NextRequest): RossThresholdOverrides {
  const q = req.nextUrl.searchParams;
  return {
    minRvol: q.get("minRvol"),
    minChangePct: q.get("minChange"),
    strongMomentumPct: q.get("strongMomentum"),
    minPrice: q.get("minPrice"),
    maxPrice: q.get("maxPrice"),
    maxFloat: q.get("maxFloat"),
    minMarketCap: q.get("minMarketCap"),
  };
}
