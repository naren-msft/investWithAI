// Large-Cap "5 Pillars" screener configuration.
//
// A large-cap (S&P 500 / mega-cap) adaptation of the Ross Cameron 5-Pillar
// momentum filter. The pillar STRUCTURE is identical to Ross, but the
// thresholds are re-tuned for large caps — where a 5× RVol / +10% day / $1–$20
// price / <10M float are all essentially impossible — and Pillar 5 flips from
// "low float" to "large cap" (market cap ≥ $10B):
//
//   1. Relative Volume ≥ 1.5×    (minRvol)
//   2. Daily % change ≥ 3%       (minChangePct)
//   3. News catalyst             (flagged 🔥 when change ≥ strongMomentumPct = 5%)
//   4. Price $10–$100,000        (minPrice / maxPrice — effectively no upper cap)
//   5. Market cap ≥ $10B         (minMarketCap) — large-cap floor
//
// Every threshold stays USER-ADJUSTABLE at runtime via URL query params, clamped
// to the same safe ranges as Ross (see resolveThresholds in ./ross).
//
// Educational / demo use only — not investment advice.

import {
  ROSS_DEFAULTS,
  resolveThresholds,
  isCustomThresholds,
  type RossThresholds,
  type RossThresholdOverrides,
} from "./ross";
import type { ScreenerProfile } from "./screenerProfile";

/** Large-cap re-tuned defaults (same shape as Ross). */
export const LARGECAP_DEFAULTS: RossThresholds = {
  minRvol: 1.5,
  minChangePct: 3,
  strongMomentumPct: 5,
  minPrice: 10,
  maxPrice: 100_000, // effectively no upper cap for mega-caps
  maxFloat: ROSS_DEFAULTS.maxFloat, // unused in marketcap-min mode; kept for shape
  minMarketCap: 10_000_000_000, // $10B large-cap floor
};

/** Resolve user overrides against the large-cap defaults. */
export function resolveLargecapThresholds(overrides: RossThresholdOverrides = {}): RossThresholds {
  return resolveThresholds(overrides, LARGECAP_DEFAULTS);
}

/** True when the resolved thresholds differ from the large-cap defaults. */
export function isCustomLargecap(t: RossThresholds): boolean {
  return isCustomThresholds(t, LARGECAP_DEFAULTS);
}

/**
 * The Large-Cap screener profile. Pillar 5 is market-cap-based; the Yahoo
 * fallback surfaces large-cap movers / actives rather than small-cap gainers.
 */
export const LARGECAP_PROFILE: ScreenerProfile = {
  id: "largecap",
  label: "Large-Cap",
  routeBase: "/screener?book=large",
  pillar5Mode: "marketcap-min",
  defaults: LARGECAP_DEFAULTS,
  yahooScreenerIds: ["most_actives", "day_gainers", "undervalued_large_caps"],
};
