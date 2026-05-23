import type { Regime } from "@/types";
import type { ThemeKey, ThemeTag, MoatType } from "@/config/screener-themes";

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

  gate1: GateResult;
  gate2: GateResult;
  gate3: GateResult;
  confidence: ConfidenceScore;

  passedAll: boolean;
  error?: string;
}

export interface ScreenerResult {
  asOf: string;
  regime: Regime;
  rows: ScreenerRow[];
  themes: {
    key: ThemeKey;
    label: string;
    rationale: string;
    sleeveCapPct: number;
    counts: { core: number; emerging: number; venture: number; total: number; passed: number };
  }[];
}
