// Screener profile abstraction.
//
// A profile parameterizes the shared "5 Pillars" screener engine so the same
// pipeline (candidate fetch → pillar evaluation → catalyst news → sort) can
// serve different universes. Today: Ross (small-cap momentum) and Large-Cap
// (S&P 500 / mega-cap). Pillar 5 flips meaning between profiles:
//   - float-max    → Pillar 5 = "Float < maxFloat" (Ross small-cap)
//   - marketcap-min→ Pillar 5 = "Market cap ≥ minMarketCap" (large-cap)

import type { RossThresholds } from "./ross";

export type Pillar5Mode = "float-max" | "marketcap-min";

export interface ScreenerProfile {
  /** Stable id used for cache keys and labels. */
  id: "ross" | "largecap";
  /** Human label, e.g. "Ross" / "Large-Cap". */
  label: string;
  /** Route base the on-page controls push to, e.g. "/screener". */
  routeBase: string;
  /** How Pillar 5 (size) is interpreted for this profile. */
  pillar5Mode: Pillar5Mode;
  /** Profile defaults (also used as the "reset" target + custom-threshold hint). */
  defaults: RossThresholds;
  /** Yahoo predefined screener IDs used by the fallback candidate source. */
  yahooScreenerIds: readonly string[];
}
