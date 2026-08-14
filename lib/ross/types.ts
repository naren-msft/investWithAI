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
  /** Full-day relative volume (today's volume ÷ average daily volume). */
  relativeVolume: number | null;
  /** TradingView 5-minute intraday relative volume when the scanner exposes it. */
  rvolIntraday5m?: number | null;
  /** Time-of-day normalized RVol: today's volume ÷ (30-day avg × fraction of the
   *  regular session elapsed). Detects early-session surges the full-day RVol
   *  masks. Null outside regular hours or when inputs are missing. */
  intradayRvol?: number | null;
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

/** A non-negative catalyst headline. Neutral wording is allowed. */
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

export type RossAlignmentSignalKey =
  | "catalystMomentum"
  | "extendedContinuation"
  | "rvolAcceleration"
  | "repeatedHolding";

export type RossAlignmentSignalState = "aligned" | "not-aligned" | "unknown";

export interface RossAlignmentSignal {
  key: RossAlignmentSignalKey;
  label: string;
  state: RossAlignmentSignalState;
  detail: string;
}

/** An explainable setup checklist, not a prediction or validated ranking. */
export interface RossSignalAlignment {
  alignedCount: number;
  knownCount: number;
  total: 4;
  confidence: "normal" | "low";
  signals: RossAlignmentSignal[];
}

export interface RossRow {
  ticker: string;
  name: string;
  candidate: RossCandidate;
  /** Price on the active-session basis used for qualification and display. */
  currentPrice: number | null;
  /** Change vs previous close on the active-session basis used for Pillar 2. */
  currentChangePct: number | null;
  /** Relative volume on the active-session basis used for Pillar 1. */
  currentRvol: number | null;
  /** Detection tier: "qualified" = meets ALL automated pillars (green);
   *  "watch" = an early "warming" mover that meets the halved watch floors (or
   *  has a strong extended-session gap) but has NOT yet crossed the full pillars. */
  stage: "qualified" | "watch";
  pillars: PillarResult[];
  /** True when ALL automated pillars pass (float N/A does not block) → green row. */
  allAutomatedMet: boolean;
  /** change ≥ strongMomentumPct → 🔥 (likely news-driven). */
  strongMomentum: boolean;
  /** Float data unavailable → prompt manual verification. */
  floatUnknown: boolean;
  /** Positive extended-session context (live in active AH/PM, or today’s
   *  retained pre-market gap during the regular session). */
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
  /** ISO of when this ticker first surfaced on the current trading day (watch or
   *  qualified) from persisted screener history. Null until history is available. */
  firstSeenAt?: string | null;
  /** How many scans this ticker has appeared in today. */
  seenCount?: number | null;
  /** Best active-session change-vs-close observed today. */
  peakChangePct?: number | null;
  /** Best extended-hours (AH/PM) % change observed today. */
  peakExtendedPct?: number | null;
  /** Change in relative volume vs the previous recorded scan (RVol is a leading
   *  indicator, so a rising RVol flags acceleration). Null on first appearance. */
  rvolDelta?: number | null;
  /** Change in active-session % change vs the previous recorded scan. Null on first. */
  changeDelta?: number | null;
  /** Composite acceleration score (RVol-weighted) used to rank watch movers. */
  accelScore?: number | null;
  /** ISO the ticker first surfaced as an early "watch" mover today. */
  firstWatchAt?: string | null;
  /** ISO the ticker first met ALL pillars (qualified) today. */
  firstQualifiedAt?: string | null;
  /** Minutes the watch tier surfaced this name BEFORE it qualified (lead time).
   *  Null until it has both a watch and a qualified timestamp. */
  watchLeadMin?: number | null;
  /** Qualified-only continuation checklist. Watch rows intentionally have null. */
  signalAlignment?: RossSignalAlignment | null;
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
  /** Exchange session at scan time, used for accurate empty-state messaging. */
  marketSession: "pre-market" | "regular" | "after-hours" | "closed" | "weekend";
  /** True when the extended-session direction bias is enabled. Active AH/PM
   *  sessions can hard-filter on it; regular hours keep the pre-market reading
   *  as context/ranking only. */
  requireExtendedRising: boolean;
  /** True only for the Ross book while Signal Alignment is in validation mode. */
  signalAlignmentEnabled: boolean;
  rows: RossRow[];
  /** Count of rows where allAutomatedMet (green). */
  greenCount: number;
  /** Count of early "watch" (warming) rows — meet the halved floors / gapping,
   *  not yet across the full pillars. */
  watchCount: number;
  /** Count of rows flagged strong momentum (🔥). */
  strongCount: number;
  /** Count of rows with positive active/retained extended-session context (📈). */
  risingCount: number;
  /** Count of rows with at least one non-negative catalyst headline. */
  withNewsCount: number;
  /** Non-fatal warnings (e.g. "TradingView unavailable — used Yahoo fallback"). */
  warnings: string[];
}
