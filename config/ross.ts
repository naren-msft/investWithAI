// Ross Cameron "5 Pillars" momentum-filter configuration.
//
// Implements the stock-selection criteria popularized by Ross Cameron
// (Warrior Trading) and mirrored by the TradingView "Ross Cameron 5 Pillars
// Filter" script. Thresholds are the Ross defaults but every one of them is
// USER-ADJUSTABLE at runtime via URL query params (see resolveThresholds).
//
//   1. Relative Volume ≥ 5×      (minRvol)
//   2. Daily % change ≥ 10%      (minChangePct)
//   3. News catalyst             (flagged 🔥 when change ≥ strongMomentumPct)
//   4. Price $1–$20              (minPrice / maxPrice)
//   5. Float < 10M shares        (maxFloat) — N/A never fails the pillar
//
// Educational / demo use only — day trading is extremely high risk.

export interface RossThresholds {
  /** Pillar 1 — minimum relative volume (× average). */
  minRvol: number;
  /** Pillar 2 — minimum daily % change (in percent, e.g. 10 = +10%). */
  minChangePct: number;
  /** Pillar 3 — % change at/above which a name is flagged as strong momentum (🔥). */
  strongMomentumPct: number;
  /** Pillar 4 — minimum share price (USD). */
  minPrice: number;
  /** Pillar 4 — maximum share price (USD). USER-ADJUSTABLE (e.g. 20 → 100). */
  maxPrice: number;
  /** Pillar 5 (float-max mode) — maximum float in shares. N/A is flagged, not failed. */
  maxFloat: number;
  /** Pillar 5 (marketcap-min mode) — minimum market cap in USD (0 = no floor). */
  minMarketCap: number;
}

/** Ross Cameron's canonical defaults. */
export const ROSS_DEFAULTS: RossThresholds = {
  minRvol: 5,
  minChangePct: 10,
  strongMomentumPct: 15,
  minPrice: 1,
  maxPrice: 20,
  maxFloat: 10_000_000,
  minMarketCap: 0, // Ross small-cap profile has no market-cap floor.
};

/** Safe clamp ranges for user overrides (prevents nonsense/DoS-ish inputs). */
const CLAMP = {
  minRvol: { min: 1, max: 100 },
  minChangePct: { min: 1, max: 100 },
  strongMomentumPct: { min: 1, max: 200 },
  minPrice: { min: 0.01, max: 1_000_000 },
  maxPrice: { min: 1, max: 1_000_000 },
  maxFloat: { min: 100_000, max: 10_000_000_000 },
  minMarketCap: { min: 0, max: 5_000_000_000_000 },
} as const;

/** Region passed to the TradingView scanner + Yahoo screener (US equities). */
export const ROSS_SCANNER_REGION = "america";

/**
 * Primary US exchanges to include. Everything else (notably OTC / pink-sheet,
 * which is where most foreign shells and unlisted names live) is excluded so the
 * screener only surfaces US exchange-listed stocks. A null/unknown exchange
 * (e.g. the Yahoo fallback path, which is already US-scoped) is tolerated.
 */
export const ROSS_US_EXCHANGES: ReadonlySet<string> = new Set([
  "NASDAQ",
  "NYSE",
  "AMEX", // NYSE American
  "NYSE AMERICAN",
  "ARCA",
  "NYSE ARCA",
  "BATS",
  "CBOE",
]);

/** How many candidates to request from each upstream source. */
export const ROSS_CANDIDATE_LIMIT = 60;

/** Result cache TTL (ms). Movers + news change fast intraday; kept below the
 *  client's news auto-refresh cadence (3 min) so a refresh returns fresh data. */
export const ROSS_CACHE_MS = 2 * 60 * 1000;

/** How many headlines to show per pick. */
export const ROSS_NEWS_PER_TICKER = 3;

/**
 * Catalyst news window (ms). A rolling lookback from "now" — a momentum
 * day-trade cares about the catalyst driving *today's* move (typically this
 * morning's pre-market or overnight headline), so we surface the latest news
 * within this window and never anything staler. 24h comfortably spans an
 * overnight gap and the current session while excluding multi-day-old coverage.
 */
