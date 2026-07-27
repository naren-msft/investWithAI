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

/** True when the request asks to bypass the scan cache (?fresh=1) for a live scan. */
export function freshFromRequest(req: NextRequest): boolean {
  const v = req.nextUrl.searchParams.get("fresh");
  return v === "1" || v === "true";
}

/** Whether to require extended-hours (AH/PM) rising. Default ON — pass
 *  ?extRising=0 to include names that are flat/falling after-hours. */
export function requireExtendedRisingFromRequest(req: NextRequest): boolean {
  const v = req.nextUrl.searchParams.get("extRising");
  return v !== "0" && v !== "false";
}
