import type { RossThresholds } from "@/config/ross";

// Types for the Ross Cameron 5 Pillars screener.

/** Where a candidate / data point originated. */
export type RossSource = "tradingview" | "yahoo" | "finnhub";

/** A raw momentum candidate before pillar evaluation. */
export interface RossCandidate {
  ticker: string;
  name: string;
  /** Listing exchange (e.g. "NASDAQ", "NYSE") when known — used for chart links. */
  exchange: string | null;
  price: number | null;
  changePct: number | null;      // daily % change (e.g. 12.3 = +12.3%)
  relativeVolume: number | null; // × average (TV relative_volume_10d_calc, or Yahoo-derived)
  volume: number | null;         // today's volume
  avgVolume: number | null;      // average daily volume (for RVol fallback compute)
  floatShares: number | null;    // may be null → N/A (Pillar 5 flagged, not failed)
  marketCap: number | null;
  /** Pre-market % change (before the open). */
  premarketChangePct: number | null;
  /** Post-market / after-hours % change (after the close). */
  postmarketChangePct: number | null;
  /** Yahoo marketState: PRE | REGULAR | POST | POSTPOST | CLOSED. */
  marketState: string | null;
  source: RossSource;
}

export type PillarStatus = "pass" | "fail" | "na";

export interface PillarResult {
  key: "rvol" | "change" | "catalyst" | "price" | "float";
  label: string;
  status: PillarStatus;
  /** Whether this pillar is automatically checkable (catalyst is manual). */
  automated: boolean;
  /** Human-readable actual value, e.g. "6.4×", "+12.3%", "$4.20", "8.1M". */
  value: string;
  /** One-line detail / threshold context for the tooltip. */
  detail: string;
}

/** A positive/catalyst news headline (all rendered green). */
export interface RossNewsItem {
  title: string;
  link: string;
  publisher?: string;
  publishedAt?: number;  // ms since epoch
  /** Short summary / description snippet when the source provides one. */
  summary?: string;
  /** Bullish keyword-sentiment score (higher = more positive). */
  sentimentScore?: number;
  /** Which window the headline landed in relative to the last session. */
  window?: "afterhours" | "overnight" | "premarket" | "regular";
  source: RossSource;
}

export interface RossRow {
  ticker: string;
  name: string;
  candidate: RossCandidate;
  pillars: PillarResult[];
  /** True when ALL automated pillars pass (float N/A does not block) → green row. */
  allAutomatedMet: boolean;
  /** change ≥ strongMomentumPct → 🔥 (likely news-driven). */
  strongMomentum: boolean;
  /** Float data unavailable → prompt manual verification. */
  floatUnknown: boolean;
  /** Rising in the active extended-hours session (pre-market or after-hours). */
  extendedRising: boolean;
  /** The signed extended-hours % change shown to the user (pre or post), if any. */
  extendedChangePct: number | null;
  /** Which extended session the above value refers to. */
  extendedSession: "premarket" | "afterhours" | null;
  /** "EXCHANGE:TICKER" form for TradingView chart embeds/links. */
  tradingViewSymbol: string;
  /** Deep link to the TradingView chart for this symbol. */
  chartUrl: string;
  /** Catalyst news published since the previous market close (all green). */
  news: RossNewsItem[];
  /** Deep link to Google Finance for manual research. */
  googleFinanceUrl: string;
}

export interface RossResult {
  asOf: string;
  /** ISO timestamp of the news-window start used as the cutoff. */
  newsSince: string;
  /** Human label for the active news source(s), e.g. "Finnhub (real-time) + Yahoo". */
  newsSource: string;
  /** Resolved thresholds actually applied (after clamping user overrides). */
  thresholds: RossThresholds;
  /** True when thresholds differ from Ross canonical defaults. */
  customThresholds: boolean;
  /** Which upstream source produced the candidate universe. */
  universeSource: RossSource | "none";
  /** True when the extended-hours "rising" gate was applied (AH/PM up only). */
  requireExtendedRising: boolean;
  rows: RossRow[];
  /** Count of rows where allAutomatedMet (green). */
  greenCount: number;
  /** Count of rows flagged strong momentum (🔥). */
  strongCount: number;
  /** Count of rows rising in the active extended-hours session (📈). */
  risingCount: number;
  /** Count of rows with at least one positive catalyst headline. */
  withNewsCount: number;
  /** Non-fatal warnings (e.g. "TradingView unavailable — used Yahoo fallback"). */
  warnings: string[];
}
