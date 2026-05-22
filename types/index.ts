export type Ticker = string;

export interface TargetWeight {
  ticker: Ticker;
  name: string;
  weight: number;
  expense: number;   // expense ratio (decimal, e.g. 0.0015 = 0.15%)
  role: string;      // short role/theme label
  note?: string;
}

export interface Holding {
  ticker: Ticker;
  shares: number;
  costBasis: number;
}

export interface Tranche {
  phase: number;
  size: number;
  gate: string;
  status: "executed" | "next" | "pending";
}

export interface PortfolioConfig {
  capital: number;
  cashBuffer: number;          // reserved cash, never deployed
  targets: TargetWeight[];
  tranches: Tranche[];
  holdings: Holding[];
  cash: number;
}

export interface Quote {
  ticker: Ticker;
  price: number;
  changePct: number;
  asOf: string;
}

export interface Candle {
  date: string;
  close: number;
  high: number;
  low: number;
  open: number;
  volume: number;
}

export interface Indicators {
  rsi: number;
  macd: number;
  macdSignal: number;
  macdHist: number;
  sma50: number;
  sma200: number;
}

export type RegimeKind = "rally" | "neutral" | "pullback" | "correction";

export interface Regime {
  kind: RegimeKind;
  multiplier: number;          // applied to underweight (effective weight)
  inputs: { spy50: number; spy200: number; spyPrice: number; pct50: number; pct200: number };
  reasoning: string;
}

export interface DriftRow {
  ticker: Ticker;
  name: string;
  role: string;
  expense: number;
  targetPct: number;
  currentPct: number;
  targetUsd: number;
  currentUsd: number;
  driftUsd: number;
  driftPct: number;
  effectiveWeight: number;
  price: number;
  shares: number;
  dayChangePct: number;
}

export type Signal = "BUY" | "HOLD" | "AVOID";

export interface SignalRow {
  ticker: Ticker;
  signal: Signal;
  rsi: number;
  macdHist: number;
  reason: string;
}

export interface BuyRecommendation {
  ticker: Ticker;
  name: string;
  dollars: number;
  shares: number;
  price: number;
  signal: Signal;
  rsi: number;
  macdHist: number;
  okToBuy: boolean;
  reason: string;
  dayChangePct: number;
}

export interface AgentResult<T = unknown> {
  agent: string;
  output: T;
  reasoning: string;
}

export interface PipelineResult {
  asOf: string;
  capital: number;
  cashBuffer: number;
  deployedUsd: number;
  cashUsd: number;
  portfolioValue: number;
  dayPnlUsd: number;
  regime: Regime;
  drift: DriftRow[];
  signals: SignalRow[];
  recommendations: BuyRecommendation[];
  currentTranche: Tranche;
  trancheBudget: number;
  totalRecommendedUsd: number;
  currentPhaseDeployedUsd: number;
  currentPhaseRemainingUsd: number;
  agents: AgentResult[];
}