export const ROSS_NEWS_LOOKBACK_MS = 24 * 60 * 60 * 1000; // 24h rolling window

/** Only surface headlines that score as positive/bullish (Ross wants up-moves). */
export const ROSS_NEWS_POSITIVE_ONLY = true;

function clampNum(v: unknown, range: { min: number; max: number }, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(range.max, Math.max(range.min, n));
}

/** Raw (possibly string) overrides parsed from URL query params. */
export interface RossThresholdOverrides {
  minRvol?: string | number | null;
  minChangePct?: string | number | null;
  strongMomentumPct?: string | number | null;
  minPrice?: string | number | null;
  maxPrice?: string | number | null;
  maxFloat?: string | number | null;
  minMarketCap?: string | number | null;
}

/**
 * Resolve user overrides against a profile's defaults, clamping each to a safe
 * range and enforcing invariants (minPrice ≤ maxPrice). Missing/invalid values
 * fall back to the supplied defaults (Ross defaults when omitted).
 */
export function resolveThresholds(
  overrides: RossThresholdOverrides = {},
  defaults: RossThresholds = ROSS_DEFAULTS,
): RossThresholds {
  const has = (v: unknown) => v != null && v !== "";

  const minRvol = has(overrides.minRvol)
    ? clampNum(overrides.minRvol, CLAMP.minRvol, defaults.minRvol)
    : defaults.minRvol;
  const minChangePct = has(overrides.minChangePct)
    ? clampNum(overrides.minChangePct, CLAMP.minChangePct, defaults.minChangePct)
    : defaults.minChangePct;
  const strongMomentumPct = has(overrides.strongMomentumPct)
    ? clampNum(overrides.strongMomentumPct, CLAMP.strongMomentumPct, defaults.strongMomentumPct)
    : defaults.strongMomentumPct;
  let minPrice = has(overrides.minPrice)
    ? clampNum(overrides.minPrice, CLAMP.minPrice, defaults.minPrice)
    : defaults.minPrice;
  let maxPrice = has(overrides.maxPrice)
    ? clampNum(overrides.maxPrice, CLAMP.maxPrice, defaults.maxPrice)
    : defaults.maxPrice;
  const maxFloat = has(overrides.maxFloat)
    ? clampNum(overrides.maxFloat, CLAMP.maxFloat, defaults.maxFloat)
    : defaults.maxFloat;
  const minMarketCap = has(overrides.minMarketCap)
    ? clampNum(overrides.minMarketCap, CLAMP.minMarketCap, defaults.minMarketCap)
    : defaults.minMarketCap;

  // Enforce minPrice ≤ maxPrice — swap if the user inverted them.
  if (minPrice > maxPrice) [minPrice, maxPrice] = [maxPrice, minPrice];

  return { minRvol, minChangePct, strongMomentumPct, minPrice, maxPrice, maxFloat, minMarketCap };
}

/** True when the resolved thresholds differ from the profile defaults (UI hint). */
export function isCustomThresholds(t: RossThresholds, defaults: RossThresholds = ROSS_DEFAULTS): boolean {
  return (
    t.minRvol !== defaults.minRvol ||
    t.minChangePct !== defaults.minChangePct ||
    t.strongMomentumPct !== defaults.strongMomentumPct ||
    t.minPrice !== defaults.minPrice ||
    t.maxPrice !== defaults.maxPrice ||
    t.maxFloat !== defaults.maxFloat ||
    t.minMarketCap !== defaults.minMarketCap
  );
}

/**
 * The Ross (small-cap momentum) screener profile — the engine default. Pillar 5
 * is float-based; the Yahoo fallback surfaces small-cap / day gainers.
 */
export const ROSS_PROFILE: import("./screenerProfile").ScreenerProfile = {
  id: "ross",
  label: "Ross",
  routeBase: "/screener",
  pillar5Mode: "float-max",
  defaults: ROSS_DEFAULTS,
  yahooScreenerIds: ["small_cap_gainers", "day_gainers", "aggressive_small_caps"],
};
