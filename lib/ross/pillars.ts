import type { RossThresholds } from "@/config/ross";
import { ROSS_PROFILE } from "@/config/ross";
import type { ScreenerProfile } from "@/config/screenerProfile";
import type { RossCandidate, PillarResult } from "./types";

// Pure evaluation of the 5 Pillars for a single candidate, parameterized by a
// screener profile (Ross small-cap vs Large-cap). Never throws — missing data
// yields "na" (Pillar 5 float mode) or a failed check.

function fmtRvol(v: number | null): string {
  return v == null ? "N/A" : `${v.toFixed(1)}×`;
}
function fmtPct(v: number | null): string {
  if (v == null) return "N/A";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}
function fmtPrice(v: number | null): string {
  return v == null ? "N/A" : `$${v.toFixed(2)}`;
}
function fmtShares(v: number | null): string {
  if (v == null) return "N/A";
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(Math.round(v));
}
function fmtUsd(v: number | null): string {
  if (v == null) return "N/A";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${Math.round(v)}`;
}

export interface PillarEvaluation {
  pillars: PillarResult[];
  /** All AUTOMATED pillars pass (float N/A does not block) → green row. */
  allAutomatedMet: boolean;
  /** change ≥ strongMomentumPct → 🔥 (likely news catalyst). */
  strongMomentum: boolean;
  /** Float data unavailable (float-max mode only) → prompt manual verification. */
  floatUnknown: boolean;
}

export function evaluatePillars(
  c: RossCandidate,
  t: RossThresholds,
  profile: ScreenerProfile = ROSS_PROFILE,
): PillarEvaluation {
  // Pillar 1 — Relative Volume ≥ minRvol
  const rvol = c.relativeVolume;
  const p1: PillarResult = {
    key: "rvol",
    label: "Relative Volume",
    automated: true,
    status: rvol == null ? "fail" : rvol >= t.minRvol ? "pass" : "fail",
    value: fmtRvol(rvol),
    detail: `≥ ${t.minRvol}× vs 30-day average${rvol == null ? " (no data)" : ""}`,
  };

  // Pillar 2 — Daily % change ≥ minChangePct
  const chg = c.changePct;
  const p2: PillarResult = {
    key: "change",
    label: "Daily % Change",
    automated: true,
    status: chg == null ? "fail" : chg >= t.minChangePct ? "pass" : "fail",
    value: fmtPct(chg),
    detail: `≥ +${t.minChangePct}% from prev close`,
  };

  // Pillar 3 — News catalyst (manual). Flagged 🔥 when change ≥ strongMomentumPct.
  // This pillar is NOT automated: it never blocks the green background — the
  // trader must verify the catalyst. We surface it as "na" (needs manual check)
  // or "pass" (strong momentum → very likely news-driven).
  const strong = chg != null && chg >= t.strongMomentumPct;
  const p3: PillarResult = {
    key: "catalyst",
    label: "News Catalyst",
    automated: false,
    status: strong ? "pass" : "na",
    value: strong ? "🔥 likely" : "verify",
    detail: strong
      ? `≥ +${t.strongMomentumPct}% move — likely news-driven; confirm the catalyst`
      : "Manual check — confirm breaking news justifies the move",
  };

  // Pillar 4 — Price within [minPrice, maxPrice]
  const price = c.price;
  const priceOk = price != null && price >= t.minPrice && price <= t.maxPrice;
  const p4: PillarResult = {
    key: "price",
    label: "Price Range",
    automated: true,
    status: price == null ? "fail" : priceOk ? "pass" : "fail",
    value: fmtPrice(price),
    detail: `$${t.minPrice}–$${t.maxPrice} sweet spot`,
  };

  // Pillar 5 — SIZE. Two modes depending on profile:
  //   float-max     → Float < maxFloat. N/A when float data is missing: per
  //                   Ross's script we do NOT fail — we flag for manual check.
  //   marketcap-min → Market cap ≥ minMarketCap (large-cap floor). An automated
  //                   pass/fail; N/A only when market-cap data is unavailable.
  let p5: PillarResult;
  let floatUnknown = false;
  if (profile.pillar5Mode === "marketcap-min") {
    const mc = c.marketCap;
    // Unlike float (often genuinely unavailable), market cap is a required,
    // near-universally-available datum for a large-cap screen — an unknown
    // market cap CANNOT confirm the large-cap floor, so it fails (never green).
    // This also keeps the displayed universe consistent with the TradingView
    // server-side market_cap_basic filter, which excludes null market caps.
    p5 = {
      key: "float",
      label: "Large Cap",
      automated: true,
      status: mc == null ? "fail" : mc >= t.minMarketCap ? "pass" : "fail",
      value: fmtUsd(mc),
      detail: mc == null
        ? `≥ ${fmtUsd(t.minMarketCap)} market cap — data unavailable`
        : `≥ ${fmtUsd(t.minMarketCap)} market cap`,
    };
  } else {
    const flt = c.floatShares;
    floatUnknown = flt == null;
    p5 = {
      key: "float",
      label: "Float",
      automated: true,
      status: flt == null ? "na" : flt < t.maxFloat ? "pass" : "fail",
      value: fmtShares(flt),
      detail: flt == null
        ? `< ${fmtShares(t.maxFloat)} — float N/A, verify on Finviz`
        : `< ${fmtShares(t.maxFloat)} shares`,
    };
  }

  const pillars = [p1, p2, p3, p4, p5];

  // Green background: every AUTOMATED pillar must NOT be "fail". A float "na"
  // (unknown) is tolerated — it flags for manual check without blocking.
  const allAutomatedMet = pillars
    .filter((p) => p.automated)
    .every((p) => p.status !== "fail");

  return { pillars, allAutomatedMet, strongMomentum: strong, floatUnknown };
}
