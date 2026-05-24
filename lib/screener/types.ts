import type { Regime } from "@/types";
import type { ThemeKey, ThemeTag, MoatType } from "@/config/screener-themes";

export type ScreenerMode = "classic" | "gem";

export interface GateCheck {
  ok: boolean;
  label: string;
  contribution: number;
  value?: string | number;
}

export interface GateResult {
  passed: boolean;
  score: number;
  maxScore: number;
  checks: GateCheck[];
}

export type ConfidenceBand = "high" | "medium" | "low" | "watch-only";

export interface ConfidenceScore {
  total: number;
  band: ConfidenceBand;
  components: {
    fundamentals: number;
    moat: number;
    trend: number;
    dataQuality: number;
    regime: number;
  };
  caveats: string[];
}

export interface ScreenerFundamentals {
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  grossMargins: number | null;
  operatingMargins: number | null;
  profitMargins: number | null;
  freeCashflow: number | null;
  debtToEquity: number | null;
  returnOnEquity: number | null;
  earningsQuarterlyGrowth: number | null;
  recommendationMean: number | null;
  numberOfAnalystOpinions: number | null;
  targetMeanPrice: number | null;
  institutionsPercentHeld: number | null;
  insidersPercentHeld: number | null;
  marketCap: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  pegRatio: number | null;

  // Gem-mode additions (always populated when available; only scored in gem mode)
  shortPercentOfFloat: number | null;
  shortRatio: number | null;
  beta: number | null;
  sandp52WeekChange: number | null;
  floatShares: number | null;
  sharesOutstanding: number | null;
  firstTradeDateMs: number | null;

  // Gem-mode derived signals (computed in lib/screener/index.ts when mode === "gem")
  epsRevisionDir: number | null;       // current FY estimate − estimate 30 days ago
  insiderClusterCount: number | null;  // distinct insider purchases (last 90 days)
  netInsiderShares: number | null;     // netSharePurchaseActivity.netInfoShares
  piotroskiProxy: number | null;       // 0–5 score (proxy)
}

export interface ScreenerTrend {
  price: number;
  sma50: number;
  sma150: number;
  sma200: number;
  sma200Slope: number;
  rsi14: number;
  macdHist: number;
  macdHistRising: boolean;
  high52w: number;
  low52w: number;
  pctFromHigh52w: number;
  pctAboveLow52w: number;
  minerviniConditions: boolean[];

  // Gem-mode additions (always populated when computable; null otherwise)
  relStrength: number | null;   // (stock 12m return) / (SPY 12m return)
  frogInPan: number | null;     // (posDays − negDays) / (posDays + negDays) over last 126 closes
  volumeThrust: number | null;  // last bar volume / SMA(50) volume
  baseLength: number | null;    // trading days since price was last >5% above current 6m range
}

// Compact view of an early-stage (post-IPO) trend for stocks with insufficient
// history for full Minervini. Returned in place of `ScreenerTrend` for the
// early-IPO path; carried through `ScreenerRow.earlyTrend`.
export interface ScreenerEarlyTrend {
  price: number;
  ipoLow: number;
  priceAboveIpoLow: number;     // price / ipoLow
  momentum20d: number;          // (price − close 20d ago) / close 20d ago
  volumeThrust: number | null;
  ipoAgeDays: number;
}

export interface ScreenerRow {
  ticker: string;
  name: string;
  primaryTheme: ThemeKey;
  primaryThemeLabel: string;
  secondaryThemes: ThemeKey[];
  tag: ThemeTag;
  chokepoint: string;
  moatType: MoatType;

  fundamentals: ScreenerFundamentals;
  trend: ScreenerTrend | null;
  earlyTrend?: ScreenerEarlyTrend | null;

  gate1: GateResult;
  gate2: GateResult;
  gate3: GateResult;
  confidence: ConfidenceScore;

  passedAll: boolean;
  error?: string;

  // Gem-mode additions
  squeezeFlag?: boolean;        // shortPctOfFloat > 0.20 && shortRatio > 5 && passedAll
  discoverySource?: string;     // e.g. "via ARKK" — populated only for discovery-feed tickers
}

export interface ScreenerResult {
  asOf: string;
  mode: ScreenerMode;
  regime: Regime;
  rows: ScreenerRow[];
  themes: {
    key: ThemeKey;
    label: string;
    rationale: string;
    sleeveCapPct: number;
    counts: { core: number; emerging: number; venture: number; total: number; passed: number };
  }[];
  discoveryUsed?: boolean;
}
